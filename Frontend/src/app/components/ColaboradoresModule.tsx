import { useState } from "react";
import { UserPlus, Search, Edit2, Trash2, MapPin } from "lucide-react";

interface Colaborador {
  id: string;
  nombre: string;
  email: string;
  rol: "Administrador" | "Coordinador TH" | "Supervisor";
  municipios: string[];
  activo: boolean;
  ultimoAcceso: string;
}

const COLABORADORES: Colaborador[] = [
  { id: "1", nombre: "Andrés Felipe Mora Gutiérrez", email: "afmora@empiria.co", rol: "Administrador", municipios: ["Todos"], activo: true, ultimoAcceso: "2026-06-11" },
  { id: "2", nombre: "Laura Milena Vargas Cárdenas", email: "lmvargas@empiria.co", rol: "Coordinador TH", municipios: ["Acacías", "El Castillo", "Castilla La Nueva"], activo: true, ultimoAcceso: "2026-06-11" },
  { id: "3", nombre: "Jorge Iván Suárez Mendoza", email: "jisuarez@empiria.co", rol: "Coordinador TH", municipios: ["Granada", "Fuente de Oro"], activo: true, ultimoAcceso: "2026-06-10" },
  { id: "4", nombre: "Marcela Patricia Ospina Vélez", email: "mpospina@empiria.co", rol: "Coordinador TH", municipios: ["Vistahermosa", "Puerto Rico"], activo: true, ultimoAcceso: "2026-06-09" },
  { id: "5", nombre: "Camilo Ernesto Rojas Parra", email: "cerojas@empiria.co", rol: "Coordinador TH", municipios: ["La Macarena"], activo: false, ultimoAcceso: "2026-05-28" },
  { id: "6", nombre: "Diana Carolina Leal Torres", email: "dcleal@empiria.co", rol: "Supervisor", municipios: ["Todos"], activo: true, ultimoAcceso: "2026-06-08" },
];

const rolStyle: Record<string, string> = {
  "Administrador": "bg-violet-50 text-violet-700 border-violet-200",
  "Coordinador TH": "bg-blue-50 text-blue-700 border-blue-200",
  "Supervisor": "bg-cyan-50 text-cyan-700 border-cyan-200",
};

const initials = (name: string) => name.split(" ").filter((_, i) => i < 2).map(w => w[0]).join("");

export function ColaboradoresModule() {
  const [search, setSearch] = useState("");

  const filtered = COLABORADORES.filter(c =>
    c.nombre.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: "1.1rem" }}>Colaboradores</h1>
          <p className="text-muted-foreground text-xs mt-0.5">Usuarios internos y asignación de municipios</p>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs hover:bg-primary/90 transition-colors">
          <UserPlus className="w-3.5 h-3.5" /> Nuevo colaborador
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card rounded-lg border border-border p-3">
          <p className="text-[22px] text-foreground" style={{ fontWeight: 700, lineHeight: 1 }}>{COLABORADORES.filter(c => c.activo).length}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Usuarios activos</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-3">
          <p className="text-[22px] text-foreground" style={{ fontWeight: 700, lineHeight: 1 }}>{COLABORADORES.filter(c => c.rol === "Coordinador TH").length}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Coordinadores TH</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-3">
          <p className="text-[22px] text-foreground" style={{ fontWeight: 700, lineHeight: 1 }}>8</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Municipios asignados</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          className="w-full pl-8 pr-3 py-1.5 rounded border border-border bg-card text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Buscar colaborador…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40">
            <tr className="border-b border-border">
              <th className="text-left px-5 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Colaborador</th>
              <th className="text-left px-3 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Rol</th>
              <th className="text-left px-3 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Municipios asignados</th>
              <th className="text-left px-3 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Último acceso</th>
              <th className="text-left px-3 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Estado</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id} className="border-b border-border hover:bg-secondary/20 transition-colors">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] flex-shrink-0" style={{ fontWeight: 600 }}>
                      {initials(c.nombre)}
                    </div>
                    <div>
                      <p className="text-[12px] text-foreground" style={{ fontWeight: 500 }}>{c.nombre}</p>
                      <p className="text-[10px] text-muted-foreground">{c.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <span className={`text-[11px] px-2 py-0.5 rounded border ${rolStyle[c.rol]}`} style={{ fontWeight: 500 }}>
                    {c.rol}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1">
                    {c.municipios.map(m => (
                      <span key={m} className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border">
                        <MapPin className="w-2.5 h-2.5" /> {m}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-3 text-[12px] text-muted-foreground">{formatDate(c.ultimoAcceso)}</td>
                <td className="px-3 py-3">
                  <span className={`text-[11px] px-2 py-0.5 rounded border ${c.activo ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-secondary text-muted-foreground border-border"}`} style={{ fontWeight: 500 }}>
                    {c.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1.5">
                    <button className="text-muted-foreground hover:text-primary transition-colors">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button className="text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
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
