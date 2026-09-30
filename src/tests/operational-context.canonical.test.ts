import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { resolveOperationalContextAtDate, resolveOperationalContextTimeline } from '../modules/integracion/contexto-laboral.service';

const setup = async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE empresas(id bigint PRIMARY KEY);
    CREATE TABLE contratos(id bigint PRIMARY KEY, empresa_id bigint NOT NULL);
    CREATE TABLE vinculaciones(id bigint PRIMARY KEY, contrato_id bigint NOT NULL);
    CREATE TABLE municipios(id bigint PRIMARY KEY, nombre_municipio text);
    CREATE TABLE focalizacion_final(id bigint PRIMARY KEY, contrato_id bigint, municipio_id bigint, institucion_id bigint, sede_id bigint, modalidad_id bigint, institucion_final text, sede_final text, modalidad_final text, municipio_texto text);
    CREATE TABLE cobertura_asignaciones(id bigint PRIMARY KEY, contrato_id bigint, municipio_id bigint, focalizacion_final_id bigint, vinculacion_id bigint, institucion text, sede text, modalidad text, fecha_inicio date, fecha_fin date, activo boolean);
    INSERT INTO empresas VALUES (15),(99);
    INSERT INTO contratos VALUES (24,15),(25,99);
    INSERT INTO vinculaciones VALUES (100,24),(101,25);
    INSERT INTO municipios VALUES (1,'M');
    INSERT INTO focalizacion_final VALUES (10,24,1,2,3,4,'I','S','RI','M'),(11,24,1,2,3,5,'I','S','CAA','M');
    INSERT INTO cobertura_asignaciones VALUES (1,24,1,10,100,'I','S','RI','2026-09-01','2026-09-14',TRUE),(2,24,1,11,100,'I','S','CAA','2026-09-15',NULL,TRUE);
  `);
  return { db, executor: { query: (text: string, values?: readonly unknown[]) => db.query(text, values as any) } as any };
};

test('resolver canónico RI→CAA por fecha, límites y aislamiento tenant', async () => {
  const { executor } = await setup();
  assert.equal((await resolveOperationalContextAtDate({ empresaId: 15, contratoId: 24, vinculacionId: 100, fecha: '2026-09-14' }, executor))!.modalidad, 'RI');
  assert.equal((await resolveOperationalContextAtDate({ empresaId: 15, contratoId: 24, vinculacionId: 100, fecha: '2026-09-15' }, executor))!.modalidad, 'CAA');
  assert.equal(await resolveOperationalContextAtDate({ empresaId: 99, contratoId: 24, vinculacionId: 100, fecha: '2026-09-15' }, executor), null);
  const timeline = await resolveOperationalContextTimeline({ empresaId: 15, contratoId: 24, vinculacionId: 100, fechaInicio: '2026-09-01', fechaFin: '2026-09-30' }, executor);
  assert.deepEqual(timeline.tramos.map((row) => [row.fecha_inicio, row.fecha_fin, row.modalidad]), [['2026-09-01', '2026-09-14', 'RI'], ['2026-09-15', '2026-09-30', 'CAA']]);
  assert.deepEqual(timeline.huecos, []);
});

test('resolver canónico rechaza solapamientos y reporta huecos', async () => {
  const { db, executor } = await setup();
  await db.query(`UPDATE cobertura_asignaciones SET fecha_fin='2026-09-20' WHERE id=1`);
  await assert.rejects(() => resolveOperationalContextTimeline({ empresaId: 15, contratoId: 24, vinculacionId: 100, fechaInicio: '2026-09-01', fechaFin: '2026-09-30' }, executor), /Solapamiento/);
  await db.query(`DELETE FROM cobertura_asignaciones WHERE id=2`);
  const timeline = await resolveOperationalContextTimeline({ empresaId: 15, contratoId: 24, vinculacionId: 100, fechaInicio: '2026-09-01', fechaFin: '2026-09-30' }, executor);
  assert.deepEqual(timeline.huecos, [{ fecha_inicio: '2026-09-21', fecha_fin: '2026-09-30' }]);
});
