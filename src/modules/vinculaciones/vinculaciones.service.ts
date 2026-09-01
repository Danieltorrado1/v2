import { PoolClient, QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import { registerAuditEntry } from '../auditoria/auditoria.helper';
import { AppError } from '../../utils/AppError';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { getVinculacionChecklist } from '../documentos/documentos.service';
import {
  getVinculacionPersonalContext,
  type VinculacionPersonalContext
} from './vinculaciones.personal.service';
import {
  CloseGestorAssignmentInput,
  CreateGestorMunicipioAssignmentInput,
  CreateVinculacionInput,
  GestorMunicipioPersonalScope,
  GestorAssignmentWorkspaceQuery,
  GestorPersonalHistoryQuery,
  ListGestorMunicipiosQuery,
  ListContractPersonalQuery,
  PersonalResumenQuery,
  ListVinculacionesQuery,
  ReactivarVinculacionInput,
  RetirarVinculacionInput,
  SaveGestorAssignmentsInput,
  SuspenderVinculacionInput,
  UpdateVinculacionInput,
  VinculacionEstado
} from './vinculaciones.schemas';

interface VinculacionRow extends QueryResultRow {
  contrato_cargo_id: number | string;
  contrato_id: number | string;
  contrato_empresa_id: number | string | null;
  cuenta_como_experiencia: boolean | null;
  empresa_id: number | string;
  estado_vinculacion: string | null;
  fecha_fin: string | Date | null;
  fecha_inicio: string | Date;
  id: number | string;
  metodo_pago: string | null;
  motivo_retiro: string | null;
  persona_id: number | string;
  tipo_vinculacion_id: number | string;
}

interface CountRow extends QueryResultRow {
  total: number;
  personas_total?: number;
}

interface AssignmentMutationRow extends QueryResultRow {
  id: number | string;
}

interface ExistsRow extends QueryResultRow {
  exists: boolean;
}

export interface Vinculacion {
  contrato_cargo_id: number;
  contrato_id: number;
  contrato_empresa_id: number | null;
  cuenta_como_experiencia: boolean;
  empresa_id: number;
  estado_vinculacion: VinculacionEstado;
  fecha_fin: string | null;
  fecha_inicio: string;
  id: number;
  metodo_pago: string | null;
  motivo_retiro: string | null;
  persona_id: number;
  tipo_vinculacion_id: number;
}

export interface PaginatedVinculaciones {
  items: Vinculacion[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

interface ContractPersonalRow extends QueryResultRow {
  asignacion_laboral_actual: string | null;
  gestor_actual_nombre: string | null;
  gestor_actual_usuario_id: number | string | null;
  municipio_actual_id: number | string | null;
  institucion_actual: string | null;
  municipio_actual: string | null;
  modalidad_actual: string | null;
  perfil_licitacion_actual: string | null;
  presentada_licitacion_actual: boolean;
  cargo_nombre: string | null;
  contrato_cargo_id: number | string | null;
  contrato_id: number | string;
  es_manipuladora: boolean;
  empresa_id: number | string;
  estado_vinculacion: string | null;
  fecha_fin: string | Date | null;
  fecha_inicio: string | Date;
  numero_documento: string;
  persona_id: number | string;
  primer_apellido: string;
  primer_nombre: string;
  sede_actual: string | null;
  segundo_apellido: string | null;
  segundo_nombre: string | null;
  vinculacion_id: number | string;
}

export interface ContractPersonalListItem {
  asignacion_actual: {
    institucion: string | null;
    municipio_id: number | null;
    municipio: string | null;
    modalidad: string | null;
    nombre: string | null;
    sede: string | null;
  };
  cargo: {
    nombre_cargo: string | null;
  };
  es_manipuladora: boolean;
  gestor_actual: {
    nombre: string | null;
    usuario_id: number | null;
  } | null;
  estado_vinculacion: VinculacionEstado;
  fecha_fin: string | null;
  fecha_ingreso: string;
  nombre_completo: string;
  numero_documento: string;
  perfil_licitacion_actual: string | null;
  persona_id: number;
  presentada_licitacion_actual: boolean;
  vinculacion_id: number;
}

export interface PersonalResumen {
  fecha_consulta: string;
  trabajadores_activos: number;
  ingresos_mes: number;
  retiros_mes: number;
  vacantes: number;
}
export interface PaginatedContractPersonal {
  items: ContractPersonalListItem[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
    personas_total?: number;
  };
}

interface AuditPayload {
  action:
    | 'VINCULACION_CREATE'
    | 'VINCULACION_UPDATE'
    | 'VINCULACION_RETIRAR'
    | 'VINCULACION_SUSPENDER'
    | 'VINCULACION_REACTIVAR';
  actorUserId: number;
  after?: Vinculacion;
  before?: Vinculacion;
  metadata?: Record<string, unknown>;
}

interface PersonaExpedienteRow extends QueryResultRow {
  barrio: string | null;
  ciudad_nacimiento_extranjero: string | null;
  correo: string | null;
  direccion: string | null;
  estado_civil_id: number | string | null;
  nombre_estado_civil: string | null;
  estatura: number | string | null;
  fecha_expedicion_documento: Date | string | null;
  fecha_nacimiento: Date | string | null;
  id: number | string;
  municipio_expedicion_id: number | string | null;
  municipio_nacimiento_id: number | string | null;
  municipio_residencia_id: number | string | null;
  nacimiento_extranjero: boolean | null;
  numero_documento: string;
  pais_nacimiento: string | null;
  primer_apellido: string;
  primer_nombre: string;
  segundo_apellido: string | null;
  segundo_nombre: string | null;
  sexo_id: number | string | null;
  nombre_sexo: string | null;
  telefono: string | null;
  tipo_documento_id: number | string | null;
  tipo_sangre_id: number | string | null;
  tipo_sangre_codigo: string | null;
  zona_id: number | string | null;
  nombre_zona: string | null;
}

interface AfiliacionExpedienteRow extends QueryResultRow {
  id: number | string | null;
  eps_id: number | string | null;
  eps_nombre: string | null;
  pension_id: number | string | null;
  pension_nombre: string | null;
  arl_id: number | string | null;
  arl_nombre: string | null;
  caja_compensacion_id: number | string | null;
  caja_nombre: string | null;
}

interface SimpleEntityRow extends QueryResultRow {
  id: number | string;
  nombre_cargo?: string | null;
  nombre_empresa?: string | null;
}

interface TipoVinculacionRow extends QueryResultRow {
  codigo: string;
  nombre_vinculacion: string;
}

interface DocumentoPersonaExpedienteRow extends QueryResultRow {
  archivo_path: string | null;
  documento_reemplaza_id: number | string | null;
  es_vigente: boolean;
  fecha_carga: Date | string | null;
  fecha_expedicion: Date | string | null;
  fecha_vencimiento: Date | string | null;
  id: number | string;
  mime_type: string | null;
  nombre_original: string | null;
  persona_id: number | string;
  storage_bucket: string | null;
  storage_path: string | null;
  tamano_bytes: number | string | null;
  tipo_documento_codigo: string;
  tipo_documento_id: number | string;
  tipo_documento_nombre: string;
  version: number | string | null;
  vinculacion_id: number | string | null;
}

interface DocumentoVinculacionExpedienteRow extends QueryResultRow {
  archivo_path: string | null;
  activo: boolean;
  fecha_carga: Date | string | null;
  fecha_expedicion: Date | string | null;
  fecha_vencimiento: Date | string | null;
  id: number | string;
  mime_type: string | null;
  nombre_original: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  tamano_bytes: number | string | null;
  tipo_documento_codigo: string;
  tipo_documento_id: number | string;
  tipo_documento_nombre: string;
  vinculacion_id: number | string;
}

export interface DocumentoExpedientePersona {
  archivo_path: string | null;
  documento_reemplaza_id: number | null;
  es_vigente: boolean;
  fecha_carga: string | null;
  fecha_expedicion: string | null;
  fecha_vencimiento: string | null;
  id: number;
  mime_type: string | null;
  nombre_original: string | null;
  persona_id: number;
  storage_bucket: string | null;
  storage_path: string | null;
  tamano_bytes: number | null;
  tipo_documento: {
    codigo: string;
    id: number;
    nombre_documento: string;
  };
  tipo_documento_id: number;
  version: number;
  vinculacion_id: number | null;
}

export interface DocumentoExpedienteVinculacion {
  archivo_path: string | null;
  activo: boolean;
  fecha_carga: string | null;
  fecha_expedicion: string | null;
  fecha_vencimiento: string | null;
  id: number;
  mime_type: string | null;
  nombre_original: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  tamano_bytes: number | null;
  tipo_documento: {
    codigo: string;
    id: number;
    nombre_documento: string;
  };
  tipo_documento_id: number;
  vinculacion_id: number;
}

export interface VinculacionExpediente {
  cargo: {
    id: number;
    nombre_cargo: string | null;
  };
  checklist: Awaited<ReturnType<typeof getVinculacionChecklist>>;
  contrato: {
    id: number;
    numero_contrato: string | null;
    entidad_contratante: string | null;
    objeto_contractual: string | null;
    fecha_inicio: string | null;
    fecha_finalizacion: string | null;
  };
  documentos_persona: DocumentoExpedientePersona[];
  documentos_vinculacion: DocumentoExpedienteVinculacion[];
  empresa: {
    id: number;
    nombre_empresa: string | null;
  };
  tipo_vinculacion: {
    codigo: string | null;
    id: number;
    nombre_vinculacion: string | null;
  };
  persona: {
    barrio: string | null;
    ciudad_nacimiento_extranjero: string | null;
    correo: string | null;
    direccion: string | null;
    estado_civil_id: number | null;
    estado_civil: string | null;
    estatura: number | null;
    fecha_expedicion_documento: string | null;
    fecha_nacimiento: string | null;
    id: number;
    municipio_expedicion_id: number | null;
    municipio_nacimiento_id: number | null;
    municipio_residencia_id: number | null;
    nacimiento_extranjero: boolean | null;
    numero_documento: string;
    pais_nacimiento: string | null;
    primer_apellido: string;
    primer_nombre: string;
    segundo_apellido: string | null;
    segundo_nombre: string | null;
    sexo_id: number | null;
    sexo: string | null;
    telefono: string | null;
    tipo_documento_id: number | null;
    tipo_sangre_id: number | null;
    tipo_sangre: string | null;
    zona_id: number | null;
    zona: string | null;
  };
  afiliaciones: {
    eps_id: number | null;
    eps: string | null;
    pension_id: number | null;
    pension: string | null;
    arl_id: number | null;
    arl: string | null;
    caja_compensacion_id: number | null;
    caja_compensacion: string | null;
  } | null;
  personal_contexto: VinculacionPersonalContext;
  vinculacion: Vinculacion;
}

const hasOwn = <T extends object>(value: T, key: PropertyKey): boolean => {
  return Object.prototype.hasOwnProperty.call(value, key);
};

const toDateString = (value: string | Date | null): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value;
};

const toNumber = (value: number | string): number => {
  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    throw new AppError('Invalid numeric value returned by database', 500, 'INVALID_NUMERIC_VALUE');
  }

  return parsed;
};

const toIsoDate = (value?: string | null): string => {
  return value ?? new Date().toISOString().slice(0, 10);
};

const shiftIsoDate = (value: string, days: number): string => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const GESTOR_SCOPE_SELECTED: GestorMunicipioPersonalScope = 'PERSONAL_SELECCIONADO';
const GESTOR_SCOPE_ALL: GestorMunicipioPersonalScope = 'TODO_MUNICIPIO';
const TALENTO_HUMANO_ROLE = 'TALENTO_HUMANO';
const GESTOR_ROLE = 'GESTOR';

const tenantHasRole = (tenant: TenantAccessContext | undefined, roleName: string): boolean =>
  tenant?.roleNames.includes(roleName) === true;

const isScopedGestorTenant = (tenant?: TenantAccessContext): boolean =>
  Boolean(
    tenant &&
      !tenant.isGlobalAdmin &&
      tenant.userId &&
      tenantHasRole(tenant, GESTOR_ROLE) &&
      !tenantHasRole(tenant, TALENTO_HUMANO_ROLE)
  );

const isScopedTalentoHumanoTenant = (tenant?: TenantAccessContext): boolean =>
  Boolean(
    tenant &&
      !tenant.isGlobalAdmin &&
      tenant.userId &&
      tenantHasRole(tenant, TALENTO_HUMANO_ROLE)
  );

const buildMunicipioCoverageExistsSql = (
  vinculacionSql: string,
  startDateSql: string,
  endDateSql: string,
  municipioSql: string
): string => `
  EXISTS (
    SELECT 1
    FROM cobertura_asignaciones ca_scope
    INNER JOIN focalizacion_final ff_scope ON ff_scope.id = ca_scope.focalizacion_final_id
    WHERE ca_scope.vinculacion_id = ${vinculacionSql}
      AND COALESCE(ca_scope.activo, TRUE) = TRUE
      AND ca_scope.fecha_inicio <= ${endDateSql}
      AND (ca_scope.fecha_fin IS NULL OR ca_scope.fecha_fin >= ${startDateSql})
      AND ff_scope.municipio_id = ${municipioSql}
  )
`;

const buildGestorScopeExistsSql = (
  userParamSql: string,
  vinculacionSql: string,
  contratoSql: string,
  startDateSql: string,
  endDateSql: string
): string => `
  (
    EXISTS (
      SELECT 1
      FROM gestor_personal_asignaciones gpa_scope
      WHERE gpa_scope.vinculacion_id = ${vinculacionSql}
        AND gpa_scope.contrato_id = ${contratoSql}
        AND gpa_scope.usuario_id = ${userParamSql}::bigint
        AND COALESCE(gpa_scope.activo, TRUE) = TRUE
        AND gpa_scope.vigencia_desde <= ${endDateSql}
        AND (gpa_scope.vigencia_hasta IS NULL OR gpa_scope.vigencia_hasta >= ${startDateSql})
    )
    OR EXISTS (
      SELECT 1
      FROM gestor_municipio_asignaciones gma_scope
      WHERE gma_scope.contrato_id = ${contratoSql}
        AND gma_scope.usuario_id = ${userParamSql}::bigint
        AND COALESCE(gma_scope.activo, TRUE) = TRUE
        AND COALESCE(gma_scope.alcance_personal, '${GESTOR_SCOPE_SELECTED}') = '${GESTOR_SCOPE_ALL}'
        AND gma_scope.vigencia_desde <= ${endDateSql}
        AND (gma_scope.vigencia_hasta IS NULL OR gma_scope.vigencia_hasta >= ${startDateSql})
        AND ${buildMunicipioCoverageExistsSql(vinculacionSql, startDateSql, endDateSql, 'gma_scope.municipio_id')}
    )
  )
`;

const buildAnyGestorScopeExistsSql = (
  vinculacionSql: string,
  contratoSql: string,
  startDateSql: string,
  endDateSql: string
): string => `
  (
    EXISTS (
      SELECT 1
      FROM gestor_personal_asignaciones gpa_scope
      WHERE gpa_scope.vinculacion_id = ${vinculacionSql}
        AND gpa_scope.contrato_id = ${contratoSql}
        AND COALESCE(gpa_scope.activo, TRUE) = TRUE
        AND gpa_scope.vigencia_desde <= ${endDateSql}
        AND (gpa_scope.vigencia_hasta IS NULL OR gpa_scope.vigencia_hasta >= ${startDateSql})
    )
    OR EXISTS (
      SELECT 1
      FROM gestor_municipio_asignaciones gma_scope
      WHERE gma_scope.contrato_id = ${contratoSql}
        AND COALESCE(gma_scope.activo, TRUE) = TRUE
        AND COALESCE(gma_scope.alcance_personal, '${GESTOR_SCOPE_SELECTED}') = '${GESTOR_SCOPE_ALL}'
        AND gma_scope.vigencia_desde <= ${endDateSql}
        AND (gma_scope.vigencia_hasta IS NULL OR gma_scope.vigencia_hasta >= ${startDateSql})
        AND ${buildMunicipioCoverageExistsSql(vinculacionSql, startDateSql, endDateSql, 'gma_scope.municipio_id')}
    )
  )
`;

const buildManagedMunicipioScopeExistsSql = (
  userParamSql: string,
  vinculacionSql: string,
  contratoSql: string,
  startDateSql: string,
  endDateSql: string
): string => `
  EXISTS (
    SELECT 1
    FROM gestor_municipio_asignaciones gma_scope
    WHERE gma_scope.contrato_id = ${contratoSql}
      AND gma_scope.usuario_id = ${userParamSql}::bigint
      AND COALESCE(gma_scope.activo, TRUE) = TRUE
      AND gma_scope.vigencia_desde <= ${endDateSql}
      AND (gma_scope.vigencia_hasta IS NULL OR gma_scope.vigencia_hasta >= ${startDateSql})
      AND ${buildMunicipioCoverageExistsSql(vinculacionSql, startDateSql, endDateSql, 'gma_scope.municipio_id')}
  )
`;

const toNullableBoolean = (value: boolean | null | undefined): boolean => {
  return value ?? false;
};

const normalizeEstado = (value: string | null): VinculacionEstado => {
  if (value === 'ACTIVA' || value === 'RETIRADA' || value === 'SUSPENDIDA') {
    return value;
  }

  if (value === 'ACTIVO') {
    return 'ACTIVA';
  }

  throw new AppError('Invalid estado_vinculacion value returned by database', 500, 'INVALID_VINCULACION_STATE', {
    value
  });
};

const mapVinculacion = (row: VinculacionRow): Vinculacion => {
  return {
    id: toNumber(row.id),
    persona_id: toNumber(row.persona_id),
    empresa_id: toNumber(row.empresa_id),
    contrato_id: toNumber(row.contrato_id),
    contrato_empresa_id: row.contrato_empresa_id === null ? null : toNumber(row.contrato_empresa_id),
    tipo_vinculacion_id: toNumber(row.tipo_vinculacion_id),
    contrato_cargo_id: toNumber(row.contrato_cargo_id),
    fecha_inicio: toDateString(row.fecha_inicio) ?? '',
    fecha_fin: toDateString(row.fecha_fin),
    estado_vinculacion: normalizeEstado(row.estado_vinculacion),
    motivo_retiro: row.motivo_retiro,
    cuenta_como_experiencia: toNullableBoolean(row.cuenta_como_experiencia),
    metodo_pago: row.metodo_pago
  };
};

const mapContractPersonal = (row: ContractPersonalRow): ContractPersonalListItem => {
  return {
    vinculacion_id: toNumber(row.vinculacion_id),
    persona_id: toNumber(row.persona_id),
    numero_documento: row.numero_documento,
    nombre_completo: [
      row.primer_nombre,
      row.segundo_nombre,
      row.primer_apellido,
      row.segundo_apellido
    ]
      .filter(Boolean)
      .join(' '),
    cargo: {
      nombre_cargo: row.cargo_nombre
    },
    es_manipuladora: row.es_manipuladora,
    gestor_actual:
      row.gestor_actual_usuario_id !== null || row.gestor_actual_nombre
        ? {
            usuario_id:
              row.gestor_actual_usuario_id === null ? null : toNumber(row.gestor_actual_usuario_id),
            nombre: row.gestor_actual_nombre
          }
        : null,
    estado_vinculacion: normalizeEstado(row.estado_vinculacion),
    fecha_ingreso: toDateString(row.fecha_inicio) ?? '',
    fecha_fin: toDateString(row.fecha_fin),
    asignacion_actual: {
      nombre: row.asignacion_laboral_actual,
      institucion: row.institucion_actual,
      municipio_id: row.municipio_actual_id === null ? null : toNumber(row.municipio_actual_id),
      municipio: row.municipio_actual,
      sede: row.sede_actual,
      modalidad: row.modalidad_actual
    },
    presentada_licitacion_actual: row.presentada_licitacion_actual,
    perfil_licitacion_actual: row.perfil_licitacion_actual
  };
};

const mapGestorAssignmentUser = (row: GestorUserRow): GestorAssignmentUser => {
  return {
    id: toNumber(row.id),
    nombre: row.name ?? '',
    activo: row.active ?? true,
    roles: Array.isArray(row.roles)
      ? row.roles.filter((role): role is string => typeof role === 'string')
      : []
  };
};

const mapGestorMunicipioAssignment = (
  row: GestorMunicipioAssignmentRow
): GestorMunicipioAssignment => ({
  id: toNumber(row.id),
  contrato_id: toNumber(row.contrato_id),
  alcance_personal: row.alcance_personal ?? GESTOR_SCOPE_SELECTED,
  gestor: {
    id: toNumber(row.usuario_id),
    nombre: row.gestor_nombre
  },
  municipio: {
    id: toNumber(row.municipio_id),
    nombre: row.municipio_nombre,
    departamento_id: row.departamento_id === null ? null : toNumber(row.departamento_id),
    departamento_nombre: row.departamento_nombre
  },
  vigencia_desde: toDateString(row.vigencia_desde) ?? '',
  vigencia_hasta: toDateString(row.vigencia_hasta),
  activo: row.activo,
  observacion: row.observacion,
  created_by_user_id: row.created_by_user_id === null ? null : toNumber(row.created_by_user_id),
  created_at:
    row.created_at instanceof Date ? row.created_at.toISOString() : new Date(String(row.created_at)).toISOString(),
  updated_by_user_id: row.updated_by_user_id === null ? null : toNumber(row.updated_by_user_id),
  updated_at:
    row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(String(row.updated_at)).toISOString()
});

const mapGestorPersonalAssignment = (
  row: GestorPersonalAssignmentRow
): GestorPersonalAssignment => ({
  id: toNumber(row.id),
  contrato_id: toNumber(row.contrato_id),
  gestor: {
    id: toNumber(row.usuario_id),
    nombre: row.gestor_nombre
  },
  municipio:
    row.municipio_id === null && row.municipio_nombre === null
      ? null
      : {
          id: row.municipio_id === null ? null : toNumber(row.municipio_id),
          nombre: row.municipio_nombre
        },
  trabajador: {
    vinculacion_id: toNumber(row.vinculacion_id),
    documento: row.trabajador_documento,
    nombre_completo: row.trabajador_nombre
  },
  vigencia_desde: toDateString(row.vigencia_desde) ?? '',
  vigencia_hasta: toDateString(row.vigencia_hasta),
  activo: row.activo,
  observacion: row.observacion,
  created_by_user_id: row.created_by_user_id === null ? null : toNumber(row.created_by_user_id),
  created_at:
    row.created_at instanceof Date ? row.created_at.toISOString() : new Date(String(row.created_at)).toISOString(),
  updated_by_user_id: row.updated_by_user_id === null ? null : toNumber(row.updated_by_user_id),
  updated_at:
    row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(String(row.updated_at)).toISOString()
});

const mapPersonaExpediente = (row: PersonaExpedienteRow): VinculacionExpediente['persona'] => {
  return {
    id: toNumber(row.id),
    tipo_documento_id: row.tipo_documento_id === null ? null : toNumber(row.tipo_documento_id),
    numero_documento: row.numero_documento,
    primer_nombre: row.primer_nombre,
    segundo_nombre: row.segundo_nombre,
    primer_apellido: row.primer_apellido,
    segundo_apellido: row.segundo_apellido,
    fecha_nacimiento: toDateString(row.fecha_nacimiento),
    fecha_expedicion_documento: toDateString(row.fecha_expedicion_documento),
    municipio_nacimiento_id:
      row.municipio_nacimiento_id === null ? null : toNumber(row.municipio_nacimiento_id),
    municipio_expedicion_id:
      row.municipio_expedicion_id === null ? null : toNumber(row.municipio_expedicion_id),
    municipio_residencia_id:
      row.municipio_residencia_id === null ? null : toNumber(row.municipio_residencia_id),
    sexo_id: row.sexo_id === null ? null : toNumber(row.sexo_id),
    sexo: row.nombre_sexo ?? null,
    estado_civil_id: row.estado_civil_id === null ? null : toNumber(row.estado_civil_id),
    estado_civil: row.nombre_estado_civil ?? null,
    tipo_sangre_id: row.tipo_sangre_id === null ? null : toNumber(row.tipo_sangre_id),
    tipo_sangre: row.tipo_sangre_codigo ?? null,
    estatura: row.estatura === null ? null : toNumber(row.estatura),
    telefono: row.telefono,
    correo: row.correo,
    direccion: row.direccion,
    barrio: row.barrio,
    zona_id: row.zona_id === null ? null : toNumber(row.zona_id),
    zona: row.nombre_zona ?? null,
    pais_nacimiento: row.pais_nacimiento,
    nacimiento_extranjero: row.nacimiento_extranjero,
    ciudad_nacimiento_extranjero: row.ciudad_nacimiento_extranjero
  };
};

const mapDocumentoPersonaExpediente = (
  row: DocumentoPersonaExpedienteRow
): DocumentoExpedientePersona => {
  return {
    id: toNumber(row.id),
    persona_id: toNumber(row.persona_id),
    tipo_documento_id: toNumber(row.tipo_documento_id),
    tipo_documento: {
      id: toNumber(row.tipo_documento_id),
      codigo: row.tipo_documento_codigo,
      nombre_documento: row.tipo_documento_nombre
    },
    fecha_expedicion: toDateString(row.fecha_expedicion),
    fecha_vencimiento: toDateString(row.fecha_vencimiento),
    archivo_path: row.archivo_path,
    fecha_carga: toDateString(row.fecha_carga),
    vinculacion_id: row.vinculacion_id === null ? null : toNumber(row.vinculacion_id),
    version: row.version === null ? 1 : toNumber(row.version),
    documento_reemplaza_id:
      row.documento_reemplaza_id === null ? null : toNumber(row.documento_reemplaza_id),
    es_vigente: row.es_vigente,
    storage_bucket: row.storage_bucket,
    storage_path: row.storage_path,
    nombre_original: row.nombre_original,
    mime_type: row.mime_type,
    tamano_bytes: row.tamano_bytes === null ? null : toNumber(row.tamano_bytes)
  };
};

const mapDocumentoVinculacionExpediente = (
  row: DocumentoVinculacionExpedienteRow
): DocumentoExpedienteVinculacion => {
  return {
    id: toNumber(row.id),
    vinculacion_id: toNumber(row.vinculacion_id),
    tipo_documento_id: toNumber(row.tipo_documento_id),
    tipo_documento: {
      id: toNumber(row.tipo_documento_id),
      codigo: row.tipo_documento_codigo,
      nombre_documento: row.tipo_documento_nombre
    },
    fecha_expedicion: toDateString(row.fecha_expedicion),
    fecha_vencimiento: toDateString(row.fecha_vencimiento),
    archivo_path: row.archivo_path,
    fecha_carga: toDateString(row.fecha_carga),
    activo: row.activo,
    storage_bucket: row.storage_bucket,
    storage_path: row.storage_path,
    nombre_original: row.nombre_original,
    mime_type: row.mime_type,
    tamano_bytes: row.tamano_bytes === null ? null : toNumber(row.tamano_bytes)
  };
};

const getVinculacionSelect = (): string => {
  return `
    SELECT
      v.id,
      v.persona_id,
      v.empresa_id,
      v.contrato_id,
      c.empresa_id AS contrato_empresa_id,
      v.tipo_vinculacion_id,
      v.contrato_cargo_id,
      v.fecha_inicio,
      v.fecha_fin,
      v.estado_vinculacion,
      v.motivo_retiro,
      v.cuenta_como_experiencia,
      v.metodo_pago
    FROM vinculaciones v
    INNER JOIN contratos c ON c.id = v.contrato_id
  `;
};

const listGestorAssignableUsers = async (client: PoolClient): Promise<GestorAssignmentUser[]> => {
  const result = await client.query<GestorUserRow>(
    `
      SELECT
        u.id,
        u.nombre_completo AS name,
        COALESCE(u.activo, TRUE) AS active,
        COALESCE(
          ARRAY(
            SELECT DISTINCT r.nombre_rol
            FROM usuario_roles ur
            INNER JOIN roles r ON r.id = ur.rol_id
            WHERE ur.usuario_id = u.id
              AND COALESCE(ur.activo, TRUE) = TRUE
              AND COALESCE(r.activo, TRUE) = TRUE
            ORDER BY r.nombre_rol
          ),
          ARRAY[]::text[]
        ) AS roles
      FROM usuarios u
      WHERE COALESCE(u.activo, TRUE) = TRUE
        AND EXISTS (
          SELECT 1
          FROM usuario_roles ur_g
          INNER JOIN roles r_g ON r_g.id = ur_g.rol_id
          WHERE ur_g.usuario_id = u.id
            AND COALESCE(ur_g.activo, TRUE) = TRUE
            AND COALESCE(r_g.activo, TRUE) = TRUE
            AND r_g.nombre_rol = '${GESTOR_ROLE}'
        )
      ORDER BY u.nombre_completo ASC, u.id ASC
    `
  );

  return result.rows.map(mapGestorAssignmentUser);
};

const getGestorMunicipioAssignments = async (
  client: PoolClient,
  input: {
    contrato_id: number;
    fecha?: string;
    gestor_usuario_id?: number | null;
    onlyActive?: boolean;
  }
): Promise<GestorMunicipioAssignment[]> => {
  const params: unknown[] = [input.contrato_id];
  const conditions = ['gma.contrato_id = $1::bigint'];

  if (input.gestor_usuario_id !== undefined && input.gestor_usuario_id !== null) {
    params.push(input.gestor_usuario_id);
    conditions.push(`gma.usuario_id = $${params.length}::bigint`);
  }

  if (input.onlyActive) {
    conditions.push('COALESCE(gma.activo, TRUE) = TRUE');
  }

  if (input.fecha) {
    params.push(input.fecha);
    conditions.push(`gma.vigencia_desde <= $${params.length}::date`);
    conditions.push(`(gma.vigencia_hasta IS NULL OR gma.vigencia_hasta >= $${params.length}::date)`);
  }

  const result = await client.query<GestorMunicipioAssignmentRow>(
    `
      SELECT
        gma.id,
        gma.usuario_id,
        u.nombre_completo AS gestor_nombre,
        gma.contrato_id,
        gma.municipio_id,
        gma.alcance_personal,
        mu.departamento_id,
        dep.nombre_departamento AS departamento_nombre,
        mu.nombre_municipio AS municipio_nombre,
        gma.vigencia_desde,
        gma.vigencia_hasta,
        COALESCE(gma.activo, TRUE) AS activo,
        gma.observacion,
        gma.created_by_user_id,
        gma.created_at,
        gma.updated_by_user_id,
        gma.updated_at
      FROM gestor_municipio_asignaciones gma
      INNER JOIN usuarios u ON u.id = gma.usuario_id
      INNER JOIN municipios mu ON mu.id = gma.municipio_id
      LEFT JOIN departamentos dep ON dep.id = mu.departamento_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY mu.nombre_municipio ASC, gma.vigencia_desde DESC, gma.id DESC
    `,
    params
  );

  return result.rows.map(mapGestorMunicipioAssignment);
};

const getGestorPersonalAssignments = async (
  client: PoolClient,
  input: {
    contrato_id: number;
    fecha?: string;
    gestor_usuario_id?: number | null;
    municipio_id?: number | null;
    vinculacion_id?: number | null;
    onlyActive?: boolean;
  }
): Promise<GestorPersonalAssignment[]> => {
  const params: unknown[] = [input.contrato_id];
  const conditions = ['gpa.contrato_id = $1::bigint'];

  if (input.gestor_usuario_id !== undefined && input.gestor_usuario_id !== null) {
    params.push(input.gestor_usuario_id);
    conditions.push(`gpa.usuario_id = $${params.length}::bigint`);
  }

  if (input.municipio_id !== undefined && input.municipio_id !== null) {
    params.push(input.municipio_id);
    conditions.push(`gpa.municipio_id = $${params.length}::bigint`);
  }

  if (input.vinculacion_id !== undefined && input.vinculacion_id !== null) {
    params.push(input.vinculacion_id);
    conditions.push(`gpa.vinculacion_id = $${params.length}::bigint`);
  }

  if (input.onlyActive) {
    conditions.push('COALESCE(gpa.activo, TRUE) = TRUE');
  }

  if (input.fecha) {
    params.push(input.fecha);
    conditions.push(`gpa.vigencia_desde <= $${params.length}::date`);
    conditions.push(`(gpa.vigencia_hasta IS NULL OR gpa.vigencia_hasta >= $${params.length}::date)`);
  }

  const result = await client.query<GestorPersonalAssignmentRow>(
    `
      SELECT
        gpa.id,
        gpa.usuario_id,
        u.nombre_completo AS gestor_nombre,
        gpa.contrato_id,
        gpa.vinculacion_id,
        gpa.municipio_id,
        mu.nombre_municipio AS municipio_nombre,
        gpa.vigencia_desde,
        gpa.vigencia_hasta,
        COALESCE(gpa.activo, TRUE) AS activo,
        gpa.observacion,
        gpa.created_by_user_id,
        gpa.created_at,
        gpa.updated_by_user_id,
        gpa.updated_at,
        p.numero_documento AS trabajador_documento,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS trabajador_nombre
      FROM gestor_personal_asignaciones gpa
      INNER JOIN usuarios u ON u.id = gpa.usuario_id
      INNER JOIN vinculaciones v ON v.id = gpa.vinculacion_id
      INNER JOIN personas p ON p.id = v.persona_id
      LEFT JOIN municipios mu ON mu.id = gpa.municipio_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY trabajador_nombre ASC NULLS LAST, gpa.vigencia_desde DESC, gpa.id DESC
    `,
    params
  );

  return result.rows.map(mapGestorPersonalAssignment);
};

const ensureGestorAssignmentUserExists = async (
  client: PoolClient,
  usuarioId: number,
  contratoId: number
): Promise<GestorAssignmentUser> => {
  const users = await listGestorAssignableUsers(client);
  const user = users.find((item) => item.id === usuarioId);

  if (!user) {
    throw new AppError('Gestor user not found', 404, 'GESTOR_USER_NOT_FOUND');
  }

  const access = await client.query<ExistsRow>(
    `
      SELECT EXISTS(
        SELECT 1
        FROM usuario_contratos uc
        INNER JOIN contratos c ON c.id = uc.contrato_id
        WHERE uc.usuario_id = $1::bigint
          AND uc.contrato_id = $2::bigint
          AND COALESCE(uc.activo, TRUE) = TRUE
          AND COALESCE(c.activo, TRUE) = TRUE
      ) AS exists
    `,
    [usuarioId, contratoId]
  );

  if (!access.rows[0]?.exists) {
    throw new AppError(
      'Gestor user does not have access to the contract',
      403,
      'GESTOR_CONTRATO_ACCESS_REQUIRED'
    );
  }

  return user;
};

const ensureMunicipioExists = async (client: PoolClient, municipioId: number): Promise<void> => {
  const result = await client.query<ExistsRow>(
    `
      SELECT EXISTS(
        SELECT 1
        FROM municipios
        WHERE id = $1::bigint
      ) AS exists
    `,
    [municipioId]
  );

  if (!result.rows[0]?.exists) {
    throw new AppError('Municipio not found', 404, 'MUNICIPIO_NOT_FOUND');
  }
};

const ensureMunicipioDepartamentoMatch = async (
  client: PoolClient,
  municipioId: number,
  departamentoId?: number | null
): Promise<void> => {
  if (departamentoId === undefined || departamentoId === null) {
    return;
  }

  const result = await client.query<ExistsRow>(
    `
      SELECT EXISTS(
        SELECT 1
        FROM municipios
        WHERE id = $1::bigint
          AND departamento_id = $2::bigint
      ) AS exists
    `,
    [municipioId, departamentoId]
  );

  if (!result.rows[0]?.exists) {
    throw new AppError(
      'El municipio no pertenece al departamento seleccionado.',
      409,
      'MUNICIPIO_DEPARTAMENTO_INVALIDO'
    );
  }
};

const ensureMunicipioBelongsContratoScope = async (
  client: PoolClient,
  contratoId: number,
  municipioId: number
): Promise<void> => {
  const result = await client.query<ExistsRow>(
    `
      SELECT EXISTS(
        SELECT 1
        FROM focalizacion_final ff
        WHERE ff.contrato_id = $1::bigint
          AND ff.municipio_id = $2::bigint
          AND COALESCE(ff.activo, TRUE) = TRUE
      ) AS exists
    `,
    [contratoId, municipioId]
  );

  if (!result.rows[0]?.exists) {
    throw new AppError(
      'El municipio no pertenece al contrato seleccionado.',
      409,
      'GESTOR_MUNICIPIO_CONTRATO_INVALIDO'
    );
  }
};

const ensureTerritorialAssignmentUserExists = async (
  client: PoolClient,
  usuarioId: number,
  contratoId: number
): Promise<GestorAssignmentUser> => {
  const result = await client.query<GestorUserRow>(
    `
      SELECT
        u.id,
        u.nombre_completo AS name,
        COALESCE(u.activo, TRUE) AS active,
        COALESCE(
          ARRAY(
            SELECT DISTINCT r.nombre_rol
            FROM usuario_roles ur
            INNER JOIN roles r ON r.id = ur.rol_id
            WHERE ur.usuario_id = u.id
              AND COALESCE(ur.activo, TRUE) = TRUE
              AND COALESCE(r.activo, TRUE) = TRUE
            ORDER BY r.nombre_rol
          ),
          ARRAY[]::text[]
        ) AS roles
      FROM usuarios u
      WHERE u.id = $1::bigint
        AND COALESCE(u.activo, TRUE) = TRUE
        AND EXISTS (
          SELECT 1
          FROM usuario_roles ur_scope
          INNER JOIN roles r_scope ON r_scope.id = ur_scope.rol_id
          WHERE ur_scope.usuario_id = u.id
            AND COALESCE(ur_scope.activo, TRUE) = TRUE
            AND COALESCE(r_scope.activo, TRUE) = TRUE
            AND r_scope.nombre_rol IN ('GESTOR', 'TALENTO_HUMANO')
        )
      LIMIT 1
    `,
    [usuarioId]
  );

  const user = result.rows[0] ? mapGestorAssignmentUser(result.rows[0]) : null;

  if (!user) {
    throw new AppError(
      'El usuario territorial no existe o no tiene un rol compatible.',
      404,
      'TERRITORIAL_USER_NOT_FOUND'
    );
  }

  const access = await client.query<ExistsRow>(
    `
      SELECT EXISTS(
        SELECT 1
        FROM usuario_contratos uc
        INNER JOIN contratos c ON c.id = uc.contrato_id
        WHERE uc.usuario_id = $1::bigint
          AND uc.contrato_id = $2::bigint
          AND COALESCE(uc.activo, TRUE) = TRUE
          AND COALESCE(c.activo, TRUE) = TRUE
      ) AS exists
    `,
    [usuarioId, contratoId]
  );

  if (!access.rows[0]?.exists) {
    throw new AppError(
      'El usuario territorial no tiene acceso al contrato.',
      403,
      'GESTOR_CONTRATO_ACCESS_REQUIRED'
    );
  }

  return user;
};

const ensureGestorMunicipioScope = async (
  client: PoolClient,
  input: {
    contrato_id: number;
    fecha: string;
    gestor_usuario_id: number;
    municipio_id: number;
  }
): Promise<void> => {
  const assignments = await getGestorMunicipioAssignments(client, {
    contrato_id: input.contrato_id,
    gestor_usuario_id: input.gestor_usuario_id,
    fecha: input.fecha,
    onlyActive: true
  });

  if (!assignments.some((item: GestorMunicipioAssignment) => item.municipio.id === input.municipio_id)) {
    throw new AppError(
      'Gestor municipio scope is required before assigning workers',
      400,
      'GESTOR_MUNICIPIO_SCOPE_REQUIRED'
    );
  }
};

const isTenantGlobalAdmin = (tenant?: TenantAccessContext): boolean => {
  return tenant?.isGlobalAdmin ?? false;
};

const ensureVinculacionTenantAccess = (
  tenant: TenantAccessContext | undefined,
  row: Pick<VinculacionRow, 'contrato_empresa_id' | 'contrato_id'> | null
): void => {
  if (!tenant || isTenantGlobalAdmin(tenant)) {
    return;
  }

  if (!row) {
    return;
  }

  if (tenant.contratoIds.length > 0) {
    if (tenant.contratoIds.includes(toNumber(row.contrato_id))) {
      return;
    }

    throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  }

  if (row.contrato_empresa_id !== null && tenant.empresaIds.includes(toNumber(row.contrato_empresa_id))) {
    return;
  }

  throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
};

const ensureContractTenantAccess = async (
  client: PoolClient,
  tenant: TenantAccessContext | undefined,
  contratoId: number
): Promise<void> => {
  if (!tenant || isTenantGlobalAdmin(tenant)) {
    return;
  }

  if (tenant.contratoIds.includes(contratoId)) {
    return;
  }

  if (tenant.contratoIds.length > 0) {
    throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  }

  if (tenant.empresaIds.length === 0) {
    throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  }

  const result = await client.query<{ empresa_id: string | number | null }>(
    `
      SELECT empresa_id
      FROM contratos
      WHERE id = $1::bigint
      LIMIT 1
    `,
    [contratoId]
  );

  const contrato = result.rows[0];

  if (contrato?.empresa_id !== null && contrato?.empresa_id !== undefined) {
    const empresaId = toNumber(contrato.empresa_id);

    if (tenant.empresaIds.includes(empresaId)) {
      return;
    }
  }

  throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
};

const appendContractOperationalScopeConditions = (
  conditions: string[],
  params: unknown[],
  tenant: TenantAccessContext | undefined,
  scope: {
    vinculacionSql: string;
    contratoSql: string;
    startDateSql: string;
    endDateSql: string;
  }
): void => {
  if (!tenant || tenant.isGlobalAdmin) {
    return;
  }

  if (!tenant.userId) {
    conditions.push('1=0');
    return;
  }

  params.push(tenant.userId);
  const userParamSql = `$${params.length}`;

  if (isScopedGestorTenant(tenant)) {
    conditions.push(
      buildGestorScopeExistsSql(
        userParamSql,
        scope.vinculacionSql,
        scope.contratoSql,
        scope.startDateSql,
        scope.endDateSql
      )
    );
    return;
  }

  if (isScopedTalentoHumanoTenant(tenant)) {
    conditions.push(
      buildManagedMunicipioScopeExistsSql(
        userParamSql,
        scope.vinculacionSql,
        scope.contratoSql,
        scope.startDateSql,
        scope.endDateSql
      )
    );
  }
};

const ensureEntityExists = async (
  client: PoolClient,
  tableName: 'personas' | 'empresas' | 'contratos' | 'contrato_cargos' | 'tipos_vinculacion',
  entityId: number,
  errorCode: string,
  label: string
): Promise<void> => {
  const result = await client.query<ExistsRow>(
    `SELECT EXISTS (SELECT 1 FROM ${tableName} WHERE id = $1::bigint) AS exists`,
    [entityId]
  );

  if (!result.rows[0]?.exists) {
    throw new AppError(`${label} not found`, 400, errorCode, { id: entityId });
  }
};

const validateForeignKeys = async (
  client: PoolClient,
  values: {
    contrato_cargo_id: number;
    contrato_id: number;
    empresa_id: number;
    persona_id: number;
    tipo_vinculacion_id: number;
  }
): Promise<void> => {
  await ensureEntityExists(client, 'personas', values.persona_id, 'PERSONA_NOT_FOUND', 'Persona');
  await ensureEntityExists(client, 'empresas', values.empresa_id, 'EMPRESA_NOT_FOUND', 'Empresa');
  await ensureEntityExists(client, 'contratos', values.contrato_id, 'CONTRATO_NOT_FOUND', 'Contrato');
  await ensureEntityExists(
    client,
    'tipos_vinculacion',
    values.tipo_vinculacion_id,
    'TIPO_VINCULACION_NOT_FOUND',
    'Tipo vinculacion'
  );
  await ensureEntityExists(
    client,
    'contrato_cargos',
    values.contrato_cargo_id,
    'CONTRATO_CARGO_NOT_FOUND',
    'Contrato cargo'
  );
};

const ensureActiveUniqueness = async (
  client: PoolClient,
  values: {
    contrato_id: number;
    persona_id: number;
  },
  excludedVinculacionId?: number
): Promise<void> => {
  const params: unknown[] = [values.persona_id, values.contrato_id];
  let query = `
    SELECT id
    FROM vinculaciones
    WHERE persona_id = $1::bigint
      AND contrato_id = $2::bigint
      AND estado_vinculacion IN ('ACTIVA', 'ACTIVO')
  `;

  if (excludedVinculacionId !== undefined) {
    params.push(excludedVinculacionId);
    query += ` AND id <> $${params.length}::bigint`;
  }

  query += ' LIMIT 1';

  const result = await client.query<{ id: number | string }>(query, params);

  if ((result.rowCount ?? 0) > 0) {
    throw new AppError(
      'A person can only have one active vinculacion per contract',
      409,
      'VINCULACION_ACTIVE_CONFLICT',
      values
    );
  }
};

const getVinculacionRowById = async (
  client: PoolClient,
  vinculacionId: number
): Promise<VinculacionRow | null> => {
  const result = await client.query<VinculacionRow>(
    `
      ${getVinculacionSelect()}
      WHERE v.id = $1::bigint
      LIMIT 1
    `,
    [vinculacionId]
  );

  return result.rows[0] ?? null;
};

const recordAudit = async (
  client: PoolClient,
  vinculacionId: number,
  payload: AuditPayload
): Promise<void> => {
  await registerAuditEntry({
    client,
    usuario_id: String(payload.actorUserId),
    accion: payload.action,
    tabla: 'vinculaciones',
    registro_id: String(vinculacionId),
    descripcion: payload.metadata?.observacion
      ? String(payload.metadata.observacion)
      : `Registro de vinculacion ${payload.action.toLowerCase()}`,
    before: payload.before,
    after: payload.after,
    ip: null,
    user_agent: null
  });
};

export const listVinculaciones = async (
  filters: ListVinculacionesQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedVinculaciones> => {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (tenant && !tenant.isGlobalAdmin) {
    if (tenant.contratoIds.length === 0 && tenant.empresaIds.length === 0) {
      conditions.push('1 = 0');
    } else if (tenant.contratoIds.length > 0) {
      params.push(tenant.contratoIds);
      conditions.push(`v.contrato_id = ANY($${paramIndex}::bigint[])`);
      paramIndex += 1;
    } else if (tenant.empresaIds.length > 0) {
      params.push(tenant.empresaIds);
      conditions.push(`c.empresa_id = ANY($${paramIndex}::bigint[])`);
      paramIndex += 1;
    }
  }

  if (filters.persona_id !== undefined && filters.persona_id !== null) {
    params.push(filters.persona_id);
    conditions.push(`v.persona_id = $${paramIndex}::bigint`);
    paramIndex += 1;
  }

  if (filters.empresa_id !== undefined && filters.empresa_id !== null) {
    params.push(filters.empresa_id);
    conditions.push(`v.empresa_id = $${paramIndex}::bigint`);
    paramIndex += 1;
  }

  if (filters.contrato_id !== undefined && filters.contrato_id !== null) {
    params.push(filters.contrato_id);
    conditions.push(`v.contrato_id = $${paramIndex}::bigint`);
    paramIndex += 1;
  }

  if (filters.tipo_vinculacion_id !== undefined && filters.tipo_vinculacion_id !== null) {
    params.push(filters.tipo_vinculacion_id);
    conditions.push(`v.tipo_vinculacion_id = $${paramIndex}::bigint`);
    paramIndex += 1;
  }

  if (filters.contrato_cargo_id !== undefined && filters.contrato_cargo_id !== null) {
    params.push(filters.contrato_cargo_id);
    conditions.push(`v.contrato_cargo_id = $${paramIndex}::bigint`);
    paramIndex += 1;
  }

  if (filters.estado_vinculacion) {
    if (filters.estado_vinculacion === 'ACTIVA') {
      conditions.push(`v.estado_vinculacion IN ('ACTIVA', 'ACTIVO')`);
    } else {
      params.push(filters.estado_vinculacion);
      conditions.push(`v.estado_vinculacion = $${paramIndex}::text`);
      paramIndex += 1;
    }
  }

  if (filters.metodo_pago) {
    params.push(filters.metodo_pago);
    conditions.push(`v.metodo_pago = $${paramIndex}::text`);
    paramIndex += 1;
  }

  if (filters.fecha_inicio_desde) {
    params.push(filters.fecha_inicio_desde);
    conditions.push(`v.fecha_inicio >= $${paramIndex}`);
    paramIndex += 1;
  }

  if (filters.fecha_inicio_hasta) {
    params.push(filters.fecha_inicio_hasta);
    conditions.push(`v.fecha_inicio <= $${paramIndex}`);
    paramIndex += 1;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (filters.page - 1) * filters.limit;

  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM vinculaciones v
      INNER JOIN contratos c ON c.id = v.contrato_id
      ${whereClause}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const listParams = [...params, filters.limit, offset];
  const result = await dbQuery<VinculacionRow>(
    `
      ${getVinculacionSelect()}
      ${whereClause}
      ORDER BY v.fecha_inicio DESC, v.id DESC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `,
    listParams
  );

  return {
    items: result.rows.map(mapVinculacion),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / filters.limit)
    }
  };
};

export const listContractPersonal = async (
  filters: ListContractPersonalQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedContractPersonal> => {
  const client = await dbPool.connect();

  try {
    await ensureContractTenantAccess(client, tenant, filters.contrato_id);

    const consultaFecha = filters.fecha ?? new Date().toISOString().slice(0, 10);
    const conditions: string[] = ['v.contrato_id = $1::bigint', '$2::date IS NOT NULL'];
    const params: unknown[] = [filters.contrato_id, consultaFecha];
    let paramIndex = 3;

    appendContractOperationalScopeConditions(conditions, params, tenant, {
      vinculacionSql: 'v.id',
      contratoSql: 'v.contrato_id',
      startDateSql: '$2::date',
      endDateSql: '$2::date'
    });
    paramIndex = params.length + 1;

    if (filters.municipio_id !== undefined && filters.municipio_id !== null) {
      params.push(filters.municipio_id);
      conditions.push(`EXISTS (SELECT 1 FROM cobertura_asignaciones ca_f INNER JOIN focalizacion_final ff_f ON ff_f.id = ca_f.focalizacion_final_id WHERE ca_f.vinculacion_id = v.id AND ca_f.activo = TRUE AND ca_f.fecha_inicio <= $2::date AND (ca_f.fecha_fin IS NULL OR ca_f.fecha_fin >= $2::date) AND ff_f.municipio_id = $${paramIndex}::bigint)`);
      paramIndex += 1;
    }
    if (filters.institucion_id !== undefined && filters.institucion_id !== null) {
      params.push(filters.institucion_id);
      conditions.push(`EXISTS (SELECT 1 FROM cobertura_asignaciones ca_f INNER JOIN focalizacion_final ff_f ON ff_f.id = ca_f.focalizacion_final_id WHERE ca_f.vinculacion_id = v.id AND ca_f.activo = TRUE AND ca_f.fecha_inicio <= $2::date AND (ca_f.fecha_fin IS NULL OR ca_f.fecha_fin >= $2::date) AND ff_f.institucion_id = $${paramIndex}::bigint)`);
      paramIndex += 1;
    }
    if (filters.sede_id !== undefined && filters.sede_id !== null) {
      params.push(filters.sede_id);
      conditions.push(`EXISTS (SELECT 1 FROM cobertura_asignaciones ca_f INNER JOIN focalizacion_final ff_f ON ff_f.id = ca_f.focalizacion_final_id WHERE ca_f.vinculacion_id = v.id AND ca_f.activo = TRUE AND ca_f.fecha_inicio <= $2::date AND (ca_f.fecha_fin IS NULL OR ca_f.fecha_fin >= $2::date) AND ff_f.sede_id = $${paramIndex}::bigint)`);
      paramIndex += 1;
    }
    if (filters.modalidad_id !== undefined && filters.modalidad_id !== null) {
      params.push(filters.modalidad_id);
      conditions.push(`EXISTS (SELECT 1 FROM cobertura_asignaciones ca_f INNER JOIN focalizacion_final ff_f ON ff_f.id = ca_f.focalizacion_final_id WHERE ca_f.vinculacion_id = v.id AND ca_f.activo = TRUE AND ca_f.fecha_inicio <= $2::date AND (ca_f.fecha_fin IS NULL OR ca_f.fecha_fin >= $2::date) AND ff_f.modalidad_id = $${paramIndex}::bigint)`);
      paramIndex += 1;
    }
    if (filters.modalidad_codigo) {
      params.push(filters.modalidad_codigo);
      conditions.push(`EXISTS (SELECT 1 FROM cobertura_asignaciones ca_f INNER JOIN focalizacion_final ff_f ON ff_f.id = ca_f.focalizacion_final_id INNER JOIN modalidades m_f ON m_f.id = ff_f.modalidad_id WHERE ca_f.vinculacion_id = v.id AND ca_f.activo = TRUE AND ca_f.fecha_inicio <= $2::date AND (ca_f.fecha_fin IS NULL OR ca_f.fecha_fin >= $2::date) AND (m_f.codigo_base = $${paramIndex} OR m_f.codigo_original = $${paramIndex} OR m_f.nombre_modalidad = $${paramIndex}))`);
      paramIndex += 1;
    }
    if (filters.ubicacion_laboral_id !== undefined && filters.ubicacion_laboral_id !== null) {
      params.push(filters.ubicacion_laboral_id);
      conditions.push(`EXISTS (SELECT 1 FROM personal_asignaciones_laborales pal_f WHERE pal_f.vinculacion_id = v.id AND pal_f.ubicacion_laboral_id = $${paramIndex}::bigint AND pal_f.estado = 'ACTIVA' AND pal_f.vigencia_desde <= $2::date AND (pal_f.vigencia_hasta IS NULL OR pal_f.vigencia_hasta >= $2::date))`);
      paramIndex += 1;
    }

    if (filters.cobertura === 'SI') { conditions.push(`EXISTS (SELECT 1 FROM cobertura_asignaciones ca_f WHERE ca_f.vinculacion_id = v.id AND ca_f.activo = TRUE AND ca_f.fecha_inicio <= $2::date AND (ca_f.fecha_fin IS NULL OR ca_f.fecha_fin >= $2::date))`); }
    if (filters.cobertura === 'NO') { conditions.push(`NOT EXISTS (SELECT 1 FROM cobertura_asignaciones ca_f WHERE ca_f.vinculacion_id = v.id AND ca_f.activo = TRUE AND ca_f.fecha_inicio <= $2::date AND (ca_f.fecha_fin IS NULL OR ca_f.fecha_fin >= $2::date))`); }
    if (filters.cobertura === 'RETIRADA') { conditions.push('v.fecha_fin IS NOT NULL AND v.fecha_fin < $2::date'); }
    if (filters.licitacion === 'PRESENTADA') { conditions.push("EXISTS (SELECT 1 FROM personal_presentaciones_licitacion ppl_f WHERE ppl_f.vinculacion_id = v.id AND ppl_f.estado = 'PRESENTADA' AND ppl_f.vigencia_desde <= $2::date AND (ppl_f.vigencia_hasta IS NULL OR ppl_f.vigencia_hasta >= $2::date))"); }
    if (filters.licitacion === 'NO_PRESENTADA') { conditions.push("NOT EXISTS (SELECT 1 FROM personal_presentaciones_licitacion ppl_f WHERE ppl_f.vinculacion_id = v.id AND ppl_f.estado = 'PRESENTADA' AND ppl_f.vigencia_desde <= $2::date AND (ppl_f.vigencia_hasta IS NULL OR ppl_f.vigencia_hasta >= $2::date))"); }

    if (filters.estado_vinculacion) {
      if (filters.estado_vinculacion === 'ACTIVA') {
        conditions.push("v.estado_vinculacion = ANY(ARRAY['ACTIVA', 'ACTIVO']) AND v.fecha_inicio <= $2::date AND (v.fecha_fin IS NULL OR v.fecha_fin >= $2::date)");
      } else if (filters.estado_vinculacion === 'RETIRADA') {
        conditions.push('v.fecha_fin IS NOT NULL AND v.fecha_fin < $2::date');
      } else if (filters.estado_vinculacion === 'SUSPENDIDA') {
        conditions.push("v.estado_vinculacion = 'SUSPENDIDA' AND v.fecha_inicio <= $2::date AND (v.fecha_fin IS NULL OR v.fecha_fin >= $2::date)");
      }
    }

    if (filters.gestor_usuario_id !== undefined && filters.gestor_usuario_id !== null) {
      params.push(filters.gestor_usuario_id);
      conditions.push(buildGestorScopeExistsSql(`$${paramIndex}`, 'v.id', 'v.contrato_id', '$2::date', '$2::date'));
      paramIndex += 1;
    }

    if (filters.sin_gestor === true) {
      conditions.push(`NOT ${buildAnyGestorScopeExistsSql('v.id', 'v.contrato_id', '$2::date', '$2::date')}`);
    }

    if (filters.search) {
      params.push(`%${filters.search}%`);
      conditions.push(`(
        p.numero_documento ILIKE $${paramIndex}
        OR p.primer_nombre ILIKE $${paramIndex}
        OR COALESCE(p.segundo_nombre, '') ILIKE $${paramIndex}
        OR p.primer_apellido ILIKE $${paramIndex}
        OR COALESCE(p.segundo_apellido, '') ILIKE $${paramIndex}
      )`);
      paramIndex += 1;
    }

    if (filters.contrato_cargo_id !== undefined && filters.contrato_cargo_id !== null) {
      params.push(filters.contrato_cargo_id);
      conditions.push(`v.contrato_cargo_id = $${paramIndex}::bigint`);
      paramIndex += 1;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const countResult = await client.query<CountRow>(
      `
        SELECT COUNT(*)::int AS total, COUNT(DISTINCT v.persona_id)::int AS personas_total
        FROM vinculaciones v
        INNER JOIN personas p ON p.id = v.persona_id
        ${whereClause}
      `,
      params
    );

    const total = countResult.rows[0]?.total ?? 0;
    const personasTotal = countResult.rows[0]?.personas_total ?? total;
    const offset = (filters.page - 1) * filters.limit;
    const listParams = [...params, filters.limit, offset];
    const result = await client.query<ContractPersonalRow>(
      `
        WITH cobertura_actual AS (
          SELECT DISTINCT ON (ca.vinculacion_id)
            ca.vinculacion_id,
            ca.institucion,
            ca.sede,
            ca.modalidad,
            ff.municipio_id AS municipio_actual_id,
            COALESCE(ff.municipio_texto, mu.nombre_municipio) AS municipio_actual
          FROM cobertura_asignaciones ca
          INNER JOIN focalizacion_final ff ON ff.id = ca.focalizacion_final_id
          LEFT JOIN municipios mu ON mu.id = ff.municipio_id
          WHERE ca.activo = TRUE
            AND ca.fecha_inicio <= DATE '${consultaFecha}'
            AND (ca.fecha_fin IS NULL OR ca.fecha_fin >= DATE '${consultaFecha}')
          ORDER BY ca.vinculacion_id, ca.fecha_inicio DESC, ca.id DESC
        ),
        asignacion_laboral_actual AS (
          SELECT DISTINCT ON (pal.vinculacion_id)
            pal.vinculacion_id,
            cul.nombre_ubicacion
          FROM personal_asignaciones_laborales pal
          INNER JOIN contrato_ubicaciones_laborales cul ON cul.id = pal.ubicacion_laboral_id
          WHERE pal.estado = 'ACTIVA'
            AND pal.vigencia_desde <= DATE '${consultaFecha}'
            AND (pal.vigencia_hasta IS NULL OR pal.vigencia_hasta >= DATE '${consultaFecha}')
          ORDER BY pal.vinculacion_id, pal.vigencia_desde DESC, pal.id DESC
        ),
        presentacion_licitacion_actual AS (
          SELECT DISTINCT ON (ppl.vinculacion_id)
            ppl.vinculacion_id,
            TRUE AS presentada_licitacion_actual,
            cpl.nombre_perfil AS perfil_licitacion_actual
          FROM personal_presentaciones_licitacion ppl
          INNER JOIN contrato_perfiles_licitacion cpl ON cpl.id = ppl.perfil_licitacion_id
          WHERE ppl.estado = 'PRESENTADA'
            AND ppl.vigencia_desde <= DATE '${consultaFecha}'
            AND (ppl.vigencia_hasta IS NULL OR ppl.vigencia_hasta >= DATE '${consultaFecha}')
          ORDER BY ppl.vinculacion_id, ppl.vigencia_desde DESC, ppl.id DESC
        ),
        gestor_actual AS (
          SELECT DISTINCT ON (scope.vinculacion_id)
            scope.vinculacion_id,
            scope.usuario_id AS gestor_actual_usuario_id,
            scope.nombre_completo AS gestor_actual_nombre
          FROM (
            SELECT
              gpa.vinculacion_id,
              gpa.usuario_id,
              u.nombre_completo,
              gpa.vigencia_desde,
              gpa.id,
              0 AS prioridad
            FROM gestor_personal_asignaciones gpa
            INNER JOIN usuarios u ON u.id = gpa.usuario_id
            WHERE COALESCE(gpa.activo, TRUE) = TRUE
              AND gpa.contrato_id = $1::bigint
              AND gpa.vigencia_desde <= DATE '${consultaFecha}'
              AND (gpa.vigencia_hasta IS NULL OR gpa.vigencia_hasta >= DATE '${consultaFecha}')
            UNION ALL
            SELECT
              ca_scope.vinculacion_id,
              gma.usuario_id,
              u.nombre_completo,
              gma.vigencia_desde,
              gma.id,
              1 AS prioridad
            FROM gestor_municipio_asignaciones gma
            INNER JOIN usuarios u ON u.id = gma.usuario_id
            INNER JOIN cobertura_asignaciones ca_scope
              ON ca_scope.contrato_id = gma.contrato_id
             AND COALESCE(ca_scope.activo, TRUE) = TRUE
             AND ca_scope.fecha_inicio <= DATE '${consultaFecha}'
             AND (ca_scope.fecha_fin IS NULL OR ca_scope.fecha_fin >= DATE '${consultaFecha}')
            INNER JOIN focalizacion_final ff_scope
              ON ff_scope.id = ca_scope.focalizacion_final_id
             AND ff_scope.municipio_id = gma.municipio_id
            WHERE COALESCE(gma.activo, TRUE) = TRUE
              AND COALESCE(gma.alcance_personal, '${GESTOR_SCOPE_SELECTED}') = '${GESTOR_SCOPE_ALL}'
              AND gma.contrato_id = $1::bigint
              AND gma.vigencia_desde <= DATE '${consultaFecha}'
              AND (gma.vigencia_hasta IS NULL OR gma.vigencia_hasta >= DATE '${consultaFecha}')
          ) scope
          ORDER BY scope.vinculacion_id, scope.prioridad ASC, scope.vigencia_desde DESC, scope.id DESC
        )
        SELECT
          v.id AS vinculacion_id,
          v.persona_id,
          v.empresa_id,
          v.contrato_id,
          v.fecha_inicio,
          v.fecha_fin,
          v.estado_vinculacion,
          p.id AS persona_id,
          p.numero_documento,
          p.primer_nombre,
          p.segundo_nombre,
          p.primer_apellido,
          p.segundo_apellido,
          cc.nombre_cargo AS cargo_nombre,
          (
            COALESCE(cc.aplica_cobertura, FALSE)
            AND LOWER(COALESCE(cc.nombre_cargo, '')) LIKE '%manipulad%'
          ) AS es_manipuladora,
          ala.nombre_ubicacion AS asignacion_laboral_actual,
          caa.institucion AS institucion_actual,
          caa.municipio_actual_id,
          caa.municipio_actual,
          caa.sede AS sede_actual,
          caa.modalidad AS modalidad_actual,
          ga.gestor_actual_usuario_id,
          ga.gestor_actual_nombre,
          COALESCE(pla.presentada_licitacion_actual, FALSE) AS presentada_licitacion_actual,
          pla.perfil_licitacion_actual
        FROM vinculaciones v
        INNER JOIN personas p ON p.id = v.persona_id
        LEFT JOIN contrato_cargos cc ON cc.id = v.contrato_cargo_id
        LEFT JOIN cobertura_actual caa ON caa.vinculacion_id = v.id
        LEFT JOIN asignacion_laboral_actual ala ON ala.vinculacion_id = v.id
        LEFT JOIN presentacion_licitacion_actual pla ON pla.vinculacion_id = v.id
        LEFT JOIN gestor_actual ga ON ga.vinculacion_id = v.id
        ${whereClause}
        ORDER BY v.fecha_inicio DESC, p.primer_apellido ASC, p.primer_nombre ASC, v.id DESC
        LIMIT $${listParams.length - 1}::int
        OFFSET $${listParams.length}::int
      `,
      listParams
    );

    return {
      items: result.rows.map(mapContractPersonal),
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        personas_total: personasTotal,
        total_pages: total === 0 ? 0 : Math.ceil(total / filters.limit)
      }
    };
  } finally {
    client.release();
  }
};

export interface ContractPersonalFilterOptions {
  gestores: Array<{ id: number; nombre: string; roles: string[] }>;
  municipios: Array<{ id: number; nombre: string }>;
  instituciones: Array<{ id: number; nombre: string; municipio_id: number | null }>;
  sedes: Array<{ id: number; nombre: string; institucion_id: number | null }>;
  modalidades: Array<{ id: number; codigo: string | null; nombre: string }>;
  ubicaciones_laborales: Array<{ id: number; nombre: string }>;
}

interface GestorUserRow extends QueryResultRow {
  active: boolean;
  id: number | string;
  name: string | null;
  roles: string[] | null;
}

interface GestorMunicipioAssignmentRow extends QueryResultRow {
  activo: boolean;
  alcance_personal: GestorMunicipioPersonalScope | null;
  contrato_id: number | string;
  created_at: Date | string;
  created_by_user_id: number | string | null;
  departamento_id: number | string | null;
  departamento_nombre: string | null;
  gestor_nombre: string | null;
  id: number | string;
  municipio_id: number | string;
  municipio_nombre: string | null;
  observacion: string | null;
  updated_at: Date | string;
  updated_by_user_id: number | string | null;
  usuario_id: number | string;
  vigencia_desde: Date | string;
  vigencia_hasta: Date | string | null;
}

interface GestorPersonalAssignmentRow extends QueryResultRow {
  activo: boolean;
  contrato_id: number | string;
  created_at: Date | string;
  created_by_user_id: number | string | null;
  gestor_nombre: string | null;
  id: number | string;
  municipio_id: number | string | null;
  municipio_nombre: string | null;
  observacion: string | null;
  updated_at: Date | string;
  updated_by_user_id: number | string | null;
  usuario_id: number | string;
  vinculacion_id: number | string;
  vigencia_desde: Date | string;
  vigencia_hasta: Date | string | null;
  trabajador_documento: string | null;
  trabajador_nombre: string | null;
}

export interface GestorAssignmentUser {
  activo: boolean;
  id: number;
  nombre: string;
  roles: string[];
}

export interface GestorMunicipioAssignment {
  activo: boolean;
  alcance_personal: GestorMunicipioPersonalScope;
  contrato_id: number;
  created_at: string;
  created_by_user_id: number | null;
  gestor: {
    id: number;
    nombre: string | null;
  };
  id: number;
  municipio: {
    id: number;
    nombre: string | null;
    departamento_id: number | null;
    departamento_nombre: string | null;
  };
  observacion: string | null;
  updated_at: string;
  updated_by_user_id: number | null;
  vigencia_desde: string;
  vigencia_hasta: string | null;
}

export interface GestorPersonalAssignment {
  activo: boolean;
  contrato_id: number;
  created_at: string;
  created_by_user_id: number | null;
  gestor: {
    id: number;
    nombre: string | null;
  };
  id: number;
  municipio: {
    id: number | null;
    nombre: string | null;
  } | null;
  observacion: string | null;
  trabajador: {
    documento: string | null;
    nombre_completo: string | null;
    vinculacion_id: number;
  };
  updated_at: string;
  updated_by_user_id: number | null;
  vigencia_desde: string;
  vigencia_hasta: string | null;
}

export interface GestorAssignmentWorkspace {
  fecha_consulta: string;
  gestor_seleccionado_id: number | null;
  gestores: GestorAssignmentUser[];
  items: ContractPersonalListItem[];
  municipio_seleccionado_id: number | null;
  municipios: Array<{ id: number; nombre: string }>;
  resumen: {
    asignados_a_gestor: number;
    sin_gestor: number;
    total_trabajadores: number;
  };
}

export interface SaveGestorAssignmentsResult {
  asignados: number;
  desasignados: number;
  fecha_efectiva: string;
  gestor_usuario_id: number;
  municipio_id: number;
}

export interface GestorMunicipiosResponse {
  fecha_consulta: string;
  gestor_usuario_id: number | null;
  gestores: GestorAssignmentUser[];
  items: GestorMunicipioAssignment[];
}

export interface GestorPersonalHistoryResponse {
  fecha_consulta: string;
  historial: GestorPersonalAssignment[];
  vinculacion_id: number;
}

export const getPersonalResumen = async (
  filters: PersonalResumenQuery,
  tenant?: TenantAccessContext
): Promise<PersonalResumen> => {
  const client = await dbPool.connect();
  try {
    await ensureContractTenantAccess(client, tenant, filters.contrato_id);
    const fecha = filters.fecha ?? new Date().toISOString().slice(0, 10);
    const conditions = ['v.contrato_id = $1::bigint'];
    const params: unknown[] = [filters.contrato_id, fecha];
    appendContractOperationalScopeConditions(conditions, params, tenant, {
      vinculacionSql: 'v.id',
      contratoSql: 'v.contrato_id',
      startDateSql: '$2::date',
      endDateSql: '$2::date'
    });
    const whereSql = `WHERE ${conditions.join(' AND ')}`;
    const result = await client.query<{ trabajadores_activos: number; ingresos_mes: number; retiros_mes: number; vacantes: number }>(
      `WITH periodo AS (
         SELECT date_trunc('month', $2::date)::date AS inicio, (date_trunc('month', $2::date) + interval '1 month')::date AS siguiente
       ),
       cobertura AS (
         SELECT
           ff.id,
           COALESCE(ff.cobertura_requerida, 0)::numeric AS requeridas,
           COALESCE(
             SUM(
               CASE
                 WHEN ca.id IS NOT NULL
                   AND ca.activo = TRUE
                   AND ca.fecha_inicio <= $2::date
                   AND (ca.fecha_fin IS NULL OR ca.fecha_fin >= $2::date)
                   AND vca.fecha_inicio <= $2::date
                   AND (vca.fecha_fin IS NULL OR vca.fecha_fin >= $2::date)
                 THEN COALESCE(ca.porcentaje_cobertura, 0)
                 ELSE 0
               END
             ),
             0
           )::numeric AS asignadas
         FROM focalizacion_final ff
         LEFT JOIN cobertura_asignaciones ca ON ca.focalizacion_final_id = ff.id
         LEFT JOIN vinculaciones vca ON vca.id = ca.vinculacion_id AND vca.contrato_id = $1
         WHERE ff.contrato_id = $1
           AND COALESCE(ff.activo, TRUE) = TRUE
         GROUP BY ff.id, ff.cobertura_requerida
       )
       SELECT
         COUNT(*) FILTER (WHERE v.fecha_inicio <= $2::date AND (v.fecha_fin IS NULL OR v.fecha_fin >= $2::date))::int AS trabajadores_activos,
         COUNT(*) FILTER (WHERE v.fecha_inicio >= periodo.inicio AND v.fecha_inicio < periodo.siguiente)::int AS ingresos_mes,
         COUNT(*) FILTER (WHERE v.fecha_fin >= periodo.inicio AND v.fecha_fin < periodo.siguiente)::int AS retiros_mes,
         COALESCE((SELECT SUM(GREATEST(requeridas - asignadas, 0)) FROM cobertura), 0)::int AS vacantes
       FROM vinculaciones v
       CROSS JOIN periodo
       ${whereSql}`,
      params
    );
    const row = result.rows[0];
    return {
      fecha_consulta: fecha,
      trabajadores_activos: Number(row?.trabajadores_activos ?? 0),
      ingresos_mes: Number(row?.ingresos_mes ?? 0),
      retiros_mes: Number(row?.retiros_mes ?? 0),
      vacantes: Number(row?.vacantes ?? 0)
    };
  } finally {
    client.release();
  }
};

const ensureVinculacionBelongsContrato = async (
  client: PoolClient,
  contratoId: number,
  vinculacionId: number
): Promise<void> => {
  const result = await client.query<ExistsRow>(
    `
      SELECT EXISTS(
        SELECT 1
        FROM vinculaciones
        WHERE id = $1::bigint
          AND contrato_id = $2::bigint
      ) AS exists
    `,
    [vinculacionId, contratoId]
  );

  if (!result.rows[0]?.exists) {
    throw new AppError(
      'Vinculacion not found for contrato',
      404,
      'VINCULACION_CONTRATO_NOT_FOUND'
    );
  }
};

const closeOpenGestorMunicipioAssignments = async (
  client: PoolClient,
  input: {
    actorUserId: number;
    contrato_id: number;
    gestor_usuario_id: number;
    municipio_id: number;
    observacion: string | null;
    vigencia_hasta: string;
  }
): Promise<number> => {
  const result = await client.query<AssignmentMutationRow>(
    `
      UPDATE gestor_municipio_asignaciones
      SET
        vigencia_hasta = CASE
          WHEN vigencia_desde > $5::date THEN vigencia_desde
          ELSE $5::date
        END,
        activo = FALSE,
        observacion = COALESCE($6, observacion),
        updated_by_user_id = $1::bigint,
        updated_at = NOW()
      WHERE contrato_id = $2::bigint
        AND usuario_id = $3::bigint
        AND municipio_id = $4::bigint
        AND COALESCE(activo, TRUE) = TRUE
        AND (vigencia_hasta IS NULL OR vigencia_hasta > $5::date)
      RETURNING id
    `,
    [
      input.actorUserId,
      input.contrato_id,
      input.gestor_usuario_id,
      input.municipio_id,
      input.vigencia_hasta,
      input.observacion
    ]
  );

  return result.rowCount ?? 0;
};

const closeOpenGestorPersonalAssignments = async (
  client: PoolClient,
  input: {
    actorUserId: number;
    contrato_id: number;
    vinculacion_id: number;
    observacion: string | null;
    vigencia_hasta: string;
  }
): Promise<number> => {
  const result = await client.query<AssignmentMutationRow>(
    `
      UPDATE gestor_personal_asignaciones
      SET
        vigencia_hasta = CASE
          WHEN vigencia_desde > $4::date THEN vigencia_desde
          ELSE $4::date
        END,
        activo = FALSE,
        observacion = COALESCE($5, observacion),
        updated_by_user_id = $1::bigint,
        updated_at = NOW()
      WHERE contrato_id = $2::bigint
        AND vinculacion_id = $3::bigint
        AND COALESCE(activo, TRUE) = TRUE
        AND (vigencia_hasta IS NULL OR vigencia_hasta > $4::date)
      RETURNING id
    `,
    [
      input.actorUserId,
      input.contrato_id,
      input.vinculacion_id,
      input.vigencia_hasta,
      input.observacion
    ]
  );

  return result.rowCount ?? 0;
};

const createGestorMunicipioAssignmentRecord = async (
  client: PoolClient,
  input: {
    actorUserId: number;
    contrato_id: number;
    gestor_usuario_id: number;
    municipio_id: number;
    alcance_personal: GestorMunicipioPersonalScope;
    observacion: string | null;
    vigencia_desde: string;
  }
): Promise<void> => {
  await client.query(
    `
      INSERT INTO gestor_municipio_asignaciones (
        usuario_id,
        contrato_id,
        municipio_id,
        alcance_personal,
        vigencia_desde,
        vigencia_hasta,
        activo,
        observacion,
        created_by_user_id,
        updated_by_user_id
      )
      VALUES (
        $1::bigint,
        $2::bigint,
        $3::bigint,
        $4,
        $5::date,
        NULL,
        TRUE,
        $6,
        $7::bigint,
        $7::bigint
      )
    `,
    [
      input.gestor_usuario_id,
      input.contrato_id,
      input.municipio_id,
      input.alcance_personal,
      input.vigencia_desde,
      input.observacion,
      input.actorUserId
    ]
  );
};

const createGestorPersonalAssignmentRecord = async (
  client: PoolClient,
  input: {
    actorUserId: number;
    contrato_id: number;
    gestor_usuario_id: number;
    municipio_id: number;
    observacion: string | null;
    vigencia_desde: string;
    vinculacion_id: number;
  }
): Promise<void> => {
  await client.query(
    `
      INSERT INTO gestor_personal_asignaciones (
        usuario_id,
        contrato_id,
        vinculacion_id,
        municipio_id,
        vigencia_desde,
        vigencia_hasta,
        activo,
        observacion,
        created_by_user_id,
        updated_by_user_id
      )
      VALUES (
        $1::bigint,
        $2::bigint,
        $3::bigint,
        $4::bigint,
        $5::date,
        NULL,
        TRUE,
        $6,
        $7::bigint,
        $7::bigint
      )
    `,
    [
      input.gestor_usuario_id,
      input.contrato_id,
      input.vinculacion_id,
      input.municipio_id,
      input.vigencia_desde,
      input.observacion,
      input.actorUserId
    ]
  );
};
export const getContractPersonalFilterOptions = async (
  contratoId: number,
  filters: { municipio_id?: number | null; institucion_id?: number | null; sede_id?: number | null; fecha?: string },
  tenant?: TenantAccessContext
): Promise<ContractPersonalFilterOptions> => {
  const client = await dbPool.connect();
  try {
    await ensureContractTenantAccess(client, tenant, contratoId);
    const fecha = filters.fecha ?? new Date().toISOString().slice(0, 10);
    const managedMunicipioFilter =
      tenant && !tenant.isGlobalAdmin && tenant.userId && (isScopedGestorTenant(tenant) || isScopedTalentoHumanoTenant(tenant))
        ? `
        AND EXISTS (
          SELECT 1
          FROM gestor_municipio_asignaciones gma_scope
          WHERE gma_scope.contrato_id = ff.contrato_id
            AND gma_scope.usuario_id = $5::bigint
            AND gma_scope.municipio_id = ff.municipio_id
            AND COALESCE(gma_scope.activo, TRUE) = TRUE
            AND gma_scope.vigencia_desde <= $6::date
            AND (gma_scope.vigencia_hasta IS NULL OR gma_scope.vigencia_hasta >= $6::date)
        )
      `
        : '';
    const base = `
      FROM focalizacion_final ff
      LEFT JOIN municipios mu ON mu.id = ff.municipio_id
      LEFT JOIN departamentos dep ON dep.id = mu.departamento_id
      LEFT JOIN instituciones ins ON ins.id = ff.institucion_id
      LEFT JOIN sedes se ON se.id = ff.sede_id
      LEFT JOIN modalidades mo ON mo.id = ff.modalidad_id
      WHERE ff.contrato_id = $1::bigint AND ff.activo = TRUE
        AND ($2::bigint IS NULL OR ff.municipio_id = $2::bigint)
        AND ($3::bigint IS NULL OR ff.institucion_id = $3::bigint)
        AND ($4::bigint IS NULL OR ff.sede_id = $4::bigint)
        ${managedMunicipioFilter}
    `;
    const params = [
      contratoId,
      filters.municipio_id ?? null,
      filters.institucion_id ?? null,
      filters.sede_id ?? null,
      tenant?.userId ?? null,
      fecha
    ];
    const [gestores, municipios, instituciones, sedes, modalidades, ubicaciones] = await Promise.all([
      listGestorAssignableUsers(client),
      client.query<{ id: number; nombre: string; departamento_id: number | null; departamento_nombre: string | null }>(`SELECT DISTINCT mu.id::int AS id, mu.nombre_municipio AS nombre, mu.departamento_id::int AS departamento_id, dep.nombre_departamento AS departamento_nombre ${base} ORDER BY nombre`, params),
      client.query<{ id: number; nombre: string; municipio_id: number | null }>(`SELECT DISTINCT ins.id::int AS id, ins.nombre_institucion AS nombre, ins.municipio_id::int AS municipio_id ${base} ORDER BY nombre`, params),
      client.query<{ id: number; nombre: string; institucion_id: number | null }>(`SELECT DISTINCT se.id::int AS id, se.nombre_sede AS nombre, se.institucion_id::int AS institucion_id ${base} ORDER BY nombre`, params),
      client.query<{ id: number; codigo: string | null; nombre: string }>(`SELECT DISTINCT mo.id::int AS id, COALESCE(mo.codigo_base, mo.codigo_original) AS codigo, mo.nombre_modalidad AS nombre ${base} ORDER BY nombre`, params),
      client.query<{ id: number; nombre: string }>(`SELECT id::int AS id, nombre_ubicacion AS nombre FROM contrato_ubicaciones_laborales WHERE contrato_id = $1::bigint AND activo = TRUE ORDER BY nombre`, [contratoId])
    ]);
    return {
      gestores: gestores
        .map((item) => ({
          id: item.id,
          nombre: item.nombre,
          roles: item.roles
        }))
        .sort((left, right) => left.nombre.localeCompare(right.nombre, 'es')),
      municipios: municipios.rows,
      instituciones: instituciones.rows,
      sedes: sedes.rows,
      modalidades: modalidades.rows,
      ubicaciones_laborales: ubicaciones.rows
    };
  } finally {
    client.release();
  }
};

export const listGestores = async (
  query: ListGestorMunicipiosQuery,
  tenant?: TenantAccessContext
): Promise<GestorAssignmentUser[]> => {
  const client = await dbPool.connect();
  try {
    await ensureContractTenantAccess(client, tenant, query.contrato_id);
    return await listGestorAssignableUsers(client);
  } finally {
    client.release();
  }
};

export const listGestorMunicipios = async (
  query: ListGestorMunicipiosQuery,
  tenant?: TenantAccessContext
): Promise<GestorMunicipiosResponse> => {
  const client = await dbPool.connect();
  try {
    await ensureContractTenantAccess(client, tenant, query.contrato_id);
    const fechaConsulta = toIsoDate(query.fecha);

    const [gestores, items] = await Promise.all([
      listGestorAssignableUsers(client),
      getGestorMunicipioAssignments(client, {
        contrato_id: query.contrato_id,
        gestor_usuario_id: query.gestor_usuario_id,
        fecha: fechaConsulta,
        onlyActive: true
      })
    ]);

    return {
      fecha_consulta: fechaConsulta,
      gestor_usuario_id: query.gestor_usuario_id ?? null,
      gestores,
      items
    };
  } finally {
    client.release();
  }
};

export const getGestorAssignmentWorkspace = async (
  query: GestorAssignmentWorkspaceQuery,
  tenant?: TenantAccessContext
): Promise<GestorAssignmentWorkspace> => {
  const fechaConsulta = toIsoDate(query.fecha);
  const [gestores, municipios, items, sinGestorItems, asignados] = await Promise.all([
    listGestores({ contrato_id: query.contrato_id, fecha: fechaConsulta }, tenant),
    getContractPersonalFilterOptions(
      query.contrato_id,
      { municipio_id: query.municipio_id ?? null, fecha: fechaConsulta },
      tenant
    ),
    listContractPersonal(
      {
        contrato_id: query.contrato_id,
        municipio_id: query.municipio_id,
        search: query.search,
        fecha: fechaConsulta,
        page: 1,
        limit: 5000
      },
      tenant
    ),
    listContractPersonal(
      {
        contrato_id: query.contrato_id,
        municipio_id: query.municipio_id,
        search: query.search,
        fecha: fechaConsulta,
        sin_gestor: true,
        page: 1,
        limit: 5000
      },
      tenant
    ),
    query.gestor_usuario_id
      ? listContractPersonal(
          {
            contrato_id: query.contrato_id,
            municipio_id: query.municipio_id,
            gestor_usuario_id: query.gestor_usuario_id,
            fecha: fechaConsulta,
            page: 1,
            limit: 5000
          },
          tenant
        )
      : Promise.resolve({
          items: [],
          pagination: { page: 1, limit: 0, total: 0, total_pages: 0, personas_total: 0 }
        } satisfies PaginatedContractPersonal)
  ]);

  return {
    fecha_consulta: fechaConsulta,
    gestor_seleccionado_id: query.gestor_usuario_id ?? null,
    gestores,
    municipio_seleccionado_id: query.municipio_id ?? null,
    municipios: municipios.municipios,
    items: items.items,
    resumen: {
      total_trabajadores: items.pagination.personas_total ?? items.pagination.total,
      sin_gestor: sinGestorItems.pagination.personas_total ?? sinGestorItems.pagination.total,
      asignados_a_gestor: asignados.pagination.personas_total ?? asignados.pagination.total
    }
  };
};

export const createGestorMunicipioAssignment = async (
  input: CreateGestorMunicipioAssignmentInput,
  actorUserId: number,
  tenant?: TenantAccessContext
): Promise<GestorMunicipioAssignment> => {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    await ensureContractTenantAccess(client, tenant, input.contrato_id);
    await ensureTerritorialAssignmentUserExists(client, input.gestor_usuario_id, input.contrato_id);
    await ensureMunicipioExists(client, input.municipio_id);
    await ensureMunicipioDepartamentoMatch(client, input.municipio_id, input.departamento_id);
    await ensureMunicipioBelongsContratoScope(client, input.contrato_id, input.municipio_id);

    const vigenciaDesde = toIsoDate(input.vigencia_desde);

    await closeOpenGestorMunicipioAssignments(client, {
      actorUserId,
      contrato_id: input.contrato_id,
      gestor_usuario_id: input.gestor_usuario_id,
      municipio_id: input.municipio_id,
      vigencia_hasta: shiftIsoDate(vigenciaDesde, -1),
      observacion: input.observacion
    });

    await createGestorMunicipioAssignmentRecord(client, {
      actorUserId,
      contrato_id: input.contrato_id,
      gestor_usuario_id: input.gestor_usuario_id,
      municipio_id: input.municipio_id,
      alcance_personal: input.alcance_personal,
      vigencia_desde: vigenciaDesde,
      observacion: input.observacion
    });

    const created = (
      await getGestorMunicipioAssignments(client, {
        contrato_id: input.contrato_id,
        gestor_usuario_id: input.gestor_usuario_id,
        fecha: vigenciaDesde,
        onlyActive: true
      })
    ).find((item) => item.municipio.id === input.municipio_id);

    await registerAuditEntry({
      client,
      usuario_id: String(actorUserId),
      accion: 'GESTOR_MUNICIPIO_ASSIGN',
      tabla: 'gestor_municipio_asignaciones',
      registro_id: created ? String(created.id) : `${input.gestor_usuario_id}:${input.municipio_id}`,
      descripcion: `Asignacion de municipio ${input.municipio_id} al gestor ${input.gestor_usuario_id}`,
      before: null,
      after: created ?? input,
      ip: null,
      user_agent: null
    });

    await client.query('COMMIT');

    if (!created) {
      throw new AppError(
        'Failed to load created gestor municipio assignment',
        500,
        'GESTOR_MUNICIPIO_ASSIGNMENT_CREATE_FAILED'
      );
    }

    return created;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const closeGestorMunicipioAssignment = async (
  assignmentId: number,
  input: CloseGestorAssignmentInput,
  actorUserId: number,
  tenant?: TenantAccessContext
): Promise<GestorMunicipioAssignment> => {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<GestorMunicipioAssignmentRow>(
      `
        SELECT
          gma.id,
          gma.usuario_id,
          u.nombre_completo AS gestor_nombre,
          gma.contrato_id,
          gma.municipio_id,
          gma.alcance_personal,
          mu.nombre_municipio AS municipio_nombre,
          gma.vigencia_desde,
          gma.vigencia_hasta,
          COALESCE(gma.activo, TRUE) AS activo,
          gma.observacion,
          gma.created_by_user_id,
          gma.created_at,
          gma.updated_by_user_id,
          gma.updated_at
        FROM gestor_municipio_asignaciones gma
        INNER JOIN usuarios u ON u.id = gma.usuario_id
        INNER JOIN municipios mu ON mu.id = gma.municipio_id
        WHERE gma.id = $1::bigint
        LIMIT 1
        FOR UPDATE
      `,
      [assignmentId]
    );

    const current = result.rows[0];

    if (!current) {
      throw new AppError('Gestor municipio assignment not found', 404, 'GESTOR_MUNICIPIO_ASSIGNMENT_NOT_FOUND');
    }

    await ensureContractTenantAccess(client, tenant, toNumber(current.contrato_id));

    await client.query(
      `
        UPDATE gestor_municipio_asignaciones
        SET
          vigencia_hasta = CASE
            WHEN vigencia_desde > $2::date THEN vigencia_desde
            ELSE $2::date
          END,
          activo = FALSE,
          observacion = COALESCE($3, observacion),
          updated_by_user_id = $4::bigint,
          updated_at = NOW()
        WHERE id = $1::bigint
      `,
      [assignmentId, input.vigencia_hasta, input.observacion, actorUserId]
    );

    const updated = (
      await getGestorMunicipioAssignments(client, {
        contrato_id: toNumber(current.contrato_id),
        gestor_usuario_id: toNumber(current.usuario_id)
      })
    ).find((item) => item.id === assignmentId);

    await registerAuditEntry({
      client,
      usuario_id: String(actorUserId),
      accion: 'GESTOR_MUNICIPIO_CLOSE',
      tabla: 'gestor_municipio_asignaciones',
      registro_id: String(assignmentId),
      descripcion: `Cierre de asignacion municipal ${assignmentId}`,
      before: mapGestorMunicipioAssignment(current),
      after: updated ?? null,
      ip: null,
      user_agent: null
    });

    await client.query('COMMIT');

    if (!updated) {
      throw new AppError(
        'Failed to load closed gestor municipio assignment',
        500,
        'GESTOR_MUNICIPIO_ASSIGNMENT_CLOSE_FAILED'
      );
    }

    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const saveGestorAssignments = async (
  input: SaveGestorAssignmentsInput,
  actorUserId: number,
  tenant?: TenantAccessContext
): Promise<SaveGestorAssignmentsResult> => {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    await ensureContractTenantAccess(client, tenant, input.contrato_id);
    await ensureTerritorialAssignmentUserExists(client, input.gestor_usuario_id, input.contrato_id);
    await ensureMunicipioExists(client, input.municipio_id);
    await ensureMunicipioDepartamentoMatch(client, input.municipio_id, input.departamento_id);
    await ensureMunicipioBelongsContratoScope(client, input.contrato_id, input.municipio_id);

    const fechaEfectiva = toIsoDate(input.fecha);
    const cierreAnterior = shiftIsoDate(fechaEfectiva, -1);
    await ensureGestorMunicipioScope(client, {
      contrato_id: input.contrato_id,
      fecha: fechaEfectiva,
      gestor_usuario_id: input.gestor_usuario_id,
      municipio_id: input.municipio_id
    });

    for (const vinculacionId of input.vinculacion_ids) {
      await ensureVinculacionBelongsContrato(client, input.contrato_id, vinculacionId);
    }

    let asignados = 0;
    let desasignados = 0;

    if (input.modo === 'REEMPLAZAR_MUNICIPIO') {
      const actuales = await getGestorPersonalAssignments(client, {
        contrato_id: input.contrato_id,
        municipio_id: input.municipio_id,
        fecha: fechaEfectiva,
        onlyActive: true
      });

      const actualesEnMunicipio = actuales.filter(
        (item) => item.municipio?.id === input.municipio_id
      );
      const actualesIds = new Set(
        actualesEnMunicipio.map((item) => item.trabajador.vinculacion_id)
      );
      const nuevosIds = new Set(input.vinculacion_ids);

      for (const current of actualesEnMunicipio) {
        if (!nuevosIds.has(current.trabajador.vinculacion_id)) {
          desasignados += await closeOpenGestorPersonalAssignments(client, {
            actorUserId,
            contrato_id: input.contrato_id,
            vinculacion_id: current.trabajador.vinculacion_id,
            vigencia_hasta: cierreAnterior,
            observacion: input.observacion
          });
        }
      }

      for (const vinculacionId of input.vinculacion_ids) {
        const activoActual = actuales.find(
          (item) => item.trabajador.vinculacion_id === vinculacionId
        );

        if (
          activoActual &&
          activoActual.gestor.id === input.gestor_usuario_id &&
          activoActual.municipio?.id === input.municipio_id
        ) {
          continue;
        }

        if (actualesIds.has(vinculacionId)) {
          desasignados += await closeOpenGestorPersonalAssignments(client, {
            actorUserId,
            contrato_id: input.contrato_id,
            vinculacion_id: vinculacionId,
            vigencia_hasta: cierreAnterior,
            observacion: input.observacion
          });
        }

        if (activoActual && activoActual.gestor.id !== input.gestor_usuario_id) {
          desasignados += await closeOpenGestorPersonalAssignments(client, {
            actorUserId,
            contrato_id: input.contrato_id,
            vinculacion_id: vinculacionId,
            vigencia_hasta: cierreAnterior,
            observacion: input.observacion
          });
        }

        await createGestorPersonalAssignmentRecord(client, {
          actorUserId,
          contrato_id: input.contrato_id,
          gestor_usuario_id: input.gestor_usuario_id,
          municipio_id: input.municipio_id,
          vigencia_desde: fechaEfectiva,
          observacion: input.observacion,
          vinculacion_id: vinculacionId
        });
        asignados += 1;
      }
    } else {
      for (const vinculacionId of input.vinculacion_ids) {
        const actuales = await getGestorPersonalAssignments(client, {
          contrato_id: input.contrato_id,
          fecha: fechaEfectiva,
          vinculacion_id: vinculacionId,
          onlyActive: true
        });
        const activoActual = actuales[0] ?? null;

        if (
          activoActual &&
          activoActual.gestor.id === input.gestor_usuario_id &&
          activoActual.municipio?.id === input.municipio_id
        ) {
          continue;
        }

        if (activoActual) {
          desasignados += await closeOpenGestorPersonalAssignments(client, {
            actorUserId,
            contrato_id: input.contrato_id,
            vinculacion_id: vinculacionId,
            vigencia_hasta: cierreAnterior,
            observacion: input.observacion
          });
        }

        await createGestorPersonalAssignmentRecord(client, {
          actorUserId,
          contrato_id: input.contrato_id,
          gestor_usuario_id: input.gestor_usuario_id,
          municipio_id: input.municipio_id,
          vigencia_desde: fechaEfectiva,
          observacion: input.observacion,
          vinculacion_id: vinculacionId
        });
        asignados += 1;
      }
    }

    await registerAuditEntry({
      client,
      usuario_id: String(actorUserId),
      accion: 'GESTOR_PERSONAL_SAVE_BULK',
      tabla: 'gestor_personal_asignaciones',
      registro_id: `${input.contrato_id}:${input.gestor_usuario_id}:${input.municipio_id}`,
      descripcion: `Asignacion masiva de personal al gestor ${input.gestor_usuario_id}`,
      before: null,
      after: {
        gestor_usuario_id: input.gestor_usuario_id,
        municipio_id: input.municipio_id,
        modo: input.modo,
        vinculacion_ids: input.vinculacion_ids,
        fecha_efectiva: fechaEfectiva,
        observacion: input.observacion
      },
      ip: null,
      user_agent: null
    });

    await client.query('COMMIT');

    return {
      asignados,
      desasignados,
      fecha_efectiva: fechaEfectiva,
      gestor_usuario_id: input.gestor_usuario_id,
      municipio_id: input.municipio_id
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const closeGestorPersonalAssignment = async (
  assignmentId: number,
  input: CloseGestorAssignmentInput,
  actorUserId: number,
  tenant?: TenantAccessContext
): Promise<GestorPersonalAssignment> => {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<GestorPersonalAssignmentRow>(
      `
        SELECT
          gpa.id,
          gpa.usuario_id,
          u.nombre_completo AS gestor_nombre,
          gpa.contrato_id,
          gpa.vinculacion_id,
          gpa.municipio_id,
          mu.nombre_municipio AS municipio_nombre,
          gpa.vigencia_desde,
          gpa.vigencia_hasta,
          COALESCE(gpa.activo, TRUE) AS activo,
          gpa.observacion,
          gpa.created_by_user_id,
          gpa.created_at,
          gpa.updated_by_user_id,
          gpa.updated_at,
          p.numero_documento AS trabajador_documento,
          CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS trabajador_nombre
        FROM gestor_personal_asignaciones gpa
        INNER JOIN usuarios u ON u.id = gpa.usuario_id
        INNER JOIN vinculaciones v ON v.id = gpa.vinculacion_id
        INNER JOIN personas p ON p.id = v.persona_id
        LEFT JOIN municipios mu ON mu.id = gpa.municipio_id
        WHERE gpa.id = $1::bigint
        LIMIT 1
        FOR UPDATE
      `,
      [assignmentId]
    );

    const current = result.rows[0];

    if (!current) {
      throw new AppError('Gestor personal assignment not found', 404, 'GESTOR_PERSONAL_ASSIGNMENT_NOT_FOUND');
    }

    await ensureContractTenantAccess(client, tenant, toNumber(current.contrato_id));

    await client.query(
      `
        UPDATE gestor_personal_asignaciones
        SET
          vigencia_hasta = CASE
            WHEN vigencia_desde > $2::date THEN vigencia_desde
            ELSE $2::date
          END,
          activo = FALSE,
          observacion = COALESCE($3, observacion),
          updated_by_user_id = $4::bigint,
          updated_at = NOW()
        WHERE id = $1::bigint
      `,
      [assignmentId, input.vigencia_hasta, input.observacion, actorUserId]
    );

    const updated = (
      await getGestorPersonalAssignments(client, {
        contrato_id: toNumber(current.contrato_id),
        vinculacion_id: toNumber(current.vinculacion_id)
      })
    ).find((item) => item.id === assignmentId);

    await registerAuditEntry({
      client,
      usuario_id: String(actorUserId),
      accion: 'GESTOR_PERSONAL_CLOSE',
      tabla: 'gestor_personal_asignaciones',
      registro_id: String(assignmentId),
      descripcion: `Cierre de asignacion individual ${assignmentId}`,
      before: mapGestorPersonalAssignment(current),
      after: updated ?? null,
      ip: null,
      user_agent: null
    });

    await client.query('COMMIT');

    if (!updated) {
      throw new AppError(
        'Failed to load closed gestor personal assignment',
        500,
        'GESTOR_PERSONAL_ASSIGNMENT_CLOSE_FAILED'
      );
    }

    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const getGestorPersonalHistory = async (
  query: GestorPersonalHistoryQuery,
  tenant?: TenantAccessContext
): Promise<GestorPersonalHistoryResponse> => {
  const client = await dbPool.connect();
  try {
    await ensureContractTenantAccess(client, tenant, query.contrato_id);
    const fechaConsulta = toIsoDate(query.fecha);
    await ensureVinculacionBelongsContrato(client, query.contrato_id, query.vinculacion_id);

    const historial = await getGestorPersonalAssignments(client, {
      contrato_id: query.contrato_id,
      vinculacion_id: query.vinculacion_id
    });

    return {
      fecha_consulta: fechaConsulta,
      vinculacion_id: query.vinculacion_id,
      historial
    };
  } finally {
    client.release();
  }
};

export const getVinculacionById = async (
  vinculacionId: number,
  tenant?: TenantAccessContext
): Promise<Vinculacion | null> => {
  const result = await dbQuery<VinculacionRow>(
    `
      ${getVinculacionSelect()}
      WHERE v.id = $1::bigint
      LIMIT 1
    `,
    [vinculacionId]
  );

  const row = result.rows[0];

  ensureVinculacionTenantAccess(tenant, row ?? null);

  return row ? mapVinculacion(row) : null;
};

export const getVinculacionExpediente = async (
  vinculacionId: number,
  tenant?: TenantAccessContext
): Promise<VinculacionExpediente> => {
  const vinculacion = await getVinculacionById(vinculacionId, tenant);

  if (!vinculacion) {
    throw new AppError('Vinculacion not found', 404, 'VINCULACION_NOT_FOUND');
  }

  const [
    personaResult,
    empresaResult,
    contratoResult,
    cargoResult,
    tipoVinculacionResult,
    documentosPersonaResult,
    documentosVinculacionResult,
    checklist,
    afiliacionResult,
    personalContexto
  ] = await Promise.all([
    dbQuery<PersonaExpedienteRow>(
      `
        SELECT
          p.id,
          p.tipo_documento_id,
          p.numero_documento,
          p.primer_nombre,
          p.segundo_nombre,
          p.primer_apellido,
          p.segundo_apellido,
          p.fecha_nacimiento,
          p.fecha_expedicion_documento,
          p.municipio_nacimiento_id,
          p.municipio_expedicion_id,
          p.municipio_residencia_id,
          p.sexo_id,
          s.nombre_sexo,
          p.estado_civil_id,
          ec.nombre_estado_civil,
          p.tipo_sangre_id,
          ts.codigo AS tipo_sangre_codigo,
          p.estatura,
          p.telefono,
          p.correo,
          p.direccion,
          p.barrio,
          p.zona_id,
          z.nombre_zona,
          p.pais_nacimiento,
          p.nacimiento_extranjero,
          p.ciudad_nacimiento_extranjero
        FROM personas p
        LEFT JOIN sexo s ON s.id = p.sexo_id
        LEFT JOIN estados_civiles ec ON ec.id = p.estado_civil_id
        LEFT JOIN tipos_sangre ts ON ts.id = p.tipo_sangre_id
        LEFT JOIN zonas z ON z.id = p.zona_id
        WHERE p.id = $1::bigint
        LIMIT 1
      `,
      [vinculacion.persona_id]
    ),
    dbQuery<SimpleEntityRow>(
      `
        SELECT id, nombre_empresa
        FROM empresas
        WHERE id = $1::bigint
        LIMIT 1
      `,
      [vinculacion.empresa_id]
    ),
    dbQuery<
      QueryResultRow & {
        entidad_contratante: string | null;
        fecha_finalizacion: Date | string | null;
        fecha_inicio: Date | string | null;
        id: number | string;
        numero_contrato: string | null;
        objeto_contractual: string | null;
      }
    >(
      `
        SELECT
          id,
          numero_contrato,
          entidad_contratante,
          objeto_contractual,
          fecha_inicio,
          fecha_finalizacion
        FROM contratos
        WHERE id = $1::bigint
        LIMIT 1
      `,
      [vinculacion.contrato_id]
    ),
    dbQuery<SimpleEntityRow>(
      `
        SELECT id, nombre_cargo
        FROM contrato_cargos
        WHERE id = $1::bigint
        LIMIT 1
      `,
      [vinculacion.contrato_cargo_id]
    ),
    dbQuery<TipoVinculacionRow>(
      `
        SELECT codigo, nombre_vinculacion
        FROM tipos_vinculacion
        WHERE id = $1::bigint
        LIMIT 1
      `,
      [vinculacion.tipo_vinculacion_id]
    ),
    dbQuery<DocumentoPersonaExpedienteRow>(
      `
        SELECT
          dp.id,
          dp.persona_id,
          dp.tipo_documento_id,
          td.codigo AS tipo_documento_codigo,
          td.nombre_documento AS tipo_documento_nombre,
          dp.fecha_expedicion,
          dp.fecha_vencimiento,
          dp.archivo_path,
          dp.fecha_carga,
          dp.vinculacion_id,
          dp.version,
          dp.documento_reemplaza_id,
          dp.es_vigente,
          dp.storage_bucket,
          dp.storage_path,
          dp.nombre_original,
          dp.mime_type,
          dp.tamano_bytes
        FROM documentos_persona dp
        INNER JOIN tipos_documentos td ON td.id = dp.tipo_documento_id
        WHERE dp.persona_id = $1::bigint
          AND dp.activo = TRUE
        ORDER BY dp.es_vigente DESC, dp.tipo_documento_id ASC, dp.version DESC, dp.fecha_carga DESC, dp.id DESC
      `,
      [vinculacion.persona_id]
    ),
    dbQuery<DocumentoVinculacionExpedienteRow>(
      `
        SELECT
          dv.id,
          dv.vinculacion_id,
          dv.tipo_documento_id,
          td.codigo AS tipo_documento_codigo,
          td.nombre_documento AS tipo_documento_nombre,
          dv.fecha_expedicion,
          dv.fecha_vencimiento,
          dv.archivo_path,
          dv.fecha_carga,
          dv.activo,
          dv.storage_bucket,
          dv.storage_path,
          dv.nombre_original,
          dv.mime_type,
          dv.tamano_bytes
        FROM documentos_vinculacion dv
        INNER JOIN tipos_documentos td ON td.id = dv.tipo_documento_id
        WHERE dv.vinculacion_id = $1::bigint
          AND dv.activo = TRUE
        ORDER BY dv.fecha_carga DESC, dv.id DESC
      `,
      [vinculacion.id]
    ),
    getVinculacionChecklist(String(vinculacion.id), tenant),
    dbQuery<AfiliacionExpedienteRow>(
      `
        SELECT
          va.id,
          va.eps_id,
          e.nombre AS eps_nombre,
          va.pension_id,
          fp.nombre AS pension_nombre,
          va.arl_id,
          a.nombre AS arl_nombre,
          va.caja_compensacion_id,
          cc.nombre AS caja_nombre
        FROM vinculacion_afiliaciones va
        LEFT JOIN eps e ON e.id = va.eps_id
        LEFT JOIN fondos_pension fp ON fp.id = va.pension_id
        LEFT JOIN arl a ON a.id = va.arl_id
        LEFT JOIN cajas_compensacion cc ON cc.id = va.caja_compensacion_id
        WHERE va.vinculacion_id = $1::bigint
          AND va.activo = TRUE
        ORDER BY va.fecha_afiliacion DESC NULLS LAST, va.id DESC
        LIMIT 1
      `,
      [vinculacion.id]
    ),
    getVinculacionPersonalContext(vinculacion.id, tenant)
  ]);

  const personaRow = personaResult.rows[0];
  const empresaRow = empresaResult.rows[0];
  const contratoRow = contratoResult.rows[0];
  const cargoRow = cargoResult.rows[0];
  const tipoVinculacionRow = tipoVinculacionResult.rows[0];
  const afiliacionRow = afiliacionResult.rows[0] ?? null;

  if (!personaRow) {
    throw new AppError('Persona not found', 404, 'PERSONA_NOT_FOUND');
  }

  if (!empresaRow) {
    throw new AppError('Empresa not found', 404, 'EMPRESA_NOT_FOUND');
  }

  if (!contratoRow) {
    throw new AppError('Contrato not found', 404, 'CONTRATO_NOT_FOUND');
  }

  if (!cargoRow) {
    throw new AppError('Contrato cargo not found', 404, 'CONTRATO_CARGO_NOT_FOUND');
  }

  if (!tipoVinculacionRow) {
    throw new AppError('Tipo vinculacion not found', 404, 'TIPO_VINCULACION_NOT_FOUND');
  }

  return {
    vinculacion,
    persona: mapPersonaExpediente(personaRow),
    empresa: {
      id: toNumber(empresaRow.id),
      nombre_empresa: empresaRow.nombre_empresa ?? null
    },
    contrato: {
      id: toNumber(contratoRow.id),
      numero_contrato: contratoRow.numero_contrato ?? null,
      entidad_contratante: contratoRow.entidad_contratante ?? null,
      objeto_contractual: contratoRow.objeto_contractual ?? null,
      fecha_inicio: toDateString(contratoRow.fecha_inicio),
      fecha_finalizacion: toDateString(contratoRow.fecha_finalizacion)
    },
    cargo: {
      id: toNumber(cargoRow.id),
      nombre_cargo: cargoRow.nombre_cargo ?? null
    },
    tipo_vinculacion: {
      id: toNumber(vinculacion.tipo_vinculacion_id),
      codigo: tipoVinculacionRow.codigo,
      nombre_vinculacion: tipoVinculacionRow.nombre_vinculacion
    },
    documentos_persona: documentosPersonaResult.rows.map(mapDocumentoPersonaExpediente),
    documentos_vinculacion: documentosVinculacionResult.rows.map(mapDocumentoVinculacionExpediente),
    checklist,
    personal_contexto: personalContexto,
    afiliaciones: afiliacionRow
      ? {
          eps_id: afiliacionRow.eps_id === null ? null : toNumber(afiliacionRow.eps_id),
          eps: afiliacionRow.eps_nombre,
          pension_id: afiliacionRow.pension_id === null ? null : toNumber(afiliacionRow.pension_id),
          pension: afiliacionRow.pension_nombre,
          arl_id: afiliacionRow.arl_id === null ? null : toNumber(afiliacionRow.arl_id),
          arl: afiliacionRow.arl_nombre,
          caja_compensacion_id:
            afiliacionRow.caja_compensacion_id === null
              ? null
              : toNumber(afiliacionRow.caja_compensacion_id),
          caja_compensacion: afiliacionRow.caja_nombre
        }
      : null
  };
};

export const getVinculacionesByPersonaId = async (
  personaId: number,
  tenant?: TenantAccessContext
): Promise<Vinculacion[]> => {
  const conditions: string[] = [`v.persona_id = $1::bigint`];
  const params: unknown[] = [personaId];
  let paramIndex = 2;

  if (tenant && !tenant.isGlobalAdmin) {
    if (tenant.contratoIds.length === 0 && tenant.empresaIds.length === 0) {
      conditions.push('1 = 0');
    } else if (tenant.contratoIds.length > 0) {
      params.push(tenant.contratoIds);
      conditions.push(`v.contrato_id = ANY($${paramIndex}::bigint[])`);
      paramIndex += 1;
    } else if (tenant.empresaIds.length > 0) {
      params.push(tenant.empresaIds);
      conditions.push(`c.empresa_id = ANY($${paramIndex}::bigint[])`);
      paramIndex += 1;
    }
  }

  const result = await dbQuery<VinculacionRow>(
    `
      ${getVinculacionSelect()}
      WHERE ${conditions.join(' AND ')}
      ORDER BY v.fecha_inicio DESC, v.id DESC
    `,
    params
  );

  return result.rows.map(mapVinculacion);
};

export const createVinculacion = async (
  input: CreateVinculacionInput,
  actorUserId: number,
  tenant?: TenantAccessContext
): Promise<Vinculacion> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await validateForeignKeys(client, input);
    await ensureContractTenantAccess(client, tenant, input.contrato_id);

    if (input.estado_vinculacion === 'ACTIVA') {
      await ensureActiveUniqueness(client, {
        persona_id: input.persona_id,
        contrato_id: input.contrato_id
      });
    }

    const result = await client.query<VinculacionRow>(
      `
        INSERT INTO vinculaciones (
          persona_id,
          empresa_id,
          contrato_id,
          tipo_vinculacion_id,
          contrato_cargo_id,
          fecha_inicio,
          fecha_fin,
          estado_vinculacion,
          cuenta_como_experiencia,
          metodo_pago
        )
        VALUES (
          $1::bigint,
          $2::bigint,
          $3::bigint,
          $4::bigint,
          $5::bigint,
          $6::date,
          $7::date,
          $8,
          $9,
          $10
        )
        RETURNING
          id,
          persona_id,
          empresa_id,
          contrato_id,
          (SELECT empresa_id FROM contratos WHERE id = vinculaciones.contrato_id) AS contrato_empresa_id,
          tipo_vinculacion_id,
          contrato_cargo_id,
          fecha_inicio,
          fecha_fin,
          estado_vinculacion,
          motivo_retiro,
          cuenta_como_experiencia,
          metodo_pago
      `,
      [
        input.persona_id,
        input.empresa_id,
        input.contrato_id,
        input.tipo_vinculacion_id,
        input.contrato_cargo_id,
        input.fecha_inicio,
        input.fecha_fin,
        input.estado_vinculacion,
        input.cuenta_como_experiencia,
        input.metodo_pago
      ]
    );

    const created = result.rows[0];

    if (!created) {
      throw new AppError('Failed to create vinculacion', 500, 'VINCULACION_CREATION_FAILED');
    }

    const createdVinculacion = mapVinculacion(created);

    await recordAudit(client, createdVinculacion.id, {
      action: 'VINCULACION_CREATE',
      actorUserId,
      after: createdVinculacion,
      metadata: {
        campo_modificado: 'vinculacion'
      }
    });

    await client.query('COMMIT');
    return createdVinculacion;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateVinculacion = async (
  vinculacionId: number,
  input: UpdateVinculacionInput,
  actorUserId: number,
  tenant?: TenantAccessContext
): Promise<Vinculacion> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    const currentRow = await getVinculacionRowById(client, vinculacionId);

    if (!currentRow) {
      throw new AppError('Vinculacion not found', 404, 'VINCULACION_NOT_FOUND');
    }

    const current = mapVinculacion(currentRow);
    ensureVinculacionTenantAccess(tenant, currentRow);
    const nextValues = {
      persona_id: hasOwn(input, 'persona_id') ? input.persona_id ?? current.persona_id : current.persona_id,
      empresa_id: hasOwn(input, 'empresa_id') ? input.empresa_id ?? current.empresa_id : current.empresa_id,
      contrato_id: hasOwn(input, 'contrato_id') ? input.contrato_id ?? current.contrato_id : current.contrato_id,
      tipo_vinculacion_id: hasOwn(input, 'tipo_vinculacion_id')
        ? input.tipo_vinculacion_id ?? current.tipo_vinculacion_id
        : current.tipo_vinculacion_id,
      contrato_cargo_id: hasOwn(input, 'contrato_cargo_id')
        ? input.contrato_cargo_id ?? current.contrato_cargo_id
        : current.contrato_cargo_id,
      fecha_inicio: hasOwn(input, 'fecha_inicio') ? input.fecha_inicio ?? current.fecha_inicio : current.fecha_inicio,
      fecha_fin: hasOwn(input, 'fecha_fin') ? input.fecha_fin ?? null : current.fecha_fin,
      estado_vinculacion: hasOwn(input, 'estado_vinculacion')
        ? input.estado_vinculacion ?? current.estado_vinculacion
        : current.estado_vinculacion,
      cuenta_como_experiencia: hasOwn(input, 'cuenta_como_experiencia')
        ? input.cuenta_como_experiencia ?? current.cuenta_como_experiencia
        : current.cuenta_como_experiencia,
      metodo_pago: hasOwn(input, 'metodo_pago') ? input.metodo_pago ?? null : current.metodo_pago
    };

    await validateForeignKeys(client, {
      persona_id: nextValues.persona_id,
      empresa_id: nextValues.empresa_id,
      contrato_id: nextValues.contrato_id,
      tipo_vinculacion_id: nextValues.tipo_vinculacion_id,
      contrato_cargo_id: nextValues.contrato_cargo_id
    });

    if (nextValues.estado_vinculacion === 'ACTIVA') {
      await ensureActiveUniqueness(
        client,
        {
          persona_id: nextValues.persona_id,
          contrato_id: nextValues.contrato_id
        },
        vinculacionId
      );
    }

    const result = await client.query<VinculacionRow>(
      `
        UPDATE vinculaciones
        SET
          persona_id = $2::bigint,
          empresa_id = $3::bigint,
          contrato_id = $4::bigint,
          tipo_vinculacion_id = $5::bigint,
          contrato_cargo_id = $6::bigint,
          fecha_inicio = $7::date,
          fecha_fin = $8::date,
          estado_vinculacion = $9,
          cuenta_como_experiencia = $10,
          metodo_pago = $11
        WHERE id = $1::bigint
        RETURNING
          id,
          persona_id,
          empresa_id,
          contrato_id,
          (SELECT empresa_id FROM contratos WHERE id = vinculaciones.contrato_id) AS contrato_empresa_id,
          tipo_vinculacion_id,
          contrato_cargo_id,
          fecha_inicio,
          fecha_fin,
          estado_vinculacion,
          motivo_retiro,
          cuenta_como_experiencia,
          metodo_pago
      `,
      [
        vinculacionId,
        nextValues.persona_id,
        nextValues.empresa_id,
        nextValues.contrato_id,
        nextValues.tipo_vinculacion_id,
        nextValues.contrato_cargo_id,
        nextValues.fecha_inicio,
        nextValues.fecha_fin,
        nextValues.estado_vinculacion,
        nextValues.cuenta_como_experiencia,
        nextValues.metodo_pago
      ]
    );

    const updated = result.rows[0];

    if (!updated) {
      throw new AppError('Failed to update vinculacion', 500, 'VINCULACION_UPDATE_FAILED');
    }

    const updatedVinculacion = mapVinculacion(updated);

    await recordAudit(client, updatedVinculacion.id, {
      action: 'VINCULACION_UPDATE',
      actorUserId,
      before: current,
      after: updatedVinculacion,
      metadata: {
        campo_modificado: 'vinculacion',
        observacion: input.motivo_cambio ?? null
      }
    });

    await client.query('COMMIT');
    return updatedVinculacion;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const retirarVinculacion = async (
  vinculacionId: number,
  input: RetirarVinculacionInput,
  actorUserId: number,
  tenant?: TenantAccessContext
): Promise<Vinculacion> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    const currentRow = await getVinculacionRowById(client, vinculacionId);

    if (!currentRow) {
      throw new AppError('Vinculacion not found', 404, 'VINCULACION_NOT_FOUND');
    }

    const current = mapVinculacion(currentRow);
    ensureVinculacionTenantAccess(tenant, currentRow);

    if (current.estado_vinculacion === 'RETIRADA') {
      throw new AppError('Vinculacion is already retired', 409, 'VINCULACION_ALREADY_RETIRED');
    }

    const result = await client.query<VinculacionRow>(
      `
        UPDATE vinculaciones
        SET
          estado_vinculacion = 'RETIRADA',
          fecha_fin = $2::date,
          motivo_retiro = $3
        WHERE id = $1::bigint
        RETURNING
          id,
          persona_id,
          empresa_id,
          contrato_id,
          (SELECT empresa_id FROM contratos WHERE id = vinculaciones.contrato_id) AS contrato_empresa_id,
          tipo_vinculacion_id,
          contrato_cargo_id,
          fecha_inicio,
          fecha_fin,
          estado_vinculacion,
          motivo_retiro,
          cuenta_como_experiencia,
          metodo_pago
      `,
      [vinculacionId, input.fecha_retiro, input.motivo_retiro]
    );

    const retired = result.rows[0];

    if (!retired) {
      throw new AppError('Failed to retire vinculacion', 500, 'VINCULACION_RETIRE_FAILED');
    }

    const retiredVinculacion = mapVinculacion(retired);

    await recordAudit(client, retiredVinculacion.id, {
      action: 'VINCULACION_RETIRAR',
      actorUserId,
      before: current,
      after: retiredVinculacion,
      metadata: {
        campo_modificado: 'estado_vinculacion'
      }
    });

    await client.query('COMMIT');
    return retiredVinculacion;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const suspenderVinculacion = async (
  vinculacionId: number,
  input: SuspenderVinculacionInput,
  actorUserId: number,
  tenant?: TenantAccessContext
): Promise<Vinculacion> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    const currentRow = await getVinculacionRowById(client, vinculacionId);

    if (!currentRow) {
      throw new AppError('Vinculacion not found', 404, 'VINCULACION_NOT_FOUND');
    }

    const current = mapVinculacion(currentRow);
    ensureVinculacionTenantAccess(tenant, currentRow);

    if (current.estado_vinculacion === 'RETIRADA') {
      throw new AppError(
        'A retired vinculacion cannot be suspended',
        409,
        'VINCULACION_RETIRED_CANNOT_SUSPEND'
      );
    }

    if (current.estado_vinculacion === 'SUSPENDIDA') {
      throw new AppError('Vinculacion is already suspended', 409, 'VINCULACION_ALREADY_SUSPENDED');
    }

    const result = await client.query<VinculacionRow>(
      `
        UPDATE vinculaciones
        SET
          estado_vinculacion = 'SUSPENDIDA'
        WHERE id = $1::bigint
        RETURNING
          id,
          persona_id,
          empresa_id,
          contrato_id,
          (SELECT empresa_id FROM contratos WHERE id = vinculaciones.contrato_id) AS contrato_empresa_id,
          tipo_vinculacion_id,
          contrato_cargo_id,
          fecha_inicio,
          fecha_fin,
          estado_vinculacion,
          motivo_retiro,
          cuenta_como_experiencia,
          metodo_pago
      `,
      [vinculacionId]
    );

    const suspended = result.rows[0];

    if (!suspended) {
      throw new AppError('Failed to suspend vinculacion', 500, 'VINCULACION_SUSPEND_FAILED');
    }

    const suspendedVinculacion = mapVinculacion(suspended);

    await recordAudit(client, suspendedVinculacion.id, {
      action: 'VINCULACION_SUSPENDER',
      actorUserId,
      before: current,
      after: suspendedVinculacion,
      metadata: {
        campo_modificado: 'estado_vinculacion',
        fecha_suspension: input.fecha_suspension,
        motivo_suspension: input.motivo_suspension
      }
    });

    await client.query('COMMIT');
    return suspendedVinculacion;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const reactivarVinculacion = async (
  vinculacionId: number,
  input: ReactivarVinculacionInput,
  actorUserId: number,
  tenant?: TenantAccessContext
): Promise<Vinculacion> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    const currentRow = await getVinculacionRowById(client, vinculacionId);

    if (!currentRow) {
      throw new AppError('Vinculacion not found', 404, 'VINCULACION_NOT_FOUND');
    }

    const current = mapVinculacion(currentRow);
    ensureVinculacionTenantAccess(tenant, currentRow);

    if (current.estado_vinculacion === 'ACTIVA') {
      throw new AppError('Vinculacion is already active', 409, 'VINCULACION_ALREADY_ACTIVE');
    }

    await ensureActiveUniqueness(
      client,
      {
        persona_id: current.persona_id,
        contrato_id: current.contrato_id
      },
      vinculacionId
    );

    const result = await client.query<VinculacionRow>(
      `
        UPDATE vinculaciones
        SET
          estado_vinculacion = 'ACTIVA',
          fecha_fin = NULL
        WHERE id = $1::bigint
        RETURNING
          id,
          persona_id,
          empresa_id,
          contrato_id,
          (SELECT empresa_id FROM contratos WHERE id = vinculaciones.contrato_id) AS contrato_empresa_id,
          tipo_vinculacion_id,
          contrato_cargo_id,
          fecha_inicio,
          fecha_fin,
          estado_vinculacion,
          motivo_retiro,
          cuenta_como_experiencia,
          metodo_pago
      `,
      [vinculacionId]
    );

    const reactivated = result.rows[0];

    if (!reactivated) {
      throw new AppError('Failed to reactivate vinculacion', 500, 'VINCULACION_REACTIVATE_FAILED');
    }

    const reactivatedVinculacion = mapVinculacion(reactivated);

    await recordAudit(client, reactivatedVinculacion.id, {
      action: 'VINCULACION_REACTIVAR',
      actorUserId,
      before: current,
      after: reactivatedVinculacion,
      metadata: {
        campo_modificado: 'estado_vinculacion',
        fecha_reactivacion: input.fecha_reactivacion
      }
    });

    await client.query('COMMIT');
    return reactivatedVinculacion;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
