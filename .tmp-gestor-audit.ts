import fs from 'node:fs';
import dotenv from 'dotenv';
import { Pool } from 'pg';

const envPath = process.env.DOTENV_CONFIG_PATH
  ?? (fs.existsSync('.env.qa') ? '.env.qa' : '.env');

dotenv.config({ path: envPath });

const email = 'gestor.qa@empiria.example';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const main = async () => {
  const client = await pool.connect();
  try {
    const userResult = await client.query(
      `
        SELECT
          u.id::text AS id,
          u.correo,
          u.nombre_completo,
          COALESCE(u.activo, TRUE) AS activo,
          COALESCE(
            ARRAY(
              SELECT DISTINCT r.nombre_rol
              FROM usuario_roles ur
              INNER JOIN roles r ON r.id = ur.rol_id
              WHERE ur.usuario_id = u.id
                AND COALESCE(ur.activo, TRUE) = TRUE
                AND COALESCE(r.activo, TRUE) = TRUE
              ORDER BY r.nombre_rol
            ),
            ARRAY[]::text[]
          ) AS roles,
          COALESCE(
            ARRAY(
              SELECT DISTINCT CONCAT_WS('.', p.modulo, p.accion)
              FROM usuario_roles ur
              INNER JOIN rol_permisos rp ON rp.rol_id = ur.rol_id
              INNER JOIN permisos p ON p.id = rp.permiso_id
              WHERE ur.usuario_id = u.id
                AND COALESCE(ur.activo, TRUE) = TRUE
                AND COALESCE(rp.activo, TRUE) = TRUE
                AND COALESCE(p.activo, TRUE) = TRUE
              ORDER BY CONCAT_WS('.', p.modulo, p.accion)
            ),
            ARRAY[]::text[]
          ) AS permissions
        FROM usuarios u
        WHERE LOWER(u.correo) = LOWER($1)
        LIMIT 1
      `,
      [email]
    );

    const user = userResult.rows[0];
    if (!user) {
      throw new Error(`No se encontró ${email}`);
    }

    const empresas = await client.query(
      `
        SELECT ue.empresa_id::text AS empresa_id, e.nombre_empresa
        FROM usuario_empresas ue
        INNER JOIN empresas e ON e.id = ue.empresa_id
        WHERE ue.usuario_id = $1::bigint
          AND COALESCE(ue.activo, TRUE) = TRUE
        ORDER BY ue.empresa_id ASC
      `,
      [user.id]
    );

    const contratos = await client.query(
      `
        SELECT uc.contrato_id::text AS contrato_id, c.empresa_id::text AS empresa_id, c.numero_contrato
        FROM usuario_contratos uc
        INNER JOIN contratos c ON c.id = uc.contrato_id
        WHERE uc.usuario_id = $1::bigint
          AND COALESCE(uc.activo, TRUE) = TRUE
        ORDER BY uc.contrato_id ASC
      `,
      [user.id]
    );

    const responsabilidades = await client.query(
      `
        SELECT
          nru.id::text AS id,
          nru.empresa_id::text AS empresa_id,
          nru.proceso,
          nru.activo,
          COALESCE(
            ARRAY(
              SELECT nrm.municipio_id::text
              FROM nomina_responsabilidad_municipios nrm
              WHERE nrm.responsabilidad_id = nru.id
              ORDER BY nrm.municipio_id
            ),
            ARRAY[]::text[]
          ) AS municipio_ids
        FROM nomina_responsabilidades_usuario nru
        WHERE nru.usuario_id = $1::bigint
        ORDER BY nru.empresa_id, nru.proceso
      `,
      [user.id]
    );

    const gestorMunicipios = await client.query(
      `
        SELECT
          gma.id::text AS id,
          gma.contrato_id::text AS contrato_id,
          gma.municipio_id::text AS municipio_id,
          m.nombre_municipio,
          COALESCE(gma.alcance_personal, 'PERSONAL_SELECCIONADO') AS alcance_personal,
          gma.vigencia_desde::text AS vigencia_desde,
          gma.vigencia_hasta::text AS vigencia_hasta,
          COALESCE(gma.activo, TRUE) AS activo
        FROM gestor_municipio_asignaciones gma
        INNER JOIN municipios m ON m.id = gma.municipio_id
        WHERE gma.usuario_id = $1::bigint
        ORDER BY gma.contrato_id, gma.municipio_id
      `,
      [user.id]
    );

    const gestorPersonal = await client.query(
      `
        SELECT
          gpa.id::text AS id,
          gpa.contrato_id::text AS contrato_id,
          gpa.vinculacion_id::text AS vinculacion_id,
          CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS nombre_completo,
          COALESCE(gpa.activo, TRUE) AS activo,
          gpa.vigencia_desde::text AS vigencia_desde,
          gpa.vigencia_hasta::text AS vigencia_hasta
        FROM gestor_personal_asignaciones gpa
        INNER JOIN vinculaciones v ON v.id = gpa.vinculacion_id
        INNER JOIN personas p ON p.id = v.persona_id
        WHERE gpa.usuario_id = $1::bigint
        ORDER BY gpa.contrato_id, gpa.vinculacion_id
      `,
      [user.id]
    );

    console.log(JSON.stringify({
      user,
      empresas: empresas.rows,
      contratos: contratos.rows,
      responsabilidades: responsabilidades.rows,
      gestorMunicipios: gestorMunicipios.rows,
      gestorPersonalCount: gestorPersonal.rowCount ?? 0,
      gestorPersonalPreview: gestorPersonal.rows.slice(0, 10)
    }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
};

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
