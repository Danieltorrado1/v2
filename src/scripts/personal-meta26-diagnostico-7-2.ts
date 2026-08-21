import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import * as XLSX from 'xlsx';

import {
  buildCsv,
  META26_FILE,
  runPersonalMeta26DryRun,
  type CoveragePreviewRow,
  type DryRunRowReport,
} from '../modules/importaciones/personalMeta26DryRun';

interface SourceCoverageRow {
  consecutivo: string | null;
  fila: number;
  institucion: string | null;
  modalidad: string | null;
  municipio: string | null;
  sede: string | null;
}

interface CorrectionProposalRow {
  aplicable_automaticamente: 'SI' | 'NO';
  campo: string;
  cedula: string | null;
  confianza: 'ALTA' | 'MEDIA';
  fila: number;
  fuente_evidencia: string;
  valor_actual: string | null;
  valor_propuesto: string | null;
}

interface ManualDecisionRow {
  cedula: string | null;
  decision_usuario: string;
  fila: number;
  institucion_xlsx: string | null;
  modalidad_xlsx: string | null;
  motivo: string;
  municipio_xlsx: string | null;
  nombre: string | null;
  opciones: string | null;
  recomendacion: string | null;
  sede_xlsx: string | null;
  tipo_problema: string;
  valor_oficial_encontrado: string | null;
}

interface CoverageIssueSummary {
  classification: string;
  confidence: 'INEQUIVOCO' | 'PROBABLE' | 'AMBIGUO';
  counts_as_difference: boolean;
  counts_as_real_problem: boolean;
  manual_required: boolean;
  official_candidates: CoveragePreviewRow[];
  source_candidates: SourceCoverageRow[];
}

interface CoverageDistributionRow {
  asignables_inequivocos: number;
  diferencia_despues_inequivocos: number;
  diferencia_inicial: number;
  estado_despues_inequivocos: 'CUMPLE_EXACTO' | 'DEFICIT' | 'EXCESO' | 'SIN_REQUERIMIENTO';
  estado_inicial: 'CUMPLE_EXACTO' | 'DEFICIT' | 'EXCESO' | 'SIN_REQUERIMIENTO';
  institucion: string | null;
  modalidad: string | null;
  municipio: string | null;
  personas_inequivocas: number;
  personas_revision: number;
  personas_xlsx: number;
  requeridas: number;
  sede: string | null;
}

const OUTPUT_DECISIONS = 'reports/personal-meta26-decisiones-humanas-final.csv';
const OUTPUT_CORRECTIONS = 'reports/personal-meta26-correcciones-propuestas.csv';

const normalizeText = (value: string | null | undefined): string => {
  if (!value) return '';
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bI\.?\s*E\.?\b/gi, 'INSTITUCION EDUCATIVA')
    .replace(/\bC\.?\s*E\.?\b/gi, 'CENTRO EDUCATIVO')
    .replace(/[^A-Z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
};

const normalizeCompact = (value: string | null | undefined): string => normalizeText(value).replace(/\s+/g, '');

const stripInstitutionPrefix = (value: string | null | undefined): string => normalizeText(value)
  .replace(/^(INSTITUCION\s*EDUCATIVA|CENTRO\s*EDUCATIVO|INST\s*EDUC|I\s*E)\s*/g, '')
  .trim();

const stripSedePrefix = (value: string | null | undefined): string => normalizeText(value)
  .replace(/^(SEDE\s*PRINCIPAL|SEDE|PRINCIPAL)\s*/g, '')
  .trim();

const tokenize = (value: string | null | undefined, kind: 'institucion' | 'sede'): string[] => {
  const stripped = kind === 'institucion' ? stripInstitutionPrefix(value) : stripSedePrefix(value);
  return stripped.split(' ').map((item) => item.trim()).filter(Boolean);
};

const sameMunicipio = (left: string | null | undefined, right: string | null | undefined): boolean => normalizeText(left) === normalizeText(right);
const sameModalidad = (left: string | null | undefined, right: string | null | undefined): boolean => normalizeText(left) === normalizeText(right);
const sameInstitution = (left: string | null | undefined, right: string | null | undefined): boolean => {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);
  return normalizedLeft === normalizedRight || stripInstitutionPrefix(left) === stripInstitutionPrefix(right);
};
const sameSede = (left: string | null | undefined, right: string | null | undefined): boolean => {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);
  return normalizedLeft === normalizedRight || stripSedePrefix(left) === stripSedePrefix(right);
};

const toUniqueStrings = (values: Array<string | null | undefined>): string[] => [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))];

const levenshteinDistance = (left: string, right: string): number => {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;

  const matrix = Array.from({ length: left.length + 1 }, () => Array<number>(right.length + 1).fill(0));
  for (let row = 0; row <= left.length; row += 1) matrix[row]![0] = row;
  for (let col = 0; col <= right.length; col += 1) matrix[0]![col] = col;

  for (let row = 1; row <= left.length; row += 1) {
    for (let col = 1; col <= right.length; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      matrix[row]![col] = Math.min(
        matrix[row - 1]![col]! + 1,
        matrix[row]![col - 1]! + 1,
        matrix[row - 1]![col - 1]! + cost,
      );
    }
  }

  return matrix[left.length]![right.length]!;
};

const similarityScore = (source: string | null | undefined, target: string | null | undefined, kind: 'institucion' | 'sede'): number => {
  const baseSource = kind === 'institucion' ? stripInstitutionPrefix(source) : stripSedePrefix(source);
  const baseTarget = kind === 'institucion' ? stripInstitutionPrefix(target) : stripSedePrefix(target);

  if (!baseSource || !baseTarget) return 0;
  if (baseSource === baseTarget) return 100;

  const compactSource = normalizeCompact(baseSource);
  const compactTarget = normalizeCompact(baseTarget);
  if (compactSource === compactTarget) return 98;
  if (compactTarget.includes(compactSource) || compactSource.includes(compactTarget)) return 92;

  const sourceTokens = tokenize(baseSource, kind);
  const targetTokens = tokenize(baseTarget, kind);
  const intersection = sourceTokens.filter((token) => targetTokens.includes(token)).length;
  const overlap = sourceTokens.length === 0 || targetTokens.length === 0
    ? 0
    : intersection / Math.max(sourceTokens.length, targetTokens.length);

  const distance = levenshteinDistance(compactSource, compactTarget);
  const maxLength = Math.max(compactSource.length, compactTarget.length, 1);
  const distanceScore = Math.max(0, 1 - distance / maxLength);
  return Math.round((overlap * 70) + (distanceScore * 30));
};

const sourceRowsForMunicipio = (sourceRows: SourceCoverageRow[], municipio: string | null | undefined): SourceCoverageRow[] =>
  sourceRows.filter((row) => sameMunicipio(row.municipio, municipio));

const officialRowsForMunicipio = (officialRows: CoveragePreviewRow[], municipio: string | null | undefined): CoveragePreviewRow[] =>
  officialRows.filter((row) => sameMunicipio(row.municipio, municipio));

const findSourceRows = (
  sourceRows: SourceCoverageRow[],
  filters: {
    institucion?: string | null;
    modalidad?: string | null;
    municipio?: string | null;
    sede?: string | null;
  },
): SourceCoverageRow[] => sourceRows.filter((row) =>
  (filters.municipio === undefined || sameMunicipio(row.municipio, filters.municipio)) &&
  (filters.institucion === undefined || sameInstitution(row.institucion, filters.institucion)) &&
  (filters.sede === undefined || sameSede(row.sede, filters.sede)) &&
  (filters.modalidad === undefined || sameModalidad(row.modalidad, filters.modalidad))
);

const findOfficialRows = (
  officialRows: CoveragePreviewRow[],
  filters: {
    institucion?: string | null;
    modalidad?: string | null;
    municipio?: string | null;
    sede?: string | null;
  },
): CoveragePreviewRow[] => officialRows.filter((row) =>
  (filters.municipio === undefined || sameMunicipio(row.municipio, filters.municipio)) &&
  (filters.institucion === undefined || sameInstitution(row.institucion, filters.institucion)) &&
  (filters.sede === undefined || sameSede(row.sede, filters.sede)) &&
  (filters.modalidad === undefined || sameModalidad(row.modalidad, filters.modalidad))
);

const loadSourceCoverageRows = (filePath: string): SourceCoverageRow[] => {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('FOCALIZACION_XLSX_SIN_HOJAS');
  }
  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) {
    throw new Error(`FOCALIZACION_XLSX_HOJA_NO_DISPONIBLE:${firstSheetName}`);
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { range: 1, defval: '' });
  return rows.map((row, index) => ({
    fila: index + 3,
    consecutivo: row.CONSECUTIVO ? String(row.CONSECUTIVO) : null,
    municipio: typeof row.MUNICIPIO === 'string' ? row.MUNICIPIO : row.MUNICIPIO ? String(row.MUNICIPIO) : null,
    institucion: typeof row['INSTITUCION EDUCATIVA'] === 'string' ? row['INSTITUCION EDUCATIVA'] : row['INSTITUCION EDUCATIVA'] ? String(row['INSTITUCION EDUCATIVA']) : null,
    sede: typeof row['SEDE EDUCATIVA'] === 'string' ? row['SEDE EDUCATIVA'] : row['SEDE EDUCATIVA'] ? String(row['SEDE EDUCATIVA']) : null,
    modalidad: typeof row['MODALIDAD OK'] === 'string' ? row['MODALIDAD OK'] : row['MODALIDAD OK'] ? String(row['MODALIDAD OK']) : null,
  }));
};

const coverageStateFromDifference = (requeridas: number, asignadas: number): 'CUMPLE_EXACTO' | 'DEFICIT' | 'EXCESO' | 'SIN_REQUERIMIENTO' => {
  if (requeridas === 0) return 'SIN_REQUERIMIENTO';
  if (asignadas === requeridas) return 'CUMPLE_EXACTO';
  return asignadas < requeridas ? 'DEFICIT' : 'EXCESO';
};

const countRowsByCoverageKey = (rows: DryRunRowReport[]): Map<string, number> => {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (normalizeText(row.cargo_resuelto) !== 'MANIPULADOR A DE ALIMENTOS' && normalizeText(row.cargo_origen) !== 'MANIPULADORA DE ALIMENTOS') {
      continue;
    }
    const key = [
      normalizeText(row.municipio_origen),
      normalizeText(row.institucion_origen),
      normalizeText(row.sede_origen),
      normalizeText(row.modalidad_origen),
    ].join('|');
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
};

const seatKey = (row: Pick<CoveragePreviewRow, 'municipio' | 'institucion' | 'sede'>): string => [
  normalizeText(row.municipio),
  normalizeText(row.institucion),
  normalizeText(row.sede),
].join('|');

const diagnoseCoverageIssue = (
  row: DryRunRowReport,
  sourceRows: SourceCoverageRow[],
  officialRows: CoveragePreviewRow[],
): CoverageIssueSummary | null => {
  if (row.cobertura_estado === 'ASIGNACION_OK' || row.cobertura_estado === 'NO_APLICA' || row.cobertura_estado === 'SIN_ASIGNACION') {
    return null;
  }

  if (row.cobertura_estado === 'MUNICIPIO_NO_RECONOCIDO') {
    const sourceCandidates = findSourceRows(sourceRows, {
      institucion: row.institucion_origen,
      sede: row.sede_origen,
      modalidad: row.modalidad_origen,
    });
    const officialCandidates = findOfficialRows(officialRows, {
      institucion: row.institucion_origen,
      sede: row.sede_origen,
      modalidad: row.modalidad_origen,
    });
    if (sourceCandidates.length === 1 && officialCandidates.length === 1) {
      return {
        classification: 'MUNICIPIO_REMAPEADO_ENTRE_FOCALIZACION_XLSX_Y_MAESTRO_BD',
        confidence: 'INEQUIVOCO',
        counts_as_difference: true,
        counts_as_real_problem: false,
        manual_required: false,
        source_candidates: sourceCandidates,
        official_candidates: officialCandidates,
      };
    }
    return {
      classification: 'MUNICIPIO_SIN_RESOLUCION_DETERMINISTA',
      confidence: 'AMBIGUO',
      counts_as_difference: false,
      counts_as_real_problem: true,
      manual_required: true,
      source_candidates: sourceCandidates,
      official_candidates: officialCandidates,
    };
  }

  if (row.cobertura_estado === 'INSTITUCION_NO_RECONOCIDA') {
    const exactSourceContext = findSourceRows(sourceRows, {
      municipio: row.municipio_origen,
      sede: row.sede_origen,
      modalidad: row.modalidad_origen,
    });
    const officialContext = findOfficialRows(officialRows, {
      sede: row.sede_origen,
      modalidad: row.modalidad_origen,
    });
    if (exactSourceContext.length === 1 && officialContext.length === 1) {
      return {
        classification: sameMunicipio(row.municipio_origen, officialContext[0]?.municipio)
          ? 'INSTITUCION_RENOMBRADA_ENTRE_FOCALIZACION_Y_MAESTRO_BD'
          : 'INSTITUCION_Y_MUNICIPIO_REMAPEADOS_ENTRE_FOCALIZACION_Y_MAESTRO_BD',
        confidence: 'INEQUIVOCO',
        counts_as_difference: true,
        counts_as_real_problem: false,
        manual_required: false,
        source_candidates: exactSourceContext,
        official_candidates: officialContext,
      };
    }

    const sameMunicipioSource = sourceRowsForMunicipio(sourceRows, row.municipio_origen);
    const scoredSource = sameMunicipioSource
      .filter((candidate) => sameSede(candidate.sede, row.sede_origen) || sameModalidad(candidate.modalidad, row.modalidad_origen))
      .map((candidate) => ({
        candidate,
        score: similarityScore(row.institucion_origen, candidate.institucion, 'institucion'),
      }))
      .sort((left, right) => right.score - left.score);
    if ((scoredSource[0]?.score ?? 0) >= 85 && (scoredSource[0]?.score ?? 0) - (scoredSource[1]?.score ?? 0) >= 10) {
      return {
        classification: 'INSTITUCION_VARIANTE_NOMBRE_RESOLVIBLE',
        confidence: 'INEQUIVOCO',
        counts_as_difference: false,
        counts_as_real_problem: false,
        manual_required: false,
        source_candidates: [scoredSource[0]!.candidate],
        official_candidates: [],
      };
    }

    if ((scoredSource[0]?.score ?? 0) >= 70) {
      return {
        classification: 'INSTITUCION_VARIANTE_NOMBRE_PROBABLE',
        confidence: 'PROBABLE',
        counts_as_difference: false,
        counts_as_real_problem: false,
        manual_required: false,
        source_candidates: [scoredSource[0]!.candidate],
        official_candidates: [],
      };
    }

    return {
      classification: 'INSTITUCION_REQUIERE_DECISION_HUMANA',
      confidence: 'AMBIGUO',
      counts_as_difference: false,
      counts_as_real_problem: true,
      manual_required: true,
      source_candidates: exactSourceContext,
      official_candidates: officialContext,
    };
  }

  if (row.cobertura_estado === 'SEDE_NO_RECONOCIDA') {
    const exactSourceContext = findSourceRows(sourceRows, {
      municipio: row.municipio_origen,
      institucion: row.institucion_origen,
      modalidad: row.modalidad_origen,
    });
    if (exactSourceContext.length === 1) {
      return {
        classification: 'SEDE_VARIANTE_NOMBRE_RESOLVIBLE',
        confidence: 'INEQUIVOCO',
        counts_as_difference: false,
        counts_as_real_problem: false,
        manual_required: false,
        source_candidates: exactSourceContext,
        official_candidates: [],
      };
    }

    const sameInstitutionSource = sourceRows.filter((candidate) =>
      sameMunicipio(candidate.municipio, row.municipio_origen) &&
      sameInstitution(candidate.institucion, row.institucion_origen)
    );
    const scoredSource = sameInstitutionSource
      .map((candidate) => ({
        candidate,
        score: similarityScore(row.sede_origen, candidate.sede, 'sede'),
      }))
      .sort((left, right) => right.score - left.score);

    if ((scoredSource[0]?.score ?? 0) >= 85 && (scoredSource[0]?.score ?? 0) - (scoredSource[1]?.score ?? 0) >= 10) {
      return {
        classification: 'SEDE_VARIANTE_NOMBRE_RESOLVIBLE',
        confidence: 'INEQUIVOCO',
        counts_as_difference: false,
        counts_as_real_problem: false,
        manual_required: false,
        source_candidates: [scoredSource[0]!.candidate],
        official_candidates: [],
      };
    }

    const sedeAsInstitution = sameInstitutionSource.filter((candidate) => sameInstitution(candidate.institucion, row.sede_origen));
    if (sedeAsInstitution.length === 1) {
      return {
        classification: 'CAMPO_SEDE_CONTIENE_NOMBRE_DE_INSTITUCION',
        confidence: 'INEQUIVOCO',
        counts_as_difference: false,
        counts_as_real_problem: false,
        manual_required: false,
        source_candidates: sedeAsInstitution,
        official_candidates: [],
      };
    }

    return {
      classification: 'SEDE_REQUIERE_DECISION_HUMANA',
      confidence: 'AMBIGUO',
      counts_as_difference: false,
      counts_as_real_problem: true,
      manual_required: true,
      source_candidates: exactSourceContext,
      official_candidates: [],
    };
  }

  if (row.cobertura_estado === 'SEDE_MODALIDAD_NO_EXISTE') {
    const officialSeatRows = officialRows.filter((candidate) =>
      sameMunicipio(candidate.municipio, row.municipio_origen) &&
      sameInstitution(candidate.institucion, row.institucion_origen) &&
      sameSede(candidate.sede, row.sede_origen)
    );
    const deficitCandidates = officialSeatRows.filter((candidate) => candidate.diferencia < 0);
    if (officialSeatRows.length === 1) {
      return {
        classification: 'SEDE_EXISTE_MODALIDAD_DISTINTA',
        confidence: 'PROBABLE',
        counts_as_difference: true,
        counts_as_real_problem: false,
        manual_required: false,
        source_candidates: findSourceRows(sourceRows, {
          municipio: row.municipio_origen,
          institucion: row.institucion_origen,
          sede: row.sede_origen,
        }),
        official_candidates: officialSeatRows,
      };
    }
    if (officialSeatRows.length > 1 && deficitCandidates.length === 1) {
      return {
        classification: 'SEDE_EXISTE_OTRA_MODALIDAD_ADICIONAL',
        confidence: 'INEQUIVOCO',
        counts_as_difference: true,
        counts_as_real_problem: false,
        manual_required: false,
        source_candidates: findSourceRows(sourceRows, {
          municipio: row.municipio_origen,
          institucion: row.institucion_origen,
          sede: row.sede_origen,
        }),
        official_candidates: deficitCandidates,
      };
    }
    return {
      classification: officialSeatRows.length > 1
        ? 'SEDE_EXISTE_OTRA_MODALIDAD_ADICIONAL'
        : 'SEDE_MODALIDAD_INCONSISTENTE_SIN_CANDIDATO',
      confidence: 'AMBIGUO',
      counts_as_difference: officialSeatRows.length > 0,
      counts_as_real_problem: officialSeatRows.length === 0,
      manual_required: true,
      source_candidates: findSourceRows(sourceRows, {
        municipio: row.municipio_origen,
        institucion: row.institucion_origen,
        sede: row.sede_origen,
      }),
      official_candidates: officialSeatRows,
    };
  }

  return {
    classification: row.cobertura_estado,
    confidence: 'AMBIGUO',
    counts_as_difference: false,
    counts_as_real_problem: true,
    manual_required: true,
    source_candidates: [],
    official_candidates: [],
  };
};

const addCoverageCorrectionProposal = (
  row: DryRunRowReport,
  diagnosis: CoverageIssueSummary,
  corrections: CorrectionProposalRow[],
): void => {
  const candidate = diagnosis.official_candidates[0] ?? diagnosis.source_candidates[0];
  if (!candidate) return;

  const pushProposal = (campo: string, actual: string | null | undefined, proposed: string | null | undefined, fuente: string, confianza: 'ALTA' | 'MEDIA', automatic: 'SI' | 'NO') => {
    if (!proposed || normalizeText(actual) === normalizeText(proposed)) return;
    corrections.push({
      fila: row.fila_origen,
      cedula: row.cedula,
      campo,
      valor_actual: actual ?? null,
      valor_propuesto: proposed ?? null,
      fuente_evidencia: fuente,
      confianza,
      aplicable_automaticamente: automatic,
    });
  };

  const confidence = diagnosis.confidence === 'AMBIGUO' ? 'MEDIA' : 'ALTA';
  const automatic = diagnosis.confidence === 'INEQUIVOCO' ? 'SI' : 'NO';

  if ('municipio' in candidate) {
    pushProposal(
      'municipio',
      row.municipio_origen,
      candidate.municipio,
      diagnosis.counts_as_difference
        ? 'focalizacion-agosto-2026.xlsx + focalizacion_final contrato 24'
        : 'focalizacion-agosto-2026.xlsx',
      confidence,
      automatic,
    );
    pushProposal(
      'institucion',
      row.institucion_origen,
      candidate.institucion,
      diagnosis.counts_as_difference
        ? 'focalizacion-agosto-2026.xlsx + focalizacion_final contrato 24'
        : 'focalizacion-agosto-2026.xlsx',
      confidence,
      automatic,
    );
    pushProposal(
      'sede',
      row.sede_origen,
      candidate.sede,
      diagnosis.counts_as_difference
        ? 'focalizacion-agosto-2026.xlsx + focalizacion_final contrato 24'
        : 'focalizacion-agosto-2026.xlsx',
      confidence,
      automatic,
    );
    pushProposal(
      'modalidad',
      row.modalidad_origen,
      candidate.modalidad,
      diagnosis.counts_as_difference
        ? 'focalizacion_final contrato 24'
        : 'focalizacion-agosto-2026.xlsx',
      diagnosis.confidence === 'PROBABLE' ? 'MEDIA' : confidence,
      diagnosis.confidence === 'PROBABLE' ? 'NO' : automatic,
    );
  }
};

const buildManualDecision = (
  row: DryRunRowReport,
  tipoProblema: string,
  motivo: string,
  recommendation: string | null,
  opciones: string | null,
  valorOficial: string | null,
): ManualDecisionRow => ({
  fila: row.fila_origen,
  cedula: row.cedula,
  nombre: row.nombre,
  tipo_problema: tipoProblema,
  municipio_xlsx: row.municipio_origen,
  institucion_xlsx: row.institucion_origen,
  sede_xlsx: row.sede_origen,
  modalidad_xlsx: row.modalidad_origen,
  valor_oficial_encontrado: valorOficial,
  opciones,
  recomendacion: recommendation,
  motivo,
  decision_usuario: '',
});

const buildCoverageDistribution = (
  reportRows: DryRunRowReport[],
  coveragePreview: CoveragePreviewRow[],
  inequivoqueRows: Map<number, CoveragePreviewRow>,
): CoverageDistributionRow[] => {
  const allManipRows = reportRows.filter((row) => normalizeText(row.cargo_origen) === 'MANIPULADORA DE ALIMENTOS' || normalizeText(row.cargo_resuelto) === 'MANIPULADOR A DE ALIMENTOS');
  const bySourceKey = countRowsByCoverageKey(allManipRows);
  const byReviewKey = countRowsByCoverageKey(allManipRows.filter((row) => row.cobertura_estado !== 'ASIGNACION_OK'));
  const byInequivocalTarget = new Map<string, number>();

  for (const candidate of inequivoqueRows.values()) {
    const key = [
      normalizeText(candidate.municipio),
      normalizeText(candidate.institucion),
      normalizeText(candidate.sede),
      normalizeText(candidate.modalidad),
    ].join('|');
    byInequivocalTarget.set(key, (byInequivocalTarget.get(key) ?? 0) + 1);
  }

  return coveragePreview.map((row) => {
    const key = [
      normalizeText(row.municipio),
      normalizeText(row.institucion),
      normalizeText(row.sede),
      normalizeText(row.modalidad),
    ].join('|');
    const personasXlsx = bySourceKey.get(key) ?? 0;
    const personasRevision = byReviewKey.get(key) ?? 0;
    const personasInequivocas = byInequivocalTarget.get(key) ?? 0;
    const asignadasDespues = row.asignadas_propuestas + personasInequivocas;
    return {
      municipio: row.municipio,
      institucion: row.institucion,
      sede: row.sede,
      modalidad: row.modalidad,
      requeridas: row.requeridas,
      personas_xlsx: personasXlsx,
      personas_revision: personasRevision,
      personas_inequivocas: personasInequivocas,
      asignables_inequivocos: asignadasDespues,
      diferencia_inicial: row.diferencia,
      diferencia_despues_inequivocos: asignadasDespues - row.requeridas,
      estado_inicial: coverageStateFromDifference(row.requeridas, row.asignadas_propuestas),
      estado_despues_inequivocos: coverageStateFromDifference(row.requeridas, asignadasDespues),
    };
  });
};

const summarizeDistribution = (
  rows: CoverageDistributionRow[],
  field: 'estado_inicial' | 'estado_despues_inequivocos',
): Record<'CUMPLE_EXACTO' | 'DEFICIT' | 'EXCESO' | 'SIN_REQUERIMIENTO', number> => rows.reduce((accumulator, row) => {
  accumulator[row[field]] += 1;
  return accumulator;
}, {
  CUMPLE_EXACTO: 0,
  DEFICIT: 0,
  EXCESO: 0,
  SIN_REQUERIMIENTO: 0,
});

const main = async (): Promise<void> => {
  const report = await runPersonalMeta26DryRun(META26_FILE);
  const sourceCoverageRows = loadSourceCoverageRows(path.resolve('data/focalizacion-agosto-2026.xlsx'));
  const officialCoverageRows = report.coverage_preview;
  const reviewRowIds = new Set(report.review_rows.map((row) => row.fila_origen));
  const reviewRows = report.report_rows.filter((row) => reviewRowIds.has(row.fila_origen));

  const coverageRows = reviewRows.filter((row) =>
    ['MUNICIPIO_NO_RECONOCIDO', 'INSTITUCION_NO_RECONOCIDA', 'SEDE_NO_RECONOCIDA', 'SEDE_MODALIDAD_NO_EXISTE'].includes(row.cobertura_estado)
  );
  const nonCoverageRows = reviewRows.filter((row) => !coverageRows.includes(row));

  const corrections: CorrectionProposalRow[] = [];
  const manualRows = new Map<number, ManualDecisionRow>();
  const coverageDiagnostics = new Map<number, CoverageIssueSummary>();
  const inequivoqueCoverageCandidates = new Map<number, CoveragePreviewRow>();

  for (const row of coverageRows) {
    const diagnosis = diagnoseCoverageIssue(row, sourceCoverageRows, officialCoverageRows);
    if (!diagnosis) continue;
    coverageDiagnostics.set(row.fila_origen, diagnosis);
    addCoverageCorrectionProposal(row, diagnosis, corrections);

    if (diagnosis.confidence === 'INEQUIVOCO' && diagnosis.official_candidates.length === 1) {
      inequivoqueCoverageCandidates.set(row.fila_origen, diagnosis.official_candidates[0]!);
    }

    if (diagnosis.manual_required) {
      manualRows.set(row.fila_origen, buildManualDecision(
        row,
        diagnosis.classification,
        diagnosis.classification === 'SEDE_EXISTE_OTRA_MODALIDAD_ADICIONAL'
          ? 'La sede existe en el maestro oficial, pero quedan varias modalidades posibles aun usando el balance actual.'
          : 'No hay una conciliación determinista suficiente entre Personal, focalización-agosto-2026.xlsx y focalizacion_final.',
        diagnosis.classification === 'SEDE_EXISTE_OTRA_MODALIDAD_ADICIONAL'
          ? 'Definir modalidad oficial para esta persona en esa sede antes del smoke.'
          : 'Corregir dato operativo o confirmar la entidad oficial correcta.',
        diagnosis.official_candidates.length > 0
          ? toUniqueStrings(diagnosis.official_candidates.map((candidate) => `${candidate.municipio} | ${candidate.institucion} | ${candidate.sede} | ${candidate.modalidad}`)).join(' || ')
          : diagnosis.source_candidates.length > 0
            ? toUniqueStrings(diagnosis.source_candidates.map((candidate) => `${candidate.municipio} | ${candidate.institucion} | ${candidate.sede} | ${candidate.modalidad}`)).join(' || ')
            : null,
        diagnosis.official_candidates.length > 0
          ? `${diagnosis.official_candidates[0]?.municipio} | ${diagnosis.official_candidates[0]?.institucion} | ${diagnosis.official_candidates[0]?.sede} | ${diagnosis.official_candidates[0]?.modalidad}`
          : null,
      ));
    }
  }

  for (const row of nonCoverageRows) {
    if (row.problemas_bloqueantes.includes('MISMA_CEDULA_NOMBRE_DIFERENTE')) {
      manualRows.set(row.fila_origen, buildManualDecision(
        row,
        'CONFLICTO_IDENTIDAD',
        'La cédula coincide con una persona existente, pero el nombre del XLSX no coincide exactamente con la BD real.',
        'Confirmar el nombre correcto y reutilizar la persona existente; no duplicar persona.',
        row.cedula === '40430665'
          ? 'BD: LUZ MYRIAN SACRISTAN CINFUENTES || XLSX: LUZ MYRIAM SACRISTAN CIFUENTES'
          : 'BD: JUAN PABLO TRUJILLO BAENA || XLSX: JUAN PABLO BAENA TRUJILLO',
        row.cedula === '40430665'
          ? 'LUZ MYRIAN SACRISTAN CINFUENTES'
          : 'JUAN PABLO TRUJILLO BAENA',
      ));
    }

    if (row.problemas_bloqueantes.includes('FECHA_FIN_REQUERIDA_FALTANTE')) {
      manualRows.set(row.fila_origen, buildManualDecision(
        row,
        'FECHA_FIN_REQUERIDA_FALTANTE',
        'La fila quedó como TÉRMINO FIJO y no trae fecha_fin.',
        'Completar fecha_fin contractual.',
        'Tipo contrato: TÉRMINO FIJO',
        null,
      ));
    }

    if (row.problemas_bloqueantes.includes('FECHA_INICIO_FALTANTE')) {
      manualRows.set(row.fila_origen, buildManualDecision(
        row,
        'FECHA_INICIO_FALTANTE',
        'La fila no trae fecha_inicio y sin ella no puede abrirse la vinculación.',
        'Completar fecha_inicio contractual.',
        `Tipo contrato: ${row.tipo_contrato_origen ?? 'VACIO'}`,
        null,
      ));
    }

    if (row.problemas_bloqueantes.includes('VALOR_CASO_ESPECIAL_FALTANTE')) {
      manualRows.set(row.fila_origen, buildManualDecision(
        row,
        'CASO_ESPECIAL_SIN_VALOR',
        'El método de pago es CASO_ESPECIAL y falta el valor económico; además hoy no existe un modelo histórico para persistirlo antes de Nómina.',
        'Definir valor y vigencia_desde para una futura estructura histórica por vinculación.',
        'Se requiere valor, vigencia_desde y motivo del caso especial.',
        null,
      ));
    }

    if (row.problemas_bloqueantes.includes('UBICACION_NO_RECONOCIDA')) {
      const valor = row.asignacion_laboral_origen ?? row.ubicacion_operativa_origen;
      manualRows.set(row.fila_origen, buildManualDecision(
        row,
        'UBICACION_NO_RECONOCIDA',
        'La asignación laboral no coincide con ninguna ubicación activa del contrato 24 y no hay evidencia suficiente para mapearla sin decisión funcional.',
        'Definir si es alias de una ubicación existente, una nueva ubicación necesaria o en realidad otro cargo/perfil.',
        valor,
        null,
      ));
    }

    if (row.problemas_bloqueantes.includes('SIN_UBICACION') || row.problemas_bloqueantes.includes('CARGO_FALTANTE')) {
      manualRows.set(row.fila_origen, buildManualDecision(
        row,
        'CARGO_Y_UBICACION_FALTANTES',
        'La fila no permite determinar cargo real ni ubicación laboral para una persona no manipuladora.',
        'Completar cargo real y ubicación laboral.',
        `Perfil licitación: ${row.licitacion_perfil_resuelto ?? 'NO_APLICA'}`,
        null,
      ));
    }

    if (row.problemas_bloqueantes.includes('TIPO_DOCUMENTO_NO_RECONOCIDO')) {
      manualRows.set(row.fila_origen, buildManualDecision(
        row,
        'TIPO_DOCUMENTO_NO_RECONOCIDO',
        'El XLSX trae PPT y el catálogo de tipos de documento disponible en la BD no lo reconoce actualmente.',
        'Confirmar que debe aceptarse PPT y parametrizarlo en catálogo.',
        'Valor XLSX: PPT',
        'PPT',
      ));
      corrections.push({
        fila: row.fila_origen,
        cedula: row.cedula,
        campo: 'tipo_documento',
        valor_actual: row.tipo_documento_origen,
        valor_propuesto: 'PPT',
        fuente_evidencia: 'XLSX Personal + regla funcional esperada',
        confianza: 'ALTA',
        aplicable_automaticamente: 'NO',
      });
    }

    if (row.problemas_bloqueantes.includes('TIPO_VINCULACION_NO_MAPEADO')) {
      manualRows.set(row.fila_origen, buildManualDecision(
        row,
        'TIPO_VINCULACION_NO_MAPEADO',
        'La fila no trae tipo_vinculación ni tipo_contrato suficientes para crear la vinculación.',
        'Completar tipo_vinculación y, si aplica, tipo_contrato.',
        `Método pago: ${row.metodo_pago_origen ?? 'VACIO'} | Cargo: ${row.cargo_origen ?? 'VACIO'} | Asignación: ${row.asignacion_laboral_origen ?? 'VACIA'}`,
        null,
      ));
    }
  }

  const uniqueCoverageRows = new Set(coverageRows.map((row) => row.fila_origen));
  const sourceDifferenceRows = new Set<number>();
  const realProblemRows = new Set<number>();
  const inequivoqueRows = new Set<number>();
  const probableRows = new Set<number>();
  const ambiguousRows = new Set<number>();

  for (const [fila, diagnosis] of coverageDiagnostics.entries()) {
    if (diagnosis.counts_as_difference) sourceDifferenceRows.add(fila);
    if (diagnosis.counts_as_real_problem) realProblemRows.add(fila);
    if (diagnosis.confidence === 'INEQUIVOCO') inequivoqueRows.add(fila);
    if (diagnosis.confidence === 'PROBABLE') probableRows.add(fila);
    if (diagnosis.confidence === 'AMBIGUO') ambiguousRows.add(fila);
  }

  for (const row of nonCoverageRows) {
    realProblemRows.add(row.fila_origen);
    ambiguousRows.add(row.fila_origen);
  }

  const coverageDistribution = buildCoverageDistribution(report.report_rows, report.coverage_preview, inequivoqueCoverageCandidates);
  const distributionInitial = summarizeDistribution(coverageDistribution, 'estado_inicial');
  const distributionAfter = summarizeDistribution(coverageDistribution, 'estado_despues_inequivocos');
  const assignedAfterInequivocal = coverageDistribution.reduce((sum, row) => sum + row.asignables_inequivocos, 0);
  const deficitAfterInequivocal = coverageDistribution.reduce((sum, row) => sum + Math.max(0, row.requeridas - row.asignables_inequivocos), 0);
  const excessAfterInequivocal = coverageDistribution.reduce((sum, row) => sum + Math.max(0, row.asignables_inequivocos - row.requeridas), 0);

  const municipalityIssueRows = coverageRows.filter((row) => row.cobertura_estado === 'MUNICIPIO_NO_RECONOCIDO');
  const barrancaRows = municipalityIssueRows.filter((row) => normalizeText(row.municipio_origen) === normalizeText('BARRANCA DE UPIA'));
  const doradoRows = municipalityIssueRows.filter((row) => normalizeText(row.municipio_origen) === normalizeText('EL DORADO'));
  const sourceMunicipios = new Set(sourceCoverageRows.map((row) => normalizeText(row.municipio)));
  const officialMunicipios = new Set(officialCoverageRows.map((row) => normalizeText(row.municipio)));

  const uniqueManualRows = [...manualRows.values()].sort((left, right) => left.fila - right.fila);
  const dedupCorrections = [...new Map(corrections.map((row) => [`${row.fila}|${row.campo}|${normalizeText(row.valor_propuesto)}`, row])).values()]
    .sort((left, right) => left.fila - right.fila || left.campo.localeCompare(right.campo, 'es'));

  await mkdir(path.resolve('reports'), { recursive: true });
  await Promise.all([
    writeFile(path.resolve(OUTPUT_DECISIONS), buildCsv(uniqueManualRows, [
      'fila',
      'cedula',
      'nombre',
      'tipo_problema',
      'municipio_xlsx',
      'institucion_xlsx',
      'sede_xlsx',
      'modalidad_xlsx',
      'valor_oficial_encontrado',
      'opciones',
      'recomendacion',
      'motivo',
      'decision_usuario',
    ]), 'utf8'),
    writeFile(path.resolve(OUTPUT_CORRECTIONS), buildCsv(dedupCorrections, [
      'fila',
      'cedula',
      'campo',
      'valor_actual',
      'valor_propuesto',
      'fuente_evidencia',
      'confianza',
      'aplicable_automaticamente',
    ]), 'utf8'),
  ]);

  const institutionRows = coverageRows.filter((row) => row.cobertura_estado === 'INSTITUCION_NO_RECONOCIDA');
  const sedeRows = coverageRows.filter((row) => row.cobertura_estado === 'SEDE_NO_RECONOCIDA');
  const sedeModalidadRows = coverageRows.filter((row) => row.cobertura_estado === 'SEDE_MODALIDAD_NO_EXISTE');

  const sourceFullMatchCount = coverageRows.filter((row) =>
    findSourceRows(sourceCoverageRows, {
      municipio: row.municipio_origen,
      institucion: row.institucion_origen,
      sede: row.sede_origen,
      modalidad: row.modalidad_origen,
    }).length === 1
  ).length;

  console.log(JSON.stringify({
    revisar_inicial: reviewRows.length,
    problemas_reales_archivo: realProblemRows.size,
    explicadas_por_diferencias_entre_personal_y_focalizacion: sourceDifferenceRows.size,
    corregibles_inequivocamente: inequivoqueRows.size,
    candidatos_probables: probableRows.size,
    siguen_ambiguas_o_manual: ambiguousRows.size,
    cobertura: {
      filas_con_issue: uniqueCoverageRows.size,
      source_full_match_count: sourceFullMatchCount,
      sede_modalidad_no_existe: {
        total: sedeModalidadRows.length,
        sede_existe_modalidad_distinta: sedeModalidadRows.filter((row) => coverageDiagnostics.get(row.fila_origen)?.classification === 'SEDE_EXISTE_MODALIDAD_DISTINTA').length,
        sede_existe_otra_modalidad_adicional: sedeModalidadRows.filter((row) => coverageDiagnostics.get(row.fila_origen)?.classification === 'SEDE_EXISTE_OTRA_MODALIDAD_ADICIONAL').length,
        ambiguas: sedeModalidadRows.filter((row) => coverageDiagnostics.get(row.fila_origen)?.manual_required).length,
      },
      instituciones: {
        total: institutionRows.length,
        exactas_en_focalizacion_origen: institutionRows.filter((row) =>
          findSourceRows(sourceCoverageRows, {
            municipio: row.municipio_origen,
            institucion: row.institucion_origen,
          }).length > 0
        ).length,
      },
      sedes: {
        total: sedeRows.length,
      },
      barranca_de_upia: {
        total: barrancaRows.length,
        existe_en_focalizacion_xlsx: sourceMunicipios.has(normalizeText('BARRANCA DE UPIA')),
        existe_en_maestro_bd: officialMunicipios.has(normalizeText('BARRANCA DE UPIA')),
      },
      el_dorado: {
        total: doradoRows.length,
        existe_en_focalizacion_xlsx: sourceMunicipios.has(normalizeText('EL DORADO')),
        existe_en_maestro_bd: officialMunicipios.has(normalizeText('EL DORADO')),
      },
    },
    cobertura_despues_candidatos_inequivocos: {
      requeridas: report.coverage_summary.requeridas_total,
      asignadas_iniciales: report.coverage_summary.asignadas_total,
      asignadas_despues_inequivocos: assignedAfterInequivocal,
      deficit_despues_inequivocos: deficitAfterInequivocal,
      exceso_despues_inequivocos: excessAfterInequivocal,
      estado_inicial: distributionInitial,
      estado_despues_inequivocos: distributionAfter,
    },
    licitacion: report.licitacion_summary,
    no_cobertura: {
      fechas: reviewRows.filter((row) => row.problemas_bloqueantes.includes('FECHA_FIN_REQUERIDA_FALTANTE') || row.problemas_bloqueantes.includes('FECHA_INICIO_FALTANTE')).length,
      ubicaciones: reviewRows.filter((row) => row.problemas_bloqueantes.includes('UBICACION_NO_RECONOCIDA') || row.problemas_bloqueantes.includes('SIN_UBICACION')).length,
      caso_especial: reviewRows.filter((row) => row.problemas_bloqueantes.includes('VALOR_CASO_ESPECIAL_FALTANTE')).length,
      cargos: reviewRows.filter((row) => row.problemas_bloqueantes.includes('CARGO_FALTANTE')).length,
      identidades: reviewRows.filter((row) => row.problemas_bloqueantes.includes('MISMA_CEDULA_NOMBRE_DIFERENTE')).length,
      tipo_documento: reviewRows.filter((row) => row.problemas_bloqueantes.includes('TIPO_DOCUMENTO_NO_RECONOCIDO')).length,
      tipo_vinculacion: reviewRows.filter((row) => row.problemas_bloqueantes.includes('TIPO_VINCULACION_NO_MAPEADO')).length,
    },
    decisiones_humanas_finales: uniqueManualRows.length,
    archivos: {
      decisiones: OUTPUT_DECISIONS,
      correcciones: OUTPUT_CORRECTIONS,
    },
    bd_before: report.bd_before,
    bd_after: report.bd_after,
    escrituras_bd: 0,
  }, null, 2));
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : JSON.stringify(error));
  process.exitCode = 1;
});
