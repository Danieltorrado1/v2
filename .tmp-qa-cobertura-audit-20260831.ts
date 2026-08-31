import { createServer, type Server } from 'node:http';
import { resolve } from 'node:path';

import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { Pool, type QueryResultRow } from 'pg';

const envPath = resolve(process.cwd(), '.env.qa');
dotenv.config({ path: envPath });
process.env.ENV_FILE = envPath;

const PERIOD_ID = '2';
const PR1_NOVEDAD_ID = '8';

type JsonObject = Record<string, unknown>;

interface PeriodRow extends QueryResultRow {
  id: string;
  contrato_id: string;
  empresa_id: string | null;
  nombre_periodo: string;
  fecha_inicio: string;
  fecha_fin: string;
  fecha_inicio_type: string;
  fecha_fin_type: string;
}

interface UserRow extends QueryResultRow {
  id: string;
  correo: string;
  nombre: string | null;
  roles: string[] | null;
  permissions: string[] | null;
  empresa_access: boolean;
  contrato_access: boolean;
}

interface ResponsibilityRow extends QueryResultRow {
  id: string;
  proceso: string;
  municipio_ids: string[] | null;
  area_ids: string[] | null;
}

interface Pr1ScopeRow extends QueryResultRow {
  novedad_id: string;
  nomina_empleado_id: string;
  vinculacion_id: string;
  trabajador: string;
  municipio_id: string | null;
  municipio: string | null;
}

interface InternalCoverageRow extends QueryResultRow {
  novedad_id: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  activo: boolean;
  cubierta: boolean | null;
  cobertura_tipo: string | null;
  cobertura_persona_cubre_id: string | null;
  cobertura_vinculacion_cubre_id: string | null;
  cobertura_nombre: string | null;
  cobertura_documento: string | null;
  nomina_empleado_cubre_id: string | null;
  trabajador_titular: string | null;
  trabajador_cubre: string | null;
  turno_rel_id: string | null;
  turno_tipo: string | null;
  turno_movimiento_id: string | null;
  movimiento_tipo: string | null;
  movimiento_valor_total: string | null;
  movimiento_activo: boolean | null;
  movimiento_estado: string | null;
}

interface TurnRelationRow extends QueryResultRow {
  id: string;
  novedad_id: string;
  titular: string | null;
  trabajador_cubre: string | null;
  persona_id: string | null;
  vinculacion_id: string | null;
  nomina_empleado_id: string | null;
  fecha: string | null;
  tipo: string;
  estado: string;
  activo: boolean;
  movimiento_id: string | null;
}

interface TurnMovementRow extends QueryResultRow {
  id: string;
  nomina_empleado_id: string;
  fecha: string | null;
  familia: string | null;
  tipo: string;
  cantidad: string | null;
  valor_unitario: string | null;
  valor_total: string | null;
  estado: string | null;
  activo: boolean;
  titular_referencia: string | null;
  novedad_id: string | null;
}

interface HttpAuditResult {
  endpoint: string;
  method: string;
  status: number;
  result: string;
  body?: unknown;
}

interface RunContext {
  baseUrl: string;
  period: PeriodRow;
  thUser: {
    id: string;
    correo: string;
    nombre: string | null;
    permissions: string[];
    roles: string[];
  } | null;
}

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} in ${envPath}`);
  }
  return value;
};

const pool = new Pool({
  connectionString: requireEnv('DATABASE_URL'),
  ssl: { rejectUnauthorized: false },
  max: 4,
  idleTimeoutMillis: 10_000,
});

const summarizeList = (value: unknown): string => {
  if (!value || typeof value !== 'object') return 'sin cuerpo útil';
  const data = value as JsonObject;
  if (Array.isArray(data.items)) return `items=${data.items.length}`;
  if ('items' in data && data.items && typeof data.items === 'object') {
    const nested = data.items as JsonObject;
    if (Array.isArray(nested.items)) return `items=${nested.items.length}`;
  }
  if (Array.isArray(data.data)) return `items=${data.data.length}`;
  if ('data' in data && data.data && typeof data.data === 'object') {
    const nested = data.data as JsonObject;
    if (Array.isArray(nested.items)) return `items=${nested.items.length}`;
    if (Array.isArray(nested)) return `items=${nested.length}`;
    if ('id' in nested) return `id=${String(nested.id)}`;
  }
  if ('message' in data) return `message=${String(data.message)}`;
  return 'ok';
};

const signToken = (userId: string): string =>
  jwt.sign({}, requireEnv('JWT_SECRET'), {
    expiresIn: '30m',
    subject: userId,
  });

const listen = async (): Promise<{ server: Server; baseUrl: string }> =>
  new Promise((resolveListen, rejectListen) => {
    void (async () => {
      const { app } = await import('./src/app.ts');
      const { env } = await import('./src/config/env.ts');
      const server = createServer(app);
      server.once('error', rejectListen);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          rejectListen(new Error('No fue posible resolver un puerto HTTP local.'));
          return;
        }
        resolveListen({
          server,
          baseUrl: `http://127.0.0.1:${address.port}${env.API_PREFIX}`,
        });
      });
    })().catch(rejectListen);
  });

const fetchJson = async (
  baseUrl: string,
  userId: string,
  path: string,
): Promise<HttpAuditResult> => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${signToken(userId)}`,
    },
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return {
    endpoint: path,
    method: 'GET',
    status: response.status,
    result: summarizeList(body),
    body,
  };
};

const findQaThUser = async (period: PeriodRow) => {
  const result = await pool.query<UserRow>(
    `
      SELECT
        u.id::text AS id,
        u.correo,
        NULLIF(BTRIM(u.nombre_completo), '') AS nombre,
        ARRAY_AGG(DISTINCT r.nombre_rol ORDER BY r.nombre_rol) FILTER (WHERE r.nombre_rol IS NOT NULL) AS roles,
        ARRAY_AGG(DISTINCT CONCAT_WS('.', p.modulo, p.accion) ORDER BY CONCAT_WS('.', p.modulo, p.accion))
          FILTER (WHERE p.id IS NOT NULL) AS permissions,
        EXISTS (
          SELECT 1
          FROM usuario_empresas ue
          WHERE ue.usuario_id = u.id
            AND ue.empresa_id = $1::bigint
            AND COALESCE(ue.activo, TRUE) = TRUE
        ) AS empresa_access,
        EXISTS (
          SELECT 1
          FROM usuario_contratos uc
          WHERE uc.usuario_id = u.id
            AND uc.contrato_id = $2::bigint
            AND COALESCE(uc.activo, TRUE) = TRUE
        ) AS contrato_access
      FROM usuarios u
      INNER JOIN usuario_roles ur
        ON ur.usuario_id = u.id
       AND COALESCE(ur.activo, TRUE) = TRUE
      INNER JOIN roles r
        ON r.id = ur.rol_id
       AND COALESCE(r.activo, TRUE) = TRUE
      LEFT JOIN rol_permisos rp
        ON rp.rol_id = r.id
       AND COALESCE(rp.activo, TRUE) = TRUE
      LEFT JOIN permisos p
        ON p.id = rp.permiso_id
       AND COALESCE(p.activo, TRUE) = TRUE
      WHERE COALESCE(u.activo, TRUE) = TRUE
        AND r.nombre_rol = 'TALENTO_HUMANO'
      GROUP BY u.id, u.auth_user_id, u.correo, u.nombre_completo
      ORDER BY
        CASE
          WHEN LOWER(COALESCE(u.nombre_completo, '')) LIKE '%qa talento humano%' THEN 0
          WHEN LOWER(u.correo) LIKE '%qa%' THEN 1
          WHEN EXISTS (
            SELECT 1 FROM usuario_contratos uc
            WHERE uc.usuario_id = u.id
              AND uc.contrato_id = $2::bigint
              AND COALESCE(uc.activo, TRUE) = TRUE
          ) THEN 2
          WHEN EXISTS (
            SELECT 1 FROM usuario_empresas ue
            WHERE ue.usuario_id = u.id
              AND ue.empresa_id = $1::bigint
              AND COALESCE(ue.activo, TRUE) = TRUE
          ) THEN 3
          ELSE 4
        END,
        u.id ASC
    `,
    [period.empresa_id, period.contrato_id],
  );

  const selected =
    result.rows.find((row) =>
      String(row.nombre ?? '').toLowerCase().includes('qa talento humano'),
    ) ??
    result.rows.find((row) => row.empresa_access || row.contrato_access) ??
    result.rows[0] ??
    null;

  return {
    selected,
    candidates: result.rows.map((row) => ({
      id: row.id,
      correo: row.correo,
      nombre: row.nombre,
      roles: row.roles ?? [],
      permissions: row.permissions ?? [],
      empresa_access: row.empresa_access,
      contrato_access: row.contrato_access,
    })),
  };
};

const loadPeriod = async (): Promise<PeriodRow> => {
  const result = await pool.query<PeriodRow>(
    `
      SELECT
        np.id::text AS id,
        np.contrato_id::text AS contrato_id,
        c.empresa_id::text AS empresa_id,
        np.nombre_periodo,
        np.fecha_inicio::text AS fecha_inicio,
        np.fecha_fin::text AS fecha_fin,
        pg_typeof(np.fecha_inicio)::text AS fecha_inicio_type,
        pg_typeof(np.fecha_fin)::text AS fecha_fin_type
      FROM nomina_periodos np
      INNER JOIN contratos c ON c.id = np.contrato_id
      WHERE np.id = $1::bigint
      LIMIT 1
    `,
    [PERIOD_ID],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`Periodo ${PERIOD_ID} no existe en QA.`);
  }
  return row;
};

const loadResponsibilities = async (userId: string, empresaId: string | null) => {
  if (!empresaId) return [];
  const result = await pool.query<ResponsibilityRow>(
    `
      SELECT
        nru.id::text AS id,
        nru.proceso,
        COALESCE(
          ARRAY(
            SELECT nrm.municipio_id::text
            FROM nomina_responsabilidad_municipios nrm
            WHERE nrm.responsabilidad_id = nru.id
            ORDER BY nrm.municipio_id
          ),
          ARRAY[]::text[]
        ) AS municipio_ids,
        COALESCE(
          ARRAY(
            SELECT nra.area_id::text
            FROM nomina_responsabilidad_areas nra
            WHERE nra.responsabilidad_id = nru.id
            ORDER BY nra.area_id
          ),
          ARRAY[]::text[]
        ) AS area_ids
      FROM nomina_responsabilidades_usuario nru
      WHERE nru.usuario_id = $1::bigint
        AND nru.empresa_id = $2::bigint
        AND nru.activo = TRUE
      ORDER BY nru.proceso, nru.id
    `,
    [userId, empresaId],
  );
  return result.rows;
};

const loadPr1Scope = async (): Promise<Pr1ScopeRow | null> => {
  const result = await pool.query<Pr1ScopeRow>(
    `
      SELECT
        nn.id::text AS novedad_id,
        nn.nomina_empleado_id::text AS nomina_empleado_id,
        nn.vinculacion_id::text AS vinculacion_id,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS trabajador,
        cff.municipio_id::text AS municipio_id,
        mu.nombre_municipio AS municipio
      FROM nomina_novedades nn
      INNER JOIN nomina_empleados ne ON ne.id = nn.nomina_empleado_id
      INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id
      INNER JOIN personas p ON p.id = v.persona_id
      LEFT JOIN cobertura_asignaciones ca
        ON ca.vinculacion_id = v.id
       AND ca.fecha_inicio <= nn.fecha_inicio
       AND (ca.fecha_fin IS NULL OR ca.fecha_fin >= COALESCE(nn.fecha_fin, nn.fecha_inicio))
       AND COALESCE(ca.activo, TRUE) = TRUE
      LEFT JOIN focalizacion_final cff ON cff.id = ca.focalizacion_final_id
      LEFT JOIN municipios mu ON mu.id = cff.municipio_id
      WHERE nn.id = $1::bigint
      LIMIT 1
    `,
    [PR1_NOVEDAD_ID],
  );
  return result.rows[0] ?? null;
};

const loadInternalCoverageRows = async () => {
  const result = await pool.query<InternalCoverageRow>(
    `
      SELECT
        nn.id::text AS novedad_id,
        nn.fecha_inicio::text AS fecha_inicio,
        nn.fecha_fin::text AS fecha_fin,
        COALESCE(nn.activo, TRUE) AS activo,
        nn.cubierta,
        nnc.tipo_cobertura AS cobertura_tipo,
        nnc.persona_cubre_id::text AS cobertura_persona_cubre_id,
        nnc.vinculacion_cubre_id::text AS cobertura_vinculacion_cubre_id,
        COALESCE(nnc.nombre_externo, CONCAT_WS(' ', cp.primer_nombre, cp.segundo_nombre, cp.primer_apellido, cp.segundo_apellido)) AS cobertura_nombre,
        COALESCE(nnc.documento_externo, cp.numero_documento) AS cobertura_documento,
        ne_cubre.id::text AS nomina_empleado_cubre_id,
        CONCAT_WS(' ', tp.primer_nombre, tp.segundo_nombre, tp.primer_apellido, tp.segundo_apellido) AS trabajador_titular,
        CONCAT_WS(' ', cp.primer_nombre, cp.segundo_nombre, cp.primer_apellido, cp.segundo_apellido) AS trabajador_cubre,
        nnt.id::text AS turno_rel_id,
        nnt.tipo_turno AS turno_tipo,
        nnt.movimiento_id::text AS turno_movimiento_id,
        nm.tipo_movimiento AS movimiento_tipo,
        nm.valor_total::text AS movimiento_valor_total,
        COALESCE(nm.activo, TRUE) AS movimiento_activo,
        nm.estado AS movimiento_estado
      FROM nomina_novedades nn
      LEFT JOIN nomina_novedad_coberturas nnc
        ON nnc.nomina_novedad_id = nn.id
       AND COALESCE(nnc.activo, TRUE) = TRUE
      INNER JOIN vinculaciones titular_v ON titular_v.id = nn.vinculacion_id
      INNER JOIN personas tp ON tp.id = titular_v.persona_id
      LEFT JOIN vinculaciones cubre_v ON cubre_v.id = nnc.vinculacion_cubre_id
      LEFT JOIN personas cp ON cp.id = cubre_v.persona_id
      LEFT JOIN nomina_empleados ne_cubre
        ON ne_cubre.periodo_id = nn.periodo_id
       AND ne_cubre.vinculacion_id = nnc.vinculacion_cubre_id
      LEFT JOIN nomina_novedad_turnos nnt
        ON nnt.nomina_novedad_id = nn.id
       AND COALESCE(nnt.activo, TRUE) = TRUE
      LEFT JOIN nomina_movimientos nm ON nm.id = nnt.movimiento_id
      WHERE nn.periodo_id = $1::bigint
        AND COALESCE(nn.activo, TRUE) = TRUE
        AND nnc.tipo_cobertura = 'PERSONAL_VINCULADO'
      ORDER BY nn.id ASC
    `,
    [PERIOD_ID],
  );
  return result.rows;
};

const loadTurnRelations = async () => {
  const result = await pool.query<TurnRelationRow>(
    `
      SELECT
        nnt.id::text AS id,
        nnt.nomina_novedad_id::text AS novedad_id,
        CONCAT_WS(' ', titular_p.primer_nombre, titular_p.segundo_nombre, titular_p.primer_apellido, titular_p.segundo_apellido) AS titular,
        COALESCE(ce.nombre_completo, CONCAT_WS(' ', cubre_p.primer_nombre, cubre_p.segundo_nombre, cubre_p.primer_apellido, cubre_p.segundo_apellido)) AS trabajador_cubre,
        COALESCE(ce.id::text, cubre_p.id::text) AS persona_id,
        nnt.vinculacion_id::text AS vinculacion_id,
        nnt.nomina_empleado_id::text AS nomina_empleado_id,
        COALESCE(nn.fecha_inicio, np.fecha_inicio)::text AS fecha,
        nnt.tipo_turno AS tipo,
        COALESCE(nm.estado, 'ACTIVO') AS estado,
        COALESCE(nnt.activo, TRUE) AS activo,
        nnt.movimiento_id::text AS movimiento_id
      FROM nomina_novedad_turnos nnt
      INNER JOIN nomina_novedades nn ON nn.id = nnt.nomina_novedad_id
      INNER JOIN nomina_periodos np ON np.id = nnt.periodo_id
      LEFT JOIN vinculaciones titular_v ON titular_v.id = nn.vinculacion_id
      LEFT JOIN personas titular_p ON titular_p.id = titular_v.persona_id
      LEFT JOIN vinculaciones cubre_v ON cubre_v.id = nnt.vinculacion_id
      LEFT JOIN personas cubre_p ON cubre_p.id = cubre_v.persona_id
      LEFT JOIN cobertura_externos ce ON ce.id = nnt.externo_id
      LEFT JOIN nomina_movimientos nm ON nm.id = nnt.movimiento_id
      WHERE nnt.periodo_id = $1::bigint
      ORDER BY nnt.id ASC
    `,
    [PERIOD_ID],
  );
  return result.rows;
};

const loadTurnMovements = async () => {
  const result = await pool.query<TurnMovementRow>(
    `
      SELECT
        nm.id::text AS id,
        nm.nomina_empleado_id::text AS nomina_empleado_id,
        nm.fecha::text AS fecha,
        nm.familia_movimiento AS familia,
        nm.tipo_movimiento AS tipo,
        nm.cantidad::text AS cantidad,
        nm.valor_unitario::text AS valor_unitario,
        nm.valor_total::text AS valor_total,
        nm.estado,
        COALESCE(nm.activo, TRUE) AS activo,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS titular_referencia,
        nnt.nomina_novedad_id::text AS novedad_id
      FROM nomina_movimientos nm
      LEFT JOIN vinculaciones vr ON vr.id = nm.vinculacion_reemplazada_id
      LEFT JOIN personas p ON p.id = vr.persona_id
      LEFT JOIN nomina_novedad_turnos nnt ON nnt.movimiento_id = nm.id
      WHERE nm.periodo_id = $1::bigint
        AND (
          nm.tipo_movimiento IN ('TURNO_INTERNO', 'TURNO_EXTERNO')
          OR nnt.id IS NOT NULL
        )
      ORDER BY nm.id ASC
    `,
    [PERIOD_ID],
  );
  return result.rows;
};

const loadPeriodDateDiagnostics = async () => {
  const result = await pool.query(
    `
      SELECT
        np.id::text AS periodo_id,
        np.fecha_inicio::text AS periodo_fecha_inicio,
        np.fecha_fin::text AS periodo_fecha_fin,
        pg_typeof(np.fecha_inicio)::text AS periodo_fecha_inicio_type,
        pg_typeof(np.fecha_fin)::text AS periodo_fecha_fin_type,
        nn.id::text AS novedad_id,
        nn.fecha_inicio::text AS novedad_fecha_inicio,
        nn.fecha_fin::text AS novedad_fecha_fin,
        pg_typeof(nn.fecha_inicio)::text AS novedad_fecha_inicio_type,
        pg_typeof(nn.fecha_fin)::text AS novedad_fecha_fin_type
      FROM nomina_periodos np
      LEFT JOIN nomina_novedades nn ON nn.id = $2::bigint
      WHERE np.id = $1::bigint
      LIMIT 1
    `,
    [PERIOD_ID, PR1_NOVEDAD_ID],
  );
  return result.rows[0] ?? null;
};

const runHttpAudit = async ({ baseUrl, period, thUser }: RunContext) => {
  if (!thUser || !period.empresa_id) {
    return [];
  }

  const requests: string[] = [
    `/nomina/periodos?page=1&limit=100&empresa_id=${period.empresa_id}`,
    `/nomina/tipos-novedad?empresa_id=${period.empresa_id}`,
  ];

  const isOperationalCoverageView = thUser.permissions.includes('nomina.operativa.read');

  if (isOperationalCoverageView) {
    requests.push(
      `/nomina/periodos/${PERIOD_ID}/empleados-operativos?page=1&limit=100&empresa_id=${period.empresa_id}`,
      `/nomina/novedades?periodo_id=${PERIOD_ID}&page=1&limit=100`,
    );
  } else {
    requests.push(
      `/nomina/periodos/${PERIOD_ID}`,
      `/nomina/periodos/${PERIOD_ID}/dashboard`,
      `/nomina/periodos/${PERIOD_ID}/empleados?page=1&limit=100&empresa_id=${period.empresa_id}`,
      `/nomina/novedades?periodo_id=${PERIOD_ID}&page=1&limit=100`,
      `/nomina/desprendibles/${PERIOD_ID}?include_versiones=false`,
    );
  }

  requests.push(
    `/nomina/movimientos-operativos?periodo_id=${PERIOD_ID}&activo=true&page=1&limit=100`,
    `/nomina/novedad-turnos-operativos?periodo_id=${PERIOD_ID}&activo=true&limit=500`,
  );

  const results: HttpAuditResult[] = [];
  for (const path of requests) {
    results.push(await fetchJson(baseUrl, thUser.id, path));
  }
  return results;
};

const main = async () => {
  const period = await loadPeriod();
  const thUsers = await findQaThUser(period);
  const responsibilities = thUsers.selected
    ? await loadResponsibilities(thUsers.selected.id, period.empresa_id)
    : [];
  const pr1Scope = await loadPr1Scope();
  const internalCoverageRows = await loadInternalCoverageRows();
  const turnRelations = await loadTurnRelations();
  const turnMovements = await loadTurnMovements();
  const dateDiagnostics = await loadPeriodDateDiagnostics();

  const thUser =
    thUsers.selected === null
      ? null
      : {
          id: thUsers.selected.id,
          correo: thUsers.selected.correo,
          nombre: thUsers.selected.nombre,
          permissions: thUsers.selected.permissions ?? [],
          roles: thUsers.selected.roles ?? [],
        };

  const { server, baseUrl } = await listen();
  try {
    const httpAudit = await runHttpAudit({ baseUrl, period, thUser });

    const report = {
      generated_at: new Date().toISOString(),
      period,
      th_user_candidates: thUsers.candidates,
      th_user_selected: thUser,
      th_responsibilities: responsibilities,
      pr1_scope: pr1Scope,
      internal_coverage_novedades: internalCoverageRows,
      nomina_novedad_turnos: turnRelations,
      turno_movimientos: turnMovements,
      date_diagnostics: dateDiagnostics,
      http_audit: httpAudit.map(({ body, ...rest }) => rest),
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close((error) => {
        if (error) {
          rejectClose(error);
          return;
        }
        resolveClose();
      });
    });
    await pool.end();
  }
};

void main().catch((error) => {
  console.error(error);
  void pool.end().catch(() => undefined);
  process.exitCode = 1;
});

