import { readFile } from 'node:fs/promises';
import dotenv from 'dotenv';
import { Client, type QueryResultRow } from 'pg';

const CONTRACT_ID = 24;
const EMPRESA_ID = 15;
const QA_APP_NAME = 'Empiria Territorial QA';
const REQUIRED_FOCAL_IDS = [...Array.from({ length: 9 }, (_, index) => 643 + index), ...Array.from({ length: 16 }, (_, index) => 666 + index)];
const DOCUMENTS = ['1006691887', '40327321', '21182728', '40398034', '31007973', '40266636', '33222823'];
const IMMUTABLE_CATALOGS = ['departamentos', 'municipios', 'modalidades', 'tipos_documentos', 'tipos_identificacion', 'tipos_sangre', 'zonas', 'sexo', 'estados_civiles', 'tipos_jornada', 'tipos_vinculacion'];

type Config = Record<string, string> & { host: string; database: string; schema: string };
type Row = QueryResultRow & { id: string | number };

const loadConfig = async (file: string): Promise<Config> => {
  const parsed = dotenv.parse(await readFile(file, 'utf8')) as Record<string, string>;
  if (!parsed.DATABASE_URL) throw new Error(`DATABASE_URL_MISSING:${file}`);
  const url = new URL(parsed.DATABASE_URL);
  return { ...parsed, host: url.host, database: url.pathname.slice(1), schema: 'public' };
};

const clientFor = (config: Config): Client => new Client({ connectionString: config.DATABASE_URL!, ssl: /supabase|pooler/.test(config.DATABASE_URL!) ? { rejectUnauthorized: false } : false });
const stable = (value: unknown): unknown => value instanceof Date ? value.toISOString() : value;
const sameRow = (left: Row, right: Row): boolean => {
  const normalizeRow = (row: Row) => Object.fromEntries(Object.keys(row).sort().map((key) => [key, stable(row[key])]));
  return JSON.stringify(normalizeRow(left)) === JSON.stringify(normalizeRow(right));
};

const columnsFor = async (client: Client, table: string): Promise<string[]> => (await client.query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND is_generated='NEVER' ORDER BY ordinal_position`, [table])).rows.map((row) => row.column_name);
const loadRows = async <T extends Row>(client: Client, table: string, where: string, params: unknown[] = []): Promise<T[]> => (await client.query<T>(`SELECT * FROM ${table} WHERE ${where}`, params)).rows;
const idSet = (rows: Row[]): number[] => [...new Set(rows.map((row) => Number(row.id)).filter(Number.isFinite))];

async function copyRows(source: Client, target: Client, table: string, rows: Row[], copied: Record<string, number>, overrides: Record<string, unknown> = {}): Promise<void> {
  if (rows.length === 0) return;
  const columns = await columnsFor(source, table);
  const existing = new Map<number, Row>((await target.query<Row>(`SELECT * FROM ${table} WHERE id = ANY($1::bigint[])`, [idSet(rows)])).rows.map((row) => [Number(row.id), row]));
  const pending = rows.filter((row) => {
    const current = existing.get(Number(row.id));
    const expected = { ...row, ...overrides } as Row;
    if (current && !sameRow(expected, current)) throw new Error(`PK_COLLISION:${table}:${row.id}`);
    return !current;
  });
  for (const row of pending) {
    const values = columns.map((column) => Object.prototype.hasOwnProperty.call(overrides, column) ? overrides[column] : row[column]);
    const placeholders = values.map((_, index) => `$${index + 1}`).join(',');
    await target.query(`INSERT INTO ${table} (${columns.map((column) => `"${column}"`).join(',')}) VALUES (${placeholders})`, values);
  }
  copied[table] = (copied[table] ?? 0) + pending.length;
}

async function copyCatalogRows(source: Client, target: Client, table: string, ids: number[], copied: Record<string, number>): Promise<void> {
  if (ids.length === 0) return;
  await copyRows(source, target, table, await loadRows(source, table, `id = ANY($1::bigint[])`, [ids]), copied);
}

async function main(): Promise<void> {
  const sourceConfig = await loadConfig('.env');
  const targetEnvFile = process.env.TERRITORIAL_TARGET_ENV_FILE ?? '.env.qa.territorial';
  const targetConfig = await loadConfig(targetEnvFile);
  if (sourceConfig.host === targetConfig.host && sourceConfig.database === targetConfig.database) throw new Error('SOURCE_TARGET_SAME_DATABASE');
  if (targetConfig.APP_NAME !== QA_APP_NAME) throw new Error('TARGET_NOT_EXPLICIT_QA');
  if (!['127.0.0.1', 'localhost'].includes((targetConfig.host.split(':')[0] ?? '').toLowerCase())) throw new Error('TARGET_NOT_LOCAL');
  const source = clientFor(sourceConfig);
  const target = clientFor(targetConfig);
  await source.connect(); await target.connect();
  try {
    const sourceIdentity = (await source.query(`SELECT current_database() AS database,current_schema() AS schema,current_user AS user_name`)).rows[0];
    const targetIdentity = (await target.query(`SELECT current_database() AS database,current_schema() AS schema,current_user AS user_name`)).rows[0];
    const sourceEmpresa = (await source.query(`SELECT * FROM empresas WHERE id=$1`, [EMPRESA_ID])).rows[0] as Row | undefined;
    const sourceContract = (await source.query(`SELECT c.*, e.nombre_empresa FROM contratos c JOIN empresas e ON e.id=c.empresa_id WHERE c.id=$1 AND c.empresa_id=$2`, [CONTRACT_ID, EMPRESA_ID])).rows[0];
    if (!sourceContract) throw new Error('SOURCE_CONTRACT_24_EMPRESA_15_NOT_FOUND');
    const sourceCounts = (await source.query(`SELECT
      (SELECT COUNT(*)::int FROM focalizacion_final WHERE contrato_id=$1) AS finales,
      (SELECT COUNT(*)::int FROM cobertura_asignaciones WHERE contrato_id=$1) AS asignaciones,
      (SELECT COUNT(*)::int FROM vinculaciones WHERE contrato_id=$1) AS vinculaciones,
      (SELECT COUNT(*)::int FROM personas p WHERE EXISTS (SELECT 1 FROM vinculaciones v WHERE v.persona_id=p.id AND v.contrato_id=$1)) AS personas`, [CONTRACT_ID])).rows[0];
    if (Number(sourceCounts.finales) !== 687) throw new Error(`SOURCE_FINALES_EXPECTED_687:${sourceCounts.finales}`);
    const targetContract = (await target.query(`SELECT c.id::text,c.empresa_id::text,e.nombre_empresa FROM contratos c LEFT JOIN empresas e ON e.id=c.empresa_id WHERE c.id=$1`, [CONTRACT_ID])).rows[0] ?? null;
    const targetCounts = (await target.query(`SELECT
      (SELECT COUNT(*)::int FROM focalizacion_final WHERE contrato_id=$1) AS finales,
      (SELECT COUNT(*)::int FROM cobertura_asignaciones WHERE contrato_id=$1) AS asignaciones,
      (SELECT COUNT(*)::int FROM vinculaciones WHERE contrato_id=$1) AS vinculaciones`, [CONTRACT_ID])).rows[0];
    console.log(JSON.stringify({ source: { app_name: sourceConfig.APP_NAME, host: sourceConfig.host, database: sourceConfig.database, schema: sourceConfig.schema, identity: sourceIdentity, empresa_id: EMPRESA_ID, contrato_id: CONTRACT_ID, counts: sourceCounts }, target: { app_name: targetConfig.APP_NAME, host: targetConfig.host, database: targetConfig.database, schema: targetConfig.schema, identity: targetIdentity, contrato: targetContract, counts: targetCounts }, source_ne_target: true }, null, 2));

    const sourceFinals = await loadRows(source, 'focalizacion_final', 'contrato_id=$1', [CONTRACT_ID]);
    const sourceFocalIds = new Set(sourceFinals.map((row) => Number(row.id)));
    if (!REQUIRED_FOCAL_IDS.every((id) => sourceFocalIds.has(id))) throw new Error('SOURCE_REQUIRED_FOCAL_IDS_MISSING');
    const targetCollisions: Array<{ table: string; ids: number[] }> = [];
    const collisionCheck = async (table: string, rows: Row[]) => {
      const ids = idSet(rows); if (!ids.length) return;
      const existing = await target.query<{ id: string }>(`SELECT id::text FROM ${table} WHERE id = ANY($1::bigint[])`, [ids]);
      if (existing.rows.length) targetCollisions.push({ table, ids: existing.rows.map((row) => Number(row.id)) });
    };
    const sourceVigencias = await loadRows(source, 'focalizacion_vigencias', 'contrato_id=$1', [CONTRACT_ID]);
    const sourcePreliminares = await loadRows(source, 'focalizacion_preliminar', 'contrato_id=$1', [CONTRACT_ID]);
    const sourceCargas = await loadRows(source, 'focalizacion_cargas', 'contrato_id=$1', [CONTRACT_ID]);
    const sourceSedeModalidades = await loadRows(source, 'sede_modalidades', 'contrato_id=$1', [CONTRACT_ID]);
    const sourceInstituciones = await loadRows(source, 'instituciones', 'contrato_id=$1', [CONTRACT_ID]);
    const sourceSedes = await loadRows(source, 'sedes', 'institucion_id = ANY($1::bigint[])', [idSet(sourceInstituciones)]);
    const sourceFinalSedeIds = idSet(sourceFinals.map((row) => ({ id: row.sede_id })) as Row[]);
    const sourceFinalInstitutionIds = idSet(sourceFinals.map((row) => ({ id: row.institucion_id })) as Row[]);
    const sourceFinalModalidadIds = idSet(sourceFinals.map((row) => ({ id: row.modalidad_id })) as Row[]);
    const sourceAssignmentRows = await loadRows(source, 'cobertura_asignaciones', 'focalizacion_final_id = ANY($1::bigint[])', [REQUIRED_FOCAL_IDS]);
    const sourceVinculationIds = idSet(sourceAssignmentRows.map((row) => ({ id: row.vinculacion_id })) as Row[]);
    const sourceVinculations = await loadRows(source, 'vinculaciones', 'id = ANY($1::bigint[])', [sourceVinculationIds]);
    const sourcePersonIds = idSet(sourceVinculations.map((row) => ({ id: row.persona_id })) as Row[]);
    const sourcePersons = await loadRows(source, 'personas', 'id = ANY($1::bigint[])', [sourcePersonIds]);
    const collisionGroups: Array<[string, Row[]]> = [
      ['empresas', await loadRows(source, 'empresas', 'id=$1', [EMPRESA_ID])], ['contratos', [sourceContract as Row]],
      ['focalizacion_cargas', sourceCargas], ['focalizacion_preliminar', sourcePreliminares], ['focalizacion_vigencias', sourceVigencias],
      ['focalizacion_final', sourceFinals], ['instituciones', sourceInstituciones], ['sedes', sourceSedes], ['sede_modalidades', sourceSedeModalidades],
      ['cobertura_asignaciones', sourceAssignmentRows], ['vinculaciones', sourceVinculations], ['personas', sourcePersons],
    ];
    for (const [table, rows] of collisionGroups) await collisionCheck(table, rows);
    if (targetCollisions.length) throw new Error(`PK_COLLISIONS:${JSON.stringify(targetCollisions)}`);

    await target.query('BEGIN');
    await target.query(`SET LOCAL statement_timeout='120s'`);
    const copied: Record<string, number> = {};
    const organizationId = sourceEmpresa?.organizacion_id ? Number(sourceEmpresa.organizacion_id) : null;
    if (organizationId) await copyCatalogRows(source, target, 'organizaciones', [organizationId], copied);
    await copyCatalogRows(source, target, 'empresas', [EMPRESA_ID], copied);
    await copyRows(source, target, 'contratos', [sourceContract], copied);
    const municipalityIds = [...new Set([...sourceInstituciones.map((row) => Number(row.municipio_id)), ...sourceSedes.map((row) => Number(row.municipio_id)), ...sourceFinals.map((row) => Number(row.municipio_id)), ...sourcePersons.flatMap((row) => [row.municipio_expedicion_id, row.municipio_nacimiento_id, row.municipio_residencia_id].map(Number))].filter(Number.isFinite))];
    const sourceMunicipios = await loadRows(source, 'municipios', 'id = ANY($1::bigint[])', [municipalityIds]);
    const departmentIds = idSet(sourceMunicipios.map((row) => ({ id: row.departamento_id })) as Row[]);
    await copyCatalogRows(source, target, 'departamentos', departmentIds, copied);
    await copyRows(source, target, 'municipios', sourceMunicipios, copied);
    await copyCatalogRows(source, target, 'instituciones', idSet(sourceInstituciones), copied);
    await copyCatalogRows(source, target, 'sedes', idSet(sourceSedes), copied);
    await copyCatalogRows(source, target, 'modalidades', sourceFinalModalidadIds, copied);
    await copyRows(source, target, 'sede_modalidades', sourceSedeModalidades, copied);
    await copyRows(source, target, 'focalizacion_cargas', sourceCargas, copied, { archivo_bytes: null, usuario_carga_id: null, created_by: null });
    await copyRows(source, target, 'focalizacion_preliminar', sourcePreliminares, copied, { focalizacion_vigencia_id: null });
    await copyRows(source, target, 'focalizacion_vigencias', sourceVigencias, copied, { created_by: null, regla_config_id: null });
    for (const row of sourcePreliminares) if (row.focalizacion_vigencia_id != null) await target.query('UPDATE focalizacion_preliminar SET focalizacion_vigencia_id=$1 WHERE id=$2', [row.focalizacion_vigencia_id, row.id]);
    await copyRows(source, target, 'focalizacion_final', sourceFinals, copied);
    const tipoDocumentoIds = idSet(sourcePersons.map((row) => ({ id: row.tipo_documento_id })) as Row[]);
    await copyCatalogRows(source, target, 'tipos_identificacion', tipoDocumentoIds, copied);
    const personCatalogs: Array<[string, string]> = [['estado_civil_id', 'estados_civiles'], ['sexo_id', 'sexo'], ['tipo_sangre_id', 'tipos_sangre'], ['zona_id', 'zonas']];
    for (const [column, table] of personCatalogs) {
      await copyCatalogRows(source, target, table, idSet(sourcePersons.map((row) => ({ id: row[column] })) as Row[]), copied);
    }
    await copyRows(source, target, 'personas', sourcePersons, copied);
    await copyCatalogRows(source, target, 'cargos_operativos', idSet(sourceVinculations.map((row) => ({ id: row.cargo_operativo_id })) as Row[]), copied);
    await copyCatalogRows(source, target, 'tipos_jornada', idSet(sourceVinculations.map((row) => ({ id: row.tipo_jornada_id })) as Row[]), copied);
    await copyCatalogRows(source, target, 'tipos_vinculacion', idSet(sourceVinculations.map((row) => ({ id: row.tipo_vinculacion_id })) as Row[]), copied);
    const contratoCargoIds = idSet(sourceVinculations.map((row) => ({ id: row.contrato_cargo_id })) as Row[]);
    await copyCatalogRows(source, target, 'contrato_cargos', contratoCargoIds, copied);
    await copyRows(source, target, 'vinculaciones', sourceVinculations, copied);
    await copyRows(source, target, 'cobertura_asignaciones', sourceAssignmentRows, copied);
    for (const table of ['empresas','contratos','instituciones','sedes','sede_modalidades','focalizacion_cargas','focalizacion_preliminar','focalizacion_vigencias','focalizacion_final','personas','vinculaciones','cobertura_asignaciones']) await target.query(`SELECT setval(pg_get_serial_sequence($1,$2), GREATEST(COALESCE((SELECT MAX(id) FROM ${table}),1),1), true)`, [table, 'id']);
    await target.query('COMMIT');
    console.log(JSON.stringify({ estado: 'SEED_COMMIT_OK', copied, personas_documentos: sourcePersons.map((row) => row.numero_documento), asignaciones: sourceAssignmentRows.length, focalizacion_final: sourceFinals.length, economia_copiada: false }, null, 2));
  } catch (error) { await target.query('ROLLBACK').catch(() => undefined); throw error; } finally { await source.end(); await target.end(); }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
