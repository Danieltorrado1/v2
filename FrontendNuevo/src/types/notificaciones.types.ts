export interface NotificacionApiItem {
  archivado: boolean;
  archivado_en: string | null;
  contrato_id: string | null;
  created_at: string;
  estado: string | null;
  fecha_evento: string | null;
  fecha_vencimiento: string | null;
  id: string;
  leida: boolean;
  mensaje: string;
  metadata: Record<string, unknown> | null;
  origen: {
    id: string | null;
    tabla: string | null;
  };
  persona_id: string | null;
  prioridad: string | null;
  resuelto_en: string | null;
  tipo: string;
  titulo: string;
  url_accion: string | null;
  usuario: {
    email: string | null;
    id: string;
    nombre: string | null;
  };
  vinculacion_id: string | null;
}

export interface NotificacionesPagination {
  limit: number;
  page: number;
  total: number;
  total_pages: number;
}

export interface NotificacionesResponse {
  items: NotificacionApiItem[];
  pagination: NotificacionesPagination;
}
