import { useState } from "react";
import "./DashboardPage.css";
import PersonalTab from "./components/PersonalTab";

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

        <div className="dashboard-actions">
          <select className="period-select" defaultValue="2026-06">
            <option value="2026-06">Junio 2026</option>
            <option value="2026-05">Mayo 2026</option>
            <option value="2026-04">Abril 2026</option>
            <option value="2026-03">Marzo 2026</option>
          </select>

          <div className="dashboard-tabs">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                className={activeTab === tab ? "active" : ""}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeTab === "Personal" && <PersonalTab />}

      {activeTab !== "Personal" && (
        <div className="dashboard-placeholder">
          <span>{activeTab}</span>
          <h2>Resumen en construcción</h2>
          <p>Esta pestaña se diseñará después de finalizar Personal.</p>
        </div>
      )}
    </section>
  );
}