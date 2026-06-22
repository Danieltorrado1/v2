import { randomUUID } from 'crypto';

import { QueryResultRow } from 'pg';

import { dbQuery } from '../../config/db';
import { AuditRequestMeta, registerAuditEntry } from '../auditoria/auditoria.helper';
import { listAuditoria } from '../auditoria/auditoria.service';
import {
  getCoberturaContratoDetalle,
  getCoberturaFaltantes,
  getCoberturaSobrecobertura
} from '../cobertura/cobertura.service';
import { getVinculacionChecklist } from '../documentos/documentos.service';
import { listNominaDesprendibles, listNominaLiquidaciones } from '../nomina/nomina.service';
import { listSstEventos, listSstPlanesAccion } from '../sst/sst.service';
import { AppError } from '../../utils/AppError';
import { CommonReportQuery, ReportFormat } from './reportes.schemas';

interface CountRow extends QueryResultRow {
  total: number;
}

interface PersonaActivaRow extends QueryResultRow {
  activo: boolean;
  cargo_nombre: string | null;
  contrato_id: string;
  contrato_nombre: string | null;
  correo: string | null;
  empresa_id: string;
  empresa_nombre: string | null;
  estado: string;
  fecha_fin: Date | string | null;
  fecha_inicio: Date | string;
  id: string;
  municipio_residencia_id: string | null;
  nombre_completo: string;
  numero_documento: string;
  persona_id: string;
  telefono: string | null;
}

interface VinculacionHistoricaRow extends QueryResultRow {
  cargo_nombre: string | null;
  contrato_id: string;
  contrato_nombre: string | null;
  empresa_id: string;
  empresa_nombre: string | null;
  estado: string;
  fecha_fin: Date | string | null;
  fecha_inicio: Date | string;
  id: string;
  nombre_completo: string;
  numero_documento: string;
  persona_id: string;
}

interface DocumentoReporteRow extends QueryResultRow {
  alcance: string;
  contrato_id: string | null;
  fecha_vencimiento: Date | string;
  id: string;
  nombre_completo: string | null;
  nombre_original: string;
  numero_documento: string | null;
  tipo_documento_nombre: string | null;
  vinculacion_id: string | null;
}

interface NominaNovedadReporteRow extends QueryResultRow {
  activo: boolean;
  afecta: string;
  concepto: string;
  created_at: Date;
  descripcion: string | null;
  periodo_id: string;
  persona_nombre_snapshot: string | null;
  tipo: string;
  valor: number;
  vinculacion_id: string;
}

export interface ReportColumn {
  header: string;
  key: string;
}

export interface ReportPayload<T> {
  columns: ReportColumn[];
  data: T;
  fileName: string;
  rows: Array<Record<string, unknown>>;
  sheetName: string;
  title: string;
}

const toDateString = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value;
};

const buildPagination = (query: CommonReportQuery, total: number) => {
  return {
    page: query.page,
    limit: query.limit,
    total,
    total_pages: total === 0 ? 0 : Math.ceil(total / query.limit)
  };
};

const buildListFilters = (
  query: CommonReportQuery,
  mapping: Record<string, string>
): { params: unknown[]; whereClause: string } => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  const addCondition = (column: string, value: unknown, operator = '='): void => {
    if (value === undefined || value === null) {
      return;
    }

    params.push(value);
    conditions.push(`${column} ${operator} $${params.length}`);
  };

  if (mapping.empresa_id) {
    addCondition(mapping.empresa_id, query.empresa_id);
  }

  if (mapping.contrato_id) {
    addCondition(mapping.contrato_id, query.contrato_id);
  }

  if (mapping.municipio_id) {
    addCondition(mapping.municipio_id, query.municipio_id);
  }

  if (mapping.estado) {
    addCondition(mapping.estado, query.estado);
  }

  if (mapping.activo && query.activo !== undefined) {
    addCondition(mapping.activo, query.activo);
  }

  if (mapping.fecha_desde && query.fecha_desde) {
    addCondition(mapping.fecha_desde, query.fecha_desde, '>=');
  }

  if (mapping.fecha_hasta && query.fecha_hasta) {
    addCondition(mapping.fecha_hasta, query.fecha_hasta, '<=');
  }

  return {
    params,
    whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  };
};

const getPaginationParams = (query: CommonReportQuery, params: unknown[]): unknown[] => {
  const offset = (query.page - 1) * query.limit;
  return [...params, query.limit, offset];
};

export const recordReportExportAudit = async (input: {
  actorUserId: string;
  auditMeta?: AuditRequestMeta;
  fileName: string;
  filters?: Record<string, unknown>;
  format: Exclude<ReportFormat, 'json'>;
  reportName: string;
}): Promise<void> => {
  await registerAuditEntry({
    usuario_id: input.actorUserId,
    accion: 'DOWNLOAD',
    tabla: 'reportes',
    registro_id: randomUUID(),
    descripcion: `Exportacion ${input.format.toUpperCase()} del reporte ${input.reportName}`,
    ip: input.auditMeta?.ip ?? null,
    user_agent: input.auditMeta?.user_agent ?? null,
    after: {
      file_name: input.fileName,
      format: input.format,
      filters: input.filters ?? null,
      report_name: input.reportName
    }
  });
};

export const getPersonalActivoReport = async (
  query: CommonReportQuery
): Promise<ReportPayload<{ items: Array<Record<string, unknown>>; pagination: ReturnType<typeof buildPagination> }>> => {
  const baseFilters = buildListFilters(query, {
    empresa_id: 'v.empresa_id::text',
    contrato_id: 'v.contrato_id::text',
    municipio_id: 'p.municipio_residencia_id::text',
    fecha_desde: 'v.fecha_inicio',
    fecha_hasta: 'COALESCE(v.fecha_fin, CURRENT_DATE)',
    activo: 'p.activo'
  });

  const conditions = [baseFilters.whereClause.replace(/^WHERE\s*/, ''), `v.estado = 'ACTIVA'`]
    .filter((condition) => condition.length > 0)
    .join(' AND ');
  const whereClause = conditions.length > 0 ? `WHERE ${conditions}` : '';

  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM personas p
      INNER JOIN vinculaciones v ON v.persona_id = p.id
      ${whereClause}
    `,
    baseFilters.params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const listParams = getPaginationParams(query, baseFilters.params);
  const result = await dbQuery<PersonaActivaRow>(
    `
      SELECT
        v.id::text AS id,
        p.id::text AS persona_id,
        p.numero_documento,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS nombre_completo,
        p.correo,
        p.telefono,
        p.municipio_residencia_id::text AS municipio_residencia_id,
        p.activo,
        v.empresa_id::text AS empresa_id,
        e.nombre AS empresa_nombre,
        v.contrato_id::text AS contrato_id,
        c.nombre AS contrato_nombre,
        cc.nombre AS cargo_nombre,
        v.estado,
        v.fecha_inicio,
        v.fecha_fin
      FROM personas p
      INNER JOIN vinculaciones v ON v.persona_id = p.id
      LEFT JOIN empresas e ON e.id = v.empresa_id
      LEFT JOIN contratos c ON c.id = v.contrato_id
      LEFT JOIN contrato_cargos cc ON cc.id = v.contrato_cargo_id
      ${whereClause}
      ORDER BY nombre_completo ASC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `,
    listParams
  );

  const rows = result.rows.map((row) => ({
    vinculacion_id: row.id,
    persona_id: row.persona_id,
    numero_documento: row.numero_documento,
    nombre_completo: row.nombre_completo,
    correo: row.correo,
    telefono: row.telefono,
    empresa_id: row.empresa_id,
    empresa_nombre: row.empresa_nombre,
    contrato_id: row.contrato_id,
    contrato_nombre: row.contrato_nombre,
    cargo_nombre: row.cargo_nombre,
    estado: row.estado,
    fecha_inicio: toDateString(row.fecha_inicio),
    fecha_fin: toDateString(row.fecha_fin),
    activo: row.activo
  }));

  return {
    title: 'Reporte Personal Activo',
    fileName: 'reporte-personal-activo',
    sheetName: 'Personal Activo',
    columns: [
      { key: 'vinculacion_id', header: 'Vinculacion ID' },
      { key: 'persona_id', header: 'Persona ID' },
      { key: 'numero_documento', header: 'Numero Documento' },
      { key: 'nombre_completo', header: 'Nombre Completo' },
      { key: 'correo', header: 'Correo' },
      { key: 'telefono', header: 'Telefono' },
      { key: 'empresa_nombre', header: 'Empresa' },
      { key: 'contrato_nombre', header: 'Contrato' },
      { key: 'cargo_nombre', header: 'Cargo' },
      { key: 'estado', header: 'Estado' },
      { key: 'fecha_inicio', header: 'Fecha Inicio' },
      { key: 'fecha_fin', header: 'Fecha Fin' },
      { key: 'activo', header: 'Activo' }
    ],
    rows,
    data: {
      items: rows,
      pagination: buildPagination(query, total)
    }
  };
};

export const getPersonalPorContratoReport = async (
  contratoId: string,
  query: CommonReportQuery
): Promise<ReportPayload<{ items: Array<Record<string, unknown>>; pagination: ReturnType<typeof buildPagination> }>> => {
  return getPersonalActivoReport({
    ...query,
    contrato_id: contratoId
  });
};

export const getVinculacionesHistoricasReport = async (
  query: CommonReportQuery
): Promise<ReportPayload<{ items: Array<Record<string, unknown>>; pagination: ReturnType<typeof buildPagination> }>> => {
  const filters = buildListFilters(query, {
    empresa_id: 'v.empresa_id::text',
    contrato_id: 'v.contrato_id::text',
    fecha_desde: 'v.fecha_inicio',
    fecha_hasta: 'COALESCE(v.fecha_fin, CURRENT_DATE)',
    estado: 'v.estado'
  });

  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM vinculaciones v
      ${filters.whereClause}
    `,
    filters.params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const listParams = getPaginationParams(query, filters.params);
  const result = await dbQuery<VinculacionHistoricaRow>(
    `
      SELECT
        v.id::text AS id,
        v.persona_id::text AS persona_id,
        p.numero_documento,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS nombre_completo,
        v.empresa_id::text AS empresa_id,
        e.nombre AS empresa_nombre,
        v.contrato_id::text AS contrato_id,
        c.nombre AS contrato_nombre,
        cc.nombre AS cargo_nombre,
        v.estado,
        v.fecha_inicio,
        v.fecha_fin
      FROM vinculaciones v
      INNER JOIN personas p ON p.id = v.persona_id
      LEFT JOIN empresas e ON e.id = v.empresa_id
      LEFT JOIN contratos c ON c.id = v.contrato_id
      LEFT JOIN contrato_cargos cc ON cc.id = v.contrato_cargo_id
      ${filters.whereClause}
      ORDER BY v.fecha_inicio DESC, nombre_completo ASC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `,
    listParams
  );

  const rows = result.rows.map((row) => ({
    vinculacion_id: row.id,
    persona_id: row.persona_id,
    numero_documento: row.numero_documento,
    nombre_completo: row.nombre_completo,
    empresa_nombre: row.empresa_nombre,
    contrato_nombre: row.contrato_nombre,
    cargo_nombre: row.cargo_nombre,
    estado: row.estado,
    fecha_inicio: toDateString(row.fecha_inicio),
    fecha_fin: toDateString(row.fecha_fin)
  }));

  return {
    title: 'Reporte Vinculaciones Historicas',
    fileName: 'reporte-vinculaciones-historicas',
    sheetName: 'Vinculaciones',
    columns: [
      { key: 'vinculacion_id', header: 'Vinculacion ID' },
      { key: 'persona_id', header: 'Persona ID' },
      { key: 'numero_documento', header: 'Numero Documento' },
      { key: 'nombre_completo', header: 'Nombre Completo' },
      { key: 'empresa_nombre', header: 'Empresa' },
      { key: 'contrato_nombre', header: 'Contrato' },
      { key: 'cargo_nombre', header: 'Cargo' },
      { key: 'estado', header: 'Estado' },
      { key: 'fecha_inicio', header: 'Fecha Inicio' },
      { key: 'fecha_fin', header: 'Fecha Fin' }
    ],
    rows,
    data: {
      items: rows,
      pagination: buildPagination(query, total)
    }
  };
};

export const getChecklistDocumentalReport = async (
  vinculacionId: string
): Promise<ReportPayload<Awaited<ReturnType<typeof getVinculacionChecklist>>>> => {
  const checklist = await getVinculacionChecklist(vinculacionId);
  const rows = checklist.requisitos.map((item) => ({
    requisito_id: item.requisito_id,
    origen: item.origen,
    nombre_requisito: item.nombre_requisito,
    tipo_requisito: item.tipo_requisito,
    obligatorio: item.obligatorio,
    tipo_documento_id: item.tipo_documento_id,
    tipo_documento_nombre: item.tipo_documento_nombre,
    codigo: item.codigo,
    documento_id: item.documento_id,
    fuente_documento: item.fuente_documento,
    estado: item.estado,
    fecha_vencimiento: item.fecha_vencimiento,
    observacion: item.observacion
  }));

  return {
    title: 'Reporte Checklist Documental',
    fileName: `reporte-checklist-vinculacion-${vinculacionId}`,
    sheetName: 'Checklist',
    columns: [
      { key: 'requisito_id', header: 'Requisito ID' },
      { key: 'origen', header: 'Origen' },
      { key: 'nombre_requisito', header: 'Nombre Requisito' },
      { key: 'tipo_requisito', header: 'Tipo Requisito' },
      { key: 'obligatorio', header: 'Obligatorio' },
      { key: 'tipo_documento_id', header: 'Tipo Documento ID' },
      { key: 'tipo_documento_nombre', header: 'Tipo Documento' },
      { key: 'codigo', header: 'Codigo' },
      { key: 'documento_id', header: 'Documento ID' },
      { key: 'fuente_documento', header: 'Fuente Documento' },
      { key: 'estado', header: 'Estado' },
      { key: 'fecha_vencimiento', header: 'Fecha Vencimiento' },
      { key: 'observacion', header: 'Observacion' }
    ],
    rows,
    data: checklist
  };
};

const buildDocumentosReport = async (
  query: CommonReportQuery,
  mode: 'vencidos' | 'por-vencer'
): Promise<ReportPayload<{ items: Array<Record<string, unknown>>; pagination: ReturnType<typeof buildPagination> }>> => {
  const today = new Date().toISOString().slice(0, 10);
  const next30Days = new Date();
  next30Days.setUTCDate(next30Days.getUTCDate() + 30);
  const next30DaysString = next30Days.toISOString().slice(0, 10);

  const operatorClause =
    mode === 'vencidos'
      ? `fecha_vencimiento < '${today}'`
      : `fecha_vencimiento >= '${today}' AND fecha_vencimiento <= '${next30DaysString}'`;

  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM (
        SELECT dp.id
        FROM documentos_persona dp
        WHERE dp.activo = TRUE
          AND dp.fecha_vencimiento IS NOT NULL
          AND ${operatorClause}

        UNION ALL

        SELECT dv.id
        FROM documentos_vinculacion dv
        WHERE dv.activo = TRUE
          AND dv.fecha_vencimiento IS NOT NULL
          AND ${operatorClause}
      ) docs
    `
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (query.page - 1) * query.limit;
  const result = await dbQuery<DocumentoReporteRow>(
    `
      SELECT *
      FROM (
        SELECT
          dp.id::text AS id,
          'PERSONA'::text AS alcance,
          NULL::text AS vinculacion_id,
          NULL::text AS contrato_id,
          p.numero_documento,
          CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS nombre_completo,
          td.nombre AS tipo_documento_nombre,
          dp.nombre_original,
          dp.fecha_vencimiento
        FROM documentos_persona dp
        INNER JOIN personas p ON p.id = dp.persona_id
        INNER JOIN tipos_documentos td ON td.id = dp.tipo_documento_id
        WHERE dp.activo = TRUE
          AND dp.fecha_vencimiento IS NOT NULL
          AND ${operatorClause}

        UNION ALL

        SELECT
          dv.id::text AS id,
          'VINCULACION'::text AS alcance,
          dv.vinculacion_id::text AS vinculacion_id,
          v.contrato_id::text AS contrato_id,
          p.numero_documento,
          CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS nombre_completo,
          td.nombre AS tipo_documento_nombre,
          dv.nombre_original,
          dv.fecha_vencimiento
        FROM documentos_vinculacion dv
        INNER JOIN vinculaciones v ON v.id = dv.vinculacion_id
        INNER JOIN personas p ON p.id = v.persona_id
        INNER JOIN tipos_documentos td ON td.id = dv.tipo_documento_id
        WHERE dv.activo = TRUE
          AND dv.fecha_vencimiento IS NOT NULL
          AND ${operatorClause}
      ) docs
      ORDER BY fecha_vencimiento ASC
      LIMIT $1
      OFFSET $2
    `,
    [query.limit, offset]
  );

  const rows = result.rows.map((row) => ({
    documento_id: row.id,
    alcance: row.alcance,
    vinculacion_id: row.vinculacion_id,
    contrato_id: row.contrato_id,
    numero_documento: row.numero_documento,
    nombre_completo: row.nombre_completo,
    tipo_documento_nombre: row.tipo_documento_nombre,
    nombre_original: row.nombre_original,
    fecha_vencimiento: toDateString(row.fecha_vencimiento)
  }));

  return {
    title: mode === 'vencidos' ? 'Reporte Documentos Vencidos' : 'Reporte Documentos Por Vencer',
    fileName:
      mode === 'vencidos' ? 'reporte-documentos-vencidos' : 'reporte-documentos-por-vencer',
    sheetName: mode === 'vencidos' ? 'Documentos Vencidos' : 'Documentos Por Vencer',
    columns: [
      { key: 'documento_id', header: 'Documento ID' },
      { key: 'alcance', header: 'Alcance' },
      { key: 'vinculacion_id', header: 'Vinculacion ID' },
      { key: 'contrato_id', header: 'Contrato ID' },
      { key: 'numero_documento', header: 'Numero Documento' },
      { key: 'nombre_completo', header: 'Nombre Completo' },
      { key: 'tipo_documento_nombre', header: 'Tipo Documento' },
      { key: 'nombre_original', header: 'Nombre Archivo' },
      { key: 'fecha_vencimiento', header: 'Fecha Vencimiento' }
    ],
    rows,
    data: {
      items: rows,
      pagination: buildPagination(query, total)
    }
  };
};

export const getDocumentosVencidosReport = async (
  query: CommonReportQuery
): Promise<ReportPayload<{ items: Array<Record<string, unknown>>; pagination: ReturnType<typeof buildPagination> }>> => {
  return buildDocumentosReport(query, 'vencidos');
};

export const getDocumentosPorVencerReport = async (
  query: CommonReportQuery
): Promise<ReportPayload<{ items: Array<Record<string, unknown>>; pagination: ReturnType<typeof buildPagination> }>> => {
  return buildDocumentosReport(query, 'por-vencer');
};

export const getCoberturaContratoReport = async (
  contratoId: string
): Promise<ReportPayload<Awaited<ReturnType<typeof getCoberturaContratoDetalle>>>> => {
  const data = await getCoberturaContratoDetalle(contratoId);
  const rows = data.items.map((item) => ({
    sede_modalidad_id: item.id,
    contrato_nombre: item.contrato_nombre,
    sede_nombre: item.sede_nombre,
    modalidad_original: item.modalidad_original,
    modalidad_base: item.modalidad_base,
    cupos: item.cupos,
    manipuladores_requeridos: item.manipuladores_requeridos,
    asignados_cobertura: item.asignados_cobertura,
    estado_cobertura: item.estado_cobertura
  }));

  return {
    title: 'Reporte Cobertura por Contrato',
    fileName: `reporte-cobertura-contrato-${contratoId}`,
    sheetName: 'Cobertura Contrato',
    columns: [
      { key: 'sede_modalidad_id', header: 'ID' },
      { key: 'contrato_nombre', header: 'Contrato' },
      { key: 'sede_nombre', header: 'Sede' },
      { key: 'modalidad_original', header: 'Modalidad Original' },
      { key: 'modalidad_base', header: 'Modalidad Base' },
      { key: 'cupos', header: 'Cupos' },
      { key: 'manipuladores_requeridos', header: 'Requeridos' },
      { key: 'asignados_cobertura', header: 'Asignados' },
      { key: 'estado_cobertura', header: 'Estado Cobertura' }
    ],
    rows,
    data
  };
};

export const getCoberturaFaltantesReport = async (
  query: CommonReportQuery
): Promise<ReportPayload<Awaited<ReturnType<typeof getCoberturaFaltantes>>>> => {
  const data = await getCoberturaFaltantes({
    contrato_id: query.contrato_id ?? undefined,
    municipio_id: query.municipio_id ?? undefined,
    page: query.page,
    limit: query.limit
  });

  const rows = data.items.map((item) => ({
    id: item.id,
    contrato_nombre: item.contrato_nombre,
    sede_nombre: item.sede_nombre,
    modalidad_original: item.modalidad_original,
    manipuladores_requeridos: item.manipuladores_requeridos,
    asignados_cobertura: item.asignados_cobertura,
    estado_cobertura: item.estado_cobertura
  }));

  return {
    title: 'Reporte Faltantes de Cobertura',
    fileName: 'reporte-cobertura-faltantes',
    sheetName: 'Faltantes Cobertura',
    columns: [
      { key: 'id', header: 'ID' },
      { key: 'contrato_nombre', header: 'Contrato' },
      { key: 'sede_nombre', header: 'Sede' },
      { key: 'modalidad_original', header: 'Modalidad' },
      { key: 'manipuladores_requeridos', header: 'Requeridos' },
      { key: 'asignados_cobertura', header: 'Asignados' },
      { key: 'estado_cobertura', header: 'Estado' }
    ],
    rows,
    data
  };
};

export const getCoberturaSobrecoberturaReport = async (
  query: CommonReportQuery
): Promise<ReportPayload<Awaited<ReturnType<typeof getCoberturaSobrecobertura>>>> => {
  const data = await getCoberturaSobrecobertura({
    contrato_id: query.contrato_id ?? undefined,
    municipio_id: query.municipio_id ?? undefined,
    page: query.page,
    limit: query.limit
  });

  const rows = data.items.map((item) => ({
    id: item.id,
    contrato_nombre: item.contrato_nombre,
    sede_nombre: item.sede_nombre,
    modalidad_original: item.modalidad_original,
    manipuladores_requeridos: item.manipuladores_requeridos,
    asignados_cobertura: item.asignados_cobertura,
    estado_cobertura: item.estado_cobertura
  }));

  return {
    title: 'Reporte Sobrecobertura',
    fileName: 'reporte-sobrecobertura',
    sheetName: 'Sobrecobertura',
    columns: [
      { key: 'id', header: 'ID' },
      { key: 'contrato_nombre', header: 'Contrato' },
      { key: 'sede_nombre', header: 'Sede' },
      { key: 'modalidad_original', header: 'Modalidad' },
      { key: 'manipuladores_requeridos', header: 'Requeridos' },
      { key: 'asignados_cobertura', header: 'Asignados' },
      { key: 'estado_cobertura', header: 'Estado' }
    ],
    rows,
    data
  };
};

export const getNominaPeriodoReport = async (
  periodoId: string,
  query: CommonReportQuery
): Promise<ReportPayload<Awaited<ReturnType<typeof listNominaLiquidaciones>>>> => {
  const data = await listNominaLiquidaciones(periodoId, {
    page: query.page,
    limit: query.limit,
    contrato_id: query.contrato_id ?? undefined,
    empresa_id: query.empresa_id ?? undefined
  });

  const rows = data.items.map((item) => ({
    vinculacion_id: item.vinculacion_id,
    persona_nombre_snapshot: item.persona_nombre_snapshot,
    contrato_nombre_snapshot: item.contrato_nombre_snapshot,
    salario_base_snapshot: item.salario_base_snapshot,
    dias_liquidados: item.dias_liquidados,
    total_devengado: item.total_devengado,
    total_deducciones: item.total_deducciones,
    neto_pagar: item.neto_pagar,
    estado: item.estado
  }));

  return {
    title: 'Reporte Nomina por Periodo',
    fileName: `reporte-nomina-periodo-${periodoId}`,
    sheetName: 'Nomina Periodo',
    columns: [
      { key: 'vinculacion_id', header: 'Vinculacion ID' },
      { key: 'persona_nombre_snapshot', header: 'Persona' },
      { key: 'contrato_nombre_snapshot', header: 'Contrato' },
      { key: 'salario_base_snapshot', header: 'Salario Base' },
      { key: 'dias_liquidados', header: 'Dias Liquidados' },
      { key: 'total_devengado', header: 'Total Devengado' },
      { key: 'total_deducciones', header: 'Total Deducciones' },
      { key: 'neto_pagar', header: 'Neto Pagar' },
      { key: 'estado', header: 'Estado' }
    ],
    rows,
    data
  };
};

export const getNominaNovedadesReport = async (
  periodoId: string,
  query: CommonReportQuery
): Promise<ReportPayload<{ items: Array<Record<string, unknown>>; pagination: ReturnType<typeof buildPagination> }>> => {
  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM nomina_novedades
      WHERE periodo_id::text = $1
    `,
    [periodoId]
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (query.page - 1) * query.limit;
  const result = await dbQuery<NominaNovedadReporteRow>(
    `
      SELECT
        nn.id::text AS id,
        nn.periodo_id::text AS periodo_id,
        nn.vinculacion_id::text AS vinculacion_id,
        ne.persona_nombre_snapshot,
        nn.tipo,
        nn.afecta,
        nn.concepto,
        nn.descripcion,
        nn.valor,
        nn.activo,
        nn.created_at
      FROM nomina_novedades nn
      LEFT JOIN nomina_empleados ne
        ON ne.periodo_id = nn.periodo_id
       AND ne.vinculacion_id = nn.vinculacion_id
      WHERE nn.periodo_id::text = $1
      ORDER BY nn.created_at DESC
      LIMIT $2
      OFFSET $3
    `,
    [periodoId, query.limit, offset]
  );

  const rows = result.rows.map((row) => ({
    novedad_id: row.id,
    periodo_id: row.periodo_id,
    vinculacion_id: row.vinculacion_id,
    persona_nombre_snapshot: row.persona_nombre_snapshot,
    tipo: row.tipo,
    afecta: row.afecta,
    concepto: row.concepto,
    descripcion: row.descripcion,
    valor: row.valor,
    activo: row.activo,
    created_at: row.created_at.toISOString()
  }));

  return {
    title: 'Reporte Novedades Nomina',
    fileName: `reporte-nomina-novedades-${periodoId}`,
    sheetName: 'Novedades Nomina',
    columns: [
      { key: 'novedad_id', header: 'Novedad ID' },
      { key: 'periodo_id', header: 'Periodo ID' },
      { key: 'vinculacion_id', header: 'Vinculacion ID' },
      { key: 'persona_nombre_snapshot', header: 'Persona' },
      { key: 'tipo', header: 'Tipo' },
      { key: 'afecta', header: 'Afecta' },
      { key: 'concepto', header: 'Concepto' },
      { key: 'descripcion', header: 'Descripcion' },
      { key: 'valor', header: 'Valor' },
      { key: 'activo', header: 'Activo' }
    ],
    rows,
    data: {
      items: rows,
      pagination: buildPagination(query, total)
    }
  };
};

export const getNominaDesprendiblesReport = async (
  periodoId: string
): Promise<ReportPayload<Awaited<ReturnType<typeof listNominaDesprendibles>>>> => {
  const data = await listNominaDesprendibles(periodoId);
  const rows = data.map((item) => ({
    desprendible_id: item.id,
    liquidacion_id: item.liquidacion_id,
    vinculacion_id: item.vinculacion_id,
    persona_id: item.persona_id,
    salario_base_snapshot: item.salario_base_snapshot,
    dias_liquidados: item.dias_liquidados,
    total_devengado: item.total_devengado,
    total_deducciones: item.total_deducciones,
    neto_pagar: item.neto_pagar,
    estado: item.estado
  }));

  return {
    title: 'Reporte Desprendibles de Pago',
    fileName: `reporte-desprendibles-${periodoId}`,
    sheetName: 'Desprendibles',
    columns: [
      { key: 'desprendible_id', header: 'Desprendible ID' },
      { key: 'liquidacion_id', header: 'Liquidacion ID' },
      { key: 'vinculacion_id', header: 'Vinculacion ID' },
      { key: 'persona_id', header: 'Persona ID' },
      { key: 'salario_base_snapshot', header: 'Salario Base' },
      { key: 'dias_liquidados', header: 'Dias Liquidados' },
      { key: 'total_devengado', header: 'Total Devengado' },
      { key: 'total_deducciones', header: 'Total Deducciones' },
      { key: 'neto_pagar', header: 'Neto Pagar' },
      { key: 'estado', header: 'Estado' }
    ],
    rows,
    data
  };
};

export const getSstEventosReport = async (
  query: CommonReportQuery
): Promise<ReportPayload<Awaited<ReturnType<typeof listSstEventos>>>> => {
  const data = await listSstEventos({
    page: query.page,
    limit: query.limit,
    empresa_id: query.empresa_id ?? undefined,
    contrato_id: query.contrato_id ?? undefined,
    fecha_desde: query.fecha_desde ?? undefined,
    fecha_hasta: query.fecha_hasta ?? undefined,
    estado: query.estado ? (query.estado as never) : undefined
  });

  const rows = data.items.map((item) => ({
    id: item.id,
    tipo_evento: item.tipo_evento,
    estado: item.estado,
    empresa_id: item.empresa_id,
    contrato_id: item.contrato_id,
    vinculacion_id: item.vinculacion_id,
    fecha_evento: item.fecha_evento,
    fecha_cierre: item.fecha_cierre,
    titulo: item.titulo,
    descripcion: item.descripcion,
    activo: item.activo
  }));

  return {
    title: 'Reporte Eventos SST',
    fileName: 'reporte-sst-eventos',
    sheetName: 'Eventos SST',
    columns: [
      { key: 'id', header: 'ID' },
      { key: 'tipo_evento', header: 'Tipo Evento' },
      { key: 'estado', header: 'Estado' },
      { key: 'empresa_id', header: 'Empresa ID' },
      { key: 'contrato_id', header: 'Contrato ID' },
      { key: 'vinculacion_id', header: 'Vinculacion ID' },
      { key: 'fecha_evento', header: 'Fecha Evento' },
      { key: 'fecha_cierre', header: 'Fecha Cierre' },
      { key: 'titulo', header: 'Titulo' },
      { key: 'descripcion', header: 'Descripcion' },
      { key: 'activo', header: 'Activo' }
    ],
    rows,
    data
  };
};

export const getSstPlanesAccionReport = async (
  query: CommonReportQuery
): Promise<ReportPayload<Awaited<ReturnType<typeof listSstPlanesAccion>>>> => {
  const data = await listSstPlanesAccion({
    page: query.page,
    limit: query.limit,
    estado: query.estado ? (query.estado as never) : undefined
  });

  const rows = data.items.map((item) => ({
    id: item.id,
    evento_id: item.evento_id,
    responsable: item.responsable,
    responsable_id: item.responsable_id,
    estado: item.estado,
    fecha_compromiso: item.fecha_compromiso,
    fecha_cierre: item.fecha_cierre,
    observaciones: item.observaciones,
    activo: item.activo
  }));

  return {
    title: 'Reporte Planes de Accion SST',
    fileName: 'reporte-sst-planes-accion',
    sheetName: 'Planes SST',
    columns: [
      { key: 'id', header: 'ID' },
      { key: 'evento_id', header: 'Evento ID' },
      { key: 'responsable', header: 'Responsable' },
      { key: 'responsable_id', header: 'Responsable ID' },
      { key: 'estado', header: 'Estado' },
      { key: 'fecha_compromiso', header: 'Fecha Compromiso' },
      { key: 'fecha_cierre', header: 'Fecha Cierre' },
      { key: 'observaciones', header: 'Observaciones' },
      { key: 'activo', header: 'Activo' }
    ],
    rows,
    data
  };
};

export const getAuditoriaReport = async (
  query: CommonReportQuery
): Promise<ReportPayload<Awaited<ReturnType<typeof listAuditoria>>>> => {
  const data = await listAuditoria({
    page: query.page,
    limit: query.limit,
    fecha_desde: query.fecha_desde ?? undefined,
    fecha_hasta: query.fecha_hasta ?? undefined
  });

  const rows = data.items.map((item) => ({
    id: item.id,
    tabla: item.tabla,
    registro_id: item.registro_id,
    accion: item.accion,
    descripcion: item.descripcion,
    usuario_id: item.usuario.id,
    usuario_email: item.usuario.email,
    ip: item.ip,
    created_at: item.created_at
  }));

  return {
    title: 'Reporte Auditoria',
    fileName: 'reporte-auditoria',
    sheetName: 'Auditoria',
    columns: [
      { key: 'id', header: 'ID' },
      { key: 'tabla', header: 'Tabla' },
      { key: 'registro_id', header: 'Registro ID' },
      { key: 'accion', header: 'Accion' },
      { key: 'descripcion', header: 'Descripcion' },
      { key: 'usuario_id', header: 'Usuario ID' },
      { key: 'usuario_email', header: 'Usuario Email' },
      { key: 'ip', header: 'IP' },
      { key: 'created_at', header: 'Fecha' }
    ],
    rows,
    data
  };
};
