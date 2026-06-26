import { useCallback, useState } from 'react';
import { Download, FileText, History, Loader2, X } from 'lucide-react';
import type { RepositorioDocumentoApi, RepositorioDocumentosVersionesApi } from '../../types/repositorio.types';
import { buildNombrePersonaRepo } from '../../types/repositorio.types';
import { getRepositorioDownloadUrl, getRepositorioVersiones } from '../../services/repositorioApi';

interface Props {
  doc: RepositorioDocumentoApi;
  onClose: () => void;
}

const ESTADO_LABEL: Record<string, string> = {
  vigente:         'Vigente',
  vencido:         'Vencido',
  reemplazado:     'Reemplazado',
  sin_vencimiento: 'Sin vencimiento',
};

const ORIGEN_LABEL: Record<string, string> = {
  persona:    'Persona',
  vinculacion: 'Vinculación',
  generado:   'Generado',
};

function fmt(fecha: string | null | undefined): string {
  if (!fecha) return '—';
  const [y, m, d] = fecha.split('-');
  return `${d ?? '?'}/${m ?? '?'}/${y ?? '?'}`;
}

function fmtBytes(n: number | null): string {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1_048_576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1_048_576).toFixed(1)} MB`;
}

export function DocumentViewer({ doc, onClose }: Props) {
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [versiones, setVersiones] = useState<RepositorioDocumentosVersionesApi | null>(null);
  const [versionesLoading, setVersionesLoading] = useState(false);
  const [versionesError, setVersionesError] = useState<string | null>(null);
  const [showVersiones, setShowVersiones] = useState(false);

  const personaNombre = buildNombrePersonaRepo(doc.persona);
  const estado = doc.estado_documental;

  const handleDownload = useCallback(async () => {
    setDownloadLoading(true);
    try {
      const result = await getRepositorioDownloadUrl(doc.origen, doc.documento_id);
      window.open(result.signed_url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al generar URL de descarga');
    } finally {
      setDownloadLoading(false);
    }
  }, [doc.origen, doc.documento_id]);

  const handleLoadVersiones = useCallback(async () => {
    if (versiones) { setShowVersiones(v => !v); return; }
    setShowVersiones(true);
    setVersionesLoading(true);
    setVersionesError(null);
    try {
      const data = await getRepositorioVersiones(doc.origen, doc.documento_id);
      setVersiones(data);
    } catch (e) {
      setVersionesError(e instanceof Error ? e.message : 'Error al cargar versiones');
    } finally {
      setVersionesLoading(false);
    }
  }, [versiones, doc.origen, doc.documento_id]);

  return (
    <div className="rep-viewer-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rep-viewer-modal">

        <div className="rep-viewer-header">
          <h3 className="rep-viewer-title">{doc.nombre_tipo_documento ?? `Documento #${doc.documento_id}`}</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="rep-btn secondary sm"
              onClick={() => { void handleDownload(); }}
              disabled={downloadLoading}
            >
              {downloadLoading ? <Loader2 size={12} /> : <Download size={12} />}
              {downloadLoading ? 'Generando…' : 'Descargar'}
            </button>
            <button className="rep-btn ghost sm" onClick={onClose}><X size={14} /></button>
          </div>
        </div>

        <div className="rep-viewer-body">
          {/* Sidebar — metadata */}
          <aside className="rep-viewer-sidebar">
            <div className="rep-viewer-field">
              <span className="rep-viewer-field-label">Persona</span>
              <span className="rep-viewer-field-val">{personaNombre}</span>
            </div>
            {doc.persona?.numero_documento && (
              <div className="rep-viewer-field">
                <span className="rep-viewer-field-label">Documento identidad</span>
                <span className="rep-viewer-field-val" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                  {doc.persona.numero_documento}
                </span>
              </div>
            )}
            {doc.empresa?.nombre_empresa && (
              <div className="rep-viewer-field">
                <span className="rep-viewer-field-label">Empresa</span>
                <span className="rep-viewer-field-val">{doc.empresa.nombre_empresa}</span>
              </div>
            )}
            {doc.contrato?.numero_contrato && (
              <div className="rep-viewer-field">
                <span className="rep-viewer-field-label">Contrato</span>
                <span className="rep-viewer-field-val" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                  {doc.contrato.numero_contrato}
                </span>
              </div>
            )}
            <div className="rep-viewer-field">
              <span className="rep-viewer-field-label">Estado</span>
              <span className={`rep-badge ${estado}`} style={{ width: 'fit-content' }}>
                {ESTADO_LABEL[estado] ?? estado}
              </span>
            </div>
            <div className="rep-viewer-field">
              <span className="rep-viewer-field-label">Origen</span>
              <span className={`rep-origin-badge ${doc.origen}`}>{ORIGEN_LABEL[doc.origen] ?? doc.origen}</span>
            </div>
            <div className="rep-viewer-field">
              <span className="rep-viewer-field-label">Versión</span>
              <span className="rep-viewer-field-val">v{doc.version ?? 1}</span>
            </div>
            {doc.fecha_expedicion && (
              <div className="rep-viewer-field">
                <span className="rep-viewer-field-label">Fecha expedición</span>
                <span className="rep-viewer-field-val">{fmt(doc.fecha_expedicion)}</span>
              </div>
            )}
            {doc.fecha_vencimiento && (
              <div className="rep-viewer-field">
                <span className="rep-viewer-field-label">Vencimiento</span>
                <span className="rep-viewer-field-val" style={{
                  color: estado === 'vencido' ? 'var(--color-danger)' : estado === 'reemplazado' ? 'var(--text-secondary)' : undefined,
                }}>
                  {fmt(doc.fecha_vencimiento)}
                </span>
              </div>
            )}
            <div className="rep-viewer-field">
              <span className="rep-viewer-field-label">Fecha de carga</span>
              <span className="rep-viewer-field-val">{fmt(doc.fecha_carga)}</span>
            </div>
            {doc.tamano_bytes !== null && (
              <div className="rep-viewer-field">
                <span className="rep-viewer-field-label">Tamaño</span>
                <span className="rep-viewer-field-val">{fmtBytes(doc.tamano_bytes)}</span>
              </div>
            )}
          </aside>

          {/* Preview panel */}
          <div className="rep-viewer-preview">
            <FileText size={72} className="rep-viewer-preview-icon" />
            <span className="rep-viewer-preview-lbl">Vista previa no disponible</span>
            <span className="rep-viewer-preview-fname">{doc.nombre_archivo ?? '—'}</span>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 260, margin: 0 }}>
              Haz clic en "Descargar" para abrir el documento en una nueva pestaña.
            </p>
            <button
              className="rep-btn secondary sm"
              onClick={() => { void handleDownload(); }}
              disabled={downloadLoading}
            >
              {downloadLoading ? <Loader2 size={12} /> : <Download size={12} />}
              {downloadLoading ? 'Generando URL…' : 'Abrir documento'}
            </button>
          </div>
        </div>

        {/* Versiones panel */}
        {showVersiones && (
          <div style={{
            borderTop: '1px solid var(--border-color)',
            padding: '14px 20px',
            background: 'var(--bg)',
            maxHeight: 220,
            overflowY: 'auto',
          }}>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.4px' }}>
              Historial de versiones
            </div>
            {versionesLoading && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Cargando versiones…</div>
            )}
            {versionesError && (
              <div style={{ fontSize: 12, color: 'var(--color-danger)' }}>{versionesError}</div>
            )}
            {versiones && !versionesLoading && (
              <>
                {versiones.note && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>{versiones.note}</div>
                )}
                {versiones.versiones.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sin versiones anteriores registradas</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-muted)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>Versión</th>
                        <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-muted)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>Fecha carga</th>
                        <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-muted)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>Estado</th>
                        <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-muted)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>Vigente</th>
                      </tr>
                    </thead>
                    <tbody>
                      {versiones.versiones.map(v => (
                        <tr key={v.documento_id} style={{ borderTop: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '5px 8px', fontFamily: 'monospace' }}>v{v.version ?? '?'}</td>
                          <td style={{ padding: '5px 8px', color: 'var(--text-secondary)' }}>{fmt(v.fecha_carga)}</td>
                          <td style={{ padding: '5px 8px' }}>
                            <span className={`rep-badge ${v.estado_documental}`}>{ESTADO_LABEL[v.estado_documental] ?? v.estado_documental}</span>
                          </td>
                          <td style={{ padding: '5px 8px', color: v.es_vigente ? '#16a34a' : 'var(--text-muted)' }}>
                            {v.es_vigente ? 'Sí' : 'No'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>
        )}

        <div className="rep-viewer-footer">
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {[doc.empresa?.nombre_empresa, doc.contrato?.numero_contrato].filter(Boolean).join(' · ')}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="rep-btn ghost sm"
              onClick={() => { void handleLoadVersiones(); }}
              disabled={versionesLoading}
            >
              {versionesLoading ? <Loader2 size={11} /> : <History size={11} />}
              {showVersiones ? 'Ocultar versiones' : 'Ver historial de versiones'}
            </button>
            <button className="rep-btn secondary sm" onClick={onClose}>Cerrar</button>
          </div>
        </div>

      </div>
    </div>
  );
}
