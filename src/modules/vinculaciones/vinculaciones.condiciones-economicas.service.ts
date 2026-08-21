import {
  assertNoEconomicOverlap,
  type CondicionEconomicaInput,
  type CondicionEconomicaVigencia,
  resolveCondicionEconomicaEnFecha,
  validateCondicionEconomica,
} from './vinculaciones.condiciones-economicas.domain';

export interface CondicionEconomicaRecord extends CondicionEconomicaInput {
  created_at: string;
  created_by: number;
  id: number;
  updated_at: string;
  updated_by: number | null;
}

export interface CondicionesEconomicasRepository {
  insert(input: CondicionEconomicaInput, userId: number): Promise<CondicionEconomicaRecord>;
  listByVinculacion(vinculacionId: number): Promise<CondicionEconomicaRecord[]>;
}

// Diseño de servicio. El repositorio PostgreSQL y sus rutas se implementarán
// únicamente cuando se autorice aplicar la migración.
export const buildCondicionesEconomicasService = (repository: CondicionesEconomicasRepository) => ({
  async create(input: CondicionEconomicaInput, userId: number): Promise<CondicionEconomicaRecord> {
    if (!Number.isInteger(userId) || userId <= 0) throw new Error('USUARIO_AUDITORIA_REQUERIDO');
    const validated = validateCondicionEconomica(input);
    const existing = await repository.listByVinculacion(validated.vinculacion_id);
    assertNoEconomicOverlap(validated, existing);
    return repository.insert(validated, userId);
  },

  async list(vinculacionId: number): Promise<CondicionEconomicaRecord[]> {
    return repository.listByVinculacion(vinculacionId);
  },

  async resolveForPayroll(vinculacionId: number, tipoCondicion: string, fecha: string): Promise<CondicionEconomicaVigencia | null> {
    const existing = await repository.listByVinculacion(vinculacionId);
    return resolveCondicionEconomicaEnFecha(existing, vinculacionId, tipoCondicion, fecha);
  },
});
