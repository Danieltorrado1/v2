import type { QueryResultRow } from 'pg';

import { dbQuery } from '../../config/db';
import { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { getVinculacionChecklist } from '../documentos/documentos.service';

interface CountRow extends QueryResultRow {
  total: number;
}

interface ContractRow extends QueryResultRow {
  fecha_finalizacion: Date | string | null;
  id: string;
  empresa_id: string | null;
}

interface VinculacionRow extends QueryResultRow {
  estado: string;
  empresa_id: string | null;
  id: string;
  persona_id: string;
}

interface AlertCountRow extends QueryResultRow {
  total: number;
}

export interface DashboardSaasResult {
  alertas: {
    activas: number;
    criticas: number;
    altas: number;
  };
  contratos: {
    activos: number;
    total: number;
  };
  documentos: {
    faltantes: number;
    por_vencer: number;
    vencidos: number;
  };
  empresas: {
    total: number;
  };
  expedientes: {
    completos: number;
    cumplimiento_promedio: number;
    incompletos: number;
  };
  personas: {
    total: number;
  };
  vinculaciones: {
    activas: number;
    retiradas: number;
  };
}

const buildTenantWhereClause = (
  tenant: TenantAccessContext,
  options: {
    contratoColumn: string;
    empresaColumn: string;
  }
): { params: unknown[]; sql: string } => {
  if (tenant.isGlobalAdmin) {
    return { params: [], sql: '' };
  }

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (tenant.contratoIds.length > 0) {
    params.push(tenant.contratoIds);
    conditions.push(`${options.contratoColumn} = ANY($${params.length}::bigint[])`);
  }

  if (tenant.empresaIds.length > 0) {
    params.push(tenant.empresaIds);
    conditions.push(`${options.empresaColumn} = ANY($${params.length}::bigint[])`);
  }

  if (conditions.length === 0) {
    return { params: [], sql: 'WHERE 1 = 0' };
  }

  return {
    params,
    sql: `WHERE (${conditions.join(' OR ')})`
  };
};

const countAccessibleContracts = async (tenant: TenantAccessContext): Promise<{ activos: number; total: number }> => {
  const { params, sql } = buildTenantWhereClause(tenant, {
    contratoColumn: 'c.id',
    empresaColumn: 'c.empresa_id'
  });

  const result = await dbQuery<CountRow & { activos: number }>(
    `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE c.fecha_finalizacion IS NULL
            OR c.fecha_finalizacion >= CURRENT_DATE
        )::int AS activos
      FROM contratos c
      ${sql}
    `,
    params
  );

  const row = result.rows[0];

  return {
    total: row?.total ?? 0,
    activos: row?.activos ?? 0
  };
};

const countAccessibleCompanies = async (tenant: TenantAccessContext): Promise<number> => {
  if (tenant.isGlobalAdmin) {
    const result = await dbQuery<CountRow>(`SELECT COUNT(*)::int AS total FROM empresas`);
    return result.rows[0]?.total ?? 0;
  }

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (tenant.empresaIds.length > 0) {
    params.push(tenant.empresaIds);
    conditions.push(`e.id = ANY($${params.length}::bigint[])`);
  }

  if (tenant.contratoIds.length > 0) {
    params.push(tenant.contratoIds);
    conditions.push(`e.id IN (SELECT c.empresa_id FROM contratos c WHERE c.id = ANY($${params.length}::bigint[]))`);
  }

  if (conditions.length === 0) {
    return 0;
  }

  const result = await dbQuery<CountRow>(
    `
      SELECT COUNT(DISTINCT e.id)::int AS total
      FROM empresas e
      WHERE (${conditions.join(' OR ')})
    `,
    params
  );

  return result.rows[0]?.total ?? 0;
};

const loadAccessibleVinculaciones = async (tenant: TenantAccessContext): Promise<VinculacionRow[]> => {
  const { params, sql } = buildTenantWhereClause(tenant, {
    contratoColumn: 'v.contrato_id',
    empresaColumn: 'c.empresa_id'
  });

  const result = await dbQuery<VinculacionRow>(
    `
      SELECT
        v.id::text AS id,
        v.persona_id::text AS persona_id,
        v.contrato_id::text AS contrato_id,
        c.empresa_id::text AS empresa_id,
        v.estado_vinculacion AS estado
      FROM vinculaciones v
      INNER JOIN contratos c ON c.id = v.contrato_id
      ${sql}
      ORDER BY v.id ASC
    `,
    params
  );

  return result.rows;
};

const countAlertas = async (
  tenant: TenantAccessContext,
  severidad?: 'CRITICA' | 'ALTA'
): Promise<number> => {
  const { params, sql } = buildTenantWhereClause(tenant, {
    contratoColumn: 'ad.contrato_id',
    empresaColumn: 'ad.empresa_id'
  });

  const conditions = [`ad.activo = TRUE`, `ad.estado = 'ACTIVA'`];

  if (severidad) {
    conditions.push(`ad.severidad = '${severidad}'`);
  }

  const whereSql = sql ? `${sql} AND ${conditions.join(' AND ')}` : `WHERE ${conditions.join(' AND ')}`;

  const result = await dbQuery<AlertCountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM alertas_documentales ad
      ${whereSql}
    `,
    params
  );

  return result.rows[0]?.total ?? 0;
};

const computeChecklistMetrics = async (
  vinculaciones: VinculacionRow[],
  tenant: TenantAccessContext
): Promise<{
  documentos: { faltantes: number; por_vencer: number; vencidos: number };
  expedientes: { completos: number; cumplimiento_promedio: number; incompletos: number };
}> => {
  const today = new Date().toISOString().slice(0, 10);
  const next30Days = new Date();
  next30Days.setUTCDate(next30Days.getUTCDate() + 30);
  const next30Iso = next30Days.toISOString().slice(0, 10);

  let faltantes = 0;
  let vencidos = 0;
  let porVencer = 0;
  let completos = 0;
  let incompletos = 0;
  let cumplimientoTotal = 0;

  for (const vinculacion of vinculaciones) {
    const checklist = await getVinculacionChecklist(vinculacion.id, tenant, { audit: false });

    for (const requisito of checklist.requisitos) {
      if (requisito.estado === 'FALTANTE') {
        faltantes += 1;
      } else if (requisito.estado === 'VENCIDO') {
        vencidos += 1;
      } else if (
        requisito.estado === 'CARGADO' &&
        requisito.fecha_vencimiento !== null &&
        requisito.fecha_vencimiento >= today &&
        requisito.fecha_vencimiento <= next30Iso
      ) {
        porVencer += 1;
      }
    }

    if (checklist.cumplimiento_porcentaje >= 100) {
      completos += 1;
    } else {
      incompletos += 1;
    }

    cumplimientoTotal += checklist.cumplimiento_porcentaje;
  }

  return {
    documentos: {
      faltantes,
      por_vencer: porVencer,
      vencidos
    },
    expedientes: {
      completos,
      incompletos,
      cumplimiento_promedio: vinculaciones.length === 0 ? 0 : Number((cumplimientoTotal / vinculaciones.length).toFixed(2))
    }
  };
};

export const getDashboardSaas = async (tenant: TenantAccessContext): Promise<DashboardSaasResult> => {
  const [companiesTotal, contracts, vinculaciones, alertasActivas, alertasCriticas, alertasAltas] =
    await Promise.all([
      countAccessibleCompanies(tenant),
      countAccessibleContracts(tenant),
      loadAccessibleVinculaciones(tenant),
      countAlertas(tenant),
      countAlertas(tenant, 'CRITICA'),
      countAlertas(tenant, 'ALTA')
    ]);

  const checklistMetrics = await computeChecklistMetrics(vinculaciones, tenant);

  const personasTotal = vinculaciones.length > 0 ? new Set(vinculaciones.map((item) => item.persona_id)).size : 0;

  const vinculacionesActivas = vinculaciones.filter((item) => item.estado === 'ACTIVA').length;
  const vinculacionesRetiradas = vinculaciones.filter((item) => item.estado === 'RETIRADA').length;

  return {
    empresas: {
      total: companiesTotal
    },
    contratos: {
      total: contracts.total,
      activos: contracts.activos
    },
    personas: {
      total: personasTotal
    },
    vinculaciones: {
      activas: vinculacionesActivas,
      retiradas: vinculacionesRetiradas
    },
    documentos: checklistMetrics.documentos,
    expedientes: checklistMetrics.expedientes,
    alertas: {
      activas: alertasActivas,
      criticas: alertasCriticas,
      altas: alertasAltas
    }
  };
};
