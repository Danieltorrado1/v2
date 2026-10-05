-- psql -X --set=ON_ERROR_STOP=1 --set=actor_id=<authorized actor> --file=<this file>
-- Connection must additionally have default_transaction_read_only=on.
-- No advisory locks, mutations, migrations or application endpoints are used.
\if :{?actor_id}
\else
  \echo 'actor_id is required; preflight stopped'
  \quit 3
\endif
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '2s';
SELECT current_database(),current_setting('server_version') server_version,
       current_setting('transaction_read_only') transaction_read_only;

SELECT column_name,data_type,is_nullable,column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='cobertura_asignaciones'
ORDER BY ordinal_position;

SELECT conname,contype,convalidated,pg_get_constraintdef(oid) definition
FROM pg_constraint WHERE conrelid='public.cobertura_asignaciones'::regclass
ORDER BY conname;

SELECT indexname,indexdef FROM pg_indexes
WHERE schemaname='public' AND tablename='cobertura_asignaciones' ORDER BY indexname;

SELECT c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) definition,
       p.oid::regprocedure::text function,md5(pg_get_functiondef(p.oid)) function_digest
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_proc p ON p.oid=t.tgfoid
WHERE n.nspname='public' AND NOT t.tgisinternal
  AND c.relname IN ('cobertura_asignaciones','nomina_movimientos','nomina_contextos_operativos_base',
                   'nomina_empleados','nomina_periodos') ORDER BY c.relname,t.tgname;

SELECT count(*) waiting_locks FROM pg_locks WHERE NOT granted;
SELECT estado,count(*) periods FROM nomina_periodos GROUP BY estado ORDER BY estado;

-- Counts only: no employee names/documents. Intervals are inclusive.
WITH ordered AS (
  SELECT contrato_id,vinculacion_id,fecha_inicio,fecha_fin,
    row_number() OVER w row_number,
    lag(fecha_fin) OVER w previous_end
  FROM cobertura_asignaciones WHERE COALESCE(activo,TRUE)
  WINDOW w AS (PARTITION BY contrato_id,vinculacion_id ORDER BY fecha_inicio,id)
)
SELECT count(*) FILTER(WHERE row_number>1 AND (previous_end IS NULL OR previous_end>=fecha_inicio)) overlap_count,
       count(*) FILTER(WHERE row_number>1 AND previous_end<fecha_inicio-1) gaps,
       count(*) FILTER(WHERE fecha_fin<fecha_inicio) invalid_intervals
FROM ordered;

SELECT count(*) orphan_contexts FROM nomina_contextos_operativos_base b
LEFT JOIN nomina_empleados ne ON ne.id=b.nomina_empleado_id
LEFT JOIN nomina_periodos np ON np.id=b.periodo_id
WHERE ne.id IS NULL OR np.id IS NULL OR ne.periodo_id<>b.periodo_id OR ne.vinculacion_id<>b.vinculacion_id;

SELECT count(*) duplicated_operations FROM (
  SELECT periodo_id,vinculacion_id,fecha,contexto_nuevo->>'institucion_id',
         contexto_nuevo->>'sede_id',contexto_nuevo->>'modalidad_id'
  FROM nomina_movimientos WHERE activo AND familia_movimiento='CAMBIO_OPERATIVO'
    AND tipo_movimiento='CAMBIO_DE_MODALIDAD'
  GROUP BY periodo_id,vinculacion_id,fecha,contexto_nuevo->>'institucion_id',
           contexto_nuevo->>'sede_id',contexto_nuevo->>'modalidad_id' HAVING count(*)>1
) duplicate_groups;

-- JSON access makes this readable both before and after the prerequisite SQL.
SELECT count(*) operations_without_matching_assignment FROM nomina_movimientos nm
WHERE nm.activo AND nm.familia_movimiento='CAMBIO_OPERATIVO' AND nm.tipo_movimiento='CAMBIO_DE_MODALIDAD'
AND NOT EXISTS (
  SELECT 1 FROM cobertura_asignaciones ca LEFT JOIN focalizacion_final ff ON ff.id=ca.focalizacion_final_id
  WHERE ca.vinculacion_id=nm.vinculacion_id AND COALESCE(ca.activo,TRUE)
    AND ca.fecha_inicio<=nm.fecha AND (ca.fecha_fin IS NULL OR ca.fecha_fin>=nm.fecha)
    AND COALESCE(to_jsonb(ca)->>'institucion_id',ff.institucion_id::text)=nm.contexto_nuevo->>'institucion_id'
    AND COALESCE(to_jsonb(ca)->>'sede_id',ff.sede_id::text)=nm.contexto_nuevo->>'sede_id'
    AND COALESCE(to_jsonb(ca)->>'modalidad_id',ff.modalidad_id::text)=nm.contexto_nuevo->>'modalidad_id'
);

SELECT id,activo FROM usuarios WHERE id=:'actor_id'::bigint;
-- SQL actor existence does not grant permission to perform a functional change.
-- Effective company/contract membership and RBAC must be checked for the future
-- execution scope; public health does not expose SYNC, so obtain live evidence.
COMMIT;
