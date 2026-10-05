import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveNovedadTurnContext, selectTurnContext, type TurnContextOption } from '../modules/nomina/nomina.turn-context';
import { createNominaNovedadConTurnoSchema } from '../modules/nomina/nomina.schemas';

const context: TurnContextOption = {
  municipio_id: '1', municipio: 'Municipio', institucion_id: '2', institucion: 'Institución',
  sede_id: '3', sede: 'Sede', modalidad_id: '4', modalidad: 'Modalidad',
};
for (const [codigo, cobertura, tipo] of [
  ['PNR', 'PERSONA_EXTERNA', 'EXTERNO'], ['SUSPENSIÓN', 'PERSONA_EXTERNA', 'EXTERNO'],
  ['S', 'PERSONA_EXTERNA', 'EXTERNO'], ['PR1', 'PERSONA_EXTERNA', 'EXTERNO'],
  ['INCAPACIDAD', 'PERSONAL_VINCULADO', 'INTERNO'],
] as const) {
  test(`${codigo} + ${cobertura}: schema acepta destino vacío y servicio omite validación`, async () => {
    const input = createNominaNovedadConTurnoSchema.parse({
      periodo_id: '1', nomina_empleado_id: '2', vinculacion_id: '3', tipo_novedad_codigo: codigo,
      cobertura: cobertura === 'PERSONA_EXTERNA'
        ? { tipo_cobertura: cobertura, nombre_externo: 'Apoyo', documento_externo: '123' }
        : { tipo_cobertura: cobertura, persona_cubre_id: '4', vinculacion_cubre_id: '5' },
      turno: { tipo, contexto_operativo: {} },
    });
    const resolve = async (): Promise<TurnContextOption> => { assert.fail('No debe consultar ni exigir contexto destino'); };
    assert.deepEqual(await resolveNovedadTurnContext(codigo, input.turno.contexto_operativo, resolve), {});
    assert.deepEqual(await resolveNovedadTurnContext(codigo, { ...context, cobertura_tipo: cobertura }, resolve), { cobertura_tipo: cobertura });
  });
}
for (const missing of ['institucion_id', 'sede_id', 'modalidad_id'] as const) {
  test(`backend TURNO_ADICIONAL sin ${missing} rechaza`, async () => {
    const input = { ...context, [missing]: '' };
    await assert.rejects(resolveNovedadTurnContext('TURNO_ADICIONAL', input,
      async () => selectTurnContext([context], input)), (error: any) => error.statusCode === 400);
  });
}
test('backend TURNO_ADICIONAL completo valida y conserva destino', async () => {
  assert.deepEqual(await resolveNovedadTurnContext('TURNO_ADICIONAL', context,
    async () => selectTurnContext([context], context)), context);
});
test('servicio usa código resuelto del catálogo, también para selección por id o nombre', () => {
  const source = readFileSync('src/modules/nomina/nomina.service.ts', 'utf8');
  assert.match(source, /const tipoNovedad = await resolveNominaTipoNovedadOrThrow\(input, client\);\s*turno.contexto_operativo = await resolveNovedadTurnContext\(tipoNovedad.codigo_operativo/);
});
