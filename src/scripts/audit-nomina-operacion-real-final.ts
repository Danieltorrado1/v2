import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Pool, QueryResultRow } from 'pg';

const explicitEnvFile = process.env.ENV_FILE?.trim();
dotenv.config(explicitEnvFile ? { path: explicitEnvFile } : undefined);

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

const QA_REGEX = '(^|[^A-Z])QA([^A-Z]|$)|QA_|_QA|PRUEBA|TEST|DEMO|DUMMY|MOCK|CAA1';
const EXECUTION_DATE = new Date().toISOString().slice(0, 10);
const REPORTS_DIR = path.resolve(process.cwd(), 'reports');
const REPORT_PATH = path.join(REPORTS_DIR, `nomina-operacion-real-audit-${EXECUTION_DATE}.json`);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const normalize = (value: unknown): Json => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => normalize(item));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, normalize(item)])
    );
  }
  return String(value);
};

const rowsToJson = <T extends QueryResultRow>(rows: T[]): Json[] =>
  rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalize(value)])));

const rowToJson = <T extends QueryResultRow>(row: T | undefined): Json =>
  row
    ? Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalize(value)]))
    : null;

const main = async (): Promise<void> => {
  const client = await pool.connect();

  try {
    const [schemaObjects, schemaConstraints] = await Promise.all([
      client.query<{
        object_name: string;
        exists: boolean;
      }>(
        `
          SELECT *
          FROM (
            VALUES
              ('nomina_parametros_economicos', to_regclass('public.nomina_parametros_economicos') IS NOT NULL),
              ('nomina_categorias_salariales', to_regclass('public.nomina_categorias_salariales') IS NOT NULL),
              ('nomina_contextos_operativos_base', to_regclass('public.nomina_contextos_operativos_base') IS NOT NULL),
              ('nomina_novedad_turnos', to_regclass('public.nomina_novedad_turnos') IS NOT NULL),
              ('nomina_revision_operativa', to_regclass('public.nomina_revision_operativa') IS NOT NULL),
              ('nomina_responsabilidades_usuario', to_regclass('public.nomina_responsabilidades_usuario') IS NOT NULL),
              ('nomina_areas', to_regclass('public.nomina_areas') IS NOT NULL),
              ('cobertura_externos', to_regclass('public.cobertura_externos') IS NOT NULL),
              ('nomina_novedad_documentos', to_regclass('public.nomina_novedad_documentos') IS NOT NULL),
              ('empresa_configuracion_general', to_regclass('public.empresa_configuracion_general') IS NOT NULL),
              ('empresa_modulo_configuracion', to_regclass('public.empresa_modulo_configuracion') IS NOT NULL),
              ('nomina_desprendibles', to_regclass('public.nomina_desprendibles') IS NOT NULL)
          ) AS t(object_name, exists)
          ORDER BY object_name
        `
      ),
      client.query<{
        conname: string;
        table_name: string;
        definition: string;
      }>(
        `
          SELECT c.conname, cl.relname AS table_name, pg_get_constraintdef(c.oid) AS definition
          FROM pg_constraint c
          JOIN pg_class cl ON cl.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = cl.relnamespace
          WHERE n.nspname = 'public'
            AND c.conname IN (
              'ex_nomina_parametros_sin_solape',
              'ex_nomina_categoria_salarial_sin_solape',
              'chk_nomina_categoria_salarial_vigencia'
            )
          ORDER BY c.conname
        `
      )
    ]);

    const empresas = await client.query(
      `
        WITH contrato_stats AS (
          SELECT
            c.empresa_id,
            COUNT(*) FILTER (WHERE COALESCE(c.activo, TRUE) = TRUE)::int AS contratos_activos,
            COUNT(*)::int AS contratos_total
          FROM contratos c
          GROUP BY c.empresa_id
        ),
        vinculacion_stats AS (
          SELECT
            v.empresa_id,
            COUNT(*)::int AS vinculaciones_total,
            COUNT(*) FILTER (
              WHERE COALESCE(v.fecha_fin, DATE '9999-12-31') >= CURRENT_DATE
            )::int AS vinculaciones_vigentes
          FROM vinculaciones v
          GROUP BY v.empresa_id
        ),
        nomina_stats AS (
          SELECT
            c.empresa_id,
            COUNT(*)::int AS periodos_nomina,
            MAX(np.fecha_fin) AS ultimo_periodo_fin
          FROM nomina_periodos np
          JOIN contratos c ON c.id = np.contrato_id
          GROUP BY c.empresa_id
        )
        SELECT
          e.id::text AS empresa_id,
          e.nombre_empresa,
          e.nit,
          e.activo,
          o.id::text AS organizacion_id,
          o.nombre AS organizacion_nombre,
          COALESCE(cs.contratos_activos, 0) AS contratos_activos,
          COALESCE(cs.contratos_total, 0) AS contratos_total,
          COALESCE(vs.vinculaciones_vigentes, 0) AS vinculaciones_vigentes,
          COALESCE(vs.vinculaciones_total, 0) AS vinculaciones_total,
          COALESCE(ns.periodos_nomina, 0) AS periodos_nomina,
          ns.ultimo_periodo_fin::text AS ultimo_periodo_fin,
          (
            UPPER(COALESCE(e.nombre_empresa, '')) ~ $1
            OR UPPER(COALESCE(o.nombre, '')) ~ $1
          ) AS parece_qa
        FROM empresas e
        JOIN organizaciones o ON o.id = e.organizacion_id
        LEFT JOIN contrato_stats cs ON cs.empresa_id = e.id
        LEFT JOIN vinculacion_stats vs ON vs.empresa_id = e.id
        LEFT JOIN nomina_stats ns ON ns.empresa_id = e.id
        WHERE COALESCE(e.activo, TRUE) = TRUE
        ORDER BY COALESCE(ns.ultimo_periodo_fin, DATE '1900-01-01') DESC, e.id DESC
      `,
      [QA_REGEX]
    );

    const contratos = await client.query(
      `
        WITH categorias_stats AS (
          SELECT
            contrato_id,
            COUNT(*)::int AS categorias_total,
            COUNT(*) FILTER (WHERE COALESCE(activo, TRUE) = TRUE)::int AS categorias_activas
          FROM nomina_categorias_salariales
          GROUP BY contrato_id
        ),
        periodos_stats AS (
          SELECT
            contrato_id,
            COUNT(*)::int AS periodos_nomina,
            MAX(fecha_fin) AS ultimo_periodo_fin
          FROM nomina_periodos
          GROUP BY contrato_id
        ),
        vinculacion_stats AS (
          SELECT
            contrato_id,
            COUNT(*)::int AS vinculaciones_total,
            COUNT(*) FILTER (
              WHERE COALESCE(fecha_fin, DATE '9999-12-31') >= CURRENT_DATE
            )::int AS vinculaciones_vigentes
          FROM vinculaciones
          GROUP BY contrato_id
        )
        SELECT
          c.id::text AS contrato_id,
          c.empresa_id::text AS empresa_id,
          e.nombre_empresa,
          c.numero_contrato,
          c.entidad_contratante,
          c.estado_contractual,
          c.fecha_inicio::text,
          c.fecha_finalizacion::text,
          c.activo,
          COALESCE(vs.vinculaciones_vigentes, 0) AS vinculaciones_vigentes,
          COALESCE(vs.vinculaciones_total, 0) AS vinculaciones_total,
          COALESCE(cs.categorias_activas, 0) AS categorias_activas,
          COALESCE(cs.categorias_total, 0) AS categorias_total,
          COALESCE(ps.periodos_nomina, 0) AS periodos_nomina,
          ps.ultimo_periodo_fin::text AS ultimo_periodo_fin,
          (
            UPPER(COALESCE(c.numero_contrato, '')) ~ $1
            OR UPPER(COALESCE(c.entidad_contratante, '')) ~ $1
            OR UPPER(COALESCE(e.nombre_empresa, '')) ~ $1
          ) AS parece_qa
        FROM contratos c
        JOIN empresas e ON e.id = c.empresa_id
        LEFT JOIN categorias_stats cs ON cs.contrato_id = c.id
        LEFT JOIN periodos_stats ps ON ps.contrato_id = c.id
        LEFT JOIN vinculacion_stats vs ON vs.contrato_id = c.id
        WHERE COALESCE(c.activo, TRUE) = TRUE
        ORDER BY COALESCE(ps.ultimo_periodo_fin, DATE '1900-01-01') DESC, c.id DESC
      `,
      [QA_REGEX]
    );

    const periodos = await client.query(
      `
        SELECT
          np.id::text AS periodo_id,
          np.contrato_id::text AS contrato_id,
          c.empresa_id::text AS empresa_id,
          e.nombre_empresa,
          c.numero_contrato,
          np.nombre_periodo,
          np.fecha_inicio::text,
          np.fecha_fin::text,
          np.estado,
          np.activo,
          (
            SELECT COUNT(*)::int
            FROM nomina_empleados ne
            WHERE ne.periodo_id = np.id
              AND COALESCE(ne.activo, TRUE) = TRUE
          ) AS empleados_total,
          (
            np.id = 2
            OR UPPER(COALESCE(np.nombre_periodo, '')) ~ $1
            OR UPPER(COALESCE(c.numero_contrato, '')) ~ $1
            OR UPPER(COALESCE(e.nombre_empresa, '')) ~ $1
          ) AS parece_qa
        FROM nomina_periodos np
        JOIN contratos c ON c.id = np.contrato_id
        JOIN empresas e ON e.id = c.empresa_id
        WHERE COALESCE(np.activo, TRUE) = TRUE
        ORDER BY np.fecha_fin DESC, np.id DESC
        LIMIT 30
      `,
      [QA_REGEX]
    );

    const periodoReal = periodos.rows.find((row) => row.parece_qa !== true && String(row.periodo_id) !== '2');

    const parametros = periodoReal
      ? await client.query(
          `
            SELECT
              npe.id::text AS parametro_id,
              npe.empresa_id::text AS empresa_id,
              e.nombre_empresa,
              npe.vigente_desde::text,
              npe.vigente_hasta::text,
              npe.salario_minimo,
              npe.auxilio_transporte,
              npe.uvt,
              npe.porcentaje_salud_empleado,
              npe.porcentaje_pension_empleado,
              npe.porcentaje_fondo_solidaridad,
              npe.regla_redondeo
            FROM nomina_parametros_economicos npe
            JOIN empresas e ON e.id = npe.empresa_id
            WHERE npe.empresa_id = $1::bigint
            ORDER BY npe.vigente_desde DESC, npe.id DESC
          `,
          [periodoReal.empresa_id]
        )
      : { rows: [] };

    const categorias = periodoReal
      ? await client.query(
          `
            SELECT
              ncs.id::text AS categoria_id,
              ncs.contrato_id::text AS contrato_id,
              c.numero_contrato,
              ncs.codigo_categoria,
              ncs.nombre_categoria,
              ncs.salario_base,
              ncs.auxilio_transporte,
              ncs.otros_recargos,
              ncs.vigente_desde::text,
              ncs.vigente_hasta::text,
              ncs.activo,
              (
                UPPER(COALESCE(ncs.codigo_categoria, '')) ~ $2
                OR UPPER(COALESCE(ncs.nombre_categoria, '')) ~ $2
              ) AS parece_qa
            FROM nomina_categorias_salariales ncs
            JOIN contratos c ON c.id = ncs.contrato_id
            WHERE c.empresa_id = $1::bigint
            ORDER BY ncs.codigo_categoria, ncs.vigente_desde DESC, ncs.id DESC
          `,
          [periodoReal.empresa_id, QA_REGEX]
        )
      : { rows: [] };

    const periodoResumen = periodoReal
      ? await client.query(
          `
            SELECT
              np.id::text AS periodo_id,
              np.nombre_periodo,
              np.fecha_inicio::text,
              np.fecha_fin::text,
              np.estado,
              c.numero_contrato,
              e.nombre_empresa,
              COUNT(DISTINCT ne.id)::int AS empleados,
              COUNT(DISTINCT nn.id)::int AS novedades,
              COUNT(DISTINCT nt.id)::int AS turnos,
              COALESCE(SUM(ne.salario_base), 0) AS salario_total,
              COALESCE(SUM(ne.auxilio_transporte), 0) AS transporte_total,
              COALESCE(SUM(ne.total_adiciones), 0) AS recargos_y_adiciones_total,
              COALESCE(SUM(ne.total_deducciones), 0) AS deducciones_total,
              COALESCE(SUM(ne.neto_pagar), 0) AS neto_total,
              COALESCE(SUM(ne.devengado_basico), 0) AS devengado_salario_total,
              COALESCE(SUM(ne.devengado_transporte), 0) AS devengado_transporte_total,
              COALESCE(SUM(ne.devengado_otros), 0) AS otros_devengados_total,
              COALESCE(SUM(ne.salud), 0) AS salud_total,
              COALESCE(SUM(ne.pension), 0) AS pension_total
            FROM nomina_periodos np
            JOIN contratos c ON c.id = np.contrato_id
            JOIN empresas e ON e.id = c.empresa_id
            LEFT JOIN nomina_empleados ne ON ne.periodo_id = np.id AND COALESCE(ne.activo, TRUE) = TRUE
            LEFT JOIN nomina_novedades nn ON nn.periodo_id = np.id AND COALESCE(nn.activo, TRUE) = TRUE
            LEFT JOIN nomina_novedad_turnos nt ON nt.periodo_id = np.id AND COALESCE(nt.activo, TRUE) = TRUE
            WHERE np.id = $1::bigint
            GROUP BY np.id, c.numero_contrato, e.nombre_empresa
          `,
          [periodoReal.periodo_id]
        )
      : { rows: [] };

    const empleadosPeriodo = periodoReal
      ? await client.query(
          `
            SELECT
              ne.id::text AS nomina_empleado_id,
              ne.vinculacion_id::text AS vinculacion_id,
              v.persona_id::text AS persona_id,
              TRIM(CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido)) AS nombre_completo,
              p.numero_documento,
              v.contrato_id::text AS contrato_id,
              c.numero_contrato,
              v.fecha_inicio::text AS vinculacion_desde,
              v.fecha_fin::text AS vinculacion_hasta,
              v.estado_vinculacion,
              ne.categoria_salarial_id::text AS categoria_salarial_id,
              ncs.codigo_categoria,
              ncs.nombre_categoria,
              ncs.vigente_desde::text AS categoria_vigente_desde,
              ncs.vigente_hasta::text AS categoria_vigente_hasta,
              COALESCE(ncs.activo, TRUE) AS categoria_activa,
              ne.salario_base,
              ne.auxilio_transporte,
              COALESCE(ncs.otros_recargos, 0) AS recargo_adicional_mensual,
              ne.total_adiciones,
              ne.total_deducciones,
              ne.neto_pagar,
              CASE
                WHEN ne.categoria_salarial_id IS NULL THEN 'SIN_CATEGORIA'
                WHEN ncs.id IS NULL THEN 'CATEGORIA_REFERENCIA_INVALIDA'
                WHEN ncs.vigente_hasta IS NOT NULL AND ncs.vigente_hasta < np.fecha_inicio THEN 'CATEGORIA_VENCIDA'
                WHEN ncs.vigente_desde IS NOT NULL AND ncs.vigente_desde > np.fecha_fin THEN 'CATEGORIA_NO_VIGENTE_AUN'
                WHEN COALESCE(ncs.activo, TRUE) = FALSE THEN 'CATEGORIA_INACTIVA'
                WHEN ne.salario_base IS NULL THEN 'SALARIO_FALTANTE'
                WHEN ne.auxilio_transporte IS NULL THEN 'AUXILIO_FALTANTE'
                ELSE 'OK'
              END AS estado_configuracion
            FROM nomina_empleados ne
            JOIN nomina_periodos np ON np.id = ne.periodo_id
            JOIN vinculaciones v ON v.id = ne.vinculacion_id
            JOIN personas p ON p.id = v.persona_id
            JOIN contratos c ON c.id = v.contrato_id
            LEFT JOIN nomina_categorias_salariales ncs ON ncs.id = ne.categoria_salarial_id
            WHERE ne.periodo_id = $1::bigint
              AND COALESCE(ne.activo, TRUE) = TRUE
            ORDER BY nombre_completo ASC, ne.id ASC
          `,
          [periodoReal.periodo_id]
        )
      : { rows: [] };

    const inconsistenciasCategorias = periodoReal
      ? await client.query(
          `
            WITH duplicadas AS (
              SELECT
                contrato_id::text AS contrato_id,
                UPPER(BTRIM(codigo_categoria)) AS codigo_categoria,
                COUNT(*)::int AS total_registros
              FROM nomina_categorias_salariales
              WHERE contrato_id IN (
                SELECT id FROM contratos WHERE empresa_id = $1::bigint
              )
              GROUP BY contrato_id, UPPER(BTRIM(codigo_categoria))
              HAVING COUNT(*) > 1
            ),
            solapes AS (
              SELECT
                a.contrato_id::text AS contrato_id,
                UPPER(BTRIM(a.codigo_categoria)) AS codigo_categoria,
                a.id::text AS categoria_a_id,
                b.id::text AS categoria_b_id
              FROM nomina_categorias_salariales a
              JOIN nomina_categorias_salariales b
                ON a.id < b.id
               AND a.contrato_id = b.contrato_id
               AND UPPER(BTRIM(a.codigo_categoria)) = UPPER(BTRIM(b.codigo_categoria))
               AND COALESCE(a.activo, TRUE) = TRUE
               AND COALESCE(b.activo, TRUE) = TRUE
               AND DATERANGE(COALESCE(a.vigente_desde, '-infinity'::date), COALESCE(a.vigente_hasta, 'infinity'::date), '[]')
                   && DATERANGE(COALESCE(b.vigente_desde, '-infinity'::date), COALESCE(b.vigente_hasta, 'infinity'::date), '[]')
              WHERE a.contrato_id IN (
                SELECT id FROM contratos WHERE empresa_id = $1::bigint
              )
            )
            SELECT 'DUPLICADA' AS tipo, d.contrato_id, d.codigo_categoria, d.total_registros::text AS detalle
            FROM duplicadas d
            UNION ALL
            SELECT 'SOLAPADA' AS tipo, s.contrato_id, s.codigo_categoria, CONCAT(s.categoria_a_id, ' vs ', s.categoria_b_id) AS detalle
            FROM solapes s
            ORDER BY tipo, contrato_id, codigo_categoria
          `,
          [periodoReal.empresa_id]
        )
      : { rows: [] };

    const permisos = await client.query(
      `
        SELECT
          r.nombre_rol,
          CONCAT(p.modulo, '.', p.accion) AS permiso
        FROM roles r
        JOIN rol_permisos rp ON rp.rol_id = r.id AND COALESCE(rp.activo, TRUE) = TRUE
        JOIN permisos p ON p.id = rp.permiso_id AND COALESCE(p.activo, TRUE) = TRUE
        WHERE COALESCE(r.activo, TRUE) = TRUE
          AND r.nombre_rol IN ('ADMINISTRADOR', 'TALENTO_HUMANO')
        ORDER BY r.nombre_rol, p.modulo, p.accion
      `
    );

    const storage = await client.query(
      `
        SELECT
          dp.storage_bucket,
          COUNT(*)::int AS documentos,
          COUNT(*) FILTER (WHERE dp.mime_type = 'application/pdf')::int AS pdfs,
          MIN(dp.fecha_carga) AS primera_carga,
          MAX(dp.fecha_carga) AS ultima_carga
        FROM documentos_persona dp
        WHERE dp.storage_bucket IS NOT NULL
        GROUP BY dp.storage_bucket
        ORDER BY documentos DESC, dp.storage_bucket ASC
      `
    );

    const tiposDocumentales = await client.query(
      `
        SELECT
          td.id::text AS tipo_documento_id,
          td.codigo,
          td.nombre_documento,
          td.categoria_documento,
          COUNT(dp.id)::int AS documentos_persona,
          COUNT(nd.id)::int AS desprendibles_referenciados
        FROM tipos_documentos td
        LEFT JOIN documentos_persona dp ON dp.tipo_documento_id = td.id
        LEFT JOIN nomina_desprendibles nd ON nd.documento_persona_id = dp.id
        WHERE UPPER(COALESCE(td.codigo, '')) LIKE '%DESPRENDIBLE%'
           OR UPPER(COALESCE(td.nombre_documento, '')) LIKE '%DESPRENDIBLE%'
           OR nd.id IS NOT NULL
        GROUP BY td.id, td.codigo, td.nombre_documento, td.categoria_documento
        ORDER BY desprendibles_referenciados DESC, documentos_persona DESC, td.id DESC
      `
    );

    const desprendibles = await client.query(
      `
        SELECT
          nd.id::text AS desprendible_id,
          nd.periodo_id::text AS periodo_id,
          nd.nomina_empleado_id::text AS nomina_empleado_id,
          nd.vinculacion_id::text AS vinculacion_id,
          nd.tipo_desprendible,
          nd.version,
          nd.es_vigente,
          nd.estado,
          nd.archivo_path,
          nd.fecha_generacion,
          dp.id::text AS documento_persona_id,
          dp.storage_bucket,
          dp.storage_path,
          dp.nombre_original,
          dp.mime_type,
          dp.tamano_bytes,
          e.nombre_empresa,
          c.numero_contrato,
          np.nombre_periodo,
          TRIM(CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido)) AS nombre_completo,
          p.numero_documento
        FROM nomina_desprendibles nd
        JOIN nomina_periodos np ON np.id = nd.periodo_id
        JOIN nomina_empleados ne ON ne.id = nd.nomina_empleado_id
        JOIN vinculaciones v ON v.id = nd.vinculacion_id
        JOIN personas p ON p.id = v.persona_id
        JOIN contratos c ON c.id = v.contrato_id
        JOIN empresas e ON e.id = c.empresa_id
        LEFT JOIN documentos_persona dp ON dp.id = nd.documento_persona_id
        ORDER BY nd.fecha_generacion DESC NULLS LAST, nd.id DESC
        LIMIT 200
      `
    );

    const report = {
      generated_at: new Date().toISOString(),
      environment: {
        env_file: explicitEnvFile ?? '.env',
        database_host: (() => {
          try {
            return new URL(process.env.DATABASE_URL as string).hostname;
          } catch {
            return null;
          }
        })(),
        supabase_url: process.env.SUPABASE_URL ?? null,
        configured_storage_bucket: process.env.SUPABASE_STORAGE_BUCKET ?? null
      },
      schema: {
        objects: rowsToJson(schemaObjects.rows),
        constraints: rowsToJson(schemaConstraints.rows)
      },
      audit: {
        empresas_activas: rowsToJson(empresas.rows),
        contratos_activos: rowsToJson(contratos.rows),
        ultimos_periodos: rowsToJson(periodos.rows),
        ultimo_periodo_real_candidato: rowToJson(periodoReal),
        parametros_economicos_reales: rowsToJson(parametros.rows),
        categorias_salariales_reales: rowsToJson(categorias.rows),
        resumen_periodo_real_candidato: rowsToJson(periodoResumen.rows),
        empleados_vinculaciones_periodo: rowsToJson(empleadosPeriodo.rows),
        inconsistencias_categorias: rowsToJson(inconsistenciasCategorias.rows),
        permisos_administrador_talento_humano: rowsToJson(permisos.rows),
        storage_documental: rowsToJson(storage.rows),
        tipos_documentales_desprendibles: rowsToJson(tiposDocumentales.rows),
        desprendibles_e2e_muestra: rowsToJson(desprendibles.rows)
      },
      report_path: REPORT_PATH
    };

    await fs.mkdir(REPORTS_DIR, { recursive: true });
    await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

    console.log(JSON.stringify(report, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
};

void main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => undefined);
  process.exitCode = 1;
});
