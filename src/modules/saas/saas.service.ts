import type { PoolClient, QueryResultRow } from 'pg';
import { dbPool, dbQuery } from '../../config/db';
import { assertTenantAccessForEmpresaId, type TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import { registerAuditEntry } from '../auditoria/auditoria.helper';

export type ModuleCode = string;
export interface EmpresaCapabilities {
  empresa: { id: number; nombre: string };
  organizacion: { id: number; nombre: string } | null;
  legacy: boolean;
  suscripcion: null | { id: number; estado: string; fecha_inicio: string; fecha_fin: string | null; plan: { id: number; codigo: string; nombre: string } };
  modulos: Record<ModuleCode, boolean>;
  modulos_habilitados: string[];
  modulos_deshabilitados: string[];
  modulos_plan: string[];
  overrides: Array<{ id: number; codigo: string; habilitado: boolean; motivo: string; fecha_inicio: string; fecha_fin: string | null }>;
}

interface CapabilityRow extends QueryResultRow {
  empresa_id: string; empresa_nombre: string; organizacion_id: string | null; organizacion_nombre: string | null;
  suscripcion_id: string | null; estado: string | null; fecha_inicio: string | null; fecha_fin: string | null;
  plan_id: string | null; plan_codigo: string | null; plan_nombre: string | null;
}

const number = (value: string | number) => Number(value);

export function resolveModuleFlags(input:{modules:Array<{codigo:string;activo:boolean;plan_habilitado:boolean|null}>;overrides:Array<{codigo:string;habilitado:boolean}>;legacy:boolean;subscriptionState:string|null}){
  const operational=input.legacy||input.subscriptionState==='ACTIVA'||input.subscriptionState==='PRUEBA';
  const flags:Record<string,boolean>={};
  for(const module of input.modules)flags[module.codigo]=module.activo&&(input.legacy||(operational&&module.plan_habilitado===true));
  for(const override of input.overrides)if(operational&&flags[override.codigo]!==undefined)flags[override.codigo]=override.habilitado;
  flags.DASHBOARD=true;flags.ADMINISTRACION=true;return flags;
}

export async function getEmpresaCapabilities(empresaId: number, tenant?: TenantAccessContext): Promise<EmpresaCapabilities> {
  assertTenantAccessForEmpresaId(tenant, empresaId);
  const header = await dbQuery<CapabilityRow>(`
    SELECT e.id::text empresa_id,e.nombre_empresa empresa_nombre,o.id::text organizacion_id,o.nombre organizacion_nombre,
      es.id::text suscripcion_id,es.estado,es.fecha_inicio::text,es.fecha_fin::text,
      p.id::text plan_id,p.codigo plan_codigo,p.nombre plan_nombre
    FROM empresas e LEFT JOIN organizaciones o ON o.id=e.organizacion_id
    LEFT JOIN LATERAL (
      SELECT x.* FROM empresa_suscripciones x WHERE x.empresa_id=e.id
        AND x.fecha_inicio<=CURRENT_DATE AND (x.fecha_fin IS NULL OR x.fecha_fin>=CURRENT_DATE)
      ORDER BY x.fecha_inicio DESC,x.id DESC LIMIT 1
    ) es ON TRUE LEFT JOIN planes p ON p.id=es.plan_id
    WHERE e.id=$1::bigint LIMIT 1`, [empresaId]);
  const row = header.rows[0];
  if (!row) throw new AppError('Empresa not found', 404, 'EMPRESA_NOT_FOUND');
  const modules = await dbQuery<{ codigo: string; activo: boolean; plan_habilitado: boolean | null }>(`
    SELECT m.codigo,m.activo,pm.habilitado plan_habilitado FROM modulos m
    LEFT JOIN plan_modulos pm ON pm.modulo_id=m.id AND pm.plan_id=$1::bigint
    ORDER BY m.orden,m.id`, [row.plan_id]);
  const overrides = await dbQuery<{ id: string; codigo: string; habilitado: boolean; motivo: string; fecha_inicio: string; fecha_fin: string | null }>(`
    SELECT emo.id::text,m.codigo,emo.habilitado,emo.motivo,emo.fecha_inicio::text,emo.fecha_fin::text
    FROM empresa_modulo_overrides emo INNER JOIN modulos m ON m.id=emo.modulo_id
    WHERE emo.empresa_id=$1::bigint AND emo.fecha_inicio<=CURRENT_DATE
      AND emo.fecha_fin IS NULL
    ORDER BY emo.fecha_inicio,emo.id`, [empresaId]);
  const legacy = row.suscripcion_id === null;
  const flags=resolveModuleFlags({modules:modules.rows,overrides:overrides.rows,legacy,subscriptionState:row.estado});
  const enabled = Object.keys(flags).filter((code) => flags[code]);
  return {
    empresa: { id: number(row.empresa_id), nombre: row.empresa_nombre },
    organizacion: row.organizacion_id ? { id: number(row.organizacion_id), nombre: row.organizacion_nombre ?? '' } : null,
    legacy,
    suscripcion: row.suscripcion_id && row.plan_id && row.plan_codigo && row.plan_nombre && row.estado && row.fecha_inicio ? {
      id: number(row.suscripcion_id), estado: row.estado, fecha_inicio: row.fecha_inicio, fecha_fin: row.fecha_fin,
      plan: { id: number(row.plan_id), codigo: row.plan_codigo, nombre: row.plan_nombre }
    } : null,
    modulos: flags, modulos_habilitados: enabled,
    modulos_deshabilitados: Object.keys(flags).filter((code) => !flags[code]),
    modulos_plan: modules.rows.filter((item) => item.plan_habilitado === true).map((item) => item.codigo),
    overrides: overrides.rows.map((item) => ({ ...item, id: number(item.id) }))
  };
}

export async function assertEmpresaModuleEnabled(empresaId: number, code: string, tenant?: TenantAccessContext) {
  const capabilities = await getEmpresaCapabilities(empresaId, tenant);
  if (capabilities.modulos[code] !== true) {
    throw new AppError('Module is not enabled for this company', 403, 'MODULE_NOT_ENABLED', { empresa_id: empresaId, modulo: code });
  }
  return capabilities;
}

export async function listModules() { return (await dbQuery('SELECT * FROM modulos ORDER BY orden,id')).rows; }
export async function listPlans() {
  return (await dbQuery(`SELECT p.*,COALESCE(json_agg(json_build_object('id',m.id,'codigo',m.codigo,'nombre',m.nombre,'habilitado',pm.habilitado) ORDER BY m.orden) FILTER (WHERE m.id IS NOT NULL),'[]') modulos FROM planes p LEFT JOIN plan_modulos pm ON pm.plan_id=p.id LEFT JOIN modulos m ON m.id=pm.modulo_id GROUP BY p.id ORDER BY p.orden,p.id`)).rows;
}

export async function listCompanySaasSummaries(tenant:TenantAccessContext){
  const where=tenant.isGlobalAdmin?'':tenant.empresaIds.length?'WHERE e.id=ANY($1::bigint[])':'WHERE FALSE';
  const params=tenant.isGlobalAdmin?[]:[tenant.empresaIds];
  return (await dbQuery(`SELECT e.id::text empresa_id,e.nombre_empresa,e.nit,o.nombre organizacion_nombre,
    COALESCE(p.nombre,'LEGACY / SIN PLAN CONFIGURADO') plan_nombre,
    COALESCE(es.estado,'LEGACY') estado_suscripcion,
    CASE WHEN es.id IS NULL THEN (SELECT COUNT(*)::int FROM modulos WHERE activo=TRUE)
      ELSE (SELECT COUNT(*)::int FROM modulos m WHERE m.activo=TRUE AND COALESCE((SELECT emo.habilitado FROM empresa_modulo_overrides emo WHERE emo.empresa_id=e.id AND emo.modulo_id=m.id AND emo.fecha_inicio<=CURRENT_DATE AND emo.fecha_fin IS NULL ORDER BY emo.fecha_inicio DESC,emo.id DESC LIMIT 1),(SELECT pm.habilitado FROM plan_modulos pm WHERE pm.plan_id=es.plan_id AND pm.modulo_id=m.id),FALSE)=TRUE) END modulos_activos
    FROM empresas e INNER JOIN organizaciones o ON o.id=e.organizacion_id
    LEFT JOIN LATERAL(SELECT x.* FROM empresa_suscripciones x WHERE x.empresa_id=e.id AND x.fecha_inicio<=CURRENT_DATE AND (x.fecha_fin IS NULL OR x.fecha_fin>=CURRENT_DATE) ORDER BY x.fecha_inicio DESC,x.id DESC LIMIT 1)es ON TRUE
    LEFT JOIN planes p ON p.id=es.plan_id ${where} ORDER BY e.nombre_empresa`,params)).rows;
}

export async function getCompanySaasHistory(empresaId:number,tenant?:TenantAccessContext){
  assertTenantAccessForEmpresaId(tenant,empresaId);
  const [subscriptions,overrides]=await Promise.all([
    dbQuery(`SELECT es.id::text,p.codigo plan_codigo,p.nombre plan_nombre,es.estado,es.fecha_inicio::text,es.fecha_fin::text,es.created_at FROM empresa_suscripciones es INNER JOIN planes p ON p.id=es.plan_id WHERE es.empresa_id=$1 ORDER BY es.fecha_inicio DESC,es.id DESC`,[empresaId]),
    dbQuery(`SELECT emo.id::text,m.codigo modulo_codigo,m.nombre modulo_nombre,emo.habilitado,emo.motivo,emo.fecha_inicio::text,emo.fecha_fin::text,emo.created_at FROM empresa_modulo_overrides emo INNER JOIN modulos m ON m.id=emo.modulo_id WHERE emo.empresa_id=$1 ORDER BY emo.fecha_inicio DESC,emo.id DESC`,[empresaId])
  ]);return{suscripciones:subscriptions.rows,overrides:overrides.rows};
}

type PlanInput = { codigo: string; nombre: string; descripcion?: string | null; precio_base?: number | null; moneda?: string | null; periodicidad?: string | null; activo?: boolean; orden?: number; modulo_ids?: number[] };
export async function savePlan(id: number | null, input: PlanInput, actorId: string) {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    if(id!==null){const used=await client.query<{codigo:string}>(`SELECT p.codigo FROM planes p WHERE p.id=$1 AND EXISTS(SELECT 1 FROM empresa_suscripciones es WHERE es.plan_id=p.id)`,[id]);if(used.rows[0]&&used.rows[0].codigo!==input.codigo.toUpperCase())throw new AppError('Plan code is immutable after subscription use',409,'PLAN_CODE_IMMUTABLE');}
    if(input.modulo_ids?.length){const active=await client.query<{total:number}>('SELECT COUNT(*)::int total FROM modulos WHERE id=ANY($1::bigint[]) AND activo=TRUE',[input.modulo_ids]);if(active.rows[0]?.total!==new Set(input.modulo_ids).size)throw new AppError('Only active modules can be assigned to a plan',409,'MODULE_INACTIVE');}
    const result = id === null
      ? await client.query<{ id: string }>(`INSERT INTO planes(codigo,nombre,descripcion,precio_base,moneda,periodicidad,activo,orden) VALUES(UPPER($1),$2,$3,$4,UPPER($5),$6,COALESCE($7,TRUE),COALESCE($8,0)) RETURNING id::text`,[input.codigo,input.nombre,input.descripcion??null,input.precio_base??null,input.moneda??null,input.periodicidad??null,input.activo,input.orden])
      : await client.query<{ id: string }>(`UPDATE planes SET codigo=UPPER($2),nombre=$3,descripcion=$4,precio_base=$5,moneda=UPPER($6),periodicidad=$7,activo=COALESCE($8,activo),orden=COALESCE($9,orden),updated_at=NOW() WHERE id=$1 RETURNING id::text`,[id,input.codigo,input.nombre,input.descripcion??null,input.precio_base??null,input.moneda??null,input.periodicidad??null,input.activo,input.orden]);
    const savedPlan = result.rows[0];
    if (!savedPlan) throw new AppError('Plan not found',404,'PLAN_NOT_FOUND');
    const planId = number(savedPlan.id);
    if (input.modulo_ids) {
      await client.query('DELETE FROM plan_modulos WHERE plan_id=$1',[planId]);
      if (input.modulo_ids.length) await client.query(`INSERT INTO plan_modulos(plan_id,modulo_id,habilitado) SELECT $1,x,TRUE FROM unnest($2::bigint[]) x`,[planId,input.modulo_ids]);
    }
    await registerAuditEntry({ client, usuario_id: actorId, accion: id ? 'UPDATE' : 'CREATE', tabla: 'planes', registro_id: String(planId), descripcion: id ? 'Actualización de plan SaaS' : 'Creación de plan SaaS', after: input });
    await client.query('COMMIT'); return (await listPlans()).find((p: any)=>number(p.id)===planId);
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function changeCompanyPlan(empresaId: number, planId: number, input: { estado: string; fecha_inicio: string; fecha_fin?: string | null }, actorId: string, tenant?: TenantAccessContext) {
  assertTenantAccessForEmpresaId(tenant, empresaId);
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const plan = await client.query('SELECT id FROM planes WHERE id=$1 AND activo=TRUE',[planId]);
    if (!plan.rows[0]) throw new AppError('Active plan not found',409,'PLAN_INACTIVE');
    const current=await client.query<{fecha_inicio:string}>('SELECT fecha_inicio::text FROM empresa_suscripciones WHERE empresa_id=$1 AND fecha_fin IS NULL ORDER BY fecha_inicio DESC LIMIT 1',[empresaId]);if(current.rows[0]&&input.fecha_inicio<=current.rows[0].fecha_inicio)throw new AppError('New subscription must start after current subscription',409,'SUBSCRIPTION_DATE_OVERLAP');
    await client.query(`UPDATE empresa_suscripciones SET fecha_fin=($2::date-1),updated_at=NOW() WHERE empresa_id=$1 AND fecha_fin IS NULL`,[empresaId,input.fecha_inicio]);
    const created = await client.query<{id:string}>(`INSERT INTO empresa_suscripciones(empresa_id,plan_id,estado,fecha_inicio,fecha_fin) VALUES($1,$2,$3,$4,$5) RETURNING id::text`,[empresaId,planId,input.estado,input.fecha_inicio,input.fecha_fin??null]);
    await registerAuditEntry({client,usuario_id:actorId,accion:'CHANGE_PLAN',tabla:'empresa_suscripciones',registro_id:created.rows[0]!.id,descripcion:'Cambio de plan empresarial',after:{empresaId,planId,...input}});
    await client.query('COMMIT'); return getEmpresaCapabilities(empresaId,tenant);
  } catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

export async function setCompanyOverride(empresaId:number,moduleId:number,input:{habilitado:boolean;motivo:string;fecha_inicio:string;fecha_fin?:string|null},actorId:string,tenant?:TenantAccessContext){
  assertTenantAccessForEmpresaId(tenant,empresaId); const client=await dbPool.connect();
  try{await client.query('BEGIN');const module=await client.query('SELECT id FROM modulos WHERE id=$1 AND activo=TRUE',[moduleId]);if(!module.rows[0])throw new AppError('Active module not found',409,'MODULE_INACTIVE');const current=await client.query<{fecha_inicio:string}>('SELECT fecha_inicio::text FROM empresa_modulo_overrides WHERE empresa_id=$1 AND modulo_id=$2 AND fecha_fin IS NULL',[empresaId,moduleId]);if(current.rows[0]&&input.fecha_inicio<=current.rows[0].fecha_inicio)throw new AppError('New override must start after current override',409,'OVERRIDE_DATE_OVERLAP');await client.query(`UPDATE empresa_modulo_overrides SET fecha_fin=($3::date-1),updated_at=NOW() WHERE empresa_id=$1 AND modulo_id=$2 AND fecha_fin IS NULL`,[empresaId,moduleId,input.fecha_inicio]);const created=await client.query<{id:string}>(`INSERT INTO empresa_modulo_overrides(empresa_id,modulo_id,habilitado,motivo,fecha_inicio,fecha_fin) VALUES($1,$2,$3,$4,$5,$6) RETURNING id::text`,[empresaId,moduleId,input.habilitado,input.motivo,input.fecha_inicio,input.fecha_fin??null]);await registerAuditEntry({client,usuario_id:actorId,accion:'MODULE_OVERRIDE',tabla:'empresa_modulo_overrides',registro_id:created.rows[0]!.id,descripcion:'Override de módulo empresarial',after:{empresaId,moduleId,...input}});await client.query('COMMIT');return getEmpresaCapabilities(empresaId,tenant);}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

export async function clearCompanyOverride(empresaId:number,moduleId:number,actorId:string,tenant?:TenantAccessContext){assertTenantAccessForEmpresaId(tenant,empresaId);const result=await dbQuery<{id:string}>(`UPDATE empresa_modulo_overrides SET fecha_fin=CURRENT_DATE,updated_at=NOW() WHERE empresa_id=$1 AND modulo_id=$2 AND fecha_fin IS NULL RETURNING id::text`,[empresaId,moduleId]);if(result.rows[0])await registerAuditEntry({usuario_id:actorId,accion:'CLEAR_OVERRIDE',tabla:'empresa_modulo_overrides',registro_id:result.rows[0].id,descripcion:'Retorno a configuración del plan'});return getEmpresaCapabilities(empresaId,tenant);}
