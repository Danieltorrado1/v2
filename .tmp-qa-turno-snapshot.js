require("dotenv").config({ path: ".env.qa" });
const { Pool } = require("pg");

(async () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const empleado = await pool.query(`
      SELECT
        ne.id::text AS id,
        ne.periodo_id::text AS periodo_id,
        ne.vinculacion_id::text AS vinculacion_id,
        ne.devengado_basico,
        ne.devengado_transporte,
        ne.devengado_otros,
        ne.total_adiciones,
        ne.total_deducciones,
        ne.salud,
        ne.pension,
        ne.neto_pagar,
        ne.detalle_calculo,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS trabajador
      FROM nomina_empleados ne
      INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id
      INNER JOIN personas p ON p.id = v.persona_id
      WHERE ne.id = 3
      LIMIT 1
    `);

    const movimiento = await pool.query(`
      SELECT
        nm.id::text AS id,
        nm.nomina_empleado_id::text AS nomina_empleado_id,
        nm.fecha::text AS fecha,
        nm.familia_movimiento,
        nm.tipo_movimiento,
        nm.cantidad,
        nm.valor_unitario,
        nm.valor_calculado,
        nm.valor_total,
        nm.estado,
        nm.activo,
        nm.persona_reemplazada_id::text AS persona_reemplazada_id,
        nm.vinculacion_reemplazada_id::text AS vinculacion_reemplazada_id
      FROM nomina_movimientos nm
      WHERE nm.id = 1
      LIMIT 1
    `);

    const row = empleado.rows[0];
    const detail = row?.detalle_calculo && typeof row.detalle_calculo === 'object' ? row.detalle_calculo : null;
    const adiciones = Array.isArray(detail?.adiciones_internas) ? detail.adiciones_internas : [];
    const primera = adiciones[0] ?? null;
    const number = (value) => Number(value ?? 0);

    const before = primera
      ? {
          devengado_basico: number(row.devengado_basico),
          devengado_transporte: number(row.devengado_transporte),
          devengado_otros: number(row.devengado_otros) - number(primera.devengado_turno),
          total_adiciones: number(row.total_adiciones) - number(primera.devengado_turno),
          total_deducciones:
            number(row.total_deducciones) - number(primera.salud_turno) - number(primera.pension_turno),
          neto_pagar: number(row.neto_pagar) - number(primera.neto_turno),
        }
      : null;

    console.log(JSON.stringify({
      empleado: row,
      adiciones_internas: adiciones,
      movimiento: movimiento.rows[0] ?? null,
      before_inferred_without_first_turn: before,
    }, null, 2));
  } finally {
    await pool.end();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
