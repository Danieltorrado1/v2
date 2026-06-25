import { useState } from "react";
import { CheckCircle } from "lucide-react";
import { generarNumero } from "../../utils";

const TIPOS_NOVEDAD = [
  "Incapacidad médica",
  "Licencia no remunerada",
  "Permiso remunerado",
  "Ausencia injustificada",
  "Descuento autorizado",
  "Embargo de nómina",
  "Retención en la fuente",
  "Corrección de datos básicos (documento, nombre, fechas)",
  "Cambio de cuenta bancaria / método de pago",
  "Error en liquidación (período específico)",
];

export default function NovedadesNomina() {
  const [tipoNovedad, setTipoNovedad] = useState("");
  const [asunto, setAsunto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [numSolicitud, setNumSolicitud] = useState("");

  const canSubmit =
    tipoNovedad !== "" && asunto.trim() !== "" && descripcion.trim() !== "";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setNumSolicitud(generarNumero());
    setSubmitted(true);
  }

  function handleNueva() {
    setTipoNovedad(""); setAsunto(""); setDescripcion("");
    setFechaInicio(""); setSubmitted(false); setNumSolicitud("");
  }

  if (submitted) {
    return (
      <div className="pp-section">
        <div className="pp-card">
          <div className="pp-success">
            <div className="pp-success-icon"><CheckCircle size={28} /></div>
            <h3>Novedad registrada</h3>
            <p>
              Tu novedad de nómina fue registrada y será revisada por el equipo
              de Talento Humano. Recibirás respuesta al correo registrado.
            </p>
            <div className="pp-success-num">{numSolicitud}</div>
            <div className="pp-success-actions">
              <button className="pp-btn secondary" onClick={handleNueva}>
                Registrar otra novedad
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
          <h2 className="pp-section-title">Novedades de Nómina</h2>
          <p className="pp-section-subtitle">
            Reporta incapacidades, licencias, descuentos y correcciones
          </p>
        </div>
      </div>

      <div className="pp-form-note">
        Únicamente se pueden reportar las novedades listadas a continuación.
        Para dudas sobre liquidaciones pasadas, usa el Historial de Solicitudes.
      </div>

      <div className="pp-card">
        <form className="pp-form" onSubmit={handleSubmit}>
          <div className="pp-form-row">
            <div className="pp-field">
              <label className="pp-label">Tipo de novedad *</label>
              <select
                className="pp-select"
                value={tipoNovedad}
                onChange={(e) => setTipoNovedad(e.target.value)}
                required
              >
                <option value="">Seleccionar tipo...</option>
                {TIPOS_NOVEDAD.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="pp-field">
              <label className="pp-label">Fecha de inicio (si aplica)</label>
              <input
                className="pp-input"
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
              />
            </div>
          </div>

          <div className="pp-field">
            <label className="pp-label">Asunto *</label>
            <input
              className="pp-input"
              placeholder="Ej: Incapacidad médica del 10 al 15 de junio"
              value={asunto}
              onChange={(e) => setAsunto(e.target.value)}
              maxLength={120}
              required
            />
          </div>

          <div className="pp-field">
            <label className="pp-label">Descripción detallada *</label>
            <textarea
              className="pp-textarea"
              placeholder="Describe la novedad con toda la información relevante: fechas exactas, número de resolución (si aplica), período afectado, etc."
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={5}
              required
            />
          </div>

          <div className="pp-form-note" style={{ fontSize: 11 }}>
            Si tienes documentos de soporte (incapacidades médicas, resoluciones,
            autorizaciones), por favor entrégalos físicamente a Talento Humano o
            al coordinador de tu área.
          </div>

          <div className="pp-form-actions">
            <button
              type="submit"
              className="pp-btn primary"
              disabled={!canSubmit}
            >
              Registrar novedad
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
