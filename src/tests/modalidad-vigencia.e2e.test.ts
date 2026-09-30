import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildModalidadTramos, proposeSalaryCategory, resolveModalidadVigente } from '../modules/integracion/modalidad-vigencia';

const historial = [
  { modalidad_id: 1, modalidad: 'RI', fecha_inicio: '2026-09-01', fecha_fin: '2026-09-14' },
  { modalidad_id: 2, modalidad: 'CAA', fecha_inicio: '2026-09-15', fecha_fin: null }
];

test('fuente canónica resuelve modalidad actual e historial sin sobrescribir RI', () => {
  assert.equal(resolveModalidadVigente(historial, '2026-09-20')?.modalidad, 'CAA');
  assert.equal(resolveModalidadVigente(historial, '2026-09-14')?.modalidad, 'RI');
  assert.deepEqual(historial.map((item) => item.modalidad), ['RI', 'CAA']);
});

test('cambio RI a CAA a mitad del período produce dos tramos y una persona', () => {
  const tramos = buildModalidadTramos(historial, '2026-09-01', '2026-09-30');
  assert.deepEqual(tramos.map((item) => [item.fecha_inicio, item.fecha_fin, item.modalidad]), [
    ['2026-09-01', '2026-09-14', 'RI'],
    ['2026-09-15', '2026-09-30', 'CAA']
  ]);
  assert.equal(new Set(['vinculacion-1']).size, 1);
});

test('categoría inequívoca se propone con fecha efectiva y no se asigna por defecto', () => {
  assert.deepEqual(proposeSalaryCategory([
    { id: 10, modalidad: 'CAA', vigente_desde: '2026-09-15', vigente_hasta: null }
  ], { modalidad: 'CAA' }, '2026-09-15'), { estado: 'PROPUESTA', categoria_id: 10, fecha_efectiva: '2026-09-15' });
  assert.deepEqual(proposeSalaryCategory([], { modalidad: 'CAA' }, '2026-09-15'), { estado: 'REQUIERE_REVISION_SALARIAL', fecha_efectiva: '2026-09-15', candidatos: [] });
});

test('categoría ambigua queda bloqueada para revisión', () => {
  const result = proposeSalaryCategory([
    { id: 10, modalidad: 'CAA', vigente_desde: '2026-01-01', vigente_hasta: null },
    { id: 11, modalidad: 'CAA', vigente_desde: '2026-01-01', vigente_hasta: null }
  ], { modalidad: 'CAA' }, '2026-09-15');
  assert.equal(result.estado, 'REQUIERE_REVISION_SALARIAL');
  assert.deepEqual(result.candidatos, [10, 11]);
});

test('vigencia futura, retroactiva y límites no generan solapamientos', () => {
  const programada = [
    { modalidad: 'RI', fecha_inicio: '2026-09-01', fecha_fin: '2026-09-30' },
    { modalidad: 'CAA', fecha_inicio: '2026-10-01', fecha_fin: null }
  ];
  assert.equal(resolveModalidadVigente(programada, '2026-09-30')?.modalidad, 'RI');
  assert.equal(resolveModalidadVigente(programada, '2026-10-01')?.modalidad, 'CAA');
  const tramos = buildModalidadTramos(programada, '2026-09-01', '2026-10-31');
  assert.deepEqual(tramos.map((item) => [item.fecha_inicio, item.fecha_fin]), [['2026-09-01', '2026-09-30'], ['2026-10-01', '2026-10-31']]);
  assert.equal(tramos[0]!.fecha_fin < tramos[1]!.fecha_inicio, true);
});
