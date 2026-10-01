import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
import * as selector from '../modules/operacion/focalizacion-selector';
import { AppError } from '../utils/AppError';
import type { TenantAccessContext } from '../middlewares/tenantMiddleware';
import type { InstitucionesQuery } from '../modules/operacion/operacion.instituciones.service';

function load(file: string, db: PGlite, reads: string[]) {
  const output = ts.transpileModule(readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: Record<string, (...args: any[]) => Promise<any>> = {};
  const require = (name: string) => {
    if (name.endsWith('/db')) return { dbQuery: async (sql: string, params?: unknown[]) => {
      assert.match(sql.trim(), /^SELECT\b/i, 'application paths must only SELECT');
      reads.push(sql); return db.query(sql, params);
    }};
    if (name.endsWith('/AppError')) return { AppError };
    if (name.endsWith('focalizacion-selector')) return selector;
    if (name.endsWith('auditoria.helper')) return { registerAuditEntry: () => { throw Error('unexpected audit write'); } };
    if (name.endsWith('saas.service')) return {};
    throw Error('unexpected dependency '+name);
  };
  vm.runInNewContext(output, { exports, require, Date, console });
  return exports as Record<'listInstituciones' | 'resolveInstitucionesNominaPeriodo' | 'resolveEmpresaId', (...args: any[]) => Promise<any>>;
}

const tenant = { isGlobalAdmin: false, empresaIds: [15], contratoIds: [24] } as TenantAccessContext;
const query: InstitucionesQuery = { contrato_id:24, q:'', municipio_id:null, institucion_id:null, sede_id:null, modalidad_id:null, periodo_id:null, rector:'', gestor_id:null, estado:'', page:1, page_size:50 };

test('selector y listado reales: deduplicación, URL heredada, aislamiento y Nómina sólo por fecha', async t => {
  const db = new PGlite();
  const reads: string[] = [];
  try {
    await db.exec(`
      CREATE TABLE contratos(id bigint PRIMARY KEY,empresa_id bigint,activo boolean DEFAULT true);
      INSERT INTO contratos VALUES(24,15,true),(25,15,true),(26,16,true);
      CREATE TABLE focalizacion_cargas(id bigint PRIMARY KEY,contrato_id bigint,fecha_inicio_vigencia date,fecha_fin_vigencia date,estado text,version int,es_vigente boolean,activo boolean);
      INSERT INTO focalizacion_cargas VALUES(4,24,'2026-08-01','2026-08-31','PROCESADO',1,false,true);
      CREATE TABLE focalizacion_vigencias(id bigint PRIMARY KEY,contrato_id bigint,carga_id bigint,preliminar_id bigint,institucion_id bigint,sede_id bigint,modalidad_id bigint,municipio_id bigint,vigente_desde date,vigente_hasta date,activo boolean,cobertura_estado text,focalizacion_primaria int,focalizacion_secundaria int,focalizacion_total int,techo_primaria int,techo_secundaria int,techo_total int);
      INSERT INTO focalizacion_vigencias SELECT g,24,4,g,1,g,1,1,'2026-08-01','2026-08-31',true,'OK',120,80,200,120,80,200 FROM generate_series(168,169) g;
      CREATE TABLE focalizacion_final(id bigint,contrato_id bigint,carga_id bigint,preliminar_id bigint,institucion_id bigint,sede_id bigint,modalidad_id bigint,municipio_id bigint,activo boolean,cupos_aprobados int,institucion_final text,sede_final text,modalidad_final text,municipio_texto text);
      INSERT INTO focalizacion_final SELECT id,24,4,id,1,sede_id,1,1,true,200,'Institución fixture','Sede fixture','RI','Municipio fixture' FROM focalizacion_vigencias;
      CREATE TABLE municipios(id bigint,nombre_municipio text);
      CREATE TABLE instituciones(id bigint,nombre_institucion text);
      CREATE TABLE sedes(id bigint,nombre_sede text,zona_sede text);
      CREATE TABLE modalidades(id bigint,nombre_modalidad text);
      CREATE TABLE nomina_periodos(id bigint PRIMARY KEY,contrato_id bigint,nombre_periodo text,fecha_inicio date,fecha_fin date,estado text,activo boolean);
      INSERT INTO nomina_periodos VALUES
        (3,24,'SEPTIEMBRE 2026','2026-08-26','2026-09-25','ABIERTO',true),
        (6,24,'SEPTIEMBRE 2026','2026-09-01','2026-09-30','ANULADO',false),
        (7,24,'SEPTIEMBRE 2026','2026-09-01','2026-09-30','CERRADO',true),
        (8,26,'SEPTIEMBRE 2026','2026-09-01','2026-09-30','ABIERTO',true);
    `);
    const service = load('src/modules/operacion/operacion.instituciones.service.ts',db,reads);
    const saas = load('src/modules/saas/saas.middleware.ts',db,reads);
    await t.test('agosto con varias sedes es una opción canónica y conserva todas las filas', async () => {
      const result = await service.listInstituciones(query,tenant);
      assert.equal(result.filter_options.focalizaciones.length,1);
      assert.equal(result.filter_options.focalizaciones[0].id,'4');
      assert.equal(result.filter_options.focalizaciones[0].nombre,'Agosto 2026');
      assert.equal(result.total,2); assert.equal(result.items.length,2);
      assert.equal(result.focalizacion_id,'4');
      assert.equal(result.items[0].focalizacion_vigencia_id,'168');
      assert.equal(reads.some(sql => sql.includes('nomina_periodos')),false);
    });
    await t.test('legacy periodo_id=168 normaliza a carga4; jamás consulta Nómina', async () => {
      const result = await service.listInstituciones({...query,periodo_id:168},tenant);
      assert.equal(result.focalizacion_id,'4'); assert.equal(result.total,2);
      const empresa = await saas.resolveEmpresaId({ method:'GET', originalUrl:'/api/operacion/instituciones?periodo_id=168', params:{},query:{contrato_id:'24',periodo_id:'168'},body:{},tenant });
      assert.equal(empresa,15);
      assert.equal(reads.some(sql => sql.includes('nomina_periodos')),false);
    });
    await t.test('Nómina conserva su validación, sin reinterpretar IDs desconocidos', async () => {
      await assert.rejects(saas.resolveEmpresaId({ originalUrl:'/api/nomina/periodos/168',params:{},query:{},body:{},tenant }),/Nomina period not found/);
    });
    await t.test('resolver por fecha rechaza empresa explícita que no corresponde al contrato', async () => {
      await assert.rejects(saas.resolveEmpresaId({ method:'GET', originalUrl:'/api/operacion/instituciones/nomina-periodo',params:{},query:{empresa_id:'16',contrato_id:'24',fecha_efectiva:'2026-09-15'},body:{},tenant }),/empresa_id does not match/);
    });
    await db.exec(`
      INSERT INTO focalizacion_cargas VALUES(9,24,'2026-09-01','2026-09-30','PROCESADO',1,true,true),(10,25,'2026-09-01','2026-09-30','PROCESADO',1,true,true),(11,26,'2026-09-01','2026-09-30','PROCESADO',1,true,true);
      INSERT INTO focalizacion_vigencias SELECT g,CASE g WHEN 180 THEN 24 WHEN 181 THEN 25 ELSE 26 END,CASE g WHEN 180 THEN 9 WHEN 181 THEN 10 ELSE 11 END,g,1,g,1,1,'2026-09-01','2026-09-30',true,'OK',120,80,200,120,80,200 FROM generate_series(180,182) g;
      INSERT INTO focalizacion_final SELECT id,contrato_id,carga_id,id,1,sede_id,1,1,true,200,'Institución fixture','Sede fixture','RI','Municipio fixture' FROM focalizacion_vigencias WHERE id>=180;
    `);
    await t.test('agosto/septiembre únicos, español, recientes primero y carga9 por defecto', async () => {
      const result = await service.listInstituciones(query,tenant);
      assert.deepEqual(result.filter_options.focalizaciones.map((r: any)=>[r.id,r.nombre]),[['9','Septiembre 2026'],['4','Agosto 2026']]);
      assert.equal(result.focalizacion_id,'9'); assert.equal(result.total,1);
      assert.equal(result.items[0].focalizacion_id,'9');
    });
    await t.test('mismo nombre no mezcla contratos/empresas ni IDs externos', async () => {
      await assert.rejects(service.listInstituciones({...query,focalizacion_id:10},tenant),/no seleccionable/);
      await assert.rejects(service.listInstituciones({...query,periodo_id:181},tenant),/no pertenece/);
      await assert.rejects(service.listInstituciones({...query,contrato_id:26},{...tenant,contratoIds:[]}),/no autorizado/);
      await assert.rejects(service.resolveInstitucionesNominaPeriodo(26,'2026-09-15',{...tenant,contratoIds:[]}),/no autorizado/);
    });
    await t.test('filtro carga4 muestra agosto entero; all conserva histórico y paginación', async () => {
      assert.equal((await service.listInstituciones({...query,focalizacion_id:4},tenant)).total,2);
      const all = await service.listInstituciones({...query,all_focalizaciones:true,page:2,page_size:1},tenant);
      assert.equal(all.total,3); assert.equal(all.items.length,1); assert.equal(all.focalizacion_id,'all'); assert.equal(all.total_pages,3);
    });
    await t.test('fecha efectiva resuelve payroll3, no carga4/9 ni vigencia168', async () => {
      assert.equal((await service.resolveInstitucionesNominaPeriodo(24,'2026-09-15',tenant)).nomina_periodo_id,'3');
      assert.equal(await service.resolveInstitucionesNominaPeriodo(24,'2026-10-01',tenant),null);
      await assert.rejects(service.resolveInstitucionesNominaPeriodo(24,'2026-02-31',tenant),/Fecha efectiva inválida/);
    });
    await t.test('ANULADO/CERRADO inmutables; ambigüedad abierta no elige casualmente', async () => {
      const before = (await db.query('SELECT * FROM nomina_periodos ORDER BY id')).rows;
      await service.resolveInstitucionesNominaPeriodo(24,'2026-09-15',tenant);
      assert.deepEqual((await db.query('SELECT * FROM nomina_periodos ORDER BY id')).rows,before);
      await db.exec("INSERT INTO nomina_periodos VALUES(30,24,'Duplicado','2026-09-01','2026-09-30','ABIERTO',true)");
      await assert.rejects(service.resolveInstitucionesNominaPeriodo(24,'2026-09-15',tenant),/más de un período/);
    });
    await t.test('default usa vigencia actual o última válida, no un mes futuro', () => {
      const options=[{id:'9',fecha_inicio:'2026-09-01',fecha_fin:'2026-09-30'},{id:'4',fecha_inicio:'2026-08-01',fecha_fin:'2026-08-31'}];
      assert.equal(selector.defaultFocalizacion(options,'2026-08-15')?.id,'4');
      assert.equal(selector.defaultFocalizacion(options,'2026-09-30')?.id,'9');
    });
  } finally { await db.close(); }
});
