import { AppError } from '../../utils/AppError';

export type FocalizacionImportStatus =
  | 'PROCESADA'
  | 'SIN_CAMBIO'
  | 'AUMENTO'
  | 'DISMINUCION'
  | 'NUEVA_SEDE'
  | 'NUEVA_MODALIDAD'
  | 'OFICIAL_POSTERIOR_AJUSTE_MANUAL'
  | 'SEDE_NO_RECONOCIDA'
  | 'POSIBLE_CAMBIO_DANE'
  | 'POSIBLE_CAMBIO_NOMBRE'
  | 'POSIBLE_COINCIDENCIA'
  | 'MUNICIPIO_NO_RECONOCIDO'
  | 'MODALIDAD_NO_RECONOCIDA'
  | 'FECHA_VIGENCIA_NO_RECONOCIDA'
  | 'FOCALIZACION_VACIA'
  | 'DUPLICADO_EN_ARCHIVO'
  | 'DUPLICADO_CONFLICTIVO'
  | 'SIN_REGLA_COBERTURA'
  | 'ERROR';

export type FocalizacionChangeKind = 'AUMENTO' | 'DISMINUCION' | 'SIN_CAMBIO' | 'NUEVA_COMBINACION';
export type CoverageRuleMethod = 'RANGOS' | 'FORMULA' | 'MANUAL';

export interface DetectedVigencia {
  fecha_inicio_vigencia: string;
  fecha_fin_vigencia: string;
  source: string;
}

export interface ParsedFocalizacionRow {
  fila_numero: number;
  consecutivo: string | null;
  municipio: string | null;
  institucion: string | null;
  sede: string | null;
  modalidad: string | null;
  techo_primaria: number | null;
  techo_secundaria: number | null;
  techo_total: number | null;
  focalizacion_primaria: number | null;
  focalizacion_secundaria: number | null;
  focalizacion_total: number | null;
}

export interface ImportDuplicateResolution {
  conflictRows: Map<number, number[]>;
  duplicateRows: Map<number, number[]>;
}

export interface CoverageRuleRange {
  desde: number;
  hasta: number | null;
  manipuladores_requeridos: number;
}

export interface CoverageRuleDefinition {
  id: number | null;
  contrato_id: number | null;
  modalidad_id: number | null;
  modalidad_codigo: string | null;
  metodo: CoverageRuleMethod;
  nombre: string;
  cupos_formula: string | null;
  factor_previo: number | null;
  resultado_formula: string | null;
  activo: boolean;
  rangos: CoverageRuleRange[];
}

export interface CoverageCalculationResult {
  cupos_calculo: number;
  manipuladores_requeridos: number | null;
  status: 'OK' | 'SIN_REGLA_COBERTURA';
}

const SPANISH_MONTHS: Record<string, number> = {
  ENERO: 1,
  FEBRERO: 2,
  MARZO: 3,
  ABRIL: 4,
  MAYO: 5,
  JUNIO: 6,
  JULIO: 7,
  AGOSTO: 8,
  SEPTIEMBRE: 9,
  SETIEMBRE: 9,
  OCTUBRE: 10,
  NOVIEMBRE: 11,
  DICIEMBRE: 12,
};

const DANGEROUS_KEYWORDS = [
  'require',
  'import',
  'eval',
  'function',
  'class',
  'new',
  'return',
  'while',
  'for',
  'if',
  'switch',
  'try',
  'catch',
  'throw',
  'delete',
  '__proto__',
  'constructor',
  'prototype',
  'window',
  'global',
  'process',
  'fetch',
  'document',
  'alert',
  'console',
  'this',
  '=>',
  '`',
];

const pad = (value: number): string => String(value).padStart(2, '0');

export const normalizeFocalizacionText = (value: string | null | undefined): string => {
  if (!value) {
    return '';
  }

  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bI\.?\s*E\.?\b/g, 'INSTITUCION EDUCATIVA')
    .replace(/\bC\.?\s*E\.?\b/g, 'CENTRO EDUCATIVO')
    .replace(/[^A-Z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
};

export const toNullableTrimmed = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
};

export const coerceOptionalInteger = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string') {
    const normalized = value.trim().replace(/\./g, '').replace(/,/g, '.');
    if (normalized.length === 0) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }

  return null;
};

const buildIsoDate = (year: number, month: number, day: number): string => {
  return `${year}-${pad(month)}-${pad(day)}`;
};

export const parseSpanishDateRange = (value: string | null | undefined): DetectedVigencia | null => {
  if (!value) {
    return null;
  }

  const normalized = normalizeFocalizacionText(value).replace(/\bDEL\b/g, '').replace(/\bDE\b/g, ' ').replace(/\s+/g, ' ').trim();
  const match = normalized.match(/(\d{1,2})\s+(?:AL|A|-)\s+(\d{1,2})\s+([A-Z]+)\s+(\d{4})/);

  if (!match) {
    return null;
  }

  const startDay = Number(match[1]);
  const endDay = Number(match[2]);
  const month = SPANISH_MONTHS[match[3] ?? ''];
  const year = Number(match[4]);

  if (!month || !Number.isFinite(startDay) || !Number.isFinite(endDay) || !Number.isFinite(year)) {
    return null;
  }

  if (startDay < 1 || startDay > 31 || endDay < 1 || endDay > 31 || startDay > endDay) {
    return null;
  }

  return {
    fecha_inicio_vigencia: buildIsoDate(year, month, startDay),
    fecha_fin_vigencia: buildIsoDate(year, month, endDay),
    source: value,
  };
};

export const detectEffectiveDateRange = (candidates: string[]): DetectedVigencia | null => {
  for (const candidate of candidates) {
    const parsed = parseSpanishDateRange(candidate);
    if (parsed) {
      return parsed;
    }
  }

  return null;
};

export const detectImportDuplicates = (rows: ParsedFocalizacionRow[]): ImportDuplicateResolution => {
  const rowsByKey = new Map<string, ParsedFocalizacionRow[]>();

  for (const row of rows) {
    const parts = [
      normalizeFocalizacionText(row.consecutivo),
      normalizeFocalizacionText(row.sede),
      normalizeFocalizacionText(row.modalidad),
    ];
    const key = parts.join('|');
    const current = rowsByKey.get(key) ?? [];
    current.push(row);
    rowsByKey.set(key, current);
  }

  const duplicateRows = new Map<number, number[]>();
  const conflictRows = new Map<number, number[]>();

  for (const group of rowsByKey.values()) {
    if (group.length <= 1) {
      continue;
    }

    const signatureSet = new Set(
      group.map((row) => JSON.stringify({
        focalizacion_total: row.focalizacion_total,
        focalizacion_primaria: row.focalizacion_primaria,
        focalizacion_secundaria: row.focalizacion_secundaria,
        techo_total: row.techo_total,
        techo_primaria: row.techo_primaria,
        techo_secundaria: row.techo_secundaria,
      }))
    );

    const target = signatureSet.size > 1 ? conflictRows : duplicateRows;

    for (const row of group) {
      target.set(
        row.fila_numero,
        group.filter((item) => item.fila_numero !== row.fila_numero).map((item) => item.fila_numero)
      );
    }
  }

  return {
    duplicateRows,
    conflictRows,
  };
};

export const buildChangeKind = (
  previousTotal: number | null,
  nextTotal: number
): FocalizacionChangeKind => {
  if (previousTotal === null || previousTotal === undefined) {
    return 'NUEVA_COMBINACION';
  }

  if (nextTotal > previousTotal) {
    return 'AUMENTO';
  }

  if (nextTotal < previousTotal) {
    return 'DISMINUCION';
  }

  return 'SIN_CAMBIO';
};

const validateExpression = (formula: string, allowedVars: string[]): void => {
  const clean = formula.trim();

  if (!clean) {
    throw new AppError('La formula de cobertura no puede estar vacia', 422, 'COVERAGE_FORMULA_INVALIDA');
  }

  const lowered = clean.toLowerCase();
  for (const keyword of DANGEROUS_KEYWORDS) {
    if (lowered.includes(keyword.toLowerCase())) {
      throw new AppError('La formula de cobertura contiene terminos no permitidos', 422, 'COVERAGE_FORMULA_INVALIDA', { keyword });
    }
  }

  if (!/^[a-z_\d\s+\-*/().]+$/i.test(clean)) {
    throw new AppError('La formula de cobertura contiene caracteres no permitidos', 422, 'COVERAGE_FORMULA_INVALIDA');
  }

  const tokens = clean.match(/[a-z_][a-z_\d]*/gi) ?? [];
  const invalidVars = tokens.filter((token) => !allowedVars.includes(token));

  if (invalidVars.length > 0) {
    throw new AppError('La formula de cobertura usa variables no autorizadas', 422, 'COVERAGE_FORMULA_INVALIDA', {
      invalidVars,
    });
  }
};

const evaluateExpression = (formula: string, values: Record<string, number>): number => {
  validateExpression(formula, Object.keys(values));

  let expression = formula.trim();
  const sortedEntries = Object.entries(values).sort(([left], [right]) => right.length - left.length);
  for (const [name, numericValue] of sortedEntries) {
    expression = expression.replace(new RegExp(`\\b${name}\\b`, 'g'), String(numericValue));
  }

  if (!/^[\d\s+\-*/().]+$/.test(expression)) {
    throw new AppError('La formula de cobertura contiene referencias sin resolver', 422, 'COVERAGE_FORMULA_INVALIDA');
  }

  try {
    // eslint-disable-next-line no-new-func
    const result = new Function(`"use strict"; return (${expression});`)() as unknown;
    if (typeof result !== 'number' || !Number.isFinite(result)) {
      throw new Error('non numeric');
    }

    return result;
  } catch {
    throw new AppError('No fue posible evaluar la formula de cobertura', 422, 'COVERAGE_FORMULA_INVALIDA');
  }
};

export const calculateCoverageFromRule = (
  rule: CoverageRuleDefinition,
  focalizacionTotal: number
): CoverageCalculationResult => {
  const baseValues = {
    cupos: Math.max(0, focalizacionTotal),
    total: Math.max(0, focalizacionTotal),
  };

  const cuposCalculo = rule.cupos_formula
    ? Math.max(0, Math.round(evaluateExpression(rule.cupos_formula, baseValues)))
    : rule.factor_previo !== null
      ? Math.max(0, Math.round(baseValues.cupos * rule.factor_previo))
      : baseValues.cupos;

  if (rule.metodo === 'FORMULA') {
    if (!rule.resultado_formula) {
      return {
        cupos_calculo: cuposCalculo,
        manipuladores_requeridos: null,
        status: 'SIN_REGLA_COBERTURA',
      };
    }

    const result = Math.round(
      evaluateExpression(rule.resultado_formula, {
        ...baseValues,
        cupos_calculo: cuposCalculo,
      })
    );

    return {
      cupos_calculo: cuposCalculo,
      manipuladores_requeridos: result,
      status: 'OK',
    };
  }

  if (rule.metodo === 'RANGOS') {
    const matched = rule.rangos
      .slice()
      .sort((left, right) => left.desde - right.desde)
      .find((range) => cuposCalculo >= range.desde && (range.hasta === null || cuposCalculo <= range.hasta));

    if (!matched) {
      return {
        cupos_calculo: cuposCalculo,
        manipuladores_requeridos: null,
        status: 'SIN_REGLA_COBERTURA',
      };
    }

    return {
      cupos_calculo: cuposCalculo,
      manipuladores_requeridos: matched.manipuladores_requeridos,
      status: 'OK',
    };
  }

  return {
    cupos_calculo: cuposCalculo,
    manipuladores_requeridos: null,
    status: 'SIN_REGLA_COBERTURA',
  };
};
