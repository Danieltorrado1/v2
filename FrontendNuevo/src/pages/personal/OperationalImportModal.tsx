import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, RefreshCw, Upload, XCircle } from 'lucide-react';

import { ApiClientError } from '../../services/apiClient';
import {
  confirmOperationalImport,
  downloadOperationalImportReport,
  downloadOperationalImportTemplate,
  getOperationalImportPreview,
  uploadOperationalImport,
} from '../../services/importacionesApi';
import type {
  OperationalImportConfirmResult,
  OperationalImportFilter,
  OperationalImportPreviewResult,
} from '../../types/importaciones.types';
import './OperationalImportModal.css';

const FILTERS: Array<{ key: OperationalImportFilter; label: string }> = [
  { key: 'TODOS', label: 'Todos' },
  { key: 'LISTOS', label: 'Listos' },
  { key: 'REUTILIZADOS', label: 'Reutilizados' },
  { key: 'YA_VINCULADOS', label: 'Ya vinculados' },
  { key: 'ERRORES', label: 'Errores' },
];

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

export default function OperationalImportModal({
  contratoId,
  empresaNombre,
  contratoNombre,
  canConfirm,
  onClose,
  onImported,
}: {
  contratoId: number;
  empresaNombre: string;
  contratoNombre: string;
  canConfirm: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [preview, setPreview] = useState<OperationalImportPreviewResult | null>(null);
  const [confirmResult, setConfirmResult] = useState<OperationalImportConfirmResult | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<OperationalImportFilter>('TODOS');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const loteId = preview?.lote.id;
    if (typeof loteId !== 'number') return;
    const currentLoteId = loteId;
    let cancelled = false;
    async function loadPreview() {
      setLoadingPreview(true);
      try {
        const nextPreview = await getOperationalImportPreview(currentLoteId, { page, limit: 50, filter });
        if (!cancelled) {
          setPreview(nextPreview);
        }
      } catch (nextError) {
        if (!cancelled) setError(getErrorMessage(nextError, 'No fue posible cargar el preview del lote.'));
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    }
    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [filter, page, preview?.lote.id, refreshKey]);

  const currentStep = useMemo(() => {
    if (confirmResult) return 5;
    if (preview) return 3;
    if (uploading || loadingPreview) return 2;
    return 1;
  }, [confirmResult, loadingPreview, preview, uploading]);

  async function handleUpload(): Promise<void> {
    if (!selectedFile) {
      setError('Selecciona un archivo CSV/XLSX antes de continuar.');
      return;
    }
    setError('');
    setConfirmResult(null);
    setUploading(true);
    setPage(1);
    setFilter('TODOS');
    try {
      const result = await uploadOperationalImport(selectedFile, contratoId);
      const nextPreview = await getOperationalImportPreview(result.lote.id, { page: 1, limit: 50, filter: 'TODOS' });
      setPreview(nextPreview);
    } catch (uploadError) {
      setPreview(null);
      setError(getErrorMessage(uploadError, 'No fue posible procesar el archivo de importación.'));
    } finally {
      setUploading(false);
    }
  }

  async function handleConfirm(): Promise<void> {
    if (!preview?.lote.id || !canConfirm) return;
    setConfirming(true);
    setError('');
    try {
      const result = await confirmOperationalImport(preview.lote.id);
      setConfirmResult(result);
      setRefreshKey((current) => current + 1);
      onImported();
    } catch (confirmError) {
      setError(getErrorMessage(confirmError, 'No fue posible confirmar la importación.'));
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="op-import-layer" onClick={onClose}>
      <div className="op-import-modal" onClick={(event) => event.stopPropagation()}>
        <div className="op-import-header">
          <div>
            <h2>Importar personal</h2>
            <p>Importando a: <strong>{empresaNombre}</strong> / <strong>{contratoNombre}</strong></p>
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

        <div className="op-import-actions-bar">
          <button type="button" className="op-button secondary" onClick={() => void downloadOperationalImportTemplate()}>
            <Download size={15} /> Descargar plantilla
          </button>
          <label className="op-import-file-picker">
            <FileSpreadsheet size={15} />
            <span>{selectedFile?.name ?? 'Seleccionar archivo'}</span>
            <input type="file" accept=".csv,.xlsx,.xls" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} />
          </label>
          <button type="button" className="op-button primary" onClick={() => void handleUpload()} disabled={uploading || !selectedFile}>
            {uploading ? <RefreshCw size={15} className="is-spinning" /> : <Upload size={15} />} Analizar archivo
          </button>
        </div>

        {error ? <div className="op-import-alert error"><AlertTriangle size={16} /> {error}</div> : null}

        {preview ? (
          <>
            <div className="op-import-summary-grid">
              <div><strong>{preview.summary.total_filas}</strong><span>Total filas</span></div>
              <div><strong>{preview.summary.listas}</strong><span>Listas</span></div>
              <div><strong>{preview.summary.personas_nuevas}</strong><span>Personas nuevas</span></div>
              <div><strong>{preview.summary.personas_reutilizadas}</strong><span>Reutilizadas</span></div>
              <div><strong>{preview.summary.ya_vinculadas}</strong><span>Ya vinculadas</span></div>
              <div><strong>{preview.summary.con_errores}</strong><span>Con errores</span></div>
            </div>

            <div className="op-import-toolbar">
              <div className="op-import-filters">
                {FILTERS.map((option) => (
                  <button key={option.key} type="button" className={`op-import-filter ${filter === option.key ? 'is-active' : ''}`} onClick={() => { setFilter(option.key); setPage(1); }}>
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="op-import-toolbar-actions">
                <button type="button" className="op-button secondary" onClick={() => void downloadOperationalImportReport(preview.lote.id)}>
                  <Download size={15} /> Descargar resultado
                </button>
                <button type="button" className="op-button primary" onClick={() => void handleConfirm()} disabled={!canConfirm || !preview.lote.puede_confirmar || confirming}>
                  {confirming ? <RefreshCw size={15} className="is-spinning" /> : <CheckCircle2 size={15} />} Confirmar importación
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
                    <th>Cargo</th>
                    <th>Tipo vinc.</th>
                    <th>Persona</th>
                    <th>Vinculación</th>
                    <th>Resultado</th>
                    <th>Mensaje</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.length === 0 ? (
                    <tr><td colSpan={9} className="op-import-empty">No hay filas para este filtro.</td></tr>
                  ) : preview.rows.map((row) => (
                    <tr key={row.fila}>
                      <td>{row.fila}</td>
                      <td>{row.tipo_documento ?? 'Sin tipo'}<br /><span className="op-import-mono">{row.numero_documento ?? 'Sin número'}</span></td>
                      <td>{row.nombre ?? 'Sin nombre'}</td>
                      <td>{row.cargo_original ?? 'Sin cargo'}</td>
                      <td>{row.tipo_vinculacion_original ?? 'Sin tipo'}</td>
                      <td>{row.estado_persona}</td>
                      <td>{row.estado_vinculacion}</td>
                      <td><span className={`op-import-badge status-${row.resultado.toLowerCase()}`}>{row.resultado}</span></td>
                      <td>
                        <div>{row.mensaje}</div>
                        {row.errors.map((item) => <div key={`${row.fila}-${item.field}-${item.code}`} className="op-import-error-line">{item.message}</div>)}
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
        ) : (
          <div className="op-import-empty-card">Sube un archivo y Empiria hará el análisis sin crear personas ni vinculaciones todavía.</div>
        )}

        {confirmResult ? (
          <div className="op-import-alert success">
            <CheckCircle2 size={16} /> Importación completada: {confirmResult.created_vinculaciones} vinculaciones creadas, {confirmResult.reused_personas} personas reutilizadas y {confirmResult.skipped_already_linked} ya vinculadas.
          </div>
        ) : null}
      </div>
    </div>
  );
}




