import type { PoolClient } from 'pg';
import { dbPool } from '../../config/db';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { assertTenantAccessForEmpresaId } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import { registerAuditEntry, type AuditRequestMeta } from '../auditoria/auditoria.helper';
import { uploadPersonaDocumento } from '../documentos/documentos.service';
import type { ajusteManualSchema, ajusteManualUpdateSchema } from './nomina.schemas';
import type { z } from 'zod';

export type AjusteManualInput = z.infer<typeof ajusteManualSchema>;
export type AjusteManualUpdate = z.infer<typeof ajusteManualUpdateSchema>;

const rowSelect = `
  SELECT a.id::text, a.empresa_id::text, a.contrato_id::text, a.periodo_id::text,
    a.nomina_empleado_id::text, a.tipo, a.concepto, a.observacion, a.valor,
    a.documento_soporte_id::text, a.activo, a.created_by::text, a.created_at,
    a.updated_at, a.anulado_by::text, a.anulado_at, a.motivo_anulacion,
    CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS empleado,
    p.numero_documento
  FROM nomina_ajustes_manuales a
  INNER JOIN nomina_empleados ne ON ne.id = a.nomina_empleado_id
  INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id
  INNER JOIN personas p ON p.id = v.persona_id
`;

const assertScopeAndEmployee = async (client: PoolClient, periodoId: string, employeeId: string, tenant?: TenantAccessContext) => {
  const result = await client.query<{ empresa_id: string; contrato_id: string; estado: string; employee_id: string }>(
    `SELECT c.empresa_id::text, c.id::text AS contrato_id, np.estado, ne.id::text AS employee_id
     FROM nomina_periodos np INNER JOIN contratos c ON c.id=np.contrato_id
     INNER JOIN nomina_empleados ne ON ne.periodo_id=np.id
     WHERE np.id=$1::bigint AND ne.id=$2::bigint LIMIT 1`, [periodoId, employeeId]);
  const row = result.rows[0];
  if (!row) throw new AppError('Empleado no pertenece al periodo seleccionado', 409, 'NOMINA_AJUSTE_EMPLEADO_INVALIDO');
  await assertTenantAccessForEmpresaId(tenant, row.empresa_id);
  if (tenant && !tenant.isGlobalAdmin && tenant.contratoIds.length > 0 && !tenant.contratoIds.includes(Number(row.contrato_id))) {
    throw new AppError('Contrato fuera del alcance del usuario', 403, 'TENANT_CONTRACT_FORBIDDEN');
  }
  if (row.estado !== 'ABIERTO') throw new AppError('El periodo debe estar ABIERTO', 409, 'NOMINA_PERIODO_NO_ABIERTO');
  return row;
};

export const listAjustesManuales = async (periodoId: string, tenant?: TenantAccessContext) => {
  const client = await dbPool.connect();
  try {
    const scope = await client.query<{ empresa_id: string }>('SELECT c.empresa_id::text FROM nomina_periodos np INNER JOIN contratos c ON c.id=np.contrato_id WHERE np.id=$1::bigint', [periodoId]);
    if (!scope.rows[0]) throw new AppError('Periodo no encontrado', 404, 'NOMINA_PERIODO_NOT_FOUND');
    await assertTenantAccessForEmpresaId(tenant, scope.rows[0].empresa_id);
    const result = await client.query(`${rowSelect} WHERE a.periodo_id=$1::bigint ORDER BY a.created_at DESC, a.id DESC`, [periodoId]);
    return result.rows;
  } finally { client.release(); }
};

export const createAjusteManual = async (periodoId: string, input: AjusteManualInput, actor: string, tenant?: TenantAccessContext, meta?: AuditRequestMeta) => {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const scope = await assertScopeAndEmployee(client, periodoId, input.nomina_empleado_id, tenant);
    const inserted = await client.query(`INSERT INTO nomina_ajustes_manuales (empresa_id, contrato_id, periodo_id, nomina_empleado_id, tipo, concepto, observacion, valor, documento_soporte_id, created_by, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW()) RETURNING id::text`, [scope.empresa_id, scope.contrato_id, periodoId, input.nomina_empleado_id, input.tipo, input.concepto, input.observacion ?? null, input.valor, input.documento_soporte_id ?? null, actor]);
    const row = (await client.query(`${rowSelect} WHERE a.id=$1::bigint`, [inserted.rows[0].id])).rows[0];
    await registerAuditEntry({ client, usuario_id: actor, accion: 'NOMINA_AJUSTE_MANUAL_CREATE', tabla: 'nomina_ajustes_manuales', registro_id: row.id, descripcion: 'Creación de ajuste manual de nómina', after: row, ip: meta?.ip, user_agent: meta?.user_agent });
    await client.query('COMMIT'); return row;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
};

export const updateAjusteManual = async (id: string, input: AjusteManualUpdate, actor: string, tenant?: TenantAccessContext, meta?: AuditRequestMeta) => {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const current = (await client.query(`${rowSelect} WHERE a.id=$1::bigint FOR UPDATE`, [id])).rows[0];
    if (!current) throw new AppError('Ajuste manual no encontrado', 404, 'NOMINA_AJUSTE_NOT_FOUND');
    await assertTenantAccessForEmpresaId(tenant, current.empresa_id);
    if (!current.activo) throw new AppError('No se puede editar un ajuste anulado', 409, 'NOMINA_AJUSTE_INACTIVO');
    const period = await client.query<{ estado: string }>('SELECT estado FROM nomina_periodos WHERE id=$1::bigint', [current.periodo_id]);
    if (period.rows[0]?.estado !== 'ABIERTO') throw new AppError('El periodo debe estar ABIERTO', 409, 'NOMINA_PERIODO_NO_ABIERTO');
    const next = { ...current, ...input };
    await client.query('UPDATE nomina_ajustes_manuales SET tipo=$2, concepto=$3, valor=$4, observacion=$5, documento_soporte_id=$6, updated_at=NOW() WHERE id=$1::bigint', [id, next.tipo, next.concepto, next.valor, next.observacion ?? null, next.documento_soporte_id ?? null]);
    const row = (await client.query(`${rowSelect} WHERE a.id=$1::bigint`, [id])).rows[0];
    await registerAuditEntry({ client, usuario_id: actor, accion: 'NOMINA_AJUSTE_MANUAL_UPDATE', tabla: 'nomina_ajustes_manuales', registro_id: id, descripcion: 'Actualización de ajuste manual', before: current, after: row, ip: meta?.ip, user_agent: meta?.user_agent });
    await client.query('COMMIT'); return row;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
};

export const annulAjusteManual = async (id: string, motivo: string, actor: string, tenant?: TenantAccessContext, meta?: AuditRequestMeta) => {
  const client = await dbPool.connect();
  try { await client.query('BEGIN'); const current = (await client.query(`${rowSelect} WHERE a.id=$1::bigint FOR UPDATE`, [id])).rows[0]; if (!current) throw new AppError('Ajuste manual no encontrado', 404, 'NOMINA_AJUSTE_NOT_FOUND'); await assertTenantAccessForEmpresaId(tenant, current.empresa_id); if (!current.activo) return current; const period = await client.query<{ estado: string }>('SELECT estado FROM nomina_periodos WHERE id=$1::bigint', [current.periodo_id]); if (period.rows[0]?.estado !== 'ABIERTO') throw new AppError('El periodo debe estar ABIERTO', 409, 'NOMINA_PERIODO_NO_ABIERTO'); await client.query('UPDATE nomina_ajustes_manuales SET activo=FALSE, anulado_by=$2, anulado_at=NOW(), motivo_anulacion=$3, updated_at=NOW() WHERE id=$1::bigint', [id, actor, motivo]); const row = (await client.query(`${rowSelect} WHERE a.id=$1::bigint`, [id])).rows[0]; await registerAuditEntry({ client, usuario_id: actor, accion: 'NOMINA_AJUSTE_MANUAL_ANNUL', tabla: 'nomina_ajustes_manuales', registro_id: id, descripcion: 'Anulación de ajuste manual', before: current, after: row, ip: meta?.ip, user_agent: meta?.user_agent }); await client.query('COMMIT'); return row; } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
};

export const uploadAjusteManualSoporte = async (id: string, file: Express.Multer.File, actor: string, tenant?: TenantAccessContext) => {
  if (file.mimetype !== 'application/pdf') throw new AppError('El soporte debe ser PDF', 400, 'NOMINA_AJUSTE_SOPORTE_MIME_INVALID');
  const client = await dbPool.connect();
  try {
    const item = (await client.query<{ persona_id: string }>(`SELECT v.persona_id::text FROM nomina_ajustes_manuales a INNER JOIN nomina_empleados ne ON ne.id=a.nomina_empleado_id INNER JOIN vinculaciones v ON v.id=ne.vinculacion_id WHERE a.id=$1::bigint AND a.activo = TRUE`, [id])).rows[0];
    if (!item) throw new AppError('Ajuste manual no encontrado', 404, 'NOMINA_AJUSTE_NOT_FOUND');
    const type = (await client.query<{ id: string }>(`SELECT id::text FROM tipos_documentos WHERE codigo='NOMINA_NOVEDAD' LIMIT 1`)).rows[0];
    if (!type) throw new AppError('Tipo documental NOMINA_NOVEDAD no configurado', 409, 'NOMINA_AJUSTE_SOPORTE_TYPE_MISSING');
    const document = await uploadPersonaDocumento(item.persona_id, file, { tipo_documento_id: type.id, fecha_expedicion: null, fecha_vencimiento: null }, actor, tenant);
    await client.query('UPDATE nomina_ajustes_manuales SET documento_soporte_id=$2, updated_at=NOW() WHERE id=$1::bigint', [id, document.id]);
    return { documento_soporte_id: document.id };
  } finally { client.release(); }
};
