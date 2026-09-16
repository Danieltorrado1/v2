import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiClientError } from '../../../services/apiClient';
import { agendaApi } from '../../../services/agendaApi';
import { buildCancelPayload } from '../agendaOperativa.domain';

type Task = { id: number; titulo: string; estado: string; version?: number };

function errorMessage(error: unknown) {
  if (!(error instanceof ApiClientError)) return error instanceof Error ? `${error.message} Puedes reintentar sin perder el motivo.` : 'No fue posible cancelar la tarea. Puedes reintentar.';
  if (error.status === 429) return 'Hay demasiadas solicitudes. Espera un momento y vuelve a intentar; el motivo se conserva.';
  if (error.status === 400) return error.message || 'El motivo de cancelación no es válido.';
  if (error.status === 403) return 'No tienes permiso para cancelar esta tarea.';
  if (error.status === 404) return 'La tarea ya no está disponible. El motivo se conserva.';
  if (error.status === 409) return error.message || 'La tarea cambió de estado y ya no se puede cancelar.';
  if (error.status >= 500) return 'El servidor no pudo cancelar la tarea. El motivo se conserva.';
  return `${error.message} El motivo se conserva.`;
}

export default function AgendaTaskCancelForm({ task, onSaved, onCancel, onClose, onDirtyChange }: {
  task: Task;
  onSaved: (task: Record<string, any>) => void;
  onCancel: () => void;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const savingRef = useRef(false);
  const dirty = Boolean(motivo);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    const prepared = buildCancelPayload(motivo, task.version);
    if (!prepared.payload || prepared.error) {
      setError(prepared.error ?? 'Escribe el motivo de cancelación.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const response = await agendaApi.cancel(task.id, prepared.payload);
      const result = response as any;
      onSaved(result?.data?.data ?? result?.data ?? result);
    } catch (value) {
      setError(errorMessage(value));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const cancel = () => {
    if (dirty && !window.confirm('Hay cambios sin guardar. ¿Descartarlos?')) return;
    onDirtyChange(false);
    onCancel();
  };

  return <form className="agenda-drawer agenda-action-form" onSubmit={save}>
    <div className="agenda-action-form-header"><h2>Cancelar tarea</h2><button type="button" onClick={onClose} disabled={saving}>Cerrar</button></div>
    <p>Tarea: <strong>{task.titulo}</strong></p>
    <p>Estado actual: <strong>{task.estado}</strong></p>
    <div className="agenda-cancel-warning" role="note">La tarea pasará a estado CANCELADA y dejará de aparecer en las tareas activas.</div>
    <label>Motivo obligatorio<textarea value={motivo} onChange={(event) => { setMotivo(event.target.value); setError(''); }} minLength={3} maxLength={1000} required disabled={saving}/></label>
    {error && <div className="agenda-error" role="alert">{error}<button type="submit" disabled={saving}>Reintentar</button></div>}
    <div className="agenda-actions">
      <button type="button" onClick={cancel} disabled={saving}>Volver</button>
      <button type="submit" className="agenda-danger" disabled={saving}>{saving ? 'Cancelando…' : 'Confirmar cancelación'}</button>
    </div>
  </form>;
}
