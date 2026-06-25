import { useState } from "react";
import type { ComponentType } from "react";
import {
  CheckCircle,
  CreditCard,
  FileBarChart,
  FileText,
  Mail,
  Receipt,
  Shield,
  X,
} from "lucide-react";
import { mockColaborador } from "../../mockData";
import { maskEmail, generarNumero } from "../../utils";

type DocType = {
  id: string;
  label: string;
  description: string;
  Icon: ComponentType<{ size?: number }>;
};

const DOC_TYPES: DocType[] = [
  {
    id: "certificacion-laboral",
    label: "Certificación Laboral",
    description: "Constancia de vinculación, cargo y salario vigente",
    Icon: FileText,
  },
  {
    id: "desprendible-pago",
    label: "Desprendible de Pago",
    description: "Comprobante del último período de nómina liquidado",
    Icon: Receipt,
  },
  {
    id: "certificado-ingresos",
    label: "Certificado de Ingresos",
    description: "Certificado de ingresos y retenciones del período",
    Icon: FileBarChart,
  },
  {
    id: "constancia-afiliacion",
    label: "Constancia de Afiliación",
    description: "Constancia de afiliación al sistema de seguridad social",
    Icon: Shield,
  },
  {
    id: "carta-no-adeudo",
    label: "Carta de No Adeudo",
    description: "Certificación de que no existen deudas pendientes con la empresa",
    Icon: CreditCard,
  },
];

export default function SolicitudDocumentos() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [numSolicitud, setNumSolicitud] = useState("");

  const selectedDoc = DOC_TYPES.find((d) => d.id === selectedId);

  function handleSolicitar() {
    if (!selectedId) return;
    setModalOpen(true);
  }

  function handleConfirmar() {
    const num = generarNumero();
    setNumSolicitud(num);
    setModalOpen(false);
    setSubmitted(true);
  }

  function handleNueva() {
    setSelectedId(null);
    setSubmitted(false);
    setNumSolicitud("");
  }

  if (submitted) {
    return (
      <div className="pp-section">
        <div className="pp-card">
          <div className="pp-success">
            <div className="pp-success-icon">
              <CheckCircle size={28} />
            </div>
            <h3>Solicitud registrada</h3>
            <p>
              Tu solicitud fue registrada exitosamente. El documento será enviado
              al correo registrado en la base de datos una vez sea procesado por
              Talento Humano.
            </p>
            <div className="pp-success-num">{numSolicitud}</div>
            <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
              No se permite la descarga directa de documentos desde el Portal.
            </p>
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
          <h2 className="pp-section-title">Solicitud de Documentos</h2>
          <p className="pp-section-subtitle">
            Selecciona el documento que necesitas. Será enviado al correo registrado.
          </p>
        </div>
      </div>

      <div className="pp-doc-grid">
        {DOC_TYPES.map((doc) => {
          const { Icon } = doc;
          return (
            <div
              key={doc.id}
              className={`pp-doc-card ${selectedId === doc.id ? "selected" : ""}`}
              onClick={() => setSelectedId(doc.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setSelectedId(doc.id)}
            >
              <div className="pp-doc-icon">
                <Icon size={18} />
              </div>
              <div className="pp-doc-label">{doc.label}</div>
              <div className="pp-doc-desc">{doc.description}</div>
            </div>
          );
        })}
      </div>

      <div className="pp-form-note">
        Los documentos son enviados <strong>exclusivamente</strong> al correo
        electrónico registrado en la base de datos. No está permitida la descarga
        directa desde el Portal.
      </div>

      <div className="pp-form-actions">
        <button
          className="pp-btn primary"
          onClick={handleSolicitar}
          disabled={!selectedId}
        >
          Solicitar documento
        </button>
      </div>

      {modalOpen && selectedDoc && (
        <div className="pp-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="pp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pp-modal-header">
              <h3>Confirmar solicitud</h3>
              <button className="pp-modal-close" onClick={() => setModalOpen(false)}>
                <X size={14} />
              </button>
            </div>
            <div className="pp-modal-body">
              <p>
                Estás solicitando: <strong>{selectedDoc.label}</strong>
              </p>
              <p>
                Este documento será enviado <strong>únicamente</strong> al correo
                electrónico registrado en la base de datos:
              </p>
              <div className="pp-email-masked">
                <Mail size={16} />
                <span>{maskEmail(mockColaborador.emailRegistrado)}</span>
              </div>
              <p className="pp-modal-warning">
                No se permite la descarga directa de documentos desde el Portal del
                Colaborador. Si necesitas actualizar tu correo, usa la sección
                "Actualizar mis datos".
              </p>
            </div>
            <div className="pp-modal-footer">
              <button className="pp-btn secondary" onClick={() => setModalOpen(false)}>
                Cancelar
              </button>
              <button className="pp-btn primary" onClick={handleConfirmar}>
                Confirmar solicitud
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
