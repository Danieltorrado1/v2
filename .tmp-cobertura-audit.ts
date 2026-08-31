import { dbPool } from './src/config/db';

const main = async () => {
  const tipos = await dbPool.query(`
    SELECT id::text, codigo_operativo, nombre, afecta_salario,
      afecta_transporte, afecta_dias_laborados, efecto_salario,
      efecto_auxilio_transporte, requiere_soporte, es_permiso,
      soporte_documento_tipo
    FROM nomina_tipos_novedad
    WHERE UPPER(COALESCE(codigo_operativo, '')) IN ('PR1','INGRESO','S','SUSPENSION','FNJ','L50')
       OR UPPER(nombre) IN ('FALLA NO JUSTIFICADA','INGRESO')
    ORDER BY id
  `);
  const novedades = await dbPool.query(`
    SELECT nn.id::text, nn.nomina_empleado_id::text, nn.fecha_inicio::text,
      nn.fecha_fin::text, nn.dias, nn.tipo_novedad_codigo_operativo,
      nn.requiere_cobertura, nn.cubierta, nn.cobertura, nn.activo,
      nnt.id::text AS turno_id, nnt.tipo_turno, nnt.nomina_empleado_id::text AS cubre_empleado_id,
      nnt.persona_reemplazada_id::text, nnt.movimiento_id::text,
      nnt.contexto_operativo
    FROM nomina_novedades nn
    LEFT JOIN nomina_novedad_turnos nnt ON nnt.nomina_novedad_id = nn.id
    WHERE nn.periodo_id = 2
    ORDER BY nn.id
  `);
  const movimientos = await dbPool.query(`
    SELECT id::text, periodo_id::text, nomina_empleado_id::text, tipo_movimiento,
      fecha::text, valor_total, descripcion, nomina_novedad_id::text,
      persona_reemplazada_id::text, activo, estado
    FROM nomina_movimientos
    WHERE periodo_id = 2
    ORDER BY id
  `);
  console.log(JSON.stringify({ tipos: tipos.rows, novedades: novedades.rows, movimientos: movimientos.rows }, null, 2));
  await dbPool.end();
};
void main().catch((error) => { console.error(error); process.exitCode = 1; });
