import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { nominaApi } from "../../services/nominaApi";
import { getArray, getNumber, getString, fmtNum, fmtCurrency, fmtDateLoose } from "../../lib/payloadHelpers";

// Empresa/contrato fijos hasta que exista un selector de empresa/contrato (fase futura).
const TENANT_PARAMS = { empresa_id: 1, contrato_id: 3 };
const LIST_PARAMS = { ...TENANT_PARAMS, limit: 100 };

// ── Mocks de respaldo — uno por sub-módulo, usados solo si su endpoint falla ─
const MOCK_VACACIONES = [
  { id: 1, persona_nombre: "Operario de Prueba", persona_documento: "999999999", fecha_inicio_causacion: "2025-01-01", fecha_fin_causacion: "2025-12-31", dias_causados: 15, dias_disfrutados: 5, dias_pendientes: 10, estado: "ABIERTO" },
  { id: 2, persona_nombre: "María Fernanda Torres Ospina", persona_documento: "1.121.873.256", fecha_inicio_causacion: "2025-01-15", fecha_fin_causacion: "2025-12-31", dias_causados: 15, dias_disfrutados: 15, dias_pendientes: 0, estado: "CERRADO" },
];

const MOCK_PRIMA = [
  { id: 1, persona_nombre: "Operario de Prueba", persona_documento: "999999999", periodo: "2026-1", salario_base: 1423500, auxilio_transporte: 100000, valor_prima: 1100000, estado: "PAGADA" },
  { id: 2, persona_nombre: "Carmen Alicia Ruiz Moreno", persona_documento: "1.008.342.114", periodo: "2026-1", salario_base: 1423500, auxilio_transporte: 100000, valor_prima: 761750, estado: "PENDIENTE" },
];

const MOCK_CESANTIAS = [
  { id: 1, persona_nombre: "Operario de Prueba", persona_documento: "999999999", periodo: "2025", valor_cesantias: 1100000, fondo_cesantias: "Porvenir", fecha_consignacion: "2026-02-14", estado: "CONSIGNADA" },
  { id: 2, persona_nombre: "Rosa Elvira Jiménez Castro", persona_documento: "1.120.558.447", periodo: "2025", valor_cesantias: 1423500, fondo_cesantias: "Colfondos", fecha_consignacion: null, estado: "PENDIENTE" },
];

const MOCK_INTERESES = [
  { id: 1, persona_nombre: "Operario de Prueba", persona_documento: "999999999", periodo: "2025", valor_cesantias: 1100000, porcentaje_interes: 6, valor_intereses: 66000, estado: "PAGADO" },
  { id: 2, persona_nombre: "Rosa Elvira Jiménez Castro", persona_documento: "1.120.558.447", periodo: "2025", valor_cesantias: 1423500, porcentaje_interes: 6, valor_intereses: 85410, estado: "PENDIENTE" },
];

const MOCK_LIQUIDACIONES = [
  { id: 1, persona_nombre: "Operario de Prueba", persona_documento: "999999999", fecha_retiro: "2026-05-31", valor_salario_pendiente: 250000, valor_vacaciones: 300000, valor_prima: 150000, valor_cesantias: 200000, valor_intereses_cesantias: 12000, total_devengado: 912000, total_deducciones: 50000, neto_pagar: 862000, estado: "PAGADA" },
  { id: 2, persona_nombre: "Betty Josefina Herrera Pinto", persona_documento: "1.118.444.556", fecha_retiro: "2026-06-30", valor_salario_pendiente: 0, valor_vacaciones: 180000, valor_prima: 0, valor_cesantias: 0, valor_intereses_cesantias: 0, total_devengado: 180000, total_deducciones: 0, neto_pagar: 180000, estado: "BORRADOR" },
];

type RowStatus = "loading" | "ready";
type DataSource = "real" | "fallback";

interface ListState {
  status: RowStatus;
  items: unknown[];
  source: DataSource;
}

interface KpiState {
  status: RowStatus;
  value: number;
  source: DataSource;
}

// ── Hooks de datos — cada sub-módulo se resuelve de forma independiente ─────
function useNominaList(fetcher: () => Promise<unknown>, mockItems: unknown[], label: string): ListState {
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
        console.warn(`[nomina] ${label} no disponible, usando fallback mock:`, error);
        setState({ status: "ready", items: mockItems, source: "fallback" });
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}

function useNominaDashboardValue(fetcher: () => Promise<unknown>, field: string, mockValue: number, label: string): KpiState {
  const [state, setState] = useState<KpiState>({ status: "loading", value: mockValue, source: "real" });

  useEffect(() => {
    let active = true;
    fetcher()
      .then(res => {
        if (!active) return;
        const value = getNumber(res, [field]);
        setState(value === null
          ? { status: "ready", value: mockValue, source: "fallback" }
          : { status: "ready", value, source: "real" });
      })
      .catch(error => {
        if (!active) return;
        console.warn(`[nomina] dashboard "${label}" no disponible, usando fallback:`, error);
        setState({ status: "ready", value: mockValue, source: "fallback" });
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}

// ── UI compartida ────────────────────────────────────────────────────────────
function estadoBadgeClass(estado: string | null): string {
  if (!estado) return "bg-secondary text-muted-foreground border-border";
  if (["PAGADA", "PAGADO", "CONSIGNADA", "CERRADO"].includes(estado)) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (["LIQUIDADA", "LIQUIDADO"].includes(estado)) return "bg-blue-50 text-blue-700 border-blue-200";
  if (["ANULADA", "ANULADO"].includes(estado)) return "bg-red-50 text-red-700 border-red-200";
  return "bg-amber-50 text-amber-700 border-amber-200"; // PENDIENTE, BORRADOR, ABIERTO...
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

function PersonaCell({ item }: { item: unknown }) {
  const nombre = getString(item, ["persona_nombre"]) ?? "—";
  const documento = getString(item, ["persona_documento"]);
  return (
    <td className="px-4 py-2.5">
      <p className="text-[12px] text-foreground" style={{ fontWeight: 500 }}>{nombre}</p>
      {documento && <p className="text-[10px] text-muted-foreground">CC {documento}</p>}
    </td>
  );
}

// ── Resumen — KPIs reales ────────────────────────────────────────────────────
function NominaKpiCard({ label, state, format }: { label: string; state: KpiState; format: "number" | "currency" }) {
  return (
    <div className="bg-card rounded-2xl p-5 flex flex-col gap-3" style={{ boxShadow: "var(--shadow-card)" }}>
      <p className="text-xs text-muted-foreground" style={{ fontWeight: 500 }}>{label}</p>
      {state.status === "loading" ? (
        <div className="h-7 w-24 rounded-md bg-muted animate-pulse" />
      ) : (
        <p style={{ fontWeight: 700, fontSize: "1.5rem", lineHeight: 1, letterSpacing: "-0.03em" }}>
          {format === "currency" ? fmtCurrency(state.value) : fmtNum(state.value)}
        </p>
      )}
      <span
        className="text-[11px]"
        style={{ fontWeight: 500, color: state.status === "loading" ? "#9ca3af" : state.source === "fallback" ? "#f59e0b" : "#10b981" }}
      >
        {state.status === "loading" ? "Cargando…" : state.source === "fallback" ? "● Estimado (sin datos)" : "● En vivo"}
      </span>
    </div>
  );
}

function ResumenTab() {
  const vacacionesDash = useNominaDashboardValue(() => nominaApi.getVacacionesDashboard(TENANT_PARAMS), "solicitudes_pendientes", 3, "vacaciones");
  const primaDash = useNominaDashboardValue(() => nominaApi.getPrimaDashboard(TENANT_PARAMS), "valor_total_pagado", 1100000, "prima");
  const cesantiasDash = useNominaDashboardValue(() => nominaApi.getCesantiasDashboard(TENANT_PARAMS), "valor_total_consignado", 1100000, "cesantías");
  const interesesDash = useNominaDashboardValue(() => nominaApi.getInteresesCesantiasDashboard(TENANT_PARAMS), "valor_total_pagado", 66000, "intereses cesantías");
  const liquidacionesDash = useNominaDashboardValue(() => nominaApi.getLiquidacionesFinalesDashboard(TENANT_PARAMS), "valor_total_pagado", 862000, "liquidaciones finales");

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      <NominaKpiCard label="Vacaciones pendientes" state={vacacionesDash} format="number" />
      <NominaKpiCard label="Prima pagada" state={primaDash} format="currency" />
      <NominaKpiCard label="Cesantías consignadas" state={cesantiasDash} format="currency" />
      <NominaKpiCard label="Intereses pagados" state={interesesDash} format="currency" />
      <NominaKpiCard label="Liquidaciones pagadas" state={liquidacionesDash} format="currency" />
    </div>
  );
}

// ── Tablas por sub-módulo ────────────────────────────────────────────────────
function VacacionesTab() {
  const state = useNominaList(() => nominaApi.getVacaciones(LIST_PARAMS), MOCK_VACACIONES, "vacaciones");
  return (
    <TableShell
      state={state}
      resource="nomina/vacaciones"
      headers={["Persona", "Inicio causación", "Fin causación", "Días causados", "Días disfrutados", "Días pendientes", "Estado"]}
      emptyLabel="No hay solicitudes de vacaciones registradas"
      renderRow={item => (
        <>
          <PersonaCell item={item} />
          <Td>{fmtDateLoose(getString(item, ["fecha_inicio_causacion"]))}</Td>
          <Td>{fmtDateLoose(getString(item, ["fecha_fin_causacion"]))}</Td>
          <Td right>{fmtNum(getNumber(item, ["dias_causados"]))}</Td>
          <Td right>{fmtNum(getNumber(item, ["dias_disfrutados"]))}</Td>
          <Td right>{fmtNum(getNumber(item, ["dias_pendientes"]))}</Td>
          <td className="px-4 py-2.5"><EstadoBadge estado={getString(item, ["estado"])} /></td>
        </>
      )}
    />
  );
}

function PrimaTab() {
  const state = useNominaList(() => nominaApi.getPrima(LIST_PARAMS), MOCK_PRIMA, "prima");
  return (
    <TableShell
      state={state}
      resource="nomina/prima"
      headers={["Persona", "Periodo", "Salario base", "Auxilio transporte", "Valor prima", "Estado"]}
      emptyLabel="No hay registros de prima"
      renderRow={item => (
        <>
          <PersonaCell item={item} />
          <Td>{getString(item, ["periodo"])}</Td>
          <Td right>{fmtCurrency(getNumber(item, ["salario_base"]))}</Td>
          <Td right>{fmtCurrency(getNumber(item, ["auxilio_transporte"]))}</Td>
          <Td right>{fmtCurrency(getNumber(item, ["valor_prima"]))}</Td>
          <td className="px-4 py-2.5"><EstadoBadge estado={getString(item, ["estado"])} /></td>
        </>
      )}
    />
  );
}

function CesantiasTab() {
  const state = useNominaList(() => nominaApi.getCesantias(LIST_PARAMS), MOCK_CESANTIAS, "cesantias");
  return (
    <TableShell
      state={state}
      resource="nomina/cesantias"
      headers={["Persona", "Periodo", "Valor cesantías", "Fondo", "Fecha consignación", "Estado"]}
      emptyLabel="No hay registros de cesantías"
      renderRow={item => (
        <>
          <PersonaCell item={item} />
          <Td>{getString(item, ["periodo"])}</Td>
          <Td right>{fmtCurrency(getNumber(item, ["valor_cesantias"]))}</Td>
          <Td>{getString(item, ["fondo_cesantias"])}</Td>
          <Td>{fmtDateLoose(getString(item, ["fecha_consignacion"]))}</Td>
          <td className="px-4 py-2.5"><EstadoBadge estado={getString(item, ["estado"])} /></td>
        </>
      )}
    />
  );
}

function InteresesTab() {
  const state = useNominaList(() => nominaApi.getInteresesCesantias(LIST_PARAMS), MOCK_INTERESES, "intereses-cesantias");
  return (
    <TableShell
      state={state}
      resource="nomina/intereses-cesantias"
      headers={["Persona", "Periodo", "Valor cesantías", "% Interés", "Valor intereses", "Estado"]}
      emptyLabel="No hay registros de intereses de cesantías"
      renderRow={item => (
        <>
          <PersonaCell item={item} />
          <Td>{getString(item, ["periodo"])}</Td>
          <Td right>{fmtCurrency(getNumber(item, ["valor_cesantias"]))}</Td>
          <Td right>{(() => { const v = getNumber(item, ["porcentaje_interes"]); return v === null ? "—" : `${v}%`; })()}</Td>
          <Td right>{fmtCurrency(getNumber(item, ["valor_intereses"]))}</Td>
          <td className="px-4 py-2.5"><EstadoBadge estado={getString(item, ["estado"])} /></td>
        </>
      )}
    />
  );
}

function LiquidacionesTab() {
  const state = useNominaList(() => nominaApi.getLiquidacionesFinales(LIST_PARAMS), MOCK_LIQUIDACIONES, "liquidaciones-finales");
  return (
    <TableShell
      state={state}
      resource="nomina/liquidaciones-finales"
      headers={["Persona", "Fecha retiro", "Salario pend.", "Vacaciones", "Prima", "Cesantías", "Int. cesantías", "Devengado", "Deducciones", "Neto a pagar", "Estado"]}
      emptyLabel="No hay liquidaciones finales registradas"
      renderRow={item => (
        <>
          <PersonaCell item={item} />
          <Td>{fmtDateLoose(getString(item, ["fecha_retiro"]))}</Td>
          <Td right>{fmtCurrency(getNumber(item, ["valor_salario_pendiente"]))}</Td>
          <Td right>{fmtCurrency(getNumber(item, ["valor_vacaciones"]))}</Td>
          <Td right>{fmtCurrency(getNumber(item, ["valor_prima"]))}</Td>
          <Td right>{fmtCurrency(getNumber(item, ["valor_cesantias"]))}</Td>
          <Td right>{fmtCurrency(getNumber(item, ["valor_intereses_cesantias"]))}</Td>
          <Td right>{fmtCurrency(getNumber(item, ["total_devengado"]))}</Td>
          <Td right>{fmtCurrency(getNumber(item, ["total_deducciones"]))}</Td>
          <Td right>{fmtCurrency(getNumber(item, ["neto_pagar"]))}</Td>
          <td className="px-4 py-2.5"><EstadoBadge estado={getString(item, ["estado"])} /></td>
        </>
      )}
    />
  );
}

// ── Root ────────────────────────────────────────────────────────────────────
type NominaTab = "resumen" | "vacaciones" | "prima" | "cesantias" | "intereses" | "liquidaciones";

const TABS: { id: NominaTab; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "vacaciones", label: "Vacaciones" },
  { id: "prima", label: "Prima" },
  { id: "cesantias", label: "Cesantías" },
  { id: "intereses", label: "Intereses Cesantías" },
  { id: "liquidaciones", label: "Liquidaciones Finales" },
];

export function NominaModule() {
  const [tab, setTab] = useState<NominaTab>("resumen");

  return (
    <div className="p-6 space-y-5 max-w-none">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: "1.1rem" }}>Nómina</h1>
          <p className="text-muted-foreground text-xs mt-0.5">Vacaciones, prima, cesantías, intereses y liquidaciones finales</p>
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
      {tab === "vacaciones" && <VacacionesTab />}
      {tab === "prima" && <PrimaTab />}
      {tab === "cesantias" && <CesantiasTab />}
      {tab === "intereses" && <InteresesTab />}
      {tab === "liquidaciones" && <LiquidacionesTab />}
    </div>
  );
}
