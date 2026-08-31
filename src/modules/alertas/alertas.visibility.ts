import type { PoolClient, QueryResultRow } from 'pg';

import { dbPool } from '../../config/db';
import { AUTH_USER_LOOKUP_QUERY } from '../../middlewares/authMiddleware';
import { loadTenantAccess, type TenantAccessContext } from '../../middlewares/tenantMiddleware';
import type { TipoAlerta } from './alertas.schemas';

const GESTOR_ROLE = 'GESTOR';
const TALENTO_HUMANO_ROLE = 'TALENTO_HUMANO';
const TODAY = new Date().toISOString().slice(0, 10);

interface AuthUserRow extends QueryResultRow {
  permissions: string[] | null;
  roles: string[] | null;
}

interface AlertReferenceRow extends QueryResultRow {
  contrato_id: string | null;
  id: string;
  persona_id: string | null;
  referencia_id: string | null;
  referencia_tabla: string | null;
  tipo_alerta: TipoAlerta;
  vinculacion_id: string | null;
}

interface ContractScopeRow extends QueryResultRow {
  contrato_id: string;
  empresa_id: string | null;
}

interface VinculacionScopeRow extends QueryResultRow {
  contrato_id: string;
  empresa_id: string | null;
  persona_id: string;
  vinculacion_id: string;
}

interface PeriodoScopeRow extends QueryResultRow {
  contrato_id: string;
  empresa_id: string | null;
  fecha_fin: string;
  fecha_inicio: string;
  periodo_id: string;
}

export interface NotificacionVisibilityRow {
  contrato_id: string | null;
  id: string;
  persona_id: string | null;
  referencia_id: string | null;
  referencia_tabla: string | null;
  tipo: string;
  vinculacion_id: string | null;
}

interface UserNotificationAccess {
  permissions: string[];
  roles: string[];
  tenant: TenantAccessContext;
  userId: string;
}

const hasAnyPermission = (permissions: string[], candidates: string[]): boolean =>
  candidates.some((candidate) => permissions.includes(candidate));

const hasAnyPermissionPrefix = (permissions: string[], prefixes: string[]): boolean =>
  permissions.some((permission) => prefixes.some((prefix) => permission.startsWith(prefix)));

const isScopedGestorAccess = (access: UserNotificationAccess): boolean =>
  access.roles.includes(GESTOR_ROLE) && !access.roles.includes(TALENTO_HUMANO_ROLE);

const isNominaOrCoberturaAlert = (tipo: string): boolean =>
  tipo === 'COBERTURA_INSUFICIENTE' ||
  tipo === 'SOBRECOBERTURA' ||
  tipo === 'FOCALIZACION_OFICIAL_POSTERIOR_A_AJUSTE_MANUAL' ||
  tipo === 'NOMINA_PENDIENTE' ||
  tipo === 'NOMINA_PERIODO_ABIERTO';

const hasTenantContractAccess = (
  tenant: TenantAccessContext,
  contratoId: string | null,
  empresaId: string | null
): boolean => {
  if (tenant.isGlobalAdmin) {
    return true;
  }

  if (!contratoId) {
    return false;
  }

  const numericContratoId = Number(contratoId);
  if (tenant.contratoIds.length > 0) {
    return tenant.contratoIds.includes(numericContratoId);
  }

  return empresaId !== null && tenant.empresaIds.includes(Number(empresaId));
};

const hasAlertModuleAccess = (tipo: string, permissions: string[]): boolean => {
  switch (tipo) {
    case 'DOCUMENTO_VENCIDO':
    case 'DOCUMENTO_POR_VENCER':
      return hasAnyPermissionPrefix(permissions, ['documentos.', 'contracts.documents.']);
    case 'CONTRATO_POR_VENCER':
    case 'VINCULACION_POR_VENCER':
      return hasAnyPermission(permissions, ['vinculaciones.read', 'contratos.read', 'contracts.read']);
    case 'COBERTURA_INSUFICIENTE':
    case 'SOBRECOBERTURA':
    case 'FOCALIZACION_OFICIAL_POSTERIOR_A_AJUSTE_MANUAL':
      return hasAnyPermission(permissions, ['nomina.operativa.read', 'nomina.read', 'cobertura.read', 'cobertura.update']);
    case 'NOMINA_PENDIENTE':
    case 'NOMINA_PERIODO_ABIERTO':
      return hasAnyPermission(permissions, ['nomina.operativa.read', 'nomina.read']);
    case 'PLAN_SST_VENCIDO':
    case 'PLAN_SST_POR_VENCER':
      return hasAnyPermissionPrefix(permissions, ['sst.']);
    default:
      return true;
  }
};

const loadUserNotificationAccess = async (
  client: PoolClient,
  userId: string
): Promise<UserNotificationAccess> => {
  const userResult = await client.query<AuthUserRow>(AUTH_USER_LOOKUP_QUERY, [userId]);
  const currentUser = userResult.rows[0];
  const tenant = await loadTenantAccess(userId, client);

  return {
    userId,
    tenant,
    roles: currentUser?.roles ?? [],
    permissions: currentUser?.permissions ?? []
  };
};

const hasGestorVinculacionScope = async (
  client: PoolClient,
  userId: string,
  vinculacionId: string,
  contratoId: string,
  fechaInicio: string,
  fechaFin: string
): Promise<boolean> => {
  const result = await client.query<{ allowed: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM gestor_personal_asignaciones gpa_scope
      WHERE gpa_scope.vinculacion_id = $2::bigint
        AND gpa_scope.contrato_id = $3::bigint
        AND gpa_scope.usuario_id = $1::bigint
        AND COALESCE(gpa_scope.activo, TRUE) = TRUE
        AND gpa_scope.vigencia_desde <= $5::date
        AND (gpa_scope.vigencia_hasta IS NULL OR gpa_scope.vigencia_hasta >= $4::date)
    ) OR EXISTS (
      SELECT 1
      FROM gestor_municipio_asignaciones gma_scope
      JOIN cobertura_asignaciones ca_scope ON ca_scope.vinculacion_id = $2::bigint
      JOIN focalizacion_final ff_scope ON ff_scope.id = ca_scope.focalizacion_final_id
      WHERE gma_scope.usuario_id = $1::bigint
        AND gma_scope.contrato_id = $3::bigint
        AND COALESCE(gma_scope.activo, TRUE) = TRUE
        AND COALESCE(gma_scope.alcance_personal, 'PERSONAL_SELECCIONADO') = 'TODO_MUNICIPIO'
        AND gma_scope.vigencia_desde <= $5::date
        AND (gma_scope.vigencia_hasta IS NULL OR gma_scope.vigencia_hasta >= $4::date)
        AND ca_scope.fecha_inicio <= $5::date
        AND (ca_scope.fecha_fin IS NULL OR ca_scope.fecha_fin >= $4::date)
        AND ff_scope.municipio_id = gma_scope.municipio_id
    ) AS allowed`,
    [userId, vinculacionId, contratoId, fechaInicio, fechaFin]
  );

  return result.rows[0]?.allowed === true;
};

const hasNominaResponsibility = async (
  client: PoolClient,
  userId: string,
  empresaId: string | null
): Promise<boolean> => {
  if (!empresaId) {
    return false;
  }

  const result = await client.query<{ allowed: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM nomina_responsabilidades_usuario nru
      WHERE nru.usuario_id = $1::bigint
        AND nru.empresa_id = $2::bigint
        AND nru.proceso = 'COBERTURA'
        AND nru.activo = TRUE
    ) AS allowed`,
    [userId, empresaId]
  );

  return result.rows[0]?.allowed === true;
};

const hasGestorContractAssignment = async (
  client: PoolClient,
  userId: string,
  contratoId: string,
  fechaInicio: string,
  fechaFin: string
): Promise<boolean> => {
  const result = await client.query<{ allowed: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM gestor_personal_asignaciones gpa_scope
      WHERE gpa_scope.usuario_id = $1::bigint
        AND gpa_scope.contrato_id = $2::bigint
        AND COALESCE(gpa_scope.activo, TRUE) = TRUE
        AND gpa_scope.vigencia_desde <= $4::date
        AND (gpa_scope.vigencia_hasta IS NULL OR gpa_scope.vigencia_hasta >= $3::date)
    ) OR EXISTS (
      SELECT 1
      FROM gestor_municipio_asignaciones gma_scope
      WHERE gma_scope.usuario_id = $1::bigint
        AND gma_scope.contrato_id = $2::bigint
        AND COALESCE(gma_scope.activo, TRUE) = TRUE
        AND gma_scope.vigencia_desde <= $4::date
        AND (gma_scope.vigencia_hasta IS NULL OR gma_scope.vigencia_hasta >= $3::date)
    ) AS allowed`,
    [userId, contratoId, fechaInicio, fechaFin]
  );

  return result.rows[0]?.allowed === true;
};

const hasGestorPeriodoScope = async (
  client: PoolClient,
  userId: string,
  periodoId: string
): Promise<boolean> => {
  const result = await client.query<{ allowed: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM nomina_empleados ne
      JOIN vinculaciones v ON v.id = ne.vinculacion_id
      JOIN nomina_periodos np ON np.id = ne.periodo_id
      WHERE ne.periodo_id = $2::bigint
        AND (
          EXISTS (
            SELECT 1
            FROM gestor_personal_asignaciones gpa_scope
            WHERE gpa_scope.vinculacion_id = v.id
              AND gpa_scope.contrato_id = v.contrato_id
              AND gpa_scope.usuario_id = $1::bigint
              AND COALESCE(gpa_scope.activo, TRUE) = TRUE
              AND gpa_scope.vigencia_desde <= np.fecha_fin
              AND (gpa_scope.vigencia_hasta IS NULL OR gpa_scope.vigencia_hasta >= np.fecha_inicio)
          )
          OR EXISTS (
            SELECT 1
            FROM gestor_municipio_asignaciones gma_scope
            JOIN cobertura_asignaciones ca_scope ON ca_scope.vinculacion_id = v.id
            JOIN focalizacion_final ff_scope ON ff_scope.id = ca_scope.focalizacion_final_id
            WHERE gma_scope.usuario_id = $1::bigint
              AND gma_scope.contrato_id = v.contrato_id
              AND COALESCE(gma_scope.activo, TRUE) = TRUE
              AND COALESCE(gma_scope.alcance_personal, 'PERSONAL_SELECCIONADO') = 'TODO_MUNICIPIO'
              AND gma_scope.vigencia_desde <= np.fecha_fin
              AND (gma_scope.vigencia_hasta IS NULL OR gma_scope.vigencia_hasta >= np.fecha_inicio)
              AND ca_scope.fecha_inicio <= np.fecha_fin
              AND (ca_scope.fecha_fin IS NULL OR ca_scope.fecha_fin >= np.fecha_inicio)
              AND ff_scope.municipio_id = gma_scope.municipio_id
          )
        )
    ) AS allowed`,
    [userId, periodoId]
  );

  return result.rows[0]?.allowed === true;
};

const loadAlertReference = async (client: PoolClient, alertId: string): Promise<AlertReferenceRow | null> => {
  const result = await client.query<AlertReferenceRow>(
    `SELECT
      id::text AS id,
      tipo_alerta,
      referencia_tabla,
      referencia_id::text AS referencia_id,
      persona_id::text AS persona_id,
      vinculacion_id::text AS vinculacion_id,
      contrato_id::text AS contrato_id
     FROM alertas_sistema
     WHERE id = $1::bigint
     LIMIT 1`,
    [alertId]
  );

  return result.rows[0] ?? null;
};

const loadContractScope = async (client: PoolClient, contratoId: string): Promise<ContractScopeRow | null> => {
  const result = await client.query<ContractScopeRow>(
    `SELECT id::text AS contrato_id, empresa_id::text AS empresa_id
     FROM contratos
     WHERE id = $1::bigint
     LIMIT 1`,
    [contratoId]
  );

  return result.rows[0] ?? null;
};

const loadVinculacionScope = async (client: PoolClient, vinculacionId: string): Promise<VinculacionScopeRow | null> => {
  const result = await client.query<VinculacionScopeRow>(
    `SELECT v.id::text AS vinculacion_id, v.persona_id::text AS persona_id, v.contrato_id::text AS contrato_id, c.empresa_id::text AS empresa_id
     FROM vinculaciones v
     JOIN contratos c ON c.id = v.contrato_id
     WHERE v.id = $1::bigint
     LIMIT 1`,
    [vinculacionId]
  );

  return result.rows[0] ?? null;
};

const loadDocumentoVinculacionScope = async (client: PoolClient, documentoId: string): Promise<VinculacionScopeRow | null> => {
  const result = await client.query<VinculacionScopeRow>(
    `SELECT v.id::text AS vinculacion_id, v.persona_id::text AS persona_id, v.contrato_id::text AS contrato_id, c.empresa_id::text AS empresa_id
     FROM documentos_vinculacion dv
     JOIN vinculaciones v ON v.id = dv.vinculacion_id
     JOIN contratos c ON c.id = v.contrato_id
     WHERE dv.id = $1::bigint
     LIMIT 1`,
    [documentoId]
  );

  return result.rows[0] ?? null;
};

const loadDocumentoPersonaScopes = async (client: PoolClient, documentoId: string): Promise<VinculacionScopeRow[]> => {
  const result = await client.query<VinculacionScopeRow>(
    `SELECT v.id::text AS vinculacion_id, v.persona_id::text AS persona_id, v.contrato_id::text AS contrato_id, c.empresa_id::text AS empresa_id
     FROM documentos_persona dp
     JOIN vinculaciones v ON v.persona_id = dp.persona_id
     JOIN contratos c ON c.id = v.contrato_id
     WHERE dp.id = $1::bigint`,
    [documentoId]
  );

  return result.rows;
};

const loadPeriodoScope = async (client: PoolClient, periodoId: string): Promise<PeriodoScopeRow | null> => {
  const result = await client.query<PeriodoScopeRow>(
    `SELECT np.id::text AS periodo_id, np.contrato_id::text AS contrato_id, c.empresa_id::text AS empresa_id, np.fecha_inicio::text AS fecha_inicio, np.fecha_fin::text AS fecha_fin
     FROM nomina_periodos np
     JOIN contratos c ON c.id = np.contrato_id
     WHERE np.id = $1::bigint
     LIMIT 1`,
    [periodoId]
  );

  return result.rows[0] ?? null;
};

const canAccessScopedVinculacion = async (
  client: PoolClient,
  access: UserNotificationAccess,
  row: VinculacionScopeRow,
  fechaInicio = TODAY,
  fechaFin = TODAY
): Promise<boolean> => {
  if (!hasTenantContractAccess(access.tenant, row.contrato_id, row.empresa_id)) {
    return false;
  }

  if (!isScopedGestorAccess(access)) {
    return true;
  }

  return hasGestorVinculacionScope(
    client,
    access.userId,
    row.vinculacion_id,
    row.contrato_id,
    fechaInicio,
    fechaFin
  );
};

const canAccessAlertReference = async (
  client: PoolClient,
  access: UserNotificationAccess,
  alert: AlertReferenceRow
): Promise<boolean> => {
  if (!hasAlertModuleAccess(alert.tipo_alerta, access.permissions)) {
    return false;
  }

  if (access.tenant.isGlobalAdmin) {
    return true;
  }

  switch (alert.referencia_tabla) {
    case 'documentos_vinculacion': {
      if (!alert.referencia_id) {
        return false;
      }
      const row = await loadDocumentoVinculacionScope(client, alert.referencia_id);
      return row ? canAccessScopedVinculacion(client, access, row) : false;
    }
    case 'documentos_persona': {
      if (!alert.referencia_id) {
        return false;
      }
      const rows = await loadDocumentoPersonaScopes(client, alert.referencia_id);
      for (const row of rows) {
        if (await canAccessScopedVinculacion(client, access, row)) {
          return true;
        }
      }
      return false;
    }
    case 'vinculaciones': {
      if (!alert.referencia_id) {
        return false;
      }
      const row = await loadVinculacionScope(client, alert.referencia_id);
      return row ? canAccessScopedVinculacion(client, access, row) : false;
    }
    case 'contratos': {
      if (!alert.referencia_id) {
        return false;
      }
      const row = await loadContractScope(client, alert.referencia_id);
      if (!row || !hasTenantContractAccess(access.tenant, row.contrato_id, row.empresa_id)) {
        return false;
      }
      if (!isScopedGestorAccess(access) || !isNominaOrCoberturaAlert(alert.tipo_alerta)) {
        return true;
      }
      return (
        (await hasNominaResponsibility(client, access.userId, row.empresa_id)) &&
        (await hasGestorContractAssignment(client, access.userId, row.contrato_id, TODAY, TODAY))
      );
    }
    case 'nomina_periodos': {
      if (!alert.referencia_id) {
        return false;
      }
      const row = await loadPeriodoScope(client, alert.referencia_id);
      if (!row || !hasTenantContractAccess(access.tenant, row.contrato_id, row.empresa_id)) {
        return false;
      }
      if (!isScopedGestorAccess(access)) {
        return true;
      }
      return (
        (await hasNominaResponsibility(client, access.userId, row.empresa_id)) &&
        (await hasGestorPeriodoScope(client, access.userId, row.periodo_id))
      );
    }
    default: {
      if (alert.vinculacion_id) {
        const row = await loadVinculacionScope(client, alert.vinculacion_id);
        return row ? canAccessScopedVinculacion(client, access, row) : false;
      }
      if (alert.contrato_id) {
        const row = await loadContractScope(client, alert.contrato_id);
        return row ? hasTenantContractAccess(access.tenant, row.contrato_id, row.empresa_id) : false;
      }
      return true;
    }
  }
};

export const filterVisibleNotificationsForUser = async (
  usuarioId: string,
  notifications: NotificacionVisibilityRow[]
): Promise<NotificacionVisibilityRow[]> => {
  if (notifications.length === 0) {
    return [];
  }

  const client = await dbPool.connect();
  try {
    const access = await loadUserNotificationAccess(client, usuarioId);
    const visible: NotificacionVisibilityRow[] = [];

    for (const notification of notifications) {
      if (notification.referencia_tabla !== 'alertas_sistema' || !notification.referencia_id) {
        visible.push(notification);
        continue;
      }

      const alert = await loadAlertReference(client, notification.referencia_id);
      if (!alert) {
        continue;
      }

      if (await canAccessAlertReference(client, access, alert)) {
        visible.push(notification);
      }
    }

    return visible;
  } finally {
    client.release();
  }
};
