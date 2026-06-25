import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import {
  createPersonalConfig,
  createSalarioConfig,
  getPersonalConfigActiva,
  getPersonalConfigs,
  getSalarioConfigActiva,
  getSalarioConfigs,
  probarPersonalCalculo,
  probarSalarioCalculo,
  togglePersonalConfigEstado,
  toggleSalarioConfigEstado,
  updatePersonalRangos,
  validateFormula,
} from './configuracion.service';

// ─── Salary ──────────────────────────────────────────────────────────────────

export async function getSalarioConfigsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const configs = await getSalarioConfigs();
    res.json({ data: configs });
  } catch (e) { next(e); }
}

export async function getSalarioConfigActivaHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const config = await getSalarioConfigActiva();
    if (!config) return res.status(404).json({ message: 'No existe una configuración activa para esta calculadora.' });
    res.json({ data: config });
  } catch (e) { next(e); }
}

export async function createSalarioConfigHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const usuarioId = req.user?.userId;
    if (!usuarioId) throw new AppError('Usuario no autenticado', 401);
    const config = await createSalarioConfig(req.body, Number(usuarioId));
    res.status(201).json({ data: config, message: 'Configuración creada exitosamente' });
  } catch (e) { next(e); }
}

export async function toggleSalarioEstadoHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const usuarioId = req.user?.userId;
    if (!usuarioId) throw new AppError('Usuario no autenticado', 401);
    const id = Number(req.params.id);
    const { estado, observacion } = req.body as { estado: 'activo' | 'inactivo'; observacion?: string };
    if (!['activo', 'inactivo'].includes(estado)) throw new AppError('Estado inválido', 422);
    const updated = await toggleSalarioConfigEstado(id, estado, Number(usuarioId), observacion);
    res.json({ data: updated, message: `Configuración ${estado}` });
  } catch (e) { next(e); }
}

export async function probarSalarioHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await probarSalarioCalculo(req.body);
    res.json({ data: result });
  } catch (e) { next(e); }
}

export async function validarFormulaHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { formula, variables_permitidas } = req.body as { formula: string; variables_permitidas?: string[] };
    const vars = variables_permitidas ?? ['salario_base','auxilio_transporte','adiciones','recargos','salud','pension','deducciones','devengado'];
    const result = validateFormula(formula, vars);
    res.json({ data: result });
  } catch (e) { next(e); }
}

// ─── Personnel ────────────────────────────────────────────────────────────────

export async function getPersonalConfigsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const configs = await getPersonalConfigs();
    res.json({ data: configs });
  } catch (e) { next(e); }
}

export async function getPersonalConfigActivaHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const modalidad = typeof req.query.modalidad === 'string' ? req.query.modalidad : undefined;
    const config = await getPersonalConfigActiva(modalidad);
    if (!config) return res.status(404).json({ message: 'No existe una configuración activa para esta calculadora.' });
    res.json({ data: config });
  } catch (e) { next(e); }
}

export async function createPersonalConfigHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const usuarioId = req.user?.userId;
    if (!usuarioId) throw new AppError('Usuario no autenticado', 401);
    const config = await createPersonalConfig(req.body, Number(usuarioId));
    res.status(201).json({ data: config, message: 'Configuración creada exitosamente' });
  } catch (e) { next(e); }
}

export async function togglePersonalEstadoHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const usuarioId = req.user?.userId;
    if (!usuarioId) throw new AppError('Usuario no autenticado', 401);
    const id = Number(req.params.id);
    const { estado, observacion } = req.body as { estado: 'activo' | 'inactivo'; observacion?: string };
    if (!['activo', 'inactivo'].includes(estado)) throw new AppError('Estado inválido', 422);
    const updated = await togglePersonalConfigEstado(id, estado, Number(usuarioId), observacion);
    res.json({ data: updated, message: `Configuración ${estado}` });
  } catch (e) { next(e); }
}

export async function updatePersonalRangosHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const usuarioId = req.user?.userId;
    if (!usuarioId) throw new AppError('Usuario no autenticado', 401);
    const configId = Number(req.params.id);
    const { rangos } = req.body;
    if (!Array.isArray(rangos)) throw new AppError('Se requiere un arreglo de rangos', 422);
    const updated = await updatePersonalRangos(configId, rangos, Number(usuarioId));
    res.json({ data: updated, message: 'Rangos actualizados' });
  } catch (e) { next(e); }
}

export async function probarPersonalHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await probarPersonalCalculo(req.body);
    res.json({ data: result });
  } catch (e) { next(e); }
}
