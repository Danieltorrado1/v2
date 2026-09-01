import { dbPool } from '../src/config/db';

async function main() {
  const periodo = await dbPool.query(`
    SELECT
      np.id::text AS periodo_id,
      np.nombre_periodo,
      np.fecha_inicio::text,
      np.fecha_fin::text,
      np.estado,
      c.id::text AS contrato_id,
      c.empresa_id::text AS empresa_id
    FROM nomina_periodos np
    INNER JOIN contratos c ON c.id = np.contrato_id
    WHERE c.empresa_id = 15
      AND c.id = 24
      AND np.fecha_inicio <= DATE '2026-08-31'
      AND np.fecha_fin >= DATE '2026-08-01'
    ORDER BY np.fecha_inicio DESC
  `);

  const users = await dbPool.query(`
    SELECT
      u.id::text AS user_id,
      u.correo,
      COALESCE(
        ARRAY(
          SELECT nombre_rol
          FROM (
            SELECT DISTINCT r.nombre_rol AS nombre_rol
            FROM usuario_roles ur
            INNER JOIN roles r ON r.id = ur.rol_id
            WHERE ur.usuario_id = u.id
              AND COALESCE(ur.activo, TRUE) = TRUE
              AND COALESCE(r.activo, TRUE) = TRUE
          ) roles_d
          ORDER BY nombre_rol
        ),
        ARRAY[]::text[]
      ) AS roles,
      COALESCE(
        ARRAY(
          SELECT permission_code
          FROM (
            SELECT DISTINCT CONCAT_WS('.', p.modulo, p.accion) AS permission_code
            FROM usuario_roles ur
            INNER JOIN rol_permisos rp ON rp.rol_id = ur.rol_id
            INNER JOIN permisos p ON p.id = rp.permiso_id
            WHERE ur.usuario_id = u.id
              AND COALESCE(ur.activo, TRUE) = TRUE
              AND COALESCE(rp.activo, TRUE) = TRUE
              AND COALESCE(p.activo, TRUE) = TRUE
          ) permisos_d
          ORDER BY permission_code
        ),
        ARRAY[]::text[]
      ) AS permisos
    FROM usuarios u
    INNER JOIN usuario_empresas ue ON ue.usuario_id = u.id
    WHERE ue.empresa_id = 15
      AND COALESCE(ue.activo, TRUE) = TRUE
      AND COALESCE(u.activo, TRUE) = TRUE
    ORDER BY u.id
    LIMIT 50
  `);

  const candidates = await dbPool.query(`
    SELECT
      ne.id::text AS nomina_empleado_id,
      ne.vinculacion_id::text,
      p.numero_documento,
      CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS nombre,
      np.id::text AS periodo_id
    FROM nomina_empleados ne
    INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id
    INNER JOIN personas p ON p.id = v.persona_id
    INNER JOIN nomina_periodos np ON np.id = ne.periodo_id
    WHERE np.contrato_id = 24
      AND np.fecha_inicio <= DATE '2026-08-31'
      AND np.fecha_fin >= DATE '2026-08-01'
      AND COALESCE(ne.activo, TRUE) = TRUE
      AND NOT EXISTS (
        SELECT 1
        FROM nomina_novedades nn
        WHERE nn.nomina_empleado_id = ne.id
          AND COALESCE(nn.activo, TRUE) = TRUE
          AND COALESCE(nn.fecha_inicio, np.fecha_inicio) <= DATE '2026-08-27'
          AND COALESCE(nn.fecha_fin, nn.fecha_inicio, np.fecha_fin) >= DATE '2026-08-25'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM nomina_asistencia_diaria na
        WHERE na.periodo_id = np.id
          AND na.vinculacion_id = ne.vinculacion_id
          AND na.fecha BETWEEN DATE '2026-08-25' AND DATE '2026-08-27'
          AND COALESCE(na.activo, TRUE) = TRUE
      )
    ORDER BY p.primer_apellido NULLS LAST, p.primer_nombre NULLS LAST
    LIMIT 20
  `);

  console.log(JSON.stringify({ periodo: periodo.rows, users: users.rows, candidates: candidates.rows }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await dbPool.end();
  });
