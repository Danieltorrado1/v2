import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import { chromium } from 'playwright-core';

const envPath = fileURLToPath(new URL('../.env.qa', import.meta.url));
dotenv.config({ path: envPath });

const { Client } = pg;
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const API = 'http://localhost:4000/api';
const BASE_URL = 'http://localhost:5173';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const EMPRESA_ID = '3';
const CONTRATO_ID = '3';
const LOGIN_EMAIL = 'admin@empiria.local';
const LOGIN_PASSWORD = 'Admin123456*';
const TAG = `QA_CAT_REAL_${Date.now()}`;
const REPORT_PATH = fileURLToPath(new URL('../tmp/qa-categorias-real-report.json', import.meta.url));
const SCREENSHOT_BASE = fileURLToPath(new URL('../tmp/qa-categorias-real-base.png', import.meta.url));
const SCREENSHOT_FINAL = fileURLToPath(new URL('../tmp/qa-categorias-real-final.png', import.meta.url));

const report = {
  generated_at: new Date().toISOString(),
  tag: TAG,
  environment: {},
  tests: {},
  evidence: {},
  cleanup: {},
  errors: [],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalize = (value) => (value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();
const toDate = (value) => new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
const isoDate = (date) => date.toISOString().slice(0, 10);
const addDays = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};
const compareFields = (before, after, fields) =>
  fields.filter((field) => JSON.stringify(before?.[field] ?? null) !== JSON.stringify(after?.[field] ?? null));

async function dbAll(sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows;
}

async function login() {
  const response = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD }),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok || !body?.data?.accessToken || !body?.data?.user) {
    throw new Error(`QA login failed (${response.status}): ${text}`);
  }
  return body.data;
}

async function api(path, accessToken, options = {}) {
  const response = await fetch(`${API}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

async function getCategories() {
  return dbAll(`
    select
      ncs.id::text as id,
      ncs.contrato_id::text as contrato_id,
      ncs.codigo_categoria,
      ncs.nombre_categoria,
      ncs.modalidad,
      ncs.descripcion,
      ncs.salario_base,
      ncs.auxilio_transporte,
      ncs.otros_recargos,
      ncs.vigente_desde::text as vigente_desde,
      ncs.vigente_hasta::text as vigente_hasta,
      coalesce(ncs.activo, true) as activo,
      c.numero_contrato
    from nomina_categorias_salariales ncs
    inner join contratos c on c.id = ncs.contrato_id
    where ncs.contrato_id = $1::bigint
    order by ncs.codigo_categoria asc, ncs.vigente_desde asc, ncs.id asc
  `, [CONTRATO_ID]);
}

async function getCategoryById(categoryId) {
  const rows = await dbAll(`
    select
      ncs.id::text as id,
      ncs.contrato_id::text as contrato_id,
      ncs.codigo_categoria,
      ncs.nombre_categoria,
      ncs.modalidad,
      ncs.descripcion,
      ncs.salario_base,
      ncs.auxilio_transporte,
      ncs.otros_recargos,
      ncs.vigente_desde::text as vigente_desde,
      ncs.vigente_hasta::text as vigente_hasta,
      coalesce(ncs.activo, true) as activo,
      c.numero_contrato
    from nomina_categorias_salariales ncs
    inner join contratos c on c.id = ncs.contrato_id
    where ncs.id = $1::bigint
    limit 1
  `, [categoryId]);
  return rows[0] ?? null;
}

async function getEmployeeItems(accessToken, periodId) {
  const response = await api(`/nomina/periodos/${periodId}/empleados?page=1&limit=100`, accessToken);
  return response.body?.data?.items ?? [];
}

function mapEmployee(item) {
  return {
    nomina_empleado_id: String(item.id),
    periodo_id: String(item.periodo_id ?? ''),
    persona_id: item.persona?.id ? String(item.persona.id) : null,
    vinculacion_id: item.vinculacion?.id ? String(item.vinculacion.id) : null,
    nombre: item.persona?.nombre_completo ?? null,
    documento: item.persona?.numero_documento ?? null,
    cargo: item.cargo?.nombre_cargo ?? null,
    modalidad: item.modalidad ?? item.contexto_operativo?.modalidad_codigo ?? null,
    municipio: item.municipio ?? item.contexto_operativo?.municipio ?? null,
    institucion: item.institucion ?? item.contexto_operativo?.institucion ?? null,
    sede: item.sede?.nombre_sede ?? item.contexto_operativo?.sede ?? null,
    categoria_salarial_id_actual: item.categoria_salarial?.id ? String(item.categoria_salarial.id) : null,
    categoria_actual_codigo: item.categoria_salarial?.codigo_categoria ?? null,
    salario_actual: item.salario_base ?? null,
    auxilio_transporte_actual: item.auxilio_transporte ?? null,
    recargo_mensual_actual: item.categoria_salarial?.otros_recargos ?? null,
    metodo_pago: item.vinculacion?.metodo_pago ?? null,
    estado_vinculacion: item.vinculacion?.estado_vinculacion ?? null,
    devengado_basico: item.devengado_basico ?? null,
    devengado_transporte: item.devengado_transporte ?? null,
    devengado_otros: item.devengado_otros ?? null,
    total_devengado: item.total_adiciones ?? null,
    total_deducciones: item.total_deducciones ?? null,
    neto_pagar: item.neto_pagar ?? null,
  };
}

async function getEmployeeState(accessToken, periodId, employeeId) {
  const items = await getEmployeeItems(accessToken, periodId);
  const item = items.find((entry) => String(entry.id) === String(employeeId));
  return item ? mapEmployee(item) : null;
}

async function getEmployeeDbState(employeeId) {
  const rows = await dbAll(`
    select
      ne.id::text as nomina_empleado_id,
      ne.periodo_id::text as periodo_id,
      ne.vinculacion_id::text as vinculacion_id,
      ne.categoria_salarial_id::text as categoria_salarial_id,
      ne.salario_base,
      ne.auxilio_transporte,
      ne.devengado_basico,
      ne.devengado_transporte,
      ne.devengado_otros,
      ne.total_adiciones,
      ne.total_deducciones,
      ne.neto_pagar,
      v.persona_id::text as persona_id,
      v.metodo_pago,
      v.estado_vinculacion,
      cc.nombre_cargo as cargo,
      p.numero_documento,
      trim(concat_ws(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido)) as nombre,
      ncs.codigo_categoria,
      ncs.nombre_categoria,
      ncs.otros_recargos as categoria_recargo_mensual
    from nomina_empleados ne
    join vinculaciones v on v.id = ne.vinculacion_id
    join personas p on p.id = v.persona_id
    left join contrato_cargos cc on cc.id = v.contrato_cargo_id
    left join nomina_categorias_salariales ncs on ncs.id = ne.categoria_salarial_id
    where ne.id = $1::bigint
    limit 1
  `, [employeeId]);
  return rows[0] ?? null;
}

async function getAuditEvents(entity, entityId, action) {
  return dbAll(`
    select
      usuario_id::text as usuario_id,
      empresa_id::text as empresa_id,
      contrato_id::text as contrato_id,
      modulo,
      entidad,
      entidad_id,
      accion,
      descripcion,
      datos_anteriores,
      datos_nuevos,
      fecha_evento::text as fecha_evento
    from auditoria_eventos
    where entidad = $1
      and entidad_id = $2
      and accion = $3
    order by fecha_evento desc
    limit 10
  `, [entity, String(entityId), action]);
}

async function getLegacyAudit(table, recordId, action) {
  return dbAll(`
    select
      usuario_id::text as usuario_id,
      accion,
      tabla_afectada,
      registro_id::text as registro_id,
      descripcion,
      datos_anteriores,
      datos_nuevos,
      created_at::text as created_at
    from auditoria
    where tabla_afectada = $1
      and registro_id = $2::bigint
      and accion = $3
    order by created_at desc
    limit 10
  `, [table, String(recordId), action]);
}

function assignmentCard(page) {
  return page.locator('.adm-card').filter({ hasText: /Asignación operativa de categorías|Asignacion operativa de categorias/i }).first();
}

function fieldControl(card, labelPattern, selector = 'input,select,textarea') {
  return card.locator('.adm-field').filter({ hasText: labelPattern }).locator(selector).first();
}

async function openSalaryCategories(page) {
  await page.goto(`${BASE_URL}/admin`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Nómina|Nomina/i }).click();
  await page.waitForSelector('.cg-cat-tabs button');
  await page.locator('.cg-cat-tabs').getByRole('button', { name: /CATEGORÍAS SALARIALES|CATEGORIAS SALARIALES/i }).click();
  await page.getByRole('heading', { name: /Categorías salariales|Categorias salariales/i }).waitFor();
  await sleep(1200);
}

async function setAssignmentFilters(page, values) {
  const card = assignmentCard(page);
  if (values.periodo_id !== undefined) {
    await fieldControl(card, /^Periodo$/i, 'select').selectOption(String(values.periodo_id));
  }
  if (values.target_category_id !== undefined) {
    await fieldControl(card, /Categoría destino|Categoria destino/i, 'select').selectOption(String(values.target_category_id));
  }
  if (values.observacion !== undefined) {
    await fieldControl(card, /Observación de auditoría|Observacion de auditoria/i, 'input').fill(String(values.observacion));
  }
  if (values.search !== undefined) {
    await fieldControl(card, /Buscar trabajador/i, 'input').fill(String(values.search));
  }
  if (values.cargo !== undefined) {
    await fieldControl(card, /^Cargo$/i, 'input').fill(String(values.cargo));
  }
  if (values.municipio !== undefined) {
    await fieldControl(card, /^Municipio$/i, 'input').fill(String(values.municipio));
  }
  if (values.institucion !== undefined) {
    await fieldControl(card, /Institución|Institucion/i, 'input').fill(String(values.institucion));
  }
  if (values.sede !== undefined) {
    await fieldControl(card, /^Sede$/i, 'input').fill(String(values.sede));
  }
  if (values.metodo_pago !== undefined) {
    await fieldControl(card, /Método de pago|Metodo de pago/i, 'input').fill(String(values.metodo_pago));
  }
}

async function previewAssignment(page) {
  const card = assignmentCard(page);
  const responsePromise = page.waitForResponse((response) =>
    response.url().includes('/assignments/preview') && response.request().method() === 'POST'
  );
  await card.getByRole('button', { name: /Previsualizar selección|Previsualizar seleccion/i }).click();
  const response = await responsePromise;
  let body = null;
  try { body = await response.json(); } catch {}
  await sleep(1200);
  const rowTexts = await card.locator('table.adm-history tbody tr').evaluateAll((nodes) =>
    nodes.map((node) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '')
  ).catch(() => []);
  const statuses = await card.locator('[role="status"]').evaluateAll((nodes) =>
    nodes.map((node) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '')
  ).catch(() => []);
  const alerts = await card.locator('[role="alert"]').evaluateAll((nodes) =>
    nodes.map((node) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '')
  ).catch(() => []);
  const selectedKpi = await card.locator('.adm-kpi.primary .adm-kpi-val').first().innerText().catch(() => null);
  return { status: response.status(), body, rowTexts, statuses, alerts, selectedKpi };
}

async function applyAssignment(page) {
  const card = assignmentCard(page);
  const responsePromise = page.waitForResponse((response) =>
    response.url().includes('/assignments/apply') && response.request().method() === 'POST'
  );
  await card.getByRole('button', { name: /Asignar categoría seleccionada|Asignar categoria seleccionada|Retirar categoría|Retirar categoria/i }).click();
  const response = await responsePromise;
  let body = null;
  try { body = await response.json(); } catch {}
  await sleep(1500);
  const statuses = await card.locator('[role="status"]').evaluateAll((nodes) =>
    nodes.map((node) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '')
  ).catch(() => []);
  const alerts = await card.locator('[role="alert"]').evaluateAll((nodes) =>
    nodes.map((node) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '')
  ).catch(() => []);
  return { status: response.status(), body, statuses, alerts };
}

function findTargetCategory(categories, period) {
  const start = String(period.fecha_inicio).slice(0, 10);
  const end = String(period.fecha_fin).slice(0, 10);
  return categories.find((row) =>
    row.activo === true &&
    String(row.contrato_id) === String(period.contrato_id) &&
    row.codigo_categoria !== 'QA_CAA1' &&
    String(row.vigente_desde).slice(0, 10) <= end &&
    (!row.vigente_hasta || String(row.vigente_hasta).slice(0, 10) >= start)
  ) ?? null;
}

let browser;

try {
  const auth = await login();
  const accessToken = auth.accessToken;
  const me = await api('/auth/me', accessToken);
  const tenant = await api('/tenant/me', accessToken);
  const periodsResponse = await api(`/nomina/periodos?page=1&limit=100&empresa_id=${EMPRESA_ID}`, accessToken);
  const categoriesBefore = await getCategories();
  const periods = periodsResponse.body?.data?.items ?? [];
  const openPeriod = periods.find((item) => item.estado === 'ABIERTO' && String(item.contrato_id) === CONTRATO_ID) ?? periods.find((item) => String(item.contrato_id) === CONTRATO_ID) ?? periods[0] ?? null;
  if (!openPeriod) {
    throw new Error('No se encontró periodo real para la empresa/contrato QA.');
  }

  const employees = await getEmployeeItems(accessToken, openPeriod.id);
  const targetCategory = findTargetCategory(categoriesBefore, openPeriod);
  if (!targetCategory) {
    throw new Error('No se encontró categoría destino válida para el periodo real.');
  }

  const primaryEmployeeItem = employees.find((item) => String(item.id) === '4' && String(item.categoria_salarial?.id ?? '') !== String(targetCategory.id))
    ?? employees.find((item) => String(item.categoria_salarial?.id ?? '') !== String(targetCategory.id))
    ?? employees[0];
  const secondaryEmployeeItem = employees.find((item) => String(item.id) === '2')
    ?? employees.find((item) => String(item.id) !== String(primaryEmployeeItem?.id))
    ?? null;
  if (!primaryEmployeeItem) {
    throw new Error('No se encontró trabajador QA para probar asignación individual.');
  }

  const primaryWorker = mapEmployee(primaryEmployeeItem);
  const originalCategoryId = primaryWorker.categoria_salarial_id_actual;
  const baseCategory = categoriesBefore.find((row) => String(row.id) === String(originalCategoryId))
    ?? categoriesBefore.find((row) => row.codigo_categoria === 'QA_CAA1' && String(row.vigente_desde).startsWith('2099-08-01'))
    ?? categoriesBefore[0];
  if (!baseCategory) {
    throw new Error('No se encontró categoría base para PATCH/traslapes.');
  }

  report.environment = {
    entorno: {
      backend: API,
      frontend: BASE_URL,
      browser: EDGE_PATH,
      fecha_prueba: new Date().toISOString(),
    },
    empresa: tenant.body?.data?.empresas?.find((row) => String(row.id) === EMPRESA_ID) ?? null,
    contrato: tenant.body?.data?.contratos?.find((row) => String(row.id) === CONTRATO_ID) ?? null,
    periodo: openPeriod,
    categoria_base: baseCategory,
    categoria_destino: targetCategory,
    trabajadores: [primaryWorker, secondaryEmployeeItem ? mapEmployee(secondaryEmployeeItem) : null].filter(Boolean),
    permisos_usuario: me.body?.data?.permissions ?? auth.user.permissions ?? [],
  };

  browser = await chromium.launch({ headless: true, executablePath: EDGE_PATH });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1800 } });
  await context.addInitScript(({ accessToken, user, empresaId }) => {
    window.localStorage.setItem('empiria_access_token', accessToken);
    window.localStorage.setItem('empiria_auth_user', JSON.stringify(user));
    window.localStorage.setItem('empiria_empresa_id', empresaId);
  }, { accessToken, user: auth.user, empresaId: EMPRESA_ID });
  const page = await context.newPage();
  page.on('pageerror', (error) => report.errors.push({ type: 'pageerror', message: error.message }));
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) {
      report.errors.push({ type: `console:${message.type()}`, message: message.text() });
    }
  });

  await openSalaryCategories(page);
  await page.screenshot({ path: SCREENSHOT_BASE, fullPage: true });

  const cards = await page.locator('.adm-card').evaluateAll((nodes) =>
    nodes.map((node, index) => ({
      index,
      heading: node.querySelector('h2,h3')?.textContent?.trim() ?? null,
      select_count: node.querySelectorAll('select.adm-select').length,
      button_texts: Array.from(node.querySelectorAll('button')).map((button) => button.textContent?.replace(/\s+/g, ' ').trim() ?? '').filter(Boolean),
    }))
  );
  const assignmentUiCard = cards.find((item) => normalize(item.heading).includes('ASIGNACION OPERATIVA DE CATEGORIAS')) ?? null;
  const oldTimeoutCard = cards.find((item) => item.index === 1) ?? null;
  const assignmentCardLocator = assignmentCard(page);
  const periodOptions = await fieldControl(assignmentCardLocator, /^Periodo$/i, 'select').evaluate((node) =>
    Array.from(node.options).map((option) => ({ value: option.value, text: option.textContent?.trim() ?? '' }))
  );

  report.tests.timeout_select_adm_select = {
    status: assignmentUiCard?.select_count >= 2 ? 'PASS' : 'FAIL',
    evidence: {
      card_summary: cards,
      old_selector_card: oldTimeoutCard,
      resolved_card: assignmentUiCard,
      resolved_by: 'Uso de tarjeta por heading visible y no por índice .adm-card nth(1).',
      period_options_count: periodOptions.length,
    },
    detail: oldTimeoutCard?.select_count === 0
      ? 'El timeout histórico proviene del harness: .adm-card nth(1) apunta a la tarjeta de listado, que hoy no contiene select.adm-select. La tarjeta correcta es la de “Asignación operativa de categorías”.'
      : 'No se pudo confirmar la causa estructural del timeout histórico.',
  };

  const patchTag = `[${TAG}_PATCH]`;
  const originalDescription = baseCategory.descripcion ?? '';
  const patchedDescription = `${originalDescription} ${patchTag}`.trim();
  const patchResponse = await api(`/company-settings/${EMPRESA_ID}/salary-categories/${baseCategory.id}`, accessToken, {
    method: 'PATCH',
    body: { descripcion: patchedDescription },
  });
  const patchAfter = await getCategoryById(baseCategory.id);
  const patchAudit = (await getAuditEvents('nomina_categorias_salariales', baseCategory.id, 'UPDATE')).find((row) => JSON.stringify(row.datos_nuevos ?? {}).includes(patchTag)) ?? null;
  const patchLegacy = (await getLegacyAudit('nomina_categorias_salariales', baseCategory.id, 'UPDATE')).find((row) => JSON.stringify(row.datos_nuevos ?? {}).includes(patchTag)) ?? null;
  report.tests.patch_persistencia = {
    status: patchResponse.status === 200 && patchAfter?.descripcion === patchedDescription ? 'PASS' : 'FAIL',
    http_status: patchResponse.status,
    before: baseCategory,
    after: patchAfter,
    persisted: patchAfter?.descripcion === patchedDescription,
    same_record: patchAfter?.id === baseCategory.id,
    audit_event: patchAudit,
    audit_legacy: patchLegacy,
  };

  const rangesForCode = categoriesBefore.filter((row) => row.codigo_categoria === baseCategory.codigo_categoria && row.activo === true && row.vigente_hasta);
  const lastEnd = rangesForCode.map((row) => toDate(row.vigente_hasta)).sort((a, b) => a - b).at(-1) ?? toDate(baseCategory.vigente_hasta ?? baseCategory.vigente_desde);
  const contiguousStart = addDays(lastEnd, 1);
  const contiguousEnd = addDays(contiguousStart, 29);
  const separatedStart = addDays(contiguousEnd, 1);
  const separatedEnd = addDays(separatedStart, 29);
  const overlapPartialStart = addDays(contiguousStart, 10);
  const overlapPartialEnd = addDays(separatedStart, 10);
  const overlapContainedStart = addDays(contiguousStart, 5);
  const overlapContainedEnd = addDays(contiguousStart, 12);
  const overlapPatchStart = addDays(contiguousEnd, -5);

  const overlapBasePayload = {
    contrato_id: Number(CONTRATO_ID),
    codigo_categoria: baseCategory.codigo_categoria,
    nombre_categoria: baseCategory.nombre_categoria,
    modalidad: baseCategory.modalidad,
    salario_base: Number(baseCategory.salario_base),
    auxilio_transporte: Number(baseCategory.auxilio_transporte),
    otros_recargos: Number(baseCategory.otros_recargos ?? 0),
    activo: true,
  };

  const contiguousCreate = await api(`/company-settings/${EMPRESA_ID}/salary-categories`, accessToken, {
    method: 'POST',
    body: {
      ...overlapBasePayload,
      descripcion: `${TAG} vigencia contigua`,
      vigente_desde: isoDate(contiguousStart),
      vigente_hasta: isoDate(contiguousEnd),
    },
  });
  const contiguousCategory = contiguousCreate.body?.data ? await getCategoryById(contiguousCreate.body.data.id) : null;

  const separatedCreate = await api(`/company-settings/${EMPRESA_ID}/salary-categories`, accessToken, {
    method: 'POST',
    body: {
      ...overlapBasePayload,
      descripcion: `${TAG} vigencia separada`,
      vigente_desde: isoDate(separatedStart),
      vigente_hasta: isoDate(separatedEnd),
    },
  });
  const separatedCategory = separatedCreate.body?.data ? await getCategoryById(separatedCreate.body.data.id) : null;

  const partialOverlap = await api(`/company-settings/${EMPRESA_ID}/salary-categories`, accessToken, {
    method: 'POST',
    body: {
      ...overlapBasePayload,
      descripcion: `${TAG} traslape parcial`,
      vigente_desde: isoDate(overlapPartialStart),
      vigente_hasta: isoDate(overlapPartialEnd),
    },
  });

  const containedOverlap = await api(`/company-settings/${EMPRESA_ID}/salary-categories`, accessToken, {
    method: 'POST',
    body: {
      ...overlapBasePayload,
      descripcion: `${TAG} traslape contenido`,
      vigente_desde: isoDate(overlapContainedStart),
      vigente_hasta: isoDate(overlapContainedEnd),
    },
  });

  const patchOverlap = separatedCategory
    ? await api(`/company-settings/${EMPRESA_ID}/salary-categories/${separatedCategory.id}`, accessToken, {
        method: 'PATCH',
        body: { vigente_desde: isoDate(overlapPatchStart) },
      })
    : { status: 0, body: null };

  report.tests.traslapes_vigencias = {
    status: contiguousCreate.status === 201 && separatedCreate.status === 201 && partialOverlap.status === 409 && containedOverlap.status === 409 && patchOverlap.status === 409 ? 'PASS' : 'FAIL',
    contiguous: { status: contiguousCreate.status, category: contiguousCategory },
    separated: { status: separatedCreate.status, category: separatedCategory },
    partial_overlap: { status: partialOverlap.status, body: partialOverlap.body },
    contained_overlap: { status: containedOverlap.status, body: containedOverlap.body },
    patch_overlap: { status: patchOverlap.status, body: patchOverlap.body },
  };

  await setAssignmentFilters(page, {
    periodo_id: String(openPeriod.id),
    target_category_id: String(targetCategory.id),
    observacion: `${TAG} preview`,
    search: primaryWorker.documento ?? '',
    cargo: primaryWorker.cargo?.split(' ')[0] ?? '',
    municipio: primaryWorker.municipio ? primaryWorker.municipio.slice(0, 5) : '',
    institucion: primaryWorker.institucion ? primaryWorker.institucion.slice(0, 18) : '',
    sede: primaryWorker.sede ? primaryWorker.sede.slice(0, 15) : '',
    metodo_pago: primaryWorker.metodo_pago ?? '',
  });
  const previewFiltered = await previewAssignment(page);
  report.tests.periodos_reales = {
    status: periodOptions.some((option) => String(option.value) === String(openPeriod.id)) ? 'PASS' : 'FAIL',
    selected_period_id: await fieldControl(assignmentCardLocator, /^Periodo$/i, 'select').inputValue(),
    ui_options: periodOptions,
    api_periods: periods,
  };
  report.tests.preview = {
    status: previewFiltered.status === 200 && (previewFiltered.body?.data?.items?.length ?? 0) >= 1 ? 'PASS' : 'FAIL',
    response_status: previewFiltered.status,
    response: previewFiltered.body?.data ?? null,
    row_texts: previewFiltered.rowTexts,
    statuses: previewFiltered.statuses,
    alerts: previewFiltered.alerts,
  };

  const beforeApplyApi = await getEmployeeState(accessToken, openPeriod.id, primaryWorker.nomina_empleado_id);
  const beforeApplyDb = await getEmployeeDbState(primaryWorker.nomina_empleado_id);
  const card = assignmentCard(page);
  await card.locator('table.adm-history tbody tr').first().locator('input[type="checkbox"]').check();
  const applyResponse = await applyAssignment(page);
  const afterApplyApi = await getEmployeeState(accessToken, openPeriod.id, primaryWorker.nomina_empleado_id);
  const afterApplyDb = await getEmployeeDbState(primaryWorker.nomina_empleado_id);
  const applyAudit = (await getAuditEvents('nomina_empleados', primaryWorker.nomina_empleado_id, 'NOMINA_EMPLEADO_CATEGORY_ASSIGN')).find((row) => row.descripcion === `${TAG} apply`) ?? (await getAuditEvents('nomina_empleados', primaryWorker.nomina_empleado_id, 'NOMINA_EMPLEADO_CATEGORY_ASSIGN'))[0] ?? null;
  const applyLegacy = (await getLegacyAudit('nomina_empleados', primaryWorker.nomina_empleado_id, 'NOMINA_EMPLEADO_CATEGORY_ASSIGN')).find((row) => row.descripcion === `${TAG} apply`) ?? (await getLegacyAudit('nomina_empleados', primaryWorker.nomina_empleado_id, 'NOMINA_EMPLEADO_CATEGORY_ASSIGN'))[0] ?? null;

  const operationalFields = ['persona_id', 'vinculacion_id', 'nombre', 'documento', 'cargo', 'modalidad', 'municipio', 'institucion', 'sede', 'metodo_pago', 'estado_vinculacion'];
  const economicFields = ['salario_actual', 'auxilio_transporte_actual', 'devengado_basico', 'devengado_transporte', 'devengado_otros', 'total_devengado', 'total_deducciones', 'neto_pagar'];

  report.tests.aplicar_categoria_1_trabajador = {
    status: applyResponse.status === 200 && String(afterApplyDb?.categoria_salarial_id ?? '') === String(targetCategory.id) ? 'PASS' : 'FAIL',
    response_status: applyResponse.status,
    response: applyResponse.body?.data ?? applyResponse.body ?? null,
    before_api: beforeApplyApi,
    after_api: afterApplyApi,
    before_db: beforeApplyDb,
    after_db: afterApplyDb,
    category_changed: String(beforeApplyDb?.categoria_salarial_id ?? '') !== String(afterApplyDb?.categoria_salarial_id ?? ''),
    operational_changes: compareFields(beforeApplyApi, afterApplyApi, operationalFields),
    economic_changes: compareFields(beforeApplyApi, afterApplyApi, economicFields),
    audit_event: applyAudit,
    audit_legacy: applyLegacy,
  };

  report.tests.no_cambio_operativo = {
    status: compareFields(beforeApplyApi, afterApplyApi, operationalFields).length === 0 ? 'PASS' : 'FAIL',
    changed_fields: compareFields(beforeApplyApi, afterApplyApi, operationalFields),
  };

  report.tests.recalculo_automatico = {
    status:
      beforeApplyDb?.salario_base === afterApplyDb?.salario_base &&
      beforeApplyDb?.auxilio_transporte === afterApplyDb?.auxilio_transporte &&
      beforeApplyDb?.devengado_basico === afterApplyDb?.devengado_basico &&
      beforeApplyDb?.devengado_transporte === afterApplyDb?.devengado_transporte &&
      beforeApplyDb?.devengado_otros === afterApplyDb?.devengado_otros &&
      beforeApplyDb?.total_adiciones === afterApplyDb?.total_adiciones &&
      beforeApplyDb?.total_deducciones === afterApplyDb?.total_deducciones &&
      beforeApplyDb?.neto_pagar === afterApplyDb?.neto_pagar
        ? 'PASS'
        : 'FAIL',
    detail: {
      before_db: beforeApplyDb,
      after_apply_db: afterApplyDb,
    },
  };

  await setAssignmentFilters(page, {
    periodo_id: String(openPeriod.id),
    target_category_id: '',
    observacion: `${TAG} remove`,
    search: primaryWorker.documento ?? '',
    cargo: primaryWorker.cargo?.split(' ')[0] ?? '',
    municipio: primaryWorker.municipio ? primaryWorker.municipio.slice(0, 5) : '',
    institucion: primaryWorker.institucion ? primaryWorker.institucion.slice(0, 18) : '',
    sede: primaryWorker.sede ? primaryWorker.sede.slice(0, 15) : '',
    metodo_pago: primaryWorker.metodo_pago ?? '',
  });
  const previewBeforeRemove = await previewAssignment(page);
  await assignmentCard(page).locator('table.adm-history tbody tr').first().locator('input[type="checkbox"]').check();
  const removeResponse = await applyAssignment(page);
  const afterRemoveApi = await getEmployeeState(accessToken, openPeriod.id, primaryWorker.nomina_empleado_id);
  const afterRemoveDb = await getEmployeeDbState(primaryWorker.nomina_empleado_id);
  const removeAuditRows = await getAuditEvents('nomina_empleados', primaryWorker.nomina_empleado_id, 'NOMINA_EMPLEADO_CATEGORY_ASSIGN');
  const removeLegacyRows = await getLegacyAudit('nomina_empleados', primaryWorker.nomina_empleado_id, 'NOMINA_EMPLEADO_CATEGORY_ASSIGN');
  const removeAudit = removeAuditRows.find((row) => row.descripcion === `${TAG} remove`) ?? removeAuditRows[0] ?? null;
  const removeLegacy = removeLegacyRows.find((row) => row.descripcion === `${TAG} remove`) ?? removeLegacyRows[0] ?? null;

  report.tests.retirar_categoria = {
    status: removeResponse.status === 200 && afterRemoveDb?.categoria_salarial_id === null ? 'PASS' : 'FAIL',
    preview_before: previewBeforeRemove.body?.data ?? null,
    response_status: removeResponse.status,
    response: removeResponse.body?.data ?? removeResponse.body ?? null,
    after_api: afterRemoveApi,
    after_db: afterRemoveDb,
    operational_changes_vs_before: compareFields(beforeApplyApi, afterRemoveApi, operationalFields),
    audit_event: removeAudit,
    audit_legacy: removeLegacy,
  };

  report.tests.auditoria = {
    status: patchAudit && applyAudit && removeAudit ? 'PASS' : 'FAIL',
    patch_event: patchAudit,
    apply_event: applyAudit,
    remove_event: removeAudit,
    patch_legacy: patchLegacy,
    apply_legacy: applyLegacy,
    remove_legacy: removeLegacy,
  };

  if (originalCategoryId) {
    const cleanupRestore = await api(`/company-settings/${EMPRESA_ID}/salary-categories/assignments/apply`, accessToken, {
      method: 'POST',
      body: {
        periodo_id: Number(openPeriod.id),
        target_category_id: Number(originalCategoryId),
        nomina_empleado_ids: [Number(primaryWorker.nomina_empleado_id)],
        observacion: `${TAG} cleanup restore`,
      },
    });
    report.cleanup.restore_worker_category = {
      status: cleanupRestore.status,
      response: cleanupRestore.body?.data ?? cleanupRestore.body ?? null,
      after: await getEmployeeDbState(primaryWorker.nomina_empleado_id),
    };
  }

  const patchRestore = await api(`/company-settings/${EMPRESA_ID}/salary-categories/${baseCategory.id}`, accessToken, {
    method: 'PATCH',
    body: { descripcion: originalDescription },
  });
  report.cleanup.restore_patch = {
    status: patchRestore.status,
    after: await getCategoryById(baseCategory.id),
  };

  await page.screenshot({ path: SCREENSHOT_FINAL, fullPage: true });
  report.evidence = {
    screenshots: [SCREENSHOT_BASE, SCREENSHOT_FINAL],
    report_path: REPORT_PATH,
  };

  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  console.error(error);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  if (browser) {
    await browser.close();
  }
  await client.end();
}
