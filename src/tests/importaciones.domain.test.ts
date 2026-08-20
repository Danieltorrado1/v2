import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const mapperPromise = import('../modules/importaciones/' + 'importaciones.mapper.ts');
const domainSource = readFileSync(path.join(root, 'src/modules/importaciones/importaciones.domain.ts'), 'utf8');

test('importaciones.domain mantiene columnas legibles para plantilla operativa', () => {
  assert.match(domainSource, /Tipo identific/);
  assert.match(domainSource, /Número identific/);
  assert.match(domainSource, /Tipo vincul/);
  assert.match(domainSource, /Fecha ingreso/);
});

test('mapExcelRows reconoce encabezados operativos legibles', async () => {
  const { mapExcelRows } = await mapperPromise;
  const [row] = mapExcelRows([
    {
      'Tipo identificación': 'CC',
      'Número identificación': '9988',
      'Primer nombre': 'Marta',
      'Primer apellido': 'Lopez',
      Cargo: 'Cocinera',
      'Tipo vinculación': 'LABORAL',
      'Fecha ingreso': '2024-02-01',
    },
  ]);
  assert.equal(row.persona.tipo_identificacion, 'CC');
  assert.equal(row.persona.numero_documento, '9988');
  assert.equal(row.vinculacion.cargo, 'Cocinera');
  assert.equal(row.vinculacion.fecha_ingreso, '2024-02-01');
});
