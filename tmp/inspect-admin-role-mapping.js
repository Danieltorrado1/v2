require('dotenv').config({ path: '.env.qa' });
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const [roles, userRoles] = await Promise.all([
      client.query(`
        select r.id::text as role_id, r.nombre_rol, coalesce(r.activo, true) as activo,
          count(distinct rp.permiso_id)::int as permisos_activos
        from roles r
        left join rol_permisos rp on rp.rol_id = r.id and coalesce(rp.activo, true) = true
        where r.nombre_rol in ('ADMINISTRADOR', 'TALENTO_HUMANO')
        group by r.id, r.nombre_rol, r.activo
        order by r.nombre_rol, r.id
      `),
      client.query(`
        select u.id::text as user_id, u.correo, ur.rol_id::text as role_id, r.nombre_rol, coalesce(ur.activo, true) as user_role_activo,
          array_agg(distinct concat_ws('.', p.modulo, p.accion) order by concat_ws('.', p.modulo, p.accion))
            filter (where concat_ws('.', p.modulo, p.accion) in ('nomina.economico.read','nomina.parametros.manage','nomina.categorias.manage')) as permisos_objetivo
        from usuarios u
        join usuario_roles ur on ur.usuario_id = u.id
        join roles r on r.id = ur.rol_id
        left join rol_permisos rp on rp.rol_id = r.id and coalesce(rp.activo, true) = true
        left join permisos p on p.id = rp.permiso_id and coalesce(p.activo, true) = true
        where u.id in (9,10)
        group by u.id, u.correo, ur.rol_id, r.nombre_rol, ur.activo
        order by u.id, ur.rol_id
      `)
    ]);
    console.log(JSON.stringify({ roles: roles.rows, user_roles: userRoles.rows }, null, 2));
  } finally { await client.end(); }
}
main().catch((error)=>{ console.error(error); process.exit(1); });
