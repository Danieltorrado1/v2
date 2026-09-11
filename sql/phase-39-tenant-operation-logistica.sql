-- Phase 39: register and explicitly enable tenant operation modules.
-- Does not alter plans or enable these modules for other companies.
INSERT INTO public.modulos (codigo, nombre, descripcion, categoria, icono, ruta_base, orden, activo)
VALUES
  ('OPERACION', 'Operacion', 'Operacion empresarial', 'EMPRESA', 'Workflow', '/operacion', 119, TRUE),
  ('LOGISTICA', 'Logistica', 'Logistica empresarial', 'EMPRESA', 'Truck', '/logistica', 139, TRUE),
  ('CONFIGURACION_EMPRESA', 'Configuracion de empresa', 'Configuracion especifica del tenant', 'CONFIGURACION', 'Settings', '/configuracion', 169, TRUE)
ON CONFLICT (codigo) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  categoria = EXCLUDED.categoria,
  icono = EXCLUDED.icono,
  ruta_base = EXCLUDED.ruta_base,
  orden = EXCLUDED.orden,
  activo = TRUE,
  updated_at = NOW();

INSERT INTO public.permisos (modulo, accion, descripcion, activo)
VALUES
  ('operacion', 'read', 'Consultar operacion empresarial', TRUE),
  ('logistica', 'read', 'Consultar logistica empresarial', TRUE)
ON CONFLICT (modulo, accion) DO UPDATE SET
  descripcion = EXCLUDED.descripcion,
  activo = TRUE;

INSERT INTO public.rol_permisos (rol_id, permiso_id, activo)
SELECT r.id, p.id, TRUE
FROM public.roles r
JOIN public.permisos p ON (p.modulo, p.accion) IN (('operacion', 'read'), ('logistica', 'read'))
WHERE r.nombre_rol = 'ADMINISTRADOR'
ON CONFLICT (rol_id, permiso_id) DO UPDATE SET activo = TRUE;

-- Controlled tenant enablement for the reported company only.
-- Explicit overrides work for legacy companies without changing other tenants.
INSERT INTO public.empresa_modulo_overrides
  (empresa_id, modulo_id, habilitado, motivo, fecha_inicio, fecha_fin)
SELECT 15, m.id, TRUE, 'Habilitacion controlada de Operacion y Logistica para CONSORCIO PAE META-26', CURRENT_DATE, NULL
FROM public.modulos m
WHERE m.codigo IN ('OPERACION', 'LOGISTICA')
  AND EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = 15)
  AND NOT EXISTS (
    SELECT 1 FROM public.empresa_modulo_overrides current_override
    WHERE current_override.empresa_id = 15
      AND current_override.modulo_id = m.id
      AND current_override.fecha_fin IS NULL
  );