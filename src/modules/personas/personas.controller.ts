import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { getAuditRequestMeta, registerAuditEntry } from '../auditoria/auditoria.helper';
import {
  createPersonaIdentificacionSchema,
  createPersonaSchema,
  listPersonasQuerySchema,
  personaDocumentoParamSchema,
  personaIdParamSchema,
  updatePersonaSchema
} from './personas.schemas';
import {
  createPersona,
  createPersonaIdentificacion,
  getPersonaById,
  getPersonaByNumeroDocumento,
  listPersonaIdentificaciones,
  listPersonas,
  updatePersona
} from './personas.service';

const getRequiredActorUserId = (req: Request): string => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  return userId;
};

const getOptionalActorUserId = (req: Request): string | null => {
  return req.user?.userId ?? null;
};

export const getPersonas = asyncHandler(async (req: Request, res: Response) => {
  const filters = listPersonasQuerySchema.parse(req.query);
  const personas = await listPersonas(filters);

  await registerAuditEntry({
    accion: 'CONSULTAR_LISTADO_PERSONAS',
    after: {
      filtros: filters,
      total: personas.pagination.total
    },
    descripcion: 'Consulta de listado de personas',
    registro_id: 'LISTA',
    tabla: 'personas',
    usuario_id: getOptionalActorUserId(req),
    ...getAuditRequestMeta(req)
  });

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

  await registerAuditEntry({
    accion: 'CONSULTAR_PERSONA',
    after: {
      persona_id: persona.id
    },
    descripcion: 'Consulta de persona por identificador interno',
    registro_id: String(persona.id),
    tabla: 'personas',
    usuario_id: getOptionalActorUserId(req),
    ...getAuditRequestMeta(req)
  });

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

  await registerAuditEntry({
    accion: 'CONSULTAR_PERSONA_POR_DOCUMENTO',
    after: {
      persona_id: persona.id,
      numero_documento: persona.numero_documento
    },
    descripcion: 'Consulta de persona por documento vigente',
    registro_id: String(persona.id),
    tabla: 'personas',
    usuario_id: getOptionalActorUserId(req),
    ...getAuditRequestMeta(req)
  });

  return successResponse(res, {
    message: 'Persona retrieved successfully',
    data: persona
  });
});

export const getPersonaIdentificacionesHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = personaIdParamSchema.parse(req.params);
  const identificaciones = await listPersonaIdentificaciones(id);

  await registerAuditEntry({
    accion: 'CONSULTAR_HISTORIAL_IDENTIFICACIONES_PERSONA',
    after: {
      persona_id: id,
      total: identificaciones.length
    },
    descripcion: 'Consulta del historial de identificaciones de persona',
    registro_id: id,
    tabla: 'persona_identificaciones',
    usuario_id: getOptionalActorUserId(req),
    ...getAuditRequestMeta(req)
  });

  return successResponse(res, {
    message: 'Persona identifications retrieved successfully',
    data: identificaciones
  });
});

export const createPersonaHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createPersonaSchema.parse(req.body);
  const persona = await createPersona(input, {
    actorUserId: getRequiredActorUserId(req),
    auditMeta: getAuditRequestMeta(req)
  });

  return successResponse(res, {
    message: 'Persona created successfully',
    statusCode: 201,
    data: persona
  });
});

export const updatePersonaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = personaIdParamSchema.parse(req.params);
  const input = updatePersonaSchema.parse(req.body);
  const persona = await updatePersona(id, input, {
    actorUserId: getRequiredActorUserId(req),
    auditMeta: getAuditRequestMeta(req)
  });

  return successResponse(res, {
    message: 'Persona updated successfully',
    data: persona
  });
});

export const createPersonaIdentificacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = personaIdParamSchema.parse(req.params);
  const input = createPersonaIdentificacionSchema.parse(req.body);
  const identificacion = await createPersonaIdentificacion(id, input, {
    actorUserId: getRequiredActorUserId(req),
    auditMeta: getAuditRequestMeta(req)
  });

  return successResponse(res, {
    message: 'Persona identification created successfully',
    statusCode: 201,
    data: identificacion
  });
});

export const deactivatePersonaHandler = asyncHandler(async (req: Request, res: Response) => {
  personaIdParamSchema.parse(req.params);
  throw new AppError(
    'La tabla personas no soporta desactivación lógica porque no existe columna activo',
    400,
    'PERSONA_LOGICAL_DEACTIVATION_UNSUPPORTED'
  );
});
