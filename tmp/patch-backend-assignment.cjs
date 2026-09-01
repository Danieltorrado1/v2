const fs = require('fs');
const path = 'src/modules/empresa-configuracion/empresa-configuracion.service.ts';
let source = fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

function replaceOnce(from, to, label) {
  if (!source.includes(from)) {
    throw new Error(`No se encontró bloque: ${label}`);
  }
  source = source.replace(from, to);
}

replaceOnce(
`export interface SalaryCategoryAssignmentApplyInput {
  periodo_id: number;
  target_category_id?: number | null;
  nomina_empleado_ids: number[];
  observacion?: string | null;
}`,
`export interface SalaryCategoryAssignmentApplyInput {
  periodo_id: number;
  target_category_id?: number | null;
  nomina_empleado_ids: number[];
  observacion?: string | null;
  preview_criteria?: Omit<
    SalaryCategoryAssignmentPreviewInput,
    'periodo_id' | 'target_category_id' | 'limit'
  > | null;
}`,
'apply input interface'
);

replaceOnce(
`interface AssignmentCurrentRow extends QueryResultRow {
  categoria_codigo: string | null;
  categoria_id: string | null;
  categoria_nombre: string | null;
  nomina_empleado_id: string;
  numero_documento: string | null;
  persona_nombre: string;
}`,
`interface AssignmentCurrentRow extends QueryResultRow {
  categoria_codigo: string | null;
  categoria_id: string | null;
  categoria_nombre: string | null;
  nomina_empleado_id: string;
  numero_documento: string | null;
  persona_nombre: string;
}

interface AssignmentModalityOptionRow extends QueryResultRow {
  modalidad: string | null;
  modalidad_codigo: string | null;
  modalidad_id: string | null;
}`,
'assignment modality row interface'
);

replaceOnce(
`const buildAssignmentPreviewQuery = (
  input: SalaryCategoryAssignmentPreviewInput
): { params: unknown[]; sql: string } => {`,
`export const buildAssignmentPreviewQuery = (
  input: SalaryCategoryAssignmentPreviewInput
): { params: unknown[]; sql: string } => {`,
'export preview query'
);

replaceOnce(
`const loadTargetCategoryForPreview = async (
  empresaId: number,
  periodo: PeriodoScopeRow,
  targetCategoryId: number | null | undefined,
  tenant?: TenantAccessContext,
  client?: PoolClient
) => {
  if (!targetCategoryId) {
    return null;
  }

  const row = await loadSalaryCategoryRowOrThrow(targetCategoryId, tenant, client);
  if (Number(row.contrato_id) !== Number(periodo.contrato_id)) {
    throw new AppError(
      'Salary category does not belong to the payroll period contract',
      409,
      'CATEGORY_PERIOD_CONTRACT_MISMATCH'
    );
  }

  await assertContractBelongsToCompany(Number(row.contrato_id), empresaId);
  return mapSalaryCategory(row);
};`,
`const formatPeriodoScope = (periodo: PeriodoScopeRow) => ({
  id: String(periodo.id),
  contrato_id: String(periodo.contrato_id),
  nombre_periodo: periodo.nombre_periodo,
  fecha_inicio: toDateString(periodo.fecha_inicio),
  fecha_fin: toDateString(periodo.fecha_fin),
  estado: periodo.estado,
  numero_contrato: periodo.numero_contrato
});

const buildAssignmentCriteriaSnapshot = (
  input:
    | Omit<SalaryCategoryAssignmentPreviewInput, 'periodo_id' | 'target_category_id' | 'limit'>
    | null
    | undefined
) => {
  if (!input) {
    return null;
  }

  const normalizedCount = input.institucion_sede_count
    ? input.institucion_sede_count.operator === 'BETWEEN'
      ? {
          operator: 'BETWEEN' as const,
          min: input.institucion_sede_count.min ?? 0,
          max: input.institucion_sede_count.max ?? input.institucion_sede_count.min ?? 0
        }
      : {
          operator: input.institucion_sede_count.operator,
          value: input.institucion_sede_count.value ?? 0
        }
    : undefined;

  const snapshot = {
    search: trimNullable(input.search),
    contrato_cargo_id: input.contrato_cargo_id ?? undefined,
    cargo: trimNullable(input.cargo),
    municipio_id: input.municipio_id ?? undefined,
    municipio: trimNullable(input.municipio),
    institucion_id: input.institucion_id ?? undefined,
    institucion: trimNullable(input.institucion),
    sede_id: input.sede_id ?? undefined,
    sede: trimNullable(input.sede),
    modalidad_id: input.modalidad_id ?? undefined,
    modalidad: trimNullable(input.modalidad),
    modalidad_codigo: normalizeUpper(input.modalidad_codigo),
    metodo_pago: normalizeUpper(input.metodo_pago),
    estado_vinculacion: normalizeUpper(input.estado_vinculacion),
    vinculacion_activa:
      input.vinculacion_activa === null || input.vinculacion_activa === undefined
        ? undefined
        : input.vinculacion_activa,
    institucion_sede_count: normalizedCount,
    without_category: input.without_category === true ? true : undefined
  };

  const entries = Object.entries(snapshot).filter(([, value]) => value !== undefined && value !== null);
  return entries.length > 0 ? Object.fromEntries(entries) : null;
};

const loadTargetCategoryForPreview = async (
  empresaId: number,
  periodo: PeriodoScopeRow,
  targetCategoryId: number | null | undefined,
  tenant?: TenantAccessContext,
  client?: PoolClient
) => {
  if (!targetCategoryId) {
    return null;
  }

  const row = await loadSalaryCategoryRowOrThrow(targetCategoryId, tenant, client);
  if (Number(row.contrato_id) !== Number(periodo.contrato_id)) {
    throw new AppError(
      'Salary category does not belong to the payroll period contract',
      409,
      'CATEGORY_PERIOD_CONTRACT_MISMATCH'
    );
  }

  await assertContractBelongsToCompany(Number(row.contrato_id), empresaId);

  if (!toBooleanValue(row.activo)) {
    throw new AppError('Salary category is inactive', 409, 'CATEGORY_INACTIVE');
  }

  const periodoInicio = toDateString(periodo.fecha_inicio);
  const periodoFin = toDateString(periodo.fecha_fin);
  const categoriaInicio = toDateString(row.vigente_desde);
  const categoriaFin = toDateString(row.vigente_hasta) ?? openEndedDate;

  if (!periodoInicio || !periodoFin || !categoriaInicio || categoriaInicio > periodoFin || categoriaFin < periodoInicio) {
    throw new AppError(
      'Salary category is outside the payroll period validity range',
      409,
      'CATEGORY_OUT_OF_PERIOD_RANGE'
    );
  }

  return mapSalaryCategory(row);
};

export const listSalaryCategoryAssignmentOptions = async (
  empresaId: number,
  periodoId: number,
  tenant?: TenantAccessContext
) => {
  const periodo = await loadPeriodoScopeOrThrow(periodoId, empresaId, tenant);
  const result = await dbQuery<AssignmentModalityOptionRow>(
    `
      ${buildAssignmentBaseSql()}
      WHERE modalidad_id IS NOT NULL OR modalidad_codigo IS NOT NULL OR modalidad IS NOT NULL
      GROUP BY modalidad_id, modalidad_codigo, modalidad
      ORDER BY UPPER(COALESCE(modalidad_codigo, modalidad, '')), modalidad ASC NULLS LAST
    `,
    [periodoId]
  );

  return {
    periodo: formatPeriodoScope(periodo),
    modalidades: result.rows.map((row) => ({
      id: row.modalidad_id ? String(row.modalidad_id) : null,
      codigo: row.modalidad_codigo ? String(row.modalidad_codigo) : null,
      nombre: row.modalidad ? String(row.modalidad) : null,
      etiqueta: [row.modalidad_codigo, row.modalidad]
        .filter((value): value is string => Boolean(value && value.trim()))
        .join(' · ')
    }))
  };
};`,
'category validation and options block'
);

replaceOnce(
`  return {
    periodo: {
      id: String(periodo.id),
      contrato_id: String(periodo.contrato_id),
      nombre_periodo: periodo.nombre_periodo,
      fecha_inicio: toDateString(periodo.fecha_inicio),
      fecha_fin: toDateString(periodo.fecha_fin),
      estado: periodo.estado,
      numero_contrato: periodo.numero_contrato
    },`,
`  return {
    periodo: formatPeriodoScope(periodo),`,
'preview periodo formatter'
);

replaceOnce(
`    const changedRows = employeesResult.rows.filter(
      (row) => Number(row.categoria_id ?? 0) !== Number(targetCategoryId ?? 0)
    );

    for (const row of changedRows) {
      const before = {
        nomina_empleado_id: row.nomina_empleado_id,
        categoria_salarial_id: row.categoria_id,
        categoria_salarial: row.categoria_id
          ? {
              id: row.categoria_id,
              codigo_categoria: row.categoria_codigo,
              nombre_categoria: row.categoria_nombre
            }
          : null
      };

      await client.query(
        `
          UPDATE nomina_empleados
          SET categoria_salarial_id = $2::bigint
          WHERE id = $1::bigint
        `,
        [row.nomina_empleado_id, targetCategoryId]
      );

      await registerAuditEntry({
        client,
        usuario_id: actorUserId,
        accion: 'NOMINA_EMPLEADO_CATEGORY_ASSIGN',
        tabla: 'nomina_empleados',
        registro_id: row.nomina_empleado_id,
        descripcion: input.observacion ?? 'Asignación manual de categoría salarial',
        contrato_id: String(periodo.contrato_id),
        empresa_id: String(periodo.empresa_id),
        before: {
          ...before,
          periodo_id: String(periodo.id),
          contrato_id: String(periodo.contrato_id),
          empresa_id: String(periodo.empresa_id)
        },
        after: {
          nomina_empleado_id: row.nomina_empleado_id,
          periodo_id: String(periodo.id),
          contrato_id: String(periodo.contrato_id),
          empresa_id: String(periodo.empresa_id),
          categoria_salarial_id: targetCategoryId ? String(targetCategoryId) : null,
          categoria_salarial: category
            ? {
                id: category.id,
                codigo_categoria: category.codigo_categoria,
                nombre_categoria: category.nombre_categoria
              }
            : null,
          trabajador: {
            nombre_completo: row.persona_nombre,
            numero_documento: row.numero_documento
          }
        },
        ip: auditMeta?.ip ?? null,
        user_agent: auditMeta?.user_agent ?? null
      });
    }

    const control = await buildAssignmentControlSummary(input.periodo_id, client);`,
`    const changedRows = employeesResult.rows.filter(
      (row) => Number(row.categoria_id ?? 0) !== Number(targetCategoryId ?? 0)
    );
    const previewCriteria = buildAssignmentCriteriaSnapshot(input.preview_criteria ?? null);

    for (const row of changedRows) {
      const accionCategoria = targetCategoryId === null ? 'RETIRAR' : row.categoria_id ? 'CAMBIAR' : 'ASIGNAR';
      const before = {
        nomina_empleado_id: row.nomina_empleado_id,
        periodo_id: String(periodo.id),
        contrato_id: String(periodo.contrato_id),
        empresa_id: String(periodo.empresa_id),
        categoria_salarial_id: row.categoria_id,
        categoria_salarial: row.categoria_id
          ? {
              id: row.categoria_id,
              codigo_categoria: row.categoria_codigo,
              nombre_categoria: row.categoria_nombre
            }
          : null,
        trabajador: {
          nombre_completo: row.persona_nombre,
          numero_documento: row.numero_documento
        }
      };

      await client.query(
        `
          UPDATE nomina_empleados
          SET categoria_salarial_id = $2::bigint
          WHERE id = $1::bigint
        `,
        [row.nomina_empleado_id, targetCategoryId]
      );

      await registerAuditEntry({
        client,
        usuario_id: actorUserId,
        accion: 'NOMINA_EMPLEADO_CATEGORY_ASSIGN',
        tabla: 'nomina_empleados',
        registro_id: row.nomina_empleado_id,
        descripcion: input.observacion ?? `${accionCategoria} categoría salarial manual`,
        contrato_id: String(periodo.contrato_id),
        empresa_id: String(periodo.empresa_id),
        before,
        after: {
          nomina_empleado_id: row.nomina_empleado_id,
          periodo_id: String(periodo.id),
          contrato_id: String(periodo.contrato_id),
          empresa_id: String(periodo.empresa_id),
          categoria_salarial_id: targetCategoryId ? String(targetCategoryId) : null,
          categoria_salarial: category
            ? {
                id: category.id,
                codigo_categoria: category.codigo_categoria,
                nombre_categoria: category.nombre_categoria
              }
            : null,
          accion_categoria: accionCategoria,
          observacion: input.observacion ?? null,
          criterios_preview: previewCriteria,
          trabajador: {
            nombre_completo: row.persona_nombre,
            numero_documento: row.numero_documento
          }
        },
        ip: auditMeta?.ip ?? null,
        user_agent: auditMeta?.user_agent ?? null
      });
    }

    const control = await buildAssignmentControlSummary(input.periodo_id, client);`,
'apply audit block'
);

replaceOnce(
`    return {
      periodo: {
        id: String(periodo.id),
        contrato_id: String(periodo.contrato_id),
        nombre_periodo: periodo.nombre_periodo,
        fecha_inicio: toDateString(periodo.fecha_inicio),
        fecha_fin: toDateString(periodo.fecha_fin),
        estado: periodo.estado,
        numero_contrato: periodo.numero_contrato
      },`,
`    return {
      periodo: formatPeriodoScope(periodo),`,
'apply periodo formatter'
);

fs.writeFileSync(path, source.replace(/\n/g, '\r\n'));
