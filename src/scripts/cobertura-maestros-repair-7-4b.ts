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
  type EntityMunicipioAssessment,
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
  MUNICIPIO_REPAIR_CONTRACT_ID,
  MUNICIPIO_REPAIR_EXPECTED_SHA,
  MUNICIPIO_REPAIR_OFFICIAL_LOAD_ID,
} from '../modules/cobertura/cobertura.maestros.municipio-repair';
import { parseWorkbookRows } from '../modules/cobertura/cobertura.focalizacion.service';
import { buildCsv } from '../modules/importaciones/personalMeta26DryRun';
import { AppError } from '../utils/AppError';

const CONTRACT_ID = Number(MUNICIPIO_REPAIR_CONTRACT_ID);
const OFFICIAL_LOAD_ID = Number(MUNICIPIO_REPAIR_OFFICIAL_LOAD_ID);
const FOCALIZACION_FILE = 'data/focalizacion-agosto-2026.xlsx';
const PREVIEW_JSON = 'reports/cobertura-maestros-repair-v2-preview.json';
const PREVIEW_CSV = 'reports/cobertura-maestros-repair-v2-preview.csv';

interface SchemaColumnRow extends QueryResultRow {
  column_name: string;
  table_name: string;
}

interface CountRow extends QueryResultRow {
  total: number;
}

interface DuplicateCounts extends QueryResultRow {
  instituciones_duplicadas_fuertes: number;
  sede_modalidades_duplicadas_fuertes: number;
  sedes_duplicadas_fuertes: number;
}

interface TotalsRow extends QueryResultRow {
  cobertura_requerida_total: number;
  focalizacion_total: number;
}

interface LoadRow extends QueryResultRow {
  archivo_sha256: string | null;
  id: string;
}

const queryRows = async <T extends QueryResultRow>(
  client: PoolClient,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> => (await client.query<T>(sql, params)).rows;

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

const loadCatalogs = async (client: PoolClient): Promise<{
  finales: RepairFinalRow[];
  instituciones: RepairInstitucionRow[];
  modalidades: RepairModalidadRow[];
  municipios: RepairMunicipioRow[];
  preliminar: RepairPreliminarRow[];
  schemaColumns: SchemaColumnRow[];
  sedes: RepairSedeRow[];
  vigencias: RepairVigenciaRow[];
}> => {
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

  return {
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
    throw new AppError('No existe la carga oficial id=4 para contrato 24.', 404, 'MUNICIPIO_REPAIR_LOAD_NOT_FOUND');
  }

  return row;
};

const loadTotals = async (client: PoolClient): Promise<TotalsRow> => {
  const row = (
    await queryRows<TotalsRow>(
      client,
      `SELECT
         COALESCE(SUM(cupos_aprobados), 0)::int AS focalizacion_total,
         COALESCE(SUM(cobertura_requerida), 0)::int AS cobertura_requerida_total
       FROM focalizacion_final
       WHERE contrato_id = $1::bigint AND COALESCE(activo, TRUE) = TRUE`,
      [CONTRACT_ID],
    )
  )[0];

  if (!row) {
    throw new AppError('No fue posible cargar totales de focalizacion.', 500, 'MUNICIPIO_REPAIR_TOTALS_NOT_FOUND');
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

const applyOperationsToInstituciones = (
  instituciones: RepairInstitucionRow[],
  operations: RepairPlanOperation[],
): RepairInstitucionRow[] => {
  const targetMunicipioById = new Map<number, string>();
  for (const operation of operations) {
    if (operation.seguro_si_no !== 'SI' || operation.tabla !== 'instituciones') continue;
    targetMunicipioById.set(operation.id, operation.valor_nuevo.split('|')[0] ?? '');
  }

  return instituciones.map((row) => {
    const target = targetMunicipioById.get(Number(row.id));
    if (!target) return row;
    return {
      ...row,
      municipio_id: target,
    };
  });
};

const groupSchemaColumns = (rows: SchemaColumnRow[]): Record<string, string[]> => {
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const list = grouped.get(row.table_name) ?? [];
    list.push(row.column_name);
    grouped.set(row.table_name, list);
  }
  return Object.fromEntries(
    [...grouped.entries()].map(([table, columns]) => [table, [...new Set(columns)].sort((left, right) => left.localeCompare(right, 'es'))]),
  );
};

const explainRows233to243 = (
  matrix: ExactMunicipioMatrixRow[],
  institutionAssessments: EntityMunicipioAssessment[],
  sedeAssessments: EntityMunicipioAssessment[],
): {
  causa_principal: 'A' | 'B' | 'C' | 'D';
  explicacion: string;
  filas: ExactMunicipioMatrixRow[];
  instituciones_44_45: EntityMunicipioAssessment[];
  sedes_implicadas: EntityMunicipioAssessment[];
} => {
  const rows = matrix.filter((row) => row.fila_origen >= 233 && row.fila_origen <= 243);
  const affectedInstitutionIds = new Set(rows.map((row) => row.institucion_id));
  const affectedSedeIds = new Set(rows.map((row) => row.sede_id));
  const institutions = institutionAssessments.filter((item) => affectedInstitutionIds.has(item.entity_id));
  const sedes = sedeAssessments.filter((item) => affectedSedeIds.has(item.entity_id));

  const mixedInstitution = institutions.some((item) => item.seguridad === 'INSTITUCION_MIXTA_NO_SEGURA');
  const mixedSede = sedes.some((item) => item.seguridad === 'SEDE_MIXTA_NO_SEGURA');

  if (mixedInstitution) {
    return {
      causa_principal: 'A',
      explicacion: 'Las filas 233-243 usan institucion_id compartidos por filas oficiales con municipios esperados diferentes. El plan agregado anterior intentó mover IDs mixtos que no pueden actualizarse en bloque.',
      filas: rows,
      instituciones_44_45: institutions,
      sedes_implicadas: sedes,
    };
  }

  if (mixedSede) {
    return {
      causa_principal: 'B',
      explicacion: 'Las filas 233-243 usan sede_id compartidos por filas oficiales con municipios esperados diferentes. El plan agregado anterior quiso mover sedes mixtas que no pertenecen exclusivamente a las 57 filas incorrectas.',
      filas: rows,
      instituciones_44_45: institutions,
      sedes_implicadas: sedes,
    };
  }

  return {
    causa_principal: 'C',
    explicacion: 'Las filas 233-243 quedaron incluidas porque el plan agregado anterior seleccionó IDs fuera del linaje exacto. El error vino del fallback textual por clave y no de la traza oficial fila_origen -> preliminar -> vigencia -> final.',
    filas: rows,
    instituciones_44_45: institutions,
    sedes_implicadas: sedes,
  };
};

const writeReports = async (input: {
  jsonPayload: Record<string, unknown>;
  operations: RepairPlanOperation[];
}): Promise<void> => {
  await mkdir(path.resolve('reports'), { recursive: true });
  await Promise.all([
    writeFile(path.resolve(PREVIEW_JSON), JSON.stringify(input.jsonPayload, null, 2), 'utf8'),
    writeFile(path.resolve(PREVIEW_CSV), buildCsv(input.operations, [
      'tabla',
      'id',
      'campo',
      'valor_actual',
      'valor_nuevo',
      'fila_origen_evidencia',
      'preliminar_id',
      'motivo',
      'seguro_si_no',
    ]), 'utf8'),
  ]);
};

const main = async (): Promise<void> => {
  const buffer = await readWorkbookBufferShared(FOCALIZACION_FILE);
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  if (sha256 !== MUNICIPIO_REPAIR_EXPECTED_SHA) {
    throw new AppError('SHA-256 del XLSX oficial no coincide con el esperado.', 409, 'MUNICIPIO_REPAIR_SHA_MISMATCH', {
      expected: MUNICIPIO_REPAIR_EXPECTED_SHA,
      got: sha256,
    });
  }

  const client = await dbPool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query(`SET LOCAL statement_timeout = '120s'`);

    const loadRow = await loadLoadRow(client);
    if (loadRow.archivo_sha256 !== MUNICIPIO_REPAIR_EXPECTED_SHA) {
      throw new AppError('La carga oficial id=4 no coincide con el SHA esperado.', 409, 'MUNICIPIO_REPAIR_LOAD_SHA_MISMATCH', {
        db_sha: loadRow.archivo_sha256,
        expected_sha: MUNICIPIO_REPAIR_EXPECTED_SHA,
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
      throw new AppError('La carga oficial no tiene 687 filas preliminares exactas.', 409, 'MUNICIPIO_REPAIR_PRELIMINAR_ROWS_MISMATCH', {
        rows: catalogs.preliminar.length,
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

    if (matrix.length !== 687) {
      throw new AppError('La matriz exacta no produjo 687 filas.', 409, 'MUNICIPIO_REPAIR_MATRIX_ROWS_MISMATCH', {
        rows: matrix.length,
      });
    }

    const incorrectRows = matrix.filter((row) => row.estado_municipio === 'MUNICIPIO_INCORRECTO');
    if (incorrectRows.length !== 57) {
      throw new AppError('La matriz exacta no confirmó exactamente 57 filas incorrectas.', 409, 'MUNICIPIO_REPAIR_INCORRECT_ROWS_MISMATCH', {
        rows: incorrectRows.length,
      });
    }

    const distinctIds = summarizeDistinctAffectedIds(matrix);
    const assessments = classifyAffectedEntities(matrix);
    const plan = buildRepairPlanV2({
      matrix,
      municipios: catalogs.municipios,
      instituciones: catalogs.instituciones,
      sedes: catalogs.sedes,
      vigencias: catalogs.vigencias,
      finales: catalogs.finales,
    });
    const simulatedMatrix = simulateMunicipioRepairMatrix({
      matrix,
      operations: plan.safe_operations,
      municipios: catalogs.municipios,
    });
    const simulatedIncorrect = simulatedMatrix.filter((row) => row.estado_municipio === 'MUNICIPIO_INCORRECTO');

    const simulatedInstituciones = applyOperationsToInstituciones(catalogs.instituciones, plan.safe_operations);
    const duplicateCounts = await loadDuplicateCounts(client);
    const orphanCounts = await loadOrphanCounts(client);
    const totals = await loadTotals(client);
    const schemaColumns = groupSchemaColumns(catalogs.schemaColumns);

    const rows233to243 = explainRows233to243(matrix, assessments.instituciones, assessments.sedes);
    const incorrectMunicipiosResumen = incorrectRows.reduce<Record<string, number>>((acc, row) => {
      const key = `${row.municipio_xlsx} -> ${row.municipio_bd_actual}`;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    const safeByTable = plan.safe_operations.reduce<Record<string, number>>((acc, row) => {
      acc[row.tabla] = (acc[row.tabla] ?? 0) + 1;
      return acc;
    }, {});
    const discardedByTable = plan.discarded_operations.reduce<Record<string, number>>((acc, row) => {
      acc[row.tabla] = (acc[row.tabla] ?? 0) + 1;
      return acc;
    }, {});

    const jsonPayload = {
      contract_id: CONTRACT_ID,
      official_load_id: OFFICIAL_LOAD_ID,
      file: FOCALIZACION_FILE,
      sha256,
      filas_auditadas: matrix.length,
      filas_incorrectas_confirmadas: incorrectRows.length,
      municipios_desalineados_resumen: incorrectMunicipiosResumen,
      matrix_687: matrix,
      filas_incorrectas_57: incorrectRows,
      distinct_ids: {
        instituciones_distintas: distinctIds.instituciones,
        sedes_distintas: distinctIds.sedes,
        sede_modalidades_distintas: distinctIds.sede_modalidades,
        vigencias_distintas: distinctIds.vigencias,
        finales_distintos: distinctIds.finales,
      },
      entidades_afectadas: {
        instituciones: assessments.instituciones,
        sedes: assessments.sedes,
      },
      schema: {
        tablas_con_municipio_en_esquema: schemaColumns,
        fuente_canonica_propuesta: {
          maestros: ['instituciones.municipio_id', 'sedes.municipio_id'],
          copias_denormalizadas: ['focalizacion_vigencias.municipio_id', 'focalizacion_final.municipio_id', 'focalizacion_final.municipio_texto'],
          sin_municipio_id: ['focalizacion_preliminar', 'sede_modalidades'],
        },
      },
      filas_233_243: rows233to243,
      operaciones_seguras_propuestas: plan.safe_operations,
      operaciones_descartadas: plan.discarded_operations,
      operaciones_resumen: {
        seguras_por_tabla: safeByTable,
        descartadas_por_tabla: discardedByTable,
      },
      simulacion: {
        municipio_incorrecto: simulatedIncorrect.length,
        duplicados_fuertes: {
          instituciones: countStrongInstitutionDuplicates(simulatedInstituciones),
          sedes: duplicateCounts.sedes_duplicadas_fuertes,
          sede_modalidades: duplicateCounts.sede_modalidades_duplicadas_fuertes,
        },
        huerfanos: orphanCounts,
        focalizacion_total: totals.focalizacion_total,
        cobertura_requerida_total: totals.cobertura_requerida_total,
      },
      seguridad: {
        instituciones_mixtas: assessments.instituciones.filter((item) => item.seguridad === 'INSTITUCION_MIXTA_NO_SEGURA'),
        sedes_mixtas: assessments.sedes.filter((item) => item.seguridad === 'SEDE_MIXTA_NO_SEGURA'),
        reparacion_lista_para_apply:
          simulatedIncorrect.length === 0 &&
          assessments.instituciones.every((item) => item.seguridad === 'INSTITUCION_SEGURA_PARA_UPDATE') &&
          assessments.sedes.every((item) => item.seguridad === 'SEDE_SEGURA_PARA_UPDATE') &&
          countStrongInstitutionDuplicates(simulatedInstituciones) === 0 &&
          Object.values(orphanCounts).every((value) => value === 0),
      },
      escrituras_bd: 0,
      reportes: {
        preview_json: PREVIEW_JSON,
        preview_csv: PREVIEW_CSV,
      },
    };

    await writeReports({
      jsonPayload,
      operations: [...plan.safe_operations, ...plan.discarded_operations],
    });

    console.log(JSON.stringify({
      sha256,
      filas_auditadas: matrix.length,
      filas_incorrectas_confirmadas: incorrectRows.length,
      instituciones_distintas_afectadas: distinctIds.instituciones.length,
      sedes_distintas_afectadas: distinctIds.sedes.length,
      sede_modalidades_distintas: distinctIds.sede_modalidades.length,
      vigencias_distintas: distinctIds.vigencias.length,
      finales_distintos: distinctIds.finales.length,
      instituciones_mixtas: assessments.instituciones.filter((item) => item.seguridad === 'INSTITUCION_MIXTA_NO_SEGURA').length,
      sedes_mixtas: assessments.sedes.filter((item) => item.seguridad === 'SEDE_MIXTA_NO_SEGURA').length,
      simulacion: {
        municipio_incorrecto: simulatedIncorrect.length,
        focalizacion_total: totals.focalizacion_total,
        cobertura_requerida_total: totals.cobertura_requerida_total,
      },
      reportes: {
        preview_json: PREVIEW_JSON,
        preview_csv: PREVIEW_CSV,
      },
      escrituras_bd: 0,
    }, null, 2));

    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await dbPool.end().catch(() => undefined);
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
