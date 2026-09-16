import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiClientError } from '../../../services/apiClient';
import { agendaApi } from '../../../services/agendaApi';
import { buildReschedulePayload, isAgendaDate } from '../agendaOperativa.domain';

type Task = { id: number; estado: string; fecha_prevista: string; fecha_limite?: string | null; version?: number };

function errorMessage(error: unknown) {
  if (!(error instanceof ApiClientError)) return error instanceof Error ? `${error.message} Puedes reintentar sin perder el borrador.` : 'No fue posible reprogramar la tarea. Puedes reintentar.';
  if (error.status === 429) return 'Hay demasiadas solicitudes. Espera un momento y vuelve a intentar; el borrador se conserva.';
  if (error.status === 400) return error.message || 'La solicitud de reprogramación no es válida.';
  if (error.status === 403) return 'No tienes permiso para reprogramar esta tarea.';
  if (error.status === 404) return 'La tarea ya no está disponible. El borrador se conserva.';
  if (error.status === 409) return error.message || 'La tarea cambió de estado y ya no se puede reprogramar.';
  if (error.status >= 500) return 'El servidor no pudo guardar la reprogramación. El borrador se conserva.';
  return `${error.message} El borrador se conserva.`;
}

export default function AgendaTaskRescheduleForm({ task, onSaved, onCancel, onClose, onDirtyChange }: {
  task: Task;
  onSaved: (task: Record<string, any>) => void;
  onCancel: () => void;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [fechaNueva, setFechaNueva] = useState('');
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const savingRef = useRef(false);
  const dirty = Boolean(fechaNueva || motivo);
  const prepared = useMemo(() => buildReschedulePayload({
    fechaActual: task.fecha_prevista,
    fechaNueva,
    fechaLimite: task.fecha_limite,
    motivo,
    version: task.version,
  }), [fechaNueva, motivo, task.fecha_limite, task.fecha_prevista, task.version]);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    if (!prepared.payload || prepared.error) {
      setError(prepared.error ?? 'Completa los datos de reprogramación.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const response = await agendaApi.reschedule(task.id, prepared.payload);
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
    <div className="agenda-action-form-header"><h2>Reprogramar tarea</h2><button type="button" onClick={onClose} disabled={saving}>Cerrar</button></div>
    <p>Programación actual: <strong>{task.fecha_prevista}</strong></p>
    {task.fecha_limite && <p>Fecha límite actual: <strong>{task.fecha_limite}</strong></p>}
    <label>Nueva fecha<input type="date" value={fechaNueva} onChange={(event) => { setFechaNueva(event.target.value); setError(''); }} required disabled={saving} aria-invalid={Boolean(fechaNueva && !isAgendaDate(fechaNueva))}/></label>
    <label>Motivo obligatorio<textarea value={motivo} onChange={(event) => { setMotivo(event.target.value); setError(''); }} minLength={3} maxLength={1000} required disabled={saving}/></label>
    {error && <div className="agenda-error" role="alert">{error}<button type="submit" disabled={saving}>Reintentar</button></div>}
    <div className="agenda-actions">
      <button type="button" onClick={cancel} disabled={saving}>Cancelar</button>
      <button type="submit" className="agenda-primary" disabled={saving}>{saving ? 'Guardando reprogramación…' : 'Guardar reprogramación'}</button>
    </div>
  </form>;
}
