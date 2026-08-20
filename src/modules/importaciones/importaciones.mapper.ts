import * as XLSX from 'xlsx';

import type { OperationalImportRow } from './importaciones.domain';

export interface RawExcelRow {
  [key: string]: unknown;
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

const toStringOrNull = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return String(value).trim() || null;
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

    const parsed = new Date(trimmed);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
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

export const mapExcelRows = (rows: RawExcelRow[]): OperationalImportRow[] => {
  return rows.map((row, index) => {
    const normalizedRow: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(row)) {
      normalizedRow[normalizeHeader(key)] = normalizeValue(value);
    }

    const fechaNacimientoRaw = getValue(normalizedRow, ['fecha_nacimiento', 'nacimiento_fecha']);
    const fechaExpedicionRaw = getValue(normalizedRow, ['fecha_expedicion', 'fecha_expedicion_documento']);
    const fechaIngresoRaw = getValue(normalizedRow, ['fecha_ingreso', 'fecha_inicio', 'vinculacion_fecha_inicio']);

    return {
      rowNumber: index + 2,
      rawData: row,
      persona: {
        tipo_identificacion: toStringOrNull(
          getValue(normalizedRow, [
            'tipo_identificacion',
            'tipo_documento',
            'tipo_documento_id'
          ])
        ),
        numero_documento: toStringOrNull(
          getValue(normalizedRow, [
            'numero_identificacion',
            'numero_documento',
            'documento',
            'nro_documento',
            'numero_de_documento'
          ])
        ),
        primer_nombre: toStringOrNull(getValue(normalizedRow, ['primer_nombre', 'nombres', 'nombre_1'])),
        segundo_nombre: toStringOrNull(getValue(normalizedRow, ['segundo_nombre', 'nombre_2'])),
        primer_apellido: toStringOrNull(getValue(normalizedRow, ['primer_apellido', 'apellidos', 'apellido_1'])),
        segundo_apellido: toStringOrNull(getValue(normalizedRow, ['segundo_apellido', 'apellido_2'])),
        fecha_nacimiento: excelDateToIso(fechaNacimientoRaw),
        fecha_nacimiento_raw: toStringOrNull(fechaNacimientoRaw),
        fecha_expedicion: excelDateToIso(fechaExpedicionRaw),
        fecha_expedicion_raw: toStringOrNull(fechaExpedicionRaw),
        lugar_expedicion: toStringOrNull(
          getValue(normalizedRow, ['lugar_expedicion', 'municipio_expedicion', 'municipio_expedicion_id'])
        ),
        telefono: toStringOrNull(getValue(normalizedRow, ['telefono', 'celular'])),
        correo: toStringOrNull(getValue(normalizedRow, ['correo', 'email'])),
        direccion: toStringOrNull(getValue(normalizedRow, ['direccion'])),
        municipio_residencia: toStringOrNull(
          getValue(normalizedRow, ['municipio_residencia', 'municipio_residencia_id'])
        )
      },
      vinculacion: {
        cargo: toStringOrNull(getValue(normalizedRow, ['cargo', 'contrato_cargo', 'contrato_cargo_id', 'cargo_id'])),
        tipo_vinculacion: toStringOrNull(
          getValue(normalizedRow, ['tipo_vinculacion', 'tipo_vinculacion_id'])
        ),
        fecha_ingreso: excelDateToIso(fechaIngresoRaw),
        fecha_ingreso_raw: toStringOrNull(fechaIngresoRaw),
        metodo_pago: toStringOrNull(getValue(normalizedRow, ['metodo_pago'])),
        estado: toStringOrNull(getValue(normalizedRow, ['estado', 'estado_vinculacion']))
      }
    } satisfies OperationalImportRow;
  });
};
