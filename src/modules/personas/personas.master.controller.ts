import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { getAuditRequestMeta } from '../auditoria/auditoria.helper';
import { listContractPersonalQuerySchema } from '../vinculaciones/vinculaciones.schemas';
import {
  createPersonaCuentaBancariaSchema,
  personalExportGenerateSchema,
  personalExportTemplatePayloadSchema,
  personaCuentaBancariaIdParamSchema,
  personaHistorialQuerySchema,
  updatePersonaCuentaBancariaSchema
} from './personas.master.schemas';
import {
  createPersonaCuentaBancaria,
  generatePersonalExport,
  getPersonalExportFieldCatalog,
  listPersonaCuentasBancarias,
  listPersonaHistorialCambios,
  listPersonalExportTemplates,
  savePersonalExportTemplate,
  updatePersonaCuentaBancaria
} from './personas.master.service';
import { personaIdParamSchema } from './personas.schemas';

const getActorUserId = (req: Request): string => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  return userId;
};

const hasAnyPermission = (currentPermissions: string[], expected: string[]): boolean =>
  expected.some((permission) => currentPermissions.includes(permission));

const isAdmin = (req: Request): boolean => (req.user?.roles ?? []).includes('ADMINISTRADOR');

const canViewFullBankAccount = (req: Request): boolean => {
  if (isAdmin(req)) {
    return true;
  }

  const permissions = req.user?.permissions ?? [];
  return hasAnyPermission(permissions, ['bancario.ver_numero_completo']);
};

const canExportSstProfiles = (req: Request): boolean => {
  if (isAdmin(req)) {
    return true;
  }

  return hasAnyPermission(req.user?.permissions ?? [], ['sst.perfil.exportar']);
};

const ensureBankReadPermission = (req: Request): void => {
  if (isAdmin(req)) {
    return;
  }

  const permissions = req.user?.permissions ?? [];
  if (!hasAnyPermission(permissions, ['bancario.ver', 'bancario.editar', 'bancario.verificar'])) {
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  }
};

const ensureBankWritePermission = (req: Request): void => {
  if (isAdmin(req)) {
    return;
  }

  const permissions = req.user?.permissions ?? [];
  if (!hasAnyPermission(permissions, ['bancario.editar', 'bancario.verificar'])) {
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  }
};

export const getPersonaHistorialCambiosHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = personaIdParamSchema.parse(req.params);
  const query = personaHistorialQuerySchema.parse(req.query);
  const data = await listPersonaHistorialCambios(Number(id), query, req.tenant);

  return successResponse(res, {
    message: 'Persona change history retrieved successfully',
    data
  });
});

export const getPersonaCuentasBancariasHandler = asyncHandler(async (req: Request, res: Response) => {
  ensureBankReadPermission(req);
  const { id } = personaIdParamSchema.parse(req.params);
  const data = await listPersonaCuentasBancarias(
    Number(id),
    {
      canViewFullNumber: canViewFullBankAccount(req),
      actorUserId: getActorUserId(req),
      auditMeta: getAuditRequestMeta(req)
    },
    req.tenant
  );

  return successResponse(res, {
    message: 'Persona bank accounts retrieved successfully',
    data
  });
});

export const createPersonaCuentaBancariaHandler = asyncHandler(async (req: Request, res: Response) => {
  ensureBankWritePermission(req);
  const { id } = personaIdParamSchema.parse(req.params);
  const input = createPersonaCuentaBancariaSchema.parse(req.body);
  const data = await createPersonaCuentaBancaria(
    Number(id),
    input,
    {
      actorUserId: getActorUserId(req),
      auditMeta: getAuditRequestMeta(req)
    },
    req.tenant
  );

  return successResponse(res, {
    statusCode: 201,
    message: 'Persona bank account created successfully',
    data
  });
});

export const updatePersonaCuentaBancariaHandler = asyncHandler(async (req: Request, res: Response) => {
  ensureBankWritePermission(req);
  const { id, cuenta_bancaria_id } = personaCuentaBancariaIdParamSchema.parse(req.params);
  const input = updatePersonaCuentaBancariaSchema.parse(req.body);
  const data = await updatePersonaCuentaBancaria(
    id,
    cuenta_bancaria_id,
    input,
    {
      actorUserId: getActorUserId(req),
      auditMeta: getAuditRequestMeta(req)
    },
    req.tenant
  );

  return successResponse(res, {
    message: 'Persona bank account updated successfully',
    data
  });
});

export const getPersonalExportFieldCatalogHandler = asyncHandler(async (req: Request, res: Response) => {
  return successResponse(res, {
    message: 'Personal export field catalog retrieved successfully',
    data: getPersonalExportFieldCatalog({
      canExportSstProfiles: canExportSstProfiles(req)
    })
  });
});

export const listPersonalExportTemplatesHandler = asyncHandler(async (_req: Request, res: Response) => {
  return successResponse(res, {
    message: 'Personal export templates retrieved successfully',
    data: await listPersonalExportTemplates()
  });
});

export const createPersonalExportTemplateHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = personalExportTemplatePayloadSchema.parse(req.body);
  const data = await savePersonalExportTemplate(input, getActorUserId(req));

  return successResponse(res, {
    statusCode: 201,
    message: 'Personal export template created successfully',
    data
  });
});

export const exportPersonalMasterHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = personalExportGenerateSchema.parse(req.body);

  // Reuse the same structural filter contract as /personal.
  listContractPersonalQuerySchema.parse({
    contrato_id: input.contrato_id,
    contrato_cargo_id: input.contrato_cargo_id ?? undefined,
    municipio_id: input.municipio_id ?? undefined,
    institucion_id: input.institucion_id ?? undefined,
    sede_id: input.sede_id ?? undefined,
    modalidad_id: input.modalidad_id ?? undefined,
    ubicacion_laboral_id: input.ubicacion_laboral_id ?? undefined,
    cobertura: input.cobertura,
    licitacion: input.licitacion,
    estado_vinculacion: input.estado_vinculacion,
    search: input.search ?? undefined,
    fecha: input.fecha,
    page: 1,
    limit: 25
  });

  const report = await generatePersonalExport(
    input,
    {
      actorUserId: getActorUserId(req),
      canViewFullAccountNumber: canViewFullBankAccount(req),
      canExportSstProfiles: canExportSstProfiles(req),
      auditMeta: getAuditRequestMeta(req)
    },
    req.tenant
  );

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${report.fileName}"`);
  res.status(200).send(report.content);
});
