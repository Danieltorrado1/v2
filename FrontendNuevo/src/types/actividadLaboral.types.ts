export interface ActividadLaboralItem {
  periodo: { id: string; fecha_inicio: string; fecha_fin: string; estado: string };
  dias_habilitados: number;
  asistencia: { dias: number; ausencias: number };
  novedades: Array<{ id: string; codigo: string | null; fecha_inicio: string | null; fecha_fin: string | null; estado: string; activa: boolean }>;
  turnos: { internos: number; externos: number; valor_interno?: number; valor_externo?: number };
  revision_operativa: string;
  liquidacion: { estado: string; id: string | null; neto?: number | string | null; conceptos?: unknown };
  sincronizacion: { eventos: Array<{ tipo: string; estado: string; fecha: string }> };
  ultimo_cambio: string | null;
  origen: string | null;
}

export interface ActividadLaboralResponse {
  vinculacion_id: string;
  empresa_id: string;
  contrato_id: string;
  items: ActividadLaboralItem[];
  eventos_integracion: Array<{ tipo: string; estado: string; fecha: string }>;
  pagination: { page: number; limit: number; total: number; total_pages: number };
}
