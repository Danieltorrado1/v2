require('dotenv').config({ path: '.env.qa' });
const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    const result = await client.query(`
      select
        u.id::text as user_id,
        u.correo,
        u.nombre_completo,
        coalesce(u.activo, true) as activo,
        array_agg(distinct r.nombre_rol order by r.nombre_rol) as roles
      from usuarios u
      join usuario_roles ur on ur.usuario_id = u.id and coalesce(ur.activo, true) = true
      join roles r on r.id = ur.rol_id and coalesce(r.activo, true) = true
      where coalesce(u.activo, true) = true
        and r.nombre_rol in ('ADMINISTRADOR', 'TALENTO_HUMANO')
      group by u.id, u.correo, u.nombre_completo, u.activo
      order by u.id asc
    `);
    console.log(JSON.stringify(result.rows, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
