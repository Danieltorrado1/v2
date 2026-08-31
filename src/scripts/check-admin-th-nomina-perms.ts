import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const REQUIRED = [
  'nomina.economico.read',
  'nomina.parametros.manage',
  'nomina.categorias.manage'
] as const;

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not defined');
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl:
      databaseUrl.includes('supabase.com') || databaseUrl.includes('pooler.')
        ? { rejectUnauthorized: false }
        : false
  });

  try {
    const result = await pool.query<{
      permisos: string[] | null;
      rol: string;
    }>(
      `
        SELECT
          r.nombre_rol AS rol,
          ARRAY_AGG(CONCAT_WS('.', p.modulo, p.accion) ORDER BY CONCAT_WS('.', p.modulo, p.accion))
            FILTER (
              WHERE CONCAT_WS('.', p.modulo, p.accion) = ANY($1::text[])
            ) AS permisos
        FROM roles r
        LEFT JOIN rol_permisos rp
          ON rp.rol_id = r.id
          AND COALESCE(rp.activo, TRUE) = TRUE
        LEFT JOIN permisos p
          ON p.id = rp.permiso_id
          AND COALESCE(p.activo, TRUE) = TRUE
        WHERE r.nombre_rol IN ('ADMINISTRADOR', 'TALENTO_HUMANO')
        GROUP BY r.nombre_rol
        ORDER BY r.nombre_rol
      `,
      [REQUIRED]
    );

    console.log(JSON.stringify(result.rows, null, 2));
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
