import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {AppError} from '../utils/AppError';
import * as catalog from '../modules/cobertura/modalidad-contract-catalog';
import * as tramos from '../modules/nomina/nomina.tramos';
import {requireOperationalChange} from '../middlewares/operationalChangePermission';
import {calculateCoberturaPayroll} from '../modules/nomina/nomina.cobertura';

function load(file:string,dependencies:Record<string,unknown>) {
  const exports:any={};
  runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,Date,require:(name:string)=>{assert.ok(name in dependencies,`Dependency ${name}`);return dependencies[name];}});
  return exports;
}

test('Instituciones: cambio temporal transaccional con PostgreSQL aislado',async t=>{
  const db=new PGlite();
  const query=async(sql:string,values?:any[])=>{const result=await db.query(sql,values);return {...result,rowCount:result.rows.length||result.affectedRows||0};};
  const pool={query,connect:async()=>({query,release(){}})};
  const context=load('src/modules/integracion/contexto-laboral.service.ts',{'../../config/db':{dbPool:pool,dbQuery:query},'../../utils/AppError':{AppError}});
  const preview=load('src/modules/nomina/modalidad-change-preview.ts',{'node:crypto':{createHash},'../../utils/AppError':{AppError},
    '../cobertura/modalidad-contract-catalog':catalog,'../integracion/contexto-laboral.service':context});
  const salary=load('src/modules/nomina/canonical-salary-timeline.ts',{'../../utils/AppError':{AppError},'../integracion/contexto-laboral.service':context});
  const salaryInput={empresaId:1,contratoId:1,vinculacionId:10,fechaInicio:'2026-09-01',fechaFin:'2026-09-30'};
  const audit:any[]=[];
  const central=load('src/modules/cobertura/cobertura-asignacion.service.ts',{'../../utils/AppError':{AppError},'../auditoria/auditoria.helper':{registerAuditEntry:async(input:any)=>audit.push(input)}});
  const repository=load('src/modules/nomina/infrastructure/repositories/nomina-poblacion.repository.ts',{
    '../../../../config/db':{dbPool:pool},'../../nomina.population':{effectiveRetirementSql:()=> 'NULL::date'},
  });
  const deps={
    '../../config/db':{dbPool:pool,dbQuery:query},'../../utils/AppError':{AppError},
    '../../middlewares/tenantMiddleware':{assertTenantAccessForVinculacionId:async(_tenant:any,id:string|number)=>{if(String(id)!=='10')throw new AppError('Tenant',403,'TENANT');}},
    '../auditoria/auditoria.helper':{registerAuditEntry:async(input:any)=>audit.push(input)},
    '../integracion/integracion.service':{publicarEventoOutbox:async()=> 'OUTBOX_DISABLED'},
    '../cobertura/cobertura-asignacion.service':central,'../cobertura/modalidad-contract-catalog':catalog,
    './modalidad-change-preview':preview,'../integracion/contexto-laboral.service':context,
    './infrastructure/repositories/nomina-poblacion.repository':{nominaPoblacionRepository:new repository.NominaPoblacionRepository()},
    './nomina.operativa':{assertNominaEmpleadoEditable:()=>{},invalidateNominaEmpleadoRevisionState:async()=>{}},
    './nomina.procesos':{assertNominaEmpleadoCoberturaScope:async(id:string)=>assert.equal(id,'20')},'./nomina.tramos':tramos,
  };
  const service=load('src/modules/nomina/cambios-operativos.service.ts',deps);
  try {
    await db.exec(`
      CREATE TABLE contratos(id bigint PRIMARY KEY,empresa_id bigint,fecha_inicio date,fecha_finalizacion date,fecha_final_estimada date,fecha_final_real date);
      INSERT INTO contratos VALUES(1,1,'2026-01-01','2026-12-31',NULL,NULL),(2,2,'2026-01-01','2026-12-31',NULL,NULL);
      CREATE TABLE vinculaciones(id bigint PRIMARY KEY,contrato_id bigint,persona_id bigint,fecha_inicio date,fecha_fin date,cargo_operativo_id bigint);
      INSERT INTO vinculaciones VALUES(10,1,100,'2026-01-01',NULL,NULL),(11,2,101,'2026-01-01',NULL,NULL);
      CREATE TABLE municipios(id bigint PRIMARY KEY,nombre_municipio text);INSERT INTO municipios VALUES(1,'Municipio');
      CREATE TABLE instituciones(id bigint PRIMARY KEY,contrato_id bigint,nombre_institucion text,activo boolean);
      INSERT INTO instituciones VALUES(1,1,'Institución',TRUE),(2,2,'Ajena',TRUE);
      CREATE TABLE sedes(id bigint PRIMARY KEY,institucion_id bigint,municipio_id bigint,nombre_sede text,activo boolean);
      INSERT INTO sedes VALUES(1,1,1,'Sede',TRUE),(2,2,1,'Ajena',TRUE);
      CREATE TABLE modalidades(id bigint PRIMARY KEY,codigo_original text,nombre_modalidad text,activo boolean);
      INSERT INTO modalidades VALUES(1,'RI','RI',TRUE),(2,'CAA','CAA',TRUE),(3,'AJENA','AJENA',TRUE);
      CREATE TABLE sede_modalidades(contrato_id bigint,sede_id bigint,modalidad_id bigint,activo boolean);
      INSERT INTO sede_modalidades VALUES(1,1,1,TRUE),(2,2,3,TRUE);
      CREATE TABLE calculadora_personal_config(contrato_id bigint,modalidad_id bigint,estado text);
      INSERT INTO calculadora_personal_config VALUES(1,2,'activo');
      CREATE TABLE focalizacion_final(id bigint PRIMARY KEY,contrato_id bigint,municipio_id bigint,institucion_id bigint,sede_id bigint,modalidad_id bigint,institucion_final text,sede_final text,modalidad_final text,municipio_texto text,consecutivo_final text,categoria_cobertura text,activo boolean);
      INSERT INTO focalizacion_final VALUES(1,1,1,1,1,1,'Institución','Sede','RI','Municipio','001','CAT',TRUE);
      CREATE TABLE cobertura_asignaciones(id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,contrato_id bigint,vinculacion_id bigint,municipio_id bigint,
        focalizacion_final_id bigint,institucion text,sede text,modalidad text,consecutivo_sede text,categoria_cobertura text,
        tipo_asignacion text,porcentaje_cobertura numeric,fecha_inicio date,fecha_fin date,observacion text,activo boolean);
      ALTER TABLE cobertura_asignaciones ADD COLUMN created_at timestamp DEFAULT now();
      INSERT INTO cobertura_asignaciones(contrato_id,vinculacion_id,municipio_id,focalizacion_final_id,institucion,sede,modalidad,consecutivo_sede,categoria_cobertura,tipo_asignacion,porcentaje_cobertura,fecha_inicio,fecha_fin,activo)
        VALUES(1,10,1,1,'Institución','Sede','RI','001','CAT','PRINCIPAL',1,'2026-09-01','2026-12-31',TRUE);
      CREATE TABLE nomina_periodos(id bigint PRIMARY KEY,contrato_id bigint,fecha_inicio date,fecha_fin date,estado text);
      INSERT INTO nomina_periodos VALUES(1,1,'2026-09-01','2026-09-30','ABIERTO'),(2,1,'2026-10-01','2026-10-31','ABIERTO');
      INSERT INTO nomina_periodos VALUES(9,1,'2026-08-01','2026-08-31','CERRADO');
      CREATE TABLE nomina_empleados(id bigint PRIMARY KEY,periodo_id bigint,vinculacion_id bigint,estado text,activo boolean,categoria_salarial_id bigint);
      INSERT INTO nomina_empleados VALUES(20,1,10,'PENDIENTE',TRUE,1),(21,2,10,'PENDIENTE',TRUE,1);
      INSERT INTO nomina_empleados VALUES(19,9,10,'CERRADO',TRUE,1);
      CREATE TABLE nomina_categorias_salariales(id bigint PRIMARY KEY,contrato_id bigint,modalidad text,codigo_categoria text,nombre_categoria text,activo boolean,vigente_desde date,vigente_hasta date);
      INSERT INTO nomina_categorias_salariales VALUES(1,1,'RI','RI','Categoría RI',TRUE,'2026-01-01',NULL),(2,1,'CAA','CAA','Categoría CAA',TRUE,'2026-01-01',NULL);
      ALTER TABLE nomina_categorias_salariales ADD COLUMN salario_base numeric DEFAULT 3000, ADD COLUMN auxilio_transporte numeric DEFAULT 0, ADD COLUMN otros_recargos numeric DEFAULT 0;
      UPDATE nomina_categorias_salariales SET salario_base=6000 WHERE id=2;
      CREATE TABLE nomina_liquidaciones(id bigint PRIMARY KEY,periodo_id bigint,vinculacion_id bigint,requiere_recalculo boolean,valor numeric);
      INSERT INTO nomina_liquidaciones VALUES(1,1,10,FALSE,100),(2,2,10,FALSE,200);
      INSERT INTO nomina_liquidaciones VALUES(9,9,10,FALSE,300);
      CREATE TABLE nomina_asistencia_diaria(id bigint PRIMARY KEY,periodo_id bigint,vinculacion_id bigint,fecha date,valor text);
      INSERT INTO nomina_asistencia_diaria VALUES(1,1,10,'2026-09-07','ASISTIO');
      CREATE TABLE nomina_novedades(id bigint PRIMARY KEY,vinculacion_id bigint,fecha date);INSERT INTO nomina_novedades VALUES(1,10,'2026-09-07');
      CREATE TABLE nomina_turnos(id bigint PRIMARY KEY,vinculacion_id bigint,fecha date);INSERT INTO nomina_turnos VALUES(1,10,'2026-09-07');
      CREATE TABLE personal_asignaciones_laborales(id bigint PRIMARY KEY,vinculacion_id bigint,estado text,vigencia_desde date,vigencia_hasta date,ubicacion_laboral_id bigint);
      INSERT INTO personal_asignaciones_laborales VALUES(1,10,'VIGENTE','2026-01-01',NULL,1);
      CREATE TABLE vinculacion_condiciones_economicas(id bigint PRIMARY KEY,vinculacion_id bigint,activo boolean,vigencia_desde date,vigencia_hasta date);
      CREATE TABLE nomina_contextos_operativos_base(periodo_id bigint,nomina_empleado_id bigint,vinculacion_id bigint,contexto jsonb,fuente text,created_by bigint,UNIQUE(periodo_id,nomina_empleado_id));
      INSERT INTO nomina_contextos_operativos_base VALUES(9,19,10,'{"modalidad":"RI","certificado":"cerrado"}','CERRADO',7);
      CREATE TABLE nomina_movimientos(id bigint GENERATED ALWAYS AS IDENTITY,periodo_id bigint,nomina_empleado_id bigint,vinculacion_id bigint,fecha date,fecha_fin_efectiva date,tipo_movimiento text,familia_movimiento text,estado text,descripcion text,cantidad numeric,valor_unitario numeric,valor_total numeric,valor_calculado numeric,es_devengado boolean,es_deduccion boolean,afecta_seguridad_social boolean,activo boolean,contexto_anterior jsonb,contexto_nuevo jsonb,motivo_operativo text,regla_fecha_efectiva text,municipio_id bigint,institucion_id bigint,sede_id bigint,modalidad_id bigint,tarifa_config_id bigint,updated_by bigint,created_at timestamp DEFAULT now(),updated_at timestamp DEFAULT now());
    `);
    await db.exec(readFileSync('sql/phase-48-operational-assignment-identities.sql','utf8'));
    await db.exec(readFileSync('sql/phase-48-operational-assignment-identities.sql','utf8'));
    const target={institucion_id:'1',sede_id:'1',modalidad_id:'2'};
    const input=(fecha='2026-09-07',destination=target)=>({periodo_id:'1',nomina_empleado_id:'20',vinculacion_id:'10',tipo:'CAMBIO_DE_MODALIDAD',
      fecha_inicio_efectiva:fecha,regla_fecha_efectiva:'MISMO_DIA',contexto_anterior:{},contexto_nuevo:destination,motivo:'Cambio solicitado'});
    const previewFor=(payload:any)=>service.previewCambioModalidad(payload);
    const save=async(payload:any)=>{const before=await previewFor(payload);return service.crearCambioOperativo({...payload,preview_revision:before.revision},'7');};
    const snapshot=async()=>JSON.stringify((await query(`SELECT
      (SELECT jsonb_agg(t) FROM focalizacion_final t) ff,(SELECT jsonb_agg(t) FROM vinculaciones t) v,
      (SELECT jsonb_agg(t) FROM personal_asignaciones_laborales t) pal,
      (SELECT jsonb_agg(t) FROM nomina_asistencia_diaria t) a,(SELECT jsonb_agg(t) FROM nomina_novedades t) n,
      (SELECT jsonb_agg(t) FROM nomina_turnos t) turnos,
      (SELECT jsonb_agg(t) FROM nomina_contextos_operativos_base t WHERE periodo_id=9) cerrado`)).rows);
    const protectedBefore=await snapshot();
    await t.test('catálogo destino CAA sin focalización ni asignación ni relación vigente en la sede',async()=>{
      const options=await service.opcionesCambioModalidad('1','10');
      assert.deepEqual(options.map((row:any)=>row.modalidad),['CAA','RI']);
      assert.equal((await previewFor(input())).categoria_propuesta.id,'2');
    });
    let first:any;
    await t.test('RI hasta el 6 y CAA desde el 7: historial, dos tramos, sin duplicar identidad ni días',async()=>{
      first=await save(input());
      const ranges=await service.resolverTramos('1','10');
      assert.deepEqual(Array.from(ranges,(row:any)=>[row.fecha_inicio,row.fecha_fin,row.contexto.modalidad,row.contexto.categoria_id]),
        [['2026-09-01','2026-09-06','RI','1'],['2026-09-07','2026-09-30','CAA','2']]);
      assert.equal(ranges.reduce((sum:number,row:any)=>sum+row.dias,0),30);
      assert.equal((await query('SELECT * FROM cobertura_asignaciones WHERE activo')).rows.length,2);
      assert.equal(await snapshot(),protectedBefore);
      assert.deepEqual((await query('SELECT requiere_recalculo,valor::int FROM nomina_liquidaciones ORDER BY id')).rows,[{requiere_recalculo:true,valor:100},{requiere_recalculo:true,valor:200},{requiere_recalculo:false,valor:300}]);
    });
    await t.test('Planilla resuelve cada fecha y Personal mantiene la fuente vigente',async()=>{
      for(let day=1;day<=30;day++) {
        const fecha=`2026-09-${String(day).padStart(2,'0')}`;
        assert.equal((await service.resolverContextoFecha('1','10',fecha)).contexto.modalidad,day<7?'RI':'CAA');
        assert.equal((await context.resolveOperationalContextAtDate({empresaId:1,contratoId:1,vinculacionId:10,fecha},pool)).modalidad,day<7?'RI':'CAA');
      }
    });
    await t.test('expediente Personal consulta la vigencia histórica conservando la asignación laboral',async()=>{
      const personalQuery=async(sql:string,values?:any[])=>{
        if(sql.includes('FROM personal_asignaciones_laborales') || sql.includes('FROM personal_presentaciones_licitacion') || sql.includes('SELECT usuario_id::text AS id'))return {rows:[],rowCount:0};
        if(sql.includes('FROM vinculaciones v'))return {rows:[{id:'10',contrato_id:'1',contrato_cargo_id:null,cargo_nombre:'MANIPULADORA'}],rowCount:1};
        const result=await query(sql,values);
        return {...result,rows:result.rows.map((row:any)=>({...row,created_at:new Date('2026-01-01T00:00:00Z')}))};
      };
      const personal=load('src/modules/vinculaciones/vinculaciones.personal.service.ts',{
        ...deps,'../../config/db':{dbQuery:personalQuery,dbPool:{query:personalQuery,connect:async()=>({query:personalQuery,release(){}})}},
        '../nomina/infrastructure/repositories/nomina-poblacion.repository':deps['./infrastructure/repositories/nomina-poblacion.repository'],
        '../documentos/documentos.checklist.service':{},'./vinculaciones.personal.domain':{looksLikeManipuladoraCargo:()=>true,gestorApplicableCargoSql:()=> 'TRUE'},
      });
      // listAsignacionesOperativas uses these real persisted assignment rows;
      // unrelated document/gestor catalogs are isolated empty fixtures.
      for(const [fecha,expected] of [['2026-09-06','RI'],['2026-09-07','CAA']]) {
        const result=await personal.getVinculacionPersonalContext(10,undefined,fecha);
        assert.equal(result.asignacion_operativa_actual.modalidad,expected);
        assert.equal(result.historial_asignacion_operativa.length,2);
      }
      assert.equal(await snapshot(),protectedBefore);
    });
    await t.test('motor económico usa categorías por tramo RI/CAA y distribuye 30 días una vez',async()=>{
      const rows=await salary.canonicalSalaryTimeline(pool,salaryInput);
      assert.deepEqual(Array.from(rows,(row:any)=>[row.fecha_inicio,row.fecha_fin,row.contexto.categoria_id]),
        [['2026-09-01','2026-09-06','1'],['2026-09-07','2026-09-30','2']]);
      const result=calculateCoberturaPayroll({empleo:{fecha_inicio:'2026-09-01',fecha_fin:'2026-09-30'},dias_efectos:[],aporta_pension:false,
        tramos:rows.map((row:any)=>({...row,categoria:{categoria_id:row.contexto.categoria_id,codigo_categoria:row.categoria.codigo_categoria,
          nombre_categoria:row.categoria.nombre_categoria,salario_base:Number(row.categoria.salario_base),auxilio_transporte:0,recargo_mensual:0}}))});
      assert.equal(result.salario_ordinario,5400);assert.equal(result.dias_salario,30);
    });
    await t.test('reintento idéntico es idempotente; versión inmutable',async()=>{
      const repeated=await service.crearCambioOperativo(input(),'7');
      assert.equal(repeated.id,first.id);
      assert.equal((await query('SELECT * FROM nomina_movimientos')).rows.length,1);
      await assert.rejects(()=>service.actualizarCambioOperativo(first.id,{motivo:'Reescribir'},'7'),{code:'ASIGNACION_HISTORIAL_INMUTABLE'});
    });
    await t.test('CAA → RI conserva las tres versiones',async()=>{
      await save(input('2026-09-15',{...target,modalidad_id:'1'}));
      assert.deepEqual(Array.from(await service.resolverTramos('1','10'),(row:any)=>row.contexto.modalidad),['RI','CAA','RI']);
    });
    await t.test('categoría ambigua y ausente requieren revisión',async()=>{
      await query("INSERT INTO nomina_categorias_salariales(id,contrato_id,modalidad,codigo_categoria,nombre_categoria,activo) VALUES(3,1,'CAA','CAA2','Ambigua',TRUE)");
      assert.equal((await previewFor(input('2026-09-20'))).estado_salarial,'REQUIERE_REVISION_SALARIAL');
      await assert.rejects(()=>salary.canonicalSalaryTimeline(pool,salaryInput),{code:'REQUIERE_REVISION_SALARIAL'});
      await query("DELETE FROM nomina_categorias_salariales WHERE modalidad='CAA'");
      const result=await previewFor(input('2026-09-20'));assert.equal(result.categoria_propuesta,null);
      await assert.rejects(()=>salary.canonicalSalaryTimeline(pool,salaryInput),{code:'REQUIERE_REVISION_SALARIAL'});
      await save(input('2026-09-20'));
      assert.equal((await service.resolverContextoFecha('1','10','2026-09-20')).contexto.estado_salarial,'REQUIERE_REVISION_SALARIAL');
      await query("INSERT INTO nomina_categorias_salariales(id,contrato_id,modalidad,codigo_categoria,nombre_categoria,activo,vigente_desde) VALUES(2,1,'CAA','CAA','Categoría CAA',TRUE,'2026-01-01')");
    });
    await t.test('cierre y anulación del período afectado impiden guardar',async()=>{
      for(const state of ['CERRADO','ANULADO']) {
        await query('UPDATE nomina_periodos SET estado=$1 WHERE id=1',[state]);
        await assert.rejects(()=>save(input('2026-09-25',{...target,modalidad_id:'1'})),{code:'NOMINA_CAMBIO_PERIODO_CERRADO'});
      }
      await query("UPDATE nomina_periodos SET estado='ABIERTO' WHERE id=1");
      await query("UPDATE nomina_periodos SET estado='CERRADO' WHERE id=2");
      await assert.rejects(()=>save(input('2026-09-25',{...target,modalidad_id:'1'})),{code:'NOMINA_CAMBIO_PERIODO_CERRADO'});
      await query("UPDATE nomina_periodos SET estado='ABIERTO' WHERE id=2");
    });
    await t.test('fecha inválida/fuera del contrato y aislamiento de destino/identidad',async()=>{
      for(const fecha of ['2026-02-30','2025-12-31','2027-01-01']) await assert.rejects(()=>previewFor(input(fecha)));
      await assert.rejects(()=>previewFor(input('2026-09-25',{...target,modalidad_id:'3'})),{code:'NOMINA_CAMBIO_CONTEXTO_INVALIDO'});
      await assert.rejects(()=>previewFor({...input(),vinculacion_id:'11'}),{code:'TENANT'});
      await assert.rejects(()=>previewFor({...input(),periodo_id:'999'}),{code:'NOMINA_CAMBIO_EMPLEADO_INVALIDO'});
    });
    await t.test('solapamiento y hueco rechazados sin reparación silenciosa',async()=>{
      await query("UPDATE cobertura_asignaciones SET fecha_fin='2026-09-07' WHERE fecha_inicio='2026-09-01'");
      await assert.rejects(()=>previewFor(input('2026-09-25')),{code:'ASIGNACION_OPERATIVA_SOLAPADA'});
      await query("UPDATE cobertura_asignaciones SET fecha_fin='2026-09-05' WHERE fecha_inicio='2026-09-01'");
      await assert.rejects(()=>previewFor(input('2026-09-25')),{code:'ASIGNACION_OPERATIVA_HUECO'});
      await query("UPDATE cobertura_asignaciones SET fecha_fin='2026-09-06' WHERE fecha_inicio='2026-09-01'");
    });
    await t.test('vista previa no escribe; confirmación caducada bloqueada',async()=>{
      const counts=JSON.stringify((await query('SELECT * FROM nomina_movimientos ORDER BY id')).rows);
      const payload=input('2026-09-25',{...target,modalidad_id:'1'});const before=await previewFor(payload);
      assert.equal(JSON.stringify((await query('SELECT * FROM nomina_movimientos ORDER BY id')).rows),counts);
      await query("UPDATE nomina_categorias_salariales SET nombre_categoria='Cambio de regla' WHERE id=1");
      await assert.rejects(()=>service.crearCambioOperativo({...payload,preview_revision:before.revision},'7'),{code:'ASIGNACION_PREVIEW_DESACTUALIZADO'});
      assert.equal(JSON.stringify((await query('SELECT * FROM nomina_movimientos ORDER BY id')).rows),counts);
    });
    for(const [label,fecha,periodo,empleado] of [['primer día','2026-09-01','1','20'],['último día','2026-09-30','1','20'],['futuro','2026-10-07','2','21']] as const) {
      await t.test(`cambio ${label} no duplica días ni sobrescribe historia`,async()=>{
        await query('DELETE FROM nomina_movimientos');await query('DELETE FROM nomina_contextos_operativos_base');await query('DELETE FROM cobertura_asignaciones');
        await query(`INSERT INTO cobertura_asignaciones(contrato_id,vinculacion_id,municipio_id,institucion_id,sede_id,modalidad_id,institucion,sede,modalidad,tipo_asignacion,porcentaje_cobertura,fecha_inicio,fecha_fin,activo)
          VALUES(1,10,1,1,1,1,'Institución','Sede','RI','PRINCIPAL',1,'2026-09-01','2026-12-31',TRUE)`);
        const payload={...input(fecha),periodo_id:periodo,nomina_empleado_id:empleado};
        // Scope check permits this same identity's next period employee.
        deps['./nomina.procesos'].assertNominaEmpleadoCoberturaScope=async(id:string)=>assert.ok(['20','21'].includes(id));
        await save(payload);
        const rows=await service.resolverTramos(periodo,'10');
        assert.equal(rows.reduce((sum:number,row:any)=>sum+row.dias,0),periodo==='1'?30:31);
        assert.equal((await query('SELECT * FROM cobertura_asignaciones')).rows.length,2);
      });
    }
  } finally {await db.close();}
});

test('RBAC de modalidad: ADMINISTRADOR, TH efectivo y GESTOR incluso con permiso',()=>{
  for(const [roles,permissions,allowed] of [
    [['ADMINISTRADOR'],[],true],[['TALENTO_HUMANO'],['nomina.movimientos.create'],true],
    [['TALENTO_HUMANO'],[],false],[['GESTOR'],['nomina.movimientos.create'],false],[['LECTOR'],['nomina.movimientos.create'],false],
  ] as const) {
    let error:any;requireOperationalChange()({user:{roles,permissions}} as any,{} as any,err=>{error=err;});
    assert.equal(!error,allowed);
  }
});
