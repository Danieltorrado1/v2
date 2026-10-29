import { apiClient } from './apiClient';
import type { ApiResponse } from '../types/api.types';
export interface PlanillaImportRow { empleado_id:string; municipio:string; trabajadora:string; documento:string; fecha:string;
  anterior:string; nuevo:string; accion:'CREAR'|'SUSTITUIR'|'ASISTENCIA'|'SIN_CAMBIOS'|'CONSERVAR'|'CONFLICTO'; motivo:string; sustituir_ids:string[] }
export interface PlanillaImportResponse {
  estado:'VISTA_PREVIA'|'APLICADO'|'YA_APLICADO'; token:string|null;
  plan?:{registros_analizados:number;nuevas:number;sustituciones:number;asistencias:number;sin_cambios:number;filas_omitidas:number;celdas_vacias:number;conflictos:number;filas:PlanillaImportRow[]};
  resultado?:{id:string;atomicidad:string;aplicadas:{empleado_id:string;municipio:string;municipio_id:string;trabajadora:string;fecha:string;accion:string;anteriores:string[];nuevo_id:string|null;codigo:string}[];omitidas:number;rechazadas:number;conservadas:number;sin_cambios:number};
}
export async function importPlanillaExcel(periodId:string,empresaId:string,file:File,confirmation?:{token:string;motivo:string}):Promise<PlanillaImportResponse> {
  const body=new FormData(); body.append('file',file); body.append('empresa_id',empresaId);
  if (confirmation) { body.append('token',confirmation.token); body.append('motivo',confirmation.motivo); body.append('confirmar','CONFIRMAR'); }
  const response=await apiClient.post<ApiResponse<PlanillaImportResponse>>(`/nomina/periodos/${encodeURIComponent(periodId)}/planilla-operativa/importacion/${confirmation ? 'confirmar' : 'preview'}`,body,{timeout:180_000});
  return response.data;
}
