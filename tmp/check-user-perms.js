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
        array_agg(distinct concat_ws('.', p.modulo, p.accion) order by concat_ws('.', p.modulo, p.accion))
          filter (where p.id is not null) as permisos
      from usuarios u
      left join usuario_roles ur on ur.usuario_id = u.id and coalesce(ur.activo, true) = true
      left join roles r on r.id = ur.rol_id and coalesce(r.activo, true) = true
      left join rol_permisos rp on rp.rol_id = r.id and coalesce(rp.activo, true) = true
      left join permisos p on p.id = rp.permiso_id and coalesce(p.activo, true) = true
      where u.id = 9
      group by u.id, u.correo
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
