import dotenv from 'dotenv';
import { Pool, type QueryResultRow } from 'pg';

dotenv.config();

interface TipoRow extends QueryResultRow {
  afecta_dias_laborados: boolean | null;
  afecta_recargos: boolean | null;
  codigo_operativo: string | null;
  efecto_auxilio_transporte: string | null;
  efecto_cobertura_config: string | null;
  efecto_liquidacion: string | null;
  efecto_operativo: string | null;
  efecto_recargos_detallado: string | null;
  efecto_salario: string | null;
  es_evento_operativo: boolean | null;
  id: string;
  nombre: string | null;
}

const TARGET_NAMES = [
  'CAMBIO DE MODALIDAD',
  'CAMBIO DE SEDE',
  'LICENCIA MATERNIDAD/PATERNIDAD',
] as const;

const main = async (): Promise<void> => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not defined');
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl:
      databaseUrl.includes('supabase.com') || databaseUrl.includes('pooler.')
        ? { rejectUnauthorized: false }
        : false,
  });

  try {
    const before = await pool.query<TipoRow>(
      `
        SELECT
          id::text AS id,
          nombre,
          codigo_operativo,
          es_evento_operativo,
          afecta_dias_laborados,
          afecta_recargos,
          efecto_salario,
          efecto_auxilio_transporte,
          efecto_recargos_detallado,
          efecto_liquidacion,
          efecto_cobertura_config,
          efecto_operativo
        FROM public.nomina_tipos_novedad
        WHERE UPPER(BTRIM(COALESCE(nombre, ''))) = ANY($1::text[])
        ORDER BY nombre ASC
      `,
      [TARGET_NAMES]
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `
          UPDATE public.nomina_tipos_novedad
          SET efecto_operativo = 'SIN_EFECTO'
          WHERE UPPER(BTRIM(COALESCE(nombre, ''))) IN ('CAMBIO DE MODALIDAD', 'CAMBIO DE SEDE')
            AND COALESCE(efecto_salario, 'SIN_EFECTO') = 'SIN_EFECTO'
            AND COALESCE(efecto_auxilio_transporte, 'SIN_EFECTO') = 'SIN_EFECTO'
            AND COALESCE(efecto_recargos_detallado, 'SIN_EFECTO') = 'SIN_EFECTO'
            AND COALESCE(efecto_liquidacion, 'SIN_EFECTO') = 'SIN_EFECTO'
            AND COALESCE(efecto_cobertura_config, 'SIN_EFECTO') = 'SIN_EFECTO'
        `
      );
      await client.query(
        `
          UPDATE public.nomina_tipos_novedad
          SET
            afecta_salario = FALSE,
            afecta_transporte = TRUE,
            afecta_dias_laborados = FALSE,
            afecta_recargos = TRUE,
            efecto_salario = 'SIN_EFECTO',
            efecto_auxilio_transporte = 'DESCUENTA_DIA',
            efecto_recargos_detallado = 'EXCLUIR_DIA',
            efecto_liquidacion = 'SIN_EFECTO',
            efecto_cobertura_config = 'SIN_EFECTO',
            efecto_operativo = 'SIN_EFECTO',
            modelo_registro = 'EVENTO_CANONICO_RANGO',
            proyecta_periodos = TRUE,
            bloquea_otras_novedades = TRUE,
            grupo_exclusividad = 'LICENCIA_MATERNIDAD_PATERNIDAD'
          WHERE UPPER(BTRIM(COALESCE(nombre, ''))) = 'LICENCIA MATERNIDAD/PATERNIDAD'
        `
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const after = await pool.query<TipoRow>(
      `
        SELECT
          id::text AS id,
          nombre,
          codigo_operativo,
          es_evento_operativo,
          afecta_dias_laborados,
          afecta_recargos,
          efecto_salario,
          efecto_auxilio_transporte,
          efecto_recargos_detallado,
          efecto_liquidacion,
          efecto_cobertura_config,
          efecto_operativo
        FROM public.nomina_tipos_novedad
        WHERE UPPER(BTRIM(COALESCE(nombre, ''))) = ANY($1::text[])
        ORDER BY nombre ASC
      `,
      [TARGET_NAMES]
    );

    console.log(
      JSON.stringify(
        {
          execution_date: new Date().toISOString(),
          updated_target_names: [
            'CAMBIO DE MODALIDAD',
            'CAMBIO DE SEDE',
            'LICENCIA MATERNIDAD/PATERNIDAD',
          ],
          untouched_target_names: [],
          before: before.rows,
          after: after.rows,
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
