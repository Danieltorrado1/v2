import { config } from 'dotenv';
import { Client } from 'pg';
import { writeFile } from 'node:fs/promises';
import { FOCALIZACION_OPTIONS_SQL, focalizacionLabel } from '../modules/operacion/focalizacion-selector';
config({ path: process.env.AUDIT_ENV_PATH ?? '.env' });
if (!process.env.DATABASE_URL) throw new Error('Credencial de auditoría no configurada.');
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
async function main() { try {
  await client.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL statement_timeout='20s'");
  const readonly = (await client.query('SHOW transaction_read_only')).rows;
  const schema = (await client.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND (table_name ILIKE '%focaliz%' OR table_name ILIKE '%periodo%' OR table_name='contratos') ORDER BY table_name,ordinal_position")).rows;
  const contract = (await client.query('SELECT id::text,empresa_id::text,fecha_inicio::text,fecha_finalizacion::text,activo FROM contratos WHERE id=24 AND empresa_id=15')).rows;
  const cargas = (await client.query(`SELECT fc.id::text,c.empresa_id::text,fc.contrato_id::text,fc.periodo,fc.estado,fc.activo,fc.version,fc.es_vigente,fc.fecha_inicio_vigencia::text,fc.fecha_fin_vigencia::text,COUNT(fv.id)::int vigencias FROM focalizacion_cargas fc JOIN contratos c ON c.id=fc.contrato_id LEFT JOIN focalizacion_vigencias fv ON fv.carga_id=fc.id WHERE fc.contrato_id=24 GROUP BY fc.id,c.empresa_id ORDER BY fc.id`)).rows;
  const vigencias = (await client.query(`SELECT fv.id::text,c.empresa_id::text,fv.contrato_id::text,fv.carga_id::text,fv.preliminar_id::text,fv.institucion_id::text,fv.sede_id::text,fv.modalidad_id::text,fv.vigente_desde::text fecha_inicio,fv.vigente_hasta::text fecha_fin,fv.activo,fv.cobertura_estado estado,fv.valor_anterior_id::text,fc.version,fc.es_vigente,EXTRACT(YEAR FROM fv.vigente_desde)::int anio,EXTRACT(MONTH FROM fv.vigente_desde)::int mes FROM focalizacion_vigencias fv JOIN contratos c ON c.id=fv.contrato_id LEFT JOIN focalizacion_cargas fc ON fc.id=fv.carga_id WHERE fv.contrato_id=24 ORDER BY fv.id`)).rows;
  const source = `FROM focalizacion_vigencias fv JOIN focalizacion_final ff ON ff.contrato_id=fv.contrato_id AND (ff.preliminar_id=fv.preliminar_id OR (ff.institucion_id=fv.institucion_id AND ff.sede_id=fv.sede_id AND ff.modalidad_id=fv.modalidad_id)) JOIN contratos c ON c.id=ff.contrato_id WHERE ff.contrato_id=24 AND c.empresa_id=15`;
  const selector = (await client.query(`SELECT DISTINCT fv.id::text id,INITCAP(TO_CHAR(fv.vigente_desde,'TMMonth YYYY')) nombre,EXTRACT(YEAR FROM fv.vigente_desde)::int anio,EXTRACT(MONTH FROM fv.vigente_desde)::int mes ${source} ORDER BY anio DESC,mes DESC`)).rows;
  const physicalCounts = (await client.query(`SELECT date_trunc('month',vigente_desde)::date::text mes,COUNT(*)::int filas,COUNT(DISTINCT id)::int ids,COUNT(DISTINCT carga_id)::int cargas FROM focalizacion_vigencias WHERE contrato_id=24 GROUP BY 1 ORDER BY 1`)).rows;
  const joinCounts = (await client.query(`SELECT date_trunc('month',fv.vigente_desde)::date::text mes,COUNT(*)::int filas_join,COUNT(DISTINCT fv.id)::int ids ${source} GROUP BY 1 ORDER BY 1`)).rows;
  const finals = (await client.query(`SELECT ff.contrato_id::text,c.empresa_id::text,ff.carga_id::text,date_trunc('month',ff.vigente_desde)::date::text mes,ff.estado_validacion,COUNT(*)::int filas FROM focalizacion_final ff JOIN contratos c ON c.id=ff.contrato_id GROUP BY 1,2,3,4,5 ORDER BY 1,3`)).rows;
  const septemberVigencias = (await client.query(`SELECT fv.contrato_id::text,c.empresa_id::text,fv.carga_id::text,fv.activo,fv.cobertura_estado estado,COUNT(*)::int filas FROM focalizacion_vigencias fv JOIN contratos c ON c.id=fv.contrato_id WHERE fv.vigente_desde >= '2026-09-01' AND fv.vigente_desde < '2026-10-01' GROUP BY 1,2,3,4,5`)).rows;
  const septemberCargas = (await client.query(`SELECT fc.id::text,c.empresa_id::text,fc.contrato_id::text,fc.periodo,fc.estado,fc.version,fc.activo,fc.es_vigente,fc.fecha_inicio_vigencia::text,fc.fecha_fin_vigencia::text FROM focalizacion_cargas fc JOIN contratos c ON c.id=fc.contrato_id WHERE (fc.fecha_inicio_vigencia >= '2026-09-01' AND fc.fecha_inicio_vigencia < '2026-10-01') OR fc.periodo ILIKE '%sept%' OR fc.periodo ILIKE '%2026-09%'`)).rows;
  const nomina = (await client.query(`SELECT np.id::text,c.empresa_id::text,np.contrato_id::text,np.nombre_periodo,np.fecha_inicio::text,np.fecha_fin::text,np.estado,np.activo,np.periodo_canonico_id::text FROM nomina_periodos np JOIN contratos c ON c.id=np.contrato_id WHERE np.contrato_id=24 OR (np.fecha_inicio <= '2026-09-30' AND np.fecha_fin >= '2026-09-01') ORDER BY np.contrato_id,np.fecha_inicio,np.id`)).rows;
  const correctedSelector = (await client.query(FOCALIZACION_OPTIONS_SQL,[24])).rows.map(row=>({...row,nombre:focalizacionLabel(row.anio,row.mes)}));
  const relatedSources = [];
  for (const table of ['focalizacion_preliminar','focalizacion_detallado','focalizacion_final','vw_focalizacion_final_cobertura']) {
    const names = schema.filter(row=>row.table_name===table).map(row=>row.column_name);
    if (!names.length) continue;
    const dateColumn = ['vigente_desde','fecha_inicio_vigencia','fecha_inicio'].find(name=>names.includes(name));
    if (dateColumn) {
      const rows = (await client.query(`SELECT COUNT(*)::int filas FROM "${table}" WHERE "${dateColumn}" >= '2026-09-01' AND "${dateColumn}" < '2026-10-01'`)).rows;
      relatedSources.push({table,criterio:dateColumn,septiembre_global:rows});
    }
    if (names.includes('carga_id')) {
      const rows = (await client.query(`SELECT fc.id::text carga_id,fc.contrato_id::text,c.empresa_id::text,fc.fecha_inicio_vigencia::text fecha_inicio,COUNT(*)::int filas FROM "${table}" source JOIN focalizacion_cargas fc ON fc.id=source.carga_id JOIN contratos c ON c.id=fc.contrato_id WHERE fc.contrato_id=24 GROUP BY fc.id,c.empresa_id ORDER BY fc.id`)).rows;
      relatedSources.push({table,criterio:'carga canónica contrato24',cargas:rows});
    }
  }
  const report = { generated_at: new Date().toISOString(), transaction_read_only: readonly, scope: { empresa_id: 15, contrato_id: 24 }, productive_writes: 0, contract, cargas, vigencias, selector_actual_completo: selector, selector_corregido:correctedSelector, physicalCounts, joinCounts, finals, septemberVigencias, septemberCargas, related_sources:relatedSources, nomina, source_tables: [...new Set(schema.map(r=>r.table_name))] };
  await writeFile('reports/instituciones-focalizacion-audit-readonly.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ readonly, cargas, physicalCounts, joinCounts, septemberVigencias, septemberCargas, relatedSources, corrected_count:correctedSelector.length, selector_count: selector.length }, null, 2));
  await client.query('ROLLBACK');
} finally { await client.end(); } }
void main().catch(error => { console.error({ code: error.code, message: error.message }); process.exitCode = 1; });
