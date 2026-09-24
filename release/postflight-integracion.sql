\set ON_ERROR_STOP on
\pset footer off
\echo 'POSTFLIGHT INTEGRACION: solo lectura'

SELECT current_database() AS database_name, current_user AS current_role, session_user AS session_role,
       current_setting('server_version') AS postgres_version;

SELECT c.table_name, c.table_type
FROM information_schema.tables c
WHERE c.table_schema = 'public'
  AND c.table_name IN ('integracion_eventos','integracion_evento_impactos','nomina_liquidaciones')
ORDER BY c.table_name;

SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('integracion_eventos','integracion_evento_impactos','nomina_liquidaciones')
ORDER BY table_name, ordinal_position;

SELECT tc.table_name, tc.constraint_name, tc.constraint_type,
       pg_get_constraintdef(pc.oid) AS definition
FROM information_schema.table_constraints tc
JOIN pg_constraint pc ON pc.conname = tc.constraint_name
JOIN pg_class cls ON cls.oid = pc.conrelid
JOIN pg_namespace ns ON ns.oid = cls.relnamespace AND ns.nspname = tc.constraint_schema
WHERE tc.constraint_schema = 'public'
  AND tc.table_name IN ('integracion_eventos','integracion_evento_impactos','nomina_liquidaciones')
ORDER BY tc.table_name, tc.constraint_name;

SELECT tc.table_name, tc.constraint_name, kcu.column_name, ccu.table_name AS referenced_table,
       ccu.column_name AS referenced_column, rc.delete_rule, rc.update_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu USING (constraint_schema, constraint_name, table_name)
JOIN information_schema.constraint_column_usage ccu USING (constraint_schema, constraint_name)
JOIN information_schema.referential_constraints rc USING (constraint_schema, constraint_name)
WHERE tc.constraint_schema = 'public'
  AND tc.table_name IN ('integracion_eventos','integracion_evento_impactos')
ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position;

SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND (tablename LIKE 'integracion_%' OR indexname LIKE 'idx_integracion_%' OR indexname LIKE 'uq_integracion_%')
ORDER BY tablename, indexname;

SELECT n.nspname AS schema_name, c.relname AS object_name, pg_get_userbyid(c.relowner) AS owner,
       has_table_privilege(current_user, c.oid, 'SELECT') AS can_select,
       has_table_privilege(current_user, c.oid, 'INSERT') AS can_insert,
       has_table_privilege(current_user, c.oid, 'UPDATE') AS can_update,
       has_table_privilege(current_user, c.oid, 'DELETE') AS can_delete
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('integracion_eventos','integracion_evento_impactos')
ORDER BY c.relname;

SELECT r.rolname AS grantee, c.relname AS object_name,
       has_table_privilege(r.rolname, c.oid, 'SELECT') AS can_select,
       has_table_privilege(r.rolname, c.oid, 'INSERT') AS can_insert,
       has_table_privilege(r.rolname, c.oid, 'UPDATE') AS can_update,
       has_table_privilege(r.rolname, c.oid, 'DELETE') AS can_delete
FROM pg_roles r
CROSS JOIN pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE r.rolname IN ('anon','authenticated')
  AND n.nspname = 'public'
  AND c.relname IN ('integracion_eventos','integracion_evento_impactos')
ORDER BY r.rolname, c.relname;

SELECT 'integracion_eventos' AS object_name, COUNT(*)::bigint AS row_count FROM public.integracion_eventos
UNION ALL
SELECT 'integracion_evento_impactos', COUNT(*)::bigint FROM public.integracion_evento_impactos
UNION ALL
SELECT 'nomina_liquidaciones', COUNT(*)::bigint FROM public.nomina_liquidaciones;

SELECT COUNT(*)::bigint AS unexpected_status_count
FROM public.integracion_eventos
WHERE status NOT IN ('PENDIENTE','PROCESANDO','PROCESADO','ERROR');

SELECT COUNT(*)::bigint AS unexpected_event_type_count
FROM public.integracion_eventos
WHERE event_type NOT IN ('VINCULACION_CREADA','VINCULACION_ACTUALIZADA','VINCULACION_RETIRADA',
  'ASIGNACION_OPERATIVA_CAMBIADA','CONDICION_PENSION_CAMBIADA','ASISTENCIA_CAMBIADA',
  'NOVEDAD_CREADA','NOVEDAD_ACTUALIZADA','NOVEDAD_DESACTIVADA','TURNO_CREADO',
  'TURNO_ACTUALIZADO','TURNO_DESACTIVADO','LIQUIDACION_RECALCULADA','LIQUIDACION_FINALIZADA');

SELECT COUNT(*)::bigint AS non_default_recalc_count
FROM public.integracion_evento_impactos
WHERE recalc_estado <> 'SIN_CAMBIOS' OR recalc_attempts <> 0;

SELECT COUNT(*)::bigint AS flag_objects_in_database
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN ('INTEGRACION_OUTBOX_ENABLED','INTEGRACION_SYNC_ENABLED','INTEGRACION_RECALC_ENABLED');
