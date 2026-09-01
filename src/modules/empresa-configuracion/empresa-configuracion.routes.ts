import { Router } from 'express';
import { z } from 'zod';

import { authMiddleware } from '../../middlewares/authMiddleware';
import { requirePermissions } from '../../middlewares/roleMiddleware';
import { tenantMiddleware } from '../../middlewares/tenantMiddleware';
import { asyncHandler } from '../../utils/asyncHandler';
import { getAuditRequestMeta } from '../auditoria/auditoria.helper';
import {
  applySalaryCategoryAssignment,
  createPayrollParameter,
  createSalaryCategory,
  getCompanyConfiguration,
  listPayrollParameters,
  listSalaryCategories,
  previewSalaryCategoryAssignment,
  saveGeneralConfiguration,
  saveModuleConfiguration,
  updateSalaryCategory
} from './empresa-configuracion.service';

const router = Router();

router.use(authMiddleware,tenantMiddleware);

const id = z.coerce.number().int().positive();
const general = z.object({
  nombre_comercial: z.string().trim().max(180).nullable().optional(),
  dv: z.string().regex(/^\d{1,2}$/).nullable().optional(),
  pais: z.string().min(2).max(80),
  zona_horaria: z.string().min(3).max(80),
  moneda: z.string().length(3).transform((value) => value.toUpperCase()),
  locale: z.string().min(2).max(20),
  logo_url: z.string().url().nullable().optional(),
  encabezado_documentos: z.string().max(2000).nullable().optional(),
  direccion: z.string().max(250).nullable().optional(),
  telefono: z.string().max(50).nullable().optional(),
  correo: z.string().email().nullable().optional(),
  ciudad: z.string().max(120).nullable().optional(),
  departamento: z.string().max(120).nullable().optional()
});
const moduleConfig = z.object({
  estado: z.enum(['PENDIENTE', 'INCOMPLETA', 'CONFIGURADA']),
  observaciones: z.string().max(1000).nullable().optional()
});
const money = z.number().nonnegative().nullable().optional();
const payroll = z
  .object({
    vigente_desde: z.iso.date(),
    vigente_hasta: z.iso.date().nullable().optional(),
    salario_minimo: money,
    auxilio_transporte: money,
    uvt: money,
    porcentaje_salud_empleado: money,
    porcentaje_pension_empleado: money,
    porcentaje_fondo_solidaridad: money,
    porcentaje_hora_extra_diurna: money,
    porcentaje_hora_extra_nocturna: money,
    porcentaje_recargo_nocturno: money,
    regla_redondeo: z.enum(['NEAREST', 'FLOOR', 'CEIL', 'NONE']).optional(),
    observaciones: z.string().max(1000).nullable().optional()
  })
  .refine((value) => !value.vigente_hasta || value.vigente_hasta >= value.vigente_desde, {
    message: 'Invalid validity range'
  });
const categoryFields = z.object({
  contrato_id: z.coerce.number().int().positive(),
  codigo_categoria: z.string().trim().min(1).max(80),
  nombre_categoria: z.string().trim().min(1).max(180),
  modalidad: z.string().trim().max(80).nullable().optional(),
  descripcion: z.string().max(1000).nullable().optional(),
  salario_base: z.number().nonnegative(),
  auxilio_transporte: z.number().nonnegative(),
  otros_recargos: z.number().nonnegative().nullable().optional(),
  vigente_desde: z.iso.date(),
  vigente_hasta: z.iso.date().nullable().optional(),
  activo: z.boolean().optional()
});
const category = categoryFields.refine(
  (value) => !value.vigente_hasta || value.vigente_hasta >= value.vigente_desde,
  { message: 'Invalid validity range' }
);
const assignmentCountCriterion = z
  .object({
    operator: z.enum(['EQ', 'GT', 'LT', 'GTE', 'LTE', 'BETWEEN']),
    value: z.coerce.number().int().nonnegative().nullable().optional(),
    min: z.coerce.number().int().nonnegative().nullable().optional(),
    max: z.coerce.number().int().nonnegative().nullable().optional()
  })
  .superRefine((value, ctx) => {
    if (value.operator === 'BETWEEN') {
      if (value.min === null || value.min === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'min is required for BETWEEN', path: ['min'] });
      }
      if (value.max === null || value.max === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'max is required for BETWEEN', path: ['max'] });
      }
      if ((value.min ?? 0) > (value.max ?? 0)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'max must be greater than or equal to min', path: ['max'] });
      }
      return;
    }

    if (value.value === null || value.value === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'value is required for the selected operator', path: ['value'] });
    }
  });
const assignmentPreview = z.object({
  periodo_id: z.coerce.number().int().positive(),
  target_category_id: z.coerce.number().int().positive().nullable().optional(),
  search: z.string().trim().max(180).nullable().optional(),
  contrato_cargo_id: z.coerce.number().int().positive().nullable().optional(),
  cargo: z.string().trim().max(180).nullable().optional(),
  municipio_id: z.coerce.number().int().positive().nullable().optional(),
  municipio: z.string().trim().max(180).nullable().optional(),
  institucion_id: z.coerce.number().int().positive().nullable().optional(),
  institucion: z.string().trim().max(180).nullable().optional(),
  sede_id: z.coerce.number().int().positive().nullable().optional(),
  sede: z.string().trim().max(180).nullable().optional(),
  modalidad_id: z.coerce.number().int().positive().nullable().optional(),
  modalidad: z.string().trim().max(180).nullable().optional(),
  modalidad_codigo: z.string().trim().max(80).nullable().optional(),
  metodo_pago: z.string().trim().max(80).nullable().optional(),
  estado_vinculacion: z.string().trim().max(80).nullable().optional(),
  vinculacion_activa: z.boolean().nullable().optional(),
  institucion_sede_count: assignmentCountCriterion.nullable().optional(),
  without_category: z.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(5000).optional()
});
const assignmentApply = z.object({
  periodo_id: z.coerce.number().int().positive(),
  target_category_id: z.coerce.number().int().positive().nullable().optional(),
  nomina_empleado_ids: z.array(z.coerce.number().int().positive()).min(1),
  observacion: z.string().trim().max(500).nullable().optional()
});

router.get(
  '/:empresaId',
  asyncHandler(async (req, res) =>
    res.json({
      data: await getCompanyConfiguration(id.parse(req.params.empresaId), req.tenant)
    })
  )
);

router.put(
  '/:empresaId/general',
  asyncHandler(async (req, res) =>
    res.json({
      data: await saveGeneralConfiguration(
        id.parse(req.params.empresaId),
        general.parse(req.body),
        req.user!.userId,
        req.tenant,
        getAuditRequestMeta(req)
      )
    })
  )
);

router.put(
  '/:empresaId/modules/:codigo',
  asyncHandler(async (req, res) =>
    res.json({
      data: await saveModuleConfiguration(
        id.parse(req.params.empresaId),
        String(req.params.codigo).toUpperCase(),
        moduleConfig.parse(req.body),
        req.user!.userId,
        req.tenant,
        getAuditRequestMeta(req)
      )
    })
  )
);

router.get(
  '/:empresaId/payroll-parameters',
  requirePermissions('nomina.economico.read'),
  asyncHandler(async (req, res) =>
    res.json({
      data: await listPayrollParameters(
        id.parse(req.params.empresaId),
        z.iso.date().optional().parse(req.query.fecha),
        req.tenant
      )
    })
  )
);

router.post(
  '/:empresaId/payroll-parameters',
  requirePermissions('nomina.parametros.manage'),
  asyncHandler(async (req, res) =>
    res.status(201).json({
      data: await createPayrollParameter(
        id.parse(req.params.empresaId),
        payroll.parse(req.body),
        req.user!.userId,
        req.tenant,
        getAuditRequestMeta(req)
      )
    })
  )
);

router.get(
  '/:empresaId/salary-categories',
  requirePermissions('nomina.economico.read'),
  asyncHandler(async (req, res) =>
    res.json({
      data: await listSalaryCategories(id.parse(req.params.empresaId), req.tenant)
    })
  )
);

router.post(
  '/:empresaId/salary-categories',
  requirePermissions('nomina.categorias.manage'),
  asyncHandler(async (req, res) =>
    res.status(201).json({
      data: await createSalaryCategory(
        id.parse(req.params.empresaId),
        category.parse(req.body),
        req.user!.userId,
        req.tenant,
        getAuditRequestMeta(req)
      )
    })
  )
);

router.patch(
  '/:empresaId/salary-categories/:categoryId',
  requirePermissions('nomina.categorias.manage'),
  asyncHandler(async (req, res) =>
    res.json({
      data: await updateSalaryCategory(
        id.parse(req.params.categoryId),
        categoryFields.partial().parse(req.body),
        req.user!.userId,
        req.tenant,
        getAuditRequestMeta(req)
      )
    })
  )
);

router.post(
  '/:empresaId/salary-categories/assignments/preview',
  requirePermissions('nomina.economico.read'),
  asyncHandler(async (req, res) =>
    res.json({
      data: await previewSalaryCategoryAssignment(
        id.parse(req.params.empresaId),
        assignmentPreview.parse(req.body),
        req.tenant
      )
    })
  )
);

router.post(
  '/:empresaId/salary-categories/assignments/apply',
  requirePermissions('nomina.categorias.manage'),
  asyncHandler(async (req, res) =>
    res.json({
      data: await applySalaryCategoryAssignment(
        id.parse(req.params.empresaId),
        assignmentApply.parse(req.body),
        req.user!.userId,
        req.tenant,
        getAuditRequestMeta(req)
      )
    })
  )
);

export { router as empresaConfiguracionRoutes };
