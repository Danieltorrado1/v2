/**
 * Harness E2E sintético de Fase 2.
 * No es migración ni dump: crea sólo las columnas consultadas por el worker,
 * el resolvedor contextual y NominaPoblacionService, y elimina todo al final.
 * Ejecutar únicamente contra empiria_integration_test local.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Client } from 'pg';

const root = process.cwd();
const envText = fs.readFileSync(path.join(root, '.env.integration-test.local'), 'utf8');
const envLine = envText.split(/\r?\n/).find((line) => line.startsWith('INTEGRATION_TEST_DATABASE_URL='));
if (!envLine) throw new Error('INTEGRATION_TEST_DATABASE_URL no encontrado');
const localUrl = envLine.slice(envLine.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '');
const parsedUrl = new URL(localUrl);
assert.ok(['127.0.0.1', 'localhost'].includes(parsedUrl.hostname));
assert.equal(parsedUrl.port, '5433');
assert.equal(decodeURIComponent(parsedUrl.username), 'empiria_integration_test');
assert.equal(decodeURIComponent(parsedUrl.pathname.slice(1)), 'empiria_integration_test');

delete process.env.DATABASE_URL;
Object.assign(process.env, {
  APP_NAME: 'phase53-synthetic', API_PREFIX: '/api', NODE_ENV: 'test', PORT: '5999',
  DATABASE_URL: localUrl, JWT_SECRET: 'phase53-synthetic', JWT_EXPIRES_IN: '1h',
  CORS_ORIGIN: 'http://localhost', TRUST_PROXY: 'false', RATE_LIMIT_WINDOW_MINUTES: '1',
  RATE_LIMIT_MAX_REQUESTS: '10', LOG_LEVEL: 'error', ENABLE_JOBS: 'false',
  SUPABASE_URL: 'https://example.com', SUPABASE_SERVICE_ROLE_KEY: 'phase53-synthetic',
  SUPABASE_STORAGE_BUCKET: 'phase53-synthetic', INTEGRACION_OUTBOX_ENABLED: 'true',
  INTEGRACION_SYNC_ENABLED: 'true',
  INTEGRACION_RECALC_ENABLED: process.env.PHASE55_RECALC === 'true' ? 'true' : 'false'
});

const ids = { companyA: 910001, companyB: 910002, contractA: 920001, contractB: 920002, personA: 940001, personB: 940002, personC: 940003, cargoA: 950001, vincA: 960001, vincB: 960002, vincC: 960003, openA: 970001, closedA: 970002, openB: 970003, assignmentA: 980001, assignmentB: 980002, employeeOpen: 990001, employeeClosed: 990002, employeeOther: 990003, typeNovelty: 990101, liqA: 991001, liqB: 991002, liqClosed: 991003, attendance: 992001, novelty: 992002, turn: 992003, movement: 992004, revision: 992005 };
const syntheticTables = [
  'contrato_cargos', 'nomina_categorias_salariales', 'vinculacion_condiciones_economicas',
  'cobertura_asignaciones', 'focalizacion_final', 'municipios', 'personal_asignaciones_laborales',
  'contrato_ubicaciones_laborales', 'gestor_personal_asignaciones', 'gestor_municipio_asignaciones',
  'usuarios', 'nomina_empleados', 'nomina_liquidaciones', 'nomina_contextos_operativos_base',
  'nomina_asistencia_diaria', 'nomina_tipos_novedad', 'nomina_novedades', 'nomina_novedad_documentos',
  'nomina_novedad_coberturas', 'nomina_novedad_turnos', 'nomina_movimientos', 'nomina_revision_operativa',
  'cobertura_externos', 'auditoria_eventos', 'instituciones', 'sedes', 'modalidades',
  'cargos_operativos', 'tipos_vinculacion', 'tipos_jornada', 'roles', 'usuario_roles',
  'gestor_institucion_asignaciones', 'nomina_novedades_canonicas', 'nomina_ajustes_manuales',
  'nomina_parametros_economicos', 'auditoria', 'historial_cambios'
];
const ddl: Record<string, string> = {
  contrato_cargos: `CREATE TABLE IF NOT EXISTS contrato_cargos (id bigint PRIMARY KEY, nombre_cargo text)`,
  nomina_categorias_salariales: `CREATE TABLE IF NOT EXISTS nomina_categorias_salariales (id bigint PRIMARY KEY, contrato_id bigint, codigo_categoria text, nombre_categoria text, salario_base numeric, activo boolean DEFAULT true, vigente_desde date, vigente_hasta date, auxilio_transporte numeric DEFAULT 0)`,
  vinculacion_condiciones_economicas: `CREATE TABLE IF NOT EXISTS vinculacion_condiciones_economicas (id bigint PRIMARY KEY, vinculacion_id bigint, activo boolean DEFAULT true, tipo_condicion text, valor numeric, vigencia_desde date, vigencia_hasta date)`,
  municipios: `CREATE TABLE IF NOT EXISTS municipios (id bigint PRIMARY KEY, nombre_municipio text)`,
  focalizacion_final: `CREATE TABLE IF NOT EXISTS focalizacion_final (id bigint PRIMARY KEY, contrato_id bigint, municipio_id bigint, institucion_id bigint, sede_id bigint, modalidad_id bigint, institucion_final text, sede_final text, modalidad_final text, municipio_texto text, activo boolean DEFAULT true)`,
  cobertura_asignaciones: `CREATE TABLE IF NOT EXISTS cobertura_asignaciones (id bigint PRIMARY KEY, contrato_id bigint, municipio_id bigint, focalizacion_final_id bigint, vinculacion_id bigint, institucion text, sede text, modalidad text, fecha_inicio date, fecha_fin date, activo boolean DEFAULT true, observacion text)`,
  contrato_ubicaciones_laborales: `CREATE TABLE IF NOT EXISTS contrato_ubicaciones_laborales (id bigint PRIMARY KEY, contrato_id bigint, nombre_ubicacion text)`,
  personal_asignaciones_laborales: `CREATE TABLE IF NOT EXISTS personal_asignaciones_laborales (id bigint PRIMARY KEY, vinculacion_id bigint, ubicacion_laboral_id bigint, vigencia_desde date, vigencia_hasta date, estado text)`,
  usuarios: `CREATE TABLE IF NOT EXISTS usuarios (id bigint PRIMARY KEY, nombre_completo text)`,
  gestor_personal_asignaciones: `CREATE TABLE IF NOT EXISTS gestor_personal_asignaciones (id bigint PRIMARY KEY, vinculacion_id bigint, usuario_id bigint, activo boolean DEFAULT true, vigencia_desde date, vigencia_hasta date)`,
  gestor_municipio_asignaciones: `CREATE TABLE IF NOT EXISTS gestor_municipio_asignaciones (id bigint PRIMARY KEY, contrato_id bigint, municipio_id bigint, usuario_id bigint, activo boolean DEFAULT true, vigencia_desde date, vigencia_hasta date)`,
  nomina_empleados: `CREATE TABLE IF NOT EXISTS nomina_empleados (id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, periodo_id bigint, vinculacion_id bigint, metodo_liquidacion text, categoria_salarial_id bigint, salario_base numeric DEFAULT 0, auxilio_transporte numeric DEFAULT 0, otros_devengos numeric DEFAULT 0, fecha_inicio_pago date, fecha_fin_pago date, dias_periodo numeric DEFAULT 0, dias_pagados numeric DEFAULT 0, horas_trabajadas numeric DEFAULT 0, horas_extra_total numeric DEFAULT 0, devengado_basico numeric DEFAULT 0, devengado_transporte numeric DEFAULT 0, devengado_otros numeric DEFAULT 0, total_adiciones numeric DEFAULT 0, total_deducciones numeric DEFAULT 0, salud numeric DEFAULT 0, pension numeric DEFAULT 0, neto_pagar numeric DEFAULT 0, revisado boolean DEFAULT false, estado text DEFAULT 'PENDIENTE', activo boolean DEFAULT true, motivo_caso_especial text, detalle_calculo jsonb, created_at timestamptz NOT NULL DEFAULT now())`,
  nomina_liquidaciones: `CREATE TABLE IF NOT EXISTS nomina_liquidaciones (id bigint PRIMARY KEY, vinculacion_id bigint NOT NULL REFERENCES vinculaciones(id), periodo_id bigint NOT NULL REFERENCES nomina_periodos(id), fecha_inicio_vinculacion date, fecha_fin_vinculacion date, fecha_retiro date, motivo_retiro text, dias_base_liquidacion numeric, dias_trabajados numeric, dias_vacaciones_pendientes numeric, salario_base numeric, auxilio_transporte numeric, promedio_salario numeric, promedio_auxilio_transporte numeric, cesantias numeric, intereses_cesantias numeric, prima_servicios numeric, vacaciones numeric, otros_devengos numeric, deducciones numeric DEFAULT 0, salud_deduccion_empleado numeric DEFAULT 0, pension_deduccion_empleado numeric DEFAULT 0, total_liquidacion numeric DEFAULT 0, estado text DEFAULT 'GENERADA' CHECK (estado IN ('GENERADA','PRELIMINAR','CALCULADA','FINALIZADA','FINALIZADO')), activo boolean DEFAULT true, requiere_recalculo boolean NOT NULL DEFAULT false, UNIQUE(periodo_id,vinculacion_id))`,
  nomina_contextos_operativos_base: `CREATE TABLE IF NOT EXISTS nomina_contextos_operativos_base (id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, periodo_id bigint NOT NULL REFERENCES nomina_periodos(id), nomina_empleado_id bigint NOT NULL REFERENCES nomina_empleados(id), vinculacion_id bigint NOT NULL REFERENCES vinculaciones(id), contexto jsonb NOT NULL, fuente text, created_by bigint, UNIQUE(periodo_id, nomina_empleado_id))`,
  nomina_asistencia_diaria: `CREATE TABLE IF NOT EXISTS nomina_asistencia_diaria (id bigint PRIMARY KEY, periodo_id bigint NOT NULL REFERENCES nomina_periodos(id), vinculacion_id bigint NOT NULL REFERENCES vinculaciones(id), fecha date NOT NULL, hora_ingreso time, hora_salida time, horas_trabajadas numeric, estado_dia text NOT NULL DEFAULT 'PRESENTE' CHECK (estado_dia IN ('PRESENTE','PENDIENTE','AUSENTE','JUSTIFICADA')), observacion text, activo boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(periodo_id,vinculacion_id,fecha))`,
  nomina_tipos_novedad: `CREATE TABLE IF NOT EXISTS nomina_tipos_novedad (id bigint PRIMARY KEY, codigo_operativo text NOT NULL, nombre text NOT NULL, categoria text, descripcion_operativa text, afecta_salario boolean DEFAULT false, afecta_transporte boolean DEFAULT false, afecta_dias_laborados boolean DEFAULT false, afecta_recargos boolean DEFAULT false, afecta_cobertura boolean DEFAULT false, efecto_salario text, efecto_auxilio_transporte text, efecto_recargos_detallado text, efecto_liquidacion text, efecto_cobertura_config text, efecto_operativo text, efecto_pago text, modelo_registro text DEFAULT 'ORDINARIA', proyecta_periodos boolean DEFAULT false, bloquea_otras_novedades boolean DEFAULT false, grupo_exclusividad text, observacion_plantilla text, es_adicion boolean DEFAULT false, es_deduccion boolean DEFAULT false, requiere_soporte boolean DEFAULT false, permite_rango boolean DEFAULT true, requiere_revision boolean DEFAULT false, requiere_solicitud_permiso boolean DEFAULT false, es_incapacidad boolean DEFAULT false, es_accidente_laboral boolean DEFAULT false, es_permiso boolean DEFAULT false, es_suspension boolean DEFAULT false, es_evento_operativo boolean DEFAULT false, permite_asistencia_simultanea boolean DEFAULT false, requiere_autorizacion_descuento boolean DEFAULT false, soporte_documento_tipo text, requiere_fechas boolean DEFAULT false, requiere_dias boolean DEFAULT false, requiere_horas boolean DEFAULT false, requiere_valor boolean DEFAULT false, activo boolean DEFAULT true, created_at timestamptz DEFAULT now(), UNIQUE(codigo_operativo))`,
  nomina_novedades: `CREATE TABLE IF NOT EXISTS nomina_novedades (id bigint PRIMARY KEY, periodo_id bigint NOT NULL REFERENCES nomina_periodos(id), nomina_empleado_id bigint NOT NULL REFERENCES nomina_empleados(id), vinculacion_id bigint NOT NULL REFERENCES vinculaciones(id), tipo_novedad_id bigint NOT NULL REFERENCES nomina_tipos_novedad(id), tipo_novedad_codigo_operativo text, documento_persona_id bigint, fecha_inicio date, fecha_fin date, dias numeric, horas numeric, valor_manual numeric, categoria_anterior_id bigint, categoria_nueva_id bigint, observacion text, revisado boolean DEFAULT false, activo boolean DEFAULT true, requiere_cobertura boolean DEFAULT false, cubierta boolean DEFAULT false, created_at timestamptz DEFAULT now())`,
  nomina_novedad_documentos: `CREATE TABLE IF NOT EXISTS nomina_novedad_documentos (id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, nomina_novedad_id bigint NOT NULL REFERENCES nomina_novedades(id), documento_persona_id bigint NOT NULL, tipo_relacion text NOT NULL, activo boolean DEFAULT true, created_by bigint, estado_revision text DEFAULT 'PENDIENTE_VALIDACION')`,
  nomina_novedad_coberturas: `CREATE TABLE IF NOT EXISTS nomina_novedad_coberturas (id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, nomina_novedad_id bigint NOT NULL REFERENCES nomina_novedades(id), tipo_cobertura text, persona_cubre_id bigint, vinculacion_cubre_id bigint, nombre_externo text, documento_externo text, observacion_externa text, observacion_interna text, snapshot_cobertura jsonb, activo boolean DEFAULT true)`,
  nomina_novedad_turnos: `CREATE TABLE IF NOT EXISTS nomina_novedad_turnos (id bigint PRIMARY KEY, periodo_id bigint NOT NULL REFERENCES nomina_periodos(id), nomina_novedad_id bigint NOT NULL REFERENCES nomina_novedades(id), nomina_empleado_id bigint NOT NULL REFERENCES nomina_empleados(id), vinculacion_id bigint NOT NULL REFERENCES vinculaciones(id), tipo_turno text NOT NULL CHECK (tipo_turno IN ('INTERNO','EXTERNO')), externo_id bigint, persona_reemplazada_id bigint, contexto_operativo jsonb, observacion text, movimiento_id bigint, activo boolean DEFAULT true, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())`,
  nomina_movimientos: `CREATE TABLE IF NOT EXISTS nomina_movimientos (id bigint PRIMARY KEY, periodo_id bigint NOT NULL REFERENCES nomina_periodos(id), nomina_empleado_id bigint NOT NULL REFERENCES nomina_empleados(id), vinculacion_id bigint NOT NULL REFERENCES vinculaciones(id), fecha date, fecha_fin_efectiva date, tipo_movimiento text, familia_movimiento text NOT NULL, estado text DEFAULT 'PENDIENTE', descripcion text, cantidad numeric, valor_unitario numeric, valor_calculado numeric, valor_total numeric, documento_persona_id bigint, externo_id bigint, persona_reemplazada_id bigint, vinculacion_reemplazada_id bigint, municipio_id bigint, institucion_id bigint, sede_id bigint, modalidad_id bigint, contexto_municipio text, contexto_institucion text, contexto_sede text, contexto_modalidad text, tarifa_config_id bigint, motivo_ajuste_valor text, motivo_estado text, alertas_validacion jsonb, posible_duplicado boolean DEFAULT false, revisado_por bigint, revisado_at timestamptz, aprobado_por bigint, aprobado_at timestamptz, rechazado_por bigint, rechazado_at timestamptz, es_devengado boolean DEFAULT true, es_deduccion boolean DEFAULT false, afecta_seguridad_social boolean DEFAULT true, activo boolean DEFAULT true, updated_at timestamptz DEFAULT now(), updated_by bigint, created_at timestamptz DEFAULT now(), contexto_anterior jsonb, contexto_nuevo jsonb, regla_fecha_efectiva text, motivo_operativo text)`,
  nomina_revision_operativa: `CREATE TABLE IF NOT EXISTS nomina_revision_operativa (id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, periodo_id bigint NOT NULL REFERENCES nomina_periodos(id), nomina_empleado_id bigint NOT NULL REFERENCES nomina_empleados(id), persona_id bigint NOT NULL REFERENCES personas(id), vinculacion_id bigint NOT NULL REFERENCES vinculaciones(id), estado_revision text NOT NULL DEFAULT 'PENDIENTE' CHECK (estado_revision IN ('PENDIENTE','REVISADO','REQUIERE_REVISION')), revisado_por bigint, revisado_at timestamptz, invalidado_por bigint, invalidado_at timestamptz, motivo_invalidacion text, version_revision bigint NOT NULL DEFAULT 0, updated_at timestamptz DEFAULT now(), UNIQUE(periodo_id,nomina_empleado_id))`,
  cobertura_externos: `CREATE TABLE IF NOT EXISTS cobertura_externos (id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, empresa_id bigint NOT NULL REFERENCES empresas(id), tipo_documento text, numero_documento text, nombre_completo text, activo boolean DEFAULT true, updated_at timestamptz DEFAULT now(), UNIQUE(empresa_id,tipo_documento,numero_documento))`,
  auditoria_eventos: `CREATE TABLE IF NOT EXISTS auditoria_eventos (id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, usuario_id bigint, empresa_id bigint, contrato_id bigint, modulo text, entidad text, entidad_id text, accion text, descripcion text, datos_anteriores jsonb, datos_nuevos jsonb, ip_address text, user_agent text, fecha_evento timestamptz DEFAULT now())`
  ,instituciones: `CREATE TABLE IF NOT EXISTS instituciones (id bigint PRIMARY KEY, nombre_institucion text, activo boolean DEFAULT true)`
  ,sedes: `CREATE TABLE IF NOT EXISTS sedes (id bigint PRIMARY KEY, nombre_sede text, activo boolean DEFAULT true)`
  ,modalidades: `CREATE TABLE IF NOT EXISTS modalidades (id bigint PRIMARY KEY, codigo_base text, codigo_original text, nombre_modalidad text, activo boolean DEFAULT true)`
  ,cargos_operativos: `CREATE TABLE IF NOT EXISTS cargos_operativos (id bigint PRIMARY KEY, nombre_cargo text, activo boolean DEFAULT true)`
  ,tipos_vinculacion: `CREATE TABLE IF NOT EXISTS tipos_vinculacion (id bigint PRIMARY KEY, codigo text, nombre_vinculacion text)`
  ,tipos_jornada: `CREATE TABLE IF NOT EXISTS tipos_jornada (id bigint PRIMARY KEY, nombre text)`
  ,roles: `CREATE TABLE IF NOT EXISTS roles (id bigint PRIMARY KEY, nombre_rol text, activo boolean DEFAULT true)`
  ,usuario_roles: `CREATE TABLE IF NOT EXISTS usuario_roles (id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, usuario_id bigint, rol_id bigint, activo boolean DEFAULT true)`
  ,gestor_institucion_asignaciones: `CREATE TABLE IF NOT EXISTS gestor_institucion_asignaciones (id bigint PRIMARY KEY, contrato_id bigint, municipio_id bigint, institucion_id bigint, usuario_id bigint, activo boolean DEFAULT true, vigencia_desde date, vigencia_hasta date)`
  ,nomina_novedades_canonicas: `CREATE TABLE IF NOT EXISTS nomina_novedades_canonicas (id bigint PRIMARY KEY, vinculacion_id bigint, tipo_novedad_id bigint, tipo_novedad_codigo_operativo text, documento_persona_id bigint, fecha_inicio date, fecha_fin date, observacion text, origen text, activo boolean DEFAULT true, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())`
  ,nomina_ajustes_manuales: `CREATE TABLE IF NOT EXISTS nomina_ajustes_manuales (id bigint PRIMARY KEY, periodo_id bigint, nomina_empleado_id bigint, tipo text, concepto text, observacion text, valor numeric, activo boolean DEFAULT true)`
  ,nomina_parametros_economicos: `CREATE TABLE IF NOT EXISTS nomina_parametros_economicos (id bigint PRIMARY KEY, empresa_id bigint, vigente_desde date, vigente_hasta date, porcentaje_salud_empleado numeric DEFAULT 0, porcentaje_pension_empleado numeric DEFAULT 0, regla_redondeo text)`
  ,auditoria: `CREATE TABLE IF NOT EXISTS auditoria (id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, usuario_id bigint, accion text, tabla_afectada text, registro_id bigint, descripcion text, datos_anteriores jsonb, datos_nuevos jsonb, ip text, user_agent text)`
  ,historial_cambios: `CREATE TABLE IF NOT EXISTS historial_cambios (id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, usuario_id bigint, tabla_afectada text, registro_id bigint, campo text, valor_anterior text, valor_nuevo text, motivo text)`
};

const q = async (client: Client, sql: string, params: unknown[] = []) => client.query(sql, params);
const snapshot = async (client: Client, table: string, minId: number) => {
  const result = await q(client, `SELECT COUNT(*)::int AS count, md5(COALESCE(string_agg(md5(to_jsonb(x)::text), '' ORDER BY to_jsonb(x)::text), '')) AS hash FROM (SELECT * FROM ${table} WHERE id >= $1) x`, [minId]);
  return { count: Number(result.rows[0].count), hash: result.rows[0].hash as string };
};
const print = (label: string, value: unknown) => console.log(`${label}: ${JSON.stringify(value)}`);

async function main() {
  const client = new Client({ connectionString: localUrl });
  await client.connect();
  const existed = new Map<string, boolean>();
  const addedBaseColumns: string[] = [];
  try {
    console.log('fixture: setup');
    const explicitRequirements: Record<string, string[]> = {
      nomina_asistencia_diaria: ['estado_dia', 'activo', 'observacion'],
      nomina_novedades: ['vinculacion_id', 'tipo_novedad_id', 'activo'],
      nomina_novedad_turnos: ['nomina_novedad_id', 'vinculacion_id', 'tipo_turno', 'activo'],
  nomina_liquidaciones: ['requiere_recalculo', 'total_liquidacion', 'deducciones', 'salario_base'],
      nomina_movimientos: ['familia_movimiento', 'tipo_movimiento', 'valor_total', 'activo', 'es_devengado', 'es_deduccion', 'afecta_seguridad_social'],
      nomina_tipos_novedad: ['codigo_operativo', 'activo'],
      nomina_revision_operativa: ['estado_revision', 'version_revision'],
      nomina_empleados: ['neto_pagar', 'detalle_calculo', 'created_at'],
      modalidades: ['activo'],
      instituciones: ['activo'],
      sedes: ['activo'],
      cargos_operativos: ['activo']
    };
    for (const [table, columns] of Object.entries(explicitRequirements)) {
      const existing = await q(client, `SELECT to_regclass($1)::text AS name`, [`public.${table}`]);
      if (!existing.rows[0]?.name) continue;
      const missing = await q(client, `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name = ANY($2::text[])`, [table, columns]);
      if (missing.rowCount !== columns.length) {
        const unsafe = await q(client, `SELECT COUNT(*)::int AS count FROM ${table} WHERE id < 900000`);
        if (Number(unsafe.rows[0]?.count ?? 0) > 0) throw new Error(`No se puede reemplazar ${table}: contiene filas no sintéticas`);
        await q(client, `DROP TABLE IF EXISTS ${table} CASCADE`);
      }
    }
    for (const table of syntheticTables) {
      const result = await q(client, `SELECT to_regclass($1)::text AS name`, [`public.${table}`]);
      existed.set(table, Boolean(result.rows[0]?.name));
      if (!existed.get(table)) await q(client, ddl[table]!);
    }
    const documentaryView = await q(client, `SELECT to_regclass('public.vw_resumen_expediente_documental')::text AS name`);
    existed.set('vw_resumen_expediente_documental', Boolean(documentaryView.rows[0]?.name));
    if (!existed.get('vw_resumen_expediente_documental')) await q(client, `CREATE VIEW vw_resumen_expediente_documental AS SELECT NULL::bigint AS vinculacion_id, 0::int AS total_requeridos, 0::int AS total_faltantes, 0::int AS total_cargados, 0::numeric AS porcentaje_cumplimiento`);
    for (const column of ['metodo_pago', 'cargo_operativo_id']) {
      const columnResult = await q(client, `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='vinculaciones' AND column_name=$1`, [column]);
      if (!columnResult.rowCount) { await q(client, `ALTER TABLE vinculaciones ADD COLUMN ${column} ${column === 'metodo_pago' ? 'text' : 'bigint'}`); addedBaseColumns.push(column); }
    }
    for (const [table, columns] of Object.entries({
      nomina_periodos: [['nombre_periodo', 'text'], ['tipo_periodo', 'text'], ['requiere_asistencia', 'boolean DEFAULT false'], ['activo', 'boolean DEFAULT true'], ['created_at', 'timestamptz DEFAULT now()']],
      contratos: [['numero_contrato', 'text'], ['entidad_contratante', 'text'], ['fecha_inicio', 'date'], ['fecha_finalizacion', 'date']],
      personas: [['numero_documento', 'text'], ['segundo_nombre', 'text'], ['segundo_apellido', 'text'], ['municipio_residencia_id', 'bigint']]
      ,vinculaciones: [['tipo_vinculacion_id', 'bigint'], ['tipo_jornada_id', 'bigint'], ['empresa_id', 'bigint']]
      ,gestor_personal_asignaciones: [['contrato_id', 'bigint']]
      ,nomina_categorias_salariales: [['modalidad', 'text'], ['otros_recargos', 'numeric DEFAULT 0']]
      ,auditoria_eventos: [['usuario_id', 'bigint'], ['ip_address', 'text'], ['user_agent', 'text'], ['fecha_evento', 'timestamptz DEFAULT now()']]
    } as Record<string, readonly (readonly [string, string])[]>)) {
      for (const [column, definition] of columns) {
        const exists = await q(client, `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`, [table, column]);
        if (!exists.rowCount) { await q(client, `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`); addedBaseColumns.push(`${table}.${column}`); }
      }
    }
    console.log('fixture: cleanup prior');
    await q(client, `DELETE FROM integracion_evento_impactos WHERE evento_id IN (SELECT id FROM integracion_eventos WHERE vinculacion_id >= 960000)`);
    await q(client, `DELETE FROM integracion_eventos WHERE vinculacion_id >= 960000`);
    await q(client, `DELETE FROM integracion_evento_impactos WHERE evento_id IN (SELECT id FROM integracion_eventos WHERE idempotency_key LIKE 'phase53-%')`);
    await q(client, `DELETE FROM integracion_eventos WHERE idempotency_key LIKE 'phase53-%'`);
    for (const table of ['nomina_novedad_turnos','nomina_novedad_documentos','nomina_novedad_coberturas','nomina_revision_operativa','nomina_movimientos','nomina_novedades','nomina_asistencia_diaria','nomina_liquidaciones','nomina_contextos_operativos_base','nomina_empleados','cobertura_externos','cobertura_asignaciones','personal_asignaciones_laborales','vinculacion_condiciones_economicas','vinculaciones','focalizacion_final','nomina_periodos','personas','contratos','empresas']) {
      await q(client, `DELETE FROM ${table} WHERE id >= 900000`);
    }
    console.log('fixture: seed');
    for (const phaseFile of ['sql/phase-53-integracion-sync-selectiva.sql','sql/phase-54-integracion-actividad-laboral.sql','sql/phase-55-integracion-recalc-selectivo.sql','sql/phase-56-integracion-periodos-semantica.sql']) {
      await q(client, fs.readFileSync(path.join(root, phaseFile), 'utf8'));
    }
    await q(client, `INSERT INTO empresas(id,nombre_empresa) VALUES ($1,'Empresa Sintética A'),($2,'Empresa Sintética B') ON CONFLICT DO NOTHING`, [ids.companyA, ids.companyB]);
    await q(client, `INSERT INTO contratos(id,empresa_id) VALUES ($1,$3),($2,$4) ON CONFLICT DO NOTHING`, [ids.contractA, ids.contractB, ids.companyA, ids.companyB]);
    await q(client, `INSERT INTO personas(id,primer_nombre,primer_apellido) VALUES ($1,'Ana','Sintética'),($2,'Bruno','Sintético'),($3,'Cata','Sintética') ON CONFLICT DO NOTHING`, [ids.personA, ids.personB, ids.personC]);
    await q(client, `INSERT INTO contrato_cargos(id,nombre_cargo) VALUES ($1,'Cargo Sintético') ON CONFLICT DO NOTHING`, [ids.cargoA]);
    await q(client, `INSERT INTO vinculaciones(id,persona_id,contrato_id,estado_vinculacion,fecha_inicio,fecha_fin,cotiza_pension,contrato_cargo_id) VALUES ($1,$2,$3,'ACTIVA','2026-09-10',NULL,TRUE,$4),($5,$6,$3,'ACTIVA','2026-09-01',NULL,TRUE,$4),($7,$8,$9,'ACTIVA','2026-09-01',NULL,TRUE,$4) ON CONFLICT DO NOTHING`, [ids.vincA, ids.personA, ids.contractA, ids.cargoA, ids.vincB, ids.personB, ids.vincC, ids.personC, ids.contractB]);
    await q(client, `INSERT INTO nomina_periodos(id,contrato_id,fecha_inicio,fecha_fin,estado) VALUES ($1,$3,'2026-09-01','2026-09-30','ABIERTO'),($2,$3,'2026-10-01','2026-10-31','CERRADO'),($4,$5,'2026-09-01','2026-09-30','ABIERTO') ON CONFLICT DO NOTHING`, [ids.openA, ids.closedA, ids.contractA, ids.openB, ids.contractB]);
    await q(client, `INSERT INTO municipios(id,nombre_municipio) VALUES (985001,'Municipio Sintético') ON CONFLICT DO NOTHING`);
    await q(client, `INSERT INTO focalizacion_final(id,contrato_id,municipio_id,institucion_id,sede_id,modalidad_id,institucion_final,sede_final,modalidad_final,municipio_texto) VALUES (986001,$1,985001,987001,988001,989001,'Institución A','Sede A','Modalidad A','Municipio Sintético'),(986002,$1,985001,987001,988002,989002,'Institución A','Sede B','Modalidad B','Municipio Sintético'),(986003,$2,985001,987001,988003,989003,'Institución B','Sede C','Modalidad C','Municipio Sintético') ON CONFLICT DO NOTHING`, [ids.contractA, ids.contractB]);
    await q(client, `INSERT INTO cobertura_asignaciones(id,contrato_id,municipio_id,focalizacion_final_id,vinculacion_id,institucion,sede,modalidad,fecha_inicio,activo) VALUES ($1,$4,985001,986001,$2,'Institución A','Sede A','Modalidad A','2026-09-01',TRUE),($3,$4,985001,986003,$5,'Institución B','Sede C','Modalidad C','2026-09-01',TRUE) ON CONFLICT DO NOTHING`, [ids.assignmentA, ids.vincA, ids.assignmentB, ids.contractA, ids.vincC]);
    await q(client, `INSERT INTO nomina_empleados(id,periodo_id,vinculacion_id,fecha_inicio_pago,fecha_fin_pago,dias_periodo,dias_pagados,estado,activo,salario_base,auxilio_transporte) VALUES ($1,$2,$3,'2026-09-01','2026-09-30',30,30,'PENDIENTE',TRUE,1000,100),($4,$5,$6,'2026-09-01','2026-09-30',30,30,'PENDIENTE',TRUE,1000,100),($7,$8,$9,'2026-09-01','2026-09-30',30,30,'PENDIENTE',TRUE,1000,100) ON CONFLICT DO NOTHING`, [ids.employeeOpen, ids.openA, ids.vincA, ids.employeeClosed, ids.closedA, ids.vincA, ids.employeeOther, ids.openB, ids.vincC]);
    await q(client, `INSERT INTO nomina_tipos_novedad(id,codigo_operativo,nombre,categoria,modelo_registro,activo,permite_rango,afecta_salario,afecta_transporte,afecta_recargos,efecto_salario,efecto_auxilio_transporte,efecto_recargos_detallado) VALUES ($1,'SINT','Novedad sintética','AUSENCIA','ORDINARIA',TRUE,TRUE,FALSE,FALSE,FALSE,NULL,NULL,NULL), (990102,'PNR','Permiso no remunerado','AUSENCIA','ORDINARIA',TRUE,TRUE,TRUE,TRUE,TRUE,'DESCUENTA_PROPORCIONAL','DESCUENTA_DIA','EXCLUIR_DIA') ON CONFLICT DO NOTHING`, [ids.typeNovelty]);
    await q(client, `INSERT INTO nomina_liquidaciones(id,vinculacion_id,periodo_id,estado,activo,total_liquidacion) VALUES ($1,$2,$3,'PRELIMINAR',TRUE,123),($4,$5,$3,'PRELIMINAR',TRUE,456),($6,$2,$7,'PRELIMINAR',TRUE,789) ON CONFLICT DO NOTHING`, [ids.liqA, ids.vincA, ids.openA, ids.liqB, ids.vincB, ids.liqClosed, ids.closedA]);
    await q(client, `INSERT INTO nomina_asistencia_diaria(id,periodo_id,vinculacion_id,fecha,estado_dia,activo,observacion) VALUES ($1,$2,$3,'2026-09-05','PRESENTE',TRUE,'fija'),($4,$2,$3,'2026-09-06','PRESENTE',TRUE,'fija') ON CONFLICT DO NOTHING`, [ids.attendance, ids.openA, ids.vincA, ids.attendance + 1]);
    await q(client, `INSERT INTO nomina_novedades(id,nomina_empleado_id,periodo_id,vinculacion_id,tipo_novedad_id,tipo_novedad_codigo_operativo,fecha_inicio,fecha_fin,dias,observacion,revisado,activo,requiere_cobertura,cubierta) VALUES ($1,$2,$3,$4,$5,'SINT','2026-09-07','2026-09-08',2,'fija',FALSE,TRUE,FALSE,FALSE) ON CONFLICT DO NOTHING`, [ids.novelty, ids.employeeOpen, ids.openA, ids.vincA, ids.typeNovelty]);
    await q(client, `INSERT INTO nomina_novedad_turnos(id,periodo_id,nomina_novedad_id,nomina_empleado_id,vinculacion_id,tipo_turno,contexto_operativo,activo) VALUES ($1,$2,$3,$4,$5,'INTERNO','{"turno":"fijo"}',TRUE) ON CONFLICT DO NOTHING`, [ids.turn, ids.openA, ids.novelty, ids.employeeOpen, ids.vincA]);
    await q(client, `INSERT INTO nomina_revision_operativa(id,periodo_id,nomina_empleado_id,persona_id,vinculacion_id,estado_revision) VALUES ($1,$2,$3,$4,$5,'PENDIENTE') ON CONFLICT DO NOTHING`, [ids.revision, ids.openA, ids.employeeOpen, ids.personA, ids.vincA]);
    const operationalTables = ['nomina_asistencia_diaria', 'nomina_novedades', 'nomina_novedad_turnos'];
    const collectOperational = async () => { const result: Record<string, unknown> = {}; for (const table of operationalTables) result[table] = await snapshot(client, table, 992000); return result; };
    const beforeOperational = await collectOperational();
    const { processNextIntegracionEvent } = await import('../../modules/integracion/integracion.service.js');
    let eventCounter = 0;
    const event = async (type: string, vinc: number, contract: number, company: number, date: string, key: string, after: Record<string, unknown> = {}) => {
      const result = await q(client, `INSERT INTO integracion_eventos(event_type,aggregate_type,aggregate_id,empresa_id,contrato_id,persona_id,vinculacion_id,effective_date,periodo_id,payload_after,idempotency_key,status) SELECT $1,'vinculacion',$2::text,$3::bigint,$4::bigint,v.persona_id,$2::bigint,$5::date,(SELECT np.id FROM nomina_periodos np WHERE np.contrato_id=$4::bigint AND np.fecha_inicio <= $5::date AND np.fecha_fin >= $5::date ORDER BY np.id LIMIT 1),$6::jsonb,$7,'PENDIENTE' FROM vinculaciones v WHERE v.id=$2::bigint RETURNING id`, [type, vinc, company, contract, date, JSON.stringify(after), key]);
      assert.equal(result.rowCount, 1); eventCounter += 1; return String(result.rows[0].id);
    };
    const traceabilityTypes = new Set(['ASISTENCIA_CAMBIADA','NOVEDAD_CREADA','NOVEDAD_ACTUALIZADA','NOVEDAD_DESACTIVADA','TURNO_CREADO','TURNO_ACTUALIZADO','TURNO_DESACTIVADO','LIQUIDACION_RECALCULADA','LIQUIDACION_FINALIZADA']);
    const run = async (label: string, expectedType?: string) => { let result; do { result = await processNextIntegracionEvent(`phase53-harness-${label}`); console.log(`worker ${label}: ${result?.status ?? 'none'}${result ? ` ${result.event_type}#${result.id}` : ''}${result?.last_error_code ? ` ${result.last_error_code}: ${result.last_error_message}` : ''}`); assert.ok(result); } while (expectedType ? result.event_type !== expectedType : !label.startsWith('reverse') && traceabilityTypes.has(result.event_type)); return result; };
    const incomeEvent = await event('VINCULACION_CREADA', ids.vincA, ids.contractA, ids.companyA, '2026-09-10', 'phase53-income');
    await run('income');
    const incomeRow = await q(client, `SELECT fecha_inicio_pago::text,fecha_fin_pago::text FROM nomina_empleados WHERE periodo_id=$1 AND vinculacion_id=$2`, [ids.openA, ids.vincA]);
    assert.deepEqual(incomeRow.rows[0], { fecha_inicio_pago: '2026-09-10', fecha_fin_pago: '2026-09-30' }); print('ingreso intrames before/after', { before: null, after: incomeRow.rows[0], only_vinculation: true });
    await q(client, `UPDATE vinculaciones SET fecha_fin='2026-09-15',estado_vinculacion='RETIRADA' WHERE id=$1`, [ids.vincA]);
    await event('VINCULACION_RETIRADA', ids.vincA, ids.contractA, ids.companyA, '2026-09-15', 'phase53-retirement', { fecha_fin: '2026-09-15' }); await run('retirement');
    // Regla independiente del motor: intervalo inclusivo [max(ingreso,periodo inicio),min(retiro,periodo fin)].
    const retirementExpected = { fecha_inicio_pago: '2026-09-10', fecha_fin_pago: '2026-09-15' };
    const retirementExpectedDays = Math.floor((Date.parse(`${retirementExpected.fecha_fin_pago}T00:00:00Z`) - Date.parse(`${retirementExpected.fecha_inicio_pago}T00:00:00Z`)) / 86400000) + 1;
    const retirementRow = await q(client, `SELECT fecha_inicio_pago::text,fecha_fin_pago::text,dias_pagados::int FROM nomina_empleados WHERE periodo_id=$1 AND vinculacion_id=$2`, [ids.openA, ids.vincA]);
    assert.deepEqual(retirementRow.rows[0], { ...retirementExpected, dias_pagados: retirementExpectedDays });
    const historicalDays = await q(client, `SELECT COUNT(*)::int AS count FROM nomina_asistencia_diaria WHERE periodo_id=$1 AND vinculacion_id=$2 AND fecha < '2026-09-15' AND activo=TRUE`, [ids.openA, ids.vincA]);
    assert.equal(Number(historicalDays.rows[0].count), 2);
    print('retiro intrames before/expected/after', { before: incomeRow.rows[0], expected: { ...retirementExpected, dias_pagados: retirementExpectedDays }, after: retirementRow.rows[0], historical_days_preserved: true, post_retirement_liquidated: false });
    await q(client, `UPDATE cobertura_asignaciones SET fecha_fin='2026-09-19' WHERE id=$1`, [ids.assignmentA]);
    await q(client, `INSERT INTO cobertura_asignaciones(id,contrato_id,municipio_id,focalizacion_final_id,vinculacion_id,institucion,sede,modalidad,fecha_inicio,activo) VALUES (980003,$1,985001,986002,$2,'Institución A','Sede B','Modalidad B','2026-09-20',TRUE)`, [ids.contractA, ids.vincA]);
    await event('ASIGNACION_OPERATIVA_CAMBIADA', ids.vincA, ids.contractA, ids.companyA, '2026-09-20', 'phase53-assignment-1', { sede: 'Sede B', modalidad: 'Modalidad B' }); await run('assignment-1');
    await q(client, `INSERT INTO cobertura_asignaciones(id,contrato_id,municipio_id,focalizacion_final_id,vinculacion_id,institucion,sede,modalidad,fecha_inicio,activo) VALUES (980004,$1,985001,986001,$2,'Institución A','Sede A','Modalidad A','2026-09-22',TRUE)`, [ids.contractA, ids.vincA]);
    await event('ASIGNACION_OPERATIVA_CAMBIADA', ids.vincA, ids.contractA, ids.companyA, '2026-09-22', 'phase53-assignment-2', { sede: 'Sede A', modalidad: 'Modalidad A' }); await run('assignment-2');
    const assignments = await q(client, `SELECT sede,modalidad,fecha_inicio::text,fecha_fin::text FROM cobertura_asignaciones WHERE vinculacion_id=$1 ORDER BY fecha_inicio`, [ids.vincA]); assert.equal(assignments.rows.length, 3); print('sede/modalidad before/after', assignments.rows);
    await event('CONDICION_PENSION_CAMBIADA', ids.vincA, ids.contractA, ids.companyA, '2026-09-23', 'phase53-pension', { cotiza_pension: false }); await run('pension');
    const pensions = await q(client, `SELECT id,requiere_recalculo,estado FROM nomina_liquidaciones ORDER BY id`); assert.equal(pensions.rows.find((row) => Number(row.id) === ids.liqA)?.requiere_recalculo, true); assert.equal(pensions.rows.find((row) => Number(row.id) === ids.liqB)?.requiere_recalculo, false); assert.equal(pensions.rows.find((row) => Number(row.id) === ids.liqClosed)?.requiere_recalculo, false); print('pensión liquidaciones before/after', pensions.rows);
    const pnrOtherBefore = await snapshot(client, 'nomina_empleados', ids.employeeOther);
    await q(client, `INSERT INTO nomina_novedades(id,nomina_empleado_id,periodo_id,vinculacion_id,tipo_novedad_id,tipo_novedad_codigo_operativo,fecha_inicio,fecha_fin,dias,observacion,revisado,activo,requiere_cobertura,cubierta) VALUES (992010,$1,$2,$3,990102,'PNR','2026-09-10','2026-09-13',4,'PNR sintético',FALSE,TRUE,FALSE,FALSE) ON CONFLICT DO NOTHING`, [ids.employeeOpen, ids.openA, ids.vincA]);
    const pnrBase = await q(client, `SELECT salario_base::numeric,auxilio_transporte::numeric,otros_devengos::numeric FROM nomina_empleados WHERE id=$1`, [ids.employeeOpen]);
    const pnrExpected = { dias: 4, salario: Number(pnrBase.rows[0].salario_base) * 4 / 30, transporte: Number(pnrBase.rows[0].auxilio_transporte) * 4 / 30, recargos: Number(pnrBase.rows[0].otros_devengos) * 4 / 30 };
    const pnrEvent = await event('NOVEDAD_CREADA', ids.vincA, ids.contractA, ids.companyA, '2026-09-10', 'phase55-pnr', { dias_afectados: ['2026-09-10','2026-09-11','2026-09-12','2026-09-13'], origen: 'Novedades' }); await run('pnr', 'NOVEDAD_CREADA');
    const pnrAfter = await q(client, `SELECT detalle_calculo->'novedades' AS novedades FROM nomina_empleados WHERE id=$1`, [ids.employeeOpen]);
    const pnrImpact = await q(client, `SELECT i.recalc_estado FROM integracion_evento_impactos i WHERE i.evento_id=$1 AND i.periodo_id=$2`, [pnrEvent, ids.openA]);
    assert.equal(pnrImpact.rows[0]?.recalc_estado, process.env.PHASE55_RECALC === 'true' ? 'RECALCULADA' : 'SIN_CAMBIOS');
    const pnrOutput = await q(client, `SELECT COUNT(*)::int AS count FROM integracion_eventos WHERE idempotency_key=$1`, [`integracion-recalc:${pnrEvent}:${ids.vincA}:${ids.openA}`]); assert.equal(Number(pnrOutput.rows[0].count), process.env.PHASE55_RECALC === 'true' ? 1 : 0);
    assert.deepEqual(await snapshot(client, 'nomina_empleados', ids.employeeOther), pnrOtherBefore);
    print('PNR >3 días fórmula/resultado', { expected: pnrExpected, obtained: pnrAfter.rows[0]?.novedades, recalc: pnrImpact.rows[0]?.recalc_estado, other_vinculation_unchanged: true });
    const beforeReverseOperational = await collectOperational();
    await q(client, `INSERT INTO nomina_movimientos(id,periodo_id,nomina_empleado_id,vinculacion_id,fecha,tipo_movimiento,familia_movimiento,estado,valor_unitario,valor_total,es_devengado,es_deduccion,afecta_seguridad_social,activo) VALUES (992010,$1,$2,$3,'2026-09-12','TURNO_INTERNO','TURNO','APROBADO',500,500,TRUE,FALSE,FALSE,TRUE) ON CONFLICT DO NOTHING`, [ids.openA, ids.employeeOpen, ids.vincA]);
    await q(client, `UPDATE nomina_novedad_turnos SET movimiento_id=992010,tipo_turno='INTERNO',activo=TRUE WHERE id=$1`, [ids.turn]);
    const turnBefore = await q(client, `SELECT neto_pagar::numeric AS neto, detalle_calculo->'seguridad_social'->>'base_pension' AS ibc FROM nomina_empleados WHERE id=$1`, [ids.employeeOpen]);
    const turnCreated = await event('TURNO_CREADO', ids.vincA, ids.contractA, ids.companyA, '2026-09-12', 'phase55-turn-internal-create', { origen: 'Turnos', cantidad: 1 }); await run('turn-internal-create', 'TURNO_CREADO');
    const turnAfterCreate = await q(client, `SELECT neto_pagar::numeric AS neto, detalle_calculo->'seguridad_social'->>'base_pension' AS ibc FROM nomina_empleados WHERE id=$1`, [ids.employeeOpen]);
    if (process.env.PHASE55_RECALC === 'true') assert.equal(Number(turnAfterCreate.rows[0].neto) - Number(turnBefore.rows[0].neto), 500);
    else assert.equal(Number(turnAfterCreate.rows[0].neto), Number(turnBefore.rows[0].neto));
    assert.equal(turnAfterCreate.rows[0].ibc, turnBefore.rows[0].ibc);
    await q(client, `UPDATE nomina_movimientos SET valor_unitario=700,valor_total=700 WHERE id=992010`); await event('TURNO_ACTUALIZADO', ids.vincA, ids.contractA, ids.companyA, '2026-09-12', 'phase55-turn-internal-update', { origen: 'Turnos', cantidad: 1 }); await run('turn-internal-update', 'TURNO_ACTUALIZADO');
    const turnAfterUpdate = await q(client, `SELECT neto_pagar::numeric AS neto FROM nomina_empleados WHERE id=$1`, [ids.employeeOpen]); if (process.env.PHASE55_RECALC === 'true') assert.equal(Number(turnAfterUpdate.rows[0].neto) - Number(turnBefore.rows[0].neto), 700); else assert.equal(Number(turnAfterUpdate.rows[0].neto), Number(turnBefore.rows[0].neto));
    await q(client, `UPDATE nomina_movimientos SET activo=FALSE WHERE id=992010`); await q(client, `UPDATE nomina_novedad_turnos SET activo=FALSE WHERE id=$1`, [ids.turn]); await event('TURNO_DESACTIVADO', ids.vincA, ids.contractA, ids.companyA, '2026-09-12', 'phase55-turn-internal-disable', { origen: 'Turnos', cantidad: 1 }); await run('turn-internal-disable', 'TURNO_DESACTIVADO');
    const turnAfterDisable = await q(client, `SELECT neto_pagar::numeric AS neto FROM nomina_empleados WHERE id=$1`, [ids.employeeOpen]); assert.equal(Number(turnAfterDisable.rows[0].neto), Number(turnBefore.rows[0].neto));
    const otherTurnBefore = await snapshot(client, 'nomina_empleados', ids.employeeOther);
    await q(client, `INSERT INTO nomina_movimientos(id,periodo_id,nomina_empleado_id,vinculacion_id,fecha,tipo_movimiento,familia_movimiento,estado,valor_unitario,valor_total,es_devengado,es_deduccion,afecta_seguridad_social,activo) VALUES (992011,$1,$2,$3,'2026-09-13','TURNO_EXTERNO','TURNO','APROBADO',400,400,TRUE,FALSE,TRUE,TRUE) ON CONFLICT DO NOTHING`, [ids.openA, ids.employeeOpen, ids.vincA]);
    await q(client, `UPDATE nomina_novedad_turnos SET movimiento_id=992011,tipo_turno='EXTERNO',contexto_operativo='{"modalidad":"Modalidad A"}',activo=TRUE WHERE id=$1`, [ids.turn]); await event('TURNO_CREADO', ids.vincA, ids.contractA, ids.companyA, '2026-09-13', 'phase55-turn-external', { origen: 'Turnos', cantidad: 1 }); await run('turn-external', 'TURNO_CREADO');
    assert.deepEqual(await snapshot(client, 'nomina_empleados', ids.employeeOther), otherTurnBefore);
    print('ciclo turnos fórmula/resultado', { internal: { before: turnBefore.rows[0], created: turnAfterCreate.rows[0], updated: turnAfterUpdate.rows[0], disabled: turnAfterDisable.rows[0], expected_value: 500, ibc_preserved: true }, external: { expected_value: 400, modality: 'Modalidad A', other_vinculation_unchanged: true }, events: [turnCreated] });
    await q(client, `UPDATE nomina_novedad_turnos SET movimiento_id=NULL,tipo_turno='INTERNO',contexto_operativo='{"turno":"fijo"}',activo=TRUE WHERE id=$1`, [ids.turn]);
    const repeated = await event('VINCULACION_ACTUALIZADA', ids.vincA, ids.contractA, ids.companyA, '2026-09-23', 'phase53-repeat', {}); await run('repeat-1'); await q(client, `UPDATE integracion_eventos SET status='PENDIENTE',available_at=NOW() WHERE id=$1`, [repeated]); await run('repeat-2'); const repeatImpact = await q(client, `SELECT estado FROM integracion_evento_impactos WHERE evento_id=$1 AND periodo_id=$2`, [repeated, ids.openA]); assert.equal(repeatImpact.rows[0].estado, 'SIN_CAMBIOS'); print('evento repetido', repeatImpact.rows[0]);
    const closedBefore = await q(client, `SELECT requiere_recalculo,estado,total_liquidacion FROM nomina_liquidaciones WHERE id=$1`, [ids.liqClosed]); const closedEvent = await event('CONDICION_PENSION_CAMBIADA', ids.vincA, ids.contractA, ids.companyA, '2026-10-24', 'phase53-closed', { cotiza_pension: true }); await run('closed'); const closedAfter = await q(client, `SELECT requiere_recalculo,estado,total_liquidacion FROM nomina_liquidaciones WHERE id=$1`, [ids.liqClosed]); assert.deepEqual(closedAfter.rows, closedBefore.rows); print('periodo cerrado before/after', { event: closedEvent, before: closedBefore.rows[0], after: closedAfter.rows[0] });
    const fast1 = await event('ASIGNACION_OPERATIVA_CAMBIADA', ids.vincA, ids.contractA, ids.companyA, '2026-09-25', 'phase53-fast-1', { sede: 'Sede B' }); const fast2 = await event('ASIGNACION_OPERATIVA_CAMBIADA', ids.vincA, ids.contractA, ids.companyA, '2026-09-26', 'phase53-fast-2', { sede: 'Sede A' }); await run('fast-1'); await run('fast-2'); const versions = await q(client, `SELECT evento_id,version_esperada,estado FROM integracion_evento_impactos WHERE evento_id IN ($1,$2) AND periodo_id=$3 ORDER BY evento_id::bigint`, [fast1, fast2, ids.openA]); assert.ok(Number(versions.rows[0].evento_id) < Number(versions.rows[1].evento_id)); assert.equal(Number(versions.rows[0].version_esperada), Number(versions.rows[0].evento_id)); assert.equal(Number(versions.rows[1].version_esperada), Number(versions.rows[1].evento_id)); print('dos cambios rápidos', versions.rows);
    await q(client, `CREATE OR REPLACE FUNCTION phase53_fail_employee() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.vinculacion_id=960002 THEN RAISE EXCEPTION 'synthetic rollback'; END IF; RETURN NEW; END $$`);
    await q(client, `DROP TRIGGER IF EXISTS phase53_fail_employee_trigger ON nomina_empleados`);
    await q(client, `CREATE TRIGGER phase53_fail_employee_trigger BEFORE INSERT OR UPDATE ON nomina_empleados FOR EACH ROW EXECUTE FUNCTION phase53_fail_employee()`);
    const rollbackEvent = await event('VINCULACION_ACTUALIZADA', ids.vincB, ids.contractA, ids.companyA, '2026-09-27', 'phase53-rollback', {}); await run('rollback'); const rollbackStatus = await q(client, `SELECT status FROM integracion_eventos WHERE id=$1`, [rollbackEvent]); assert.equal(rollbackStatus.rows[0].status, 'ERROR'); print('rollback por error', rollbackStatus.rows[0]); await q(client, `DROP TRIGGER phase53_fail_employee_trigger ON nomina_empleados`); await q(client, `DROP FUNCTION phase53_fail_employee()`);
    const isolationEvent = await event('VINCULACION_CREADA', ids.vincC, ids.contractB, ids.companyB, '2026-09-10', 'phase53-isolation', {}); await run('isolation'); const isolation = await q(client, `SELECT COUNT(*)::int AS count FROM nomina_empleados WHERE vinculacion_id=$1 AND periodo_id=$2`, [ids.vincC, ids.openB]); const mainEmployees = await q(client, `SELECT COUNT(*)::int AS count FROM nomina_empleados WHERE vinculacion_id=$1 AND periodo_id=$2`, [ids.vincA, ids.openA]); const isolationImpact = await q(client, `SELECT periodo_id,estado FROM integracion_evento_impactos WHERE evento_id=$1`, [isolationEvent]); print('aislamiento empresa/contrato', { other_scope: isolation.rows[0], main_scope: mainEmployees.rows[0], impact: isolationImpact.rows[0] }); assert.equal(Number(isolation.rows[0].count), 1); assert.equal(Number(mainEmployees.rows[0].count), 1);
    const ambiguousBefore = await snapshot(client, 'nomina_empleados', ids.employeeOpen);
    await q(client, `INSERT INTO nomina_periodos(id,contrato_id,fecha_inicio,fecha_fin,estado) VALUES (970004,$1,'2026-09-01','2026-09-30','ABIERTO')`, [ids.contractA]);
    const ambiguousEvent = await q(client, `INSERT INTO integracion_eventos(event_type,aggregate_type,aggregate_id,empresa_id,contrato_id,persona_id,vinculacion_id,effective_date,periodo_id,payload_after,idempotency_key,status) VALUES ('ASIGNACION_OPERATIVA_CAMBIADA','vinculacion',$1::text,$2,$3,$4,$1::bigint,'2026-09-24',NULL,'{}'::jsonb,'phase56-ambiguous','PENDIENTE') RETURNING id`, [ids.vincA, ids.companyA, ids.contractA, ids.personA]);
    await run('ambiguous-personal', 'ASIGNACION_OPERATIVA_CAMBIADA');
    const ambiguousImpact = await q(client, `SELECT periodo_id,estado,accion_requerida,last_error_code FROM integracion_evento_impactos WHERE evento_id=$1`, [ambiguousEvent.rows[0].id]);
    assert.deepEqual(ambiguousImpact.rows[0], { periodo_id: null, estado: 'BLOQUEADO_PERIODIZACION', accion_requerida: 'BLOQUEADO_PERIODIZACION', last_error_code: 'INTEGRACION_PERIODIZATION_AMBIGUOUS' });
    assert.deepEqual(await snapshot(client, 'nomina_empleados', ids.employeeOpen), ambiguousBefore);
    print('periodización ambigua bloqueada', { impact: ambiguousImpact.rows[0], population_unchanged: true });
    const { getActividadLaboral } = await import('../../modules/vinculaciones/actividad-laboral.service.js');
    const reverseTypes = ['ASISTENCIA_CAMBIADA','NOVEDAD_CREADA','NOVEDAD_ACTUALIZADA','NOVEDAD_DESACTIVADA','TURNO_CREADO','TURNO_ACTUALIZADO','TURNO_DESACTIVADO','LIQUIDACION_RECALCULADA','LIQUIDACION_FINALIZADA'];
    const protectedTables = ['personas','vinculaciones','cobertura_asignaciones','nomina_empleados','nomina_asistencia_diaria','nomina_novedades','nomina_novedad_turnos','nomina_liquidaciones'];
    const beforeProtected: Record<string, unknown> = {};
    for (const table of protectedTables) beforeProtected[table] = await snapshot(client, table, 900000);
    for (const [index, type] of reverseTypes.entries()) {
      await event(type, ids.vincA, ids.contractA, ids.companyA, `2026-09-${String(10 + index).padStart(2, '0')}`, `phase53-reverse-${type}`, { operacion_id: `synthetic-${type}`, fecha_desde: '2026-09-10', fecha_hasta: '2026-09-10', dias_afectados: ['2026-09-10'], cantidad: 1, origen: type.startsWith('ASISTENCIA') ? 'Planilla' : type.startsWith('NOVEDAD') ? 'Novedades' : type.startsWith('TURNO') ? 'Turnos' : 'Nómina' });
      await run(`reverse-${type}`, type);
    }
    const repeatReverse = await event('ASISTENCIA_CAMBIADA', ids.vincA, ids.contractA, ids.companyA, '2026-09-10', 'phase53-reverse-repeat', { operacion_id: 'synthetic-repeat' });
    await run('reverse-repeat-1', 'ASISTENCIA_CAMBIADA');
    await q(client, `UPDATE integracion_eventos SET status='PENDIENTE',available_at=NOW() WHERE id=$1`, [repeatReverse]);
    await run('reverse-repeat-2', 'ASISTENCIA_CAMBIADA');
    const repeatReverseImpact = await q(client, `SELECT estado FROM integracion_evento_impactos WHERE evento_id=$1`, [repeatReverse]);
    assert.equal(repeatReverseImpact.rows[0]?.estado, 'SIN_CAMBIOS');
    const activityWithoutEconomics = await getActividadLaboral(ids.vincA, { page: 1, limit: 1, contrato_id: ids.contractA, includeEconomic: false });
    const activityWithEconomics = await getActividadLaboral(ids.vincA, { page: 1, limit: 1, contrato_id: ids.contractA, includeEconomic: true });
    assert.equal(activityWithoutEconomics.pagination.limit, 1);
    assert.equal(activityWithoutEconomics.items[0]?.liquidacion.neto, undefined);
    assert.notEqual(activityWithEconomics.items[0]?.liquidacion.neto, undefined);
    assert.ok(activityWithEconomics.eventos_integracion.length);
    print('actividad laboral pagina/permisos', { page: activityWithoutEconomics.pagination, economic_hidden: activityWithoutEconomics.items[0]?.liquidacion.neto === undefined, economic_visible: activityWithEconomics.items[0]?.liquidacion.neto !== undefined, events: activityWithEconomics.eventos_integracion.length });
    const afterProtected: Record<string, unknown> = {};
    for (const table of protectedTables) afterProtected[table] = await snapshot(client, table, 900000);
    assert.deepEqual(afterProtected, beforeProtected);
    print('eventos inversos sin mutaciones', { before: beforeProtected, after: afterProtected });
    const afterOperational = await collectOperational(); assert.deepEqual(afterOperational, beforeReverseOperational); print('asistencia/novedades/turnos conteos+hashes', { before: beforeReverseOperational, after: afterOperational });
    const financial = await q(client, `SELECT COUNT(*)::int AS count, COALESCE(SUM(total_liquidacion),0)::text AS total FROM nomina_liquidaciones WHERE id IN ($1,$2,$3)`, [ids.liqA, ids.liqB, ids.liqClosed]); assert.equal(financial.rows[0].total, '1368'); print('finanzas sin recálculo', financial.rows[0]);
    console.log(`E2E Phase 4: OK (${eventCounter} eventos sintéticos)`);
  } finally {
    try {
      await q(client, `DELETE FROM integracion_evento_impactos WHERE evento_id IN (SELECT id FROM integracion_eventos WHERE idempotency_key LIKE 'phase53-%')`);
      await q(client, `DELETE FROM integracion_eventos WHERE idempotency_key LIKE 'phase53-%'`);
      await q(client, `DELETE FROM integracion_evento_impactos WHERE evento_id IN (SELECT id FROM integracion_eventos WHERE vinculacion_id >= 960000)`);
      await q(client, `DELETE FROM integracion_eventos WHERE vinculacion_id >= 960000`);
      await q(client, `DROP TRIGGER IF EXISTS phase53_fail_employee_trigger ON nomina_empleados`);
      await q(client, `DROP FUNCTION IF EXISTS phase53_fail_employee()`);
      for (const table of ['nomina_novedad_turnos','nomina_novedad_documentos','nomina_novedad_coberturas','nomina_revision_operativa','nomina_movimientos','nomina_novedades','nomina_asistencia_diaria','nomina_liquidaciones','nomina_contextos_operativos_base','nomina_empleados','cobertura_externos','cobertura_asignaciones','personal_asignaciones_laborales','vinculacion_condiciones_economicas','vinculaciones','focalizacion_final','nomina_periodos','personas','contratos','empresas']) {
        await q(client, `DELETE FROM ${table} WHERE id >= 900000`);
      }
      for (const column of addedBaseColumns) {
        const [table, name] = column.includes('.') ? column.split('.') as [string, string] : ['vinculaciones', column];
        await q(client, `ALTER TABLE ${table} DROP COLUMN IF EXISTS ${name}`);
      }
      await q(client, `DELETE FROM nomina_contextos_operativos_base WHERE vinculacion_id >= 960000`);
      if (existed.get('vw_resumen_expediente_documental') === false) await q(client, `DROP VIEW IF EXISTS vw_resumen_expediente_documental`);
      for (const table of syntheticTables.slice().reverse()) if (existed.get(table) === false) await q(client, `DROP TABLE IF EXISTS ${table}`);
    } finally { await client.end(); try { const { dbPool } = await import('../../config/db.js'); await dbPool.end(); } catch { /* pool may not have initialized */ } }
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
