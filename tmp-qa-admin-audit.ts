import dotenv from 'dotenv';
import { Pool } from 'pg';
dotenv.config({ path: '.env.qa' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes('supabase.com') ? { rejectUnauthorized: false } : false });
const main = async () => {
const result = await pool.query(`
  SELECT u.id::text AS usuario_id, u.correo AS usuario_email, u.activo AS usuario_activo,
         au.email AS auth_email, au.email_confirmed_at IS NOT NULL AS email_confirmado,
         r.nombre_rol, r.activo AS rol_activo,
         COALESCE(json_agg(DISTINCT jsonb_build_object('permiso', p.modulo || '.' || p.accion, 'activo', COALESCE(rp.activo, TRUE))) FILTER (WHERE p.id IS NOT NULL), '[]'::json) AS permisos
  FROM usuarios u
  LEFT JOIN auth.users au ON au.id = u.auth_user_id
  LEFT JOIN usuario_roles ur ON ur.usuario_id = u.id AND COALESCE(ur.activo, TRUE)
  LEFT JOIN roles r ON r.id = ur.rol_id
  LEFT JOIN rol_permisos rp ON rp.rol_id = r.id AND COALESCE(rp.activo, TRUE)
  LEFT JOIN permisos p ON p.id = rp.permiso_id AND COALESCE(p.activo, TRUE)
  WHERE r.nombre_rol = 'ADMINISTRADOR'
  GROUP BY u.id, u.correo, u.activo, au.email, au.email_confirmed_at, r.nombre_rol, r.activo
  ORDER BY u.id
`);
console.log(JSON.stringify(result.rows, null, 2));
await pool.end();
};
void main();
