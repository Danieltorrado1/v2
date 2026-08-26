import { dbPool } from '../../config/db';
import { AppError } from '../../utils/AppError';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';

export const NOMINA_PROCESOS = ['COBERTURA', 'ASISTENCIA', 'OPS'] as const;
export type NominaProceso = (typeof NOMINA_PROCESOS)[number];

export interface NominaProcessAccess { proceso: NominaProceso; responsable: boolean; municipios: number[]; areas: number[]; administrative?: boolean; }
export type NominaResponsibility = { proceso: NominaProceso; municipios?: number[]; areas?: number[] };

export function evaluateNominaProcessAccess(assignments: NominaResponsibility[]): NominaProcessAccess[] {
  return NOMINA_PROCESOS.map((proceso) => {
    const matches = assignments.filter((item) => item.proceso === proceso);
    return { proceso, responsable: matches.length > 0, municipios: [...new Set(matches.flatMap((item) => item.municipios ?? []))], areas: [...new Set(matches.flatMap((item) => item.areas ?? []))] };
  });
}

const normalize = (value: string): NominaProceso => {
  const candidate = value.trim().toUpperCase() as NominaProceso;
  if (!NOMINA_PROCESOS.includes(candidate)) throw new AppError('Proceso de nómina inválido', 400, 'NOMINA_PROCESO_INVALIDO');
  return candidate;
};

export async function getNominaProcessAccess(userId: string | number, empresaId: string | number, tenant?: TenantAccessContext): Promise<NominaProcessAccess[]> {
  const empresa = Number(empresaId);
  if (!tenant?.isGlobalAdmin && tenant) {
    const allowedByContract = tenant.contratoIds.length > 0 && (await dbPool.query('SELECT EXISTS (SELECT 1 FROM contratos WHERE empresa_id=$1::bigint AND id=ANY($2::bigint[])) allowed', [empresa, tenant.contratoIds])).rows[0]?.allowed;
    if (!tenant.empresaIds.includes(empresa) && !allowedByContract) throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  }
  const result = await dbPool.query<{ proceso: NominaProceso; municipios: number[]; areas: number[] }>(
    `SELECT r.proceso,
      COALESCE((SELECT array_agg(rm.municipio_id ORDER BY rm.municipio_id) FROM nomina_responsabilidad_municipios rm WHERE rm.responsabilidad_id=r.id), '{}') municipios,
      COALESCE((SELECT array_agg(ra.area_id ORDER BY ra.area_id) FROM nomina_responsabilidad_areas ra WHERE ra.responsabilidad_id=r.id), '{}') areas
     FROM nomina_responsabilidades_usuario r WHERE r.usuario_id=$1::bigint AND r.empresa_id=$2::bigint AND r.activo=TRUE ORDER BY r.proceso`, [userId, empresa]);
  return evaluateNominaProcessAccess(result.rows).map((item) => ({ ...item, administrative: Boolean(tenant?.isGlobalAdmin) }));
}

export async function listNominaResponsibilities(userId: string | number, empresaId: string | number, tenant?: TenantAccessContext) {
  if (tenant && !tenant.isGlobalAdmin && !tenant.empresaIds.includes(Number(empresaId))) throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  return (await dbPool.query(`SELECT r.id::text, r.proceso, r.activo, COALESCE((SELECT array_agg(municipio_id ORDER BY municipio_id) FROM nomina_responsabilidad_municipios WHERE responsabilidad_id=r.id),'{}') municipio_ids, COALESCE((SELECT array_agg(area_id ORDER BY area_id) FROM nomina_responsabilidad_areas WHERE responsabilidad_id=r.id),'{}') area_ids FROM nomina_responsabilidades_usuario r WHERE r.usuario_id=$1::bigint AND r.empresa_id=$2::bigint ORDER BY r.proceso`, [userId, empresaId])).rows;
}

export function appendNominaCoberturaScope(conditions: string[], params: unknown[], tenant?: TenantAccessContext, aliases = { vinculacion: 'v', periodo: 'np' }) {
  if (!tenant || tenant.isGlobalAdmin) return;
  if (!tenant.userId) { conditions.push('1=0'); return; }
  params.push(tenant.userId);
  const p = params.length;
  conditions.push(`EXISTS (SELECT 1 FROM nomina_responsabilidades_usuario nru JOIN nomina_responsabilidad_municipios nrm ON nrm.responsabilidad_id=nru.id JOIN cobertura_asignaciones cas ON cas.vinculacion_id=${aliases.vinculacion}.id JOIN focalizacion_final cff ON cff.id=cas.focalizacion_final_id WHERE nru.usuario_id=$${p}::bigint AND nru.empresa_id=${aliases.vinculacion}.empresa_id AND nru.proceso='COBERTURA' AND nru.activo=TRUE AND cff.municipio_id=nrm.municipio_id AND cas.fecha_inicio <= ${aliases.periodo}.fecha_fin AND (cas.fecha_fin IS NULL OR cas.fecha_fin >= ${aliases.periodo}.fecha_inicio))`);
}

export async function assertNominaEmpleadoCoberturaScope(empleadoId: string | number, tenant?: TenantAccessContext, client: any = dbPool): Promise<void> {
  if (!tenant || tenant.isGlobalAdmin) return;
  if (!tenant.userId) throw new AppError('Usuario sin responsabilidad para este proceso', 403, 'NOMINA_RESPONSABILIDAD_FORBIDDEN');
  const result = await client.query(`SELECT EXISTS (SELECT 1 FROM nomina_empleados ne JOIN vinculaciones v ON v.id=ne.vinculacion_id JOIN nomina_periodos np ON np.id=ne.periodo_id JOIN nomina_responsabilidades_usuario nru ON nru.usuario_id=$2::bigint AND nru.empresa_id=v.empresa_id AND nru.proceso='COBERTURA' AND nru.activo=TRUE JOIN nomina_responsabilidad_municipios nrm ON nrm.responsabilidad_id=nru.id JOIN cobertura_asignaciones cas ON cas.vinculacion_id=v.id JOIN focalizacion_final cff ON cff.id=cas.focalizacion_final_id AND cff.municipio_id=nrm.municipio_id WHERE ne.id=$1::bigint AND cas.fecha_inicio <= np.fecha_fin AND (cas.fecha_fin IS NULL OR cas.fecha_fin >= np.fecha_inicio)) allowed`, [empleadoId, tenant.userId]);
  if (!result.rows[0]?.allowed) throw new AppError('Registro fuera del alcance de nÃ³mina', 403, 'NOMINA_SCOPE_FORBIDDEN');
}

export async function assertNominaPeriodoCoberturaScope(periodoId: string | number, tenant?: TenantAccessContext, client: any = dbPool): Promise<void> {
  if (!tenant || tenant.isGlobalAdmin) return;
  if (!tenant.userId) throw new AppError('Usuario sin responsabilidad para este proceso', 403, 'NOMINA_RESPONSABILIDAD_FORBIDDEN');
  const responsibility = await client.query(`SELECT EXISTS (SELECT 1 FROM nomina_responsabilidades_usuario WHERE usuario_id=$1::bigint AND proceso='COBERTURA' AND activo=TRUE) allowed`, [tenant.userId]);
  if (!responsibility.rows[0]?.allowed) throw new AppError('Usuario sin responsabilidad para este proceso', 403, 'NOMINA_RESPONSABILIDAD_FORBIDDEN');
  const result = await client.query(`SELECT NOT EXISTS (SELECT 1 FROM nomina_empleados ne JOIN vinculaciones v ON v.id=ne.vinculacion_id JOIN nomina_periodos np ON np.id=ne.periodo_id WHERE ne.periodo_id=$1::bigint AND NOT EXISTS (SELECT 1 FROM nomina_responsabilidades_usuario nru JOIN nomina_responsabilidad_municipios nrm ON nrm.responsabilidad_id=nru.id JOIN cobertura_asignaciones cas ON cas.vinculacion_id=v.id JOIN focalizacion_final cff ON cff.id=cas.focalizacion_final_id WHERE nru.usuario_id=$2::bigint AND nru.empresa_id=v.empresa_id AND nru.proceso='COBERTURA' AND nru.activo=TRUE AND cff.municipio_id=nrm.municipio_id AND cas.fecha_inicio <= np.fecha_fin AND (cas.fecha_fin IS NULL OR cas.fecha_fin >= np.fecha_inicio))) allowed`, [periodoId, tenant.userId]);
  if (!result.rows[0]?.allowed) throw new AppError('Período contiene registros fuera del alcance de nómina', 403, 'NOMINA_SCOPE_FORBIDDEN');
}

export async function listNominaAsistenciaPersonal(areaId: string | number, fecha: string, tenant?: TenantAccessContext) {
  if (tenant && !tenant.isGlobalAdmin) {
    if (!tenant.userId) throw new AppError('Usuario sin responsabilidad para este proceso', 403, 'NOMINA_RESPONSABILIDAD_FORBIDDEN');
    const allowed = await dbPool.query(`SELECT EXISTS (SELECT 1 FROM nomina_responsabilidades_usuario nru JOIN nomina_responsabilidad_areas nra ON nra.responsabilidad_id=nru.id WHERE nru.usuario_id=$1::bigint AND nru.empresa_id=(SELECT empresa_id FROM nomina_areas WHERE id=$2::bigint) AND nru.proceso='ASISTENCIA' AND nru.activo=TRUE AND nra.area_id=$2::bigint) allowed`, [tenant.userId, areaId]);
    if (!allowed.rows[0]?.allowed) throw new AppError('Ãrea fuera del alcance de nÃ³mina', 403, 'NOMINA_AREA_FORBIDDEN');
  }
  return (await dbPool.query(`SELECT v.id vinculacion_id,p.id persona_id,p.nombre_completo,va.area_id FROM nomina_vinculacion_areas va JOIN nomina_areas a ON a.id=va.area_id JOIN vinculaciones v ON v.id=va.vinculacion_id JOIN personas p ON p.id=v.persona_id WHERE va.area_id=$1::bigint AND va.activo=TRUE AND va.vigencia_desde <= $2::date AND (va.vigencia_hasta IS NULL OR va.vigencia_hasta >= $2::date) AND a.activo=TRUE ORDER BY p.nombre_completo`, [areaId, fecha])).rows;
}

export async function listNominaAreas(empresaId: string | number, tenant?: TenantAccessContext) {
  if (tenant && !tenant.isGlobalAdmin && !tenant.empresaIds.includes(Number(empresaId))) throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  return (await dbPool.query(`SELECT id::text,empresa_id::text,codigo,nombre,activo,orden FROM nomina_areas WHERE empresa_id=$1::bigint ORDER BY COALESCE(orden,999999),id`, [empresaId])).rows;
}

export async function createNominaArea(input: { empresaId: string | number; codigo: string; nombre: string; orden?: number }, tenant?: TenantAccessContext) {
  const empresaId = Number(input.empresaId);
  if (tenant && !tenant.isGlobalAdmin && !tenant.empresaIds.includes(empresaId)) throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  return (await dbPool.query(`INSERT INTO nomina_areas(empresa_id,codigo,nombre,orden) VALUES($1::bigint,$2,$3,$4) RETURNING id::text,empresa_id::text,codigo,nombre,activo,orden`, [empresaId, input.codigo.trim(), input.nombre.trim(), input.orden ?? null])).rows[0];
}

export async function updateNominaArea(id: string | number, input: { nombre?: string; activo?: boolean; orden?: number }, tenant?: TenantAccessContext) {
  const result = await dbPool.query(`UPDATE nomina_areas SET nombre=COALESCE($2,nombre), activo=COALESCE($3,activo), orden=COALESCE($4,orden), updated_at=NOW() WHERE id=$1::bigint ${tenant && !tenant.isGlobalAdmin ? 'AND empresa_id=ANY($5::bigint[])' : ''} RETURNING id::text,empresa_id::text,codigo,nombre,activo,orden`, tenant && !tenant.isGlobalAdmin ? [id, input.nombre ?? null, input.activo ?? null, input.orden ?? null, tenant.empresaIds] : [id, input.nombre ?? null, input.activo ?? null, input.orden ?? null]);
  if (!result.rows[0]) throw new AppError('Área no encontrada', 404, 'NOMINA_AREA_NOT_FOUND');
  return result.rows[0];
}

export async function replaceNominaResponsibility(input: { usuarioId: string | number; empresaId: string | number; proceso: string; municipioIds?: Array<string | number>; areaIds?: Array<string | number> }, tenant?: TenantAccessContext) {
  const proceso = normalize(input.proceso); const empresaId = Number(input.empresaId);
  if (tenant && !tenant.isGlobalAdmin && !tenant.empresaIds.includes(empresaId)) throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const activo = proceso !== 'OPS' ? (proceso === 'COBERTURA' ? Boolean(input.municipioIds?.length) : Boolean(input.areaIds?.length)) : true;
    const row = await client.query<{ id: string }>(`INSERT INTO nomina_responsabilidades_usuario(usuario_id,empresa_id,proceso,activo) VALUES($1::bigint,$2::bigint,$3,$4) ON CONFLICT(usuario_id,empresa_id,proceso) DO UPDATE SET activo=$4,updated_at=NOW() RETURNING id::text`, [input.usuarioId, empresaId, proceso, activo]);
    const id = row.rows[0]!.id;
    await client.query('DELETE FROM nomina_responsabilidad_municipios WHERE responsabilidad_id=$1::bigint', [id]);
    await client.query('DELETE FROM nomina_responsabilidad_areas WHERE responsabilidad_id=$1::bigint', [id]);
    if (proceso === 'COBERTURA' && input.municipioIds?.length) await client.query('INSERT INTO nomina_responsabilidad_municipios(responsabilidad_id,municipio_id) SELECT $1::bigint,x FROM unnest($2::bigint[]) x', [id, input.municipioIds.map(Number)]);
    if (proceso === 'ASISTENCIA' && input.areaIds?.length) await client.query('INSERT INTO nomina_responsabilidad_areas(responsabilidad_id,area_id) SELECT $1::bigint,x FROM unnest($2::bigint[]) x', [id, input.areaIds.map(Number)]);
    await client.query('COMMIT'); return { id, proceso, empresa_id: empresaId };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function resolveNominaVinculacionArea(vinculacionId: string | number, fecha: string, tenant?: TenantAccessContext) {
  const result = await dbPool.query<{ area_id: number; codigo: string; nombre: string }>(`SELECT a.id area_id,a.codigo,a.nombre FROM nomina_vinculacion_areas va JOIN nomina_areas a ON a.id=va.area_id JOIN vinculaciones v ON v.id=va.vinculacion_id JOIN contratos c ON c.id=v.contrato_id WHERE va.vinculacion_id=$1::bigint AND va.activo=TRUE AND va.vigencia_desde <= $2::date AND (va.vigencia_hasta IS NULL OR va.vigencia_hasta >= $2::date) AND ($3::boolean OR c.empresa_id=ANY($4::bigint[])) ORDER BY va.vigencia_desde DESC,va.id DESC LIMIT 1`, [vinculacionId, fecha, tenant?.isGlobalAdmin ?? true, tenant?.empresaIds ?? []]);
  return result.rows[0] ?? null;
}

export async function assertNominaScope(input: { userId: string | number; empresaId: string | number; proceso: string; municipioId?: string | number; areaId?: string | number; tenant?: TenantAccessContext }): Promise<void> {
  const proceso = normalize(input.proceso);
  if (input.tenant && !input.tenant.isGlobalAdmin && !input.tenant.empresaIds.includes(Number(input.empresaId))) throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  const access = (await getNominaProcessAccess(input.userId, input.empresaId, input.tenant)).find((item) => item.proceso === proceso);
  if (!access?.responsable) throw new AppError('Usuario sin responsabilidad para este proceso', 403, 'NOMINA_RESPONSABILIDAD_FORBIDDEN');
  if (proceso === 'COBERTURA' && input.municipioId !== undefined && !access.municipios.includes(Number(input.municipioId))) throw new AppError('Municipio fuera del alcance de nómina', 403, 'NOMINA_MUNICIPIO_FORBIDDEN');
  if (proceso === 'ASISTENCIA' && input.areaId !== undefined && !access.areas.includes(Number(input.areaId))) throw new AppError('Área fuera del alcance de nómina', 403, 'NOMINA_AREA_FORBIDDEN');
}
