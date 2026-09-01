import fs from 'node:fs';

function replaceOrThrow(source, searchValue, replaceValue, label) {
  const next = source.replace(searchValue, replaceValue);
  if (next === source) {
    throw new Error(`Replacement failed: ${label}`);
  }
  return next;
}

const servicePath = 'src/modules/empresa-configuracion/empresa-configuracion.service.ts';
let service = fs.readFileSync(servicePath, 'utf8');

service = replaceOrThrow(
  service,
  `export interface SalaryCategoryAssignmentApplyInput {\n  periodo_id: number;\n  target_category_id?: number | null;\n  nomina_empleado_ids: number[];\n  observacion?: string | null;\n}\n`,
  `export interface SalaryCategoryAssignmentCriteriaSnapshot\n  extends Omit<SalaryCategoryAssignmentPreviewInput, 'limit'> {}\n\nexport interface SalaryCategoryAssignmentApplyInput {\n  periodo_id: number;\n  target_category_id?: number | null;\n  nomina_empleado_ids: number[];\n  observacion?: string | null;\n  preview_criteria?: SalaryCategoryAssignmentCriteriaSnapshot | null;\n}\n`,
  'service apply input'
);

service = replaceOrThrow(
  service,
  `interface AssignmentCurrentRow extends QueryResultRow {\n  categoria_codigo: string | null;\n  categoria_id: string | null;\n  categoria_nombre: string | null;\n  nomina_empleado_id: string;\n  numero_documento: string | null;\n  persona_nombre: string;\n}\n`,
  `interface AssignmentCurrentRow extends QueryResultRow {\n  categoria_codigo: string | null;\n  categoria_id: string | null;\n  categoria_nombre: string | null;\n  nomina_empleado_id: string;\n  numero_documento: string | null;\n  persona_nombre: string;\n}\n\ninterface AssignmentModalidadOptionRow extends QueryResultRow {\n  modalidad: string | null;\n  modalidad_codigo: string | null;\n  total_trabajadores: number;\n}\n`,
  'service options row'
);

service = replaceOrThrow(
  service,
  'const buildAssignmentPreviewQuery = (',
  'export const buildAssignmentPreviewQuery = (',
  'service export buildAssignmentPreviewQuery'
);

service = replaceOrThrow(
  service,
  `const loadTargetCategoryForPreview = async (\n`,
  `const intersectsDateRange = (\n  rangeAStart: string | null | undefined,\n  rangeAEnd: string | null | undefined,\n  rangeBStart: string | null | undefined,\n  rangeBEnd: string | null | undefined\n) => {\n  if (!rangeAStart || !rangeBStart) {\n    return false;\n  }\n\n  const normalizedRangeAEnd = rangeAEnd ?? '9999-12-31';\n  const normalizedRangeBEnd = rangeBEnd ?? '9999-12-31';\n  return normalizedRangeAEnd >= rangeBStart && normalizedRangeBEnd >= rangeAStart;\n};\n\nexport const buildSalaryCategoryAssignmentCriteriaSnapshot = (\n  input: SalaryCategoryAssignmentCriteriaSnapshot | null | undefined\n): SalaryCategoryAssignmentCriteriaSnapshot | null => {\n  if (!input) {\n    return null;\n  }\n\n  return Object.fromEntries(\n    Object.entries({\n      periodo_id: input.periodo_id,\n      target_category_id: input.target_category_id ?? null,\n      search: trimNullable(input.search),\n      contrato_cargo_id: input.contrato_cargo_id ?? undefined,\n      cargo: trimNullable(input.cargo),\n      municipio_id: input.municipio_id ?? undefined,\n      municipio: trimNullable(input.municipio),\n      institucion_id: input.institucion_id ?? undefined,\n      institucion: trimNullable(input.institucion),\n      sede_id: input.sede_id ?? undefined,\n      sede: trimNullable(input.sede),\n      modalidad_id: input.modalidad_id ?? undefined,\n      modalidad: trimNullable(input.modalidad),\n      modalidad_codigo: trimNullable(input.modalidad_codigo)?.toUpperCase() ?? undefined,\n      metodo_pago: trimNullable(input.metodo_pago)?.toUpperCase() ?? undefined,\n      estado_vinculacion: trimNullable(input.estado_vinculacion)?.toUpperCase() ?? undefined,\n      vinculacion_activa: input.vinculacion_activa ?? undefined,\n      institucion_sede_count: input.institucion_sede_count\n        ? {\n            operator: input.institucion_sede_count.operator,\n            value: input.institucion_sede_count.value ?? undefined,\n            min: input.institucion_sede_count.min ?? undefined,\n            max: input.institucion_sede_count.max ?? undefined\n          }\n        : undefined,\n      without_category: input.without_category === true ? true : undefined\n    }).filter(([, value]) => value !== undefined)\n  ) as SalaryCategoryAssignmentCriteriaSnapshot;\n};\n\nconst resolveSalaryCategoryAssignmentAction = (\n  currentCategoryId: string | null,\n  nextCategoryId: number | null\n): 'ASIGNAR' | 'CAMBIAR' | 'RETIRAR' => {\n  if (!currentCategoryId && nextCategoryId) {\n    return 'ASIGNAR';\n  }\n\n  if (currentCategoryId && !nextCategoryId) {\n    return 'RETIRAR';\n  }\n\n  return 'CAMBIAR';\n};\n\nexport const listSalaryCategoryAssignmentOptions = async (\n  empresaId: number,\n  periodoId: number,\n  tenant?: TenantAccessContext\n) => {\n  await loadPeriodoScopeOrThrow(periodoId, empresaId, tenant);\n\n  const result = await dbQuery<AssignmentModalidadOptionRow>(\n    `SELECT\n        modalidad_codigo,\n        modalidad,\n        COUNT(*)::int AS total_trabajadores\n      FROM (\n        ${buildAssignmentBaseSql()}\n      ) assignment_source\n      WHERE COALESCE(modalidad_codigo, '') <> ''\n      GROUP BY modalidad_codigo, modalidad\n      ORDER BY modalidad_codigo ASC, modalidad ASC`,\n    [periodoId]\n  );\n\n  return {\n    modalidades: result.rows.map((row) => ({\n      modalidad_codigo: row.modalidad_codigo ?? '',\n      modalidad: row.modalidad,\n      total_trabajadores: Number(row.total_trabajadores ?? 0)\n    }))\n  };\n};\n\nconst loadTargetCategoryForPreview = async (\n`,
  'service helpers insertion'
);

service = replaceOrThrow(
  service,
  `  const row = await loadSalaryCategoryRowOrThrow(targetCategoryId, tenant, client);\n  if (Number(row.contrato_id) !== Number(periodo.contrato_id)) {\n    throw new AppError(\n      'Salary category does not belong to the payroll period contract',\n      409,\n      'CATEGORY_PERIOD_CONTRACT_MISMATCH'\n    );\n  }\n\n  await assertContractBelongsToCompany(Number(row.contrato_id), empresaId);\n  return mapSalaryCategory(row);\n};\n`,
  `  const row = await loadSalaryCategoryRowOrThrow(targetCategoryId, tenant, client);\n  if (Number(row.contrato_id) !== Number(periodo.contrato_id)) {\n    throw new AppError(\n      'Salary category does not belong to the payroll period contract',\n      409,\n      'CATEGORY_PERIOD_CONTRACT_MISMATCH'\n    );\n  }\n\n  await assertContractBelongsToCompany(Number(row.contrato_id), empresaId);\n\n  const category = mapSalaryCategory(row);\n  if (!category.activo) {\n    throw new AppError('Salary category is inactive', 409, 'CATEGORY_INACTIVE');\n  }\n\n  if (\n    !intersectsDateRange(\n      category.vigente_desde,\n      category.vigente_hasta ?? null,\n      toDateString(periodo.fecha_inicio),\n      toDateString(periodo.fecha_fin)\n    )\n  ) {\n    throw new AppError(\n      'Salary category is outside the payroll period validity',\n      409,\n      'CATEGORY_OUT_OF_PERIOD_RANGE'\n    );\n  }\n\n  return category;\n};\n`,
  'service category validation'
);

service = replaceOrThrow(
  service,
  `    const category = await loadTargetCategoryForPreview(\n      empresaId,\n      periodo,\n      input.target_category_id,\n      tenant,\n      client\n    );\n    const targetCategoryId = category ? Number(category.id) : null;\n\n    const employeesResult = await client.query<AssignmentCurrentRow>(\n`,
  `    const category = await loadTargetCategoryForPreview(\n      empresaId,\n      periodo,\n      input.target_category_id,\n      tenant,\n      client\n    );\n    const targetCategoryId = category ? Number(category.id) : null;\n    const criteriaSnapshot = buildSalaryCategoryAssignmentCriteriaSnapshot(\n      input.preview_criteria ?? {\n        periodo_id: input.periodo_id,\n        target_category_id: input.target_category_id ?? null\n      }\n    );\n\n    const employeesResult = await client.query<AssignmentCurrentRow>(\n`,
  'service criteria snapshot apply'
);

service = replaceOrThrow(
  service,
  `    for (const row of changedRows) {\n      const before = {\n        nomina_empleado_id: row.nomina_empleado_id,\n        categoria_salarial_id: row.categoria_id,\n        categoria_salarial: row.categoria_id\n          ? {\n              id: row.categoria_id,\n              codigo_categoria: row.categoria_codigo,\n              nombre_categoria: row.categoria_nombre\n            }\n          : null\n      };\n\n      await client.query(\n`,
  `    for (const row of changedRows) {\n      const assignmentAction = resolveSalaryCategoryAssignmentAction(row.categoria_id, targetCategoryId);\n      const before = {\n        nomina_empleado_id: row.nomina_empleado_id,\n        categoria_salarial_id: row.categoria_id,\n        categoria_salarial: row.categoria_id\n          ? {\n              id: row.categoria_id,\n              codigo_categoria: row.categoria_codigo,\n              nombre_categoria: row.categoria_nombre\n            }\n          : null\n      };\n\n      await client.query(\n`,
  'service assignment action'
);

service = replaceOrThrow(
  service,
  `      await registerAuditEntry({\n        client,\n        usuario_id: actorUserId,\n        accion: 'NOMINA_EMPLEADO_CATEGORY_ASSIGN',\n        tabla: 'nomina_empleados',\n        registro_id: row.nomina_empleado_id,\n        descripcion: input.observacion ?? 'Asignación manual de categoría salarial',\n        contrato_id: String(periodo.contrato_id),\n        empresa_id: String(periodo.empresa_id),\n        before: {\n          ...before,\n          periodo_id: String(periodo.id),\n          contrato_id: String(periodo.contrato_id),\n          empresa_id: String(periodo.empresa_id)\n        },\n        after: {\n          nomina_empleado_id: row.nomina_empleado_id,\n          periodo_id: String(periodo.id),\n          contrato_id: String(periodo.contrato_id),\n          empresa_id: String(periodo.empresa_id),\n          categoria_salarial_id: targetCategoryId ? String(targetCategoryId) : null,\n          categoria_salarial: category\n            ? {\n                id: category.id,\n                codigo_categoria: category.codigo_categoria,\n                nombre_categoria: category.nombre_categoria\n              }\n            : null,\n          trabajador: {\n            nombre_completo: row.persona_nombre,\n            numero_documento: row.numero_documento\n          }\n        },\n        ip: auditMeta?.ip ?? null,\n        user_agent: auditMeta?.user_agent ?? null\n      });\n`,
  `      await registerAuditEntry({\n        client,\n        usuario_id: actorUserId,\n        accion: 'NOMINA_EMPLEADO_CATEGORY_ASSIGN',\n        tabla: 'nomina_empleados',\n        registro_id: row.nomina_empleado_id,\n        descripcion: input.observacion ?? `${assignmentAction} manual de categoría salarial`,\n        contrato_id: String(periodo.contrato_id),\n        empresa_id: String(periodo.empresa_id),\n        before: {\n          ...before,\n          periodo_id: String(periodo.id),\n          contrato_id: String(periodo.contrato_id),\n          empresa_id: String(periodo.empresa_id),\n          accion_categoria: assignmentAction,\n          observacion: input.observacion ?? null,\n          criterios_preview: criteriaSnapshot,\n          trabajador: {\n            nombre_completo: row.persona_nombre,\n            numero_documento: row.numero_documento\n          }\n        },\n        after: {\n          nomina_empleado_id: row.nomina_empleado_id,\n          periodo_id: String(periodo.id),\n          contrato_id: String(periodo.contrato_id),\n          empresa_id: String(periodo.empresa_id),\n          accion_categoria: assignmentAction,\n          observacion: input.observacion ?? null,\n          criterios_preview: criteriaSnapshot,\n          categoria_salarial_id: targetCategoryId ? String(targetCategoryId) : null,\n          categoria_salarial: category\n            ? {\n                id: category.id,\n                codigo_categoria: category.codigo_categoria,\n                nombre_categoria: category.nombre_categoria\n              }\n            : null,\n          trabajador: {\n            nombre_completo: row.persona_nombre,\n            numero_documento: row.numero_documento\n          }\n        },\n        ip: auditMeta?.ip ?? null,\n        user_agent: auditMeta?.user_agent ?? null\n      });\n`,
  'service audit enrichment'
);

fs.writeFileSync(servicePath, service);

const routesPath = 'src/modules/empresa-configuracion/empresa-configuracion.routes.ts';
let routes = fs.readFileSync(routesPath, 'utf8');

routes = replaceOrThrow(
  routes,
  `  listPayrollParameters,\n  listSalaryCategories,\n  previewSalaryCategoryAssignment,\n`,
  `  listPayrollParameters,\n  listSalaryCategories,\n  listSalaryCategoryAssignmentOptions,\n  previewSalaryCategoryAssignment,\n`,
  'routes import options'
);

routes = replaceOrThrow(
  routes,
  `const assignmentPreview = z.object({\n`,
  `const assignmentPreview = z.object({\n`,
  'routes anchor preview'
);

routes = replaceOrThrow(
  routes,
  `const assignmentApply = z.object({\n  periodo_id: z.coerce.number().int().positive(),\n  target_category_id: z.coerce.number().int().positive().nullable().optional(),\n  nomina_empleado_ids: z.array(z.coerce.number().int().positive()).min(1),\n  observacion: z.string().trim().max(500).nullable().optional()\n});\n`,
  `const assignmentOptionsQuery = z.object({\n  periodo_id: z.coerce.number().int().positive()\n});\nconst assignmentApply = z.object({\n  periodo_id: z.coerce.number().int().positive(),\n  target_category_id: z.coerce.number().int().positive().nullable().optional(),\n  nomina_empleado_ids: z.array(z.coerce.number().int().positive()).min(1),\n  observacion: z.string().trim().max(500).nullable().optional(),\n  preview_criteria: assignmentPreview.omit({ limit: true }).nullable().optional()\n});\n`,
  'routes apply schema'
);

routes = replaceOrThrow(
  routes,
  `router.post(\n  '/:empresaId/salary-categories/assignments/preview',\n`,
  `router.get(\n  '/:empresaId/salary-categories/assignments/options',\n  requirePermissions('nomina.economico.read'),\n  asyncHandler(async (req, res) =>\n    res.json({\n      data: await listSalaryCategoryAssignmentOptions(\n        id.parse(req.params.empresaId),\n        assignmentOptionsQuery.parse(req.query).periodo_id,\n        req.tenant\n      )\n    })\n  )\n);\n\nrouter.post(\n  '/:empresaId/salary-categories/assignments/preview',\n`,
  'routes options endpoint'
);

fs.writeFileSync(routesPath, routes);
console.log('patched backend files');
