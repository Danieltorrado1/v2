import { useState } from "react";
import { Plus, Download, Upload, CheckCircle2, Clock, XCircle, ChevronDown, ChevronUp } from "lucide-react";

interface Periodo {
  id: string;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  estado: "Procesado" | "En proceso" | "Borrador";
  totalEmpleados: number;
  totalDevengado: string;
  totalDeducciones: string;
  totalNeto: string;
}

const PERIODOS: Periodo[] = [
  {
    id: "1", nombre: "Mayo 2026", fechaInicio: "2026-05-01", fechaFin: "2026-05-31",
    estado: "Procesado", totalEmpleados: 226, totalDevengado: "$187.432.500",
    totalDeducciones: "$24.316.000", totalNeto: "$163.116.500",
  },
  {
    id: "2", nombre: "Junio 2026", fechaInicio: "2026-06-01", fechaFin: "2026-06-30",
    estado: "En proceso", totalEmpleados: 228, totalDevengado: "$189.104.000",
    totalDeducciones: "$24.533.520", totalNeto: "$164.570.480",
  },
  {
    id: "3", nombre: "Abril 2026", fechaInicio: "2026-04-01", fechaFin: "2026-04-30",
    estado: "Procesado", totalEmpleados: 220, totalDevengado: "$182.600.000",
    totalDeducciones: "$23.738.000", totalNeto: "$158.862.000",
  },
];

const EMPLEADOS_PERIODO = [
  { id: "1", nombre: "María Fernanda Torres Ospina", cedula: "1.121.873.256", municipio: "Acacías", salario: "$1.423.500", dias: 30, devengado: "$1.423.500", deduccion: "$184.972", neto: "$1.238.528", estado: "Liquidado" },
  { id: "2", nombre: "Carmen Alicia Ruiz Moreno", cedula: "1.008.342.114", municipio: "Granada", salario: "$1.423.500", dias: 29, devengado: "$1.378.550", deduccion: "$179.211", neto: "$1.199.339", estado: "Novedad" },
  { id: "3", nombre: "Rosa Elvira Jiménez Castro", cedula: "1.120.558.447", municipio: "Vistahermosa", salario: "$1.423.500", dias: 30, devengado: "$1.423.500", deduccion: "$184.972", neto: "$1.238.528", estado: "Liquidado" },
  { id: "4", nombre: "Nohora Stella Ramírez Bernal", cedula: "1.119.002.003", municipio: "El Castillo", salario: "$1.423.500", dias: 30, devengado: "$1.423.500", deduccion: "$184.972", neto: "$1.238.528", estado: "Liquidado" },
  { id: "5", nombre: "Esperanza Mireya Suárez Gil", cedula: "1.123.667.889", municipio: "Fuente de Oro", salario: "$1.423.500", dias: 30, devengado: "$1.591.840", deduccion: "$206.939", neto: "$1.384.901", estado: "Horas extras" },
];

const estadoPeriodoStyle: Record<string, string> = {
  "Procesado": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "En proceso": "bg-blue-50 text-blue-700 border-blue-200",
  "Borrador": "bg-secondary text-muted-foreground border-border",
};

const estadoEmplStyle: Record<string, string> = {
  "Liquidado": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Novedad": "bg-amber-50 text-amber-700 border-amber-200",
  "Horas extras": "bg-blue-50 text-blue-700 border-blue-200",
};

export function NominaModule() {
  const [expandedId, setExpandedId] = useState<string | null>("2");

  return (
    <div className="p-6 space-y-5 max-w-none">
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: "1.1rem" }}>Nómina</h1>
          <p className="text-muted-foreground text-xs mt-0.5">Gestión de periodos de pago — Consorcio PAE META-26</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border text-xs text-muted-foreground hover:bg-secondary transition-colors">
            <Download className="w-3.5 h-3.5" /> Exportar
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs hover:bg-primary/90 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Nuevo periodo
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card rounded-lg border border-border p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Total devengado (jun)</p>
          <p style={{ fontWeight: 700, fontSize: "1.3rem", color: "var(--foreground)" }}>$189.1M</p>
          <p className="text-[11px] text-accent mt-0.5">+0.9% vs mayo</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Total neto a pagar</p>
          <p style={{ fontWeight: 700, fontSize: "1.3rem", color: "var(--foreground)" }}>$164.6M</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">228 empleados activos</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Estado periodo actual</p>
          <div className="flex items-center gap-2 mt-1">
            <Clock className="w-4 h-4 text-blue-500" />
            <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>En proceso</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">14 empleados pendientes</p>
        </div>
      </div>

      {/* Periods */}
      <div className="space-y-3">
        {PERIODOS.map((periodo) => (
          <div key={periodo.id} className="bg-card rounded-lg border border-border overflow-hidden">
            <button
              className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-secondary/30 transition-colors text-left"
              onClick={() => setExpandedId(expandedId === periodo.id ? null : periodo.id)}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2.5">
                  <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>{periodo.nombre}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded border ${estadoPeriodoStyle[periodo.estado]}`} style={{ fontWeight: 500 }}>
                    {periodo.estado}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {formatDate(periodo.fechaInicio)} — {formatDate(periodo.fechaFin)} · {periodo.totalEmpleados} empleados
                </p>
              </div>
              <div className="text-right mr-4">
                <p className="text-[11px] text-muted-foreground">Neto a pagar</p>
                <p style={{ fontWeight: 700, fontSize: "0.95rem" }}>{periodo.totalNeto}</p>
              </div>
              <div className="text-right mr-4">
                <p className="text-[11px] text-muted-foreground">Devengado</p>
                <p style={{ fontWeight: 600, fontSize: "0.875rem" }} className="text-foreground">{periodo.totalDevengado}</p>
              </div>
              {expandedId === periodo.id ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
            </button>

            {expandedId === periodo.id && (
              <div className="border-t border-border">
                <div className="px-5 py-2 bg-secondary/30 flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground" style={{ fontWeight: 500 }}>Personal del periodo (muestra)</p>
                  <button className="text-[11px] text-primary hover:underline flex items-center gap-1">
                    <Upload className="w-3 h-3" /> Cargar personal
                  </button>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-secondary/20">
                    <tr className="border-b border-border">
                      <th className="text-left px-5 py-2 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Empleado</th>
                      <th className="text-left px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Municipio</th>
                      <th className="text-right px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Días</th>
                      <th className="text-right px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Devengado</th>
                      <th className="text-right px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Deducción</th>
                      <th className="text-right px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Neto</th>
                      <th className="text-left px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {EMPLEADOS_PERIODO.map((emp) => (
                      <tr key={emp.id} className="border-b border-border hover:bg-secondary/20 transition-colors">
                        <td className="px-5 py-2.5">
                          <p className="text-[12px] text-foreground" style={{ fontWeight: 500 }}>{emp.nombre}</p>
                          <p className="text-[10px] text-muted-foreground">CC {emp.cedula}</p>
                        </td>
                        <td className="px-3 py-2.5 text-[12px] text-foreground">{emp.municipio}</td>
                        <td className="px-3 py-2.5 text-[12px] text-foreground text-right">{emp.dias}</td>
                        <td className="px-3 py-2.5 text-[12px] text-foreground text-right">{emp.devengado}</td>
                        <td className="px-3 py-2.5 text-[12px] text-red-600 text-right">{emp.deduccion}</td>
                        <td className="px-3 py-2.5 text-[12px] text-foreground text-right" style={{ fontWeight: 600 }}>{emp.neto}</td>
                        <td className="px-3 py-2.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${estadoEmplStyle[emp.estado] ?? "bg-secondary text-muted-foreground border-border"}`} style={{ fontWeight: 500 }}>
                            {emp.estado}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${d} ${months[parseInt(m) - 1]} ${y}`;
}
