import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiClientError } from '../../../services/apiClient';
import { agendaApi } from '../../../services/agendaApi';
import {
  activeAssignableUsers,
  addParticipant,
  availableAssignableUsers,
  participantIds,
  participantListIsDirty,
  participantPayload,
  removeParticipant,
  type AgendaParticipant,
} from '../agendaOperativa.domain';

type Task = {
  id: number;
  responsable_id: number | string;
  responsable_nombre?: string;
  participantes?: Array<{ id?: number | string; usuario_id?: number | string; nombre?: string; nombre_completo?: string; rol?: string }>;
};

type ApiUser = AgendaParticipant & { nombre_completo: string; rol?: string };

function responseItems(response: any): ApiUser[] {
  const result = response?.data?.data ?? response?.data ?? response;
  const items = Array.isArray(result) ? result : result?.items ?? [];
  return activeAssignableUsers(items, -1) as ApiUser[];
}

function requestError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 429) return 'Hay demasiadas solicitudes. Espera un momento y vuelve a intentar.';
    if (error.status === 400) return error.message || 'La lista de participantes no es válida.';
    if (error.status === 403) return 'No tienes permiso para administrar participantes.';
    if (error.status === 404) return 'La tarea ya no está disponible. El borrador se conserva.';
    if (error.status >= 500) return 'El servidor no pudo guardar los participantes. El borrador se conserva.';
  }
  return error instanceof Error ? `${error.message} El borrador se conserva.` : 'No fue posible guardar los participantes. El borrador se conserva.';
}

export default function AgendaTaskParticipantsForm({
  task,
  onSaved,
  onCancel,
  onDirtyChange,
}: {
  task: Task;
  onSaved: (detail: Record<string, any>) => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const responsibleId = Number(task.responsable_id);
  const initialIds = useMemo(() => participantIds(task.participantes), [task.id]);
  const [ids, setIds] = useState(initialIds);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchError, setSearchError] = useState('');
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const savingRef = useRef(false);
  const requestVersionRef = useRef(0);
  const dirty = participantListIsDirty(initialIds, ids);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  useEffect(() => {
    const version = ++requestVersionRef.current;
    setLoading(true);
    const timeout = window.setTimeout(() => {
      void agendaApi.users<any>({ search: search.trim() || undefined, limit: 100 })
        .then((response) => {
          if (version === requestVersionRef.current) setUsers(responseItems(response));
          if (version === requestVersionRef.current) setSearchError('');
        })
        .catch((value) => {
          if (version === requestVersionRef.current) {
            setSearchError(value instanceof Error ? value.message : 'No fue posible cargar usuarios asignables.');
            setUsers([]);
          }
        })
        .finally(() => {
          if (version === requestVersionRef.current) setLoading(false);
        });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [search, searchAttempt]);

  const usersById = useMemo(() => new Map(users.map((user) => [Number(user.id), user])), [users]);
  const currentParticipantsById = new Map((task.participantes ?? []).map((participant) => [Number(participant.id ?? participant.usuario_id), participant]));
  const currentParticipants = ids.map((id) => currentParticipantsById.get(id) ?? { id });
  const availableUsers = availableAssignableUsers(users, responsibleId, ids);

  const updateSearch = (value: string) => {
    requestVersionRef.current += 1;
    setUsers([]);
    setSearch(value);
    setError('');
    setSearchError('');
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    const prepared = participantPayload(ids, responsibleId);
    if (prepared.error || !prepared.payload) {
      setError(prepared.error ?? 'La lista de participantes no es válida.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const result = await agendaApi.participants(task.id, prepared.payload.participantes);
      const detail = result as any;
      onSaved(detail?.data?.data ?? detail?.data ?? detail);
    } catch (value) {
      setError(requestError(value));
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

  return <form className="agenda-drawer agenda-participants-form" onSubmit={save}>
    <h2>Administrar participantes</h2>
    <section className="agenda-participant-group" aria-label="Responsable principal">
      <h3>Responsable principal</h3>
      <p className="agenda-participant"><strong>{task.responsable_nombre ?? `Usuario ${responsibleId}`}</strong><span>Responsable · no seleccionable</span></p>
    </section>

    <section className="agenda-participant-group" aria-label="Participantes actuales">
      <h3>Participantes actuales</h3>
      {currentParticipants.length === 0 ? <p className="agenda-participant-empty">Sin participantes</p> : currentParticipants.map((participant) => {
        const id = Number(participant.id ?? participant.usuario_id);
        const user = usersById.get(id);
        const name = participant.nombre_completo ?? participant.nombre ?? user?.nombre_completo ?? `Usuario ${id}`;
        const role = participant.rol ?? user?.rol ?? 'Rol no disponible';
        return <div className="agenda-participant" key={id}>
          <span><strong>{name}</strong><small>{role}</small></span>
          <button type="button" onClick={() => setIds((current) => removeParticipant(current, id))} disabled={saving}>Retirar</button>
        </div>;
      })}
    </section>

    <section className="agenda-participant-group">
      <h3>Agregar participantes</h3>
      <label className="agenda-participant-search">Buscar usuarios
        <input value={search} onChange={(event) => updateSearch(event.target.value)} placeholder="Nombre de usuario" autoComplete="off" />
      </label>
      {loading ? <p aria-live="polite">Buscando usuarios asignables…</p> : availableUsers.length === 0 ? <p className="agenda-participant-empty">No hay usuarios disponibles para agregar.</p> : <ul className="agenda-participant-results">
        {availableUsers.map((user) => <li key={user.id}>
          <span><strong>{user.nombre_completo}</strong><small>{user.rol || 'Rol no disponible'}</small></span>
          <button type="button" onClick={() => setIds((current) => addParticipant(current, Number(user.id), responsibleId))} disabled={saving}>Agregar</button>
        </li>)}
      </ul>}
      {searchError && <div className="agenda-error" role="alert">{searchError}<button type="button" onClick={() => setSearchAttempt((attempt) => attempt + 1)}>Reintentar búsqueda</button></div>}
    </section>

    {error && <div className="agenda-error" role="alert">{error}<button type="submit" disabled={saving}>Reintentar</button></div>}
    <div className="agenda-actions">
      <button type="button" onClick={cancel} disabled={saving}>Cancelar</button>
      <button className="agenda-primary" type="submit" disabled={saving || !dirty}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
    </div>
  </form>;
}
