import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  Briefcase,
  Calculator,
  Clock,
  Gift,
  HeartPulse,
  MinusCircle,
} from "lucide-react";
import { fetchSalarioConfigActiva, type SalarioConfig } from "../../services/configuracionService";
import "./CalculadoraSalarioPage.css";

function formatCOP(value: number) {
  return `$${Math.round(value).toLocaleString("es-CO")}`;
}

export default function CalculadoraSalarioPage() {
  const [config, setConfig] = useState<SalarioConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);

  const [modalidadId, setModalidadId] = useState<"tc" | "mt" | "ops">("tc");
  const [horasExtra, setHorasExtra] = useState(0);
  const [diasIncapacidad, setDiasIncapacidad] = useState(0);
  const [bonificaciones, setBonificaciones] = useState(0);
  const [otrosDescuentos, setOtrosDescuentos] = useState(0);

  useEffect(() => {
    fetchSalarioConfigActiva().then((c) => {
      setConfig(c);
      setConfigLoading(false);
    });
  }, []);

  if (configLoading) {
    return (
      <div className="tool-page">
        <header className="tool-header">
          <div className="tool-header-icon"><Calculator size={22} /></div>
          <div>
            <span>Herramientas</span>
            <h1>Calculadora de salario</h1>
          </div>
        </header>
        <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>Cargando configuración...</p>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="tool-page">
        <header className="tool-header">
          <div className="tool-header-icon"><Calculator size={22} /></div>
          <div>
            <span>Herramientas</span>
            <h1>Calculadora de salario</h1>
          </div>
        </header>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 16px", background: "color-mix(in srgb, var(--color-warning) 10%, var(--bg-secondary))", border: "1px solid color-mix(in srgb, var(--color-warning) 25%, transparent)", borderRadius: 10, fontSize: 13, color: "var(--text-secondary)", marginTop: 8 }}>
          <AlertTriangle size={15} style={{ color: "var(--color-warning)", flexShrink: 0 }} />
          No existe una configuración activa para esta calculadora. Contacte al administrador del sistema.
        </div>
      </div>
    );
  }

  const modalidades = [
    { id: "tc" as const, label: "Tiempo Completo (TC)", salarioBase: config.salario_base_tc },
    { id: "mt" as const, label: "Medio Tiempo (MT)", salarioBase: config.salario_base_mt },
    { id: "ops" as const, label: "Prestación de Servicios (OPS)", salarioBase: config.salario_base_ops },
  ];

  const diasMes = config.dias_mes ?? 30;
  const pctSalud = config.porcentaje_salud / 100;
  const pctPension = config.porcentaje_pension / 100;
  const factorHE = 1 + (config.recargo_horas_extra / 100);

  const modalidad = modalidades.find((item) => item.id === modalidadId) ?? modalidades[0];

  const diasTrabajados = Math.max(0, diasMes - diasIncapacidad);
  const salarioProporcional = (modalidad.salarioBase / diasMes) * diasTrabajados;
  const valorHoraOrdinaria = modalidad.salarioBase / (diasMes * 8);
  const valorHorasExtra = horasExtra * valorHoraOrdinaria * factorHE;

  const devengado = salarioProporcional + valorHorasExtra + bonificaciones;
  const salud = devengado * pctSalud;
  const pension = devengado * pctPension;
  const deducciones = salud + pension + otrosDescuentos;
  const neto = devengado - deducciones;

  return (
    <div className="tool-page">
      <header className="tool-header">
        <div className="tool-header-icon">
          <Calculator size={22} />
        </div>

        <div>
          <span>Herramientas</span>
          <h1>Calculadora de salario</h1>
          <p>Estima el devengado, las deducciones y el neto a pagar de un colaborador.</p>
        </div>
      </header>

      <div className="tool-grid">
        <section className="tool-card">
          <div className="tool-card-title">
            <Briefcase size={18} />
            <h2>Modalidad de trabajo</h2>
          </div>

          <div className="modalidad-options">
            {modalidades.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`modalidad-option ${modalidadId === item.id ? "active" : ""}`}
                onClick={() => setModalidadId(item.id)}
              >
                <strong>{item.label}</strong>
                <span>{formatCOP(item.salarioBase)} / mes</span>
              </button>
            ))}
          </div>
        </section>

        <section className="tool-card">
          <div className="tool-card-title">
            <Clock size={18} />
            <h2>Novedades de nómina</h2>
          </div>

          <div className="novedad-field">
            <label htmlFor="horasExtra">
              <Clock size={15} />
              Horas extra diurnas
            </label>
            <input
              id="horasExtra"
              type="number"
              min={0}
              value={horasExtra}
              onChange={(event) => setHorasExtra(Number(event.target.value) || 0)}
            />
          </div>

          <div className="novedad-field">
            <label htmlFor="incapacidad">
              <HeartPulse size={15} />
              Días de incapacidad
            </label>
            <input
              id="incapacidad"
              type="number"
              min={0}
              max={diasMes}
              value={diasIncapacidad}
              onChange={(event) => setDiasIncapacidad(Number(event.target.value) || 0)}
            />
          </div>

          <div className="novedad-field">
            <label htmlFor="bonificaciones">
              <Gift size={15} />
              Bonificaciones
            </label>
            <input
              id="bonificaciones"
              type="number"
              min={0}
              value={bonificaciones}
              onChange={(event) => setBonificaciones(Number(event.target.value) || 0)}
            />
          </div>

          <div className="novedad-field">
            <label htmlFor="otrosDescuentos">
              <MinusCircle size={15} />
              Otros descuentos
            </label>
            <input
              id="otrosDescuentos"
              type="number"
              min={0}
              value={otrosDescuentos}
              onChange={(event) => setOtrosDescuentos(Number(event.target.value) || 0)}
            />
          </div>
        </section>

        <section className="tool-card resultado-card">
          <div className="tool-card-title">
            <Banknote size={18} />
            <h2>Resultado</h2>
          </div>

          <div className="resultado-rows">
            <div>
              <span>Días trabajados</span>
              <strong>{diasTrabajados} / {diasMes}</strong>
            </div>
            <div>
              <span>Salario proporcional</span>
              <strong>{formatCOP(salarioProporcional)}</strong>
            </div>
            <div>
              <span>Horas extra ({config.recargo_horas_extra}%)</span>
              <strong>{formatCOP(valorHorasExtra)}</strong>
            </div>
            <div>
              <span>Bonificaciones</span>
              <strong>{formatCOP(bonificaciones)}</strong>
            </div>
            <div className="highlight">
              <span>Total devengado</span>
              <strong>{formatCOP(devengado)}</strong>
            </div>
            <div>
              <span>Salud ({config.porcentaje_salud}%)</span>
              <strong className="negative">-{formatCOP(salud)}</strong>
            </div>
            <div>
              <span>Pensión ({config.porcentaje_pension}%)</span>
              <strong className="negative">-{formatCOP(pension)}</strong>
            </div>
            <div>
              <span>Otros descuentos</span>
              <strong className="negative">-{formatCOP(otrosDescuentos)}</strong>
            </div>
          </div>

          <div className="resultado-neto">
            <span>Neto a pagar</span>
            <strong>{formatCOP(neto)}</strong>
          </div>
        </section>
      </div>
    </div>
  );
}
