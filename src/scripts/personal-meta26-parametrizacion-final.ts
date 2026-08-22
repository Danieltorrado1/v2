import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { PoolClient, QueryResultRow } from 'pg';

import { dbPool } from '../config/db';
import { registerAuditEntry } from '../modules/auditoria/auditoria.helper';

const TARGET_CONTRACT_ID = 24;
const TARGET_COMPANY_ID = 15;
const MIGRATION_FILE = 'sql/phase-23-2-vinculacion-condiciones-economicas.sql';
const REPORT_JSON = 'reports/personal-meta26-parametrizacion-final.json';
const PPT_CODE = 'PPT';
const PPT_NAME = 'PERMISO POR PROTECCIÓN TEMPORAL';
const TARGET_LOCATIONS = ['SERVICIOS GENERALES', 'SST'] as const;
const SCHEMA_AUDIT_RECORD_ID = 'schema_meta26_vinculacion_condiciones_economicas_20260822';

interface ExistsRow extends QueryResultRow {
  exists: boolean;
}

interface CountRow extends QueryResultRow {
  total: number;
}

interface IdRow extends QueryResultRow {
  id: number;
}

interface ColumnMetaRow extends QueryResultRow {
  column_default: string | null;
  column_name: string;
  is_nullable: 'YES' | 'NO';
}

interface NameRow extends QueryResultRow {
  name: string;
}

interface AuditCounts {
  auditoria: number;
  auditoria_eventos: number;
  historial_cambios: number;
}

interface EconomicSchemaState {
  columns: string[];
  constraints: string[];
  extension_ready: boolean;
  exists: boolean;
  indexes: string[];
  orphans: number;
  overlaps: number;
  ready: boolean;
}

interface ParamActionResult {
  action: 'created' | 'reactivated' | 'reused' | 'updated';
  id: number;
  label: string;
}

const ECONOMIC_COLUMNS = [
  'id',
  'vinculacion_id',
  'tipo_condicion',
  'valor',
  'vigencia_desde',
  'vigencia_hasta',
  'motivo',
  'activo',
  'created_at',
  'created_by',
  'updated_at',
  'updated_by',
] as const;

const ECONOMIC_CONSTRAINTS = [
  'chk_vinculacion_condicion_tipo_no_vacio',
  'chk_vinculacion_condicion_valor_no_negativo',
  'chk_vinculacion_condicion_motivo_no_vacio',
  'chk_vinculacion_condicion_vigencia',
  'ex_vinculacion_condicion_economica_sin_solape',
] as const;

const ECONOMIC_INDEXES = [
  'idx_vinculacion_condiciones_economicas_consulta',
] as const;

const normalizeText = (value: unknown): string => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toUpperCase();

const queryRows = async <T extends QueryResultRow>(client: PoolClient, sql: string, params: unknown[] = []): Promise<T[]> =>
  (await client.query<T>(sql, params)).rows;

const queryOne = async <T extends QueryResultRow>(client: PoolClient, sql: string, params: unknown[] = []): Promise<T | null> => {
  const rows = await queryRows<T>(client, sql, params);
  return rows[0] ?? null;
};

const tableExists = async (client: PoolClient, tableName: string): Promise<boolean> => {
  const row = await queryOne<ExistsRow>(
    client,
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
      ) AS exists
    `,
    [tableName],
  );
  return row?.exists ?? false;
};

const countRows = async (client: PoolClient, tableName: string): Promise<number> => {
  const exists = await tableExists(client, tableName);
  if (!exists) {
    return 0;
  }
  const row = await queryOne<CountRow>(client, `SELECT COUNT(*)::int AS total FROM ${tableName}`);
  return row?.total ?? 0;
};

const getAuditCounts = async (client: PoolClient): Promise<AuditCounts> => ({
  auditoria: await countRows(client, 'auditoria'),
  auditoria_eventos: await countRows(client, 'auditoria_eventos'),
  historial_cambios: await countRows(client, 'historial_cambios'),
});

const getActorUserId = async (client: PoolClient): Promise<string> => {
  const row = await queryOne<{ id: string }>(
    client,
    `
      SELECT id::text AS id
      FROM usuarios
      ORDER BY id ASC
      LIMIT 1
    `,
  );

  if (!row?.id) {
    throw new Error('ACTOR_USER_ID_NOT_FOUND');
  }

  return row.id;
};

const getEconomicSchemaState = async (client: PoolClient): Promise<EconomicSchemaState> => {
  const exists = await tableExists(client, 'vinculacion_condiciones_economicas');
  const extension = await queryOne<NameRow>(
    client,
    `
      SELECT extname AS name
      FROM pg_extension
      WHERE extname = 'btree_gist'
      LIMIT 1
    `,
  );

  if (!exists) {
    return {
      columns: [],
      constraints: [],
      extension_ready: Boolean(extension?.name),
      exists: false,
      indexes: [],
      orphans: 0,
      overlaps: 0,
      ready: false,
    };
  }

  const columns = (await queryRows<NameRow>(
    client,
    `
      SELECT column_name AS name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'vinculacion_condiciones_economicas'
      ORDER BY ordinal_position ASC
    `,
  )).map((row) => row.name);

  const constraints = (await queryRows<NameRow>(
    client,
    `
      SELECT con.conname AS name
      FROM pg_constraint con
      INNER JOIN pg_class rel ON rel.oid = con.conrelid
      INNER JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE nsp.nspname = 'public'
        AND rel.relname = 'vinculacion_condiciones_economicas'
      ORDER BY con.conname ASC
    `,
  )).map((row) => row.name);

  const indexes = (await queryRows<NameRow>(
    client,
    `
      SELECT indexname AS name
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'vinculacion_condiciones_economicas'
      ORDER BY indexname ASC
    `,
  )).map((row) => row.name);

  const orphanRow = await queryOne<CountRow>(
    client,
    `
      SELECT COUNT(*)::int AS total
      FROM vinculacion_condiciones_economicas vce
      LEFT JOIN vinculaciones v ON v.id = vce.vinculacion_id
      WHERE v.id IS NULL
    `,
  );

  const overlapRow = await queryOne<CountRow>(
    client,
    `
      SELECT COUNT(*)::int AS total
      FROM vinculacion_condiciones_economicas a
      INNER JOIN vinculacion_condiciones_economicas b
        ON a.id < b.id
       AND a.activo = TRUE
       AND b.activo = TRUE
       AND a.vinculacion_id = b.vinculacion_id
       AND LOWER(BTRIM(a.tipo_condicion)) = LOWER(BTRIM(b.tipo_condicion))
       AND DATERANGE(a.vigencia_desde, COALESCE(a.vigencia_hasta, 'infinity'::date), '[]')
           && DATERANGE(b.vigencia_desde, COALESCE(b.vigencia_hasta, 'infinity'::date), '[]')
    `,
  );

  const ready =
    Boolean(extension?.name) &&
    ECONOMIC_COLUMNS.every((name) => columns.includes(name)) &&
    ECONOMIC_CONSTRAINTS.every((name) => constraints.includes(name)) &&
    ECONOMIC_INDEXES.every((name) => indexes.includes(name)) &&
    (orphanRow?.total ?? 0) === 0 &&
    (overlapRow?.total ?? 0) === 0;

  return {
    columns,
    constraints,
    extension_ready: Boolean(extension?.name),
    exists,
    indexes,
    orphans: orphanRow?.total ?? 0,
    overlaps: overlapRow?.total ?? 0,
    ready,
  };
};

const loadTableColumns = async (client: PoolClient, tableName: string): Promise<ColumnMetaRow[]> =>
  queryRows<ColumnMetaRow>(
    client,
    `
      SELECT column_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position ASC
    `,
    [tableName],
  );

const ensurePptDocumentType = async (client: PoolClient, actorUserId: string): Promise<ParamActionResult> => {
  const allRows = await queryRows<QueryResultRow>(
    client,
    `
      SELECT *
      FROM tipos_documentos
      ORDER BY id ASC
    `,
  );

  const current = allRows.find((row) =>
    normalizeText(row.codigo) === PPT_CODE || normalizeText(row.nombre_documento) === normalizeText(PPT_NAME),
  ) ?? null;

  if (current) {
    const updates: string[] = [];
    const params: unknown[] = [current.id];
    let position = params.length;

    if (String(current.codigo ?? '') !== PPT_CODE) {
      position += 1;
      params.push(PPT_CODE);
      updates.push(`codigo = $${position}`);
    }
    if (String(current.nombre_documento ?? '') !== PPT_NAME) {
      position += 1;
      params.push(PPT_NAME);
      updates.push(`nombre_documento = $${position}`);
    }
    if (Object.prototype.hasOwnProperty.call(current, 'es_identificacion_personal') && current.es_identificacion_personal !== true) {
      position += 1;
      params.push(true);
      updates.push(`es_identificacion_personal = $${position}`);
    }
    if (Object.prototype.hasOwnProperty.call(current, 'activo') && current.activo !== true) {
      position += 1;
      params.push(true);
      updates.push(`activo = $${position}`);
    }
    if (Object.prototype.hasOwnProperty.call(current, 'updated_at')) {
      updates.push('updated_at = NOW()');
    }

    if (updates.length === 0) {
      return { action: 'reused', id: Number(current.id), label: PPT_NAME };
    }

    const updated = await queryOne<QueryResultRow>(
      client,
      `
        UPDATE tipos_documentos
        SET ${updates.join(', ')}
        WHERE id = $1::bigint
        RETURNING id, codigo, nombre_documento, es_identificacion_personal
      `,
      params,
    );

    if (!updated) {
      throw new Error('PPT_UPDATE_FAILED');
    }

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'UPDATE',
      tabla: 'tipos_documentos',
      registro_id: String(updated.id),
      descripcion: 'Parametrizacion de tipo documental PPT para Personal META-26',
      before: current,
      after: {
        ...updated,
        contrato_id: TARGET_CONTRACT_ID,
        empresa_id: TARGET_COMPANY_ID,
      },
    });

    return { action: 'updated', id: Number(updated.id), label: String(updated.nombre_documento ?? PPT_NAME) };
  }

  const columns = await loadTableColumns(client, 'tipos_documentos');
  const template = await queryOne<QueryResultRow>(
    client,
    `
      SELECT *
      FROM tipos_documentos
      WHERE COALESCE(es_identificacion_personal, FALSE) = TRUE
      ORDER BY CASE WHEN UPPER(COALESCE(codigo, '')) IN ('CEDULA', 'CC') THEN 0 ELSE 1 END, id ASC
      LIMIT 1
    `,
  );

  if (!template) {
    throw new Error('PPT_TEMPLATE_NOT_FOUND');
  }

  const explicitValues = new Map<string, unknown>([
    ['codigo', PPT_CODE],
    ['nombre_documento', PPT_NAME],
    ['es_identificacion_personal', true],
    ['requiere_fecha_expedicion', false],
    ['requiere_fecha_vencimiento', false],
    ['tiene_vencimiento', false],
    ['vigencia_dias_default', null],
    ['requiere_revision', false],
    ['bloquea_creacion', false],
    ['bloquea_inicio', false],
    ['bloquea_ejecucion', false],
    ['bloquea_cierre', false],
    ['activo', true],
  ]);

  const payload = new Map<string, unknown>();
  for (const column of columns) {
    const name = column.column_name;
    if (['id', 'created_at', 'updated_at'].includes(name)) {
      continue;
    }
    if (explicitValues.has(name)) {
      payload.set(name, explicitValues.get(name));
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(template, name)) {
      payload.set(name, template[name]);
      continue;
    }
    if (column.column_default !== null) {
      continue;
    }
    if (column.is_nullable === 'YES') {
      payload.set(name, null);
      continue;
    }
    throw new Error(`PPT_COLUMN_VALUE_REQUIRED:${name}`);
  }

  const columnNames = [...payload.keys()];
  const values = [...payload.values()];
  const placeholders = columnNames.map((_, index) => `$${index + 1}`);
  const created = await queryOne<QueryResultRow>(
    client,
    `
      INSERT INTO tipos_documentos (${columnNames.join(', ')})
      VALUES (${placeholders.join(', ')})
      RETURNING id, codigo, nombre_documento, es_identificacion_personal
    `,
    values,
  );

  if (!created) {
    throw new Error('PPT_CREATE_FAILED');
  }

  await registerAuditEntry({
    client,
    usuario_id: actorUserId,
    accion: 'CREATE',
    tabla: 'tipos_documentos',
    registro_id: String(created.id),
    descripcion: 'Parametrizacion de tipo documental PPT para Personal META-26',
    before: null,
    after: {
      ...created,
      contrato_id: TARGET_CONTRACT_ID,
      empresa_id: TARGET_COMPANY_ID,
    },
  });

  return { action: 'created', id: Number(created.id), label: String(created.nombre_documento ?? PPT_NAME) };
};

const ensureContractLocation = async (
  client: PoolClient,
  actorUserId: string,
  name: typeof TARGET_LOCATIONS[number],
): Promise<ParamActionResult> => {
  const rows = await queryRows<QueryResultRow>(
    client,
    `
      SELECT *
      FROM contrato_ubicaciones_laborales
      WHERE contrato_id = $1::bigint
      ORDER BY COALESCE(activo, TRUE) DESC, id ASC
    `,
    [TARGET_CONTRACT_ID],
  );

  const current = rows.find((row) => normalizeText(row.nombre_ubicacion) === normalizeText(name)) ?? null;

  if (current && current.activo === true) {
    return { action: 'reused', id: Number(current.id), label: String(current.nombre_ubicacion ?? name) };
  }

  if (current) {
    const updated = await queryOne<QueryResultRow>(
      client,
      `
        UPDATE contrato_ubicaciones_laborales
        SET nombre_ubicacion = $2,
            activo = TRUE,
            updated_at = NOW()
        WHERE id = $1::bigint
        RETURNING id, contrato_id, nombre_ubicacion, descripcion, activo, created_at, updated_at
      `,
      [current.id, name],
    );

    if (!updated) {
      throw new Error(`LOCATION_REACTIVATE_FAILED:${name}`);
    }

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'UPDATE',
      tabla: 'contrato_ubicaciones_laborales',
      registro_id: String(updated.id),
      descripcion: `Reactivacion de ubicacion laboral ${name} para Personal META-26`,
      before: current,
      after: updated,
    });

    return { action: 'reactivated', id: Number(updated.id), label: String(updated.nombre_ubicacion ?? name) };
  }

  const created = await queryOne<QueryResultRow>(
    client,
    `
      INSERT INTO contrato_ubicaciones_laborales (
        contrato_id,
        nombre_ubicacion,
        descripcion,
        activo
      )
      VALUES ($1::bigint, $2, NULL, TRUE)
      RETURNING id, contrato_id, nombre_ubicacion, descripcion, activo, created_at, updated_at
    `,
    [TARGET_CONTRACT_ID, name],
  );

  if (!created) {
    throw new Error(`LOCATION_CREATE_FAILED:${name}`);
  }

  await registerAuditEntry({
    client,
    usuario_id: actorUserId,
    accion: 'CREATE',
    tabla: 'contrato_ubicaciones_laborales',
    registro_id: String(created.id),
    descripcion: `Creacion de ubicacion laboral ${name} para Personal META-26`,
    before: null,
    after: created,
  });

  return { action: 'created', id: Number(created.id), label: String(created.nombre_ubicacion ?? name) };
};

const main = async (): Promise<void> => {
  const migrationSql = await readFile(path.resolve(MIGRATION_FILE), 'utf8');
  const client = await dbPool.connect();

  try {
    const actorUserId = await getActorUserId(client);
    const auditBefore = await getAuditCounts(client);
    const economicBefore = await getEconomicSchemaState(client);

    await client.query('BEGIN');
    await client.query(`SET LOCAL statement_timeout = '120s'`);

    let migrationAction: 'applied' | 'reused' = 'reused';
    if (!economicBefore.ready) {
      await client.query(migrationSql);
      const economicAfterMigration = await getEconomicSchemaState(client);
      if (!economicAfterMigration.ready) {
        throw new Error('ECONOMIC_MIGRATION_POSTCHECK_FAILED');
      }
      migrationAction = 'applied';
      await registerAuditEntry({
        client,
        usuario_id: actorUserId,
        accion: economicBefore.exists ? 'SCHEMA_UPDATE' : 'SCHEMA_CREATE',
        tabla: 'vinculacion_condiciones_economicas',
        registro_id: SCHEMA_AUDIT_RECORD_ID,
        descripcion: 'Aplicacion idempotente de migracion de condiciones economicas para Personal META-26',
        before: {
          ...economicBefore,
          contrato_id: TARGET_CONTRACT_ID,
          empresa_id: TARGET_COMPANY_ID,
        },
        after: {
          ...economicAfterMigration,
          contrato_id: TARGET_CONTRACT_ID,
          empresa_id: TARGET_COMPANY_ID,
          migration_file: MIGRATION_FILE,
        },
      });
    }

    const ppt = await ensurePptDocumentType(client, actorUserId);
    const locations = [] as ParamActionResult[];
    for (const name of TARGET_LOCATIONS) {
      locations.push(await ensureContractLocation(client, actorUserId, name));
    }

    const economicAfter = await getEconomicSchemaState(client);
    if (!economicAfter.ready) {
      throw new Error('ECONOMIC_POSTCHECK_FAILED');
    }

    await client.query('COMMIT');

    const auditAfter = await getAuditCounts(client);
    const report = {
      actor_user_id: actorUserId,
      audit: {
        after: auditAfter,
        before: auditBefore,
        created: {
          auditoria: auditAfter.auditoria - auditBefore.auditoria,
          auditoria_eventos: auditAfter.auditoria_eventos - auditBefore.auditoria_eventos,
          historial_cambios: auditAfter.historial_cambios - auditBefore.historial_cambios,
        },
      },
      economic: {
        action: migrationAction,
        after: economicAfter,
        before: economicBefore,
        migration_file: path.resolve(MIGRATION_FILE),
      },
      escrituras_parametrizacion: {
        audit_rows_created: {
          auditoria: auditAfter.auditoria - auditBefore.auditoria,
          auditoria_eventos: auditAfter.auditoria_eventos - auditBefore.auditoria_eventos,
          historial_cambios: auditAfter.historial_cambios - auditBefore.historial_cambios,
        },
        locations_touched: locations.filter((item) => item.action !== 'reused').length,
        migration_applied: migrationAction === 'applied' ? 1 : 0,
        ppt_touched: ppt.action === 'reused' ? 0 : 1,
      },
      locations,
      ppt,
    };

    await writeFile(path.resolve(REPORT_JSON), JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await dbPool.end().catch(() => undefined);
  }
};

main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  await dbPool.end().catch(() => undefined);
  process.exitCode = 1;
});
