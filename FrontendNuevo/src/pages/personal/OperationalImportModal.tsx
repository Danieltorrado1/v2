import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Upload,
  XCircle,
} from 'lucide-react';

import { ApiClientError } from '../../services/apiClient';
import {
  analyzeMasterImport,
  applyMasterImport,
  downloadMasterImportReport,
  downloadMasterImportTemplate,
  getMasterImportPreview,
  listMasterImportHistory,
  validateMasterImport,
} from '../../services/importacionesApi';
import type {
  MasterImportAnalyzeResponse,
  MasterImportApplyResponse,
  MasterImportClassification,
  MasterImportFilter,
  MasterImportLote,
  MasterImportPreviewResponse,
  MasterImportType,
} from '../../types/importaciones.types';
import './OperationalImportModal.css';

const FILTERS: Array<{ key: MasterImportFilter; label: string }> = [
  { key: 'TODOS', label: 'Todos' },
  { key: 'NUEVAS', label: 'Nuevas' },
  { key: 'ACTUALIZACIONES', label: 'Actualizaciones' },
  { key: 'SIN_CAMBIOS', label: 'Sin cambios' },
  { key: 'ERRORES', label: 'Errores' },
  { key: 'DUPLICADOS', label: 'Duplicados' },
];

const TYPE_OPTIONS: Array<{ key: MasterImportType; label: string; description: string }> = [
  {
    key: 'DATOS_PERSONALES',
    label: 'Datos personales',
    description: 'Actualiza o crea informacion maestra de persona usando identidad canonica.',
  },
  {
    key: 'INFORMACION_BANCARIA',
    label: 'Informacion bancaria',
    description: 'Versiona persona_cuentas_bancarias sin destruir historico.',
  },
];

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

function classificationTone(value: MasterImportClassification): string {
  if (value === 'ERROR') return 'status-error';
  if (value === 'POSIBLE_DUPLICADO') return 'status-warning';
  if (value === 'SIN_CAMBIOS') return 'status-muted';
  return 'status-success';
}

export default function OperationalImportModal({
  contratoId,
  empresaNombre,
  contratoNombre,
  canApply,
  onClose,
  onImported,
}: {
  contratoId: number;
  empresaNombre: string;
  contratoNombre: string;
  canApply: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const [selectedType, setSelectedType] = useState<MasterImportType>('DATOS_PERSONALES');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<MasterImportAnalyzeResponse | null>(null);
  const [preview, setPreview] = useState<MasterImportPreviewResponse | null>(null);
  const [applyResult, setApplyResult] = useState<MasterImportApplyResponse | null>(null);
  const [history, setHistory] = useState<MasterImportLote[]>([]);
  const [columnMappings, setColumnMappings] = useState<Record<string, string | null>>({});
  const [filter, setFilter] = useState<MasterImportFilter>('TODOS');
  const [page, setPage] = useState(1);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [validating, setValidating] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');

  const currentStep = useMemo(() => {
    if (applyResult) return 5;
    if (preview) return 4;
    if (analysis) return 3;
    if (analyzing) return 2;
    return 1;
  }, [analysis, analyzing, applyResult, preview]);

  const availableFields = useMemo(() => {
    return selectedType === 'DATOS_PERSONALES'
      ? [
          'tipo_documento',
          'numero_documento',
          'primer_nombre',
          'segundo_nombre',
          'primer_apellido',
          'segundo_apellido',
          'fecha_nacimiento',
          'telefono',
          'correo',
          'direccion',
          'barrio',
          'municipio_residencia',
          'pais_nacimiento',
        ]
      : [
          'tipo_documento',
          'numero_documento',
          'nombre',
          'entidad_bancaria',
          'tipo_cuenta',
          'numero_cuenta',
          'titular',
          'nombre_titular',
          'documento_titular',
          'observacion',
        ];
  }, [selectedType]);

  useEffect(() => {
    setLoadingHistory(true);
    void listMasterImportHistory({ page: 1, limit: 6, tipo: selectedType })
      .then((response) => {
        setHistory(response.items.filter((item) => item.contrato?.id === contratoId));
      })
      .catch(() => {
        setHistory([]);
      })
      .finally(() => {
        setLoadingHistory(false);
      });
  }, [contratoId, selectedType]);

  useEffect(() => {
    if (!preview?.lote.id) return;
    let cancelled = false;
    setLoadingPreview(true);

    void getMasterImportPreview(preview.lote.id, { page, limit: 50, filter })
      .then((response) => {
        if (!cancelled) {
          setPreview(response);
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(getErrorMessage(nextError, 'No fue posible recargar el preview del lote.'));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingPreview(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [filter, page, preview?.lote.id]);

  async function handleAnalyze(): Promise<void> {
    if (!selectedFile) {
      setError('Selecciona un archivo XLSX o CSV antes de continuar.');
      return;
    }

    setAnalyzing(true);
    setError('');
    setPreview(null);
    setApplyResult(null);
    setPage(1);
    setFilter('TODOS');

    try {
      const result = await analyzeMasterImport(selectedFile, selectedType, contratoId);
      const nextMappings = Object.fromEntries(
        result.analysis.detected_headers.map((header) => {
          const suggestion = result.analysis.suggestions.find((item) => item.header === header);
          return [header, suggestion?.suggested_field ?? null];
        })
      );
      setAnalysis(result);
      setColumnMappings(nextMappings);
    } catch (nextError) {
      setAnalysis(null);
      setError(getErrorMessage(nextError, 'No fue posible analizar el archivo.'));
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleValidate(): Promise<void> {
    if (!analysis?.lote.id) {
      setError('Primero analiza un archivo.');
      return;
    }

    setValidating(true);
    setError('');
    setApplyResult(null);
    try {
      const result = await validateMasterImport(analysis.lote.id, columnMappings);
      setPreview(result);
      setFilter('TODOS');
      setPage(1);
    } catch (nextError) {
      setError(getErrorMessage(nextError, 'No fue posible generar el dry-run.'));
    } finally {
      setValidating(false);
    }
  }

  async function handleApply(): Promise<void> {
    if (!preview?.lote.id || !canApply) return;
    setApplying(true);
    setError('');
    try {
      const result = await applyMasterImport(preview.lote.id);
      setApplyResult(result);
      setPreview(await getMasterImportPreview(preview.lote.id, { page: 1, limit: 50, filter: 'TODOS' }));
      onImported();
    } catch (nextError) {
      setError(getErrorMessage(nextError, 'No fue posible aplicar la importacion.'));
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="op-import-layer" onClick={onClose}>
      <div className="op-import-modal" onClick={(event) => event.stopPropagation()}>
        <div className="op-import-header">
          <div>
            <h2>Importar desde personal</h2>
            <p>Empresa: <strong>{empresaNombre}</strong> / Contrato: <strong>{contratoNombre}</strong></p>
          </div>
          <button type="button" className="op-close-button" onClick={onClose} aria-label="Cerrar">
            <XCircle size={18} />
          </button>
        </div>

        <div className="op-import-steps">
          {[1, 2, 3, 4, 5].map((step) => (
            <span key={step} className={step <= currentStep ? 'is-active' : ''}>Paso {step}</span>
          ))}
        </div>

        {error ? <div className="op-import-alert error"><AlertTriangle size={16} /> {error}</div> : null}

        <div className="op-import-type-grid">
          {TYPE_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`op-import-type-card ${selectedType === option.key ? 'is-active' : ''}`}
              onClick={() => {
                setSelectedType(option.key);
                setAnalysis(null);
                setPreview(null);
                setApplyResult(null);
                setSelectedFile(null);
              }}
            >
              <strong>{option.label}</strong>
              <span>{option.description}</span>
            </button>
          ))}
        </div>

        <div className="op-import-actions-bar">
          <button type="button" className="op-button secondary" onClick={() => void downloadMasterImportTemplate(selectedType)}>
            <Download size={15} /> Descargar plantilla
          </button>
          <label className="op-import-file-picker">
            <FileSpreadsheet size={15} />
            <span>{selectedFile?.name ?? 'Seleccionar archivo'}</span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <button type="button" className="op-button primary" onClick={() => void handleAnalyze()} disabled={analyzing || !selectedFile}>
            {analyzing ? <RefreshCw size={15} className="is-spinning" /> : <Upload size={15} />} Analizar
          </button>
        </div>

        {analysis ? (
          <section className="op-import-table-wrap op-import-mapping-wrap">
            <div className="op-import-summary-grid">
              <div><strong>{analysis.analysis.total_rows}</strong><span>Filas detectadas</span></div>
              <div><strong>{analysis.analysis.detected_headers.length}</strong><span>Columnas</span></div>
              <div><strong>{analysis.analysis.required_fields.length}</strong><span>Obligatorias</span></div>
            </div>

            <div className="op-import-toolbar">
              <strong>Mapeo de columnas</strong>
              <button type="button" className="op-button primary" onClick={() => void handleValidate()} disabled={validating}>
                {validating ? <RefreshCw size={15} className="is-spinning" /> : <CheckCircle2 size={15} />} Validar y dry-run
              </button>
            </div>

            <table className="op-import-table">
              <thead>
                <tr>
                  <th>Columna Excel</th>
                  <th>Campo Empiria</th>
                  <th>Auto</th>
                </tr>
              </thead>
              <tbody>
                {analysis.analysis.detected_headers.map((header) => {
                  const suggestion = analysis.analysis.suggestions.find((item) => item.header === header);
                  return (
                    <tr key={header}>
                      <td>{header}</td>
                      <td>
                        <select
                          value={columnMappings[header] ?? ''}
                          onChange={(event) => setColumnMappings((current) => ({
                            ...current,
                            [header]: event.target.value || null,
                          }))}
                        >
                          <option value="">Ignorar columna</option>
                          {availableFields.map((field) => (
                            <option key={field} value={field}>{field}</option>
                          ))}
                        </select>
                      </td>
                      <td>{suggestion?.suggested_field ?? 'Sin coincidencia'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ) : (
          <div className="op-import-empty-card">
            Subir archivo nunca escribe datos maestros. Primero se analiza, despues se mapea y solo al final se aplica.
          </div>
        )}

        {preview ? (
          <>
            <div className="op-import-summary-grid">
              <div><strong>{preview.summary.total_filas}</strong><span>Total filas</span></div>
              <div><strong>{preview.summary.nuevas}</strong><span>Nuevas</span></div>
              <div><strong>{preview.summary.actualizaciones}</strong><span>Actualizaciones</span></div>
              <div><strong>{preview.summary.sin_cambios}</strong><span>Sin cambios</span></div>
              <div><strong>{preview.summary.errores}</strong><span>Errores</span></div>
              <div><strong>{preview.summary.posibles_duplicados}</strong><span>Posibles duplicados</span></div>
            </div>

            <div className="op-import-toolbar">
              <div className="op-import-filters">
                {FILTERS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    className={`op-import-filter ${filter === option.key ? 'is-active' : ''}`}
                    onClick={() => {
                      setFilter(option.key);
                      setPage(1);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="op-import-toolbar-actions">
                <button type="button" className="op-button secondary" onClick={() => void downloadMasterImportReport(preview.lote.id)}>
                  <Download size={15} /> Descargar reporte
                </button>
                <button type="button" className="op-button primary" onClick={() => void handleApply()} disabled={!canApply || applying}>
                  {applying ? <RefreshCw size={15} className="is-spinning" /> : <CheckCircle2 size={15} />} Aplicar
                </button>
              </div>
            </div>

            <div className="op-import-table-wrap">
              <table className="op-import-table">
                <thead>
                  <tr>
                    <th>Fila</th>
                    <th>Documento</th>
                    <th>Nombre</th>
                    <th>Resultado</th>
                    <th>Diff / errores</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.length === 0 ? (
                    <tr><td colSpan={5} className="op-import-empty">No hay filas para este filtro.</td></tr>
                  ) : preview.rows.map((row) => (
                    <tr key={row.fila}>
                      <td>{row.fila}</td>
                      <td>{row.tipo_documento ?? 'Sin tipo'}<br /><span className="op-import-mono">{row.numero_documento ?? 'Sin numero'}</span></td>
                      <td>{row.nombre ?? 'Sin nombre'}</td>
                      <td><span className={`op-import-badge ${classificationTone(row.clasificacion)}`}>{row.clasificacion}</span></td>
                      <td>
                        {row.diffs.map((diff) => (
                          <div key={`${row.fila}-${diff.field}`} className="op-import-diff-line">
                            <strong>{diff.label}</strong>: {diff.current_value ?? '—'} {'->'} {diff.next_value ?? '—'}
                          </div>
                        ))}
                        {row.errores.map((issue) => (
                          <div key={`${row.fila}-${issue.field}-${issue.code}`} className="op-import-error-line">{issue.message}</div>
                        ))}
                        {row.advertencias.map((issue) => (
                          <div key={`${row.fila}-${issue.field}-${issue.code}`} className="op-import-warning-line">{issue.message}</div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="op-import-pagination">
              <span>{preview.pagination.total === 0 ? 'Sin resultados' : `${(preview.pagination.page - 1) * preview.pagination.limit + 1} - ${Math.min(preview.pagination.page * preview.pagination.limit, preview.pagination.total)} de ${preview.pagination.total}`}</span>
              <div className="op-pagination-actions">
                <button type="button" className="op-button secondary" disabled={preview.pagination.page <= 1 || loadingPreview} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</button>
                <button type="button" className="op-button secondary" disabled={preview.pagination.page >= preview.pagination.total_pages || loadingPreview} onClick={() => setPage((current) => current + 1)}>Siguiente</button>
              </div>
            </div>
          </>
        ) : null}

        {applyResult ? (
          <div className="op-import-alert success">
            <CheckCircle2 size={16} /> Apply completado: {applyResult.applied_rows} filas aplicadas, {applyResult.created_personas} personas creadas, {applyResult.updated_personas} personas actualizadas, {applyResult.created_bank_accounts} cuentas nuevas y {applyResult.updated_bank_accounts} cuentas versionadas.
          </div>
        ) : null}

        <section className="op-import-table-wrap op-import-history-wrap">
          <div className="op-import-toolbar">
            <strong>Historial reciente</strong>
            {loadingHistory ? <span className="op-count-inline">Cargando...</span> : null}
          </div>
          <table className="op-import-table">
            <thead>
              <tr>
                <th>Archivo</th>
                <th>Estado</th>
                <th>Fecha</th>
                <th>Filas</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan={4} className="op-import-empty">No hay lotes maestros recientes para este contrato.</td></tr>
              ) : history.map((item) => (
                <tr key={item.id}>
                  <td>{item.archivo_nombre}</td>
                  <td>{item.estado}</td>
                  <td>{new Date(item.created_at).toLocaleString('es-CO')}</td>
                  <td>{item.total_filas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
