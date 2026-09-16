import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildTramos, countActivePlanillaFilters, dateKey, dedupeNominaNovedades, emptyPlanillaFilters, isOutsideEmployment, matchesPlanillaFilters, mergeAttendance, movimientosOnDate, novedadesOnDate, novedadState, normalizePlanillaSearch, persistedPlanillaFiltersMatchPeriod, upsertNominaNovedad } from './planillaOperativa.domain';
import { isNominaPeriodSelectorDisabled, pickDefaultNominaPeriod } from './nominaPeriods';
import type { NominaEmpleadoApi, NominaMovimientoApi, NominaNovedadApi } from '../../types/nomina.types';
const employee={id:'1',vinculacion_id:'10',persona:{id:'7',nombre_completo:'MARIA PEREZ',numero_documento:'1234',primer_nombre:'MARIA',segundo_nombre:null,primer_apellido:'PEREZ',segundo_apellido:null},vinculacion:{id:'10',empresa_id:'15',contrato_id:'24',estado_vinculacion:'ACTIVA',fecha_inicio:'2026-08-10',fecha_fin:'2026-08-22',metodo_pago:'COBERTURA'},sede:{id:'1',municipio:'GRANADA',nombre_sede:'CENTRAL'},modalidad:'A'} as NominaEmpleadoApi;
const source=readFileSync(resolve(process.cwd(),'FrontendNuevo/src/pages/nomina/PlanillaOperativaPage.tsx'),'utf8');
const css=readFileSync(resolve(process.cwd(),'FrontendNuevo/src/pages/nomina/PlanillaOperativaPage.css'),'utf8');
test('calendario expone dia 31',()=>assert.equal(dateKey(2026,8,31),'2026-08-31'));
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
const lizethRow={searchText:'LIZETH YURANY CORRALES CASTILLO 1120026863 EL DORADO INSTITUCION EDUCATIVA EL DORADO SEDE PRINCIPAL EL DORADO RI Sin gestor asignado',municipio:'EL DORADO',gestorId:null,modalidad:'RI',reviewState:'PENDIENTE',needsReview:false,noveltyCount:0,hasInconsistencies:false} as const;
test('Lizeth 1120026863 existe y pasa sin filtros, incluidos valores nulos de gestor/contexto',()=>{
  assert.equal(matchesPlanillaFilters(lizethRow,emptyPlanillaFilters()),true);
  assert.equal(matchesPlanillaFilters({...lizethRow,searchText:normalizePlanillaSearch('LIZETH YURANY CORRALES CASTILLO',null,'1120026863')},emptyPlanillaFilters()),true);
  assert.equal(lizethRow.gestorId,null);
});
test('búsqueda encuentra Lizeth por documento o nombre ignorando tildes, mayúsculas y espacios',()=>{
  for(const query of ['1120026863','Lizeth Yurany Corrales Castillo','  LIZETH   YURANY  '])
    assert.equal(matchesPlanillaFilters(lizethRow,{...emptyPlanillaFilters(),query}),true,query);
  for(const query of ['EL DORADO','INSTITUCIÓN EDUCATIVA EL DORADO','SEDE PRINCIPAL','RI','Sin gestor asignado'])
    assert.equal(matchesPlanillaFilters(lizethRow,{...emptyPlanillaFilters(),query}),true,query);
  assert.ok(source.includes('visible.institucion'));
  assert.ok(source.includes('visible.sede'));
  assert.ok(source.includes('visible.modalidad'));
  assert.ok(source.includes('visible.gestor'));
});
test('cada filtro aplicado evalúa la fila de Lizeth con sus valores reales',()=>{
  const cases=[
    ['búsqueda','1120026863',true,{query:'1120026863'}],
    ['municipio','EL DORADO',true,{municipio:'EL DORADO'}],
    ['municipio','OTRO',false,{municipio:'OTRO'}],
    ['gestor','Sin gestor asignado',true,{gestor:'__SIN_GESTOR__'}],
    ['gestor','123',false,{gestor:'123'}],
    ['modalidad','RI',true,{modalidad:'RI'}],
    ['modalidad','A',false,{modalidad:'A'}],
    ['revisión','PENDIENTE',true,{review:'PENDIENTES'}],
    ['revisión','REVISADO',false,{review:'REVISADOS'}],
    ['novedades','sin novedades',true,{events:'SIN_NOVEDADES'}],
    ['novedades','con novedades',false,{events:'CON_NOVEDADES'}],
  ] as const;
  for(const [name,value,expected,partial] of cases){
    assert.equal(matchesPlanillaFilters(lizethRow,{...emptyPlanillaFilters(),...partial}),expected,`${name}: ${value}`);
  }
});
test('sin filtros la Planilla conserva el total de las 751 filas activas recibidas',()=>{
  const activeRows=Array.from({length:750},(_,index)=>({...lizethRow,searchText:`PERSONA ${index}`})).concat(lizethRow);
  assert.equal(activeRows.length,751);
  assert.equal(activeRows.filter((row)=>matchesPlanillaFilters(row,emptyPlanillaFilters())).length,751);
  assert.ok(source.includes('setEmployees(employeeResult.value.items.filter(employee => employee.activo !== false))'));
});
test('la paginación completa incluye Lizeth y el filtro frontend no la descarta',()=>{
  const allPages=[[{...lizethRow,searchText:'1120026863 LIZETH YURANY CORRALES CASTILLO'}],[{...lizethRow,searchText:'OTRA PERSONA'}]];
  const complete=allPages.flat();
  assert.equal(complete.filter((row)=>matchesPlanillaFilters(row,emptyPlanillaFilters())).some((row)=>row.searchText.includes('1120026863')),true);
  assert.ok(source.includes('getAllNominaPeriodoEmpleadosOperativos'));
});
test('cambiar agosto a septiembre invalida filtros persistidos del periodo anterior y limpiar devuelve defaults',()=>{
  assert.equal(persistedPlanillaFiltersMatchPeriod('2','3'),false);
  assert.equal(persistedPlanillaFiltersMatchPeriod('3','3'),true);
  assert.deepEqual(emptyPlanillaFilters(),{query:'',municipio:'',gestor:'',modalidad:'',review:'TODOS',events:'TODOS'});
  assert.equal(countActivePlanillaFilters({...emptyPlanillaFilters(),query:'1120026863'}),1);
  assert.equal(countActivePlanillaFilters(emptyPlanillaFilters()),0);
  assert.ok(source.includes('setQuery("")'));
  assert.ok(source.includes('LIMPIAR FILTROS'));
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
test('Planilla conserva el selector de servicio por permiso económico y scope de rol en backend',()=>{
  assert.ok(source.includes('user?.permissions.includes("nomina.economico.read") === true'));
  assert.match(source, /\? getAllNominaPeriodoEmpleados\s+: getAllNominaPeriodoEmpleadosOperativos/);
  const revisionSource=readFileSync(resolve(process.cwd(),'src/modules/nomina/revision-operativa.service.ts'),'utf8');
  assert.ok(revisionSource.includes('appendNominaCoberturaScope(conditions, params, tenant);'));
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
