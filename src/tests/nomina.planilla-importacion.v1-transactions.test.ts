import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {PoolClient} from 'pg';
import {syntheticAuthEnvironment} from './fixtures/planilla-operativa.authorization.synthetic';
import {syntheticType} from './fixtures/planilla-operativa.synthetic';
Object.assign(process.env,syntheticAuthEnvironment);
const {dbPool}=require('../config/db') as typeof import('../config/db');
const {createNominaNovedad,updateNominaNovedad,deactivateNominaNovedad,markNominaAsistencia}=require('../modules/nomina/nomina.service') as typeof import('../modules/nomina/nomina.service');
const {createNominaNovedadSchema}=require('../modules/nomina/nomina.schemas') as typeof import('../modules/nomina/nomina.schemas');

for(const action of ['create','update','deactivate','attendance'] as const)test(`servicio V1 real ${action} participa en transaccion externa sin commit/recalculo/conexion propios`,async t=>{
  t.mock.method(dbPool,'connect',async()=>{throw new Error('No debe abrir conexion ni recalculo independiente');});
  const sql:string[]=[];let active=true;
  const worker={id:'101',nomina_empleado_id:'101',periodo_id:'71',periodo_estado:'ABIERTO',vinculacion_id:'81',activo:true,estado:'PENDIENTE',
    persona_id:'91',vinculacion_empresa_id:'41',vinculacion_contrato_id:'51',fecha_inicio_vinculacion:'2026-01-01',fecha_fin_vinculacion:null};
  const client={query:async(text:string,values:unknown[]=[])=>{
    sql.push(text);let rows:object[]=[];
    if (/\) conflicts/.test(text)) rows=[];
    else if (/np\.id::text AS id/.test(text)) rows=[{id:'71',contrato_id:'51',contrato_empresa_id:'41',estado:'ABIERTO',fecha_inicio:'2026-10-26',fecha_fin:'2026-11-25'}];
    else if (/SELECT c\.id::text/.test(text)) rows=[{id:'51',empresa_id:'41'}];
    else if (/ne\.id::text AS (id|nomina_empleado_id)/.test(text)) rows=[worker];
    else if (/FROM nomina_tipos_novedad/.test(text)) rows=[syntheticType('11','DCO')];
    else if (/nn\.id::text AS id/.test(text)) rows=[{id:String(values[0] ?? '301'),periodo_id:'71',nomina_empleado_id:'101',vinculacion_id:'81',tipo_novedad_id:'11',
      tipo_novedad_codigo_operativo:'DCO',tipo_novedad_nombre:'DCO',fecha_inicio:'2026-10-27',fecha_fin:'2026-10-27',activo:active,created_at:'2026-10-28'}];
    else if (/SELECT fecha_inicio::text, fecha_fin::text FROM vinculaciones/.test(text)) rows=[{fecha_inicio:'2026-01-01',fecha_fin:null}];
    else if (/INSERT INTO nomina_novedades|INSERT INTO nomina_asistencia_diaria/.test(text)) rows=[{id:'302'}];
    else if (/UPDATE nomina_novedades/.test(text)) {active=false;rows=[{id:'301'}];}
    else if (/FROM vinculaciones/.test(text)) rows=[{id:'81',persona_id:'91',empresa_id:'41',contrato_id:'51'}];
    else if (/^\s*INSERT/.test(text)) rows=[{id:'1'}];
    return {rows,rowCount:rows.length};
  },release(){assert.fail('No debe liberar el cliente externo');}} as unknown as PoolClient;
  if(action==='create') await createNominaNovedad(createNominaNovedadSchema.parse({periodo_id:'71',nomina_empleado_id:'101',vinculacion_id:'81',tipo_novedad_id:'11',fecha_inicio:'2026-10-27',fecha_fin:'2026-10-27'}),'3',undefined,undefined,client);
  else if(action==='update') await updateNominaNovedad('301',{fecha_inicio:'2026-10-27',fecha_fin:'2026-10-27',dias:1},'3',undefined,undefined,client);
  else if(action==='deactivate') await deactivateNominaNovedad('301','3',undefined,undefined,client);
  else await markNominaAsistencia('71','81','2026-10-27',true,'3',undefined,undefined,client);
  assert.ok(!sql.some(q=>/^\s*(BEGIN|COMMIT|ROLLBACK)\s*$/.test(q)));
  assert.ok(sql.some(q=>/INSERT INTO nomina_novedades|UPDATE nomina_novedades|INSERT INTO nomina_asistencia_diaria/.test(q)));
  assert.ok(!sql.some(q=>/SET\s+.*dias_pagados|SET\s+.*neto_pagar/i.test(q)));
});
