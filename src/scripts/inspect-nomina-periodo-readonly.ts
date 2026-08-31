import dotenv from 'dotenv';
import { Pool } from 'pg';

const explicitEnvFile = process.env.ENV_FILE?.trim();
dotenv.config(explicitEnvFile ? { path: explicitEnvFile } : undefined);

const periodId = Number(process.argv[2] ?? '');

if (!Number.isInteger(periodId) || periodId <= 0) {
  throw new Error('Usage: inspect-nomina-periodo-readonly.ts <periodo_id>');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const main = async (): Promise<void> => {
  const client = await pool.connect();

  try {
    const [periodo, estados, desprendibles, tiposDocumentales] = await Promise.all([
      client.query(
        `
          SELECT
            np.id::text AS periodo_id,
            np.nombre_periodo,
            np.fecha_inicio::text,
            np.fecha_fin::text,
            np.estado,
            c.id::text AS contrato_id,
            c.numero_contrato,
            c.entidad_contratante,
            e.id::text AS empresa_id,
            e.nombre_empresa,
            e.nit,
            COUNT(DISTINCT ne.id)::int AS empleados,
            COUNT(DISTINCT nn.id)::int AS novedades,
            COUNT(DISTINCT nt.id)::int AS turnos,
            COALESCE(SUM(ne.salario_base), 0) AS salario_total,
            COALESCE(SUM(ne.auxilio_transporte), 0) AS transporte_total,
            COALESCE(SUM(ne.total_adiciones), 0) AS recargos_y_adiciones_total,
            COALESCE(SUM(ne.total_deducciones), 0) AS deducciones_total,
            COALESCE(SUM(ne.neto_pagar), 0) AS neto_total,
            COALESCE(SUM(ne.devengado_basico), 0) AS devengado_salario_total,
            COALESCE(SUM(ne.devengado_transporte), 0) AS devengado_transporte_total,
            COALESCE(SUM(ne.devengado_otros), 0) AS otros_devengados_total,
            COALESCE(SUM(ne.salud), 0) AS salud_total,
            COALESCE(SUM(ne.pension), 0) AS pension_total
          FROM nomina_periodos np
          JOIN contratos c ON c.id = np.contrato_id
          JOIN empresas e ON e.id = c.empresa_id
          LEFT JOIN nomina_empleados ne ON ne.periodo_id = np.id AND COALESCE(ne.activo, TRUE) = TRUE
          LEFT JOIN nomina_novedades nn ON nn.periodo_id = np.id AND COALESCE(nn.activo, TRUE) = TRUE
          LEFT JOIN nomina_novedad_turnos nt ON nt.periodo_id = np.id AND COALESCE(nt.activo, TRUE) = TRUE
          WHERE np.id = $1::bigint
          GROUP BY np.id, c.id, e.id
        `,
        [periodId]
      ),
      client.query(
        `
          SELECT
            CASE
              WHEN ne.categoria_salarial_id IS NULL THEN 'SIN_CATEGORIA'
              WHEN ncs.id IS NULL THEN 'CATEGORIA_REFERENCIA_INVALIDA'
              WHEN ncs.vigente_hasta IS NOT NULL AND ncs.vigente_hasta < np.fecha_inicio THEN 'CATEGORIA_VENCIDA'
              WHEN ncs.vigente_desde IS NOT NULL AND ncs.vigente_desde > np.fecha_fin THEN 'CATEGORIA_NO_VIGENTE_AUN'
              WHEN COALESCE(ncs.activo, TRUE) = FALSE THEN 'CATEGORIA_INACTIVA'
              WHEN ne.salario_base IS NULL THEN 'SALARIO_FALTANTE'
              WHEN ne.auxilio_transporte IS NULL THEN 'AUXILIO_FALTANTE'
              ELSE 'OK'
            END AS estado_configuracion,
            COUNT(*)::int AS total
          FROM nomina_empleados ne
          JOIN nomina_periodos np ON np.id = ne.periodo_id
          LEFT JOIN nomina_categorias_salariales ncs ON ncs.id = ne.categoria_salarial_id
          WHERE ne.periodo_id = $1::bigint
            AND COALESCE(ne.activo, TRUE) = TRUE
          GROUP BY 1
          ORDER BY total DESC, estado_configuracion ASC
        `,
        [periodId]
      ),
      client.query(
        `
          SELECT
            COUNT(*)::int AS total_desprendibles,
            COUNT(*) FILTER (WHERE COALESCE(es_vigente, TRUE) = TRUE)::int AS vigentes,
            COUNT(*) FILTER (WHERE estado = 'GENERADO')::int AS generados,
            COUNT(*) FILTER (WHERE estado = 'FINALIZADO')::int AS finalizados
          FROM nomina_desprendibles
          WHERE periodo_id = $1::bigint
            AND COALESCE(activo, TRUE) = TRUE
        `,
        [periodId]
      ),
      client.query(
        `
          SELECT
            td.codigo,
            td.nombre_documento,
            COUNT(*)::int AS total
          FROM nomina_desprendibles nd
          JOIN documentos_persona dp ON dp.id = nd.documento_persona_id
          JOIN tipos_documentos td ON td.id = dp.tipo_documento_id
          WHERE nd.periodo_id = $1::bigint
          GROUP BY td.codigo, td.nombre_documento
          ORDER BY total DESC, td.codigo ASC
        `,
        [periodId]
      )
    ]);

    console.log(
      JSON.stringify(
        {
          periodo: periodo.rows[0] ?? null,
          estados_configuracion: estados.rows,
          desprendibles: desprendibles.rows[0] ?? null,
          tipos_documentales: tiposDocumentales.rows
        },
        null,
        2
      )
    );
  } finally {
    client.release();
    await pool.end();
  }
};

void main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => undefined);
  process.exitCode = 1;
});
