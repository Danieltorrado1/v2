import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  FlaskConical,
  Layers,
  Plus,
  Power,
  Sigma,
  Trash2,
  User,
} from "lucide-react";
import {
  createPersonalConfig,
  fetchPersonalConfigs,
  togglePersonalEstado,
  validarFormula,
  type CreatePersonalInput,
  type MetodoPersonal,
  type PersonalConfig,
  type PersonalRango,
} from "../../services/configuracionService";
import ProbarCalculoModal from "./ProbarCalculoModal";

const MODALIDADES = ["General", "CAA", "CAARES", "RI", "CAJM", "CAJU"];
const DEFAULT_FORMULA_VARS = ["cupos", "base", "minimo", "divisor", "modalidad", "contrato_id"];
const EXAMPLE_FORMULA = "base + ((cupos - minimo) / divisor)";

function BLANK_FORM(metodo: MetodoPersonal): CreatePersonalInput {
  return {
    nombre: "",
    descripcion: "",
    metodo,
    modalidad: undefined,
    formula: metodo === "formula" ? EXAMPLE_FORMULA : undefined,
    variables_permitidas: DEFAULT_FORMULA_VARS,
    personal_minimo: 0,
    regla_redondeo: "ceil",
    vigencia_desde: new Date().toISOString().slice(0, 10),
    observacion_cambio: "",
    rangos:
      metodo === "rangos"
        ? [
            { desde: 0, hasta: 100, personal_requerido: 0 },
            { desde: 101, hasta: 300, personal_requerido: 1 },
          ]
        : [],
  };
}

type RangoRow = { desde: number; hasta: number | null; personal_requerido: number };

function RangosEditor({
  rangos,
  onChange,
}: {
  rangos: RangoRow[];
  onChange: (r: RangoRow[]) => void;
}) {
  const [error, setError] = useState("");

  function addRow() {
    const last = rangos[rangos.length - 1];
    const newDesde = last ? (last.hasta !== null ? last.hasta + 1 : 0) : 0;
    onChange([...rangos, { desde: newDesde, hasta: null, personal_requerido: 0 }]);
  }

  function updateRow(i: number, field: keyof RangoRow, value: number | null) {
    const updated = rangos.map((r, idx) => (idx === i ? { ...r, [field]: value } : r));
    onChange(updated);
    // Validate overlaps
    const sorted = [...updated].sort((a, b) => a.desde - b.desde);
    for (let j = 0; j < sorted.length - 1; j++) {
      if (sorted[j].hasta !== null && sorted[j + 1].desde <= (sorted[j].hasta ?? 0)) {
        setError(`Los rangos se cruzan en [${sorted[j].desde}–${sorted[j].hasta}] y [${sorted[j + 1].desde}–…]`);
        return;
      }
    }
    setError("");
  }

  function removeRow(i: number) {
    onChange(rangos.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <div className="adm-rangos-table">
        <div className="adm-rangos-head">
          <span>Desde</span>
          <span>Hasta</span>
          <span>Personal requerido</span>
          <span>Sin límite</span>
          <span></span>
        </div>
        {rangos.map((row, i) => (
          <div key={i} className="adm-rangos-row">
            <input
              className="adm-rango-input"
              type="number"
              min={0}
              value={row.desde}
              onChange={(e) => updateRow(i, "desde", Number(e.target.value))}
            />
            <input
              className="adm-rango-input"
              type="number"
              min={row.desde}
              value={row.hasta ?? ""}
              disabled={row.hasta === null && i === rangos.length - 1}
              placeholder={row.hasta === null ? "∞" : ""}
              onChange={(e) => updateRow(i, "hasta", e.target.value === "" ? null : Number(e.target.value))}
            />
            <input
              className="adm-rango-input"
              type="number"
              min={0}
              value={row.personal_requerido}
              onChange={(e) => updateRow(i, "personal_requerido", Number(e.target.value))}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <input
                type="checkbox"
                checked={row.hasta === null}
                onChange={(e) => updateRow(i, "hasta", e.target.checked ? null : 0)}
                style={{ cursor: "pointer" }}
              />
            </div>
            <button
              className="adm-btn danger-outline sm"
              style={{ padding: "0 8px" }}
              onClick={() => removeRow(i)}
              title="Eliminar rango"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
      {error && (
        <div className="adm-rangos-error">
          <AlertTriangle size={13} /> {error}
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <button className="adm-btn secondary sm" onClick={addRow}>
          <Plus size={13} /> Agregar rango
        </button>
      </div>
    </div>
  );
}

function ConfigCard({ config, onToggle }: { config: PersonalConfig; onToggle: () => void }) {
  const [probar, setProbar] = useState(false);
  return (
    <div className={`adm-active-config ${config.estado !== "activo" ? "adm-inactive-config" : ""}`}
      style={config.estado !== "activo" ? { opacity: 0.75, background: "var(--bg-secondary)" } : {}}>
      <div className="adm-active-config-header">
        <h4 className="adm-active-config-title">
          {config.estado === "activo" ? <CheckCircle size={15} color="var(--color-success)" /> : <Power size={15} color="var(--color-neutral)" />}
          {config.nombre} &nbsp;
          <span className={`adm-badge ${config.estado === "activo" ? "active" : "inactive"}`}>
            {config.estado === "activo" ? "Activa" : "Inactiva"} · v{config.version}
          </span>
          <span className="adm-badge primary" style={{ marginLeft: 4 }}>
            {config.metodo === "formula" ? "Fórmula" : "Rangos"}
          </span>
          {config.modalidad && (
            <span className="adm-badge info" style={{ marginLeft: 4 }}>{config.modalidad}</span>
          )}
        </h4>
        <div style={{ display: "flex", gap: 8 }}>
          {config.estado === "activo" && (
            <button className="adm-btn ghost sm" onClick={() => setProbar(true)}>
              <FlaskConical size={13} /> Probar
            </button>
          )}
          <button
            className={`adm-btn sm ${config.estado === "activo" ? "danger-outline" : "secondary"}`}
            onClick={onToggle}
          >
            <Power size={12} /> {config.estado === "activo" ? "Inactivar" : "Activar"}
          </button>
        </div>
      </div>
      {config.metodo === "formula" && config.formula && (
        <div className="adm-formula-box">{config.formula}</div>
      )}
      {config.metodo === "rangos" && config.rangos && config.rangos.length > 0 && (
        <table className="adm-history" style={{ fontSize: 11, marginTop: 8 }}>
          <thead><tr><th>Desde</th><th>Hasta</th><th>Personal</th></tr></thead>
          <tbody>
            {config.rangos.map((r) => (
              <tr key={r.id}>
                <td>{r.desde}</td>
                <td>{r.hasta ?? "∞"}</td>
                <td>{r.personal_requerido}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="adm-config-meta">
        <span><User size={11} /> {config.nombre_usuario_creacion ?? "—"}</span>
        <span><Calendar size={11} /> Vigente desde {config.vigencia_desde}</span>
        <span>Redondeo: {config.regla_redondeo}</span>
      </div>
      {probar && (
        <ProbarCalculoModal
          tipo="personal"
          metodo={config.metodo}
          formula={config.formula}
          variables={config.variables_permitidas}
          rangos={config.rangos?.filter((r) => r.estado === "activo") as PersonalRango[]}
          onClose={() => setProbar(false)}
        />
      )}
    </div>
  );
}

export default function PersonalConfigTab() {
  const [configs, setConfigs] = useState<PersonalConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [activeMetodo, setActiveMetodo] = useState<MetodoPersonal>("rangos");
  const [form, setForm] = useState<CreatePersonalInput>(BLANK_FORM("rangos"));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [formulaStatus, setFormulaStatus] = useState<{ valid: boolean; error?: string } | null>(null);
  const [formulaChecking, setFormulaChecking] = useState(false);
  const [probarOpen, setProbarOpen] = useState(false);
  const formulaTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { loadConfigs(); }, []);

  async function loadConfigs() {
    setLoading(true);
    setFetchError("");
    try {
      setConfigs(await fetchPersonalConfigs());
    } catch {
      setFetchError("No se pudo cargar la configuración.");
    } finally {
      setLoading(false);
    }
  }

  function handleMetodo(m: MetodoPersonal) {
    setActiveMetodo(m);
    setForm(BLANK_FORM(m));
    setFormulaStatus(null);
  }

  function handleField<K extends keyof CreatePersonalInput>(key: K, value: CreatePersonalInput[K]) {
    setForm((p) => ({ ...p, [key]: value }));
    if (key === "formula") {
      setFormulaStatus(null);
      if (formulaTimeout.current) clearTimeout(formulaTimeout.current);
      formulaTimeout.current = setTimeout(() => checkFormula(value as string), 600);
    }
  }

  async function checkFormula(f: string) {
    if (!f?.trim()) { setFormulaStatus({ valid: false, error: "La fórmula no puede estar vacía" }); return; }
    setFormulaChecking(true);
    try {
      const res = await validarFormula(f, form.variables_permitidas ?? DEFAULT_FORMULA_VARS);
      setFormulaStatus(res);
    } catch {
      setFormulaStatus({ valid: false, error: "Error al validar" });
    } finally {
      setFormulaChecking(false);
    }
  }

  function insertVar(v: string) {
    handleField("formula", (form.formula ?? "") + " " + v);
  }

  async function handleSave() {
    if (!form.nombre.trim()) { setSaveError("El nombre es obligatorio"); return; }
    if (form.metodo === "formula" && !formulaStatus?.valid) { setSaveError("Corrija la fórmula antes de guardar"); return; }
    if (form.metodo === "rangos" && (!form.rangos || form.rangos.length === 0)) { setSaveError("Agregue al menos un rango"); return; }

    setSaving(true);
    setSaveError("");
    try {
      const payload: CreatePersonalInput = {
        ...form,
        modalidad: form.modalidad === "General" ? undefined : form.modalidad,
      };
      await createPersonalConfig(payload);
      setFormOpen(false);
      setForm(BLANK_FORM(activeMetodo));
      setFormulaStatus(null);
      await loadConfigs();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(config: PersonalConfig) {
    const newEstado = config.estado === "activo" ? "inactivo" : "activo";
    try {
      await togglePersonalEstado(config.id, newEstado);
      await loadConfigs();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error al cambiar estado");
    }
  }

  if (loading) return <div className="adm-empty"><p>Cargando configuraciones...</p></div>;
  if (fetchError) return <div className="adm-notice warning" style={{ marginTop: 8 }}><AlertTriangle size={14} /> {fetchError}</div>;

  const activeConfigs = configs.filter((c) => c.estado === "activo");

  return (
    <div>
      {/* KPIs */}
      <div className="adm-kpi-row">
        <div className="adm-kpi primary">
          <div className="adm-kpi-icon"><Layers size={16} /></div>
          <div className="adm-kpi-body">
            <span className="adm-kpi-val">{activeConfigs.length}</span>
            <span className="adm-kpi-lbl">Configs. activas</span>
          </div>
        </div>
        <div className="adm-kpi info">
          <div className="adm-kpi-icon"><Calendar size={16} /></div>
          <div className="adm-kpi-body">
            <span className="adm-kpi-val">{configs.length}</span>
            <span className="adm-kpi-lbl">Versiones totales</span>
          </div>
        </div>
        <div className="adm-kpi success">
          <div className="adm-kpi-icon"><Sigma size={16} /></div>
          <div className="adm-kpi-body">
            <span className="adm-kpi-val">{activeConfigs.filter(c => c.metodo === "formula").length}</span>
            <span className="adm-kpi-lbl">Por fórmula</span>
          </div>
        </div>
        <div className="adm-kpi warning">
          <div className="adm-kpi-icon"><Layers size={16} /></div>
          <div className="adm-kpi-body">
            <span className="adm-kpi-val">{activeConfigs.filter(c => c.metodo === "rangos").length}</span>
            <span className="adm-kpi-lbl">Por rangos</span>
          </div>
        </div>
      </div>

      {/* Active configs by modalidad */}
      {activeConfigs.length === 0 ? (
        <div className="adm-notice warning" style={{ marginBottom: 16 }}>
          <AlertTriangle size={14} />
          No existe una configuración activa para la calculadora de personal.
        </div>
      ) : (
        activeConfigs.map((c) => (
          <ConfigCard key={c.id} config={c} onToggle={() => handleToggle(c)} />
        ))
      )}

      {/* New config form */}
      <div className="adm-form-section">
        <div className="adm-form-section-header">
          <h4 className="adm-form-section-title"><Plus size={14} /> Nueva configuración</h4>
          <button className="adm-btn ghost sm" onClick={() => setFormOpen((p) => !p)}>
            {formOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>

        {formOpen && (
          <div className="adm-form-body">
            {/* Method selector */}
            <div>
              <label className="adm-label" style={{ marginBottom: 8, display: "block" }}>Método de cálculo *</label>
              <div className="adm-method-selector">
                <button className={`adm-method-btn ${activeMetodo === "formula" ? "active" : ""}`}
                  type="button" onClick={() => handleMetodo("formula")}>
                  <div className="adm-method-btn-dot" />
                  <div className="adm-method-btn-body">
                    <span className="adm-method-btn-label">Por fórmula</span>
                    <span className="adm-method-btn-sub">Expresión matemática personalizable</span>
                  </div>
                </button>
                <button className={`adm-method-btn ${activeMetodo === "rangos" ? "active" : ""}`}
                  type="button" onClick={() => handleMetodo("rangos")}>
                  <div className="adm-method-btn-dot" />
                  <div className="adm-method-btn-body">
                    <span className="adm-method-btn-label">Por rangos</span>
                    <span className="adm-method-btn-sub">Tabla de cupos → personal requerido</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Identificación */}
            <div className="adm-form-grid">
              <div className="adm-field">
                <label className="adm-label">Nombre *</label>
                <input className="adm-input" placeholder="Ej: Rangos estándar 2026" value={form.nombre} onChange={(e) => handleField("nombre", e.target.value)} />
              </div>
              <div className="adm-field">
                <label className="adm-label">Modalidad</label>
                <select className="adm-select" value={form.modalidad ?? "General"} onChange={(e) => handleField("modalidad", e.target.value)}>
                  {MODALIDADES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="adm-field">
                <label className="adm-label">Vigencia desde *</label>
                <input className="adm-input" type="date" value={form.vigencia_desde} onChange={(e) => handleField("vigencia_desde", e.target.value)} />
              </div>
              <div className="adm-field">
                <label className="adm-label">Redondeo</label>
                <select className="adm-select" value={form.regla_redondeo} onChange={(e) => handleField("regla_redondeo", e.target.value as "ceil")}>
                  <option value="ceil">Hacia arriba (ceil)</option>
                  <option value="floor">Hacia abajo (floor)</option>
                  <option value="nearest">Estándar</option>
                  <option value="none">Sin redondeo</option>
                </select>
              </div>
              <div className="adm-field">
                <label className="adm-label">Personal mínimo</label>
                <input className="adm-input" type="number" min={0} value={form.personal_minimo ?? 0} onChange={(e) => handleField("personal_minimo", Number(e.target.value))} />
              </div>
              <div className="adm-field">
                <label className="adm-label">Personal máximo (opcional)</label>
                <input className="adm-input" type="number" min={0} placeholder="Sin límite" value={form.personal_maximo ?? ""} onChange={(e) => handleField("personal_maximo", e.target.value ? Number(e.target.value) : undefined)} />
              </div>
            </div>

            {/* Formula */}
            {activeMetodo === "formula" && (
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", margin: "4px 0 8px", textTransform: "uppercase", letterSpacing: "0.4px" }}>Fórmula de personal requerido</p>
                <div className="adm-formula-editor">
                  <textarea
                    className={`adm-formula-input ${formulaStatus?.valid === true ? "valid" : formulaStatus?.valid === false ? "error" : ""}`}
                    value={form.formula ?? ""}
                    onChange={(e) => handleField("formula", e.target.value)}
                    rows={2}
                    spellCheck={false}
                  />
                  <div className="adm-formula-vars">
                    <span className="adm-formula-var-label">Variables (clic para insertar):</span>
                    {(form.variables_permitidas ?? DEFAULT_FORMULA_VARS).map((v) => (
                      <button key={v} className="adm-var-chip" type="button" onClick={() => insertVar(v)}>{v}</button>
                    ))}
                  </div>
                  {formulaChecking && <div className="adm-formula-status">Validando...</div>}
                  {!formulaChecking && formulaStatus && (
                    <div className={`adm-formula-status ${formulaStatus.valid ? "ok" : "error"}`}>
                      {formulaStatus.valid ? <><CheckCircle size={13} /> Fórmula válida</> : <><AlertTriangle size={13} /> {formulaStatus.error}</>}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Rangos */}
            {activeMetodo === "rangos" && (
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", margin: "4px 0 8px", textTransform: "uppercase", letterSpacing: "0.4px" }}>Tabla de rangos</p>
                <RangosEditor
                  rangos={(form.rangos ?? []) as RangoRow[]}
                  onChange={(r) => handleField("rangos", r)}
                />
              </div>
            )}

            <div className="adm-field">
              <label className="adm-label">Observación del cambio</label>
              <input className="adm-input" placeholder="Motivo del cambio" value={form.observacion_cambio} onChange={(e) => handleField("observacion_cambio", e.target.value)} />
            </div>

            {saveError && <div className="adm-notice warning"><AlertTriangle size={14} /> {saveError}</div>}

            <div className="adm-form-actions with-test">
              <button className="adm-btn ghost" type="button" onClick={() => setProbarOpen(true)}
                disabled={activeMetodo === "formula" && !formulaStatus?.valid}>
                <FlaskConical size={14} /> Probar cálculo
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="adm-btn secondary" onClick={() => setFormOpen(false)}>Cancelar</button>
                <button className="adm-btn primary" onClick={handleSave}
                  disabled={saving || (activeMetodo === "formula" && !formulaStatus?.valid)}>
                  {saving ? "Guardando..." : "Guardar y activar"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* History */}
      {configs.length > 0 && (
        <div className="adm-card">
          <p className="adm-card-title">Historial de configuraciones</p>
          <table className="adm-history">
            <thead>
              <tr>
                <th>Versión</th>
                <th>Nombre</th>
                <th>Método</th>
                <th>Modalidad</th>
                <th>Vigencia</th>
                <th>Creado por</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {configs.map((c) => (
                <tr key={c.id}>
                  <td><strong>v{c.version}</strong></td>
                  <td>{c.nombre}</td>
                  <td><span className={`adm-badge ${c.metodo === "formula" ? "primary" : "info"}`}>{c.metodo === "formula" ? "Fórmula" : "Rangos"}</span></td>
                  <td>{c.modalidad ?? "General"}</td>
                  <td style={{ fontSize: 11, color: "var(--text-secondary)" }}>{c.vigencia_desde}</td>
                  <td style={{ color: "var(--text-secondary)" }}>{c.nombre_usuario_creacion ?? "—"}</td>
                  <td><span className={`adm-badge ${c.estado === "activo" ? "active" : "inactive"}`}>{c.estado === "activo" ? "Activa" : "Inactiva"}</span></td>
                  <td>
                    <button className={`adm-btn sm ${c.estado === "activo" ? "danger-outline" : "secondary"}`} onClick={() => handleToggle(c)}>
                      {c.estado === "activo" ? "Inactivar" : "Activar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {probarOpen && (
        <ProbarCalculoModal
          tipo="personal"
          metodo={activeMetodo}
          formula={form.formula}
          variables={form.variables_permitidas ?? DEFAULT_FORMULA_VARS}
          rangos={(form.rangos ?? []).map((r, i) => ({ id: i, config_id: 0, ...r, hasta: r.hasta ?? null, orden: i, estado: "activo" as const, creado_en: "" }))}
          onClose={() => setProbarOpen(false)}
        />
      )}
    </div>
  );
}
