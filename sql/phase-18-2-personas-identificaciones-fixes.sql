BEGIN;

-- ============================================================
-- PHASE 18.2
-- Correcciones posteriores a la migración inicial
-- No modifica datos históricos.
-- ============================================================

-- ============================================================
-- 1. Eliminar índice anterior
-- ============================================================

DROP INDEX IF EXISTS idx_persona_identificaciones_documento_vigente;

-- ============================================================
-- 2. Crear índice correcto
-- Permite mismo número si el tipo documental es diferente
-- (CC 123 ≠ CE 123)
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_persona_identificaciones_tipo_numero_vigente
ON persona_identificaciones (
    tipo_documento_id,
    numero_documento
)
WHERE es_vigente = TRUE;

-- ============================================================
-- 3. Campos estándar de auditoría
-- ============================================================

ALTER TABLE persona_identificaciones
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE persona_identificaciones
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ============================================================
-- 4. Función para actualizar updated_at automáticamente
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at_persona_identificaciones()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

-- ============================================================
-- 5. Trigger
-- ============================================================

DROP TRIGGER IF EXISTS trg_persona_identificaciones_updated_at
ON persona_identificaciones;

CREATE TRIGGER trg_persona_identificaciones_updated_at
BEFORE UPDATE
ON persona_identificaciones
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_persona_identificaciones();

-- ============================================================
-- 6. Comentarios para documentación
-- ============================================================

COMMENT ON TABLE persona_identificaciones IS
'Historial completo de identificaciones de cada persona. Nunca se elimina información.';

COMMENT ON COLUMN persona_identificaciones.es_vigente IS
'Solo puede existir una identificación vigente por persona.';

COMMENT ON COLUMN persona_identificaciones.reemplaza_identificacion_id IS
'Permite reconstruir la cadena histórica de cambios.';

COMMENT ON COLUMN persona_identificaciones.created_at IS
'Fecha de creación del registro histórico.';

COMMENT ON COLUMN persona_identificaciones.updated_at IS
'Última actualización del registro histórico.';

COMMIT;