import { QueryResultRow } from 'pg';

import { dbQuery } from '../../config/db';
import { getCoberturaResumen } from '../cobertura/cobertura.service';
import { DashboardQuery } from './dashboard.schemas';

interface CountMetricRow extends QueryResultRow {
  total: number;
}

interface DocumentosMetricRow extends QueryResultRow {
  documentos_por_vencer: number;
  documentos_sin_vencimiento: number;
  documentos_vencidos: number;
  total_documentos_persona: number;
  total_documentos_vinculacion: number;
}

interface ResumenRow extends QueryResultRow {
  alertas_activas: number;
  contratos_activos: number;
  documentos_por_vencer: number;
  documentos_vencidos: number;
  total_contratos: number;
  total_empresas: number;
  total_personas: number;
  vinculaciones_activas: number;
  vinculaciones_retiradas: number;
  vinculaciones_suspendidas: number;
}

interface PersonasPorContratoRow extends QueryResultRow {
  contrato_id: string;
  contrato_nombre: string | null;
  total: number;
}

interface PersonasPorCargoRow extends QueryResultRow {
  cargo_id: string;
  cargo_nombre: string | null;
  total: number;
}

interface PersonasPorMunicipioRow extends QueryResultRow {
  municipio_id: string | null;
  municipio_nombre: string | null;
  total: number;
}

interface PersonasDashboardRow extends QueryResultRow {
  ingresos_periodo: number;
  personas_activas: number;
  personas_inactivas: number;
  retiros_periodo: number;
  total_personas: number;
  vinculaciones_activas: number;
}

interface VencidosPorTipoRow extends QueryResultRow {
  documentos_vencidos: number;
  tipo_documento_id: string;
  tipo_documento_nombre: string | null;
}

interface NominaDashboardRow extends QueryResultRow {
  neto_pagado: number;
  novedades_pendientes: number;
  periodos_abiertos: number;
  periodos_cerrados: number;
  total_deducciones: number;
  total_devengado: number;
  total_liquidado: number;
}

interface UltimoPeriodoRow extends QueryResultRow {
  estado: string;
  estado_liquidacion: string;
  fecha_fin: Date | string;
  fecha_inicio: Date | string;
  id: string;
  nombre: string;
}

interface NovedadesPorTipoRow extends QueryResultRow {
  tipo: string;
  total: number;
  valor_total: number;
}

interface SstDashboardRow extends QueryResultRow {
  accidentes_trabajo: number;
  capacitaciones: number;
  enfermedades_laborales: number;
  entregas_epp: number;
  incidentes: number;
  planes_abiertos: number;
  planes_cerrados: number;
  planes_vencidos: number;
  porcentaje_cierre_planes: number;
  total_eventos: number;
}

interface AlertasPorTipoRow extends QueryResultRow {
  tipo_alerta: string;
  total: number;
}

interface AlertasDashboardRow extends QueryResultRow {
  alertas_activas: number;
  alertas_altas: number;
  alertas_criticas: number;
  notificaciones_no_leidas: number;
}

export interface DashboardDateRange {
  fecha_desde: string;
  fecha_hasta: string;
}

export interface DashboardResumen {
  alertas_activas: number;
  contratos_activos: number;
  documentos_por_vencer: number;
  documentos_vencidos: number;
  total_contratos: number;
  total_empresas: number;
  total_personas: number;
  vinculaciones_activas: number;
  vinculaciones_retiradas: number;
  vinculaciones_suspendidas: number;
}

export interface DashboardPersonas {
  ingresos_periodo: number;
  personas_activas: number;
  personas_inactivas: number;
  personas_por_cargo: Array<{
    cargo_id: string;
    cargo_nombre: string | null;
    total: number;
  }>;
  personas_por_contrato: Array<{
    contrato_id: string;
    contrato_nombre: string | null;
    total: number;
  }>;
  personas_por_municipio: Array<{
    municipio_id: string | null;
    municipio_nombre: string | null;
    total: number;
  }>;
  retiros_periodo: number;
  total_personas: number;
  vinculaciones_activas: number;
}

export interface DashboardDocumentos {
  cumplimiento_documental_promedio: number;
  documentos_por_vencer: number;
  documentos_sin_vencimiento: number;
  documentos_vencidos: number;
  total_documentos_persona: number;
  total_documentos_vinculacion: number;
  vencidos_por_tipo_documento: Array<{
    documentos_vencidos: number;
    tipo_documento_id: string;
    tipo_documento_nombre: string | null;
  }>;
}

export interface DashboardCobertura {
  cobertura_asignada_total: number;
  cobertura_por_modalidad_base: Array<{
    asignada_total: number;
    cobertura_porcentaje: number;
    modalidad_base: string;
    requerida_total: number;
  }>;
  cobertura_por_municipio: Array<{
    asignada_total: number;
    cobertura_porcentaje: number;
    municipio_id: string | null;
    municipio_nombre: string | null;
    requerida_total: number;
  }>;
  cobertura_requerida_total: number;
  cumplimiento_cobertura_porcentaje: number;
  faltantes_total: number;
  sobrecobertura_total: number;
  total_sedes_modalidad: number;
}

export interface DashboardNomina {
  neto_pagado: number;
  novedades_pendientes: number;
  novedades_por_tipo: Array<{
    tipo: string;
    total: number;
    valor_total: number;
  }>;
  periodos_abiertos: number;
  periodos_cerrados: number;
  total_deducciones: number;
  total_devengado: number;
  total_liquidado: number;
  ultimo_periodo: {
    estado: string;
    estado_liquidacion: string;
    fecha_fin: string;
    fecha_inicio: string;
    id: string;
    nombre: string;
  } | null;
}

export interface DashboardSst {
  accidentes_trabajo: number;
  capacitaciones: number;
  enfermedades_laborales: number;
  entregas_epp: number;
  incidentes: number;
  planes_abiertos: number;
  planes_cerrados: number;
  planes_vencidos: number;
  porcentaje_cierre_planes: number;
  total_eventos: number;
}

export interface DashboardAlertas {
  alertas_activas: number;
  alertas_altas: number;
  alertas_criticas: number;
  alertas_por_tipo: Array<{
    tipo_alerta: string;
    total: number;
  }>;
  notificaciones_no_leidas: number;
}

const toDateString = (value: Date | string): string => {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value;
};

const roundTwo = (value: number): number => {
  return Math.round(value * 100) / 100;
};

const addDays = (date: Date, days: number): Date => {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
};

const toIsoDate = (date: Date): string => {
  return date.toISOString().slice(0, 10);
};

export const resolveDashboardDateRange = (query: DashboardQuery): DashboardDateRange => {
  const today = new Date();
  const fechaHasta = query.fecha_hasta ?? toIsoDate(today);
  const fechaDesde = query.fecha_desde ?? toIsoDate(addDays(new Date(`${fechaHasta}T00:00:00.000Z`), -30));

  return {
    fecha_desde: fechaDesde,
    fecha_hasta: fechaHasta
  };
};

const buildEntityFilters = (
  query: DashboardQuery,
  alias: {
    contrato?: string;
    empresa?: string;
  }
): { params: unknown[]; sql: string } => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.empresa_id && alias.empresa) {
    params.push(query.empresa_id);
    conditions.push(`${alias.empresa} = $${params.length}`);
  }

  if (query.contrato_id && alias.contrato) {
    params.push(query.contrato_id);
    conditions.push(`${alias.contrato} = $${params.length}`);
  }

  return {
    params,
    sql: conditions.length > 0 ? ` AND ${conditions.join(' AND ')}` : ''
  };
};

export const getDashboardResumen = async (query: DashboardQuery): Promise<DashboardResumen> => {
  const today = toIsoDate(new Date());
  const next30Days = toIsoDate(addDays(new Date(), 30));
  const filters = buildEntityFilters(query, {
    empresa: 'v.empresa_id::text',
    contrato: 'v.contrato_id::text'
  });
  const contratoConditions: string[] = [];
  const contratoParams: unknown[] = [];

  if (query.contrato_id) {
    contratoParams.push(query.contrato_id);
    contratoConditions.push(`c.id::text = $${filters.params.length + contratoParams.length}`);
  }

  const contratosWhereSql =
    contratoConditions.length > 0 ? `WHERE ${contratoConditions.join(' AND ')}` : '';

  const result = await dbQuery<ResumenRow>(
    `
      WITH personas_filtradas AS (
        SELECT DISTINCT p.id
        FROM personas p
        LEFT JOIN vinculaciones v ON v.persona_id = p.id
        WHERE 1 = 1
        ${filters.sql}
      ),
      vinculaciones_filtradas AS (
        SELECT v.*
        FROM vinculaciones v
        WHERE 1 = 1
        ${filters.sql}
      ),
      documentos_union AS (
        SELECT dp.fecha_vencimiento
        FROM documentos_persona dp
        WHERE dp.activo = TRUE
          AND dp.fecha_vencimiento IS NOT NULL

        UNION ALL

        SELECT dv.fecha_vencimiento
        FROM documentos_vinculacion dv
        INNER JOIN vinculaciones v ON v.id = dv.vinculacion_id
        WHERE dv.activo = TRUE
          AND dv.fecha_vencimiento IS NOT NULL
          ${filters.sql}
      ),
      contratos_filtrados AS (
        SELECT c.id
        FROM contratos c
        ${contratosWhereSql}
      )
      SELECT
        (SELECT COUNT(*)::int FROM empresas) AS total_empresas,
        (SELECT COUNT(*)::int FROM contratos_filtrados) AS total_contratos,
        -- contratos no tiene columna activo (no hay borrado lógico a ese nivel),
        -- así que todo contrato filtrado se considera activo.
        (SELECT COUNT(*)::int FROM contratos_filtrados) AS contratos_activos,
        (SELECT COUNT(*)::int FROM personas_filtradas) AS total_personas,
        (SELECT COUNT(*)::int FROM vinculaciones_filtradas WHERE estado_vinculacion = 'ACTIVA') AS vinculaciones_activas,
        (SELECT COUNT(*)::int FROM vinculaciones_filtradas WHERE estado_vinculacion = 'RETIRADA') AS vinculaciones_retiradas,
        (SELECT COUNT(*)::int FROM vinculaciones_filtradas WHERE estado_vinculacion = 'SUSPENDIDA') AS vinculaciones_suspendidas,
        (
          SELECT COUNT(*)::int
          FROM documentos_union
          WHERE fecha_vencimiento < $${filters.params.length + contratoParams.length + 1}
        ) AS documentos_vencidos,
        (
          SELECT COUNT(*)::int
          FROM documentos_union
          WHERE fecha_vencimiento >= $${filters.params.length + contratoParams.length + 1}
            AND fecha_vencimiento <= $${filters.params.length + contratoParams.length + 2}
        ) AS documentos_por_vencer,
        (
          SELECT COUNT(*)::int
          FROM alertas_sistema a
          WHERE a.activo = TRUE
            AND a.estado IN ('ACTIVA', 'LEIDA')
        ) AS alertas_activas
    `,
    [...filters.params, ...contratoParams, today, next30Days]
  );

  const row = result.rows[0];

  return {
    total_empresas: row?.total_empresas ?? 0,
    total_contratos: row?.total_contratos ?? 0,
    contratos_activos: row?.contratos_activos ?? 0,
    total_personas: row?.total_personas ?? 0,
    vinculaciones_activas: row?.vinculaciones_activas ?? 0,
    vinculaciones_retiradas: row?.vinculaciones_retiradas ?? 0,
    vinculaciones_suspendidas: row?.vinculaciones_suspendidas ?? 0,
    documentos_vencidos: row?.documentos_vencidos ?? 0,
    documentos_por_vencer: row?.documentos_por_vencer ?? 0,
    alertas_activas: row?.alertas_activas ?? 0
  };
};

export const getDashboardPersonas = async (query: DashboardQuery): Promise<DashboardPersonas> => {
  const range = resolveDashboardDateRange(query);
  const filters = buildEntityFilters(query, {
    empresa: 'v.empresa_id::text',
    contrato: 'v.contrato_id::text'
  });

  const summaryResult = await dbQuery<PersonasDashboardRow>(
    `
      WITH personas_filtradas AS (
        SELECT DISTINCT p.id
        FROM personas p
        LEFT JOIN vinculaciones v ON v.persona_id = p.id
        WHERE 1 = 1
        ${filters.sql}
      ),
      vinculaciones_filtradas AS (
        SELECT *
        FROM vinculaciones v
        WHERE 1 = 1
        ${filters.sql}
      ),
      personas_activas_cte AS (
        -- personas no tiene columna activo: una persona se considera activa si
        -- tiene al menos una vinculacion ACTIVA dentro del alcance filtrado.
        SELECT DISTINCT persona_id
        FROM vinculaciones_filtradas
        WHERE estado_vinculacion = 'ACTIVA'
      )
      SELECT
        (SELECT COUNT(*)::int FROM personas_filtradas) AS total_personas,
        (SELECT COUNT(*)::int FROM personas_activas_cte) AS personas_activas,
        (
          SELECT COUNT(*)::int
          FROM personas_filtradas
          WHERE id NOT IN (SELECT persona_id FROM personas_activas_cte)
        ) AS personas_inactivas,
        (SELECT COUNT(*)::int FROM vinculaciones_filtradas WHERE estado_vinculacion = 'ACTIVA') AS vinculaciones_activas,
        (
          SELECT COUNT(*)::int
          FROM vinculaciones_filtradas
          WHERE fecha_inicio >= $${filters.params.length + 1}
            AND fecha_inicio <= $${filters.params.length + 2}
        ) AS ingresos_periodo,
        (
          SELECT COUNT(*)::int
          FROM vinculaciones_filtradas
          WHERE fecha_fin IS NOT NULL
            AND fecha_fin >= $${filters.params.length + 1}
            AND fecha_fin <= $${filters.params.length + 2}
        ) AS retiros_periodo
    `,
    [...filters.params, range.fecha_desde, range.fecha_hasta]
  );

  const contratoRows = await dbQuery<PersonasPorContratoRow>(
    `
      SELECT
        v.contrato_id::text AS contrato_id,
        c.numero_contrato AS contrato_nombre,
        COUNT(DISTINCT v.persona_id)::int AS total
      FROM vinculaciones v
      INNER JOIN contratos c ON c.id = v.contrato_id
      WHERE 1 = 1
      ${filters.sql}
      GROUP BY v.contrato_id, c.numero_contrato
      ORDER BY total DESC, contrato_nombre ASC NULLS LAST
    `,
    filters.params
  );

  const cargoRows = await dbQuery<PersonasPorCargoRow>(
    `
      SELECT
        v.contrato_cargo_id::text AS cargo_id,
        cc.nombre_cargo AS cargo_nombre,
        COUNT(DISTINCT v.persona_id)::int AS total
      FROM vinculaciones v
      INNER JOIN contrato_cargos cc ON cc.id = v.contrato_cargo_id
      WHERE 1 = 1
      ${filters.sql}
      GROUP BY v.contrato_cargo_id, cc.nombre_cargo
      ORDER BY total DESC, cargo_nombre ASC NULLS LAST
    `,
    filters.params
  );

  const municipioRows = await dbQuery<PersonasPorMunicipioRow>(
    `
      SELECT
        p.municipio_residencia_id::text AS municipio_id,
        m.nombre_municipio AS municipio_nombre,
        COUNT(DISTINCT p.id)::int AS total
      FROM personas p
      LEFT JOIN vinculaciones v ON v.persona_id = p.id
      LEFT JOIN municipios m ON m.id = p.municipio_residencia_id
      WHERE 1 = 1
      ${filters.sql}
      GROUP BY p.municipio_residencia_id, m.nombre_municipio
      ORDER BY total DESC, municipio_nombre ASC NULLS LAST
    `,
    filters.params
  );

  const row = summaryResult.rows[0];

  return {
    total_personas: row?.total_personas ?? 0,
    personas_activas: row?.personas_activas ?? 0,
    personas_inactivas: row?.personas_inactivas ?? 0,
    vinculaciones_activas: row?.vinculaciones_activas ?? 0,
    ingresos_periodo: row?.ingresos_periodo ?? 0,
    retiros_periodo: row?.retiros_periodo ?? 0,
    personas_por_contrato: contratoRows.rows,
    personas_por_cargo: cargoRows.rows,
    personas_por_municipio: municipioRows.rows
  };
};

export const getDashboardDocumentos = async (
  query: DashboardQuery
): Promise<DashboardDocumentos> => {
  const today = toIsoDate(new Date());
  const next30Days = toIsoDate(addDays(new Date(), 30));
  const filters = buildEntityFilters(query, {
    empresa: 'v.empresa_id::text',
    contrato: 'v.contrato_id::text'
  });

  const metricsResult = await dbQuery<DocumentosMetricRow>(
    `
      WITH documentos_persona_filtrados AS (
        SELECT dp.*
        FROM documentos_persona dp
        WHERE dp.activo = TRUE
      ),
      documentos_vinculacion_filtrados AS (
        SELECT dv.*
        FROM documentos_vinculacion dv
        INNER JOIN vinculaciones v ON v.id = dv.vinculacion_id
        WHERE dv.activo = TRUE
        ${filters.sql}
      ),
      documentos_union AS (
        SELECT fecha_vencimiento
        FROM documentos_persona_filtrados

        UNION ALL

        SELECT fecha_vencimiento
        FROM documentos_vinculacion_filtrados
      )
      SELECT
        (SELECT COUNT(*)::int FROM documentos_persona_filtrados) AS total_documentos_persona,
        (SELECT COUNT(*)::int FROM documentos_vinculacion_filtrados) AS total_documentos_vinculacion,
        (
          SELECT COUNT(*)::int
          FROM documentos_union
          WHERE fecha_vencimiento IS NOT NULL
            AND fecha_vencimiento < $${filters.params.length + 1}
        ) AS documentos_vencidos,
        (
          SELECT COUNT(*)::int
          FROM documentos_union
          WHERE fecha_vencimiento IS NOT NULL
            AND fecha_vencimiento >= $${filters.params.length + 1}
            AND fecha_vencimiento <= $${filters.params.length + 2}
        ) AS documentos_por_vencer,
        (
          SELECT COUNT(*)::int
          FROM documentos_union
          WHERE fecha_vencimiento IS NULL
        ) AS documentos_sin_vencimiento
    `,
    [...filters.params, today, next30Days]
  );

  const vencidosPorTipoResult = await dbQuery<VencidosPorTipoRow>(
    `
      WITH documentos_union AS (
        SELECT
          dp.tipo_documento_id::text AS tipo_documento_id,
          td.nombre_documento AS tipo_documento_nombre,
          dp.fecha_vencimiento
        FROM documentos_persona dp
        INNER JOIN tipos_documentos td ON td.id = dp.tipo_documento_id
        WHERE dp.activo = TRUE

        UNION ALL

        SELECT
          dv.tipo_documento_id::text AS tipo_documento_id,
          td.nombre_documento AS tipo_documento_nombre,
          dv.fecha_vencimiento
        FROM documentos_vinculacion dv
        INNER JOIN tipos_documentos td ON td.id = dv.tipo_documento_id
        INNER JOIN vinculaciones v ON v.id = dv.vinculacion_id
        WHERE dv.activo = TRUE
        ${filters.sql}
      )
      SELECT
        tipo_documento_id,
        tipo_documento_nombre,
        COUNT(*)::int AS documentos_vencidos
      FROM documentos_union
      WHERE fecha_vencimiento IS NOT NULL
        AND fecha_vencimiento < $${filters.params.length + 1}
      GROUP BY tipo_documento_id, tipo_documento_nombre
      ORDER BY documentos_vencidos DESC, tipo_documento_nombre ASC NULLS LAST
    `,
    [...filters.params, today]
  );

  const metricRow = metricsResult.rows[0];
  const totalTrackedDocuments =
    (metricRow?.total_documentos_persona ?? 0) + (metricRow?.total_documentos_vinculacion ?? 0);
  const documentosCumplidos =
    totalTrackedDocuments - (metricRow?.documentos_vencidos ?? 0) - (metricRow?.documentos_por_vencer ?? 0);
  const cumplimiento =
    totalTrackedDocuments > 0 ? roundTwo((documentosCumplidos / totalTrackedDocuments) * 100) : 0;

  return {
    total_documentos_persona: metricRow?.total_documentos_persona ?? 0,
    total_documentos_vinculacion: metricRow?.total_documentos_vinculacion ?? 0,
    documentos_vencidos: metricRow?.documentos_vencidos ?? 0,
    documentos_por_vencer: metricRow?.documentos_por_vencer ?? 0,
    documentos_sin_vencimiento: metricRow?.documentos_sin_vencimiento ?? 0,
    cumplimiento_documental_promedio: cumplimiento,
    vencidos_por_tipo_documento: vencidosPorTipoResult.rows
  };
};

// focalizacion_final no tiene columnas modalidad_base/manipuladores_requeridos, y
// cobertura_asignaciones no tiene fraccion_cobertura: esos valores se calculan en
// cobertura.service.ts (calculateRequiredCoverage), no son columnas de la base de
// datos. En vez de duplicar esa lógica con nombres de columna inventados, este
// dashboard reutiliza getCoberturaResumen (ya validado) y agrega sus resultados.
// El módulo de cobertura tampoco filtra por empresa_id (focalizacion_final solo
// tiene contrato_id), así que ese filtro no aplica aquí.
export const getDashboardCobertura = async (
  query: DashboardQuery
): Promise<DashboardCobertura> => {
  const { items } = await getCoberturaResumen({
    contrato_id: query.contrato_id ?? undefined,
    page: 1,
    limit: 10000
  });

  const toPercentage = (asignada: number, requerida: number): number =>
    requerida === 0 ? 0 : Math.round((asignada / requerida) * 100 * 100) / 100;

  let coberturaRequeridaTotal = 0;
  let coberturaAsignadaTotal = 0;
  let faltantesTotal = 0;
  let sobrecoberturaTotal = 0;

  const porMunicipio = new Map<string, { municipio_id: string | null; municipio_nombre: string | null; requerida_total: number; asignada_total: number }>();
  const porModalidad = new Map<string, { modalidad_base: string; requerida_total: number; asignada_total: number }>();

  for (const item of items) {
    coberturaRequeridaTotal += item.manipuladores_requeridos;
    coberturaAsignadaTotal += item.asignados;
    faltantesTotal += Math.max(0, item.manipuladores_requeridos - item.asignados);
    sobrecoberturaTotal += Math.max(0, item.asignados - item.manipuladores_requeridos);

    const municipioKey = item.municipio_id ?? item.municipio_nombre ?? 'SIN_MUNICIPIO';
    const municipioEntry = porMunicipio.get(municipioKey) ?? {
      municipio_id: item.municipio_id,
      municipio_nombre: item.municipio_nombre,
      requerida_total: 0,
      asignada_total: 0
    };
    municipioEntry.requerida_total += item.manipuladores_requeridos;
    municipioEntry.asignada_total += item.asignados;
    porMunicipio.set(municipioKey, municipioEntry);

    const modalidadEntry = porModalidad.get(item.modalidad_base) ?? {
      modalidad_base: item.modalidad_base,
      requerida_total: 0,
      asignada_total: 0
    };
    modalidadEntry.requerida_total += item.manipuladores_requeridos;
    modalidadEntry.asignada_total += item.asignados;
    porModalidad.set(item.modalidad_base, modalidadEntry);
  }

  return {
    total_sedes_modalidad: items.length,
    cobertura_requerida_total: coberturaRequeridaTotal,
    cobertura_asignada_total: coberturaAsignadaTotal,
    faltantes_total: faltantesTotal,
    sobrecobertura_total: sobrecoberturaTotal,
    cumplimiento_cobertura_porcentaje: toPercentage(coberturaAsignadaTotal, coberturaRequeridaTotal),
    cobertura_por_municipio: Array.from(porMunicipio.values())
      .map((entry) => ({ ...entry, cobertura_porcentaje: toPercentage(entry.asignada_total, entry.requerida_total) }))
      .sort((a, b) => (a.municipio_nombre ?? '').localeCompare(b.municipio_nombre ?? '')),
    cobertura_por_modalidad_base: Array.from(porModalidad.values())
      .map((entry) => ({ ...entry, cobertura_porcentaje: toPercentage(entry.asignada_total, entry.requerida_total) }))
      .sort((a, b) => a.modalidad_base.localeCompare(b.modalidad_base))
  };
};

export const getDashboardNomina = async (query: DashboardQuery): Promise<DashboardNomina> => {
  const range = resolveDashboardDateRange(query);
  // nomina_periodos no tiene columna empresa_id propia: se resuelve via contratos.
  const filters = buildEntityFilters(query, {
    empresa: 'c.empresa_id::text',
    contrato: 'np.contrato_id::text'
  });

  const resumenResult = await dbQuery<NominaDashboardRow>(
    `
      WITH periodos_filtrados AS (
        SELECT np.*
        FROM nomina_periodos np
        INNER JOIN contratos c ON c.id = np.contrato_id
        WHERE np.fecha_inicio <= $${filters.params.length + 2}
          AND np.fecha_fin >= $${filters.params.length + 1}
        ${filters.sql}
      ),
      liquidaciones_filtradas AS (
        SELECT nl.*
        FROM nomina_liquidaciones nl
        INNER JOIN periodos_filtrados np ON np.id = nl.periodo_id
      ),
      novedades_filtradas AS (
        SELECT nn.*
        FROM nomina_novedades nn
        INNER JOIN periodos_filtrados np ON np.id = nn.periodo_id
      )
      SELECT
        (SELECT COUNT(*)::int FROM periodos_filtrados WHERE estado = 'ABIERTO') AS periodos_abiertos,
        (SELECT COUNT(*)::int FROM periodos_filtrados WHERE estado = 'CERRADO') AS periodos_cerrados,
        COALESCE((SELECT SUM(total_liquidacion) FROM liquidaciones_filtradas), 0)::numeric AS total_liquidado,
        COALESCE((SELECT SUM(total_liquidacion + COALESCE(deducciones, 0)) FROM liquidaciones_filtradas), 0)::numeric AS total_devengado,
        COALESCE((SELECT SUM(deducciones) FROM liquidaciones_filtradas), 0)::numeric AS total_deducciones,
        COALESCE((SELECT SUM(total_liquidacion) FROM liquidaciones_filtradas WHERE estado = 'FINAL'), 0)::numeric AS neto_pagado,
        (
          SELECT COUNT(*)::int
          FROM novedades_filtradas
          WHERE activo = TRUE
        ) AS novedades_pendientes
    `,
    [...filters.params, range.fecha_desde, range.fecha_hasta]
  );

  const ultimoPeriodoResult = await dbQuery<UltimoPeriodoRow>(
    `
      SELECT
        np.id::text AS id,
        np.nombre_periodo AS nombre,
        np.fecha_inicio,
        np.fecha_fin,
        np.estado,
        -- nomina_periodos no tiene estado_liquidacion: se deriva de sus liquidaciones
        -- (FINAL solo si ninguna liquidacion del periodo sigue en estado distinto a FINAL).
        CASE
          WHEN EXISTS (
            SELECT 1 FROM nomina_liquidaciones nl2
            WHERE nl2.periodo_id = np.id AND nl2.estado <> 'FINAL'
          ) THEN 'PRELIMINAR'
          ELSE 'FINAL'
        END AS estado_liquidacion
      FROM nomina_periodos np
      INNER JOIN contratos c ON c.id = np.contrato_id
      WHERE 1 = 1
      ${filters.sql}
      ORDER BY np.fecha_fin DESC, np.created_at DESC
      LIMIT 1
    `,
    filters.params
  );

  const novedadesTipoResult = await dbQuery<NovedadesPorTipoRow>(
    `
      SELECT
        COALESCE(ntn.nombre, 'SIN_TIPO') AS tipo,
        COUNT(*)::int AS total,
        COALESCE(SUM(nn.valor_manual), 0)::numeric AS valor_total
      FROM nomina_novedades nn
      INNER JOIN nomina_periodos np ON np.id = nn.periodo_id
      INNER JOIN contratos c ON c.id = np.contrato_id
      LEFT JOIN nomina_tipos_novedad ntn ON ntn.id = nn.tipo_novedad_id
      WHERE np.fecha_inicio <= $${filters.params.length + 2}
        AND np.fecha_fin >= $${filters.params.length + 1}
        AND nn.activo = TRUE
        ${filters.sql}
      GROUP BY ntn.nombre
      ORDER BY ntn.nombre ASC
    `,
    [...filters.params, range.fecha_desde, range.fecha_hasta]
  );

  const row = resumenResult.rows[0];
  const ultimoPeriodo = ultimoPeriodoResult.rows[0];

  return {
    periodos_abiertos: row?.periodos_abiertos ?? 0,
    periodos_cerrados: row?.periodos_cerrados ?? 0,
    ultimo_periodo: ultimoPeriodo
      ? {
          id: ultimoPeriodo.id,
          nombre: ultimoPeriodo.nombre,
          fecha_inicio: toDateString(ultimoPeriodo.fecha_inicio),
          fecha_fin: toDateString(ultimoPeriodo.fecha_fin),
          estado: ultimoPeriodo.estado,
          estado_liquidacion: ultimoPeriodo.estado_liquidacion
        }
      : null,
    total_liquidado: Number(row?.total_liquidado ?? 0),
    total_devengado: Number(row?.total_devengado ?? 0),
    total_deducciones: Number(row?.total_deducciones ?? 0),
    neto_pagado: Number(row?.neto_pagado ?? 0),
    novedades_pendientes: row?.novedades_pendientes ?? 0,
    novedades_por_tipo: novedadesTipoResult.rows.map((item) => ({
      tipo: item.tipo,
      total: item.total,
      valor_total: Number(item.valor_total)
    }))
  };
};

export const getDashboardSst = async (query: DashboardQuery): Promise<DashboardSst> => {
  const range = resolveDashboardDateRange(query);
  // sst_eventos no tiene empresa_id/contrato_id propios: se resuelven via su vinculacion.
  // sst_planes_accion tampoco tiene evento_id: se vincula al evento via origen_id.
  const filters = buildEntityFilters(query, {
    empresa: 'v.empresa_id::text',
    contrato: 'v.contrato_id::text'
  });

  const result = await dbQuery<SstDashboardRow>(
    `
      WITH eventos_filtrados AS (
        SELECT se.*
        FROM sst_eventos se
        INNER JOIN vinculaciones v ON v.id = se.vinculacion_id
        WHERE se.fecha_evento >= $${filters.params.length + 1}
          AND se.fecha_evento <= $${filters.params.length + 2}
        ${filters.sql}
      ),
      planes_filtrados AS (
        SELECT spa.*
        FROM sst_planes_accion spa
        INNER JOIN sst_eventos se ON se.id = spa.origen_id AND spa.origen = 'EVENTO'
        INNER JOIN vinculaciones v ON v.id = se.vinculacion_id
        WHERE spa.activo = TRUE
          AND se.fecha_evento >= $${filters.params.length + 1}
          AND se.fecha_evento <= $${filters.params.length + 2}
        ${filters.sql}
      )
      SELECT
        (SELECT COUNT(*)::int FROM eventos_filtrados) AS total_eventos,
        (SELECT COUNT(*)::int FROM eventos_filtrados WHERE tipo_evento = 'ACCIDENTE_TRABAJO') AS accidentes_trabajo,
        (SELECT COUNT(*)::int FROM eventos_filtrados WHERE tipo_evento = 'INCIDENTE') AS incidentes,
        (SELECT COUNT(*)::int FROM eventos_filtrados WHERE tipo_evento = 'ENFERMEDAD_LABORAL') AS enfermedades_laborales,
        (SELECT COUNT(*)::int FROM eventos_filtrados WHERE tipo_evento = 'CAPACITACION') AS capacitaciones,
        (SELECT COUNT(*)::int FROM eventos_filtrados WHERE tipo_evento = 'ENTREGA_EPP') AS entregas_epp,
        (
          SELECT COUNT(*)::int
          FROM planes_filtrados
          WHERE estado <> 'CERRADO'
            AND estado <> 'ANULADO'
            AND fecha_compromiso >= CURRENT_DATE
        ) AS planes_abiertos,
        (
          SELECT COUNT(*)::int
          FROM planes_filtrados
          WHERE estado = 'CERRADO'
        ) AS planes_cerrados,
        (
          SELECT COUNT(*)::int
          FROM planes_filtrados
          WHERE estado <> 'CERRADO'
            AND estado <> 'ANULADO'
            AND fecha_compromiso < CURRENT_DATE
        ) AS planes_vencidos,
        CASE
          WHEN (SELECT COUNT(*) FROM planes_filtrados) = 0 THEN 0
          ELSE ROUND((
            (SELECT COUNT(*)::numeric FROM planes_filtrados WHERE estado = 'CERRADO')
            / (SELECT COUNT(*)::numeric FROM planes_filtrados)
          ) * 100, 2)
        END AS porcentaje_cierre_planes
    `,
    [...filters.params, range.fecha_desde, range.fecha_hasta]
  );

  const row = result.rows[0];

  return {
    total_eventos: row?.total_eventos ?? 0,
    accidentes_trabajo: row?.accidentes_trabajo ?? 0,
    incidentes: row?.incidentes ?? 0,
    enfermedades_laborales: row?.enfermedades_laborales ?? 0,
    capacitaciones: row?.capacitaciones ?? 0,
    entregas_epp: row?.entregas_epp ?? 0,
    planes_abiertos: row?.planes_abiertos ?? 0,
    planes_vencidos: row?.planes_vencidos ?? 0,
    planes_cerrados: row?.planes_cerrados ?? 0,
    porcentaje_cierre_planes: Number(row?.porcentaje_cierre_planes ?? 0)
  };
};

export const getDashboardAlertas = async (
  query: DashboardQuery
): Promise<DashboardAlertas> => {
  const range = resolveDashboardDateRange(query);
  // alertas_sistema solo tiene contrato_id (no empresa_id): empresa_id no aplica aquí.
  const contratoParams: unknown[] = [];
  let contratoCondition = '';
  if (query.contrato_id) {
    contratoParams.push(query.contrato_id);
    contratoCondition = ` AND a.contrato_id::text = $${contratoParams.length + 2}`;
  }

  const summaryResult = await dbQuery<AlertasDashboardRow>(
    `
      SELECT
        COUNT(*) FILTER (
          WHERE a.activo = TRUE
            AND a.estado IN ('ACTIVA', 'LEIDA')
            AND a.fecha_alerta >= $1
            AND a.fecha_alerta <= $2
        )::int AS alertas_activas,
        COUNT(*) FILTER (
          WHERE a.activo = TRUE
            AND a.estado IN ('ACTIVA', 'LEIDA')
            AND a.prioridad = 'CRITICA'
            AND a.fecha_alerta >= $1
            AND a.fecha_alerta <= $2
        )::int AS alertas_criticas,
        COUNT(*) FILTER (
          WHERE a.activo = TRUE
            AND a.estado IN ('ACTIVA', 'LEIDA')
            AND a.prioridad = 'ALTA'
            AND a.fecha_alerta >= $1
            AND a.fecha_alerta <= $2
        )::int AS alertas_altas,
        (
          SELECT COUNT(*)::int
          FROM notificaciones n
          WHERE n.archivado_en IS NULL
            AND n.leida = FALSE
        ) AS notificaciones_no_leidas
      FROM alertas_sistema a
      WHERE 1 = 1
      ${contratoCondition}
    `,
    [range.fecha_desde, range.fecha_hasta, ...contratoParams]
  );

  const tipoResult = await dbQuery<AlertasPorTipoRow>(
    `
      SELECT
        a.tipo_alerta,
        COUNT(*)::int AS total
      FROM alertas_sistema a
      WHERE a.activo = TRUE
        AND a.estado IN ('ACTIVA', 'LEIDA')
        AND a.fecha_alerta >= $1
        AND a.fecha_alerta <= $2
        ${contratoCondition}
      GROUP BY a.tipo_alerta
      ORDER BY total DESC, a.tipo_alerta ASC
    `,
    [range.fecha_desde, range.fecha_hasta, ...contratoParams]
  );

  const row = summaryResult.rows[0];

  return {
    alertas_activas: row?.alertas_activas ?? 0,
    alertas_criticas: row?.alertas_criticas ?? 0,
    alertas_altas: row?.alertas_altas ?? 0,
    alertas_por_tipo: tipoResult.rows,
    notificaciones_no_leidas: row?.notificaciones_no_leidas ?? 0
  };
};
