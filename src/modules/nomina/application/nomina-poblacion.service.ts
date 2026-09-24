import type { PoolClient } from 'pg';
import type { TenantAccessContext } from '../../../middlewares/tenantMiddleware';
import type { AuditRequestMeta } from '../../auditoria/auditoria.helper';
import { AppError } from '../../../utils/AppError';
import { dbPool } from '../../../config/db';
import { nominaPoblacionRepository } from '../infrastructure/repositories/nomina-poblacion.repository';
import { recordNominaAudit } from './nomina-audit.service';
import { buildImportCandidateReviewSet } from './nomina-population-review';
import { POPULATION_EXCLUSION, resolveNominaMetodoLiquidacion } from '../nomina.population';
import { inclusiveDaysBetween, maxDateString, minDateString } from '../nomina.calculator';

interface ImportCandidateRow {
  cargo_id: string | null; categoria_auxilio_transporte: number | string | null; categoria_id: string | null;
  categoria_salario_base: number | string | null; fecha_fin: Date | string | null; fecha_inicio: Date | string;
  metodo_pago: string | null; persona_id: string; tipo_vinculacion_codigo: string | null; vinculacion_id: string;
}

export interface NominaPopulationSyncResult<TPeriodo> {
  reactivated:number; excluded:number; requires_review:string[]; imported:number; nuevos:number;
  actualizados_contexto:number; sin_cambios:number; periodo:TPeriodo; skipped_duplicates:number; skipped_requires_review?:number;
}
export interface NominaPoblacionDependencies<TPeriodo> {
  loadPeriod:(periodoId:string,tenant:TenantAccessContext|undefined,client:PoolClient)=>Promise<any>;
  mapPeriod:(row:any)=>TPeriodo;
  assertScope:(periodoId:string,tenant:TenantAccessContext|undefined,client:PoolClient)=>Promise<void>;
  assertOpen:(estado:string)=>void;
  recalculate:(id:string)=>Promise<void>;
}
export interface NominaPoblacionLegacyTestDependencies<TResult> {
  syncWithinTransaction:(context:{client:PoolClient})=>Promise<{result:TResult;recalculableEmployeeIds:string[]}>;
  recalculate:(id:string)=>Promise<void>;
}
export type SelectiveNominaSyncStatus = 'APLICADO' | 'SIN_CAMBIOS' | 'BLOQUEADO_CIERRE';
const dateString=(value:Date|string|null|undefined):string|null=>value==null?null:value instanceof Date?value.toISOString().slice(0,10):String(value);
const numberValue=(value:string|number|null|undefined):number=>{if(value==null)return 0;const parsed=typeof value==='number'?value:Number(value);if(!Number.isFinite(parsed))throw new AppError('Invalid numeric value returned by database',500,'INVALID_NUMERIC_VALUE');return parsed;};

export class NominaPoblacionService<TPeriodo=unknown>{
 public async sync(input:{periodoId:string;actorUserId:string;tenant?:TenantAccessContext;auditMeta?:AuditRequestMeta;personaId?:string;vinculacionId?:string;dependencies:NominaPoblacionDependencies<TPeriodo>}):Promise<NominaPopulationSyncResult<TPeriodo>>;
 public async sync<TResult>(input:NominaPoblacionLegacyTestDependencies<TResult>):Promise<TResult>;
 public async sync(input:any):Promise<any>{
  if ('syncWithinTransaction' in input) return this.syncLegacy(input);
  const { dependencies } = input;
  const client=await dbPool.connect();
  try{await client.query('BEGIN');const {result,recalculableEmployeeIds}=await this.syncPopulation(client,input,dependencies);await client.query('COMMIT');for(const id of new Set(recalculableEmployeeIds))await dependencies.recalculate(id);return result;}
  catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 private async syncLegacy<TResult>(dependencies:NominaPoblacionLegacyTestDependencies<TResult>):Promise<TResult>{
  const client=await dbPool.connect();
  try{await client.query('BEGIN');const {result,recalculableEmployeeIds}=await dependencies.syncWithinTransaction({client});await client.query('COMMIT');for(const id of new Set(recalculableEmployeeIds))await dependencies.recalculate(id);return result;}
  catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 public async syncSelective(input:{periodoId:string;vinculacionId:string;effectiveDate:string;eventType:string;actorUserId?:string;context?:Record<string,unknown>|null;retirementDate?:string|null}):Promise<{status:SelectiveNominaSyncStatus;before:Record<string,unknown>|null;after:Record<string,unknown>|null}> {
  const client=await dbPool.connect(); const actorUserId=input.actorUserId ?? '0';
  try {
   await client.query('BEGIN');
   const periodResult=await client.query<{id:string;estado:string;fecha_inicio:string;fecha_fin:string}>(`SELECT id::text,estado,fecha_inicio::text,fecha_fin::text FROM nomina_periodos WHERE id=$1::bigint FOR UPDATE`,[input.periodoId]);
   const period=periodResult.rows[0]; if(!period) throw new AppError('Periodo de nomina no encontrado',404,'NOMINA_PERIODO_NOT_FOUND');
   if(period.estado!=='ABIERTO'){await client.query('COMMIT');return {status:'BLOQUEADO_CIERRE',before:null,after:null};}
   const existingResult=await client.query<Record<string,unknown>>(`SELECT * FROM nomina_empleados WHERE periodo_id=$1::bigint AND vinculacion_id=$2::bigint FOR UPDATE`,[input.periodoId,input.vinculacionId]);
   const before=existingResult.rows[0] ?? null; let after=before; let changed=false;
   if(input.eventType==='CONDICION_PENSION_CAMBIADA'){
    const table=await client.query<{exists:boolean}>(`SELECT to_regclass('public.nomina_liquidaciones') IS NOT NULL AS exists`);
    if(table.rows[0]?.exists){
     const updated=await client.query<Record<string,unknown>>(`UPDATE nomina_liquidaciones SET requiere_recalculo=TRUE, estado=CASE WHEN estado='GENERADA' THEN 'PENDIENTE' ELSE estado END WHERE periodo_id=$1::bigint AND vinculacion_id=$2::bigint AND COALESCE(activo,TRUE)=TRUE AND EXISTS (SELECT 1 FROM nomina_periodos p WHERE p.id=nomina_liquidaciones.periodo_id AND p.estado='ABIERTO') RETURNING id::text,requiere_recalculo,estado`,[input.periodoId,input.vinculacionId]);
     changed=(updated.rowCount ?? 0)>0; after=updated.rows[0] ?? before;
    }
   } else if(input.eventType==='ASIGNACION_OPERATIVA_CAMBIADA'){
    if(before){await nominaPoblacionRepository.repairOperationalSnapshots({periodoId:input.periodoId,actorUserId,vinculacionId:input.vinculacionId},client); changed=true;}
    const snapshotTable=await client.query<{exists:boolean}>(`SELECT to_regclass('public.nomina_contextos_operativos_base') IS NOT NULL AS exists`);
    if(snapshotTable.rows[0]?.exists){const snapshot=await client.query<Record<string,unknown>>(`SELECT contexto FROM nomina_contextos_operativos_base WHERE periodo_id=$1::bigint AND vinculacion_id=$2::bigint LIMIT 1`,[input.periodoId,input.vinculacionId]); after=snapshot.rows[0] ?? before;}
   } else {
    const vinc=await client.query<{fecha_inicio:string;fecha_fin:string|null;metodo_pago:string|null}>(`SELECT fecha_inicio::text,fecha_fin::text,metodo_pago FROM vinculaciones WHERE id=$1::bigint FOR SHARE`,[input.vinculacionId]);
    const row=vinc.rows[0]; if(!row) throw new AppError('Vinculacion no encontrada',404,'VINCULACION_NOT_FOUND');
    const start=maxDateString(row.fecha_inicio,period.fecha_inicio); const end=minDateString(row.fecha_fin ?? period.fecha_fin,period.fecha_fin);
    if(start<=end){
     if(!before){
      const inserted=await nominaPoblacionRepository.insert({periodoId:input.periodoId,vinculacionId:input.vinculacionId,metodoLiquidacion:resolveNominaMetodoLiquidacion({metodo_pago:row.metodo_pago}),categoriaSalarialId:null,salarioBase:0,auxilioTransporte:0,fechaInicioPago:start,fechaFinPago:end,diasPeriodo:inclusiveDaysBetween(period.fecha_inicio,period.fecha_fin),diasPagados:inclusiveDaysBetween(start,end),estado:'PENDIENTE'},client); after={id:inserted,vinculacion_id:input.vinculacionId,periodo_id:input.periodoId,fecha_inicio_pago:start,fecha_fin_pago:end}; changed=true;
     } else if(input.eventType==='VINCULACION_RETIRADA') {
      const limit=input.retirementDate ?? input.effectiveDate; const updated=await client.query<Record<string,unknown>>(`UPDATE nomina_empleados SET fecha_fin_pago=LEAST(COALESCE(fecha_fin_pago,$3::date),$3::date), dias_pagados=GREATEST(0,($3::date-fecha_inicio_pago+1)), activo=TRUE, estado='PENDIENTE', revisado=FALSE WHERE id=$1::bigint AND periodo_id=$2::bigint RETURNING *`,[before.id,input.periodoId,limit]); after=updated.rows[0] ?? before; changed=(updated.rowCount ?? 0)>0;
    } else { const updated=await client.query<Record<string,unknown>>(`UPDATE nomina_empleados SET fecha_inicio_pago=GREATEST(fecha_inicio_pago,$3::date), fecha_fin_pago=LEAST(COALESCE(fecha_fin_pago,$4::date),$4::date), activo=TRUE, estado='PENDIENTE', revisado=FALSE WHERE id=$1::bigint AND periodo_id=$2::bigint RETURNING *`,[before.id,input.periodoId,start,end]); after=updated.rows[0] ?? before; changed=(updated.rowCount ?? 0)>0; }
    }
   }
   if(input.actorUserId && input.actorUserId !== '0') await recordNominaAudit(client,input.periodoId,actorUserId,'INTEGRACION_SYNC_SELECTIVA',{before,after,event_type:input.eventType,vinculacion_id:input.vinculacionId});
   await client.query('COMMIT'); return {status:changed?'APLICADO':'SIN_CAMBIOS',before,after};
  } catch(error){await client.query('ROLLBACK');throw error;} finally{client.release();}
 }
 private async syncPopulation(client:PoolClient,input:{periodoId:string;actorUserId:string;tenant?:TenantAccessContext;auditMeta?:AuditRequestMeta;personaId?:string;vinculacionId?:string},dependencies:NominaPoblacionDependencies<TPeriodo>):Promise<{result:NominaPopulationSyncResult<TPeriodo>;recalculableEmployeeIds:string[]}>{
  const {periodoId,actorUserId,tenant,auditMeta,personaId,vinculacionId}=input;
    await nominaPoblacionRepository.lockPeriodo(periodoId, client);
    const periodo = await dependencies.loadPeriod(periodoId, tenant, client);
    await dependencies.assertScope(periodoId, tenant, client);

    dependencies.assertOpen(periodo.estado);

    const candidates = await nominaPoblacionRepository.listImportCandidates({
      contratoId: periodo.contrato_id,
      fechaInicio: dateString(periodo.fecha_inicio) ?? '',
      fechaFin: dateString(periodo.fecha_fin) ?? '',
      personaId,
      vinculacionId
    }, client) as ImportCandidateRow[];

    // Logical exclusion only: all related rows and all economic columns remain intact.
    const excludedRows = await nominaPoblacionRepository.excludeOutOfScope({
      periodoId,
      fechaInicio: dateString(periodo.fecha_inicio) ?? '',
      fechaFin: dateString(periodo.fecha_fin) ?? '',
      contratoId: periodo.contrato_id,
      exclusionReason: POPULATION_EXCLUSION,
      personaId,
      vinculacionId
    }, client) as Array<{ id: string; has_activity: boolean }>;
    const excludedResult = { rows: excludedRows };
    const excluded = excludedResult.rows.length;
    const requiresReview = excludedResult.rows.filter(row => row.has_activity).map(row => row.id);

    const existingRows = await nominaPoblacionRepository.listExistingByPeriodo({
      periodoId,
      contratoId: periodo.contrato_id,
      personaId,
      vinculacionId
    }, client);
    const existingByVinculacionId = new Map(existingRows.map(row => [row.vinculacion_id, row]));
    const existingVinculacionIds = new Set(existingByVinculacionId.keys());
    const preexistingVinculacionIds = new Set(existingVinculacionIds);

    let reactivated = 0;
    let imported = 0;
    const importedEmployeeIds: string[] = [];
    const recalculableImportedEmployeeIds: string[] = [];
    let skippedDuplicates = 0;
    let skippedRequiresReview = 0;
    const periodoFechaInicio = dateString(periodo.fecha_inicio) ?? '';
    const periodoFechaFin = dateString(periodo.fecha_fin) ?? '';
    const diasPeriodo = inclusiveDaysBetween(periodoFechaInicio, periodoFechaFin);
    const reviewVinculacionIds = buildImportCandidateReviewSet(
      candidates,
      periodoFechaInicio,
      periodoFechaFin
    );

    for (const candidate of candidates) {
      if (existingVinculacionIds.has(candidate.vinculacion_id)) {
        const existing = existingByVinculacionId.get(candidate.vinculacion_id);
        if (!existing?.activo && existing?.motivo_caso_especial?.split(' | ').includes(POPULATION_EXCLUSION)
          && !reviewVinculacionIds.has(candidate.vinculacion_id)) {
          await nominaPoblacionRepository.reactivate(
            periodoId,
            candidate.vinculacion_id,
            existing.motivo_caso_especial.split(' | ').filter(reason => reason !== POPULATION_EXCLUSION).join(' | '),
            client
          );
          reactivated += 1;
        } else {
          skippedDuplicates += 1;
        }
        continue;
      }

      if (reviewVinculacionIds.has(candidate.vinculacion_id)) {
        skippedRequiresReview += 1;
        continue;
      }

      const fechaInicioPago = maxDateString(
        dateString(candidate.fecha_inicio) ?? periodoFechaInicio,
        periodoFechaInicio
      );
      const fechaFinPago = minDateString(
        dateString(candidate.fecha_fin) ?? periodoFechaFin,
        periodoFechaFin
      );

      if (fechaInicioPago > fechaFinPago) {
        continue;
      }

      const diasPagados = inclusiveDaysBetween(fechaInicioPago, fechaFinPago);
      const salarioBase = numberValue(candidate.categoria_salario_base);
      const auxilioTransporte = numberValue(candidate.categoria_auxilio_transporte);

      const metodoLiquidacion = resolveNominaMetodoLiquidacion({
        metodo_pago: candidate.metodo_pago
      });

      const insertedEmployeeId = await nominaPoblacionRepository.insert({
        periodoId,
        vinculacionId: candidate.vinculacion_id,
        metodoLiquidacion,
        categoriaSalarialId: candidate.categoria_id,
        salarioBase,
        auxilioTransporte,
        fechaInicioPago,
        fechaFinPago,
        diasPeriodo,
        diasPagados
      }, client);

      existingVinculacionIds.add(candidate.vinculacion_id);
      imported += 1;
      importedEmployeeIds.push(insertedEmployeeId);
    }

    // A population sync can happen after the initial payroll calculation. New
    // rows must receive the economic category snapshot before being calculated;
    // otherwise the calculator has no salary/transport source and the export
    // correctly exposes the persisted zeroes. Resolve only newly inserted rows
    // and leave existing employee snapshots untouched.
    {
      const economicTables = await nominaPoblacionRepository.hasEconomicTables(client);
      if (economicTables.categorias && economicTables.cobertura) {
        const missingCategoryIds = await nominaPoblacionRepository.listMissingCategoryIds(periodoId, client);
        const missingCalculationIds = await nominaPoblacionRepository.listMissingCalculationIds(
          periodoId, personaId ?? vinculacionId ?? null, client
        );
        const economicEmployeeIds = [...new Set([
          ...importedEmployeeIds,
          ...missingCategoryIds,
          ...missingCalculationIds
        ])];
        const categoryIds = await nominaPoblacionRepository.resolveEconomicCategories(economicEmployeeIds, client);
        recalculableImportedEmployeeIds.push(...categoryIds);
        recalculableImportedEmployeeIds.push(...missingCalculationIds);
      }
    }

    // Legacy repair: nomina_empleados intentionally has no descriptive context
    // columns.  Keep its economic snapshot untouched and repair only the
    // operational snapshot used by change derivation, when the source
    // assignment overlaps this payroll period.
    const repairedSnapshotVinculacionIds = await nominaPoblacionRepository.repairOperationalSnapshots({
      periodoId,
      actorUserId,
      personaId,
      vinculacionId
    }, client);
    const actualizadosContexto = repairedSnapshotVinculacionIds.filter(vinculacion =>
      preexistingVinculacionIds.has(vinculacion)
    ).length;

    const sinCambios = Math.max(0, skippedDuplicates - actualizadosContexto);

    const updatedPeriodo = dependencies.mapPeriod(await dependencies.loadPeriod(periodoId, tenant, client));

    await recordNominaAudit(
      client,
      periodoId,
      actorUserId,
      'NOMINA_EMPLEADOS_IMPORT',
      {
        after: {
          reactivated,
          excluded,
          requires_review: requiresReview,
          excluded_employee_ids: excludedResult.rows.map(row => row.id),
          imported,
          nuevos: imported,
          actualizados_contexto: actualizadosContexto,
          sin_cambios: sinCambios,
          skipped_duplicates: skippedDuplicates,
          skipped_requires_review: skippedRequiresReview
        }
      },
      auditMeta
    );

    return {
      result: {
        reactivated,
        excluded,
        requires_review: requiresReview,
        imported,
        nuevos: imported,
        actualizados_contexto: actualizadosContexto,
        sin_cambios: sinCambios,
        skipped_duplicates: skippedDuplicates,
        skipped_requires_review: skippedRequiresReview,
        periodo: updatedPeriodo
      },
      recalculableEmployeeIds: recalculableImportedEmployeeIds
    };
 }
}

export const nominaPoblacionService = new NominaPoblacionService<any>();
