import crypto from 'node:crypto';
import type { PoolClient, QueryResultRow } from 'pg';

import { dbPool } from '../../config/db';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { assertTenantAccessForVinculacionId } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import { env } from '../../config/env';
import { resolveContextoLaboralForClient } from './contexto-laboral.service';
import { nominaPoblacionService } from '../nomina/application/nomina-poblacion.service';
import { resolveIntegracionFlagState } from './integracion.flags';
export { resolveIntegracionFlagState } from './integracion.flags';

export const INTEGRACION_EVENT_TYPES = [
  'VINCULACION_CREADA', 'VINCULACION_ACTUALIZADA', 'VINCULACION_RETIRADA',
  'ASIGNACION_OPERATIVA_CAMBIADA', 'CONDICION_PENSION_CAMBIADA',
  'ASISTENCIA_CAMBIADA', 'NOVEDAD_CREADA', 'NOVEDAD_ACTUALIZADA', 'NOVEDAD_DESACTIVADA',
  'TURNO_CREADO', 'TURNO_ACTUALIZADO', 'TURNO_DESACTIVADO',
  'LIQUIDACION_RECALCULADA', 'LIQUIDACION_FINALIZADA'
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
  const allowed = ['estado_vinculacion', 'fecha_inicio', 'fecha_fin', 'contrato_cargo_id', 'cotiza_pension', 'tipo_condicion', 'vigencia_desde', 'vigencia_hasta', 'asignacion_id', 'fecha_inicio_efectiva', 'fecha_fin_efectiva', 'operacion_id', 'dias_afectados', 'fecha_desde', 'fecha_hasta', 'cantidad', 'origen', 'source_event_id', 'version', 'componentes_afectados'];
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
  const result = await executor.query<{ eventos: string | null; impactos: string | null; sync_estado: string | null; recalc_estado: string | null }>(
    `SELECT to_regclass('public.integracion_eventos')::text eventos,
            to_regclass('public.integracion_evento_impactos')::text impactos,
            (SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='integracion_evento_impactos' AND column_name='estado') sync_estado,
            (SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='integracion_evento_impactos' AND column_name='recalc_estado') recalc_estado`
  );
  const row = result.rows[0];
  if (!row?.eventos || !row.impactos || (env.INTEGRACION_SYNC_ENABLED && !row.sync_estado) || (integracionRecalcState().active && !row.recalc_estado)) {
    throw new AppError('La integración Outbox está habilitada pero su esquema no está instalado.', 503, 'INTEGRACION_OUTBOX_SCHEMA_UNAVAILABLE');
  }
};

interface PeriodRow extends QueryResultRow { id: string; contrato_id: string; fecha_inicio: string; fecha_fin: string; estado: string; }
interface ImpactRow extends QueryResultRow { id: string; evento_id: string; periodo_id: string | null; vinculacion_id: string; fecha_desde: string; fecha_hasta: string; periodo_estado: string; accion_requerida: string; requiere_recalculo: boolean; bloqueado_por_cierre: boolean; contexto_antes: Record<string, unknown> | null; contexto_despues: Record<string, unknown> | null; }

const MAX_ATTEMPTS = env.INTEGRACION_MAX_ATTEMPTS;
const LOCK_TIMEOUT_MINUTES = env.INTEGRACION_LOCK_TIMEOUT_MINUTES;
const traceabilityEventTypes = ['ASISTENCIA_CAMBIADA', 'NOVEDAD_CREADA', 'NOVEDAD_ACTUALIZADA', 'NOVEDAD_DESACTIVADA', 'TURNO_CREADO', 'TURNO_ACTUALIZADO', 'TURNO_DESACTIVADO', 'LIQUIDACION_RECALCULADA', 'LIQUIDACION_FINALIZADA'];
const traceabilityEventSql = traceabilityEventTypes.map((_, index) => `$${index + 4}`).join(',');

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
          AND prior.event_type NOT IN (${traceabilityEventSql})
      )
      ORDER BY e.id
      FOR UPDATE SKIP LOCKED LIMIT 1
    )
    UPDATE integracion_eventos e
    SET status='PROCESANDO', attempts=e.attempts+1, locked_at=NOW(), locked_by=$3, updated_at=NOW(), last_error_code=NULL, last_error_message=NULL
    FROM candidate c WHERE e.id=c.id RETURNING e.*
  `, [LOCK_TIMEOUT_MINUTES, MAX_ATTEMPTS, workerId, ...traceabilityEventTypes]);
  return result.rows[0] ?? null;
};

const nextBackoffMinutes = (attempts: number): number => Math.min(env.INTEGRACION_BACKOFF_MAX_MINUTES, Math.max(1, 2 ** Math.max(0, attempts - 1)));
const normalizeEffectiveDate = (value: unknown): string => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const previousDate = (value: string): string => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};

export const integracionRecalcState = (): { requested: boolean; active: boolean; reason: 'ACTIVE' | 'DISABLED' | 'DEPENDENCIES_REQUIRED' } => {
  const state = resolveIntegracionFlagState({ outbox: env.INTEGRACION_OUTBOX_ENABLED, sync: env.INTEGRACION_SYNC_ENABLED, recalc: env.INTEGRACION_RECALC_ENABLED });
  if (!state.recalc) return { requested: env.INTEGRACION_RECALC_ENABLED, active: false, reason: state.recalc_reason };
  return { requested: true, active: true, reason: 'ACTIVE' };
};

const recalcEventTypes = new Set(['VINCULACION_CREADA', 'VINCULACION_ACTUALIZADA', 'VINCULACION_RETIRADA', 'ASIGNACION_OPERATIVA_CAMBIADA', 'CONDICION_PENSION_CAMBIADA', 'ASISTENCIA_CAMBIADA', 'NOVEDAD_CREADA', 'NOVEDAD_ACTUALIZADA', 'NOVEDAD_DESACTIVADA', 'TURNO_CREADO', 'TURNO_ACTUALIZADO', 'TURNO_DESACTIVADO']);

const financialSnapshot = async (periodoId: string, vinculacionId: string): Promise<Record<string, unknown>> => {
  const employee = await dbPool.query(`
    SELECT ne.id::text AS nomina_empleado_id, ne.salario_base, ne.auxilio_transporte,
           ne.dias_pagados, ne.devengado_basico, ne.devengado_transporte,
           ne.total_adiciones, ne.total_deducciones, ne.neto_pagar,
           ne.salud, ne.pension
    FROM nomina_empleados ne
    WHERE ne.periodo_id=$1::bigint AND ne.vinculacion_id=$2::bigint
    ORDER BY ne.id LIMIT 1`, [periodoId, vinculacionId]);
  const liquidation = await dbPool.query(`
    SELECT id::text, estado, requiere_recalculo, total_liquidacion,
           deducciones
    FROM nomina_liquidaciones
    WHERE periodo_id=$1::bigint AND vinculacion_id=$2::bigint
    ORDER BY id DESC LIMIT 1`, [periodoId, vinculacionId]);
  return { empleado: employee.rows[0] ?? null, liquidacion: liquidation.rows[0] ?? null };
};

const recalcSelectiveImpact = async (event: IntegracionEventRow, period: PeriodRow, impactId: string, tenant?: TenantAccessContext): Promise<void> => {
  const state = integracionRecalcState();
  if (!state.active || !recalcEventTypes.has(event.event_type)) return;
  if (!event.vinculacion_id || !event.contrato_id) throw new AppError('Recálculo sin vinculación o contrato', 422, 'INTEGRACION_RECALC_CONTEXT_INVALID');
  await assertTenantAccessForVinculacionId(tenant, Number(event.vinculacion_id));

  const client = await dbPool.connect();
  let employeeId: string | null = null;
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 55055))`, [`${event.vinculacion_id}:${period.id}`]);
    const scope = await client.query<{ contrato_id: string; empresa_id: string }>(
      `SELECT v.contrato_id::text, c.empresa_id::text FROM vinculaciones v JOIN contratos c ON c.id=v.contrato_id WHERE v.id=$1::bigint`, [event.vinculacion_id]);
    if (!scope.rows[0] || scope.rows[0].contrato_id !== String(event.contrato_id) || (event.empresa_id && scope.rows[0].empresa_id !== String(event.empresa_id))) {
      throw new AppError('El contexto del recálculo no coincide con el evento', 409, 'INTEGRACION_RECALC_SCOPE_MISMATCH');
    }
    const newer = await client.query<{ exists: boolean }>(`SELECT EXISTS(
      SELECT 1 FROM integracion_eventos newer
      WHERE newer.aggregate_type=$1 AND newer.aggregate_id=$2 AND newer.id>$3::bigint
        AND newer.event_type = ANY($4::text[]) AND newer.status IN ('PENDIENTE','PROCESANDO')
    ) exists`, [event.aggregate_type, event.aggregate_id, event.id, Array.from(recalcEventTypes)]);
    if (newer.rows[0]?.exists) {
      await client.query(`UPDATE integracion_evento_impactos SET recalc_estado='VERSION_DESACTUALIZADA',recalc_version_esperada=$2::bigint,recalc_completed_at=NOW(),updated_at=NOW() WHERE id=$1::bigint`, [impactId, event.id]);
      await client.query('COMMIT');
      return;
    }
    const periodState = await client.query<{ estado: string; finalized: boolean }>(`SELECT np.estado, COALESCE(bool_or(UPPER(COALESCE(nl.estado,'')) IN ('FINALIZADA','FINALIZADO')),FALSE) finalized FROM nomina_periodos np LEFT JOIN nomina_liquidaciones nl ON nl.periodo_id=np.id AND nl.vinculacion_id=$2::bigint WHERE np.id=$1::bigint GROUP BY np.id,np.estado`, [period.id, event.vinculacion_id]);
    if (periodState.rows[0]?.finalized) {
      await client.query(`UPDATE integracion_evento_impactos SET recalc_estado='BLOQUEADA_FINALIZADA',recalc_version_esperada=$2::bigint,recalc_completed_at=NOW(),updated_at=NOW() WHERE id=$1::bigint`, [impactId, event.id]);
      await client.query('COMMIT');
      return;
    }
    if (periodState.rows[0]?.estado !== 'ABIERTO') {
      await client.query(`UPDATE integracion_evento_impactos SET recalc_estado='BLOQUEADA_CIERRE',recalc_version_esperada=$2::bigint,recalc_completed_at=NOW(),updated_at=NOW() WHERE id=$1::bigint`, [impactId, event.id]);
      await client.query('COMMIT');
      return;
    }
    const current = await client.query<{ recalc_estado: string; recalc_attempts: number }>(`SELECT recalc_estado,recalc_attempts FROM integracion_evento_impactos WHERE id=$1::bigint FOR UPDATE`, [impactId]);
    const row = current.rows[0];
    const version = await client.query<{ recalc_version_esperada: string | null }>(`SELECT recalc_version_esperada::text FROM integracion_evento_impactos WHERE id=$1::bigint`, [impactId]);
    if (row && ['RECALCULADA','SIN_CAMBIOS'].includes(row.recalc_estado) && version.rows[0]?.recalc_version_esperada === String(event.id)) { await client.query('COMMIT'); return; }
    if ((row?.recalc_attempts ?? 0) >= env.INTEGRACION_MAX_ATTEMPTS) throw new AppError('Máximo de intentos de recálculo alcanzado', 409, 'INTEGRACION_RECALC_MAX_ATTEMPTS');
    const employee = await client.query<{ id: string }>(`SELECT id::text FROM nomina_empleados WHERE periodo_id=$1::bigint AND vinculacion_id=$2::bigint ORDER BY id LIMIT 1`, [period.id, event.vinculacion_id]);
    employeeId = employee.rows[0]?.id ?? null;
    if (!employeeId) {
      await client.query(`UPDATE integracion_evento_impactos SET recalc_estado='SIN_CAMBIOS',recalc_version_esperada=$2::bigint,recalc_attempts=recalc_attempts+1,recalc_completed_at=NOW(),updated_at=NOW() WHERE id=$1::bigint`, [impactId, event.id]);
      await client.query('COMMIT');
      return;
    }
    await client.query(`UPDATE integracion_evento_impactos SET recalc_estado='PROCESANDO',recalc_version_esperada=$2::bigint,recalc_attempts=recalc_attempts+1,recalc_started_at=NOW(),updated_at=NOW() WHERE id=$1::bigint`, [impactId, event.id]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { client.release(); }

  let before: Record<string, unknown>;
  try {
    before = await financialSnapshot(period.id, event.vinculacion_id);
    const { recalculateNominaPeriodo } = await import('../nomina/nomina.service.js');
    await recalculateNominaPeriodo(period.id, { force: true, nomina_empleado_id: employeeId! }, '0', tenant);
    const after = await financialSnapshot(period.id, event.vinculacion_id);
    const audit = await dbPool.connect();
    try {
      await audit.query('BEGIN');
      await audit.query(`UPDATE integracion_evento_impactos SET recalc_estado='RECALCULADA',recalc_completed_at=NOW(),recalc_before=$2::jsonb,recalc_after=$3::jsonb,recalc_last_error_code=NULL,recalc_last_error_message=NULL,updated_at=NOW() WHERE id=$1::bigint`, [impactId, JSON.stringify(before), JSON.stringify(after)]);
      await audit.query(`INSERT INTO auditoria_eventos(empresa_id,contrato_id,modulo,entidad,entidad_id,accion,descripcion,datos_anteriores,datos_nuevos) VALUES($1,$2,'INTEGRACION','integracion_evento_impactos',$3,'RECALC','Recálculo selectivo canónico aplicado',$4::jsonb,$5::jsonb)`, [event.empresa_id, event.contrato_id, impactId, JSON.stringify(before), JSON.stringify(after)]);
      await registrarEventoActividadLaboral(audit, { event_type: 'LIQUIDACION_RECALCULADA', aggregate_type: 'vinculacion', aggregate_id: event.vinculacion_id, empresa_id: Number(event.empresa_id), contrato_id: Number(event.contrato_id), persona_id: event.persona_id ? Number(event.persona_id) : null, vinculacion_id: Number(event.vinculacion_id), effective_date: normalizeEffectiveDate(event.effective_date), periodo_id: Number(period.id), idempotency_key: `integracion-recalc:${event.id}:${event.vinculacion_id}:${period.id}`, resumen: { source_event_id: event.id, version: event.id, componentes_afectados: event.event_type } });
      await audit.query('COMMIT');
    } catch (error) { await audit.query('ROLLBACK').catch(() => undefined); throw error; } finally { audit.release(); }
  } catch (error) {
    const failed = await dbPool.connect();
    try { await failed.query(`UPDATE integracion_evento_impactos SET recalc_estado='ERROR',recalc_last_error_code=$2,recalc_last_error_message=$3,recalc_completed_at=NOW(),updated_at=NOW() WHERE id=$1::bigint`, [impactId, error instanceof AppError ? error.code : 'INTEGRACION_RECALC_ERROR', String(error instanceof Error ? error.message : error).slice(0, 500)]); } finally { failed.release(); }
    throw error;
  }
};

const processNextIntegracionEventObservation = async (workerId: string, tenant?: TenantAccessContext): Promise<IntegracionEventRow | null> => {
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

const processNextIntegracionEventSelective = async (workerId: string, tenant?: TenantAccessContext): Promise<IntegracionEventRow | null> => {
  await assertIntegracionOutboxSchema();
  const claimClient = await dbPool.connect(); let event: IntegracionEventRow | null = null;
  try { await claimClient.query('BEGIN'); event=await claimNextIntegracionEvent(workerId,claimClient); await claimClient.query('COMMIT'); }
  catch(error){await claimClient.query('ROLLBACK');throw error;} finally{claimClient.release();}
  if(!event) return null;
  try {
    const effectiveDate=normalizeEffectiveDate(event.effective_date);
    if(!event.vinculacion_id || !event.contrato_id) throw new AppError('Evento sin vinculacion o contrato',422,'INTEGRACION_EVENT_CONTEXT_INVALID');
    const periodResult=await dbPool.query<PeriodRow>(`SELECT id::text,contrato_id::text,fecha_inicio::text,fecha_fin::text,estado FROM nomina_periodos WHERE contrato_id=$1::bigint AND fecha_inicio <= $2::date AND fecha_fin >= $2::date ORDER BY fecha_inicio,id`,[event.contrato_id,effectiveDate]);
    for(const period of periodResult.rows){
      const client=await dbPool.connect();
      try{
        await client.query('BEGIN');
        const context=await resolveContextoLaboralForClient({vinculacion_id:Number(event.vinculacion_id),contrato_id:Number(event.contrato_id),empresa_id:event.empresa_id?Number(event.empresa_id):undefined,fecha:effectiveDate},tenant,client);
        const contextBefore=event.payload_before ?? null;
        const open=period.estado==='ABIERTO';
        const inserted=await client.query<{id:string;estado:string}>(`INSERT INTO integracion_evento_impactos(evento_id,periodo_id,vinculacion_id,fecha_desde,fecha_hasta,periodo_estado,accion_requerida,requiere_recalculo,bloqueado_por_cierre,contexto_antes,contexto_despues,estado,version_esperada) VALUES($1,$2,$3,$4::date,$4::date,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$1) ON CONFLICT(evento_id,vinculacion_id,COALESCE(periodo_id,0)) DO UPDATE SET updated_at=NOW() RETURNING id::text,estado`,[event.id,period.id,event.vinculacion_id,effectiveDate,period.estado,open?'REQUIERE_SINCRONIZACION':'REQUIERE_AJUSTE_AUTORIZADO',integracionRecalcState().active && recalcEventTypes.has(event.event_type),!open,contextBefore?JSON.stringify(contextBefore):null,JSON.stringify(context),open?'PENDIENTE':'BLOQUEADO_CIERRE']);
        const impact=inserted.rows[0];
        await client.query('COMMIT');
        const reverseTraceabilityEvent = ['ASISTENCIA_CAMBIADA','NOVEDAD_CREADA','NOVEDAD_ACTUALIZADA','NOVEDAD_DESACTIVADA','TURNO_CREADO','TURNO_ACTUALIZADO','TURNO_DESACTIVADO','LIQUIDACION_RECALCULADA','LIQUIDACION_FINALIZADA'].includes(event.event_type);
        let syncApplied = false;
        if(reverseTraceabilityEvent){
          await client.query('BEGIN');
          await client.query(`UPDATE integracion_evento_impactos SET estado='SIN_CAMBIOS',accion_requerida='TRAZABILIDAD_PERSONAL',attempts=attempts+1,applied_at=NOW(),updated_at=NOW() WHERE id=$1::bigint AND version_esperada=$2::bigint`,[impact?.id,event.id]);
          await client.query('COMMIT');
        } else if(open && impact?.estado!=='APLICADO' && impact?.estado!=='SIN_CAMBIOS'){
          const result=await nominaPoblacionService.syncSelective({periodoId:period.id,vinculacionId:String(event.vinculacion_id),effectiveDate,eventType:event.event_type,actorUserId:'0',context:context as unknown as Record<string,unknown>,retirementDate:typeof event.payload_after?.fecha_fin==='string'?event.payload_after.fecha_fin:null});
          await client.query('BEGIN');
          await client.query(`UPDATE integracion_evento_impactos SET estado=$2,applied_at=CASE WHEN $2 IN ('APLICADO','SIN_CAMBIOS') THEN NOW() ELSE applied_at END,attempts=attempts+1,updated_at=NOW() WHERE id=$1::bigint AND version_esperada=$3::bigint`,[impact?.id,result.status,event.id]);
          await client.query('COMMIT');
          syncApplied = result.status === 'APLICADO' || result.status === 'SIN_CAMBIOS';
        } else if(open && impact?.estado==='APLICADO') {
          await client.query('BEGIN');
          await client.query(`UPDATE integracion_evento_impactos SET estado='SIN_CAMBIOS',attempts=attempts+1,updated_at=NOW() WHERE id=$1::bigint AND version_esperada=$2::bigint`,[impact.id,event.id]);
          await client.query('COMMIT');
        }
        if (impact?.id && integracionRecalcState().active && recalcEventTypes.has(event.event_type) && (syncApplied || reverseTraceabilityEvent || !open)) await recalcSelectiveImpact(event, period, impact.id, tenant);
      }catch(error){await client.query('ROLLBACK'); const code=error instanceof AppError?error.code:'INTEGRACION_IMPACTO_ERROR'; const message=String(error instanceof Error?error.message:error).replace(/[\r\n\t]/g,' ').slice(0,500); await dbPool.query(`INSERT INTO integracion_evento_impactos(evento_id,periodo_id,vinculacion_id,fecha_desde,fecha_hasta,periodo_estado,accion_requerida,bloqueado_por_cierre,estado,version_esperada,last_error_code,last_error_message,attempts) VALUES($1,$2,$3,$4::date,$4::date,$5,'REQUIERE_SINCRONIZACION',FALSE,'ERROR',$1,$6,$7,1) ON CONFLICT(evento_id,vinculacion_id,COALESCE(periodo_id,0)) DO UPDATE SET estado='ERROR',attempts=integracion_evento_impactos.attempts+1,last_error_code=EXCLUDED.last_error_code,last_error_message=EXCLUDED.last_error_message,updated_at=NOW()`,[event.id,period.id,event.vinculacion_id,effectiveDate,period.estado,code,message]); throw error;} finally{client.release();}
    }
    if(periodResult.rows.length===0){
      await dbPool.query(`INSERT INTO integracion_evento_impactos(evento_id,periodo_id,vinculacion_id,fecha_desde,fecha_hasta,periodo_estado,accion_requerida,requiere_recalculo,bloqueado_por_cierre,estado,version_esperada) VALUES($1,NULL,$2,$3::date,$3::date,'SIN_INTERSECCION','SIN_IMPACTO',FALSE,FALSE,'SIN_CAMBIOS',$1) ON CONFLICT(evento_id,vinculacion_id,COALESCE(periodo_id,0)) DO NOTHING`,[event.id,event.vinculacion_id,effectiveDate]);
    }
    await dbPool.query(`INSERT INTO auditoria_eventos(empresa_id,contrato_id,modulo,entidad,entidad_id,accion,descripcion,datos_anteriores,datos_nuevos) VALUES($1,$2,'INTEGRACION','integracion_eventos',$3,'PROCESS','Evento sincronizado selectivamente',$4::jsonb,$5::jsonb)`,[event.empresa_id,event.contrato_id,event.id,event.payload_before?JSON.stringify(event.payload_before):null,JSON.stringify({status:'PROCESADO',sync:true})]);
    await dbPool.query(`UPDATE integracion_eventos SET status='PROCESADO',processed_at=NOW(),locked_at=NULL,locked_by=NULL,updated_at=NOW() WHERE id=$1`,[event.id]);
    return {...event,status:'PROCESADO',processed_at:new Date().toISOString()};
  } catch(error){const code=error instanceof AppError?error.code:'INTEGRACION_PROCESSING_ERROR';const message=String(error instanceof Error?error.message:error).replace(/[\r\n\t]/g,' ').slice(0,500);await dbPool.query(`UPDATE integracion_eventos SET status='ERROR',available_at=NOW()+($2::int*INTERVAL '1 minute'),locked_at=NULL,locked_by=NULL,last_error_code=$3,last_error_message=$4,updated_at=NOW() WHERE id=$1`,[event.id,nextBackoffMinutes(event.attempts),code,message]);return {...event,status:'ERROR',last_error_code:code,last_error_message:message};}
};

export const processNextIntegracionEvent = async (workerId: string, tenant?: TenantAccessContext): Promise<IntegracionEventRow | null> =>
  !env.INTEGRACION_OUTBOX_ENABLED ? Promise.resolve(null) : env.INTEGRACION_SYNC_ENABLED ? processNextIntegracionEventSelective(workerId,tenant) : processNextIntegracionEventObservation(workerId,tenant);

export const registrarEventoActividadLaboral = async (
  client: PoolClient,
  input: Omit<PublicarEventoInput, 'event_type'> & { event_type: Exclude<IntegracionEventType, 'VINCULACION_CREADA' | 'VINCULACION_ACTUALIZADA' | 'VINCULACION_RETIRADA' | 'ASIGNACION_OPERATIVA_CAMBIADA' | 'CONDICION_PENSION_CAMBIADA'>; resumen?: Record<string, unknown> }
): Promise<string> => publicarEventoOutbox(client, {
  ...input,
  after: { ...(input.after ?? {}), ...(input.resumen ?? {}) }
});

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
