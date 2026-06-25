import { dbQuery } from '../../config/db';
import { AppError } from '../../utils/AppError';
import type {
  CreatePersonalConfigInput,
  CreateSalarioConfigInput,
  PersonalConfig,
  PersonalRango,
  ProbarPersonalInput,
  ProbarPersonalResult,
  ProbarSalarioInput,
  ProbarSalarioResult,
  RangoInput,
  ReglaRedondeo,
  SalarioConfig,
  ValidacionFormula,
} from './configuracion.types';

// ─── Formula Utilities ────────────────────────────────────────────────────────

const DANGEROUS_KEYWORDS = [
  'require', 'import', 'eval', 'function', 'class', 'new', 'return',
  'while', 'for', 'if', 'switch', 'try', 'catch', 'throw', 'delete',
  '__proto__', 'constructor', 'prototype', 'window', 'global', 'process',
  'fetch', 'document', 'alert', 'console', 'this', '=>', '`',
];

export function validateFormula(formula: string, allowedVars: string[]): ValidacionFormula {
  const clean = formula.trim();
  if (!clean) return { valid: false, error: 'La fórmula no puede estar vacía' };

  const lc = clean.toLowerCase();
  for (const kw of DANGEROUS_KEYWORDS) {
    if (lc.includes(kw.toLowerCase())) {
      return { valid: false, error: `Término no permitido en la fórmula: "${kw}"` };
    }
  }

  if (!/^[a-z_\d\s+\-*/().]+$/i.test(clean)) {
    return { valid: false, error: 'Caracteres no permitidos. Solo se permiten variables, números y operadores matemáticos (+−×÷) y paréntesis.' };
  }

  const tokens = clean.match(/[a-z_][a-z_\d]*/gi) ?? [];
  const usedVars = tokens.filter(t => isNaN(Number(t)));
  const invalidVars = usedVars.filter(v => !allowedVars.includes(v));
  if (invalidVars.length > 0) {
    return { valid: false, error: `Variables no autorizadas: ${invalidVars.join(', ')}` };
  }

  return { valid: true };
}

function evaluateFormula(formula: string, values: Record<string, number>): number {
  let expr = formula.trim();
  const sortedEntries = Object.entries(values).sort(([a], [b]) => b.length - a.length);
  for (const [varName, val] of sortedEntries) {
    expr = expr.replace(new RegExp(`\\b${varName}\\b`, 'g'), String(val));
  }
  if (!/^[\d\s+\-*/().]+$/.test(expr)) {
    throw new AppError('Fórmula inválida: contiene referencias no resueltas', 422);
  }
  try {
    // eslint-disable-next-line no-new-func
    const result = (new Function('"use strict"; return (' + expr + ')'))() as unknown;
    if (typeof result !== 'number' || !isFinite(result)) throw new Error('non-numeric');
    return result;
  } catch {
    throw new AppError('Error al evaluar la expresión matemática', 422);
  }
}

function applyRedondeo(value: number, regla: ReglaRedondeo): number {
  switch (regla) {
    case 'floor':   return Math.floor(value);
    case 'ceil':    return Math.ceil(value);
    case 'nearest': return Math.round(value);
    case 'none':    return value;
    default:        return Math.round(value);
  }
}

function validateRangos(rangos: RangoInput[]): ValidacionFormula {
  if (!rangos.length) return { valid: false, error: 'Debe definir al menos un rango' };
  for (const r of rangos) {
    if (r.desde < 0) return { valid: false, error: 'Los valores "desde" no pueden ser negativos' };
    if (r.hasta != null && r.hasta < r.desde) {
      return { valid: false, error: `Rango inválido: desde ${r.desde} hasta ${r.hasta}` };
    }
    if (r.personal_requerido < 0) {
      return { valid: false, error: 'El personal requerido no puede ser negativo' };
    }
  }
  const sorted = [...rangos].sort((a, b) => a.desde - b.desde);
  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = sorted[i];
    const next = sorted[i + 1];
    if (curr.hasta != null && next.desde <= curr.hasta) {
      return {
        valid: false,
        error: `Los rangos se cruzan: [${curr.desde}–${curr.hasta}] y [${next.desde}–${next.hasta ?? '∞'}]`,
      };
    }
  }
  return { valid: true };
}

async function logAuditEvent(params: {
  usuarioId: number;
  entidad: string;
  entidadId: string;
  accion: string;
  descripcion: string;
  datosAnteriores?: unknown;
  datosNuevos?: unknown;
}) {
  try {
    await dbQuery(
      `INSERT INTO auditoria_eventos
         (usuario_id, modulo, entidad, entidad_id, accion, descripcion, datos_anteriores, datos_nuevos)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        params.usuarioId,
        'administracion.configuracion_calculadoras',
        params.entidad,
        params.entidadId,
        params.accion,
        params.descripcion,
        params.datosAnteriores ? JSON.stringify(params.datosAnteriores) : null,
        params.datosNuevos ? JSON.stringify(params.datosNuevos) : null,
      ],
    );
  } catch {
    // Audit errors should not block the main operation
  }
}

// ─── Salary Config ────────────────────────────────────────────────────────────

export async function getSalarioConfigs(): Promise<SalarioConfig[]> {
  const result = await dbQuery<SalarioConfig & { nombre_usuario_creacion: string }>(
    `SELECT c.*,
            u.nombre || ' ' || u.apellido AS nombre_usuario_creacion
     FROM calculadora_salario_config c
     LEFT JOIN usuarios u ON u.id = c.usuario_creacion
     ORDER BY c.creado_en DESC`,
  );
  return result.rows;
}

export async function getSalarioConfigActiva(): Promise<SalarioConfig | null> {
  const result = await dbQuery<SalarioConfig>(
    `SELECT c.*,
            u.nombre || ' ' || u.apellido AS nombre_usuario_creacion
     FROM calculadora_salario_config c
     LEFT JOIN usuarios u ON u.id = c.usuario_creacion
     WHERE c.estado = 'activo'
     LIMIT 1`,
  );
  return result.rows[0] ?? null;
}

export async function createSalarioConfig(
  input: CreateSalarioConfigInput,
  usuarioId: number,
): Promise<SalarioConfig> {
  const allowedVars = input.variables_permitidas ?? [
    'salario_base', 'auxilio_transporte', 'adiciones', 'recargos',
    'salud', 'pension', 'deducciones', 'devengado',
  ];
  const formulaValidation = validateFormula(input.formula_neto, allowedVars);
  if (!formulaValidation.valid) {
    throw new AppError(formulaValidation.error!, 422);
  }

  // Find the current active config for versioning
  const currentActive = await getSalarioConfigActiva();
  const nextVersion = currentActive ? currentActive.version + 1 : 1;

  // Deactivate current active config
  if (currentActive) {
    await dbQuery(
      `UPDATE calculadora_salario_config
         SET estado = 'inactivo', modificado_en = NOW(), usuario_modificacion = $1
       WHERE estado = 'activo'`,
      [usuarioId],
    );
  }

  const result = await dbQuery<SalarioConfig>(
    `INSERT INTO calculadora_salario_config
       (version, nombre, descripcion,
        salario_base_tc, salario_base_mt, salario_base_ops, auxilio_transporte,
        porcentaje_salud, porcentaje_pension, recargo_horas_extra, dias_mes,
        formula_neto, variables_permitidas, regla_redondeo,
        config_padre_id, vigencia_desde, vigencia_hasta,
        estado, observacion_cambio, usuario_creacion)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     RETURNING *`,
    [
      nextVersion,
      input.nombre,
      input.descripcion ?? null,
      input.salario_base_tc,
      input.salario_base_mt,
      input.salario_base_ops,
      input.auxilio_transporte,
      input.porcentaje_salud,
      input.porcentaje_pension,
      input.recargo_horas_extra,
      input.dias_mes ?? 30,
      input.formula_neto,
      allowedVars,
      input.regla_redondeo ?? 'nearest',
      currentActive?.id ?? null,
      input.vigencia_desde,
      input.vigencia_hasta ?? null,
      'activo',
      input.observacion_cambio ?? null,
      usuarioId,
    ],
  );

  const created = result.rows[0];
  await logAuditEvent({
    usuarioId,
    entidad: 'calculadora_salario_config',
    entidadId: String(created.id),
    accion: 'creacion',
    descripcion: `Nueva configuración de calculadora de salario v${nextVersion}: ${created.nombre}`,
    datosAnteriores: currentActive,
    datosNuevos: created,
  });

  return created;
}

export async function toggleSalarioConfigEstado(
  id: number,
  nuevoEstado: 'activo' | 'inactivo',
  usuarioId: number,
  observacion?: string,
): Promise<SalarioConfig> {
  const current = await dbQuery<SalarioConfig>(
    'SELECT * FROM calculadora_salario_config WHERE id = $1',
    [id],
  );
  if (!current.rows[0]) throw new AppError('Configuración no encontrada', 404);

  if (nuevoEstado === 'activo') {
    // Deactivate any currently active config
    await dbQuery(
      `UPDATE calculadora_salario_config
         SET estado = 'inactivo', modificado_en = NOW(), usuario_modificacion = $1
       WHERE estado = 'activo' AND id != $2`,
      [usuarioId, id],
    );
  }

  const result = await dbQuery<SalarioConfig>(
    `UPDATE calculadora_salario_config
       SET estado = $1, modificado_en = NOW(), usuario_modificacion = $2,
           observacion_cambio = COALESCE($3, observacion_cambio)
     WHERE id = $4
     RETURNING *`,
    [nuevoEstado, usuarioId, observacion ?? null, id],
  );

  const updated = result.rows[0];
  await logAuditEvent({
    usuarioId,
    entidad: 'calculadora_salario_config',
    entidadId: String(id),
    accion: nuevoEstado === 'activo' ? 'activacion' : 'inactivacion',
    descripcion: `Configuración de salario ID ${id} → ${nuevoEstado}`,
    datosAnteriores: current.rows[0],
    datosNuevos: updated,
  });

  return updated;
}

export async function probarSalarioCalculo(input: ProbarSalarioInput): Promise<ProbarSalarioResult> {
  const validation = validateFormula(input.formula, input.variables_permitidas);
  if (!validation.valid) throw new AppError(validation.error!, 422);

  const variables: Record<string, number> = {
    salario_base: input.salario_base,
    auxilio_transporte: input.auxilio_transporte,
    adiciones: input.adiciones,
    recargos: input.recargos,
    salud: input.salud,
    pension: input.pension,
    deducciones: input.deducciones,
    devengado: input.salario_base + input.auxilio_transporte + input.adiciones + input.recargos,
  };

  const resultado = evaluateFormula(input.formula, variables);
  const advertencias: string[] = [];
  if (resultado < 0) advertencias.push('El resultado es negativo, verifique los valores ingresados');

  return { formula_aplicada: input.formula, variables, resultado, advertencias };
}

// ─── Personnel Config ─────────────────────────────────────────────────────────

export async function getPersonalConfigs(): Promise<PersonalConfig[]> {
  const configsResult = await dbQuery<PersonalConfig>(
    `SELECT c.*,
            u.nombre || ' ' || u.apellido AS nombre_usuario_creacion
     FROM calculadora_personal_config c
     LEFT JOIN usuarios u ON u.id = c.usuario_creacion
     ORDER BY c.modalidad NULLS LAST, c.creado_en DESC`,
  );

  const configs = configsResult.rows;
  if (!configs.length) return [];

  // Attach ranges
  const ids = configs.map(c => c.id);
  const rangosResult = await dbQuery<PersonalRango>(
    `SELECT * FROM calculadora_personal_rangos
     WHERE config_id = ANY($1::bigint[])
     ORDER BY config_id, orden, desde`,
    [ids],
  );

  const rangosByConfig: Record<number, PersonalRango[]> = {};
  for (const r of rangosResult.rows) {
    if (!rangosByConfig[r.config_id]) rangosByConfig[r.config_id] = [];
    rangosByConfig[r.config_id].push(r);
  }

  return configs.map(c => ({ ...c, rangos: rangosByConfig[c.id] ?? [] }));
}

export async function getPersonalConfigActiva(modalidad?: string): Promise<PersonalConfig | null> {
  const result = await dbQuery<PersonalConfig>(
    `SELECT c.*,
            u.nombre || ' ' || u.apellido AS nombre_usuario_creacion
     FROM calculadora_personal_config c
     LEFT JOIN usuarios u ON u.id = c.usuario_creacion
     WHERE c.estado = 'activo'
       AND (c.modalidad = $1 OR ($1::text IS NULL AND c.modalidad IS NULL))
     LIMIT 1`,
    [modalidad ?? null],
  );
  const config = result.rows[0];
  if (!config) return null;

  const rangosResult = await dbQuery<PersonalRango>(
    `SELECT * FROM calculadora_personal_rangos
     WHERE config_id = $1 AND estado = 'activo'
     ORDER BY orden, desde`,
    [config.id],
  );
  return { ...config, rangos: rangosResult.rows };
}

export async function createPersonalConfig(
  input: CreatePersonalConfigInput,
  usuarioId: number,
): Promise<PersonalConfig> {
  const allowedVars = input.variables_permitidas ?? ['cupos', 'base', 'minimo', 'divisor', 'modalidad', 'contrato_id'];

  if (input.metodo === 'formula') {
    if (!input.formula?.trim()) throw new AppError('La fórmula es obligatoria para el método "formula"', 422);
    const fv = validateFormula(input.formula, allowedVars);
    if (!fv.valid) throw new AppError(fv.error!, 422);
  }

  if (input.metodo === 'rangos' && input.rangos?.length) {
    const rv = validateRangos(input.rangos);
    if (!rv.valid) throw new AppError(rv.error!, 422);
  }

  // Deactivate current active for same modalidad
  const currentActive = await getPersonalConfigActiva(input.modalidad);
  const nextVersion = currentActive ? currentActive.version + 1 : 1;

  if (currentActive) {
    await dbQuery(
      `UPDATE calculadora_personal_config
         SET estado = 'inactivo', modificado_en = NOW(), usuario_modificacion = $1
       WHERE id = $2`,
      [usuarioId, currentActive.id],
    );
  }

  const result = await dbQuery<PersonalConfig>(
    `INSERT INTO calculadora_personal_config
       (version, nombre, descripcion, metodo, modalidad,
        formula, variables_permitidas,
        personal_minimo, personal_maximo, regla_redondeo,
        config_padre_id, vigencia_desde, vigencia_hasta,
        estado, observacion_cambio, usuario_creacion)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING *`,
    [
      nextVersion,
      input.nombre,
      input.descripcion ?? null,
      input.metodo,
      input.modalidad ?? null,
      input.formula ?? null,
      allowedVars,
      input.personal_minimo ?? 0,
      input.personal_maximo ?? null,
      input.regla_redondeo ?? 'ceil',
      currentActive?.id ?? null,
      input.vigencia_desde,
      input.vigencia_hasta ?? null,
      'activo',
      input.observacion_cambio ?? null,
      usuarioId,
    ],
  );

  const created = result.rows[0];

  // Insert ranges
  const insertedRangos: PersonalRango[] = [];
  if (input.rangos?.length) {
    for (let i = 0; i < input.rangos.length; i++) {
      const r = input.rangos[i];
      const rResult = await dbQuery<PersonalRango>(
        `INSERT INTO calculadora_personal_rangos (config_id, desde, hasta, personal_requerido, orden)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [created.id, r.desde, r.hasta ?? null, r.personal_requerido, i],
      );
      insertedRangos.push(rResult.rows[0]);
    }
  }

  await logAuditEvent({
    usuarioId,
    entidad: 'calculadora_personal_config',
    entidadId: String(created.id),
    accion: 'creacion',
    descripcion: `Nueva configuración de calculadora de personal v${nextVersion}: ${created.nombre} (${created.metodo})`,
    datosAnteriores: currentActive,
    datosNuevos: { ...created, rangos: insertedRangos },
  });

  return { ...created, rangos: insertedRangos };
}

export async function togglePersonalConfigEstado(
  id: number,
  nuevoEstado: 'activo' | 'inactivo',
  usuarioId: number,
  observacion?: string,
): Promise<PersonalConfig> {
  const current = await dbQuery<PersonalConfig>(
    'SELECT * FROM calculadora_personal_config WHERE id = $1',
    [id],
  );
  if (!current.rows[0]) throw new AppError('Configuración no encontrada', 404);

  if (nuevoEstado === 'activo') {
    await dbQuery(
      `UPDATE calculadora_personal_config
         SET estado = 'inactivo', modificado_en = NOW(), usuario_modificacion = $1
       WHERE estado = 'activo' AND modalidad IS NOT DISTINCT FROM $2 AND id != $3`,
      [usuarioId, current.rows[0].modalidad ?? null, id],
    );
  }

  const result = await dbQuery<PersonalConfig>(
    `UPDATE calculadora_personal_config
       SET estado = $1, modificado_en = NOW(), usuario_modificacion = $2,
           observacion_cambio = COALESCE($3, observacion_cambio)
     WHERE id = $4 RETURNING *`,
    [nuevoEstado, usuarioId, observacion ?? null, id],
  );

  const updated = result.rows[0];
  await logAuditEvent({
    usuarioId,
    entidad: 'calculadora_personal_config',
    entidadId: String(id),
    accion: nuevoEstado === 'activo' ? 'activacion' : 'inactivacion',
    descripcion: `Configuración personal ID ${id} → ${nuevoEstado}`,
    datosAnteriores: current.rows[0],
    datosNuevos: updated,
  });

  return updated;
}

export async function updatePersonalRangos(
  configId: number,
  rangos: RangoInput[],
  usuarioId: number,
): Promise<PersonalRango[]> {
  const rv = validateRangos(rangos);
  if (!rv.valid) throw new AppError(rv.error!, 422);

  // Delete existing and recreate (immutable range rows per config version)
  await dbQuery('DELETE FROM calculadora_personal_rangos WHERE config_id = $1', [configId]);

  const inserted: PersonalRango[] = [];
  for (let i = 0; i < rangos.length; i++) {
    const r = rangos[i];
    const rResult = await dbQuery<PersonalRango>(
      `INSERT INTO calculadora_personal_rangos (config_id, desde, hasta, personal_requerido, orden)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [configId, r.desde, r.hasta ?? null, r.personal_requerido, i],
    );
    inserted.push(rResult.rows[0]);
  }

  await logAuditEvent({
    usuarioId,
    entidad: 'calculadora_personal_rangos',
    entidadId: String(configId),
    accion: 'cambio_rangos',
    descripcion: `Actualización de rangos para configuración personal ID ${configId}`,
    datosNuevos: inserted,
  });

  return inserted;
}

export async function probarPersonalCalculo(input: ProbarPersonalInput): Promise<ProbarPersonalResult> {
  const advertencias: string[] = [];
  const regla = input.regla_redondeo ?? 'ceil';

  if (input.metodo === 'formula') {
    if (!input.formula) throw new AppError('Fórmula requerida para el método "formula"', 422);
    const allowedVars = input.variables_permitidas ?? ['cupos', 'base', 'minimo', 'divisor'];
    const fv = validateFormula(input.formula, allowedVars);
    if (!fv.valid) throw new AppError(fv.error!, 422);

    const values: Record<string, number> = {
      cupos: input.cupos,
      base: input.base ?? 0,
      minimo: input.minimo ?? 0,
      divisor: input.divisor ?? 1,
    };
    const raw = evaluateFormula(input.formula, values);
    const redondeado = applyRedondeo(raw, regla);
    if (redondeado < 0) advertencias.push('El resultado es negativo');

    return {
      metodo_aplicado: 'formula',
      resultado: raw,
      resultado_redondeado: redondeado,
      detalle: `Fórmula: ${input.formula}`,
      advertencias,
    };
  }

  // Rangos method
  if (!input.rangos?.length) throw new AppError('Se requieren rangos para el método "rangos"', 422);
  const rv = validateRangos(input.rangos);
  if (!rv.valid) throw new AppError(rv.error!, 422);

  const cupos = input.cupos;
  const sorted = [...input.rangos].sort((a, b) => a.desde - b.desde);
  const match = sorted.find(r => cupos >= r.desde && (r.hasta == null || cupos <= r.hasta));

  if (!match) {
    advertencias.push(`No se encontró un rango para ${cupos} cupos`);
    return {
      metodo_aplicado: 'rangos',
      resultado: 0,
      resultado_redondeado: 0,
      detalle: `Sin rango aplicable para ${cupos} cupos`,
      advertencias,
    };
  }

  const detalle = `Rango [${match.desde}–${match.hasta ?? '∞'}] → ${match.personal_requerido} persona(s)`;
  return {
    metodo_aplicado: 'rangos',
    resultado: match.personal_requerido,
    resultado_redondeado: match.personal_requerido,
    detalle,
    advertencias,
  };
}
