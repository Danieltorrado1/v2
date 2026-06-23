import { useState } from "react";
import {
  Search, Upload, Download, UserPlus,
  CheckCircle2, XCircle, AlertCircle,
  ChevronRight, X, Phone, Mail, MapPin, Calendar,
  FileText, Shield, History, ArrowRight, Building2,
} from "lucide-react";
import { DEFAULT_EMPRESA_CONFIGS } from "./empresaConfig";

const TODAY         = new Date("2026-06-12");
const CURRENT_MONTH = TODAY.getMonth();
const CURRENT_YEAR  = TODAY.getFullYear();

function isCurrentMonth(dateStr: string): boolean {
  const d = new Date(dateStr);
  return d.getMonth() === CURRENT_MONTH && d.getFullYear() === CURRENT_YEAR;
}

function fmt(d: string): string {
  const [y, m, dd] = d.split("-");
  return `${dd} ${["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][+m-1]} ${y}`;
}

interface Periodo {
  fechaInicio: string;
  fechaFin: string | null;  // null = vínculo activo
  tipoContrato: "Término fijo" | "Obra o labor" | "Indefinido";
}

interface Novedad {
  id: string;
  tipo: string;
  fecha: string;
  observacion: string;
}

interface Operario {
  id: string;
  cedula: string;
  nombre: string;
  iniciales: string;
  municipio: string;
  institucion: string;
  telefono: string;
  email: string;
  eps: string;
  afp: string;
  empresaTipo: string;              // references EmpresaConfig.id
  contrato: Record<string, string>; // dynamic fields keyed by CampoContrato.key
  periodos: Periodo[];              // ordered oldest→newest; last period drives estado
  checklist: {
    cedula: boolean; contrato: boolean; eps: boolean; afp: boolean;
    examenes: boolean; fotografia: boolean; antecedentes: boolean; certificadosEstudio: boolean;
    examenPeriodico: boolean; induccionSST: boolean;
  };
  novedades: Novedad[];
}

const checklistLabels: [keyof Operario["checklist"], string][] = [
  ["cedula",              "Cédula de ciudadanía"],
  ["contrato",            "Contrato de trabajo"],
  ["eps",                 "Afiliación EPS"],
  ["afp",                 "Afiliación AFP"],
  ["examenes",            "Examen médico de ingreso"],
  ["examenPeriodico",     "Examen médico periódico"],
  ["fotografia",          "Fotografía"],
  ["antecedentes",        "Antecedentes judiciales"],
  ["certificadosEstudio", "Certificados de estudio"],
  ["induccionSST",        "Inducción SST"],
];

const OPERARIOS: Operario[] = [
  {
    id: "1", cedula: "1.121.873.256", nombre: "María Fernanda Torres Ospina", iniciales: "MT",
    municipio: "Acacías", institucion: "IE Simón Bolívar",
    telefono: "316 742 8901", email: "mftorres@correo.co", eps: "Salud Total", afp: "Protección",
    empresaTipo: "pae",
    contrato: { institucion: "IE Simón Bolívar", sede: "Principal", modalidad: "Almuerzo", municipio: "Acacías" },
    periodos: [
      { fechaInicio: "2025-01-15", fechaFin: "2025-06-30", tipoContrato: "Término fijo" },
      { fechaInicio: "2026-01-15", fechaFin: null,         tipoContrato: "Término fijo" },
    ],
    checklist: { cedula: true, contrato: true, eps: true, afp: true, examenes: true, examenPeriodico: true, fotografia: true, antecedentes: true, certificadosEstudio: true, induccionSST: true },
    novedades: [
      { id: "n1", tipo: "Incapacidad",      fecha: "2026-06-09", observacion: "Incapacidad médica 3 días, EPS Salud Total" },
      { id: "n2", tipo: "Permiso remunerado", fecha: "2026-05-22", observacion: "Diligencia personal autorizada" },
    ],
  },
  {
    id: "2", cedula: "1.008.342.114", nombre: "Carmen Alicia Ruiz Moreno", iniciales: "CR",
    municipio: "Granada", institucion: "IE Jorge Eliecer Gaitán",
    telefono: "311 589 2034", email: "caruiz@correo.co", eps: "Nueva EPS", afp: "Porvenir",
    empresaTipo: "pae",
    contrato: { institucion: "IE Jorge Eliecer Gaitán", sede: "Principal", modalidad: "Almuerzo y Refrigerio", municipio: "Granada" },
    periodos: [
      { fechaInicio: "2026-02-03", fechaFin: null, tipoContrato: "Término fijo" },
    ],
    checklist: { cedula: true, contrato: true, eps: true, afp: true, examenes: false, examenPeriodico: false, fotografia: true, antecedentes: false, certificadosEstudio: true, induccionSST: true },
    novedades: [
      { id: "n3", tipo: "Ausencia injustificada", fecha: "2026-06-08", observacion: "No se presentó sin justificación" },
      { id: "n4", tipo: "Incapacidad",            fecha: "2026-04-15", observacion: "Incapacidad 5 días" },
    ],
  },
  {
    id: "3", cedula: "1.120.558.447", nombre: "Rosa Elvira Jiménez Castro", iniciales: "RJ",
    municipio: "Vistahermosa", institucion: "IE Hernando Turbay Quijano",
    telefono: "300 123 7788", email: "rejocastro@correo.co", eps: "Medimás", afp: "Colfondos",
    empresaTipo: "pae",
    contrato: { institucion: "IE Hernando Turbay Quijano", sede: "Sede B", modalidad: "Refrigerio", municipio: "Vistahermosa" },
    periodos: [
      { fechaInicio: "2024-03-10", fechaFin: "2024-12-20", tipoContrato: "Obra o labor" },
      { fechaInicio: "2026-03-10", fechaFin: null,          tipoContrato: "Obra o labor" },
    ],
    checklist: { cedula: true, contrato: true, eps: true, afp: true, examenes: true, examenPeriodico: true, fotografia: false, antecedentes: true, certificadosEstudio: true, induccionSST: false },
    novedades: [
      { id: "n5", tipo: "Horas extras", fecha: "2026-06-07", observacion: "4 horas extras evento especial PAE" },
    ],
  },
  {
    id: "4", cedula: "1.005.771.338", nombre: "Amparo del Carmen González Leal", iniciales: "AG",
    municipio: "La Macarena", institucion: "IE La Macarena Centro",
    telefono: "314 991 0022", email: "adgonzalez@correo.co", eps: "Salud Total", afp: "Protección",
    empresaTipo: "pae",
    contrato: { institucion: "IE La Macarena Centro", sede: "Principal", modalidad: "Almuerzo", municipio: "La Macarena" },
    periodos: [
      { fechaInicio: "2025-01-10", fechaFin: "2025-06-30", tipoContrato: "Término fijo" },
      { fechaInicio: "2025-11-20", fechaFin: "2026-05-31", tipoContrato: "Término fijo" },
    ],
    checklist: { cedula: true, contrato: true, eps: true, afp: true, examenes: true, examenPeriodico: true, fotografia: true, antecedentes: true, certificadosEstudio: true, induccionSST: true },
    novedades: [
      { id: "n6", tipo: "Licencia maternidad", fecha: "2026-05-06", observacion: "14 días licencia remunerada" },
    ],
  },
  {
    id: "5", cedula: "1.122.456.789", nombre: "Luz Marina Pérez Vargas", iniciales: "LP",
    municipio: "Puerto Rico", institucion: "IE Santa Inés",
    telefono: "318 220 5544", email: "lmperez@correo.co", eps: "Coomeva", afp: "Skandia",
    empresaTipo: "pae",
    contrato: { institucion: "IE Santa Inés", sede: "Principal", modalidad: "Almuerzo y Refrigerio", municipio: "Puerto Rico" },
    periodos: [
      { fechaInicio: "2026-04-01", fechaFin: null, tipoContrato: "Término fijo" },
    ],
    checklist: { cedula: true, contrato: false, eps: false, afp: true, examenes: false, examenPeriodico: false, fotografia: true, antecedentes: true, certificadosEstudio: false, induccionSST: false },
    novedades: [
      { id: "n7", tipo: "Incapacidad", fecha: "2026-06-05", observacion: "Diagnóstico respiratorio, 5 días" },
      { id: "n8", tipo: "Incapacidad", fecha: "2026-05-10", observacion: "Incapacidad 3 días" },
    ],
  },
  {
    id: "6", cedula: "1.119.002.003", nombre: "Nohora Stella Ramírez Bernal", iniciales: "NR",
    municipio: "El Castillo", institucion: "IE El Castillo",
    telefono: "310 778 9012", email: "nsramirez@correo.co", eps: "SOS", afp: "Protección",
    empresaTipo: "pae",
    contrato: { institucion: "IE El Castillo", sede: "Sede Única", modalidad: "Almuerzo", municipio: "El Castillo" },
    periodos: [
      { fechaInicio: "2022-01-10", fechaFin: "2022-12-31", tipoContrato: "Indefinido" },
      { fechaInicio: "2023-06-15", fechaFin: null,         tipoContrato: "Indefinido" },
    ],
    checklist: { cedula: true, contrato: true, eps: true, afp: true, examenes: true, examenPeriodico: true, fotografia: true, antecedentes: true, certificadosEstudio: true, induccionSST: true },
    novedades: [],
  },
  {
    id: "7", cedula: "1.118.444.556", nombre: "Betty Josefina Herrera Pinto", iniciales: "BH",
    municipio: "Castilla La Nueva", institucion: "IE Nuestra Señora del Carmen",
    telefono: "315 332 8871", email: "bjherrera@correo.co", eps: "Medimás", arl: "Positiva",
    empresaTipo: "pae",
    contrato: { institucion: "IE Nuestra Señora del Carmen", sede: "Principal", modalidad: "Refrigerio", municipio: "Castilla La Nueva" },
    periodos: [
      { fechaInicio: "2026-01-20", fechaFin: "2026-06-30", tipoContrato: "Término fijo" },
    ],
    checklist: { cedula: false, contrato: false, eps: false, afp: false, examenes: false, examenPeriodico: false, fotografia: false, antecedentes: true, certificadosEstudio: true, induccionSST: false },
    novedades: [
      { id: "n9", tipo: "Suspensión disciplinaria", fecha: "2026-06-03", observacion: "Incumplimiento normas de higiene, 2 días" },
    ],
  },
  {
    id: "8", cedula: "1.123.667.889", nombre: "Esperanza Mireya Suárez Gil", iniciales: "ES",
    municipio: "Fuente de Oro", institucion: "IE Marco Fidel Suárez",
    telefono: "317 445 0098", email: "emsuarez@correo.co", eps: "Nueva EPS", arl: "Colpatria",
    empresaTipo: "pae",
    contrato: { institucion: "IE Marco Fidel Suárez", sede: "Sede Rural", modalidad: "Almuerzo", municipio: "Fuente de Oro" },
    periodos: [
      { fechaInicio: "2025-02-14", fechaFin: "2025-12-31", tipoContrato: "Obra o labor" },
      { fechaInicio: "2026-02-14", fechaFin: null,          tipoContrato: "Obra o labor" },
    ],
    checklist: { cedula: true, contrato: true, eps: true, afp: true, examenes: false, examenPeriodico: true, fotografia: true, antecedentes: true, certificadosEstudio: true, induccionSST: true },
    novedades: [
      { id: "n10", tipo: "Horas extras",     fecha: "2026-06-07", observacion: "4 horas extras diurnas" },
      { id: "n11", tipo: "Permiso remunerado", fecha: "2026-05-30", observacion: "Cita médica" },
    ],
  },
];

const MUNICIPIOS = ["Todos", "Acacías", "Granada", "Vistahermosa", "La Macarena", "Puerto Rico", "El Castillo", "Castilla La Nueva", "Fuente de Oro"];
const ESTADOS    = ["Todos", "Activo", "Retirado"];

const tipoNovedadColor: Record<string, string> = {
  "Incapacidad":              "bg-amber-50 text-amber-600 border-amber-100",
  "Ausencia injustificada":   "bg-red-50 text-red-600 border-red-100",
  "Horas extras":             "bg-blue-50 text-blue-600 border-blue-100",
  "Licencia maternidad":      "bg-purple-50 text-purple-600 border-purple-100",
  "Permiso remunerado":       "bg-cyan-50 text-cyan-600 border-cyan-100",
  "Suspensión disciplinaria": "bg-gray-100 text-gray-600 border-gray-200",
};

const avatarGradients = [
  "135deg, #10b981, #059669", "135deg, #3b82f6, #2563eb",
  "135deg, #8b5cf6, #7c3aed", "135deg, #f59e0b, #d97706",
  "135deg, #ef4444, #dc2626", "135deg, #06b6d4, #0891b2",
];

function lastPeriodo(op: Operario): Periodo {
  return op.periodos[op.periodos.length - 1];
}
function isActivo(op: Operario): boolean {
  return lastPeriodo(op).fechaFin === null;
}
function docsIncompletos(op: Operario): string[] {
  return checklistLabels.filter(([k]) => !op.checklist[k]).map(([, l]) => l);
}
function novedadesMesActual(op: Operario): Novedad[] {
  return op.novedades.filter(n => isCurrentMonth(n.fecha));
}

// ── Apple SaaS section wrapper ──────────────────────────────────────────────
function Section({ title, badge, children }: { title: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl overflow-hidden" style={{ boxShadow: "var(--shadow-card)" }}>
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b border-border">
        <p style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>
          {title}
        </p>
        {badge}
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

function DataField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p style={{ fontSize: "0.625rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: "2px" }}>
        {label}
      </p>
      <p style={{ fontSize: "0.8125rem", fontWeight: 500, color: value ? "var(--foreground)" : "var(--muted-foreground)", fontStyle: value ? "normal" : "italic" }}>
        {value || "—"}
      </p>
    </div>
  );
}

// Single period row: "DD Mmm AAAA → DD Mmm AAAA" or "DD Mmm AAAA → ACTIVO"
function PeriodoRow({ p }: { p: Periodo }) {
  const activo = p.fechaFin === null;
  return (
    <div className="flex items-center gap-1.5 py-0.5">
      <span className="text-[11px] text-muted-foreground tabular-nums">{fmt(p.fechaInicio)}</span>
      <ArrowRight size={9} className="text-muted-foreground/50 flex-shrink-0" />
      {activo ? (
        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-100 leading-none" style={{ fontWeight: 600 }}>
          ACTIVO
        </span>
      ) : (
        <span className="text-[11px] text-muted-foreground tabular-nums">{fmt(p.fechaFin!)}</span>
      )}
    </div>
  );
}

export function OperariosModule() {
  const [search,     setSearch]     = useState("");
  const [municipio,  setMun]        = useState("Todos");
  const [estadoFil,  setEstadoFil]  = useState("Todos");
  const [selectedId, setSel]        = useState<string | null>(null);
  const [detailTab,  setDetailTab]  = useState<"expediente" | "novedades">("expediente");

  const filtered = OPERARIOS.filter(op => {
    const matchS = op.nombre.toLowerCase().includes(search.toLowerCase()) || op.cedula.includes(search);
    const matchM = municipio  === "Todos" || op.municipio === municipio;
    const activo = isActivo(op);
    const matchE = estadoFil  === "Todos"
      || (estadoFil === "Activo"   &&  activo)
      || (estadoFil === "Retirado" && !activo);
    return matchS && matchM && matchE;
  });

  const selected = OPERARIOS.find(o => o.id === selectedId) ?? null;

  return (
    <div className="flex h-full">

      {/* ── LIST PANEL ── */}
      <div className={`flex flex-col ${selected ? "w-[58%]" : "w-full"} transition-all duration-200`}>

        {/* Header */}
        <div className="px-6 py-4 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: "1.1rem", letterSpacing: "-0.02em" }}>
                Operarios Manipuladores
              </h1>
              <p className="text-muted-foreground text-xs mt-0.5">{filtered.length} registros · PAE Meta departamento</p>
            </div>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-card text-xs text-muted-foreground hover:bg-secondary transition-colors" style={{ boxShadow: "var(--shadow-card)" }}>
                <Download size={13} /> Exportar
              </button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-card text-xs text-muted-foreground hover:bg-secondary transition-colors" style={{ boxShadow: "var(--shadow-card)" }}>
                <Upload size={13} /> Importar
              </button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-foreground text-card text-xs hover:opacity-90 transition-all" style={{ fontWeight: 500, boxShadow: "var(--shadow-card)" }}>
                <UserPlus size={13} /> Nuevo operario
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-border bg-card text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30"
                placeholder="Buscar por nombre o cédula…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select className="px-2.5 py-1.5 rounded-xl border border-border bg-card text-xs focus:outline-none focus:ring-2 focus:ring-accent/30" value={municipio} onChange={e => setMun(e.target.value)}>
              {MUNICIPIOS.map(m => <option key={m}>{m}</option>)}
            </select>
            <select className="px-2.5 py-1.5 rounded-xl border border-border bg-card text-xs focus:outline-none focus:ring-2 focus:ring-accent/30" value={estadoFil} onChange={e => setEstadoFil(e.target.value)}>
              {ESTADOS.map(e => <option key={e}>{e}</option>)}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="bg-card rounded-2xl overflow-hidden" style={{ boxShadow: "var(--shadow-card)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border" style={{ background: "#fafafa" }}>
                  <th className="text-left px-5 py-3 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Empleado</th>
                  <th className="text-left px-3 py-3 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Municipio / IE</th>
                  <th className="text-left px-3 py-3 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Ingreso → Retiro</th>
                  <th className="text-left px-3 py-3 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Alertas</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((op, idx) => {
                  const isSelected = op.id === selectedId;
                  const activo     = isActivo(op);
                  const docs       = docsIncompletos(op);
                  const novsMes    = novedadesMesActual(op);

                  return (
                    <tr
                      key={op.id}
                      onClick={() => { setSel(isSelected ? null : op.id); setDetailTab("expediente"); }}
                      className={`border-b border-border cursor-pointer transition-colors last:border-b-0 ${isSelected ? "bg-emerald-50/60" : "hover:bg-muted/40"}`}
                    >
                      {/* Empleado */}
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-white text-[11px]"
                            style={{ background: `linear-gradient(${avatarGradients[idx % avatarGradients.length]})`, fontWeight: 700 }}
                          >
                            {op.iniciales}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-[13px] text-foreground leading-tight" style={{ fontWeight: 500 }}>{op.nombre}</p>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded-md border leading-none ${activo ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-red-50 text-red-600 border-red-100"}`}
                                style={{ fontWeight: 600 }}
                              >
                                {activo ? "ACTIVO" : "RETIRADO"}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">CC {op.cedula}</p>
                          </div>
                        </div>
                      </td>

                      {/* Municipio */}
                      <td className="px-3 py-3">
                        <p className="text-[13px] text-foreground">{op.municipio}</p>
                        <p className="text-[11px] text-muted-foreground truncate max-w-[140px]">{op.institucion}</p>
                      </td>

                      {/* Periodos — one row per period */}
                      <td className="px-3 py-3">
                        <div className="divide-y divide-border/60">
                          {op.periodos.map((p, i) => (
                            <PeriodoRow key={i} p={p} />
                          ))}
                        </div>
                      </td>

                      {/* Alertas */}
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-1">
                          {docs.length > 0 && (
                            <div className="flex items-center gap-1">
                              <AlertCircle size={11} className="text-red-400 flex-shrink-0" />
                              <span className="text-[10px] text-red-500">{docs.length} doc{docs.length > 1 ? "s." : "."} faltante{docs.length > 1 ? "s" : ""}</span>
                            </div>
                          )}
                          {novsMes.length > 0 && (
                            <div className="flex items-center gap-1">
                              <AlertCircle size={11} className="text-amber-400 flex-shrink-0" />
                              <span className="text-[10px] text-amber-600">{novsMes.length} nov. jun.</span>
                            </div>
                          )}
                          {docs.length === 0 && novsMes.length === 0 && (
                            <div className="flex items-center gap-1">
                              <CheckCircle2 size={11} className="text-accent flex-shrink-0" />
                              <span className="text-[10px] text-muted-foreground">Sin alertas</span>
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-3 py-3">
                        <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isSelected ? "rotate-90 text-accent" : ""}`} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── DETAIL PANEL ── */}
      {selected && (() => {
        const activo    = isActivo(selected);
        const docs      = docsIncompletos(selected);
        const novsMes   = novedadesMesActual(selected);
        const novsHist  = selected.novedades.filter(n => !isCurrentMonth(n.fecha));
        const checkDone = Object.values(selected.checklist).filter(Boolean).length;
        const checkTotal= Object.values(selected.checklist).length;

        return (
          <div className="w-[42%] border-l border-border bg-background overflow-y-auto flex-shrink-0">
            {/* Sticky header + tabs */}
            <div className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border z-10">
              <div className="flex items-center justify-between px-5 py-3">
                <h2 style={{ fontWeight: 600, fontSize: "0.875rem" }}>Expediente del empleado</h2>
                <button onClick={() => setSel(null)} className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors">
                  <X size={14} />
                </button>
              </div>
              <div className="flex px-5 gap-1 pb-3">
                {(["expediente", "novedades"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setDetailTab(tab)}
                    className={`px-3 py-1.5 rounded-xl text-xs transition-all ${detailTab === tab ? "bg-foreground text-card" : "text-muted-foreground hover:bg-muted"}`}
                    style={{ fontWeight: detailTab === tab ? 600 : 400 }}
                  >
                    {tab === "expediente" ? "Expediente" : `Novedades${novsMes.length > 0 ? ` (${novsMes.length})` : ""}`}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Apple SaaS premium expediente body ── */}
            <div className="p-5 space-y-5">

              {/* Hero profile card */}
              <div
                className="rounded-2xl overflow-hidden"
                style={{ background: "linear-gradient(135deg, #0f1923 0%, #1a3a5c 100%)", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}
              >
                <div className="px-5 pt-5 pb-4 flex items-start gap-4">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-white flex-shrink-0 border-2 border-white/20"
                    style={{ background: "linear-gradient(135deg, #10b981, #059669)", fontSize: "1.15rem", fontWeight: 700, letterSpacing: "-0.02em" }}
                  >
                    {selected.iniciales}
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p style={{ fontWeight: 600, fontSize: "0.9375rem", color: "#fff", letterSpacing: "-0.01em" }}>{selected.nombre}</p>
                    <p style={{ fontSize: "0.6875rem", color: "rgba(255,255,255,0.5)", marginTop: "2px" }}>CC {selected.cedula}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span
                        className="text-[10px] px-2.5 py-1 rounded-full border leading-none"
                        style={{
                          fontWeight: 700,
                          background: activo ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)",
                          borderColor: activo ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)",
                          color: activo ? "#34d399" : "#f87171",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {activo ? "ACTIVO" : "RETIRADO"}
                      </span>
                      {docs.length > 0 && (
                        <span className="text-[10px] flex items-center gap-1" style={{ color: "#fbbf24" }}>
                          <AlertCircle size={10} /> {docs.length} docs. faltantes
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {/* Contact strip */}
                <div className="flex border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                  <div className="flex-1 flex items-center gap-2 px-4 py-2.5 border-r" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                    <Phone size={11} style={{ color: "rgba(255,255,255,0.4)", flexShrink: 0 }} />
                    <span style={{ fontSize: "0.6875rem", color: "rgba(255,255,255,0.65)" }}>{selected.telefono}</span>
                  </div>
                  <div className="flex-1 flex items-center gap-2 px-4 py-2.5">
                    <Mail size={11} style={{ color: "rgba(255,255,255,0.4)", flexShrink: 0 }} />
                    <span style={{ fontSize: "0.6875rem", color: "#34d399" }} className="truncate">{selected.email}</span>
                  </div>
                </div>
              </div>

              {/* ── EXPEDIENTE TAB ── */}
              {detailTab === "expediente" && (
                <>
                  {/* Períodos de vinculación */}
                  <Section title="Períodos de vinculación">
                    <div className="divide-y divide-border">
                      {selected.periodos.map((p, i) => {
                        const pActivo = p.fechaFin === null;
                        return (
                          <div key={i} className={`flex items-center gap-3 py-2.5 ${i === 0 ? "" : ""}`}>
                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${pActivo ? "bg-accent" : "bg-muted-foreground/30"}`} />
                            <div className="flex-1 flex items-center gap-1.5 flex-wrap min-w-0">
                              <span className="text-[11.5px] text-foreground tabular-nums">{fmt(p.fechaInicio)}</span>
                              <ArrowRight size={9} className="text-muted-foreground/40 flex-shrink-0" />
                              {pActivo
                                ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 leading-none" style={{ fontWeight: 600 }}>ACTIVO</span>
                                : <span className="text-[11.5px] text-muted-foreground tabular-nums">{fmt(p.fechaFin!)}</span>}
                            </div>
                            <span className="text-[10px] text-muted-foreground flex-shrink-0">{p.tipoContrato}</span>
                          </div>
                        );
                      })}
                    </div>
                  </Section>

                  {/* Datos del contrato — dynamic from empresa config */}
                  {(() => {
                    const empCfg = DEFAULT_EMPRESA_CONFIGS.find(e => e.id === selected.empresaTipo);
                    if (!empCfg) return null;
                    return (
                      <Section
                        title="Datos del contrato"
                        badge={<span className="text-[10px] px-2 py-0.5 rounded-full leading-none" style={{ background: empCfg.color, color: empCfg.textColor, fontWeight: 600, border: `1px solid ${empCfg.textColor}22` }}>{empCfg.nombre.split("—")[0].trim()}</span>}
                      >
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                          {empCfg.campos.map(campo => (
                            <DataField key={campo.key} label={campo.label} value={selected.contrato[campo.key]} />
                          ))}
                        </div>
                      </Section>
                    );
                  })()}

                  {/* Datos personales — EPS + AFP only */}
                  <Section title="Datos personales">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      <DataField label="EPS" value={selected.eps} />
                      <DataField label="AFP" value={selected.afp} />
                    </div>
                  </Section>

                  {/* Checklist — 2 columns */}
                  <Section
                    title="Checklist documental"
                    badge={
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-14 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${(checkDone / checkTotal) * 100}%`, background: checkDone === checkTotal ? "#10b981" : checkDone >= 7 ? "#f59e0b" : "#ef4444" }} />
                        </div>
                        <span className="text-[11px] text-muted-foreground">{checkDone}/{checkTotal}</span>
                      </div>
                    }
                  >
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                      {checklistLabels.map(([key, label]) => {
                        const done = selected.checklist[key];
                        return (
                          <div key={key} className="flex items-center gap-2">
                            {done
                              ? <CheckCircle2 size={13} className="text-accent flex-shrink-0" />
                              : <XCircle      size={13} className="text-red-400 flex-shrink-0" />}
                            <span className={`text-[11.5px] leading-tight ${done ? "text-foreground" : "text-red-500"}`}>{label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </Section>

                  {/* Alertas activas */}
                  {(docs.length > 0 || novsMes.length > 0) && (
                    <div className="rounded-2xl border p-4" style={{ background: "#fffbf0", borderColor: "#fcd34d44", boxShadow: "0 2px 8px rgba(245,158,11,0.08)" }}>
                      <p className="text-[10px] uppercase tracking-widest mb-3" style={{ letterSpacing: "0.08em", fontWeight: 700, color: "#b45309" }}>Alertas activas</p>
                      {docs.length > 0 && (
                        <div className="mb-3">
                          <p className="text-[11px] text-red-600 mb-1.5" style={{ fontWeight: 600 }}>Documentos pendientes</p>
                          <div className="grid grid-cols-2 gap-1">
                            {docs.map(d => (
                              <div key={d} className="flex items-center gap-1.5">
                                <span className="w-1 h-1 rounded-full bg-red-400 flex-shrink-0" />
                                <span className="text-[11px] text-red-500">{d}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {novsMes.length > 0 && (
                        <div>
                          <p className="text-[11px] text-amber-700 mb-1.5" style={{ fontWeight: 600 }}>Novedades mes en curso</p>
                          {novsMes.map(n => (
                            <div key={n.id} className="flex items-center gap-1.5 mb-1">
                              <span className="w-1 h-1 rounded-full bg-amber-400 flex-shrink-0" />
                              <span className="text-[11px] text-amber-600">{n.tipo} · {fmt(n.fecha)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <button className="flex-1 py-2.5 rounded-xl border border-border bg-card text-xs hover:bg-muted transition-colors" style={{ fontWeight: 500 }}>
                      Ver historial
                    </button>
                    <button className="flex-1 py-2.5 rounded-xl bg-foreground text-card text-xs hover:opacity-90 transition-all" style={{ fontWeight: 500, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
                      Editar expediente
                    </button>
                  </div>
                </>
              )}

              {/* ── NOVEDADES TAB ── */}
              {detailTab === "novedades" && (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[11px] text-foreground uppercase tracking-widest" style={{ fontWeight: 600, letterSpacing: "0.08em" }}>Junio 2026</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "#dcfce7", color: "#059669", fontWeight: 600 }}>Mes en curso</span>
                    </div>
                    {novsMes.length === 0 ? (
                      <div className="flex items-center gap-2 py-3 text-muted-foreground">
                        <CheckCircle2 size={14} className="text-accent" />
                        <span className="text-[12px]">Sin novedades este mes</span>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {novsMes.map(n => (
                          <div key={n.id} className="bg-card rounded-xl p-3" style={{ boxShadow: "var(--shadow-card)" }}>
                            <div className="flex items-center justify-between mb-1">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${tipoNovedadColor[n.tipo] ?? "bg-muted text-muted-foreground border-border"}`} style={{ fontWeight: 500 }}>
                                {n.tipo}
                              </span>
                              <span className="text-[10px] text-muted-foreground">{fmt(n.fecha)}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-snug">{n.observacion}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {novsHist.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <History size={12} className="text-muted-foreground" />
                        <span className="text-[11px] text-muted-foreground uppercase tracking-widest" style={{ fontWeight: 600, letterSpacing: "0.08em" }}>Historial</span>
                      </div>
                      <div className="space-y-2">
                        {novsHist.map(n => (
                          <div key={n.id} className="border border-border rounded-xl p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${tipoNovedadColor[n.tipo] ?? "bg-muted text-muted-foreground border-border"}`} style={{ fontWeight: 500, opacity: 0.8 }}>
                                {n.tipo}
                              </span>
                              <span className="text-[10px] text-muted-foreground">{fmt(n.fecha)}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-snug">{n.observacion}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selected.novedades.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <CheckCircle2 size={28} className="text-accent mb-2" />
                      <p className="text-[13px] text-foreground" style={{ fontWeight: 500 }}>Sin novedades registradas</p>
                    </div>
                  )}

                  <button className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-foreground text-card text-xs hover:opacity-90 transition-all" style={{ fontWeight: 500, boxShadow: "var(--shadow-card)" }}>
                    + Registrar novedad
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
