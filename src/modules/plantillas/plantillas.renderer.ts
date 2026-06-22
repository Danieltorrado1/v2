import { AppError } from '../../utils/AppError';
import { VinculacionExpediente } from '../vinculaciones/vinculaciones.service';

export interface PlantillaRenderContext {
  cargo: VinculacionExpediente['cargo'];
  empresa: VinculacionExpediente['empresa'];
  contrato: VinculacionExpediente['contrato'];
  persona: VinculacionExpediente['persona'] & {
    nombre_completo: string;
  };
  tipo_vinculacion: VinculacionExpediente['tipo_vinculacion'];
  vinculacion: VinculacionExpediente['vinculacion'];
}

const normalizeTokenValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }

  return String(value);
};

const getValueByPath = (object: unknown, path: string): unknown => {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, object);
};

export const buildPlantillaRenderContext = (
  expediente: VinculacionExpediente
): PlantillaRenderContext => {
  const personaNombreCompleto = [
    expediente.persona.primer_nombre,
    expediente.persona.segundo_nombre,
    expediente.persona.primer_apellido,
    expediente.persona.segundo_apellido
  ]
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    persona: {
      ...expediente.persona,
      nombre_completo: personaNombreCompleto
    },
    empresa: expediente.empresa,
    contrato: expediente.contrato,
    cargo: expediente.cargo,
    tipo_vinculacion: expediente.tipo_vinculacion,
    vinculacion: expediente.vinculacion
  };
};

export const renderPlantillaTemplate = (
  template: string,
  context: PlantillaRenderContext
): { content: string; unresolvedTokens: string[] } => {
  const unresolvedTokens = new Set<string>();

  const content = template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, token: string) => {
    const value = getValueByPath(context, token);

    if (value === undefined || value === null) {
      unresolvedTokens.add(token);
      return '';
    }

    return normalizeTokenValue(value);
  });

  return {
    content,
    unresolvedTokens: Array.from(unresolvedTokens)
  };
};

export const assertTemplateIsRenderable = (template: string): void => {
  if (!template || template.trim().length === 0) {
    throw new AppError('Plantilla content cannot be empty', 400, 'PLANTILLA_CONTENT_EMPTY');
  }
};

const normalizeDuplicateCheckText = (value: string): string => {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
};

export const findRepeatedAdjacentWords = (value: string): string[] => {
  const normalized = normalizeDuplicateCheckText(value);

  if (!normalized) {
    return [];
  }

  const matches = normalized.match(/\b([A-Z0-9]+)(?:\s+\1\b)+/g) ?? [];
  return Array.from(new Set(matches));
};

export const hasDoubleSpaces = (value: string): boolean => {
  return /\s{2,}/.test(value);
};

export const hasUnresolvedTemplateTokens = (value: string): boolean => {
  return /\{\{\s*[^}]+\s*\}\}/.test(value);
};
