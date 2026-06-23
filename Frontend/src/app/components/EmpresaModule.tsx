import { useState } from "react";
import { Upload, CheckCircle2, AlertCircle, XCircle, Download, Eye, Plus, Search, Building2 } from "lucide-react";

type DocEstado = "vigente" | "pendiente" | "vencido" | "sin_cargar";

interface DocEmpresa {
  id: string;
  nombre: string;
  estado: DocEstado;
  fechaVencimiento?: string;
  fechaCarga?: string;
  tamanio?: string;
  obligatorio: boolean;
}

interface CategoriaDoc {
  id: string;
  titulo: string;
  descripcion: string;
  documentos: DocEmpresa[];
}

const CATEGORIAS: CategoriaDoc[] = [
  {
    id: "constitucion",
    titulo: "Constitución Legal",
    descripcion: "Documentos que acreditan la existencia y representación legal del consorcio.",
    documentos: [
      { id: "c1", nombre: "RUT de la empresa / consorcio", estado: "vigente", fechaCarga: "2026-01-10", tamanio: "234 KB", obligatorio: true },
      { id: "c2", nombre: "Cámara de Comercio", estado: "vigente", fechaCarga: "2026-01-10", fechaVencimiento: "2026-12-31", tamanio: "180 KB", obligatorio: true },
      { id: "c3", nombre: "Acta de conformación del consorcio", estado: "vigente", fechaCarga: "2025-11-05", tamanio: "420 KB", obligatorio: true },
      { id: "c4", nombre: "Certificado de existencia y representación", estado: "pendiente", fechaVencimiento: "2026-06-30", obligatorio: true },
      { id: "c5", nombre: "Poder especial del representante legal", estado: "vigente", fechaCarga: "2025-11-05", tamanio: "195 KB", obligatorio: false },
      { id: "c6", nombre: "Registro de proponentes SECOP", estado: "vigente", fechaCarga: "2026-02-14", tamanio: "312 KB", obligatorio: true },
    ],
  },
  {
    id: "seguridad_social",
    titulo: "Seguridad Social Empresarial",
    descripcion: "Afiliaciones de la empresa ante entidades de seguridad social.",
    documentos: [
      { id: "s1", nombre: "Afiliación ARL — Positiva", estado: "vigente", fechaCarga: "2026-01-15", tamanio: "290 KB", obligatorio: true },
      { id: "s2", nombre: "Afiliación EPS — Salud Total", estado: "vigente", fechaCarga: "2026-01-15", tamanio: "275 KB", obligatorio: true },
      { id: "s3", nombre: "Afiliación EPS — Nueva EPS", estado: "vigente", fechaCarga: "2026-01-15", tamanio: "268 KB", obligatorio: true },
      { id: "s4", nombre: "Afiliación EPS — Medimás", estado: "vigente", fechaCarga: "2026-01-16", tamanio: "271 KB", obligatorio: true },
      { id: "s5", nombre: "Afiliación Caja de Compensación — Compensar", estado: "vigente", fechaCarga: "2026-01-20", tamanio: "305 KB", obligatorio: true },
      { id: "s6", nombre: "Afiliación AFP — Protección", estado: "vigente", fechaCarga: "2026-01-20", tamanio: "290 KB", obligatorio: true },
      { id: "s7", nombre: "Afiliación AFP — Porvenir", estado: "pendiente", obligatorio: true },
      { id: "s8", nombre: "Planilla de autoliquidación PILA (último mes)", estado: "vigente", fechaCarga: "2026-06-05", fechaVencimiento: "2026-07-05", tamanio: "142 KB", obligatorio: true },
    ],
  },
  {
    id: "contrato_pae",
    titulo: "Contrato PAE",
    descripcion: "Documentación contractual del Programa de Alimentación Escolar META-26.",
    documentos: [
      { id: "p1", nombre: "Contrato PAE META-26 vigente", estado: "vigente", fechaCarga: "2026-01-05", tamanio: "1.2 MB", obligatorio: true },
      { id: "p2", nombre: "Adenda No. 1 — Ampliación de cupos", estado: "vigente", fechaCarga: "2026-03-10", tamanio: "380 KB", obligatorio: false },
      { id: "p3", nombre: "Acta de inicio", estado: "vigente", fechaCarga: "2026-01-20", tamanio: "210 KB", obligatorio: true },
      { id: "p4", nombre: "Póliza de cumplimiento", estado: "vigente", fechaCarga: "2026-01-18", fechaVencimiento: "2026-12-31", tamanio: "445 KB", obligatorio: true },
      { id: "p5", nombre: "Póliza de responsabilidad civil extracontractual", estado: "vigente", fechaCarga: "2026-01-18", fechaVencimiento: "2026-12-31", tamanio: "398 KB", obligatorio: true },
      { id: "p6", nombre: "Presupuesto aprobado PAE 2026", estado: "vigente", fechaCarga: "2026-01-08", tamanio: "890 KB", obligatorio: true },
      { id: "p7", nombre: "Acta de supervisión — Mayo 2026", estado: "vigente", fechaCarga: "2026-06-03", tamanio: "320 KB", obligatorio: false },
      { id: "p8", nombre: "Acta de supervisión — Junio 2026", estado: "sin_cargar", obligatorio: false },
    ],
  },
  {
    id: "operacional",
    titulo: "Formatos Operacionales",
    descripcion: "Manuales, protocolos y formatos requeridos para la operación del PAE.",
    documentos: [
      { id: "o1", nombre: "Manual de operaciones PAE", estado: "vigente", fechaCarga: "2026-01-12", tamanio: "2.1 MB", obligatorio: true },
      { id: "o2", nombre: "Plan HACCP (Análisis de Peligros y Puntos Críticos)", estado: "vigente", fechaCarga: "2026-01-12", tamanio: "1.8 MB", obligatorio: true },
      { id: "o3", nombre: "Fichas técnicas de alimentos", estado: "vigente", fechaCarga: "2026-02-01", tamanio: "3.4 MB", obligatorio: true },
      { id: "o4", nombre: "Protocolos de bioseguridad", estado: "vigente", fechaCarga: "2026-01-15", tamanio: "760 KB", obligatorio: true },
      { id: "o5", nombre: "Cronograma de capacitaciones 2026", estado: "vigente", fechaCarga: "2026-01-20", tamanio: "245 KB", obligatorio: true },
      { id: "o6", nombre: "Formato de control de calidad de alimentos", estado: "vigente", fechaCarga: "2026-01-25", tamanio: "190 KB", obligatorio: true },
      { id: "o7", nombre: "Plan de gestión de residuos", estado: "pendiente", obligatorio: false },
      { id: "o8", nombre: "Registro INVIMA productos utilizados", estado: "vencido", fechaVencimiento: "2026-05-30", fechaCarga: "2025-06-01", tamanio: "820 KB", obligatorio: true },
      { id: "o9", nombre: "Licencia sanitaria de establecimientos", estado: "vigente", fechaCarga: "2026-01-10", fechaVencimiento: "2027-01-10", tamanio: "430 KB", obligatorio: true },
      { id: "o10", nombre: "Certificados manipulación de alimentos coordinadores", estado: "sin_cargar", obligatorio: true },
    ],
  },
  {
    id: "financiero",
    titulo: "Documentación Financiera",
    descripcion: "Estados financieros, certificados bancarios y paz y salvos tributarios.",
    documentos: [
      { id: "f1", nombre: "Estados financieros últimos 3 años", estado: "vigente", fechaCarga: "2026-01-08", tamanio: "1.5 MB", obligatorio: true },
      { id: "f2", nombre: "Certificado bancario — Cuenta corriente PAE", estado: "vigente", fechaCarga: "2026-01-10", tamanio: "125 KB", obligatorio: true },
      { id: "f3", nombre: "Paz y salvo DIAN (obligaciones tributarias)", estado: "vigente", fechaCarga: "2026-04-20", fechaVencimiento: "2026-10-20", tamanio: "210 KB", obligatorio: true },
      { id: "f4", nombre: "Paz y salvo seguridad social", estado: "vigente", fechaCarga: "2026-06-05", fechaVencimiento: "2026-07-05", tamanio: "198 KB", obligatorio: true },
      { id: "f5", nombre: "Certificado de capacidad de contratación", estado: "vencido", fechaVencimiento: "2026-05-15", fechaCarga: "2025-05-16", tamanio: "335 KB", obligatorio: true },
    ],
  },
];

const ESTADO_CONFIG: Record<DocEstado, { label: string; badge: string; icon: React.ReactNode; dot: string }> = {
  vigente:     { label: "Vigente",     badge: "bg-emerald-50 text-emerald-600 border-emerald-100", icon: <CheckCircle2 size={13} className="text-emerald-500" />, dot: "#10b981" },
  pendiente:   { label: "Pendiente",   badge: "bg-amber-50 text-amber-600 border-amber-100",       icon: <AlertCircle  size={13} className="text-amber-500" />,   dot: "#f59e0b" },
  vencido:     { label: "Vencido",     badge: "bg-red-50 text-red-600 border-red-100",             icon: <XCircle      size={13} className="text-red-500" />,     dot: "#ef4444" },
  sin_cargar:  { label: "Sin cargar",  badge: "bg-gray-100 text-gray-500 border-gray-200",         icon: <XCircle      size={13} className="text-gray-400" />,     dot: "#d1d5db" },
};

function fmt(d: string): string {
  const [y, m, dd] = d.split("-");
  return `${dd} ${["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][+m-1]} ${y}`;
}

function ProgressBar({ categorias }: { categorias: CategoriaDoc[] }) {
  const all  = categorias.flatMap(c => c.documentos);
  const ok   = all.filter(d => d.estado === "vigente").length;
  const warn = all.filter(d => d.estado === "pendiente").length;
  const bad  = all.filter(d => d.estado === "vencido" || d.estado === "sin_cargar").length;
  const total = all.length;
  return (
    <div className="flex items-center gap-4">
      <div className="flex-1 flex h-2 rounded-full overflow-hidden bg-muted">
        <div style={{ width: `${(ok / total) * 100}%`, background: "#10b981" }} />
        <div style={{ width: `${(warn / total) * 100}%`, background: "#f59e0b" }} />
        <div style={{ width: `${(bad / total) * 100}%`, background: "#ef4444" }} />
      </div>
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-shrink-0">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: "#10b981" }} />{ok} vigentes</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: "#f59e0b" }} />{warn} pendientes</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: "#ef4444" }} />{bad} críticos</span>
      </div>
    </div>
  );
}

export function EmpresaModule() {
  const [search, setSearch]           = useState("");
  const [activeCategoria, setActive]  = useState<string>("constitucion");

  const categoria = CATEGORIAS.find(c => c.id === activeCategoria)!;
  const filteredDocs = categoria.documentos.filter(d =>
    d.nombre.toLowerCase().includes(search.toLowerCase())
  );

  const allDocs = CATEGORIAS.flatMap(c => c.documentos);
  const stats = {
    total:    allDocs.length,
    vigentes: allDocs.filter(d => d.estado === "vigente").length,
    criticos: allDocs.filter(d => d.estado === "vencido" || d.estado === "sin_cargar").length,
    pendientes: allDocs.filter(d => d.estado === "pendiente").length,
  };

  return (
    <div className="p-6 space-y-5 max-w-screen-xl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: "1.1rem", letterSpacing: "-0.02em" }}>
            Empresa
          </h1>
          <p className="text-muted-foreground text-xs mt-0.5">
            Consorcio Complementos PAE META-26 · Documentación legal y operacional
          </p>
        </div>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-foreground text-card text-xs hover:opacity-90 transition-all flex-shrink-0"
          style={{ fontWeight: 500, boxShadow: "var(--shadow-card)" }}
        >
          <Upload size={13} /> Cargar documento
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total documentos",  value: stats.total,     color: "text-foreground",  bg: "bg-card" },
          { label: "Vigentes",          value: stats.vigentes,  color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Pendientes",        value: stats.pendientes,color: "text-amber-600",   bg: "bg-amber-50" },
          { label: "Críticos",          value: stats.criticos,  color: "text-red-600",     bg: "bg-red-50" },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl p-4 ${s.bg}`} style={{ boxShadow: "var(--shadow-card)" }}>
            <p style={{ fontWeight: 700, fontSize: "1.5rem", lineHeight: 1, letterSpacing: "-0.03em" }} className={s.color}>{s.value}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Progress */}
      <div className="bg-card rounded-2xl px-5 py-3.5" style={{ boxShadow: "var(--shadow-card)" }}>
        <ProgressBar categorias={CATEGORIAS} />
      </div>

      {/* Body — sidebar + docs */}
      <div className="flex gap-4 min-h-0">

        {/* Category sidebar */}
        <div className="w-56 flex-shrink-0 space-y-1">
          {CATEGORIAS.map(cat => {
            const ok     = cat.documentos.filter(d => d.estado === "vigente").length;
            const critico= cat.documentos.filter(d => d.estado === "vencido" || d.estado === "sin_cargar").length;
            const isActive = activeCategoria === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => { setActive(cat.id); setSearch(""); }}
                className={`w-full text-left px-3 py-2.5 rounded-xl transition-all ${isActive ? "bg-foreground text-card" : "bg-card hover:bg-secondary text-foreground"}`}
                style={{ boxShadow: isActive ? "0 2px 8px rgba(0,0,0,0.15)" : "var(--shadow-card)" }}
              >
                <p className="text-[12.5px] leading-tight" style={{ fontWeight: isActive ? 600 : 400 }}>{cat.titulo}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px]" style={{ color: isActive ? "rgba(255,255,255,0.6)" : "#6b7280" }}>
                    {ok}/{cat.documentos.length}
                  </span>
                  {critico > 0 && (
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded-full leading-none"
                      style={{
                        background: isActive ? "rgba(239,68,68,0.3)" : "#fef2f2",
                        color: isActive ? "#fca5a5" : "#dc2626",
                        fontWeight: 600,
                      }}
                    >
                      {critico} crítico{critico > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Document list */}
        <div className="flex-1 min-w-0">
          <div className="bg-card rounded-2xl overflow-hidden" style={{ boxShadow: "var(--shadow-card)" }}>
            {/* Category header */}
            <div className="px-5 py-4 border-b border-border" style={{ background: "#fafafa" }}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 style={{ fontWeight: 600, fontSize: "0.9375rem" }}>{categoria.titulo}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{categoria.descripcion}</p>
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    className="pl-8 pr-3 py-1.5 rounded-xl border border-border bg-card text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 w-44"
                    placeholder="Buscar documento…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Docs table */}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border" style={{ background: "#fafafa" }}>
                  <th className="text-left px-5 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Documento</th>
                  <th className="text-left px-3 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Estado</th>
                  <th className="text-left px-3 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Vencimiento</th>
                  <th className="text-left px-3 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Cargado</th>
                  <th className="text-left px-3 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Tamaño</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody>
                {filteredDocs.map(doc => {
                  const cfg = ESTADO_CONFIG[doc.estado];
                  return (
                    <tr key={doc.id} className="border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cfg.dot }} />
                          <div>
                            <p className="text-[12.5px] text-foreground leading-tight" style={{ fontWeight: 500 }}>
                              {doc.nombre}
                              {doc.obligatorio && (
                                <span className="ml-1.5 text-[9px] text-red-400 uppercase tracking-wide" style={{ fontWeight: 600 }}>req.</span>
                              )}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          {cfg.icon}
                          <span className={`text-[11px] px-2 py-0.5 rounded-lg border ${cfg.badge}`} style={{ fontWeight: 500 }}>
                            {cfg.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[12px] text-muted-foreground">
                        {doc.fechaVencimiento ? fmt(doc.fechaVencimiento) : "—"}
                      </td>
                      <td className="px-3 py-3 text-[12px] text-muted-foreground">
                        {doc.fechaCarga ? fmt(doc.fechaCarga) : "—"}
                      </td>
                      <td className="px-3 py-3 text-[12px] text-muted-foreground">
                        {doc.tamanio ?? "—"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          {doc.estado !== "sin_cargar" && (
                            <>
                              <button className="w-6 h-6 rounded-lg flex items-center justify-center bg-muted text-muted-foreground hover:bg-secondary transition-colors" title="Visualizar">
                                <Eye size={11} />
                              </button>
                              <button className="w-6 h-6 rounded-lg flex items-center justify-center bg-muted text-muted-foreground hover:bg-secondary transition-colors" title="Descargar">
                                <Download size={11} />
                              </button>
                            </>
                          )}
                          <button
                            className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors"
                            style={{ background: doc.estado === "sin_cargar" ? "#1a2d6b" : "#f3f4f6", color: doc.estado === "sin_cargar" ? "white" : "#6b7280" }}
                            title="Cargar nuevo"
                          >
                            <Upload size={11} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredDocs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-[12px] text-muted-foreground">
                      No se encontraron documentos para "{search}"
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Add document row */}
            <div className="px-5 py-3 border-t border-border" style={{ background: "#fafafa" }}>
              <button className="flex items-center gap-1.5 text-[12px] text-accent hover:underline" style={{ fontWeight: 500 }}>
                <Plus size={13} /> Agregar documento a esta categoría
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
