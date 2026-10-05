import type { PoolClient, QueryResultRow } from 'pg';
import { dbPool, dbQuery } from '../../config/db';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { assertTenantAccessForVinculacionId } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import { registerAuditEntry, type AuditRequestMeta } from '../auditoria/auditoria.helper';
import type { CreateCambioOperativoInput, UpdateCambioOperativoInput } from './cambios-operativos.schemas';
import { assertNominaEmpleadoEditable, invalidateNominaEmpleadoRevisionState } from './nomina.operativa';
import { assertNominaEmpleadoCoberturaScope } from './nomina.procesos';
import { resolverTramosOperativos, type CambioOperativoDerivable, type ContextoOperativo } from './nomina.tramos';
import { publicarEventoOutbox } from '../integracion/integracion.service';
import { persistCanonicalAssignmentVersion as persistCanonicalAssignmentVersionCentral } from '../cobertura/cobertura-asignacion.service';
import { nominaPoblacionRepository } from './infrastructure/repositories/nomina-poblacion.repository';
import { resolveOperationalContextTimeline } from '../integracion/contexto-laboral.service';
import { contractModalityContext,contractModalityOptions } from '../cobertura/modalidad-contract-catalog';
import { previewModalityChange } from './modalidad-change-preview';

interface BaseRow extends QueryResultRow { periodo_inicio: string; periodo_fin: string; periodo_estado: string; contrato_id: string; nomina_empleado_id: string; estado_nomina: string | null; vinculacion_inicio: string; vinculacion_fin: string | null; contexto: ContextoOperativo | null; }
interface CambioRow extends QueryResultRow { id: string; periodo_id: string; nomina_empleado_id: string; vinculacion_id: string; fecha_inicio_efectiva: string; fecha_fin_efectiva: string | null; tipo: string; contexto_anterior: ContextoOperativo; contexto_nuevo: ContextoOperativo; motivo: string; regla_fecha_efectiva: string; activo: boolean; created_at: string; updated_at: string; }
const selectCambio = `SELECT nm.id::text,nm.periodo_id::text,nm.nomina_empleado_id::text,nm.vinculacion_id::text,nm.fecha::text fecha_inicio_efectiva,nm.fecha_fin_efectiva::text,nm.tipo_movimiento tipo,nm.contexto_anterior,nm.contexto_nuevo,nm.motivo_operativo motivo,nm.regla_fecha_efectiva,nm.activo,nm.created_at,nm.updated_at FROM nomina_movimientos nm`;

const loadBase = async (periodoId: string, vinculacionId: string, client?: PoolClient): Promise<BaseRow> => {
  const runner = client ?? dbPool;
  const result = await runner.query<BaseRow>(`SELECT np.fecha_inicio::text periodo_inicio,np.fecha_fin::text periodo_fin,np.estado periodo_estado,np.contrato_id::text,ne.id::text nomina_empleado_id,ne.estado estado_nomina,v.fecha_inicio::text vinculacion_inicio,v.fecha_fin::text vinculacion_fin,COALESCE(ncob.contexto,jsonb_strip_nulls(jsonb_build_object('municipio_id',ff.municipio_id::text,'municipio',mu.nombre_municipio,'institucion_id',ff.institucion_id::text,'institucion',ff.institucion_final,'sede_id',ff.sede_id::text,'sede',ff.sede_final,'modalidad_id',ff.modalidad_id::text,'modalidad',ff.modalidad_final,'cargo_operativo_id',v.cargo_operativo_id::text,'ubicacion_laboral_id',pal.ubicacion_laboral_id::text,'cobertura_asignacion_id',ca.id::text,'categoria_id',ne.categoria_salarial_id::text,'condicion_economica_id',vce.id::text))) contexto FROM nomina_periodos np JOIN nomina_empleados ne ON ne.periodo_id=np.id AND ne.vinculacion_id=$2::bigint JOIN vinculaciones v ON v.id=ne.vinculacion_id LEFT JOIN nomina_contextos_operativos_base ncob ON ncob.periodo_id=np.id AND ncob.nomina_empleado_id=ne.id LEFT JOIN LATERAL(SELECT ca1.* FROM cobertura_asignaciones ca1 WHERE ca1.vinculacion_id=v.id AND ca1.activo=TRUE AND ca1.fecha_inicio<=np.fecha_fin AND (ca1.fecha_fin IS NULL OR ca1.fecha_fin>=np.fecha_inicio) ORDER BY ca1.fecha_inicio DESC,ca1.id DESC LIMIT 1)ca ON TRUE LEFT JOIN focalizacion_final ff ON ff.id=ca.focalizacion_final_id LEFT JOIN municipios mu ON mu.id=COALESCE(ff.municipio_id,ca.municipio_id) LEFT JOIN LATERAL(SELECT pal1.* FROM personal_asignaciones_laborales pal1 WHERE pal1.vinculacion_id=v.id AND pal1.estado<>'ANULADA' AND pal1.vigencia_desde<=np.fecha_fin AND (pal1.vigencia_hasta IS NULL OR pal1.vigencia_hasta>=np.fecha_inicio) ORDER BY pal1.vigencia_desde DESC,pal1.id DESC LIMIT 1)pal ON TRUE LEFT JOIN LATERAL(SELECT vce1.* FROM vinculacion_condiciones_economicas vce1 WHERE vce1.vinculacion_id=v.id AND vce1.activo=TRUE AND vce1.vigencia_desde<=np.fecha_fin AND (vce1.vigencia_hasta IS NULL OR vce1.vigencia_hasta>=np.fecha_inicio) ORDER BY vce1.vigencia_desde DESC,vce1.id DESC LIMIT 1)vce ON TRUE WHERE np.id=$1::bigint AND COALESCE(ne.activo,TRUE)=TRUE`, [periodoId, vinculacionId]);
  const row = result.rows[0];
  if (!row) throw new AppError('Persona fuera del snapshot del periodo', 404, 'NOMINA_CAMBIO_PERSONA_FUERA_SNAPSHOT');
  return row;
};
const assertOpen = (estado: string) => { if (estado !== 'ABIERTO') throw new AppError('Periodo cerrado: registre una correccion de nomina', 409, 'NOMINA_CAMBIO_PERIODO_CERRADO'); };

const validateContext = async (context: ContextoOperativo, contratoId: string, client: PoolClient, modalityChange=false) => {
  if (modalityChange) return {...context,...await contractModalityContext(client,contratoId,context)};
  if (!context.institucion_id || !context.sede_id || !context.modalidad_id) {
    throw new AppError('Institucion, sede y modalidad son obligatorias', 400, 'NOMINA_CAMBIO_CONTEXTO_REQUERIDO');
  }
  if (context.institucion_id) {
    const r = await client.query('SELECT 1 FROM instituciones WHERE id=$1::bigint AND contrato_id=$2::bigint AND COALESCE(activo,TRUE)=TRUE', [context.institucion_id, contratoId]);
    if (!r.rowCount) throw new AppError('Institucion no pertenece al contrato', 409, 'NOMINA_CAMBIO_CONTEXTO_INVALIDO');
  }
  if (context.sede_id) {
    const r = await client.query('SELECT 1 FROM sedes s JOIN instituciones i ON i.id=s.institucion_id WHERE s.id=$1::bigint AND i.contrato_id=$2::bigint AND ($3::bigint IS NULL OR s.institucion_id=$3::bigint) AND ($4::bigint IS NULL OR s.municipio_id=$4::bigint) AND COALESCE(s.activo,TRUE)=TRUE', [context.sede_id, contratoId, context.institucion_id ?? null, context.municipio_id ?? null]);
    if (!r.rowCount) throw new AppError('Sede incompatible con institucion/municipio/contrato', 409, 'NOMINA_CAMBIO_CONTEXTO_INVALIDO');
  }
  if (context.modalidad_id) {
    const r = await client.query('SELECT 1 FROM modalidades WHERE id=$1::bigint AND COALESCE(activo,TRUE)=TRUE', [context.modalidad_id]);
    if (!r.rowCount) throw new AppError('Modalidad inexistente', 409, 'NOMINA_CAMBIO_CONTEXTO_INVALIDO');
    if (context.sede_id) {
      const sm = await client.query('SELECT 1 FROM sede_modalidades WHERE contrato_id=$1::bigint AND sede_id=$2::bigint AND modalidad_id=$3::bigint AND COALESCE(activo,TRUE)=TRUE', [contratoId, context.sede_id, context.modalidad_id]);
      if (!sm.rowCount) throw new AppError('Modalidad incompatible con sede', 409, 'NOMINA_CAMBIO_CONTEXTO_INCOMPATIBLE');
    }
  }
  const option = await client.query<ContextoOperativo & QueryResultRow>(`
    SELECT ff.municipio_id::text, COALESCE(mu.nombre_municipio,ff.municipio_texto) municipio,
      ff.institucion_id::text, ff.institucion_final institucion,
      ff.sede_id::text, ff.sede_final sede, ff.modalidad_id::text, ff.modalidad_final modalidad
    FROM focalizacion_final ff LEFT JOIN municipios mu ON mu.id=ff.municipio_id
    WHERE ff.contrato_id=$1::bigint AND ff.institucion_id=$2::bigint
      AND ff.sede_id=$3::bigint AND ff.modalidad_id=$4::bigint AND COALESCE(ff.activo,TRUE)=TRUE
    ORDER BY ff.id DESC LIMIT 1`, [contratoId, context.institucion_id, context.sede_id, context.modalidad_id]);
  if (!option.rows[0]) throw new AppError('La combinacion no pertenece al catalogo operativo del contrato', 409, 'NOMINA_CAMBIO_CONTEXTO_INVALIDO');
  return { ...context, ...option.rows[0] };
};

const listRows = async (periodoId: string, vinculacionId: string, client?: PoolClient): Promise<CambioRow[]> => (await (client ?? dbPool).query<CambioRow>(`${selectCambio} WHERE nm.periodo_id=$1::bigint AND nm.vinculacion_id=$2::bigint AND nm.familia_movimiento='CAMBIO_OPERATIVO' AND nm.activo=TRUE ORDER BY nm.fecha,nm.id`, [periodoId, vinculacionId])).rows;
const persistCanonicalAssignmentVersion = persistCanonicalAssignmentVersionCentral;
const resolveTramoCategory = async(client:Pick<PoolClient,'query'>,contratoId:string,modalidad:string|null,inicio:string,fin:string) => {
  const rows=(await client.query<{id:string}>(`SELECT id::text FROM nomina_categorias_salariales
    WHERE contrato_id=$1::bigint AND COALESCE(activo,TRUE) AND LOWER(BTRIM(modalidad))=LOWER(BTRIM($2))
    AND (vigente_desde IS NULL OR vigente_desde<=$3::date) AND (vigente_hasta IS NULL OR vigente_hasta>=$4::date)`,
    [contratoId,modalidad,inicio,fin])).rows;
  return {categoria_id:rows.length===1?rows[0]!.id:null,estado_salarial:rows.length===1?'RESUELTO':'REQUIERE_REVISION_SALARIAL'};
};
const derive = async (periodoId: string, vinculacionId: string, client?: PoolClient) => {
  const base = await loadBase(periodoId, vinculacionId, client);
  if (!base.contexto) throw new AppError('Falta snapshot de contexto operativo base', 409, 'NOMINA_CAMBIO_SNAPSHOT_BASE_REQUERIDO');
  {
    const canonicalClient=client??dbPool;
    const columns = await canonicalClient.query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='cobertura_asignaciones'`);
    const available = new Set(columns.rows.map((row) => row.column_name));
    if (['contrato_id', 'focalizacion_final_id', 'institucion', 'sede', 'modalidad'].every((column) => available.has(column))) {
      const company = await canonicalClient.query<{ empresa_id: string }>('SELECT empresa_id::text FROM contratos WHERE id=$1::bigint', [base.contrato_id]);
      const canonical = await resolveOperationalContextTimeline({ empresaId: Number(company.rows[0]?.empresa_id), contratoId: Number(base.contrato_id), vinculacionId: Number(vinculacionId), fechaInicio: base.vinculacion_inicio>base.periodo_inicio?base.vinculacion_inicio:base.periodo_inicio, fechaFin: base.vinculacion_fin && base.vinculacion_fin<base.periodo_fin?base.vinculacion_fin:base.periodo_fin }, canonicalClient);
      if (canonical.huecos.length) throw new AppError('La línea temporal canónica tiene huecos', 409, 'ASIGNACION_OPERATIVA_HUECO');
      if (client) await invalidateNominaEmpleadoRevisionState(client, base.nomina_empleado_id);
      if (canonical.tramos.length) return Promise.all(canonical.tramos.map(async (row, index) => ({ fecha_inicio: row.fecha_inicio, fecha_fin: row.fecha_fin ?? base.periodo_fin, dias: Math.floor((new Date(`${row.fecha_fin ?? base.periodo_fin}T00:00:00Z`).valueOf() - new Date(`${row.fecha_inicio}T00:00:00Z`).valueOf()) / 86_400_000) + 1, contexto: { municipio_id: row.municipio_id == null ? null : String(row.municipio_id), municipio: row.municipio, institucion_id: row.institucion_id == null ? null : String(row.institucion_id), institucion: row.institucion, sede_id: row.sede_id == null ? null : String(row.sede_id), sede: row.sede, modalidad_id: row.modalidad_id == null ? null : String(row.modalidad_id), modalidad: row.modalidad, cobertura_asignacion_id: String(row.id), ...await resolveTramoCategory(canonicalClient,base.contrato_id,row.modalidad,row.fecha_inicio,row.fecha_fin??base.periodo_fin) }, movimiento_origen_id: index === 0 ? null : String(row.id) })));
    }
  }
  const cambios = await listRows(periodoId, vinculacionId, client);
  if (client) await invalidateNominaEmpleadoRevisionState(client, base.nomina_empleado_id);
  return resolverTramosOperativos({ periodo_inicio: base.periodo_inicio, periodo_fin: base.periodo_fin, vinculacion_inicio: base.vinculacion_inicio, vinculacion_fin: base.vinculacion_fin, contexto_base: base.contexto, cambios: cambios.map((r): CambioOperativoDerivable => ({ id:r.id,fecha_inicio_efectiva:r.fecha_inicio_efectiva,fecha_fin_efectiva:r.fecha_fin_efectiva,contexto_anterior:r.contexto_anterior,contexto_nuevo:r.contexto_nuevo,activo:r.activo })) });
};

export const listarCambiosOperativos = async (q:{periodo_id:string;vinculacion_id?:string;activo?:boolean}, tenant?:TenantAccessContext) => {
  if (q.vinculacion_id) await assertTenantAccessForVinculacionId(tenant,q.vinculacion_id);
  const params:unknown[]=[q.periodo_id]; const clauses=[`nm.periodo_id=$1::bigint`,`nm.familia_movimiento='CAMBIO_OPERATIVO'`];
  if(q.vinculacion_id){params.push(q.vinculacion_id);clauses.push(`nm.vinculacion_id=$${params.length}::bigint`);} if(q.activo!==undefined){params.push(q.activo);clauses.push(`nm.activo=$${params.length}`);}
  if(tenant&&!tenant.isGlobalAdmin){if(tenant.contratoIds.length){params.push(tenant.contratoIds);clauses.push(`np.contrato_id=ANY($${params.length}::bigint[])`);}else{params.push(tenant.empresaIds);clauses.push(`ct.empresa_id=ANY($${params.length}::bigint[])`);}}
  return (await dbQuery<CambioRow>(`${selectCambio} JOIN nomina_periodos np ON np.id=nm.periodo_id JOIN contratos ct ON ct.id=np.contrato_id WHERE ${clauses.join(' AND ')} ORDER BY nm.fecha,nm.id`,params)).rows;
};
export const obtenerCambioOperativo = async(id:string,tenant?:TenantAccessContext)=>{const r=(await dbQuery<CambioRow>(`${selectCambio} WHERE nm.id=$1::bigint AND nm.familia_movimiento='CAMBIO_OPERATIVO'`,[id])).rows[0];if(!r)throw new AppError('Cambio operativo no encontrado',404,'NOMINA_CAMBIO_NOT_FOUND');await assertTenantAccessForVinculacionId(tenant,r.vinculacion_id);return r;};
export const resolverTramos = async(periodoId:string,vinculacionId:string,tenant?:TenantAccessContext)=>{await assertTenantAccessForVinculacionId(tenant,vinculacionId);return derive(periodoId,vinculacionId);};
export const resolverContextoFecha = async(periodoId:string,vinculacionId:string,fecha:string,tenant?:TenantAccessContext)=>{const tramos=await resolverTramos(periodoId,vinculacionId,tenant);const tramo=tramos.find(t=>t.fecha_inicio<=fecha&&t.fecha_fin>=fecha);if(!tramo)throw new AppError('Fecha fuera del rango operativo',404,'NOMINA_CONTEXTO_FECHA_FUERA_RANGO');return tramo;};

export const previewCambioModalidad = async(input: import('./modalidad-change-preview').ModalityPreviewInput,tenant?:TenantAccessContext) => {
  await assertTenantAccessForVinculacionId(tenant,input.vinculacion_id);
  await assertNominaEmpleadoCoberturaScope(input.nomina_empleado_id,tenant,dbPool as unknown as PoolClient);
  return previewModalityChange(dbPool,input);
};

export const opcionesCambioModalidad = async(periodoId:string,vinculacionId:string,tenant?:TenantAccessContext) => {
  await assertTenantAccessForVinculacionId(tenant,vinculacionId);
  const base=await loadBase(periodoId,vinculacionId);
  await assertNominaEmpleadoCoberturaScope(base.nomina_empleado_id,tenant,dbPool as unknown as PoolClient);
  return contractModalityOptions(dbPool,base.contrato_id);
};

export const crearCambioOperativo = async(input:CreateCambioOperativoInput,actor:string,tenant?:TenantAccessContext,meta?:AuditRequestMeta)=>{
  await assertTenantAccessForVinculacionId(tenant,input.vinculacion_id);
  const client=await dbPool.connect();
  try {
    await client.query('BEGIN');
    // Serialize changes for this identity, including an identical retry.
    await client.query('SELECT id FROM vinculaciones WHERE id=$1::bigint FOR UPDATE',[input.vinculacion_id]);
    const base=await loadBase(input.periodo_id,input.vinculacion_id,client);
    assertOpen(base.periodo_estado);
    assertNominaEmpleadoEditable({estado:base.estado_nomina},'registrar cambios operativos');
    if(base.nomina_empleado_id!==input.nomina_empleado_id) throw new AppError('Empleado no corresponde a vinculación',409,'NOMINA_CAMBIO_EMPLEADO_INVALIDO');
    await assertNominaEmpleadoCoberturaScope(base.nomina_empleado_id,tenant,client);
    const effective=new Date(`${input.fecha_inicio_efectiva}T00:00:00Z`);
    if(input.regla_fecha_efectiva==='DIA_SIGUIENTE') effective.setUTCDate(effective.getUTCDate()+1);
    const fecha=effective.toISOString().slice(0,10);
    let preview:Awaited<ReturnType<typeof previewModalityChange>>|undefined;
    if(input.tipo==='CAMBIO_DE_MODALIDAD') {
      // Period state locks prevent a close racing the transaction.
      await client.query('SELECT id FROM nomina_periodos WHERE contrato_id=$1::bigint ORDER BY id FOR UPDATE',[base.contrato_id]);
      const duplicate=(await listRows(input.periodo_id,input.vinculacion_id,client)).find(row=>
        row.tipo===input.tipo && row.fecha_inicio_efectiva===fecha
        && row.contexto_nuevo.modalidad_id===input.contexto_nuevo.modalidad_id
        && row.contexto_nuevo.sede_id===input.contexto_nuevo.sede_id
        && row.contexto_nuevo.institucion_id===input.contexto_nuevo.institucion_id);
      if(duplicate) { await client.query('COMMIT'); return duplicate; }
      if(input.fecha_fin_efectiva) throw new AppError('La nueva versión conserva el fin de la vigencia actual',409,'ASIGNACION_FIN_INVALIDO');
      preview=await previewModalityChange(client,{...input,fecha_inicio_efectiva:fecha});
      if(!input.preview_revision || input.preview_revision!==preview.revision) throw new AppError('Confirma una vista previa vigente',409,'ASIGNACION_PREVIEW_DESACTUALIZADO');
      if(preview.sin_cambio) throw new AppError('La modalidad ya está vigente',409,'ASIGNACION_SIN_CAMBIO');
      input.contexto_anterior={...input.contexto_anterior,...preview.anterior};
      input.contexto_nuevo={...input.contexto_nuevo,...preview.nuevo,
        categoria_id:preview.categoria_propuesta?.id??null,
        estado_salarial:preview.estado_salarial};
    } else input.contexto_nuevo=await validateContext(input.contexto_nuevo,base.contrato_id,client);
    await client.query(`INSERT INTO nomina_contextos_operativos_base(periodo_id,nomina_empleado_id,vinculacion_id,contexto,created_by)
      VALUES($1,$2,$3,$4::jsonb,$5) ON CONFLICT(periodo_id,nomina_empleado_id) DO NOTHING`,
      [input.periodo_id,input.nomina_empleado_id,input.vinculacion_id,JSON.stringify(base.contexto),actor]);
    const inserted=await client.query<{id:string}>(`INSERT INTO nomina_movimientos
      (periodo_id,nomina_empleado_id,vinculacion_id,fecha,fecha_fin_efectiva,tipo_movimiento,familia_movimiento,estado,
      descripcion,cantidad,valor_unitario,valor_total,valor_calculado,es_devengado,es_deduccion,afecta_seguridad_social,
      activo,contexto_anterior,contexto_nuevo,motivo_operativo,regla_fecha_efectiva,municipio_id,institucion_id,sede_id,modalidad_id,tarifa_config_id,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,'CAMBIO_OPERATIVO','PENDIENTE',$7,1,0,0,0,FALSE,FALSE,FALSE,TRUE,$8::jsonb,$9::jsonb,$7,$10,$11,$12,$13,$14,$15,$16) RETURNING id::text`,
      [input.periodo_id,input.nomina_empleado_id,input.vinculacion_id,fecha,input.fecha_fin_efectiva??null,input.tipo,input.motivo,
      JSON.stringify(input.contexto_anterior),JSON.stringify(input.contexto_nuevo),input.regla_fecha_efectiva,
      input.contexto_nuevo.municipio_id??null,input.contexto_nuevo.institucion_id??null,input.contexto_nuevo.sede_id??null,
      input.contexto_nuevo.modalidad_id??null,input.contexto_nuevo.tarifa_config_id??null,actor]);
    await persistCanonicalAssignmentVersion(client,{contratoId:base.contrato_id,vinculacionId:input.vinculacion_id,
      fechaDesde:fecha,fechaHasta:preview?.nueva_vigencia.hasta,contexto:input.contexto_nuevo,actor,motivo:input.motivo,strictTemporal:Boolean(preview)});
    const openPeriods=preview?.periodos_abiertos.map(row=>row.id)??[input.periodo_id];
    for(const periodoId of openPeriods) {
      await nominaPoblacionRepository.repairOperationalSnapshots({periodoId,actorUserId:actor,vinculacionId:input.vinculacion_id},client);
      if ((await client.query<{exists:boolean}>(`SELECT to_regclass('public.nomina_liquidaciones') IS NOT NULL AS exists`)).rows[0]?.exists) await client.query(`UPDATE nomina_liquidaciones SET requiere_recalculo=TRUE
        WHERE periodo_id=$1::bigint AND vinculacion_id=$2::bigint
        AND EXISTS(SELECT 1 FROM nomina_periodos WHERE id=$1::bigint AND estado='ABIERTO')`,[periodoId,input.vinculacion_id]);
    }
    await publicarEventoOutbox(client,{event_type:'ASIGNACION_OPERATIVA_CAMBIADA',aggregate_type:'vinculacion',aggregate_id:input.vinculacion_id,
      empresa_id:Number(preview?.empresa_id??(await client.query<{empresa_id:string}>('SELECT empresa_id::text FROM contratos WHERE id=$1::bigint',[base.contrato_id])).rows[0]?.empresa_id),
      contrato_id:Number(base.contrato_id),persona_id:null,vinculacion_id:Number(input.vinculacion_id),effective_date:fecha,
      before:input.contexto_anterior,after:preview?{...input.contexto_nuevo,origen:'INSTITUCIONES_MODALIDAD_VIGENCIA'}:input.contexto_nuevo,
      idempotency_key:preview?`modalidad-version:${inserted.rows[0]!.id}`:undefined});
    await derive(input.periodo_id,input.vinculacion_id,client);
    const id=inserted.rows[0]!.id;
    await registerAuditEntry({accion:'CREATE',tabla:'nomina_movimientos',registro_id:id,descripcion:input.motivo,after:input,usuario_id:actor,client,...meta});
    await client.query('COMMIT');
    return obtenerCambioOperativo(id,tenant);
  } catch(e) { await client.query('ROLLBACK');throw e; } finally {client.release();}
};

export const actualizarCambioOperativo=async(id:string,input:UpdateCambioOperativoInput,actor:string,tenant?:TenantAccessContext,meta?:AuditRequestMeta)=>{const before=await obtenerCambioOperativo(id,tenant);if(before.tipo==='CAMBIO_DE_MODALIDAD')throw new AppError('Registra una nueva versión temporal; el historial es inmutable',409,'ASIGNACION_HISTORIAL_INMUTABLE');const merged={...before,...input};const client=await dbPool.connect();try{await client.query('BEGIN');const base=await loadBase(before.periodo_id,before.vinculacion_id,client);assertOpen(base.periodo_estado);assertNominaEmpleadoEditable({ estado: base.estado_nomina }, 'editar cambios operativos');await assertNominaEmpleadoCoberturaScope(base.nomina_empleado_id,tenant,client);merged.contexto_nuevo=await validateContext(merged.contexto_nuevo,base.contrato_id,client);const effective=merged.regla_fecha_efectiva==='DIA_SIGUIENTE'?new Date(`${merged.fecha_inicio_efectiva}T00:00:00Z`):null;if(effective)effective.setUTCDate(effective.getUTCDate()+1);const fecha=effective?effective.toISOString().slice(0,10):merged.fecha_inicio_efectiva;await client.query(`UPDATE nomina_movimientos SET fecha=$2,fecha_fin_efectiva=$3,tipo_movimiento=$4,contexto_anterior=$5::jsonb,contexto_nuevo=$6::jsonb,motivo_operativo=$7,descripcion=$7,regla_fecha_efectiva=$8,municipio_id=$9,institucion_id=$10,sede_id=$11,modalidad_id=$12,tarifa_config_id=$13,updated_by=$14,updated_at=NOW() WHERE id=$1`,[id,fecha,merged.fecha_fin_efectiva,merged.tipo,JSON.stringify(merged.contexto_anterior),JSON.stringify(merged.contexto_nuevo),merged.motivo,merged.regla_fecha_efectiva,merged.contexto_nuevo.municipio_id??null,merged.contexto_nuevo.institucion_id??null,merged.contexto_nuevo.sede_id??null,merged.contexto_nuevo.modalidad_id??null,merged.contexto_nuevo.tarifa_config_id??null,actor]);await derive(before.periodo_id,before.vinculacion_id,client);await registerAuditEntry({accion:'UPDATE',tabla:'nomina_movimientos',registro_id:id,descripcion:merged.motivo,before,after:merged,usuario_id:actor,client,...meta});await client.query('COMMIT');return obtenerCambioOperativo(id,tenant);}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}};
export const desactivarCambioOperativo=async(id:string,motivo:string,actor:string,tenant?:TenantAccessContext,meta?:AuditRequestMeta)=>{const before=await obtenerCambioOperativo(id,tenant);if(before.tipo==='CAMBIO_DE_MODALIDAD')throw new AppError('Registra una nueva versión temporal; el historial es inmutable',409,'ASIGNACION_HISTORIAL_INMUTABLE');const client=await dbPool.connect();try{await client.query('BEGIN');const base=await loadBase(before.periodo_id,before.vinculacion_id,client);assertOpen(base.periodo_estado);assertNominaEmpleadoEditable({ estado: base.estado_nomina }, 'anular cambios operativos');await assertNominaEmpleadoCoberturaScope(base.nomina_empleado_id,tenant,client);await client.query('UPDATE nomina_movimientos SET activo=FALSE,motivo_estado=$2,updated_by=$3,updated_at=NOW() WHERE id=$1',[id,motivo,actor]);await derive(before.periodo_id,before.vinculacion_id,client);await registerAuditEntry({accion:'DEACTIVATE',tabla:'nomina_movimientos',registro_id:id,descripcion:motivo,before,after:{...before,activo:false},usuario_id:actor,client,...meta});await client.query('COMMIT');return {...before,activo:false};}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}};

