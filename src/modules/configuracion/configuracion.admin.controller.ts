import type { Request, Response } from 'express';
import { z } from 'zod';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { getAuditRequestMeta } from '../auditoria/auditoria.helper';
import {
  configuracionCargosListQuerySchema,
  configuracionCatalogListQuerySchema,
  configuracionContratosListQuerySchema,
  configuracionEmpresasListQuerySchema,
  configuracionEntityIdParamSchema,
  configuracionMunicipiosListQuerySchema,
  configuracionTiposDocumentoListQuerySchema,
  configuracionToggleEstadoSchema,
  createContratoCargoSchema,
  createContratoSchema,
  createEmpresaSchema,
  updateContratoCargoSchema,
  updateContratoSchema,
  updateEmpresaSchema
} from './configuracion.admin.schemas';
import {
  createContrato,
  createContratoCargo,
  createEmpresa,
  getContratoById,
  getContratoCargoById,
  getEmpresaById,
  listArl,
  listCajasCompensacion,
  listContratos,
  listContratoCargos,
  listDepartamentos,
  listEmpresas,
  listEps,
  listEstadosCiviles,
  listFondosPension,
  listMetodosPago,
  listMunicipios,
  listNivelesEstudio,
  listPermissions,
  listRoles,
  listSexos,
  listTiposDocumento,
  listTiposJornada,
  listTiposVinculacion,
  listZonas,
  setContratoActiveState,
  setContratoCargoActiveState,
  setEmpresaActiveState,
  updateContrato,
  updateContratoCargo,
  updateEmpresa
} from './configuracion.admin.service';

const getActor = (req: Request) => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  const auditMeta = getAuditRequestMeta(req);

  return {
    userId: String(userId),
    ip: auditMeta.ip ?? null,
    userAgent: auditMeta.user_agent ?? null
  };
};

const makeCatalogHandler = <TQuery extends z.ZodTypeAny>(
  schema: TQuery,
  loader: (query: z.infer<TQuery>) => Promise<unknown>,
  message: string
) =>
  asyncHandler(async (req: Request, res: Response) => {
    const query = schema.parse(req.query);
    const data = await loader(query);

    return successResponse(res, {
      message,
      data
    });
  });

export const getEmpresasHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = configuracionEmpresasListQuerySchema.parse(req.query);
  const data = await listEmpresas(query, req.tenant);
  return successResponse(res, { message: 'Empresas retrieved successfully', data });
});

export const getEmpresaByIdHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = configuracionEntityIdParamSchema.parse(req.params);
  const data = await getEmpresaById(id, req.tenant);
  return successResponse(res, { message: 'Empresa retrieved successfully', data });
});

export const createEmpresaHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createEmpresaSchema.parse(req.body);
  const data = await createEmpresa(input, getActor(req));
  return successResponse(res, { message: 'Empresa created successfully', statusCode: 201, data });
});

export const updateEmpresaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = configuracionEntityIdParamSchema.parse(req.params);
  const input = updateEmpresaSchema.parse(req.body);
  const data = await updateEmpresa(id, input, getActor(req), req.tenant);
  return successResponse(res, { message: 'Empresa updated successfully', data });
});

export const setEmpresaEstadoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = configuracionEntityIdParamSchema.parse(req.params);
  const { activo, observacion } = configuracionToggleEstadoSchema.parse(req.body);
  const data = await setEmpresaActiveState(id, activo, getActor(req), observacion, req.tenant);
  return successResponse(res, { message: `Empresa ${activo ? 'activated' : 'deactivated'} successfully`, data });
});

export const getContratosHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = configuracionContratosListQuerySchema.parse(req.query);
  const data = await listContratos(query, req.tenant);
  return successResponse(res, { message: 'Contratos retrieved successfully', data });
});

export const getContratoByIdHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = configuracionEntityIdParamSchema.parse(req.params);
  const data = await getContratoById(id, req.tenant);
  return successResponse(res, { message: 'Contrato retrieved successfully', data });
});

export const createContratoHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createContratoSchema.parse(req.body);
  const data = await createContrato(input, getActor(req), req.tenant);
  return successResponse(res, { message: 'Contrato created successfully', statusCode: 201, data });
});

export const updateContratoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = configuracionEntityIdParamSchema.parse(req.params);
  const input = updateContratoSchema.parse(req.body);
  const data = await updateContrato(id, input, getActor(req), req.tenant);
  return successResponse(res, { message: 'Contrato updated successfully', data });
});

export const setContratoEstadoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = configuracionEntityIdParamSchema.parse(req.params);
  const { activo, observacion } = configuracionToggleEstadoSchema.parse(req.body);
  const data = await setContratoActiveState(id, activo, getActor(req), observacion, req.tenant);
  return successResponse(res, { message: `Contrato ${activo ? 'activated' : 'deactivated'} successfully`, data });
});

export const getCargosHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = configuracionCargosListQuerySchema.parse(req.query);
  const data = await listContratoCargos(query, req.tenant);
  return successResponse(res, { message: 'Cargos retrieved successfully', data });
});

export const getCargoByIdHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = configuracionEntityIdParamSchema.parse(req.params);
  const data = await getContratoCargoById(id, req.tenant);
  return successResponse(res, { message: 'Cargo retrieved successfully', data });
});

export const createCargoHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createContratoCargoSchema.parse(req.body);
  const data = await createContratoCargo(input, getActor(req), req.tenant);
  return successResponse(res, { message: 'Cargo created successfully', statusCode: 201, data });
});

export const updateCargoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = configuracionEntityIdParamSchema.parse(req.params);
  const input = updateContratoCargoSchema.parse(req.body);
  const data = await updateContratoCargo(id, input, getActor(req), req.tenant);
  return successResponse(res, { message: 'Cargo updated successfully', data });
});

export const setCargoEstadoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = configuracionEntityIdParamSchema.parse(req.params);
  const { activo, observacion } = configuracionToggleEstadoSchema.parse(req.body);
  const data = await setContratoCargoActiveState(id, activo, getActor(req), observacion, req.tenant);
  return successResponse(res, { message: `Cargo ${activo ? 'activated' : 'deactivated'} successfully`, data });
});

export const getTiposVinculacionHandler = makeCatalogHandler(
  configuracionCatalogListQuerySchema,
  listTiposVinculacion,
  'Tipos de vinculacion retrieved successfully'
);
export const getTiposJornadaHandler = makeCatalogHandler(configuracionCatalogListQuerySchema, listTiposJornada, 'Tipos de jornada retrieved successfully');
export const getDepartamentosHandler = makeCatalogHandler(configuracionCatalogListQuerySchema, listDepartamentos, 'Departamentos retrieved successfully');
export const getMunicipiosHandler = makeCatalogHandler(configuracionMunicipiosListQuerySchema, listMunicipios, 'Municipios retrieved successfully');
export const getZonasHandler = makeCatalogHandler(configuracionCatalogListQuerySchema, listZonas, 'Zonas retrieved successfully');
export const getEpsHandler = makeCatalogHandler(configuracionCatalogListQuerySchema, listEps, 'EPS retrieved successfully');
export const getArlHandler = makeCatalogHandler(configuracionCatalogListQuerySchema, listArl, 'ARL retrieved successfully');
export const getFondosPensionHandler = makeCatalogHandler(configuracionCatalogListQuerySchema, listFondosPension, 'Fondos de pension retrieved successfully');
export const getCajasCompensacionHandler = makeCatalogHandler(configuracionCatalogListQuerySchema, listCajasCompensacion, 'Cajas de compensacion retrieved successfully');
export const getNivelesEstudioHandler = makeCatalogHandler(configuracionCatalogListQuerySchema, listNivelesEstudio, 'Niveles de estudio retrieved successfully');
export const getEstadosCivilesHandler = makeCatalogHandler(configuracionCatalogListQuerySchema, listEstadosCiviles, 'Estados civiles retrieved successfully');
export const getSexosHandler = makeCatalogHandler(configuracionCatalogListQuerySchema, listSexos, 'Sexos retrieved successfully');
export const getTiposDocumentoHandler = makeCatalogHandler(configuracionTiposDocumentoListQuerySchema, listTiposDocumento, 'Tipos de documento retrieved successfully');

export const getMetodosPagoHandler = asyncHandler(async (_req: Request, res: Response) => {
  const data = await listMetodosPago();
  return successResponse(res, { message: 'Metodos de pago retrieved successfully', data });
});

export const getRolesHandler = asyncHandler(async (_req: Request, res: Response) => {
  const data = await listRoles();
  return successResponse(res, { message: 'Roles retrieved successfully', data });
});

export const getPermissionsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const data = await listPermissions();
  return successResponse(res, { message: 'Permissions retrieved successfully', data });
});
