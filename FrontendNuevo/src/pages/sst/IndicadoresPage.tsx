import { Activity, BarChart3, GraduationCap, HeartPulse, Percent } from "lucide-react";
import { SstPageHeader } from "./components/SstPageHeader";
import { SstKpis } from "./components/SstKpis";
import { SstBadge } from "./components/SstBadge";
import { SstTable } from "./components/SstTable";
import "./SstPages.css";

const kpis = [
  { tone: "warning" as const, icon: Percent, label: "Cumplimiento SG-SST", value: "87%", caption: "Meta: 90%" },
  { tone: "success" as const, icon: Activity, label: "Frecuencia", value: "4.2", caption: "Meta: ≤ 5" },
  { tone: "success" as const, icon: HeartPulse, label: "Severidad", value: "12.5", caption: "Meta: ≤ 15" },
  { tone: "success" as const, icon: Activity, label: "Ausentismo", value: "2.1%", caption: "Meta: ≤ 3%" },
  { tone: "warning" as const, icon: GraduationCap, label: "Capacitaciones", value: "87%", caption: "Meta: 95%" },
];

const evolucionMensual = [
  { mes: "Ene", valor: 8 },
  { mes: "Feb", valor: 6 },
  { mes: "Mar", valor: 10 },
  { mes: "Abr", valor: 7 },
  { mes: "May", valor: 9 },
  { mes: "Jun", valor: 5 },
];

const maxEvolucion = Math.max(...evolucionMensual.map((item) => item.valor));

const distribucion = [
  { label: "Accidentes de trabajo", valor: 9, color: "var(--color-danger)" },
  { label: "Enfermedades laborales", valor: 2, color: "var(--color-warning)" },
  { label: "Incidentes", valor: 4, color: "var(--color-info)" },
];

const totalDistribucion = distribucion.reduce((sum, item) => sum + item.valor, 0);

function buildConicGradient() {
  let acc = 0;
  const stops = distribucion.map((item) => {
    const start = (acc / totalDistribucion) * 100;
    acc += item.valor;
    const end = (acc / totalDistribucion) * 100;
    return `${item.color} ${start}% ${end}%`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

const cumplimientoMunicipios = [
  { municipio: "La Macarena", pct: 95 },
  { municipio: "Acacías", pct: 92 },
  { municipio: "El Castillo", pct: 88 },
  { municipio: "Granada", pct: 85 },
  { municipio: "Puerto Rico", pct: 81 },
  { municipio: "Vistahermosa", pct: 78 },
];

type EstadoIndicador = "Cumple" | "En riesgo" | "No cumple";

const resumen: { indicador: string; resultado: string; meta: string; variacion: string; estado: EstadoIndicador }[] = [
  { indicador: "Cumplimiento SG-SST", resultado: "87%", meta: "90%", variacion: "-3 pts", estado: "En riesgo" },
  { indicador: "Índice de frecuencia", resultado: "4.2", meta: "≤ 5", variacion: "-8%", estado: "Cumple" },
  { indicador: "Índice de severidad", resultado: "12.5", meta: "≤ 15", variacion: "-5%", estado: "Cumple" },
  { indicador: "Ausentismo", resultado: "2.1%", meta: "≤ 3%", variacion: "-0.4 pts", estado: "Cumple" },
  { indicador: "Capacitaciones", resultado: "87%", meta: "95%", variacion: "-8 pts", estado: "En riesgo" },
];

function estadoTone(estado: EstadoIndicador) {
  if (estado === "Cumple") return "success";
  if (estado === "En riesgo") return "warning";
  return "danger";
}

export default function IndicadoresPage() {
  return (
    <div className="sst-page">
      <SstPageHeader
        icon={BarChart3}
        title="Indicadores SST"
        subtitle="Indicadores de gestión y desempeño del SG-SST."
      />

      <SstKpis items={kpis} />

      <div className="sst-charts-grid">
        <section className="sst-card">
          <div className="sst-card-title">
            <Activity size={18} />
            <h2>Evolución mensual</h2>
          </div>

          <div className="sst-bar-chart">
            {evolucionMensual.map((item) => (
              <div className="sst-bar-item" key={item.mes}>
                <strong>{item.valor}</strong>
                <div className="sst-bar-track">
                  <div
                    className="sst-bar"
                    style={{ height: `${(item.valor / maxEvolucion) * 100}%` }}
                  />
                </div>
                <span>{item.mes}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="sst-card">
          <div className="sst-card-title">
            <Percent size={18} />
            <h2>Distribución de incidentes</h2>
          </div>

          <div className="sst-donut-wrap">
            <div className="sst-donut" style={{ background: buildConicGradient() }}>
              <div>
                <strong>{totalDistribucion}</strong>
                <span>Total</span>
              </div>
            </div>

            <div className="sst-legend">
              {distribucion.map((item) => (
                <div className="sst-legend-item" key={item.label}>
                  <span className="sst-legend-dot" style={{ background: item.color }} />
                  {item.label} ({item.valor})
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="sst-card">
          <div className="sst-card-title">
            <BarChart3 size={18} />
            <h2>Cumplimiento por municipio</h2>
          </div>

          <div className="sst-progress-list">
            {cumplimientoMunicipios.map((item) => (
              <div className="sst-progress-row" key={item.municipio}>
                <span>
                  {item.municipio} <strong>{item.pct}%</strong>
                </span>
                <div className="sst-progress-track">
                  <div style={{ width: `${item.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="sst-card-title">
        <BarChart3 size={18} />
        <h2>Tabla resumen</h2>
      </div>

      <SstTable
        columns={["Indicador", "Resultado", "Meta", "Variación", "Estado"]}
        gridTemplateColumns="minmax(180px,1.6fr) 120px 120px 120px 140px"
        minWidth={700}
        maxHeight={360}
      >
        {resumen.map((item) => (
          <div className="sst-table-row" key={item.indicador}>
            <strong>{item.indicador}</strong>
            <span>{item.resultado}</span>
            <span>{item.meta}</span>
            <span>{item.variacion}</span>
            <SstBadge tone={estadoTone(item.estado)}>{item.estado}</SstBadge>
          </div>
        ))}
      </SstTable>
    </div>
  );
}
