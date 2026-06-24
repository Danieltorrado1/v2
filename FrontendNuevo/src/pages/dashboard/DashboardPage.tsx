import { useState } from "react";
import "./DashboardPage.css";

const tabs = ["Personal", "Cobertura", "Nómina", "SST", "Portal Colaborador"];

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState("Personal");

  return (
    <section className="dashboard-page">
      <div className="dashboard-header">
        <div>
          <h1>Panel principal</h1>
          <p>Bienvenido de vuelta. Aquí tienes un resumen de tu operación.</p>
        </div>

        <div className="dashboard-tabs">
          {tabs.map((tab) => (
            <button
              key={tab}
              className={activeTab === tab ? "active" : ""}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-card">
          <span>{activeTab}</span>
          <h2>Resumen</h2>
          <p>Indicadores principales del módulo seleccionado.</p>
        </div>
      </div>
    </section>
  );
}