-- Review/apply through the normal migration process. Never run on production
-- as part of an individual operational change. Monthly focalization is untouched.
ALTER TABLE cobertura_asignaciones
  ADD COLUMN IF NOT EXISTS institucion_id bigint REFERENCES instituciones(id),
  ADD COLUMN IF NOT EXISTS sede_id bigint REFERENCES sedes(id),
  ADD COLUMN IF NOT EXISTS modalidad_id bigint REFERENCES modalidades(id);

-- Independent assignment versions do not create a monthly projection row.
ALTER TABLE cobertura_asignaciones ALTER COLUMN focalizacion_final_id DROP NOT NULL;

UPDATE cobertura_asignaciones ca
SET institucion_id = ff.institucion_id, sede_id = ff.sede_id,
    modalidad_id = ff.modalidad_id
FROM focalizacion_final ff
WHERE ff.id = ca.focalizacion_final_id
  AND ca.contrato_id = ff.contrato_id
  AND ca.institucion_id IS NULL AND ca.sede_id IS NULL AND ca.modalidad_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_cobertura_asignaciones_timeline
  ON cobertura_asignaciones(contrato_id, vinculacion_id, fecha_inicio, fecha_fin);
