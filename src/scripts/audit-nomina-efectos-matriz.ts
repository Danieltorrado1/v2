const { mkdir, writeFile }: typeof import('node:fs/promises') = require('node:fs/promises');
const path: typeof import('node:path') = require('node:path');

const { dbPool, dbQuery }: typeof import('../config/db') = require('../config/db.ts');
const {
  buildNominaEffectMatrixFromConfig,
  resolveNominaEfectosPorDia,
}: typeof import('../modules/nomina/nomina.effects') = require('../modules/nomina/nomina.effects.ts');
const {
  calculateCoberturaPayroll,
}: typeof import('../modules/nomina/nomina.cobertura') = require('../modules/nomina/nomina.cobertura.ts');

type NominaEffectMatrixConfigInput =
  import('../modules/nomina/nomina.effects').NominaEffectMatrixConfigInput;
type NominaNovedadEffectMatrix =
  import('../modules/nomina/nomina.effects').NominaNovedadEffectMatrix;
type QueryResultRow = import('pg').QueryResultRow;

interface NominaTipoNovedadAuditRow
  extends QueryResultRow,
    NominaEffectMatrixConfigInput {
  activo: boolean | null;
  categoria: string | null;
  id: string;
  requiere_soporte: boolean | null;
  requiere_solicitud_permiso: boolean | null;
}

type AuditStatus = 'OK' | 'ALERTA' | 'PENDIENTE_CONFIGURACION';

const EXECUTION_DATE = new Date().toISOString().slice(0, 10);

const PERIOD = {
  end: '2026-08-31',
  start: '2026-08-01',
} as const;

const EMPLOYMENT = {
  end: PERIOD.end,
  start: PERIOD.start,
} as const;

const EVENT_DATE = '2026-08-15';

const BASE_CATEGORY = {
  auxilio_transporte: 300_000,
  categoria_id: 'AUDIT',
  codigo_categoria: 'AUDIT',
  nombre_categoria: 'AUDIT',
  recargo_mensual: 90_000,
  salario_base: 900_000,
} as const;

const BASELINE = calculateCoberturaPayroll({
  aporta_pension: true,
  dias_efectos: [],
  empleo: {
    fecha_fin: EMPLOYMENT.end,
    fecha_inicio: EMPLOYMENT.start,
  },
  tramos: [
    {
      categoria: BASE_CATEGORY,
      fecha_fin: PERIOD.end,
      fecha_inicio: PERIOD.start,
    },
  ],
});

const buildSelectSql = (input: {
  hasRequiereSoporte: boolean;
  hasRequiereSolicitudPermiso: boolean;
}): string => `
  SELECT
    id::text AS id,
    nombre,
    codigo_operativo,
    categoria,
    activo,
    COALESCE(afecta_salario, FALSE) AS afecta_salario,
    COALESCE(afecta_transporte, FALSE) AS afecta_transporte,
    COALESCE(bloquea_otras_novedades, FALSE) AS bloquea_otras_novedades,
    COALESCE(proyecta_periodos, FALSE) AS proyecta_periodos,
    efecto_salario,
    efecto_auxilio_transporte,
    efecto_recargos_detallado,
    efecto_liquidacion,
    efecto_cobertura_config,
    efecto_operativo,
    modelo_registro,
    grupo_exclusividad,
    observacion_plantilla,
    ${
      input.hasRequiereSoporte
        ? 'COALESCE(requiere_soporte, FALSE) AS requiere_soporte,'
        : 'FALSE AS requiere_soporte,'
    }
    ${
      input.hasRequiereSolicitudPermiso
        ? 'COALESCE(requiere_solicitud_permiso, FALSE) AS requiere_solicitud_permiso'
        : 'FALSE AS requiere_solicitud_permiso'
    }
  FROM nomina_tipos_novedad
  ORDER BY COALESCE(activo, TRUE) DESC, COALESCE(codigo_operativo, nombre, id::text) ASC
`;

const effectLabel = (value: string, fallbackReason?: string | null): string => {
  if (fallbackReason) {
    return `${value} (${fallbackReason})`;
  }
  return value;
};

const summarizeExpected = (
  row: NominaTipoNovedadAuditRow,
  matrix: NominaNovedadEffectMatrix
): string => {
  const salarioFallback =
    row.efecto_salario === null && row.afecta_salario ? 'fallback afecta_salario=TRUE' : null;
  const transporteFallback =
    row.efecto_auxilio_transporte === null && row.afecta_transporte
      ? 'fallback afecta_transporte=TRUE'
      : null;

  return [
    `salario=${effectLabel(matrix.efecto_salario, salarioFallback)}`,
    `transporte=${effectLabel(matrix.efecto_transporte, transporteFallback)}`,
    `recargos=${matrix.efecto_recargos}`,
    `liquidacion=${matrix.efecto_liquidacion}`,
    `cobertura=${matrix.efecto_cobertura}`,
    `operativo=${matrix.efecto_operativo}`,
    `modelo=${matrix.modelo_registro}`,
    `proyecta=${matrix.proyecta_periodos ? 'SI' : 'NO'}`,
  ].join(' | ');
};

const summarizeObtained = (input: {
  effectDays: ReturnType<typeof resolveNominaEfectosPorDia>;
  matrix: NominaNovedadEffectMatrix;
  recalculated: ReturnType<typeof calculateCoberturaPayroll>;
}): string => {
  const salarioDelta = input.recalculated.salario_ordinario - BASELINE.salario_ordinario;
  const transporteDelta =
    input.recalculated.transporte_ordinario - BASELINE.transporte_ordinario;
  const recargoDelta = input.recalculated.recargos_ordinarios - BASELINE.recargos_ordinarios;
  const saludDelta = input.recalculated.salud_ordinaria - BASELINE.salud_ordinaria;
  const pensionDelta = input.recalculated.pension_ordinaria - BASELINE.pension_ordinaria;
  const netoDelta = input.recalculated.neto_nomina - BASELINE.neto_nomina;

  return [
    `dias_salario=${input.effectDays.dias_salario_descuento}`,
    `dias_transporte=${input.effectDays.dias_transporte_descuento}`,
    `dias_recargos=${input.effectDays.dias_recargo_excluido}`,
    `dias_liquidacion=${input.effectDays.dias_liquidacion_especial}`,
    `delta_salario=${salarioDelta}`,
    `delta_transporte=${transporteDelta}`,
    `delta_recargos=${recargoDelta}`,
    `delta_salud=${saludDelta}`,
    `delta_pension=${pensionDelta}`,
    `delta_neto=${netoDelta}`,
    `operativo=${input.matrix.efecto_operativo}`,
    `cobertura=${input.matrix.efecto_cobertura}`,
  ].join(' | ');
};

const isPendingMatrix = (matrix: NominaNovedadEffectMatrix): boolean => {
  return [
    matrix.efecto_salario,
    matrix.efecto_transporte,
    matrix.efecto_recargos,
    matrix.efecto_liquidacion,
    matrix.efecto_cobertura,
    matrix.efecto_operativo,
  ].some((value) => value.startsWith('PENDIENTE'));
};

const validateMatrix = (input: {
  effectDays: ReturnType<typeof resolveNominaEfectosPorDia>;
  matrix: NominaNovedadEffectMatrix;
  recalculated: ReturnType<typeof calculateCoberturaPayroll>;
}): AuditStatus => {
  if (isPendingMatrix(input.matrix)) {
    return 'PENDIENTE_CONFIGURACION';
  }

  const salarioDelta = input.recalculated.salario_ordinario - BASELINE.salario_ordinario;
  const transporteDelta =
    input.recalculated.transporte_ordinario - BASELINE.transporte_ordinario;
  const recargoDelta = input.recalculated.recargos_ordinarios - BASELINE.recargos_ordinarios;
  const expectedSalarioDias = input.matrix.efecto_salario === 'DESCUENTA_PROPORCIONAL' ? 1 : 0;
  const expectedTransporteDias = input.matrix.efecto_transporte === 'DESCUENTA_DIA' ? 1 : 0;
  const expectedRecargoDias = input.matrix.efecto_recargos === 'EXCLUIR_DIA' ? 1 : 0;
  const expectedLiquidacionDias =
    input.matrix.efecto_liquidacion === 'PREPARAR_LIQUIDACION' ? 1 : 0;

  const salaryOk =
    input.effectDays.dias_salario_descuento === expectedSalarioDias &&
    (expectedSalarioDias === 1 ? salarioDelta < 0 : salarioDelta === 0);
  const transportOk =
    input.effectDays.dias_transporte_descuento === expectedTransporteDias &&
    (expectedTransporteDias === 1 ? transporteDelta < 0 : transporteDelta === 0);
  const recargoOk =
    input.effectDays.dias_recargo_excluido === expectedRecargoDias &&
    (expectedRecargoDias === 1 ? recargoDelta < 0 : recargoDelta === 0);
  const liquidacionOk = input.effectDays.dias_liquidacion_especial === expectedLiquidacionDias;

  return salaryOk && transportOk && recargoOk && liquidacionOk ? 'OK' : 'ALERTA';
};

const markdownEscape = (value: string): string => value.replace(/\|/g, '\\|');

const run = async (): Promise<void> => {
  const columnsResult = await dbQuery<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'nomina_tipos_novedad'
        AND column_name IN ('requiere_soporte', 'requiere_solicitud_permiso')
    `
  );
  const availableColumns = new Set(columnsResult.rows.map((row) => row.column_name));
  const result = await dbQuery<NominaTipoNovedadAuditRow>(
    buildSelectSql({
      hasRequiereSoporte: availableColumns.has('requiere_soporte'),
      hasRequiereSolicitudPermiso: availableColumns.has('requiere_solicitud_permiso'),
    })
  );

  const rows = result.rows.map((row) => {
    const matrix = buildNominaEffectMatrixFromConfig(row);
    const effectDays = resolveNominaEfectosPorDia({
      employment: EMPLOYMENT,
      events: [
        {
          dias: 1,
          fecha_fin: EVENT_DATE,
          fecha_inicio: EVENT_DATE,
          fuente_id: `AUDIT:${row.id}`,
          matrix,
          origen: 'PERIODO',
        },
      ],
      periodo: PERIOD,
    });

    const recalculated = calculateCoberturaPayroll({
      aporta_pension: true,
      dias_efectos: effectDays.days,
      empleo: {
        fecha_fin: EMPLOYMENT.end,
        fecha_inicio: EMPLOYMENT.start,
      },
      tramos: [
        {
          categoria: BASE_CATEGORY,
          fecha_fin: PERIOD.end,
          fecha_inicio: PERIOD.start,
        },
      ],
    });

    return {
      activo: row.activo ?? true,
      codigo: row.codigo_operativo ?? row.id,
      esperado: summarizeExpected(row, matrix),
      obtenido: summarizeObtained({ effectDays, matrix, recalculated }),
      nombre: row.nombre ?? row.codigo_operativo ?? row.id,
      resultado: validateMatrix({ effectDays, matrix, recalculated }),
    };
  });

  const summary = rows.reduce(
    (accumulator, row) => {
      accumulator.total += 1;
      accumulator[row.resultado] += 1;
      return accumulator;
    },
    { ALERTA: 0, OK: 0, PENDIENTE_CONFIGURACION: 0, total: 0 }
  );

  const lines = [
    '# Auditoria matricial de efectos de novedades',
    '',
    `Fecha de ejecucion: ${EXECUTION_DATE}`,
    `Fuente de configuracion: BD QA (${result.rowCount ?? rows.length} tipos en nomina_tipos_novedad)`,
    `Motor evaluado: buildNominaEffectMatrixFromConfig -> resolveNominaEfectosPorDia -> calculateCoberturaPayroll`,
    `Escenario de prueba: periodo ${PERIOD.start} a ${PERIOD.end}, novedad de 1 dia el ${EVENT_DATE}, base salario=900000, transporte=300000, recargos=90000`,
    '',
    `Resumen: total=${summary.total} | ok=${summary.OK} | pendientes=${summary.PENDIENTE_CONFIGURACION} | alertas=${summary.ALERTA}`,
    '',
    '| Novedad | Efecto esperado segun BD | Efecto obtenido | Resultado |',
    '| --- | --- | --- | --- |',
    ...rows.map((row) =>
      `| ${markdownEscape(`${row.codigo} - ${row.nombre}${row.activo ? '' : ' [INACTIVA]'}`)} | ${markdownEscape(row.esperado)} | ${markdownEscape(row.obtenido)} | ${row.resultado} |`
    ),
    '',
  ];

  const report = `${lines.join('\n')}`;
  const reportsDir = path.resolve(process.cwd(), 'reports');
  const reportPath = path.join(reportsDir, `nomina-efectos-matriz-qa-${EXECUTION_DATE}.md`);

  await mkdir(reportsDir, { recursive: true });
  await writeFile(reportPath, report, 'utf8');

  console.log(report);
  console.log(`Reporte guardado en: ${reportPath}`);

  if (summary.ALERTA > 0) {
    process.exitCode = 1;
  }
};

run()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await dbPool.end().catch((error: unknown) => {
      console.error('Failed to close database pool:', error);
    });
  });
