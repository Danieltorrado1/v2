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

const PERSONA_IDENTITY_FIELDS = new Set([
  'tipo_documento_id',
  'numero_documento',
  'fecha_expedicion_documento',
  'municipio_expedicion_id'
]);

const PERSONA_CONTACT_FIELDS = new Set([
  'telefono',
  'correo',
  'direccion',
  'barrio',
  'municipio_residencia_id',
  'contacto_emergencia'
]);

const PERSONA_SST_FIELDS = new Set(['perfil_demografico']);

const PERSONA_SENSITIVE_FIELDS = new Set([
  ...PERSONA_IDENTITY_FIELDS,
  ...PERSONA_CONTACT_FIELDS,
  'primer_nombre',
  'segundo_nombre',
  'primer_apellido',
  'segundo_apellido',
  'fecha_nacimiento',
  'municipio_nacimiento_id',
  'sexo_id',
  'estado_civil_id',
  'tipo_sangre_id',
  'estatura',
  'pais_nacimiento',
  'nacimiento_extranjero',
  'ciudad_nacimiento_extranjero',
  'perfil_demografico'
]);

const hasAnyPermission = (currentPermissions: string[], expected: string[]): boolean =>
  expected.some((permission) => currentPermissions.includes(permission));

const ensurePersonaUpdatePermissions = (req: Request, input: Record<string, unknown>): void => {
  const roles = req.user?.roles ?? [];
  if (roles.includes('ADMINISTRADOR')) {
    return;
  }

  const permissions = req.user?.permissions ?? [];
  const touchedFields = Object.keys(input);
  const touchesIdentity = touchedFields.some((field) => PERSONA_IDENTITY_FIELDS.has(field));
  const touchesContact = touchedFields.some((field) => PERSONA_CONTACT_FIELDS.has(field));
  const touchesSst = touchedFields.some((field) => PERSONA_SST_FIELDS.has(field));
  const touchesGeneral = touchedFields.some(
    (field) =>
      field !== 'motivo_cambio' &&
      field !== 'motivo_cambio_identificacion' &&
      !PERSONA_SST_FIELDS.has(field) &&
      !PERSONA_IDENTITY_FIELDS.has(field) &&
      !PERSONA_CONTACT_FIELDS.has(field)
  );

  if (
    touchesIdentity &&
    !hasAnyPermission(permissions, ['personas.update', 'persona.editar', 'persona.editar_identidad'])
  ) {
    throw new AppError('Insufficient permissions for identity updates', 403, 'FORBIDDEN');
  }

  if (
    touchesContact &&
    !hasAnyPermission(permissions, ['personas.update', 'persona.editar', 'persona.editar_contacto'])
  ) {
    throw new AppError('Insufficient permissions for contact updates', 403, 'FORBIDDEN');
  }

  if (touchesSst && !hasAnyPermission(permissions, ['sst.perfil.editar', 'sst.perfil.crear'])) {
    throw new AppError('Insufficient permissions for SST profile updates', 403, 'FORBIDDEN');
  }

  if (touchesGeneral && !hasAnyPermission(permissions, ['personas.update', 'persona.editar'])) {
    throw new AppError('Insufficient permissions for persona updates', 403, 'FORBIDDEN');
  }
};

const ensurePersonaSensitiveReason = (input: Record<string, unknown>): void => {
  const touchedSensitive = Object.keys(input).some((field) => PERSONA_SENSITIVE_FIELDS.has(field));
  if (!touchedSensitive) {
    return;
  }

  const reason = typeof input.motivo_cambio === 'string' ? input.motivo_cambio.trim() : '';
  const identificationReason =
    typeof input.motivo_cambio_identificacion === 'string'
      ? input.motivo_cambio_identificacion.trim()
      : '';

  if (!reason && !identificationReason) {
    throw new AppError(
      'El motivo es obligatorio para modificar campos sensibles de la persona',
      400,
      'PERSONA_REASON_REQUIRED'
    );
  }
};

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
  const personas = await listPersonas(filters, req.tenant);

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
  const persona = await getPersonaById(id, req.tenant);

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
  const persona = await getPersonaByNumeroDocumento(numero_documento, req.tenant);

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
  const identificaciones = await listPersonaIdentificaciones(id, req.tenant);

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
  ensurePersonaUpdatePermissions(req, input);
  ensurePersonaSensitiveReason(input);
  const persona = await updatePersona(id, input, {
    actorUserId: getRequiredActorUserId(req),
    auditMeta: getAuditRequestMeta(req),
    reason:
      (typeof input.motivo_cambio === 'string' && input.motivo_cambio.trim().length > 0
        ? input.motivo_cambio
        : input.motivo_cambio_identificacion) ?? null
  }, req.tenant);

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
  }, req.tenant);

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
