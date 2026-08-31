import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const result = await pool.query(`
  SELECT
    p.id AS persona_id,
    p.numero_documento,
    p.nombres,
    p.apellidos,
    v.id AS vinculacion_id,
    v.estado,
    v.fecha_ingreso,
    v.salario_basico
  FROM personas p
  LEFT JOIN vinculaciones v ON v.persona_id = p.id
  WHERE p.numero_documento IN (
    '990000005',
    '990000003',
    '990000004',
    '990000001',
    '990000002'
  )
  ORDER BY p.numero_documento
`);

console.table(result.rows);

await pool.end();
