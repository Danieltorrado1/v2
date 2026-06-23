import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { evaluacionesApi } from "../../services/evaluacionesApi";
import { personasApi, type Persona } from "../../services/personasApi";
import { getArray, getNumber, getString, fmtNum, fmtPercent, fmtDateLoose } from "../../lib/payloadHelpers";

// Empresa/contrato fijos hasta que exista un selector de empresa/contrato (fase futura).
const TENANT_PARAMS = { empresa_id: 1, contrato_id: 3 };
const LIST_PARAMS = { ...TENANT_PARAMS, limit: 100 };

// ── Mocks de respaldo — uno por tab, usados solo si su endpoint falla ────────
const MOCK_DASHBOARD_GENERAL = {
  evaluaciones_total: 10,
  pendientes: 3,
  en_proceso: 2,
  finalizadas: 5,
  promedio_general: 3.8,
  cumplimiento_desempeno: 76,
  planes_mejora_total: 4,
  planes_en_proceso: 2,
  planes_vencidos: 1,
};

const MOCK_EVALUACIONES_PERSONA = [
  { id: 1, evaluacion: { nombre_evaluacion: "Evaluación semestral 2026-1", fecha_inicio: "2026-01-01", fecha_fin: "2026-06-30" }, persona: { nombre: "María Fernanda Torres Ospina" }, estado: "FINALIZADA", calificacion_total: 4.2 },
  { id: 2, evaluacion: { nombre_evaluacion: "Evaluación semestral 2026-1", fecha_inicio: "2026-01-01", fecha_fin: "2026-06-30" }, persona: { nombre: "Carmen Alicia Ruiz Moreno" }, estado: "EN_PROCESO", calificacion_total: null },
  { id: 3, evaluacion: { nombre_evaluacion: "Evaluación semestral 2026-1", fecha_inicio: "2026-01-01", fecha_fin: "2026-06-30" }, persona: { nombre: "Rosa Elvira Jiménez Castro" }, estado: "PENDIENTE", calificacion_total: null },
];

const MOCK_RANKING = [
  { persona_id: 1, nombre_completo: "María Fernanda Torres Ospina", documento: "1.121.873.256", promedio: 4.6, clasificacion: "EXCELENTE" },
  { persona_id: 2, nombre_completo: "Nohora Stella Ramírez Bernal", documento: "1.118.444.556", promedio: 4.1, clasificacion: "BUENO" },
  { persona_id: 3, nombre_completo: "Carmen Alicia Ruiz Moreno", documento: "1.008.342.114", promedio: 3.4, clasificacion: "ACEPTABLE" },
];

const MOCK_PLANES_MEJORA = [
  { id: 1, persona_id: 1, persona_nombre: "Operario de Prueba", objetivo: "Mejorar manejo de inventario", responsable: "Coordinador de área", fecha_compromiso: "2026-07-15", progreso_actual: 40, estado: "EN_PROCESO" },
  { id: 2, persona_id: 2, persona_nombre: "Betty Josefina Herrera Pinto", objetivo: "Capacitación en atención al cliente", responsable: "Líder de equipo", fecha_compromiso: "2026-05-01", progreso_actual: 100, estado: "CERRADO" },
];

const MOCK_ALERTAS = [
  { id: "1", tipo_alerta: "PLAN_MEJORA_VENCIDO", severidad: "CRITICA", titulo: "Plan de mejora vencido: Mejorar manejo de inventario", descripcion: "El plan de mejora superó la fecha de compromiso", fecha: "2026-06-05" },
  { id: "2", tipo_alerta: "EVALUACION_PENDIENTE", severidad: "MEDIA", titulo: "Evaluación pendiente: Evaluación semestral 2026-1", descripcion: "Evaluación pendiente de cierre", fecha: "2026-06-12" },
  { id: "3", tipo_alerta: "EVALUACION_BAJO_DESEMPENO", severidad: "ALTA", titulo: "Bajo desempeño: Evaluación semestral 2026-1", descripcion: "Calificacion actual 2.5", fecha: "2026-06-15" },
];

type RowStatus = "loading" | "ready";
type DataSource = "real" | "fallback";

interface ListState {
  status: RowStatus;
  items: unknown[];
  source: DataSource;
}

interface DashboardState {
  status: RowStatus;
  data: unknown;
  source: DataSource;
}

// ── Hooks de datos — cada tab se resuelve de forma independiente ────────────
function useEvaluacionesList(fetcher: () => Promise<unknown>, mockItems: unknown[], label: string): ListState {
  const [state, setState] = useState<ListState>({ status: "loading", items: [], source: "real" });

  useEffect(() => {
    let active = true;
    fetcher()
      .then(res => {
        if (!active) return;
        setState({ status: "ready", items: getArray(res, ["items"]), source: "real" });
      })
      .catch(error => {
        if (!active) return;
        console.warn(`[evaluaciones] ${label} no disponible, usando fallback mock:`, error);
        setState({ status: "ready", items: mockItems, source: "fallback" });
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}

function personaNombreCompleto(p: Persona): string | null {
  const partes = [p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido].filter(Boolean);
  return partes.length > 0 ? partes.join(" ") : null;
}

// Planes de mejora no incluye el nombre de la persona en el listado — se
// enriquece con GET /personas/:id (endpoint real ya usado como fallback en
// personasApi). Si la resolución falla para alguna fila, esa fila simplemente
// muestra el persona_id sin bloquear el resto de la tabla.
function usePlanesMejora(): ListState {
  const [state, setState] = useState<ListState>({ status: "loading", items: [], source: "real" });

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const res = await evaluacionesApi.getPlanesMejora(LIST_PARAMS);
        const items = getArray(res, ["items"]);
        const personaIds = Array.from(new Set(
          items.map(item => getNumber(item, ["persona_id"])).filter((id): id is number => id !== null)
        ));

        const personaEntries = await Promise.all(
          personaIds.map(id => personasApi.getById(id).then(persona => [id, persona] as const).catch(() => [id, null] as const))
        );
        const personaMap = new Map(personaEntries);

        const enriched = items.map(item => {
          const personaId = getNumber(item, ["persona_id"]);
          const persona = personaId !== null ? personaMap.get(personaId) : null;
          return {
            ...(item as Record<string, unknown>),
            persona_nombre: persona ? personaNombreCompleto(persona) : null,
            persona_documento: persona?.numero_documento ?? null,
          };
        });

        if (!active) return;
        setState({ status: "ready", items: enriched, source: "real" });
      } catch (error) {
        if (!active) return;
        console.warn("[evaluaciones] planes-mejora no disponible, usando fallback mock:", error);
        setState({ status: "ready", items: MOCK_PLANES_MEJORA, source: "fallback" });
      }
    })();

    return () => { active = false; };
  }, []);

  return state;
}

function useEvaluacionesDashboard(fetcher: () => Promise<unknown>, mockData: unknown, label: string): DashboardState {
  const [state, setState] = useState<DashboardState>({ status: "loading", data: null, source: "real" });

  useEffect(() => {
    let active = true;
    fetcher()
      .then(data => {
        if (!active) return;
        setState({ status: "ready", data, source: "real" });
      })
      .catch(error => {
        if (!active) return;
        console.warn(`[evaluaciones] ${label} no disponible, usando fallback mock:`, error);
        setState({ status: "ready", data: mockData, source: "fallback" });
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}

// ── UI compartida ────────────────────────────────────────────────────────────
function estadoBadgeClass(estado: string | null): string {
  if (!estado) return "bg-secondary text-muted-foreground border-border";
  const v = estado.toLowerCase();
  if (/(critic|vencid|deficiente|baja|cancelad)/.test(v)) return "bg-red-50 text-red-700 border-red-200";
  if (/(finalizad|cerrad|excelente|buen|aprobad)/.test(v)) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-amber-50 text-amber-700 border-amber-200"; // pendiente, en_proceso, abierto, aceptable, media...
}

function EstadoBadge({ estado }: { estado: string | null }) {
  if (!estado) return <span className="text-[11px] text-muted-foreground">—</span>;
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded border ${estadoBadgeClass(estado)}`} style={{ fontWeight: 500 }}>
      {estado}
    </span>
  );
}

function SourceBanner({ source, resource }: { source: DataSource; resource: string }) {
  if (source !== "fallback") return null;
  return (
    <p className="text-[10.5px] mb-2" style={{ color: "#f59e0b", fontWeight: 500 }}>
      ● Sin conexión con /{resource} — mostrando datos de ejemplo
    </p>
  );
}

function TableShell({
  state, resource, headers, renderRow, emptyLabel,
}: {
  state: ListState;
  resource: string;
  headers: string[];
  renderRow: (item: unknown, index: number) => React.ReactNode;
  emptyLabel: string;
}) {
  if (state.status === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm">Cargando…</span>
      </div>
    );
  }

  return (
    <div>
      <SourceBanner source={state.source} resource={resource} />
      {state.items.length === 0 ? (
        <div className="bg-card rounded-lg border border-border py-10 text-center text-[12px] text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40">
              <tr className="border-b border-border">
                {headers.map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wide whitespace-nowrap" style={{ fontWeight: 600 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.items.map((item, i) => (
                <tr key={i} className="border-b border-border last:border-b-0 hover:bg-secondary/20 transition-colors">
                  {renderRow(item, i)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <td className={`px-4 py-2.5 text-[12px] text-foreground whitespace-nowrap ${right ? "text-right" : ""}`}>{children ?? "—"}</td>;
}

// ── Resumen — dashboard consolidado ──────────────────────────────────────────
function KpiCard({ label, value, status, source }: { label: string; value: string; status: RowStatus; source: DataSource }) {
  return (
    <div className="bg-card rounded-2xl p-5 flex flex-col gap-3" style={{ boxShadow: "var(--shadow-card)" }}>
      <p className="text-xs text-muted-foreground" style={{ fontWeight: 500 }}>{label}</p>
      {status === "loading" ? (
        <div className="h-7 w-20 rounded-md bg-muted animate-pulse" />
      ) : (
        <p style={{ fontWeight: 700, fontSize: "1.4rem", lineHeight: 1, letterSpacing: "-0.03em" }}>{value}</p>
      )}
      <span
        className="text-[11px]"
        style={{ fontWeight: 500, color: status === "loading" ? "#9ca3af" : source === "fallback" ? "#f59e0b" : "#10b981" }}
      >
        {status === "loading" ? "Cargando…" : source === "fallback" ? "● Estimado (sin datos)" : "● En vivo"}
      </span>
    </div>
  );
}

function ResumenTab() {
  const dashboard = useEvaluacionesDashboard(() => evaluacionesApi.getDashboardGeneral(TENANT_PARAMS), MOCK_DASHBOARD_GENERAL, "dashboard-general");
  const { status, data, source } = dashboard;

  return (
    <div className="space-y-4">
      {source === "fallback" && status === "ready" && (
        <SourceBanner source="fallback" resource="evaluaciones/dashboard-general" />
      )}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Evaluaciones totales" status={status} source={source} value={fmtNum(getNumber(data, ["evaluaciones_total"])) ?? "—"} />
        <KpiCard label="Pendientes" status={status} source={source} value={fmtNum(getNumber(data, ["pendientes"])) ?? "—"} />
        <KpiCard label="En proceso" status={status} source={source} value={fmtNum(getNumber(data, ["en_proceso"])) ?? "—"} />
        <KpiCard label="Finalizadas" status={status} source={source} value={fmtNum(getNumber(data, ["finalizadas"])) ?? "—"} />
        <KpiCard label="Promedio general" status={status} source={source} value={fmtNum(getNumber(data, ["promedio_general"])) ?? "—"} />
        <KpiCard label="Cumplimiento desempeño" status={status} source={source} value={fmtPercent(getNumber(data, ["cumplimiento_desempeno"])) ?? "—"} />
        <KpiCard label="Planes de mejora totales" status={status} source={source} value={fmtNum(getNumber(data, ["planes_mejora_total"])) ?? "—"} />
        <KpiCard label="Planes en proceso" status={status} source={source} value={fmtNum(getNumber(data, ["planes_en_proceso"])) ?? "—"} />
        <KpiCard label="Planes vencidos" status={status} source={source} value={fmtNum(getNumber(data, ["planes_vencidos"])) ?? "—"} />
      </div>
    </div>
  );
}

// ── Evaluaciones (por persona) ───────────────────────────────────────────────
function EvaluacionesTab() {
  const state = useEvaluacionesList(() => evaluacionesApi.getEvaluacionesPersona(LIST_PARAMS), MOCK_EVALUACIONES_PERSONA, "evaluaciones-persona");
  return (
    <TableShell
      state={state}
      resource="evaluaciones/persona"
      headers={["Evaluación", "Persona", "Estado", "Calificación", "Fecha inicio", "Fecha fin"]}
      emptyLabel="No hay evaluaciones registradas"
      renderRow={item => (
        <>
          <Td>{getString(item, ["evaluacion", "nombre_evaluacion"])}</Td>
          <Td>{getString(item, ["persona", "nombre"]) ?? "—"}</Td>
          <td className="px-4 py-2.5"><EstadoBadge estado={getString(item, ["estado"])} /></td>
          <Td right>{fmtNum(getNumber(item, ["calificacion_total"]))}</Td>
          <Td>{fmtDateLoose(getString(item, ["evaluacion", "fecha_inicio"]))}</Td>
          <Td>{fmtDateLoose(getString(item, ["evaluacion", "fecha_fin"]))}</Td>
        </>
      )}
    />
  );
}

// ── Ranking ───────────────────────────────────────────────────────────────────
function RankingTab() {
  const state = useEvaluacionesList(() => evaluacionesApi.getDashboardGeneralRanking({ ...TENANT_PARAMS, limit: 25 }), MOCK_RANKING, "dashboard-general/ranking");
  return (
    <TableShell
      state={state}
      resource="evaluaciones/dashboard-general/ranking"
      headers={["Posición", "Nombre completo", "Documento", "Promedio", "Clasificación"]}
      emptyLabel="No hay datos de ranking disponibles"
      renderRow={(item, i) => (
        <>
          <Td right>{i + 1}</Td>
          <Td>{getString(item, ["nombre_completo"])}</Td>
          <Td>{getString(item, ["documento"]) ?? "—"}</Td>
          <Td right>{fmtNum(getNumber(item, ["promedio"]))}</Td>
          <td className="px-4 py-2.5"><EstadoBadge estado={getString(item, ["clasificacion"])} /></td>
        </>
      )}
    />
  );
}

// ── Planes de mejora ──────────────────────────────────────────────────────────
function PlanesMejoraTab() {
  const state = usePlanesMejora();
  return (
    <TableShell
      state={state}
      resource="evaluaciones/planes-mejora"
      headers={["Persona", "Objetivo", "Responsable", "Fecha compromiso", "Progreso actual", "Estado"]}
      emptyLabel="No hay planes de mejora registrados"
      renderRow={item => {
        const personaId = getNumber(item, ["persona_id"]);
        const personaNombre = getString(item, ["persona_nombre"]) ?? (personaId !== null ? `Persona #${personaId}` : "—");
        const documento = getString(item, ["persona_documento"]);
        return (
          <>
            <td className="px-4 py-2.5">
              <p className="text-[12px] text-foreground" style={{ fontWeight: 500 }}>{personaNombre}</p>
              {documento && <p className="text-[10px] text-muted-foreground">CC {documento}</p>}
            </td>
            <Td>{getString(item, ["objetivo"])}</Td>
            <Td>{getString(item, ["responsable"]) ?? "—"}</Td>
            <Td>{fmtDateLoose(getString(item, ["fecha_compromiso"]))}</Td>
            <Td right>{fmtPercent(getNumber(item, ["progreso_actual"]))}</Td>
            <td className="px-4 py-2.5"><EstadoBadge estado={getString(item, ["estado"])} /></td>
          </>
        );
      }}
    />
  );
}

// ── Alertas ───────────────────────────────────────────────────────────────────
function AlertasTab() {
  const state = useEvaluacionesList(() => evaluacionesApi.getDashboardGeneralAlertas({ ...TENANT_PARAMS, limit: 100 }), MOCK_ALERTAS, "dashboard-general/alertas");
  return (
    <TableShell
      state={state}
      resource="evaluaciones/dashboard-general/alertas"
      headers={["Tipo de alerta", "Severidad", "Título", "Descripción", "Fecha"]}
      emptyLabel="No hay alertas de desempeño activas"
      renderRow={item => (
        <>
          <Td>{getString(item, ["tipo_alerta"])}</Td>
          <td className="px-4 py-2.5"><EstadoBadge estado={getString(item, ["severidad"])} /></td>
          <Td>{getString(item, ["titulo"])}</Td>
          <Td>{getString(item, ["descripcion"])}</Td>
          <Td>{fmtDateLoose(getString(item, ["fecha"]))}</Td>
        </>
      )}
    />
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
type EvalTabId = "resumen" | "evaluaciones" | "ranking" | "planes-mejora" | "alertas";

const TABS: { id: EvalTabId; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "evaluaciones", label: "Evaluaciones" },
  { id: "ranking", label: "Ranking" },
  { id: "planes-mejora", label: "Planes de mejora" },
  { id: "alertas", label: "Alertas" },
];

export function EvaluacionesModule() {
  const [tab, setTab] = useState<EvalTabId>("resumen");

  return (
    <div className="p-6 space-y-5 max-w-none">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: "1.1rem" }}>Evaluación TH</h1>
          <p className="text-muted-foreground text-xs mt-0.5">Evaluación de desempeño, ranking y planes de mejora</p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-card rounded-2xl flex-wrap" style={{ boxShadow: "var(--shadow-card)" }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3.5 py-1.5 rounded-xl text-[13px] transition-all ${tab === t.id ? "bg-foreground text-card" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
              style={{ fontWeight: tab === t.id ? 600 : 400 }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "resumen" && <ResumenTab />}
      {tab === "evaluaciones" && <EvaluacionesTab />}
      {tab === "ranking" && <RankingTab />}
      {tab === "planes-mejora" && <PlanesMejoraTab />}
      {tab === "alertas" && <AlertasTab />}
    </div>
  );
}
