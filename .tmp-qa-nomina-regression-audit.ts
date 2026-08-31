import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: process.env.ENV_FILE?.trim() || '.env.qa' });

import { app } from './src/app';

type JsonRecord = Record<string, unknown>;

type ApiResponse<T> = {
  code?: string;
  data?: T;
  error?: {
    code?: string;
    details?: unknown;
    message?: string;
  };
  message?: string;
};

type RequestAudit = {
  body: unknown;
  code?: string;
  component: string;
  endpoint: string;
  method: string;
  permission: string;
  status: number;
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function toObject(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as JsonRecord;
}

async function request<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: ApiResponse<T> | string | null }> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return {
      status: response.status,
      body: (await response.json()) as ApiResponse<T>,
    };
  }

  return {
    status: response.status,
    body: response.status === 204 ? null : await response.text(),
  };
}

async function main() {
  const server = app.listen(4010, '127.0.0.1');
  const baseUrl = 'http://127.0.0.1:4010/api';
  try {
    const login = await request<{
      accessToken: string;
      user: {
        id: string;
        permissions: string[];
        roles: string[];
      };
    }>(baseUrl, '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'th.qa@empiria.example',
        password: 'ThQA123456*',
      }),
    });

    assert.equal(login.status, 200, 'TH login must succeed');
    const session = (login.body as ApiResponse<{ accessToken: string; user: { id: string; permissions: string[]; roles: string[] } }>).data;
    assert.ok(session?.accessToken, 'TH access token required');

    const token = session.accessToken;
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const httpAudits: RequestAudit[] = [];
    const auditedRequests = [
      {
        component: 'NominaPage.loadPeriods',
        endpoint: '/nomina/periodos?empresa_id=2&page=1&limit=200',
        method: 'GET',
        permission: 'nomina.operativa.read|nomina.read',
      },
      {
        component: 'NominaPage.loadTiposNovedad',
        endpoint: '/nomina/tipos-novedad?empresa_id=2',
        method: 'GET',
        permission: 'nomina.operativa.read|nomina.read',
      },
      {
        component: 'NominaPage.loadPeriod',
        endpoint: '/nomina/periodos/2',
        method: 'GET',
        permission: 'nomina.operativa.read|nomina.read',
      },
      {
        component: 'NominaPage.loadDashboard',
        endpoint: '/nomina/periodos/2/dashboard',
        method: 'GET',
        permission: 'nomina.dashboard.read',
      },
      {
        component: 'NominaPage.loadEmployees',
        endpoint: '/nomina/periodos/2/empleados?empresa_id=2&page=1&limit=200',
        method: 'GET',
        permission: 'nomina.economico.read',
      },
      {
        component: 'NominaPage.loadNovedades',
        endpoint: '/nomina/novedades?periodo_id=2&page=1&limit=200',
        method: 'GET',
        permission: 'nomina.operativa.read|nomina.read',
      },
      {
        component: 'NominaPage.loadDesprendibles',
        endpoint: '/nomina/desprendibles/2',
        method: 'GET',
        permission: 'nomina.desprendibles.read',
      },
      {
        component: 'PlanillaOperativaPage.loadEmployees',
        endpoint: '/nomina/periodos/2/empleados-operativos?empresa_id=2&page=1&limit=200',
        method: 'GET',
        permission: 'nomina.operativa.read',
      },
      {
        component: 'PlanillaOperativaPage.loadMovements',
        endpoint: '/nomina/movimientos-operativos?periodo_id=2&activo=true&page=1&limit=200',
        method: 'GET',
        permission: 'nomina.operativa.read',
      },
      {
        component: 'PlanillaOperativaPage.loadTurnRelations',
        endpoint: '/nomina/novedad-turnos-operativos?periodo_id=2&activo=true&limit=200',
        method: 'GET',
        permission: 'nomina.operativa.read',
      },
      {
        component: 'PlanillaOperativaPage.loadAttendance',
        endpoint: '/nomina/periodos/2/asistencia?activo=true&page=1&limit=100',
        method: 'GET',
        permission: 'nomina.operativa.read|nomina.read',
      },
      {
        component: 'PlanillaOperativaPage.loadRevisionOperativa',
        endpoint: '/nomina/periodos/2/revision-operativa',
        method: 'GET',
        permission: 'nomina.operativa.read|nomina.read',
      },
      {
        component: 'TurnosPage.loadMovements',
        endpoint: '/nomina/movimientos-operativos?periodo_id=2&activo=true&page=1&limit=200',
        method: 'GET',
        permission: 'nomina.operativa.read',
      },
      {
        component: 'TurnosPage.loadInternalTurns',
        endpoint: '/nomina/novedad-turnos-operativos?periodo_id=2&activo=true&limit=500',
        method: 'GET',
        permission: 'nomina.operativa.read',
      },
      {
        component: 'TurnosPage.loadExternalSummary',
        endpoint: '/nomina/cobertura/externos-operativos?periodo_id=2&empresa_id=2',
        method: 'GET',
        permission: 'nomina.operativa.read',
      },
    ] as const;

    for (const entry of auditedRequests) {
      const response = await request<unknown>(baseUrl, entry.endpoint, {
        method: entry.method,
        headers: authHeaders,
      });
      const body = toObject(response.body);
      httpAudits.push({
        component: entry.component,
        endpoint: entry.endpoint,
        method: entry.method,
        permission: entry.permission,
        status: response.status,
        code: body?.error && typeof body.error === 'object' && body.error
          ? String((body.error as JsonRecord).code ?? body.code ?? '')
          : body?.code
            ? String(body.code)
            : undefined,
        body: response.body,
      });
    }

    const periodo = await pool.query(
      `
        SELECT
          np.id::text AS periodo_id,
          np.nombre_periodo,
          np.fecha_inicio::text AS fecha_inicio,
          np.fecha_fin::text AS fecha_fin,
          np.estado,
          c.id::text AS contrato_id,
          e.id::text AS empresa_id,
          e.nombre_empresa
        FROM nomina_periodos np
        INNER JOIN contratos c ON c.id = np.contrato_id
        INNER JOIN empresas e ON e.id = c.empresa_id
        WHERE np.id = 2
      `,
    );

    const pr1 = await pool.query(
      `
        SELECT
          nn.id::text AS novedad_id,
          nn.periodo_id::text AS periodo_id,
          nn.nomina_empleado_id::text AS nomina_empleado_id,
          nn.vinculacion_id::text AS vinculacion_id,
          nn.fecha_inicio::text AS fecha_inicio,
          nn.fecha_fin::text AS fecha_fin,
          nn.dias,
          nn.activo,
          nn.revisado,
          nn.observacion,
          ntn.id::text AS tipo_novedad_id,
          ntn.codigo_operativo,
          ntn.nombre AS tipo_novedad,
          ntn.efecto_salario,
          ntn.efecto_auxilio_transporte,
          ntn.afecta_salario,
          ntn.afecta_transporte,
          p.id::text AS persona_id,
          p.nombre_completo,
          p.numero_documento
        FROM nomina_novedades nn
        INNER JOIN nomina_tipos_novedad ntn ON ntn.id = nn.tipo_novedad_id
        INNER JOIN nomina_empleados ne ON ne.id = nn.nomina_empleado_id
        INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id
        INNER JOIN personas p ON p.id = v.persona_id
        WHERE nn.periodo_id = 2
          AND COALESCE(nn.activo, TRUE) = TRUE
          AND UPPER(COALESCE(ntn.codigo_operativo, '')) = 'PR1'
        ORDER BY nn.created_at DESC, nn.id DESC
        LIMIT 1
      `,
    );

    const turnoInterno = await pool.query(
      `
        SELECT
          nnt.id::text AS novedad_turno_id,
          nnt.periodo_id::text AS periodo_id,
          nnt.nomina_novedad_id::text AS nomina_novedad_id,
          nnt.nomina_empleado_id::text AS cubre_nomina_empleado_id,
          nnt.vinculacion_id::text AS cubre_vinculacion_id,
          nnt.persona_reemplazada_id::text AS persona_reemplazada_id,
          nnt.movimiento_id::text AS movimiento_id,
          nnt.tipo_turno,
          nnt.fecha::text AS fecha,
          nnt.fecha_inicio::text AS fecha_inicio,
          nnt.fecha_fin::text AS fecha_fin,
          nnt.estado,
          nnt.activo,
          p_cubre.nombre_completo AS trabajador_cubre,
          p_cubre.numero_documento AS trabajador_cubre_documento,
          p_titular.nombre_completo AS trabajador_reemplazado,
          p_titular.numero_documento AS trabajador_reemplazado_documento,
          nn.nomina_empleado_id::text AS titular_nomina_empleado_id,
          nn.vinculacion_id::text AS titular_vinculacion_id,
          nn.fecha_inicio::text AS novedad_fecha_inicio,
          nn.fecha_fin::text AS novedad_fecha_fin,
          ntn.codigo_operativo,
          ntn.nombre AS tipo_novedad
        FROM nomina_novedad_turnos nnt
        INNER JOIN nomina_novedades nn ON nn.id = nnt.nomina_novedad_id
        INNER JOIN nomina_tipos_novedad ntn ON ntn.id = nn.tipo_novedad_id
        INNER JOIN nomina_empleados ne_cubre ON ne_cubre.id = nnt.nomina_empleado_id
        INNER JOIN vinculaciones v_cubre ON v_cubre.id = ne_cubre.vinculacion_id
        INNER JOIN personas p_cubre ON p_cubre.id = v_cubre.persona_id
        LEFT JOIN personas p_titular ON p_titular.id = nnt.persona_reemplazada_id
        WHERE nnt.periodo_id = 2
          AND COALESCE(nnt.activo, TRUE) = TRUE
          AND nnt.tipo_turno = 'INTERNO'
        ORDER BY nnt.created_at DESC, nnt.id DESC
        LIMIT 1
      `,
    );

    const movimientoTurnoInterno = await pool.query(
      `
        SELECT
          nm.id::text AS movimiento_id,
          nm.periodo_id::text AS periodo_id,
          nm.nomina_empleado_id::text AS nomina_empleado_id,
          nm.vinculacion_id::text AS vinculacion_id,
          nm.fecha::text AS fecha,
          nm.tipo_movimiento,
          nm.familia_movimiento,
          nm.descripcion,
          nm.cantidad,
          nm.valor_unitario,
          nm.valor_calculado,
          nm.valor_total,
          nm.estado,
          nm.activo,
          nm.nomina_novedad_id::text AS nomina_novedad_id,
          nm.persona_reemplazada_id::text AS persona_reemplazada_id,
          nm.vinculacion_reemplazada_id::text AS vinculacion_reemplazada_id
        FROM nomina_movimientos nm
        WHERE nm.periodo_id = 2
          AND COALESCE(nm.activo, TRUE) = TRUE
          AND nm.tipo_movimiento = 'TURNO_INTERNO'
        ORDER BY nm.created_at DESC, nm.id DESC
        LIMIT 5
      `,
    );

    const movimientoPr1 = await pool.query(
      `
        SELECT
          nm.id::text AS movimiento_id,
          nm.periodo_id::text AS periodo_id,
          nm.nomina_empleado_id::text AS nomina_empleado_id,
          nm.fecha::text AS fecha,
          nm.tipo_movimiento,
          nm.familia_movimiento,
          nm.valor_total,
          nm.estado,
          nm.activo,
          nm.descripcion
        FROM nomina_movimientos nm
        INNER JOIN nomina_novedades nn ON nn.id = nm.nomina_novedad_id
        INNER JOIN nomina_tipos_novedad ntn ON ntn.id = nn.tipo_novedad_id
        WHERE nn.periodo_id = 2
          AND COALESCE(nn.activo, TRUE) = TRUE
          AND UPPER(COALESCE(ntn.codigo_operativo, '')) = 'PR1'
        ORDER BY nm.created_at DESC, nm.id DESC
        LIMIT 10
      `,
    );

    const affectedEmployees = await pool.query(
      `
        WITH ids AS (
          SELECT nn.nomina_empleado_id
          FROM nomina_novedades nn
          INNER JOIN nomina_tipos_novedad ntn ON ntn.id = nn.tipo_novedad_id
          WHERE nn.periodo_id = 2
            AND COALESCE(nn.activo, TRUE) = TRUE
            AND UPPER(COALESCE(ntn.codigo_operativo, '')) = 'PR1'
          UNION
          SELECT nnt.nomina_empleado_id
          FROM nomina_novedad_turnos nnt
          WHERE nnt.periodo_id = 2
            AND COALESCE(nnt.activo, TRUE) = TRUE
            AND nnt.tipo_turno = 'INTERNO'
        )
        SELECT
          ne.id::text AS nomina_empleado_id,
          ne.vinculacion_id::text AS vinculacion_id,
          ne.salario_base,
          ne.auxilio_transporte,
          ne.devengado_basico,
          ne.devengado_transporte,
          ne.total_adiciones,
          ne.total_deducciones,
          ne.neto_pagar,
          ne.detalle_calculo,
          p.nombre_completo,
          p.numero_documento
        FROM nomina_empleados ne
        INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id
        INNER JOIN personas p ON p.id = v.persona_id
        WHERE ne.id IN (SELECT nomina_empleado_id FROM ids)
        ORDER BY ne.id
      `,
    );

    console.log(JSON.stringify({
      periodo: periodo.rows[0] ?? null,
      th_session: {
        roles: session.user.roles,
        permissions: session.user.permissions,
      },
      http_audit: httpAudits,
      pr1: pr1.rows[0] ?? null,
      pr1_movimientos: movimientoPr1.rows,
      turno_interno: turnoInterno.rows[0] ?? null,
      turno_interno_movimientos: movimientoTurnoInterno.rows,
      empleados_afectados: affectedEmployees.rows,
    }, null, 2));
  } finally {
    server.close();
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
