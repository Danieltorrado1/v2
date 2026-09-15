import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mapNominaPeriodo } from '../modules/nomina/domain/nomina-periodo.mapper';

test('mapNominaPeriodo conserva campos, fechas, nulls y contrato', () => {
  const result = mapNominaPeriodo({
    id: '8', contrato_id: '3', nombre_periodo: 'AGOSTO', tipo_periodo: 'MENSUAL',
    fecha_inicio: new Date('2026-08-01T00:00:00.000Z'), fecha_fin: '2026-08-31',
    requiere_asistencia: true, estado: 'ABIERTO', activo: true,
    created_at: new Date('2026-07-31T10:20:30.000Z'),
    contrato_empresa_id: '4', contrato_numero: 'C-3', contrato_entidad_contratante: 'Entidad',
    contrato_fecha_inicio: '2026-01-01', contrato_fecha_finalizacion: null
  });

  assert.deepEqual(result, {
    id: '8', contrato_id: '3', nombre_periodo: 'AGOSTO', tipo_periodo: 'MENSUAL',
    fecha_inicio: '2026-08-01', fecha_fin: '2026-08-31', requiere_asistencia: true,
    estado: 'ABIERTO', activo: true, created_at: '2026-07-31T10:20:30.000Z',
    contrato: {
      id: '3', empresa_id: '4', numero_contrato: 'C-3', entidad_contratante: 'Entidad',
      fecha_inicio: '2026-01-01', fecha_finalizacion: null
    }
  });
});
