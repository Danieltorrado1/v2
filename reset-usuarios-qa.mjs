import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;

const usuarios = [
  ["admin.qa@empiria.example",  "AdminQA123456*"],
  ["th.qa@empiria.example",     "ThQA123456*"],
  ["gestor.qa@empiria.example", "GestorQA123456*"],
  ["nomina.qa@empiria.example", "NominaQA123456*"]
];

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const client = await pool.connect();

try {
  await client.query("BEGIN");

  for (const [correo, password] of usuarios) {
    const result = await client.query(
      "SELECT auth_user_id FROM usuarios WHERE LOWER(correo)=LOWER($1) LIMIT 1",
      [correo]
    );

    if (!result.rows[0]?.auth_user_id) {
      throw new Error(`No se encontró ${correo}`);
    }

    const hash = await bcrypt.hash(password, 10);

    await client.query(
      "UPDATE auth.users SET encrypted_password=$2, updated_at=NOW() WHERE id=$1",
      [result.rows[0].auth_user_id, hash]
    );

    console.log(`OK: ${correo}`);
  }

  await client.query("COMMIT");
  console.log("RESET QA COMPLETADO");
} catch (error) {
  await client.query("ROLLBACK");
  console.error(error);
} finally {
  client.release();
  await pool.end();
}
