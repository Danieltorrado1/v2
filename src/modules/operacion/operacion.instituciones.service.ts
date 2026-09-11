import { dbQuery } from '../../config/db';
import { AppError } from '../../utils/AppError';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';

export interface InstitucionesQuery {
  q: string;
  municipio_id: number | null;
  institucion_id: number | null;
  sede_id: number | null;
  modalidad_id: number | null;
  page: number;
  page_size: number;
  contrato_id: number | null;
}

type Row = Record<string, unknown>;

const numberOrNull = (value: unknown): number | null => value === null || value === undefined ? null : Number(value);
const textOrNull = (value: unknown): string | null => value === null || value === undefined ? null : String(value);

async function resolveContractId(requested: number | null, tenant: TenantAccessContext): Promise<number> {
  if (requested !== null) {
    if (!tenant.isGlobalAdmin && tenant.contratoIds.length > 0 && !tenant.contratoIds.includes(requested)) throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
    const result = await dbQuery<Row>('SELECT c.id FROM contratos c WHERE c.id=$1::bigint AND COALESCE(c.activo, TRUE)=TRUE AND ($2::boolean OR $3::bigint[] IS NULL OR c.id=ANY($3::bigint[]) OR c.empresa_id=ANY($4::bigint[])) LIMIT 1', [requested, tenant.isGlobalAdmin, tenant.contratoIds.length ? tenant.contratoIds : null, tenant.empresaIds]);
    if (!result.rows[0]) throw new AppError('Contrato no autorizado', 403, 'TENANT_FORBIDDEN');
    return Number(result.rows[0].id);
  }
  const result = tenant.isGlobalAdmin
    ? await dbQuery<Row>('SELECT id FROM contratos WHERE COALESCE(activo, TRUE)=TRUE ORDER BY id ASC LIMIT 1')
    : tenant.contratoIds.length
      ? await dbQuery<Row>('SELECT id FROM contratos WHERE id=ANY($1::bigint[]) AND COALESCE(activo, TRUE)=TRUE ORDER BY id ASC LIMIT 1', [tenant.contratoIds])
      : await dbQuery<Row>('SELECT id FROM contratos WHERE empresa_id=ANY($1::bigint[]) AND COALESCE(activo, TRUE)=TRUE ORDER BY id ASC LIMIT 1', [tenant.empresaIds]);
  if (!result.rows[0]) throw new AppError('No hay contratos autorizados', 403, 'TENANT_CONTRACT_REQUIRED');
  return Number(result.rows[0].id);
}

export async function listInstituciones(query: InstitucionesQuery, tenant: TenantAccessContext) {
  const contratoId = await resolveContractId(query.contrato_id, tenant);
  const columns = await dbQuery<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='operacion_simat_registros'");
  const simatColumns = new Set(columns.rows.map((row) => row.column_name));
  const hasSimat = simatColumns.has('sede_id');
  const jornadaSql = hasSimat && simatColumns.has('jornada') ? `(SELECT osr.jornada FROM operacion_simat_registros osr WHERE osr.sede_id=ff.sede_id ${simatColumns.has('modalidad_id') ? 'AND (osr.modalidad_id=ff.modalidad_id OR osr.modalidad_id IS NULL)' : ''} ORDER BY ${simatColumns.has('id') ? 'osr.id DESC' : 'osr.sede_id'} LIMIT 1)` : 'NULL';
  const tenantSql = tenant.isGlobalAdmin ? 'TRUE' : tenant.contratoIds.length ? 'ff.contrato_id=ANY($1::bigint[])' : 'c.empresa_id=ANY($1::bigint[])';
  const baseParams: unknown[] = tenant.isGlobalAdmin ? [] : [tenant.contratoIds.length ? tenant.contratoIds : tenant.empresaIds];
  const contractParam = baseParams.length + 1;
  baseParams.push(contratoId);
  const qParam = baseParams.length + 1; baseParams.push(query.q ? `%${query.q}%` : null);
  const municipioParam = baseParams.length + 1; baseParams.push(query.municipio_id);
  const institucionParam = baseParams.length + 1; baseParams.push(query.institucion_id);
  const sedeParam = baseParams.length + 1; baseParams.push(query.sede_id);
  const modalidadParam = baseParams.length + 1; baseParams.push(query.modalidad_id);
  const where = `WHERE ${tenantSql} AND ff.contrato_id=$${contractParam}::bigint AND ($${qParam}::text IS NULL OR CONCAT_WS(' ', i.nombre_institucion, i.codigo_dane, s.nombre_sede, s.codigo_dane, s.consecutivo_sede, ff.institucion_final, ff.sede_final) ILIKE $${qParam}) AND ($${municipioParam}::bigint IS NULL OR ff.municipio_id=$${municipioParam}::bigint) AND ($${institucionParam}::bigint IS NULL OR ff.institucion_id=$${institucionParam}::bigint) AND ($${sedeParam}::bigint IS NULL OR ff.sede_id=$${sedeParam}::bigint) AND ($${modalidadParam}::bigint IS NULL OR ff.modalidad_id=$${modalidadParam}::bigint)`;
  const from = `FROM focalizacion_final ff INNER JOIN contratos c ON c.id=ff.contrato_id LEFT JOIN municipios mu ON mu.id=ff.municipio_id LEFT JOIN instituciones i ON i.id=ff.institucion_id LEFT JOIN sedes s ON s.id=ff.sede_id LEFT JOIN modalidades mo ON mo.id=ff.modalidad_id`;
  const rowSelect = `SELECT ff.id::text AS id, ff.institucion_id::text AS institucion_id, COALESCE(ff.institucion_final,i.nombre_institucion) AS institucion, ff.sede_id::text AS sede_id, COALESCE(ff.sede_final,s.nombre_sede) AS sede, ff.municipio_id::text AS municipio_id, COALESCE(mu.nombre_municipio,ff.municipio_texto) AS municipio, ff.modalidad_id::text AS modalidad_id, COALESCE(ff.modalidad_final,mo.nombre_modalidad) AS modalidad, ff.cupos_aprobados, ${jornadaSql} AS jornada, NULL::text AS zona, CASE WHEN COALESCE(ff.activo,TRUE) THEN 'Activa' ELSE 'Inactiva' END AS estado ${from} ${where}`;
  const countResult = await dbQuery<Row>(`SELECT COUNT(*)::int AS total, COUNT(DISTINCT ff.institucion_id)::int AS instituciones, COUNT(DISTINCT ff.sede_id)::int AS sedes, COALESCE(SUM(ff.cupos_aprobados),0)::numeric AS cupos ${from} ${where}`, baseParams);
  const total = Number(countResult.rows[0]?.total ?? 0);
  const offset = (query.page - 1) * query.page_size;
  const pageParams = [...baseParams, query.page_size, offset];
  const itemsResult = await dbQuery<Row>(`${rowSelect} ORDER BY institucion,sede,modalidad,ff.id LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`, pageParams);
  const options = async (field: string, label: string, extra = '') => (await dbQuery<Row>(`SELECT DISTINCT ${field}::text AS id, ${label} AS nombre ${from} ${where} AND ${field} IS NOT NULL ${extra} ORDER BY nombre`, baseParams)).rows.map((row) => ({ id: Number(row.id), nombre: String(row.nombre) }));
  return {
    items: itemsResult.rows.map((row) => ({ ...row, cupos: numberOrNull(row.cupos_aprobados) ?? 0, jornada: textOrNull(row.jornada) ?? '—', zona: textOrNull(row.zona) ?? '—' })),
    page: query.page, page_size: query.page_size, total, total_pages: Math.ceil(total / query.page_size),
    summary: { instituciones: Number(countResult.rows[0]?.instituciones ?? 0), sedes: Number(countResult.rows[0]?.sedes ?? 0), combinaciones: total, cupos: Number(countResult.rows[0]?.cupos ?? 0) },
    filter_options: { municipios: await options('ff.municipio_id', 'COALESCE(mu.nombre_municipio,ff.municipio_texto)'), instituciones: await options('ff.institucion_id', 'COALESCE(ff.institucion_final,i.nombre_institucion)'), sedes: await options('ff.sede_id', 'COALESCE(ff.sede_final,s.nombre_sede)'), modalidades: await options('ff.modalidad_id', 'COALESCE(ff.modalidad_final,mo.nombre_modalidad)') },
    contrato_id: contratoId
  };
}
