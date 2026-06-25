import { useState } from "react";
import { AlertTriangle, CheckCircle, X } from "lucide-react";
import {
  probarPersonal,
  probarSalario,
  type MetodoPersonal,
  type PersonalRango,
  type ProbarPersonalResult,
  type ProbarSalarioResult,
} from "../../services/configuracionService";

function formatCOP(v: number) {
  return "$" + Math.round(v).toLocaleString("es-CO");
}

// ─── Salary Test ─────────────────────────────────────────────────────────────

function SalarioTest({
  formula,
  variables,
}: {
  formula: string;
  variables: string[];
}) {
  const [vals, setVals] = useState({
    salario_base: 1423500,
    auxilio_transporte: 200000,
    adiciones: 0,
    recargos: 0,
    salud: 56940,
    pension: 56940,
    deducciones: 0,
  });
  const [result, setResult] = useState<ProbarSalarioResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleTest() {
    setLoading(true);
    setError("");
    try {
      const r = await probarSalario({ formula, variables_permitidas: variables, ...vals });
      setResult(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al calcular";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const fieldKeys: Array<{ key: keyof typeof vals; label: string }> = [
    { key: "salario_base", label: "Salario base" },
    { key: "auxilio_transporte", label: "Auxilio de transporte" },
    { key: "adiciones", label: "Adiciones" },
    { key: "recargos", label: "Recargos" },
    { key: "salud", label: "Salud (monto)" },
    { key: "pension", label: "Pensión (monto)" },
    { key: "deducciones", label: "Otras deducciones" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="adm-formula-box" style={{ marginBottom: 4 }}>
        {formula}
      </div>
      <div className="adm-form-grid">
        {fieldKeys.map(({ key, label }) => (
          <div key={key} className="adm-field">
            <label className="adm-label">{label}</label>
            <input
              className="adm-input"
              type="number"
              value={vals[key]}
              onChange={(e) => setVals((p) => ({ ...p, [key]: Number(e.target.value) || 0 }))}
            />
          </div>
        ))}
      </div>
      {error && (
        <div className="adm-notice warning">
          <AlertTriangle size={14} /> {error}
        </div>
      )}
      <button className="adm-btn primary" onClick={handleTest} disabled={loading}>
        {loading ? "Calculando..." : "Calcular"}
      </button>
      {result && (
        <div className="adm-test-result">
          <div className="adm-test-result-label">Resultado</div>
          <div className="adm-test-result-value">{formatCOP(result.resultado)}</div>
          <div className="adm-test-formula">Fórmula: {result.formula_aplicada}</div>
          <div className="adm-test-vars">
            {Object.entries(result.variables).map(([k, v]) => (
              <span key={k}>
                {k}: <strong>{formatCOP(v)}</strong>
              </span>
            ))}
          </div>
          {result.advertencias.map((w, i) => (
            <div key={i} className="adm-notice warning" style={{ fontSize: 11 }}>
              <AlertTriangle size={12} /> {w}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Personal Test ────────────────────────────────────────────────────────────

function PersonalTest({
  metodo,
  formula,
  variables,
  rangos,
}: {
  metodo: MetodoPersonal;
  formula?: string;
  variables: string[];
  rangos?: PersonalRango[];
}) {
  const [cupos, setCupos] = useState(200);
  const [base, setBase] = useState(1);
  const [minimo, setMinimo] = useState(100);
  const [divisor, setDivisor] = useState(200);
  const [result, setResult] = useState<ProbarPersonalResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleTest() {
    setLoading(true);
    setError("");
    try {
      const r = await probarPersonal({
        metodo,
        formula,
        variables_permitidas: variables,
        rangos: rangos?.map((r) => ({ desde: r.desde, hasta: r.hasta, personal_requerido: r.personal_requerido })),
        cupos,
        base,
        minimo,
        divisor,
      });
      setResult(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al calcular";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {metodo === "formula" && formula && (
        <div className="adm-formula-box">{formula}</div>
      )}
      {metodo === "rangos" && rangos && (
        <div className="adm-card" style={{ padding: "10px 14px", marginBottom: 0 }}>
          <p className="adm-card-title" style={{ marginBottom: 8 }}>Rangos configurados</p>
          <table className="adm-history" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th>Desde</th>
                <th>Hasta</th>
                <th>Personal requerido</th>
              </tr>
            </thead>
            <tbody>
              {rangos.map((r) => (
                <tr key={r.id}>
                  <td>{r.desde}</td>
                  <td>{r.hasta ?? "∞"}</td>
                  <td>{r.personal_requerido}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="adm-form-grid">
        <div className="adm-field">
          <label className="adm-label">Cupos</label>
          <input className="adm-input" type="number" value={cupos} onChange={(e) => setCupos(Number(e.target.value) || 0)} />
        </div>
        {metodo === "formula" && (
          <>
            <div className="adm-field">
              <label className="adm-label">Base</label>
              <input className="adm-input" type="number" value={base} onChange={(e) => setBase(Number(e.target.value) || 0)} />
            </div>
            <div className="adm-field">
              <label className="adm-label">Mínimo</label>
              <input className="adm-input" type="number" value={minimo} onChange={(e) => setMinimo(Number(e.target.value) || 0)} />
            </div>
            <div className="adm-field">
              <label className="adm-label">Divisor</label>
              <input className="adm-input" type="number" value={divisor} onChange={(e) => setDivisor(Number(e.target.value) || 1)} />
            </div>
          </>
        )}
      </div>

      {error && (
        <div className="adm-notice warning">
          <AlertTriangle size={14} /> {error}
        </div>
      )}
      <button className="adm-btn primary" onClick={handleTest} disabled={loading}>
        {loading ? "Calculando..." : "Calcular"}
      </button>
      {result && (
        <div className="adm-test-result">
          <div className="adm-test-result-label">Personal requerido</div>
          <div className="adm-test-result-value" style={{ fontSize: 40 }}>
            {result.resultado_redondeado}
          </div>
          <div className="adm-test-formula">{result.detalle}</div>
          {result.advertencias.map((w, i) => (
            <div key={i} className="adm-notice warning" style={{ fontSize: 11 }}>
              <AlertTriangle size={12} /> {w}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Modal wrapper ────────────────────────────────────────────────────────────

type ProbarCalculoModalProps = {
  tipo: "salario" | "personal";
  formula?: string;
  variables: string[];
  metodo?: MetodoPersonal;
  rangos?: PersonalRango[];
  onClose: () => void;
};

export default function ProbarCalculoModal({
  tipo,
  formula,
  variables,
  metodo = "formula",
  rangos,
  onClose,
}: ProbarCalculoModalProps) {
  return (
    <div className="adm-modal-overlay" onClick={onClose}>
      <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="adm-modal-header">
          <h3>
            <CheckCircle size={16} style={{ marginRight: 6, color: "var(--color-primary)" }} />
            Probar cálculo
          </h3>
          <button className="adm-btn ghost sm" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
        <div className="adm-modal-body">
          {tipo === "salario" ? (
            <SalarioTest formula={formula ?? ""} variables={variables} />
          ) : (
            <PersonalTest
              metodo={metodo}
              formula={formula}
              variables={variables}
              rangos={rangos}
            />
          )}
        </div>
        <div className="adm-modal-footer">
          <button className="adm-btn secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
