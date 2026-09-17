import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CalendarDays, Check, CheckCheck, ChevronLeft, ChevronRight, Clock3, ListChecks } from 'lucide-react';
import AgendaTaskFollowupForm from './components/AgendaTaskFollowupForm';
import AgendaFollowupsView from './components/AgendaFollowupsView';
import AgendaTaskTopThree from './components/AgendaTaskTopThree';
import { canLeaveTop, syncTopSummary, topToday, type TopSnapshot } from './agendaTopThree.domain';
import { canAddAgendaFollowup, manualFollowupTypes, mergeSavedFollowup, refreshFollowupDetail, followupTimestamp, type FollowupPayload } from './agendaFollowup.domain';
import { createAgendaApi } from '../../services/agendaApi';
import { useCompanyContext } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import AgendaTaskEditForm from './components/AgendaTaskEditForm';
import AgendaTaskAssignForm from './components/AgendaTaskAssignForm';
import AgendaTaskParticipantsForm from './components/AgendaTaskParticipantsForm';
import AgendaTaskRescheduleForm from './components/AgendaTaskRescheduleForm';
import AgendaTaskCancelForm from './components/AgendaTaskCancelForm';
import AgendaTaskTransitionConfirm, { type AgendaTransitionKind } from './components/AgendaTaskTransitionConfirm';
import { canManageAgendaAction, addDays, canCancelAgendaTask, canCompleteAgendaTask, canRescheduleAgendaTask, canReopenAgendaTask, canStartAgendaTask, closeDayFormFromRecord, closeDayPayload, groupTasksByDate, mergeParticipantUpdate, weekDates, weekStart } from './agendaOperativa.domain';
import './AgendaOperativaPage.css';

type Task = Record<string, any> & { id: number; responsable_id: number | string; fecha_prevista: string; hora_inicio?: string | null; titulo: string; tipo: string; responsable_nombre: string; estado: string };
type Detail = Task & { seguimientos: any[]; asignaciones: any[]; reprogramaciones: any[]; participantes: any[] };
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const dataOf = <T,>(response: any): T => response?.data?.data ?? response?.data ?? response;
const dateLabel = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(year!, month! - 1, day!));
};

const statusLabels: Record<string, string> = {
  PENDIENTE: 'Pendiente', EN_PROCESO: 'En proceso', TERMINADA: 'Terminada',
  REPROGRAMADA: 'Reprogramada', CANCELADA: 'Cancelada',
};

function renderTaskRow(task: Task, onOpen: () => void) {
  return <button key={task.id} className="agenda-task" data-status={task.estado} onClick={onOpen}>
    <span className="agenda-task-indicator" aria-hidden="true">{task.estado === 'TERMINADA' && <Check size={11} />}</span>
    <span className="agenda-task-content">
      <strong>{task.titulo}</strong>
      {task.descripcion && <span className="agenda-task-description">{task.descripcion}</span>}
      <span className="agenda-task-meta">
        {task.prioridad && <span className="agenda-priority" data-priority={task.prioridad}>Prioridad {task.prioridad}</span>}
        <em className="agenda-status" data-status={task.estado}>{statusLabels[task.estado] ?? task.estado}</em>
        <small>{task.hora_inicio ? `${task.hora_inicio} · ` : ''}{task.tipo} · {task.responsable_nombre}</small>
        {task.fecha_limite && <small className={task.fecha_limite < today() && !['TERMINADA', 'CANCELADA'].includes(task.estado) ? 'agenda-task-overdue' : undefined}>Vence {task.fecha_limite}</small>}
      </span>
    </span>
    <span className="agenda-task-open" aria-hidden="true">Ver detalle<ChevronRight size={12} /></span>
  </button>;
}

/** Calendar markers describe only the real tasks already loaded by the active view. */
function TaskCalendar({ tasks, scope }: { tasks: Task[]; scope: string }) {
  const [month, setMonth] = useState(() => today().slice(0, 7) + '-01');
  const [year, monthNumber] = month.split('-').map(Number);
  const start = new Date(year!, monthNumber! - 1, 1);
  const offset = (start.getDay() + 6) % 7;
  const dayCount = new Date(year!, monthNumber!, 0).getDate();
  const monthLabel = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(start);
  const shiftMonth = (delta: number) => {
    const next = new Date(year!, monthNumber! - 1 + delta, 1);
    setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`);
  };
  return <section className="agenda-calendar" aria-label="Calendario de fechas previstas">
    <header>
      <button type="button" aria-label="Mes anterior" onClick={() => shiftMonth(-1)}><ChevronLeft size={14} /></button>
      <h2 aria-live="polite">{monthLabel}</h2>
      <button type="button" aria-label="Mes siguiente" onClick={() => shiftMonth(1)}><ChevronRight size={14} /></button>
    </header>
    <p className="agenda-calendar-scope">{scope}</p>
    <div className="agenda-calendar-grid">
      {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(day => <span className="agenda-calendar-weekday" key={day} aria-hidden="true">{day}</span>)}
      {Array.from({ length: offset }, (_, index) => <span key={`blank-${index}`} aria-hidden="true" />)}
      {Array.from({ length: dayCount }, (_, index) => {
        const date = `${month.slice(0, 7)}-${String(index + 1).padStart(2, '0')}`;
        const matches = tasks.filter(task => task.fecha_prevista === date);
        return <div className="agenda-calendar-day" data-today={date === today()} key={date} title={`${dateLabel(date)}${matches.length ? `: ${matches.map(task => task.titulo).join('; ')}` : ''}`}>
          <time dateTime={date} aria-current={date === today() ? 'date' : undefined}>{index + 1}</time>
          <span className="agenda-calendar-markers" aria-label={matches.length ? `${matches.length} tareas cargadas` : undefined}>
            {matches.slice(0, 2).map(task => <i key={task.id} data-status={task.estado} aria-hidden="true" />)}
          </span>
        </div>;
      })}
    </div>
    <p className="agenda-calendar-legend"><i aria-hidden="true" /> Fechas de tareas cargadas</p>
  </section>;
}

function FollowupEntry({ item }: { item: any }) {
  if (!item.comentario?.trim()) return null;
  const nextDate = item.fecha_proxima_seguimiento ?? (manualFollowupTypes.includes(item.tipo) ? item.fecha_nueva : null);
  const timestamp = followupTimestamp(item.created_at);
  return <article>
    <p><strong>{item.tipo}</strong> · {item.comentario}</p>
    <p>{item.usuario_registro_nombre || (item.usuario_id ? `Usuario ${item.usuario_id}` : '')}{timestamp ? ` · ${timestamp}` : ''}</p>
    {nextDate && <p>Próximo seguimiento: {String(nextDate).slice(0, 10)}</p>}
    {item.tipo === 'REPROGRAMACION' && item.fecha_nueva && <p>{item.fecha_anterior} → {item.fecha_nueva}</p>}
  </article>;
}

export default function AgendaOperativaPage() {
  const { empresaId } = useCompanyContext();
  return empresaId ? <AgendaCompanyPage key={empresaId} empresaId={empresaId} /> : <p>Selecciona una empresa para consultar Agenda.</p>;
}

export function AgendaCompanyPage({ empresaId }: { empresaId: number }) {
  const agendaApi = useMemo(() => createAgendaApi(empresaId), [empresaId]);
  const { user } = useAuth();
  const can = (permission: string) => canManageAgendaAction(user?.permissions ?? [], permission);
  const [items, setItems] = useState<Task[]>([]);
  const loadVersion = useRef(0);
  const detailVersion = useRef(0);
  useEffect(() => () => { loadVersion.current++; detailVersion.current++; }, []);
  const [summary, setSummary] = useState<any>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [followupsRevision, setFollowupsRevision] = useState(0);
  const observedFollowupTask = useRef<{ id: number; signature: string } | null>(null);
  useEffect(() => {
    if (!detail) { observedFollowupTask.current = null; return; }
    const signature = JSON.stringify([detail.version, detail.responsable_id, detail.estado, detail.tipo, detail.modulo_relacionado, detail.fecha_proxima_seguimiento, detail.seguimientos?.length]);
    const previous = observedFollowupTask.current;
    if (previous?.id === detail.id && previous.signature !== signature) setFollowupsRevision(value => value + 1);
    observedFollowupTask.current = { id: detail.id, signature };
  }, [detail]);
  const [addingFollowup, setAddingFollowup] = useState(false);
  const followupSaving = useRef(false);
  const topPending = useRef({ dirty: false, saving: false });
  const topRefresh = useRef(0);
  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [managingParticipants, setManagingParticipants] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmingTransition, setConfirmingTransition] = useState<AgendaTransitionKind | null>(null);
  const [participantsDirty, setParticipantsDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [view, setView] = useState('Mi día');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [week, setWeek] = useState(() => weekStart(today()));
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeLoading, setCloseLoading] = useState(false);
  const [closeLoaded, setCloseLoaded] = useState(false);
  const [closeAttempt, setCloseAttempt] = useState(0);
  const [closeSaving, setCloseSaving] = useState(false);
  const closeSavingRef = useRef(false);
  const [closeTasks, setCloseTasks] = useState<Task[]>([]);
  const [closeError, setCloseError] = useState('');
  const [closeForm, setCloseForm] = useState({ resumen_dia: '', observaciones: '', clasificaciones: {} as Record<string, string> });

  const load = async () => {
    const revision = ++loadVersion.current;
    setLoading(true);
    try {
      if (view === 'Seguimientos') {
        const summary = dataOf(await agendaApi.summary());
        if (revision !== loadVersion.current) return;
        setSummary(summary);
        setError('');
        return;
      }
      const range = view === 'Semana' ? { desde: week, hasta: addDays(week, 6) } : view === 'Mi día' ? { desde: today(), hasta: today() } : {};
      const [listResponse, summaryResponse] = await Promise.all([
        agendaApi.list<any>({ page: 1, limit: 100, q: query || undefined, estado: status || undefined, ...range }),
        agendaApi.summary(),
      ]);
      const list = dataOf<any>(listResponse);
      const rows: Task[] = [...(list.items ?? [])];
      for (let page = 2; rows.length < list.total; page++) {
        if (revision !== loadVersion.current) return;
        const next = dataOf<any>(await agendaApi.list({ page, limit: 100, q: query || undefined, estado: status || undefined, ...range }));
        if (!next.items?.length) break;
        rows.push(...next.items);
      }
      if (revision !== loadVersion.current) return;
      setItems(rows);
      setSummary(dataOf<any>(summaryResponse));
      setError('');
    } catch (err) {
      if (revision === loadVersion.current) setError(err instanceof Error ? err.message : 'No fue posible cargar Agenda');
    } finally {
      if (revision === loadVersion.current) setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [status, view, week]);

  const leaveTop = () => {
    if (!canLeaveTop(topPending.current.dirty, topPending.current.saving, message => window.confirm(message))) return false;
    topPending.current = { dirty: false, saving: false };
    return true;
  };

  const afterTop = async (snapshot: TopSnapshot) => {
    const revision = ++topRefresh.current;
    setSummary((current: any) => syncTopSummary(current ?? {}, snapshot, topToday()));
    setNotice('Tu Top 3 fue actualizado');
    try {
      const refreshed = dataOf(await agendaApi.summary());
      if (revision === topRefresh.current) setSummary(refreshed);
    } catch { if (revision === topRefresh.current) setError('Tu Top 3 se guardó, pero no fue posible refrescar el resumen.'); }
  };

  const open = async (id: number) => {
    if (Number(detail?.id) === id && topPending.current.dirty) return;
    if (!leaveTop()) return;
    if (followupSaving.current || (addingFollowup && Number(detail?.id) === id)) return;
    if (participantsDirty && detail?.id !== id && !window.confirm('Hay cambios sin guardar en el formulario. ¿Descartarlos y abrir otra tarea?')) return;
    try {
      const revision = ++detailVersion.current;
      const updated = dataOf<Detail>(await agendaApi.get<Detail>(id));
      if (revision !== detailVersion.current) return;
      setDetail(updated);
      setAddingFollowup(false);
      setEditing(false);
      setAssigning(false);
      setManagingParticipants(false);
      setRescheduling(false);
      setCancelling(false);
      setConfirmingTransition(null);
      setParticipantsDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible cargar el detalle');
    }
  };
  const after = async (task: Record<string, any>) => {
    const updated = dataOf<Record<string, any>>(task);
    const revision = detailVersion.current;
    setDetail((current) => current && Number(current.id) === Number(updated.id) ? { ...current, ...updated } : current);
    setEditing(false);
    setAssigning(false);
    setNotice('Cambios guardados');
    try {
      const [updatedDetail] = await Promise.all([agendaApi.get<Detail>(Number(updated.id)), load()]);
      if (revision === detailVersion.current) setDetail(current => Number(current?.id) === Number(updated.id) ? dataOf<Detail>(updatedDetail) : current);
    } catch (err) { setError(err instanceof Error ? err.message : 'Los cambios se guardaron, pero no se pudo refrescar el detalle.'); }
  };

  const afterFollowup = async (item: any, payload: FollowupPayload) => {
    const taskId = Number(item.tarea_id ?? detail?.id);
    setDetail(current => current && Number(current.id) === taskId ? mergeSavedFollowup(current, item, payload) : current);
    setAddingFollowup(false);
    setParticipantsDirty(false);
    setNotice('Seguimiento guardado');
    try {
      await refreshFollowupDetail(
        async () => dataOf<Detail>(await agendaApi.get<Detail>(taskId)),
        load,
        updated => setDetail(current => Number(current?.id) === taskId ? updated : current),
      );
    } catch (err) {
      setError(err instanceof Error ? `El seguimiento se guardó, pero no se pudo refrescar el detalle: ${err.message}` : 'El seguimiento se guardó, pero no se pudo refrescar el detalle.');
    }
  };

  const afterParticipants = (updated: Record<string, any>) => {
    setDetail((current) => current ? mergeParticipantUpdate(current, updated) : current);
    setManagingParticipants(false);
    setParticipantsDirty(false);
    setNotice('Participantes actualizados');
  };

  const afterTaskAction = async (updated: Record<string, any>, message: string) => {
    const taskId = Number(updated.id ?? detail?.id);
    const revision = detailVersion.current;
    setDetail((current) => current ? { ...current, ...updated } : current);
    setRescheduling(false);
    setCancelling(false);
    setConfirmingTransition(null);
    setParticipantsDirty(false);
    setNotice(message);
    try {
      const [refreshedDetail] = await Promise.all([agendaApi.get<Detail>(taskId), load()]);
      if (revision === detailVersion.current) setDetail(current => Number(current?.id) === taskId ? dataOf<Detail>(refreshedDetail) : current);
    } catch (err) {
      setError(err instanceof Error ? `La tarea se guardó, pero no fue posible actualizar su detalle: ${err.message}` : 'La tarea se guardó, pero no fue posible actualizar su detalle.');
    }
  };

  const reloadTaskDetail = async () => {
    if (!detail) return;
    const refreshed = dataOf<Detail>(await agendaApi.get<Detail>(detail.id));
    setDetail(refreshed);
    setConfirmingTransition(null);
    setError('');
    await load();
  };

  const closeDetail = () => {
    if (!leaveTop()) return;
    if (followupSaving.current) return;
    if (participantsDirty && !window.confirm('Hay cambios sin guardar en el formulario. ¿Descartarlos y cerrar la tarea?')) return;
    detailVersion.current++;
    setDetail(null);
    setAddingFollowup(false);
    setManagingParticipants(false);
    setRescheduling(false);
    setCancelling(false);
    setConfirmingTransition(null);
    setParticipantsDirty(false);
  };

  useEffect(() => {
    if (!closeOpen) return;
    let active = true;
    setCloseLoading(true);
    setCloseLoaded(false);
    setCloseError('');
    Promise.all([agendaApi.getCloseDay<any>(today()), (async () => {
      const rows: Task[] = [];
      for (let page = 1; ; page++) {
        const result = dataOf<any>(await agendaApi.list({ page, limit: 100, desde: today(), hasta: today() }));
        rows.push(...(result.items ?? []));
        if (!result.items?.length || rows.length >= result.total) return rows;
      }
    })()]).then(([response, rows]) => {
      if (active) { setCloseForm(closeDayFormFromRecord(dataOf(response))); setCloseTasks(rows); setCloseLoaded(true); }
    }).catch((err) => {
      if (active) setCloseError(err instanceof Error ? err.message : 'No fue posible recuperar el cierre diario');
    }).finally(() => { if (active) setCloseLoading(false); });
    return () => { active = false; };
  }, [closeOpen, closeAttempt]);

  const saveClose = async (event: React.FormEvent) => {
    event.preventDefault();
    if (closeSavingRef.current || closeLoading || !closeLoaded) return;
    closeSavingRef.current = true;
    const tareas = Object.entries(closeForm.clasificaciones).filter(([, classification]) => classification).map(([id, classification]) => ({
      tarea_id: Number(id), clasificacion: classification as 'TERMINADA' | 'PENDIENTE' | 'REPROGRAMADA',
    }));
    setCloseSaving(true);
    setCloseError('');
    try {
      const saved = dataOf<any>(await agendaApi.closeDay(closeDayPayload({ fecha: today(), resumen_dia: closeForm.resumen_dia, observaciones: closeForm.observaciones, tareas })));
      setCloseForm(closeDayFormFromRecord(saved));
      setNotice('Cierre diario guardado');
    } catch (err) {
      // Preserve the draft so the user can retry without losing the form.
      setCloseError(err instanceof Error ? err.message : 'No fue posible guardar el cierre diario');
    } finally {
      closeSavingRef.current = false;
      setCloseSaving(false);
    }
  };

  const days = useMemo(() => weekDates(week), [week]);
  const grouped = useMemo(() => groupTasksByDate(items, days), [items, days]);
  const visible = view === 'Mi día' ? items.filter((task) => task.fecha_prevista === today()) : items;
  const pending = summary?.pendientes;
  const completed = summary?.terminadas;
  const total = typeof pending === 'number' && typeof completed === 'number' ? pending + completed : undefined;
  const progress = [
    { title: 'Pendientes para hoy', count: summary?.para_hoy, total: pending, icon: CalendarDays, caption: 'de las tareas pendientes' },
    { title: 'Tareas completadas', count: completed, total, icon: CheckCheck, caption: 'de las tareas no canceladas' },
    { title: 'Pendientes vencidas', count: summary?.vencidas, total: pending, icon: AlertCircle, caption: 'de las tareas pendientes' },
  ];
  const calendarTasks = loading || error || view === 'Seguimientos' ? [] : visible;
  const scopeLabel = view === 'Seguimientos' ? 'Consulta fechas en Mi día, Bandeja o Semana' : `Vista ${view} · resultados cargados`;
  const upcoming = calendarTasks.filter(task => task.fecha_prevista >= today() && !['TERMINADA', 'CANCELADA'].includes(task.estado))
    .slice().sort((left, right) => left.fecha_prevista.localeCompare(right.fecha_prevista) || (left.hora_inicio ?? '99').localeCompare(right.hora_inicio ?? '99')).slice(0, 5);

  return <main className="agenda-page" data-view={view}>
    <h1 className="agenda-page-title">Agenda Operativa</h1>
    {error && <div className="agenda-error" role="alert">{error}</div>}
    {notice && <div className="agenda-notice" role="status">{notice}</div>}
    <section className="agenda-summary" aria-label="Resumen de tareas">
      {progress.map(({ title, count, total: denominator, icon: Icon, caption }) => {
        const ready = !loading && !error && typeof count === 'number' && typeof denominator === 'number';
        const percentage = ready ? (denominator > 0 ? Math.round(count / denominator * 100) : 0) : null;
        return <article key={title}>
          <div className="agenda-summary-value"><strong>{percentage ?? '—'}</strong>{percentage !== null && <span>%</span>}</div>
          <div className="agenda-summary-copy">
            <h2><Icon size={16} aria-hidden="true" />{title}</h2>
            <div className="agenda-summary-track" role="progressbar" aria-label={title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage ?? undefined} aria-valuetext={ready ? `${count} de ${denominator} ${caption}` : 'Sin datos disponibles'}><span style={{ width: `${percentage ?? 0}%` }} /></div>
            <p>{ready ? `${count} de ${denominator} ${caption}` : loading ? 'Cargando resumen…' : 'Sin datos disponibles'}</p>
          </div>
        </article>;
      })}
    </section>
    <div className="agenda-workspace">
    <section className="agenda-tasks-card" aria-label="Gestión de tareas">
      <header className="agenda-tasks-header">
        <nav className="agenda-tabs" aria-label="Vistas de Agenda">{['Mi día', 'Bandeja', 'Seguimientos', 'Semana'].map((tab) => <button className={view === tab ? 'active' : ''} aria-current={view === tab ? 'page' : undefined} key={tab} onClick={() => setView(tab)}>{tab}</button>)}</nav>
        {view !== 'Seguimientos' && can('agenda.update') && <button className="agenda-close-toggle" onClick={() => setCloseOpen((open) => !open)}>{closeOpen ? 'Ocultar cierre diario' : 'Cierre diario'}</button>}
      </header>
    {view !== 'Seguimientos' && <section className="agenda-filters"><input aria-label="Buscar tareas" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar tareas"/><select aria-label="Estado de las tareas" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos</option><option value="PENDIENTE">Pendientes</option><option value="EN_PROCESO">En proceso</option><option value="TERMINADA">Terminadas</option></select><button className="agenda-primary" onClick={() => void load()}>Filtrar</button></section>}
    <div className="agenda-tasks-body">
    <AgendaFollowupsView active={view === 'Seguimientos'} refreshRevision={followupsRevision} onOpenTask={id => void open(id)} />

    {view === 'Seguimientos' ? null : view === 'Semana' ? <>
      <div className="agenda-week-toolbar"><button onClick={() => setWeek((date) => addDays(date, -7))}>Semana anterior</button><strong>{dateLabel(days[0]!)} – {dateLabel(days[6]!)}</strong><button onClick={() => setWeek((date) => addDays(date, 7))}>Semana siguiente</button><button onClick={() => setWeek(weekStart(today()))}>Volver a hoy</button></div>
      <section className="agenda-week" aria-label="Tareas de la semana">{grouped.map(({ date, timed, untimed }) => <article className="agenda-week-day" key={date}><h2>{dateLabel(date)}</h2>{timed.map((task) => renderTaskRow(task, () => void open(task.id)))}{untimed.length > 0 && <div className="agenda-untimed"><h3>Sin hora</h3>{untimed.map((task) => renderTaskRow(task, () => void open(task.id)))}</div>}{timed.length + untimed.length === 0 && <p className="agenda-empty">Sin tareas</p>}</article>)}</section>
    </> : <section className="agenda-list agenda-panel" aria-label="Tareas" aria-busy={loading}>{loading && <div className="agenda-empty">Cargando…</div>}{!loading && !error && visible.length === 0 && <p className="agenda-empty">No hay tareas para esta vista.</p>}{visible.map((task) => renderTaskRow(task, () => void open(task.id)))}</section>}
    </div>
    </section>
    <aside className="agenda-sidebar" aria-label="Prioridades y calendario">
      <section className="agenda-panel agenda-top-panel" aria-label="Mi Top 3 del día">
        <div className="agenda-panel-heading"><h2><ListChecks size={15} aria-hidden="true" />Mi Top 3</h2><span>{topToday()}</span></div>
        {loading ? <p>Cargando Top 3…</p> : error ? <p>Top 3 no disponible.</p> : <ol>{[1, 2, 3].map(position => {
          const item = summary?.top_3?.find((entry: any) => Number(entry.posicion) === position);
          return <li key={position}><span className="agenda-top-position" aria-label={`Posición ${position}`}>{position}</span>{item ? <button type="button" onClick={() => void open(Number(item.tarea_id))}>{item.titulo}</button> : <span className="agenda-top-free">Libre</span>}</li>;
        })}</ol>}
        <div className="agenda-sidebar-followups"><span>Seguimientos para hoy</span><button type="button" onClick={() => setView('Seguimientos')} aria-label="Ver seguimientos">{loading || error ? '—' : summary?.seguimientos_hoy ?? '—'}<ChevronRight size={12} aria-hidden="true" /></button></div>
      </section>
      <TaskCalendar tasks={calendarTasks} scope={loading ? 'Cargando fechas…' : error ? 'Fechas no disponibles' : scopeLabel} />
    </aside>
    </div>
    <section className="agenda-upcoming" aria-label="Próximas tareas programadas">
      <header><h2><CalendarDays size={15} aria-hidden="true" />Próximas tareas</h2><span>{scopeLabel}</span></header>
      <div className="agenda-upcoming-items">
        {upcoming.map(task => <button type="button" className="agenda-upcoming-item" key={task.id} onClick={() => void open(task.id)}>
          <span className="agenda-upcoming-date"><small>{dateLabel(task.fecha_prevista).split(',')[0]?.slice(0, 3)}</small><strong>{Number(task.fecha_prevista.slice(8, 10))}</strong></span>
          <span className="agenda-upcoming-copy"><strong>{task.titulo}</strong><span><em className="agenda-status" data-status={task.estado}>{statusLabels[task.estado] ?? task.estado}</em><small><Clock3 size={10} aria-hidden="true" />{task.hora_inicio || task.fecha_prevista}</small></span></span>
        </button>)}
        {!upcoming.length && <p className="agenda-upcoming-empty">{loading ? 'Cargando tareas…' : error ? 'No fue posible consultar las próximas tareas.' : view === 'Seguimientos' ? 'Abre Mi día, Bandeja o Semana para consultar tareas programadas.' : 'No hay tareas próximas en los resultados de esta vista.'}</p>}
      </div>
    </section>

    {closeOpen && <form className="agenda-close-panel" onSubmit={saveClose}><h2>Cierre diario · {today()}</h2>{closeError && <div className="agenda-error" role="alert">{closeError}{!closeLoaded && <button type="button" disabled={closeLoading} onClick={() => setCloseAttempt(value => value + 1)}>Reintentar carga</button>}</div>}{closeLoading ? <p>Recuperando cierre guardado…</p> : <>
      <label>Resumen del día<textarea value={closeForm.resumen_dia} onChange={(event) => setCloseForm((form) => ({ ...form, resumen_dia: event.target.value }))}/></label>
      <label>Observaciones<textarea value={closeForm.observaciones} onChange={(event) => setCloseForm((form) => ({ ...form, observaciones: event.target.value }))}/></label>
      <h3>Tareas del día</h3>{closeTasks.map((task) => <label className="agenda-close-task" key={task.id}><span>{task.titulo}</span><select value={closeForm.clasificaciones[String(task.id)] ?? ''} onChange={(event) => setCloseForm((form) => ({ ...form, clasificaciones: { ...form.clasificaciones, [String(task.id)]: event.target.value } }))}><option value="">Sin clasificar</option>{task.estado === 'TERMINADA' && <option value="TERMINADA">Terminada</option>}{['PENDIENTE','EN_PROCESO'].includes(task.estado) && <option value="PENDIENTE">Pendiente</option>}{task.estado === 'REPROGRAMADA' && <option value="REPROGRAMADA">Reprogramada</option>}</select></label>)}
      <div className="agenda-actions"><button className="agenda-primary" disabled={closeSaving || !closeLoaded}>{closeSaving ? 'Guardando…' : 'Guardar cierre'}</button></div>
    </>}</form>}

    {detail && (
      addingFollowup ? <div className="agenda-overlay"><AgendaTaskFollowupForm key={detail.id} task={detail} onSaved={(item, payload) => void afterFollowup(item, payload)} onCancel={() => { setAddingFollowup(false); setParticipantsDirty(false); }} onClose={closeDetail} onDirtyChange={setParticipantsDirty} onSavingChange={saving => { followupSaving.current = saving; }} /></div>
        : editing ? <div className="agenda-overlay"><AgendaTaskEditForm task={detail} onSaved={after} onCancel={() => setEditing(false)} /></div>
        : assigning ? <div className="agenda-overlay"><AgendaTaskAssignForm task={detail} onSaved={after} onCancel={() => setAssigning(false)} /></div>
          : managingParticipants ? <div className="agenda-overlay"><AgendaTaskParticipantsForm task={detail} onSaved={afterParticipants} onCancel={() => { setManagingParticipants(false); setParticipantsDirty(false); }} onDirtyChange={setParticipantsDirty} /></div>
          : rescheduling ? <div className="agenda-overlay"><AgendaTaskRescheduleForm task={detail} onSaved={(task) => void afterTaskAction(task, 'Tarea reprogramada')} onCancel={() => { setRescheduling(false); setParticipantsDirty(false); }} onClose={closeDetail} onDirtyChange={setParticipantsDirty} /></div>
          : cancelling ? <div className="agenda-overlay"><AgendaTaskCancelForm task={detail} onSaved={(task) => void afterTaskAction(task, 'Tarea cancelada')} onCancel={() => { setCancelling(false); setParticipantsDirty(false); }} onClose={closeDetail} onDirtyChange={setParticipantsDirty} /></div>
          : confirmingTransition ? <div className="agenda-overlay"><AgendaTaskTransitionConfirm task={detail} kind={confirmingTransition} onSaved={(task) => void afterTaskAction(task, confirmingTransition === 'START' ? 'Tarea iniciada' : confirmingTransition === 'COMPLETE' ? 'Tarea terminada' : 'Tarea reabierta')} onCancel={() => setConfirmingTransition(null)} onReload={reloadTaskDetail} /></div>
                : <div className="agenda-overlay"><aside className="agenda-drawer">
                  <div className="agenda-drawer-toolbar" onClickCapture={event => { if (!leaveTop()) { event.preventDefault(); event.stopPropagation(); } }}>
                    <button onClick={closeDetail}>Cerrar</button>
                    {canAddAgendaFollowup(user?.permissions ?? []) && <button onClick={() => setAddingFollowup(true)}>Agregar seguimiento</button>}
                    {can('agenda.update') && <button onClick={() => setEditing(true)}>Editar</button>}
                    {can('agenda.assign') && <button onClick={() => setAssigning(true)}>Cambiar responsable</button>}
                    {can('agenda.update') && <button onClick={() => setManagingParticipants(true)}>Administrar participantes</button>}
                    {canRescheduleAgendaTask(detail.estado, user?.permissions ?? []) && <button onClick={() => setRescheduling(true)}>Reprogramar tarea</button>}
                    {canCancelAgendaTask(detail.estado, user?.permissions ?? []) && <button onClick={() => setCancelling(true)}>Cancelar tarea</button>}
                    {canStartAgendaTask(detail.estado, user?.permissions ?? []) && <button onClick={() => setConfirmingTransition('START')}>Iniciar</button>}
                    {canCompleteAgendaTask(detail.estado, user?.permissions ?? []) && <button onClick={() => setConfirmingTransition('COMPLETE')}>Terminar</button>}
                    {canReopenAgendaTask(detail.estado, user?.permissions ?? []) && <button onClick={() => setConfirmingTransition('REOPEN')}>Reabrir</button>}
                  </div>
                  <AgendaTaskTopThree key={detail.id} taskId={detail.id} permissions={user?.permissions ?? []} onSaved={snapshot => void afterTop(snapshot)} onStateChange={state => { topPending.current = state; }} />
                  <h2>{detail.titulo}</h2>
                  <p>{detail.descripcion || 'Sin descripción'}</p>
                  <p>{detail.tipo} · {detail.prioridad} · {detail.estado}</p>
                  <p>Responsable: {detail.responsable_nombre}<br />Creador: {detail.creador_nombre}<br />Fecha: {detail.fecha_prevista}<br />Límite: {detail.fecha_limite || '—'}</p>
                  {detail.estado === 'CANCELADA' && detail.motivo_cancelacion && <p>Motivo de cancelación: {detail.motivo_cancelacion}</p>}
                  {detail.estado === 'REPROGRAMADA' && detail.motivo_reprogramacion && <p>Motivo de reprogramación: {detail.motivo_reprogramacion}</p>}
                  {detail.fecha_terminacion && <p>Fecha de terminación: {detail.fecha_terminacion}</p>}
                  <h3>Participantes</h3>
                  <p><strong>{detail.responsable_nombre}</strong> · Responsable principal</p>
                  {detail.participantes?.map((participant) => <p key={participant.id}>{participant.nombre ?? participant.nombre_completo} · {participant.rol || 'Rol no disponible'}</p>)}
                  <h3>Historial</h3>
                  {detail.seguimientos?.map((item) => <FollowupEntry key={item.id} item={item} />)}
                  <h3>Seguimientos</h3>
                  {detail.seguimientos?.filter(item => manualFollowupTypes.includes(item.tipo)).map(item => <FollowupEntry key={item.id} item={item} />)}
                  <h3>Reprogramaciones</h3>
                  {detail.reprogramaciones?.map((item) => <p key={item.id}>{item.fecha_anterior} → {item.fecha_nueva} · {item.comentario || ''}</p>)}
                  <h3>Asignaciones</h3>
                  {detail.asignaciones?.map((item) => <p key={item.id}>{item.responsable_anterior_id || '—'} → {item.responsable_nuevo_id} · {item.motivo || ''}</p>)}
                </aside></div>
    )}  </main>;
}
