import { useState } from 'react';
import { Package, X } from 'lucide-react';
import type { TipoPaquete } from './repositorio.types';
import { TIPO_PAQUETE_LABEL, TIPOS_DOCUMENTALES } from './repositorio.types';

interface Props {
  onClose: () => void;
  onSave: (nombre: string, tipo: TipoPaquete, requisitos: string[]) => void;
}

const TIPOS_PAQUETE_LIST: TipoPaquete[] = ['interventoria','licitacion','auditoria','contratacion','sst','nomina','personalizado'];

const REQUISITOS_POR_TIPO: Record<TipoPaquete, string[]> = {
  interventoria: ['Cédula de Ciudadanía','Hoja de Vida','Afiliación ARL','Certificado Antecedentes','Curso Manipulación Alimentos','Examen Médico de Ingreso'],
  licitacion:    ['Cédula de Ciudadanía','Hoja de Vida','Afiliación ARL','Certificado Antecedentes','Curso Manipulación Alimentos','Examen Médico de Ingreso','Título Profesional'],
  auditoria:     ['Cédula de Ciudadanía','Hoja de Vida','Contrato de Trabajo','Certificado Antecedentes','Evaluación de Desempeño'],
  contratacion:  ['Cédula de Ciudadanía','Hoja de Vida','Certificación Bancaria','Contrato de Trabajo'],
  sst:           ['Afiliación ARL','Afiliación EPS','Examen Médico de Ingreso','Inducción Empresarial','Dotación y EPP'],
  nomina:        ['Afiliación EPS','Certificación Bancaria','Contrato de Trabajo'],
  personalizado: [],
};

export function PaqueteBuilder({ onClose, onSave }: Props) {
  const [nombre, setNombre]       = useState('');
  const [tipo, setTipo]           = useState<TipoPaquete>('interventoria');
  const [descripcion, setDesc]    = useState('');
  const [requisitos, setReqs]     = useState<string[]>(REQUISITOS_POR_TIPO.interventoria);
  const [err, setErr]             = useState('');

  function handleTipoChange(t: TipoPaquete) {
    setTipo(t);
    setReqs([...REQUISITOS_POR_TIPO[t]]);
  }

  function toggleReq(r: string) {
    setReqs(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  }

  function handleSave() {
    if (!nombre.trim()) { setErr('El nombre del paquete es obligatorio'); return; }
    if (requisitos.length === 0) { setErr('Selecciona al menos un requisito'); return; }
    onSave(nombre.trim(), tipo, requisitos);
    onClose();
  }

  return (
    <div className="rep-paq-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rep-paq-modal">

        <div className="rep-paq-header">
          <h3 className="rep-paq-title"><Package size={16} style={{ marginRight: 6 }} />Nuevo paquete documental</h3>
          <button className="rep-btn ghost sm" onClick={onClose}><X size={14} /></button>
        </div>

        <div className="rep-paq-body">
          <div className="rep-paq-field">
            <label className="rep-paq-label">Nombre del paquete *</label>
            <input className="rep-paq-input" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Interventoría ALI-2024-001 – Julio 2026" />
          </div>

          <div className="rep-paq-field">
            <label className="rep-paq-label">Tipo de paquete</label>
            <select className="rep-paq-select" value={tipo} onChange={e => handleTipoChange(e.target.value as TipoPaquete)}>
              {TIPOS_PAQUETE_LIST.map(t => (
                <option key={t} value={t}>{TIPO_PAQUETE_LABEL[t]}</option>
              ))}
            </select>
          </div>

          <div className="rep-paq-field">
            <label className="rep-paq-label">Descripción</label>
            <textarea className="rep-paq-textarea" value={descripcion} onChange={e => setDesc(e.target.value)} placeholder="Descripción opcional del propósito de este paquete…" rows={2} />
          </div>

          <div className="rep-paq-field">
            <label className="rep-paq-label">
              Requisitos incluidos
              <span style={{ marginLeft: 6, fontStyle: 'normal', color: 'var(--text-muted)', textTransform: 'none', fontSize: 11 }}>
                ({requisitos.length} seleccionados)
              </span>
            </label>
            <div className="rep-paq-req-grid">
              {TIPOS_DOCUMENTALES.map(r => (
                <label key={r} className={`rep-paq-req-item ${requisitos.includes(r) ? 'selected' : ''}`} onClick={() => toggleReq(r)}>
                  <input type="checkbox" readOnly checked={requisitos.includes(r)} />
                  {r}
                </label>
              ))}
            </div>
          </div>

          {err && (
            <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--color-danger)' }}>
              {err}
            </div>
          )}
        </div>

        <div className="rep-paq-footer">
          <button className="rep-btn secondary" onClick={onClose}>Cancelar</button>
          <button className="rep-btn primary" onClick={handleSave}><Package size={12} /> Crear paquete</button>
        </div>

      </div>
    </div>
  );
}
