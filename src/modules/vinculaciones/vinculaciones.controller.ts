import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  closeGestorAssignmentSchema,
  createGestorMunicipioAssignmentSchema,
  createVinculacionSchema,
  gestorAssignmentIdParamSchema,
  gestorAssignmentWorkspaceQuerySchema,
  gestorPersonalHistoryQuerySchema,
  listGestorMunicipiosQuerySchema,
  listContractPersonalQuerySchema,
  personalResumenQuerySchema,
  listOpsVinculacionesQuerySchema,
  saveGestorAssignmentsSchema,
  listVinculacionesQuerySchema,
  reactivarVinculacionSchema,
  retirarVinculacionSchema,
  suspenderVinculacionSchema,
  updateVinculacionSchema,
  vinculacionIdParamSchema,
  vinculacionPersonaParamSchema
} from './vinculaciones.schemas';
import {
  closeGestorMunicipioAssignment,
  closeGestorPersonalAssignment,
  createGestorMunicipioAssignment,
  createVinculacion,
  getGestorAssignmentWorkspace,
  getGestorPersonalHistory,
  listGestorMunicipios,
  listGestores,
  getVinculacionExpediente,
  getVinculacionById,
  getVinculacionesByPersonaId,
  listContractPersonal,
  getPersonalResumen,
  getContractPersonalFilterOptions,
  listVinculaciones,
  reactivarVinculacion,
  retirarVinculacion,
  saveGestorAssignments,
  suspenderVinculacion,
  updateVinculacion
} from './vinculaciones.service';

const VINCULACION_CARGO_FIELDS = new Set(['contrato_cargo_id', 'tipo_vinculacion_id']);
const VINCULACION_DATE_FIELDS = new Set(['fecha_inicio', 'fecha_fin']);
const VINCULACION_STATUS_FIELDS = new Set(['estado_vinculacion']);
const VINCULACION_SENSITIVE_FIELDS = new Set([
  ...VINCULACION_CARGO_FIELDS,
  ...VINCULACION_DATE_FIELDS,
  ...VINCULACION_STATUS_FIELDS,
  'empresa_id',
  'contrato_id',
  'persona_id',
  'metodo_pago'
]);

const hasAnyPermission = (currentPermissions: string[], expected: string[]): boolean =>
  expected.some((permission) => currentPermissions.includes(permission));

const ensureVinculacionUpdatePermissions = (req: Request, input: Record<string, unknown>): void => {
  const roles = req.user?.roles ?? [];
  if (roles.includes('ADMINISTRADOR')) {
    return;
  }

  const permissions = req.user?.permissions ?? [];
  const touchedFields = Object.keys(input);
  const touchesCargo = touchedFields.some((field) => VINCULACION_CARGO_FIELDS.has(field));
  const touchesDates = touchedFields.some((field) => VINCULACION_DATE_FIELDS.has(field));
  const touchesStatus = touchedFields.some((field) => VINCULACION_STATUS_FIELDS.has(field));
  const touchesGeneral = touchedFields.some(
    (field) =>
      field !== 'motivo_cambio' &&
      !VINCULACION_CARGO_FIELDS.has(field) &&
      !VINCULACION_DATE_FIELDS.has(field) &&
      !VINCULACION_STATUS_FIELDS.has(field)
  );

  if (
    touchesCargo &&
    !hasAnyPermission(permissions, ['vinculaciones.update', 'vinculacion.editar', 'vinculacion.editar_cargo'])
  ) {
    throw new AppError('Insufficient permissions for vinculation role updates', 403, 'FORBIDDEN');
  }

  if (
    touchesDates &&
    !hasAnyPermission(permissions, ['vinculaciones.update', 'vinculacion.editar', 'vinculacion.editar_fechas'])
  ) {
    throw new AppError('Insufficient permissions for vinculation date updates', 403, 'FORBIDDEN');
  }

  if (
    touchesStatus &&
    !hasAnyPermission(permissions, ['vinculaciones.update', 'vinculacion.editar', 'vinculacion.editar_estado'])
  ) {
    throw new AppError('Insufficient permissions for vinculation status updates', 403, 'FORBIDDEN');
  }

  if (touchesGeneral && !hasAnyPermission(permissions, ['vinculaciones.update', 'vinculacion.editar'])) {
    throw new AppError('Insufficient permissions for vinculation updates', 403, 'FORBIDDEN');
  }
};

const ensureVinculacionSensitiveReason = (input: Record<string, unknown>): void => {
  const touchedSensitive = Object.keys(input).some((field) => VINCULACION_SENSITIVE_FIELDS.has(field));
  if (!touchedSensitive) {
    return;
  }

  const reason = typeof input.motivo_cambio === 'string' ? input.motivo_cambio.trim() : '';
  if (!reason) {
    throw new AppError(
      'El motivo es obligatorio para modificar campos sensibles de la vinculacion',
      400,
      'VINCULACION_REASON_REQUIRED'
    );
  }
};
import {
  getVinculacionesOpsCatalogos,
  listOpsVinculacionesEnriched
} from './vinculaciones.ops.service';

const getActorUserId = (req: Request): number => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  const numericUserId = Number(userId);

  if (!Number.isFinite(numericUserId)) {
    throw new AppError('Authenticated user id is invalid', 400, 'INVALID_USER_ID');
  }

  return numericUserId;
};

export const getVinculaciones = asyncHandler(async (req: Request, res: Response) => {
  const filters = listVinculacionesQuerySchema.parse(req.query);
  const result = await listVinculaciones(filters, req.tenant);

  return successResponse(res, {
    message: 'Vinculaciones retrieved successfully',
    data: result
  });
});

export const getContractPersonalFilterOptionsHandler = asyncHandler(async (req: Request, res: Response) => {
  const contratoId = Number(req.query.contrato_id);
  if (!Number.isInteger(contratoId) || contratoId <= 0) throw new AppError('contrato_id inválido', 400, 'INVALID_CONTRACT_ID');
  const result = await getContractPersonalFilterOptions(contratoId, {
    municipio_id: req.query.municipio_id ? Number(req.query.municipio_id) : null,
    institucion_id: req.query.institucion_id ? Number(req.query.institucion_id) : null,
    sede_id: req.query.sede_id ? Number(req.query.sede_id) : null,
    fecha: typeof req.query.fecha === 'string' ? req.query.fecha : undefined
  }, req.tenant);
  return successResponse(res, { message: 'Contract personal filter options retrieved successfully', data: result });
});
export const getPersonalResumenHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = personalResumenQuerySchema.parse(req.query);
  const result = await getPersonalResumen(filters, req.tenant);
  return successResponse(res, {
    message: 'Contract personal summary retrieved successfully',
    data: result
  });
});
export const getContractPersonalHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listContractPersonalQuerySchema.parse(req.query);
  const result = await listContractPersonal(filters, req.tenant);

  return successResponse(res, {
    message: 'Contract personal retrieved successfully',
    data: result
  });
});

export const listGestoresHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listGestorMunicipiosQuerySchema.parse(req.query);
  const result = await listGestores(query, req.tenant);

  return successResponse(res, {
    message: 'Gestores retrieved successfully',
    data: result
  });
});

export const listGestorMunicipiosHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listGestorMunicipiosQuerySchema.parse(req.query);
  const result = await listGestorMunicipios(query, req.tenant);

  return successResponse(res, {
    message: 'Gestor municipios retrieved successfully',
    data: result
  });
});

export const getGestorAssignmentWorkspaceHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = gestorAssignmentWorkspaceQuerySchema.parse(req.query);
  const result = await getGestorAssignmentWorkspace(query, req.tenant);

  return successResponse(res, {
    message: 'Gestor assignment workspace retrieved successfully',
    data: result
  });
});

export const createGestorMunicipioAssignmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createGestorMunicipioAssignmentSchema.parse(req.body);
  const result = await createGestorMunicipioAssignment(input, getActorUserId(req), req.tenant);

  return successResponse(res, {
    message: 'Gestor municipio assignment created successfully',
    statusCode: 201,
    data: result
  });
});

export const closeGestorMunicipioAssignmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = gestorAssignmentIdParamSchema.parse(req.params);
  const input = closeGestorAssignmentSchema.parse(req.body);
  const result = await closeGestorMunicipioAssignment(id, input, getActorUserId(req), req.tenant);

  return successResponse(res, {
    message: 'Gestor municipio assignment closed successfully',
    data: result
  });
});

export const saveGestorAssignmentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = saveGestorAssignmentsSchema.parse(req.body);
  const result = await saveGestorAssignments(input, getActorUserId(req), req.tenant);

  return successResponse(res, {
    message: 'Gestor personal assignments saved successfully',
    data: result
  });
});

export const closeGestorPersonalAssignmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = gestorAssignmentIdParamSchema.parse(req.params);
  const input = closeGestorAssignmentSchema.parse(req.body);
  const result = await closeGestorPersonalAssignment(id, input, getActorUserId(req), req.tenant);

  return successResponse(res, {
    message: 'Gestor personal assignment closed successfully',
    data: result
  });
});

export const getGestorPersonalHistoryHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = gestorPersonalHistoryQuerySchema.parse(req.query);
  const result = await getGestorPersonalHistory(query, req.tenant);

  return successResponse(res, {
    message: 'Gestor personal history retrieved successfully',
    data: result
  });
});

export const getOpsVinculacionesHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listOpsVinculacionesQuerySchema.parse(req.query);
  const result = await listOpsVinculacionesEnriched(filters, req.tenant);

  return successResponse(res, {
    message: 'OPS vinculaciones retrieved successfully',
    data: result
  });
});

export const getOpsCatalogosHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await getVinculacionesOpsCatalogos(req.tenant);

  return successResponse(res, {
    message: 'OPS catalogos retrieved successfully',
    data: result
  });
});

export const getVinculacion = asyncHandler(async (req: Request, res: Response) => {
  const { id } = vinculacionIdParamSchema.parse(req.params) as { id: number };
  const vinculacion = await getVinculacionById(id, req.tenant);

  if (!vinculacion) {
    throw new AppError('Vinculacion not found', 404, 'VINCULACION_NOT_FOUND');
  }

  return successResponse(res, {
    message: 'Vinculacion retrieved successfully',
    data: vinculacion
  });
});

export const getVinculacionExpedienteHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = vinculacionIdParamSchema.parse(req.params) as { id: number };
  const expediente = await getVinculacionExpediente(id, req.tenant);

  return successResponse(res, {
    message: 'Vinculacion expediente retrieved successfully',
    data: expediente
  });
});

export const getVinculacionesByPersona = asyncHandler(async (req: Request, res: Response) => {
  const { persona_id } = vinculacionPersonaParamSchema.parse(req.params) as { persona_id: number };
  const vinculaciones = await getVinculacionesByPersonaId(persona_id, req.tenant);

  return successResponse(res, {
    message: 'Vinculaciones retrieved successfully',
    data: vinculaciones
  });
});

export const createVinculacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createVinculacionSchema.parse(req.body);
  const vinculacion = await createVinculacion(input, getActorUserId(req), req.tenant);

  return successResponse(res, {
    message: 'Vinculacion created successfully',
    statusCode: 201,
    data: vinculacion
  });
});

export const updateVinculacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = vinculacionIdParamSchema.parse(req.params) as { id: number };
  const input = updateVinculacionSchema.parse(req.body);
  ensureVinculacionUpdatePermissions(req, input);
  ensureVinculacionSensitiveReason(input);
  const vinculacion = await updateVinculacion(id, input, getActorUserId(req), req.tenant);

  return successResponse(res, {
    message: 'Vinculacion updated successfully',
    data: vinculacion
  });
});

export const retirarVinculacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = vinculacionIdParamSchema.parse(req.params) as { id: number };
  const input = retirarVinculacionSchema.parse(req.body);
  const vinculacion = await retirarVinculacion(id, input, getActorUserId(req), req.tenant);

  return successResponse(res, {
    message: 'Vinculacion retired successfully',
    data: vinculacion
  });
});

export const suspenderVinculacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = vinculacionIdParamSchema.parse(req.params) as { id: number };
  const input = suspenderVinculacionSchema.parse(req.body);
  const vinculacion = await suspenderVinculacion(id, input, getActorUserId(req), req.tenant);

  return successResponse(res, {
    message: 'Vinculacion suspended successfully',
    data: vinculacion
  });
});

export const reactivarVinculacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = vinculacionIdParamSchema.parse(req.params) as { id: number };
  const input = reactivarVinculacionSchema.parse(req.body);
  const vinculacion = await reactivarVinculacion(id, input, getActorUserId(req), req.tenant);

  return successResponse(res, {
    message: 'Vinculacion reactivated successfully',
    data: vinculacion
  });
});
