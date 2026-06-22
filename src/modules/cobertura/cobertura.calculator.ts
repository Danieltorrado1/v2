import { AppError } from '../../utils/AppError';
import { ModalidadBase } from './cobertura.schemas';

export interface CoberturaCalculation {
  cupos_calculo: number;
  manipuladores_requeridos: number;
}

const calculateCAARequirement = (cupos: number): number => {
  if (cupos <= 60) {
    return 1;
  }

  return 1 + Math.ceil((cupos - 60) / 120);
};

export const normalizeModalidadBase = (modalidadOriginal: string): ModalidadBase => {
  const normalized = modalidadOriginal
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');

  if (normalized.includes('CAARES')) {
    return 'CAARES';
  }

  if (normalized === 'CAA' || normalized.startsWith('CAA')) {
    return 'CAA';
  }

  if (normalized === 'RI' || normalized.includes('RESIDENCIAINFANTIL')) {
    return 'RI';
  }

  throw new AppError(
    'Unsupported modalidad for coverage calculation',
    400,
    'MODALIDAD_NO_SOPORTADA',
    { modalidadOriginal }
  );
};

export const buildClaveSedeModalidad = (
  sedeIdentifier: string,
  modalidadOriginal: string
): string => {
  const normalizedIdentifier = sedeIdentifier.trim();
  const normalizedModalidad = modalidadOriginal.trim().toUpperCase();

  return `${normalizedIdentifier}|${normalizedModalidad}`;
};

export const calculateRequiredCoverage = (
  modalidadBase: ModalidadBase,
  cupos: number
): CoberturaCalculation => {
  const positiveCupos = Math.max(0, cupos);

  if (modalidadBase === 'CAA') {
    return {
      cupos_calculo: positiveCupos,
      manipuladores_requeridos: calculateCAARequirement(positiveCupos)
    };
  }

  if (modalidadBase === 'CAARES') {
    const cuposCalculo = positiveCupos * 4;

    return {
      cupos_calculo: cuposCalculo,
      manipuladores_requeridos: calculateCAARequirement(cuposCalculo)
    };
  }

  if (positiveCupos <= 100) {
    return {
      cupos_calculo: positiveCupos,
      manipuladores_requeridos: 0
    };
  }

  if (positiveCupos <= 300) {
    return {
      cupos_calculo: positiveCupos,
      manipuladores_requeridos: 1
    };
  }

  if (positiveCupos <= 500) {
    return {
      cupos_calculo: positiveCupos,
      manipuladores_requeridos: 2
    };
  }

  if (positiveCupos <= 800) {
    return {
      cupos_calculo: positiveCupos,
      manipuladores_requeridos: 3
    };
  }

  return {
    cupos_calculo: positiveCupos,
    manipuladores_requeridos: 4
  };
};

export const getEstadoCobertura = (
  requeridos: number,
  asignados: number
): 'NO_REQUIERE' | 'FALTANTE' | 'COMPLETA' | 'SOBRECOBERTURA' => {
  const delta = Number((asignados - requeridos).toFixed(6));

  if (requeridos <= 0) {
    return asignados > 0 ? 'SOBRECOBERTURA' : 'NO_REQUIERE';
  }

  if (delta < 0) {
    return 'FALTANTE';
  }

  if (delta === 0) {
    return 'COMPLETA';
  }

  return 'SOBRECOBERTURA';
};
