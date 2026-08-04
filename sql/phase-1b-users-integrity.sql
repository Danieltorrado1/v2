-- FASE 1B: migration aditiva. Ejecutar primero el script audit-users-schema.ts.
-- No borra ni repara filas automáticamente: aborta si la integridad no permite
-- crear las restricciones solicitadas.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id IS NULL) THEN
    RAISE EXCEPTION 'FASE_1B_ABORT: usuarios.auth_user_id contiene valores NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM usuarios u
    LEFT JOIN auth.users au ON au.id = u.auth_user_id
    WHERE au.id IS NULL
  ) THEN
    RAISE EXCEPTION 'FASE_1B_ABORT: usuarios.auth_user_id contiene referencias inexistentes en auth.users';
  END IF;

  IF EXISTS (
    SELECT 1 FROM usuarios
    GROUP BY auth_user_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'FASE_1B_ABORT: usuarios.auth_user_id contiene duplicados';
  END IF;

  IF EXISTS (
    SELECT 1 FROM usuarios
    GROUP BY lower(correo)
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'FASE_1B_ABORT: usuarios.correo contiene duplicados sin distinguir mayusculas';
  END IF;
END $$;

-- El esquema auditado ya posee usuarios_auth_user_id_key. Para instalaciones
-- anteriores se crea la unicidad sin imponer NOT NULL.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'usuarios'
      AND indexdef LIKE 'CREATE UNIQUE INDEX% (auth_user_id)'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX usuarios_auth_user_id_unique_idx ON usuarios (auth_user_id)';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_correo_lower_unique_idx
  ON usuarios (lower(correo));
