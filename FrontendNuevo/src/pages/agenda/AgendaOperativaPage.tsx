import { useEffect, useMemo, useState } from 'react';
import { agendaApi } from '../../services/agendaApi';
import { useAuth } from '../../context/AuthContext';
import AgendaTaskEditForm from './components/AgendaTaskEditForm';
import AgendaTaskAssignForm from './components/AgendaTaskAssignForm';
import { addDays, closeDayFormFromRecord, closeDayPayload, groupTasksByDate, weekDates, weekStart } from './agendaOperativa.domain';
import './AgendaOperativaPage.css';

type Task = Record<string, any> & { id: number; fecha_prevista: string; hora_inicio?: string | null; titulo: string; tipo: string; responsable_nombre: string; estado: string };
type Detail = Task & { seguimientos: any[]; asignaciones: any[]; reprogramaciones: any[]; participantes: any[] };
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const dataOf = <T,>(response: any): T => response?.data?.data ?? response?.data ?? response;
const dateLabel = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(year!, month! - 1, day!));
};

export default function AgendaOperativaPage() {
  const { user } = useAuth();
  const can = (permission: string) => Boolean(user?.permissions.includes(permission) || user?.permissions.includes('agenda.manage'));
  const [items, setItems] = useState<Task[]>([]);
  const [summary, setSummary] = useState<any>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [view, setView] = useState('Mi día');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [week, setWeek] = useState(() => weekStart(today()));
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeLoading, setCloseLoading] = useState(false);
  const [closeSaving, setCloseSaving] = useState(false);
  const [closeError, setCloseError] = useState('');
  const [closeForm, setCloseForm] = useState({ resumen_dia: '', observaciones: '', clasificaciones: {} as Record<string, string> });

  const load = async () => {
    setLoading(true);
    try {
      const range = view === 'Semana' ? { desde: week, hasta: addDays(week, 6) } : {};
      const [listResponse, summaryResponse] = await Promise.all([
        agendaApi.list<any>({ page: 1, limit: 100, q: query || undefined, estado: status || undefined, ...range }),
        agendaApi.summary(),
      ]);
      const list = dataOf<any>(listResponse);
      setItems(list.items ?? []);
      setSummary(dataOf<any>(summaryResponse));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible cargar Agenda');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [status, view, week]);

  const open = async (id: number) => {
    try {
      setDetail(dataOf<Detail>(await agendaApi.get<Detail>(id)));
      setEditing(false);
      setAssigning(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible cargar el detalle');
    }
  };
  const after = async (task: Record<string, any>) => {
    setDetail((current) => current ? { ...current, ...dataOf<Record<string, any>>(task) } : current);
    setEditing(false);
    setAssigning(false);
    setNotice('Cambios guardados');
    await load();
  };

  useEffect(() => {
    if (!closeOpen) return;
    let active = true;
    setCloseLoading(true);
    setCloseError('');
    agendaApi.getCloseDay<any>(today()).then((response) => {
      if (active) setCloseForm(closeDayFormFromRecord(dataOf(response)));
    }).catch((err) => {
      if (active) setCloseError(err instanceof Error ? err.message : 'No fue posible recuperar el cierre diario');
    }).finally(() => { if (active) setCloseLoading(false); });
    return () => { active = false; };
  }, [closeOpen]);

  const saveClose = async (event: React.FormEvent) => {
    event.preventDefault();
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
      setCloseSaving(false);
    }
  };

  const days = useMemo(() => weekDates(week), [week]);
  const grouped = useMemo(() => groupTasksByDate(items, days), [items, days]);
  const visible = view === 'Mi día' ? items.filter((task) => task.fecha_prevista === today()) : items;

  return <main className="agenda-page">
    <header><div><span className="agenda-eyebrow">OPERACIÓN · AGENDA</span><h1>Agenda Operativa</h1></div></header>
    {error && <div className="agenda-error" role="alert">{error}</div>}
    {notice && <div className="agenda-notice" role="status">{notice}</div>}
    <section className="agenda-summary">{[['Pendientes', summary?.pendientes], ['Para hoy', summary?.para_hoy], ['Vencidas', summary?.vencidas], ['Terminadas', summary?.terminadas]].map((item) => <article key={String(item[0])}><span>{item[0]}</span><strong>{loading ? '—' : item[1]}</strong></article>)}</section>
    <nav className="agenda-tabs">{['Mi día', 'Bandeja', 'Seguimientos', 'Semana'].map((tab) => <button className={view === tab ? 'active' : ''} key={tab} onClick={() => setView(tab)}>{tab}</button>)}</nav>
    <section className="agenda-filters"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar tareas"/><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos</option><option value="PENDIENTE">Pendientes</option><option value="EN_PROCESO">En proceso</option><option value="TERMINADA">Terminadas</option></select><button onClick={() => void load()}>Filtrar</button><button onClick={() => setCloseOpen((open) => !open)}>{closeOpen ? 'Ocultar cierre diario' : 'Cierre diario'}</button></section>

    {view === 'Semana' ? <>
      <div className="agenda-week-toolbar"><button onClick={() => setWeek((date) => addDays(date, -7))}>Semana anterior</button><strong>{dateLabel(days[0]!)} – {dateLabel(days[6]!)}</strong><button onClick={() => setWeek((date) => addDays(date, 7))}>Semana siguiente</button><button onClick={() => setWeek(weekStart(today()))}>Volver a hoy</button></div>
      <section className="agenda-week" aria-label="Tareas de la semana">{grouped.map(({ date, timed, untimed }) => <article className="agenda-week-day" key={date}><h2>{dateLabel(date)}</h2>{timed.map((task) => <button className="agenda-task" key={task.id} onClick={() => void open(task.id)}><span><strong>{task.titulo}</strong><small>{task.hora_inicio} · {task.tipo} · {task.responsable_nombre}</small></span><em>{task.estado}</em></button>)}{untimed.length > 0 && <div className="agenda-untimed"><h3>Sin hora</h3>{untimed.map((task) => <button className="agenda-task" key={task.id} onClick={() => void open(task.id)}><span><strong>{task.titulo}</strong><small>{task.tipo} · {task.responsable_nombre}</small></span><em>{task.estado}</em></button>)}</div>}{timed.length + untimed.length === 0 && <p className="agenda-empty">Sin tareas</p>}</article>)}</section>
    </> : <section className="agenda-list agenda-panel">{loading && <div className="agenda-empty">Cargando…</div>}{visible.map((task) => <button className="agenda-task" key={task.id} onClick={() => void open(task.id)}><span><strong>{task.titulo}</strong><small>{task.tipo} · {task.responsable_nombre}</small></span><em>{task.estado}</em></button>)}</section>}

    {closeOpen && <form className="agenda-close-panel" onSubmit={saveClose}><h2>Cierre diario · {today()}</h2>{closeError && <div className="agenda-error" role="alert">{closeError}</div>}{closeLoading ? <p>Recuperando cierre guardado…</p> : <>
      <label>Resumen del día<textarea value={closeForm.resumen_dia} onChange={(event) => setCloseForm((form) => ({ ...form, resumen_dia: event.target.value }))}/></label>
      <label>Observaciones<textarea value={closeForm.observaciones} onChange={(event) => setCloseForm((form) => ({ ...form, observaciones: event.target.value }))}/></label>
      <h3>Tareas del día</h3>{items.filter((task) => task.fecha_prevista === today()).map((task) => <label className="agenda-close-task" key={task.id}><span>{task.titulo}</span><select value={closeForm.clasificaciones[String(task.id)] ?? ''} onChange={(event) => setCloseForm((form) => ({ ...form, clasificaciones: { ...form.clasificaciones, [String(task.id)]: event.target.value } }))}><option value="">Sin clasificar</option><option value="TERMINADA">Terminada</option><option value="PENDIENTE">Pendiente</option><option value="REPROGRAMADA">Reprogramada</option></select></label>)}
      <div className="agenda-actions"><button className="agenda-primary" disabled={closeSaving}>{closeSaving ? 'Guardando…' : 'Guardar cierre'}</button></div>
    </>}</form>}

    {detail && (editing ? <div className="agenda-overlay"><AgendaTaskEditForm task={detail} onSaved={after} onCancel={() => setEditing(false)}/></div> : assigning ? <div className="agenda-overlay"><AgendaTaskAssignForm task={detail} onSaved={after} onCancel={() => setAssigning(false)}/></div> : <div className="agenda-overlay"><aside className="agenda-drawer"><div className="agenda-drawer-toolbar"><button onClick={() => setDetail(null)}>Cerrar</button>{can('agenda.update') && <button onClick={() => setEditing(true)}>Editar</button>}{can('agenda.assign') && <button onClick={() => setAssigning(true)}>Cambiar responsable</button>}</div><h2>{detail.titulo}</h2><p>{detail.descripcion || 'Sin descripción'}</p><p>{detail.tipo} · {detail.prioridad} · {detail.estado}</p><p>Responsable: {detail.responsable_nombre}<br/>Creador: {detail.creador_nombre}<br/>Fecha: {detail.fecha_prevista}<br/>Límite: {detail.fecha_limite || '—'}</p><h3>Asignaciones</h3>{detail.asignaciones?.map((item) => <p key={item.id}>{item.responsable_anterior_id || '—'} → {item.responsable_nuevo_id} · {item.motivo || ''}</p>)}</aside></div>)}
  </main>;
}
