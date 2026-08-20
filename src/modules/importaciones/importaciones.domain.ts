import { normalizeNumeroDocumento } from '../personas/personas.identificaciones.helpers';
import { METODOS_PAGO } from '../vinculaciones/vinculaciones.schemas';

export type ImportRowGeneralStatus =
  | 'LISTO'
  | 'YA_VINCULADO'
  | 'DUPLICADO_EN_ARCHIVO'
  | 'DUPLICADO_CONFLICTIVO'
  | 'DATOS_INCOMPLETOS'
  | 'DOCUMENTO_INVALIDO'
  | 'TIPO_DOCUMENTO_NO_ENCONTRADO'
  | 'CARGO_NO_ENCONTRADO'
  | 'CARGO_AMBIGUO'
  | 'TIPO_VINCULACION_NO_ENCONTRADO'
  | 'TIPO_VINCULACION_AMBIGUO'
  | 'FECHA_INVALIDA'
  | 'ERROR';

export type ImportPersonaStatus =
  | 'LISTO_CREAR_PERSONA'
  | 'LISTO_REUTILIZAR_PERSONA'
  | 'PERSONA_EXISTENTE'
  | 'DATOS_INCOMPLETOS'
  | 'DOCUMENTO_INVALIDO'
  | 'TIPO_DOCUMENTO_NO_ENCONTRADO'
  | 'ERROR';

export type ImportVinculacionStatus =
  | 'LISTA_PARA_CREAR'
  | 'YA_VINCULADO'
  | 'CARGO_NO_ENCONTRADO'
  | 'CARGO_AMBIGUO'
  | 'TIPO_VINCULACION_NO_ENCONTRADO'
  | 'TIPO_VINCULACION_AMBIGUO'
  | 'FECHA_INVALIDA'
  | 'DATOS_INCOMPLETOS'
  | 'ERROR';

export interface OperationalImportPersonaFields {
  tipo_identificacion: string | null;
  numero_documento: string | null;
  primer_nombre: string | null;
  segundo_nombre: string | null;
  primer_apellido: string | null;
  segundo_apellido: string | null;
  fecha_nacimiento: string | null;
  fecha_nacimiento_raw: string | null;
  fecha_expedicion: string | null;
  fecha_expedicion_raw: string | null;
  lugar_expedicion: string | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  municipio_residencia: string | null;
}

export interface OperationalImportVinculacionFields {
  cargo: string | null;
  tipo_vinculacion: string | null;
  fecha_ingreso: string | null;
  fecha_ingreso_raw: string | null;
  metodo_pago: string | null;
  estado: string | null;
}

export interface OperationalImportRow {
  rowNumber: number;
  rawData: Record<string, unknown>;
  persona: OperationalImportPersonaFields;
  vinculacion: OperationalImportVinculacionFields;
}

export interface FileDuplicateIssue {
  key: string;
  kind: 'DUPLICADO_EN_ARCHIVO' | 'DUPLICADO_CONFLICTIVO';
  rowNumbers: number[];
}

export interface ImportTemplateColumn {
  key: string;
  label: string;
  required: boolean;
  description: string;
}

export const IMPORT_TEMPLATE_COLUMNS: ImportTemplateColumn[] = [
  {
    key: 'tipo_identificacion',
    label: 'Tipo identificación',
    required: true,
    description: 'Código o nombre del tipo documental de identificación vigente'
  },
  {
    key: 'numero_documento',
    label: 'Número identificación',
    required: true,
    description: 'Número de identificación vigente'
  },
  {
    key: 'primer_nombre',
    label: 'Primer nombre',
    required: true,
    description: 'Primer nombre de la persona'
  },
  {
    key: 'segundo_nombre',
    label: 'Segundo nombre',
    required: false,
    description: 'Dato opcional'
  },
  {
    key: 'primer_apellido',
    label: 'Primer apellido',
    required: true,
    description: 'Primer apellido de la persona'
  },
  {
    key: 'segundo_apellido',
    label: 'Segundo apellido',
    required: false,
    description: 'Dato opcional'
  },
  {
    key: 'fecha_nacimiento',
    label: 'Fecha nacimiento',
    required: false,
    description: 'Formato YYYY-MM-DD'
  },
  {
    key: 'fecha_expedicion',
    label: 'Fecha expedición',
    required: false,
    description: 'Formato YYYY-MM-DD'
  },
  {
    key: 'lugar_expedicion',
    label: 'Lugar expedición',
    required: false,
    description: 'Municipio de expedición en texto'
  },
  {
    key: 'telefono',
    label: 'Teléfono',
    required: false,
    description: 'Dato opcional'
  },
  {
    key: 'correo',
    label: 'Correo',
    required: false,
    description: 'Dato opcional'
  },
  {
    key: 'direccion',
    label: 'Dirección',
    required: false,
    description: 'Dato opcional'
  },
  {
    key: 'municipio_residencia',
    label: 'Municipio residencia',
    required: false,
    description: 'Dato opcional en texto'
  },
  {
    key: 'cargo',
    label: 'Cargo',
    required: true,
    description: 'Nombre del cargo dentro del contrato seleccionado'
  },
  {
    key: 'tipo_vinculacion',
    label: 'Tipo vinculación',
    required: true,
    description: 'Código o nombre del tipo de vinculación'
  },
  {
    key: 'fecha_ingreso',
    label: 'Fecha ingreso',
    required: true,
    description: 'Formato YYYY-MM-DD'
  },
  {
    key: 'metodo_pago',
    label: 'Método pago',
    required: false,
    description: `Opcional. Valores soportados: ${METODOS_PAGO.join(', ')}`
  },
  {
    key: 'estado',
    label: 'Estado',
    required: false,
    description: 'Opcional. ACTIVA por defecto'
  }
];

export const normalizeImportText = (value: string | null | undefined): string => {
  if (!value) {
    return '';
  }

  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
};

export const normalizeImportDocumentNumber = (value: string | null | undefined): string => {
  if (!value) {
    return '';
  }

  return normalizeNumeroDocumento(value).replace(/\s+/g, ' ').trim();
};

const toNormalizedComparableObject = (row: OperationalImportRow) => ({
  primer_nombre: normalizeImportText(row.persona.primer_nombre),
  segundo_nombre: normalizeImportText(row.persona.segundo_nombre),
  primer_apellido: normalizeImportText(row.persona.primer_apellido),
  segundo_apellido: normalizeImportText(row.persona.segundo_apellido),
  cargo: normalizeImportText(row.vinculacion.cargo),
  tipo_vinculacion: normalizeImportText(row.vinculacion.tipo_vinculacion),
  fecha_ingreso: row.vinculacion.fecha_ingreso ?? '',
});

const buildComparableFingerprint = (row: OperationalImportRow): string =>
  JSON.stringify(toNormalizedComparableObject(row));

export const detectOperationalImportDuplicates = (
  rows: OperationalImportRow[],
  resolvedDocumentTypeIds: Map<number, number | null>
): Map<number, FileDuplicateIssue> => {
  const groups = new Map<string, OperationalImportRow[]>();

  for (const row of rows) {
    const resolvedTypeId = resolvedDocumentTypeIds.get(row.rowNumber) ?? null;
    const rawType = normalizeImportText(row.persona.tipo_identificacion);
    const normalizedDocument = normalizeImportDocumentNumber(row.persona.numero_documento);

    if (!normalizedDocument) {
      continue;
    }

    const key = `${resolvedTypeId ?? rawType}|${normalizedDocument}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  const issues = new Map<number, FileDuplicateIssue>();

  for (const [key, group] of groups.entries()) {
    if (group.length < 2) {
      continue;
    }

    const fingerprints = new Set(group.map(buildComparableFingerprint));
    const kind =
      fingerprints.size === 1 ? 'DUPLICADO_EN_ARCHIVO' : 'DUPLICADO_CONFLICTIVO';
    const rowNumbers = group.map((row) => row.rowNumber).sort((left, right) => left - right);
    const issue: FileDuplicateIssue = { key, kind, rowNumbers };

    for (const row of group) {
      issues.set(row.rowNumber, issue);
    }
  }

  return issues;
};

const csvEscape = (value: string): string => `"${value.replace(/"/g, '""')}"`;

export const buildOperationalImportTemplateCsv = (): string => {
  const header = IMPORT_TEMPLATE_COLUMNS.map((column) => csvEscape(column.label)).join(',');
  const sample = [
    'CC',
    '1020304050',
    'ANA',
    'MARIA',
    'PEREZ',
    'GOMEZ',
    '1998-05-16',
    '2016-11-20',
    'BOGOTA',
    '3001234567',
    'ana.perez@example.com',
    'CALLE 1 # 2-3',
    'BOGOTA',
    'MANIPULADOR DE ALIMENTOS',
    'LABORAL',
    '2024-02-01',
    'ASISTENCIA',
    'ACTIVA'
  ]
    .map(csvEscape)
    .join(',');

  return [header, sample].join('\n');
};
