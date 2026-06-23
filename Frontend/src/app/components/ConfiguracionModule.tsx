import { useState } from "react";
import {
  Plus, Edit2, Trash2, ChevronDown, ChevronUp,
  Building2, Users, Settings, CheckCircle2, Tag,
} from "lucide-react";
import { DEFAULT_EMPRESA_CONFIGS, type EmpresaConfig, type CampoContrato } from "./empresaConfig";

// Roles with empresa assignment (mock — in prod this would come from backend)
const ROLES_INICIALES = [
  { id: "r1", nombre: "Coordinador TH — Acacías",       empresa: "pae",            municipios: ["Acacías"] },
  { id: "r2", nombre: "Coordinador TH — Granada",        empresa: "pae",            municipios: ["Granada", "Fuente de Oro"] },
  { id: "r3", nombre: "Coordinador TH — Vistahermosa",   empresa: "pae",            municipios: ["Vistahermosa", "Puerto Rico"] },
  { id: "r4", nombre: "Coordinador TH — La Macarena",    empresa: "pae",            municipios: ["La Macarena"] },
  { id: "r5", nombre: "Coordinador Logístico",           empresa: "logistica",      municipios: ["Todos"] },
  { id: "r6", nombre: "Administrador General",           empresa: "administrativo", municipios: ["Todos"] },
];

const TIPO_CAMPO_LABELS: Record<string, string> = {
  text:   "Texto libre",
  select: "Selección",
};

const CAMPO_TYPE_STYLE: Record<string, string> = {
  text:   "bg-blue-50 text-blue-600 border-blue-100",
  select: "bg-violet-50 text-violet-600 border-violet-100",
};

export function ConfiguracionModule() {
  const [empresas, setEmpresas]       = useState<EmpresaConfig[]>(DEFAULT_EMPRESA_CONFIGS);
  const [roles, setRoles]             = useState(ROLES_INICIALES);
  const [expandedEmpresa, setExpanded] = useState<string | null>("pae");
  const [activeTab, setActiveTab]     = useState<"empresas" | "roles">("empresas");

  function toggleExpand(id: string) {
    setExpanded(e => e === id ? null : id);
  }

  return (
    <div className="p-6 max-w-4xl space-y-5">

      {/* Header */}
      <div>
        <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: "1.1rem", letterSpacing: "-0.02em" }}>
          Configuración
        </h1>
        <p className="text-muted-foreground text-xs mt-0.5">
          Administración de empresas, tipos de contrato y asignación de roles
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit">
        {(["empresas", "roles"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-lg text-xs transition-all ${activeTab === tab ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            style={{ fontWeight: activeTab === tab ? 600 : 400 }}
          >
            {tab === "empresas" ? "Tipos de empresa" : "Roles y municipios"}
          </button>
        ))}
      </div>

      {/* ── EMPRESAS TAB ── */}
      {activeTab === "empresas" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Define las empresas u operadores y los campos del contrato que aplican a cada tipo.
            </p>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-foreground text-card text-xs hover:opacity-90 transition-all"
              style={{ fontWeight: 500, boxShadow: "var(--shadow-card)" }}
            >
              <Plus size={13} /> Nueva empresa
            </button>
          </div>

          {empresas.map(emp => {
            const isOpen = expandedEmpresa === emp.id;
            return (
              <div
                key={emp.id}
                className="bg-card rounded-2xl overflow-hidden"
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                {/* Header row */}
                <button
                  className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-muted/30 transition-colors text-left"
                  onClick={() => toggleExpand(emp.id)}
                >
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: emp.color, border: `1px solid ${emp.textColor}22` }}
                  >
                    <Building2 size={14} style={{ color: emp.textColor }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{emp.nombre}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {emp.campos.length} campo{emp.campos.length !== 1 ? "s" : ""} de contrato
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
                      onClick={e => { e.stopPropagation(); }}
                    >
                      <Edit2 size={12} />
                    </button>
                    {isOpen
                      ? <ChevronUp size={14} className="text-muted-foreground" />
                      : <ChevronDown size={14} className="text-muted-foreground" />}
                  </div>
                </button>

                {/* Expanded — campos */}
                {isOpen && (
                  <div className="border-t border-border">
                    <div className="px-5 py-3 flex items-center justify-between" style={{ background: "#fafafa" }}>
                      <p className="text-[11px] text-muted-foreground" style={{ fontWeight: 600 }}>
                        Campos del contrato
                      </p>
                      <button className="text-[11px] text-accent hover:underline flex items-center gap-1" style={{ fontWeight: 500 }}>
                        <Plus size={11} /> Agregar campo
                      </button>
                    </div>

                    <div className="px-5 pb-4 space-y-2">
                      {emp.campos.map((campo, i) => (
                        <div
                          key={campo.key}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border bg-muted/30"
                        >
                          {/* Drag handle hint */}
                          <div className="flex flex-col gap-0.5 flex-shrink-0 opacity-30">
                            <span className="w-3 h-0.5 bg-foreground rounded-full" />
                            <span className="w-3 h-0.5 bg-foreground rounded-full" />
                            <span className="w-3 h-0.5 bg-foreground rounded-full" />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-[12.5px] text-foreground" style={{ fontWeight: 500 }}>{campo.label}</p>
                              {campo.requerido && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-red-50 text-red-500 border border-red-100" style={{ fontWeight: 600 }}>
                                  REQUERIDO
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-muted-foreground">key: <code className="text-accent">{campo.key}</code></span>
                              {campo.opciones && (
                                <span className="text-[10px] text-muted-foreground">
                                  · {campo.opciones.length} opciones: {campo.opciones.slice(0, 2).join(", ")}{campo.opciones.length > 2 ? "…" : ""}
                                </span>
                              )}
                            </div>
                          </div>

                          <span className={`text-[10px] px-2 py-0.5 rounded-lg border flex-shrink-0 ${CAMPO_TYPE_STYLE[campo.tipo]}`} style={{ fontWeight: 500 }}>
                            {TIPO_CAMPO_LABELS[campo.tipo]}
                          </span>

                          <button className="w-6 h-6 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors flex-shrink-0">
                            <Edit2 size={11} />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Preview */}
                    <div className="mx-5 mb-4 rounded-xl border border-dashed border-border p-4">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-3" style={{ fontWeight: 600, letterSpacing: "0.08em" }}>
                        Vista previa — sección "Datos del contrato"
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        {emp.campos.map(campo => (
                          <div key={campo.key}>
                            <p className="text-[9px] text-muted-foreground uppercase tracking-wide mb-0.5">{campo.label}{campo.requerido ? " *" : ""}</p>
                            {campo.tipo === "select" ? (
                              <div className="flex items-center gap-1">
                                <div className="h-6 w-full rounded-lg border border-border bg-muted/50 flex items-center px-2">
                                  <span className="text-[10px] text-muted-foreground">{campo.opciones?.[0] ?? "—"}</span>
                                </div>
                                <ChevronDown size={10} className="text-muted-foreground flex-shrink-0" />
                              </div>
                            ) : (
                              <div className="h-6 w-full rounded-lg border border-border bg-muted/50" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── ROLES TAB ── */}
      {activeTab === "roles" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Asigna a cada rol su empresa y los municipios que puede administrar.
            </p>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-foreground text-card text-xs hover:opacity-90 transition-all"
              style={{ fontWeight: 500, boxShadow: "var(--shadow-card)" }}
            >
              <Plus size={13} /> Nuevo rol
            </button>
          </div>

          <div className="bg-card rounded-2xl overflow-hidden" style={{ boxShadow: "var(--shadow-card)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border" style={{ background: "#fafafa" }}>
                  <th className="text-left px-5 py-3 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Rol</th>
                  <th className="text-left px-3 py-3 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Empresa asignada</th>
                  <th className="text-left px-3 py-3 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Municipios</th>
                  <th className="w-16" />
                </tr>
              </thead>
              <tbody>
                {roles.map(rol => {
                  const empConfig = empresas.find(e => e.id === rol.empresa);
                  return (
                    <tr key={rol.id} className="border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#f3f4f6" }}>
                            <Users size={13} className="text-muted-foreground" />
                          </div>
                          <p className="text-[12px] text-foreground" style={{ fontWeight: 500 }}>{rol.nombre}</p>
                        </div>
                      </td>
                      <td className="px-3 py-3.5">
                        {empConfig ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: empConfig.color }}>
                              <Building2 size={10} style={{ color: empConfig.textColor }} />
                            </div>
                            <span className="text-[12px] text-foreground">{empConfig.nombre.split("—")[0].trim()}</span>
                          </div>
                        ) : (
                          <span className="text-[12px] text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {rol.municipios.map(m => (
                            <span key={m} className="text-[10px] px-1.5 py-0.5 rounded-lg bg-muted text-muted-foreground border border-border" style={{ fontWeight: 500 }}>
                              {m}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <button className="w-6 h-6 rounded-lg flex items-center justify-center bg-muted text-muted-foreground hover:bg-secondary transition-colors">
                            <Edit2 size={11} />
                          </button>
                          <button className="w-6 h-6 rounded-lg flex items-center justify-center bg-muted text-muted-foreground hover:bg-red-50 hover:text-destructive transition-colors">
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Info card */}
          <div className="rounded-2xl border border-border p-4 flex items-start gap-3" style={{ background: "#f8fafc" }}>
            <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
              <Settings size={14} className="text-blue-500" />
            </div>
            <div>
              <p className="text-[12px] text-foreground" style={{ fontWeight: 500 }}>¿Cómo funciona la asignación?</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                Cada rol tiene una empresa asignada que determina qué campos de contrato se solicitan al crear o editar un operario.
                Los coordinadores solo ven el personal de los municipios asignados a su rol.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
