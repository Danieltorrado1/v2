-- Configuración explícita y auditable de pensión por vinculación.
ALTER TABLE vinculaciones
  ADD COLUMN IF NOT EXISTS cotiza_pension BOOLEAN NOT NULL DEFAULT TRUE;

-- Los registros existentes permanecen en TRUE; no hay deducción automática.
