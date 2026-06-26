import { useState } from "react";
import { RotateCcw } from "lucide-react";
import type { ModalidadSegment } from "../../../types/dashboard.types";

// Front face still uses mock data — no TC/MT/OPS breakdown endpoint exists yet
const frontSegments = [
  { label: "Tiempo Completo (TC)", count: 180, colorClass: "dot-primary" },
  { label: "Medio Tiempo (MT)", count: 48, colorClass: "dot-warning" },
  { label: "OPS", count: 20, colorClass: "dot-neutral" },
];

const COLOR_VARS: Record<string, string> = {
  "dot-primary": "var(--color-primary)",
  "dot-info": "var(--color-info)",
  "dot-warning": "var(--color-warning)",
  "dot-success": "var(--color-success)",
  "dot-purple": "var(--color-purple)",
  "dot-neutral": "var(--color-neutral, #888)",
};

function buildConicGradient(segments: ModalidadSegment[]): string {
  const total = segments.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) return "conic-gradient(var(--color-neutral, #888) 0deg 360deg)";

  let acc = 0;
  const parts: string[] = [];
  for (const seg of segments) {
    const startDeg = Math.round((acc / total) * 360);
    acc += seg.count;
    const endDeg = Math.round((acc / total) * 360);
    const colorVar = COLOR_VARS[seg.colorClass] ?? "var(--color-neutral, #888)";
    parts.push(`${colorVar} ${startDeg}deg ${endDeg}deg`);
  }

  return `conic-gradient(${parts.join(", ")})`;
}

interface ModalityFlipCardProps {
  backSegments: ModalidadSegment[];
  backLoading: boolean;
  backError: string | null;
}

export default function ModalityFlipCard({
  backSegments,
  backLoading,
  backError,
}: ModalityFlipCardProps) {
  const [flipped, setFlipped] = useState(false);

  const backTotal = backSegments.reduce((sum, s) => sum + s.count, 0);
  const backGradient = buildConicGradient(backSegments);

  return (
    <div className={`flip-wrapper ${flipped ? "is-flipped" : ""}`}>
      <div className="flip-inner">

        {/* ── Front face: all personnel by contract type (mock until endpoint exists) ── */}
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

        {/* ── Back face: manipulators by modalidad base (real from /dashboard/cobertura) ── */}
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

          {backLoading ? (
            <div
              className="mod-donut-wrapper"
              style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <span style={{ color: "var(--color-text-muted, #888)", fontSize: "0.8rem" }}>
                Cargando...
              </span>
            </div>
          ) : backError ? (
            <div
              className="mod-donut-wrapper"
              style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <span
                style={{
                  color: "var(--color-danger, #ef4444)",
                  fontSize: "0.75rem",
                  textAlign: "center",
                }}
              >
                {backError}
              </span>
            </div>
          ) : backSegments.length === 0 ? (
            <div
              className="mod-donut-wrapper"
              style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <span style={{ color: "var(--color-text-muted, #888)", fontSize: "0.8rem" }}>
                Sin datos de modalidad
              </span>
            </div>
          ) : (
            <div className="mod-donut-wrapper">
              <div className="mod-donut" style={{ background: backGradient }}>
                <div>
                  <strong>{backTotal}</strong>
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
          )}
        </div>

      </div>
    </div>
  );
}
