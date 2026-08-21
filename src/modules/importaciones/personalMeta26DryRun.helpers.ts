export interface HelperCargoRow {
  id: number;
  nombre_cargo: string;
}

export interface HelperUbicacionRow {
  id: number;
  nombre_ubicacion: string;
}

export interface HelperFocalizacionRow {
  cobertura_requerida: number | null;
  focalizacion_final_id: number;
  institucion_id: number | null;
  institucion_nombre: string | null;
  modalidad_id: number | null;
  modalidad_codigo_base?: string | null;
  modalidad_codigo_original?: string | null;
  modalidad_nombre: string | null;
  municipio_id: number | null;
  municipio_nombre: string | null;
  sede_id: number | null;
  sede_modalidad_id: number | null;
  sede_nombre: string | null;
}

export interface HelperMunicipioRow {
  codigo_dane: string | null;
  id: number;
  nombre_municipio: string;
}

export interface HelperInstitucionRow {
  codigo_dane: string | null;
  id: number;
  municipio_id: number | null;
  nombre_institucion: string;
}

export interface HelperSedeRow {
  codigo_dane: string | null;
  consecutivo_sede: string | null;
  id: number;
  institucion_id: number;
  municipio_id: number | null;
  nombre_sede: string;
}

export interface HelperModalidadRow {
  codigo_base: string | null;
  codigo_original: string | null;
  id: number;
  nombre_modalidad: string;
}

export interface HelperInstitucionAliasRow {
  institucion_id: number;
  municipio_id: number | null;
  nombre_alias: string;
}

export interface HelperSedeAliasRow {
  institucion_id: number | null;
  sede_id: number;
  nombre_alias: string;
}

export interface HelperModalidadAliasRow {
  alias: string;
  modalidad_id: number;
}

type LaborLocationStatus =
  | 'UBICACION_OK'
  | 'UBICACION_NO_RECONOCIDA'
  | 'UBICACION_AMBIGUA'
  | 'SIN_UBICACION'
  | 'NO_APLICA';

type CoverageMatchStatus =
  | 'ASIGNACION_OK'
  | 'MUNICIPIO_NO_RECONOCIDO'
  | 'INSTITUCION_NO_RECONOCIDA'
  | 'SEDE_NO_RECONOCIDA'
  | 'MODALIDAD_NO_RECONOCIDA'
  | 'SEDE_MODALIDAD_NO_EXISTE'
  | 'AMBIGUA'
  | 'SIN_ASIGNACION';

export type CoverageFailureCause =
  | 'DIFERENCIA_TILDE'
  | 'DIFERENCIA_ESPACIOS'
  | 'DIFERENCIA_MAYUSCULAS'
  | 'ABREVIATURA'
  | 'PREFIJO_IE'
  | 'PREFIJO_SEDE'
  | 'VARIANTE_NOMBRE'
  | 'ALIAS_CONOCIDO'
  | 'CODIGO_DISPONIBLE'
  | 'ERROR_REAL_DATO'
  | 'AMBIGUO'
  | 'OTRO';

export interface CoverageStageAudit {
  causa: CoverageFailureCause | null;
  candidatos_bd: string[];
  contexto: string | null;
  entidad: 'MUNICIPIO' | 'INSTITUCION' | 'SEDE' | 'MODALIDAD';
  estado: CoverageMatchStatus | 'OK';
  id_bd: number | null;
  valor_bd: string | null;
  valor_normalizado: string;
  valor_xlsx: string | null;
}

export interface CoverageAliasProposal {
  accion: 'ALIAS_SEGURO' | 'ALIAS_REVISAR';
  causa: CoverageFailureCause | null;
  confianza: 'ALTA' | 'MEDIA';
  contexto: string;
  filas_afectadas: number;
  id_bd: number;
  tipo_entidad: 'MUNICIPIO' | 'INSTITUCION' | 'SEDE' | 'MODALIDAD';
  valor_bd: string;
  valor_xlsx: string;
}

export interface CoverageMatchDetailedResult {
  alias_proposals: CoverageAliasProposal[];
  auditoria: CoverageStageAudit[];
  candidate_count: number;
  focalizacion_final_id: number | null;
  sede_modalidad_id: number | null;
  status: CoverageMatchStatus;
}

type FechaIssueCode =
  | 'FECHA_INICIO_FALTANTE'
  | 'FECHA_FIN_REQUERIDA_FALTANTE'
  | 'FECHA_INVALIDA'
  | 'FIN_ANTERIOR_INICIO'
  | 'COMBINACION_CONTRACTUAL_INVALIDA';

const normalizeComparableText = (value: string | null | undefined): string => {
  if (!value) {
    return '';
  }

  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
};

const normalizeCoverageText = (value: string | null | undefined): string => {
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

const normalizeCompactToken = (value: string | null | undefined): string => normalizeCoverageText(value).replace(/\s+/g, '');

const stripInstitutionPrefix = (value: string | null | undefined): string => normalizeCoverageText(value)
  .replace(/^(INSTITUCION\s*EDUCATIVA|CENTRO\s*EDUCATIVO|INST\s*EDUC|I\s*E)\s*/g, '')
  .trim();

const stripSedePrefix = (value: string | null | undefined): string => normalizeCoverageText(value)
  .replace(/^(SEDE\s*PRINCIPAL|SEDE|PRINCIPAL)\s*/g, '')
  .trim();

const uniqueStrings = (items: Array<string | null | undefined>): string[] => [...new Set(items.filter((item): item is string => Boolean(item && item.trim())))];

const buildAuditContext = (parts: Array<string | null | undefined>): string | null => {
  const values = parts.filter((value): value is string => Boolean(value && value.trim()));
  return values.length > 0 ? values.join(' | ') : null;
};

const detectDifferenceCause = (
  source: string | null | undefined,
  target: string | null | undefined,
  explicit: CoverageFailureCause | null,
): CoverageFailureCause | null => {
  if (explicit) {
    return explicit;
  }

  const rawSource = source?.trim() ?? '';
  const rawTarget = target?.trim() ?? '';
  if (!rawSource || !rawTarget || rawSource === rawTarget) {
    return null;
  }

  const upperSource = rawSource.toUpperCase();
  const upperTarget = rawTarget.toUpperCase();
  if (upperSource === upperTarget) {
    return 'DIFERENCIA_MAYUSCULAS';
  }

  const accentlessSource = rawSource.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const accentlessTarget = rawTarget.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (accentlessSource === accentlessTarget) {
    return 'DIFERENCIA_TILDE';
  }

  if (normalizeCoverageText(rawSource) === normalizeCoverageText(rawTarget)) {
    return 'DIFERENCIA_ESPACIOS';
  }

  if (stripInstitutionPrefix(rawSource) && stripInstitutionPrefix(rawSource) === stripInstitutionPrefix(rawTarget)) {
    return rawSource.match(/^(IE|I\.?\s*E\.?|INST\.?\s*EDUC|INSTITUCION|CENTRO)/i) ? 'PREFIJO_IE' : 'ABREVIATURA';
  }

  if (stripSedePrefix(rawSource) && stripSedePrefix(rawSource) === stripSedePrefix(rawTarget)) {
    return 'PREFIJO_SEDE';
  }

  if (normalizeCompactToken(stripInstitutionPrefix(rawSource)) === normalizeCompactToken(stripInstitutionPrefix(rawTarget)) ||
    normalizeCompactToken(stripSedePrefix(rawSource)) === normalizeCompactToken(stripSedePrefix(rawTarget))) {
    return 'VARIANTE_NOMBRE';
  }

  return 'OTRO';
};

const looksLikeManipuladoraSourceCargo = (nombreCargo: string | null | undefined): boolean => {
  const normalized = normalizeComparableText(nombreCargo);
  return normalized.includes('MANIPULADOR') || normalized.includes('MANIPULADORA');
};

export const normalizeIdentityDocument = (value: string | null | undefined): string => {
  if (!value) {
    return '';
  }

  const trimmed = String(value).trim();
  const fixedDecimal = /^\d+\.0+$/.test(trimmed) ? trimmed.replace(/\.0+$/, '') : trimmed;
  return fixedDecimal.replace(/[^0-9A-Za-z]+/g, '').toUpperCase();
};

export const classifyReasonSocial = (value: string | null | undefined): 'META26' | 'OTRA_RAZON_SOCIAL' | 'SIN_RAZON_SOCIAL' | 'RAZON_SOCIAL_AMBIGUA' => {
  const normalized = normalizeComparableText(value);
  if (!normalized) {
    return 'SIN_RAZON_SOCIAL';
  }

  if (normalized === 'CONSORCIO PAE META-26' || normalized === 'CONSORCIO PAE META 26') {
    return 'META26';
  }

  const compact = normalized.replace(/[^A-Z0-9]+/g, '');
  if (compact.includes('CONSORCIO') && compact.includes('PAE') && compact.includes('META') && compact.includes('26')) {
    return 'RAZON_SOCIAL_AMBIGUA';
  }

  return 'OTRA_RAZON_SOCIAL';
};

export const validateContractDates = (input: {
  endDate: string | null;
  startDate: string | null;
  tipoContrato: string | null;
  tipoVinculacion: string | null;
}): { normalized: 'TF' | 'TI' | 'OL' | 'OPS' | null; issues: FechaIssueCode[] } => {
  const normalizedType = normalizeComparableText(input.tipoContrato);
  const normalizedVinc = normalizeComparableText(input.tipoVinculacion);
  const issues: FechaIssueCode[] = [];

  let normalized: 'TF' | 'TI' | 'OL' | 'OPS' | null = null;
  if (normalizedType === 'TERMINO FIJO') {
    normalized = 'TF';
  } else if (normalizedType === 'TERMINO INDEFINIDO') {
    normalized = 'TI';
  } else if (normalizedType === 'OBRA O LABOR') {
    normalized = 'OL';
  } else if (!normalizedType && normalizedVinc === 'PRESTACION DE SERVICIOS') {
    normalized = 'OPS';
  } else if (normalizedVinc === 'PRESTACION DE SERVICIOS') {
    normalized = 'OPS';
  } else if (normalizedType) {
    issues.push('COMBINACION_CONTRACTUAL_INVALIDA');
  }

  if (!input.startDate) {
    issues.push('FECHA_INICIO_FALTANTE');
  }

  if (normalized === 'TF' && !input.endDate) {
    issues.push('FECHA_FIN_REQUERIDA_FALTANTE');
  }

  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    issues.push('FIN_ANTERIOR_INICIO');
  }

  return { normalized, issues };
};

export const resolveCargoMapping = (sourceCargo: string | null, cargoRows: HelperCargoRow[]): { proposed: string | null; resolved: HelperCargoRow | null } => {
  const normalized = normalizeComparableText(sourceCargo);
  if (!normalized) {
    return { proposed: null, resolved: null };
  }

  const exact = cargoRows.find((item) => normalizeComparableText(item.nombre_cargo) === normalized);
  if (exact) {
    return { proposed: exact.nombre_cargo, resolved: exact };
  }

  if (normalized === 'MANIPULADORA DE ALIMENTOS') {
    const fallback = cargoRows.find((item) => normalizeComparableText(item.nombre_cargo).includes('MANIPULADOR'));
    return { proposed: fallback?.nombre_cargo ?? null, resolved: fallback ?? null };
  }

  return { proposed: null, resolved: null };
};

const buildUbicacionAliasMap = (ubicacionRows: HelperUbicacionRow[]): Map<string, HelperUbicacionRow[]> => {
  const index = new Map<string, HelperUbicacionRow[]>();
  const register = (alias: string, row: HelperUbicacionRow): void => {
    const key = normalizeComparableText(alias);
    const current = index.get(key) ?? [];
    current.push(row);
    index.set(key, current);
  };

  for (const row of ubicacionRows) {
    register(row.nombre_ubicacion, row);
  }

  const aliases: Array<[string, string]> = [
    ['BODEGA RP GRANADA', 'BODEGA GRANADA'],
    ['AUXILIAR DE FACTURACION', 'FACTURACION'],
    ['AUXILIAR DE CALIDAD', 'CALIDAD'],
    ['GESTION DE ZONA', 'GESTION DE ZONA'],
    ['AUXILIAR GESTION DE ZONA', 'AUXILIAR GESTION DE ZONA'],
    ['TALENTO HUMANO', 'TALENTO HUMANO'],
    ['SUMINISTRO', 'SUMINISTRO'],
    ['AUXILIAR DE RUTA RI', 'AUXILIAR DE RUTA RI'],
    ['AUXILIAR DE RUTA RP', 'AUXILIAR DE RUTA RP'],
    ['BODEGA RI', 'BODEGA RI'],
    ['BODEGA RP', 'BODEGA RP']
  ];

  for (const [alias, target] of aliases) {
    const match = ubicacionRows.find((item) => normalizeComparableText(item.nombre_ubicacion) === normalizeComparableText(target));
    if (match) {
      register(alias, match);
    }
  }

  return index;
};

export const resolveLaborLocation = (
  row: {
    asignacion_laboral: string | null;
    cargo_laboral: string | null;
    institucion_educativa: string | null;
    modalidad: string | null;
    municipio: string | null;
    sede: string | null;
    ubicacion_operativa: string | null;
  },
  ubicacionRows: HelperUbicacionRow[]
): { proposed: string | null; resolved: HelperUbicacionRow | null; status: LaborLocationStatus } => {
  if (looksLikeManipuladoraSourceCargo(row.cargo_laboral)) {
    return { proposed: null, resolved: null, status: 'NO_APLICA' };
  }

  if (row.municipio || row.institucion_educativa || row.sede || row.modalidad) {
    return { proposed: null, resolved: null, status: 'UBICACION_AMBIGUA' };
  }

  const aliasMap = buildUbicacionAliasMap(ubicacionRows);
  const texts = [
    row.ubicacion_operativa,
    row.asignacion_laboral === 'BODEGA' ? row.ubicacion_operativa : row.asignacion_laboral
  ].filter((value): value is string => Boolean(value && value.trim()));

  if (texts.length === 0) {
    return { proposed: null, resolved: null, status: 'SIN_UBICACION' };
  }

  const matches = texts.flatMap((text) => aliasMap.get(normalizeComparableText(text)) ?? []);
  const unique = [...new Map(matches.map((item) => [item.id, item])).values()];

  if (unique.length === 1) {
    return { proposed: unique[0]?.nombre_ubicacion ?? null, resolved: unique[0] ?? null, status: 'UBICACION_OK' };
  }

  return { proposed: null, resolved: null, status: unique.length > 1 ? 'UBICACION_AMBIGUA' : 'UBICACION_NO_RECONOCIDA' };
};

interface CoverageAliasEntry {
  causa: CoverageFailureCause | null;
  entidad: 'MUNICIPIO' | 'INSTITUCION' | 'SEDE' | 'MODALIDAD';
  id: number;
  oficial: string;
  origen: 'ALIAS' | 'CODIGO' | 'GENERATED' | 'HISTORIAL' | 'OFICIAL';
}

interface CoverageMatchingCatalog {
  instituciones_by_municipio: Map<number, HelperInstitucionRow[]>;
  instituciones_index: Map<string, CoverageAliasEntry[]>;
  modalidades_all: HelperModalidadRow[];
  modalidades_index: Map<string, CoverageAliasEntry[]>;
  municipios_all: HelperMunicipioRow[];
  municipios_index: Map<string, CoverageAliasEntry[]>;
  relaciones_by_sede_modalidad: Map<string, HelperFocalizacionRow[]>;
  sedes_by_institucion: Map<number, HelperSedeRow[]>;
  sedes_index: Map<string, CoverageAliasEntry[]>;
}

const pushIndexEntry = (map: Map<string, CoverageAliasEntry[]>, key: string, entry: CoverageAliasEntry): void => {
  if (!key) {
    return;
  }
  const items = map.get(key) ?? [];
  if (!items.some((item) => item.id === entry.id && item.oficial === entry.oficial && item.origen === entry.origen && item.causa === entry.causa)) {
    items.push(entry);
    map.set(key, items);
  }
};

const uniqueAliasEntries = (items: CoverageAliasEntry[]): CoverageAliasEntry[] => [...new Map(items.map((item) => [`${item.entidad}|${item.id}`, item])).values()];

const registerInstitutionEntry = (
  index: Map<string, CoverageAliasEntry[]>,
  municipioId: number | null,
  token: string,
  row: HelperInstitucionRow,
  origen: CoverageAliasEntry['origen'],
  causa: CoverageFailureCause | null,
): void => {
  if (!municipioId || !token) {
    return;
  }
  pushIndexEntry(index, `${municipioId}|${token}`, {
    entidad: 'INSTITUCION',
    id: row.id,
    oficial: row.nombre_institucion,
    origen,
    causa,
  });
};

const registerSedeEntry = (
  index: Map<string, CoverageAliasEntry[]>,
  institucionId: number,
  token: string,
  row: HelperSedeRow,
  origen: CoverageAliasEntry['origen'],
  causa: CoverageFailureCause | null,
): void => {
  if (!token) {
    return;
  }
  pushIndexEntry(index, `${institucionId}|${token}`, {
    entidad: 'SEDE',
    id: row.id,
    oficial: row.nombre_sede,
    origen,
    causa,
  });
};

const buildCoverageMatchingCatalog = (input: {
  focalizacionRows: HelperFocalizacionRow[];
  institucionAliasRows: HelperInstitucionAliasRow[];
  institucionRows: HelperInstitucionRow[];
  modalidadAliasRows: HelperModalidadAliasRow[];
  modalidadRows: HelperModalidadRow[];
  municipioRows: HelperMunicipioRow[];
  sedeAliasRows: HelperSedeAliasRow[];
  sedeRows: HelperSedeRow[];
}): CoverageMatchingCatalog => {
  const municipioIdsContrato = new Set<number>(input.focalizacionRows
    .map((item) => item.municipio_id)
    .filter((value): value is number => value !== null));
  const municipiosContrato = input.municipioRows.filter((row) => municipioIdsContrato.has(row.id));
  const municipios_index = new Map<string, CoverageAliasEntry[]>();
  const instituciones_index = new Map<string, CoverageAliasEntry[]>();
  const sedes_index = new Map<string, CoverageAliasEntry[]>();
  const modalidades_index = new Map<string, CoverageAliasEntry[]>();
  const instituciones_by_municipio = new Map<number, HelperInstitucionRow[]>();
  const sedes_by_institucion = new Map<number, HelperSedeRow[]>();
  const relaciones_by_sede_modalidad = new Map<string, HelperFocalizacionRow[]>();

  const rowsById = <T extends { id: number }, K extends number>(rows: T[]): Map<K, T> => new Map(rows.map((row) => [row.id as K, row]));
  const institucionById = rowsById(input.institucionRows);
  const sedeById = rowsById(input.sedeRows);
  const modalidadById = rowsById(input.modalidadRows);

  for (const row of municipiosContrato) {
    pushIndexEntry(municipios_index, normalizeCoverageText(row.nombre_municipio), {
      entidad: 'MUNICIPIO',
      id: row.id,
      oficial: row.nombre_municipio,
      origen: 'OFICIAL',
      causa: null,
    });
    if (row.codigo_dane) {
      pushIndexEntry(municipios_index, normalizeCoverageText(row.codigo_dane), {
        entidad: 'MUNICIPIO',
        id: row.id,
        oficial: row.nombre_municipio,
        origen: 'CODIGO',
        causa: 'CODIGO_DISPONIBLE',
      });
    }
  }

  for (const row of input.institucionRows) {
    const current = instituciones_by_municipio.get(row.municipio_id ?? -1) ?? [];
    current.push(row);
    instituciones_by_municipio.set(row.municipio_id ?? -1, current);
    registerInstitutionEntry(instituciones_index, row.municipio_id, normalizeCoverageText(row.nombre_institucion), row, 'OFICIAL', null);
    if (row.codigo_dane) {
      registerInstitutionEntry(instituciones_index, row.municipio_id, normalizeCoverageText(row.codigo_dane), row, 'CODIGO', 'CODIGO_DISPONIBLE');
    }
    const prefixless = stripInstitutionPrefix(row.nombre_institucion);
    if (prefixless && prefixless !== normalizeCoverageText(row.nombre_institucion)) {
      registerInstitutionEntry(instituciones_index, row.municipio_id, prefixless, row, 'GENERATED', 'PREFIJO_IE');
    }
  }

  for (const row of input.institucionAliasRows) {
    const institucion = institucionById.get(row.institucion_id);
    if (!institucion) {
      continue;
    }
    registerInstitutionEntry(instituciones_index, institucion.municipio_id, normalizeCoverageText(row.nombre_alias), institucion, 'HISTORIAL', 'ALIAS_CONOCIDO');
    const prefixless = stripInstitutionPrefix(row.nombre_alias);
    if (prefixless && prefixless !== normalizeCoverageText(row.nombre_alias)) {
      registerInstitutionEntry(instituciones_index, institucion.municipio_id, prefixless, institucion, 'HISTORIAL', 'PREFIJO_IE');
    }
  }

  for (const row of input.sedeRows) {
    const current = sedes_by_institucion.get(row.institucion_id) ?? [];
    current.push(row);
    sedes_by_institucion.set(row.institucion_id, current);
    registerSedeEntry(sedes_index, row.institucion_id, normalizeCoverageText(row.nombre_sede), row, 'OFICIAL', null);
    if (row.codigo_dane) {
      registerSedeEntry(sedes_index, row.institucion_id, normalizeCoverageText(row.codigo_dane), row, 'CODIGO', 'CODIGO_DISPONIBLE');
    }
    if (row.consecutivo_sede) {
      registerSedeEntry(sedes_index, row.institucion_id, normalizeCoverageText(row.consecutivo_sede), row, 'CODIGO', 'CODIGO_DISPONIBLE');
    }
    const prefixless = stripSedePrefix(row.nombre_sede);
    if (prefixless && prefixless !== normalizeCoverageText(row.nombre_sede)) {
      registerSedeEntry(sedes_index, row.institucion_id, prefixless, row, 'GENERATED', 'PREFIJO_SEDE');
    }
  }

  for (const row of input.sedeAliasRows) {
    const sede = sedeById.get(row.sede_id);
    if (!sede) {
      continue;
    }
    registerSedeEntry(sedes_index, sede.institucion_id, normalizeCoverageText(row.nombre_alias), sede, 'HISTORIAL', 'ALIAS_CONOCIDO');
    const prefixless = stripSedePrefix(row.nombre_alias);
    if (prefixless && prefixless !== normalizeCoverageText(row.nombre_alias)) {
      registerSedeEntry(sedes_index, sede.institucion_id, prefixless, sede, 'HISTORIAL', 'PREFIJO_SEDE');
    }
  }

  for (const row of input.modalidadRows) {
    pushIndexEntry(modalidades_index, normalizeCoverageText(row.nombre_modalidad), {
      entidad: 'MODALIDAD',
      id: row.id,
      oficial: row.nombre_modalidad,
      origen: 'OFICIAL',
      causa: null,
    });
    if (row.codigo_original) {
      pushIndexEntry(modalidades_index, normalizeCoverageText(row.codigo_original), {
        entidad: 'MODALIDAD',
        id: row.id,
        oficial: row.nombre_modalidad,
        origen: 'CODIGO',
        causa: 'CODIGO_DISPONIBLE',
      });
    }
    if (row.codigo_base) {
      pushIndexEntry(modalidades_index, normalizeCoverageText(row.codigo_base), {
        entidad: 'MODALIDAD',
        id: row.id,
        oficial: row.nombre_modalidad,
        origen: 'CODIGO',
        causa: 'CODIGO_DISPONIBLE',
      });
    }
  }

  for (const row of input.modalidadAliasRows) {
    const modalidad = modalidadById.get(row.modalidad_id);
    if (!modalidad) {
      continue;
    }
    pushIndexEntry(modalidades_index, normalizeCoverageText(row.alias), {
      entidad: 'MODALIDAD',
      id: modalidad.id,
      oficial: modalidad.nombre_modalidad,
      origen: 'ALIAS',
      causa: 'ALIAS_CONOCIDO',
    });
  }

  for (const row of input.focalizacionRows) {
    if (!row.sede_id || !row.modalidad_id) {
      continue;
    }
    const key = `${row.sede_id}|${row.modalidad_id}`;
    const current = relaciones_by_sede_modalidad.get(key) ?? [];
    current.push(row);
    relaciones_by_sede_modalidad.set(key, current);
  }

  return {
    municipios_index,
    municipios_all: municipiosContrato,
    instituciones_index,
    instituciones_by_municipio,
    modalidades_index,
    modalidades_all: input.modalidadRows,
    sedes_index,
    sedes_by_institucion,
    relaciones_by_sede_modalidad,
  };
};

const findMatches = (
  tokens: string[],
  resolver: (token: string) => CoverageAliasEntry[],
): { matches: CoverageAliasEntry[]; token: string | null } => {
  for (const token of uniqueStrings(tokens)) {
    const matches = uniqueAliasEntries(resolver(token));
    if (matches.length > 0) {
      return { matches, token };
    }
  }
  return { matches: [], token: null };
};

const buildStageAudit = (input: {
  causa: CoverageFailureCause | null;
  candidatos_bd: string[];
  contexto: string | null;
  entidad: CoverageStageAudit['entidad'];
  estado: CoverageStageAudit['estado'];
  id_bd: number | null;
  valor_bd: string | null;
  valor_xlsx: string | null;
}): CoverageStageAudit => ({
  entidad: input.entidad,
  estado: input.estado,
  valor_xlsx: input.valor_xlsx,
  valor_normalizado: normalizeCoverageText(input.valor_xlsx),
  valor_bd: input.valor_bd,
  id_bd: input.id_bd,
  candidatos_bd: input.candidatos_bd,
  causa: input.causa,
  contexto: input.contexto,
});

export const matchCoverageAssignment = (
  row: {
    institucion_educativa: string | null;
    modalidad: string | null;
    municipio: string | null;
    sede: string | null;
  },
  focalizacionRows: HelperFocalizacionRow[],
  institucionAliasRows: HelperInstitucionAliasRow[],
  sedeAliasRows: HelperSedeAliasRow[],
  modalidadAliasRows: HelperModalidadAliasRow[],
  municipioRows: HelperMunicipioRow[] = [],
  institucionRows: HelperInstitucionRow[] = [],
  sedeRows: HelperSedeRow[] = [],
  modalidadRows: HelperModalidadRow[] = []
): { candidate_count: number; focalizacion_final_id: number | null; sede_modalidad_id: number | null; status: CoverageMatchStatus } => {
  const fallbackMunicipios = municipioRows.length > 0
    ? municipioRows
    : [...new Map(focalizacionRows
      .filter((item) => item.municipio_id && item.municipio_nombre)
      .map((item) => [item.municipio_id as number, {
        id: item.municipio_id as number,
        codigo_dane: null,
        nombre_municipio: item.municipio_nombre as string
      } satisfies HelperMunicipioRow])).values()];
  const fallbackInstituciones = institucionRows.length > 0
    ? institucionRows
    : [...new Map(focalizacionRows
      .filter((item) => item.institucion_id && item.institucion_nombre)
      .map((item) => [item.institucion_id as number, {
        id: item.institucion_id as number,
        municipio_id: item.municipio_id,
        codigo_dane: null,
        nombre_institucion: item.institucion_nombre as string
      } satisfies HelperInstitucionRow])).values()];
  const fallbackSedes = sedeRows.length > 0
    ? sedeRows
    : [...new Map(focalizacionRows
      .filter((item) => item.sede_id && item.sede_nombre && item.institucion_id)
      .map((item) => [item.sede_id as number, {
        id: item.sede_id as number,
        institucion_id: item.institucion_id as number,
        municipio_id: item.municipio_id,
        codigo_dane: null,
        consecutivo_sede: null,
        nombre_sede: item.sede_nombre as string
      } satisfies HelperSedeRow])).values()];
  const fallbackModalidades = modalidadRows.length > 0
    ? modalidadRows
    : [...new Map(focalizacionRows
      .filter((item) => item.modalidad_id && item.modalidad_nombre)
      .map((item) => [item.modalidad_id as number, {
        id: item.modalidad_id as number,
        codigo_original: item.modalidad_codigo_original ?? item.modalidad_nombre,
        codigo_base: item.modalidad_codigo_base ?? null,
        nombre_modalidad: item.modalidad_nombre as string
      } satisfies HelperModalidadRow])).values()];
  return matchCoverageAssignmentDetailed(
    row,
    focalizacionRows,
    institucionAliasRows,
    sedeAliasRows,
    modalidadAliasRows,
    fallbackMunicipios,
    fallbackInstituciones,
    fallbackSedes,
    fallbackModalidades,
  );
};

export const matchCoverageAssignmentDetailed = (
  row: {
    institucion_educativa: string | null;
    modalidad: string | null;
    municipio: string | null;
    sede: string | null;
  },
  focalizacionRows: HelperFocalizacionRow[],
  institucionAliasRows: HelperInstitucionAliasRow[],
  sedeAliasRows: HelperSedeAliasRow[],
  modalidadAliasRows: HelperModalidadAliasRow[],
  municipioRows: HelperMunicipioRow[],
  institucionRows: HelperInstitucionRow[],
  sedeRows: HelperSedeRow[],
  modalidadRows: HelperModalidadRow[],
): CoverageMatchDetailedResult => {
  if (!row.municipio || !row.institucion_educativa || !row.sede || !row.modalidad) {
    return { status: 'SIN_ASIGNACION', focalizacion_final_id: null, sede_modalidad_id: null, candidate_count: 0, auditoria: [], alias_proposals: [] };
  }

  const catalog = buildCoverageMatchingCatalog({
    focalizacionRows,
    institucionAliasRows,
    institucionRows,
    modalidadAliasRows,
    modalidadRows,
    municipioRows,
    sedeAliasRows,
    sedeRows,
  });
  const auditoria: CoverageStageAudit[] = [];
  const alias_proposals: CoverageAliasProposal[] = [];
  const modalidadesContrato = [...new Map(focalizacionRows
    .filter((item) => item.modalidad_id !== null)
    .map((item) => [item.modalidad_id as number, {
      id: item.modalidad_id as number,
      codigo_original: item.modalidad_codigo_original ?? null,
      codigo_base: item.modalidad_codigo_base ?? null,
      nombre_modalidad: item.modalidad_nombre ?? ''
    } satisfies HelperModalidadRow])).values()];

  const municipioTokens = [normalizeCoverageText(row.municipio)];
  const municipioResult = findMatches(municipioTokens, (token) => catalog.municipios_index.get(token) ?? []);
  if (municipioResult.matches.length === 0) {
    auditoria.push(buildStageAudit({
      entidad: 'MUNICIPIO',
      estado: 'MUNICIPIO_NO_RECONOCIDO',
      valor_xlsx: row.municipio,
      valor_bd: null,
      id_bd: null,
      candidatos_bd: catalog.municipios_all.map((item) => item.nombre_municipio).sort((left, right) => left.localeCompare(right, 'es')).slice(0, 25),
      causa: 'ERROR_REAL_DATO',
      contexto: null,
    }));
    return { status: 'MUNICIPIO_NO_RECONOCIDO', focalizacion_final_id: null, sede_modalidad_id: null, candidate_count: 0, auditoria, alias_proposals };
  }
  if (municipioResult.matches.length > 1) {
    auditoria.push(buildStageAudit({
      entidad: 'MUNICIPIO',
      estado: 'AMBIGUA',
      valor_xlsx: row.municipio,
      valor_bd: null,
      id_bd: null,
      candidatos_bd: municipioResult.matches.map((item) => item.oficial).sort((left, right) => left.localeCompare(right, 'es')),
      causa: 'AMBIGUO',
      contexto: null,
    }));
    return { status: 'AMBIGUA', focalizacion_final_id: null, sede_modalidad_id: null, candidate_count: municipioResult.matches.length, auditoria, alias_proposals };
  }

  const municipio = municipioResult.matches[0]!;
  const municipioCause = detectDifferenceCause(row.municipio, municipio.oficial, municipio.causa);
  if (municipioCause) {
    alias_proposals.push({
      tipo_entidad: 'MUNICIPIO',
      contexto: 'GLOBAL',
      valor_xlsx: row.municipio,
      valor_bd: municipio.oficial,
      id_bd: municipio.id,
      filas_afectadas: 1,
      confianza: 'ALTA',
      accion: 'ALIAS_SEGURO',
      causa: municipioCause,
    });
  }

  const institucionesContexto = catalog.instituciones_by_municipio.get(municipio.id) ?? [];
  const institucionTokens = [normalizeCoverageText(row.institucion_educativa), stripInstitutionPrefix(row.institucion_educativa)];
  const institucionResult = findMatches(institucionTokens, (token) => catalog.instituciones_index.get(`${municipio.id}|${token}`) ?? []);
  if (institucionResult.matches.length === 0) {
    auditoria.push(buildStageAudit({
      entidad: 'INSTITUCION',
      estado: 'INSTITUCION_NO_RECONOCIDA',
      valor_xlsx: row.institucion_educativa,
      valor_bd: null,
      id_bd: null,
      candidatos_bd: institucionesContexto.map((item) => item.nombre_institucion).sort((left, right) => left.localeCompare(right, 'es')),
      causa: 'ERROR_REAL_DATO',
      contexto: municipio.oficial,
    }));
    return { status: 'INSTITUCION_NO_RECONOCIDA', focalizacion_final_id: null, sede_modalidad_id: null, candidate_count: 0, auditoria, alias_proposals };
  }
  if (institucionResult.matches.length > 1) {
    auditoria.push(buildStageAudit({
      entidad: 'INSTITUCION',
      estado: 'AMBIGUA',
      valor_xlsx: row.institucion_educativa,
      valor_bd: null,
      id_bd: null,
      candidatos_bd: institucionResult.matches.map((item) => item.oficial).sort((left, right) => left.localeCompare(right, 'es')),
      causa: 'AMBIGUO',
      contexto: municipio.oficial,
    }));
    return { status: 'AMBIGUA', focalizacion_final_id: null, sede_modalidad_id: null, candidate_count: institucionResult.matches.length, auditoria, alias_proposals };
  }

  const institucion = institucionResult.matches[0]!;
  const institucionCause = detectDifferenceCause(row.institucion_educativa, institucion.oficial, institucion.causa);
  if (institucionCause) {
    alias_proposals.push({
      tipo_entidad: 'INSTITUCION',
      contexto: municipio.oficial,
      valor_xlsx: row.institucion_educativa,
      valor_bd: institucion.oficial,
      id_bd: institucion.id,
      filas_afectadas: 1,
      confianza: 'ALTA',
      accion: 'ALIAS_SEGURO',
      causa: institucionCause,
    });
  }

  const sedesContexto = catalog.sedes_by_institucion.get(institucion.id) ?? [];
  const sedeTokens = [normalizeCoverageText(row.sede), stripSedePrefix(row.sede)];
  const sedeResult = findMatches(sedeTokens, (token) => catalog.sedes_index.get(`${institucion.id}|${token}`) ?? []);
  if (sedeResult.matches.length === 0) {
    auditoria.push(buildStageAudit({
      entidad: 'SEDE',
      estado: 'SEDE_NO_RECONOCIDA',
      valor_xlsx: row.sede,
      valor_bd: null,
      id_bd: null,
      candidatos_bd: sedesContexto.map((item) => item.nombre_sede).sort((left, right) => left.localeCompare(right, 'es')),
      causa: 'ERROR_REAL_DATO',
      contexto: buildAuditContext([municipio.oficial, institucion.oficial]),
    }));
    return { status: 'SEDE_NO_RECONOCIDA', focalizacion_final_id: null, sede_modalidad_id: null, candidate_count: 0, auditoria, alias_proposals };
  }
  if (sedeResult.matches.length > 1) {
    auditoria.push(buildStageAudit({
      entidad: 'SEDE',
      estado: 'AMBIGUA',
      valor_xlsx: row.sede,
      valor_bd: null,
      id_bd: null,
      candidatos_bd: sedeResult.matches.map((item) => item.oficial).sort((left, right) => left.localeCompare(right, 'es')),
      causa: 'AMBIGUO',
      contexto: buildAuditContext([municipio.oficial, institucion.oficial]),
    }));
    return { status: 'AMBIGUA', focalizacion_final_id: null, sede_modalidad_id: null, candidate_count: sedeResult.matches.length, auditoria, alias_proposals };
  }

  const sede = sedeResult.matches[0]!;
  const sedeCause = detectDifferenceCause(row.sede, sede.oficial, sede.causa);
  if (sedeCause) {
    alias_proposals.push({
      tipo_entidad: 'SEDE',
      contexto: buildAuditContext([municipio.oficial, institucion.oficial]) ?? 'SIN_CONTEXTO',
      valor_xlsx: row.sede,
      valor_bd: sede.oficial,
      id_bd: sede.id,
      filas_afectadas: 1,
      confianza: 'ALTA',
      accion: 'ALIAS_SEGURO',
      causa: sedeCause,
    });
  }

  const modalidadTokens = [normalizeCoverageText(row.modalidad)];
  const modalidadResult = (() => {
    const exactContract = modalidadesContrato.filter((item) => normalizeCoverageText(item.nombre_modalidad) === modalidadTokens[0]);
    if (exactContract.length > 0) {
      return {
        matches: exactContract.map((item) => ({
          entidad: 'MODALIDAD' as const,
          id: item.id,
          oficial: item.nombre_modalidad,
          origen: 'OFICIAL' as const,
          causa: null
        })),
        token: modalidadTokens[0] ?? null
      };
    }

    const exactOriginalCode = modalidadesContrato.filter((item) => normalizeCoverageText(item.codigo_original) === modalidadTokens[0]);
    if (exactOriginalCode.length > 0) {
      return {
        matches: exactOriginalCode.map((item) => ({
          entidad: 'MODALIDAD' as const,
          id: item.id,
          oficial: item.nombre_modalidad,
          origen: 'CODIGO' as const,
          causa: 'CODIGO_DISPONIBLE' as CoverageFailureCause
        })),
        token: modalidadTokens[0] ?? null
      };
    }

    return findMatches(modalidadTokens, (token) => catalog.modalidades_index.get(token) ?? []);
  })();
  if (modalidadResult.matches.length === 0) {
    auditoria.push(buildStageAudit({
      entidad: 'MODALIDAD',
      estado: 'MODALIDAD_NO_RECONOCIDA',
      valor_xlsx: row.modalidad,
      valor_bd: null,
      id_bd: null,
      candidatos_bd: catalog.modalidades_all.flatMap((item) => uniqueStrings([item.codigo_original, item.codigo_base, item.nombre_modalidad])).sort((left, right) => left.localeCompare(right, 'es')),
      causa: 'ERROR_REAL_DATO',
      contexto: buildAuditContext([municipio.oficial, institucion.oficial, sede.oficial]),
    }));
    return { status: 'MODALIDAD_NO_RECONOCIDA', focalizacion_final_id: null, sede_modalidad_id: null, candidate_count: 0, auditoria, alias_proposals };
  }
  if (modalidadResult.matches.length > 1) {
    auditoria.push(buildStageAudit({
      entidad: 'MODALIDAD',
      estado: 'AMBIGUA',
      valor_xlsx: row.modalidad,
      valor_bd: null,
      id_bd: null,
      candidatos_bd: modalidadResult.matches.map((item) => item.oficial).sort((left, right) => left.localeCompare(right, 'es')),
      causa: 'AMBIGUO',
      contexto: buildAuditContext([municipio.oficial, institucion.oficial, sede.oficial]),
    }));
    return { status: 'AMBIGUA', focalizacion_final_id: null, sede_modalidad_id: null, candidate_count: modalidadResult.matches.length, auditoria, alias_proposals };
  }

  const modalidad = modalidadResult.matches[0]!;
  const modalidadCause = detectDifferenceCause(row.modalidad, modalidad.oficial, modalidad.causa);
  if (modalidadCause) {
    alias_proposals.push({
      tipo_entidad: 'MODALIDAD',
      contexto: 'GLOBAL',
      valor_xlsx: row.modalidad,
      valor_bd: modalidad.oficial,
      id_bd: modalidad.id,
      filas_afectadas: 1,
      confianza: 'ALTA',
      accion: 'ALIAS_SEGURO',
      causa: modalidadCause,
    });
  }

  const relation = catalog.relaciones_by_sede_modalidad.get(`${sede.id}|${modalidad.id}`) ?? [];
  if (relation.length === 0) {
    auditoria.push(buildStageAudit({
      entidad: 'MODALIDAD',
      estado: 'SEDE_MODALIDAD_NO_EXISTE',
      valor_xlsx: row.modalidad,
      valor_bd: modalidad.oficial,
      id_bd: modalidad.id,
      candidatos_bd: [],
      causa: 'ERROR_REAL_DATO',
      contexto: buildAuditContext([municipio.oficial, institucion.oficial, sede.oficial]),
    }));
    return { status: 'SEDE_MODALIDAD_NO_EXISTE', focalizacion_final_id: null, sede_modalidad_id: null, candidate_count: 0, auditoria, alias_proposals };
  }
  if (relation.length > 1) {
    auditoria.push(buildStageAudit({
      entidad: 'MODALIDAD',
      estado: 'AMBIGUA',
      valor_xlsx: row.modalidad,
      valor_bd: modalidad.oficial,
      id_bd: modalidad.id,
      candidatos_bd: relation.map((item) => `${item.sede_nombre} | ${item.modalidad_nombre}`),
      causa: 'AMBIGUO',
      contexto: buildAuditContext([municipio.oficial, institucion.oficial, sede.oficial]),
    }));
    return { status: 'AMBIGUA', focalizacion_final_id: null, sede_modalidad_id: null, candidate_count: relation.length, auditoria, alias_proposals };
  }

  return {
    status: 'ASIGNACION_OK',
    focalizacion_final_id: relation[0]?.focalizacion_final_id ?? null,
    sede_modalidad_id: relation[0]?.sede_modalidad_id ?? null,
    candidate_count: 1,
    auditoria,
    alias_proposals,
  };
};

export const normalizePresentedLicitacion = (value: string | null | undefined): boolean | null => {
  const normalized = normalizeComparableText(value);
  if (!normalized) {
    return null;
  }
  if (normalized === 'SI' || normalized === 'S' || normalized === 'TRUE') {
    return true;
  }
  if (normalized === 'NO' || normalized === 'N' || normalized === 'FALSE') {
    return false;
  }
  return null;
};

const csvSafe = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : typeof value === 'string' ? value : Array.isArray(value) ? value.join(' | ') : JSON.stringify(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const buildCsv = <T extends object>(rows: T[], columns: ReadonlyArray<keyof T>): string => {
  const header = columns.map((column) => csvSafe(String(column))).join(',');
  const body = rows.map((row) => columns.map((column) => csvSafe(row[column as keyof T])).join(','));
  return [header, ...body].join('\n');
};
