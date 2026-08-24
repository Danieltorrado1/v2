ALTER TABLE sst_perfil_restringido
  ADD COLUMN IF NOT EXISTS tiene_discapacidad BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS tipo_discapacidad TEXT NULL,
  ADD COLUMN IF NOT EXISTS presenta_alergias TEXT NULL,
  ADD COLUMN IF NOT EXISTS medicamentos_permanentes TEXT NULL,
  ADD COLUMN IF NOT EXISTS enfermedad TEXT NULL;
