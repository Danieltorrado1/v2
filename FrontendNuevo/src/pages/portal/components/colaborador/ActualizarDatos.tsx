import { useState } from "react";
import { CheckCircle } from "lucide-react";
import { mockColaborador } from "../../mockData";
import { generarNumero } from "../../utils";

type FieldDef = {
  key: keyof typeof mockColaborador;
  label: string;
  placeholder: string;
  type?: string;
};

const FIELDS: FieldDef[] = [
  { key: "telefono", label: "Teléfono de contacto", placeholder: "Ej: 321 987 6543" },
  { key: "direccion", label: "Dirección de residencia", placeholder: "Cra / Cll, barrio, municipio" },
  { key: "eps", label: "EPS", placeholder: "Nombre de la EPS actual" },
  { key: "banco", label: "Banco", placeholder: "Nombre del banco" },
  { key: "cuentaBancaria", label: "Número de cuenta", placeholder: "Número de cuenta bancaria completo" },
];

export default function ActualizarDatos() {
  const [values, setValues] = useState<Partial<Record<keyof typeof mockColaborador, string>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [numSolicitud, setNumSolicitud] = useState("");

  const hasChanges = FIELDS.some((f) => (values[f.key] ?? "").trim() !== "");

  function handleChange(key: keyof typeof mockColaborador, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasChanges) return;
    setNumSolicitud(generarNumero());
    setSubmitted(true);
  }

  function handleNueva() {
    setValues({}); setSubmitted(false); setNumSolicitud("");
  }

  if (submitted) {
    return (
      <div className="pp-section">
        <div className="pp-card">
          <div className="pp-success">
            <div className="pp-success-icon"><CheckCircle size={28} /></div>
            <h3>Solicitud enviada</h3>
            <p>
              Tu solicitud de actualización de datos fue registrada. Talento
              Humano revisará los cambios y los aplicará en el sistema una vez
              sean aprobados.
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
          <h2 className="pp-section-title">Actualizar mis Datos</h2>
          <p className="pp-section-subtitle">
            Los cambios serán revisados y aprobados por Talento Humano
          </p>
        </div>
      </div>

      <div className="pp-card" style={{ marginBottom: 0 }}>
        <p className="pp-card-title">Datos actuales registrados</p>
        <div className="pp-datos-grid" style={{ marginBottom: 0 }}>
          {[
            { label: "Nombre completo", value: mockColaborador.nombre },
            { label: "Documento", value: mockColaborador.documento },
            { label: "Cargo", value: mockColaborador.cargo },
            { label: "Municipio / Sede", value: mockColaborador.sede },
            { label: "Fecha de ingreso", value: mockColaborador.fechaIngreso },
            { label: "Contrato", value: mockColaborador.contrato },
          ].map((d) => (
            <div key={d.label} className="pp-field">
              <label className="pp-label">{d.label}</label>
              <div className="pp-current-value">{d.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="pp-form-note">
        Solo los campos que completes a continuación serán actualizados.
        Deja en blanco los campos que no deseas cambiar. Los cambios requieren
        aprobación de Talento Humano.
      </div>

      <div className="pp-card">
        <p className="pp-card-title">Solicitar actualización</p>
        <form className="pp-form" onSubmit={handleSubmit}>
          <div className="pp-datos-grid">
            {FIELDS.map((f) => (
              <div key={f.key} className="pp-field">
                <label className="pp-label">{f.label}</label>
                <div className="pp-current-value" style={{ marginBottom: 6, fontSize: 11 }}>
                  Actual: {mockColaborador[f.key]}
                </div>
                <input
                  className="pp-input"
                  type={f.type ?? "text"}
                  placeholder={f.placeholder}
                  value={values[f.key] ?? ""}
                  onChange={(e) => handleChange(f.key, e.target.value)}
                />
              </div>
            ))}
          </div>

          <div className="pp-form-actions">
            <button
              type="submit"
              className="pp-btn primary"
              disabled={!hasChanges}
            >
              Enviar solicitud de cambio
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
