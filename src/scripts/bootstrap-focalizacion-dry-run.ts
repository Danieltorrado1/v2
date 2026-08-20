import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { PoolClient, QueryResultRow } from 'pg';

import { dbPool } from '../config/db';
import { env } from '../config/env';
import { applyBootstrapPlan, BOOTSTRAP_CONFIRMATION, BOOTSTRAP_CONTRACT_ID, BOOTSTRAP_TARGET, buildBootstrapApplyPlan, runApplyTransaction, validateApplyProtection } from '../modules/cobertura/cobertura.bootstrap.apply';
import { parseBootstrapWorkbook, planBootstrap, summarizeBootstrap, type BootstrapCatalogs } from '../modules/cobertura/cobertura.bootstrap.domain';
import { PgBootstrapApplyStore } from '../modules/cobertura/cobertura.bootstrap.pg-store';

const DEFAULT_FILE = 'data/focalizacion-agosto-2026.xlsx';
const normalize = (value: string | null | undefined) => (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, ' ').trim().toUpperCase();

const query = async <T extends QueryResultRow>(client: PoolClient, sql: string, params: unknown[] = []): Promise<T[]> => (await client.query<T>(sql, params)).rows;

const loadCatalogs = async (client: PoolClient): Promise<BootstrapCatalogs> => ({
  municipios: await query(client, `SELECT id::text, codigo_dane, nombre_municipio FROM municipios ORDER BY id`),
  instituciones: await query(client, `SELECT id::text, contrato_id::text, municipio_id::text, codigo_dane, nombre_institucion FROM instituciones WHERE COALESCE(activo, TRUE) = TRUE ORDER BY id`),
  sedes: await query(client, `SELECT id::text, institucion_id::text, municipio_id::text, codigo_dane, consecutivo_sede, nombre_sede FROM sedes WHERE COALESCE(activo, TRUE) = TRUE ORDER BY id`),
  modalidades: await query(client, `SELECT id::text, codigo_original, codigo_base, nombre_modalidad FROM modalidades WHERE COALESCE(activo, TRUE) = TRUE ORDER BY id`),
  modalidadAliases: await query(client, `SELECT modalidad_id::text, alias FROM modalidad_aliases WHERE COALESCE(activo, TRUE) = TRUE ORDER BY id`),
  institucionHistorial: await query(client, `SELECT institucion_id::text, nombre_normalizado, codigo_dane FROM instituciones_identidad_historial ORDER BY id`),
  sedeHistorial: await query(client, `SELECT sede_id::text, nombre_normalizado, codigo_dane, consecutivo_sede FROM sedes_identidad_historial ORDER BY id`),
  sedeModalidades: await query(client, `SELECT id::text, sede_id::text, modalidad_id::text, contrato_id::text FROM sede_modalidades WHERE COALESCE(activo, TRUE) = TRUE ORDER BY id`),
});

const csvCell = (value: unknown) => `"${(typeof value === 'string' ? value : JSON.stringify(value ?? '')).replace(/"/g, '""')}"`;

const main = async () => {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  if (apply && args.includes('--dry-run')) throw new Error('MODO_CONFLICTIVO_APPLY_DRY_RUN');
  const contractIdArg = args.find((arg) => arg.startsWith('--contract-id='))?.slice('--contract-id='.length);
  const confirmationArg = args.find((arg) => arg.startsWith('--confirm='))?.slice('--confirm='.length);
  const actorUserId = args.find((arg) => arg.startsWith('--actor-user-id='))?.slice('--actor-user-id='.length) ?? null;
  validateApplyProtection({ apply, contractId: contractIdArg, confirm: confirmationArg });
  const fileArg = args.find((arg) => arg.endsWith('.xlsx')) ?? DEFAULT_FILE;
  const outputArg = args.find((arg) => arg.startsWith('--output='))?.slice('--output='.length);
  const absoluteFile = path.resolve(fileArg);
  const buffer = await readFile(absoluteFile);
  const parsed = parseBootstrapWorkbook(buffer);
  const client = await dbPool.connect();
  try {
    if (apply) {
      const applyResult = await runApplyTransaction(client, async () => {
        const contract = await query<{ id: string; empresa_id: string; nombre_empresa: string; numero_contrato: string | null }>(client, `SELECT c.id::text,c.empresa_id::text,e.nombre_empresa,c.numero_contrato FROM contratos c JOIN empresas e ON e.id=c.empresa_id WHERE c.id=$1::bigint FOR SHARE`, [BOOTSTRAP_CONTRACT_ID]);
        const target = contract[0];
        if (!target || target.id !== BOOTSTRAP_CONTRACT_ID || normalize(target.nombre_empresa) !== normalize(BOOTSTRAP_TARGET)) throw new Error('APPLY_CONTRATO_DESTINO_INCORRECTO');
        if (actorUserId) {
          const actor = await query<{ exists: boolean }>(client, `SELECT EXISTS(SELECT 1 FROM usuarios WHERE id=$1::bigint AND COALESCE(activo,TRUE)=TRUE) AS exists`, [actorUserId]);
          if (!actor[0]?.exists) throw new Error('APPLY_ACTOR_USUARIO_INVALIDO');
        }
        const catalogs = await loadCatalogs(client);
        const details = planBootstrap(parsed.filas, catalogs, BOOTSTRAP_CONTRACT_ID);
        const plan = buildBootstrapApplyPlan(buffer, parsed.filas, details, catalogs);
        const summary = summarizeBootstrap(details);
        console.log(JSON.stringify({
          aviso: 'APPLY CONFIRMADO: la escritura comenzará después de este resumen',
          bd_destino: new URL(env.DATABASE_URL).pathname.replace(/^\//, ''), host: new URL(env.DATABASE_URL).host,
          contrato: `${target.id} — ${target.nombre_empresa}`, empresa_id: target.empresa_id, archivo: absoluteFile,
          filas: plan.sourceRows, instituciones_a_crear: summary.instituciones.crear,
          sedes_a_crear: summary.sedes.crear, sede_modalidades_a_crear: summary.sede_modalidades.crear,
          instituciones_a_reutilizar: summary.instituciones.reutilizar, sedes_a_reutilizar: summary.sedes.reutilizar,
          sede_modalidades_a_reutilizar: summary.sede_modalidades.reutilizar,
          actor: actorUserId ? `usuario:${actorUserId}` : 'BOOTSTRAP_CLI', confirmacion: BOOTSTRAP_CONFIRMATION,
        }, null, 2));
        return applyBootstrapPlan(new PgBootstrapApplyStore(client, actorUserId), plan);
      });
      console.log(JSON.stringify({ estado: 'APPLY_COMMIT_OK', resultado: applyResult }, null, 2));
      return;
    }
    await client.query('BEGIN READ ONLY');
    await client.query(`SET LOCAL statement_timeout = '30s'`);
    const schema = await query<{ table_name: string; column_name: string; data_type: string; is_nullable: string; column_default: string | null }>(client, `SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name = ANY($1::text[]) ORDER BY table_name,ordinal_position`, [['municipios','instituciones','sedes','modalidades','sede_modalidades','focalizacion_cargas','focalizacion_preliminar']]);
    const constraints = await query(client, `SELECT tc.table_name,tc.constraint_name,tc.constraint_type,pg_get_constraintdef(pc.oid) AS definition FROM information_schema.table_constraints tc JOIN pg_constraint pc ON pc.conname=tc.constraint_name WHERE tc.table_schema='public' AND tc.table_name = ANY($1::text[]) ORDER BY tc.table_name,tc.constraint_name`, [['municipios','instituciones','sedes','modalidades','sede_modalidades','focalizacion_cargas','focalizacion_preliminar']]);
    const indexes = await query(client, `SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename = ANY($1::text[]) ORDER BY tablename,indexname`, [['municipios','instituciones','sedes','modalidades','sede_modalidades','focalizacion_cargas','focalizacion_preliminar']]);
    const contracts = await query<{ id: string; numero_contrato: string | null; empresa_id: string; nombre_empresa: string }>(client, `SELECT c.id::text,c.numero_contrato,c.empresa_id::text,e.nombre_empresa FROM contratos c JOIN empresas e ON e.id=c.empresa_id ORDER BY c.id`);
    const targetMatches = contracts.filter((item) => normalize(item.nombre_empresa) === normalize(BOOTSTRAP_TARGET) || normalize(item.numero_contrato) === normalize(BOOTSTRAP_TARGET));
    const contratoId = targetMatches.length === 1 ? targetMatches[0]?.id ?? null : null;
    const catalogs = await loadCatalogs(client);
    const details = planBootstrap(parsed.filas, catalogs, contratoId);
    let applyPlanPreview: ReturnType<typeof buildBootstrapApplyPlan> | null = null;
    let applyPlanError: string | null = null;
    if (contratoId === BOOTSTRAP_CONTRACT_ID) {
      try { applyPlanPreview = buildBootstrapApplyPlan(buffer, parsed.filas, details, catalogs); }
      catch (error) { applyPlanError = error instanceof Error ? error.message : String(error); }
    }
    const report = {
      modo: 'DRY-RUN', escrituras_bd: 0, archivo: absoluteFile, hoja: parsed.hoja, columnas: parsed.columnas,
      contrato_destino: { nombre: BOOTSTRAP_TARGET, estado: targetMatches.length === 1 ? 'EXISTE' : targetMatches.length > 1 ? 'AMBIGUO' : 'CONTRATO_DESTINO_NO_EXISTE', id: contratoId },
      resumen: summarizeBootstrap(details), detalles: details, auditoria_modelo: { schema, constraints, indexes },
      apply_plan_preview: applyPlanPreview ? { estado: 'LISTO', archivo_sha256: applyPlanPreview.sourceHash, filas: applyPlanPreview.sourceRows, instituciones: applyPlanPreview.institutions.length, sedes: applyPlanPreview.sedes.length, sede_modalidades: applyPlanPreview.relations.length } : { estado: 'BLOQUEADO', error: applyPlanError ?? 'CONTRATO_DESTINO_INVALIDO' },
      muestras: {
        instituciones: [...new Map(details.map((row) => [`${row.municipio_resuelto}|${row.institucion_normalizada}`, { municipio: row.municipio_resuelto, institucion: row.institucion_normalizada, accion: row.accion_institucion }])).values()].slice(0, 10),
        sedes: [...new Map(details.map((row) => [`${row.municipio_resuelto}|${row.institucion_normalizada}|${row.sede_normalizada}`, { municipio: row.municipio_resuelto, institucion: row.institucion_normalizada, sede: row.sede_normalizada, accion: row.accion_sede }])).values()].slice(0, 20),
        sede_modalidades: [...new Map(details.map((row) => [`${row.municipio_resuelto}|${row.institucion_normalizada}|${row.sede_normalizada}|${row.modalidad_id}`, { municipio: row.municipio_resuelto, institucion: row.institucion_normalizada, sede: row.sede_normalizada, modalidad: row.modalidad_resuelta, accion: row.accion_sede_modalidad }])).values()].slice(0, 20),
      },
      catalogos_leidos: {
        municipios: catalogs.municipios,
        modalidades: catalogs.modalidades,
        modalidad_aliases: catalogs.modalidadAliases,
        cantidades: {
          municipios: catalogs.municipios.length, instituciones: catalogs.instituciones.length,
          sedes: catalogs.sedes.length, modalidades: catalogs.modalidades.length,
          sede_modalidades: catalogs.sedeModalidades.length,
          instituciones_identidad_historial: catalogs.institucionHistorial.length,
          sedes_identidad_historial: catalogs.sedeHistorial.length,
        },
      },
    };
    if (outputArg) {
      const outputBase = path.resolve(outputArg).replace(/\.(json|csv)$/i, '');
      await mkdir(path.dirname(outputBase), { recursive: true });
      const headers = Object.keys(details[0] ?? {});
      const csv = [headers.map(csvCell).join(','), ...details.map((row) => headers.map((header) => csvCell(row[header as keyof typeof row])).join(','))].join('\n');
      await writeFile(`${outputBase}.json`, JSON.stringify(report, null, 2), 'utf8');
      await writeFile(`${outputBase}.csv`, csv, 'utf8');
      console.log(JSON.stringify({
        modo: report.modo, escrituras_bd: report.escrituras_bd, archivo: report.archivo,
        hoja: report.hoja, columnas: report.columnas, contrato_destino: report.contrato_destino,
        resumen: report.resumen, detalles: `[${details.length} filas; ver ${outputBase}.json y ${outputBase}.csv]`,
        auditoria_modelo: '[ver reporte JSON]', catalogos_leidos: report.catalogos_leidos.cantidades,
      }, null, 2));
    } else {
      console.log(JSON.stringify(report, null, 2));
    }
    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await dbPool.end();
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : JSON.stringify(error));
  process.exitCode = 1;
});
