import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const result = await pool.query(`
  SELECT
    p.numero_documento,
    CONCAT_WS(
      ' ',
      p.primer_nombre,
      p.segundo_nombre,
      p.primer_apellido,
      p.segundo_apellido
    ) AS trabajador,

    v.id AS vinculacion_id,
    v.estado_vinculacion,
    v.fecha_inicio,
    v.fecha_fin,

    vce.tipo_condicion,
    vce.valor AS valor_condicion,
    vce.vigencia_desde,
    vce.vigencia_hasta,
    vce.activo AS condicion_activa,

    ne.id AS nomina_empleado_id,
    ne.periodo_id,
    ne.salario_base,
    ne.dias_periodo,
    ne.dias_pagados,
    ne.devengado_basico,
    ne.devengado_transporte,
    ne.total_adiciones,
    ne.total_deducciones,
    ne.salud,
    ne.pension,
    ne.neto_pagar,
    ne.estado AS estado_nomina,
    ne.detalle_calculo

  FROM personas p

  LEFT JOIN vinculaciones v
    ON v.persona_id = p.id

  LEFT JOIN vinculacion_condiciones_economicas vce
    ON vce.vinculacion_id = v.id
    AND vce.activo = true

  LEFT JOIN nomina_empleados ne
    ON ne.vinculacion_id = v.id
    AND ne.activo = true

  WHERE p.numero_documento IN (
    '990000001',
    '990000002',
    '990000003',
    '990000004',
    '990000005'
  )

  ORDER BY
    p.numero_documento,
    vce.tipo_condicion,
    ne.periodo_id
`);

console.table(result.rows);

await pool.end();
