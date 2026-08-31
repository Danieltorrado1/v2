import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: '.env.qa' });

const baseUrl = 'http://127.0.0.1:4010/api';
const email = 'gestor.qa@empiria.example';
const password = 'GestorQA123456*';

type ApiEnvelope<T> = {
  data: T;
  message?: string;
  success?: boolean;
};

type LoginResponse = {
  accessToken: string;
  user: {
    roles: string[];
    permissions: string[];
  };
};

type NominaPeriodo = {
  id: string;
  nombre_periodo: string;
  fecha_inicio: string;
  fecha_fin: string;
};

type NominaEmpleado = {
  id: string;
  vinculacion_id: string;
};

type TipoNovedad = {
  id: string;
  codigo_operativo?: string | null;
  requiere_fechas?: boolean;
  requiere_dias?: boolean;
  requiere_horas?: boolean;
  requiere_valor?: boolean;
  activo?: boolean;
};

type NominaNovedad = {
  id: string;
  nomina_empleado_id: string;
  observacion?: string | null;
  activo: boolean;
};

const PREFERRED_OPERATIONAL_CODES = new Set(['L50', 'PR1', 'PR2', 'PR3', 'PR4', 'PNR', 'S']);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function request<T>(path: string, init?: RequestInit): Promise<{ status: number; body: ApiEnvelope<T> | { error?: string; message?: string } }> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = (await response.json()) as ApiEnvelope<T> | { error?: string; message?: string };
  return { status: response.status, body };
}

function enumerateDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const limit = new Date(`${end}T00:00:00.000Z`);

  while (cursor <= limit) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

async function main() {
  const skippedChecks: string[] = [];
  const login = await request<LoginResponse>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  assert.equal(login.status, 200, 'login must succeed');
  const token = (login.body as ApiEnvelope<LoginResponse>).data.accessToken;
  const user = (login.body as ApiEnvelope<LoginResponse>).data.user;
  assert.deepEqual(user.roles, ['GESTOR']);
  assert.ok(user.permissions.includes('nomina.operativa.read'));
  assert.ok(user.permissions.includes('nomina.novedades.create'));
  assert.ok(user.permissions.includes('nomina.novedades.update'));
  assert.ok(!user.permissions.includes('nomina.read'));

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const client = await pool.connect();
  let createdNovedadId: string | null = null;

  try {
    const visibleEmployeeQuery = await client.query<{
      periodo_id: string;
      nombre_periodo: string;
      fecha_inicio: string;
      fecha_fin: string;
      nomina_empleado_id: string;
      vinculacion_id: string;
    }>(
      `
        SELECT
          np.id::text AS periodo_id,
          np.nombre_periodo,
          np.fecha_inicio::text,
          np.fecha_fin::text,
          ne.id::text AS nomina_empleado_id,
          ne.vinculacion_id::text AS vinculacion_id
        FROM nomina_empleados ne
        INNER JOIN nomina_periodos np ON np.id = ne.periodo_id
        INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id
        INNER JOIN cobertura_asignaciones ca ON ca.vinculacion_id = v.id
        INNER JOIN focalizacion_final ff ON ff.id = ca.focalizacion_final_id
        WHERE np.contrato_id = 3
          AND ff.municipio_id = 110
          AND ca.fecha_inicio <= np.fecha_fin
          AND (ca.fecha_fin IS NULL OR ca.fecha_fin >= np.fecha_inicio)
        ORDER BY np.fecha_inicio DESC, ne.id ASC
        LIMIT 1
      `,
    );
    assert.ok(visibleEmployeeQuery.rows[0], 'must find at least one in-scope employee');
    const visibleDb = visibleEmployeeQuery.rows[0];

    const outsiderEmployeeQuery = await client.query<{
      periodo_id: string;
      nomina_empleado_id: string;
      vinculacion_id: string;
    }>(
      `
        SELECT
          ne.periodo_id::text AS periodo_id,
          ne.id::text AS nomina_empleado_id,
          ne.vinculacion_id::text AS vinculacion_id
        FROM nomina_empleados ne
        INNER JOIN nomina_periodos np ON np.id = ne.periodo_id
        WHERE np.contrato_id <> 3
        ORDER BY np.fecha_inicio DESC, ne.id ASC
        LIMIT 1
      `
    );
    const outsiderDb = outsiderEmployeeQuery.rows[0] ?? null;

    const outsiderNovedadQuery = await client.query<{ id: string }>(
      `
        SELECT nn.id::text AS id
        FROM nomina_novedades nn
        INNER JOIN nomina_empleados ne ON ne.id = nn.nomina_empleado_id
        INNER JOIN nomina_periodos np ON np.id = nn.periodo_id
        WHERE np.contrato_id <> 3
          AND COALESCE(nn.activo, TRUE) = TRUE
        ORDER BY nn.id ASC
        LIMIT 1
      `,
    );

    const periodos = await request<{ items: NominaPeriodo[] }>('/nomina/periodos', {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(periodos.status, 200, 'GESTOR must list periods');
    const periodItems = (periodos.body as ApiEnvelope<{ items: NominaPeriodo[] }>).data.items;
    assert.ok(periodItems.some((item) => item.id === visibleDb.periodo_id), 'in-scope period must be visible');

    const periodo = await request<NominaPeriodo>(`/nomina/periodos/${visibleDb.periodo_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(periodo.status, 200, 'GESTOR must open period detail');
    const periodoData = (periodo.body as ApiEnvelope<NominaPeriodo>).data;

    const empleados = await request<{ items: NominaEmpleado[] }>(`/nomina/periodos/${visibleDb.periodo_id}/empleados-operativos`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(empleados.status, 200, 'GESTOR must list operational employees');
    const employeeItems = (empleados.body as ApiEnvelope<{ items: NominaEmpleado[] }>).data.items;
    assert.ok(employeeItems.some((item) => item.id === visibleDb.nomina_empleado_id), 'in-scope employee must be listed');
    if (outsiderDb) {
      assert.ok(!employeeItems.some((item) => item.id === outsiderDb.nomina_empleado_id), 'out-of-scope employee must not be listed');
    } else {
      skippedChecks.push('out-of-scope-employee-list-live');
    }

    const novedades = await request<{ items: NominaNovedad[] }>(`/nomina/novedades?periodo_id=${encodeURIComponent(visibleDb.periodo_id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(novedades.status, 200, 'GESTOR must list novelties');
    const novedadItems = (novedades.body as ApiEnvelope<{ items: NominaNovedad[] }>).data.items;
    if (outsiderDb) {
      assert.ok(!novedadItems.some((item) => item.nomina_empleado_id === outsiderDb.nomina_empleado_id), 'out-of-scope novelties must not leak');
    } else {
      skippedChecks.push('out-of-scope-novedades-live');
    }

    const tipos = await request<{ items: TipoNovedad[] }>('/nomina/tipos-novedad?page=1&limit=50&activo=true', {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(tipos.status, 200, 'GESTOR must list novelty types');
    const tipo =
      (tipos.body as ApiEnvelope<{ items: TipoNovedad[] }>).data.items.find(
        (item) => item.activo !== false && item.codigo_operativo && PREFERRED_OPERATIONAL_CODES.has(item.codigo_operativo),
      ) ??
      (tipos.body as ApiEnvelope<{ items: TipoNovedad[] }>).data.items.find(
        (item) => item.activo !== false && item.codigo_operativo,
      ) ??
      (tipos.body as ApiEnvelope<{ items: TipoNovedad[] }>).data.items.find((item) => item.activo !== false);
    assert.ok(tipo, 'must find one active novelty type');

    let availableDate = periodoData.fecha_inicio;
    const occupiedRanges = await client.query<{ fecha_inicio: string | null; fecha_fin: string | null }>(
      `
        SELECT fecha_inicio::text, fecha_fin::text
        FROM nomina_novedades
        WHERE nomina_empleado_id = $1::bigint
          AND COALESCE(activo, TRUE) = TRUE
      `,
      [visibleDb.nomina_empleado_id],
    );
    const occupiedDays = new Set<string>();
    for (const row of occupiedRanges.rows) {
      const start = row.fecha_inicio ?? periodoData.fecha_inicio;
      const end = row.fecha_fin ?? row.fecha_inicio ?? start;
      for (const date of enumerateDates(start, end)) {
        occupiedDays.add(date);
      }
    }
    const freeDate = enumerateDates(periodoData.fecha_inicio, periodoData.fecha_fin).find((date) => !occupiedDays.has(date));
    if (freeDate) {
      availableDate = freeDate;
    }

    const createPayload: Record<string, unknown> = {
      periodo_id: visibleDb.periodo_id,
      nomina_empleado_id: visibleDb.nomina_empleado_id,
      vinculacion_id: visibleDb.vinculacion_id,
      tipo_novedad_id: tipo.id,
      tipo_novedad_codigo: tipo.codigo_operativo ?? null,
      revisado: false,
      requiere_cobertura: true,
      cubierta: false,
      cobertura: {
        tipo_cobertura: 'SIN_REEMPLAZO',
      },
      activo: true,
      observacion: 'QA gestor cobertura create',
    };

    if (tipo.requiere_fechas) {
      createPayload.fecha_inicio = availableDate;
      createPayload.fecha_fin = availableDate;
    }
    if (tipo.requiere_dias) {
      createPayload.dias = 1;
    }
    if (tipo.requiere_horas) {
      createPayload.horas = 8;
    }
    if (tipo.requiere_valor) {
      createPayload.valor_manual = 1;
    }

    const created = await request<NominaNovedad>('/nomina/novedades', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(createPayload),
    });
    if (created.status !== 201) {
      console.error('CREATE_FAILURE', JSON.stringify(created.body, null, 2));
    }
    assert.equal(created.status, 201, 'GESTOR must create in-scope novelty');
    createdNovedadId = (created.body as ApiEnvelope<NominaNovedad>).data.id;

    const updated = await request<NominaNovedad>(`/nomina/novedades/${createdNovedadId}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ observacion: 'QA gestor cobertura update' }),
    });
    if (updated.status !== 200) {
      console.error('UPDATE_FAILURE', JSON.stringify(updated.body, null, 2));
    }
    assert.equal(updated.status, 200, 'GESTOR must update in-scope novelty');
    assert.equal((updated.body as ApiEnvelope<NominaNovedad>).data.observacion, 'QA gestor cobertura update');

    if (outsiderDb) {
      const outsiderCreatePayload = {
        ...createPayload,
        periodo_id: outsiderDb.periodo_id,
        nomina_empleado_id: outsiderDb.nomina_empleado_id,
        vinculacion_id: outsiderDb.vinculacion_id,
        observacion: 'QA out of scope should fail',
      };
      const outsiderCreate = await request('/nomina/novedades', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(outsiderCreatePayload),
      });
      assert.equal(outsiderCreate.status, 403, 'GESTOR must not create novelty outside scope');
    } else {
      skippedChecks.push('out-of-scope-create-live');
    }

    if (outsiderNovedadQuery.rows[0]) {
      const outsiderUpdate = await request(`/nomina/novedades/${outsiderNovedadQuery.rows[0].id}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ observacion: 'QA out of scope patch should fail' }),
      });
      assert.equal(outsiderUpdate.status, 403, 'GESTOR must not update novelty outside scope');
    } else {
      skippedChecks.push('out-of-scope-update-live');
    }

    const empleadosEconomicos = await request(`/nomina/periodos/${visibleDb.periodo_id}/empleados`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(empleadosEconomicos.status, 403, 'GESTOR must not access economic employee list');

    const desprendibles = await request(`/nomina/desprendibles/${visibleDb.periodo_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(desprendibles.status, 403, 'GESTOR must not access payroll slips');

    const deactivated = await request<NominaNovedad>(`/nomina/novedades/${createdNovedadId}/deactivate`, {
      method: 'PATCH',
      headers: authHeaders,
    });
    assert.equal(deactivated.status, 200, 'GESTOR must deactivate in-scope novelty when permission exists');
  } finally {
    client.release();
    await pool.end();
  }

  console.log(JSON.stringify({
    ok: true,
    skippedChecks,
    checks: [
      'login',
      'periodos',
      'empleados-operativos',
      'novedades-list',
      'novedad-create',
      'novedad-update',
      'out-of-scope-create-blocked',
      'out-of-scope-update-blocked',
      'economic-list-blocked',
      'desprendibles-blocked',
      'novedad-deactivate',
    ],
  }, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
