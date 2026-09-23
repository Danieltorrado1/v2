import crypto from 'node:crypto';
import type { PoolClient, QueryResultRow } from 'pg';

import { dbPool } from '../../config/db';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import { env } from '../../config/env';
import { resolveContextoLaboralForClient } from './contexto-laboral.service';

export const INTEGRACION_EVENT_TYPES = [
  'VINCULACION_ACTUALIZADA', 'VINCULACION_RETIRADA',
  'ASIGNACION_OPERATIVA_CAMBIADA', 'CONDICION_PENSION_CAMBIADA'
] as const;
export type IntegracionEventType = typeof INTEGRACION_EVENT_TYPES[number];
export type IntegracionEventStatus = 'PENDIENTE' | 'PROCESANDO' | 'PROCESADO' | 'ERROR';

export interface PublicarEventoInput {
  event_type: IntegracionEventType;
  aggregate_type: string;
  aggregate_id: string | number;
  empresa_id: number;
  contrato_id: number;
  persona_id: number | null;
  vinculacion_id: number;
  effective_date: string;
  periodo_id?: number | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  idempotency_key?: string;
}

export interface IntegracionEventRow extends QueryResultRow {
  id: string; event_type: IntegracionEventType; aggregate_type: string; aggregate_id: string;
  empresa_id: string | null; contrato_id: string | null; persona_id: string | null; vinculacion_id: string | null;
  effective_date: string; periodo_id: string | null; payload_before: Record<string, unknown> | null; payload_after: Record<string, unknown> | null;
  idempotency_key: string; status: IntegracionEventStatus; attempts: number; available_at: string; locked_at: string | null;
  locked_by: string | null; processed_at: string | null; last_error_code: string | null; last_error_message: string | null;
  created_at: string; updated_at: string;
}

const stablePayload = (payload: Record<string, unknown> | null | undefined): Record<string, unknown> | null => {
  if (!payload) return null;
  const allowed = ['estado_vinculacion', 'fecha_inicio', 'fecha_fin', 'contrato_cargo_id', 'cotiza_pension', 'tipo_condicion', 'vigencia_desde', 'vigencia_hasta', 'asignacion_id', 'fecha_inicio_efectiva', 'fecha_fin_efectiva'];
  return Object.fromEntries(Object.entries(payload).filter(([key]) => allowed.includes(key)));
};

const makeIdempotencyKey = (input: PublicarEventoInput, before: Record<string, unknown> | null, after: Record<string, unknown> | null): string => {
  if (input.idempotency_key) return input.idempotency_key;
  const basis = JSON.stringify({ event_type: input.event_type, aggregate_type: input.aggregate_type, aggregate_id: String(input.aggregate_id), effective_date: input.effective_date, before, after });
  return `${input.event_type}:${input.vinculacion_id}:${crypto.createHash('sha256').update(basis).digest('hex')}`;
};

export const publicarEventoOutbox = async (client: PoolClient, input: PublicarEventoInput): Promise<string> => {
  if (!env.INTEGRACION_OUTBOX_ENABLED) return 'OUTBOX_DISABLED';
  await assertIntegracionOutboxSchema(client);
  const before = stablePayload(input.before);
  const after = stablePayload(input.after);
  const key = makeIdempotencyKey(input, before, after);
  const result = await client.query<{ id: string }>(`
    INSERT INTO integracion_eventos
      (event_type, aggregate_type, aggregate_id, empresa_id, contrato_id, persona_id, vinculacion_id,
       effective_date, periodo_id, payload_before, payload_after, idempotency_key, status, available_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9,$10::jsonb,$11::jsonb,$12,'PENDIENTE',NOW(),NOW())
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id::text
  `, [input.event_type, input.aggregate_type, String(input.aggregate_id), input.empresa_id, input.contrato_id, input.persona_id, input.vinculacion_id, input.effective_date, input.periodo_id ?? null, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, key]);
  if (result.rows[0]?.id) return result.rows[0].id;
  const existing = await client.query<{ id: string }>('SELECT id::text FROM integracion_eventos WHERE idempotency_key=$1', [key]);
  if (!existing.rows[0]) throw new AppError('No fue posible registrar el evento de integración', 500, 'INTEGRACION_OUTBOX_INSERT_FAILED');
  return existing.rows[0].id;
};

export const assertIntegracionOutboxSchema = async (executor: Pick<PoolClient, 'query'> | typeof dbPool = dbPool): Promise<void> => {
  if (!env.INTEGRACION_OUTBOX_ENABLED) return;
  const result = await executor.query<{ eventos: string | null; impactos: string | null }>(
    `SELECT to_regclass('public.integracion_eventos')::text eventos,
            to_regclass('public.integracion_evento_impactos')::text impactos`
  );
  const row = result.rows[0];
  if (!row?.eventos || !row.impactos) {
    throw new AppError('La integración Outbox está habilitada pero su esquema no está instalado.', 503, 'INTEGRACION_OUTBOX_SCHEMA_UNAVAILABLE');
  }
};

interface PeriodRow extends QueryResultRow { id: string; contrato_id: string; fecha_inicio: string; fecha_fin: string; estado: string; }
interface ImpactRow extends QueryResultRow { id: string; evento_id: string; periodo_id: string | null; vinculacion_id: string; fecha_desde: string; fecha_hasta: string; periodo_estado: string; accion_requerida: string; requiere_recalculo: boolean; bloqueado_por_cierre: boolean; contexto_antes: Record<string, unknown> | null; contexto_despues: Record<string, unknown> | null; }

const MAX_ATTEMPTS = env.INTEGRACION_MAX_ATTEMPTS;
const LOCK_TIMEOUT_MINUTES = env.INTEGRACION_LOCK_TIMEOUT_MINUTES;

export const claimNextIntegracionEvent = async (workerId: string, client: PoolClient): Promise<IntegracionEventRow | null> => {
  const result = await client.query<IntegracionEventRow>(`
    WITH candidate AS (
      SELECT e.id
      FROM integracion_eventos e
      WHERE (
        (e.status IN ('PENDIENTE','ERROR') AND e.available_at <= NOW())
        OR (e.status = 'PROCESANDO' AND e.locked_at < NOW() - ($1::int * INTERVAL '1 minute'))
      ) AND e.attempts < $2
      AND NOT EXISTS (
        SELECT 1 FROM integracion_eventos prior
        WHERE prior.aggregate_type=e.aggregate_type AND prior.aggregate_id=e.aggregate_id
          AND prior.id < e.id AND prior.status <> 'PROCESADO'
      )
      ORDER BY e.id
      FOR UPDATE SKIP LOCKED LIMIT 1
    )
    UPDATE integracion_eventos e
    SET status='PROCESANDO', attempts=e.attempts+1, locked_at=NOW(), locked_by=$3, updated_at=NOW(), last_error_code=NULL, last_error_message=NULL
    FROM candidate c WHERE e.id=c.id RETURNING e.*
  `, [LOCK_TIMEOUT_MINUTES, MAX_ATTEMPTS, workerId]);
  return result.rows[0] ?? null;
};

const nextBackoffMinutes = (attempts: number): number => Math.min(env.INTEGRACION_BACKOFF_MAX_MINUTES, Math.max(1, 2 ** Math.max(0, attempts - 1)));
const normalizeEffectiveDate = (value: unknown): string => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const previousDate = (value: string): string => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};

export const processNextIntegracionEvent = async (workerId: string, tenant?: TenantAccessContext): Promise<IntegracionEventRow | null> => {
  await assertIntegracionOutboxSchema();
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const event = await claimNextIntegracionEvent(workerId, client);
    if (!event) { await client.query('COMMIT'); return null; }
    try {
      const effectiveDate = normalizeEffectiveDate(event.effective_date);
      if (!event.vinculacion_id || !event.contrato_id) throw new AppError('Evento sin vinculación o contrato', 422, 'INTEGRACION_EVENT_CONTEXT_INVALID');
      const context = await resolveContextoLaboralForClient({ vinculacion_id: Number(event.vinculacion_id), contrato_id: Number(event.contrato_id), empresa_id: event.empresa_id ? Number(event.empresa_id) : undefined, fecha: effectiveDate }, tenant, client);
      let contextBefore: unknown = event.payload_before;
      try {
        contextBefore = await resolveContextoLaboralForClient({ vinculacion_id: Number(event.vinculacion_id), contrato_id: Number(event.contrato_id), empresa_id: event.empresa_id ? Number(event.empresa_id) : undefined, fecha: previousDate(effectiveDate) }, tenant, client);
      } catch { /* Un ingreso nuevo puede no tener contexto el día anterior. */ }
      const periods = await client.query<PeriodRow>(`
        SELECT id::text, contrato_id::text, fecha_inicio::text, fecha_fin::text, estado
        FROM nomina_periodos
        WHERE contrato_id=$1::bigint AND fecha_inicio <= $2::date AND fecha_fin >= $2::date
        ORDER BY fecha_inicio, id
      `, [event.contrato_id, effectiveDate]);
      for (const period of periods.rows) {
        const open = period.estado === 'ABIERTO';
        await client.query(`
          INSERT INTO integracion_evento_impactos
            (evento_id, periodo_id, vinculacion_id, fecha_desde, fecha_hasta, periodo_estado, accion_requerida, requiere_recalculo, bloqueado_por_cierre, contexto_antes, contexto_despues)
          VALUES ($1,$2,$3,$4::date,$5::date,$6,$7,FALSE,$8,$9::jsonb,$10::jsonb)
          ON CONFLICT (evento_id, periodo_id, vinculacion_id, fecha_desde, fecha_hasta) DO NOTHING
        `, [event.id, period.id, event.vinculacion_id, effectiveDate, effectiveDate, period.estado, open ? 'REQUIERE_SINCRONIZACION' : 'REQUIERE_AJUSTE_AUTORIZADO', !open, contextBefore ? JSON.stringify(contextBefore) : null, JSON.stringify(context)]);
      }
      if (periods.rows.length === 0) {
        await client.query(`
          INSERT INTO integracion_evento_impactos
            (evento_id, periodo_id, vinculacion_id, fecha_desde, fecha_hasta, periodo_estado, accion_requerida, requiere_recalculo, bloqueado_por_cierre, contexto_antes, contexto_despues)
          VALUES ($1,NULL,$2,$3::date,$3::date,'SIN_INTERSECCION','SIN_IMPACTO',FALSE,FALSE,$4::jsonb,$5::jsonb)
          ON CONFLICT DO NOTHING
        `, [event.id, event.vinculacion_id, effectiveDate, contextBefore ? JSON.stringify(contextBefore) : null, JSON.stringify(context)]);
      }
      await client.query(`INSERT INTO auditoria_eventos (empresa_id,contrato_id,modulo,entidad,entidad_id,accion,descripcion,datos_anteriores,datos_nuevos) VALUES ($1,$2,'INTEGRACION','integracion_eventos',$3,'PROCESS','Evento procesado en modo observación',$4::jsonb,$5::jsonb)`, [event.empresa_id, event.contrato_id, event.id, event.payload_before ? JSON.stringify(event.payload_before) : null, JSON.stringify({ status: 'PROCESADO', impactos: periods.rows.length })]);
      await client.query(`UPDATE integracion_eventos SET status='PROCESADO',processed_at=NOW(),locked_at=NULL,locked_by=NULL,updated_at=NOW() WHERE id=$1`, [event.id]);
      await client.query('COMMIT');
      return { ...event, status: 'PROCESADO', processed_at: new Date().toISOString() };
    } catch (error) {
      const code = error instanceof AppError ? error.code : 'INTEGRACION_PROCESSING_ERROR';
      const message = String(error instanceof Error ? error.message : error).replace(/[\r\n\t]/g, ' ').slice(0, 500);
      const terminal = event.attempts >= MAX_ATTEMPTS;
      await client.query(`UPDATE integracion_eventos SET status=$2,available_at=NOW()+($3::int * INTERVAL '1 minute'),locked_at=NULL,locked_by=NULL,last_error_code=$4,last_error_message=$5,updated_at=NOW() WHERE id=$1`, [event.id, terminal ? 'ERROR' : 'ERROR', nextBackoffMinutes(event.attempts), code, message]);
      await client.query('COMMIT');
      return { ...event, status: 'ERROR', last_error_code: code, last_error_message: message };
    }
  } finally { client.release(); }
};

export const listIntegracionEvents = async (filters: Record<string, unknown>, tenant?: TenantAccessContext) => {
  const params: unknown[] = []; const where: string[] = ['TRUE'];
  const add = (sql: string, value: unknown) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)); };
  if (filters.empresa_id) add('e.empresa_id=$?', filters.empresa_id);
  if (filters.contrato_id) add('e.contrato_id=$?', filters.contrato_id);
  if (filters.vinculacion_id) add('e.vinculacion_id=$?', filters.vinculacion_id);
  if (filters.persona_id) add('e.persona_id=$?', filters.persona_id);
  if (filters.periodo_id) add('i.periodo_id=$?', filters.periodo_id);
  if (filters.event_type) add('e.event_type=$?', filters.event_type);
  if (filters.status) add('e.status=$?', filters.status);
  if (filters.desde) add('e.effective_date >= $?::date', filters.desde);
  if (filters.hasta) add('e.effective_date <= $?::date', filters.hasta);
  if (filters.id) add('e.id=$?', filters.id);
  if (tenant && !tenant.isGlobalAdmin) { params.push(tenant.contratoIds); const c = `$${params.length}`; params.push(tenant.empresaIds); const emp = `$${params.length}`; where.push(`(e.contrato_id=ANY(${c}::bigint[]) OR e.empresa_id=ANY(${emp}::bigint[]))`); }
  const limit = Math.min(100, Math.max(1, Number(filters.limit ?? 50))); const page = Math.max(1, Number(filters.page ?? 1)); const offset = (page - 1) * limit;
  const totalResult = await dbPool.query<{ total: string }>(`SELECT COUNT(*)::text total FROM integracion_eventos e LEFT JOIN integracion_evento_impactos i ON i.evento_id=e.id WHERE ${where.join(' AND ')}`, [...params]);
  params.push(limit, offset);
  const rows = await dbPool.query(`SELECT e.id,e.event_type,e.aggregate_type,e.aggregate_id,e.empresa_id,e.contrato_id,e.persona_id,e.vinculacion_id,e.effective_date,e.periodo_id,e.payload_before,e.payload_after,e.idempotency_key,e.status,e.attempts,e.available_at,e.locked_at,e.locked_by,e.processed_at,e.last_error_code,e.last_error_message,e.created_at,e.updated_at,i.periodo_id::text impacto_periodo_id,i.accion_requerida,i.periodo_estado FROM integracion_eventos e LEFT JOIN integracion_evento_impactos i ON i.evento_id=e.id WHERE ${where.join(' AND ')} ORDER BY e.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  const total = Number(totalResult.rows[0]?.total ?? 0);
  return { items: rows.rows, pagination: { page, limit, total, total_pages: total ? Math.ceil(total / limit) : 0 } };
};

export const getIntegracionEvent = async (id: string, tenant?: TenantAccessContext) => {
  const result = await dbPool.query('SELECT * FROM integracion_eventos WHERE id=$1::bigint', [id]);
  if (!result.rows[0]) throw new AppError('Evento de integración no encontrado', 404, 'INTEGRACION_EVENT_NOT_FOUND');
  if (tenant && !tenant.isGlobalAdmin && !tenant.contratoIds.includes(Number(result.rows[0].contrato_id)) && !tenant.empresaIds.includes(Number(result.rows[0].empresa_id))) throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  const impactos = await dbPool.query('SELECT * FROM integracion_evento_impactos WHERE evento_id=$1::bigint ORDER BY id', [id]);
  return { ...result.rows[0], impactos: impactos.rows };
};

export const listIntegracionImpacts = async (filters: Record<string, unknown>, tenant?: TenantAccessContext) => {
  const params: unknown[] = []; const where: string[] = ['TRUE']; const add = (sql: string, value: unknown) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)); };
  if (filters.periodo_id) add('i.periodo_id=$?', filters.periodo_id);
  if (filters.vinculacion_id) add('i.vinculacion_id=$?', filters.vinculacion_id);
  if (filters.accion_requerida) add('i.accion_requerida=$?', filters.accion_requerida);
  if (tenant && !tenant.isGlobalAdmin) { params.push(tenant.contratoIds); const c = `$${params.length}`; params.push(tenant.empresaIds); const emp = `$${params.length}`; where.push(`(e.contrato_id=ANY(${c}::bigint[]) OR e.empresa_id=ANY(${emp}::bigint[]))`); }
  const limit = Math.min(100, Math.max(1, Number(filters.limit ?? 50))); const page = Math.max(1, Number(filters.page ?? 1)); const offset = (page - 1) * limit;
  const totalResult = await dbPool.query<{ total: string }>(`SELECT COUNT(*)::text total FROM integracion_evento_impactos i JOIN integracion_eventos e ON e.id=i.evento_id WHERE ${where.join(' AND ')}`, [...params]);
  params.push(limit, offset);
  const rows = await dbPool.query(`SELECT i.id,i.evento_id,i.periodo_id,i.vinculacion_id,i.fecha_desde,i.fecha_hasta,i.periodo_estado,i.accion_requerida,i.requiere_recalculo,i.bloqueado_por_cierre,i.contexto_antes,i.contexto_despues,i.created_at,e.event_type,e.status,e.empresa_id,e.contrato_id,e.persona_id,e.effective_date FROM integracion_evento_impactos i JOIN integracion_eventos e ON e.id=i.evento_id WHERE ${where.join(' AND ')} ORDER BY i.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  const total = Number(totalResult.rows[0]?.total ?? 0);
  return { items: rows.rows, pagination: { page, limit, total, total_pages: total ? Math.ceil(total / limit) : 0 } };
};
