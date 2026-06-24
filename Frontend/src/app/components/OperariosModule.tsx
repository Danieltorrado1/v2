import { useEffect, useState } from "react";
import {
  Search, Upload, Download, UserPlus,
  CheckCircle2, XCircle, AlertCircle,
  ChevronRight, X, Phone, Mail, MapPin, Calendar,
  FileText, Shield, History, ArrowRight, Building2, Loader2,
} from "lucide-react";
import { DEFAULT_EMPRESA_CONFIGS } from "./empresaConfig";
import { personasApi, type Persona } from "../../services/personasApi";
import { vinculacionesApi, type Vinculacion } from "../../services/vinculacionesApi";
import { expedientesApi, type ExpedienteLaboralPayload } from "../../services/expedientesApi";
import { documentosApi } from "../../services/documentosApi";
import { DocumentUploadForm, type TipoDocumentoOption } from "./DocumentosModule";

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

// Vista de respaldo (mock) — se muestra solo si GET /personas falla por completo.
function MockOperariosView() {
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
              <p className="text-[10.5px] mt-1" style={{ color: "#f59e0b", fontWeight: 500 }}>
                ● Sin conexión con el servidor — mostrando datos de ejemplo
              </p>
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

// ── Vista real (backend Empiria V2) ─────────────────────────────────────────
// GET /personas, GET /vinculaciones, GET /expedientes/personas/:id.
// Si /personas falla, OperariosModule cae por completo a MockOperariosView.

function nombreCompletoPersona(p: Persona): string {
  return [p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido].filter(Boolean).join(" ");
}

function inicialesPersona(p: Persona): string {
  return `${p.primer_nombre[0] ?? ""}${p.primer_apellido[0] ?? ""}`.toUpperCase();
}

// null = sin vinculación registrada (estado desconocido, no se asume activo ni retirado)
function personaActiva(vinculaciones: Vinculacion[] | undefined): boolean | null {
  if (!vinculaciones || vinculaciones.length === 0) return null;
  return vinculaciones.some(v => v.estado_vinculacion === "ACTIVA" && v.fecha_fin === null);
}

type FetchStatus = "loading" | "ready" | "error";

function useRealPersonasData(search: string, empresaId?: number, contratoId?: number) {
  const [personasStatus, setPersonasStatus] = useState<FetchStatus>("loading");
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [vinculacionesStatus, setVinculacionesStatus] = useState<FetchStatus>("loading");
  const [vinculacionesByPersona, setVinculacionesByPersona] = useState<Map<number, Vinculacion[]>>(new Map());

  // Búsqueda por nombre o documento — delegada al backend (filtro `search`), con debounce.
  // GET /personas no admite filtrar por empresa/contrato (una persona puede tener
  // varias vinculaciones), así que el tenant solo se aplica a las vinculaciones.
  useEffect(() => {
    const handle = setTimeout(() => {
      personasApi.list({ search: search || undefined, limit: 100 })
        .then(res => {
          setPersonas(res.items);
          setPersonasStatus("ready");
        })
        .catch(error => {
          console.warn("[personas] GET /personas falló, usando fallback mock:", error);
          setPersonasStatus("error");
        });
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  // Vinculaciones: una sola carga de la colección, filtrada por el tenant activo.
  useEffect(() => {
    vinculacionesApi.list({ empresa_id: empresaId, contrato_id: contratoId, limit: 100 })
      .then(res => {
        const grouped = new Map<number, Vinculacion[]>();
        res.items.forEach(v => {
          const list = grouped.get(v.persona_id) ?? [];
          list.push(v);
          grouped.set(v.persona_id, list);
        });
        setVinculacionesByPersona(grouped);
        setVinculacionesStatus("ready");
      })
      .catch(error => {
        console.warn("[personas] GET /vinculaciones falló, mostrando vinculación como no disponible:", error);
        setVinculacionesStatus("error");
      });
  }, [empresaId, contratoId]);

  return { personasStatus, personas, vinculacionesStatus, vinculacionesByPersona };
}

interface ExpedienteCacheEntry {
  status: FetchStatus;
  data?: ExpedienteLaboralPayload;
}

function useExpedienteCompleto(personaId: number | null) {
  const [cache, setCache] = useState<Record<number, ExpedienteCacheEntry>>({});

  useEffect(() => {
    if (personaId === null || cache[personaId]) return;
    setCache(prev => ({ ...prev, [personaId]: { status: "loading" } }));
    expedientesApi.getPersonaConsolidado(personaId)
      .then(data => setCache(prev => ({ ...prev, [personaId]: { status: "ready", data } })))
      .catch(error => {
        console.warn(`[personas] Expediente de persona ${personaId} no disponible:`, error);
        setCache(prev => ({ ...prev, [personaId]: { status: "error" } }));
      });
  }, [personaId, cache]);

  // Tras subir o desactivar un documento el expediente cacheado queda obsoleto:
  // borrar la entrada fuerza al efecto de arriba a volver a pedirlo.
  function refresh(idToRefresh: number) {
    setCache(prev => {
      const next = { ...prev };
      delete next[idToRefresh];
      return next;
    });
  }

  return {
    entry: personaId === null ? undefined : cache[personaId],
    refresh,
  };
}

// ── Helpers defensivos ───────────────────────────────────────────────────────
// El payload de /expedientes/personas/:id es grande y anidado. Estos helpers
// evitan que un campo ausente, renombrado o con otro tipo rompa la pantalla.
function getNested(obj: unknown, path: string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function getNumber(obj: unknown, path: string[]): number | null {
  const value = getNested(obj, path);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function getString(obj: unknown, path: string[]): string | null {
  const value = getNested(obj, path);
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getArray<T = unknown>(obj: unknown, path: string[]): T[] {
  const value = getNested(obj, path);
  return Array.isArray(value) ? (value as T[]) : [];
}

// Intenta varias rutas candidatas (por si el backend usa otro nombre de campo)
// y devuelve la primera que resuelva a un valor utilizable.
function firstNumber(obj: unknown, paths: string[][]): number | null {
  for (const path of paths) {
    const value = getNumber(obj, path);
    if (value !== null) return value;
  }
  return null;
}

function firstString(obj: unknown, paths: string[][]): string | null {
  for (const path of paths) {
    const value = getString(obj, path);
    if (value !== null) return value;
  }
  return null;
}

function VinculacionRows({ vinculaciones }: { vinculaciones: Vinculacion[] }) {
  return (
    <div className="divide-y divide-border/60">
      {vinculaciones.map(v => {
        const activa = v.estado_vinculacion === "ACTIVA" && v.fecha_fin === null;
        return (
          <div key={v.id} className="flex items-center gap-1.5 py-0.5">
            <span className="text-[11px] text-muted-foreground tabular-nums">{fmt(v.fecha_inicio)}</span>
            <ArrowRight size={9} className="text-muted-foreground/50 flex-shrink-0" />
            {v.fecha_fin
              ? <span className="text-[11px] text-muted-foreground tabular-nums">{fmt(v.fecha_fin)}</span>
              : <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-100 leading-none" style={{ fontWeight: 600 }}>ACTIVO</span>}
            <span className={`text-[10px] flex-shrink-0 ${activa ? "text-emerald-600" : "text-muted-foreground"}`}>{v.estado_vinculacion}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Formatters defensivos (nunca lanzan, devuelven undefined si no hay dato) ─
function fmtNum(value: number | null): string | undefined {
  if (value === null) return undefined;
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}

function fmtPercent(value: number | null): string | undefined {
  return value === null ? undefined : `${Math.round(value)}%`;
}

function fmtCurrency(value: number | null): string | undefined {
  if (value === null) return undefined;
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);
}

// Acepta "YYYY-MM-DD" o timestamps ISO ("YYYY-MM-DDTHH:mm:ss...") sin lanzar.
function fmtDateLoose(value: string | null): string | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const monthIndex = parseInt(match[2], 10) - 1;
  return months[monthIndex] ? `${match[3]} ${months[monthIndex]} ${match[1]}` : value;
}

// ── Pestañas del Expediente 360 ──────────────────────────────────────────────
type DetailTab = "resumen" | "vinculaciones" | "documentos" | "sst" | "nomina" | "evaluaciones" | "timeline";

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "vinculaciones", label: "Vinculaciones" },
  { id: "documentos", label: "Documentos" },
  { id: "sst", label: "SST" },
  { id: "nomina", label: "Nómina" },
  { id: "evaluaciones", label: "Evaluaciones" },
  { id: "timeline", label: "Timeline" },
];

function ExpedienteSectionStatus({ status }: { status: FetchStatus }) {
  if (status === "loading") {
    return (
      <div className="flex items-center gap-2 py-3 text-muted-foreground">
        <Loader2 size={13} className="animate-spin" /> <span className="text-[12px]">Cargando…</span>
      </div>
    );
  }
  if (status === "error") {
    return <p className="text-[11.5px] text-amber-600 py-1">No se pudo cargar esta sección.</p>;
  }
  return null;
}

function StatGrid({ items }: { items: { label: string; value?: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
      {items.map(item => <DataField key={item.label} label={item.label} value={item.value} />)}
    </div>
  );
}

function TabResumen({
  persona, expediente, status,
}: { persona: Persona; expediente?: ExpedienteLaboralPayload; status: FetchStatus }) {
  const num = (field: string) => fmtNum(firstNumber(expediente, [["indicadores", field]]));
  const riesgoDocumental = firstString(expediente, [["indicadores", "riesgo_documental", "nivel"]]) ?? undefined;

  return (
    <div className="space-y-5">
      <Section title="Datos de la persona">
        <StatGrid items={[
          { label: "Nombre completo", value: nombreCompletoPersona(persona) },
          { label: "Documento", value: persona.numero_documento },
          { label: "Teléfono", value: persona.telefono ?? undefined },
          { label: "Correo", value: persona.correo ?? undefined },
        ]} />
      </Section>
      <Section title="Indicadores generales">
        <ExpedienteSectionStatus status={status} />
        {status === "ready" && (
          <StatGrid items={[
            { label: "Vinculaciones totales", value: num("vinculaciones_total") },
            { label: "Vinculaciones activas", value: num("vinculaciones_activas") },
            { label: "Documentos totales", value: num("documentos_total") },
            { label: "Documentos vencidos", value: num("documentos_vencidos") },
            { label: "Alertas activas", value: num("alertas_total") },
            { label: "Riesgo documental", value: riesgoDocumental },
            { label: "Evaluaciones totales", value: num("evaluaciones_total") },
            { label: "Promedio desempeño", value: num("promedio_desempeno") },
          ]} />
        )}
      </Section>
    </div>
  );
}

function TabVinculaciones({
  expediente, status, fallbackVinculaciones, fallbackStatus,
}: {
  expediente?: ExpedienteLaboralPayload;
  status: FetchStatus;
  fallbackVinculaciones: Vinculacion[];
  fallbackStatus: FetchStatus;
}) {
  const fromExpediente = status === "ready" ? getArray<Record<string, unknown>>(expediente, ["vinculaciones"]) : [];
  const usingFallback = fromExpediente.length === 0;
  const list: Record<string, unknown>[] = usingFallback
    ? (fallbackVinculaciones as unknown as Record<string, unknown>[])
    : fromExpediente;

  return (
    <div className="space-y-3">
      {status === "loading" && <ExpedienteSectionStatus status="loading" />}
      {status === "error" && (
        <p className="text-[11.5px] text-amber-600">
          No se pudo cargar el expediente — mostrando vinculaciones ya cargadas{fallbackStatus === "error" ? " (no disponibles)" : ""}.
        </p>
      )}
      {(status === "ready" || status === "error") && (
        list.length === 0 ? (
          <p className="text-[11.5px] text-muted-foreground italic">Sin vinculaciones registradas</p>
        ) : (
          list.map((v, i) => {
            const contratoId = firstNumber(v, [["contrato_id"]]);
            const empresaId = firstNumber(v, [["empresa_id"]]);
            const estado = firstString(v, [["estado_vinculacion"]]);
            const fechaInicio = firstString(v, [["fecha_inicio"]]);
            const fechaFin = firstString(v, [["fecha_fin"]]);
            const cargoId = firstNumber(v, [["contrato_cargo_id"], ["cargo_id"]]);
            const cargoNombre = firstString(v, [["cargo_nombre"], ["contrato_cargo_nombre"], ["cargo", "nombre"]]);
            const key = firstNumber(v, [["id"]]) ?? i;
            return (
              <div key={key} className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>
                    Contrato {contratoId !== null ? `#${contratoId}` : "—"}
                  </span>
                  {estado && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-md border leading-none ${estado === "ACTIVA" ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-secondary text-muted-foreground border-border"}`}
                      style={{ fontWeight: 600 }}
                    >
                      {estado}
                    </span>
                  )}
                </div>
                <StatGrid items={[
                  { label: "Empresa", value: empresaId !== null ? `#${empresaId}` : undefined },
                  { label: "Cargo", value: cargoNombre ?? (cargoId !== null ? `#${cargoId}` : undefined) },
                  { label: "Fecha inicio", value: fmtDateLoose(fechaInicio) },
                  { label: "Fecha fin", value: fechaFin ? fmtDateLoose(fechaFin) : "Activo" },
                ]} />
              </div>
            );
          })
        )
      )}
      {status === "ready" && usingFallback && fallbackVinculaciones.length > 0 && (
        <p className="text-[10.5px] text-muted-foreground italic">El expediente no trajo vinculaciones; mostrando datos ya cargados.</p>
      )}
    </div>
  );
}

// Filas combinadas de documentos_persona + documentos_vinculacion del expediente
// consolidado (ya incluye `id`, a diferencia de GET /documentos/persona/:id que
// solo trae un resumen sin id — por eso aquí se lee del expediente, no de ese
// endpoint). Es el mismo origen de datos que ya alimenta esta pestaña.
interface ExpedienteDocumentoRow {
  id: number;
  scope: "persona" | "vinculacion";
  tipoDocumentoId: string | null;
  tipoDocumentoNombre: string | null;
  nombreArchivo: string | null;
  fechaCarga: string | null;
  fechaVencimiento: string | null;
  version: number | null;
  activo: boolean | null;
  vinculacionId: number | null;
}

// El expediente devuelve tipo_documento_id como número (no string): getString
// lo descartaría siempre, así que aquí se acepta number|string explícitamente.
function tipoDocumentoIdToString(doc: unknown): string | null {
  const direct = getNumber(doc, ["tipo_documento_id"]);
  if (direct !== null) return String(direct);
  const nested = getNumber(doc, ["tipo_documento", "id"]);
  return nested !== null ? String(nested) : null;
}

function extractDocumentRows(expediente: unknown): ExpedienteDocumentoRow[] {
  const personaDocs = getArray<Record<string, unknown>>(expediente, ["documentos_persona"]).map(doc => ({
    id: getNumber(doc, ["id"]) ?? 0,
    scope: "persona" as const,
    tipoDocumentoId: tipoDocumentoIdToString(doc),
    tipoDocumentoNombre: getString(doc, ["tipo_documento", "nombre_documento"]) ?? getString(doc, ["tipo_documento_nombre"]),
    nombreArchivo: getString(doc, ["nombre_original"]),
    fechaCarga: getString(doc, ["fecha_carga"]),
    fechaVencimiento: getString(doc, ["fecha_vencimiento"]),
    version: getNumber(doc, ["version"]),
    activo: null, // /expedientes solo incluye documentos_persona activos: no hay variación que mostrar
    vinculacionId: getNumber(doc, ["vinculacion_id"]),
  }));

  const vinculacionDocs = getArray<Record<string, unknown>>(expediente, ["documentos_vinculacion"]).map(doc => ({
    id: getNumber(doc, ["id"]) ?? 0,
    scope: "vinculacion" as const,
    tipoDocumentoId: tipoDocumentoIdToString(doc),
    tipoDocumentoNombre: getString(doc, ["tipo_documento", "nombre_documento"]) ?? getString(doc, ["tipo_documento_nombre"]),
    nombreArchivo: getString(doc, ["nombre_original"]),
    fechaCarga: getString(doc, ["fecha_carga"]),
    fechaVencimiento: getString(doc, ["fecha_vencimiento"]),
    version: null, // documentos de vinculación no llevan versión en el backend
    activo: (doc as Record<string, unknown>).activo === false ? false : true,
    vinculacionId: getNumber(doc, ["vinculacion_id"]),
  }));

  return [...personaDocs, ...vinculacionDocs].filter(row => row.id !== 0);
}

function DocumentoRowActionsExpediente({
  row, onUploadNewVersion,
}: { row: ExpedienteDocumentoRow; onUploadNewVersion: (row: ExpedienteDocumentoRow) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openDocument(forceDownload: boolean) {
    setBusy(true);
    setError(null);
    try {
      const info = await documentosApi.getDownloadUrl(row.id, row.scope);
      if (forceDownload) {
        const link = document.createElement("a");
        link.href = info.download_url;
        link.download = info.nombre_original;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.click();
      } else {
        window.open(info.download_url, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      console.warn("[operarios] GET /documentos/:id/download-url falló:", err);
      setError("No disponible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2.5 flex-shrink-0">
      <button onClick={() => openDocument(false)} disabled={busy} title="Ver documento" className="text-muted-foreground hover:text-accent disabled:opacity-40 transition-colors">
        {busy ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
      </button>
      <button onClick={() => openDocument(true)} disabled={busy} title="Descargar documento" className="text-muted-foreground hover:text-accent disabled:opacity-40 transition-colors">
        <Download size={13} />
      </button>
      <button onClick={() => onUploadNewVersion(row)} title="Subir nueva versión" className="text-muted-foreground hover:text-accent transition-colors">
        <Upload size={13} />
      </button>
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </div>
  );
}

function TabDocumentos({
  expediente, status, persona, vinculaciones, vinculacionesStatus, onVerDocumentos, onDocumentChanged,
}: {
  expediente?: ExpedienteLaboralPayload;
  status: FetchStatus;
  persona: Persona;
  vinculaciones: Vinculacion[];
  vinculacionesStatus: FetchStatus;
  onVerDocumentos?: (personaId: number, personaNombre: string) => void;
  onDocumentChanged: () => void;
}) {
  const [uploadContext, setUploadContext] = useState<{
    tipoDocumentoId?: string;
    scope: "persona" | "vinculacion";
    vinculacionId?: number;
  } | null>(null);

  const num = (field: string) => fmtNum(firstNumber(expediente, [["indicadores", field]]));
  const nivel = status === "ready" ? firstString(expediente, [["indicadores", "riesgo_documental", "nivel"]]) : null;
  const alertasTotal = status === "ready" ? firstNumber(expediente, [["indicadores", "alertas_total"]]) : null;

  const documentRows = status === "ready" ? extractDocumentRows(expediente) : [];

  const tiposDisponibles: TipoDocumentoOption[] = Array.from(
    new Map(
      documentRows
        .filter(row => row.tipoDocumentoId !== null)
        .map(row => [row.tipoDocumentoId as string, row.tipoDocumentoNombre ?? `Tipo #${row.tipoDocumentoId}`])
    ).entries()
  ).map(([id, nombre]) => ({ id, nombre }));

  function handleUploaded() {
    setUploadContext(null);
    onDocumentChanged();
  }

  return (
    <div className="space-y-5">
      {onVerDocumentos && (
        <button
          onClick={() => onVerDocumentos(persona.id, nombreCompletoPersona(persona))}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-card text-xs text-muted-foreground hover:bg-secondary transition-colors"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <FileText size={13} /> Ver documentos
        </button>
      )}
      <Section title="Documentos">
        <ExpedienteSectionStatus status={status} />
        {status === "ready" && (
          <StatGrid items={[
            { label: "Total documentos", value: num("documentos_total") },
            { label: "Vigentes", value: num("documentos_vigentes") },
            { label: "Vencidos", value: num("documentos_vencidos") },
            { label: "Por vencer (30 días)", value: num("documentos_por_vencer_30_dias") },
            { label: "De persona", value: num("documentos_persona") },
            { label: "De vinculación", value: num("documentos_vinculacion") },
          ]} />
        )}
      </Section>

      <Section
        title="Archivos cargados"
        badge={
          !uploadContext && (
            <button
              onClick={() => setUploadContext({ scope: "persona" })}
              className="flex items-center gap-1 text-[11px] text-accent hover:underline"
              style={{ fontWeight: 500 }}
            >
              <Upload size={11} /> Subir documento
            </button>
          )
        }
      >
        {uploadContext && (
          <div className="mb-3">
            <DocumentUploadForm
              personaId={persona.id}
              personaNombre={nombreCompletoPersona(persona)}
              vinculaciones={vinculaciones}
              vinculacionesStatus={vinculacionesStatus}
              tiposDisponibles={tiposDisponibles}
              defaultScope={uploadContext.scope}
              defaultVinculacionId={uploadContext.vinculacionId}
              defaultTipoDocumentoId={uploadContext.tipoDocumentoId}
              onUploaded={handleUploaded}
              onCancel={() => setUploadContext(null)}
            />
          </div>
        )}
        {status === "ready" && (
          documentRows.length === 0 ? (
            <p className="text-[11.5px] text-muted-foreground italic">Esta persona no tiene documentos cargados todavía.</p>
          ) : (
            <div className="divide-y divide-border/60">
              {documentRows.map(row => (
                <div key={`${row.scope}-${row.id}`} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[12px] text-foreground truncate" style={{ fontWeight: 500 }}>{row.nombreArchivo ?? row.tipoDocumentoNombre ?? "Documento"}</p>
                    <p className="text-[10.5px] text-muted-foreground">
                      {row.tipoDocumentoNombre ?? "Sin tipo"}
                      {row.version !== null ? ` · v${row.version}` : ""}
                      {row.scope === "vinculacion" ? " · Vinculación" : " · Persona"}
                      {fmtDateLoose(row.fechaCarga) ? ` · ${fmtDateLoose(row.fechaCarga)}` : ""}
                      {row.activo === false ? " · INACTIVO" : ""}
                    </p>
                  </div>
                  <DocumentoRowActionsExpediente
                    row={row}
                    onUploadNewVersion={r => setUploadContext({
                      scope: r.scope,
                      tipoDocumentoId: r.tipoDocumentoId ?? undefined,
                      vinculacionId: r.vinculacionId ?? undefined,
                    })}
                  />
                </div>
              ))}
            </div>
          )
        )}
      </Section>

      <Section title="Documentos faltantes (checklist)">
        {status === "ready" && (
          <StatGrid items={[
            { label: "Requisitos totales", value: num("checklist_total_requisitos") },
            { label: "Cargados", value: num("checklist_cargados") },
            { label: "Faltantes", value: num("checklist_faltantes") },
            { label: "Vencidos", value: num("checklist_vencidos") },
            { label: "Cumplimiento promedio", value: fmtPercent(firstNumber(expediente, [["indicadores", "checklist_cumplimiento_promedio"]])) },
          ]} />
        )}
      </Section>
      <Section title="Alertas documentales">
        {status === "ready" && (
          nivel === null && alertasTotal === null
            ? <p className="text-[11.5px] text-muted-foreground italic">Sin alertas documentales disponibles</p>
            : (
              <StatGrid items={[
                { label: "Riesgo documental", value: nivel ?? undefined },
                { label: "Alertas activas", value: fmtNum(alertasTotal) },
                { label: "Alertas críticas", value: num("alertas_criticas") },
                { label: "Alertas altas", value: num("alertas_altas") },
              ]} />
            )
        )}
      </Section>
    </div>
  );
}

function TabSST({ expediente, status }: { expediente?: ExpedienteLaboralPayload; status: FetchStatus }) {
  const num = (field: string) => fmtNum(firstNumber(expediente, [["indicadores", field]]));
  const pct = (field: string) => fmtPercent(firstNumber(expediente, [["indicadores", field]]));

  return (
    <div className="space-y-5">
      <ExpedienteSectionStatus status={status} />
      {status === "ready" && (
        <>
          <Section title="Capacitaciones">
            <StatGrid items={[
              { label: "Totales", value: num("sst_capacitaciones_total") },
              { label: "Vigentes", value: num("sst_capacitaciones_vigentes") },
              { label: "Vencidas", value: num("sst_capacitaciones_vencidas") },
            ]} />
          </Section>
          <Section title="Exámenes ocupacionales">
            <StatGrid items={[
              { label: "Totales", value: num("sst_examenes_total") },
              { label: "Vigentes", value: num("sst_examenes_vigentes") },
              { label: "Vencidos", value: num("sst_examenes_vencidos") },
              { label: "No aptos", value: num("sst_examenes_no_aptos") },
              { label: "Con restricciones", value: num("sst_examenes_con_restricciones") },
              { label: "Cumplimiento", value: pct("sst_examenes_cumplimiento_porcentaje") },
            ]} />
          </Section>
          <Section title="Dotación EPP">
            <StatGrid items={[
              { label: "Entregas totales", value: num("sst_dotacion_entregas_total") },
              { label: "Vigentes", value: num("sst_dotacion_vigentes") },
              { label: "Vencidas", value: num("sst_dotacion_vencidas") },
              { label: "Cumplimiento", value: pct("sst_dotacion_cumplimiento_porcentaje") },
            ]} />
          </Section>
          <Section title="Accidentes e incidentes">
            <StatGrid items={[
              { label: "Totales", value: num("sst_accidentes_total") },
              { label: "Abiertos", value: num("sst_accidentes_abiertos") },
              { label: "Graves", value: num("sst_accidentes_graves") },
              { label: "Con incapacidad", value: num("sst_accidentes_incapacidad") },
            ]} />
          </Section>
          <Section title="Inspecciones">
            <StatGrid items={[
              { label: "Totales", value: num("sst_inspecciones_total") },
              { label: "Acciones abiertas", value: num("sst_acciones_inspeccion_abiertas") },
              { label: "Acciones vencidas", value: num("sst_acciones_inspeccion_vencidas") },
              { label: "Hallazgos totales", value: num("sst_hallazgos_total") },
              { label: "Hallazgos críticos", value: num("sst_hallazgos_criticos") },
            ]} />
          </Section>
          <Section title="Matriz de riesgos">
            <StatGrid items={[
              { label: "Riesgos totales", value: num("sst_riesgos_total") },
              { label: "Riesgos altos", value: num("sst_riesgos_altos") },
              { label: "Riesgos críticos", value: num("sst_riesgos_criticos") },
            ]} />
          </Section>
          <Section title="Cumplimiento SST general">
            <StatGrid items={[{ label: "Cumplimiento", value: pct("sst_cumplimiento_porcentaje") }]} />
          </Section>
        </>
      )}
    </div>
  );
}

function TabNomina({ expediente, status }: { expediente?: ExpedienteLaboralPayload; status: FetchStatus }) {
  const num = (field: string) => fmtNum(firstNumber(expediente, [["indicadores", field]]));
  const money = (field: string) => fmtCurrency(firstNumber(expediente, [["indicadores", field]]));
  const date = (field: string) => fmtDateLoose(firstString(expediente, [["indicadores", field]]));

  return (
    <div className="space-y-5">
      <ExpedienteSectionStatus status={status} />
      {status === "ready" && (
        <>
          <Section title="Vacaciones">
            <StatGrid items={[
              { label: "Días pendientes", value: num("vacaciones_dias_pendientes") },
              { label: "Solicitudes totales", value: num("vacaciones_solicitudes_total") },
              { label: "Última solicitud", value: date("vacaciones_ultima_solicitud") },
            ]} />
          </Section>
          <Section title="Prima">
            <StatGrid items={[
              { label: "Pagada", value: money("prima_pagada") },
              { label: "Total", value: money("prima_total") },
              { label: "Última prima", value: date("ultima_prima") },
            ]} />
          </Section>
          <Section title="Cesantías">
            <StatGrid items={[
              { label: "Consignadas", value: money("cesantias_consignadas") },
              { label: "Total", value: money("cesantias_total") },
              { label: "Última cesantía", value: date("ultima_cesantia") },
            ]} />
          </Section>
          <Section title="Intereses de cesantías">
            <StatGrid items={[
              { label: "Pagados", value: money("intereses_cesantias_pagados") },
              { label: "Total", value: money("intereses_cesantias_total") },
              { label: "Último pago", value: date("ultimo_interes_cesantias") },
            ]} />
          </Section>
          <Section title="Liquidaciones finales">
            <StatGrid items={[
              { label: "Pagadas", value: money("liquidaciones_finales_pagadas") },
              { label: "Total", value: money("liquidaciones_finales_total") },
              { label: "Última liquidación", value: date("ultima_liquidacion_final") },
            ]} />
          </Section>
        </>
      )}
    </div>
  );
}

function TabEvaluaciones({ expediente, status }: { expediente?: ExpedienteLaboralPayload; status: FetchStatus }) {
  const num = (field: string) => fmtNum(firstNumber(expediente, [["indicadores", field]]));
  const str = (field: string) => firstString(expediente, [["indicadores", field]]) ?? undefined;
  const date = (field: string) => fmtDateLoose(firstString(expediente, [["indicadores", field]]));

  return (
    <div className="space-y-5">
      <ExpedienteSectionStatus status={status} />
      {status === "ready" && (
        <Section title="Desempeño">
          <StatGrid items={[
            { label: "Evaluaciones totales", value: num("evaluaciones_total") },
            { label: "Promedio desempeño", value: num("promedio_desempeno") },
            { label: "Clasificación", value: str("clasificacion_desempeno") },
            { label: "Última evaluación", value: date("ultima_evaluacion") },
            { label: "Planes de mejora abiertos", value: num("planes_mejora_abiertos") },
            { label: "Planes de mejora vencidos", value: num("planes_mejora_vencidos") },
          ]} />
        </Section>
      )}
    </div>
  );
}

function TabTimeline({ expediente, status }: { expediente?: ExpedienteLaboralPayload; status: FetchStatus }) {
  return (
    <div className="space-y-5">
      <ExpedienteSectionStatus status={status} />
      {status === "ready" && (() => {
        const eventos = getArray<Record<string, unknown>>(expediente, ["auditoria"]);
        if (eventos.length === 0) {
          return <p className="text-[11.5px] text-muted-foreground italic">Sin eventos disponibles</p>;
        }
        const sorted = [...eventos].sort((a, b) => {
          const da = firstString(a, [["fecha_evento"], ["created_at"]]) ?? "";
          const db = firstString(b, [["fecha_evento"], ["created_at"]]) ?? "";
          return da < db ? 1 : da > db ? -1 : 0;
        });
        return (
          <Section title="Últimos eventos">
            <div className="space-y-2.5">
              {sorted.map((ev, i) => {
                const descripcion = firstString(ev, [["descripcion"]]) ?? firstString(ev, [["accion"]]) ?? "Evento sin descripción";
                const fecha = firstString(ev, [["fecha_evento"], ["created_at"]]);
                const usuario = firstString(ev, [["usuario", "nombre"], ["usuario", "email"]]);
                const modulo = firstString(ev, [["modulo"]]);
                const key = firstNumber(ev, [["id"]]) ?? i;
                return (
                  <div key={key} className="flex items-start gap-3 py-2 border-b border-border/60 last:border-b-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0 mt-1.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] text-foreground leading-snug">{descripcion}</p>
                      <p className="text-[10.5px] text-muted-foreground mt-0.5">
                        {fecha ? fmtDateLoose(fecha) : "Fecha desconocida"}
                        {modulo ? ` · ${modulo}` : ""}
                        {usuario ? ` · ${usuario}` : ""}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        );
      })()}
    </div>
  );
}

function RealOperariosView({
  personas, vinculacionesByPersona, vinculacionesStatus, searchInputValue, onVerDocumentos,
}: {
  personas: Persona[];
  vinculacionesByPersona: Map<number, Vinculacion[]>;
  vinculacionesStatus: FetchStatus;
  searchInputValue: { value: string; onChange: (value: string) => void };
  onVerDocumentos?: (personaId: number, personaNombre: string) => void;
}) {
  const [estadoFil, setEstadoFil] = useState("Todos");
  const [selectedId, setSel] = useState<number | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("resumen");

  const filtered = personas.filter(p => {
    if (estadoFil === "Todos") return true;
    const activa = personaActiva(vinculacionesByPersona.get(p.id));
    return estadoFil === "Activo" ? activa === true : activa !== true;
  });

  const selected = personas.find(p => p.id === selectedId) ?? null;
  const selectedVinculaciones = selectedId !== null ? vinculacionesByPersona.get(selectedId) ?? [] : [];
  const expediente = useExpedienteCompleto(selectedId);

  function selectPersona(id: number | null) {
    setSel(id);
    setDetailTab("resumen");
  }

  return (
    <div className="flex h-full">
      {/* ── LIST PANEL ── */}
      <div className={`flex flex-col ${selected ? "w-[58%]" : "w-full"} transition-all duration-200`}>
        <div className="px-6 py-4 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: "1.1rem", letterSpacing: "-0.02em" }}>
                Operarios Manipuladores
              </h1>
              <p className="text-muted-foreground text-xs mt-0.5">{filtered.length} registros</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-border bg-card text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30"
                placeholder="Buscar por nombre o documento…"
                value={searchInputValue.value}
                onChange={e => searchInputValue.onChange(e.target.value)}
              />
            </div>
            <select className="px-2.5 py-1.5 rounded-xl border border-border bg-card text-xs focus:outline-none focus:ring-2 focus:ring-accent/30" value={estadoFil} onChange={e => setEstadoFil(e.target.value)}>
              {ESTADOS.map(e => <option key={e}>{e}</option>)}
            </select>
          </div>
          {vinculacionesStatus === "error" && (
            <p className="text-[10.5px] mt-2" style={{ color: "#f59e0b", fontWeight: 500 }}>
              ● Vinculaciones no disponibles — mostrando solo datos de la persona
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="bg-card rounded-2xl overflow-hidden" style={{ boxShadow: "var(--shadow-card)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border" style={{ background: "#fafafa" }}>
                  <th className="text-left px-5 py-3 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Empleado</th>
                  <th className="text-left px-3 py-3 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Contacto</th>
                  <th className="text-left px-3 py-3 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Vinculación</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, idx) => {
                  const isSelected = p.id === selectedId;
                  const vinculaciones = vinculacionesByPersona.get(p.id);
                  const activa = personaActiva(vinculaciones);

                  return (
                    <tr
                      key={p.id}
                      onClick={() => selectPersona(isSelected ? null : p.id)}
                      className={`border-b border-border cursor-pointer transition-colors last:border-b-0 ${isSelected ? "bg-emerald-50/60" : "hover:bg-muted/40"}`}
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-white text-[11px]"
                            style={{ background: `linear-gradient(${avatarGradients[idx % avatarGradients.length]})`, fontWeight: 700 }}
                          >
                            {inicialesPersona(p)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-[13px] text-foreground leading-tight" style={{ fontWeight: 500 }}>{nombreCompletoPersona(p)}</p>
                              {activa !== null && (
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded-md border leading-none ${activa ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-red-50 text-red-600 border-red-100"}`}
                                  style={{ fontWeight: 600 }}
                                >
                                  {activa ? "ACTIVO" : "RETIRADO"}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">CC {p.numero_documento}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-3">
                        <p className="text-[12px] text-foreground">{p.correo || "—"}</p>
                        <p className="text-[11px] text-muted-foreground">{p.telefono || "—"}</p>
                      </td>

                      <td className="px-3 py-3">
                        {vinculacionesStatus === "loading" && <span className="text-[11px] text-muted-foreground">Cargando…</span>}
                        {vinculacionesStatus === "error" && <span className="text-[11px] text-muted-foreground">No disponible</span>}
                        {vinculacionesStatus === "ready" && (
                          vinculaciones && vinculaciones.length > 0
                            ? <VinculacionRows vinculaciones={vinculaciones} />
                            : <span className="text-[11px] text-muted-foreground">Sin vinculación registrada</span>
                        )}
                      </td>

                      <td className="px-3 py-3">
                        <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isSelected ? "rotate-90 text-accent" : ""}`} />
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-[12px] text-muted-foreground">
                      Sin resultados para esta búsqueda
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── DETAIL PANEL — Expediente 360 ── */}
      {selected && (
        <div className="w-[42%] border-l border-border bg-background overflow-y-auto flex-shrink-0">
          <div className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border z-10">
            <div className="flex items-center justify-between px-5 py-3">
              <h2 style={{ fontWeight: 600, fontSize: "0.875rem" }}>Expediente 360</h2>
              <button onClick={() => selectPersona(null)} className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors">
                <X size={14} />
              </button>
            </div>
            <div className="flex px-5 gap-1 pb-3 overflow-x-auto">
              {DETAIL_TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setDetailTab(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs transition-all flex-shrink-0 ${detailTab === tab.id ? "bg-foreground text-card" : "text-muted-foreground hover:bg-muted"}`}
                  style={{ fontWeight: detailTab === tab.id ? 600 : 400 }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-5 space-y-5">
            {/* Hero profile card — siempre visible, no depende del expediente */}
            <div
              className="rounded-2xl overflow-hidden"
              style={{ background: "linear-gradient(135deg, #0f1923 0%, #1a3a5c 100%)", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}
            >
              <div className="px-5 pt-5 pb-4 flex items-start gap-4">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-white flex-shrink-0 border-2 border-white/20"
                  style={{ background: "linear-gradient(135deg, #10b981, #059669)", fontSize: "1.15rem", fontWeight: 700, letterSpacing: "-0.02em" }}
                >
                  {inicialesPersona(selected)}
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <p style={{ fontWeight: 600, fontSize: "0.9375rem", color: "#fff", letterSpacing: "-0.01em" }}>{nombreCompletoPersona(selected)}</p>
                  <p style={{ fontSize: "0.6875rem", color: "rgba(255,255,255,0.5)", marginTop: "2px" }}>CC {selected.numero_documento}</p>
                </div>
              </div>
              <div className="flex border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                <div className="flex-1 flex items-center gap-2 px-4 py-2.5 border-r" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                  <Phone size={11} style={{ color: "rgba(255,255,255,0.4)", flexShrink: 0 }} />
                  <span style={{ fontSize: "0.6875rem", color: "rgba(255,255,255,0.65)" }}>{selected.telefono || "Sin teléfono"}</span>
                </div>
                <div className="flex-1 flex items-center gap-2 px-4 py-2.5">
                  <Mail size={11} style={{ color: "rgba(255,255,255,0.4)", flexShrink: 0 }} />
                  <span style={{ fontSize: "0.6875rem", color: "#34d399" }} className="truncate">{selected.correo || "Sin correo"}</span>
                </div>
              </div>
            </div>

            {/* Contenido de la pestaña activa */}
            {detailTab === "resumen" && (
              <TabResumen persona={selected} expediente={expediente.entry?.data} status={expediente.entry?.status ?? "loading"} />
            )}
            {detailTab === "vinculaciones" && (
              <TabVinculaciones
                expediente={expediente.entry?.data}
                status={expediente.entry?.status ?? "loading"}
                fallbackVinculaciones={selectedVinculaciones}
                fallbackStatus={vinculacionesStatus}
              />
            )}
            {detailTab === "documentos" && (
              <TabDocumentos
                expediente={expediente.entry?.data}
                status={expediente.entry?.status ?? "loading"}
                persona={selected}
                vinculaciones={selectedVinculaciones}
                vinculacionesStatus={vinculacionesStatus}
                onVerDocumentos={onVerDocumentos}
                onDocumentChanged={() => expediente.refresh(selected.id)}
              />
            )}
            {detailTab === "sst" && (
              <TabSST expediente={expediente.entry?.data} status={expediente.entry?.status ?? "loading"} />
            )}
            {detailTab === "nomina" && (
              <TabNomina expediente={expediente.entry?.data} status={expediente.entry?.status ?? "loading"} />
            )}
            {detailTab === "evaluaciones" && (
              <TabEvaluaciones expediente={expediente.entry?.data} status={expediente.entry?.status ?? "loading"} />
            )}
            {detailTab === "timeline" && (
              <TabTimeline expediente={expediente.entry?.data} status={expediente.entry?.status ?? "loading"} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function OperariosModule({
  empresaId,
  contratoId,
  onVerDocumentos,
}: {
  empresaId?: number;
  contratoId?: number;
  onVerDocumentos?: (personaId: number, personaNombre: string) => void;
} = {}) {
  const [search, setSearch] = useState("");
  const { personasStatus, personas, vinculacionesStatus, vinculacionesByPersona } = useRealPersonasData(search, empresaId, contratoId);

  if (personasStatus === "loading") {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground gap-2">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm">Cargando colaboradores…</span>
      </div>
    );
  }

  // GET /personas falló por completo: se conserva la vista mock como fallback.
  if (personasStatus === "error") {
    return <MockOperariosView />;
  }

  return (
    <RealOperariosView
      personas={personas}
      vinculacionesByPersona={vinculacionesByPersona}
      vinculacionesStatus={vinculacionesStatus}
      searchInputValue={{ value: search, onChange: setSearch }}
      onVerDocumentos={onVerDocumentos}
    />
  );
}
