import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { QueryResultRow } from 'pg';

import { dbPool } from '../config/db';

dotenv.config();

type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

type SimpleRow = Record<string, Json>;

const EXECUTION_DATE = new Date().toISOString().slice(0, 10);
const REPORTS_DIR = path.resolve(process.cwd(), 'reports');
const REPORT_PATH = path.join(REPORTS_DIR, `nomina-operacion-real-audit-${EXECUTION_DATE}.json`);

const QA_PATTERN_SQL = String.raw`'(^|[^A-Z])QA([^A-Z]|$)|QA_|_QA|PRUEBA|TEST|DEMO|DUMMY|MOCK|CAA1'`;

const normalizeValue = (value: unknown): Json => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Buffer.isBuffer(value)) {
    return value.toString('base64');
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, normalizeValue(item)])
    );
  }

  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  return String(value);
};

const rowsToJson = <T extends QueryResultRow>(rows: T[]): SimpleRow[] =>
  rows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalizeValue(value)]))
  );

const singleRowToJson = <T extends QueryResultRow>(row: T | undefined | null): SimpleRow | null =>
  row ? (rowsToJson([row])[0] ?? null) : null;

const main = async (): Promise<void> => {
  const client = await dbPool.connect();

  try {
    const schemaChecks = await client.query<{
      object_name: string;
      exists: boolean;
    }>(`
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
    `);

    const relevantColumns = await client.query<{
      table_name: string;
      column_name: string;
      data_type: string;
    }>(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'nomina_categorias_salariales' AND column_name IN ('vigente_desde', 'vigente_hasta', 'otros_recargos'))
          OR (table_name = 'nomina_empleados' AND column_name IN ('detalle_calculo', 'categoria_salarial_id', 'salario_base', 'auxilio_transporte', 'neto_pagar'))
          OR (table_name = 'nomina_desprendibles' AND column_name IN ('documento_persona_id', 'version', 'es_vigente', 'desprendible_reemplaza_id', 'tipo_desprendible'))
          OR (table_name = 'nomina_movimientos' AND column_name IN ('externo_id', 'documento_persona_id', 'familia_movimiento'))
          OR (table_name = 'nomina_novedad_turnos' AND column_name IN ('externo_id', 'contexto_operativo'))
          OR (table_name = 'documentos_persona' AND column_name IN ('storage_bucket', 'storage_path', 'nombre_original', 'mime_type', 'tamano_bytes'))
          OR (table_name = 'nomina_parametros_economicos' AND column_name IN ('empresa_id', 'vigente_desde', 'vigente_hasta', 'salario_minimo', 'auxilio_transporte', 'porcentaje_salud_empleado', 'porcentaje_pension_empleado', 'regla_redondeo'))
        )
      ORDER BY table_name, ordinal_position
    `);

    const relevantConstraints = await client.query<{
      conname: string;
      table_name: string;
      definition: string;
    }>(`
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
    `);

    const activeCompanies = await client.query(`
      WITH contract_stats AS (
        SELECT
          c.empresa_id,
          COUNT(*) FILTER (WHERE COALESCE(c.activo, TRUE) = TRUE) AS contratos_activos,
          COUNT(*) AS contratos_total
        FROM contratos c
        GROUP BY c.empresa_id
      ),
      vinc_stats AS (
        SELECT
          v.empresa_id,
          COUNT(*) FILTER (WHERE COALESCE(v.activo, TRUE) = TRUE) AS vinculaciones_activas,
          COUNT(*) AS vinculaciones_total
        FROM vinculaciones v
        GROUP BY v.empresa_id
      ),
      payroll_stats AS (
        SELECT
          c.empresa_id,
          COUNT(DISTINCT np.id) AS periodos_total,
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
        COALESCE(cs.contratos_activos, 0)::int AS contratos_activos,
        COALESCE(cs.contratos_total, 0)::int AS contratos_total,
        COALESCE(vs.vinculaciones_activas, 0)::int AS vinculaciones_activas,
        COALESCE(vs.vinculaciones_total, 0)::int AS vinculaciones_total,
        COALESCE(ps.periodos_total, 0)::int AS periodos_nomina,
        ps.ultimo_periodo_fin::text AS ultimo_periodo_fin,
        (
          UPPER(COALESCE(e.nombre_empresa, '')) ~ ${QA_PATTERN_SQL}
          OR UPPER(COALESCE(o.nombre, '')) ~ ${QA_PATTERN_SQL}
        ) AS parece_qa
      FROM empresas e
      JOIN organizaciones o ON o.id = e.organizacion_id
      LEFT JOIN contract_stats cs ON cs.empresa_id = e.id
      LEFT JOIN vinc_stats vs ON vs.empresa_id = e.id
      LEFT JOIN payroll_stats ps ON ps.empresa_id = e.id
      WHERE COALESCE(e.activo, TRUE) = TRUE
      ORDER BY COALESCE(ps.ultimo_periodo_fin, DATE '1900-01-01') DESC, e.id DESC
    `);

    const activeContracts = await client.query(`
      WITH nomina_stats AS (
        SELECT
          np.contrato_id,
          COUNT(*)::int AS periodos_total,
          MAX(np.fecha_fin) AS ultimo_periodo_fin,
          MAX(np.id) FILTER (WHERE np.fecha_fin = (SELECT MAX(np2.fecha_fin) FROM nomina_periodos np2 WHERE np2.contrato_id = np.contrato_id))::bigint AS ultimo_periodo_id
        FROM nomina_periodos np
        GROUP BY np.contrato_id
      ),
      categorias_stats AS (
        SELECT
          contrato_id,
          COUNT(*) FILTER (WHERE COALESCE(activo, TRUE) = TRUE)::int AS categorias_activas,
          COUNT(*)::int AS categorias_total
        FROM nomina_categorias_salariales
        GROUP BY contrato_id
      ),
      vinc_stats AS (
        SELECT
          contrato_id,
          COUNT(*) FILTER (WHERE COALESCE(activo, TRUE) = TRUE)::int AS vinculaciones_activas,
          COUNT(*)::int AS vinculaciones_total
        FROM vinculaciones
        GROUP BY contrato_id
      )
      SELECT
        c.id::text AS contrato_id,
        c.empresa_id::text AS empresa_id,
        e.nombre_empresa,
        c.numero_contrato,
        c.entidad_contratante,
        COALESCE(c.activo, TRUE) AS activo,
        COALESCE(vs.vinculaciones_activas, 0) AS vinculaciones_activas,
        COALESCE(vs.vinculaciones_total, 0) AS vinculaciones_total,
        COALESCE(cs.categorias_activas, 0) AS categorias_activas,
        COALESCE(cs.categorias_total, 0) AS categorias_total,
        COALESCE(ns.periodos_total, 0) AS periodos_nomina,
        ns.ultimo_periodo_fin::text AS ultimo_periodo_fin,
        ns.ultimo_periodo_id::text AS ultimo_periodo_id,
        (
          UPPER(COALESCE(c.numero_contrato, '')) ~ ${QA_PATTERN_SQL}
          OR UPPER(COALESCE(c.entidad_contratante, '')) ~ ${QA_PATTERN_SQL}
          OR UPPER(COALESCE(e.nombre_empresa, '')) ~ ${QA_PATTERN_SQL}
        ) AS parece_qa
      FROM contratos c
      JOIN empresas e ON e.id = c.empresa_id
      LEFT JOIN nomina_stats ns ON ns.contrato_id = c.id
      LEFT JOIN categorias_stats cs ON cs.contrato_id = c.id
      LEFT JOIN vinc_stats vs ON vs.contrato_id = c.id
      WHERE COALESCE(c.activo, TRUE) = TRUE
      ORDER BY COALESCE(ns.ultimo_periodo_fin, DATE '1900-01-01') DESC, c.id DESC
    `);

    const realLatestPeriod = await client.query(`
      SELECT
        np.id::text AS periodo_id,
        np.contrato_id::text AS contrato_id,
        c.empresa_id::text AS empresa_id,
        e.nombre_empresa,
        c.numero_contrato,
        np.nombre_periodo,
        np.fecha_inicio::text,
        np.fecha_fin::text,
        np.fecha_pago::text,
        np.estado,
        COALESCE(np.activo, TRUE) AS activo,
        (
          SELECT COUNT(*)::int
          FROM nomina_empleados ne
          WHERE ne.periodo_id = np.id
            AND COALESCE(ne.activo, TRUE) = TRUE
        ) AS empleados_total
      FROM nomina_periodos np
      JOIN contratos c ON c.id = np.contrato_id
      JOIN empresas e ON e.id = c.empresa_id
      WHERE COALESCE(np.activo, TRUE) = TRUE
        AND NOT (
          np.id = 2
          OR UPPER(COALESCE(np.nombre_periodo, '')) ~ ${QA_PATTERN_SQL}
          OR UPPER(COALESCE(c.numero_contrato, '')) ~ ${QA_PATTERN_SQL}
          OR UPPER(COALESCE(e.nombre_empresa, '')) ~ ${QA_PATTERN_SQL}
        )
      ORDER BY np.fecha_fin DESC, np.id DESC
      LIMIT 1
    `);

    const latestPeriods = await client.query(`
      SELECT
        np.id::text AS periodo_id,
        np.contrato_id::text AS contrato_id,
        c.empresa_id::text AS empresa_id,
        e.nombre_empresa,
        c.numero_contrato,
        np.nombre_periodo,
        np.fecha_inicio::text,
        np.fecha_fin::text,
        np.fecha_pago::text,
        np.estado,
        COALESCE(np.activo, TRUE) AS activo,
        (
          SELECT COUNT(*)::int
          FROM nomina_empleados ne
          WHERE ne.periodo_id = np.id
            AND COALESCE(ne.activo, TRUE) = TRUE
        ) AS empleados_total,
        (
          np.id = 2
          OR UPPER(COALESCE(np.nombre_periodo, '')) ~ ${QA_PATTERN_SQL}
          OR UPPER(COALESCE(c.numero_contrato, '')) ~ ${QA_PATTERN_SQL}
          OR UPPER(COALESCE(e.nombre_empresa, '')) ~ ${QA_PATTERN_SQL}
        ) AS parece_qa
      FROM nomina_periodos np
      JOIN contratos c ON c.id = np.contrato_id
      JOIN empresas e ON e.id = c.empresa_id
      ORDER BY np.fecha_fin DESC, np.id DESC
      LIMIT 20
    `);

    const payrollParameters = await client.query(`
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
        npe.porcentaje_hora_extra_diurna,
        npe.porcentaje_hora_extra_nocturna,
        npe.porcentaje_recargo_nocturno,
        npe.regla_redondeo,
        COALESCE(u.nombre, u.email) AS creado_por,
        npe.created_at
      FROM nomina_parametros_economicos npe
      JOIN empresas e ON e.id = npe.empresa_id
      LEFT JOIN usuarios u ON u.id = npe.created_by
      ORDER BY npe.empresa_id ASC, npe.vigente_desde DESC, npe.id DESC
    `);

    const salaryCategories = await client.query(`
      SELECT
        ncs.id::text AS categoria_id,
        ncs.contrato_id::text AS contrato_id,
        c.empresa_id::text AS empresa_id,
        e.nombre_empresa,
        c.numero_contrato,
        ncs.codigo_categoria,
        ncs.nombre_categoria,
        ncs.modalidad,
        ncs.salario_base,
        ncs.auxilio_transporte,
        ncs.otros_recargos,
        ncs.vigente_desde::text,
        ncs.vigente_hasta::text,
        COALESCE(ncs.activo, TRUE) AS activo,
        (
          UPPER(COALESCE(ncs.codigo_categoria, '')) ~ ${QA_PATTERN_SQL}
          OR UPPER(COALESCE(ncs.nombre_categoria, '')) ~ ${QA_PATTERN_SQL}
        ) AS parece_qa
      FROM nomina_categorias_salariales ncs
      JOIN contratos c ON c.id = ncs.contrato_id
      JOIN empresas e ON e.id = c.empresa_id
      ORDER BY c.empresa_id ASC, ncs.contrato_id ASC, ncs.codigo_categoria ASC, ncs.vigente_desde DESC, ncs.id DESC
    `);

    const employeeCategoryAudit = await client.query(`
      SELECT
        ne.id::text AS nomina_empleado_id,
        ne.periodo_id::text AS periodo_id,
        np.nombre_periodo,
        np.fecha_inicio::text AS periodo_inicio,
        np.fecha_fin::text AS periodo_fin,
        np.estado AS periodo_estado,
        ne.vinculacion_id::text AS vinculacion_id,
        v.persona_id::text AS persona_id,
        TRIM(CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido)) AS nombre_completo,
        p.numero_documento,
        c.id::text AS contrato_id,
        c.numero_contrato,
        e.id::text AS empresa_id,
        e.nombre_empresa,
        ne.categoria_salarial_id::text AS categoria_salarial_id,
        ncs.codigo_categoria,
        ncs.nombre_categoria,
        ne.salario_base,
        ne.auxilio_transporte,
        COALESCE(ncs.otros_recargos, 0) AS recargo_adicional_mensual,
        ncs.vigente_desde::text AS categoria_vigente_desde,
        ncs.vigente_hasta::text AS categoria_vigente_hasta,
        COALESCE(ncs.activo, TRUE) AS categoria_activa,
        CASE
          WHEN ne.categoria_salarial_id IS NULL THEN 'SIN_CATEGORIA'
          WHEN ncs.id IS NULL THEN 'CATEGORIA_REFERENCIA_INVALIDA'
          WHEN ncs.vigente_desde IS NOT NULL AND ncs.vigente_desde > np.fecha_fin THEN 'CATEGORIA_NO_VIGENTE_AUN'
          WHEN ncs.vigente_hasta IS NOT NULL AND ncs.vigente_hasta < np.fecha_inicio THEN 'CATEGORIA_VENCIDA'
          WHEN COALESCE(ncs.activo, TRUE) = FALSE THEN 'CATEGORIA_INACTIVA'
          WHEN ne.salario_base IS NULL THEN 'SALARIO_BASE_FALTANTE'
          WHEN ne.auxilio_transporte IS NULL THEN 'AUXILIO_FALTANTE'
          ELSE 'OK'
        END AS estado_configuracion
      FROM nomina_empleados ne
      JOIN nomina_periodos np ON np.id = ne.periodo_id
      JOIN vinculaciones v ON v.id = ne.vinculacion_id
      JOIN personas p ON p.id = v.persona_id
      JOIN contratos c ON c.id = v.contrato_id
      JOIN empresas e ON e.id = c.empresa_id
      LEFT JOIN nomina_categorias_salariales ncs ON ncs.id = ne.categoria_salarial_id
      WHERE COALESCE(ne.activo, TRUE) = TRUE
      ORDER BY np.fecha_fin DESC, ne.id DESC
      LIMIT 5000
    `);

    const categoryInconsistencies = await client.query(`
      WITH duplicadas AS (
        SELECT
          contrato_id,
          UPPER(BTRIM(codigo_categoria)) AS codigo_normalizado,
          COUNT(*)::int AS total_registros,
          COUNT(*) FILTER (WHERE COALESCE(activo, TRUE) = TRUE)::int AS activas
        FROM nomina_categorias_salariales
        GROUP BY contrato_id, UPPER(BTRIM(codigo_categoria))
        HAVING COUNT(*) > 1
      ),
      solapes AS (
        SELECT
          a.id::text AS categoria_a_id,
          b.id::text AS categoria_b_id,
          a.contrato_id::text AS contrato_id,
          UPPER(BTRIM(a.codigo_categoria)) AS codigo_normalizado
        FROM nomina_categorias_salariales a
        JOIN nomina_categorias_salariales b
          ON a.id < b.id
         AND a.contrato_id = b.contrato_id
         AND UPPER(BTRIM(a.codigo_categoria)) = UPPER(BTRIM(b.codigo_categoria))
         AND COALESCE(a.activo, TRUE) = TRUE
         AND COALESCE(b.activo, TRUE) = TRUE
         AND DATERANGE(COALESCE(a.vigente_desde, '-infinity'::date), COALESCE(a.vigente_hasta, 'infinity'::date), '[]')
             && DATERANGE(COALESCE(b.vigente_desde, '-infinity'::date), COALESCE(b.vigente_hasta, 'infinity'::date), '[]')
      )
      SELECT 'DUPLICADAS' AS tipo, d.contrato_id::text AS contrato_id, d.codigo_normalizado AS codigo_categoria, d.total_registros, d.activas, NULL::text AS detalle
      FROM duplicadas d
      UNION ALL
      SELECT 'SOLAPADAS' AS tipo, s.contrato_id, s.codigo_normalizado, NULL::int, NULL::int, CONCAT(s.categoria_a_id, ' vs ', s.categoria_b_id) AS detalle
      FROM solapes s
      ORDER BY tipo, contrato_id, codigo_categoria
    `);

    const permissionAudit = await client.query(`
      SELECT
        r.nombre_rol,
        CONCAT(p.modulo, '.', p.accion) AS permiso
      FROM roles r
      JOIN rol_permisos rp ON rp.rol_id = r.id AND COALESCE(rp.activo, TRUE) = TRUE
      JOIN permisos p ON p.id = rp.permiso_id AND COALESCE(p.activo, TRUE) = TRUE
      WHERE COALESCE(r.activo, TRUE) = TRUE
        AND r.nombre_rol IN ('ADMINISTRADOR', 'TALENTO_HUMANO')
      ORDER BY r.nombre_rol, p.modulo, p.accion
    `);

    const storageAudit = await client.query(`
      SELECT
        COALESCE(dp.storage_bucket, 'SIN_BUCKET') AS storage_bucket,
        COUNT(*)::int AS documentos,
        COUNT(*) FILTER (WHERE dp.mime_type = 'application/pdf')::int AS pdfs,
        MIN(dp.created_at) AS primer_documento,
        MAX(dp.created_at) AS ultimo_documento
      FROM documentos_persona dp
      WHERE dp.storage_bucket IS NOT NULL
      GROUP BY COALESCE(dp.storage_bucket, 'SIN_BUCKET')
      ORDER BY documentos DESC, storage_bucket ASC
    `);

    const payslipDocumentTypes = await client.query(`
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
    `);

    const payslipChainAudit = await client.query(`
      SELECT
        nd.id::text AS desprendible_id,
        nd.periodo_id::text AS periodo_id,
        nd.nomina_empleado_id::text AS nomina_empleado_id,
        nd.vinculacion_id::text AS vinculacion_id,
        nd.documento_persona_id::text AS documento_persona_id,
        nd.version,
        COALESCE(nd.es_vigente, TRUE) AS es_vigente,
        nd.estado,
        nd.tipo_desprendible,
        nd.archivo_path,
        nd.fecha_generacion,
        np.nombre_periodo,
        e.nombre_empresa,
        c.numero_contrato,
        TRIM(CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido)) AS nombre_completo,
        p.numero_documento,
        dp.storage_bucket,
        dp.storage_path,
        dp.nombre_original,
        dp.mime_type,
        dp.tamano_bytes
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
    `);

    const latestPeriodId = realLatestPeriod.rows[0]?.periodo_id as string | undefined;

    const latestPeriodSummary = latestPeriodId
      ? await client.query(
          `
            SELECT
              np.id::text AS periodo_id,
              np.nombre_periodo,
              np.estado,
              np.fecha_inicio::text,
              np.fecha_fin::text,
              np.fecha_pago::text,
              c.id::text AS contrato_id,
              c.numero_contrato,
              e.id::text AS empresa_id,
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
            LEFT JOIN nomina_novedad_turnos nt ON nt.periodo_id = np.id
            WHERE np.id = $1::bigint
            GROUP BY np.id, c.id, e.id
          `,
          [latestPeriodId]
        )
      : null;

    const participationByContract = latestPeriodId
      ? await client.query(
          `
            SELECT
              ne.periodo_id::text AS periodo_id,
              v.contrato_id::text AS contrato_id,
              c.numero_contrato,
              e.id::text AS empresa_id,
              e.nombre_empresa,
              COUNT(*)::int AS empleados,
              COUNT(*) FILTER (WHERE ne.categoria_salarial_id IS NULL)::int AS sin_categoria,
              COUNT(*) FILTER (WHERE ne.salario_base IS NULL)::int AS sin_salario,
              COUNT(*) FILTER (WHERE ne.auxilio_transporte IS NULL)::int AS sin_auxilio
            FROM nomina_empleados ne
            JOIN vinculaciones v ON v.id = ne.vinculacion_id
            JOIN contratos c ON c.id = v.contrato_id
            JOIN empresas e ON e.id = c.empresa_id
            WHERE ne.periodo_id = $1::bigint
              AND COALESCE(ne.activo, TRUE) = TRUE
            GROUP BY ne.periodo_id, v.contrato_id, c.numero_contrato, e.id, e.nombre_empresa
            ORDER BY empleados DESC, contrato_id ASC
          `,
          [latestPeriodId]
        )
      : null;

    const report = {
      generated_at: new Date().toISOString(),
      report_path: REPORT_PATH,
      environment: {
        database_host: (() => {
          try {
            return new URL(process.env.DATABASE_URL ?? '').hostname;
          } catch {
            return 'unknown';
          }
        })(),
        supabase_url: process.env.SUPABASE_URL ?? null,
        configured_storage_bucket: process.env.SUPABASE_STORAGE_BUCKET ?? null
      },
      schema: {
        objects: rowsToJson(schemaChecks.rows),
        columns: rowsToJson(relevantColumns.rows),
        constraints: rowsToJson(relevantConstraints.rows)
      },
      audit: {
        empresas_activas: rowsToJson(activeCompanies.rows),
        contratos_activos: rowsToJson(activeContracts.rows),
        ultimo_periodo_real_candidato: singleRowToJson(realLatestPeriod.rows[0]),
        ultimos_periodos: rowsToJson(latestPeriods.rows),
        parametros_economicos: rowsToJson(payrollParameters.rows),
        categorias_salariales: rowsToJson(salaryCategories.rows),
        empleados_y_vinculaciones_auditados: rowsToJson(employeeCategoryAudit.rows),
        inconsistencias_categorias: rowsToJson(categoryInconsistencies.rows),
        permisos_roles: rowsToJson(permissionAudit.rows),
        storage_documental: rowsToJson(storageAudit.rows),
        tipos_documentales_desprendibles: rowsToJson(payslipDocumentTypes.rows),
        desprendibles_cadena_e2e: rowsToJson(payslipChainAudit.rows),
        resumen_periodo_real_candidato: latestPeriodSummary ? rowsToJson(latestPeriodSummary.rows) : [],
        participacion_periodo_real_candidato: participationByContract
          ? rowsToJson(participationByContract.rows)
          : []
      }
    };

    await fs.mkdir(REPORTS_DIR, { recursive: true });
    await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

    console.log(JSON.stringify(report, null, 2));
  } finally {
    client.release();
    await dbPool.end();
  }
};

void main().catch(async (error) => {
  console.error(error);
  await dbPool.end().catch(() => undefined);
  process.exitCode = 1;
});
