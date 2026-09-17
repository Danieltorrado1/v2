import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
import { AppError } from '../utils/AppError';
import { requirePermissions } from '../middlewares/roleMiddleware';
import { createCambioOperativoSchema } from '../modules/nomina/cambios-operativos.schemas';
import * as tramos from '../modules/nomina/nomina.tramos';
import { assertPensionAdjustmentAccess } from '../modules/nomina/nomina.pension-permissions';

function load(file: string, dependencies: Record<string, unknown>) {
  const exports: any = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, require(name: string) { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return exports;
}
const th = { roleNames: ['TALENTO_HUMANO'], userId: 7, empresaIds: [1], contratoIds: [1], isGlobalAdmin: false };

test('permisos existentes de cambios: TH autorizado y rol sin permiso recibe 403', () => {
  for (const [roles, permissions, expected] of [
    [['TALENTO_HUMANO'], ['nomina.movimientos.create'], undefined],
    [['ADMINISTRADOR'], ['nomina.movimientos.create'], undefined],
    [['GESTOR'], ['nomina.novedades.create'], 403],
  ] as const) {
    let error: any;
    requirePermissions('nomina.movimientos.create')({ user: { roles, permissions } } as any, {} as any, err => { error = err; });
    assert.equal(error?.statusCode, expected);
  }
});

test('pensión: ADMINISTRADOR y TH; otros roles no pueden crear/editar/anular la exclusión', () => {
  for (const role of ['ADMINISTRADOR', 'TALENTO_HUMANO']) assert.doesNotThrow(() => assertPensionAdjustmentAccess(['EXCLUIR_PENSION_FINAL'], { ...th, roleNames: [role] }));
  for (const role of ['GESTOR', 'NOMINA', 'OPERADOR_TENANT']) assert.throws(() => assertPensionAdjustmentAccess(['EXCLUIR_PENSION_FINAL'], { ...th, roleNames: [role] }), { statusCode: 403 });
  assert.throws(() => assertPensionAdjustmentAccess(['OTRO', 'EXCLUIR_PENSION_FINAL'], { ...th, roleNames: ['GESTOR'] }), { statusCode: 403 });
  assert.doesNotThrow(() => assertPensionAdjustmentAccess(['DEDUCCION_ADICIONAL_FINAL'], { ...th, roleNames: ['GESTOR'] }));
});

test('catálogo y persistencia SQL del servicio existente de cambios', async t => {
  const db = new PGlite();
  const query = async (sql: string, params?: any[]) => { const result = await db.query(sql, params); return { ...result, rowCount: result.rows.length || result.affectedRows || 0 }; };
  const pool = { query, connect: async () => ({ query, release() {} }) };
  const tenant = { assertTenantAccessForVinculacionId: async (_tenant: unknown, id: string | number) => { if (String(id) !== '10') throw new AppError('Fuera de alcance', 403); } };
  const deps = {
    '../../config/db': { dbPool: pool, dbQuery: query }, '../../utils/AppError': { AppError },
    '../../middlewares/tenantMiddleware': tenant,
    '../auditoria/auditoria.helper': { registerAuditEntry: async () => undefined },
    './nomina.operativa': { assertNominaEmpleadoEditable: ({ estado }: any) => { if (estado === 'CERRADO') throw new AppError('Cerrado', 409); }, invalidateNominaEmpleadoRevisionState: async () => undefined },
    './nomina.procesos': { assertNominaEmpleadoCoberturaScope: async (id: string) => { assert.equal(id, '20'); } },
    './nomina.tramos': tramos,
  };
  const service = load('src/modules/nomina/cambios-operativos.service.ts', deps);
  const catalog = load('src/modules/vinculaciones/vinculaciones.personal.service.ts', { ...deps,
    '../documentos/documentos.checklist.service': {}, './vinculaciones.personal.domain': {} });
  try {
    await db.exec(`
      CREATE TABLE contratos(id int PRIMARY KEY,empresa_id int); INSERT INTO contratos VALUES(1,1),(2,2);
      CREATE TABLE nomina_periodos(id int PRIMARY KEY,contrato_id int,fecha_inicio date,fecha_fin date,estado text);
      INSERT INTO nomina_periodos VALUES(1,1,'2026-09-01','2026-09-30','ABIERTO');
      CREATE TABLE vinculaciones(id int PRIMARY KEY,contrato_id int,fecha_inicio date,fecha_fin date,cargo_operativo_id int);
      INSERT INTO vinculaciones VALUES(10,1,'2026-01-01',NULL,NULL);
      CREATE TABLE nomina_empleados(id int PRIMARY KEY,periodo_id int,vinculacion_id int,estado text,activo boolean,categoria_salarial_id int);
      INSERT INTO nomina_empleados VALUES(20,1,10,'PENDIENTE',TRUE,NULL);
      CREATE TABLE municipios(id int PRIMARY KEY,nombre_municipio text); INSERT INTO municipios VALUES(1,'Municipio');
      CREATE TABLE instituciones(id int PRIMARY KEY,contrato_id int,activo boolean); INSERT INTO instituciones VALUES(1,1,TRUE),(2,1,TRUE),(3,2,TRUE);
      CREATE TABLE sedes(id int PRIMARY KEY,institucion_id int,municipio_id int,activo boolean); INSERT INTO sedes VALUES(1,1,1,TRUE),(2,2,1,TRUE),(3,3,1,TRUE);
      CREATE TABLE modalidades(id int PRIMARY KEY,activo boolean); INSERT INTO modalidades VALUES(1,TRUE),(2,TRUE);
      CREATE TABLE sede_modalidades(contrato_id int,sede_id int,modalidad_id int,activo boolean);
      INSERT INTO sede_modalidades VALUES(1,1,1,TRUE),(1,1,2,TRUE),(1,2,2,TRUE),(2,3,1,TRUE);
      CREATE TABLE focalizacion_final(id int PRIMARY KEY,contrato_id int,municipio_id int,municipio_texto text,institucion_id int,institucion_final text,sede_id int,sede_final text,modalidad_id int,modalidad_final text,activo boolean);
      INSERT INTO focalizacion_final VALUES(1,1,1,'Municipio',1,'Institución A',1,'Sede A',1,'Modalidad A',TRUE),(2,1,1,'Municipio',1,'Institución A',1,'Sede A',2,'Modalidad B',TRUE),(3,1,1,'Municipio',2,'Institución B',2,'Sede B',2,'Modalidad B',TRUE),(4,2,1,'Municipio',3,'Ajena',3,'Ajena',1,'Modalidad A',TRUE);
      CREATE TABLE cobertura_asignaciones(id int PRIMARY KEY,vinculacion_id int,focalizacion_final_id int,municipio_id int,activo boolean,fecha_inicio date,fecha_fin date);
      INSERT INTO cobertura_asignaciones VALUES(1,10,1,1,TRUE,'2026-01-01',NULL);
      CREATE TABLE personal_asignaciones_laborales(id int,vinculacion_id int,estado text,vigencia_desde date,vigencia_hasta date,ubicacion_laboral_id int);
      CREATE TABLE vinculacion_condiciones_economicas(id int,vinculacion_id int,activo boolean,vigencia_desde date,vigencia_hasta date);
      CREATE TABLE nomina_contextos_operativos_base(periodo_id int,nomina_empleado_id int,vinculacion_id int,contexto jsonb,created_by int,UNIQUE(periodo_id,nomina_empleado_id));
      CREATE TABLE nomina_movimientos(id int GENERATED ALWAYS AS IDENTITY,periodo_id int,nomina_empleado_id int,vinculacion_id int,fecha date,fecha_fin_efectiva date,tipo_movimiento text,familia_movimiento text,estado text,descripcion text,cantidad numeric,valor_unitario numeric,valor_total numeric,valor_calculado numeric,es_devengado boolean,es_deduccion boolean,afecta_seguridad_social boolean,activo boolean,contexto_anterior jsonb,contexto_nuevo jsonb,motivo_operativo text,regla_fecha_efectiva text,municipio_id int,institucion_id int,sede_id int,modalidad_id int,tarifa_config_id int,updated_by int,created_at timestamp DEFAULT now(),updated_at timestamp DEFAULT now(),motivo_estado text);
    `);
    const options = await catalog.listOpcionesAsignacionOperativa(10, th);
    await t.test('TH carga instituciones/sedes/modalidades reales del contrato; excluye otro contrato', () => {
      assert.equal(options.length, 3);
      assert.deepEqual([...new Set(options.map((o: any) => o.institucion_id))], ['1', '2']);
      assert.deepEqual(options.filter((o: any) => o.institucion_id === '2').map((o: any) => o.sede_id), ['2']);
      assert.deepEqual(options.filter((o: any) => o.sede_id === '1').map((o: any) => o.modalidad_id), ['1', '2']);
    });
    const base = (await service.resolverContextoFecha('1', '10', '2026-09-09', th)).contexto;
    const input = (option: any, date = '2026-09-10', previous = base) => createCambioOperativoSchema.parse({
      periodo_id: '1', nomina_empleado_id: '20', vinculacion_id: '10', tipo: 'CAMBIO_DE_MODALIDAD',
      fecha_inicio_efectiva: date, contexto_anterior: previous, contexto_nuevo: { ...previous, ...option }, motivo: 'Cambio solicitado',
    });
    let saved: any;
    await t.test('backend acepta cambio de modalidad y persiste IDs y fecha efectiva', async () => {
      const { id: _id, ...option } = options[1];
      saved = await service.crearCambioOperativo(input(option), '7', th);
      assert.equal(saved.contexto_nuevo.modalidad_id, '2'); assert.equal(saved.fecha_inicio_efectiva, '2026-09-10');
      const stored = (await db.query<any>('SELECT modalidad_id,fecha::text FROM nomina_movimientos')).rows[0];
      assert.deepEqual(stored, { modalidad_id: 2, fecha: '2026-09-10' });
    });
    await t.test('recarga conserva cambio y no modifica días anteriores al 10/09', async () => {
      assert.equal((await service.listarCambiosOperativos({ periodo_id: '1', activo: true }, th))[0].id, saved.id);
      assert.equal((await service.resolverContextoFecha('1','10','2026-09-09',th)).contexto.modalidad_id, '1');
      assert.equal((await service.resolverContextoFecha('1','10','2026-09-10',th)).contexto.modalidad_id, '2');
    });
    await t.test('institución y sede cambian juntas sin sobrescribir la historia anterior', async () => {
      const { id: _id, ...option } = options[2];
      const payload = { ...input(option, '2026-09-20', saved.contexto_nuevo), tipo: 'CAMBIO_DE_SEDE' };
      const result = await service.crearCambioOperativo(payload, '7', th);
      assert.equal(result.contexto_nuevo.institucion_id, '2'); assert.equal(result.contexto_nuevo.sede_id, '2');
      assert.equal((await service.resolverContextoFecha('1','10','2026-09-19',th)).contexto.sede_id, '1');
      assert.equal((await service.resolverContextoFecha('1','10','2026-09-20',th)).contexto.sede_id, '2');
    });
    await t.test('sede incompatible, IDs incompletos y contrato ajeno se rechazan sin guardar', async () => {
      for (const target of [{ institucion_id: '1', sede_id: '2', modalidad_id: '2' }, { institucion_id: null }, { institucion_id: '3', sede_id: '3', modalidad_id: '1' }]) {
        await assert.rejects(() => service.crearCambioOperativo(input(target), '7', th));
      }
      assert.equal((await db.query('SELECT id FROM nomina_movimientos')).rows.length, 2);
    });
    await t.test('snapshot anterior falsificado produce conflicto y no altera el contexto base', async () => {
      await assert.rejects(() => service.crearCambioOperativo(input({ ...options[1], modalidad_id:'2' }, '2026-09-25', { ...base, modalidad_id:'99' }), '7', th), { code: 'NOMINA_CAMBIO_HUECO_LOGICO' });
      assert.equal((await service.resolverContextoFecha('1','10','2026-09-01',th)).contexto.modalidad_id, '1');
    });
    await t.test('pensión TH: servicio guarda exclusión del periodo, recarga y permite reactivarla', async () => {
      await db.exec(`
        CREATE TABLE personas(id int PRIMARY KEY,primer_nombre text,segundo_nombre text,primer_apellido text,segundo_apellido text,numero_documento text);
        INSERT INTO personas VALUES(1,'Persona',NULL,'Prueba',NULL,'000');
        ALTER TABLE vinculaciones ADD COLUMN persona_id int DEFAULT 1;
        CREATE TABLE nomina_ajustes_manuales(id int GENERATED ALWAYS AS IDENTITY,empresa_id int,contrato_id int,periodo_id int,nomina_empleado_id int,tipo text,concepto text,observacion text,valor numeric,documento_soporte_id int,activo boolean DEFAULT TRUE,created_by int,created_at timestamp DEFAULT now(),updated_at timestamp,anulado_by int,anulado_at timestamp,motivo_anulacion text);
      `);
      const adjustments = load('src/modules/nomina/ajustes-manuales.service.ts', { ...deps,
        '../../middlewares/tenantMiddleware': { ...tenant, assertTenantAccessForEmpresaId: async (_tenant: unknown, id: string) => { assert.equal(String(id),'1'); } },
        '../documentos/documentos.service': {}, './nomina.pension-permissions': { assertPensionAdjustmentAccess },
      });
      const value = { nomina_empleado_id:'20', tipo:'DEDUCCION', concepto:'EXCLUIR_PENSION_FINAL', valor:1, observacion:'Exclusión manual de pensión para este periodo' };
      const adjustment = await adjustments.createAjusteManual('1',value,'7',th);
      assert.equal(adjustment.activo,true);
      assert.equal((await adjustments.listAjustesManuales('1',th))[0].concepto,'EXCLUIR_PENSION_FINAL');
      const denied = { ...th, roleNames:['GESTOR'] };
      await assert.rejects(()=>adjustments.createAjusteManual('1',value,'7',denied),{statusCode:403});
      await assert.rejects(()=>adjustments.updateAjusteManual(adjustment.id,{valor:2},'7',denied),{statusCode:403});
      await assert.rejects(()=>adjustments.annulAjusteManual(adjustment.id,'Reactivar','7',denied),{statusCode:403});
      assert.equal((await adjustments.annulAjusteManual(adjustment.id,'Reactivar pensión','7',th)).activo,false);
    });
    await t.test('migración del permiso existente es idempotente y solo concede a ADMINISTRADOR y TH', async () => {
      await db.exec(`CREATE TABLE roles(id int PRIMARY KEY,nombre_rol text,activo boolean);
        INSERT INTO roles VALUES(1,'ADMINISTRADOR',TRUE),(2,'TALENTO_HUMANO',TRUE),(3,'GESTOR',TRUE),(4,'NOMINA',TRUE);
        CREATE TABLE permisos(id int PRIMARY KEY,modulo text,accion text,activo boolean);
        INSERT INTO permisos VALUES(1,'nomina','recalculate',TRUE),(2,'vinculaciones','update',TRUE);
        CREATE TABLE rol_permisos(rol_id int,permiso_id int,activo boolean,UNIQUE(rol_id,permiso_id));
        INSERT INTO rol_permisos VALUES(1,1,TRUE);`);
      const sql=readFileSync('sql/fix-nomina-th-recalculate-permission.sql','utf8');
      await db.exec(sql);await db.exec(sql);
      assert.deepEqual((await db.query('SELECT rol_id,permiso_id FROM rol_permisos ORDER BY rol_id')).rows,[{rol_id:1,permiso_id:1},{rol_id:2,permiso_id:1}]);
    });
  } finally { await db.close(); }
});
