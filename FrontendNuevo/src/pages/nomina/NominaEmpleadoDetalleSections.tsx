import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useCompanyContext } from "../../context/CompanyContext";
import { getAllNominaMovimientos, getNominaDesprendibles, getNominaNovedadTurnosOperativos, getRevisionOperativa, openNominaDesprendible } from "../../services/nominaApi";
import type { AjusteManualApi, NominaDesprendibleApi, NominaEmpleadoApi, NominaMovimientoApi, NominaNovedadApi, NominaNovedadTurnoOperativoApi, NominaPeriodoApi, RevisionOperativaApi } from "../../types/nomina.types";

const money = (value: number | null | undefined) => value == null ? "No disponible" : new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);
const date = (value?: string | null) => value ? value.slice(0, 10) : "No disponible";

export default function NominaEmpleadoDetalleSections({ employee, period, novedades, novedadesLoading, novedadesError, ajustesError, ajustes, onRetry, onViewSupport }: {
  employee: NominaEmpleadoApi; period: NominaPeriodoApi; novedades: NominaNovedadApi[];
  novedadesLoading: boolean; novedadesError: string | null; ajustesError: string | null; ajustes: AjusteManualApi[];
  onRetry: () => void; onViewSupport: (id: string) => Promise<void>;
}) {
  const { user } = useAuth();
  const { empresaId } = useCompanyContext();
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [turns, setTurns] = useState<NominaNovedadTurnoOperativoApi[]>([]);
  const [movements, setMovements] = useState<NominaMovimientoApi[]>([]);
  const [reviews, setReviews] = useState<RevisionOperativaApi[]>([]);
  const [slips, setSlips] = useState<NominaDesprendibleApi[]>([]);
  const [openError, setOpenError] = useState("");
  const canReadSlips = user?.permissions.includes("nomina.desprendibles.read") === true;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrors({});
    setTurns([]); setMovements([]); setReviews([]); setSlips([]);
    const filters = { periodo_id: period.id, nomina_empleado_id: employee.id };
    async function allTurns() {
      const first = await getNominaNovedadTurnosOperativos({ ...filters, page: 1, limit: 500 });
      const items = [...first.items];
      for (let page = 2; page <= first.pagination.total_pages; page++) {
        if (cancelled) return [];
        items.push(...(await getNominaNovedadTurnosOperativos({ ...filters, page, limit: 500 })).items);
      }
      return items.filter(item => String(item.periodo_id) === String(period.id) && String(item.nomina_empleado_id) === String(employee.id));
    }
    void Promise.allSettled([
      allTurns(), getAllNominaMovimientos(filters), getRevisionOperativa(period.id),
      canReadSlips ? getNominaDesprendibles(period.id, { include_versiones: true }) : Promise.resolve([]),
    ]).then(([t, m, r, d]) => {
      if (cancelled) return;
      if (t.status === "fulfilled") setTurns(t.value);
      if (m.status === "fulfilled") setMovements(m.value.items.filter(item => String(item.nomina_empleado_id) === String(employee.id) && String(item.periodo_id) === String(period.id)));
      if (r.status === "fulfilled") setReviews(r.value.filter(item => String(item.nomina_empleado_id) === String(employee.id) && String(item.periodo_id) === String(period.id)));
      if (d.status === "fulfilled") setSlips(d.value.filter(item => String(item.nomina_empleado_id) === String(employee.id) && String(item.periodo_id) === String(period.id)));
      const nextErrors: Record<string, string> = {};
      [t, m, r, d].forEach((result, index) => {
        if (result.status === "rejected") nextErrors[["turnos", "movimientos", "revision", "desprendibles"][index]!] = result.reason instanceof Error ? result.reason.message : "Consulta no disponible";
      });
      setErrors(nextErrors);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [employee.id, period.id, empresaId, canReadSlips, retry]);

  const errorFor = (key: string) => errors[key] ? <p role="alert">{errors[key]} <button type="button" onClick={() => setRetry(value => value + 1)}>Reintentar</button></p> : null;
  const revision = reviews[0];
  return <div className="nomina-employee-detail-sections">
    <section><h2>Novedades del período</h2>
      {novedadesLoading ? <p role="status">Cargando novedades...</p> : novedadesError ? <p role="alert">{novedadesError} <button onClick={onRetry}>Reintentar</button></p> : novedades.length === 0 ? <p>Sin novedades registradas.</p> : <div className="nomina-employee-detail-records">{novedades.map(n => <article key={n.id}>
        <h3>{n.tipo_novedad.codigo_operativo ?? n.tipo_novedad.nombre}</h3>
        <p>{date(n.fecha_inicio)} — {date(n.fecha_fin ?? n.fecha_inicio)} · Días: {n.dias ?? "No disponible"}</p>
        <p>{n.activo ? n.revisado ? "Revisada" : "Pendiente" : "Anulada"}</p>
        {n.observacion ? <p>{n.observacion}</p> : null}
        {n.documento_persona_id || n.documentos?.SOPORTE?.cargado ? <button type="button" onClick={() => void onViewSupport(n.id)}>Ver soporte</button> : <small>Sin soporte registrado</small>}
      </article>)}</div>}
    </section>
    <section><h2>Turnos del período</h2>
      {loading ? <p role="status">Cargando turnos...</p> : errors.turnos ? errorFor("turnos") : turns.length === 0 ? <p>Sin turnos operativos registrados.</p> : <div className="nomina-employee-detail-records">{turns.map(turn => <article key={turn.id}>
        <h3>{turn.tipo_turno === "INTERNO" ? "Interno" : "Externo"} · {date(turn.fecha_inicio ?? turn.fecha)} — {date(turn.fecha_fin ?? turn.fecha)}</h3>
        <p>Persona cubierta: {turn.trabajador_reemplazado ?? "No disponible"}</p><p>Modalidad: {turn.modalidad ?? "No disponible"}</p>
        <strong>{money(turn.movimiento_valor_aplicado ?? turn.movimiento_valor_calculado)}</strong><p>{turn.activo ? turn.estado : "Inactivo"}</p>
      </article>)}</div>}
    </section>
    <section><h2>Otras deducciones registradas</h2>
      {loading ? <p>Cargando movimientos...</p> : errors.movimientos ? errorFor("movimientos") : <div className="nomina-employee-detail-records">{movements.filter(m => m.es_deduccion).map(m => <article key={m.id}><h3>{m.descripcion ?? m.tipo_movimiento}</h3><strong>{money(m.valor_total)}</strong><p>{date(m.fecha)} · {m.activo ? "Activo" : "Inactivo"}</p></article>)}{!movements.some(m => m.es_deduccion) ? <p>Sin movimientos de deducción adicionales.</p> : null}</div>}
    </section>
    <section><h2>Ajustes manuales y trazabilidad</h2>
      {ajustesError ? <p role="alert">{ajustesError} <button type="button" onClick={onRetry}>Reintentar</button></p> : ajustes.length === 0 ? <p>Sin ajustes manuales cargados.</p> : <div className="nomina-employee-detail-records">{ajustes.map(a => <article key={a.id}><h3>{a.concepto}</h3><p>{a.tipo} · {a.activo ? "Activo" : "Anulado"}</p><strong>{money(a.valor)}</strong>{a.observacion ? <p>{a.observacion}</p> : null}<p>Creado: {date(a.created_at)} · Responsable: {a.created_by}</p><p>Actualizado: {date(a.updated_at)}</p>{a.anulado_at ? <p>Anulado: {date(a.anulado_at)} · {a.motivo_anulacion}</p> : null}</article>)}</div>}
    </section>
    <section><h2>Revisión</h2>{loading ? <p>Cargando revisión...</p> : errors.revision ? errorFor("revision") : <><strong>{revision?.estado_revision ?? (employee.revisado ? "REVISADO" : "PENDIENTE")}</strong>{revision?.revisado_at ? <p>{date(revision.revisado_at)} · Responsable: {revision.revisado_por ?? "No disponible"}</p> : null}{revision?.motivo_invalidacion ? <p>{revision.motivo_invalidacion}</p> : null}</>}<p>Creación de la nómina: {date(employee.created_at)}</p></section>
    <section><h2>Desprendibles</h2>{!canReadSlips ? <p>Consulta de desprendibles no habilitada para este usuario.</p> : loading ? <p>Cargando desprendibles...</p> : errors.desprendibles ? errorFor("desprendibles") : slips.length === 0 ? <p>Sin desprendible generado.</p> : slips.map(slip => <article key={slip.id}><p>{slip.estado} · Generado: {date(slip.fecha_generacion)}</p>{slip.es_vigente ? <button type="button" onClick={() => { setOpenError(""); void openNominaDesprendible(period.id, employee.vinculacion_id).catch(e => setOpenError(e instanceof Error ? e.message : "No fue posible abrir el desprendible")); }}>Ver desprendible</button> : <small>Version historica</small>}</article>)}{openError ? <p role="alert">{openError}</p> : null}</section>
  </div>;
}
