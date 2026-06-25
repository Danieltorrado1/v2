import { useState } from "react";
import {
  Banknote,
  Briefcase,
  Calculator,
  Clock,
  Gift,
  HeartPulse,
  MinusCircle,
} from "lucide-react";
import "./CalculadoraSalarioPage.css";

const modalidades = [
  { id: "tc", label: "Tiempo Completo (TC)", salarioBase: 1423500 },
  { id: "mt", label: "Medio Tiempo (MT)", salarioBase: 711750 },
  { id: "ops", label: "Prestación de Servicios (OPS)", salarioBase: 1650000 },
];

function formatCOP(value: number) {
  return `$${Math.round(value).toLocaleString("es-CO")}`;
}

export default function CalculadoraSalarioPage() {
  const [modalidadId, setModalidadId] = useState(modalidades[0].id);
  const [horasExtra, setHorasExtra] = useState(0);
  const [diasIncapacidad, setDiasIncapacidad] = useState(0);
  const [bonificaciones, setBonificaciones] = useState(0);
  const [otrosDescuentos, setOtrosDescuentos] = useState(0);

  const modalidad = modalidades.find((item) => item.id === modalidadId) ?? modalidades[0];

  const diasTrabajados = Math.max(0, 30 - diasIncapacidad);
  const salarioProporcional = (modalidad.salarioBase / 30) * diasTrabajados;
  const valorHoraOrdinaria = modalidad.salarioBase / 240;
  const valorHorasExtra = horasExtra * valorHoraOrdinaria * 1.25;

  const devengado = salarioProporcional + valorHorasExtra + bonificaciones;
  const salud = devengado * 0.04;
  const pension = devengado * 0.04;
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
              max={30}
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
              <strong>{diasTrabajados} / 30</strong>
            </div>
            <div>
              <span>Salario proporcional</span>
              <strong>{formatCOP(salarioProporcional)}</strong>
            </div>
            <div>
              <span>Horas extra (25%)</span>
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
              <span>Salud (4%)</span>
              <strong className="negative">-{formatCOP(salud)}</strong>
            </div>
            <div>
              <span>Pensión (4%)</span>
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
