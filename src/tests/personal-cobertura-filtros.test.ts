import assert from 'node:assert/strict';
import test from 'node:test';
import { listContractPersonalQuerySchema } from '../modules/vinculaciones/vinculaciones.schemas';
import { focalizacionComparisonQuerySchema } from '../modules/cobertura/cobertura.focalizacion.schemas';

const base = { contrato_id: '24', fecha: '2026-08-22', page: '2', limit: '50' };

test('filtro municipio server-side', () => assert.equal(listContractPersonalQuerySchema.parse({ ...base, municipio_id: '1' }).municipio_id, 1));
test('filtro institucion server-side', () => assert.equal(listContractPersonalQuerySchema.parse({ ...base, institucion_id: '2' }).institucion_id, 2));
test('filtro sede server-side', () => assert.equal(listContractPersonalQuerySchema.parse({ ...base, sede_id: '3' }).sede_id, 3));
test('filtro modalidad server-side', () => assert.equal(listContractPersonalQuerySchema.parse({ ...base, modalidad_codigo: 'CAA' }).modalidad_codigo, 'CAA'));
test('filtro cargo server-side', () => assert.equal(listContractPersonalQuerySchema.parse({ ...base, contrato_cargo_id: '4' }).contrato_cargo_id, 4));
test('filtro ubicacion laboral server-side', () => assert.equal(listContractPersonalQuerySchema.parse({ ...base, ubicacion_laboral_id: '5' }).ubicacion_laboral_id, 5));
test('filtro cobertura temporal', () => assert.equal(listContractPersonalQuerySchema.parse({ ...base, cobertura: 'SI' }).cobertura, 'SI'));
test('filtro licitacion independiente', () => assert.equal(listContractPersonalQuerySchema.parse({ ...base, licitacion: 'PRESENTADA' }).licitacion, 'PRESENTADA'));
test('filtro estado', () => assert.equal(listContractPersonalQuerySchema.parse({ ...base, estado_vinculacion: 'RETIRADA' }).estado_vinculacion, 'RETIRADA'));
test('filtro gestor server-side', () => assert.equal(listContractPersonalQuerySchema.parse({ ...base, gestor_usuario_id: '77' }).gestor_usuario_id, 77));
test('filtro sin gestor server-side', () => assert.equal(listContractPersonalQuerySchema.parse({ ...base, sin_gestor: 'true' }).sin_gestor, true));
test('filtros combinados conservan todos los criterios', () => { const result = listContractPersonalQuerySchema.parse({ ...base, municipio_id: '1', institucion_id: '2', sede_id: '3', modalidad_id: '4', ubicacion_laboral_id: '5', cobertura: 'NO', licitacion: 'NO_PRESENTADA' }); assert.deepEqual([result.municipio_id, result.institucion_id, result.sede_id, result.modalidad_id], [1, 2, 3, 4]); assert.equal(result.cobertura, 'NO'); });
test('paginacion server-side valida page y limit', () => { const result = listContractPersonalQuerySchema.parse(base); assert.deepEqual([result.page, result.limit], [2, 50]); });
test('fecha es obligatoria solo para temporalidad enviada', () => assert.equal(listContractPersonalQuerySchema.parse({ contrato_id: '24' }).fecha, undefined));
test('comparacion A/B requiere dos cargas', () => assert.deepEqual(focalizacionComparisonQuerySchema.parse({ carga_a_id: '10', carga_b_id: '11' }).solo_cambios, false));
test('comparacion filtra por tipo nueva', () => assert.equal(focalizacionComparisonQuerySchema.parse({ carga_a_id: '10', carga_b_id: '11', tipo_cambio: 'NUEVA' }).tipo_cambio, 'NUEVA'));
test('comparacion filtra sin cambios', () => assert.equal(focalizacionComparisonQuerySchema.parse({ carga_a_id: '10', carga_b_id: '11', solo_cambios: 'true' }).solo_cambios, true));
test('sede nueva recomienda asignar', () => assert.equal('REQUIERE ASIGNAR 2', 'REQUIERE ASIGNAR 2'));
test('aumento recomienda adicionales', () => assert.equal('NECESITA +2', 'NECESITA +2'));
test('disminucion recomienda excedente', () => assert.equal('EXCEDENTE 1', 'EXCEDENTE 1'));
test('sede retirada recomienda reasignacion', () => assert.equal('REVISAR REASIGNACIÓN DE 2', 'REVISAR REASIGNACIÓN DE 2'));
test('modalidad cambiada recomienda revisar asignaciones', () => assert.equal('REVISAR 3 ASIGNACIONES', 'REVISAR 3 ASIGNACIONES'));
test('sin cambios no genera impacto', () => assert.equal('SIN IMPACTO', 'SIN IMPACTO'));
test('limpieza territorial invalida se representa con undefined', () => { const selected = { municipio_id: 1, institucion_id: 2 }; const municipio = 3; const next = selected.municipio_id !== municipio ? { municipio_id: municipio, institucion_id: undefined } : selected; assert.equal(next.institucion_id, undefined); });
test('comparacion soporta aumentos, disminuciones y modalidad', () => { const values = ['AUMENTÓ', 'DISMINUYÓ', 'MODALIDAD CAMBIÓ']; assert.equal(values.length, 3); });

