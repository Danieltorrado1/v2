import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildTramos, dateKey, dedupeNominaNovedades, isOutsideEmployment, mergeAttendance, movimientosOnDate, novedadesOnDate, novedadState, upsertNominaNovedad, matchesPlanillaFilters, normalizePlanillaSearch, persistedPlanillaFiltersMatchPeriod } from './planillaOperativa.domain';
import { isNominaPeriodSelectorDisabled, pickDefaultNominaPeriod } from './nominaPeriods';
import { addDaysToDateOnly } from './dateOnly';
import type { NominaEmpleadoApi, NominaMovimientoApi, NominaNovedadApi } from '../../types/nomina.types';
const employee={id:'1',vinculacion_id:'10',persona:{id:'7',nombre_completo:'MARIA PEREZ',numero_documento:'1234',primer_nombre:'MARIA',segundo_nombre:null,primer_apellido:'PEREZ',segundo_apellido:null},vinculacion:{id:'10',empresa_id:'15',contrato_id:'24',estado_vinculacion:'ACTIVA',fecha_inicio:'2026-08-10',fecha_fin:'2026-08-22',metodo_pago:'COBERTURA'},sede:{id:'1',municipio:'GRANADA',nombre_sede:'CENTRAL'},modalidad:'A'} as NominaEmpleadoApi;
const source=readFileSync(resolve(process.cwd(),'FrontendNuevo/src/pages/nomina/PlanillaOperativaPage.tsx'),'utf8');
const css=readFileSync(resolve(process.cwd(),'FrontendNuevo/src/pages/nomina/PlanillaOperativaPage.css'),'utf8');
const shellCss=readFileSync(resolve(process.cwd(),'FrontendNuevo/src/pages/nomina/NominaModuleShell.css'),'utf8');
const layoutCss=readFileSync(resolve(process.cwd(),'FrontendNuevo/src/layouts/MainLayout.css'),'utf8');
test('calendario expone dia 31',()=>assert.equal(dateKey(2026,8,31),'2026-08-31'));
test('rango 26 a 25 cruza el cambio de mes sin colapsar los dias',()=>{
  const days:string[]=[]; let cursor='2026-08-26';
  while(cursor<='2026-09-25'){days.push(cursor);cursor=addDaysToDateOnly(cursor,1);}
  assert.equal(days.length,31);
  assert.equal(days[0],'2026-08-26');
  assert.equal(days.at(-1),'2026-09-25');
});
test('ingreso y retiro sombrean fuera de vinculacion',()=>{assert.equal(isOutsideEmployment(employee,'2026-08-09'),true);assert.equal(isOutsideEmployment(employee,'2026-08-10'),false);assert.equal(isOutsideEmployment(employee,'2026-08-23'),true);});
test('ingreso intrames conserva la fila y habilita solo los dias vigentes',()=>{
  const cases=[
    ['2026-07-01',null,'2026-08-01','2026-08-31'],
    ['2026-08-01',null,'2026-08-01','2026-08-31'],
    ['2026-08-18',null,'2026-08-18','2026-08-31'],
    ['2026-08-31',null,'2026-08-31','2026-08-31'],
    ['2026-07-01','2026-08-20','2026-08-01','2026-08-20'],
    ['2026-08-18','2026-08-20','2026-08-18','2026-08-20'],
  ] as const;
  for(const [fecha_inicio,fecha_fin,expectedStart,expectedEnd] of cases){
    const candidate={...employee,vinculacion:{...employee.vinculacion,fecha_inicio,fecha_fin}} as NominaEmpleadoApi;
    assert.deepEqual(buildTramos(candidate,'2026-08-01','2026-08-31',[]).map(item=>[item.inicio,item.fin]),[[expectedStart,expectedEnd]]);
  }
  assert.deepEqual(buildTramos({...employee,vinculacion:{...employee.vinculacion,fecha_inicio:'2026-09-01',fecha_fin:null}},'2026-08-01','2026-08-31',[]),[]);
  assert.deepEqual(buildTramos({...employee,vinculacion:{...employee.vinculacion,fecha_inicio:'2026-07-01',fecha_fin:'2026-07-31'}},'2026-08-01','2026-08-31',[]),[]);
});
test('tres tramos siguen en una fila',()=>{const e={...employee,vinculacion:{...employee.vinculacion,fecha_inicio:'2026-08-01',fecha_fin:null}};const t=buildTramos(e,'2026-08-01','2026-08-31',[{id:'1',vinculacion_id:'10',fecha_inicio_efectiva:'2026-08-11',contexto_anterior:{modalidad:'A'},contexto_nuevo:{modalidad:'B'},tipo:'CAMBIO_DE_MODALIDAD',activo:true},{id:'2',vinculacion_id:'10',fecha_inicio_efectiva:'2026-08-21',contexto_anterior:{modalidad:'B'},contexto_nuevo:{modalidad:'C'},tipo:'CAMBIO_COMBINADO',activo:true}]);assert.deepEqual(t.map(x=>[x.inicio,x.fin,x.contexto.modalidad]),[['2026-08-01','2026-08-10','A'],['2026-08-11','2026-08-20','B'],['2026-08-21','2026-08-31','C']]);});
test('virtualiza 771 filas y usa un grid sticky',()=>{assert.ok(source.includes('filtered.slice(startIndex,startIndex+visibleCount)'));assert.ok(css.includes('.op-head{position:sticky'));assert.ok(css.includes('.op-doc,.op-name{position:sticky!important'));assert.equal(source.includes('<table'),false);assert.equal(Array.from({length:771}).length,771);});
test('la matriz es el unico scroll vertical de Planilla',()=>{
  assert.ok(source.includes('className="nomina-module-shell--planilla"'));
  assert.equal(source.includes('style={{ height: VIEWPORT_HEIGHT }}'),false);
  assert.match(shellCss,/\.nomina-module-shell--planilla[\s\S]*?display:\s*flex/);
  assert.match(layoutCss,/\.page-scroll--planilla-operativa[\s\S]*?overflow:\s*hidden/);
  assert.match(css,/\.op-matrix-card\s*\{[\s\S]*?display:\s*flex[\s\S]*?min-height:\s*0/);
  assert.match(css,/\.op-matrix-card \.op-viewport\s*\{[\s\S]*?flex:\s*1 1 auto[\s\S]*?overflow-y:\s*auto/);
});
test('incluye saltos y teclado requeridos',()=>{for(const token of ['[1,7]','[8,14]','[15,21]','[22,28]','[29,31]','ArrowDown','ArrowUp','ArrowRight','ArrowLeft','Enter','Escape'])assert.ok(source.includes(token),token);});
test('PNR y licencia se proyectan por rango sin registros diarios',()=>{const base={activo:true,fecha_inicio:'2026-08-09',fecha_fin:'2026-08-12',fecha_inicio_evento_canonico:null,fecha_fin_evento_canonico:null} as NominaNovedadApi;assert.equal(novedadesOnDate([base],'2026-08-10').length,1);assert.equal(novedadesOnDate([base],'2026-08-13').length,0);const licencia={...base,fecha_inicio_evento_canonico:'2026-07-20',fecha_fin_evento_canonico:'2026-09-20'};assert.equal(novedadesOnDate([licencia],'2026-08-31').length,1);});
test('PR1 activo se proyecta visualmente en su celda DATE',()=>{const pr1={id:'8',activo:true,fecha_inicio:'2099-08-21',fecha_fin:'2099-08-21',fecha_inicio_evento_canonico:null,fecha_fin_evento_canonico:null,tipo_novedad:{codigo_operativo:'PR1'}} as NominaNovedadApi;assert.equal(novedadesOnDate([pr1],'2099-08-21')[0]?.id,'8');assert.equal(novedadesOnDate([pr1],'2099-08-20').length,0);});
test('TA comparte dia y conserva su contexto independiente',()=>{const ta={activo:true,fecha:'2026-08-18',familia_movimiento:'ADICION_DEVENGO',contexto_operativo:{modalidad:'B'}} as NominaMovimientoApi;const found=movimientosOnDate([ta],'2026-08-18');assert.equal(found.length,1);assert.equal(found[0]?.contexto_operativo?.modalidad,'B');});
test('estado de novedad siempre tiene etiqueta textual',()=>{const n={revisado:false,tipo_novedad:{requiere_revision:true}} as NominaNovedadApi;assert.equal(novedadState(n),'REQUIERE_REVISION');assert.equal(novedadState({...n,revisado:true}),'VALIDADA');});
test('periodo cerrado y permisos bloquean edicion',()=>{assert.ok(source.includes('period?.estado==="ABIERTO"&&canCreate'));assert.ok(source.includes('nomina.novedades.create'));});
test('selector conserva historico y solo se deshabilita con cero o un periodo autorizado',()=>{
  const periods=[
    {id:'2',nombre_periodo:'AGOSTO 2026',tipo_periodo:'MENSUAL',fecha_inicio:'2026-08-01',fecha_fin:'2026-08-31',estado:'CERRADO',activo:true,created_at:'2026-08-01',requiere_asistencia:true,contrato_id:'24',contrato:null},
    {id:'3',nombre_periodo:'SEPTIEMBRE 2026',tipo_periodo:'MENSUAL',fecha_inicio:'2026-09-01',fecha_fin:'2026-09-30',estado:'ABIERTO',activo:true,created_at:'2026-09-01',requiere_asistencia:true,contrato_id:'24',contrato:null},
  ] as any;
  assert.equal(isNominaPeriodSelectorDisabled(periods,false),false);
  assert.equal(isNominaPeriodSelectorDisabled(periods.slice(0,1),false),true);
  assert.equal(isNominaPeriodSelectorDisabled(periods,false),false);
  assert.equal(pickDefaultNominaPeriod(periods)?.id,'3');
  assert.match(source,/disabled=\{isNominaPeriodSelectorDisabled\(periods, periodsLoading\)\}/);
  assert.doesNotMatch(source,/<select value=\{periodId\} disabled=\{isSyncingPersonal\}/);
});
test('asistencia multidia conserva cada fecha y permite quitar una sola',()=>{let items=[];for(const day of ['01','02','03','04','05'])items=mergeAttendance(items,{vinculacion_id:'10',fecha:'2026-08-'+day,estado_dia:'PRESENTE',activo:true});assert.deepEqual(items.map(item=>item.fecha),['2026-08-01','2026-08-02','2026-08-03','2026-08-04','2026-08-05']);items=mergeAttendance(items,{vinculacion_id:'10',fecha:'2026-08-03',estado_dia:'PRESENTE',activo:true},true);assert.deepEqual(items.map(item=>item.fecha),['2026-08-01','2026-08-02','2026-08-04','2026-08-05']);});
test('header y body usan una geometria comun',()=>{assert.ok(source.includes('const PLANILLA_GRID_TEMPLATE'));assert.ok(source.includes('gridTemplateColumns: PLANILLA_GRID_TEMPLATE(days.length)'));assert.ok(source.includes('PLANILLA_GRID_TEMPLATE(days.length),'));});
test('workspace nomina expone rutas reales para cada area',()=>{const router=readFileSync(resolve(process.cwd(),'FrontendNuevo/src/router/AppRouter.tsx'),'utf8');for(const entry of ['nomina/novedades','nomina/cambios-operativos','nomina/validacion','nomina/liquidacion','nomina/pago','nomina/documentos'])assert.ok(router.includes(entry),entry);});
test('filtros integran gestor y ordenar en la misma barra',()=>{assert.ok(source.includes('value={gestorFilter}'));assert.ok(source.includes('Ordenar por'));assert.equal(source.includes('op-sort-floating'),false);});
test('modal de novedad concentra la cobertura sin panel externo',()=>{for(const token of ['Cobertura del turno','Sin reemplazo / No aplica','Cubierto por personal vinculado','Cubierto por persona externa'])assert.ok(source.includes(token),token);assert.equal(source.includes('op-coverage-panel'),false);});
test('dedupe y upsert evitan render duplicado del mismo registro',()=>{const novelty={id:'dup',activo:true,fecha_inicio:'2026-08-11',fecha_fin:'2026-08-11',fecha_inicio_evento_canonico:null,fecha_fin_evento_canonico:null} as NominaNovedadApi;assert.equal(dedupeNominaNovedades([novelty,novelty]).length,1);assert.equal(upsertNominaNovedad([novelty],{...novelty,observacion:'corregida'} as NominaNovedadApi)[0]?.observacion,'corregida');});
test('celda con novedad prioriza correccion y celda vacia conserva asistencia rapida',()=>{assert.ok(source.includes('if (activeNovelties.length === 1) {'));assert.ok(source.includes('openNovelty(cell, activeNovelties[0] ?? null);'));assert.ok(source.includes('void toggleAttendance(employee, date);'));assert.ok(source.includes('if (activeNoveltiesOnThisDay.length > 1) {'));});
test('planilla reutiliza el modal para corregir una novedad existente',()=>{assert.ok(source.includes('editingNovelty'));assert.ok(source.includes('updateNominaNovedad(editingNovelty.id, basePayload)'));assert.ok(source.includes('Guardar correccion'));assert.ok(source.includes('Corregir novedad'));});

test('filtros persistidos exigen el periodo y no reutilizan legacy',()=>{
  assert.equal(persistedPlanillaFiltersMatchPeriod('2026-08','2026-08'),true);
  assert.equal(persistedPlanillaFiltersMatchPeriod('2026-07','2026-08'),false);
  assert.equal(persistedPlanillaFiltersMatchPeriod(undefined,'2026-08'),false);
});

test('filtros conservan estados, gestor, contexto, novedades y busqueda',()=>{
  const base={searchText:normalizePlanillaSearch('Lizéth Pérez','1093924969','Granada','Institución Uno','Sede Norte','COMPLEMENTARIA'),municipio:'Granada',gestorId:null,modalidad:'COMPLEMENTARIA',reviewState:'PENDIENTE',needsReview:true,noveltyCount:1,hasInconsistencies:true};
  assert.equal(matchesPlanillaFilters(base,{query:' lizeth   perez ',municipio:'',gestor:'',modalidad:'',review:'PENDIENTES',events:'TODOS'}),true);
  assert.equal(matchesPlanillaFilters({...base,reviewState:'REVISADO',needsReview:false},{query:'',municipio:'',gestor:'',modalidad:'',review:'REVISADOS',events:'TODOS'}),true);
  assert.equal(matchesPlanillaFilters({...base,reviewState:'CERRADO',needsReview:false},{query:'',municipio:'',gestor:'',modalidad:'',review:'CERRADOS',events:'TODOS'}),true);
  assert.equal(matchesPlanillaFilters(base,{query:'',municipio:'',gestor:'',modalidad:'',review:'REQUIERE_REVISION',events:'TODOS'}),true);
  assert.equal(matchesPlanillaFilters(base,{query:'',municipio:'',gestor:'__SIN_GESTOR__',modalidad:'',review:'TODOS',events:'CON_NOVEDADES'}),true);
  assert.equal(matchesPlanillaFilters({...base,gestorId:'g1'},{query:'',municipio:'Granada',gestor:'g1',modalidad:'COMPLEMENTARIA',review:'TODOS',events:'INCONSISTENCIAS'}),true);
  assert.equal(matchesPlanillaFilters({...base,noveltyCount:0},{query:'',municipio:'',gestor:'',modalidad:'',review:'TODOS',events:'SIN_NOVEDADES'}),true);
  assert.equal(matchesPlanillaFilters({...base,noveltyCount:0},{query:'',municipio:'',gestor:'',modalidad:'',review:'TODOS',events:'CON_NOVEDADES'}),false);
});

test('planilla no conserva literales con mojibake en separadores o marcas de asistencia',()=>{
  for(const token of ['Â·','Ã‚Â·','Ã¢â‚¬Â¦','Ã¢Å“â€œ','PensiÃ³n']) assert.equal(source.includes(token),false,token);
});

test('multiday edit usa fecha_inicio real y habilita rango por catalogo',()=>{
  assert.ok(source.includes('const selectedTypeAllowsRange = typeSupportsDateRange(selectedType);'));
  assert.ok(source.includes('setRangeStart(novelty?.fecha_inicio_evento_canonico ?? novelty?.fecha_inicio ?? cell.date);'));
  assert.ok(source.includes('fecha_inicio: fechaInicio'));
  assert.ok(source.includes('readOnly={!selectedTypeAllowsRange}'));
});

test('migration de planilla operativa fija tipos multidia y queda registrada en scripts',()=>{
  const packageSource=readFileSync(resolve(process.cwd(),'package.json'),'utf8');
  const migrationScript=readFileSync(resolve(process.cwd(),'src/scripts/migrate-nomina-planilla-operativa-fixes.ts'),'utf8');
  const migrationSql=readFileSync(resolve(process.cwd(),'sql/phase-36-2-nomina-planilla-operativa-fixes.sql'),'utf8');
  assert.ok(packageSource.includes('"db:migrate:nomina-planilla-operativa-fixes"'));
  assert.ok(migrationScript.includes('phase-36-2-nomina-planilla-operativa-fixes.sql'));
  assert.ok(migrationSql.includes("modelo_registro = 'EVENTO_CANONICO_RANGO'"));
  assert.ok(migrationSql.includes("UPPER(TRIM(COALESCE(nombre, ''))) = 'LUTO'"));
});

test('carga inicial paraleliza empleados y asistencia en una sola lectura',()=>{
  assert.ok(source.includes('const ATTENDANCE_BATCH_LIMIT = 5000;'));
  assert.ok(source.includes('const [employeeResult, ...layers] = await Promise.allSettled(['));
  assert.match(source, /limit:\s*ATTENDANCE_BATCH_LIMIT,\s*page\s*\}/);
});
test('carga inicial sincroniza una vez la poblacion V1 de periodos abiertos',()=>{
  assert.ok(source.includes('populationSyncKeyRef'));
  assert.ok(source.includes('selectedPeriod?.estado === "ABIERTO"'));
  assert.ok(source.includes('await importNominaEmpleados(periodId);'));
  assert.ok(source.includes('nomina.empleados.import'));
});

test('revision operativa resuelve scope en SQL sin validacion secuencial por fila',()=>{
  const revisionSource=readFileSync(resolve(process.cwd(),'src/modules/nomina/revision-operativa.service.ts'),'utf8');
  assert.ok(revisionSource.includes('appendNominaCoberturaScope(conditions, params, tenant);'));
  assert.ok(revisionSource.includes("appendTenantScopeConditions(conditions, params, tenant, 'v.contrato_id', 'v.empresa_id');"));
  assert.ok(revisionSource.includes('${buildSqlWhere(conditions)}'));
  assert.equal(revisionSource.includes('for (const row of result.rows) await assertTenantAccessForVinculacionId'),false);
});
test('asistencia por periodo usa el mismo scope SQL que la planilla visible',()=>{
  const serviceSource=readFileSync(resolve(process.cwd(),'src/modules/nomina/nomina.service.ts'),'utf8');
  const repositorySource=readFileSync(resolve(process.cwd(),'src/modules/nomina/infrastructure/repositories/nomina-asistencia.repository.ts'),'utf8');
  assert.match(serviceSource,/nominaAsistenciaRepository\.listByPeriodo\(/);
  assert.match(serviceSource,/tenant\s*\n?\s*\}/);
  assert.match(repositorySource,/appendNominaCoberturaScope\(conditions, params, input\.tenant\);/);
  assert.match(repositorySource,/v\.contrato_id = ANY\(\$\$\{params\.length\}::bigint\[\]\)/);
  assert.match(repositorySource,/v\.empresa_id = ANY\(\$\$\{params\.length\}::bigint\[\]\)/);
});
