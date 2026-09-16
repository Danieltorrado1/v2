import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useCompanyContext } from '../../../context/CompanyContext';
import { agendaApi } from '../../../services/agendaApi';
import { followupTimestamp } from '../agendaFollowup.domain';
import { classificationLabels, followupContext, followupEmptyMessage, followupLimits, followupsError, FollowupsListState, hasFollowupFilters, relatedFollowupTask, totalFollowupPages, type FollowupFilters, type FollowupPage, type FollowupRecord } from '../agendaFollowupsView.domain';
import './AgendaFollowupsView.css';
const dataOf = <T,>(response: any): T => response?.data?.data ?? response?.data ?? response;
const taskTypes = ['TALENTO_HUMANO','COBERTURA','NOMINA','DOCUMENTOS','SST','REMISIONES','CONTRATOS','ADMINISTRATIVA','OTRA'];
const modules = ['PERSONAL','COBERTURA','NOMINA','DOCUMENTOS','SST','REMISIONES','CONTRATOS','ADMINISTRACION'];
const label = (value: string) => value.replaceAll('_', ' ');
type User = { id: number; nombre_completo: string };

export function FollowupRecordCard({ item, onOpenTask }: { item: FollowupRecord; onOpenTask: (id: number) => void }) {
  const context = followupContext(item.contexto);
  return <article className="agenda-followups-record">
    <div className="agenda-followups-task"><button type="button" onClick={() => relatedFollowupTask(item, onOpenTask)}>{item.titulo}</button>
      <span className={`agenda-followups-classification ${item.clasificacion}`}>{classificationLabels[item.clasificacion]}</span>
      <dl><div><dt>Estado</dt><dd>{label(item.estado)}</dd></div><div><dt>Tipo de tarea</dt><dd>{label(item.tipo_tarea)}</dd></div>{item.modulo_relacionado && <div><dt>Módulo</dt><dd>{label(item.modulo_relacionado)}</dd></div>}</dl>
    </div>
    <div className="agenda-followups-comment"><strong>{label(item.tipo)}</strong>{item.comentario?.trim() && <p>{item.comentario}</p>}
      {item.usuario_registro_nombre && <p>Registrado por: {item.usuario_registro_nombre}</p>}
      {context.length > 0 && <p className="agenda-followups-context">{context.join(' · ')}</p>}
    </div>
    <dl className="agenda-followups-dates">
      {item.responsable_nombre && <div><dt>Responsable actual</dt><dd>{item.responsable_nombre}</dd></div>}
      <div><dt>Fecha del seguimiento</dt><dd><time dateTime={item.created_at}>{followupTimestamp(item.created_at)}</time></dd></div>
      {item.fecha_proxima_seguimiento && <div><dt>Próxima fecha</dt><dd><time dateTime={item.fecha_proxima_seguimiento}>{item.fecha_proxima_seguimiento}</time></dd></div>}
    </dl>
  </article>;
}

function TenantFollowupsView({ active, empresaId, refreshRevision, onOpenTask }: { active: boolean; empresaId: number; refreshRevision: number; onOpenTask: (id: number) => void }) {
  const [model] = useState(() => new FollowupsListState(async params => dataOf<FollowupPage>(await agendaApi.followups({ ...params, empresa_id: empresaId }))));
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
  const [users, setUsers] = useState<User[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [usersAttempt, setUsersAttempt] = useState(0);
  const usersBusy = useRef(false);
  const revision = useRef(refreshRevision);
  useEffect(() => { model.setActive(active); return () => model.setActive(false); }, [model, active]);
  useEffect(() => { if (revision.current !== refreshRevision) { revision.current = refreshRevision; model.refresh(); } }, [model, refreshRevision]);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      usersBusy.current = true; setUsersLoading(true); setUsersError('');
      try { const result = dataOf<User[]>(await agendaApi.users({ empresa_id: empresaId, search: userSearch || undefined, limit: 100 })); if (!cancelled) setUsers(result); }
      catch (error) { if (!cancelled) setUsersError(followupsError(error)); }
      finally { if (!cancelled) { usersBusy.current = false; setUsersLoading(false); } }
    }, userSearch ? 300 : 0);
    return () => { cancelled = true; clearTimeout(timer); usersBusy.current = false; };
  }, [active, empresaId, userSearch, usersAttempt]);
  const filter = (key: keyof FollowupFilters, value: string) => model.setFilter(key, value);
  const total = state.result?.total ?? 0;
  const pages = totalFollowupPages(total, state.limit);
  const options = selectedUser && !users.some(user => Number(user.id) === Number(selectedUser.id)) ? [selectedUser, ...users] : users;
  return <section className="agenda-followups-view" hidden={!active} aria-label="Seguimientos operativos">
    <header><h2>Seguimientos</h2>{state.result?.hoy && <p>Hoy en Bogotá: {state.result.hoy}</p>}</header>
    <div className="agenda-followups-filters">
      <label>Clasificación<select value={state.filters.filtro} onChange={event => filter('filtro', event.target.value)}><option value="">Todas</option>{Object.entries(classificationLabels).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>
      <label>Buscar responsable<input value={userSearch} maxLength={120} onChange={event => setUserSearch(event.target.value)} placeholder="Nombre del responsable"/></label>
      <label>Responsable<select value={state.filters.responsable_id} onChange={event => { const id = event.target.value; filter('responsable_id', id); setSelectedUser(options.find(user => String(user.id) === id) ?? null); }}><option value="">Todos</option>{options.map(user => <option key={user.id} value={user.id}>{user.nombre_completo}</option>)}</select>{usersLoading && <small>Cargando responsables…</small>}</label>
      <label>Tipo de tarea<select value={state.filters.tipo_tarea} onChange={event => filter('tipo_tarea', event.target.value)}><option value="">Todos</option>{taskTypes.map(type => <option key={type} value={type}>{label(type)}</option>)}</select></label>
      <label>Módulo<select value={state.filters.modulo_relacionado} onChange={event => filter('modulo_relacionado', event.target.value)}><option value="">Todos</option>{modules.map(module => <option key={module} value={module}>{module}</option>)}</select></label>
      <label>Desde (fecha del registro)<input type="date" value={state.filters.desde} onChange={event => filter('desde', event.target.value)}/></label>
      <label>Hasta (fecha del registro)<input type="date" value={state.filters.hasta} onChange={event => filter('hasta', event.target.value)}/></label>
      <label>Buscar tarea o comentario<input type="search" value={state.filters.q} maxLength={120} onChange={event => filter('q', event.target.value)} placeholder="Buscar seguimientos"/></label>
      <button type="button" onClick={() => { model.clearFilters(); setUserSearch(''); setSelectedUser(null); }}>Limpiar filtros</button>
    </div>
    {hasFollowupFilters(state.filters) && <p className="agenda-followups-active">Filtros activos</p>}
    {usersError && <div role="alert" className="agenda-error">Responsables: {usersError}<button type="button" disabled={usersLoading} onClick={() => { if (!usersBusy.current) { usersBusy.current = true; setUsersAttempt(value => value + 1); } }}>Reintentar responsables</button></div>}
    {state.error && <div role="alert" className="agenda-error">{state.error}<button type="button" disabled={state.loading} onClick={() => model.retry()}>Reintentar</button></div>}
    {state.loading && <p role="status">{state.loaded ? 'Actualizando seguimientos…' : 'Cargando seguimientos…'}</p>}
    {state.result && state.result.page !== state.page && <p>Se conservan los resultados de la página {state.result.page} mientras se consulta la página {state.page}.</p>}
    <div className="agenda-followups-results" aria-busy={state.loading}>
      {state.result?.items.map(item => <FollowupRecordCard key={item.id} item={item} onOpenTask={onOpenTask}/>)}
      {state.loaded && !state.loading && !state.error && !state.result?.items.length && <p className="agenda-empty">{followupEmptyMessage(state.filters)}</p>}
    </div>
    <nav className="agenda-followups-pagination" aria-label="Paginación de seguimientos">
      <span>{total} registros · Página {state.page} de {pages}</span>
      <label>Por página<select value={state.limit} disabled={state.loading} onChange={event => model.setLimit(Number(event.target.value))}>{followupLimits.map(limit => <option key={limit} value={limit}>{limit}</option>)}</select></label>
      <button type="button" disabled={state.loading || state.page <= 1} onClick={() => model.goPage(state.page - 1)}>Anterior</button>
      <button type="button" disabled={state.loading || state.page >= pages} onClick={() => model.goPage(state.page + 1)}>Siguiente</button>
    </nav>
  </section>;
}
export default function AgendaFollowupsView(props: { active: boolean; refreshRevision: number; onOpenTask: (id: number) => void }) {
  const { empresaId } = useCompanyContext();
  return empresaId ? <TenantFollowupsView key={empresaId} empresaId={empresaId} {...props}/> : props.active ? <p>Selecciona una empresa para consultar seguimientos.</p> : null;
}
