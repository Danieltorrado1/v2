import fs from 'node:fs';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

const API = 'http://localhost:4000/api';
const LOGIN = { email: 'admin@empiria.local', password: 'Admin123456*' };
const TAG = `QA_CAT_API_${Date.now()}`;
const REPORT_PATH = 'tmp/qa-categorias-api-report.json';
const report = { generated_at: new Date().toISOString(), tag: TAG, environment: {}, tests: {}, cleanup: {}, errors: [] };

const toDate = (value) => new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
const isoDate = (date) => date.toISOString().slice(0, 10);
const addDays = (date, days) => { const next = new Date(date); next.setUTCDate(next.getUTCDate() + days); return next; };
const compareFields = (before, after, fields) => fields.filter((field) => JSON.stringify(before?.[field] ?? null) !== JSON.stringify(after?.[field] ?? null));

async function dbAll(sql, params = []) { const result = await client.query(sql, params); return result.rows; }
async function login() {
  const response = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(LOGIN) });
  const body = await response.json();
  if (!response.ok) throw new Error(`login failed ${response.status}`);
  return body.data;
}
async function api(path, token, options = {}) {
  const response = await fetch(`${API}${path}`, { method: options.method ?? 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: response.status, body };
}
async function discoverScope() {
  const rows = await dbAll(`
    select e.id::text as empresa_id, e.nombre_empresa, c.id::text as contrato_id, c.numero_contrato,
      np.id::text as periodo_id, np.nombre_periodo, np.estado, np.fecha_inicio::text as fecha_inicio, np.fecha_fin::text as fecha_fin,
      count(distinct ncs.id) as categorias, count(distinct ne.id) as empleados
    from empresas e
    join contratos c on c.empresa_id = e.id
    join nomina_periodos np on np.contrato_id = c.id
    left join nomina_categorias_salariales ncs on ncs.contrato_id = c.id and coalesce(ncs.activo, true) = true
    left join nomina_empleados ne on ne.periodo_id = np.id and coalesce(ne.activo, true) = true
    group by e.id, e.nombre_empresa, c.id, c.numero_contrato, np.id, np.nombre_periodo, np.estado, np.fecha_inicio, np.fecha_fin
    having count(distinct ncs.id) > 0 and count(distinct ne.id) > 0
    order by case when np.estado = 'ABIERTO' then 0 else 1 end, count(distinct ne.id) desc
    limit 1
  `);
  return rows[0] ?? null;
}
async function getCategories(contratoId) {
  return dbAll(`
    select ncs.id::text as id, ncs.contrato_id::text as contrato_id, ncs.codigo_categoria, ncs.nombre_categoria, ncs.modalidad, ncs.descripcion,
      ncs.salario_base, ncs.auxilio_transporte, ncs.otros_recargos, ncs.vigente_desde::text as vigente_desde, ncs.vigente_hasta::text as vigente_hasta,
      coalesce(ncs.activo, true) as activo, c.numero_contrato
    from nomina_categorias_salariales ncs
    inner join contratos c on c.id = ncs.contrato_id
    where ncs.contrato_id = $1::bigint
    order by ncs.codigo_categoria asc, ncs.vigente_desde asc, ncs.id asc
  `, [contratoId]);
}
async function getCategoryById(categoryId) { return (await dbAll(`select id::text as id, contrato_id::text as contrato_id, codigo_categoria, nombre_categoria, modalidad, descripcion, salario_base, auxilio_transporte, otros_recargos, vigente_desde::text as vigente_desde, vigente_hasta::text as vigente_hasta, coalesce(activo,true) as activo from nomina_categorias_salariales where id = $1::bigint limit 1`, [categoryId]))[0] ?? null; }
async function getEmployeeItems(token, periodId) { return (await api(`/nomina/periodos/${periodId}/empleados?page=1&limit=100`, token)).body?.data?.items ?? []; }
function mapEmployee(item) { return { nomina_empleado_id: String(item.id), persona_id: item.persona?.id ? String(item.persona.id) : null, vinculacion_id: item.vinculacion?.id ? String(item.vinculacion.id) : null, nombre: item.persona?.nombre_completo ?? null, documento: item.persona?.numero_documento ?? null, cargo: item.cargo?.nombre_cargo ?? null, modalidad: item.modalidad ?? item.contexto_operativo?.modalidad_codigo ?? null, municipio: item.municipio ?? item.contexto_operativo?.municipio ?? null, institucion: item.institucion ?? item.contexto_operativo?.institucion ?? null, sede: item.sede?.nombre_sede ?? item.contexto_operativo?.sede ?? null, categoria_salarial_id_actual: item.categoria_salarial?.id ? String(item.categoria_salarial.id) : null, categoria_actual_codigo: item.categoria_salarial?.codigo_categoria ?? null, salario_actual: item.salario_base ?? null, auxilio_transporte_actual: item.auxilio_transporte ?? null, recargo_mensual_actual: item.categoria_salarial?.otros_recargos ?? null, metodo_pago: item.vinculacion?.metodo_pago ?? null, estado_vinculacion: item.vinculacion?.estado_vinculacion ?? null, devengado_basico: item.devengado_basico ?? null, devengado_transporte: item.devengado_transporte ?? null, devengado_otros: item.devengado_otros ?? null, total_devengado: item.total_adiciones ?? null, total_deducciones: item.total_deducciones ?? null, neto_pagar: item.neto_pagar ?? null }; }
async function getEmployeeState(token, periodId, employeeId) { const items = await getEmployeeItems(token, periodId); const item = items.find((entry) => String(entry.id) === String(employeeId)); return item ? mapEmployee(item) : null; }
async function getEmployeeDbState(employeeId) {
  return (await dbAll(`
    select ne.id::text as nomina_empleado_id, ne.periodo_id::text as periodo_id, ne.vinculacion_id::text as vinculacion_id, ne.categoria_salarial_id::text as categoria_salarial_id,
      ne.salario_base, ne.auxilio_transporte, ne.devengado_basico, ne.devengado_transporte, ne.devengado_otros, ne.total_adiciones, ne.total_deducciones, ne.neto_pagar,
      v.persona_id::text as persona_id, v.metodo_pago, v.estado_vinculacion, cc.nombre_cargo as cargo, p.numero_documento, trim(concat_ws(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido)) as nombre,
      ncs.codigo_categoria, ncs.nombre_categoria, ncs.otros_recargos as categoria_recargo_mensual
    from nomina_empleados ne
    join vinculaciones v on v.id = ne.vinculacion_id
    join personas p on p.id = v.persona_id
    left join contrato_cargos cc on cc.id = v.contrato_cargo_id
    left join nomina_categorias_salariales ncs on ncs.id = ne.categoria_salarial_id
    where ne.id = $1::bigint limit 1
  `, [employeeId]))[0] ?? null;
}
async function getAuditEvents(entity, entityId, action) { return dbAll(`select usuario_id::text as usuario_id, empresa_id::text as empresa_id, contrato_id::text as contrato_id, entidad, entidad_id, accion, descripcion, datos_anteriores, datos_nuevos, fecha_evento::text as fecha_evento from auditoria_eventos where entidad = $1 and entidad_id = $2 and accion = $3 order by fecha_evento desc limit 10`, [entity, String(entityId), action]); }
async function getLegacyAudit(table, recordId, action) { return dbAll(`select usuario_id::text as usuario_id, accion, tabla_afectada, registro_id::text as registro_id, descripcion, datos_anteriores, datos_nuevos, created_at::text as created_at from auditoria where tabla_afectada = $1 and registro_id = $2::bigint and accion = $3 order by created_at desc limit 10`, [table, String(recordId), action]); }

try {
  const auth = await login();
  const token = auth.accessToken;
  const scope = await discoverScope();
  if (!scope) throw new Error('No scope found');
  const empresaId = scope.empresa_id;
  const contratoId = scope.contrato_id;
  const periodoId = scope.periodo_id;
  const tenant = await api('/tenant/me', token);
  const me = await api('/auth/me', token);
  const periodos = (await api(`/nomina/periodos?page=1&limit=100&empresa_id=${empresaId}`, token)).body?.data?.items ?? [];
  const categoriesBefore = await getCategories(contratoId);
  const employees = await getEmployeeItems(token, periodoId);
  const primaryItem = employees.find((item) => item.categoria_salarial?.id) ?? employees[0];
  const secondaryItem = employees.find((item) => String(item.id) !== String(primaryItem?.id)) ?? null;
  if (!primaryItem) throw new Error('No employee found');
  const primaryWorker = mapEmployee(primaryItem);
  const currentCategory = categoriesBefore.find((row) => String(row.id) === String(primaryWorker.categoria_salarial_id_actual)) ?? categoriesBefore[0];
  const period = periodos.find((row) => String(row.id) === String(periodoId)) ?? scope;

  const targetCreate = await api(`/company-settings/${empresaId}/salary-categories`, token, { method: 'POST', body: { contrato_id: Number(contratoId), codigo_categoria: `ZZALT${String(Date.now()).slice(-6)}`, nombre_categoria: `Categoria alterna ${TAG}`, modalidad: currentCategory.modalidad ?? null, descripcion: `Destino QA ${TAG}`, salario_base: Number(currentCategory.salario_base) + 100000, auxilio_transporte: Number(currentCategory.auxilio_transporte ?? 0) + 10000, otros_recargos: Number(currentCategory.otros_recargos ?? 0) + 5000, vigente_desde: String(period.fecha_inicio).slice(0,10), vigente_hasta: String(period.fecha_fin).slice(0,10), activo: true } });
  if (targetCreate.status !== 201) throw new Error(`target create failed ${JSON.stringify(targetCreate.body)}`);
  const targetCategory = await getCategoryById(targetCreate.body.data.id);

  const overlapCode = `ZZOVL${String(Date.now()).slice(-6)}`;
  const overlapBaseCreate = await api(`/company-settings/${empresaId}/salary-categories`, token, { method: 'POST', body: { contrato_id: Number(contratoId), codigo_categoria: overlapCode, nombre_categoria: `Categoria overlap ${TAG}`, modalidad: currentCategory.modalidad ?? null, descripcion: `Base overlaps ${TAG}`, salario_base: Number(currentCategory.salario_base), auxilio_transporte: Number(currentCategory.auxilio_transporte ?? 0), otros_recargos: Number(currentCategory.otros_recargos ?? 0), vigente_desde: String(period.fecha_inicio).slice(0,10), vigente_hasta: String(period.fecha_fin).slice(0,10), activo: true } });
  if (overlapBaseCreate.status !== 201) throw new Error(`overlap base failed ${JSON.stringify(overlapBaseCreate.body)}`);
  const overlapBase = await getCategoryById(overlapBaseCreate.body.data.id);

  report.environment = { empresa: tenant.body?.data?.empresas?.find((row) => String(row.id) === String(empresaId)) ?? { id: empresaId, nombre_empresa: scope.nombre_empresa }, contrato: tenant.body?.data?.contratos?.find((row) => String(row.id) === String(contratoId)) ?? { id: contratoId, numero_contrato: scope.numero_contrato }, periodo: period, categoria_actual_trabajador: currentCategory, categoria_destino_prueba: targetCategory, categoria_overlap_base: overlapBase, trabajadores: [primaryWorker, secondaryItem ? mapEmployee(secondaryItem) : null].filter(Boolean), permisos_usuario: me.body?.data?.permissions ?? auth.user.permissions ?? [] };

  const patchTag = `[${TAG}_PATCH]`;
  const originalDescription = overlapBase.descripcion ?? '';
  const patchedDescription = `${originalDescription} ${patchTag}`.trim();
  const patchResponse = await api(`/company-settings/${empresaId}/salary-categories/${overlapBase.id}`, token, { method: 'PATCH', body: { descripcion: patchedDescription } });
  const patchAfter = await getCategoryById(overlapBase.id);
  const patchAudit = (await getAuditEvents('nomina_categorias_salariales', overlapBase.id, 'UPDATE')).find((row) => JSON.stringify(row.datos_nuevos ?? {}).includes(patchTag)) ?? null;
  const patchLegacy = (await getLegacyAudit('nomina_categorias_salariales', overlapBase.id, 'UPDATE')).find((row) => JSON.stringify(row.datos_nuevos ?? {}).includes(patchTag)) ?? null;
  report.tests.patch_persistencia = { status: patchResponse.status === 200 && patchAfter?.descripcion === patchedDescription ? 'PASS' : 'FAIL', response_status: patchResponse.status, before: overlapBase, after: patchAfter, audit_event: patchAudit, audit_legacy: patchLegacy };

  const baseEnd = toDate(period.fecha_fin);
  const contiguousStart = addDays(baseEnd, 1);
  const contiguousEnd = addDays(contiguousStart, 29);
  const separatedStart = addDays(contiguousEnd, 1);
  const separatedEnd = addDays(separatedStart, 29);
  const categoryPayload = { contrato_id: Number(contratoId), codigo_categoria: overlapCode, nombre_categoria: overlapBase.nombre_categoria, modalidad: overlapBase.modalidad ?? null, salario_base: Number(overlapBase.salario_base), auxilio_transporte: Number(overlapBase.auxilio_transporte ?? 0), otros_recargos: Number(overlapBase.otros_recargos ?? 0), activo: true };
  const contiguous = await api(`/company-settings/${empresaId}/salary-categories`, token, { method: 'POST', body: { ...categoryPayload, descripcion: `${TAG} contigua`, vigente_desde: isoDate(contiguousStart), vigente_hasta: isoDate(contiguousEnd) } });
  const contiguousCategory = contiguous.body?.data ? await getCategoryById(contiguous.body.data.id) : null;
  const separated = await api(`/company-settings/${empresaId}/salary-categories`, token, { method: 'POST', body: { ...categoryPayload, descripcion: `${TAG} separada`, vigente_desde: isoDate(separatedStart), vigente_hasta: isoDate(separatedEnd) } });
  const separatedCategory = separated.body?.data ? await getCategoryById(separated.body.data.id) : null;
  const partial = await api(`/company-settings/${empresaId}/salary-categories`, token, { method: 'POST', body: { ...categoryPayload, descripcion: `${TAG} parcial`, vigente_desde: isoDate(addDays(toDate(period.fecha_inicio), 10)), vigente_hasta: isoDate(addDays(contiguousStart, 10)) } });
  const contained = await api(`/company-settings/${empresaId}/salary-categories`, token, { method: 'POST', body: { ...categoryPayload, descripcion: `${TAG} contenido`, vigente_desde: isoDate(addDays(toDate(period.fecha_inicio), 5)), vigente_hasta: isoDate(addDays(toDate(period.fecha_inicio), 12)) } });
  const patchOverlap = separatedCategory ? await api(`/company-settings/${empresaId}/salary-categories/${separatedCategory.id}`, token, { method: 'PATCH', body: { vigente_desde: isoDate(addDays(contiguousEnd, -5)) } }) : { status: 0, body: null };
  report.tests.traslapes = { status: contiguous.status === 201 && separated.status === 201 && partial.status === 409 && contained.status === 409 && patchOverlap.status === 409 ? 'PASS' : 'FAIL', vigencia_contigua: { status: contiguous.status, category: contiguousCategory }, vigencia_separada: { status: separated.status, category: separatedCategory }, traslape_parcial: { status: partial.status, body: partial.body }, traslape_contenido: { status: contained.status, body: contained.body }, patch_traslape: { status: patchOverlap.status, body: patchOverlap.body } };

  const preview = await api(`/company-settings/${empresaId}/salary-categories/assignments/preview`, token, { method: 'POST', body: { periodo_id: Number(periodoId), target_category_id: Number(targetCategory.id), search: primaryWorker.documento, cargo: primaryWorker.cargo?.split(' ')[0] ?? '', municipio: primaryWorker.municipio ? primaryWorker.municipio.slice(0, 6) : '', institucion: primaryWorker.institucion ? primaryWorker.institucion.slice(0, 18) : '', sede: primaryWorker.sede ? primaryWorker.sede.slice(0, 15) : '', metodo_pago: primaryWorker.metodo_pago ?? '', limit: 20 } });
  report.tests.preview = { status: preview.status === 200 && (preview.body?.data?.items?.length ?? 0) >= 1 ? 'PASS' : 'FAIL', response_status: preview.status, response: preview.body?.data ?? null };

  const beforeApplyApi = await getEmployeeState(token, periodoId, primaryWorker.nomina_empleado_id);
  const beforeApplyDb = await getEmployeeDbState(primaryWorker.nomina_empleado_id);
  const apply = await api(`/company-settings/${empresaId}/salary-categories/assignments/apply`, token, { method: 'POST', body: { periodo_id: Number(periodoId), target_category_id: Number(targetCategory.id), nomina_empleado_ids: [Number(primaryWorker.nomina_empleado_id)], observacion: `${TAG} apply` } });
  const afterApplyApi = await getEmployeeState(token, periodoId, primaryWorker.nomina_empleado_id);
  const afterApplyDb = await getEmployeeDbState(primaryWorker.nomina_empleado_id);
  const applyAudit = (await getAuditEvents('nomina_empleados', primaryWorker.nomina_empleado_id, 'NOMINA_EMPLEADO_CATEGORY_ASSIGN')).find((row) => row.descripcion === `${TAG} apply`) ?? null;
  const applyLegacy = (await getLegacyAudit('nomina_empleados', primaryWorker.nomina_empleado_id, 'NOMINA_EMPLEADO_CATEGORY_ASSIGN')).find((row) => row.descripcion === `${TAG} apply`) ?? null;
  const operationalFields = ['persona_id','vinculacion_id','nombre','documento','cargo','modalidad','municipio','institucion','sede','metodo_pago','estado_vinculacion'];
  const economicFields = ['salario_actual','auxilio_transporte_actual','devengado_basico','devengado_transporte','devengado_otros','total_devengado','total_deducciones','neto_pagar'];
  report.tests.aplicar_categoria_1_trabajador = { status: apply.status === 200 && String(afterApplyDb?.categoria_salarial_id ?? '') === String(targetCategory.id) ? 'PASS' : 'FAIL', response_status: apply.status, response: apply.body?.data ?? apply.body ?? null, before_api: beforeApplyApi, after_api: afterApplyApi, before_db: beforeApplyDb, after_db: afterApplyDb, audit_event: applyAudit, audit_legacy: applyLegacy };
  report.tests.no_cambio_operativo = { status: compareFields(beforeApplyApi, afterApplyApi, operationalFields).length === 0 ? 'PASS' : 'FAIL', changed_fields: compareFields(beforeApplyApi, afterApplyApi, operationalFields) };
  report.tests.recalculo_automatico = { status: compareFields(beforeApplyApi, afterApplyApi, economicFields).length === 0 ? 'PASS' : 'FAIL', changed_fields: compareFields(beforeApplyApi, afterApplyApi, economicFields), before_db: beforeApplyDb, after_db: afterApplyDb };

  const previewRemove = await api(`/company-settings/${empresaId}/salary-categories/assignments/preview`, token, { method: 'POST', body: { periodo_id: Number(periodoId), target_category_id: null, search: primaryWorker.documento, cargo: primaryWorker.cargo?.split(' ')[0] ?? '', municipio: primaryWorker.municipio ? primaryWorker.municipio.slice(0, 6) : '', institucion: primaryWorker.institucion ? primaryWorker.institucion.slice(0, 18) : '', sede: primaryWorker.sede ? primaryWorker.sede.slice(0, 15) : '', metodo_pago: primaryWorker.metodo_pago ?? '', limit: 20 } });
  const remove = await api(`/company-settings/${empresaId}/salary-categories/assignments/apply`, token, { method: 'POST', body: { periodo_id: Number(periodoId), target_category_id: null, nomina_empleado_ids: [Number(primaryWorker.nomina_empleado_id)], observacion: `${TAG} remove` } });
  const afterRemoveApi = await getEmployeeState(token, periodoId, primaryWorker.nomina_empleado_id);
  const afterRemoveDb = await getEmployeeDbState(primaryWorker.nomina_empleado_id);
  const removeAudit = (await getAuditEvents('nomina_empleados', primaryWorker.nomina_empleado_id, 'NOMINA_EMPLEADO_CATEGORY_ASSIGN')).find((row) => row.descripcion === `${TAG} remove`) ?? null;
  const removeLegacy = (await getLegacyAudit('nomina_empleados', primaryWorker.nomina_empleado_id, 'NOMINA_EMPLEADO_CATEGORY_ASSIGN')).find((row) => row.descripcion === `${TAG} remove`) ?? null;
  report.tests.retirar_categoria = { status: previewRemove.status === 200 && remove.status === 200 && afterRemoveDb?.categoria_salarial_id === null ? 'PASS' : 'FAIL', preview: previewRemove.body?.data ?? null, response_status: remove.status, response: remove.body?.data ?? remove.body ?? null, after_api: afterRemoveApi, after_db: afterRemoveDb, audit_event: removeAudit, audit_legacy: removeLegacy };
  report.tests.auditoria = { status: patchAudit && applyAudit && removeAudit ? 'PASS' : 'FAIL', patch_event: patchAudit, apply_event: applyAudit, remove_event: removeAudit, patch_legacy: patchLegacy, apply_legacy: applyLegacy, remove_legacy: removeLegacy };
  report.tests.periodos_reales = { status: periodos.some((row) => String(row.id) === String(periodoId)) ? 'PASS' : 'FAIL', api_periods: periodos };

  if (primaryWorker.categoria_salarial_id_actual) {
    const restoreWorker = await api(`/company-settings/${empresaId}/salary-categories/assignments/apply`, token, { method: 'POST', body: { periodo_id: Number(periodoId), target_category_id: Number(primaryWorker.categoria_salarial_id_actual), nomina_empleado_ids: [Number(primaryWorker.nomina_empleado_id)], observacion: `${TAG} cleanup restore` } });
    report.cleanup.restore_worker = { status: restoreWorker.status, after: await getEmployeeDbState(primaryWorker.nomina_empleado_id) };
  }
  const patchRestore = await api(`/company-settings/${empresaId}/salary-categories/${overlapBase.id}`, token, { method: 'PATCH', body: { descripcion: originalDescription } });
  report.cleanup.restore_patch = { status: patchRestore.status, after: await getCategoryById(overlapBase.id) };
  for (const id of [targetCategory.id, overlapBase.id, contiguousCategory?.id, separatedCategory?.id].filter(Boolean)) {
    report.cleanup[`deactivate_${id}`] = await api(`/company-settings/${empresaId}/salary-categories/${id}`, token, { method: 'PATCH', body: { activo: false } });
  }

  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  console.error(error);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  await client.end();
}
