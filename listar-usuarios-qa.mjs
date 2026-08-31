import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const result = await pool.query(
  "SELECT id, correo, nombre_completo, activo, auth_user_id FROM usuarios ORDER BY correo"
);

console.table(result.rows);

await pool.end();
