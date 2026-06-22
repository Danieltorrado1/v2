import * as XLSX from 'xlsx';

interface MappedPersonaFields {
  activo?: boolean | string | null;
  barrio?: string | null;
  correo?: string | null;
  direccion?: string | null;
  estado_civil_id?: string | null;
  estatura?: number | string | null;
  fecha_expedicion_documento?: string | null;
  fecha_nacimiento?: string | null;
  municipio_expedicion_id?: string | null;
  municipio_nacimiento_id?: string | null;
  municipio_residencia_id?: string | null;
  numero_documento?: string | null;
  primer_apellido?: string | null;
  primer_nombre?: string | null;
  segundo_apellido?: string | null;
  segundo_nombre?: string | null;
  sexo_id?: string | null;
  telefono?: string | null;
  tipo_documento_id?: string | null;
  tipo_sangre_id?: string | null;
  zona_id?: string | null;
}

interface MappedVinculacionFields {
  contrato_cargo_id?: string | null;
  contrato_id?: string | null;
  empresa_id?: string | null;
  estado?: string | null;
  fecha_fin?: string | null;
  fecha_inicio?: string | null;
  observaciones?: string | null;
}

export interface RawExcelRow {
  [key: string]: unknown;
}

export interface MappedImportRow {
  numeroDocumento: string | null;
  persona: MappedPersonaFields;
  rawData: RawExcelRow;
  rowNumber: number;
  vinculacion: MappedVinculacionFields;
}

const normalizeHeader = (value: string): string => {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
};

const normalizeValue = (value: unknown): unknown => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  return value;
};

const excelDateToIso = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);

    if (parsed) {
      const month = String(parsed.m).padStart(2, '0');
      const day = String(parsed.d).padStart(2, '0');
      return `${parsed.y}-${month}-${day}`;
    }
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return null;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    const date = new Date(trimmed);

    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }

  return null;
};

const getValue = (normalizedRow: Record<string, unknown>, aliases: string[]): unknown => {
  for (const alias of aliases) {
    const value = normalizedRow[alias];

    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return null;
};

export const mapExcelRows = (rows: RawExcelRow[]): MappedImportRow[] => {
  return rows.map((row, index) => {
    const normalizedRow: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(row)) {
      normalizedRow[normalizeHeader(key)] = normalizeValue(value);
    }

    const numeroDocumento = getValue(normalizedRow, [
      'numero_documento',
      'documento',
      'nro_documento',
      'numero_de_documento'
    ]);

    return {
      rowNumber: index + 2,
      rawData: row,
      numeroDocumento: typeof numeroDocumento === 'string' ? numeroDocumento.trim() : null,
      persona: {
        tipo_documento_id: getValue(normalizedRow, ['tipo_documento_id', 'tipo_documento']) as
          | string
          | null,
        numero_documento: typeof numeroDocumento === 'string' ? numeroDocumento.trim() : '',
        primer_nombre: getValue(normalizedRow, ['primer_nombre', 'nombres', 'nombre_1']) as
          | string
          | null,
        segundo_nombre: getValue(normalizedRow, ['segundo_nombre', 'nombre_2']) as string | null,
        primer_apellido: getValue(normalizedRow, ['primer_apellido', 'apellidos', 'apellido_1']) as
          | string
          | null,
        segundo_apellido: getValue(normalizedRow, ['segundo_apellido', 'apellido_2']) as
          | string
          | null,
        fecha_nacimiento: excelDateToIso(
          getValue(normalizedRow, ['fecha_nacimiento', 'nacimiento_fecha'])
        ),
        fecha_expedicion_documento: excelDateToIso(
          getValue(normalizedRow, ['fecha_expedicion_documento', 'fecha_expedicion'])
        ),
        municipio_nacimiento_id: getValue(normalizedRow, [
          'municipio_nacimiento_id',
          'municipio_nacimiento'
        ]) as string | null,
        municipio_expedicion_id: getValue(normalizedRow, [
          'municipio_expedicion_id',
          'municipio_expedicion'
        ]) as string | null,
        municipio_residencia_id: getValue(normalizedRow, [
          'municipio_residencia_id',
          'municipio_residencia'
        ]) as string | null,
        sexo_id: getValue(normalizedRow, ['sexo_id', 'sexo']) as string | null,
        estado_civil_id: getValue(normalizedRow, ['estado_civil_id', 'estado_civil']) as
          | string
          | null,
        tipo_sangre_id: getValue(normalizedRow, ['tipo_sangre_id', 'tipo_sangre']) as
          | string
          | null,
        estatura: getValue(normalizedRow, ['estatura']) as number | string | null,
        telefono: getValue(normalizedRow, ['telefono', 'celular']) as string | null,
        correo: getValue(normalizedRow, ['correo', 'email']) as string | null,
        direccion: getValue(normalizedRow, ['direccion']) as string | null,
        barrio: getValue(normalizedRow, ['barrio']) as string | null,
        zona_id: getValue(normalizedRow, ['zona_id', 'zona']) as string | null,
        activo: getValue(normalizedRow, ['activo']) as boolean | string | null
      },
      vinculacion: {
        empresa_id: getValue(normalizedRow, ['empresa_id', 'empresa']) as string | null,
        contrato_id: getValue(normalizedRow, ['contrato_id', 'contrato']) as string | null,
        contrato_cargo_id: getValue(normalizedRow, [
          'contrato_cargo_id',
          'cargo_id',
          'contrato_cargo',
          'cargo'
        ]) as string | null,
        fecha_inicio: excelDateToIso(
          getValue(normalizedRow, ['fecha_inicio', 'vinculacion_fecha_inicio'])
        ),
        fecha_fin: excelDateToIso(
          getValue(normalizedRow, ['fecha_fin', 'vinculacion_fecha_fin'])
        ),
        estado: getValue(normalizedRow, ['estado', 'estado_vinculacion']) as string | null,
        observaciones: getValue(normalizedRow, ['observaciones', 'observacion']) as string | null
      }
    };
  });
};
