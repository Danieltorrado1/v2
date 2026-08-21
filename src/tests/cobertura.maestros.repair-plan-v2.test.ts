import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildExactMunicipioMatrix,
  buildRepairPlanV2,
  classifyAffectedEntities,
  simulateMunicipioRepairMatrix,
  type ParsedWorkbookLineageRow,
  type RepairFinalRow,
  type RepairInstitucionRow,
  type RepairModalidadRow,
  type RepairMunicipioRow,
  type RepairPreliminarRow,
  type RepairSedeRow,
  type RepairVigenciaRow,
} from '../modules/cobertura/cobertura.maestros.repair-plan-v2';

const municipios: RepairMunicipioRow[] = [
  { id: '1', nombre_municipio: 'LA MACARENA' },
  { id: '2', nombre_municipio: 'PUERTO CONCORDIA' },
  { id: '3', nombre_municipio: 'URIBE' },
  { id: '4', nombre_municipio: 'CUMARAL' },
  { id: '5', nombre_municipio: 'PUERTO LOPEZ' },
];

const modalidades: RepairModalidadRow[] = [
  { id: '10', nombre_modalidad: 'CAA' },
];

const parsedRows: ParsedWorkbookLineageRow[] = [
  {
    fila_origen: 233,
    consecutivo: '15035000003002',
    municipio: 'LA MACARENA',
    institucion: 'I.E. MACARENA',
    sede: 'SEDE PRINCIPAL',
    modalidad: 'CAA',
  },
  {
    fila_origen: 393,
    consecutivo: '5037000001001',
    municipio: 'PUERTO CONCORDIA',
    institucion: 'I.E. MIXTA',
    sede: 'SEDE MIXTA',
    modalidad: 'CAA',
  },
  {
    fila_origen: 510,
    consecutivo: '5011000001001',
    municipio: 'URIBE',
    institucion: 'I.E. URIBE',
    sede: 'SEDE URIBE',
    modalidad: 'CAA',
  },
];

const preliminar: RepairPreliminarRow[] = [
  { id: '1001', fila_origen: 233, focalizacion_vigencia_id: '2001' },
  { id: '1002', fila_origen: 393, focalizacion_vigencia_id: '2002' },
  { id: '1003', fila_origen: 510, focalizacion_vigencia_id: '2003' },
];

const vigencias: RepairVigenciaRow[] = [
  { id: '2001', preliminar_id: '1001', municipio_id: '1' },
  { id: '2002', preliminar_id: '1002', municipio_id: '4' },
  { id: '2003', preliminar_id: '1003', municipio_id: '5' },
];

const instituciones: RepairInstitucionRow[] = [
  { id: '44', municipio_id: '1', nombre_institucion: 'I.E. MIXTA' },
  { id: '50', municipio_id: '5', nombre_institucion: 'I.E. URIBE' },
];

const sedes: RepairSedeRow[] = [
  { id: '199', institucion_id: '44', municipio_id: '1', consecutivo_sede: '15035000003002', nombre_sede: 'SEDE MIXTA' },
  { id: '400', institucion_id: '50', municipio_id: '5', consecutivo_sede: '5011000001001', nombre_sede: 'SEDE URIBE' },
];

const finales: RepairFinalRow[] = [
  {
    id: '3001',
    preliminar_id: '1001',
    municipio_id: '1',
    municipio_texto: 'LA MACARENA',
    institucion_id: '44',
    institucion_final: 'I.E. MIXTA',
    sede_id: '199',
    sede_final: 'SEDE MIXTA',
    modalidad_id: '10',
    modalidad_final: 'CAA',
    sede_modalidad_id: '9001',
  },
  {
    id: '3002',
    preliminar_id: '1002',
    municipio_id: '4',
    municipio_texto: 'CUMARAL',
    institucion_id: '44',
    institucion_final: 'I.E. MIXTA',
    sede_id: '199',
    sede_final: 'SEDE MIXTA',
    modalidad_id: '10',
    modalidad_final: 'CAA',
    sede_modalidad_id: '9002',
  },
  {
    id: '3003',
    preliminar_id: '1003',
    municipio_id: '5',
    municipio_texto: 'PUERTO LOPEZ',
    institucion_id: '50',
    institucion_final: 'I.E. URIBE',
    sede_id: '400',
    sede_final: 'SEDE URIBE',
    modalidad_id: '10',
    modalidad_final: 'CAA',
    sede_modalidad_id: '9003',
  },
  {
    id: '3999',
    preliminar_id: '9999',
    municipio_id: '2',
    municipio_texto: 'PUERTO CONCORDIA',
    institucion_id: '44',
    institucion_final: 'I.E. MIXTA',
    sede_id: '199',
    sede_final: 'SEDE MIXTA',
    modalidad_id: '10',
    modalidad_final: 'CAA',
    sede_modalidad_id: '9999',
  },
];

test('usa solo el linaje exacto preliminar -> final y no el fallback textual', () => {
  const matrix = buildExactMunicipioMatrix({
    parsedRows,
    municipios,
    instituciones,
    sedes,
    modalidades,
    preliminar,
    vigencias,
    finales,
  });

  assert.equal(matrix.find((row) => row.fila_origen === 393)?.final_id, 3002);
  assert.equal(matrix.find((row) => row.fila_origen === 393)?.municipio_bd_actual, 'CUMARAL');
});

test('detecta instituciones y sedes mixtas cuando comparten filas oficiales de municipios distintos', () => {
  const matrix = buildExactMunicipioMatrix({
    parsedRows,
    municipios,
    instituciones,
    sedes,
    modalidades,
    preliminar,
    vigencias,
    finales,
  });
  const assessments = classifyAffectedEntities(matrix);

  assert.equal(assessments.instituciones.find((item) => item.entity_id === 44)?.seguridad, 'INSTITUCION_MIXTA_NO_SEGURA');
  assert.equal(assessments.sedes.find((item) => item.entity_id === 199)?.seguridad, 'SEDE_MIXTA_NO_SEGURA');
});

test('el plan V2 no propone UPDATE seguro para entidades mixtas', () => {
  const matrix = buildExactMunicipioMatrix({
    parsedRows,
    municipios,
    instituciones,
    sedes,
    modalidades,
    preliminar,
    vigencias,
    finales,
  });
  const plan = buildRepairPlanV2({
    matrix,
    municipios,
    instituciones,
    sedes,
    vigencias,
    finales,
  });

  assert.equal(plan.safe_operations.some((item) => item.tabla === 'instituciones' && item.id === 44), false);
  assert.equal(plan.safe_operations.some((item) => item.tabla === 'sedes' && item.id === 199), false);
  assert.equal(plan.discarded_operations.some((item) => item.tabla === 'instituciones' && item.id === 44), true);
  assert.equal(plan.discarded_operations.some((item) => item.tabla === 'sedes' && item.id === 199), true);
});

test('la simulacion corrige solo los finales exactos y mantiene intacta La Macarena', () => {
  const matrix = buildExactMunicipioMatrix({
    parsedRows,
    municipios,
    instituciones,
    sedes,
    modalidades,
    preliminar,
    vigencias,
    finales,
  });
  const plan = buildRepairPlanV2({
    matrix,
    municipios,
    instituciones,
    sedes,
    vigencias,
    finales,
  });
  const simulated = simulateMunicipioRepairMatrix({
    matrix,
    operations: plan.safe_operations,
    municipios,
  });

  assert.equal(simulated.find((row) => row.fila_origen === 233)?.estado_municipio, 'OK');
  assert.equal(simulated.find((row) => row.fila_origen === 233)?.municipio_bd_actual, 'LA MACARENA');
  assert.equal(simulated.find((row) => row.fila_origen === 393)?.municipio_bd_actual, 'PUERTO CONCORDIA');
  assert.equal(simulated.find((row) => row.fila_origen === 510)?.municipio_bd_actual, 'URIBE');
});

test('corrige solo Barranca/El Dorado/Uribe/Puerto Concordia donde el linaje exacto lo exige', () => {
  const matrix = buildExactMunicipioMatrix({
    parsedRows,
    municipios,
    instituciones,
    sedes,
    modalidades,
    preliminar,
    vigencias,
    finales,
  });
  const plan = buildRepairPlanV2({
    matrix,
    municipios,
    instituciones,
    sedes,
    vigencias,
    finales,
  });

  const finalOps = plan.safe_operations.filter((item) => item.tabla === 'focalizacion_final');
  assert.deepEqual(finalOps.map((item) => item.id).sort((left, right) => left - right), [3002, 3003]);
});
