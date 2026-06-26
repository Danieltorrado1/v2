// ── Raw API shapes — /api/personas ────────────────────────────────────────────

export interface PersonaApi {
  id: number;
  tipo_documento_id: number;
  numero_documento: string;
  primer_nombre: string;
  segundo_nombre: string | null;
  primer_apellido: string;
  segundo_apellido: string | null;
  fecha_nacimiento: string | null;
  fecha_expedicion_documento: string | null;
  municipio_nacimiento_id: number | null;
  municipio_expedicion_id: number | null;
  municipio_residencia_id: number | null;
  sexo_id: number | null;
  estado_civil_id: number | null;
  tipo_sangre_id: number | null;
  estatura: number | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  barrio: string | null;
  zona_id: number | null;
  pais_nacimiento: string | null;
  nacimiento_extranjero: boolean;
  ciudad_nacimiento_extranjero: string | null;
}

export interface PersonasPaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface PaginatedPersonasApi {
  items: PersonaApi[];
  pagination: PersonasPaginationMeta;
}

// ── Raw API shapes — /api/vinculaciones ───────────────────────────────────────

export type VinculacionEstado = 'ACTIVA' | 'RETIRADA' | 'SUSPENDIDA';

export interface VinculacionApi {
  id: number;
  persona_id: number;
  empresa_id: number;
  contrato_id: number;
  contrato_empresa_id: number | null;
  tipo_vinculacion_id: number;
  contrato_cargo_id: number;
  fecha_inicio: string;
  fecha_fin: string | null;
  estado_vinculacion: VinculacionEstado;
  motivo_retiro: string | null;
  cuenta_como_experiencia: boolean;
  metodo_pago: string | null;
}

// ── /api/vinculaciones/:id/expediente ─────────────────────────────────────────

export interface VinculacionExpedientePersona {
  id: number;
  tipo_documento_id: number | null;
  numero_documento: string;
  primer_nombre: string;
  segundo_nombre: string | null;
  primer_apellido: string;
  segundo_apellido: string | null;
  fecha_nacimiento: string | null;
  fecha_expedicion_documento: string | null;
  municipio_nacimiento_id: number | null;
  municipio_expedicion_id: number | null;
  municipio_residencia_id: number | null;
  sexo_id: number | null;
  estado_civil_id: number | null;
  tipo_sangre_id: number | null;
  estatura: number | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  barrio: string | null;
  zona_id: number | null;
  pais_nacimiento: string | null;
  nacimiento_extranjero: boolean | null;
  ciudad_nacimiento_extranjero: string | null;
}

// Minimal document shapes — FASE 6 añadirá el expediente documental completo
export interface DocumentoExpedientePersonaApi {
  id: number;
  tipo_documento_id: number;
  es_vigente: boolean;
  fecha_vencimiento: string | null;
}

export interface DocumentoExpedienteVinculacionApi {
  id: number;
  tipo_documento_id: number;
  activo: boolean;
  fecha_vencimiento: string | null;
}

export interface VinculacionExpedienteApi {
  vinculacion: VinculacionApi;
  persona: VinculacionExpedientePersona;
  empresa: { id: number; nombre_empresa: string | null };
  contrato: {
    id: number;
    numero_contrato: string | null;
    entidad_contratante: string | null;
    objeto_contractual: string | null;
    fecha_inicio: string | null;
    fecha_finalizacion: string | null;
  };
  cargo: { id: number; nombre_cargo: string | null };
  tipo_vinculacion: { id: number; codigo: string | null; nombre_vinculacion: string | null };
  documentos_persona: DocumentoExpedientePersonaApi[];
  documentos_vinculacion: DocumentoExpedienteVinculacionApi[];
  checklist: unknown; // FASE 6: expediente documental
}

// ── Frontend normalized types ─────────────────────────────────────────────────

export interface PersonaListItem {
  id: number;
  nombreCompleto: string;
  numeroDocumento: string;
  correo: string | null;
  telefono: string | null;
}

export interface PersonaFilters {
  search?: string;
  page?: number;
  limit?: number;
}
