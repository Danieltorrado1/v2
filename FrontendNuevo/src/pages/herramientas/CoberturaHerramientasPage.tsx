import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  Download,
  FileSpreadsheet,
  History,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import { useCompanyContext } from '../../context/CompanyContext';
import { configuracionApi } from '../../services/configuracionApi';
import {
  downloadFocalizacionReport,
  downloadFocalizacionTemplate,
  getFocalizacionImportDetail,
  listFocalizacionImportaciones,
  reprocessFocalizacionImport,
  uploadHistoricalFocalizacion,
} from '../../services/coberturaApi';
import { ApiClientError } from '../../services/apiClient';
import type { Contrato } from '../../types/configuracion.types';
import type {
  FocalizacionImportDetailResult,
  FocalizacionImportLote,
} from '../../types/cobertura.types';
import '../personal/OperationalImportModal.css';
import './CoberturaHerramientasPage.css';

function hasAnyPermission(current: string[], expected: string[]): boolean {
  return expected.some((permission) => current.includes(permission));
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Sin fecha';
  try {
    return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`));
  } catch {
    return value;
  }
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Sin fecha';
  try {
    return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
}

function estadoTone(value: string): 'success' | 'warning' | 'danger' | 'info' {
  if (value === 'PROCESADO') return 'success';
  if (value === 'SIN_CAMBIO' || value === 'PROCESADA') return 'info';
  if (value === 'PROCESADO_CON_ALERTAS' || value === 'OFICIAL_POSTERIOR_AJUSTE_MANUAL' || value.includes('ALERTA') || value.includes('CAMBIO') || value === 'SIN_REGLA_COBERTURA') return 'warning';
  return 'danger';
}

const RESULT_FILTERS = ['TODOS', 'AUMENTO', 'DISMINUCION', 'SIN_CAMBIO', 'CAMBIOS', 'NUEVOS', 'ERRORES', 'ALERTAS', 'SIN_REGLA', 'CON_IMPACTO_COBERTURA', 'SIN_IMPACTO_COBERTURA'];

export default function CoberturaHerramientasPage() {
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];

  const canReadContext = hasAnyPermission(permissions, ['configuracion.read', 'empresas.read', 'contratos.read', 'contracts.read']);
  const canReadCobertura = permissions.includes('cobertura.read');
  const canUpdateCobertura = permissions.includes('cobertura.update');

  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [contratoId, setContratoId] = useState<number | null>(null);
  const [history, setHistory] = useState<FocalizacionImportLote[]>([]);
  const [selectedDetail, setSelectedDetail] = useState<FocalizacionImportDetailResult | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [pageError, setPageError] = useState('');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState('TODOS');
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);

  const { empresasDisponibles, empresaId, empresaActual, setEmpresaActual } = useCompanyContext();
  const contratoSeleccionado = contratos.find((contrato) => contrato.id === contratoId) ?? null;

  const summary = selectedDetail?.lote.resumen ?? {
    total_filas: 0,
    procesadas: 0,
    aumentos: 0,
    disminuciones: 0,
    sin_cambio: 0,
    nuevas: 0,
    alertas: 0,
    errores: 0,
  };

  useEffect(() => {
    if (!canReadContext || !empresaId) {
      setContratos([]);
      setContratoId(null);
      return;
    }

    let cancelled = false;
    async function loadContratos() {
      try {
        const response = await configuracionApi.listarContratos({
          page: 1,
          limit: 100,
          activo: true,
          empresa_id: empresaId ?? undefined,
        });
        if (cancelled) return;
        setContratos(response.items);
        setContratoId((current) => current && response.items.some((item) => item.id === current) ? current : response.items[0]?.id ?? null);
      } catch (error) {
        if (!cancelled) {
          setContratos([]);
          setContratoId(null);
          setPageError(getErrorMessage(error, 'No fue posible cargar contratos.'));
        }
      }
    }

    void loadContratos();
    return () => { cancelled = true; };
  }, [canReadContext, empresaId]);

  useEffect(() => {
    if (!canReadCobertura || !contratoId) {
      setHistory([]);
      setSelectedDetail(null);
      return;
    }

    const activeContratoId = contratoId;
    let cancelled = false;
    async function loadHistory() {
      setLoadingHistory(true);
      setPageError('');
      try {
        const response = await listFocalizacionImportaciones(activeContratoId);
        if (cancelled) return;
        setHistory(response.items);
        const first = response.items[0];
        if (first) {
          setLoadingDetail(true);
          const detail = await getFocalizacionImportDetail(first.id, { page: 1, limit: 100, filter });
          if (!cancelled) setSelectedDetail(detail);
          setLoadingDetail(false);
        } else {
          setSelectedDetail(null);
        }
      } catch (error) {
        if (!cancelled) {
          setHistory([]);
          setSelectedDetail(null);
          setPageError(getErrorMessage(error, 'No fue posible cargar el historial de focalizacion.'));
        }
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    }

    void loadHistory();
    return () => { cancelled = true; };
  }, [canReadCobertura, contratoId, filter]);

  useEffect(() => {
    const selectedLoteId = selectedDetail?.lote.id;
    if (!selectedLoteId) return;
    const loteId = selectedLoteId;

    let cancelled = false;
    async function reloadDetail() {
      setLoadingDetail(true);
      try {
        const detail = await getFocalizacionImportDetail(loteId, { page: 1, limit: 100, filter });
        if (!cancelled) setSelectedDetail(detail);
      } catch (error) {
        if (!cancelled) {
          setPageError(getErrorMessage(error, 'No fue posible actualizar el detalle del lote.'));
        }
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    }

    void reloadDetail();
    return () => { cancelled = true; };
  }, [filter, selectedDetail?.lote.id]);

  const latestRows = selectedDetail?.rows ?? [];

  async function handleUpload(): Promise<void> {
    if (!selectedFile || !contratoId) {
      setPageError('Selecciona un archivo y un contrato antes de continuar.');
      return;
    }

    setUploading(true);
    setPageError('');
    try {
      const result = await uploadHistoricalFocalizacion(selectedFile, contratoId);
      const detail = await getFocalizacionImportDetail(result.lote.id, { page: 1, limit: 100, filter: 'TODOS' });
      setSelectedDetail(detail);
      setFilter('TODOS');
      const historyResponse = await listFocalizacionImportaciones(contratoId);
      setHistory(historyResponse.items);
      setIsUploadOpen(false);
      setSelectedFile(null);
    } catch (error) {
      setPageError(getErrorMessage(error, 'No fue posible procesar el archivo de focalizacion.'));
    } finally {
      setUploading(false);
    }
  }

  async function handleSelectHistory(loteId: number): Promise<void> {
    setLoadingDetail(true);
    setPageError('');
    try {
      const detail = await getFocalizacionImportDetail(loteId, { page: 1, limit: 100, filter });
      setSelectedDetail(detail);
    } catch (error) {
      setPageError(getErrorMessage(error, 'No fue posible cargar el lote seleccionado.'));
    } finally {
      setLoadingDetail(false);
    }
  }


  async function handleReprocessSelected(): Promise<void> {
    if (!selectedDetail) {
      return;
    }

    setReprocessing(true);
    setPageError('');
    try {
      const detail = await reprocessFocalizacionImport(selectedDetail.lote.id);
      if (filter === 'TODOS') {
        setSelectedDetail(detail);
      } else {
        const filteredDetail = await getFocalizacionImportDetail(detail.lote.id, { page: 1, limit: 100, filter });
        setSelectedDetail(filteredDetail);
      }
      if (contratoId) {
        const historyResponse = await listFocalizacionImportaciones(contratoId);
        setHistory(historyResponse.items);
      }
    } catch (error) {
      setPageError(getErrorMessage(error, 'No fue posible reprocesar el lote seleccionado.'));
    } finally {
      setReprocessing(false);
    }
  }

  const kpis = useMemo(() => ([
    { tone: 'primary', icon: Upload, label: 'Filas del lote', value: String(summary.total_filas), caption: selectedDetail ? `Lote #${selectedDetail.lote.id}` : 'Sin lote cargado' },
    { tone: 'success', icon: CheckCircle2, label: 'Procesadas', value: String(summary.procesadas), caption: `${summary.aumentos} aumentos / ${summary.disminuciones} disminuciones` },
    { tone: 'warning', icon: AlertTriangle, label: 'Alertas', value: String(summary.alertas), caption: `${summary.nuevas} nuevas / ${summary.sin_cambio} sin cambio` },
    { tone: 'info', icon: History, label: 'Importaciones', value: String(history.length), caption: contratoSeleccionado ? `Contrato ${contratoSeleccionado.numero_contrato ?? contratoSeleccionado.id}` : 'Selecciona contrato' },
  ]), [summary, history.length, selectedDetail, contratoSeleccionado]);

  return (
    <div className="tool-page">
      <header className="tool-header">
        <div className="tool-header-icon">
          <Building2 size={22} />
        </div>
        <div>
          <span>Herramientas</span>
          <h1>Cobertura</h1>
          <p>Importacion historica de focalizacion y seguimiento de lotes por contrato.</p>
        </div>
      </header>

      <div className="cobertura-kpis">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div className={`cobertura-kpi ${kpi.tone}`} key={kpi.label}>
              <div className="cobertura-kpi-icon"><Icon size={20} /></div>
              <div className="cobertura-kpi-body">
                <span>{kpi.label}</span>
                <strong>{kpi.value}</strong>
                <small>{kpi.caption}</small>
              </div>
            </div>
          );
        })}
      </div>

      <div className="cobertura-toolbar">
        <div className="cobertura-filters">
          <div className="cobertura-select-wrap">
            <select className="cobertura-select" value={empresaId ?? ''} onChange={(event) => setEmpresaActual(event.target.value ? Number(event.target.value) : null)} disabled={!canReadContext}>
              <option value="">Empresa</option>
              {empresasDisponibles.map((empresa) => <option key={empresa.id} value={empresa.id}>{empresa.nombre_empresa}</option>)}
            </select>
            <ChevronDown size={14} />
          </div>
          <div className="cobertura-select-wrap">
            <select className="cobertura-select" value={contratoId ?? ''} onChange={(event) => setContratoId(event.target.value ? Number(event.target.value) : null)} disabled={!empresaId || !canReadContext}>
              <option value="">Contrato</option>
              {contratos.map((contrato) => <option key={contrato.id} value={contrato.id}>{contrato.numero_contrato ?? `Contrato ${contrato.id}`}</option>)}
            </select>
            <ChevronDown size={14} />
          </div>
          <div className="cobertura-select-wrap">
            <select className="cobertura-select" value={filter} onChange={(event) => setFilter(event.target.value)} disabled={!selectedDetail}>
              {RESULT_FILTERS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <ChevronDown size={14} />
          </div>
        </div>

        <div className="cobertura-actions">
          <button type="button" className="cobertura-action" onClick={() => void downloadFocalizacionTemplate()}>
            <Download size={16} /> Plantilla oficial
          </button>
          <button type="button" className="cobertura-action primary" disabled={!contratoId || !canUpdateCobertura} onClick={() => setIsUploadOpen(true)}>
            <Upload size={16} /> Actualizar focalizacion
          </button>
        </div>
      </div>

      {pageError ? <div className="op-import-alert error"><AlertTriangle size={16} /> {pageError}</div> : null}

      <section className="tool-card">
        <div className="tool-card-title">
          <FileSpreadsheet size={18} />
          <h2>Resultado del lote</h2>
        </div>

        {!selectedDetail ? (
          <div className="op-import-empty-card">Selecciona un contrato y carga un archivo para ver el detalle del lote procesado.</div>
        ) : (
          <>
            <div className="cobertura-toolbar" style={{ padding: 0, border: 'none', boxShadow: 'none', background: 'transparent' }}>
              <div>
                <strong>{selectedDetail.lote.nombre_archivo}</strong>
                <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)' }}>
                  Vigencia: {formatDate(selectedDetail.lote.fecha_inicio_vigencia)} a {formatDate(selectedDetail.lote.fecha_fin_vigencia)}
                  {' Ã‚Â· '}Importado {formatDateTime(selectedDetail.lote.fecha_importacion)}
                </p>
              </div>
              <div className="cobertura-actions">
                <button type="button" className="cobertura-action" disabled={reprocessing || !canUpdateCobertura} onClick={() => void handleReprocessSelected()}>
                  {reprocessing ? <RefreshCw size={16} className="is-spinning" /> : <RefreshCw size={16} />} Reprocesar pendientes
                </button>
                <button type="button" className="cobertura-action" onClick={() => void downloadFocalizacionReport(selectedDetail.lote.id)}>
                  <Download size={16} /> Descargar resultado
                </button>
              </div>
            </div>

            <div className="cobertura-table-scroll">
              <div className="cobertura-table-head" style={{ gridTemplateColumns: '80px 160px 1.4fr 1.3fr 140px 120px 140px 1.5fr', minWidth: 1240 }}>
                <span>Fila</span>
                <span>Municipio</span>
                <span>Institucion</span>
                <span>Sede</span>
                <span>Modalidad</span>
                <span>Focalizacion</span>
                <span>Estado</span>
                <span>Mensaje</span>
              </div>

              {loadingDetail ? (
                <div className="op-import-empty-card">Cargando detalle del lote...</div>
              ) : latestRows.length === 0 ? (
                <div className="op-import-empty-card">No hay filas para este filtro.</div>
              ) : latestRows.map((row) => (
                <div className="cobertura-table-row" key={row.id} style={{ gridTemplateColumns: '80px 160px 1.4fr 1.3fr 140px 120px 140px 1.5fr', minWidth: 1240 }}>
                  <strong>{row.fila}</strong>
                  <span>{row.municipio ?? 'Sin municipio'}</span>
                  <span>{row.institucion}</span>
                  <span>{row.sede}</span>
                  <span>{row.modalidad}</span>
                  <span>{row.focalizacion_total}</span>
                  <span className={`cobertura-status ${estadoTone(row.estado)}`}>{row.estado}</span>
                  <span>{row.mensaje}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="tool-card">
        <div className="tool-card-title">
          <History size={18} />
          <h2>Historial de importaciones</h2>
        </div>

        {!contratoId ? (
          <div className="op-import-empty-card">Selecciona un contrato para ver su historial de focalizacion.</div>
        ) : loadingHistory ? (
          <div className="op-import-empty-card">Cargando historial...</div>
        ) : history.length === 0 ? (
          <div className="op-import-empty-card">Este contrato todavia no tiene importaciones de focalizacion.</div>
        ) : (
          <div className="cobertura-table-scroll">
            <div className="historial-cargas-head">
              <span>Fecha</span>
              <span>Archivo</span>
              <span>Vigencia</span>
              <span>Filas</span>
              <span>Estado</span>
            </div>
            {history.map((item) => (
              <button type="button" className="historial-cargas-row" key={item.id} onClick={() => void handleSelectHistory(item.id)} style={{ background: 'transparent', width: '100%', textAlign: 'left' }}>
                <span>{formatDateTime(item.fecha_importacion)}</span>
                <span className="archivo-cell"><FileSpreadsheet size={15} />{item.nombre_archivo}</span>
                <span>{formatDate(item.fecha_inicio_vigencia)} a {formatDate(item.fecha_fin_vigencia)}</span>
                <span>{item.total_filas}</span>
                <span className={`historial-cargas-badge ${estadoTone(item.estado)}`}>
                  {item.estado === 'PROCESADO' ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                  {item.estado}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {isUploadOpen && (
        <div className="cobertura-modal-overlay" onClick={() => setIsUploadOpen(false)}>
          <div className="cobertura-modal" onClick={(event) => event.stopPropagation()}>
            <div className="cobertura-modal-header">
              <div>
                <h3>Actualizar focalizacion</h3>
                <p>
                  Importando a: <strong>{empresaActual?.nombre_empresa ?? 'Sin empresa'}</strong>
                  {' / '}<strong>{contratoSeleccionado?.numero_contrato ?? 'Sin contrato'}</strong>
                </p>
              </div>
              <button type="button" className="cobertura-modal-close" onClick={() => setIsUploadOpen(false)} aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>

            <div className="cobertura-modal-body" style={{ alignItems: 'stretch' }}>
              <label className="op-import-file-picker" style={{ justifyContent: 'center' }}>
                <FileSpreadsheet size={15} />
                <span>{selectedFile?.name ?? 'Seleccionar archivo Excel'}</span>
                <input type="file" accept=".xlsx,.xls" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} />
              </label>
              <button type="button" className="op-button primary" disabled={!selectedFile || !contratoId || uploading} onClick={() => void handleUpload()}>
                {uploading ? <RefreshCw size={15} className="is-spinning" /> : <Upload size={15} />} Procesar archivo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
