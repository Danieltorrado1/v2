import { useState } from "react";
import { CheckCircle } from "lucide-react";
import { generarNumero } from "../../utils";

const TIPOS = [
  "Permiso",
  "Solicitud de dotación",
  "Certificado de salud ocupacional",
  "Cambio de turno",
  "Constancia de cargo",
  "Carta de no adeudo",
  "Certificado de buena conducta",
  "Solicitud de capacitación",
  "Solicitud de herramientas / insumos",
  "Queja o reclamo",
  "Otro",
];

export default function OtrasSolicitudes() {
  const [tipo, setTipo] = useState("");
  const [otroTipo, setOtroTipo] = useState("");
  const [asunto, setAsunto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [prioridad, setPrioridad] = useState("media");
  const [submitted, setSubmitted] = useState(false);
  const [numSolicitud, setNumSolicitud] = useState("");

  const canSubmit = tipo !== "" && asunto.trim() !== "" && descripcion.trim() !== "" &&
    (tipo !== "Otro" || otroTipo.trim() !== "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setNumSolicitud(generarNumero());
    setSubmitted(true);
  }

  function handleNueva() {
    setTipo(""); setOtroTipo(""); setAsunto(""); setDescripcion("");
    setPrioridad("media"); setSubmitted(false); setNumSolicitud("");
  }

  if (submitted) {
    return (
      <div className="pp-section">
        <div className="pp-card">
          <div className="pp-success">
            <div className="pp-success-icon"><CheckCircle size={28} /></div>
            <h3>Solicitud registrada</h3>
            <p>
              Tu solicitud fue enviada correctamente. Talento Humano la revisará
              y te notificará por correo electrónico.
            </p>
            <div className="pp-success-num">{numSolicitud}</div>
            <div className="pp-success-actions">
              <button className="pp-btn secondary" onClick={handleNueva}>
                Nueva solicitud
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pp-section">
      <div className="pp-section-header">
        <div>
          <h2 className="pp-section-title">Otras Solicitudes</h2>
          <p className="pp-section-subtitle">Permisos, constancias, dotación y más</p>
        </div>
      </div>

      <div className="pp-card">
        <form className="pp-form" onSubmit={handleSubmit}>
          <div className="pp-form-row">
            <div className="pp-field">
              <label className="pp-label">Tipo de solicitud *</label>
              <select
                className="pp-select"
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                required
              >
                <option value="">Seleccionar tipo...</option>
                {TIPOS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="pp-field">
              <label className="pp-label">Prioridad</label>
              <select
                className="pp-select"
                value={prioridad}
                onChange={(e) => setPrioridad(e.target.value)}
              >
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
              </select>
            </div>
          </div>

          {tipo === "Otro" && (
            <div className="pp-field">
              <label className="pp-label">Especifique el tipo *</label>
              <input
                className="pp-input"
                placeholder="Describe brevemente el tipo de solicitud..."
                value={otroTipo}
                onChange={(e) => setOtroTipo(e.target.value)}
                required
              />
            </div>
          )}

          <div className="pp-field">
            <label className="pp-label">Asunto *</label>
            <input
              className="pp-input"
              placeholder="Resumen breve de tu solicitud"
              value={asunto}
              onChange={(e) => setAsunto(e.target.value)}
              maxLength={120}
              required
            />
          </div>

          <div className="pp-field">
            <label className="pp-label">Descripción *</label>
            <textarea
              className="pp-textarea"
              placeholder="Describe con detalle tu solicitud, incluyendo fechas, motivo y cualquier información relevante..."
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={5}
              required
            />
          </div>

          <div className="pp-form-actions">
            <button
              type="submit"
              className="pp-btn primary"
              disabled={!canSubmit}
            >
              Enviar solicitud
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
