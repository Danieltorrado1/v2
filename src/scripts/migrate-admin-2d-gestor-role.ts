import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const main = async (): Promise<void> => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not defined');

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('supabase.com') || databaseUrl.includes('pooler.')
      ? { rejectUnauthorized: false }
      : false
  });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const gestor = await client.query<{ id: string }>(
      `
        INSERT INTO roles (nombre_rol, descripcion, activo)
        VALUES ('GESTOR', 'Gestor operativo con alcance territorial configurable', TRUE)
        ON CONFLICT (nombre_rol)
        DO UPDATE SET activo = TRUE
        RETURNING id::text AS id
      `
    );
    const gestorId = gestor.rows[0]?.id;
    if (!gestorId) throw new Error('GESTOR role could not be resolved');

    await client.query(
      `
        INSERT INTO rol_permisos (rol_id, permiso_id, activo)
        SELECT $1::bigint, rp.permiso_id, TRUE
        FROM rol_permisos rp
        INNER JOIN roles source_role ON source_role.id = rp.rol_id
        WHERE source_role.nombre_rol = 'OPERACION'
          AND COALESCE(source_role.activo, TRUE) = TRUE
          AND COALESCE(rp.activo, TRUE) = TRUE
        ON CONFLICT (rol_id, permiso_id)
        DO UPDATE SET activo = TRUE
      `,
      [gestorId]
    );

    await client.query('COMMIT');
    console.log('ADMIN-2D GESTOR role migration completed successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

void main().catch((error) => {
  console.error('ADMIN-2D GESTOR role migration failed.');
  console.error(error);
  process.exitCode = 1;
});
