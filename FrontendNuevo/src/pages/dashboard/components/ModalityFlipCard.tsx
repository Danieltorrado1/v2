import { useState } from "react";
import { RotateCcw } from "lucide-react";

const frontSegments = [
  { label: "Tiempo Completo (TC)", count: 180, colorClass: "dot-primary" },
  { label: "Medio Tiempo (MT)", count: 48, colorClass: "dot-warning" },
  { label: "OPS", count: 20, colorClass: "dot-neutral" },
];

const backSegments = [
  { label: "CAA", count: 45, colorClass: "dot-primary" },
  { label: "RI", count: 22, colorClass: "dot-info" },
  { label: "CAARES", count: 18, colorClass: "dot-warning" },
  { label: "CAJM", count: 8, colorClass: "dot-success" },
  { label: "CAJU", count: 5, colorClass: "dot-purple" },
];

export default function ModalityFlipCard() {
  const [flipped, setFlipped] = useState(false);

  return (
    <div className={`flip-wrapper ${flipped ? "is-flipped" : ""}`}>
      <div className="flip-inner">

        {/* ── Front face: all personnel by contract type ── */}
        <div className="flip-face flip-face-front">
          <div className="panel-title">
            <h3>Distribución por Modalidad</h3>
            <button
              type="button"
              className="panel-action flip-btn"
              onClick={() => setFlipped(true)}
              title="Ver distribución de Manipuladores"
            >
              <RotateCcw size={12} />
              Manip.
            </button>
          </div>

          <div className="mod-donut-wrapper">
            <div
              className="mod-donut"
              style={{
                background:
                  "conic-gradient(var(--color-primary) 0deg 261deg, var(--color-warning) 261deg 331deg, var(--color-neutral) 331deg 360deg)",
              }}
            >
              <div>
                <strong>248</strong>
                <span>Personas</span>
              </div>
            </div>

            <div className="mod-legend">
              {frontSegments.map((seg) => (
                <div key={seg.label} className="mod-legend-item">
                  <i className={`dot ${seg.colorClass}`} />
                  <span className="mod-legend-label">{seg.label}</span>
                  <span className="mod-legend-count">{seg.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Back face: manipulators by modalidad type ── */}
        <div className="flip-face flip-face-back">
          <div className="panel-title">
            <h3>Manipuladores por Modalidad</h3>
            <button
              type="button"
              className="panel-action flip-btn"
              onClick={() => setFlipped(false)}
              title="Ver distribución general"
            >
              <RotateCcw size={12} />
              General
            </button>
          </div>

          <div className="mod-donut-wrapper">
            <div
              className="mod-donut"
              style={{
                background:
                  "conic-gradient(var(--color-primary) 0deg 165deg, var(--color-info) 165deg 246deg, var(--color-warning) 246deg 312deg, var(--color-success) 312deg 342deg, var(--color-purple) 342deg 360deg)",
              }}
            >
              <div>
                <strong>98</strong>
                <span>Manip.</span>
              </div>
            </div>

            <div className="mod-legend">
              {backSegments.map((seg) => (
                <div key={seg.label} className="mod-legend-item">
                  <i className={`dot ${seg.colorClass}`} />
                  <span className="mod-legend-label">{seg.label}</span>
                  <span className="mod-legend-count">{seg.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
