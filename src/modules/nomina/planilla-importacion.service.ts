import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import { dbPool } from '../../config/db';
import { env } from '../../config/env';
import { AUTH_USER_LOOKUP_QUERY } from '../../middlewares/authMiddleware';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import type { AuditRequestMeta } from '../auditoria/auditoria.helper';
import { createNominaNovedadSchema } from './nomina.schemas';
import { createNominaNovedad, deactivateNominaNovedad, loadPlanillaOperativaSnapshot, markNominaAsistencia } from './nomina.service';
import { assertImportWorkerScope, buildImportPlan, type ImportPlanRow } from './planilla-importacion.plan';
import { readUploadedPlanilla, validatePlanillaValues } from './planilla-importacion.xlsx';

const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const mac=(text:string)=>createHmac('sha256',env.JWT_SECRET).update(`planilla-import-preview:${text}`).digest('hex');
interface PreviewToken { actor:number; periodo:string; template:string; content:string; state:string; plan:string; expires:number }
function signToken(payload:PreviewToken):string { const text=Buffer.from(JSON.stringify(payload)).toString('base64url'); return `${text}.${mac(text)}`; }
function readToken(value:string):PreviewToken {
  try {
    if (value.length>4096) throw new Error();
    const [text,signature]=value.split('.');
    if (!text || !signature || !/^[a-f0-9]{64}$/.test(signature) || !timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(mac(text),'hex'))) throw new Error();
    const p=JSON.parse(Buffer.from(text,'base64url').toString()) as PreviewToken;
    if (p.expires<Date.now()) throw new Error(); return p;
  } catch { throw new AppError('Vista previa invalida o vencida; vuelva a validar el archivo',409,'PLANILLA_PREVIEW_INVALIDO'); }
}

// Same order for every import. Table locks deliberately protect even legacy V1
// writers that do not take the novelty advisory lock (attendance, supports,
// liquidation/finalization, context and permission changes). Local bounded flow;
// no claim of cheap row-level parallelism. Lock timeout leaves zero changes.
const LOCK_TABLES=[
  'usuarios','roles','usuario_roles','permisos','rol_permisos','usuario_empresas','usuario_contratos',
  'gestor_municipio_asignaciones','gestor_institucion_asignaciones','gestor_personal_asignaciones',
  'nomina_responsabilidades_usuario','nomina_responsabilidad_municipios',
  'contratos','nomina_periodos','vinculaciones','personas','contrato_cargos','municipios','instituciones','sedes','modalidades',
  'cobertura_asignaciones','focalizacion_final','nomina_contextos_operativos_base','nomina_empleados','nomina_tipos_novedad',
  'nomina_novedades','nomina_novedades_canonicas','nomina_novedad_turnos','nomina_novedad_documentos','nomina_novedad_coberturas',
  'nomina_asistencia_diaria','nomina_movimientos','nomina_liquidaciones','nomina_desprendibles','nomina_ajustes_manuales','nomina_revision_operativa',
  'nomina_planilla_importaciones','nomina_planilla_importacion_operaciones'
] as const;

interface ImportExecutionInput { archivo:Buffer; periodoId:string; tenant:TenantAccessContext; empresaId?:string;
  confirmacion?:{ token:string; confirmar:'CONFIRMAR'; motivo:string }; auditMeta?:AuditRequestMeta }
const defaultDependencies={ connect:()=>dbPool.connect(), loadSnapshot:loadPlanillaOperativaSnapshot,
  create:createNominaNovedad, deactivate:deactivateNominaNovedad, attendance:markNominaAsistencia };

export function createPlanillaImporter(dependencies=defaultDependencies) {
  return async function execute(input:ImportExecutionInput) {
    if (!input.tenant?.userId) throw new AppError('Authentication required',401,'UNAUTHORIZED');
    const upload=readUploadedPlanilla(input.archivo);
    if (upload.baseline.periodo.id!==input.periodoId || input.empresaId && upload.baseline.periodo.empresa_id!==input.empresaId) throw new AppError('Archivo de otro periodo/empresa',403,'PLANILLA_SCOPE_MISMATCH');
    const confirmation=input.confirmacion;
    if (confirmation && (confirmation.confirmar!=='CONFIRMAR' || confirmation.motivo.trim().length<10 || confirmation.motivo.length>1000)) throw new AppError('Confirme expresamente e indique un motivo de 10 a 1000 caracteres',422,'PLANILLA_CONFIRMACION_REQUERIDA');
    const token=confirmation ? readToken(confirmation.token) : null;
    if (token && token.actor!==input.tenant.userId) throw new AppError('La vista previa corresponde a otro usuario',403,'PLANILLA_ACCESS_DENIED');
    const client:PoolClient=await dependencies.connect();
    let commitAttempted=false;
    let operationReport:{empleado_id:string;fecha:string;accion:string;codigo:string}[]=[];
    try {
      await client.query(confirmation ? 'BEGIN' : 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query("SET LOCAL statement_timeout = '120s'");
      const timeoutSetting=await client.query("SELECT current_setting('transaction_timeout',TRUE) AS value");
      if (timeoutSetting.rows[0]?.value!=null) await client.query("SET LOCAL transaction_timeout = '90s'");
      const schema=await client.query("SELECT to_regclass('nomina_planilla_importaciones')::text AS recibos, to_regclass('nomina_planilla_importacion_operaciones')::text AS operaciones");
      if (!schema.rows[0]?.recibos || !schema.rows[0]?.operaciones) throw new AppError('Falta preparar el esquema local de recibos/auditoria de importacion',503,'PLANILLA_IMPORT_SCHEMA_REQUIRED');
      if (confirmation) await client.query(`LOCK TABLE ${LOCK_TABLES.join(', ')} IN SHARE ROW EXCLUSIVE MODE`);
      const {snapshot:current}=await dependencies.loadSnapshot(input.periodoId,input.tenant,input.empresaId ? {empresa_id:input.empresaId} : {},client);
      assertImportWorkerScope(upload,current);
      const actor=(await client.query(AUTH_USER_LOOKUP_QUERY,[input.tenant.userId])).rows[0];
      if (!actor?.active || !['nomina.export','nomina.operativa.read'].every(p=>actor.permissions?.includes(p))) throw new AppError('Permisos de importacion revocados',403,'PLANILLA_ACCESS_DENIED');
      const cells=validatePlanillaValues(upload,current);
      const content=digest(cells.map(c=>[c.empleado_id,c.fecha,c.valor]));
      const receipt=(await client.query('SELECT content_hash, resultado FROM nomina_planilla_importaciones WHERE template_key=$1',[upload.templateKey])).rows[0];
      if (current.periodo.estado!=='ABIERTO') throw new AppError('El periodo debe estar ABIERTO',409,'PLANILLA_PERIODO_CERRADO');
      if (receipt) {
        if (receipt.content_hash!==content) throw new AppError('Esta plantilla ya fue utilizada con otro contenido; descargue una nueva',409,'PLANILLA_PLANTILLA_REUTILIZADA');
        await client.query('COMMIT'); return { estado:'YA_APLICADO' as const, resultado:receipt.resultado, token:null };
      }
      const plan=buildImportPlan(upload,current,cells,actor.permissions);
      const coverage=await client.query(`SELECT ca.vinculacion_id::text, ca.fecha_inicio::text AS desde, ca.fecha_fin::text AS hasta,
        ff.municipio_id::text, ff.institucion_id::text, ff.sede_id::text, ff.modalidad_id::text
        FROM cobertura_asignaciones ca JOIN focalizacion_final ff ON ff.id=ca.focalizacion_final_id
        WHERE ca.vinculacion_id=ANY($1::bigint[]) AND ca.activo=TRUE AND ff.activo=TRUE AND ff.contrato_id=$2::bigint
          AND ca.fecha_inicio<=$4::date AND (ca.fecha_fin IS NULL OR ca.fecha_fin>=$3::date)`,
      [upload.baseline.trabajadores.map(w=>w.vinculacion_id),current.periodo.contrato_id,current.periodo.fecha_inicio,current.periodo.fecha_fin]);
      for (const op of plan.filas.filter(r=>['CREAR','SUSTITUIR','RETIRAR','ASISTENCIA','SUSTITUIR_ASISTENCIA'].includes(r.accion))) {
        const worker=current.trabajadores.find(w=>w.id===op.empleado_id)!;
        const matches=coverage.rows.filter(c=>c.vinculacion_id===worker.vinculacion_id && c.desde<=op.fecha && (!c.hasta || c.hasta>=op.fecha));
        if (!matches.length || matches.some(c=>['municipio_id','institucion_id','sede_id','modalidad_id'].some(k=>c[k]!==worker[k as keyof typeof worker]))) {
          if (op.accion==='CREAR') plan.nuevas--; else if (op.accion==='SUSTITUIR') plan.sustituciones--; else if (op.accion==='RETIRAR') plan.retiradas--; else {
            plan.asistencias--; if (op.accion==='SUSTITUIR_ASISTENCIA') plan.sustituciones--;
          }
          op.accion='CONFLICTO'; op.motivo='CONTEXTO_LABORAL_NO_CORRESPONDE_A_LA_FECHA'; plan.conflictos++;
        }
      }
      const operated=new Set(plan.filas.filter(r=>['CREAR','SUSTITUIR','RETIRAR','ASISTENCIA','SUSTITUIR_ASISTENCIA'].includes(r.accion)).map(r=>r.empleado_id));
      plan.filas_omitidas=upload.baseline.trabajadores.filter(w=>!operated.has(w.id)).length;
      const ids=new Set(upload.baseline.trabajadores.map(w=>w.id));
      const state=digest({ guards:current.import_guard!.filter(g=>ids.has(g.id)), catalogo:current.catalogo, periodo:current.periodo });
      const planHash=digest(plan);
      const binding={ actor:input.tenant.userId,periodo:input.periodoId,template:upload.templateKey,content,state,plan:planHash };
      const operations=plan.filas.filter(r=>['CREAR','SUSTITUIR','RETIRAR','ASISTENCIA','SUSTITUIR_ASISTENCIA'].includes(r.accion));
      operationReport=operations.map(r=>({empleado_id:r.empleado_id,fecha:r.fecha,accion:r.accion,codigo:r.nuevo}));
      if (!confirmation) {
        await client.query('COMMIT');
        return { estado:'VISTA_PREVIA' as const, plan, atomicidad:'ARCHIVO_COMPLETO',
          token:!plan.conflictos && operations.length ? signToken({...binding,expires:Date.now()+15*60*1000}) : null };
      }
      if (!token || Object.entries(binding).some(([k,v])=>token[k as keyof PreviewToken]!==v)) throw new AppError('Archivo, permisos o registros cambiaron desde la vista previa',409,'PLANILLA_CONCURRENCIA');
      if (plan.conflictos || !operations.length) throw new AppError('No hay un plan sin conflictos que se pueda confirmar',409,'PLANILLA_CONFLICTOS');
      const id=randomUUID();
      await client.query(`INSERT INTO nomina_planilla_importaciones (id, template_key, content_hash, file_hash, periodo_id, empresa_id, contrato_id, usuario_id, motivo, resultado)
        VALUES ($1::uuid,$2,$3,$4,$5::bigint,$6::bigint,$7::bigint,$8::bigint,$9,'{}'::jsonb)`,
      [id,upload.templateKey,content,upload.fileHash,input.periodoId,current.periodo.empresa_id,current.periodo.contrato_id,String(input.tenant.userId),confirmation.motivo.trim()]);
      const applied:{ empleado_id:string; municipio:string; municipio_id:string; trabajadora:string; fecha:string; accion:ImportPlanRow['accion']; anteriores:string[]; nuevo_id:string|null; codigo:string }[]=[];
      // The authorization decision above is current and exact. This internal read
      // context bypasses legacy municipal shortcuts only for those fixed IDs;
      // neither this context nor operation lists are accepted from the client.
      const mutationScope={...input.tenant,isGlobalAdmin:true,empresaIds:[Number(current.periodo.empresa_id)],contratoIds:[Number(current.periodo.contrato_id)]};
      const executionDeadline=Date.now()+85_000;
      for (const op of operations) {
        if (Date.now()>executionDeadline) throw new AppError('El lote excede el tiempo de ejecucion; vuelva a validar un archivo con menos cambios',409,'PLANILLA_LIMITE_TIEMPO');
        const worker=current.trabajadores.find(w=>w.id===op.empleado_id)!;
        const context={ municipio_id:worker.municipio_id,institucion_id:worker.institucion_id,sede_id:worker.sede_id,modalidad_id:worker.modalidad_id };
        const previous=current.novedades.filter(n=>op.sustituir_ids.includes(n.id));
        let newId:string|null=null; let created:unknown;
        if (op.accion==='ASISTENCIA' || op.accion==='SUSTITUIR_ASISTENCIA') {
          for (const old of previous) await dependencies.deactivate(old.id,String(input.tenant.userId),mutationScope,input.auditMeta,client);
          created=await dependencies.attendance(input.periodoId,worker.vinculacion_id,op.fecha,op.nuevo==='PRESENTE',String(input.tenant.userId),mutationScope,input.auditMeta,client);
        } else if (op.accion==='RETIRAR') {
          for (const old of previous) await dependencies.deactivate(old.id,String(input.tenant.userId),mutationScope,input.auditMeta,client);
        } else {
          for (const old of previous) await dependencies.deactivate(old.id,String(input.tenant.userId),mutationScope,input.auditMeta,client);
          const type=current.catalogo.find(t=>t.id===op.tipo_id)!;
          const result=op.equivalente_id ? current.novedades.find(n=>n.id===op.equivalente_id)! : await dependencies.create(createNominaNovedadSchema.parse({ periodo_id:input.periodoId,nomina_empleado_id:worker.id,vinculacion_id:worker.vinculacion_id,
            tipo_novedad_id:type.id,fecha_inicio:op.fecha,fecha_fin:op.fecha,dias:type.requiere_dias ? 1 : null,
            observacion:`Origen Excel Operativo; importacion ${id}; ${confirmation.motivo.trim()}`,activo:true }),String(input.tenant.userId),mutationScope,input.auditMeta,client);
          newId=result.id; created=result;
        }
        const originals=op.accion==='ASISTENCIA' ? current.asistencias.filter(a=>a.vinculacion_id===worker.vinculacion_id && a.fecha===op.fecha) : previous;
        // Mandatory history: any failure here rolls back both deactivations and
        // creations. Complements the existing V1 audit (which is best-effort).
        const auditAction=op.accion==='RETIRAR' ? 'SUSTITUIR' : op.accion==='SUSTITUIR_ASISTENCIA' ? 'ASISTENCIA' : op.accion;
        const auditNew=op.accion==='RETIRAR' ? {accion:'RETIRAR',valor:null} : created ?? null;
        const auditReason=op.accion==='RETIRAR' ? `RETIRAR: ${confirmation.motivo.trim()}` : op.accion==='SUSTITUIR_ASISTENCIA' ? `SUSTITUIR_ASISTENCIA: ${confirmation.motivo.trim()}` : confirmation.motivo.trim();
        await client.query(`INSERT INTO nomina_planilla_importacion_operaciones
          (importacion_id,usuario_id,municipio_id,nomina_empleado_id,vinculacion_id,fecha,accion,contexto,anteriores,nuevos,motivo)
          VALUES ($1::uuid,$2::bigint,$3::bigint,$4::bigint,$5::bigint,$6::date,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11)`,
        [id,String(input.tenant.userId),worker.municipio_id,worker.id,worker.vinculacion_id,op.fecha,auditAction,JSON.stringify(context),JSON.stringify(originals),JSON.stringify(auditNew),auditReason]);
        applied.push({empleado_id:worker.id,municipio:worker.municipio,municipio_id:worker.municipio_id!,trabajadora:worker.nombre,fecha:op.fecha,accion:op.accion,anteriores:op.sustituir_ids,nuevo_id:newId,codigo:op.nuevo});
      }
      const resultado={ id,atomicidad:'ARCHIVO_COMPLETO',origen:'EXCEL_OPERATIVO',usuario_id:String(input.tenant.userId),
        aplicadas:applied,omitidas:plan.filas_omitidas,rechazadas:0,conservadas:plan.celdas_vacias,sin_cambios:plan.sin_cambios,
        retiradas:plan.retiradas,recalculo:'Sin calculo alternativo ni recalc directo; conserva invalidacion y eventos del flujo V1.' };
      await client.query('UPDATE nomina_planilla_importaciones SET resultado=$2::jsonb WHERE id=$1::uuid',[id,JSON.stringify(resultado)]);
      commitAttempted=true;
      await client.query('COMMIT');
      return {estado:'APLICADO' as const,resultado,token:null};
    } catch(error) {
      let rolledBack=false;
      try {await client.query('ROLLBACK');rolledBack=true;} catch { /* Connection loss: receipt must be checked by retry. */ }
      const reported=error instanceof AppError ? error : new AppError(commitAttempted ? 'Resultado de confirmacion por verificar; valide otra vez el mismo archivo' : 'No fue posible aplicar el archivo completo',500,(error as {code?:string}).code ?? 'PLANILLA_IMPORTACION_FALLIDA');
      const failure=(error as {code?:string}).code==='42P01' ? new AppError('Esquema local de importacion incompleto',503,'PLANILLA_IMPORT_SCHEMA_REQUIRED') : reported;
      throw new AppError(failure.message,failure.statusCode,failure.code,{reporte:{atomicidad:'ARCHIVO_COMPLETO',
        estado:rolledBack && !commitAttempted ? 'REVERTIDO' : 'POR_VERIFICAR',aplicadas:rolledBack && !commitAttempted ? 0 : null,
        rechazadas:operationReport.length,operaciones:operationReport,accion_recomendada:'Validar de nuevo el mismo archivo para consultar su recibo antes de reintentar'}});
    } finally { client.release(); }
  };
}
export const executePlanillaImport=createPlanillaImporter();
