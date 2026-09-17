-- Existing period adjustments trigger recalculation. Grant only the existing
-- permission to ADMINISTRADOR / TALENTO_HUMANO; do not grant employment editing.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM permisos WHERE modulo='nomina' AND accion='recalculate' AND activo=TRUE) THEN
    RAISE EXCEPTION 'Missing existing permission nomina.recalculate';
  END IF;
END $$;
INSERT INTO rol_permisos (rol_id, permiso_id, activo)
SELECT r.id, p.id, TRUE FROM roles r CROSS JOIN permisos p
WHERE UPPER(r.nombre_rol) IN ('ADMINISTRADOR','TALENTO_HUMANO')
  AND COALESCE(r.activo,TRUE)=TRUE AND p.modulo='nomina' AND p.accion='recalculate' AND p.activo=TRUE
ON CONFLICT (rol_id,permiso_id) DO UPDATE SET activo=TRUE;
COMMIT;
