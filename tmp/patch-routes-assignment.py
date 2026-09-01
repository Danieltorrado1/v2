from pathlib import Path
path = Path('src/modules/empresa-configuracion/empresa-configuracion.routes.ts')
source = path.read_text(encoding='utf-8').replace('\r\n', '\n')

old_import = """  listPayrollParameters,
  listSalaryCategories,
  previewSalaryCategoryAssignment,
  saveGeneralConfiguration,
  saveModuleConfiguration,
  updateSalaryCategory
} from './empresa-configuracion.service';"""
new_import = """  listPayrollParameters,
  listSalaryCategories,
  listSalaryCategoryAssignmentOptions,
  previewSalaryCategoryAssignment,
  saveGeneralConfiguration,
  saveModuleConfiguration,
  updateSalaryCategory
} from './empresa-configuracion.service';"""
if old_import not in source:
    raise SystemExit('import block not found')
source = source.replace(old_import, new_import, 1)

source = source.replace(
"""const assignmentApply = z.object({
  periodo_id: z.coerce.number().int().positive(),
  target_category_id: z.coerce.number().int().positive().nullable().optional(),
  nomina_empleado_ids: z.array(z.coerce.number().int().positive()).min(1),
  observacion: z.string().trim().max(500).nullable().optional()
});""",
"""const assignmentCriteria = assignmentPreview.omit({
  periodo_id: true,
  target_category_id: true,
  limit: true
});
const assignmentApply = z.object({
  periodo_id: z.coerce.number().int().positive(),
  target_category_id: z.coerce.number().int().positive().nullable().optional(),
  nomina_empleado_ids: z.array(z.coerce.number().int().positive()).min(1),
  observacion: z.string().trim().max(500).nullable().optional(),
  preview_criteria: assignmentCriteria.nullable().optional()
});""",
1
)

marker = """router.post(
  '/:empresaId/salary-categories/assignments/preview',"""
insert = """
router.get(
  '/:empresaId/salary-categories/assignments/options',
  requirePermissions('nomina.economico.read'),
  asyncHandler(async (req, res) =>
    res.json({
      data: await listSalaryCategoryAssignmentOptions(
        id.parse(req.params.empresaId),
        id.parse(req.query.periodo_id),
        req.tenant
      )
    })
  )
);

"""
if marker not in source:
    raise SystemExit('preview route marker not found')
source = source.replace(marker, insert + marker, 1)

path.write_text(source.replace('\n', '\r\n'), encoding='utf-8')
