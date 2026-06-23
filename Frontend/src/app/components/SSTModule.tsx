import { useState } from "react";
import { Shield, AlertTriangle, CheckCircle2, Upload, Search } from "lucide-react";

const SST_DOCS = [
  { id: "1", nombre: "María Fernanda Torres Ospina", municipio: "Acacías", examenIngreso: true, examenPeriodico: true, capacitacionSST: true, epp: true, inducciones: true, score: 5 },
  { id: "2", nombre: "Carmen Alicia Ruiz Moreno", municipio: "Granada", examenIngreso: true, examenPeriodico: false, capacitacionSST: true, epp: true, inducciones: false, score: 3 },
  { id: "3", nombre: "Rosa Elvira Jiménez Castro", municipio: "Vistahermosa", examenIngreso: true, examenPeriodico: true, capacitacionSST: false, epp: true, inducciones: true, score: 4 },
  { id: "4", nombre: "Nohora Stella Ramírez Bernal", municipio: "El Castillo", examenIngreso: true, examenPeriodico: true, capacitacionSST: true, epp: true, inducciones: true, score: 5 },
  { id: "5", nombre: "Luz Marina Pérez Vargas", municipio: "Puerto Rico", examenIngreso: false, examenPeriodico: false, capacitacionSST: false, epp: false, inducciones: true, score: 1 },
  { id: "6", nombre: "Betty Josefina Herrera Pinto", municipio: "Castilla La Nueva", examenIngreso: false, examenPeriodico: false, capacitacionSST: false, epp: false, inducciones: false, score: 0 },
  { id: "7", nombre: "Esperanza Mireya Suárez Gil", municipio: "Fuente de Oro", examenIngreso: true, examenPeriodico: true, capacitacionSST: true, epp: false, inducciones: true, score: 4 },
];

const DOCS_COLS: [keyof typeof SST_DOCS[0], string][] = [
  ["examenIngreso", "Examen de ingreso"],
  ["examenPeriodico", "Examen periódico"],
  ["capacitacionSST", "Capacitación SST"],
  ["epp", "Entrega EPP"],
  ["inducciones", "Inducciones"],
];

function ScoreBadge({ score }: { score: number }) {
  if (score === 5) return <span className="text-[11px] px-2 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200" style={{ fontWeight: 500 }}>Completo</span>;
  if (score >= 3) return <span className="text-[11px] px-2 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200" style={{ fontWeight: 500 }}>{score}/5 docs</span>;
  return <span className="text-[11px] px-2 py-0.5 rounded border bg-red-50 text-red-700 border-red-200" style={{ fontWeight: 500 }}>{score}/5 docs</span>;
}

export function SSTModule() {
  const [search, setSearch] = useState("");
  const filtered = SST_DOCS.filter(e => e.nombre.toLowerCase().includes(search.toLowerCase()) || e.municipio.toLowerCase().includes(search.toLowerCase()));
  const completos = SST_DOCS.filter(e => e.score === 5).length;
  const incompletos = SST_DOCS.filter(e => e.score < 5).length;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: "1.1rem" }}>Seguridad y Salud en el Trabajo — SST</h1>
          <p className="text-muted-foreground text-xs mt-0.5">Control de documentos y requisitos SST por empleado</p>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs hover:bg-primary/90 transition-colors">
          <Upload className="w-3.5 h-3.5" /> Carga masiva
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card rounded-lg border border-border p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-5 h-5 text-accent" />
          </div>
          <div>
            <p className="text-[22px] text-foreground" style={{ fontWeight: 700, lineHeight: 1 }}>{completos}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Expedientes completos</p>
          </div>
        </div>
        <div className="bg-card rounded-lg border border-border p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-amber-50 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <p className="text-[22px] text-foreground" style={{ fontWeight: 700, lineHeight: 1 }}>{incompletos}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Con documentos faltantes</p>
          </div>
        </div>
        <div className="bg-card rounded-lg border border-border p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-blue-50 flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-[22px] text-foreground" style={{ fontWeight: 700, lineHeight: 1 }}>{Math.round((completos / SST_DOCS.length) * 100)}%</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Cobertura SST</p>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              className="w-full pl-8 pr-3 py-1.5 rounded border border-border bg-secondary text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Buscar empleado…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-secondary/40">
            <tr className="border-b border-border">
              <th className="text-left px-5 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Empleado</th>
              <th className="text-left px-3 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Municipio</th>
              {DOCS_COLS.map(([, label]) => (
                <th key={label} className="text-center px-2 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>{label}</th>
              ))}
              <th className="text-left px-3 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(emp => (
              <tr key={emp.id} className="border-b border-border hover:bg-secondary/20 transition-colors">
                <td className="px-5 py-3 text-[12px] text-foreground" style={{ fontWeight: 500 }}>{emp.nombre}</td>
                <td className="px-3 py-3 text-[12px] text-muted-foreground">{emp.municipio}</td>
                {DOCS_COLS.map(([key]) => (
                  <td key={key} className="px-2 py-3 text-center">
                    {emp[key]
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-accent mx-auto" />
                      : <span className="w-3.5 h-3.5 rounded-full bg-red-100 border border-red-300 block mx-auto" />}
                  </td>
                ))}
                <td className="px-3 py-3"><ScoreBadge score={emp.score} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
