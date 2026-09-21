import { dbQuery } from '../../config/db';
import { AppError } from '../../utils/AppError';
import { registerAuditEntry } from '../auditoria/auditoria.helper';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { buildInstitutionManagersQuery, buildInstitutionPeriodsQuery, formatFocalizacionName } from './operacion.instituciones.query';

const focalizacionNombre = formatFocalizacionName;

export interface InstitucionesQuery {
  q: string;
  municipio_id: number | null;
  institucion_id: number | null;
  sede_id: number | null;
  modalidad_id: number | null;
  focalizacion_id: number | null;
  rector: string;
  gestor_id: number | null;
  estado: string;
  page: number;
  page_size: number;
  contrato_id: number | null;
}

type Row = Record<string, unknown>;
const num = (v: unknown): number | null => v === null || v === undefined ? null : Number(v);
const text = (v: unknown): string | null => v === null || v === undefined ? null : String(v);

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

async function columns(table: string): Promise<Set<string>> {
  const result = await dbQuery<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1", [table]);
  return new Set(result.rows.map((row) => row.column_name));
}


export async function listInstituciones(query: InstitucionesQuery, tenant: TenantAccessContext) {
  const contratoId = await resolveContractId(query.contrato_id, tenant);
  if (query.focalizacion_id !== null) {
    const focalizacion = await dbQuery<Row>(
      'SELECT fv.id FROM focalizacion_vigencias fv JOIN contratos c ON c.id=fv.contrato_id WHERE fv.id=$1::bigint AND fv.contrato_id=$2::bigint AND ($3::boolean OR c.empresa_id=ANY($4::bigint[]) OR fv.contrato_id=ANY($5::bigint[])) LIMIT 1',
      [query.focalizacion_id, contratoId, tenant.isGlobalAdmin, tenant.empresaIds, tenant.contratoIds]
    );
    if (!focalizacion.rows[0]) throw new AppError('La focalización seleccionada no existe para la empresa y contrato activos.', 404, 'FOCALIZACION_NOT_FOUND');
  }
  const [simat, institution, gestorTable] = await Promise.all([columns('operacion_simat_registros'), columns('instituciones'), columns('gestor_municipio_asignaciones')]);
  const rector = institution.has('rector') ? 'i.rector' : institution.has('rector_nombre') ? 'i.rector_nombre' : 'NULL::text';
  const tenantScope = tenant.isGlobalAdmin ? 'TRUE' : tenant.contratoIds.length ? 'ff.contrato_id=ANY($1::bigint[])' : 'c.empresa_id=ANY($1::bigint[])';
  const params: unknown[] = tenant.isGlobalAdmin ? [] : [tenant.contratoIds.length ? tenant.contratoIds : tenant.empresaIds];
  const add = (v: unknown) => { params.push(v); return params.length; };
  const contractP = add(contratoId), qP = add(query.q ? `%${query.q.trim()}%` : null), municipalityP = add(query.municipio_id), institutionP = add(query.institucion_id), siteP = add(query.sede_id), modalityP = add(query.modalidad_id), focalizacionP = add(query.focalizacion_id), rectorP = add(query.rector ? `%${query.rector.trim()}%` : null), managerP = add(query.gestor_id), stateP = add(query.estado || null);
  const manager = gestorTable.size ? `LEFT JOIN LATERAL (SELECT u.id::text AS id,u.nombre_completo AS nombre FROM gestor_municipio_asignaciones gma JOIN usuarios u ON u.id=gma.usuario_id WHERE gma.contrato_id=ff.contrato_id AND gma.municipio_id=COALESCE(fv.municipio_id,ff.municipio_id) AND COALESCE(gma.activo,TRUE) AND gma.vigencia_desde<=COALESCE(fv.vigente_desde,CURRENT_DATE) AND (gma.vigencia_hasta IS NULL OR gma.vigencia_hasta>=COALESCE(fv.vigente_desde,CURRENT_DATE)) ORDER BY gma.vigencia_desde DESC,gma.id DESC LIMIT 1) gestor ON TRUE` : 'LEFT JOIN LATERAL (SELECT NULL::text AS id,NULL::text AS nombre) gestor ON TRUE';
  const jornada = simat.has('jornada') ? `(SELECT osr.jornada FROM operacion_simat_registros osr WHERE osr.sede_id=ff.sede_id ${simat.has('modalidad_id') ? 'AND (osr.modalidad_id=ff.modalidad_id OR osr.modalidad_id IS NULL)' : ''} ORDER BY ${simat.has('id') ? 'osr.id DESC' : 'osr.sede_id'} LIMIT 1)` : 'NULL::text';
  const source = `FROM focalizacion_vigencias fv JOIN focalizacion_final ff ON ff.contrato_id=fv.contrato_id AND (ff.preliminar_id=fv.preliminar_id OR (ff.institucion_id=fv.institucion_id AND ff.sede_id=fv.sede_id AND ff.modalidad_id=fv.modalidad_id)) JOIN contratos c ON c.id=ff.contrato_id LEFT JOIN municipios mu ON mu.id=COALESCE(fv.municipio_id,ff.municipio_id) LEFT JOIN instituciones i ON i.id=ff.institucion_id LEFT JOIN sedes s ON s.id=ff.sede_id LEFT JOIN modalidades mo ON mo.id=ff.modalidad_id ${manager}`;
  const where = `WHERE ${tenantScope} AND ff.contrato_id=$${contractP}::bigint AND ($${qP}::text IS NULL OR CONCAT_WS(' ',i.nombre_institucion,s.nombre_sede,mu.nombre_municipio,COALESCE(${rector},''),COALESCE(gestor.nombre,''),ff.institucion_final,ff.sede_final) ILIKE $${qP}) AND ($${municipalityP}::bigint IS NULL OR COALESCE(fv.municipio_id,ff.municipio_id)=$${municipalityP}::bigint) AND ($${institutionP}::bigint IS NULL OR ff.institucion_id=$${institutionP}::bigint) AND ($${siteP}::bigint IS NULL OR ff.sede_id=$${siteP}::bigint) AND ($${modalityP}::bigint IS NULL OR ff.modalidad_id=$${modalityP}::bigint) AND ($${focalizacionP}::bigint IS NULL OR fv.id=$${focalizacionP}::bigint) AND ($${rectorP}::text IS NULL OR COALESCE(${rector},'') ILIKE $${rectorP}) AND ($${managerP}::bigint IS NULL OR gestor.id::bigint=$${managerP}::bigint) AND ($${stateP}::text IS NULL OR COALESCE(NULLIF(fv.cobertura_estado,''),CASE WHEN COALESCE(ff.activo,TRUE) THEN 'ACTIVA' ELSE 'INACTIVA' END)=$${stateP})`;
  const select = `SELECT ff.id::text id,ff.institucion_id::text institucion_id,COALESCE(ff.institucion_final,i.nombre_institucion) institucion,ff.sede_id::text sede_id,COALESCE(ff.sede_final,s.nombre_sede) sede,COALESCE(fv.municipio_id,ff.municipio_id)::text municipio_id,COALESCE(mu.nombre_municipio,ff.municipio_texto) municipio,ff.modalidad_id::text modalidad_id,COALESCE(ff.modalidad_final,mo.nombre_modalidad) modalidad,fv.id::text focalizacion_id,EXTRACT(YEAR FROM fv.vigente_desde)::int focalizacion_anio,EXTRACT(MONTH FROM fv.vigente_desde)::int focalizacion_mes,fv.vigente_desde,fv.vigente_hasta,fv.focalizacion_primaria matriculados_primaria,fv.focalizacion_secundaria matriculados_secundaria,fv.focalizacion_total matriculados_total_oficial,fv.techo_primaria cupos_primaria,fv.techo_secundaria cupos_secundaria,fv.techo_total cupos_total_oficial,COALESCE(NULLIF(fv.cobertura_estado,''),CASE WHEN COALESCE(ff.activo,TRUE) THEN 'ACTIVA' ELSE 'INACTIVA' END) estado,${rector} rector_nombre,gestor.id gestor_id,gestor.nombre gestor_nombre,${jornada} jornada,COALESCE(s.zona_sede,NULL::text) zona,COALESCE(ff.activo,TRUE) activo ${source} ${where}`;
  const count = await dbQuery<Row>(`SELECT COUNT(*)::int total,COUNT(DISTINCT ff.institucion_id)::int instituciones,COUNT(DISTINCT ff.sede_id)::int sedes,COALESCE(SUM(COALESCE(fv.techo_total,ff.cupos_aprobados,0)),0)::numeric cupos,COALESCE(SUM(COALESCE(fv.focalizacion_total,0)),0)::numeric matriculados ${source} ${where}`, params);
  const total = Number(count.rows[0]?.total ?? 0); const pageParams = [...params, query.page_size, (query.page - 1) * query.page_size];
  const rows = await dbQuery<Row>(`${select} ORDER BY institucion,sede,modalidad,fv.vigente_desde DESC,ff.id LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`, pageParams);
  const options = async (field: string, label: string) => (await dbQuery<Row>(`SELECT DISTINCT ${field}::text id,${label} nombre ${source} ${where} AND ${field} IS NOT NULL ORDER BY nombre`, params)).rows;
  const periodsQuery = buildInstitutionPeriodsQuery(source, tenantScope, contractP, params);
  const periods = (await dbQuery<Row>(periodsQuery.text, periodsQuery.params)).rows.map((row) => ({ id: String(row.focalizacion_id), nombre: formatFocalizacionName(row.anio, row.mes), anio: Number(row.anio), mes: Number(row.mes) }));
  const managersQuery = buildInstitutionManagersQuery(source, where, params);
  const managers = gestorTable.size ? (await dbQuery<Row>(managersQuery.text, managersQuery.params)).rows : [];
  const metric = (cupos: number | null, matricula: number | null) => cupos === null || matricula === null || matricula === 0 ? null : Number((cupos * 100 / matricula).toFixed(2));
  const items = rows.rows.map((row) => { const mp=num(row.matriculados_primaria), ms=num(row.matriculados_secundaria), mt=num(row.matriculados_total_oficial) ?? (mp ?? 0)+(ms ?? 0); const cp=num(row.cupos_primaria),cs=num(row.cupos_secundaria),ct=num(row.cupos_total_oficial) ?? (cp ?? 0)+(cs ?? 0); return { id:String(row.id), institucion_id:String(row.institucion_id), institucion:text(row.institucion), sede_id:String(row.sede_id), sede:text(row.sede), municipio_id:String(row.municipio_id), municipio:text(row.municipio), modalidad_id:String(row.modalidad_id), modalidad:text(row.modalidad), focalizacion:{id:String(row.focalizacion_id),nombre:focalizacionNombre(row.focalizacion_anio,row.focalizacion_mes),anio:Number(row.focalizacion_anio),mes:Number(row.focalizacion_mes)}, rector:row.rector_nombre?{nombre:String(row.rector_nombre)}:null, gestor:row.gestor_id?{id:String(row.gestor_id),nombre:text(row.gestor_nombre)}:null, matriculados:{primaria:mp,secundaria:ms,total:mt}, cupos:{primaria:cp,secundaria:cs,total:ct}, atencion:{primaria:metric(cp,mp),secundaria:metric(cs,ms),total:metric(ct,mt)}, total_oficial:{matriculados:num(row.matriculados_total_oficial),cupos:num(row.cupos_total_oficial)}, estado:text(row.estado)??'ACTIVA', activo:Boolean(row.activo), jornada:text(row.jornada), zona:text(row.zona), vigencia:{desde:text(row.vigente_desde),hasta:text(row.vigente_hasta)} }; });
  return { items, page:query.page, page_size:query.page_size, total, total_pages:Math.ceil(total/query.page_size), summary:{instituciones:Number(count.rows[0]?.instituciones??0),sedes:Number(count.rows[0]?.sedes??0),combinaciones:total,matriculados:Number(count.rows[0]?.matriculados??0),cupos:Number(count.rows[0]?.cupos??0)}, filter_options:{focalizaciones:periods,municipios:await options('COALESCE(fv.municipio_id,ff.municipio_id)','COALESCE(mu.nombre_municipio,ff.municipio_texto)'),instituciones:await options('ff.institucion_id','COALESCE(ff.institucion_final,i.nombre_institucion)'),sedes:await options('ff.sede_id','COALESCE(ff.sede_final,s.nombre_sede)'),modalidades:await options('ff.modalidad_id','COALESCE(ff.modalidad_final,mo.nombre_modalidad)'),rectores:await dbQuery<Row>(`SELECT DISTINCT ${rector}::text id,${rector}::text nombre ${source} ${where} AND ${rector} IS NOT NULL ORDER BY nombre`,params).then((r)=>r.rows),gestores:managers,estados:await dbQuery<Row>(`SELECT DISTINCT COALESCE(NULLIF(fv.cobertura_estado,''),CASE WHEN COALESCE(ff.activo,TRUE) THEN 'ACTIVA' ELSE 'INACTIVA' END) id,COALESCE(NULLIF(fv.cobertura_estado,''),CASE WHEN COALESCE(ff.activo,TRUE) THEN 'ACTIVA' ELSE 'INACTIVA' END) nombre ${source} ${where} ORDER BY nombre`,params).then((r)=>r.rows)}, contrato_id:contratoId };
}

export async function updateInstitucionFocalizacion(id:number,input:{matriculados_primaria?:number|null;matriculados_secundaria?:number|null;cupos_primaria?:number|null;cupos_secundaria?:number|null;estado?:string},tenant:TenantAccessContext,actor:number) {
  const beforeResult=await dbQuery<Row>('SELECT fv.* FROM focalizacion_vigencias fv JOIN contratos c ON c.id=fv.contrato_id WHERE fv.id=$1 AND ($2::boolean OR c.empresa_id=ANY($3::bigint[]) OR fv.contrato_id=ANY($4::bigint[]))',[id,tenant.isGlobalAdmin,tenant.empresaIds,tenant.contratoIds]); const before=beforeResult.rows[0]; if(!before)throw new AppError('Focalización no encontrada.',404,'FOCALIZACION_NOT_FOUND');
  const fields:string[]=[];const params:unknown[]=[id];const add=(field:string,value:unknown)=>{params.push(value);fields.push(`${field}=$${params.length}`)};
  if(input.matriculados_primaria!==undefined)add('focalizacion_primaria',input.matriculados_primaria);if(input.matriculados_secundaria!==undefined)add('focalizacion_secundaria',input.matriculados_secundaria);if(input.cupos_primaria!==undefined)add('techo_primaria',input.cupos_primaria);if(input.cupos_secundaria!==undefined)add('techo_secundaria',input.cupos_secundaria);if(input.matriculados_primaria!==undefined||input.matriculados_secundaria!==undefined)add('focalizacion_total',(input.matriculados_primaria??Number(before.focalizacion_primaria??0))+(input.matriculados_secundaria??Number(before.focalizacion_secundaria??0)));if(input.cupos_primaria!==undefined||input.cupos_secundaria!==undefined)add('techo_total',(input.cupos_primaria??Number(before.techo_primaria??0))+(input.cupos_secundaria??Number(before.techo_secundaria??0)));if(input.estado!==undefined)add('cobertura_estado',input.estado);if(!fields.length)return before;
  const updated=await dbQuery<Row>(`UPDATE focalizacion_vigencias SET ${fields.join(',')},updated_at=NOW() WHERE id=$1 RETURNING *`,params);await registerAuditEntry({accion:'UPDATE',tabla:'focalizacion_vigencias',registro_id:String(id),descripcion:'Actualización operativa de focalización mensual',contrato_id:String(before.contrato_id),usuario_id:String(actor),before,after:updated.rows[0]});return updated.rows[0];
}
