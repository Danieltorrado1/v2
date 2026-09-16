import { useEffect, useState, useSyncExternalStore } from 'react';
import { agendaApi } from '../../../services/agendaApi';
import { canManageOwnTop, topPosition, TopThreeState, type TopAction, type TopSnapshot } from '../agendaTopThree.domain';
const dataOf = (response: any): TopSnapshot => response?.data?.data ?? response?.data ?? response;

export default function AgendaTaskTopThree({ taskId, permissions, onSaved, onStateChange }: {
  taskId: number;
  permissions: string[];
  onSaved: (snapshot: TopSnapshot) => void;
  onStateChange: (state: { dirty: boolean; saving: boolean }) => void;
}) {
  const [model] = useState(() => new TopThreeState(taskId));
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
  const reload = () => model.load(async fecha => dataOf(await agendaApi.getTop(fecha)));
  useEffect(() => { void reload(); }, [state.fecha]);
  useEffect(() => {
    const notify = () => { const value = model.getSnapshot(); onStateChange({ dirty: value.dirty, saving: value.saving }); };
    notify(); const unsubscribe = model.subscribe(notify);
    return () => { unsubscribe(); onStateChange({ dirty: false, saving: false }); };
  }, [model, onStateChange]);
  const save = async (action: TopAction) => {
    if (!canManageOwnTop(permissions)) return;
    const result = await model.save(action, message => window.confirm(message), async payload => dataOf(await agendaApi.replaceTop(payload)));
    if (result) onSaved(result);
  };
  const position = state.snapshot ? topPosition(state.snapshot, taskId) : 0;
  const full = state.snapshot?.tarea_ids.filter(id => id !== null).length === 3;
  const occupied = state.snapshot?.tarea_ids[state.position - 1] != null;
  const disabled = state.saving || state.loading || !state.snapshot || state.conflict;
  return <section className="agenda-panel" aria-label="Mi Top 3 de la tarea">
    <h3>Mi Top 3</h3>
    <label>Fecha del Top 3<input type="date" value={state.fecha} onChange={event => model.selectDate(event.target.value)} disabled={state.saving}/></label>
    {state.loading ? <p role="status">Cargando Top 3…</p> : state.snapshot && <>
      <p>{position ? `Posición ${position}` : 'No está en mi Top 3'}</p>
      {full && !position && <p>Tu Top 3 está completo</p>}
      <ol>{[1, 2, 3].map(slot => <li key={slot}>Posición {slot}: {state.snapshot?.items.find(item => Number(item.posicion) === slot)?.titulo ?? 'Libre'}</li>)}</ol>
    </>}
    {canManageOwnTop(permissions) && <>
      <label>Posición<select value={state.position} disabled={disabled} onChange={event => model.selectPosition(Number(event.target.value))}>{[1, 2, 3].map(slot => <option key={slot} value={slot}>{slot} · {state.snapshot?.tarea_ids[slot - 1] != null ? 'Ocupada' : 'Libre'}</option>)}</select></label>
      <div className="agenda-actions">
        <button type="button" disabled={disabled || position === state.position} onClick={() => void save('place')}>{state.saving ? 'Guardando…' : position ? (occupied ? 'Intercambiar posiciones' : 'Mover a esta posición') : occupied ? 'Sustituir esta posición' : 'Agregar a mi Top 3'}</button>
        {position > 0 && <button type="button" disabled={disabled} onClick={() => void save('remove')}>Retirar de mi Top 3</button>}
      </div>
    </>}
    {state.error && <div className="agenda-error" role="alert">{state.error}
      {state.conflict ? <button type="button" disabled={state.saving || state.loading} onClick={() => void reload()}>Recargar Top 3</button>
        : <button type="button" disabled={state.saving || state.loading} onClick={() => state.lastAction ? void save(state.lastAction) : void reload()}>Reintentar</button>}
    </div>}
  </section>;
}
