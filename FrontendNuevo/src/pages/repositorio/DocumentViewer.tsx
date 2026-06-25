import { Download, ExternalLink, FileText, X } from 'lucide-react';
import type { DocumentoRepositorio, PersonaRepositorio } from './repositorio.types';
import { ORIGEN_LABEL } from './repositorio.types';

interface Props {
  doc: DocumentoRepositorio;
  persona: PersonaRepositorio;
  onClose: () => void;
}

const ESTADO_LABEL: Record<DocumentoRepositorio['estado'], string> = {
  vigente:    'Vigente',
  vencido:    'Vencido',
  por_vencer: 'Por vencer',
  pendiente:  'Pendiente',
};

export function DocumentViewer({ doc, persona, onClose }: Props) {
  return (
    <div className="rep-viewer-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rep-viewer-modal">

        <div className="rep-viewer-header">
          <h3 className="rep-viewer-title">{doc.tipo_documento}</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="rep-btn secondary sm"><Download size={12} /> Descargar</button>
            <button className="rep-btn ghost sm" onClick={onClose}><X size={14} /></button>
          </div>
        </div>

        <div className="rep-viewer-body">
          {/* Sidebar — metadata */}
          <aside className="rep-viewer-sidebar">
            <div className="rep-viewer-field">
              <span className="rep-viewer-field-label">Persona</span>
              <span className="rep-viewer-field-val">{persona.nombre_completo}</span>
            </div>
            <div className="rep-viewer-field">
              <span className="rep-viewer-field-label">Documento</span>
              <span className="rep-viewer-field-val" style={{ fontFamily: 'monospace', fontSize: 12 }}>{persona.numero_documento}</span>
            </div>
            <div className="rep-viewer-field">
              <span className="rep-viewer-field-label">Cargo</span>
              <span className="rep-viewer-field-val">{persona.cargo}</span>
            </div>
            <div className="rep-viewer-field">
              <span className="rep-viewer-field-label">Estado</span>
              <span className={`rep-badge ${doc.estado}`} style={{ width: 'fit-content' }}>
                {ESTADO_LABEL[doc.estado]}
              </span>
            </div>
            <div className="rep-viewer-field">
              <span className="rep-viewer-field-label">Origen</span>
              <span className={`rep-origin-badge ${doc.origen}`}>{ORIGEN_LABEL[doc.origen]}</span>
            </div>
            <div className="rep-viewer-field">
              <span className="rep-viewer-field-label">Versión</span>
              <span className="rep-viewer-field-val">v{doc.version}</span>
            </div>
            {doc.fecha_expedicion && (
              <div className="rep-viewer-field">
                <span className="rep-viewer-field-label">Fecha expedición</span>
                <span className="rep-viewer-field-val">{doc.fecha_expedicion}</span>
              </div>
            )}
            {doc.fecha_vencimiento && (
              <div className="rep-viewer-field">
                <span className="rep-viewer-field-label">Vencimiento</span>
                <span className="rep-viewer-field-val" style={{ color: doc.estado === 'vencido' ? 'var(--color-danger)' : doc.estado === 'por_vencer' ? 'var(--color-warning)' : undefined }}>
                  {doc.fecha_vencimiento}
                  {doc.dias_para_vencer !== undefined && (
                    <span style={{ fontSize: 10, display: 'block', color: 'var(--text-muted)' }}>
                      Vence en {doc.dias_para_vencer} días
                    </span>
                  )}
                </span>
              </div>
            )}
            <div className="rep-viewer-field">
              <span className="rep-viewer-field-label">Fecha de carga</span>
              <span className="rep-viewer-field-val">{doc.fecha_carga}</span>
            </div>
            <div className="rep-viewer-field">
              <span className="rep-viewer-field-label">Última actualización</span>
              <span className="rep-viewer-field-val">{doc.ultima_actualizacion}</span>
            </div>
            <div className="rep-viewer-field">
              <span className="rep-viewer-field-label">Aplica para</span>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
                {doc.aplica_interventoria && <span className="rep-origin-badge sst">Interv.</span>}
                {doc.aplica_licitacion    && <span className="rep-origin-badge portal">Licit.</span>}
                {doc.aplica_auditoria     && <span className="rep-origin-badge expediente">Audit.</span>}
                {doc.aplica_sst           && <span className="rep-origin-badge vinculacion">SST</span>}
                {doc.aplica_nomina        && <span className="rep-origin-badge nomina">Nómina</span>}
              </div>
            </div>
            {doc.observaciones && (
              <div className="rep-viewer-field">
                <span className="rep-viewer-field-label">Observaciones</span>
                <span className="rep-viewer-field-val" style={{ fontSize: 12 }}>{doc.observaciones}</span>
              </div>
            )}
          </aside>

          {/* Preview panel */}
          <div className="rep-viewer-preview">
            {doc.estado === 'pendiente' ? (
              <>
                <FileText size={56} className="rep-viewer-preview-icon" />
                <span className="rep-viewer-preview-lbl">Documento no cargado</span>
                <span className="rep-viewer-preview-fname">Este documento está pendiente de carga.</span>
                <button className="rep-btn primary sm">
                  <ExternalLink size={12} /> Cargar ahora
                </button>
              </>
            ) : (
              <>
                <FileText size={72} className="rep-viewer-preview-icon" />
                <span className="rep-viewer-preview-lbl">Vista previa no disponible</span>
                <span className="rep-viewer-preview-fname">{doc.nombre_archivo}</span>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 260, margin: 0 }}>
                  En producción, aquí se mostrará el visor PDF/imagen integrado.
                </p>
                <button className="rep-btn secondary sm"><Download size={12} /> Descargar archivo</button>
              </>
            )}
          </div>
        </div>

        <div className="rep-viewer-footer">
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {persona.empresa} · {persona.contrato} · {persona.municipio}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="rep-btn ghost sm">Ver historial de versiones</button>
            <button className="rep-btn secondary sm" onClick={onClose}>Cerrar</button>
          </div>
        </div>

      </div>
    </div>
  );
}
