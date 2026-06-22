import dotenv from 'dotenv';
import { Pool } from 'pg';
import type { PoolClient } from 'pg';

dotenv.config();

interface PlantillaRow {
  id: string;
}

const TEMPLATE_CODE = 'CONTRATO_LABORAL';
const TEMPLATE_NAME = 'Contrato laboral';
const TEMPLATE_DESCRIPTION = 'Plantilla base para contrato laboral';
const TEMPLATE_CONTENT = `CONTRATO LABORAL A TÉRMINO FIJO

Número de contrato base: {{contrato.numero_contrato}}

EMPRESA CONTRATANTE:
{{empresa.nombre_empresa}}

TRABAJADOR:
{{persona.nombre_completo}}

DOCUMENTO:
{{persona.numero_documento}}

CARGO:
{{cargo.nombre_cargo}}

TIPO DE VINCULACIÓN:
{{tipo_vinculacion.nombre_vinculacion}}

FECHA DE INICIO:
{{vinculacion.fecha_inicio}}

OBJETO CONTRACTUAL:
{{contrato.objeto_contractual}}`;

const createPool = (): Pool => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not defined');
  }

  return new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('supabase.com') || databaseUrl.includes('pooler.')
      ? { rejectUnauthorized: false }
      : false
  });
};

const seedTemplate = async (client: PoolClient): Promise<string> => {
  const result = await client.query<PlantillaRow>(
    `
      INSERT INTO plantillas (
        codigo,
        nombre,
        descripcion,
        tipo_plantilla,
        contenido_template,
        activo
      )
      VALUES ($1, $2, $3, 'CONTRATO_LABORAL', $4, TRUE)
      ON CONFLICT (codigo)
      DO UPDATE SET
        nombre = EXCLUDED.nombre,
        descripcion = EXCLUDED.descripcion,
        tipo_plantilla = EXCLUDED.tipo_plantilla,
        contenido_template = EXCLUDED.contenido_template,
        activo = TRUE,
        updated_at = NOW()
      RETURNING id::text AS id
    `,
    [TEMPLATE_CODE, TEMPLATE_NAME, TEMPLATE_DESCRIPTION, TEMPLATE_CONTENT]
  );

  const row = result.rows[0];

  if (!row) {
    throw new Error('Failed to seed CONTRACTO_LABORAL template');
  }

  return row.id;
};

const main = async (): Promise<void> => {
  const pool = createPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const templateId = await seedTemplate(client);
    await client.query('COMMIT');
    console.log(`Template seeded successfully. ID: ${templateId}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Template seed failed.');
    console.error(error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

void main();
