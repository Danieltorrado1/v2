import type { QueryResultRow } from 'pg';

import { dbQuery } from '../../config/db';
import { buildTenantWhereClause, type TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import {
  OPS_METODOS_PAGO,
  type ListOpsVinculacionesQuery,
  type VinculacionEstado
} from './vinculaciones.schemas';

interface CountRow extends QueryResultRow {
  total: number;
}

interface OpsVinculacionRow extends QueryResultRow {
  cargo_nombre: string | null;
  contrato_cargo_id: string;
  contrato_empresa_id: string;
  contrato_id: string;
  contrato_numero: string;
  documentos_persona_total: number;
  documentos_persona_vencidos: number;
  documentos_vinculacion_total: number;
  documentos_vinculacion_vencidos: number;
  empresa_id: string;
  empresa_nombre: string;
  entidad_contratante: string | null;
  estado_vinculacion: string | null;
  fecha_fin: Date | string | null;
  fecha_inicio: Date | string;
  metodo_pago: string;
  objeto_contractual: string | null;
  persona_id: string;
  persona_nombre: string;
  persona_numero_documento: string;
  tipo_vinculacion_codigo: string;
  tipo_vinculacion_id: string;
  tipo_vinculacion_nombre: string;
  ultima_cuenta_documento_id: string | null;
  ultima_cuenta_estado: string | null;
  ultima_cuenta_fecha_generacion: Date | string | null;
  ultima_cuenta_id: string | null;
  ultima_cuenta_numero: string | null;
  ultima_cuenta_valor_neto: string | number | null;
  vinculacion_id: string;
}

interface EmpresaCatalogoRow extends QueryResultRow {
  id: string;
  nombre_empresa: string;
}

interface ContratoCatalogoRow extends QueryResultRow {
  empresa_id: string;
  entidad_contratante: string;
  fecha_finalizacion: Date | string;
  fecha_inicio: Date | string;
  id: string;
  numero_contrato: string;
}

interface CargoCatalogoRow extends QueryResultRow {
  activo: boolean;
  contrato_id: string;
  id: string;
  nombre_cargo: string;
}

interface TipoVinculacionCatalogoRow extends QueryResultRow {
  codigo: string;
  id: string;
  nombre_vinculacion: string;
}

interface TipoDocumentoRow extends QueryResultRow {
  codigo: string;
  id: string;
  nombre_documento: string;
}

export interface OpsVinculacionListItem {
  cargo: {
    id: number;
    nombre_cargo: string | null;
  };
  contrato: {
    entidad_contratante: string | null;
    id: number;
    numero_contrato: string;
    objeto_contractual: string | null;
  };
  empresa: {
    id: number;
    nombre_empresa: string;
  };
  fechas: {
    fecha_fin: string | null;
    fecha_inicio: string;
  };
  metodo_pago: typeof OPS_METODOS_PAGO[number];
  persona: {
    id: number;
    nombre_completo: string;
    numero_documento: string;
  };
  resumen_documental: {
    documentos_persona_total: number;
    documentos_persona_vencidos: number;
    documentos_vinculacion_total: number;
    documentos_vinculacion_vencidos: number;
  };
  tipo_vinculacion: {
    codigo: string;
    id: number;
    nombre_vinculacion: string;
  };
  ultima_cuenta_cobro: {
    documento_id: number | null;
    estado: string | null;
    fecha_generacion: string | null;
    id: number | null;
    numero_cuenta: number | null;
    valor_neto: number | null;
  } | null;
  vinculacion: {
    contrato_cargo_id: number;
    contrato_empresa_id: number;
    contrato_id: number;
    empresa_id: number;
    estado_vinculacion: VinculacionEstado;
    fecha_fin: string | null;
    fecha_inicio: string;
    id: number;
    metodo_pago: typeof OPS_METODOS_PAGO[number];
    persona_id: number;
    tipo_vinculacion_id: number;
  };
}

export interface PaginatedOpsVinculaciones {
  items: OpsVinculacionListItem[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface VinculacionesOpsCatalogos {
  cargos: Array<{
    activo: boolean;
    contrato_id: number;
    id: number;
    nombre_cargo: string;
  }>;
  contratos: Array<{
    empresa_id: number;
    entidad_contratante: string;
    fecha_finalizacion: string;
    fecha_inicio: string;
    id: number;
    numero_contrato: string;
  }>;
  empresas: Array<{
    id: number;
    nombre_empresa: string;
  }>;
  metodo_pago_ops: Array<{
    etiqueta: string;
    valor: typeof OPS_METODOS_PAGO[number];
  }>;
  tipo_documento_cuenta_cobro: {
    codigo: string;
    id: number;
    nombre_documento: string;
  } | null;
  tipos_vinculacion: Array<{
    codigo: string;
    id: number;
    nombre_vinculacion: string;
  }>;
}

const toNumber = (value: string | number): number => {
  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    throw new AppError('Invalid numeric value returned by database', 500, 'INVALID_NUMERIC_VALUE');
  }

  return parsed;
};

const toNullableNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toDateString = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value.slice(0, 10);
};

const normalizeEstado = (value: string | null): VinculacionEstado => {
  if (value === 'ACTIVA' || value === 'RETIRADA' || value === 'SUSPENDIDA') {
    return value;
  }

  if (value === 'ACTIVO') {
    return 'ACTIVA';
  }

  throw new AppError('Invalid estado_vinculacion value returned by database', 500, 'INVALID_VINCULACION_STATE', {
    value
  });
};

const mapOpsVinculacion = (row: OpsVinculacionRow): OpsVinculacionListItem => {
  const metodoPago = row.metodo_pago as typeof OPS_METODOS_PAGO[number];
  const fechaInicio = toDateString(row.fecha_inicio);

  if (!fechaInicio) {
    throw new AppError('Vinculacion fecha_inicio is required', 500, 'INVALID_VINCULACION_DATE');
  }

  return {
    persona: {
      id: toNumber(row.persona_id),
      nombre_completo: row.persona_nombre,
      numero_documento: row.persona_numero_documento
    },
    vinculacion: {
      id: toNumber(row.vinculacion_id),
      persona_id: toNumber(row.persona_id),
      empresa_id: toNumber(row.empresa_id),
      contrato_id: toNumber(row.contrato_id),
      contrato_empresa_id: toNumber(row.contrato_empresa_id),
      tipo_vinculacion_id: toNumber(row.tipo_vinculacion_id),
      contrato_cargo_id: toNumber(row.contrato_cargo_id),
      fecha_inicio: fechaInicio,
      fecha_fin: toDateString(row.fecha_fin),
      estado_vinculacion: normalizeEstado(row.estado_vinculacion),
      metodo_pago: metodoPago
    },
    empresa: {
      id: toNumber(row.empresa_id),
      nombre_empresa: row.empresa_nombre
    },
    contrato: {
      id: toNumber(row.contrato_id),
      numero_contrato: row.contrato_numero,
      entidad_contratante: row.entidad_contratante,
      objeto_contractual: row.objeto_contractual
    },
    cargo: {
      id: toNumber(row.contrato_cargo_id),
      nombre_cargo: row.cargo_nombre
    },
    tipo_vinculacion: {
      id: toNumber(row.tipo_vinculacion_id),
      codigo: row.tipo_vinculacion_codigo,
      nombre_vinculacion: row.tipo_vinculacion_nombre
    },
    metodo_pago: metodoPago,
    fechas: {
      fecha_inicio: fechaInicio,
      fecha_fin: toDateString(row.fecha_fin)
    },
    ultima_cuenta_cobro: row.ultima_cuenta_id
      ? {
          id: toNumber(row.ultima_cuenta_id),
          numero_cuenta: toNullableNumber(row.ultima_cuenta_numero),
          estado: row.ultima_cuenta_estado,
          valor_neto: toNullableNumber(row.ultima_cuenta_valor_neto),
          fecha_generacion: toDateString(row.ultima_cuenta_fecha_generacion),
          documento_id: toNullableNumber(row.ultima_cuenta_documento_id)
        }
      : null,
    resumen_documental: {
      documentos_persona_total: row.documentos_persona_total,
      documentos_persona_vencidos: row.documentos_persona_vencidos,
      documentos_vinculacion_total: row.documentos_vinculacion_total,
      documentos_vinculacion_vencidos: row.documentos_vinculacion_vencidos
    }
  };
};

const buildOpsWhere = (
  query: ListOpsVinculacionesQuery,
  tenant?: TenantAccessContext
): { params: unknown[]; whereClause: string } => {
  const params: unknown[] = [];
  const clauses: string[] = [];
  let paramIndex = 1;

  if (tenant && !tenant.isGlobalAdmin) {
    if (tenant.contratoIds.length === 0 && tenant.empresaIds.length === 0) {
      clauses.push('1 = 0');
    } else {
      const tenantClauses: string[] = [];

      if (tenant.contratoIds.length > 0) {
        params.push(tenant.contratoIds);
        tenantClauses.push(`v.contrato_id = ANY($${paramIndex}::bigint[])`);
        paramIndex += 1;
      }

      if (tenant.empresaIds.length > 0) {
        params.push(tenant.empresaIds);
        tenantClauses.push(`c.empresa_id = ANY($${paramIndex}::bigint[])`);
        paramIndex += 1;
      }

      clauses.push(`(${tenantClauses.join(' OR ')})`);
    }
  }

  clauses.push(`tv.codigo = 'OPS'`);

  if (query.metodo_pago) {
    params.push(query.metodo_pago);
    clauses.push(`v.metodo_pago = $${paramIndex}`);
    paramIndex += 1;
  } else {
    params.push([...OPS_METODOS_PAGO]);
    clauses.push(`v.metodo_pago = ANY($${paramIndex}::text[])`);
    paramIndex += 1;
  }

  if (query.empresa_id !== undefined && query.empresa_id !== null) {
    params.push(query.empresa_id);
    clauses.push(`c.empresa_id = $${paramIndex}::bigint`);
    paramIndex += 1;
  }

  if (query.contrato_id !== undefined && query.contrato_id !== null) {
    params.push(query.contrato_id);
    clauses.push(`v.contrato_id = $${paramIndex}::bigint`);
    paramIndex += 1;
  }

  if (query.tipo_vinculacion_id !== undefined && query.tipo_vinculacion_id !== null) {
    params.push(query.tipo_vinculacion_id);
    clauses.push(`v.tipo_vinculacion_id = $${paramIndex}::bigint`);
    paramIndex += 1;
  }

  if (query.contrato_cargo_id !== undefined && query.contrato_cargo_id !== null) {
    params.push(query.contrato_cargo_id);
    clauses.push(`v.contrato_cargo_id = $${paramIndex}::bigint`);
    paramIndex += 1;
  }

  if (query.estado_vinculacion) {
    if (query.estado_vinculacion === 'ACTIVA') {
      clauses.push(`v.estado_vinculacion IN ('ACTIVA', 'ACTIVO')`);
    } else {
      params.push(query.estado_vinculacion);
      clauses.push(`v.estado_vinculacion = $${paramIndex}`);
      paramIndex += 1;
    }
  }

  if (query.search) {
    params.push(`%${query.search}%`);
    clauses.push(`(
      CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) ILIKE $${paramIndex}
      OR p.numero_documento ILIKE $${paramIndex}
      OR c.numero_contrato ILIKE $${paramIndex}
      OR COALESCE(c.entidad_contratante, '') ILIKE $${paramIndex}
      OR COALESCE(cc.nombre_cargo, '') ILIKE $${paramIndex}
      OR COALESCE(c.objeto_contractual, '') ILIKE $${paramIndex}
    )`);
  }

  return {
    params,
    whereClause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  };
};

const getOpsBaseFrom = (): string => {
  return `
    FROM vinculaciones v
    INNER JOIN personas p ON p.id = v.persona_id
    INNER JOIN contratos c ON c.id = v.contrato_id
    INNER JOIN empresas e ON e.id = c.empresa_id
    INNER JOIN tipos_vinculacion tv ON tv.id = v.tipo_vinculacion_id
    LEFT JOIN contrato_cargos cc ON cc.id = v.contrato_cargo_id
  `;
};

export const listOpsVinculacionesEnriched = async (
  query: ListOpsVinculacionesQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedOpsVinculaciones> => {
  const { params, whereClause } = buildOpsWhere(query, tenant);
  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      ${getOpsBaseFrom()}
      ${whereClause}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (query.page - 1) * query.limit;
  const listParams = [...params, query.limit, offset];
  const result = await dbQuery<OpsVinculacionRow>(
    `
      SELECT
        v.id::text AS vinculacion_id,
        v.persona_id::text AS persona_id,
        v.empresa_id::text AS empresa_id,
        v.contrato_id::text AS contrato_id,
        c.empresa_id::text AS contrato_empresa_id,
        v.contrato_cargo_id::text AS contrato_cargo_id,
        v.tipo_vinculacion_id::text AS tipo_vinculacion_id,
        tv.codigo AS tipo_vinculacion_codigo,
        tv.nombre_vinculacion AS tipo_vinculacion_nombre,
        v.fecha_inicio,
        v.fecha_fin,
        v.estado_vinculacion,
        v.metodo_pago,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS persona_nombre,
        p.numero_documento AS persona_numero_documento,
        e.nombre_empresa AS empresa_nombre,
        c.numero_contrato AS contrato_numero,
        c.entidad_contratante,
        c.objeto_contractual,
        cc.nombre_cargo AS cargo_nombre,
        COALESCE(dp_summary.total, 0)::int AS documentos_persona_total,
        COALESCE(dp_summary.vencidos, 0)::int AS documentos_persona_vencidos,
        COALESCE(dv_summary.total, 0)::int AS documentos_vinculacion_total,
        COALESCE(dv_summary.vencidos, 0)::int AS documentos_vinculacion_vencidos,
        latest_cc.id::text AS ultima_cuenta_id,
        latest_cc.numero_cuenta::text AS ultima_cuenta_numero,
        latest_cc.estado AS ultima_cuenta_estado,
        latest_cc.valor_neto AS ultima_cuenta_valor_neto,
        latest_cc.fecha_generacion AS ultima_cuenta_fecha_generacion,
        latest_cc.documento_id::text AS ultima_cuenta_documento_id
      ${getOpsBaseFrom()}
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (
            WHERE dp.fecha_vencimiento IS NOT NULL
              AND dp.fecha_vencimiento < CURRENT_DATE
          ) AS vencidos
        FROM documentos_persona dp
        WHERE dp.persona_id = p.id
          AND dp.activo = TRUE
          AND COALESCE(dp.es_vigente, TRUE) = TRUE
      ) dp_summary ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (
            WHERE dv.fecha_vencimiento IS NOT NULL
              AND dv.fecha_vencimiento < CURRENT_DATE
          ) AS vencidos
        FROM documentos_vinculacion dv
        WHERE dv.vinculacion_id = v.id
          AND dv.activo = TRUE
      ) dv_summary ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          ncco.id,
          ncco.numero_cuenta,
          ncco.estado,
          ncco.valor_neto,
          ncco.fecha_generacion,
          ncco.documento_id
        FROM nomina_cuentas_cobro_ops ncco
        WHERE ncco.vinculacion_id = v.id
          AND COALESCE(ncco.activo, TRUE) = TRUE
        ORDER BY ncco.fecha_generacion DESC NULLS LAST, ncco.updated_at DESC, ncco.id DESC
        LIMIT 1
      ) latest_cc ON TRUE
      ${whereClause}
      ORDER BY v.fecha_inicio DESC, v.id DESC
      LIMIT $${listParams.length - 1}::int OFFSET $${listParams.length}::int
    `,
    listParams
  );

  return {
    items: result.rows.map(mapOpsVinculacion),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / query.limit)
    }
  };
};

const mapMethodLabel = (value: typeof OPS_METODOS_PAGO[number]): string => {
  switch (value) {
    case 'OPS_CUENTA_COBRO':
      return 'OPS Cuenta de Cobro';
    case 'OPS_VALOR_FIJO':
      return 'OPS Valor Fijo';
    case 'OPS_POR_PRODUCTO':
      return 'OPS por Producto';
  }
};

export const getVinculacionesOpsCatalogos = async (
  tenant?: TenantAccessContext
): Promise<VinculacionesOpsCatalogos> => {
  const contratoScope = tenant
    ? buildTenantWhereClause({
        contratoColumn: 'c.id',
        empresaColumn: 'c.empresa_id',
        tenant
      })
    : { params: [], sql: '' };
  const cargoScope = tenant
    ? buildTenantWhereClause({
        contratoColumn: 'cc.contrato_id',
        empresaColumn: 'c.empresa_id',
        tenant
      })
    : { params: [], sql: '' };

  const [empresasResult, contratosResult, cargosResult, tiposVinculacionResult, tipoDocumentoResult] =
    await Promise.all([
      dbQuery<EmpresaCatalogoRow>(
        `
          SELECT DISTINCT
            e.id::text AS id,
            e.nombre_empresa
          FROM contratos c
          INNER JOIN empresas e ON e.id = c.empresa_id
          ${contratoScope.sql}
          ORDER BY e.nombre_empresa ASC
        `,
        contratoScope.params
      ),
      dbQuery<ContratoCatalogoRow>(
        `
          SELECT
            c.id::text AS id,
            c.empresa_id::text AS empresa_id,
            c.numero_contrato,
            c.entidad_contratante,
            c.fecha_inicio,
            c.fecha_finalizacion
          FROM contratos c
          ${contratoScope.sql}
          ORDER BY c.numero_contrato ASC, c.id ASC
        `,
        contratoScope.params
      ),
      dbQuery<CargoCatalogoRow>(
        `
          SELECT
            cc.id::text AS id,
            cc.contrato_id::text AS contrato_id,
            cc.nombre_cargo,
            cc.activo
          FROM contrato_cargos cc
          INNER JOIN contratos c ON c.id = cc.contrato_id
          ${cargoScope.sql}
          ORDER BY cc.nombre_cargo ASC, cc.id ASC
        `,
        cargoScope.params
      ),
      dbQuery<TipoVinculacionCatalogoRow>(
        `
          SELECT
            id::text AS id,
            codigo,
            nombre_vinculacion
          FROM tipos_vinculacion
          WHERE codigo = 'OPS'
          ORDER BY nombre_vinculacion ASC, id ASC
        `
      ),
      dbQuery<TipoDocumentoRow>(
        `
          SELECT
            id::text AS id,
            codigo,
            nombre_documento
          FROM tipos_documentos
          WHERE codigo = 'CUENTA_COBRO_OPS'
          LIMIT 1
        `
      )
    ]);

  return {
    empresas: empresasResult.rows.map((row) => ({
      id: toNumber(row.id),
      nombre_empresa: row.nombre_empresa
    })),
    contratos: contratosResult.rows.map((row) => ({
      id: toNumber(row.id),
      empresa_id: toNumber(row.empresa_id),
      numero_contrato: row.numero_contrato,
      entidad_contratante: row.entidad_contratante,
      fecha_inicio: toDateString(row.fecha_inicio) ?? '',
      fecha_finalizacion: toDateString(row.fecha_finalizacion) ?? ''
    })),
    cargos: cargosResult.rows.map((row) => ({
      id: toNumber(row.id),
      contrato_id: toNumber(row.contrato_id),
      nombre_cargo: row.nombre_cargo,
      activo: row.activo
    })),
    tipos_vinculacion: tiposVinculacionResult.rows.map((row) => ({
      id: toNumber(row.id),
      codigo: row.codigo,
      nombre_vinculacion: row.nombre_vinculacion
    })),
    metodo_pago_ops: OPS_METODOS_PAGO.map((value) => ({
      valor: value,
      etiqueta: mapMethodLabel(value)
    })),
    tipo_documento_cuenta_cobro: tipoDocumentoResult.rows[0]
      ? {
          id: toNumber(tipoDocumentoResult.rows[0].id),
          codigo: tipoDocumentoResult.rows[0].codigo,
          nombre_documento: tipoDocumentoResult.rows[0].nombre_documento
        }
      : null
  };
};
