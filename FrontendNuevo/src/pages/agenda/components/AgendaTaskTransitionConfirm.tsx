import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiClientError } from '../../../services/apiClient';
import { agendaApi } from '../../../services/agendaApi';
import { transitionPayload } from '../agendaOperativa.domain';

export type AgendaTransitionKind = 'START' | 'COMPLETE' | 'REOPEN';
type Task = { id: number; estado: string; version?: number; fecha_terminacion?: string | null };

const config: Record<AgendaTransitionKind, { title: string; target: string; confirm: string; message: (task: Task) => string }> = {
  START: {
    title: 'Iniciar tarea', target: 'EN_PROCESO', confirm: 'Confirmar inicio',
    message: () => 'La tarea pasará de PENDIENTE a EN_PROCESO.',
  },
  COMPLETE: {
    title: 'Terminar tarea', target: 'TERMINADA', confirm: 'Confirmar terminación',
    message: () => 'La tarea se marcará como terminada y se registrará la fecha de terminación.',
  },
  REOPEN: {
    title: 'Reabrir tarea', target: 'PENDIENTE', confirm: 'Confirmar reapertura',
    message: (task) => `El historial de ${task.estado} se conservará. La tarea volverá a PENDIENTE.`,
  },
};

function transitionError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 409 || error.code === 'AGENDA_VERSION_CONFLICT') {
      return { message: 'La tarea cambió desde que abriste este detalle. Recarga el detalle antes de continuar.', conflict: true };
    }
    if (error.status === 429) return { message: 'Hay demasiadas solicitudes. Espera un momento y vuelve a intentar.', conflict: false };
    if (error.status === 400) return { message: error.message || 'La transición no es válida.', conflict: false };
    if (error.status === 403) return { message: 'No tienes permiso para realizar esta transición.', conflict: false };
    if (error.status === 404) return { message: 'La tarea ya no está disponible.', conflict: false };
    if (error.status >= 500) return { message: 'El servidor no pudo guardar el cambio. Puedes reintentar.', conflict: false };
  }
  return { message: error instanceof Error ? `${error.message} Puedes reintentar.` : 'No fue posible guardar el cambio. Puedes reintentar.', conflict: false };
}

export default function AgendaTaskTransitionConfirm({ task, kind, onSaved, onCancel, onReload }: {
  task: Task;
  kind: AgendaTransitionKind;
  onSaved: (task: Record<string, any>) => void;
  onCancel: () => void;
  onReload: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const savingRef = useRef(false);
  const action = config[kind];

  const confirm = async (event: FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    setConflict(false);
    try {
      const payload = transitionPayload(task.version);
      const request = kind === 'START'
        ? agendaApi.start(task.id, payload)
        : kind === 'COMPLETE'
          ? agendaApi.complete(task.id, payload)
          : agendaApi.reopen(task.id, payload);
      const response = await request;
      const result = response as any;
      onSaved(result?.data?.data ?? result?.data ?? result);
    } catch (value) {
      const failure = transitionError(value);
      setError(failure.message);
      setConflict(failure.conflict);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const reload = async () => {
    setReloading(true);
    try {
      await onReload();
    } catch (value) {
      setError(value instanceof Error ? value.message : 'No fue posible recargar el detalle.');
    } finally {
      setReloading(false);
    }
  };

  return <form className="agenda-drawer agenda-action-form" onSubmit={confirm}>
    <div className="agenda-action-form-header"><h2>{action.title}</h2><button type="button" onClick={onCancel} disabled={saving || reloading}>Volver</button></div>
    {kind === 'REOPEN' ? <>
      <p>Estado actual: <strong>{task.estado}</strong></p>
      <p>Estado al reabrir: <strong>{action.target}</strong></p>
      <div className="agenda-transition-warning" role="note">{action.message(task)}</div>
    </> : <div className="agenda-transition-warning" role="note">{action.message(task)}</div>}
    {error && <div className="agenda-error" role="alert">
      {error}
      {conflict ? <button type="button" onClick={() => void reload()} disabled={reloading}>{reloading ? 'Recargando…' : 'Recargar detalle'}</button> : <button type="submit" disabled={saving}>Reintentar</button>}
    </div>}
    <div className="agenda-actions">
      <button type="button" onClick={onCancel} disabled={saving || reloading}>Volver</button>
      <button type="submit" className="agenda-primary" disabled={saving || reloading || conflict}>{saving ? 'Procesando…' : action.confirm}</button>
    </div>
  </form>;
}
