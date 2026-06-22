import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  createPersonaSchema,
  listPersonasQuerySchema,
  personaDocumentoParamSchema,
  personaIdParamSchema,
  updatePersonaSchema
} from './personas.schemas';
import {
  createPersona,
  getPersonaById,
  getPersonaByNumeroDocumento,
  listPersonas,
  updatePersona
} from './personas.service';

export const getPersonas = asyncHandler(async (req: Request, res: Response) => {
  const filters = listPersonasQuerySchema.parse(req.query);
  const personas = await listPersonas(filters);

  return successResponse(res, {
    message: 'Personas retrieved successfully',
    data: personas
  });
});

export const getPersona = asyncHandler(async (req: Request, res: Response) => {
  const { id } = personaIdParamSchema.parse(req.params);
  const persona = await getPersonaById(id);

  if (!persona) {
    throw new AppError('Persona not found', 404, 'PERSONA_NOT_FOUND');
  }

  return successResponse(res, {
    message: 'Persona retrieved successfully',
    data: persona
  });
});

export const getPersonaByDocumento = asyncHandler(async (req: Request, res: Response) => {
  const { numero_documento } = personaDocumentoParamSchema.parse(req.params);
  const persona = await getPersonaByNumeroDocumento(numero_documento);

  if (!persona) {
    throw new AppError('Persona not found', 404, 'PERSONA_NOT_FOUND');
  }

  return successResponse(res, {
    message: 'Persona retrieved successfully',
    data: persona
  });
});

export const createPersonaHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createPersonaSchema.parse(req.body);
  const persona = await createPersona(input);

  return successResponse(res, {
    message: 'Persona created successfully',
    statusCode: 201,
    data: persona
  });
});

export const updatePersonaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = personaIdParamSchema.parse(req.params);
  const input = updatePersonaSchema.parse(req.body);
  const persona = await updatePersona(id, input);

  return successResponse(res, {
    message: 'Persona updated successfully',
    data: persona
  });
});

export const deactivatePersonaHandler = asyncHandler(async (req: Request, res: Response) => {
  personaIdParamSchema.parse(req.params);
  throw new AppError(
    'La tabla personas no soporta desactivaci\u00f3n l\u00f3gica porque no existe columna activo',
    400,
    'PERSONA_LOGICAL_DEACTIVATION_UNSUPPORTED'
  );
});
