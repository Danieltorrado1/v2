import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  repositorioDocumentoParamsSchema,
  repositorioDocumentosExportQuerySchema,
  repositorioDocumentosIndicadoresQuerySchema,
  repositorioDocumentosQuerySchema
} from './repositorioDocumental.schemas';
import {
  exportRepositorioDocumentosCsv,
  generateRepositorioDocumentoDownloadUrl,
  getRepositorioDocumentoDetalle,
  getRepositorioDocumentoVersiones,
  getRepositorioDocumentosIndicadores,
  listRepositorioDocumentos
} from './repositorioDocumental.service';

const getActorUserId = (req: Request): string => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  return userId;
};

const getAuditMeta = (req: Request) => {
  return {
    ip_address: req.ip ?? null,
    user_agent: req.get('user-agent') ?? null
  };
};

export const listRepositorioDocumentosHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = repositorioDocumentosQuerySchema.parse(req.query);
  const data = await listRepositorioDocumentos(filters, req.tenant, getActorUserId(req), getAuditMeta(req));

  return successResponse(res, {
    message: 'Repositorio documental consultado correctamente',
    data
  });
});

export const getRepositorioDocumentoDetalleHandler = asyncHandler(async (req: Request, res: Response) => {
  const { origen, id } = repositorioDocumentoParamsSchema.parse(req.params);
  const data = await getRepositorioDocumentoDetalle(
    origen,
    id,
    req.tenant,
    getActorUserId(req),
    getAuditMeta(req)
  );

  return successResponse(res, {
    message: 'Detalle del documento consultado correctamente',
    data
  });
});

export const getRepositorioDocumentoVersionesHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const { origen, id } = repositorioDocumentoParamsSchema.parse(req.params);
    const data = await getRepositorioDocumentoVersiones(
      origen,
      id,
      req.tenant,
      getActorUserId(req),
      getAuditMeta(req)
    );

    return successResponse(res, {
      message: 'Historial de versiones consultado correctamente',
      data
    });
  }
);

export const generateRepositorioDocumentoDownloadUrlHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const { origen, id } = repositorioDocumentoParamsSchema.parse(req.params);
    const data = await generateRepositorioDocumentoDownloadUrl(
      origen,
      id,
      req.tenant,
      getActorUserId(req),
      getAuditMeta(req)
    );

    return successResponse(res, {
      message: 'URL de descarga generada correctamente',
      data
    });
  }
);

export const exportRepositorioDocumentosCsvHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const filters = repositorioDocumentosExportQuerySchema.parse(req.query);
    const result = await exportRepositorioDocumentosCsv(
      filters,
      req.tenant,
      getActorUserId(req),
      getAuditMeta(req)
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="repositorio-documental.csv"');
    res.status(200).send(result.csv);
  }
);

export const getRepositorioDocumentosIndicadoresHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const filters = repositorioDocumentosIndicadoresQuerySchema.parse(req.query);
    const data = await getRepositorioDocumentosIndicadores(
      filters,
      req.tenant,
      getActorUserId(req),
      getAuditMeta(req)
    );

    return successResponse(res, {
      message: 'Indicadores documentales consultados correctamente',
      data
    });
  }
);
