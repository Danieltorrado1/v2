import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { Pool, type QueryResultRow } from 'pg';

dotenv.config();

const REPORT_FILE = path.resolve('reports/sst-phase-2-2-verification.json');

interface CountRow extends QueryResultRow {
  total: string;
}

interface RolePermissionRow extends QueryResultRow {
  nombre_rol: string;
  permiso: string;
}

interface ReviewCaseAggRow extends QueryResultRow {
  tipo_conflicto: string;
  estado: string;
  total: string;
}

interface PreparationAggRow extends QueryResultRow {
  estado_preparacion: string;
  total: string;
}

const createPool = (): Pool => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not defined');
  }

  return new Pool({
    connectionString: databaseUrl,
    ssl:
      databaseUrl.includes('supabase.com') || databaseUrl.includes('pooler.')
        ? { rejectUnauthorized: false }
        : false
  });
};

const queryCount = async (pool: Pool, sql: string, params?: unknown[]): Promise<number> => {
  const result = await pool.query<CountRow>(sql, params);
  return Number(result.rows[0]?.total ?? 0);
};

const main = async (): Promise<void> => {
  const pool = createPool();

  try {
    await mkdir(path.dirname(REPORT_FILE), { recursive: true });

    const [
      personas,
      vinculaciones,
      cobertura,
      focalizacionFinal,
      focalizacionVigencias,
      sstPerfil,
      sstPerfilVersiones,
      contactosEmergencia,
      vinculacionAfiliaciones,
      formacionAcademica,
      preparacionCount,
      revisionCount,
      pendingCapture,
      fullProfiles,
      incompleteProfiles,
      contactsSuggested,
      affiliationsSuggested,
      orphanPreparacion,
      orphanRevision,
      orphanFormacion,
      duplicatePreparacion,
      duplicateRevision,
      reviewAgg,
      preparationAgg,
      permissionsResult
    ] = await Promise.all([
      queryCount(pool, 'SELECT COUNT(*)::text AS total FROM personas'),
      queryCount(pool, 'SELECT COUNT(*)::text AS total FROM vinculaciones'),
      queryCount(pool, 'SELECT COUNT(*)::text AS total FROM cobertura_asignaciones'),
      queryCount(pool, 'SELECT COUNT(*)::text AS total FROM focalizacion_final'),
      queryCount(pool, 'SELECT COUNT(*)::text AS total FROM focalizacion_vigencias'),
      queryCount(pool, 'SELECT COUNT(*)::text AS total FROM sst_perfil_demografico'),
      queryCount(pool, 'SELECT COUNT(*)::text AS total FROM sst_perfil_demografico_versiones'),
      queryCount(pool, 'SELECT COUNT(*)::text AS total FROM persona_contactos_emergencia'),
      queryCount(pool, 'SELECT COUNT(*)::text AS total FROM vinculacion_afiliaciones'),
      queryCount(pool, 'SELECT COUNT(*)::text AS total FROM persona_formacion_academica'),
      queryCount(pool, 'SELECT COUNT(*)::text AS total FROM sst_preparacion_personas WHERE activo = TRUE'),
      queryCount(pool, 'SELECT COUNT(*)::text AS total FROM sst_revision_casos WHERE activo = TRUE'),
      queryCount(
        pool,
        `
          SELECT COUNT(*)::text AS total
          FROM sst_preparacion_personas
          WHERE activo = TRUE
            AND estado_preparacion = 'SIN_DATOS_DIGITALES'
        `
      ),
      queryCount(
        pool,
        `
          SELECT COUNT(*)::text AS total
          FROM sst_preparacion_personas
          WHERE activo = TRUE
            AND apto_apply = TRUE
            AND completitud_estado = 'COMPLETA'
        `
      ),
      queryCount(
        pool,
        `
          SELECT COUNT(*)::text AS total
          FROM sst_preparacion_personas
          WHERE activo = TRUE
            AND apto_apply = TRUE
            AND completitud_estado <> 'COMPLETA'
        `
      ),
      queryCount(
        pool,
        `
          SELECT COUNT(*)::text AS total
          FROM sst_preparacion_personas
          WHERE activo = TRUE
            AND propuesta_contacto_emergencia <> '{}'::jsonb
        `
      ),
      queryCount(
        pool,
        `
          SELECT COALESCE(SUM(jsonb_array_length(propuesta_afiliaciones)), 0)::text AS total
          FROM sst_preparacion_personas
          WHERE activo = TRUE
        `
      ),
      queryCount(
        pool,
        `
          SELECT COUNT(*)::text AS total
          FROM sst_preparacion_personas sp
          LEFT JOIN personas p ON p.id = sp.persona_id
          LEFT JOIN empresas e ON e.id = sp.empresa_id
          LEFT JOIN contratos c ON c.id = sp.contrato_id
          LEFT JOIN vinculaciones v ON v.id = sp.vinculacion_id
          WHERE sp.activo = TRUE
            AND (
              p.id IS NULL
              OR e.id IS NULL
              OR c.id IS NULL
              OR (sp.vinculacion_id IS NOT NULL AND v.id IS NULL)
            )
        `
      ),
      queryCount(
        pool,
        `
          SELECT COUNT(*)::text AS total
          FROM sst_revision_casos rc
          LEFT JOIN sst_preparacion_personas sp ON sp.id = rc.preparacion_id
          LEFT JOIN personas p ON p.id = rc.persona_id
          LEFT JOIN vinculaciones v ON v.id = rc.vinculacion_id
          WHERE rc.activo = TRUE
            AND (
              (rc.preparacion_id IS NOT NULL AND sp.id IS NULL)
              OR (rc.persona_id IS NOT NULL AND p.id IS NULL)
              OR (rc.vinculacion_id IS NOT NULL AND v.id IS NULL)
            )
        `
      ),
      queryCount(
        pool,
        `
          SELECT COUNT(*)::text AS total
          FROM persona_formacion_academica pfa
          LEFT JOIN personas p ON p.id = pfa.persona_id
          WHERE p.id IS NULL
        `
      ),
      queryCount(
        pool,
        `
          SELECT COUNT(*)::text AS total
          FROM (
            SELECT contrato_id, persona_id
            FROM sst_preparacion_personas
            WHERE activo = TRUE
            GROUP BY contrato_id, persona_id
            HAVING COUNT(*) > 1
          ) duplicated
        `
      ),
      queryCount(
        pool,
        `
          SELECT COUNT(*)::text AS total
          FROM (
            SELECT huella
            FROM sst_revision_casos
            WHERE activo = TRUE
            GROUP BY huella
            HAVING COUNT(*) > 1
          ) duplicated
        `
      ),
      pool.query<ReviewCaseAggRow>(
        `
          SELECT tipo_conflicto, estado, COUNT(*)::text AS total
          FROM sst_revision_casos
          WHERE activo = TRUE
          GROUP BY tipo_conflicto, estado
          ORDER BY tipo_conflicto, estado
        `
      ),
      pool.query<PreparationAggRow>(
        `
          SELECT estado_preparacion, COUNT(*)::text AS total
          FROM sst_preparacion_personas
          WHERE activo = TRUE
          GROUP BY estado_preparacion
          ORDER BY estado_preparacion
        `
      ),
      pool.query<RolePermissionRow>(
        `
          SELECT r.nombre_rol, CONCAT(p.modulo, '.', p.accion) AS permiso
          FROM roles r
          LEFT JOIN rol_permisos rp
            ON rp.rol_id = r.id
           AND rp.activo = TRUE
          LEFT JOIN permisos p
            ON p.id = rp.permiso_id
           AND p.activo = TRUE
          WHERE r.nombre_rol IN ('ADMINISTRADOR', 'SST', 'TALENTO_HUMANO')
          ORDER BY r.nombre_rol, permiso
        `
      )
    ]);

    const permissions = new Map<string, string[]>();
    for (const row of permissionsResult.rows) {
      const list = permissions.get(row.nombre_rol) ?? [];
      if (row.permiso) {
        list.push(row.permiso);
      }
      permissions.set(row.nombre_rol, list);
    }

    const report = {
      generated_at: new Date().toISOString(),
      counts: {
        personas,
        vinculaciones,
        cobertura_asignaciones: cobertura,
        focalizacion_final: focalizacionFinal,
        focalizacion_vigencias: focalizacionVigencias,
        sst_perfil_demografico: sstPerfil,
        sst_perfil_demografico_versiones: sstPerfilVersiones,
        persona_contactos_emergencia: contactosEmergencia,
        vinculacion_afiliaciones: vinculacionAfiliaciones,
        persona_formacion_academica: formacionAcademica,
        sst_preparacion_personas: preparacionCount,
        sst_revision_casos: revisionCount,
        pendientes_captura: pendingCapture,
        perfiles_completos_esperados: fullProfiles,
        perfiles_incompletos_esperados: incompleteProfiles,
        contactos_sugeridos_meta26: contactsSuggested,
        afiliaciones_sugeridas_meta26: affiliationsSuggested,
        huerfanos_preparacion: orphanPreparacion,
        huerfanos_revision: orphanRevision,
        huerfanos_formacion: orphanFormacion,
        duplicados_preparacion: duplicatePreparacion,
        duplicados_revision: duplicateRevision
      },
      preparation_by_status: preparationAgg.rows.map((row) => ({
        estado_preparacion: row.estado_preparacion,
        total: Number(row.total)
      })),
      review_cases: reviewAgg.rows.map((row) => ({
        tipo_conflicto: row.tipo_conflicto,
        estado: row.estado,
        total: Number(row.total)
      })),
      permissions: {
        ADMINISTRADOR: permissions.get('ADMINISTRADOR') ?? [],
        SST: permissions.get('SST') ?? [],
        TALENTO_HUMANO: permissions.get('TALENTO_HUMANO') ?? []
      }
    };

    await writeFile(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await pool.end();
  }
};

void main().catch((error) => {
  console.error('SST-2.2 verification failed.');
  console.error(error);
  process.exitCode = 1;
});
