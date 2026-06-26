import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle, FileText, Trash2, Upload, X } from 'lucide-react';
import { MOCK_CONTRATOS_REPO, MOCK_EMPRESAS_REPO, MOCK_MUNICIPIOS_REPO } from './repositorio.mock';
import { TIPOS_DOCUMENTALES } from './repositorio.types';
import { getPersonas, buildNombreCompleto } from '../../services/personasApi';
import type { PersonaApi } from '../../types/personas.types';
import './repositorio.css';

interface QueueFile {
  id: number;
  file: File;
  tipoDocumento: string;
  persona_id: number;
  fechaVencimiento: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
}

function fmt(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function SubirDocumentosPage() {
  const inputRef              = useRef<HTMLInputElement>(null);
  const [drag, setDrag]       = useState(false);
  const [queue, setQueue]     = useState<QueueFile[]>([]);
  const [persona, setPersona] = useState('');
  const [tipo, setTipo]       = useState('');
  const [empresa, setEmpresa] = useState('');
  const [contrato, setContrato] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [vencimiento, setVenc] = useState('');
  const [success, setSuccess] = useState(false);
  const [err, setErr]         = useState('');

  // Real personas from API
  const [personas, setPersonas]           = useState<PersonaApi[]>([]);
  const [personasLoading, setPersonasLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setPersonasLoading(true);
      try {
        const res = await getPersonas({ limit: 100 });
        if (!cancelled) setPersonas(res.items);
      } catch {
        // Non-critical: upload still works if persona list fails
      } finally {
        if (!cancelled) setPersonasLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    Array.from(files).forEach(file => {
      if (!allowed.includes(file.type)) return;
      setQueue(prev => [...prev, {
        id: Date.now() + Math.random(),
        file,
        tipoDocumento: tipo || '',
        persona_id: Number(persona) || 0,
        fechaVencimiento: vencimiento,
        status: 'pending',
      }]);
    });
  }

  function removeFromQueue(id: number) {
    setQueue(prev => prev.filter(q => q.id !== id));
  }

  function updateQueueItem(id: number, field: keyof QueueFile, value: string | number) {
    setQueue(prev => prev.map(q => q.id === id ? { ...q, [field]: value } : q));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDrag(false);
    addFiles(e.dataTransfer.files);
  }

  function handleUpload() {
    if (queue.length === 0) { setErr('Agrega al menos un archivo'); return; }
    const invalid = queue.filter(q => !q.persona_id || !q.tipoDocumento);
    if (invalid.length > 0) { setErr(`${invalid.length} archivo(s) sin persona o tipo de documento asignados`); return; }
    setErr('');
    setQueue(prev => prev.map(q => ({ ...q, status: 'uploading' })));
    setTimeout(() => {
      setQueue(prev => prev.map(q => ({ ...q, status: 'done' })));
      setSuccess(true);
    }, 1200);
  }

  void empresa;
  void contrato;
  void municipio;

  return (
    <div className="rep-upload-page">

      <div className="rep-page-header">
        <div>
          <h2 className="rep-page-title"><Upload size={20} /> Cargar documentos</h2>
          <p className="rep-page-sub">Sube nuevos documentos al repositorio — PDF, JPG o PNG, máx. 20 MB por archivo</p>
        </div>
      </div>

      {success && (
        <div style={{ background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <CheckCircle size={16} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-success)' }}>Carga exitosa</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{queue.length} documento(s) cargados correctamente</div>
          </div>
          <button style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => { setSuccess(false); setQueue([]); }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Presets row */}
      <div className="rep-upload-form" style={{ marginTop: 0, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Configuración por defecto para los archivos</div>
        <div className="rep-upload-grid">
          <div className="rep-upload-field">
            <label className="rep-upload-label">Persona</label>
            <select className="rep-upload-select" value={persona} onChange={e => setPersona(e.target.value)}
              disabled={personasLoading}>
              <option value="">{personasLoading ? 'Cargando personas…' : '— Seleccionar —'}</option>
              {personas.map(p => (
                <option key={p.id} value={p.id}>{buildNombreCompleto(p)}</option>
              ))}
            </select>
          </div>
          <div className="rep-upload-field">
            <label className="rep-upload-label">Tipo de documento</label>
            <select className="rep-upload-select" value={tipo} onChange={e => setTipo(e.target.value)}>
              <option value="">— Seleccionar —</option>
              {TIPOS_DOCUMENTALES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="rep-upload-field">
            <label className="rep-upload-label">Empresa</label>
            <select className="rep-upload-select" value={empresa} onChange={e => setEmpresa(e.target.value)}>
              <option value="">Todas</option>
              {MOCK_EMPRESAS_REPO.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div className="rep-upload-field">
            <label className="rep-upload-label">Contrato</label>
            <select className="rep-upload-select" value={contrato} onChange={e => setContrato(e.target.value)}>
              <option value="">Todos</option>
              {MOCK_CONTRATOS_REPO.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="rep-upload-field">
            <label className="rep-upload-label">Municipio</label>
            <select className="rep-upload-select" value={municipio} onChange={e => setMunicipio(e.target.value)}>
              <option value="">Todos</option>
              {MOCK_MUNICIPIOS_REPO.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="rep-upload-field">
            <label className="rep-upload-label">Fecha de vencimiento</label>
            <input className="rep-upload-input" type="date" value={vencimiento} onChange={e => setVenc(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Drop zone */}
      <div
        className={`rep-upload-zone${drag ? ' drag' : ''}`}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={40} />
        <h4 className="rep-upload-title">Arrastra archivos aquí o haz clic para seleccionar</h4>
        <p className="rep-upload-sub">PDF, JPG, PNG · Máx. 20 MB por archivo · Múltiples archivos permitidos</p>
        <input ref={inputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp"
          style={{ display: 'none' }} onChange={e => addFiles(e.target.files)} />
      </div>

      {/* Queue */}
      {queue.length > 0 && (
        <div className="rep-upload-form">
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
            Cola de carga ({queue.length} archivo{queue.length !== 1 ? 's' : ''})
          </div>
          <div className="rep-upload-queue">
            {queue.map(q => (
              <div key={q.id} className="rep-queue-item">
                <FileText size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                <span className="rep-queue-item-name">{q.file.name}</span>
                <span className="rep-queue-item-size">{fmt(q.file.size)}</span>

                <select style={{ height: 28, padding: '0 6px', border: '1px solid var(--border-color)', borderRadius: 6, fontSize: 11, background: 'var(--bg)', color: 'var(--text-primary)' }}
                  value={q.persona_id || ''} onChange={e => updateQueueItem(q.id, 'persona_id', Number(e.target.value))}>
                  <option value="">Persona</option>
                  {personas.map(p => <option key={p.id} value={p.id}>{buildNombreCompleto(p)}</option>)}
                </select>

                <select style={{ height: 28, padding: '0 6px', border: '1px solid var(--border-color)', borderRadius: 6, fontSize: 11, background: 'var(--bg)', color: 'var(--text-primary)' }}
                  value={q.tipoDocumento} onChange={e => updateQueueItem(q.id, 'tipoDocumento', e.target.value)}>
                  <option value="">Tipo doc.</option>
                  {TIPOS_DOCUMENTALES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>

                {q.status === 'done'      && <CheckCircle size={14} style={{ color: 'var(--color-success)', flexShrink: 0 }} />}
                {q.status === 'uploading' && <span style={{ fontSize: 11, color: 'var(--color-primary)' }}>Cargando…</span>}
                {q.status === 'pending'   && (
                  <button className="rep-btn ghost sm" onClick={() => removeFromQueue(q.id)}>
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {err && (
            <div style={{ background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.25)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--color-warning)', display: 'flex', gap: 6, alignItems: 'center' }}>
              <AlertTriangle size={13} /> {err}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="rep-btn secondary" onClick={() => setQueue([])}>Limpiar cola</button>
            <button className="rep-btn primary" onClick={handleUpload} disabled={success}>
              <Upload size={13} /> Cargar {queue.length} archivo{queue.length !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
