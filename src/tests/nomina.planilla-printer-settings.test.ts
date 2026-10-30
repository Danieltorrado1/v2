import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import * as XLSX from 'xlsx';
import { syntheticAuthEnvironment } from './fixtures/planilla-operativa.authorization.synthetic';
import { syntheticSnapshot } from './fixtures/planilla-operativa.synthetic';
import { importHarness } from './fixtures/planilla-importacion.synthetic';
Object.assign(process.env, syntheticAuthEnvironment);
const { buildPlanillaOperativaXlsx, planillaBaseline } = require('../modules/nomina/planilla-operativa.xlsx') as typeof import('../modules/nomina/planilla-operativa.xlsx');
const { validatePlanillaZip, readUploadedPlanilla, validatePlanillaValues } = require('../modules/nomina/planilla-importacion.xlsx') as typeof import('../modules/nomina/planilla-importacion.xlsx');
const part = 'xl/printerSettings/printerSettings1.bin';
const relPath = 'xl/worksheets/_rels/sheet1.xml.rels';
const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.printerSettings';
const relType = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/printerSettings';
function editor(bytes: Buffer) {
  const zip = XLSX.CFB.read(bytes, { type: 'buffer' });
  const read = (name: string) => Buffer.from(XLSX.CFB.find(zip, '/' + name).content).toString('utf8');
  const write = (name: string, value: string | Buffer) => XLSX.CFB.utils.cfb_add(zip, '/' + name, Buffer.from(value));
  const remove = (name: string) => XLSX.CFB.utils.cfb_del(zip, '/' + name);
  return { read, write, remove, save: () => Buffer.from(XLSX.CFB.write(zip, { fileType: 'zip', type: 'buffer', compression: true })) };
}
function withPrinter(bytes: Buffer, extra = 16, override = false) {
  const e = editor(bytes);
  const data = Buffer.alloc(220 + extra);
  data.write('Synthetic printer', 0, 'utf16le'); data.writeUInt16LE(0x0401, 64);
  data.writeUInt16LE(220, 68); data.writeUInt16LE(extra, 70);
  e.write(part, data);
  const contentTypes = e.read('[Content_Types].xml').replace(/<Default\b[^>]*Extension="bin"[^>]*\/>/, '');
  e.write('[Content_Types].xml', contentTypes.replace('</Types>',
    (override ? `<Override PartName="/${part}" ContentType="${mime}"/>` : `<Default Extension="bin" ContentType="${mime}"/>`) + '</Types>'));
  e.write(relPath, `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdPrinter" Type="${relType}" Target="../printerSettings/printerSettings1.bin"/></Relationships>`);
  const sheet = e.read('xl/worksheets/sheet1.xml');
  e.write('xl/worksheets/sheet1.xml', sheet.includes('<dataValidations')
    ? sheet.replace('<dataValidations', '<pageSetup r:id="rIdPrinter"/><dataValidations')
    : sheet.replace('</worksheet>', '<pageSetup r:id="rIdPrinter"/></worksheet>'));
  return e.save();
}
function signedBook() {
  const snapshot = syntheticSnapshot();
  snapshot.trabajadores = snapshot.trabajadores.map(w => ({ ...w, institucion_id: '1', sede_id: '10', modalidad_id: '1' }));
  snapshot.import_guard = snapshot.trabajadores.map(w => ({ id: w.id, revision: 'a'.repeat(64), bloqueado: false, novedades_dependientes: [] }));
  const signature = createHmac('sha256', syntheticAuthEnvironment.JWT_SECRET).update(JSON.stringify({ purpose: 'planilla-operativa-export-2A', generado_at: snapshot.generado_at, alcance: snapshot.alcance, baseline: planillaBaseline(snapshot) })).digest('hex');
  return { snapshot, signature, bytes: buildPlanillaOperativaXlsx(snapshot, signature) };
}
const original = signedBook();
const legitimate = withPrinter(original.bytes);

test('DEVMODEW con Default/Override y datos privados: firma 2A.6 y valores protegidos intactos', () => {
  for (const bytes of [original.bytes, legitimate, withPrinter(original.bytes, 0, true), withPrinter(original.bytes, 7972)]) {
    assert.doesNotThrow(() => validatePlanillaZip(bytes));
    const upload = readUploadedPlanilla(bytes);
    assert.equal(upload.signature, original.signature);
    assert.equal(upload.baseline.version, 'EMPIRIA-V1-OPERATIVA-2A.6-IMPORT');
    assert.equal(validatePlanillaValues(upload, original.snapshot).length, 62);
  }
});

const mutations: Record<string, (e: ReturnType<typeof editor>) => void> = {
  'bin arbitrario': e => e.write('xl/arbitrary.bin', Buffer.alloc(220)),
  'VBA': e => e.write('xl/vbaProject.bin', Buffer.from('macro')),
  'enlace externo': e => e.write('xl/externalLinks/externalLink1.xml', '<external/>'),
  'objeto embebido': e => e.write('xl/embeddings/oleObject1.bin', Buffer.alloc(220)),
  'nombre bin no canonico': e => e.write('xl/printerSettings/other.bin', Buffer.alloc(220)),
  'nombre con traversal': e => e.write('xl/printerSettings/../printerSettings2.bin', Buffer.alloc(220)),
  'DEVMODE truncado': e => e.write(part, Buffer.alloc(100)),
  'VBA renombrado': e => e.write(part, Buffer.from('MZ' + 'x'.repeat(234))),
  'dmSize incorrecto': e => { const b = Buffer.alloc(236); b.writeUInt16LE(0x0401,64); b.writeUInt16LE(100,68); b.writeUInt16LE(136,70); e.write(part,b); },
  'dmDriverExtra incorrecto': e => { const b = Buffer.alloc(236); b.writeUInt16LE(0x0401,64); b.writeUInt16LE(220,68); e.write(part,b); },
  'version DEVMODE incorrecta': e => { const b = Buffer.alloc(220); b.writeUInt16LE(220,68); e.write(part,b); },
  'DEVMODE sobredimensionado': e => e.write(part, Buffer.alloc(220+65536)),
  'MIME incorrecto': e => e.write('[Content_Types].xml',e.read('[Content_Types].xml').replace(mime, 'application/octet-stream')),
  'MIME ambiguo': e => e.write('[Content_Types].xml',e.read('[Content_Types].xml').replace('</Types>',`<Default Extension="bin" ContentType="${mime}"/></Types>`)),
  'atributo MIME duplicado': e => e.write('[Content_Types].xml',e.read('[Content_Types].xml').replace('Extension="bin"', 'Extension="bin" Extension="xml"')),
  'tipo XML malformado': e => e.write('[Content_Types].xml',e.read('[Content_Types].xml').replace('</Types>', '<Unknown/></Types>')),
  'entidades XML': e => e.write('[Content_Types].xml','<!DOCTYPE Types [<!ENTITY x "evil">]>' + e.read('[Content_Types].xml')),
  'relacion ausente': e => e.remove(relPath),
  'bin ausente': e => e.remove(part),
  'tipo relacion incorrecto': e => e.write(relPath,e.read(relPath).replace(relType, 'urn:invalid')),
  'Target externo': e => e.write(relPath,e.read(relPath).replace('Target="../', 'TargetMode="External" Target="https://example.invalid/')),
  'TargetMode externo codificado': e => e.write(relPath,e.read(relPath).replace('Target="../', 'TargetMode="&#69;xternal" Target="../')),
  'Target externo sin TargetMode': e => e.write(relPath,e.read(relPath).replace('../printerSettings/', 'https://example.invalid/printerSettings/')),
  'Target con traversal': e => e.write(relPath,e.read(relPath).replace('../printerSettings/', '../../xl/printerSettings/')),
  'Target codificado': e => e.write(relPath,e.read(relPath).replace('../printerSettings/', '%2e%2e/printerSettings/')),
  'Target inexistente': e => e.write(relPath,e.read(relPath).replace('printerSettings1.bin','printerSettings2.bin')),
  'Id duplicado': e => e.write(relPath,e.read(relPath).replace('</Relationships>', `<Relationship Id="rIdPrinter" Type="${relType}" Target="../printerSettings/printerSettings1.bin"/></Relationships>`)),
  'dos impresoras en hoja': e => e.write(relPath,e.read(relPath).replace('</Relationships>', `<Relationship Id="rIdOther" Type="${relType}" Target="../printerSettings/printerSettings1.bin"/></Relationships>`)),
  'namespace relaciones incorrecto': e => e.write(relPath,e.read(relPath).replace('package/2006/relationships','package/2006/invalid')),
  'origen fuera de worksheet': e => { e.write('xl/_rels/workbook.xml.rels',e.read(relPath)); e.remove(relPath); },
  'relaciones salientes de impresora': e => e.write('xl/printerSettings/_rels/printerSettings1.bin.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'),
  'pageSetup sin enlace': e => e.write('xl/worksheets/sheet1.xml',e.read('xl/worksheets/sheet1.xml').replace('r:id="rIdPrinter"','')),
  'pageSetup con otro Id': e => e.write('xl/worksheets/sheet1.xml',e.read('xl/worksheets/sheet1.xml').replace('r:id="rIdPrinter"','r:id="rIdOther"')),
  'dos pageSetup': e => e.write('xl/worksheets/sheet1.xml',e.read('xl/worksheets/sheet1.xml').replace('<pageSetup ', '<pageSetup r:id="rIdPrinter"/><pageSetup ')),
  'namespace pageSetup redefinido': e => e.write('xl/worksheets/sheet1.xml',e.read('xl/worksheets/sheet1.xml').replace('<pageSetup ', '<pageSetup xmlns:r="urn:invalid" ')),
  'formula': e => e.write('xl/worksheets/sheet1.xml',e.read('xl/worksheets/sheet1.xml').replace('</sheetData>', '<row r="20"><c r="H20"><f>1+1</f><v>2</v></c></row></sheetData>')),
};
for (const [name, mutate] of Object.entries(mutations)) test(`rechaza ${name} con la excepcion printerSettings habilitada`, () => {
  const e = editor(legitimate); mutate(e);
  assert.throws(() => validatePlanillaZip(e.save()), { code: 'PLANILLA_ARCHIVO_INVALIDO', statusCode: 422 });
});

test('printerSettings no permite modificar firma ni identidad protegida', () => {
  const book = XLSX.read(legitimate, { type: 'buffer' });
  const controlPath = `xl/worksheets/sheet${book.SheetNames.indexOf('_Control')+1}.xml`;
  const signatureEdit = editor(legitimate);
  signatureEdit.write(controlPath,signatureEdit.read(controlPath).replace(original.signature, '0'.repeat(64)));
  assert.throws(() => readUploadedPlanilla(signatureEdit.save()), { code: 'PLANILLA_FIRMA_INVALIDA' });
  const identityEdit = editor(legitimate);
  identityEdit.write('xl/worksheets/sheet1.xml',identityEdit.read('xl/worksheets/sheet1.xml').replace('00001234','00009999'));
  const upload = readUploadedPlanilla(identityEdit.save());
  assert.throws(() => validatePlanillaValues(upload, original.snapshot), { code: 'PLANILLA_DATO_PROTEGIDO' });
});

test('preview 2B admite libro firmado con configuracion de impresion; no ejecuta operaciones', async () => {
  const h = await importHarness();
  try {
    const bytes = withPrinter(h.edit(await h.download(), [{ id: '101', fecha: '2026-10-27', value: 'PNR' }]));
    const preview = await h.preview(bytes);
    assert.equal(preview.estado, 'VISTA_PREVIA'); assert.equal(preview.plan!.conflictos, 0); assert.equal(preview.plan!.nuevas, 1);
    assert.equal((await h.db.query('SELECT * FROM nomina_novedades')).rows.length, 0);
    assert.equal((await h.db.query('SELECT * FROM nomina_planilla_importaciones')).rows.length, 0);
  } finally { await h.close(); }
});
