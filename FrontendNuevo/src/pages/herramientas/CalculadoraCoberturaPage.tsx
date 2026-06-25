import { useState } from "react";
import { History, Layers, Percent, Save, Sigma, Utensils } from "lucide-react";
import "./CalculadoraCoberturaPage.css";

const modalidades = ["Almuerzo", "Refrigerio", "Desayuno", "Almuerzo + Refrigerio"];

type HistorialItem = {
  id: string;
  fecha: string;
  modalidad: string;
  asignados: number;
  atendidos: number;
  cobertura: number;
};

const historialInicial: HistorialItem[] = [
  {
    id: "h1",
    fecha: "20 Jun 2026",
    modalidad: "Almuerzo",
    asignados: 210,
    atendidos: 198,
    cobertura: 94.3,
  },
  {
    id: "h2",
    fecha: "13 Jun 2026",
    modalidad: "Refrigerio",
    asignados: 180,
    atendidos: 165,
    cobertura: 91.7,
  },
  {
    id: "h3",
    fecha: "06 Jun 2026",
    modalidad: "Almuerzo + Refrigerio",
    asignados: 230,
    atendidos: 171,
    cobertura: 74.3,
  },
];

function coberturaTone(pct: number) {
  if (pct >= 95) return "success";
  if (pct >= 80) return "warning";
  return "danger";
}

export default function CalculadoraCoberturaPage() {
  const [modalidad, setModalidad] = useState(modalidades[0]);
  const [cuposAsignados, setCuposAsignados] = useState(200);
  const [cuposAtendidos, setCuposAtendidos] = useState(182);
  const [historial, setHistorial] = useState<HistorialItem[]>(historialInicial);

  const cobertura = cuposAsignados > 0 ? (cuposAtendidos / cuposAsignados) * 100 : 0;
  const tone = coberturaTone(cobertura);

  function guardarCalculo() {
    const nuevo: HistorialItem = {
      id: `h${Date.now()}`,
      fecha: new Date().toLocaleDateString("es-CO", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      modalidad,
      asignados: cuposAsignados,
      atendidos: cuposAtendidos,
      cobertura,
    };

    setHistorial((current) => [nuevo, ...current]);
  }

  return (
    <div className="tool-page">
      <header className="tool-header">
        <div className="tool-header-icon">
          <Percent size={22} />
        </div>

        <div>
          <span>Herramientas</span>
          <h1>Calculadora de cobertura</h1>
          <p>Calcula el porcentaje de cobertura de cupos atendidos frente a los asignados.</p>
        </div>
      </header>

      <div className="cobertura-grid">
        <section className="tool-card">
          <div className="tool-card-title">
            <Utensils size={18} />
            <h2>Modalidad</h2>
          </div>

          <div className="modalidad-pills">
            {modalidades.map((item) => (
              <button
                key={item}
                type="button"
                className={`modalidad-pill ${modalidad === item ? "active" : ""}`}
                onClick={() => setModalidad(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </section>

        <section className="tool-card">
          <div className="tool-card-title">
            <Layers size={18} />
            <h2>Número de cupos</h2>
          </div>

          <div className="novedad-field">
            <label htmlFor="cuposAsignados">Cupos asignados</label>
            <input
              id="cuposAsignados"
              type="number"
              min={0}
              value={cuposAsignados}
              onChange={(event) => setCuposAsignados(Number(event.target.value) || 0)}
            />
          </div>

          <div className="novedad-field">
            <label htmlFor="cuposAtendidos">Cupos atendidos</label>
            <input
              id="cuposAtendidos"
              type="number"
              min={0}
              value={cuposAtendidos}
              onChange={(event) => setCuposAtendidos(Number(event.target.value) || 0)}
            />
          </div>

          <button type="button" className="guardar-button" onClick={guardarCalculo}>
            <Save size={16} />
            Guardar cálculo
          </button>
        </section>

        <section className="tool-card">
          <div className="tool-card-title">
            <Sigma size={18} />
            <h2>Fórmula</h2>
          </div>

          <p className="formula-text">Cobertura (%) = (Cupos atendidos ÷ Cupos asignados) × 100</p>

          <div className="formula-substituted">
            ({cuposAtendidos} ÷ {cuposAsignados || 1}) × 100 = <strong>{cobertura.toFixed(1)}%</strong>
          </div>
        </section>

        <section className={`tool-card resultado-cobertura ${tone}`}>
          <div className="tool-card-title">
            <Percent size={18} />
            <h2>Resultado</h2>
          </div>

          <div className="cobertura-ring-wrap">
            <div
              className="cobertura-ring"
              style={{
                background: `conic-gradient(var(--color-${tone}) 0 ${Math.min(cobertura, 100)}%, var(--border-color) ${Math.min(cobertura, 100)}% 100%)`,
              }}
            >
              <div>
                <strong>{cobertura.toFixed(1)}%</strong>
              </div>
            </div>
          </div>

          <p className="cobertura-detalle">
            {cuposAtendidos} de {cuposAsignados} cupos atendidos en modalidad {modalidad.toLowerCase()}.
          </p>
        </section>
      </div>

      <section className="tool-card historial-card">
        <div className="tool-card-title">
          <History size={18} />
          <h2>Historial de cálculos</h2>
        </div>

        <div className="historial-table">
          <div className="historial-head">
            <span>Fecha</span>
            <span>Modalidad</span>
            <span>Asignados</span>
            <span>Atendidos</span>
            <span>Cobertura</span>
          </div>

          {historial.map((item) => (
            <div className="historial-row" key={item.id}>
              <span>{item.fecha}</span>
              <span>{item.modalidad}</span>
              <span>{item.asignados}</span>
              <span>{item.atendidos}</span>
              <span className={`historial-badge ${coberturaTone(item.cobertura)}`}>
                {item.cobertura.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
