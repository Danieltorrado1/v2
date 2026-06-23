import { useEffect, useState } from "react";
import { ArrowUpRight, TrendingUp, TrendingDown, Cake } from "lucide-react";
import { dashboardApi } from "../../services/dashboardApi";

// ── Sparkline ───────────────────────────────────────────────────────────────
function Spark({ values, color }: { values: number[]; color: string }) {
  const w = 80; const h = 36;
  const min = Math.min(...values); const max = Math.max(...values);
  const range = max - min || 1;
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => `${i * step},${h - ((v - min) / range) * (h - 8) - 4}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      <polyline points={pts} stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── KPI card ────────────────────────────────────────────────────────────────
function Kpi({ label, value, trend, up, sub, spark, color }: {
  label: string; value: string; trend: string;
  up: boolean | null; sub?: string; spark: number[]; color: string;
}) {
  return (
    <div className="bg-card rounded-2xl p-5 flex flex-col gap-3" style={{ boxShadow: "var(--shadow-card)" }}>
      <div className="flex items-start justify-between">
        <p className="text-xs text-muted-foreground" style={{ fontWeight: 500 }}>{label}</p>
        <Spark values={spark} color={color} />
      </div>
      <div>
        <p style={{ fontWeight: 700, fontSize: "1.75rem", lineHeight: 1, letterSpacing: "-0.03em" }}>{value}</p>
        <div className="flex items-center gap-1.5 mt-1.5">
          {up === true  && <TrendingUp  className="w-3 h-3 text-emerald-500" />}
          {up === false && <TrendingDown className="w-3 h-3 text-red-500" />}
          <span className="text-[11px]" style={{ fontWeight: 500, color: up === true ? "#10b981" : up === false ? "#ef4444" : "#6b7280" }}>
            {trend}
          </span>
          {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
        </div>
      </div>
    </div>
  );
}

// ── KPIs reales (backend Empiria V2) ─────────────────────────────────────────
// Empresa/contrato fijos hasta que exista un selector de empresa/contrato (fase futura).
const TENANT_PARAMS = { empresa_id: 1, contrato_id: 3 };

type KpiFormat = "number" | "percent" | "currency";
type KpiStatus = "loading" | "ready" | "fallback";

interface KpiState {
  status: KpiStatus;
  value: number;
}

interface RealKpiCardDef {
  key: string;
  label: string;
  format: KpiFormat;
}

// Una entrada por endpoint real. Cada fetch resuelve uno o más KPIs a la vez,
// para no disparar la misma petición varias veces (p.ej. SST alimenta 2 tarjetas).
interface RealKpiSource {
  sourceKey: string;
  fetchValues: () => Promise<Record<string, number>>;
  fallbackValues: Record<string, number>;
}

const REAL_KPI_CARDS: RealKpiCardDef[] = [
  { key: "total_personas",          label: "Total colaboradores",     format: "number" },
  { key: "cumplimiento_documental", label: "Cumplimiento documental", format: "percent" },
  { key: "alertas_sst",             label: "Alertas SST",             format: "number" },
  { key: "cumplimiento_sst",        label: "Cumplimiento SST",        format: "percent" },
  { key: "promedio_desempeno",      label: "Promedio desempeño",      format: "number" },
  { key: "vacaciones_pendientes",   label: "Vacaciones pendientes",   format: "number" },
  { key: "prima_pagada",            label: "Prima pagada",            format: "currency" },
  { key: "cesantias_consignadas",   label: "Cesantías consignadas",   format: "currency" },
  { key: "intereses_pagados",       label: "Intereses pagados",       format: "currency" },
  { key: "liquidaciones_pagadas",   label: "Liquidaciones pagadas",   format: "currency" },
];

const REAL_KPI_SOURCES: RealKpiSource[] = [
  {
    sourceKey: "dashboard_resumen",
    // FALLBACK: GET /dashboard/resumen responde 500 hoy en el backend
    // ("column c.activo does not exist") — bug existente, no se toca el backend en esta fase.
    fetchValues: () => dashboardApi.getResumen(TENANT_PARAMS).then(r => ({ total_personas: r.total_personas })),
    fallbackValues: { total_personas: 226 },
  },
  {
    sourceKey: "dashboard_documentos",
    // FALLBACK: GET /dashboard/documentos responde 500 hoy en el backend
    // ("column td.nombre does not exist") — bug existente, no se toca el backend en esta fase.
    fetchValues: () =>
      dashboardApi.getDocumentos(TENANT_PARAMS).then(r => ({ cumplimiento_documental: r.cumplimiento_documental_promedio })),
    fallbackValues: { cumplimiento_documental: 88 },
  },
  {
    sourceKey: "sst_dashboard_general",
    fetchValues: () =>
      dashboardApi.getSstDashboardGeneral(TENANT_PARAMS).then(r => ({
        alertas_sst: r.resumen.alertas_total,
        cumplimiento_sst: r.resumen.cumplimiento_general_sst,
      })),
    fallbackValues: { alertas_sst: 5, cumplimiento_sst: 80 },
  },
  {
    sourceKey: "evaluaciones_dashboard_general",
    fetchValues: () =>
      dashboardApi.getEvaluacionesDashboardGeneral(TENANT_PARAMS).then(r => ({ promedio_desempeno: r.promedio_general })),
    fallbackValues: { promedio_desempeno: 4.2 },
  },
  {
    sourceKey: "nomina_vacaciones_dashboard",
    fetchValues: () =>
      dashboardApi.getVacacionesDashboard(TENANT_PARAMS).then(r => ({ vacaciones_pendientes: r.solicitudes_pendientes })),
    fallbackValues: { vacaciones_pendientes: 3 },
  },
  {
    sourceKey: "nomina_prima_dashboard",
    fetchValues: () => dashboardApi.getPrimaDashboard(TENANT_PARAMS).then(r => ({ prima_pagada: r.valor_total_pagado })),
    fallbackValues: { prima_pagada: 1100000 },
  },
  {
    sourceKey: "nomina_cesantias_dashboard",
    fetchValues: () =>
      dashboardApi.getCesantiasDashboard(TENANT_PARAMS).then(r => ({ cesantias_consignadas: r.valor_total_consignado })),
    fallbackValues: { cesantias_consignadas: 1100000 },
  },
  {
    sourceKey: "nomina_intereses_cesantias_dashboard",
    fetchValues: () =>
      dashboardApi.getInteresesCesantiasDashboard(TENANT_PARAMS).then(r => ({ intereses_pagados: r.valor_total_pagado })),
    fallbackValues: { intereses_pagados: 66000 },
  },
  {
    sourceKey: "nomina_liquidaciones_finales_dashboard",
    fetchValues: () =>
      dashboardApi.getLiquidacionesFinalesDashboard(TENANT_PARAMS).then(r => ({ liquidaciones_pagadas: r.valor_total_pagado })),
    fallbackValues: { liquidaciones_pagadas: 3580000 },
  },
];

function formatKpiValue(value: number, format: KpiFormat): string {
  if (format === "currency") {
    return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);
  }
  if (format === "percent") {
    return `${Math.round(value)}%`;
  }
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}

function useRealDashboardKpis(): Record<string, KpiState> {
  const [states, setStates] = useState<Record<string, KpiState>>(() => {
    const initial: Record<string, KpiState> = {};
    REAL_KPI_SOURCES.forEach(source => {
      Object.entries(source.fallbackValues).forEach(([key, value]) => {
        initial[key] = { status: "loading", value };
      });
    });
    return initial;
  });

  useEffect(() => {
    // Cada fuente se resuelve de forma independiente: si una falla, no bloquea a las demás.
    REAL_KPI_SOURCES.forEach(source => {
      source.fetchValues()
        .then(values => {
          setStates(prev => {
            const next = { ...prev };
            Object.entries(values).forEach(([key, value]) => {
              next[key] = { status: "ready", value };
            });
            return next;
          });
        })
        .catch(error => {
          console.warn(`[dashboard] Fuente "${source.sourceKey}" usando fallback:`, error);
          setStates(prev => {
            const next = { ...prev };
            Object.entries(source.fallbackValues).forEach(([key, value]) => {
              next[key] = { status: "fallback", value };
            });
            return next;
          });
        });
    });
  }, []);

  return states;
}

function RealKpiCard({ def, state }: { def: RealKpiCardDef; state: KpiState }) {
  return (
    <div className="bg-card rounded-2xl p-5 flex flex-col gap-3" style={{ boxShadow: "var(--shadow-card)" }}>
      <p className="text-xs text-muted-foreground" style={{ fontWeight: 500 }}>{def.label}</p>
      {state.status === "loading" ? (
        <div className="h-7 w-20 rounded-md bg-muted animate-pulse" />
      ) : (
        <p style={{ fontWeight: 700, fontSize: "1.75rem", lineHeight: 1, letterSpacing: "-0.03em" }}>
          {formatKpiValue(state.value, def.format)}
        </p>
      )}
      <span
        className="text-[11px]"
        style={{ fontWeight: 500, color: state.status === "fallback" ? "#f59e0b" : state.status === "ready" ? "#10b981" : "#9ca3af" }}
      >
        {state.status === "loading" ? "Cargando…" : state.status === "fallback" ? "● Estimado (sin datos)" : "● En vivo"}
      </span>
    </div>
  );
}

// ── Data ────────────────────────────────────────────────────────────────────
const MUNICIPIOS = [
  { n: "Acacías",     total: 48, activos: 46 },
  { n: "Granada",     total: 41, activos: 38 },
  { n: "Vistahermosa",total: 35, activos: 33 },
  { n: "La Macarena", total: 29, activos: 28 },
  { n: "Puerto Rico", total: 22, activos: 20 },
  { n: "El Castillo", total: 18, activos: 17 },
  { n: "C. La Nueva", total: 14, activos: 14 },
  { n: "Fte. de Oro", total: 19, activos: 18 },
];

const NOVEDADES = [
  { id: "1", emp: "María F. Torres",    tipo: "Incapacidad",            fecha: "09 Jun", color: "bg-amber-50 text-amber-600 border-amber-100" },
  { id: "2", emp: "Carmen A. Ruiz",     tipo: "Ausencia injustificada", fecha: "08 Jun", color: "bg-red-50 text-red-600 border-red-100" },
  { id: "3", emp: "Rosa E. Jiménez",    tipo: "Horas extras",           fecha: "07 Jun", color: "bg-blue-50 text-blue-600 border-blue-100" },
  { id: "4", emp: "Amparo C. González", tipo: "Licencia maternidad",    fecha: "06 Jun", color: "bg-purple-50 text-purple-600 border-purple-100" },
  { id: "5", emp: "Luz M. Pérez",       tipo: "Incapacidad",            fecha: "05 Jun", color: "bg-amber-50 text-amber-600 border-amber-100" },
];

const JORNADA = [
  { n: "Acacías",     req_tc: 32, cnt_tc: 30, req_mt: 16, cnt_mt: 14 },
  { n: "Granada",     req_tc: 28, cnt_tc: 26, req_mt: 13, cnt_mt: 12 },
  { n: "Vistahermosa",req_tc: 22, cnt_tc: 20, req_mt: 10, cnt_mt: 9  },
  { n: "La Macarena", req_tc: 18, cnt_tc: 18, req_mt: 8,  cnt_mt: 7  },
  { n: "Puerto Rico", req_tc: 14, cnt_tc: 12, req_mt: 6,  cnt_mt: 5  },
  { n: "C. La Nueva", req_tc: 8,  cnt_tc: 8,  req_mt: 4,  cnt_mt: 4  },
  { n: "Fte. de Oro", req_tc: 12, cnt_tc: 11, req_mt: 5,  cnt_mt: 4  },
];

const EDADES = [
  { r: "18–25", n: 28, c: "#3b82f6" },
  { r: "26–35", n: 72, c: "#10b981" },
  { r: "36–45", n: 68, c: "#8b5cf6" },
  { r: "46–55", n: 44, c: "#f59e0b" },
  { r: "56+",   n: 14, c: "#ef4444" },
];

const GENERO = { f: 199, m: 27 };

const CUMPLE = [
  { n: "María Fernanda Torres Ospina",   d: 12, mun: "Acacías",       ini: "MT", age: 34 },
  { n: "Nohora Stella Ramírez Bernal",   d: 15, mun: "El Castillo",   ini: "NR", age: 41 },
  { n: "Rosa Elvira Jiménez Castro",     d: 18, mun: "Vistahermosa",  ini: "RJ", age: 29 },
  { n: "Diana Marcela Ospina Vélez",     d: 22, mun: "Granada",       ini: "DO", age: 37 },
  { n: "Esperanza Mireya Suárez Gil",    d: 27, mun: "Fuente de Oro", ini: "ES", age: 45 },
];

const HOY     = 12;
const PALETTE = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444"];

// ── General Dashboard ───────────────────────────────────────────────────────
function General({ kpiStates }: { kpiStates: Record<string, KpiState> }) {
  const total = MUNICIPIOS.reduce((s, m) => s + m.total,   0);
  const act   = MUNICIPIOS.reduce((s, m) => s + m.activos, 0);
  const maxT  = Math.max(...MUNICIPIOS.map(m => m.total));

  return (
    <div className="space-y-5">
      {/* KPIs reales — backend Empiria V2 */}
      <div>
        <h2 className="text-sm text-muted-foreground mb-2" style={{ fontWeight: 600 }}>Indicadores generales</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {REAL_KPI_CARDS.map(def => (
            <RealKpiCard key={def.key} def={def} state={kpiStates[def.key]} />
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Total empleados"      value={total.toString()} trend="+4"    up={true}  sub="este mes"   spark={[4,5,4,6,5,7,8,9]}   color="#10b981" />
        <Kpi label="Activos hoy"          value={act.toString()}   trend={`${Math.round((act/total)*100)}%`} up={true} sub="cobertura" spark={[3,4,3,5,4,6,5,7]} color="#3b82f6" />
        <Kpi label="Novedades activas"    value="11"               trend="-2%"   up={false} sub="vs semana"  spark={[5,6,5,4,5,3,4,3]}   color="#f59e0b" />
        <Kpi label="Municipios cubiertos" value="8"                trend="Meta"  up={null}                   spark={[4,4,5,4,5,5,4,5]}   color="#8b5cf6" />
      </div>

      {/* Cobertura + Novedades */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3 bg-card rounded-2xl p-5" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 style={{ fontWeight: 600, fontSize: "0.9375rem" }}>Cobertura por municipio</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Activos vs. total — junio 2026</p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "#e5e7eb" }} />Total</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "#10b981" }} />Activos</span>
            </div>
          </div>
          <div className="flex items-end gap-2 h-[185px]">
            {MUNICIPIOS.map(m => (
              <div key={m.n} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                <div className="relative w-full" style={{ height: `${(m.total / maxT) * 100}%`, background: "#e5e7eb", borderRadius: "3px 3px 0 0" }}>
                  <div className="absolute bottom-0 left-0 right-0" style={{ height: `${(m.activos / m.total) * 100}%`, background: "#10b981", borderRadius: "3px 3px 0 0" }} />
                </div>
                <span className="text-[9px] text-muted-foreground text-center truncate w-full px-0.5">{m.n}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 bg-card rounded-2xl p-5" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 style={{ fontWeight: 600, fontSize: "0.9375rem" }}>Novedades recientes</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Últimas 5 novedades</p>
            </div>
            <button className="text-[11px] text-accent hover:underline flex items-center gap-0.5" style={{ fontWeight: 500 }}>
              Ver todas <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-3">
            {NOVEDADES.map(n => (
              <div key={n.id} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-[10px] text-white"
                  style={{ background: "linear-gradient(135deg, #374151, #111827)", fontWeight: 700 }}>
                  {n.emp.split(" ").map(w => w[0]).join("").slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] text-foreground truncate" style={{ fontWeight: 500 }}>{n.emp}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${n.color}`} style={{ fontWeight: 500 }}>{n.tipo}</span>
                </div>
                <span className="text-[10px] text-muted-foreground flex-shrink-0">{n.fecha}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Alertas */}
      <div className="bg-card rounded-2xl p-5" style={{ boxShadow: "var(--shadow-card)" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 style={{ fontWeight: 600, fontSize: "0.9375rem" }}>Alertas de expedientes</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Documentos pendientes de carga</p>
          </div>
          <span className="text-[11px] px-2.5 py-1 rounded-full border" style={{ fontWeight: 600, background: "#fef2f2", color: "#ef4444", borderColor: "#fecaca" }}>14 pendientes</span>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Cédula de ciudadanía", count: 3,  danger: true  },
            { label: "Afiliación EPS",        count: 5,  danger: false },
            { label: "Contrato firmado",       count: 2,  danger: true  },
            { label: "Exámenes médicos",       count: 4,  danger: false },
          ].map(a => (
            <div key={a.label} className="rounded-xl p-4 cursor-pointer transition-all hover:scale-[1.02]"
              style={{ background: a.danger ? "#fef2f2" : "#fffbeb", border: `1px solid ${a.danger ? "#fecaca" : "#fde68a"}`, boxShadow: "var(--shadow-card)" }}>
              <p style={{ fontWeight: 700, fontSize: "1.5rem", lineHeight: 1, color: a.danger ? "#ef4444" : "#f59e0b" }}>{a.count}</p>
              <p className="text-[11.5px] mt-1.5 leading-snug" style={{ color: a.danger ? "#b91c1c" : "#92400e" }}>{a.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Personal Dashboard ──────────────────────────────────────────────────────
function Personal() {
  const totTC  = JORNADA.reduce((s, j) => s + j.cnt_tc, 0);
  const reqTC  = JORNADA.reduce((s, j) => s + j.req_tc, 0);
  const totMT  = JORNADA.reduce((s, j) => s + j.cnt_mt, 0);
  const reqMT  = JORNADA.reduce((s, j) => s + j.req_mt, 0);
  const total  = totTC + totMT;
  const maxE   = Math.max(...EDADES.map(e => e.n));
  const maxTC  = Math.max(...JORNADA.map(j => Math.max(j.req_tc, j.cnt_tc)));
  const maxMT  = Math.max(...JORNADA.map(j => Math.max(j.req_mt, j.cnt_mt)));
  const genTot = GENERO.f + GENERO.m;

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Personal total"      value={total.toString()}  trend="+6"   up={true}  sub="este mes"  spark={[200,206,210,214,218,222,224,226]} color="#10b981" />
        <Kpi label="Tiempo completo"     value={totTC.toString()}  trend={`${Math.round((totTC/reqTC)*100)}%`} up={true}  sub="cubierto" spark={[148,152,156,160,162,163,164,164]} color="#3b82f6" />
        <Kpi label="Medio tiempo"        value={totMT.toString()}  trend={`${Math.round((totMT/reqMT)*100)}%`} up={false} sub="cubierto" spark={[62,60,58,57,56,58,59,60]}          color="#f59e0b" />
        <Kpi label="Cumpleaños este mes" value={CUMPLE.length.toString()} trend="Junio 2026" up={null} spark={[3,5,4,6,5,5,4,5]} color="#8b5cf6" />
      </div>

      {/* Cumpleaños + Género */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 bg-card rounded-2xl p-5" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="flex items-center gap-2 mb-4">
            <h2 style={{ fontWeight: 600, fontSize: "0.9375rem" }}>Cumpleaños — Junio 2026</h2>
            <Cake size={15} className="text-accent" />
          </div>
          <div className="space-y-2.5">
            {CUMPLE.map((c, i) => {
              const esCumple = c.d === HOY;
              const pasado   = c.d < HOY;
              return (
                <div key={c.n} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${esCumple ? "border-accent/40" : "border-border"}`}
                  style={{ background: esCumple ? "#f0fdf4" : pasado ? "#fafafa" : "white" }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-white text-[11px]"
                    style={{ background: `linear-gradient(135deg, ${PALETTE[i % PALETTE.length]}, ${PALETTE[(i + 2) % PALETTE.length]})`, fontWeight: 700 }}>
                    {c.ini}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] text-foreground truncate" style={{ fontWeight: 500 }}>{c.n}</p>
                    <p className="text-[10.5px] text-muted-foreground">{c.mun} · {c.age} años</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p style={{ fontWeight: 700, fontSize: "12px", color: esCumple ? "#10b981" : pasado ? "#9ca3af" : "#111827" }}>
                      {esCumple ? "🎉 ¡Hoy!" : `${c.d} Jun`}
                    </p>
                    {!esCumple && !pasado && <p className="text-[10px] text-muted-foreground">en {c.d - HOY} días</p>}
                    {pasado && <p className="text-[10px] text-muted-foreground">Pasado</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-card rounded-2xl p-5 flex flex-col" style={{ boxShadow: "var(--shadow-card)" }}>
          <h2 style={{ fontWeight: 600, fontSize: "0.9375rem" }} className="mb-1">Género</h2>
          <p className="text-xs text-muted-foreground mb-4">{genTot} empleados</p>
          <div className="flex items-center justify-center flex-1">
            <div className="relative" style={{ width: 120, height: 120 }}>
              <svg viewBox="0 0 36 36" style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
                <circle cx="18" cy="18" r="14" fill="none" stroke="#f3f4f6" strokeWidth="4.5" />
                <circle cx="18" cy="18" r="14" fill="none" stroke="#10b981" strokeWidth="4.5"
                  strokeDasharray={`${(GENERO.f / genTot) * 87.96} 87.96`} strokeLinecap="round" />
                <circle cx="18" cy="18" r="14" fill="none" stroke="#3b82f6" strokeWidth="4.5"
                  strokeDasharray={`${(GENERO.m / genTot) * 87.96} 87.96`} strokeLinecap="round"
                  strokeDashoffset={`-${(GENERO.f / genTot) * 87.96}`} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p style={{ fontWeight: 700, fontSize: "1.25rem", lineHeight: 1 }}>{Math.round((GENERO.f / genTot) * 100)}%</p>
                <p className="text-[9px] text-muted-foreground mt-0.5">Mujeres</p>
              </div>
            </div>
          </div>
          <div className="space-y-3 mt-4">
            {[{ l: "Mujeres", n: GENERO.f, c: "#10b981" }, { l: "Hombres", n: GENERO.m, c: "#3b82f6" }].map(g => (
              <div key={g.l}>
                <div className="flex justify-between mb-1">
                  <span className="flex items-center gap-1.5 text-[12px]">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: g.c }} />{g.l}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{g.n} ({Math.round((g.n / genTot) * 100)}%)</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(g.n / genTot) * 100}%`, background: g.c }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* TC + MT */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[
          { title: "Personal T. Completo", totC: totTC, reqC: reqTC, max: maxTC, dataKey: "tc" as const, reqBg: "#dbeafe", cntColor: "#3b82f6" },
          { title: "Personal Medio Tiempo", totC: totMT, reqC: reqMT, max: maxMT, dataKey: "mt" as const, reqBg: "#fef3c7", cntColor: "#f59e0b" },
        ].map(cfg => (
          <div key={cfg.title} className="bg-card rounded-2xl p-5" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="flex items-center justify-between mb-1">
              <h2 style={{ fontWeight: 600, fontSize: "0.9375rem" }}>{cfg.title}</h2>
              <span className={`text-[11px] px-2.5 py-1 rounded-lg border ${cfg.totC >= cfg.reqC ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-amber-50 text-amber-600 border-amber-100"}`} style={{ fontWeight: 600 }}>
                {cfg.totC} / {cfg.reqC}
              </span>
            </div>
            <div className="flex gap-3 text-[10.5px] text-muted-foreground mb-4">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2 rounded-sm" style={{ background: cfg.reqBg }} />Requerido</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2 rounded-sm" style={{ background: cfg.cntColor }} />Contratado</span>
            </div>
            <div className="flex items-end gap-2 h-[120px]">
              {JORNADA.map(j => {
                const req = cfg.dataKey === "tc" ? j.req_tc : j.req_mt;
                const cnt = cfg.dataKey === "tc" ? j.cnt_tc : j.cnt_mt;
                return (
                  <div key={j.n} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                    <div className="w-full flex gap-0.5 items-end" style={{ height: "100px" }}>
                      <div className="flex-1 rounded-t-sm" style={{ height: `${(req / cfg.max) * 100}%`, background: cfg.reqBg }} />
                      <div className="flex-1 rounded-t-sm" style={{ height: `${(cnt / cfg.max) * 100}%`, background: cnt < req ? "#ef4444" : cfg.cntColor }} />
                    </div>
                    <span className="text-[8.5px] text-muted-foreground truncate w-full text-center">{j.n.split(" ")[0]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Edad */}
      <div className="bg-card rounded-2xl p-5" style={{ boxShadow: "var(--shadow-card)" }}>
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ fontWeight: 600, fontSize: "0.9375rem" }}>Distribución por edad</h2>
          <p className="text-xs text-muted-foreground">{EDADES.reduce((s, e) => s + e.n, 0)} empleados registrados</p>
        </div>
        <div className="flex items-end gap-4 h-[120px]">
          {EDADES.map(e => (
            <div key={e.r} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
              <span className="text-[11px] text-muted-foreground" style={{ fontWeight: 600 }}>{e.n}</span>
              <div className="w-full rounded-t-lg" style={{ height: `${(e.n / maxE) * 90}px`, background: e.c }} />
              <div>
                <p className="text-[11px] text-foreground text-center" style={{ fontWeight: 600 }}>{e.r}</p>
                <p className="text-[9px] text-muted-foreground text-center">{Math.round((e.n / EDADES.reduce((s, x) => s + x.n, 0)) * 100)}%</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Root ────────────────────────────────────────────────────────────────────
type View = "general" | "personal";

export function DashboardHome() {
  const [view, setView] = useState<View>("general");
  const kpiStates = useRealDashboardKpis();

  return (
    <div className="p-6 space-y-5 max-w-screen-xl mx-auto">

      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-muted-foreground text-sm mb-0.5">Viernes, 12 de junio de 2026</p>
          <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: "1.5rem", letterSpacing: "-0.03em", color: "#111827" }}>
            Bienvenida, <span style={{ color: "#10b981" }}>Laura</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Tienes <strong className="text-foreground">7 novedades</strong> pendientes y{" "}
            <strong className="text-foreground">14 expedientes</strong> incompletos.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 p-1 bg-card rounded-2xl" style={{ boxShadow: "var(--shadow-card)" }}>
          {(["general", "personal"] as View[]).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-4 py-1.5 rounded-xl text-[13px] transition-all ${view === v ? "bg-foreground text-card" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
              style={{ fontWeight: view === v ? 600 : 400 }}>
              {v === "general" ? "General" : "Personal"}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {view === "general"  && <General kpiStates={kpiStates} />}
      {view === "personal" && <Personal />}
    </div>
  );
}
