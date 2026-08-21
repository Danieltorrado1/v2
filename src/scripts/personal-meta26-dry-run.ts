import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  type AliasProposalCsvRow,
  buildCsv,
  META26_FILE,
  runPersonalMeta26DryRun,
  type CoveragePreviewRow,
  type DryRunRowReport,
  type LicitacionPreviewRow,
  type ReviewCsvRow
} from '../modules/importaciones/personalMeta26DryRun';

const OUTPUT_JSON = 'reports/personal-meta26-dry-run-v2.json';
const OUTPUT_CSV = 'reports/personal-meta26-dry-run-v2.csv';
const OUTPUT_REVISAR = 'reports/personal-meta26-revisar-v2.csv';
const OUTPUT_COBERTURA = 'reports/personal-meta26-cobertura-preview-v2.csv';
const OUTPUT_LICITACION = 'reports/personal-meta26-licitacion-preview-v2.csv';
const OUTPUT_ALIASES = 'reports/personal-meta26-aliases-propuestos.csv';
const OUTPUT_MANUALES = 'reports/personal-meta26-decisiones-manuales.csv';

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const filePath = args.find((arg) => arg.endsWith('.xlsx')) ?? META26_FILE;
  const report = await runPersonalMeta26DryRun(filePath);

  await mkdir(path.resolve('reports'), { recursive: true });

  const rowColumns: Array<keyof DryRunRowReport> = [
    'hoja',
    'fila_origen',
    'razon_social',
    'razon_social_clase',
    'cedula',
    'nombre',
    'tipo_documento_origen',
    'tipo_documento_resuelto',
    'identidad_estado',
    'persona_plan',
    'persona_existente_id',
    'vinculacion_plan',
    'vinculacion_existente_id',
    'cargo_origen',
    'cargo_resuelto',
    'cargo_mapping_propuesto',
    'tipo_vinculacion_origen',
    'tipo_vinculacion_resuelto',
    'tipo_contrato_origen',
    'metodo_pago_origen',
    'cobertura_estado',
    'sede_modalidad_id',
    'municipio_origen',
    'institucion_origen',
    'sede_origen',
    'modalidad_origen',
    'ubicacion_estado',
    'ubicacion_resuelta',
    'ubicacion_mapping_propuesto',
    'licitacion_perfil_resuelto',
    'licitacion_documental_estado',
    'cobertura_auditoria',
    'fecha_errores',
    'problemas_bloqueantes',
    'casos_no_bloqueantes',
    'estado_importacion',
    'observaciones_origen'
  ];
  const reviewColumns: Array<keyof ReviewCsvRow> = [
    'fila_origen',
    'hoja',
    'cedula',
    'nombre',
    'razon_social',
    'cargo_origen',
    'problema',
    'valor_origen',
    'propuesta',
    'accion_requerida'
  ];
  const coverageColumns: Array<keyof CoveragePreviewRow> = [
    'municipio',
    'institucion',
    'sede',
    'modalidad',
    'requeridas',
    'asignadas_propuestas',
    'diferencia',
    'estado'
  ];
  const licitacionColumns: Array<keyof LicitacionPreviewRow> = [
    'perfil',
    'requeridos',
    'presentados',
    'diferencia',
    'estado'
  ];
  const aliasColumns: Array<keyof AliasProposalCsvRow> = [
    'tipo_entidad',
    'contexto',
    'valor_xlsx',
    'valor_bd',
    'id_bd',
    'filas_afectadas',
    'confianza',
    'accion',
    'causa'
  ];

  await Promise.all([
    writeFile(path.resolve(OUTPUT_JSON), JSON.stringify(report, null, 2), 'utf8'),
    writeFile(path.resolve(OUTPUT_CSV), buildCsv(report.report_rows, rowColumns), 'utf8'),
    writeFile(path.resolve(OUTPUT_REVISAR), buildCsv(report.review_rows, reviewColumns), 'utf8'),
    writeFile(path.resolve(OUTPUT_COBERTURA), buildCsv(report.coverage_preview, coverageColumns), 'utf8'),
    writeFile(path.resolve(OUTPUT_LICITACION), buildCsv(report.licitacion_preview, licitacionColumns), 'utf8'),
    writeFile(path.resolve(OUTPUT_ALIASES), buildCsv(report.proposed_aliases, aliasColumns), 'utf8'),
    writeFile(path.resolve(OUTPUT_MANUALES), buildCsv(report.manual_decision_rows, reviewColumns), 'utf8')
  ]);

  console.log(JSON.stringify({
    archivo: filePath,
    reportes: {
      json: OUTPUT_JSON,
      csv: OUTPUT_CSV,
      revisar: OUTPUT_REVISAR,
      cobertura: OUTPUT_COBERTURA,
      licitacion: OUTPUT_LICITACION,
      aliases: OUTPUT_ALIASES,
      decisiones_manuales: OUTPUT_MANUALES
    },
    sha256: report.workbook.sha256,
    filas: report.report_rows.length,
    revisar: report.review_rows.length,
    blockers: report.blockers
  }, null, 2));
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : JSON.stringify(error));
  process.exitCode = 1;
});
