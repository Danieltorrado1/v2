import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  FlaskConical,
  Plus,
  Power,
  User,
} from "lucide-react";
import {
  createSalarioConfig,
  fetchSalarioConfigs,
  toggleSalarioEstado,
  validarFormula,
  type CreateSalarioInput,
  type SalarioConfig,
} from "../../services/configuracionService";
import ProbarCalculoModal from "./ProbarCalculoModal";

function formatCOP(v: number) {
  return "$" + Number(v).toLocaleString("es-CO");
}
function formatPct(v: number) {
  return (Number(v) * 100).toFixed(2) + "%";
}

const DEFAULT_FORMULA = "salario_base + auxilio_transporte + adiciones + recargos - salud - pension - deducciones";
const DEFAULT_VARS = ["salario_base", "auxilio_transporte", "adiciones", "recargos", "salud", "pension", "deducciones", "devengado"];

const BLANK_FORM: CreateSalarioInput = {
  nombre: "",
  descripcion: "",
  salario_base_tc: 1423500,
  salario_base_mt: 711750,
  salario_base_ops: 1650000,
  auxilio_transporte: 200000,
  porcentaje_salud: 0.04,
  porcentaje_pension: 0.04,
  recargo_horas_extra: 0.25,
  dias_mes: 30,
  formula_neto: DEFAULT_FORMULA,
  variables_permitidas: DEFAULT_VARS,
  regla_redondeo: "nearest",
  vigencia_desde: new Date().toISOString().slice(0, 10),
  observacion_cambio: "",
};

export default function SalarioConfigTab() {
  const [configs, setConfigs] = useState<SalarioConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CreateSalarioInput>(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [formulaStatus, setFormulaStatus] = useState<{ valid: boolean; error?: string } | null>(null);
  const [formulaChecking, setFormulaChecking] = useState(false);
  const [probarOpen, setProbarOpen] = useState(false);
  const formulaTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeConfig = configs.find((c) => c.estado === "activo");

  useEffect(() => {
    loadConfigs();
  }, []);

  async function loadConfigs() {
    setLoading(true);
    setFetchError("");
    try {
      const data = await fetchSalarioConfigs();
      setConfigs(data);
    } catch {
      setFetchError("No se pudo cargar la configuración. Verifique la conexión con el servidor.");
    } finally {
      setLoading(false);
    }
  }

  function handleField<K extends keyof CreateSalarioInput>(key: K, value: CreateSalarioInput[K]) {
    setForm((p) => ({ ...p, [key]: value }));
    if (key === "formula_neto") {
      setFormulaStatus(null);
      if (formulaTimeout.current) clearTimeout(formulaTimeout.current);
      formulaTimeout.current = setTimeout(() => checkFormula(value as string), 600);
    }
  }

  async function checkFormula(f: string) {
    if (!f.trim()) { setFormulaStatus({ valid: false, error: "La fórmula no puede estar vacía" }); return; }
    setFormulaChecking(true);
    try {
      const res = await validarFormula(f, form.variables_permitidas ?? DEFAULT_VARS);
      setFormulaStatus(res);
    } catch {
      setFormulaStatus({ valid: false, error: "Error al validar la fórmula" });
    } finally {
      setFormulaChecking(false);
    }
  }

  function insertVar(v: string) {
    const textarea = document.getElementById("adm-formula-input") as HTMLTextAreaElement | null;
    if (textarea) {
      const pos = textarea.selectionStart ?? form.formula_neto.length;
      const newVal = form.formula_neto.slice(0, pos) + v + form.formula_neto.slice(pos);
      handleField("formula_neto", newVal);
    } else {
      handleField("formula_neto", form.formula_neto + " " + v);
    }
  }

  async function handleSave() {
    if (!form.nombre.trim()) { setSaveError("El nombre es obligatorio"); return; }
    if (!formulaStatus?.valid) { setSaveError("Corrija la fórmula antes de guardar"); return; }
    setSaving(true);
    setSaveError("");
    try {
      await createSalarioConfig(form);
      setFormOpen(false);
      setForm(BLANK_FORM);
      setFormulaStatus(null);
      await loadConfigs();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al guardar";
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(config: SalarioConfig) {
    const newEstado = config.estado === "activo" ? "inactivo" : "activo";
    try {
      await toggleSalarioEstado(config.id, newEstado);
      await loadConfigs();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error al cambiar estado");
    }
  }

  if (loading) {
    return (
      <div className="adm-empty">
        <p>Cargando configuraciones...</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="adm-notice warning" style={{ marginTop: 8 }}>
        <AlertTriangle size={14} /> {fetchError}
      </div>
    );
  }

  return (
    <div>
      {/* KPIs */}
      <div className="adm-kpi-row">
        <div className="adm-kpi primary">
          <div className="adm-kpi-icon"><CheckCircle size={16} /></div>
          <div className="adm-kpi-body">
            <span className="adm-kpi-val">{activeConfig ? "Activa" : "Ninguna"}</span>
            <span className="adm-kpi-lbl">Configuración activa</span>
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
          <div className="adm-kpi-icon"><CheckCircle size={16} /></div>
          <div className="adm-kpi-body">
            <span className="adm-kpi-val">{activeConfig ? "v" + activeConfig.version : "—"}</span>
            <span className="adm-kpi-lbl">Versión en uso</span>
          </div>
        </div>
      </div>

      {/* Active config */}
      {activeConfig ? (
        <div className="adm-active-config">
          <div className="adm-active-config-header">
            <h4 className="adm-active-config-title">
              <CheckCircle size={15} color="var(--color-success)" />
              {activeConfig.nombre} &nbsp;
              <span className="adm-badge active">Activa · v{activeConfig.version}</span>
            </h4>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="adm-btn ghost sm"
                onClick={() => setProbarOpen(true)}
              >
                <FlaskConical size={13} /> Probar cálculo
              </button>
              <button
                className="adm-btn danger-outline sm"
                onClick={() => handleToggle(activeConfig)}
              >
                <Power size={12} /> Inactivar
              </button>
            </div>
          </div>
          <div className="adm-formula-box">{activeConfig.formula_neto}</div>
          <div className="adm-config-meta">
            <span><User size={11} /> {activeConfig.nombre_usuario_creacion ?? "—"}</span>
            <span><Calendar size={11} /> Vigente desde {activeConfig.vigencia_desde}</span>
            <span>Salud {formatPct(activeConfig.porcentaje_salud)} · Pensión {formatPct(activeConfig.porcentaje_pension)}</span>
            <span>TC: {formatCOP(activeConfig.salario_base_tc)} · MT: {formatCOP(activeConfig.salario_base_mt)}</span>
          </div>
        </div>
      ) : (
        <div className="adm-notice warning" style={{ marginBottom: 16 }}>
          <AlertTriangle size={14} />
          No existe una configuración activa para la calculadora de salario. Las calculadoras usarán valores por defecto.
        </div>
      )}

      {/* New config form toggle */}
      <div className="adm-form-section">
        <div className="adm-form-section-header">
          <h4 className="adm-form-section-title">
            <Plus size={14} /> Nueva configuración
          </h4>
          <button className="adm-btn ghost sm" onClick={() => setFormOpen((p) => !p)}>
            {formOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>

        {formOpen && (
          <div className="adm-form-body">
            {/* Identificación */}
            <div className="adm-form-grid">
              <div className="adm-field">
                <label className="adm-label">Nombre *</label>
                <input className="adm-input" placeholder="Ej: Config. salarial 2026" value={form.nombre} onChange={(e) => handleField("nombre", e.target.value)} />
              </div>
              <div className="adm-field">
                <label className="adm-label">Vigencia desde *</label>
                <input className="adm-input" type="date" value={form.vigencia_desde} onChange={(e) => handleField("vigencia_desde", e.target.value)} />
              </div>
              <div className="adm-field full-width">
                <label className="adm-label">Descripción</label>
                <input className="adm-input" placeholder="Descripción breve del cambio" value={form.descripcion} onChange={(e) => handleField("descripcion", e.target.value)} />
              </div>
            </div>

            {/* Salaries */}
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", margin: "4px 0 0", textTransform: "uppercase", letterSpacing: "0.4px" }}>Salarios base</p>
            <div className="adm-form-grid cols-3">
              <div className="adm-field">
                <label className="adm-label">Tiempo Completo (TC)</label>
                <input className="adm-input" type="number" value={form.salario_base_tc} onChange={(e) => handleField("salario_base_tc", Number(e.target.value))} />
              </div>
              <div className="adm-field">
                <label className="adm-label">Medio Tiempo (MT)</label>
                <input className="adm-input" type="number" value={form.salario_base_mt} onChange={(e) => handleField("salario_base_mt", Number(e.target.value))} />
              </div>
              <div className="adm-field">
                <label className="adm-label">OPS</label>
                <input className="adm-input" type="number" value={form.salario_base_ops} onChange={(e) => handleField("salario_base_ops", Number(e.target.value))} />
              </div>
            </div>

            {/* Deductions & surcharges */}
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", margin: "4px 0 0", textTransform: "uppercase", letterSpacing: "0.4px" }}>Parámetros de cálculo</p>
            <div className="adm-form-grid cols-3">
              <div className="adm-field">
                <label className="adm-label">Auxilio de transporte</label>
                <input className="adm-input" type="number" value={form.auxilio_transporte} onChange={(e) => handleField("auxilio_transporte", Number(e.target.value))} />
              </div>
              <div className="adm-field">
                <label className="adm-label">% Salud (ej: 4 = 4%)</label>
                <input className="adm-input" type="number" step="0.01" value={(Number(form.porcentaje_salud) * 100).toFixed(2)}
                  onChange={(e) => handleField("porcentaje_salud", Number(e.target.value) / 100)} />
              </div>
              <div className="adm-field">
                <label className="adm-label">% Pensión</label>
                <input className="adm-input" type="number" step="0.01" value={(Number(form.porcentaje_pension) * 100).toFixed(2)}
                  onChange={(e) => handleField("porcentaje_pension", Number(e.target.value) / 100)} />
              </div>
              <div className="adm-field">
                <label className="adm-label">% Recargo horas extra</label>
                <input className="adm-input" type="number" step="0.01" value={(Number(form.recargo_horas_extra) * 100).toFixed(2)}
                  onChange={(e) => handleField("recargo_horas_extra", Number(e.target.value) / 100)} />
              </div>
              <div className="adm-field">
                <label className="adm-label">Días del mes</label>
                <input className="adm-input" type="number" value={form.dias_mes} onChange={(e) => handleField("dias_mes", Number(e.target.value))} />
              </div>
              <div className="adm-field">
                <label className="adm-label">Redondeo</label>
                <select className="adm-select" value={form.regla_redondeo} onChange={(e) => handleField("regla_redondeo", e.target.value as "nearest")}>
                  <option value="nearest">Redondeo estándar</option>
                  <option value="floor">Hacia abajo (floor)</option>
                  <option value="ceil">Hacia arriba (ceil)</option>
                  <option value="none">Sin redondeo</option>
                </select>
              </div>
            </div>

            {/* Formula */}
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", margin: "4px 0 0", textTransform: "uppercase", letterSpacing: "0.4px" }}>Fórmula de salario neto</p>
            <div className="adm-formula-editor">
              <textarea
                id="adm-formula-input"
                className={`adm-formula-input ${formulaStatus?.valid === true ? "valid" : formulaStatus?.valid === false ? "error" : ""}`}
                value={form.formula_neto}
                onChange={(e) => handleField("formula_neto", e.target.value)}
                rows={2}
                spellCheck={false}
              />
              <div className="adm-formula-vars">
                <span className="adm-formula-var-label">Variables disponibles (clic para insertar):</span>
                {(form.variables_permitidas ?? DEFAULT_VARS).map((v) => (
                  <button key={v} className="adm-var-chip" type="button" onClick={() => insertVar(v)}>{v}</button>
                ))}
              </div>
              {formulaChecking && (
                <div className="adm-formula-status">Validando...</div>
              )}
              {!formulaChecking && formulaStatus && (
                <div className={`adm-formula-status ${formulaStatus.valid ? "ok" : "error"}`}>
                  {formulaStatus.valid ? <><CheckCircle size={13} /> Fórmula válida</> : <><AlertTriangle size={13} /> {formulaStatus.error}</>}
                </div>
              )}
            </div>

            <div className="adm-field">
              <label className="adm-label">Observación del cambio</label>
              <input className="adm-input" placeholder="Motivo o descripción del cambio" value={form.observacion_cambio} onChange={(e) => handleField("observacion_cambio", e.target.value)} />
            </div>

            {saveError && (
              <div className="adm-notice warning">
                <AlertTriangle size={14} /> {saveError}
              </div>
            )}

            <div className="adm-form-actions with-test">
              <button
                className="adm-btn ghost"
                type="button"
                onClick={() => setProbarOpen(true)}
                disabled={!formulaStatus?.valid}
              >
                <FlaskConical size={14} /> Probar cálculo
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="adm-btn secondary" onClick={() => setFormOpen(false)}>Cancelar</button>
                <button className="adm-btn primary" onClick={handleSave} disabled={saving || !formulaStatus?.valid}>
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
                <th>TC</th>
                <th>Salud %</th>
                <th>Pensión %</th>
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
                  <td>{formatCOP(c.salario_base_tc)}</td>
                  <td>{formatPct(c.porcentaje_salud)}</td>
                  <td>{formatPct(c.porcentaje_pension)}</td>
                  <td style={{ color: "var(--text-secondary)", fontSize: 11 }}>{c.vigencia_desde}</td>
                  <td style={{ color: "var(--text-secondary)" }}>{c.nombre_usuario_creacion ?? "—"}</td>
                  <td>
                    <span className={`adm-badge ${c.estado === "activo" ? "active" : "inactive"}`}>
                      {c.estado === "activo" ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                  <td>
                    <button
                      className={`adm-btn sm ${c.estado === "activo" ? "danger-outline" : "secondary"}`}
                      onClick={() => handleToggle(c)}
                    >
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
          tipo="salario"
          formula={formOpen ? form.formula_neto : (activeConfig?.formula_neto ?? DEFAULT_FORMULA)}
          variables={form.variables_permitidas ?? DEFAULT_VARS}
          onClose={() => setProbarOpen(false)}
        />
      )}
    </div>
  );
}
