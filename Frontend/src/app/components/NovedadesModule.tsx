import { useState } from "react";
import { Plus, AlertCircle, CheckCircle2, Clock, Search } from "lucide-react";

const NOVEDADES = [
  { id: "1", empleado: "Carmen Alicia Ruiz Moreno", cedula: "1.008.342.114", municipio: "Granada", tipo: "Ausencia injustificada", fecha: "2026-06-08", dias: 1, observacion: "No se presentó a laborar sin justificación", estado: "Pendiente", responsable: "Laura Vargas" },
  { id: "2", empleado: "María Fernanda Torres Ospina", cedula: "1.121.873.256", municipio: "Acacías", tipo: "Incapacidad", fecha: "2026-06-09", dias: 3, observacion: "Incapacidad médica emitida por EPS Salud Total", estado: "Aprobada", responsable: "Laura Vargas" },
  { id: "3", empleado: "Luz Marina Pérez Vargas", cedula: "1.122.456.789", municipio: "Puerto Rico", tipo: "Incapacidad", fecha: "2026-06-05", dias: 5, observacion: "EPS Coomeva - diagnóstico respiratorio", estado: "Aprobada", responsable: "Laura Vargas" },
  { id: "4", empleado: "Esperanza Mireya Suárez Gil", cedula: "1.123.667.889", municipio: "Fuente de Oro", tipo: "Horas extras", fecha: "2026-06-07", dias: null, observacion: "4 horas extras diurnas por evento especial PAE", estado: "Aprobada", responsable: "Laura Vargas" },
  { id: "5", empleado: "Amparo del Carmen González Leal", cedula: "1.005.771.338", municipio: "La Macarena", tipo: "Licencia maternidad", fecha: "2026-06-06", dias: 14, observacion: "Licencia remunerada por maternidad", estado: "Aprobada", responsable: "Laura Vargas" },
  { id: "6", empleado: "Rosa Elvira Jiménez Castro", cedula: "1.120.558.447", municipio: "Vistahermosa", tipo: "Permiso remunerado", fecha: "2026-06-10", dias: 1, observacion: "Diligencia personal autorizada por coordinador", estado: "Pendiente", responsable: "Laura Vargas" },
  { id: "7", empleado: "Betty Josefina Herrera Pinto", cedula: "1.118.444.556", municipio: "Castilla La Nueva", tipo: "Suspensión disciplinaria", fecha: "2026-06-03", dias: 2, observacion: "Incumplimiento normas de higiene", estado: "Cerrada", responsable: "Laura Vargas" },
];

const tipoStyle: Record<string, string> = {
  "Incapacidad": "bg-amber-50 text-amber-700 border-amber-200",
  "Ausencia injustificada": "bg-red-50 text-red-700 border-red-200",
  "Horas extras": "bg-blue-50 text-blue-700 border-blue-200",
  "Licencia maternidad": "bg-purple-50 text-purple-700 border-purple-200",
  "Permiso remunerado": "bg-cyan-50 text-cyan-700 border-cyan-200",
  "Suspensión disciplinaria": "bg-gray-100 text-gray-700 border-gray-300",
};

const estadoStyle: Record<string, { badge: string; icon: React.ReactNode }> = {
  "Pendiente": { badge: "bg-amber-50 text-amber-700 border-amber-200", icon: <Clock className="w-3 h-3 text-amber-500" /> },
  "Aprobada": { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="w-3 h-3 text-emerald-500" /> },
  "Cerrada": { badge: "bg-secondary text-muted-foreground border-border", icon: <CheckCircle2 className="w-3 h-3 text-muted-foreground" /> },
};

export function NovedadesModule() {
  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState("Todos");
  const [estadoFilter, setEstadoFilter] = useState("Todos");

  const tipos = ["Todos", ...Array.from(new Set(NOVEDADES.map(n => n.tipo)))];
  const estados = ["Todos", "Pendiente", "Aprobada", "Cerrada"];

  const filtered = NOVEDADES.filter(n => {
    const matchSearch = n.empleado.toLowerCase().includes(search.toLowerCase()) || n.cedula.includes(search);
    const matchTipo = tipoFilter === "Todos" || n.tipo === tipoFilter;
    const matchEstado = estadoFilter === "Todos" || n.estado === estadoFilter;
    return matchSearch && matchTipo && matchEstado;
  });

  const pending = NOVEDADES.filter(n => n.estado === "Pendiente").length;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: "1.1rem" }}>Novedades</h1>
          <p className="text-muted-foreground text-xs mt-0.5">
            {pending > 0 && <span className="text-amber-600">{pending} pendientes de revisión · </span>}
            {filtered.length} registros total
          </p>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs hover:bg-primary/90 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Registrar novedad
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            className="w-full pl-8 pr-3 py-1.5 rounded border border-border bg-card text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Buscar empleado…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="px-2.5 py-1.5 rounded border border-border bg-card text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          value={tipoFilter}
          onChange={(e) => setTipoFilter(e.target.value)}
        >
          {tipos.map(t => <option key={t}>{t}</option>)}
        </select>
        <select
          className="px-2.5 py-1.5 rounded border border-border bg-card text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          value={estadoFilter}
          onChange={(e) => setEstadoFilter(e.target.value)}
        >
          {estados.map(e => <option key={e}>{e}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50">
            <tr className="border-b border-border">
              <th className="text-left px-5 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Empleado</th>
              <th className="text-left px-3 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Tipo de novedad</th>
              <th className="text-left px-3 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Municipio</th>
              <th className="text-left px-3 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Fecha</th>
              <th className="text-center px-3 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Días</th>
              <th className="text-left px-3 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Estado</th>
              <th className="text-left px-3 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Observación</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((n) => (
              <tr key={n.id} className="border-b border-border hover:bg-secondary/20 transition-colors">
                <td className="px-5 py-3">
                  <p className="text-[12px] text-foreground" style={{ fontWeight: 500 }}>{n.empleado}</p>
                  <p className="text-[10px] text-muted-foreground">CC {n.cedula}</p>
                </td>
                <td className="px-3 py-3">
                  <span className={`text-[11px] px-2 py-0.5 rounded border ${tipoStyle[n.tipo] ?? "bg-secondary text-muted-foreground border-border"}`} style={{ fontWeight: 500 }}>
                    {n.tipo}
                  </span>
                </td>
                <td className="px-3 py-3 text-[12px] text-foreground">{n.municipio}</td>
                <td className="px-3 py-3 text-[12px] text-muted-foreground">{formatDate(n.fecha)}</td>
                <td className="px-3 py-3 text-center">
                  {n.dias != null ? <span className="text-[12px] text-foreground">{n.dias}</span> : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1.5">
                    {estadoStyle[n.estado]?.icon}
                    <span className={`text-[11px] px-2 py-0.5 rounded border ${estadoStyle[n.estado]?.badge}`} style={{ fontWeight: 500 }}>
                      {n.estado}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3 max-w-[200px]">
                  <p className="text-[11px] text-muted-foreground truncate">{n.observacion}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${d} ${months[parseInt(m) - 1]} ${y}`;
}
