import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Pool, QueryResultRow } from 'pg';

const explicitEnvFile = process.env.ENV_FILE?.trim();
dotenv.config(explicitEnvFile ? { path: explicitEnvFile } : undefined);

type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

type JsonRow = Record<string, Json>;

const EXECUTION_DATE = new Date().toISOString().slice(0, 10);
const REPORTS_DIR = path.resolve(process.cwd(), 'reports');
const REPORT_PATH = path.join(REPORTS_DIR, `nomina-operacion-real-audit-${EXECUTION_DATE}.json`);
const QA_REGEX = '(^|[^A-Z])QA([^A-Z]|$)|QA_|_QA|PRUEBA|TEST|DEMO|DUMMY|MOCK|CAA1';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false }
});

const toJsonValue = (value: unknown): Json => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => toJsonValue(item));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, toJsonValue(item)])
    );
  }
  return String(value);
};

const rowsToJson = <T extends QueryResultRow>(rows: T[]): JsonRow[] =>
  rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, toJsonValue(value)])));

const rowToJson = <T extends QueryResultRow>(row: T | null | undefined): JsonRow | null =>
  row ? rowsToJson([row])[0] ?? null : null;

const safeIdentifier = (value: string): string => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe SQL identifier: ${value}`);
  }

  return value;
};

const main = async (): Promise<void> => {
  const client = await pool.connect();

  try {
    const metadata = await client.query<{
      table_name: string;
      column_name: string;
      data_type: string;
    }>(
      `
        SELECT table_name, column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position
      `
    );

    const columnsByTable = new Map<string, Set<string>>();
    for (const row of metadata.rows) {
      const current = columnsByTable.get(row.table_name) ?? new Set<string>();
      current.add(row.column_name);
      columnsByTable.set(row.table_name, current);
    }

    const hasTable = (tableName: string): boolean => columnsByTable.has(tableName);
    const hasColumn = (tableName: string, columnName: string): boolean =>
      columnsByTable.get(tableName)?.has(columnName) === true;
    const boolExpr = (tableName: string, alias: string, columnName: string): string =>
      hasColumn(tableName, columnName) ? `COALESCE(${alias}.${safeIdentifier(columnName)}, TRUE)` : 'TRUE';
    const nullableTextExpr = (tableName: string, alias: string, columnName: string): string =>
      hasColumn(tableName, columnName) ? `${alias}.${safeIdentifier(columnName)}::text` : 'NULL::text';
    const nullableExpr = (tableName: string, alias: string, columnName: string): string =>
      hasColumn(tableName, columnName) ? `${alias}.${safeIdentifier(columnName)}` : 'NULL';

    const schemaObjects = [
      'nomina_parametros_economicos',
      'nomina_categorias_salariales',
      'nomina_contextos_operativos_base',
      'nomina_novedad_turnos',
      'nomina_revision_operativa',
      'nomina_responsabilidades_usuario',
      'nomina_areas',
      'cobertura_externos',
      'nomina_novedad_documentos',
      'empresa_configuracion_general',
      'empresa_modulo_configuracion',
      'nomina_desprendibles'
    ].map((objectName) => ({
      object_name: objectName,
      exists: hasTable(objectName)
    }));

    const constraints = await client.query<{
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
            'chk_nomina_categoria_salarial_vigencia',
            'uq_nomina_desprendibles_vigente'
          )
        ORDER BY c.conname
      `
    );

    const empresasActivas = await client.query(
      `
        WITH contract_stats AS (
          SELECT
            c.empresa_id,
            COUNT(*) FILTER (WHERE ${boolExpr('contratos', 'c', 'activo')})::int AS contratos_activos,
            COUNT(*)::int AS contratos_total
          FROM contratos c
          GROUP BY c.empresa_id
        ),
        vinc_stats AS (
          SELECT
            v.empresa_id,
            COUNT(*) FILTER (WHERE ${boolExpr('vinculaciones', 'v', 'activo')})::int AS vinculaciones_activas,
            COUNT(*)::int AS vinculaciones_total
          FROM vinculaciones v
          GROUP BY v.empresa_id
        ),
        payroll_stats AS (
          SELECT
            c.empresa_id,
            COUNT(DISTINCT np.id)::int AS periodos_total,
            MAX(np.fecha_fin) AS ultimo_periodo_fin
          FROM nomina_periodos np
          JOIN contratos c ON c.id = np.contrato_id
          GROUP BY c.empresa_id
        )
        SELECT
          e.id::text AS empresa_id,
          e.nombre_empresa,
          e.nit,
          ${boolExpr('empresas', 'e', 'activo')} AS activo,
          o.id::text AS organizacion_id,
          o.nombre AS organizacion_nombre,
          COALESCE(cs.contratos_activos, 0) AS contratos_activos,
          COALESCE(cs.contratos_total, 0) AS contratos_total,
          COALESCE(vs.vinculaciones_activas, 0) AS vinculaciones_activas,
          COALESCE(vs.vinculaciones_total, 0) AS vinculaciones_total,
          COALESCE(ps.periodos_total, 0) AS periodos_nomina,
          ps.ultimo_periodo_fin::text AS ultimo_periodo_fin,
          (
            UPPER(COALESCE(e.nombre_empresa, '')) ~ $1
            OR UPPER(COALESCE(o.nombre, '')) ~ $1
          ) AS parece_qa
        FROM empresas e
        JOIN organizaciones o ON o.id = e.organizacion_id
        LEFT JOIN contract_stats cs ON cs.empresa_id = e.id
        LEFT JOIN vinc_stats vs ON vs.empresa_id = e.id
        LEFT JOIN payroll_stats ps ON ps.empresa_id = e.id
        WHERE ${boolExpr('empresas', 'e', 'activo')}
        ORDER BY COALESCE(ps.ultimo_periodo_fin, DATE '1900-01-01') DESC, e.id DESC
      `,
      [QA_REGEX]
    );

    const contratosActivos = await client.query(
      `
        WITH nomina_stats AS (
          SELECT
            np.contrato_id,
            COUNT(*)::int AS periodos_total,
            MAX(np.fecha_fin) AS ultimo_periodo_fin
          FROM nomina_periodos np
          GROUP BY np.contrato_id
        ),
        categorias_stats AS (
          SELECT
            contrato_id,
            COUNT(*) FILTER (WHERE ${boolExpr('nomina_categorias_salariales', 'ncs', 'activo')})::int AS categorias_activas,
            COUNT(*)::int AS categorias_total
          FROM nomina_categorias_salariales ncs
          GROUP BY contrato_id
        ),
        vinc_stats AS (
          SELECT
            contrato_id,
            COUNT(*) FILTER (WHERE ${boolExpr('vinculaciones', 'v', 'activo')})::int AS vinculaciones_activas,
            COUNT(*)::int AS vinculaciones_total
          FROM vinculaciones v
          GROUP BY contrato_id
        )
        SELECT
          c.id::text AS contrato_id,
          c.empresa_id::text AS empresa_id,
          e.nombre_empresa,
          ${nullableTextExpr('contratos', 'c', 'numero_contrato')} AS numero_contrato,
          ${nullableTextExpr('contratos', 'c', 'entidad_contratante')} AS entidad_contratante,
          ${boolExpr('contratos', 'c', 'activo')} AS activo,
          COALESCE(vs.vinculaciones_activas, 0) AS vinculaciones_activas,
          COALESCE(vs.vinculaciones_total, 0) AS vinculaciones_total,
          COALESCE(cs.categorias_activas, 0) AS categorias_activas,
          COALESCE(cs.categorias_total, 0) AS categorias_total,
          COALESCE(ns.periodos_total, 0) AS periodos_nomina,
          ns.ultimo_periodo_fin::text AS ultimo_periodo_fin,
          (
            UPPER(COALESCE(${nullableTextExpr('contratos', 'c', 'numero_contrato')}, '')) ~ $1
            OR UPPER(COALESCE(${nullableTextExpr('contratos', 'c', 'entidad_contratante')}, '')) ~ $1
            OR UPPER(COALESCE(e.nombre_empresa, '')) ~ $1
          ) AS parece_qa
        FROM contratos c
        JOIN empresas e ON e.id = c.empresa_id
        LEFT JOIN nomina_stats ns ON ns.contrato_id = c.id
        LEFT JOIN categorias_stats cs ON cs.contrato_id = c.id
        LEFT JOIN vinc_stats vs ON vs.contrato_id = c.id
        WHERE ${boolExpr('contratos', 'c', 'activo')}
        ORDER BY COALESCE(ns.ultimo_periodo_fin, DATE '1900-01-01') DESC, c.id DESC
      `,
      [QA_REGEX]
    );

    const latestPeriods = await client.query(
      `
        SELECT
          np.id::text AS periodo_id,
          np.contrato_id::text AS contrato_id,
          c.empresa_id::text AS empresa_id,
          e.nombre_empresa,
          ${nullableTextExpr('contratos', 'c', 'numero_contrato')} AS numero_contrato,
          ${nullableTextExpr('nomina_periodos', 'np', 'nombre_periodo')} AS nombre_periodo,
          ${nullableTextExpr('nomina_periodos', 'np', 'fecha_inicio')} AS fecha_inicio,
          ${nullableTextExpr('nomina_periodos', 'np', 'fecha_fin')} AS fecha_fin,
          ${nullableTextExpr('nomina_periodos', 'np', 'fecha_pago')} AS fecha_pago,
          ${nullableTextExpr('nomina_periodos', 'np', 'estado')} AS estado,
          ${boolExpr('nomina_periodos', 'np', 'activo')} AS activo,
          (
            SELECT COUNT(*)::int
            FROM nomina_empleados ne
            WHERE ne.periodo_id = np.id
              AND ${boolExpr('nomina_empleados', 'ne', 'activo')}
          ) AS empleados_total,
          (
            np.id = 2
            OR UPPER(COALESCE(${nullableTextExpr('nomina_periodos', 'np', 'nombre_periodo')}, '')) ~ $1
            OR UPPER(COALESCE(${nullableTextExpr('contratos', 'c', 'numero_contrato')}, '')) ~ $1
            OR UPPER(COALESCE(e.nombre_empresa, '')) ~ $1
          ) AS parece_qa
        FROM nomina_periodos np
        JOIN contratos c ON c.id = np.contrato_id
        JOIN empresas e ON e.id = c.empresa_id
        ORDER BY np.fecha_fin DESC NULLS LAST, np.id DESC
        LIMIT 20
      `,
      [QA_REGEX]
    );

    const realLatestPeriodRow =
      latestPeriods.rows.find((row) => row.parece_qa !== true && String(row.periodo_id) !== '2') ?? null;

    const payrollParameters = hasTable('nomina_parametros_economicos')
      ? await client.query(
          `
            SELECT
              npe.id::text AS parametro_id,
              npe.empresa_id::text AS empresa_id,
              e.nombre_empresa,
              npe.vigente_desde::text AS vigente_desde,
              npe.vigente_hasta::text AS vigente_hasta,
              npe.salario_minimo,
              npe.auxilio_transporte,
              ${nullableExpr('nomina_parametros_economicos', 'npe', 'uvt')} AS uvt,
              ${nullableExpr('nomina_parametros_economicos', 'npe', 'porcentaje_salud_empleado')} AS porcentaje_salud_empleado,
              ${nullableExpr('nomina_parametros_economicos', 'npe', 'porcentaje_pension_empleado')} AS porcentaje_pension_empleado,
              ${nullableExpr('nomina_parametros_economicos', 'npe', 'porcentaje_fondo_solidaridad')} AS porcentaje_fondo_solidaridad,
              ${nullableExpr('nomina_parametros_economicos', 'npe', 'porcentaje_hora_extra_diurna')} AS porcentaje_hora_extra_diurna,
              ${nullableExpr('nomina_parametros_economicos', 'npe', 'porcentaje_hora_extra_nocturna')} AS porcentaje_hora_extra_nocturna,
              ${nullableExpr('nomina_parametros_economicos', 'npe', 'porcentaje_recargo_nocturno')} AS porcentaje_recargo_nocturno,
              ${nullableTextExpr('nomina_parametros_economicos', 'npe', 'regla_redondeo')} AS regla_redondeo,
              npe.created_at
            FROM nomina_parametros_economicos npe
            JOIN empresas e ON e.id = npe.empresa_id
            ORDER BY npe.empresa_id ASC, npe.vigente_desde DESC, npe.id DESC
          `
        )
      : { rows: [] };

    const salaryCategories = hasTable('nomina_categorias_salariales')
      ? await client.query(
          `
            SELECT
              ncs.id::text AS categoria_id,
              ncs.contrato_id::text AS contrato_id,
              c.empresa_id::text AS empresa_id,
              e.nombre_empresa,
              ${nullableTextExpr('contratos', 'c', 'numero_contrato')} AS numero_contrato,
              ${nullableTextExpr('nomina_categorias_salariales', 'ncs', 'codigo_categoria')} AS codigo_categoria,
              ${nullableTextExpr('nomina_categorias_salariales', 'ncs', 'nombre_categoria')} AS nombre_categoria,
              ${nullableTextExpr('nomina_categorias_salariales', 'ncs', 'modalidad')} AS modalidad,
              ${nullableExpr('nomina_categorias_salariales', 'ncs', 'salario_base')} AS salario_base,
              ${nullableExpr('nomina_categorias_salariales', 'ncs', 'auxilio_transporte')} AS auxilio_transporte,
              ${nullableExpr('nomina_categorias_salariales', 'ncs', 'otros_recargos')} AS otros_recargos,
              ${nullableTextExpr('nomina_categorias_salariales', 'ncs', 'vigente_desde')} AS vigente_desde,
              ${nullableTextExpr('nomina_categorias_salariales', 'ncs', 'vigente_hasta')} AS vigente_hasta,
              ${boolExpr('nomina_categorias_salariales', 'ncs', 'activo')} AS activo,
              (
                UPPER(COALESCE(${nullableTextExpr('nomina_categorias_salariales', 'ncs', 'codigo_categoria')}, '')) ~ $1
                OR UPPER(COALESCE(${nullableTextExpr('nomina_categorias_salariales', 'ncs', 'nombre_categoria')}, '')) ~ $1
              ) AS parece_qa
            FROM nomina_categorias_salariales ncs
            JOIN contratos c ON c.id = ncs.contrato_id
            JOIN empresas e ON e.id = c.empresa_id
            ORDER BY c.empresa_id ASC, ncs.contrato_id ASC, ncs.codigo_categoria ASC, ncs.id DESC
          `,
          [QA_REGEX]
        )
      : { rows: [] };

    const categoryInconsistencies = hasTable('nomina_categorias_salariales')
      ? await client.query(
          `
            WITH duplicadas AS (
              SELECT
                contrato_id,
                UPPER(BTRIM(codigo_categoria)) AS codigo_normalizado,
                COUNT(*)::int AS total_registros,
                COUNT(*) FILTER (WHERE ${boolExpr('nomina_categorias_salariales', 'ncs', 'activo')})::int AS activas
              FROM nomina_categorias_salariales ncs
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
               AND ${boolExpr('nomina_categorias_salariales', 'a', 'activo')}
               AND ${boolExpr('nomina_categorias_salariales', 'b', 'activo')}
               AND DATERANGE(COALESCE(a.vigente_desde, '-infinity'::date), COALESCE(a.vigente_hasta, 'infinity'::date), '[]')
                 && DATERANGE(COALESCE(b.vigente_desde, '-infinity'::date), COALESCE(b.vigente_hasta, 'infinity'::date), '[]')
            )
            SELECT 'DUPLICADAS' AS tipo, d.contrato_id::text AS contrato_id, d.codigo_normalizado AS codigo_categoria, d.total_registros, d.activas, NULL::text AS detalle
            FROM duplicadas d
            UNION ALL
            SELECT 'SOLAPADAS' AS tipo, s.contrato_id, s.codigo_normalizado, NULL::int, NULL::int, CONCAT(s.categoria_a_id, ' vs ', s.categoria_b_id) AS detalle
            FROM solapes s
            ORDER BY tipo, contrato_id, codigo_categoria
          `
        )
      : { rows: [] };

    const employeeCategoryAudit = hasTable('nomina_empleados') && hasTable('nomina_categorias_salariales')
      ? await client.query(
          `
            SELECT
              ne.id::text AS nomina_empleado_id,
              ne.periodo_id::text AS periodo_id,
              ${nullableTextExpr('nomina_periodos', 'np', 'nombre_periodo')} AS nombre_periodo,
              ${nullableTextExpr('nomina_periodos', 'np', 'fecha_inicio')} AS periodo_inicio,
              ${nullableTextExpr('nomina_periodos', 'np', 'fecha_fin')} AS periodo_fin,
              ${nullableTextExpr('nomina_periodos', 'np', 'estado')} AS periodo_estado,
              ne.vinculacion_id::text AS vinculacion_id,
              v.persona_id::text AS persona_id,
              TRIM(CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido)) AS nombre_completo,
              p.numero_documento,
              v.contrato_id::text AS contrato_id,
              ${nullableTextExpr('contratos', 'c', 'numero_contrato')} AS numero_contrato,
              e.id::text AS empresa_id,
              e.nombre_empresa,
              ${nullableTextExpr('nomina_empleados', 'ne', 'categoria_salarial_id')} AS categoria_salarial_id,
              ${nullableTextExpr('nomina_categorias_salariales', 'ncs', 'codigo_categoria')} AS codigo_categoria,
              ${nullableTextExpr('nomina_categorias_salariales', 'ncs', 'nombre_categoria')} AS nombre_categoria,
              ${nullableExpr('nomina_empleados', 'ne', 'salario_base')} AS salario_base,
              ${nullableExpr('nomina_empleados', 'ne', 'auxilio_transporte')} AS auxilio_transporte,
              COALESCE(${nullableExpr('nomina_categorias_salariales', 'ncs', 'otros_recargos')}, 0) AS recargo_adicional_mensual,
              ${nullableTextExpr('nomina_categorias_salariales', 'ncs', 'vigente_desde')} AS categoria_vigente_desde,
              ${nullableTextExpr('nomina_categorias_salariales', 'ncs', 'vigente_hasta')} AS categoria_vigente_hasta,
              ${boolExpr('nomina_categorias_salariales', 'ncs', 'activo')} AS categoria_activa,
              CASE
                WHEN ne.categoria_salarial_id IS NULL THEN 'SIN_CATEGORIA'
                WHEN ncs.id IS NULL THEN 'CATEGORIA_REFERENCIA_INVALIDA'
                WHEN ncs.vigente_desde IS NOT NULL AND np.fecha_fin IS NOT NULL AND ncs.vigente_desde > np.fecha_fin THEN 'CATEGORIA_NO_VIGENTE_AUN'
                WHEN ncs.vigente_hasta IS NOT NULL AND np.fecha_inicio IS NOT NULL AND ncs.vigente_hasta < np.fecha_inicio THEN 'CATEGORIA_VENCIDA'
                WHEN ${boolExpr('nomina_categorias_salariales', 'ncs', 'activo')} = FALSE THEN 'CATEGORIA_INACTIVA'
                WHEN ${nullableExpr('nomina_empleados', 'ne', 'salario_base')} IS NULL THEN 'SALARIO_BASE_FALTANTE'
                WHEN ${nullableExpr('nomina_empleados', 'ne', 'auxilio_transporte')} IS NULL THEN 'AUXILIO_FALTANTE'
                ELSE 'OK'
              END AS estado_configuracion
            FROM nomina_empleados ne
            JOIN nomina_periodos np ON np.id = ne.periodo_id
            JOIN vinculaciones v ON v.id = ne.vinculacion_id
            JOIN personas p ON p.id = v.persona_id
            JOIN contratos c ON c.id = v.contrato_id
            JOIN empresas e ON e.id = c.empresa_id
            LEFT JOIN nomina_categorias_salariales ncs ON ncs.id = ne.categoria_salarial_id
            WHERE ${boolExpr('nomina_empleados', 'ne', 'activo')}
            ORDER BY np.fecha_fin DESC NULLS LAST, ne.id DESC
            LIMIT 5000
          `
        )
      : { rows: [] };

    const permissionAudit = hasTable('roles') && hasTable('permisos') && hasTable('rol_permisos')
      ? await client.query(
          `
            SELECT
              r.nombre_rol,
              CONCAT(p.modulo, '.', p.accion) AS permiso
            FROM roles r
            JOIN rol_permisos rp ON rp.rol_id = r.id AND ${boolExpr('rol_permisos', 'rp', 'activo')}
            JOIN permisos p ON p.id = rp.permiso_id AND ${boolExpr('permisos', 'p', 'activo')}
            WHERE ${boolExpr('roles', 'r', 'activo')}
              AND r.nombre_rol IN ('ADMINISTRADOR', 'TALENTO_HUMANO')
            ORDER BY r.nombre_rol, p.modulo, p.accion
          `
        )
      : { rows: [] };

    const storageAudit = hasTable('documentos_persona')
      ? await client.query(
          `
            SELECT
              COALESCE(${nullableTextExpr('documentos_persona', 'dp', 'storage_bucket')}, 'SIN_BUCKET') AS storage_bucket,
              COUNT(*)::int AS documentos,
              COUNT(*) FILTER (WHERE ${nullableTextExpr('documentos_persona', 'dp', 'mime_type')} = 'application/pdf')::int AS pdfs,
              MIN(dp.created_at) AS primer_documento,
              MAX(dp.created_at) AS ultimo_documento
            FROM documentos_persona dp
            WHERE ${nullableTextExpr('documentos_persona', 'dp', 'storage_bucket')} IS NOT NULL
            GROUP BY COALESCE(${nullableTextExpr('documentos_persona', 'dp', 'storage_bucket')}, 'SIN_BUCKET')
            ORDER BY documentos DESC, storage_bucket ASC
          `
        )
      : { rows: [] };

    const payslipDocumentTypes = hasTable('tipos_documentos') && hasTable('documentos_persona') && hasTable('nomina_desprendibles')
      ? await client.query(
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
        )
      : { rows: [] };

    const payslipChainAudit = hasTable('nomina_desprendibles') && hasTable('documentos_persona')
      ? await client.query(
          `
            SELECT
              nd.id::text AS desprendible_id,
              nd.periodo_id::text AS periodo_id,
              nd.nomina_empleado_id::text AS nomina_empleado_id,
              nd.vinculacion_id::text AS vinculacion_id,
              ${nullableTextExpr('nomina_desprendibles', 'nd', 'documento_persona_id')} AS documento_persona_id,
              ${nullableExpr('nomina_desprendibles', 'nd', 'version')} AS version,
              ${boolExpr('nomina_desprendibles', 'nd', 'es_vigente')} AS es_vigente,
              ${nullableTextExpr('nomina_desprendibles', 'nd', 'estado')} AS estado,
              ${nullableTextExpr('nomina_desprendibles', 'nd', 'tipo_desprendible')} AS tipo_desprendible,
              ${nullableTextExpr('nomina_desprendibles', 'nd', 'archivo_path')} AS archivo_path,
              ${nullableTextExpr('nomina_desprendibles', 'nd', 'fecha_generacion')} AS fecha_generacion,
              ${nullableTextExpr('nomina_periodos', 'np', 'nombre_periodo')} AS nombre_periodo,
              e.nombre_empresa,
              ${nullableTextExpr('contratos', 'c', 'numero_contrato')} AS numero_contrato,
              TRIM(CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido)) AS nombre_completo,
              p.numero_documento,
              ${nullableTextExpr('documentos_persona', 'dp', 'storage_bucket')} AS storage_bucket,
              ${nullableTextExpr('documentos_persona', 'dp', 'storage_path')} AS storage_path,
              ${nullableTextExpr('documentos_persona', 'dp', 'nombre_original')} AS nombre_original,
              ${nullableTextExpr('documentos_persona', 'dp', 'mime_type')} AS mime_type,
              ${nullableExpr('documentos_persona', 'dp', 'tamano_bytes')} AS tamano_bytes
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
        )
      : { rows: [] };

    const latestPeriodSummary =
      realLatestPeriodRow && hasTable('nomina_empleados')
        ? await client.query(
            `
              SELECT
                np.id::text AS periodo_id,
                ${nullableTextExpr('nomina_periodos', 'np', 'nombre_periodo')} AS nombre_periodo,
                ${nullableTextExpr('nomina_periodos', 'np', 'estado')} AS estado,
                ${nullableTextExpr('nomina_periodos', 'np', 'fecha_inicio')} AS fecha_inicio,
                ${nullableTextExpr('nomina_periodos', 'np', 'fecha_fin')} AS fecha_fin,
                ${nullableTextExpr('nomina_periodos', 'np', 'fecha_pago')} AS fecha_pago,
                c.id::text AS contrato_id,
                ${nullableTextExpr('contratos', 'c', 'numero_contrato')} AS numero_contrato,
                e.id::text AS empresa_id,
                e.nombre_empresa,
                COUNT(DISTINCT ne.id)::int AS empleados,
                COUNT(DISTINCT nn.id)::int AS novedades,
                ${hasTable('nomina_novedad_turnos') ? 'COUNT(DISTINCT nt.id)::int' : '0::int'} AS turnos,
                COALESCE(SUM(ne.salario_base), 0) AS salario_total,
                COALESCE(SUM(ne.auxilio_transporte), 0) AS transporte_total,
                COALESCE(SUM(${hasColumn('nomina_empleados', 'total_adiciones') ? 'ne.total_adiciones' : '0'}), 0) AS recargos_y_adiciones_total,
                COALESCE(SUM(${hasColumn('nomina_empleados', 'total_deducciones') ? 'ne.total_deducciones' : '0'}), 0) AS deducciones_total,
                COALESCE(SUM(${hasColumn('nomina_empleados', 'neto_pagar') ? 'ne.neto_pagar' : '0'}), 0) AS neto_total,
                COALESCE(SUM(${hasColumn('nomina_empleados', 'devengado_basico') ? 'ne.devengado_basico' : '0'}), 0) AS devengado_salario_total,
                COALESCE(SUM(${hasColumn('nomina_empleados', 'devengado_transporte') ? 'ne.devengado_transporte' : '0'}), 0) AS devengado_transporte_total,
                COALESCE(SUM(${hasColumn('nomina_empleados', 'devengado_otros') ? 'ne.devengado_otros' : '0'}), 0) AS otros_devengados_total,
                COALESCE(SUM(${hasColumn('nomina_empleados', 'salud') ? 'ne.salud' : '0'}), 0) AS salud_total,
                COALESCE(SUM(${hasColumn('nomina_empleados', 'pension') ? 'ne.pension' : '0'}), 0) AS pension_total
              FROM nomina_periodos np
              JOIN contratos c ON c.id = np.contrato_id
              JOIN empresas e ON e.id = c.empresa_id
              LEFT JOIN nomina_empleados ne ON ne.periodo_id = np.id AND ${boolExpr('nomina_empleados', 'ne', 'activo')}
              LEFT JOIN nomina_novedades nn ON nn.periodo_id = np.id AND ${boolExpr('nomina_novedades', 'nn', 'activo')}
              ${hasTable('nomina_novedad_turnos') ? 'LEFT JOIN nomina_novedad_turnos nt ON nt.periodo_id = np.id' : ''}
              WHERE np.id = $1::bigint
              GROUP BY np.id, c.id, e.id
            `,
            [realLatestPeriodRow.periodo_id]
          )
        : { rows: [] };

    const participationByContract =
      realLatestPeriodRow && hasTable('nomina_empleados')
        ? await client.query(
            `
              SELECT
                ne.periodo_id::text AS periodo_id,
                v.contrato_id::text AS contrato_id,
                ${nullableTextExpr('contratos', 'c', 'numero_contrato')} AS numero_contrato,
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
                AND ${boolExpr('nomina_empleados', 'ne', 'activo')}
              GROUP BY ne.periodo_id, v.contrato_id, c.numero_contrato, e.id, e.nombre_empresa
              ORDER BY empleados DESC, contrato_id ASC
            `,
            [realLatestPeriodRow.periodo_id]
          )
        : { rows: [] };

    const report = {
      generated_at: new Date().toISOString(),
      environment: {
        env_file: explicitEnvFile ?? '.env',
        database_host: (() => {
          try {
            return new URL(databaseUrl).hostname;
          } catch {
            return null;
          }
        })(),
        supabase_url: process.env.SUPABASE_URL ?? null,
        configured_storage_bucket: process.env.SUPABASE_STORAGE_BUCKET ?? null
      },
      schema: {
        objects: schemaObjects,
        columns: rowsToJson(metadata.rows.filter((row) => schemaObjects.some((item) => item.object_name === row.table_name))),
        constraints: rowsToJson(constraints.rows)
      },
      audit: {
        empresas_activas: rowsToJson(empresasActivas.rows),
        contratos_activos: rowsToJson(contratosActivos.rows),
        ultimo_periodo_real_candidato: rowToJson(realLatestPeriodRow),
        ultimos_periodos: rowsToJson(latestPeriods.rows),
        parametros_economicos: rowsToJson(payrollParameters.rows),
        categorias_salariales: rowsToJson(salaryCategories.rows),
        empleados_y_vinculaciones_auditados: rowsToJson(employeeCategoryAudit.rows),
        inconsistencias_categorias: rowsToJson(categoryInconsistencies.rows),
        permisos_roles: rowsToJson(permissionAudit.rows),
        storage_documental: rowsToJson(storageAudit.rows),
        tipos_documentales_desprendibles: rowsToJson(payslipDocumentTypes.rows),
        desprendibles_cadena_e2e: rowsToJson(payslipChainAudit.rows),
        resumen_periodo_real_candidato: rowsToJson(latestPeriodSummary.rows),
        participacion_periodo_real_candidato: rowsToJson(participationByContract.rows)
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
