import { Boxes, Download, Eye, HardHat, Plus, Signature } from "lucide-react";
import { SstPageHeader } from "./components/SstPageHeader";
import { SstKpis } from "./components/SstKpis";
import { SstToolbar } from "./components/SstToolbar";
import { SstTable } from "./components/SstTable";
import { SstBadge } from "./components/SstBadge";
import "./SstPages.css";

const kpis = [
  { tone: "success" as const, icon: HardHat, label: "Entregas", value: "164" },
  { tone: "warning" as const, icon: HardHat, label: "Pendientes", value: "11" },
  { tone: "info" as const, icon: HardHat, label: "Reposiciones", value: "7" },
  { tone: "danger" as const, icon: Boxes, label: "Stock crítico", value: "3" },
];

type Estado = "Entregado" | "Pendiente" | "Por reponer";

type EntregaEpp = {
  id: string;
  empleado: string;
  municipio: string;
  institucion: string;
  elemento: string;
  talla: string;
  cantidad: number;
  fechaEntrega: string;
  reposicion: string;
  estado: Estado;
  firmado: boolean;
};

const entregas: EntregaEpp[] = [
  { id: "1", empleado: "María Fernanda Torres Ospina", municipio: "Acacías", institucion: "IE Simón Bolívar", elemento: "Gorro de malla", talla: "Única", cantidad: 4, fechaEntrega: "10 Ene 2026", reposicion: "10 Jul 2026", estado: "Entregado", firmado: true },
  { id: "2", empleado: "Carmen Alicia Ruiz Moreno", municipio: "Granada", institucion: "IE Jorge Eliecer Gaitán", elemento: "Guantes de nitrilo", talla: "M", cantidad: 6, fechaEntrega: "10 Ene 2026", reposicion: "10 Abr 2026", estado: "Por reponer", firmado: true },
  { id: "3", empleado: "Rosa Elvira Jiménez Castro", municipio: "Vistahermosa", institucion: "IE Hernando Turbay", elemento: "Delantal industrial", talla: "L", cantidad: 2, fechaEntrega: "15 Feb 2026", reposicion: "15 Ago 2026", estado: "Entregado", firmado: true },
  { id: "4", empleado: "Amparo del Carmen González Leal", municipio: "La Macarena", institucion: "IE La Macarena Centro", elemento: "Botas antideslizantes", talla: "38", cantidad: 1, fechaEntrega: "—", reposicion: "—", estado: "Pendiente", firmado: false },
  { id: "5", empleado: "Luz Marina Pérez Vargas", municipio: "Puerto Rico", institucion: "IE Santa Inés", elemento: "Tapabocas", talla: "Única", cantidad: 10, fechaEntrega: "01 Jun 2026", reposicion: "01 Jul 2026", estado: "Entregado", firmado: false },
  { id: "6", empleado: "Nohora Stella Ramírez Bernal", municipio: "El Castillo", institucion: "IE El Castillo", elemento: "Guantes de nitrilo", talla: "S", cantidad: 6, fechaEntrega: "22 Dic 2025", reposicion: "22 Mar 2026", estado: "Por reponer", firmado: true },
];

function estadoTone(estado: Estado) {
  if (estado === "Entregado") return "success";
  if (estado === "Pendiente") return "warning";
  return "danger";
}

export default function EppPage() {
  return (
    <div className="sst-page">
      <SstPageHeader
        icon={HardHat}
        title="Elementos de Protección Personal"
        subtitle="Inventario y entregas de EPP por colaborador."
      />

      <SstKpis items={kpis} />

      <SstToolbar
        actions={[
          { label: "Registrar entrega", icon: Plus, primary: true },
          { label: "Inventario", icon: Boxes },
          { label: "Exportar", icon: Download },
        ]}
        searchPlaceholder="Buscar por empleado o elemento"
      />

      <SstTable
        columns={[
          "Empleado",
          "Municipio",
          "Institución",
          "Elemento",
          "Talla",
          "Cantidad",
          "Fecha entrega",
          "Reposición",
          "Estado",
          "Firma",
          "Acciones",
        ]}
        gridTemplateColumns="minmax(190px,1.6fr) 110px minmax(150px,1.1fr) minmax(140px,1fr) 80px 90px 120px 120px 120px 100px 80px"
        minWidth={1500}
      >
        {entregas.map((item) => (
          <div className="sst-table-row" key={item.id}>
            <strong>{item.empleado}</strong>
            <span>{item.municipio}</span>
            <span>{item.institucion}</span>
            <span>{item.elemento}</span>
            <span>{item.talla}</span>
            <span>{item.cantidad}</span>
            <span>{item.fechaEntrega}</span>
            <span>{item.reposicion}</span>
            <SstBadge tone={estadoTone(item.estado)}>{item.estado}</SstBadge>
            <SstBadge tone={item.firmado ? "success" : "neutral"}>
              {item.firmado ? "Firmado" : "Pendiente"}
            </SstBadge>
            <div className="sst-row-actions">
              <button type="button" title="Ver detalle" aria-label="Ver detalle">
                <Eye size={15} />
              </button>
              <button type="button" title="Registrar firma" aria-label="Registrar firma">
                <Signature size={15} />
              </button>
            </div>
          </div>
        ))}
      </SstTable>
    </div>
  );
}
