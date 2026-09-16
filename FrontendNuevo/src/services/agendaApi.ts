import { apiClient as httpClient } from './apiClient';
import type { ApiRequestOptions } from '../types/api.types';

export function createAgendaApi(empresaId?: number) {
  const options = (value: ApiRequestOptions = {}): ApiRequestOptions => {
    const selected = empresaId ?? (typeof window !== 'undefined' ? Number(window.localStorage?.getItem('empiria_empresa_id')) : undefined);
    return { ...value, params: { ...(selected && Number.isSafeInteger(selected) ? { empresa_id: selected } : {}), ...value.params } };
  };
  const apiClient = {
    get: <T,>(path: string, value?: ApiRequestOptions) => httpClient.get<T>(path, options(value)),
    post: <T,>(path: string, input: unknown) => httpClient.post<T>(path, input, options()),
    patch: <T,>(path: string, input: unknown) => httpClient.patch<T>(path, input, options()),
    put: <T,>(path: string, input: unknown) => httpClient.put<T>(path, input, options()),
  };
return {followups:<T=any>(params:Record<string,string|number|undefined>)=>apiClient.get<T>('/agenda/seguimientos',{params}),getTop:<T=any>(fecha:string)=>apiClient.get<T>('/agenda/top',{params:{fecha}}),replaceTop:<T=any>(input:unknown)=>apiClient.post<T>('/agenda/top',input),followup:<T=any>(id:number,input:unknown)=>apiClient.post<T>(`/agenda/tareas/${id}/seguimientos`,input),list:<T=any>(params:Record<string,string|number|boolean|undefined>={})=>apiClient.get<T>('/agenda/tareas',{params}),summary:<T=any>()=>apiClient.get<T>('/agenda/resumen'),create:(input:unknown)=>apiClient.post('/agenda/tareas',input),get:<T=any>(id:number)=>apiClient.get<T>(`/agenda/tareas/${id}`),update:<T=any>(id:number,input:unknown)=>apiClient.patch<T>(`/agenda/tareas/${id}`,input),assign:<T=any>(id:number,input:unknown)=>apiClient.post<T>(`/agenda/tareas/${id}/asignar`,input),participants:<T=any>(id:number,participantes:number[])=>apiClient.put<T>(`/agenda/tareas/${id}/participantes`,{participantes}),start:<T=any>(id:number,input:unknown)=>apiClient.post<T>(`/agenda/tareas/${id}/iniciar`,input),complete:<T=any>(id:number,input:unknown)=>apiClient.post<T>(`/agenda/tareas/${id}/terminar`,input),reopen:<T=any>(id:number,input:unknown)=>apiClient.post<T>(`/agenda/tareas/${id}/reabrir`,input),reschedule:<T=any>(id:number,input:unknown)=>apiClient.post<T>(`/agenda/tareas/${id}/reprogramar`,input),cancel:<T=any>(id:number,input:unknown)=>apiClient.post<T>(`/agenda/tareas/${id}/cancelar`,input),users:<T=any>(params:Record<string,string|number|undefined>={})=>apiClient.get<T>('/agenda/usuarios-asignables',{params}),getCloseDay:<T=any>(fecha:string)=>apiClient.get<T>('/agenda/cierre-diario',{params:{fecha}}),closeDay:<T=any>(input:unknown)=>apiClient.post<T>('/agenda/cierre-diario',input)};
}
export const agendaApi = createAgendaApi();
