import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { repositoryOptionalLabel, canonicalColumns, repositoryCell, repositoryGroup } from './personalRepositoryModel';

const type = (id: number, codigo: string) => ({ id, codigo, label: codigo, alcance: 'GENERAL', categoria_documento: null, requiere_fecha_expedicion: false, requiere_fecha_vencimiento: false }) as any;
const worker = { vinculacion_id: 1, persona_id: 1, nombre_completo: 'Ana', numero_documento: '1' } as any;
const row = (requisitos: any[], documents: any[] = []) => ({ worker, checklist: { requisitos, tiene_configuracion: true, cumplimiento_porcentaje: 0 }, documents }) as any;

test('la matriz usa una columna canónica por grupo', () => {
  const columns = canonicalColumns([type(1, 'CEDULA'), type(2, 'PPT'), type(3, 'HV'), type(4, 'AUT_DATOS_PERSONALES'), type(5, 'AUT_INHABILIDADES'), type(6, 'CURSO MAN DE ALIMENTOS'), type(7, 'EXAMENES MAN DE ALIMENTOS')]);
  assert.equal(columns.length, 28);
  assert.deepEqual(columns.find(c => c.canonical_code === 'IDENTIDAD')?.tipo_documento_ids, [1, 2]);
  assert.equal(columns.find(c => c.canonical_code === 'FORMACION')?.cuenta_cumplimiento, false);
});

test('cedula y PPT satisfacen el mismo requisito sin duplicarlo', () => {
  const identity = canonicalColumns([type(1, 'CEDULA'), type(2, 'PPT')]).find(c => c.canonical_code === 'IDENTIDAD')!;
  const item = { requisito_id: 1, nombre_requisito: 'Documento de identidad', tipo_documento_id: 2, tipo_documento_ids: [1, 2], estado_detallado: 'COMPLETO', documento_id: 9, fuente_documento: 'PERSONA' };
  assert.equal(repositoryCell(row([item]), identity).estado_detallado, 'COMPLETO');
});

test('la matriz respeta la evaluaci?n agregada del servidor sin aprobar por archivos', () => {
  const manipulation = canonicalColumns([type(6,'CURSO MAN DE ALIMENTOS'),type(7,'EXAMENES MAN DE ALIMENTOS')]).find(c=>c.canonical_code==='MANIPULACION')!;
  for(const estado of ['PENDIENTE','PARCIAL','COMPLETO'])assert.equal(repositoryCell(row([{codigo:'MANIPULACION',estado_detallado:estado,documentos:[{tipo_documento_id:6},{tipo_documento_id:7}]}]),manipulation).estado_detallado,estado);
});
test('selector documental reutiliza los tipos reales incluyendo aliases de identidad', () => {
  const source = readFileSync(resolve('FrontendNuevo/src/pages/personal/PersonalDocumentReview.tsx'),'utf8');
  assert.match(source,/data.types.map/);assert.match(source,/t.nombre/);
});
test('Manipulación expone modalidad y permite reutilizar un soporte existente', () => {
  const source = readFileSync(resolve('FrontendNuevo/src/pages/personal/PersonalDocumentReview.tsx'),'utf8');
  assert.match(source,/Un solo PDF/);
  assert.match(source,/Dos archivos/);
  assert.match(source,/reutilizar_documento_id/);
  assert.match(source,/Usar este PDF como Curso \+ Exámenes/);
  assert.match(source,/Modalidad actual: Un solo PDF/);
  assert.match(source,/Modalidad actual: Dos PDFs separados/);
});
test('evidencia sin revisi?n nunca se presenta completa',()=>{
 const column=canonicalColumns([type(1,'HV')]).find(c=>c.canonical_code==='HOJA_VIDA')!;
 assert.equal(repositoryCell(row([],[{tipo_documento_id:1,origen:'persona',documento_id:9,estado_documental:'vigente'}]),column).estado_detallado,'PENDIENTE_REVISION');
});

test('la matriz canónica no expone columnas legacy ni OPS', () => {
  const columns = canonicalColumns([type(1, 'AUT_TRATAMIENTO_DATOS'), type(2, 'AUT_CONSULTA_DELITOS_SEXUALES'), type(3, 'CUENTA_COBRO_OPS'), type(4, 'DIPLOMA_BACHILLER'), type(5, 'CURSO MAN DE ALIMENTOS')]);
  assert.equal(columns.length, 28);
  assert.equal(columns.some(column => /OPS|DELITOS|TRATAMIENTO|DIPLOMA|ACTA/.test(column.label)), false);
});

for (const [group, codes] of Object.entries({ DATOS_PERSONALES: ['HOJA_VIDA','IDENTIDAD','CERT_BANCARIA','RESIDENCIA','SISBEN'], SEGURIDAD_SOCIAL: ['EPS','ARL','PENSION','CAJA'], SST: ['EXAMEN_OCUPACIONAL','VACUNACION','INDUCCION','DOTACION','EPP'] })) {
  test(`${group} conserva todas sus subcolumnas y estados sin depender del catálogo`, () => {
    const columns = canonicalColumns([]).filter(c => repositoryGroup(c) === group);
    assert.deepEqual(columns.map(c => c.canonical_code), codes);
    for (const column of columns.filter(c => !c.proceso)) {
      for (const estado of ['COMPLETO','PENDIENTE','NO_APLICA','VENCIDO']) {
        assert.equal(repositoryCell(row([{ codigo: column.canonical_code, estado_detallado: estado }]), column).estado_detallado, estado);
      }
    }
  });
}
for (const tipo of ['DOTACION','EPP']) {
  test(`${tipo} conserva múltiples entregas y no modifica el cumplimiento`, () => {
    const column = canonicalColumns([]).find(c => c.canonical_code === tipo)!;
    const current = { ...row([]), entregas: [1,2,3].map(id => ({ id, tipo, fecha: '2026-09-01', elemento: 'Elemento', cantidad: '1' })) };
    const before = JSON.stringify(current.checklist);
    const cell = repositoryCell(current, column);
    assert.deepEqual(cell.entregas?.map(e => e.id), [1,2,3]);
    assert.equal(cell.cuenta_cumplimiento, false);
    assert.equal(JSON.stringify(current.checklist), before);
  });
}
test('manipulación recibe ambos componentes dentro del requisito canónico', () => {
  const column = canonicalColumns([]).find(c => c.canonical_code === 'MANIPULACION')!;
  const cell = repositoryCell(row([{codigo:'MANIPULACION', estado_detallado:'COMPLETO', documentos:[{tipo_documento_id:1},{tipo_documento_id:2}]}]), column);
  assert.equal(cell.estado_detallado,'COMPLETO');
});

test('opcionales usan dimensiones backend; Dotación conserva obligación e historial',()=>{
 for(const code of ['RESIDENCIA','SISBEN','FORMACION','CERT_LABORAL','VACUNACION','DOTACION']){
  const column=canonicalColumns([]).find(c=>c.canonical_code===code)!;
  const tipo=['FORMACION','CERT_LABORAL'].includes(code)?'ACREDITABLE':'OPCIONAL';
  const cell=repositoryCell(row([{codigo:code==='DOTACION'?'DOTACION_HISTORICA':code,aplica:true,obligatorio:code==='DOTACION',tipo_requisito:code==='DOTACION'?'OBLIGATORIO':tipo,cuenta_cumplimiento:code==='DOTACION',estado_detallado:'SIN_DOCUMENTO'}]),column);
  assert.equal(cell.estado_detallado,'SIN_DOCUMENTO');
  assert.equal(cell.cuenta_cumplimiento,code==='DOTACION');
  assert.equal(repositoryOptionalLabel(cell),code==='DOTACION'?null:tipo==='ACREDITABLE'?'Acreditable':'Opcional');
 }
});
