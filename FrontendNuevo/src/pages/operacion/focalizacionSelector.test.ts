import assert from 'node:assert/strict';
import { test } from 'node:test';
import { focalizacionOptions } from './focalizacionSelector';
import type { InstitutionPeriod } from '../../services/operacionApi';

const august: InstitutionPeriod = { id:'4',nombre:'August 2026',anio:2026,mes:8,empresa_id:'15',contrato_id:'24',estado:'PROCESADO',version:1 };
const september: InstitutionPeriod = { ...august,id:'9',nombre:'September 2026',mes:9 };

test('687 filas de agosto se deduplican por ID canónico, no etiqueta', () => {
  assert.deepEqual(focalizacionOptions(Array.from({length:687},()=>august),15,24),[{...august,nombre:'Agosto 2026'}]);
});
test('agosto y septiembre únicos, recientes primero y en español', () => {
  const options=focalizacionOptions([august,september,august,september],15,24);
  assert.deepEqual(options.map(row=>[row.id,row.nombre]),[['9','Septiembre 2026'],['4','Agosto 2026']]);
});
test('mismo nombre/ID externo no cruza empresas o contratos', () => {
  assert.equal(focalizacionOptions([september,{...september,id:'10',contrato_id:'25'},{...september,id:'11',empresa_id:'16'}],15,24).length,1);
});
test('versiones canónicas distintas no se colapsan por nombre y se distinguen visualmente', () => {
  const options=focalizacionOptions([september,{...september,id:'12',version:2}],15,24);
  assert.deepEqual(options.map(row=>row.id),['12','9']);
  assert.deepEqual(options.map(row=>row.nombre),['Septiembre 2026 · versión 2','Septiembre 2026 · versión 1']);
});
test('opciones inactivas o fallidas no son seleccionables ni alteradas', () => {
  const rows=[{...september,activo:false},{...august,estado:'ANULADO'}];
  const snapshot=JSON.stringify(rows);
  assert.deepEqual(focalizacionOptions(rows,15,24),[]);
  assert.equal(JSON.stringify(rows),snapshot);
});
