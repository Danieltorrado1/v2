-- Grant only the operational-assignment edit capability to the roles that manage Personal.
-- Idempotent: no existing permissions or role assignments are removed.
INSERT INTO permisos (modulo, accion, descripcion, activo)
VALUES ('vinculacion', 'editar_asignacion', 'Permiso para editar institución, sede y modalidad de asignación operativa', TRUE)
ON CONFLICT (modulo, accion)
DO UPDATE SET descripcion = EXCLUDED.descripcion, activo = TRUE;

INSERT INTO rol_permisos (rol_id, permiso_id, activo)
SELECT r.id, p.id, TRUE
FROM roles r
JOIN permisos p ON p.modulo = 'vinculacion' AND p.accion = 'editar_asignacion'
WHERE r.nombre_rol IN ('ADMINISTRADOR', 'TALENTO_HUMANO')
ON CONFLICT (rol_id, permiso_id)
DO UPDATE SET activo = TRUE;
