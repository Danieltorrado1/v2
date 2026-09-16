import { useEffect, useState, useSyncExternalStore } from 'react';
import type { FormEvent } from 'react';
import { agendaApi } from '../../../services/agendaApi';
import { allowFollowupDiscard, followupDraftIsDirty, FollowupFormState, manualFollowupTypes } from '../agendaFollowup.domain';
import type { FollowupPayload } from '../agendaFollowup.domain';

type Task = { id: number; titulo: string; fecha_proxima_seguimiento?: string | null; requiere_seguimiento?: boolean };
export default function AgendaTaskFollowupForm({ task, onSaved, onCancel, onClose, onDirtyChange, onSavingChange }: {
  task: Task;
  onSaved: (followup: any, payload: FollowupPayload) => void;
  onCancel: () => void;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onSavingChange: (saving: boolean) => void;
}) {
  const [form] = useState(() => new FollowupFormState({ tipo: 'COMENTARIO', comentario: '', fecha: task.fecha_proxima_seguimiento?.slice(0, 10) ?? '', requiere: task.requiere_seguimiento ?? false }));
  const { draft, saving, saved, error } = useSyncExternalStore(form.subscribe, form.getSnapshot, form.getSnapshot);
  const dirty = !saved && followupDraftIsDirty(draft, form.initial);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const pending = form.save(payload => agendaApi.followup(task.id, payload));
    onSavingChange(form.getSnapshot().saving);
    const response = await pending;
    // A second click must not clear the parent's lock while the first request runs.
    onSavingChange(form.getSnapshot().saving);
    if (response) {
      onDirtyChange(false);
      const value = response.result as any;
      onSaved(value?.data?.data ?? value?.data ?? value, response.payload);
    }
  };
  const cancel = () => {
    if (!allowFollowupDiscard(dirty, form.getSnapshot().saving, message => window.confirm(message))) return;
    onDirtyChange(false);
    onCancel();
  };
  return <form className="agenda-drawer agenda-action-form" onSubmit={submit}>
    <div className="agenda-action-form-header"><h2>Agregar seguimiento</h2><button type="button" onClick={onClose} disabled={saving || saved}>Cerrar</button></div>
    <p>Tarea: <strong>{task.titulo}</strong></p>
    <label>Tipo de seguimiento<select value={draft.tipo} onChange={event => form.change({ tipo: event.target.value })} disabled={saving || saved}>{manualFollowupTypes.map(tipo => <option key={tipo} value={tipo}>{tipo === 'COMENTARIO' ? 'Comentario' : 'Evidencia (descripción textual)'}</option>)}</select></label>
    <label>Comentario obligatorio<textarea value={draft.comentario} onChange={event => form.change({ comentario: event.target.value })} required maxLength={5000} disabled={saving || saved}/></label>
    <label>Próxima fecha de seguimiento (opcional)<input type="date" value={draft.fecha} onChange={event => form.change({ fecha: event.target.value })} disabled={saving || saved}/></label>
    <label><input type="checkbox" checked={draft.requiere} onChange={event => form.change({ requiere: event.target.checked })} disabled={saving || saved}/>Requiere una nueva actuación</label>
    {error && <div className="agenda-error" role="alert">{error}<button type="submit" disabled={saving || saved}>Reintentar</button></div>}
    <div className="agenda-actions"><button type="button" onClick={cancel} disabled={saving || saved}>Cancelar</button><button type="submit" className="agenda-primary" disabled={saving || saved}>{saving ? 'Guardando…' : 'Guardar'}</button></div>
  </form>;
}
