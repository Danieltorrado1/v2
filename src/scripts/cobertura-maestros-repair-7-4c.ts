import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { PoolClient, QueryResultRow } from 'pg';

import { dbPool } from '../config/db';
import {
  buildExactMunicipioMatrix,
  buildRepairPlanV2,
  classifyAffectedEntities,
  countStrongInstitutionDuplicates,
  type ExactMunicipioMatrixRow,
  type ParsedWorkbookLineageRow,
  type RepairFinalRow,
  type RepairInstitucionRow,
  type RepairModalidadRow,
  type RepairMunicipioRow,
  type RepairPlanOperation,
  type RepairPreliminarRow,
  type RepairSedeRow,
  type RepairVigenciaRow,
  simulateMunicipioRepairMatrix,
  summarizeDistinctAffectedIds,
} from '../modules/cobertura/cobertura.maestros.repair-plan-v2';
import {
  MUNICIPIO_REPAIR_CONFIRMATION,
  MUNICIPIO_REPAIR_CONTRACT_ID,
  MUNICIPIO_REPAIR_EXPECTED_SHA,
  MUNICIPIO_REPAIR_OFFICIAL_LOAD_ID,
  runMunicipioRepairTransaction,
  validateMunicipioRepairProtection,
} from '../modules/cobertura/cobertura.maestros.municipio-repair';
import { parseWorkbookRows } from '../modules/cobertura/cobertura.focalizacion.service';
import {
  buildCsv,
  runPersonalMeta26DryRun,
  type DryRunRowReport,
  type PersonalMeta26DryRunReport,
} from '../modules/importaciones/personalMeta26DryRun';
import { looksLikeManipuladoraCargo } from '../modules/vinculaciones/vinculaciones.personal.domain';
import { AppError } from '../utils/AppError';

const CONTRACT_ID = Number(MUNICIPIO_REPAIR_CONTRACT_ID);
const EMPRESA_ID = 15;
const OFFICIAL_LOAD_ID = Number(MUNICIPIO_REPAIR_OFFICIAL_LOAD_ID);
const ACTOR_USER_ID = '2';
const FOCALIZACION_FILE = 'data/focalizacion-agosto-2026.xlsx';
const POSTCHECK_JSON = 'reports/cobertura-maestros-repair-v2-postcheck.json';
const POSTCHECK_CSV = 'reports/cobertura-maestros-repair-v2-postcheck.csv';

interface CountRow extends QueryResultRow {
  total: number;
}

interface ContractRow extends QueryResultRow {
  empresa_id: string;
  id: string;
  nombre_empresa: string;
}

interface DuplicateCounts extends QueryResultRow {
  instituciones_duplicadas_fuertes: number;
  sede_modalidades_duplicadas_fuertes: number;
  sedes_duplicadas_fuertes: number;
}

interface LoadRow extends QueryResultRow {
  archivo_sha256: string | null;
  id: string;
}

interface TotalsRow extends QueryResultRow {
  cobertura_requerida_total: number;
  finales: number;
  focalizacion_total: number;
  vigencias: number;
}

interface SchemaColumnRow extends QueryResultRow {
  column_name: string;
  table_name: string;
}

interface PreflightContext {
  assessments: ReturnType<typeof classifyAffectedEntities>;
  catalogs: {
    contract: ContractRow;
    finales: RepairFinalRow[];
    instituciones: RepairInstitucionRow[];
    modalidades: RepairModalidadRow[];
    municipios: RepairMunicipioRow[];
    preliminar: RepairPreliminarRow[];
    schemaColumns: SchemaColumnRow[];
    sedes: RepairSedeRow[];
    vigencias: RepairVigenciaRow[];
  };
  duplicateCounts: DuplicateCounts;
  incorrectRows: ExactMunicipioMatrixRow[];
  matrix: ExactMunicipioMatrixRow[];
  operations: RepairPlanOperation[];
  orphanCounts: Record<string, number>;
  sha256: string;
  totals: TotalsRow;
}

const normalizeText = (value: string | null | undefined): string => {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
};

const queryRows = async <T extends QueryResultRow>(
  client: Pick<PoolClient, 'query'>,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> => (await client.query<T>(sql, params)).rows;

const getArg = (name: string): string | null => {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
};

const readWorkbookBufferShared = async (filePath: string): Promise<Buffer> => {
  try {
    return await readFile(path.resolve(filePath));
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code) : '';
    if (!['EPERM', 'EACCES', 'EBUSY'].includes(code) || process.platform !== 'win32') {
      throw error;
    }

    const escaped = path.resolve(filePath).replace(/'/g, "''");
    const base64 = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `$path = '${escaped}'; $fs = [System.IO.File]::Open($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite); try { $ms = New-Object System.IO.MemoryStream; $fs.CopyTo($ms); [Convert]::ToBase64String($ms.ToArray()) } finally { if ($ms) { $ms.Dispose() }; $fs.Dispose() }`,
      ],
      { encoding: 'utf8' },
    ).trim();

    return Buffer.from(base64, 'base64');
  }
};

const loadParsedRows = (buffer: Buffer): ParsedWorkbookLineageRow[] => {
  const parsed = parseWorkbookRows(buffer);
  return parsed.rows.map((row) => ({
    fila_origen: row.fila_numero,
    consecutivo: row.consecutivo,
    municipio: row.municipio,
    institucion: row.institucion,
    sede: row.sede,
    modalidad: row.modalidad,
  }));
};

const loadCatalogs = async (client: PoolClient): Promise<PreflightContext['catalogs']> => {
  const municipios = await queryRows<RepairMunicipioRow>(
    client,
    `SELECT id::text AS id, codigo_dane, nombre_municipio FROM municipios ORDER BY id ASC`,
  );
  const instituciones = await queryRows<RepairInstitucionRow>(
    client,
    `SELECT id::text AS id, municipio_id::text AS municipio_id, nombre_institucion
     FROM instituciones
     WHERE contrato_id = $1::bigint AND COALESCE(activo, TRUE) = TRUE
     ORDER BY id ASC`,
    [CONTRACT_ID],
  );
  const sedes = await queryRows<RepairSedeRow>(
    client,
    `SELECT s.id::text AS id, s.institucion_id::text AS institucion_id, s.municipio_id::text AS municipio_id, s.consecutivo_sede, s.nombre_sede
     FROM sedes s
     INNER JOIN instituciones i ON i.id = s.institucion_id
     WHERE i.contrato_id = $1::bigint AND COALESCE(s.activo, TRUE) = TRUE
     ORDER BY s.id ASC`,
    [CONTRACT_ID],
  );
  const modalidades = await queryRows<RepairModalidadRow>(
    client,
    `SELECT id::text AS id, nombre_modalidad
     FROM modalidades
     WHERE COALESCE(activo, TRUE) = TRUE
     ORDER BY id ASC`,
  );
  const preliminar = await queryRows<RepairPreliminarRow>(
    client,
    `SELECT id::text AS id, fila_origen, focalizacion_vigencia_id::text AS focalizacion_vigencia_id
     FROM focalizacion_preliminar
     WHERE contrato_id = $1::bigint AND carga_id = $2::bigint
     ORDER BY fila_origen ASC, id ASC`,
    [CONTRACT_ID, OFFICIAL_LOAD_ID],
  );
  const vigencias = await queryRows<RepairVigenciaRow>(
    client,
    `SELECT id::text AS id, preliminar_id::text AS preliminar_id, municipio_id::text AS municipio_id
     FROM focalizacion_vigencias
     WHERE contrato_id = $1::bigint AND activo = TRUE
     ORDER BY id ASC`,
    [CONTRACT_ID],
  );
  const finales = await queryRows<RepairFinalRow>(
    client,
    `SELECT id::text AS id, preliminar_id::text AS preliminar_id, municipio_id::text AS municipio_id, municipio_texto,
            institucion_id::text AS institucion_id, institucion_final,
            sede_id::text AS sede_id, sede_final,
            modalidad_id::text AS modalidad_id, modalidad_final,
            sede_modalidad_id::text AS sede_modalidad_id
     FROM focalizacion_final
     WHERE contrato_id = $1::bigint AND COALESCE(activo, TRUE) = TRUE
     ORDER BY id ASC`,
    [CONTRACT_ID],
  );
  const schemaColumns = await queryRows<SchemaColumnRow>(
    client,
    `SELECT table_name, column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])
       AND column_name IN ('municipio_id', 'municipio_texto', 'preliminar_id', 'focalizacion_vigencia_id', 'institucion_id', 'sede_id', 'sede_modalidad_id')
     ORDER BY table_name ASC, column_name ASC`,
    [[
      'focalizacion_preliminar',
      'focalizacion_vigencias',
      'focalizacion_final',
      'instituciones',
      'sedes',
      'sede_modalidades',
    ]],
  );
  const contract = (
    await queryRows<ContractRow>(
      client,
      `SELECT c.id::text AS id, c.empresa_id::text AS empresa_id, e.nombre_empresa
       FROM contratos c
       INNER JOIN empresas e ON e.id = c.empresa_id
       WHERE c.id = $1::bigint`,
      [CONTRACT_ID],
    )
  )[0];

  if (!contract) {
    throw new AppError('Contrato 24 no existe.', 404, 'MUNICIPIO_REPAIR_CONTRACT_NOT_FOUND');
  }

  return {
    contract,
    municipios,
    instituciones,
    sedes,
    modalidades,
    preliminar,
    vigencias,
    finales,
    schemaColumns,
  };
};

const loadLoadRow = async (client: PoolClient): Promise<LoadRow> => {
  const row = (
    await queryRows<LoadRow>(
      client,
      `SELECT id::text AS id, archivo_sha256
       FROM focalizacion_cargas
       WHERE id = $1::bigint AND contrato_id = $2::bigint`,
      [OFFICIAL_LOAD_ID, CONTRACT_ID],
    )
  )[0];

  if (!row) {
    throw new AppError('No existe focalizacion_cargas.id=4 para contrato 24.', 404, 'MUNICIPIO_REPAIR_LOAD_NOT_FOUND');
  }

  return row;
};

const loadTotals = async (client: PoolClient): Promise<TotalsRow> => {
  const row = (
    await queryRows<TotalsRow>(
      client,
      `SELECT
         COUNT(*)::int AS finales,
         COALESCE(SUM(cupos_aprobados), 0)::int AS focalizacion_total,
         COALESCE(SUM(cobertura_requerida), 0)::int AS cobertura_requerida_total,
         (SELECT COUNT(*)::int FROM focalizacion_vigencias WHERE contrato_id = $1::bigint AND activo = TRUE) AS vigencias
       FROM focalizacion_final
       WHERE contrato_id = $1::bigint AND COALESCE(activo, TRUE) = TRUE`,
      [CONTRACT_ID],
    )
  )[0];

  if (!row) {
    throw new AppError('No fue posible cargar totales de focalización.', 500, 'MUNICIPIO_REPAIR_TOTALS_NOT_FOUND');
  }

  return row;
};

const loadDuplicateCounts = async (client: PoolClient): Promise<DuplicateCounts> => {
  const row = (
    await queryRows<DuplicateCounts>(
      client,
      `SELECT
         (
           SELECT COUNT(*)::int
           FROM (
             SELECT municipio_id, UPPER(TRIM(REGEXP_REPLACE(nombre_institucion, '\\s+', ' ', 'g'))) AS nombre_key, COUNT(*)
             FROM instituciones
             WHERE contrato_id = $1::bigint
             GROUP BY municipio_id, UPPER(TRIM(REGEXP_REPLACE(nombre_institucion, '\\s+', ' ', 'g')))
             HAVING COUNT(*) > 1
           ) duplicates
         ) AS instituciones_duplicadas_fuertes,
         (
           SELECT COUNT(*)::int
           FROM (
             SELECT COALESCE(consecutivo_sede, nombre_sede) AS sede_key, COUNT(*)
             FROM sedes s
             INNER JOIN instituciones i ON i.id = s.institucion_id
             WHERE i.contrato_id = $1::bigint
             GROUP BY COALESCE(consecutivo_sede, nombre_sede)
             HAVING COUNT(*) > 1
           ) duplicates
         ) AS sedes_duplicadas_fuertes,
         (
           SELECT COUNT(*)::int
           FROM (
             SELECT sede_id, modalidad_id, contrato_id, COUNT(*)
             FROM sede_modalidades
             WHERE contrato_id = $1::bigint AND COALESCE(activo, TRUE) = TRUE
             GROUP BY sede_id, modalidad_id, contrato_id
             HAVING COUNT(*) > 1
           ) duplicates
         ) AS sede_modalidades_duplicadas_fuertes`,
      [CONTRACT_ID],
    )
  )[0];

  if (!row) {
    throw new AppError('No fue posible cargar duplicados fuertes.', 500, 'MUNICIPIO_REPAIR_DUPLICATES_NOT_FOUND');
  }

  return row;
};

const loadOrphanCounts = async (client: PoolClient): Promise<Record<string, number>> => {
  const rows = await queryRows<CountRow & { tipo: string }>(
    client,
    `SELECT 'instituciones'::text AS tipo, COUNT(*)::int AS total
     FROM instituciones i
     LEFT JOIN municipios m ON m.id = i.municipio_id
     WHERE i.contrato_id = $1::bigint AND m.id IS NULL
     UNION ALL
     SELECT 'sedes'::text AS tipo, COUNT(*)::int AS total
     FROM sedes s
     INNER JOIN instituciones i ON i.id = s.institucion_id
     LEFT JOIN municipios m ON m.id = s.municipio_id
     WHERE i.contrato_id = $1::bigint AND m.id IS NULL
     UNION ALL
     SELECT 'focalizacion_vigencias'::text AS tipo, COUNT(*)::int AS total
     FROM focalizacion_vigencias fv
     LEFT JOIN municipios m ON m.id = fv.municipio_id
     WHERE fv.contrato_id = $1::bigint AND fv.activo = TRUE AND m.id IS NULL
     UNION ALL
     SELECT 'focalizacion_final'::text AS tipo, COUNT(*)::int AS total
     FROM focalizacion_final ff
     LEFT JOIN municipios m ON m.id = ff.municipio_id
     WHERE ff.contrato_id = $1::bigint AND COALESCE(ff.activo, TRUE) = TRUE AND m.id IS NULL`,
    [CONTRACT_ID],
  );

  return Object.fromEntries(rows.map((row) => [row.tipo, row.total]));
};

const formatMunicipioSummary = (matrix: ExactMunicipioMatrixRow[], municipio: string) => {
  const target = normalizeText(municipio);
  const rows = matrix.filter((row) => normalizeText(row.municipio_xlsx) === target);
  return {
    municipio,
    filas: rows.length,
    municipios_bd: [...new Set(rows.map((row) => row.municipio_bd_actual ?? 'SIN_MUNICIPIO'))].sort((left, right) => left.localeCompare(right, 'es')),
    instituciones: [...new Set(rows.map((row) => row.institucion_bd ?? 'SIN_INSTITUCION'))].sort((left, right) => left.localeCompare(right, 'es')),
    sedes: rows.length === 0 ? 0 : [...new Set(rows.map((row) => row.sede_id))].length,
    sede_modalidades: rows.length,
    incorrectas: rows.filter((row) => row.estado_municipio === 'MUNICIPIO_INCORRECTO').length,
  };
};

const buildPreflightContext = async (client: PoolClient, buffer: Buffer, sha256: string): Promise<PreflightContext> => {
  if (sha256 !== MUNICIPIO_REPAIR_EXPECTED_SHA) {
    throw new AppError('SHA-256 del XLSX oficial no coincide con el esperado.', 409, 'MUNICIPIO_REPAIR_SHA_MISMATCH', {
      expected: MUNICIPIO_REPAIR_EXPECTED_SHA,
      got: sha256,
    });
  }

  const loadRow = await loadLoadRow(client);
  if (loadRow.archivo_sha256 !== sha256) {
    throw new AppError('La carga oficial id=4 no coincide con el SHA esperado.', 409, 'MUNICIPIO_REPAIR_LOAD_SHA_MISMATCH', {
      db_sha: loadRow.archivo_sha256,
      expected_sha: sha256,
    });
  }

  const parsedRows = loadParsedRows(buffer);
  if (parsedRows.length !== 687) {
    throw new AppError('El XLSX oficial no contiene 687 filas útiles.', 409, 'MUNICIPIO_REPAIR_XLSX_ROWS_MISMATCH', {
      rows: parsedRows.length,
    });
  }

  const catalogs = await loadCatalogs(client);
  if (catalogs.preliminar.length !== 687) {
    throw new AppError('La carga oficial no tiene 687 preliminares exactos.', 409, 'MUNICIPIO_REPAIR_PRELIMINAR_ROWS_MISMATCH', {
      rows: catalogs.preliminar.length,
    });
  }

  if (Number(catalogs.contract.empresa_id) !== EMPRESA_ID) {
    throw new AppError('Contrato 24 no pertenece a empresa_id 15.', 409, 'MUNICIPIO_REPAIR_CONTRACT_EMPRESA_MISMATCH', {
      empresa_id: catalogs.contract.empresa_id,
    });
  }

  if (normalizeText(catalogs.contract.nombre_empresa) !== 'CONSORCIO PAE META 26') {
    throw new AppError('La razón social del contrato 24 no corresponde a CONSORCIO PAE META 26.', 409, 'MUNICIPIO_REPAIR_CONTRACT_NAME_MISMATCH', {
      nombre_empresa: catalogs.contract.nombre_empresa,
    });
  }

  const matrix = buildExactMunicipioMatrix({
    parsedRows,
    municipios: catalogs.municipios,
    instituciones: catalogs.instituciones,
    sedes: catalogs.sedes,
    modalidades: catalogs.modalidades,
    preliminar: catalogs.preliminar,
    vigencias: catalogs.vigencias,
    finales: catalogs.finales,
  });
  const incorrectRows = matrix.filter((row) => row.estado_municipio === 'MUNICIPIO_INCORRECTO');
  const assessments = classifyAffectedEntities(matrix);
  const plan = buildRepairPlanV2({
    matrix,
    municipios: catalogs.municipios,
    instituciones: catalogs.instituciones,
    sedes: catalogs.sedes,
    vigencias: catalogs.vigencias,
    finales: catalogs.finales,
  });
  const duplicateCounts = await loadDuplicateCounts(client);
  const orphanCounts = await loadOrphanCounts(client);
  const totals = await loadTotals(client);

  return {
    sha256,
    catalogs,
    matrix,
    incorrectRows,
    assessments,
    operations: plan.safe_operations,
    duplicateCounts,
    orphanCounts,
    totals,
  };
};

const assertPreflightCounts = (preflight: PreflightContext, stage: 'BEFORE_APPLY' | 'AFTER_APPLY'): void => {
  const distinct = summarizeDistinctAffectedIds(preflight.matrix);
  const mixedInstitutions = preflight.assessments.instituciones.filter((item) => item.seguridad === 'INSTITUCION_MIXTA_NO_SEGURA');
  const mixedSedes = preflight.assessments.sedes.filter((item) => item.seguridad === 'SEDE_MIXTA_NO_SEGURA');

  if (stage === 'AFTER_APPLY') {
    if (preflight.incorrectRows.length !== 0 || preflight.operations.length !== 0) {
      throw new AppError('Después del APPLY todavía existen municipios incorrectos u operaciones pendientes.', 409, 'MUNICIPIO_REPAIR_AFTER_APPLY_PENDING', {
        relaciones: preflight.incorrectRows.length,
        operaciones: preflight.operations.length,
      });
    }
    return;
  }

  if (preflight.incorrectRows.length !== 57) {
    throw new AppError('Preflight V2 no confirmó 57 relaciones incorrectas.', 409, 'MUNICIPIO_REPAIR_PREFLIGHT_RELACIONES_MISMATCH', {
      relaciones: preflight.incorrectRows.length,
    });
  }
  if (distinct.instituciones.length !== 5) {
    throw new AppError('Preflight V2 no confirmó 5 instituciones.', 409, 'MUNICIPIO_REPAIR_PREFLIGHT_INSTITUCIONES_MISMATCH', {
      instituciones: distinct.instituciones.length,
    });
  }
  if (distinct.sedes.length !== 49) {
    throw new AppError('Preflight V2 no confirmó 49 sedes.', 409, 'MUNICIPIO_REPAIR_PREFLIGHT_SEDES_MISMATCH', {
      sedes: distinct.sedes.length,
    });
  }
  if (distinct.vigencias.length !== 57 || distinct.finales.length !== 57 || distinct.sede_modalidades.length !== 57) {
    throw new AppError('Preflight V2 no confirmó 57 vigencias/finales/sede_modalidades.', 409, 'MUNICIPIO_REPAIR_PREFLIGHT_RELATIONS_IDS_MISMATCH', {
      vigencias: distinct.vigencias.length,
      finales: distinct.finales.length,
      sede_modalidades: distinct.sede_modalidades.length,
    });
  }
  if (preflight.operations.length !== 168) {
    throw new AppError('Preflight V2 no confirmó 168 operaciones seguras.', 409, 'MUNICIPIO_REPAIR_PREFLIGHT_OPERATIONS_MISMATCH', {
      operaciones: preflight.operations.length,
    });
  }
  if (mixedInstitutions.length !== 0 || mixedSedes.length !== 0) {
    throw new AppError('Preflight V2 detectó entidades mixtas.', 409, 'MUNICIPIO_REPAIR_PREFLIGHT_MIXED_ENTITIES', {
      instituciones_mixtas: mixedInstitutions,
      sedes_mixtas: mixedSedes,
    });
  }
  if (
    preflight.duplicateCounts.instituciones_duplicadas_fuertes !== 0 ||
    preflight.duplicateCounts.sedes_duplicadas_fuertes !== 0 ||
    preflight.duplicateCounts.sede_modalidades_duplicadas_fuertes !== 0
  ) {
    throw new AppError('Preflight V2 detectó duplicados fuertes.', 409, 'MUNICIPIO_REPAIR_PREFLIGHT_DUPLICATES', preflight.duplicateCounts);
  }
  if (Object.values(preflight.orphanCounts).some((value) => value !== 0)) {
    throw new AppError('Preflight V2 detectó huérfanos.', 409, 'MUNICIPIO_REPAIR_PREFLIGHT_ORPHANS', preflight.orphanCounts);
  }
  if (
    preflight.totals.focalizacion_total !== 76650 ||
    preflight.totals.cobertura_requerida_total !== 662 ||
    preflight.totals.finales !== 687 ||
    preflight.totals.vigencias !== 687
  ) {
    throw new AppError('Preflight V2 detectó totales inesperados.', 409, 'MUNICIPIO_REPAIR_PREFLIGHT_TOTALS_MISMATCH', preflight.totals);
  }
};

const lockRowsForApply = async (client: PoolClient, preflight: PreflightContext): Promise<void> => {
  const distinct = summarizeDistinctAffectedIds(preflight.matrix);
  await client.query(`SELECT id FROM contratos WHERE id = $1::bigint FOR UPDATE`, [CONTRACT_ID]);
  await client.query(`SELECT id FROM focalizacion_cargas WHERE id = $1::bigint FOR UPDATE`, [OFFICIAL_LOAD_ID]);
  await client.query(`SELECT id FROM instituciones WHERE id = ANY($1::bigint[]) FOR UPDATE`, [distinct.instituciones]);
  await client.query(`SELECT id FROM sedes WHERE id = ANY($1::bigint[]) FOR UPDATE`, [distinct.sedes]);
  await client.query(`SELECT id FROM focalizacion_vigencias WHERE id = ANY($1::bigint[]) FOR UPDATE`, [distinct.vigencias]);
  await client.query(`SELECT id FROM focalizacion_final WHERE id = ANY($1::bigint[]) FOR UPDATE`, [distinct.finales]);
};

const groupOperations = (operations: RepairPlanOperation[]) => {
  const grouped = {
    instituciones: operations.filter((item) => item.tabla === 'instituciones'),
    sedes: operations.filter((item) => item.tabla === 'sedes'),
    vigencias: operations.filter((item) => item.tabla === 'focalizacion_vigencias'),
    finales: operations.filter((item) => item.tabla === 'focalizacion_final'),
  };
  return grouped;
};

const applyOperations = async (client: PoolClient, operations: RepairPlanOperation[]): Promise<{
  finales: number;
  instituciones: number;
  sedes: number;
  vigencias: number;
}> => {
  const grouped = groupOperations(operations);
  const updated = { instituciones: 0, sedes: 0, vigencias: 0, finales: 0 };

  for (const operation of grouped.instituciones) {
    const municipioId = Number(operation.valor_nuevo.split('|')[0]);
    const result = await client.query(
      `UPDATE instituciones SET municipio_id = $2::bigint WHERE id = $1::bigint AND municipio_id IS DISTINCT FROM $2::bigint`,
      [operation.id, municipioId],
    );
    updated.instituciones += result.rowCount ?? 0;
  }

  for (const operation of grouped.sedes) {
    const municipioId = Number(operation.valor_nuevo.split('|')[0]);
    const result = await client.query(
      `UPDATE sedes SET municipio_id = $2::bigint WHERE id = $1::bigint AND municipio_id IS DISTINCT FROM $2::bigint`,
      [operation.id, municipioId],
    );
    updated.sedes += result.rowCount ?? 0;
  }

  for (const operation of grouped.vigencias) {
    const municipioId = Number(operation.valor_nuevo.split('|')[0]);
    const result = await client.query(
      `UPDATE focalizacion_vigencias SET municipio_id = $2::bigint WHERE id = $1::bigint AND municipio_id IS DISTINCT FROM $2::bigint`,
      [operation.id, municipioId],
    );
    updated.vigencias += result.rowCount ?? 0;
  }

  for (const operation of grouped.finales) {
    const [municipioIdRaw, ...rest] = operation.valor_nuevo.split('|');
    const municipioId = Number(municipioIdRaw);
    const municipioTexto = rest.join('|') || null;
    const result = await client.query(
      `UPDATE focalizacion_final
       SET municipio_id = $2::bigint,
           municipio_texto = $3
       WHERE id = $1::bigint
         AND (municipio_id IS DISTINCT FROM $2::bigint OR municipio_texto IS DISTINCT FROM $3)`,
      [operation.id, municipioId, municipioTexto],
    );
    updated.finales += result.rowCount ?? 0;
  }

  if (
    updated.instituciones !== grouped.instituciones.length ||
    updated.sedes !== grouped.sedes.length ||
    updated.vigencias !== grouped.vigencias.length ||
    updated.finales !== grouped.finales.length
  ) {
    throw new AppError('El APPLY no actualizó exactamente las filas esperadas.', 409, 'MUNICIPIO_REPAIR_APPLY_ROWCOUNT_MISMATCH', {
      expected: {
        instituciones: grouped.instituciones.length,
        sedes: grouped.sedes.length,
        vigencias: grouped.vigencias.length,
        finales: grouped.finales.length,
      },
      updated,
    });
  }

  return updated;
};

const insertStrictAudit = async (
  client: PoolClient,
  payload: {
    operations: number;
    sha256: string;
    updated: { finales: number; instituciones: number; sedes: number; vigencias: number };
  },
): Promise<void> => {
  await client.query(
    `INSERT INTO auditoria_eventos (
       usuario_id,
       empresa_id,
       contrato_id,
       modulo,
       entidad,
       entidad_id,
       accion,
       descripcion,
       datos_anteriores,
       datos_nuevos,
       ip_address,
       user_agent,
       fecha_evento
     )
     VALUES (
       $1::bigint,
       $2::bigint,
       $3::bigint,
       'COBERTURA',
       'cobertura_maestros',
       $4,
       'REPARACION_MUNICIPIO_FOCALIZACION',
       'Reparación territorial por BUG_RESOLUCION_MUNICIPIO aplicada desde REPAIR_PLAN_V2',
       NULL,
       $5::jsonb,
       NULL,
       'REPAIR_PLAN_V2',
       NOW()
     )`,
    [
      ACTOR_USER_ID,
      EMPRESA_ID,
      CONTRACT_ID,
      `${CONTRACT_ID}:${OFFICIAL_LOAD_ID}:REPAIR_PLAN_V2`,
      JSON.stringify({
        contrato_id: CONTRACT_ID,
        empresa_id: EMPRESA_ID,
        carga_id: OFFICIAL_LOAD_ID,
        archivo_sha256: payload.sha256,
        cantidad_relaciones: 57,
        instituciones: 5,
        sedes: 49,
        vigencias: 57,
        finales: 57,
        operaciones: payload.operations,
        origen: 'REPAIR_PLAN_V2',
        actor_tecnico: ACTOR_USER_ID,
        updates: payload.updated,
      }),
    ],
  );
};

const buildPostcheckPayload = (
  preflight: PreflightContext,
  idempotentOperations: number,
  personal: PersonalMeta26DryRunReport,
): Record<string, unknown> => {
  const matrix = preflight.matrix;
  const manipRows = personal.report_rows.filter((row) => looksLikeManipuladoraCargo(row.cargo_resuelto ?? row.cargo_origen));
  const coverageCounts = new Map<string, number>();
  for (const row of manipRows) {
    coverageCounts.set(row.cobertura_estado, (coverageCounts.get(row.cobertura_estado) ?? 0) + 1);
  }

  const identityProblemRows = personal.report_rows.filter((row) =>
    ['MISMA_CEDULA_NOMBRE_DIFERENTE', 'DOCUMENTO_FALTANTE', 'DOCUMENTO_INVALIDO'].includes(row.identidad_estado),
  );
  const contractualRows = personal.report_rows.filter((row) =>
    row.fecha_errores.length > 0 || (!row.tipo_vinculacion_resuelto && row.tipo_vinculacion_origen !== null),
  );
  const ubicacionRows = personal.report_rows.filter((row) =>
    row.ubicacion_estado === 'UBICACION_NO_RECONOCIDA' ||
    row.ubicacion_estado === 'UBICACION_AMBIGUA' ||
    row.ubicacion_estado === 'SIN_UBICACION',
  );
  const casoEspecialRows = personal.report_rows.filter((row) =>
    normalizeText(row.metodo_pago_origen) === 'CASO ESPECIAL' ||
    row.problemas_bloqueantes.includes('VALOR_CASO_ESPECIAL_FALTANTE'),
  );
  const catalogRows = personal.report_rows.filter((row) =>
    row.problemas_bloqueantes.some((item) =>
      item === 'TIPO_DOCUMENTO_NO_RECONOCIDO' ||
      item === 'TIPO_VINCULACION_NO_MAPEADO' ||
      item === 'CARGO_FALTANTE' ||
      item === 'TIPO_CONTRATO_NO_MAPEADO' ||
      item === 'TIPO_DOCUMENTO_FALTANTE',
    ),
  );

  return {
    cobertura_postcommit: {
      municipio_incorrecto: preflight.incorrectRows.length,
      barranca_de_upia: formatMunicipioSummary(matrix, 'BARRANCA DE UPÍA'),
      el_dorado: formatMunicipioSummary(matrix, 'EL DORADO'),
      puerto_concordia: formatMunicipioSummary(matrix, 'PUERTO CONCORDIA'),
      uribe: formatMunicipioSummary(matrix, 'URIBE'),
      la_macarena: formatMunicipioSummary(matrix, 'LA MACARENA'),
      focalizacion_total: preflight.totals.focalizacion_total,
      cobertura_requerida_total: preflight.totals.cobertura_requerida_total,
      huérfanos: preflight.orphanCounts,
      duplicados: preflight.duplicateCounts,
      idempotencia: {
        relaciones_incorrectas: preflight.incorrectRows.length,
        updates_propuestos: idempotentOperations,
      },
    },
    personal_dry_run: {
      filas: personal.report_rows.length,
      personas_crear: personal.unique_people.personas_crear,
      personas_reutilizar: personal.unique_people.personas_reutilizar,
      vinculaciones_crear: personal.unique_people.vinculaciones_crear,
      revisar: personal.review_rows.length,
      manipuladoras_totales: manipRows.length,
      manipuladoras_asignables: personal.coverage_summary.asignadas_total,
      manipuladoras_no_asignables: manipRows.length - personal.coverage_summary.asignadas_total,
      coverage_status: {
        MUNICIPIO_NO_RECONOCIDO: coverageCounts.get('MUNICIPIO_NO_RECONOCIDO') ?? 0,
        INSTITUCION_NO_RECONOCIDA: coverageCounts.get('INSTITUCION_NO_RECONOCIDA') ?? 0,
        SEDE_NO_RECONOCIDA: coverageCounts.get('SEDE_NO_RECONOCIDA') ?? 0,
        SEDE_MODALIDAD_NO_EXISTE: coverageCounts.get('SEDE_MODALIDAD_NO_EXISTE') ?? 0,
      },
      coverage_summary: personal.coverage_summary,
      identity: {
        filas: identityProblemRows.length,
        conflictos: personal.unique_identity_conflicts,
      },
      contractual: {
        filas: contractualRows.length,
        codigos: Object.fromEntries(
          [...new Set(contractualRows.flatMap((row) => row.fecha_errores))]
            .map((code) => [code, contractualRows.filter((row) => row.fecha_errores.includes(code)).length]),
        ),
      },
      ubicaciones: {
        filas: ubicacionRows.length,
        ubicaciones_no_reconocidas: personal.ubicaciones_no_reconocidas,
      },
      caso_especial: {
        filas: casoEspecialRows.length,
        modelo_alertas: personal.modelo_alertas,
      },
      catalogos: {
        filas: catalogRows.length,
      },
      licitacion: personal.licitacion_summary,
      decisiones_humanas: personal.manual_decision_rows.length,
      blockers: personal.blockers,
    },
  };
};

const writePostcheckReports = async (input: {
  matrix: ExactMunicipioMatrixRow[];
  payload: Record<string, unknown>;
}): Promise<void> => {
  await mkdir(path.resolve('reports'), { recursive: true });
  await Promise.all([
    writeFile(path.resolve(POSTCHECK_JSON), JSON.stringify(input.payload, null, 2), 'utf8'),
    writeFile(path.resolve(POSTCHECK_CSV), buildCsv(input.matrix, [
      'fila_origen',
      'preliminar_id',
      'vigencia_id',
      'final_id',
      'sede_modalidad_id',
      'sede_id',
      'institucion_id',
      'municipio_xlsx',
      'municipio_id_esperado',
      'municipio_bd_actual',
      'municipio_id_bd_actual',
      'institucion_xlsx',
      'institucion_bd',
      'sede_xlsx',
      'sede_bd',
      'modalidad_xlsx',
      'modalidad_bd',
      'estado_municipio',
    ]), 'utf8'),
  ]);
};

const main = async (): Promise<void> => {
  const apply = process.argv.includes('--apply');
  const contractId = getArg('contract-id');
  const officialLoadId = getArg('official-load-id');
  const confirm = getArg('confirm');
  validateMunicipioRepairProtection({ apply, contractId, officialLoadId, confirm });

  if (!apply) {
    throw new AppError('Este script requiere --apply para ejecutar la reparación territorial autorizada.', 400, 'MUNICIPIO_REPAIR_APPLY_REQUIRED');
  }

  const buffer = await readWorkbookBufferShared(FOCALIZACION_FILE);
  const sha256 = createHash('sha256').update(buffer).digest('hex');

  const preflightClient = await dbPool.connect();
  let preflightReadOnly: PreflightContext;
  try {
    await preflightClient.query('BEGIN READ ONLY');
    await preflightClient.query(`SET LOCAL statement_timeout = '120s'`);
    preflightReadOnly = await buildPreflightContext(preflightClient, buffer, sha256);
    assertPreflightCounts(preflightReadOnly, 'BEFORE_APPLY');
    await preflightClient.query('ROLLBACK');
  } catch (error) {
    await preflightClient.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    preflightClient.release();
  }

  const applyClient = await dbPool.connect();
  let applyResult: { finales: number; instituciones: number; sedes: number; vigencias: number } | null = null;
  try {
    await runMunicipioRepairTransaction(applyClient, async () => {
      await applyClient.query(`SET LOCAL statement_timeout = '120s'`);
      await applyClient.query(`SET LOCAL lock_timeout = '15s'`);

      const preflightInTx = await buildPreflightContext(applyClient, buffer, sha256);
      assertPreflightCounts(preflightInTx, 'BEFORE_APPLY');
      await lockRowsForApply(applyClient, preflightInTx);

      applyResult = await applyOperations(applyClient, preflightInTx.operations);
      await insertStrictAudit(applyClient, {
        sha256,
        operations: preflightInTx.operations.length,
        updated: applyResult,
      });

      const postInTx = await buildPreflightContext(applyClient, buffer, sha256);
      assertPreflightCounts(postInTx, 'AFTER_APPLY');

      if (
        postInTx.duplicateCounts.instituciones_duplicadas_fuertes !== 0 ||
        postInTx.duplicateCounts.sedes_duplicadas_fuertes !== 0 ||
        postInTx.duplicateCounts.sede_modalidades_duplicadas_fuertes !== 0
      ) {
        throw new AppError('El postcheck dentro de la transacción detectó duplicados.', 409, 'MUNICIPIO_REPAIR_POSTCHECK_DUPLICATES', postInTx.duplicateCounts);
      }

      if (Object.values(postInTx.orphanCounts).some((value) => value !== 0)) {
        throw new AppError('El postcheck dentro de la transacción detectó huérfanos.', 409, 'MUNICIPIO_REPAIR_POSTCHECK_ORPHANS', postInTx.orphanCounts);
      }

      if (
        postInTx.totals.focalizacion_total !== 76650 ||
        postInTx.totals.cobertura_requerida_total !== 662 ||
        postInTx.totals.finales !== 687 ||
        postInTx.totals.vigencias !== 687
      ) {
        throw new AppError('El postcheck dentro de la transacción alteró los totales.', 409, 'MUNICIPIO_REPAIR_POSTCHECK_TOTALS_MISMATCH', postInTx.totals);
      }

      if (formatMunicipioSummary(postInTx.matrix, 'LA MACARENA').incorrectas !== 0) {
        throw new AppError('La Macarena sufrió una alteración indebida durante el postcheck interno.', 409, 'MUNICIPIO_REPAIR_LA_MACARENA_CHANGED');
      }
    });
  } finally {
    applyClient.release();
  }

  if (!applyResult) {
    throw new AppError('La transacción no devolvió resultado de actualización.', 500, 'MUNICIPIO_REPAIR_APPLY_RESULT_MISSING');
  }

  const postClient = await dbPool.connect();
  let postflight: PreflightContext;
  try {
    await postClient.query('BEGIN READ ONLY');
    await postClient.query(`SET LOCAL statement_timeout = '120s'`);
    postflight = await buildPreflightContext(postClient, buffer, sha256);
    assertPreflightCounts(postflight, 'AFTER_APPLY');
    await postClient.query('ROLLBACK');
  } catch (error) {
    await postClient.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    postClient.release();
  }

  const idempotenceClient = await dbPool.connect();
  let idempotenceOperations = 0;
  try {
    await idempotenceClient.query('BEGIN READ ONLY');
    await idempotenceClient.query(`SET LOCAL statement_timeout = '120s'`);
    const preflightAgain = await buildPreflightContext(idempotenceClient, buffer, sha256);
    idempotenceOperations = preflightAgain.operations.length;
    if (preflightAgain.incorrectRows.length !== 0 || idempotenceOperations !== 0) {
      throw new AppError('La reparación no es idempotente; el planificador sigue proponiendo cambios.', 409, 'MUNICIPIO_REPAIR_IDEMPOTENCE_FAILED', {
        relaciones: preflightAgain.incorrectRows.length,
        operaciones: idempotenceOperations,
      });
    }
    await idempotenceClient.query('ROLLBACK');
  } catch (error) {
    await idempotenceClient.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    idempotenceClient.release();
  }

  const personalReport = await runPersonalMeta26DryRun();
  const postcheckPayload = buildPostcheckPayload(postflight, idempotenceOperations, personalReport);
  await writePostcheckReports({
    matrix: postflight.matrix,
    payload: postcheckPayload,
  });

  const manipRows = personalReport.report_rows.filter((row) => looksLikeManipuladoraCargo(row.cargo_resuelto ?? row.cargo_origen));
  const coverageCounts = new Map<string, number>();
  for (const row of manipRows) {
    coverageCounts.set(row.cobertura_estado, (coverageCounts.get(row.cobertura_estado) ?? 0) + 1);
  }

  console.log(JSON.stringify({
    sha256,
    preflight_confirmed: true,
    transaction_result: 'REPAIR_APPLY_COMMIT_OK',
    updated: applyResult,
    total_operations: preflightReadOnly.operations.length,
    auditoria_creada: true,
    postcommit: {
      municipio_incorrecto: postflight.incorrectRows.length,
      barranca_de_upia: formatMunicipioSummary(postflight.matrix, 'BARRANCA DE UPÍA'),
      el_dorado: formatMunicipioSummary(postflight.matrix, 'EL DORADO'),
      puerto_concordia: formatMunicipioSummary(postflight.matrix, 'PUERTO CONCORDIA'),
      uribe: formatMunicipioSummary(postflight.matrix, 'URIBE'),
      la_macarena: formatMunicipioSummary(postflight.matrix, 'LA MACARENA'),
      focalizacion_total: postflight.totals.focalizacion_total,
      cobertura_requerida_total: postflight.totals.cobertura_requerida_total,
      huerfanos: postflight.orphanCounts,
      duplicados: postflight.duplicateCounts,
    },
    idempotencia: {
      relaciones_incorrectas: postflight.incorrectRows.length,
      updates_propuestos: idempotenceOperations,
    },
    personal: {
      filas: personalReport.report_rows.length,
      personas_crear: personalReport.unique_people.personas_crear,
      personas_reutilizar: personalReport.unique_people.personas_reutilizar,
      vinculaciones_crear: personalReport.unique_people.vinculaciones_crear,
      revisar: personalReport.review_rows.length,
      manipuladoras_totales: manipRows.length,
      manipuladoras_asignables: personalReport.coverage_summary.asignadas_total,
      manipuladoras_no_asignables: manipRows.length - personalReport.coverage_summary.asignadas_total,
      municipio_no_reconocido: coverageCounts.get('MUNICIPIO_NO_RECONOCIDO') ?? 0,
      institucion_no_reconocida: coverageCounts.get('INSTITUCION_NO_RECONOCIDA') ?? 0,
      sede_no_reconocida: coverageCounts.get('SEDE_NO_RECONOCIDA') ?? 0,
      sede_modalidad_no_existe: coverageCounts.get('SEDE_MODALIDAD_NO_EXISTE') ?? 0,
      coverage_summary: personalReport.coverage_summary,
      identity_conflicts: personalReport.unique_identity_conflicts,
      modelo_alertas: personalReport.modelo_alertas,
      blockers: personalReport.blockers,
      manual_decisions: personalReport.manual_decision_rows.length,
    },
    reports: {
      postcheck_json: POSTCHECK_JSON,
      postcheck_csv: POSTCHECK_CSV,
    },
  }, null, 2));
};

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack : error);
  await dbPool.end().catch(() => undefined);
  process.exitCode = 1;
});
