import { useState } from "react";
import { Upload, FolderOpen, FileText, Search, CheckCircle2, File, Archive } from "lucide-react";

const DOC_TYPES = [
  "Cédula de ciudadanía",
  "Contrato de trabajo",
  "Afiliación EPS",
  "Afiliación ARL",
  "Afiliación fondo de pensiones",
  "Exámenes médicos de ingreso",
  "Exámenes médicos periódicos",
  "Antecedentes judiciales",
  "Antecedentes disciplinarios",
  "Fotografía",
  "Diplomas y certificados",
  "RUT",
  "Hoja de vida",
];

const CARGUES_RECIENTES = [
  { id: "1", fecha: "2026-06-10", usuario: "Laura Vargas", municipio: "Acacías", tipo: "Afiliación EPS", cantidad: 12, estado: "Procesado" },
  { id: "2", fecha: "2026-06-09", usuario: "Laura Vargas", municipio: "Granada", tipo: "Contratos de trabajo", cantidad: 8, estado: "Procesado" },
  { id: "3", fecha: "2026-06-08", usuario: "Laura Vargas", municipio: "Vistahermosa", tipo: "Exámenes médicos", cantidad: 5, estado: "En proceso" },
  { id: "4", fecha: "2026-06-07", usuario: "Laura Vargas", municipio: "Todos", tipo: "Antecedentes judiciales", cantidad: 22, estado: "Procesado" },
  { id: "5", fecha: "2026-06-06", usuario: "Laura Vargas", municipio: "La Macarena", tipo: "Cédulas de ciudadanía", cantidad: 6, estado: "Procesado" },
];

export function DocumentosModule() {
  const [selectedTipo, setSelectedTipo] = useState<string | null>(null);
  const [municipio, setMunicipio] = useState("Todos");
  const [dragging, setDragging] = useState(false);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: "1.1rem" }}>Centro de Documentos</h1>
          <p className="text-muted-foreground text-xs mt-0.5">Carga masiva de documentos al expediente de empleados</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        {/* Upload panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Tipo documental */}
          <div className="bg-card rounded-lg border border-border p-4">
            <p className="text-[12px] text-foreground mb-2" style={{ fontWeight: 600 }}>1. Seleccionar tipo documental</p>
            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              {DOC_TYPES.map(tipo => (
                <button
                  key={tipo}
                  onClick={() => setSelectedTipo(tipo === selectedTipo ? null : tipo)}
                  className={`w-full text-left px-2.5 py-1.5 rounded text-[12px] transition-colors ${
                    selectedTipo === tipo
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-secondary text-foreground"
                  }`}
                >
                  {tipo}
                </button>
              ))}
            </div>
          </div>

          {/* Municipio */}
          <div className="bg-card rounded-lg border border-border p-4">
            <p className="text-[12px] text-foreground mb-2" style={{ fontWeight: 600 }}>2. Filtrar por municipio (opcional)</p>
            <select
              className="w-full px-2.5 py-1.5 rounded border border-border bg-secondary text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              value={municipio}
              onChange={e => setMunicipio(e.target.value)}
            >
              {["Todos", "Acacías", "Granada", "Vistahermosa", "La Macarena", "Puerto Rico", "El Castillo", "Castilla La Nueva", "Fuente de Oro"].map(m => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Drop zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer ${
              dragging ? "border-primary bg-blue-50" : "border-border hover:border-primary/50 hover:bg-secondary/40"
            }`}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); }}
          >
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
              <Upload className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-[12px] text-foreground" style={{ fontWeight: 500 }}>Arrastra archivos aquí</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">PDF, imágenes o archivos ZIP · Máx. 50 MB por archivo</p>
            </div>
            <button className="mt-1 px-3 py-1.5 rounded border border-border text-xs text-muted-foreground hover:bg-secondary transition-colors">
              Seleccionar archivos
            </button>
            {selectedTipo && (
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-primary">
                <FileText className="w-3 h-3" />
                <span>Tipo: <strong>{selectedTipo}</strong></span>
              </div>
            )}
          </div>
        </div>

        {/* History panel */}
        <div className="lg:col-span-3">
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <p style={{ fontWeight: 600, fontSize: "0.875rem" }}>Historial de cargues recientes</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-secondary/40">
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Fecha</th>
                  <th className="text-left px-3 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Tipo documental</th>
                  <th className="text-left px-3 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Municipio</th>
                  <th className="text-center px-3 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Docs</th>
                  <th className="text-left px-3 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {CARGUES_RECIENTES.map(c => (
                  <tr key={c.id} className="border-b border-border hover:bg-secondary/20 transition-colors">
                    <td className="px-5 py-2.5 text-[12px] text-muted-foreground">{formatDate(c.fecha)}</td>
                    <td className="px-3 py-2.5 text-[12px] text-foreground" style={{ fontWeight: 500 }}>{c.tipo}</td>
                    <td className="px-3 py-2.5 text-[12px] text-muted-foreground">{c.municipio}</td>
                    <td className="px-3 py-2.5 text-[12px] text-center text-foreground">{c.cantidad}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[11px] px-2 py-0.5 rounded border ${
                        c.estado === "Procesado" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"
                      }`} style={{ fontWeight: 500 }}>
                        {c.estado}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mt-3">
            <div className="bg-card rounded-lg border border-border p-3 text-center">
              <p className="text-[22px] text-foreground" style={{ fontWeight: 700, lineHeight: 1 }}>53</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Docs. este mes</p>
            </div>
            <div className="bg-card rounded-lg border border-border p-3 text-center">
              <p className="text-[22px] text-foreground" style={{ fontWeight: 700, lineHeight: 1 }}>1.847</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Total en repositorio</p>
            </div>
            <div className="bg-card rounded-lg border border-border p-3 text-center">
              <p className="text-[22px] text-foreground" style={{ fontWeight: 700, lineHeight: 1 }}>94%</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Expedientes con docs</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${d} ${months[parseInt(m) - 1]} ${y}`;
}
