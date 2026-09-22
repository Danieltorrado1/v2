import { setManipulationMode } from './documentos.manipulacion.service';
import { documentReviewDossier, reviewDocument } from './documentos.review.service';
import multer from 'multer';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { successResponse } from '../../utils/apiResponse';
import { getRepositoryPageSummary } from './documentos.repository.service';

import { authMiddleware } from '../../middlewares/authMiddleware';
import { tenantMiddleware } from '../../middlewares/tenantMiddleware';
import { requirePermissions } from '../../middlewares/roleMiddleware';
import {
  createTestDocumentoPersonaHandler,
  deactivatePersonaDocumentoHandler,
  deactivateVinculacionDocumentoHandler,
  getDocumentoDownloadUrlHandler,
  getPersonaDocumentosHandler,
  getVinculacionChecklistHandler,
  getVinculacionDocumentosHandler,
  updatePersonaDocumentoHandler,
  updateVinculacionDocumentoHandler,
  uploadPersonaDocumentoHandler,
  uploadVinculacionDocumentoHandler
} from './documentos.controller';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024
  }
});

const documentosRoutes = Router();

documentosRoutes.use(authMiddleware);
documentosRoutes.use(tenantMiddleware);

documentosRoutes.get('/repositorio/resumen', requirePermissions('documentos.read'), asyncHandler(async (req, res) => {
  const ids = z.string().transform(value => value.split(',').map(Number))
    .pipe(z.array(z.number().int().positive()).min(1).max(25)).parse(req.query.vinculacion_ids);
  const data = await getRepositoryPageSummary([...new Set(ids)], req.tenant,
    req.user?.permissions.includes('sst.dotacion_epp.read') ?? false);
  return successResponse(res, { data, message: 'Resumen documental de la página' });
}));

const reviewParams = z.object({scope:z.enum(['persona','vinculacion']),id:z.string().regex(/^\d+$/)});
documentosRoutes.post('/manipulacion/:scope/:id/modalidad', requirePermissions('documentos.upload'), asyncHandler(async(req,res)=>{
  const {scope,id}=reviewParams.parse(req.params);
  const input=z.object({modalidad:z.enum(['COMBINADO','SEPARADO']),confirmado:z.boolean().default(false),reutilizar_documento_id:z.string().regex(/^\d+$/).nullable().optional()}).parse(req.body);
  return successResponse(res,{data:await setManipulationMode(scope,id,input.modalidad,input.confirmado,req.user!.userId,req.tenant,{reutilizarDocumentoId:input.reutilizar_documento_id}),message:'Modalidad guardada'});
}));
documentosRoutes.get('/revision/:scope/:id', requirePermissions('documentos.read'), asyncHandler(async(req,res)=>{
  const {scope,id}=reviewParams.parse(req.params);
  const ids=z.string().transform(v=>v.split(',').map(Number)).pipe(z.array(z.number().int().positive()).min(1).max(50)).parse(req.query.tipos);
  return successResponse(res,{data:await documentReviewDossier(scope,id,ids,req.tenant),message:'Revisi?n documental'});
}));
documentosRoutes.post('/revision/:scope/:id', requirePermissions('documentos.update'), asyncHandler(async(req,res)=>{
  const {scope,id}=reviewParams.parse(req.params);
  const input=z.object({estado:z.enum(['APROBADO','RECHAZADO']),motivo:z.string().trim().max(2000).optional()}).parse(req.body);
  return successResponse(res,{data:await reviewDocument(scope,id,input.estado,input.motivo,req.user!.userId,req.tenant),message:'Revisi?n guardada'});
}));

documentosRoutes.post(
  '/test',
  requirePermissions('documentos.upload'),
  createTestDocumentoPersonaHandler
);
documentosRoutes.post(
  '/persona/:persona_id/upload',
  requirePermissions('documentos.upload'),
  upload.single('file'),
  uploadPersonaDocumentoHandler
);
documentosRoutes.post(
  '/vinculacion/:vinculacion_id/upload',
  requirePermissions('documentos.upload'),
  upload.single('file'),
  uploadVinculacionDocumentoHandler
);
documentosRoutes.get(
  '/persona/:personaId',
  requirePermissions('documentos.read'),
  getPersonaDocumentosHandler
);
documentosRoutes.get(
  '/vinculacion/:vinculacion_id/checklist',
  requirePermissions('documentos.read'),
  getVinculacionChecklistHandler
);
documentosRoutes.get(
  '/vinculacion/:vinculacion_id',
  requirePermissions('documentos.read'),
  getVinculacionDocumentosHandler
);
documentosRoutes.get(
  '/:id/download-url',
  requirePermissions('documentos.download'),
  getDocumentoDownloadUrlHandler
);
documentosRoutes.patch(
  '/persona/:id',
  requirePermissions('documentos.update'),
  updatePersonaDocumentoHandler
);
documentosRoutes.patch(
  '/vinculacion/:id',
  requirePermissions('documentos.update'),
  updateVinculacionDocumentoHandler
);
documentosRoutes.patch(
  '/persona/:id/deactivate',
  requirePermissions('documentos.deactivate'),
  deactivatePersonaDocumentoHandler
);
documentosRoutes.patch(
  '/vinculacion/:id/deactivate',
  requirePermissions('documentos.deactivate'),
  deactivateVinculacionDocumentoHandler
);

export { documentosRoutes };
