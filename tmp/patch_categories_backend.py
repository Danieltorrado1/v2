from pathlib import Path

service_path = Path('src/modules/empresa-configuracion/empresa-configuracion.service.ts')
service = service_path.read_text(encoding='utf-8')
service = service.replace(
"""export interface SalaryCategoryAssignmentPreviewInput {
  periodo_id: number;
  target_category_id?: number | null;
  search?: string | null;
  contrato_cargo_id?: number | null;
  cargo?: string | null;
  municipio_id?: number | null;
  institucion_id?: number | null;
  sede_id?: number | null;
  modalidad_id?: number | null;
  modalidad_codigo?: string | null;
  metodo_pago?: string | null;
  estado_vinculacion?: string | null;
  vinculacion_activa?: boolean | null;
  institucion_sede_count?: SalaryCategoryAssignmentCountCriterion | null;
  without_category?: boolean;
  limit?: number;
}
""",
"""export interface SalaryCategoryAssignmentPreviewInput {
  periodo_id: number;
  target_category_id?: number | null;
  search?: string | null;
  contrato_cargo_id?: number | null;
  cargo?: string | null;
  municipio_id?: number | null;
  municipio?: string | null;
  institucion_id?: number | null;
  institucion?: string | null;
  sede_id?: number | null;
  sede?: string | null;
  modalidad_id?: number | null;
  modalidad?: string | null;
  modalidad_codigo?: string | null;
  metodo_pago?: string | null;
  estado_vinculacion?: string | null;
  vinculacion_activa?: boolean | null;
  institucion_sede_count?: SalaryCategoryAssignmentCountCriterion | null;
  without_category?: boolean;
  limit?: number;
}
""",
1,
)
service = service.replace(
"""  if (input.municipio_id) {
    params.push(String(input.municipio_id));
    conditions.push(`municipio_id = $${params.length}::text`);
  }

  if (input.institucion_id) {
    params.push(String(input.institucion_id));
    conditions.push(`institucion_id = $${params.length}::text`);
  }

  if (input.sede_id) {
    params.push(String(input.sede_id));
    conditions.push(`sede_id = $${params.length}::text`);
  }

  if (input.modalidad_id) {
    params.push(String(input.modalidad_id));
    conditions.push(`modalidad_id = $${params.length}::text`);
  }

  if (trimNullable(input.modalidad_codigo)) {
    params.push(normalizeUpper(input.modalidad_codigo));
    conditions.push(`UPPER(COALESCE(modalidad_codigo, '')) = $${params.length}`);
  }
""",
"""  if (input.municipio_id) {
    params.push(String(input.municipio_id));
    conditions.push(`municipio_id = $${params.length}::text`);
  }

  if (trimNullable(input.municipio)) {
    params.push(`%${trimNullable(input.municipio)}%`);
    conditions.push(`COALESCE(municipio, '') ILIKE $${params.length}`);
  }

  if (input.institucion_id) {
    params.push(String(input.institucion_id));
    conditions.push(`institucion_id = $${params.length}::text`);
  }

  if (trimNullable(input.institucion)) {
    params.push(`%${trimNullable(input.institucion)}%`);
    conditions.push(`COALESCE(institucion, '') ILIKE $${params.length}`);
  }

  if (input.sede_id) {
    params.push(String(input.sede_id));
    conditions.push(`sede_id = $${params.length}::text`);
  }

  if (trimNullable(input.sede)) {
    params.push(`%${trimNullable(input.sede)}%`);
    conditions.push(`COALESCE(sede, '') ILIKE $${params.length}`);
  }

  if (input.modalidad_id) {
    params.push(String(input.modalidad_id));
    conditions.push(`modalidad_id = $${params.length}::text`);
  }

  if (trimNullable(input.modalidad)) {
    params.push(`%${trimNullable(input.modalidad)}%`);
    conditions.push(`COALESCE(modalidad, '') ILIKE $${params.length}`);
  }

  if (trimNullable(input.modalidad_codigo)) {
    params.push(normalizeUpper(input.modalidad_codigo));
    conditions.push(`UPPER(COALESCE(modalidad_codigo, '')) = $${params.length}`);
  }
""",
1,
)
service_path.write_text(service.rstrip() + '\n', encoding='utf-8', newline='\n')

routes_path = Path('src/modules/empresa-configuracion/empresa-configuracion.routes.ts')
routes = routes_path.read_text(encoding='utf-8')
routes = routes.replace(
"""  createPayrollParameter,
  createSalaryCategory,
  getCompanyConfiguration,
  listPayrollParameters,
  listSalaryCategories,
  saveGeneralConfiguration,
  saveModuleConfiguration,
  updateSalaryCategory
} from './empresa-configuracion.service';
""",
"""  applySalaryCategoryAssignment,
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
""",
1,
)
routes = routes.replace(
"""const category = categoryFields.refine(
  (value) => !value.vigente_hasta || value.vigente_hasta >= value.vigente_desde,
  { message: 'Invalid validity range' }
);
""",
"""const category = categoryFields.refine(
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
""",
1,
)
routes = routes.replace(
"""router.patch(
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

export { router as empresaConfiguracionRoutes };
""",
"""router.patch(
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
""",
1,
)
routes_path.write_text(routes.rstrip() + '\n', encoding='utf-8', newline='\n')
