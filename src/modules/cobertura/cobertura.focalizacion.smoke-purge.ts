import { PoolClient, QueryResultRow } from 'pg';

import { dbPool } from '../../config/db';
import { AppError } from '../../utils/AppError';
import { registerAuditEntry } from '../auditoria/auditoria.helper';

export const SMOKE_PURGE_CONFIRMATION = 'PURGAR_SMOKE_TECNICO_FOCALIZACION';

interface LoadRow extends QueryResultRow {
  id: string;
  contrato_id: string;
  nombre_archivo: string;
  archivo_sha256: string | null;
  fecha_inicio_vigencia: string | null;
  fecha_fin_vigencia: string | null;
  estado: string;
  activo: boolean;
  created_by: string | null;
  usuario_carga_id: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  archivo_bytes_len: number | null;
  created_at: Date;
}

interface VigenciaRow extends QueryResultRow {
  id: string;
  preliminar_id: string | null;
  valor_anterior_id: string | null;
}

interface OfficialReferenceRow extends QueryResultRow {
  oficial_vigencia_id: string;
  oficial_carga_id: string;
  previous_smoke_vigencia_id: string;
}

interface AuditEventRow extends QueryResultRow {
  id: string;
  accion: string;
  descripcion: string | null;
  entidad: string;
  entidad_id: string | null;
}

interface CountRow extends QueryResultRow {
  total: number;
}

export interface SmokePurgeSnapshot {
  officialLoad: LoadRow;
  officialReferenceCount: number;
  officialReferences: OfficialReferenceRow[];
  smokeAuditEvents: AuditEventRow[];
  smokeFinalCount: number;
  smokeInstitucionHistoryCount: number;
  smokeLegacyAuditCount: number;
  smokeLegacyHistoryCount: number;
  smokeLoad: LoadRow;
  smokeNovedadesCount: number;
  smokePrelimCount: number;
  smokeSedeHistoryCount: number;
  smokeSedeInstitucionHistoryCount: number;
  smokeSystemAlertCount: number;
  smokeVigencias: VigenciaRow[];
}

export interface ValorAnteriorRepairPlanItem {
  newValorAnteriorId: string | null;
  officialVigenciaId: string;
  previousSmokeVigenciaId: string;
}

export interface SmokePurgePlan {
  detachedHistoryRefs: {
    instituciones: number;
    sedeInstitucion: number;
    sedes: number;
  };
  repairPlan: ValorAnteriorRepairPlanItem[];
  smokePrelimCount: number;
  smokeVigenciaCount: number;
}

export interface SmokePurgeProtectionInput {
  apply: boolean;
  confirm?: string | null;
  contractId?: string | null;
  loadId?: string | null;
  officialLoadId?: string | null;
}

export interface PurgeTechnicalSmokeFocalizacionInput {
  actorUserId: string;
  contractId: number;
  loadId: number;
  officialLoadId: number;
}

export interface SmokePurgeResult {
  deleted: {
    cargas: number;
    preliminares: number;
    vigencias: number;
  };
  detachedHistory: {
    instituciones: number;
    sedeInstitucion: number;
    sedes: number;
  };
  officialLoadId: number;
  repairedValorAnterior: ValorAnteriorRepairPlanItem[];
  snapshot: SmokePurgeSnapshot;
}

interface PostPurgeCheckRow extends QueryResultRow {
  cargas_oficial: number;
  duplicados_final: number;
  duplicados_vigencia: number;
  finales: number;
  finales_huerfanos: number;
  finales_oficial: number;
  instituciones: number;
  mismatched_valor_anterior: number;
  preliminares_oficial: number;
  reglas_faltantes: number;
  sedes: number;
  sede_modalidades: number;
  valor_anterior_rotos: number;
  vigencias_huerfanas: number;
  vigencias_oficial: number;
}

const TECHNICAL_SMOKE_FILE_PATTERN = /(smoke|test)/i;
const ALLOWED_SMOKE_AUDIT_ACTIONS = new Set([
  'focalizacion.import.reprocess',
  'focalizacion.import.upload',
]);

const toNumber = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined || value === '') {
    throw new AppError('Invalid numeric value returned by database', 500, 'INVALID_NUMERIC_VALUE');
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new AppError('Invalid numeric value returned by database', 500, 'INVALID_NUMERIC_VALUE');
  }

  return parsed;
};

const getSingleCount = async (client: PoolClient, sql: string, params: unknown[]): Promise<number> => {
  const result = await client.query<CountRow>(sql, params);
  return result.rows[0]?.total ?? 0;
};

const expectSingleRow = <T>(rows: T[], code: string, message: string): T => {
  const row = rows[0];
  if (!row) {
    throw new AppError(message, 404, code);
  }
  return row;
};

const sanitizeLoadForAudit = (load: LoadRow) => ({
  activo: load.activo,
  archivo_bytes_len: load.archivo_bytes_len,
  archivo_sha256: load.archivo_sha256,
  contrato_id: load.contrato_id,
  created_at: load.created_at.toISOString(),
  created_by: load.created_by,
  estado: load.estado,
  fecha_fin_vigencia: load.fecha_fin_vigencia,
  fecha_inicio_vigencia: load.fecha_inicio_vigencia,
  id: load.id,
  nombre_archivo: load.nombre_archivo,
  storage_bucket: load.storage_bucket,
  storage_path: load.storage_path,
  usuario_carga_id: load.usuario_carga_id,
});

const buildValorAnteriorRepairPlan = (
  smokeVigencias: VigenciaRow[],
  officialReferences: OfficialReferenceRow[],
): ValorAnteriorRepairPlanItem[] => {
  const smokeMap = new Map(smokeVigencias.map((row) => [row.id, row]));
  const seenOfficials = new Set<string>();

  return officialReferences.map((reference) => {
    if (seenOfficials.has(reference.oficial_vigencia_id)) {
      throw new AppError(
        'Duplicate official reference detected while repairing valor_anterior_id.',
        409,
        'SMOKE_PURGE_DUPLICATE_OFFICIAL_REFERENCE',
        { oficial_vigencia_id: reference.oficial_vigencia_id },
      );
    }
    seenOfficials.add(reference.oficial_vigencia_id);

    const smoke = smokeMap.get(reference.previous_smoke_vigencia_id);
    if (!smoke) {
      throw new AppError(
        'Smoke vigencia referenced by official history chain is missing.',
        409,
        'SMOKE_PURGE_MISSING_SMOKE_PREDECESSOR',
        reference,
      );
    }

    return {
      newValorAnteriorId: smoke.valor_anterior_id,
      officialVigenciaId: reference.oficial_vigencia_id,
      previousSmokeVigenciaId: reference.previous_smoke_vigencia_id,
    };
  });
};

export const validateSmokePurgeProtection = (input: SmokePurgeProtectionInput): void => {
  if (!input.apply) {
    return;
  }

  if (!input.contractId || !/^\d+$/.test(input.contractId)) {
    throw new AppError(
      'Smoke purge requires --contract-id=<numero>.',
      400,
      'SMOKE_PURGE_CONTRACT_ID_REQUIRED',
    );
  }

  if (!input.loadId || !/^\d+$/.test(input.loadId)) {
    throw new AppError(
      'Smoke purge requires --load-id=<numero>.',
      400,
      'SMOKE_PURGE_LOAD_ID_REQUIRED',
    );
  }

  if (!input.officialLoadId || !/^\d+$/.test(input.officialLoadId)) {
    throw new AppError(
      'Smoke purge requires --official-load-id=<numero>.',
      400,
      'SMOKE_PURGE_OFFICIAL_LOAD_ID_REQUIRED',
    );
  }

  if (input.loadId === input.officialLoadId) {
    throw new AppError(
      'Smoke purge refuses to target the same load as official-load-id.',
      400,
      'SMOKE_PURGE_OFFICIAL_LOAD_PROTECTED',
    );
  }

  if (input.confirm !== SMOKE_PURGE_CONFIRMATION) {
    throw new AppError(
      `Smoke purge requires --confirm=${SMOKE_PURGE_CONFIRMATION}.`,
      400,
      'SMOKE_PURGE_CONFIRMATION_REQUIRED',
    );
  }
};

export const assertTechnicalSmokeSnapshot = (snapshot: SmokePurgeSnapshot): SmokePurgePlan => {
  if (snapshot.smokeLoad.id === snapshot.officialLoad.id) {
    throw new AppError(
      'Smoke load and official load cannot be the same.',
      400,
      'SMOKE_PURGE_OFFICIAL_LOAD_PROTECTED',
    );
  }

  if (snapshot.smokeLoad.contrato_id !== snapshot.officialLoad.contrato_id) {
    throw new AppError(
      'Smoke load and official load belong to different contracts.',
      409,
      'SMOKE_PURGE_CONTRACT_MISMATCH',
      {
        official_contrato_id: snapshot.officialLoad.contrato_id,
        smoke_contrato_id: snapshot.smokeLoad.contrato_id,
      },
    );
  }

  if (!TECHNICAL_SMOKE_FILE_PATTERN.test(snapshot.smokeLoad.nombre_archivo)) {
    throw new AppError(
      'The target load does not look like a technical smoke/test load.',
      409,
      'SMOKE_PURGE_NOT_TECHNICAL_LOAD',
      { nombre_archivo: snapshot.smokeLoad.nombre_archivo },
    );
  }

  if (
    snapshot.smokeLoad.archivo_sha256 &&
    snapshot.officialLoad.archivo_sha256 &&
    snapshot.smokeLoad.archivo_sha256 === snapshot.officialLoad.archivo_sha256
  ) {
    throw new AppError(
      'The target smoke load shares the same SHA-256 as the official load.',
      409,
      'SMOKE_PURGE_SHA_COLLISION',
      {
        archivo_sha256: snapshot.smokeLoad.archivo_sha256,
      },
    );
  }

  if (snapshot.smokeFinalCount !== 0) {
    throw new AppError(
      'Smoke purge aborts because the target load still owns focalizacion_final rows.',
      409,
      'SMOKE_PURGE_FINAL_ROWS_PRESENT',
      { smoke_finales: snapshot.smokeFinalCount },
    );
  }

  if (snapshot.smokeNovedadesCount !== 0) {
    throw new AppError(
      'Smoke purge aborts because the target load has focalizacion_novedades rows.',
      409,
      'SMOKE_PURGE_NOVEDADES_PRESENT',
      { smoke_novedades: snapshot.smokeNovedadesCount },
    );
  }

  if (snapshot.smokeSystemAlertCount !== 0) {
    throw new AppError(
      'Smoke purge aborts because the target load has system alerts tied to smoke vigencias.',
      409,
      'SMOKE_PURGE_ALERTAS_PRESENT',
      { smoke_alertas: snapshot.smokeSystemAlertCount },
    );
  }

  if (snapshot.smokeInstitucionHistoryCount !== 0 || snapshot.smokeSedeInstitucionHistoryCount !== 0) {
    throw new AppError(
      'Smoke purge aborts because the target load created master-history references beyond sedes_identidad_historial.',
      409,
      'SMOKE_PURGE_MASTER_HISTORY_UNEXPECTED',
      {
        institucion_historial: snapshot.smokeInstitucionHistoryCount,
        sede_institucion_historial: snapshot.smokeSedeInstitucionHistoryCount,
      },
    );
  }

  if (snapshot.smokePrelimCount !== snapshot.smokeVigencias.length) {
    throw new AppError(
      'Smoke purge aborts because preliminar/vigencias counts are inconsistent.',
      409,
      'SMOKE_PURGE_PRELIM_VIGENCIA_MISMATCH',
      {
        smoke_preliminares: snapshot.smokePrelimCount,
        smoke_vigencias: snapshot.smokeVigencias.length,
      },
    );
  }

  for (const event of snapshot.smokeAuditEvents) {
    if (!ALLOWED_SMOKE_AUDIT_ACTIONS.has(event.accion)) {
      throw new AppError(
        'Smoke purge aborts because the target load contains non-technical audit actions.',
        409,
        'SMOKE_PURGE_UNEXPECTED_AUDIT_ACTIVITY',
        event,
      );
    }
  }

  for (const reference of snapshot.officialReferences) {
    if (reference.oficial_carga_id !== snapshot.officialLoad.id) {
      throw new AppError(
        'Smoke purge aborts because valor_anterior_id is referenced by a non-official load.',
        409,
        'SMOKE_PURGE_OFFICIAL_REFERENCE_MISMATCH',
        reference,
      );
    }
  }

  return {
    detachedHistoryRefs: {
      instituciones: snapshot.smokeInstitucionHistoryCount,
      sedeInstitucion: snapshot.smokeSedeInstitucionHistoryCount,
      sedes: snapshot.smokeSedeHistoryCount,
    },
    repairPlan: buildValorAnteriorRepairPlan(snapshot.smokeVigencias, snapshot.officialReferences),
    smokePrelimCount: snapshot.smokePrelimCount,
    smokeVigenciaCount: snapshot.smokeVigencias.length,
  };
};

const loadSnapshot = async (
  client: PoolClient,
  input: PurgeTechnicalSmokeFocalizacionInput,
): Promise<SmokePurgeSnapshot> => {
  const smokeLoadResult = await client.query<LoadRow>(
    `
      SELECT
        id::text AS id,
        contrato_id::text AS contrato_id,
        nombre_archivo,
        archivo_sha256,
        fecha_inicio_vigencia::text AS fecha_inicio_vigencia,
        fecha_fin_vigencia::text AS fecha_fin_vigencia,
        estado,
        activo,
        created_by::text AS created_by,
        usuario_carga_id::text AS usuario_carga_id,
        storage_bucket,
        storage_path,
        octet_length(archivo_bytes)::int AS archivo_bytes_len,
        created_at
      FROM focalizacion_cargas
      WHERE id = $1::bigint
        AND contrato_id = $2::bigint
      FOR UPDATE
    `,
    [input.loadId, input.contractId],
  );
  const officialLoadResult = await client.query<LoadRow>(
    `
      SELECT
        id::text AS id,
        contrato_id::text AS contrato_id,
        nombre_archivo,
        archivo_sha256,
        fecha_inicio_vigencia::text AS fecha_inicio_vigencia,
        fecha_fin_vigencia::text AS fecha_fin_vigencia,
        estado,
        activo,
        created_by::text AS created_by,
        usuario_carga_id::text AS usuario_carga_id,
        storage_bucket,
        storage_path,
        octet_length(archivo_bytes)::int AS archivo_bytes_len,
        created_at
      FROM focalizacion_cargas
      WHERE id = $1::bigint
        AND contrato_id = $2::bigint
      FOR UPDATE
    `,
    [input.officialLoadId, input.contractId],
  );

  const smokeLoad = expectSingleRow(
    smokeLoadResult.rows,
    'SMOKE_PURGE_LOAD_NOT_FOUND',
    'Smoke load not found for the requested contract.',
  );
  const officialLoad = expectSingleRow(
    officialLoadResult.rows,
    'SMOKE_PURGE_OFFICIAL_LOAD_NOT_FOUND',
    'Official load not found for the requested contract.',
  );

  const smokeVigenciasResult = await client.query<VigenciaRow>(
    `
      SELECT
        id::text AS id,
        preliminar_id::text AS preliminar_id,
        valor_anterior_id::text AS valor_anterior_id
      FROM focalizacion_vigencias
      WHERE carga_id = $1::bigint
      ORDER BY id
      FOR UPDATE
    `,
    [input.loadId],
  );

  const officialReferencesResult = await client.query<OfficialReferenceRow>(
    `
      SELECT
        fv.id::text AS oficial_vigencia_id,
        fv.carga_id::text AS oficial_carga_id,
        fv.valor_anterior_id::text AS previous_smoke_vigencia_id
      FROM focalizacion_vigencias fv
      WHERE fv.valor_anterior_id IN (
        SELECT id
        FROM focalizacion_vigencias
        WHERE carga_id = $1::bigint
      )
      ORDER BY fv.id
      FOR UPDATE
    `,
    [input.loadId],
  );

  const smokeAuditEventsResult = await client.query<AuditEventRow>(
    `
      SELECT
        id::text AS id,
        accion,
        descripcion,
        entidad,
        entidad_id
      FROM auditoria_eventos
      WHERE (entidad = 'focalizacion_cargas' AND entidad_id = $1::text)
         OR (
           entidad = 'focalizacion_vigencias'
           AND entidad_id IN (
             SELECT id::text
             FROM focalizacion_vigencias
             WHERE carga_id = $2::bigint
           )
         )
      ORDER BY id
    `,
    [String(input.loadId), input.loadId],
  );

  return {
    officialLoad,
    officialReferenceCount: officialReferencesResult.rowCount ?? 0,
    officialReferences: officialReferencesResult.rows,
    smokeAuditEvents: smokeAuditEventsResult.rows,
    smokeFinalCount: await getSingleCount(
      client,
      `SELECT COUNT(*)::int AS total FROM focalizacion_final WHERE carga_id = $1::bigint`,
      [input.loadId],
    ),
    smokeInstitucionHistoryCount: await getSingleCount(
      client,
      `SELECT COUNT(*)::int AS total FROM instituciones_identidad_historial WHERE archivo_origen_id = $1::bigint`,
      [input.loadId],
    ),
    smokeLegacyAuditCount: await getSingleCount(
      client,
      `SELECT COUNT(*)::int AS total FROM auditoria WHERE tabla_afectada = 'focalizacion_cargas' AND registro_id = $1::bigint`,
      [input.loadId],
    ),
    smokeLegacyHistoryCount: await getSingleCount(
      client,
      `SELECT COUNT(*)::int AS total FROM historial_cambios WHERE tabla_afectada = 'focalizacion_cargas' AND registro_id = $1::bigint`,
      [input.loadId],
    ),
    smokeLoad,
    smokeNovedadesCount: await getSingleCount(
      client,
      `
        SELECT COUNT(*)::int AS total
        FROM focalizacion_novedades
        WHERE preliminar_id IN (
          SELECT id
          FROM focalizacion_preliminar
          WHERE carga_id = $1::bigint
        )
           OR focalizacion_final_id IN (
             SELECT id
             FROM focalizacion_final
             WHERE carga_id = $1::bigint
           )
      `,
      [input.loadId],
    ),
    smokePrelimCount: await getSingleCount(
      client,
      `SELECT COUNT(*)::int AS total FROM focalizacion_preliminar WHERE carga_id = $1::bigint`,
      [input.loadId],
    ),
    smokeSedeHistoryCount: await getSingleCount(
      client,
      `SELECT COUNT(*)::int AS total FROM sedes_identidad_historial WHERE archivo_origen_id = $1::bigint`,
      [input.loadId],
    ),
    smokeSedeInstitucionHistoryCount: await getSingleCount(
      client,
      `SELECT COUNT(*)::int AS total FROM sede_institucion_historial WHERE archivo_origen_id = $1::bigint`,
      [input.loadId],
    ),
    smokeSystemAlertCount: await getSingleCount(
      client,
      `
        SELECT COUNT(*)::int AS total
        FROM alertas_sistema
        WHERE referencia_tabla = 'focalizacion_vigencias'
          AND referencia_id IN (
            SELECT id
            FROM focalizacion_vigencias
            WHERE carga_id = $1::bigint
          )
      `,
      [input.loadId],
    ),
    smokeVigencias: smokeVigenciasResult.rows,
  };
};

const loadPostPurgeChecks = async (
  client: PoolClient,
  input: PurgeTechnicalSmokeFocalizacionInput,
  smokeVigenciaIds: number[],
): Promise<PostPurgeCheckRow> => {
  const result = await client.query<PostPurgeCheckRow>(
    `
      SELECT
        (SELECT COUNT(*)::int FROM focalizacion_cargas WHERE id = $2::bigint) AS cargas_oficial,
        (SELECT COUNT(*)::int FROM focalizacion_preliminar WHERE carga_id = $2::bigint) AS preliminares_oficial,
        (SELECT COUNT(*)::int FROM focalizacion_vigencias WHERE carga_id = $2::bigint) AS vigencias_oficial,
        (SELECT COUNT(*)::int FROM focalizacion_final WHERE carga_id = $2::bigint) AS finales_oficial,
        (SELECT COUNT(*)::int FROM focalizacion_final WHERE contrato_id = $1::bigint) AS finales,
        (SELECT COUNT(*)::int FROM instituciones WHERE contrato_id = $1::bigint) AS instituciones,
        (SELECT COUNT(*)::int FROM sedes s JOIN instituciones i ON i.id = s.institucion_id WHERE i.contrato_id = $1::bigint) AS sedes,
        (SELECT COUNT(*)::int FROM sede_modalidades WHERE contrato_id = $1::bigint) AS sede_modalidades,
        (
          SELECT COUNT(*)::int
          FROM (
            SELECT contrato_id, sede_id, modalidad_id, vigente_desde, COUNT(*)
            FROM focalizacion_vigencias
            WHERE contrato_id = $1::bigint
            GROUP BY 1, 2, 3, 4
            HAVING COUNT(*) > 1
          ) duplicates
        ) AS duplicados_vigencia,
        (
          SELECT COUNT(*)::int
          FROM (
            SELECT contrato_id, sede_modalidad_id, COUNT(*)
            FROM focalizacion_final
            WHERE contrato_id = $1::bigint
            GROUP BY 1, 2
            HAVING COUNT(*) > 1
          ) duplicates
        ) AS duplicados_final,
        (
          SELECT COUNT(*)::int
          FROM focalizacion_vigencias fv
          LEFT JOIN sedes s ON s.id = fv.sede_id
          LEFT JOIN modalidades m ON m.id = fv.modalidad_id
          LEFT JOIN instituciones i ON i.id = fv.institucion_id
          WHERE fv.contrato_id = $1::bigint
            AND (s.id IS NULL OR m.id IS NULL OR i.id IS NULL)
        ) AS vigencias_huerfanas,
        (
          SELECT COUNT(*)::int
          FROM focalizacion_final ff
          LEFT JOIN sede_modalidades sm ON sm.id = ff.sede_modalidad_id
          LEFT JOIN sedes s ON s.id = ff.sede_id
          LEFT JOIN modalidades m ON m.id = ff.modalidad_id
          WHERE ff.contrato_id = $1::bigint
            AND (sm.id IS NULL OR s.id IS NULL OR m.id IS NULL)
        ) AS finales_huerfanos,
        (SELECT COUNT(*)::int FROM focalizacion_vigencias WHERE contrato_id = $1::bigint AND regla_config_id IS NULL) AS reglas_faltantes,
        (
          SELECT COUNT(*)::int
          FROM focalizacion_vigencias
          WHERE contrato_id = $1::bigint
            AND valor_anterior_id IS NOT NULL
            AND valor_anterior_id NOT IN (SELECT id FROM focalizacion_vigencias)
        ) AS valor_anterior_rotos,
        (
          SELECT COUNT(*)::int
          FROM focalizacion_vigencias
          WHERE carga_id = $2::bigint
            AND valor_anterior_id = ANY($3::bigint[])
        ) AS mismatched_valor_anterior
    `,
    [input.contractId, input.officialLoadId, smokeVigenciaIds],
  );

  return expectSingleRow(
    result.rows,
    'SMOKE_PURGE_POSTCHECK_FAILED',
    'Post-purge checks could not be loaded.',
  );
};

export const runSmokePurgeTransaction = async <T>(
  client: { query: (sql: string) => Promise<unknown> },
  work: () => Promise<T>,
): Promise<T> => {
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

  try {
    const result = await work();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
};

export const purgeTechnicalSmokeFocalizacionLoad = async (
  input: PurgeTechnicalSmokeFocalizacionInput,
): Promise<SmokePurgeResult> => {
  const client = await dbPool.connect();

  try {
    return await runSmokePurgeTransaction(client, async () => {
      const snapshot = await loadSnapshot(client, input);
      const plan = assertTechnicalSmokeSnapshot(snapshot);
      const smokeVigenciaIds = snapshot.smokeVigencias.map((row) => Number(row.id));

      const repaired = await client.query<QueryResultRow>(
        `
          WITH smoke AS (
            SELECT id, valor_anterior_id
            FROM focalizacion_vigencias
            WHERE carga_id = $1::bigint
          )
          UPDATE focalizacion_vigencias AS official
          SET valor_anterior_id = smoke.valor_anterior_id,
              updated_at = NOW()
          FROM smoke
          WHERE official.valor_anterior_id = smoke.id
          RETURNING official.id::text AS official_vigencia_id,
                    smoke.id::text AS previous_smoke_vigencia_id,
                    smoke.valor_anterior_id::text AS new_valor_anterior_id
        `,
        [input.loadId],
      );

      if ((repaired.rowCount ?? 0) !== plan.repairPlan.length) {
        throw new AppError(
          'Smoke purge aborted because not every valor_anterior_id could be repaired.',
          409,
          'SMOKE_PURGE_VALOR_ANTERIOR_REPAIR_MISMATCH',
          {
            expected: plan.repairPlan.length,
            actual: repaired.rowCount ?? 0,
          },
        );
      }

      await client.query(
        `
          UPDATE focalizacion_preliminar
          SET focalizacion_vigencia_id = NULL
          WHERE carga_id = $1::bigint
            AND focalizacion_vigencia_id IS NOT NULL
        `,
        [input.loadId],
      );
      await client.query(
        `
          UPDATE focalizacion_vigencias
          SET preliminar_id = NULL,
              updated_at = NOW()
          WHERE carga_id = $1::bigint
            AND preliminar_id IS NOT NULL
        `,
        [input.loadId],
      );

      const detachedInstituciones = await client.query(
        `UPDATE instituciones_identidad_historial SET archivo_origen_id = NULL WHERE archivo_origen_id = $1::bigint RETURNING id`,
        [input.loadId],
      );
      const detachedSedes = await client.query(
        `UPDATE sedes_identidad_historial SET archivo_origen_id = NULL WHERE archivo_origen_id = $1::bigint RETURNING id`,
        [input.loadId],
      );
      const detachedSedeInstitucion = await client.query(
        `UPDATE sede_institucion_historial SET archivo_origen_id = NULL WHERE archivo_origen_id = $1::bigint RETURNING id`,
        [input.loadId],
      );

      const deletedPreliminares = await client.query(
        `DELETE FROM focalizacion_preliminar WHERE carga_id = $1::bigint RETURNING id`,
        [input.loadId],
      );
      const deletedVigencias = await client.query(
        `DELETE FROM focalizacion_vigencias WHERE carga_id = $1::bigint RETURNING id`,
        [input.loadId],
      );
      const deletedCargas = await client.query(
        `DELETE FROM focalizacion_cargas WHERE id = $1::bigint RETURNING id`,
        [input.loadId],
      );

      if ((deletedPreliminares.rowCount ?? 0) !== plan.smokePrelimCount) {
        throw new AppError(
          'Smoke purge aborted because preliminar deletion count does not match the audited smoke load.',
          409,
          'SMOKE_PURGE_PRELIMINAR_DELETE_MISMATCH',
          {
            actual: deletedPreliminares.rowCount ?? 0,
            expected: plan.smokePrelimCount,
          },
        );
      }

      if ((deletedVigencias.rowCount ?? 0) !== plan.smokeVigenciaCount) {
        throw new AppError(
          'Smoke purge aborted because vigencia deletion count does not match the audited smoke load.',
          409,
          'SMOKE_PURGE_VIGENCIA_DELETE_MISMATCH',
          {
            actual: deletedVigencias.rowCount ?? 0,
            expected: plan.smokeVigenciaCount,
          },
        );
      }

      if ((deletedCargas.rowCount ?? 0) !== 1) {
        throw new AppError(
          'Smoke purge aborted because the target load row could not be deleted.',
          409,
          'SMOKE_PURGE_CARGA_DELETE_MISMATCH',
          { actual: deletedCargas.rowCount ?? 0 },
        );
      }

      const postcheck = await loadPostPurgeChecks(client, input, smokeVigenciaIds);
      if (
        postcheck.cargas_oficial !== 1 ||
        postcheck.preliminares_oficial !== 687 ||
        postcheck.vigencias_oficial !== 687 ||
        postcheck.finales_oficial !== 687 ||
        postcheck.finales !== 687 ||
        postcheck.instituciones !== 111 ||
        postcheck.sedes !== 605 ||
        postcheck.sede_modalidades !== 687 ||
        postcheck.duplicados_vigencia !== 0 ||
        postcheck.duplicados_final !== 0 ||
        postcheck.vigencias_huerfanas !== 0 ||
        postcheck.finales_huerfanos !== 0 ||
        postcheck.reglas_faltantes !== 0 ||
        postcheck.valor_anterior_rotos !== 0 ||
        postcheck.mismatched_valor_anterior !== 0
      ) {
        throw new AppError(
          'Smoke purge postcheck failed; transaction will be rolled back.',
          409,
          'SMOKE_PURGE_POSTCHECK_MISMATCH',
          postcheck,
        );
      }

      await registerAuditEntry({
        accion: 'focalizacion.smoke.purge',
        after: {
          contract_id: input.contractId,
          deleted: {
            cargas: deletedCargas.rowCount ?? 0,
            preliminares: deletedPreliminares.rowCount ?? 0,
            vigencias: deletedVigencias.rowCount ?? 0,
          },
          detached_history: {
            instituciones: detachedInstituciones.rowCount ?? 0,
            sede_institucion: detachedSedeInstitucion.rowCount ?? 0,
            sedes: detachedSedes.rowCount ?? 0,
          },
          official_load_id: input.officialLoadId,
          repaired_valor_anterior: repaired.rows,
        },
        before: {
          legacy_auditoria: snapshot.smokeLegacyAuditCount,
          legacy_historial: snapshot.smokeLegacyHistoryCount,
          official_load: sanitizeLoadForAudit(snapshot.officialLoad),
          official_references: snapshot.officialReferences,
          smoke_audit_events: snapshot.smokeAuditEvents,
          smoke_load: sanitizeLoadForAudit(snapshot.smokeLoad),
          smoke_vigencias: snapshot.smokeVigencias,
        },
        client,
        descripcion: `Purga tecnica de smoke focalizacion ${input.loadId} preservando la carga oficial ${input.officialLoadId}`,
        registro_id: String(input.loadId),
        tabla: 'focalizacion_cargas',
        usuario_id: input.actorUserId,
      });

      return {
        deleted: {
          cargas: deletedCargas.rowCount ?? 0,
          preliminares: deletedPreliminares.rowCount ?? 0,
          vigencias: deletedVigencias.rowCount ?? 0,
        },
        detachedHistory: {
          instituciones: detachedInstituciones.rowCount ?? 0,
          sedeInstitucion: detachedSedeInstitucion.rowCount ?? 0,
          sedes: detachedSedes.rowCount ?? 0,
        },
        officialLoadId: input.officialLoadId,
        repairedValorAnterior: repaired.rows.map((row) => ({
          newValorAnteriorId: (row.new_valor_anterior_id as string | null) ?? null,
          officialVigenciaId: String(row.official_vigencia_id),
          previousSmokeVigenciaId: String(row.previous_smoke_vigencia_id),
        })),
        snapshot,
      };
    });
  } finally {
    client.release();
  }
};
