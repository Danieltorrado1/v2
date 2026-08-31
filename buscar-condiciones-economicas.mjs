import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const result = await pool.query(`
  SELECT
    table_name,
    column_name,
    data_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND (
      column_name ILIKE '%salario%'
      OR column_name ILIKE '%sueldo%'
      OR column_name ILIKE '%honorario%'
      OR column_name ILIKE '%valor%'
      OR column_name ILIKE '%base%'
    )
  ORDER BY table_name, ordinal_position
`);

console.table(result.rows);

await pool.end();
