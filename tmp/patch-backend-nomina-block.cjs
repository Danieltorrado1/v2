const fs = require('fs');

function replaceOrThrow(source, oldValue, newValue, label) {
  if (!source.includes(oldValue)) {
    throw new Error(`Replacement failed: ${label}`);
  }
  return source.replace(oldValue, newValue);
}

const servicePath = 'src/modules/empresa-configuracion/empresa-configuracion.service.ts';
let service = fs.readFileSync(servicePath, 'utf8');

service = replaceOrThrow(
  service,
  [
    'export interface SalaryCategoryAssignmentApplyInput {',
    '  periodo_id: number;',
    '  target_category_id?: number | null;',
    '  nomina_empleado_ids: number[];',
    '  observacion?: string | null;',
    '}',
    ''
  ].join('\n'),
  [
    "export interface SalaryCategoryAssignmentCriteriaSnapshot",
    "  extends Omit<SalaryCategoryAssignmentPreviewInput, 'limit'> {}",
    '',
    'export interface SalaryCategoryAssignmentApplyInput {',
    '  periodo_id: number;',
    '  target_category_id?: number | null;',
    '  nomina_empleado_ids: number[];',
    '  observacion?: string | null;',
    '  preview_criteria?: SalaryCategoryAssignmentCriteriaSnapshot | null;',
    '}',
    ''
  ].join('\n'),
  'service apply input'
);

service = replaceOrThrow(
  service,
  [
    'interface AssignmentCurrentRow extends QueryResultRow {',
    '  categoria_codigo: string | null;',
    '  categoria_id: string | null;',
    '  categoria_nombre: string | null;',
    '  nomina_empleado_id: string;',
    '  numero_documento: string | null;',
    '  persona_nombre: string;',
    '}',
    ''
  ].join('\n'),
  [
    'interface AssignmentCurrentRow extends QueryResultRow {',
    '  categoria_codigo: string | null;',
    '  categoria_id: string | null;',
    '  categoria_nombre: string | null;',
    '  nomina_empleado_id: string;',
    '  numero_documento: string | null;',
    '  persona_nombre: string;',
    '}',
    '',
    'interface AssignmentModalidadOptionRow extends QueryResultRow {',
    '  modalidad: string | null;',
    '  modalidad_codigo: string | null;',
    '  total_trabajadores: number;',
    '}',
    ''
  ].join('\n'),
  'service options row'
);

service = replaceOrThrow(
  service,
  'const buildAssignmentPreviewQuery = (',
  'export const buildAssignmentPreviewQuery = (',
  'export buildAssignmentPreviewQuery'
);

const helperBlock = [
  'const intersectsDateRange = (',
  '  rangeAStart: string | null | undefined,',
  '  rangeAEnd: string | null | undefined,',
  '  rangeBStart: string | null | undefined,',
  '  rangeBEnd: string | null | undefined',
  ') => {',
  '  if (!rangeAStart || !rangeBStart) {',
  '    return false;',
  '  }',
  '',
  "  const normalizedRangeAEnd = rangeAEnd ?? '9999-12-31';",
  "  const normalizedRangeBEnd = rangeBEnd ?? '9999-12-31';",
  '  return normalizedRangeAEnd >= rangeBStart && normalizedRangeBEnd >= rangeAStart;',
  '};',
  '',
  'export const buildSalaryCategoryAssignmentCriteriaSnapshot = (',
  '  input: SalaryCategoryAssignmentCriteriaSnapshot | null | undefined',
  '): SalaryCategoryAssignmentCriteriaSnapshot | null => {',
  '  if (!input) {',
  '    return null;',
  '  }',
  '',
  '  return Object.fromEntries(',
  '    Object.entries({',
  '      periodo_id: input.periodo_id,',
  '      target_category_id: input.target_category_id ?? null,',
  '      search: trimNullable(input.search),',
  '      contrato_cargo_id: input.contrato_cargo_id ?? undefined,',
  '      cargo: trimNullable(input.cargo),',
  '      municipio_id: input.municipio_id ?? undefined,',
  '      municipio: trimNullable(input.municipio),',
  '      institucion_id: input.institucion_id ?? undefined,',
  '      institucion: trimNullable(input.institucion),',
  '      sede_id: input.sede_id ?? undefined,',
  '      sede: trimNullable(input.sede),',
  '      modalidad_id: input.modalidad_id ?? undefined,',
  '      modalidad: trimNullable(input.modalidad),',
  '      modalidad_codigo: trimNullable(input.modalidad_codigo)?.toUpperCase() ?? undefined,',
  '      metodo_pago: trimNullable(input.metodo_pago)?.toUpperCase() ?? undefined,',
  '      estado_vinculacion: trimNullable(input.estado_vinculacion)?.toUpperCase() ?? undefined,',
  '      vinculacion_activa: input.vinculacion_activa ?? undefined,',
  '      institucion_sede_count: input.institucion_sede_count',
  '        ? {',
  '            operator: input.institucion_sede_count.operator,',
  '            value: input.institucion_sede_count.value ?? undefined,',
  '            min: input.institucion_sede_count.min ?? undefined,',
  '            max: input.institucion_sede_count.max ?? undefined',
  '          }',
  '        : undefined,',
  '      without_category: input.without_category === true ? true : undefined',
  '    }).filter(([, value]) => value !== undefined)',
  '  ) as SalaryCategoryAssignmentCriteriaSnapshot;',
  '};',
  '',
  'const resolveSalaryCategoryAssignmentAction = (',
  '  currentCategoryId: string | null,',
  '  nextCategoryId: number | null',
  "): 'ASIGNAR' | 'CAMBIAR' | 'RETIRAR' => {",
  '  if (!currentCategoryId && nextCategoryId) {',
  "    return 'ASIGNAR';",
  '  }',
  '',
  '  if (currentCategoryId && !nextCategoryId) {',
  "    return 'RETIRAR';",
  '  }',
  '',
  "  return 'CAMBIAR';",
  '};',
  '',
  'export const listSalaryCategoryAssignmentOptions = async (',
  '  empresaId: number,',
  '  periodoId: number,',
  '  tenant?: TenantAccessContext',
  ') => {',
  '  await loadPeriodoScopeOrThrow(periodoId, empresaId, tenant);',
  '',
  '  const result = await dbQuery<AssignmentModalidadOptionRow>(',
  '    `SELECT',
  '        modalidad_codigo,',
  '        modalidad,',
  '        COUNT(*)::int AS total_trabajadores',
  '      FROM (',
  '        ${buildAssignmentBaseSql()}',
  '      ) assignment_source',
  "      WHERE COALESCE(modalidad_codigo, '') <> ''",
  '      GROUP BY modalidad_codigo, modalidad',
  '      ORDER BY modalidad_codigo ASC, modalidad ASC`,',
  '    [periodoId]',
  '  );',
  '',
  '  return {',
  '    modalidades: result.rows.map((row) => ({',
  "      modalidad_codigo: row.modalidad_codigo ?? '',",
  '      modalidad: row.modalidad,',
  '      total_trabajadores: Number(row.total_trabajadores ?? 0)',
  '    }))',
  '  };',
  '};',
  '',
  'const loadTargetCategoryForPreview = async (',
  ''
].join('\n');

service = replaceOrThrow(
  service,
  'const loadTargetCategoryForPreview = async (\n',
  helperBlock,
  'service helper insertion'
);

service = replaceOrThrow(
  service,
  [
    '  const row = await loadSalaryCategoryRowOrThrow(targetCategoryId, tenant, client);',
    '  if (Number(row.contrato_id) !== Number(periodo.contrato_id)) {',
    '    throw new AppError(',
    "      'Salary category does not belong to the payroll period contract',",
    '      409,',
    "      'CATEGORY_PERIOD_CONTRACT_MISMATCH'",
    '    );',
    '  }',
    '',
    '  await assertContractBelongsToCompany(Number(row.contrato_id), empresaId);',
    '  return mapSalaryCategory(row);',
    '};',
    ''
  ].join('\n'),
  [
    '  const row = await loadSalaryCategoryRowOrThrow(targetCategoryId, tenant, client);',
    '  if (Number(row.contrato_id) !== Number(periodo.contrato_id)) {',
    '    throw new AppError(',
    "      'Salary category does not belong to the payroll period contract',",
    '      409,',
    "      'CATEGORY_PERIOD_CONTRACT_MISMATCH'",
    '    );',
    '  }',
    '',
    '  await assertContractBelongsToCompany(Number(row.contrato_id), empresaId);',
    '',
    '  const category = mapSalaryCategory(row);',
    '  if (!category.activo) {',
    "    throw new AppError('Salary category is inactive', 409, 'CATEGORY_INACTIVE');",
    '  }',
    '',
    '  if (',
    '    !intersectsDateRange(',
    '      category.vigente_desde,',
    '      category.vigente_hasta ?? null,',
    '      toDateString(periodo.fecha_inicio),',
    '      toDateString(periodo.fecha_fin)',
    '    )',
    '  ) {',
    '    throw new AppError(',
    "      'Salary category is outside the payroll period validity',",
    '      409,',
    "      'CATEGORY_OUT_OF_PERIOD_RANGE'",
    '    );',
    '  }',
    '',
    '  return category;',
    '};',
    ''
  ].join('\n'),
  'category validation'
);

service = replaceOrThrow(
  service,
  [
    '    const category = await loadTargetCategoryForPreview(',
    '      empresaId,',
    '      periodo,',
    '      input.target_category_id,',
    '      tenant,',
    '      client',
    '    );',
    '    const targetCategoryId = category ? Number(category.id) : null;',
    '',
    '    const employeesResult = await client.query<AssignmentCurrentRow>(',
  ].join('\n'),
  [
    '    const category = await loadTargetCategoryForPreview(',
    '      empresaId,',
    '      periodo,',
    '      input.target_category_id,',
    '      tenant,',
    '      client',
    '    );',
    '    const targetCategoryId = category ? Number(category.id) : null;',
    '    const criteriaSnapshot = buildSalaryCategoryAssignmentCriteriaSnapshot(',
    '      input.preview_criteria ?? {',
    '        periodo_id: input.periodo_id,',
    '        target_category_id: input.target_category_id ?? null',
    '      }',
    '    );',
    '',
    '    const employeesResult = await client.query<AssignmentCurrentRow>(',
  ].join('\n'),
  'criteria snapshot'
);

service = replaceOrThrow(
  service,
  [
    '    for (const row of changedRows) {',
    '      const before = {',
    '        nomina_empleado_id: row.nomina_empleado_id,',
    '        categoria_salarial_id: row.categoria_id,',
    '        categoria_salarial: row.categoria_id',
  ].join('\n'),
  [
    '    for (const row of changedRows) {',
    '      const assignmentAction = resolveSalaryCategoryAssignmentAction(row.categoria_id, targetCategoryId);',
    '      const before = {',
    '        nomina_empleado_id: row.nomina_empleado_id,',
    '        categoria_salarial_id: row.categoria_id,',
    '        categoria_salarial: row.categoria_id',
  ].join('\n'),
  'assignment action'
);

service = replaceOrThrow(
  service,
  [
    '      await registerAuditEntry({',
    '        client,',
    '        usuario_id: actorUserId,',
    "        accion: 'NOMINA_EMPLEADO_CATEGORY_ASSIGN',",
    "        tabla: 'nomina_empleados',",
    '        registro_id: row.nomina_empleado_id,',
    "        descripcion: input.observacion ?? 'Asignación manual de categoría salarial',",
    '        contrato_id: String(periodo.contrato_id),',
    '        empresa_id: String(periodo.empresa_id),',
    '        before: {',
    '          ...before,',
    '          periodo_id: String(periodo.id),',
    '          contrato_id: String(periodo.contrato_id),',
    '          empresa_id: String(periodo.empresa_id)',
    '        },',
    '        after: {',
    '          nomina_empleado_id: row.nomina_empleado_id,',
    '          periodo_id: String(periodo.id),',
    '          contrato_id: String(periodo.contrato_id),',
    '          empresa_id: String(periodo.empresa_id),',
    '          categoria_salarial_id: targetCategoryId ? String(targetCategoryId) : null,',
    '          categoria_salarial: category',
  ].join('\n'),
  [
    '      await registerAuditEntry({',
    '        client,',
    '        usuario_id: actorUserId,',
    "        accion: 'NOMINA_EMPLEADO_CATEGORY_ASSIGN',",
    "        tabla: 'nomina_empleados',",
    '        registro_id: row.nomina_empleado_id,',
    "        descripcion: input.observacion ?? `${assignmentAction} manual de categoría salarial`,",
    '        contrato_id: String(periodo.contrato_id),',
    '        empresa_id: String(periodo.empresa_id),',
    '        before: {',
    '          ...before,',
    '          periodo_id: String(periodo.id),',
    '          contrato_id: String(periodo.contrato_id),',
    '          empresa_id: String(periodo.empresa_id),',
    '          accion_categoria: assignmentAction,',
    '          observacion: input.observacion ?? null,',
    '          criterios_preview: criteriaSnapshot,',
    '          trabajador: {',
    '            nombre_completo: row.persona_nombre,',
    '            numero_documento: row.numero_documento',
    '          }',
    '        },',
    '        after: {',
    '          nomina_empleado_id: row.nomina_empleado_id,',
    '          periodo_id: String(periodo.id),',
    '          contrato_id: String(periodo.contrato_id),',
    '          empresa_id: String(periodo.empresa_id),',
    '          accion_categoria: assignmentAction,',
    '          observacion: input.observacion ?? null,',
    '          criterios_preview: criteriaSnapshot,',
    '          categoria_salarial_id: targetCategoryId ? String(targetCategoryId) : null,',
    '          categoria_salarial: category',
  ].join('\n'),
  'audit enrichment'
);

fs.writeFileSync(servicePath, service);

const routesPath = 'src/modules/empresa-configuracion/empresa-configuracion.routes.ts';
let routes = fs.readFileSync(routesPath, 'utf8');

routes = replaceOrThrow(
  routes,
  [
    '  listPayrollParameters,',
    '  listSalaryCategories,',
    '  previewSalaryCategoryAssignment,',
  ].join('\n'),
  [
    '  listPayrollParameters,',
    '  listSalaryCategories,',
    '  listSalaryCategoryAssignmentOptions,',
    '  previewSalaryCategoryAssignment,',
  ].join('\n'),
  'routes import'
);

routes = replaceOrThrow(
  routes,
  [
    'const assignmentApply = z.object({',
    '  periodo_id: z.coerce.number().int().positive(),',
    '  target_category_id: z.coerce.number().int().positive().nullable().optional(),',
    '  nomina_empleado_ids: z.array(z.coerce.number().int().positive()).min(1),',
    '  observacion: z.string().trim().max(500).nullable().optional()',
    '});',
  ].join('\n'),
  [
    'const assignmentOptionsQuery = z.object({',
    '  periodo_id: z.coerce.number().int().positive()',
    '});',
    'const assignmentApply = z.object({',
    '  periodo_id: z.coerce.number().int().positive(),',
    '  target_category_id: z.coerce.number().int().positive().nullable().optional(),',
    '  nomina_empleado_ids: z.array(z.coerce.number().int().positive()).min(1),',
    '  observacion: z.string().trim().max(500).nullable().optional(),',
    '  preview_criteria: assignmentPreview.omit({ limit: true }).nullable().optional()',
    '});',
  ].join('\n'),
  'routes apply schema'
);

routes = replaceOrThrow(
  routes,
  "router.post(\n  '/:empresaId/salary-categories/assignments/preview',\n",
  [
    'router.get(',
    "  '/:empresaId/salary-categories/assignments/options',",
    "  requirePermissions('nomina.economico.read'),",
    '  asyncHandler(async (req, res) =>',
    '    res.json({',
    '      data: await listSalaryCategoryAssignmentOptions(',
    '        id.parse(req.params.empresaId),',
    '        assignmentOptionsQuery.parse(req.query).periodo_id,',
    '        req.tenant',
    '      )',
    '    })',
    '  )',
    ');',
    '',
    'router.post(',
    "  '/:empresaId/salary-categories/assignments/preview',",
  ].join('\n'),
  'routes options endpoint'
);

fs.writeFileSync(routesPath, routes);
console.log('patched backend files');
