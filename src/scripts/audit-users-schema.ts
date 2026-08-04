import { dbPool } from '../config/db';

const targetTables = [
  'usuarios',
  'roles',
  'usuario_roles',
  'usuario_empresas',
  'usuario_contratos',
  'rol_permisos',
  'permisos',
  'contratos'
] as const;

const main = async (): Promise<void> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN READ ONLY');
    const columns = await client.query(
      `
        SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])
        ORDER BY table_name, ordinal_position
      `,
      [targetTables]
    );
    const constraints = await client.query(
      `
        SELECT tc.table_name, tc.constraint_name, tc.constraint_type,
               pg_get_constraintdef(c.oid) AS definition
        FROM information_schema.table_constraints tc
        INNER JOIN pg_constraint c
          ON c.conname = tc.constraint_name
         AND c.conrelid = format('%I.%I', tc.table_schema, tc.table_name)::regclass
        WHERE tc.table_schema = 'public'
          AND tc.table_name = ANY($1::text[])
        ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name
      `,
      [targetTables]
    );
    const indexes = await client.query(
      `
        SELECT tablename AS table_name, indexname AS index_name, indexdef AS definition
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = ANY($1::text[])
        ORDER BY tablename, indexname
      `,
      [targetTables]
    );
    const orphans = await client.query(`
      SELECT 'usuarios.auth_user_id_null' AS finding, COUNT(*)::text AS total FROM usuarios WHERE auth_user_id IS NULL
      UNION ALL SELECT 'usuarios.auth_user_missing', COUNT(*)::text FROM usuarios u LEFT JOIN auth.users au ON au.id = u.auth_user_id WHERE u.auth_user_id IS NOT NULL AND au.id IS NULL
      UNION ALL SELECT 'usuarios.auth_user_duplicate', COUNT(*)::text FROM (SELECT auth_user_id FROM usuarios WHERE auth_user_id IS NOT NULL GROUP BY auth_user_id HAVING COUNT(*) > 1) duplicates
      UNION ALL SELECT 'usuarios.correo_duplicate_ci', COUNT(*)::text FROM (SELECT lower(correo) FROM usuarios GROUP BY lower(correo) HAVING COUNT(*) > 1) duplicates
      UNION ALL SELECT 'usuario_roles.usuario_missing', COUNT(*)::text FROM usuario_roles ur LEFT JOIN usuarios u ON u.id = ur.usuario_id WHERE u.id IS NULL
      UNION ALL SELECT 'usuario_roles.role_missing', COUNT(*)::text FROM usuario_roles ur LEFT JOIN roles r ON r.id = ur.rol_id WHERE r.id IS NULL
      UNION ALL SELECT 'usuario_empresas.usuario_missing', COUNT(*)::text FROM usuario_empresas ue LEFT JOIN usuarios u ON u.id = ue.usuario_id WHERE u.id IS NULL
      UNION ALL SELECT 'usuario_empresas.empresa_missing', COUNT(*)::text FROM usuario_empresas ue LEFT JOIN empresas e ON e.id = ue.empresa_id WHERE e.id IS NULL
      UNION ALL SELECT 'usuario_contratos.usuario_missing', COUNT(*)::text FROM usuario_contratos uc LEFT JOIN usuarios u ON u.id = uc.usuario_id WHERE u.id IS NULL
      UNION ALL SELECT 'usuario_contratos.contrato_missing', COUNT(*)::text FROM usuario_contratos uc LEFT JOIN contratos c ON c.id = uc.contrato_id WHERE c.id IS NULL
      UNION ALL SELECT 'usuario_contratos.company_not_assigned_active', COUNT(*)::text FROM usuario_contratos uc INNER JOIN contratos c ON c.id = uc.contrato_id LEFT JOIN usuario_empresas ue ON ue.usuario_id = uc.usuario_id AND ue.empresa_id = c.empresa_id AND COALESCE(ue.activo, TRUE) = TRUE WHERE COALESCE(uc.activo, TRUE) = TRUE AND ue.usuario_id IS NULL
    `);
    await client.query('COMMIT');
    console.log(JSON.stringify({ columns: columns.rows, constraints: constraints.rows, indexes: indexes.rows, orphans: orphans.rows }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await dbPool.end();
  }
};

void main();
