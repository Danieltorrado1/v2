import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTramos, internalTurnIndicator, novedadesOnDate, movimientosOnDate } from './planillaOperativa.domain';
import { addDaysToDateOnly, normalizeDateOnly } from './dateOnly';
import type { NominaEmpleadoApi, NominaMovimientoApi, NominaNovedadApi } from '../../types/nomina.types';

test('turnos históricos proyectados llegan a la fila destino y conservan fecha, T+ y modalidad', () => {
  const cases=[['92','82','849','2026-08-26','RI'],['93','83','853','2026-08-27','RI'],
    ['49','38','1348','2026-08-27','CAARES'],['94','84','849','2026-08-31','RI']];
  const employees=new Set(['849','853','1348']);
  for(const [id,movementId,employeeId,date,modalidad] of cases){
    assert(employees.has(employeeId!));
    const movement={id:movementId,nomina_empleado_id:employeeId,tipo_movimiento:'TURNO_INTERNO',
      fecha:date,activo:true,estado:'APROBADO',contexto_operativo:{modalidad}} as NominaMovimientoApi;
    const indicator=internalTurnIndicator([{id:id!,movimiento_id:movementId,modalidad}],movimientosOnDate([movement],date!));
    assert.equal(indicator.label,'T+');assert.equal(indicator.count,1);assert.match(indicator.tooltip,new RegExp(modalidad!));
  }
  const outside={id:'99',tipo_movimiento:'TURNO_INTERNO',activo:true,estado:'APROBADO',fecha:'2026-09-26'} as NominaMovimientoApi;
  for(let day='2026-08-26';day<='2026-09-25';day=addDaysToDateOnly(day,1))assert.equal(internalTurnIndicator([],movimientosOnDate([outside],day)).count,0);
  for(const movement of [
    {...outside,tipo_movimiento:'TURNO_EXTERNO'}, {...outside,activo:false}, {...outside,estado:'ANULADO'},
  ])assert.equal(internalTurnIndicator([],[movement as NominaMovimientoApi]).count,0);
});

test('fechas exactas de septiembre cruzan agosto sin desplazarse por timezone', () => {
  const days:string[]=[];
  for (let date='2026-08-26';date<='2026-09-25';date=addDaysToDateOnly(date,1)) days.push(date);
  const records=['2026-08-26','2026-08-31','2026-09-01','2026-09-25','2026-09-26'].map((date,index) =>
    ({id:String(index),activo:true,fecha_inicio:date,fecha_fin:date}) as NominaNovedadApi);
  assert.equal(days.length,31);
  assert.deepEqual(days.flatMap(date => novedadesOnDate(records,date)).map(record => record.id),['0','1','2','3']);
  assert.equal(normalizeDateOnly('2026-08-31T00:00:00.000Z'),'2026-08-31');
  assert.equal(addDaysToDateOnly('2026-08-31',1),'2026-09-01');
});

test('T+ conserva modalidad del turno, agrupa y deduplica movimientos enlazados', () => {
  const movement={id:'1',activo:true,tipo_movimiento:'TURNO_INTERNO',fecha:'2026-08-28',estado:'APROBADO',contexto_operativo:{modalidad:'CAARES'}} as NominaMovimientoApi;
  const sameDay=movimientosOnDate([movement],'2026-08-28');
  assert.deepEqual(internalTurnIndicator([],sameDay), {count:1,label:'T+',tooltip:'Turno interno adicional · CAARES'});
  assert.equal(internalTurnIndicator([],movimientosOnDate([movement],'2026-08-29')).count,0);
  assert.equal(internalTurnIndicator([{id:'7',movimiento_id:'1',modalidad:'CAARES'}],sameDay).count,1);
  assert.equal(internalTurnIndicator([{id:'7',modalidad:'CAA'}],sameDay).label,'T+2');
  assert.match(internalTurnIndicator([{id:'8'}],[]).tooltip,/SIN MODALIDAD/);
  const novelty={id:'9',activo:true,fecha_inicio:'2026-08-28',fecha_fin:'2026-08-28'} as NominaNovedadApi;
  assert.equal(novedadesOnDate([novelty],'2026-08-28').length,1);
  assert.equal(internalTurnIndicator([],sameDay).count,1);
});

test('cambio operativo del 30/08 se proyecta en el periodo 26–25', () => {
  const employee={vinculacion:{fecha_inicio:'2026-01-01',fecha_fin:null},sede:null,modalidad:'CAA'} as NominaEmpleadoApi;
  const context={modalidad:'CAARES'};
  const segments=buildTramos(employee,'2026-08-26','2026-09-25',[
    {id:'1',vinculacion_id:'1',fecha_inicio_efectiva:'2026-08-30',activo:true,contexto_nuevo:context},
  ]);
  assert.equal(segments.find(segment => segment.inicio<='2026-08-31' && segment.fin>='2026-08-31')?.contexto.modalidad,'CAARES');
});
