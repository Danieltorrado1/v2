import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { Eye, FileText, Loader2, Upload, XCircle } from "lucide-react";
import type { DocumentoListItem, DocumentoUploadFields } from "../../types/documentos.types";
import type { VinculacionChecklistApi } from "../../types/expediente.types";
import {
  deactivateDocumentoPersona,
  deactivateDocumentoVinculacion,
  getChecklistVinculacion,
  getDocumentoDownloadUrl,
  getDocumentosPersona,
  getDocumentosVinculacion,
  uploadDocumentoPersona,
  uploadDocumentoVinculacion,
} from "../../services/documentosApi";
import {
  normalizeDocumentoPersona,
  normalizeDocumentoVinculacion,
} from "../../types/documentos.types";

// ── Local types ───────────────────────────────────────────────────────────────

type TabId = "persona" | "vinculacion" | "checklist";

interface UploadForm {
  scope: "persona" | "vinculacion";
  file: File | null;
  tipoDocumentoId: string;
  fechaExpedicion: string;
  fechaVencimiento: string;
  submitting: boolean;
  error: string | null;
}

// ── Style constants ───────────────────────────────────────────────────────────

const S: Record<string, CSSProperties> = {
  panel: {
    background: "var(--bg-card)",
    border: "1px solid var(--border-color)",
    borderRadius: "12px",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 20px",
    borderBottom: "1px solid var(--border-color)",
  },
  headerTitle: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    margin: 0,
    fontSize: "0.9rem",
    fontWeight: 600,
  },
  uploadBtn: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "5px 12px",
    borderRadius: "8px",
    border: "1px solid var(--color-brand)",
    background: "transparent",
    color: "var(--color-brand)",
    fontSize: "0.78rem",
    fontWeight: 500,
    cursor: "pointer",
  },
  uploadForm: {
    padding: "14px 20px",
    borderBottom: "1px solid var(--border-color)",
    background: "var(--bg-surface)",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  formRow: { display: "flex", gap: "12px", flexWrap: "wrap" },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    fontSize: "0.75rem",
    color: "var(--text-secondary)",
    fontWeight: 500,
  },
  input: {
    padding: "5px 10px",
    borderRadius: "6px",
    border: "1px solid var(--border-color)",
    background: "var(--bg-card)",
    color: "var(--text-primary)",
    fontSize: "0.8rem",
    minWidth: "160px",
  },
  formActions: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" },
  cancelBtn: {
    padding: "5px 14px",
    borderRadius: "6px",
    border: "1px solid var(--border-color)",
    background: "transparent",
    color: "var(--text-secondary)",
    fontSize: "0.78rem",
    cursor: "pointer",
  },
  submitBtn: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "5px 14px",
    borderRadius: "6px",
    border: "none",
    background: "var(--color-brand)",
    color: "#fff",
    fontSize: "0.78rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  tabs: {
    display: "flex",
    borderBottom: "1px solid var(--border-color)",
    background: "var(--bg-surface)",
  },
  tableWrap: { overflowX: "auto", maxHeight: "320px", overflowY: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "0.79rem" },
  th: {
    padding: "8px 12px",
    textAlign: "left",
    fontSize: "0.72rem",
    fontWeight: 600,
    color: "var(--text-secondary)",
    borderBottom: "1px solid var(--border-color)",
    whiteSpace: "nowrap",
    background: "var(--bg-surface)",
    position: "sticky",
    top: 0,
  },
  td: {
    padding: "8px 12px",
    borderBottom: "1px solid var(--border-color)",
    verticalAlign: "middle",
  },
  badge: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: "999px",
    fontSize: "0.69rem",
    fontWeight: 500,
  },
  actionBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "26px",
    height: "26px",
    borderRadius: "6px",
    border: "1px solid var(--border-color)",
    background: "transparent",
    cursor: "pointer",
    color: "var(--text-secondary)",
  },
  center: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    padding: "32px",
    color: "var(--text-secondary)",
    fontSize: "0.82rem",
  },
  retryBtn: {
    background: "none",
    border: "none",
    color: "var(--color-brand)",
    cursor: "pointer",
    fontSize: "0.8rem",
    textDecoration: "underline",
    padding: 0,
  },
  checklistSummary: {
    display: "flex",
    gap: "16px",
    padding: "10px 16px",
    background: "var(--bg-surface)",
    borderBottom: "1px solid var(--border-color)",
    flexWrap: "wrap",
    fontSize: "0.79rem",
  },
};

// ── Lookups ───────────────────────────────────────────────────────────────────

const ESTADO_STYLE: Record<string, CSSProperties> = {
  vigente:    { background: "rgba(34,197,94,0.12)",   color: "#16a34a" },
  por_vencer: { background: "rgba(245,158,11,0.12)",  color: "#d97706" },
  vencido:    { background: "rgba(239,68,68,0.12)",   color: "#dc2626" },
  inactivo:   { background: "rgba(107,114,128,0.12)", color: "#6b7280" },
};

const ESTADO_LABEL: Record<string, string> = {
  vigente: "Vigente", por_vencer: "Por vencer", vencido: "Vencido", inactivo: "Inactivo",
};

const CHECKLIST_STYLE: Record<string, CSSProperties> = {
  CARGADO:  { background: "rgba(34,197,94,0.12)",  color: "#16a34a" },
  FALTANTE: { background: "rgba(239,68,68,0.12)",  color: "#dc2626" },
  VENCIDO:  { background: "rgba(245,158,11,0.12)", color: "#d97706" },
};

const EMPTY_FORM: UploadForm = {
  scope: "persona",
  file: null,
  tipoDocumentoId: "",
  fechaExpedicion: "",
  fechaVencimiento: "",
  submitting: false,
  error: null,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(fecha: string | null | undefined): string {
  if (!fecha) return "—";
  const [y, m, d] = fecha.split("-");
  return `${d ?? "?"}/${m ?? "?"}/${y ?? "?"}`;
}

function tabStyle(active: boolean): CSSProperties {
  return {
    padding: "10px 16px",
    border: "none",
    borderBottom: active
      ? "2px solid var(--color-brand)"
      : "2px solid transparent",
    background: "transparent",
    color: active ? "var(--color-brand)" : "var(--text-secondary)",
    fontWeight: active ? 600 : 400,
    fontSize: "0.8rem",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ExpedienteDocumentosPanel({
  personaId,
  vinculacionId,
}: {
  personaId: number;
  vinculacionId: number;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("persona");
  const [docsPersona, setDocsPersona] = useState<DocumentoListItem[]>([]);
  const [docsVinculacion, setDocsVinculacion] = useState<DocumentoListItem[]>([]);
  const [checklist, setChecklist] = useState<VinculacionChecklistApi | null>(null);

  const [loadingP, setLoadingP] = useState(false);
  const [loadingV, setLoadingV] = useState(false);
  const [loadingC, setLoadingC] = useState(false);
  const [errorP, setErrorP] = useState<string | null>(null);
  const [errorV, setErrorV] = useState<string | null>(null);
  const [errorC, setErrorC] = useState<string | null>(null);

  const [viewingId, setViewingId] = useState<string | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState<UploadForm>(EMPTY_FORM);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const checklistAsked = useRef(false);

  const loadPersona = useCallback(async () => {
    setLoadingP(true);
    setErrorP(null);
    try {
      const docs = await getDocumentosPersona(personaId);
      setDocsPersona(docs.map(normalizeDocumentoPersona));
    } catch (e) {
      setErrorP(e instanceof Error ? e.message : "Error al cargar documentos de persona");
    } finally {
      setLoadingP(false);
    }
  }, [personaId]);

  const loadVinculacion = useCallback(async () => {
    setLoadingV(true);
    setErrorV(null);
    try {
      const docs = await getDocumentosVinculacion(vinculacionId);
      setDocsVinculacion(docs.map(normalizeDocumentoVinculacion));
    } catch (e) {
      setErrorV(e instanceof Error ? e.message : "Error al cargar documentos de vinculación");
    } finally {
      setLoadingV(false);
    }
  }, [vinculacionId]);

  const loadChecklist = useCallback(async () => {
    setLoadingC(true);
    setErrorC(null);
    try {
      const data = await getChecklistVinculacion(vinculacionId);
      setChecklist(data);
    } catch (e) {
      setErrorC(e instanceof Error ? e.message : "Error al cargar checklist");
    } finally {
      setLoadingC(false);
    }
  }, [vinculacionId]);

  // Load docs on mount / when persona/vinculacion changes
  useEffect(() => {
    setDocsPersona([]);
    setDocsVinculacion([]);
    setChecklist(null);
    setActiveTab("persona");
    setShowUpload(false);
    checklistAsked.current = false;
    void loadPersona();
    void loadVinculacion();
  }, [personaId, vinculacionId, loadPersona, loadVinculacion]);

  // Lazy-load checklist when tab is first clicked
  useEffect(() => {
    if (activeTab === "checklist" && !checklistAsked.current) {
      checklistAsked.current = true;
      void loadChecklist();
    }
  }, [activeTab, loadChecklist]);

  const handleView = useCallback(async (doc: DocumentoListItem) => {
    setViewingId(doc.id);
    try {
      const info = await getDocumentoDownloadUrl(doc.id, doc.origen);
      window.open(info.download_url, "_blank", "noopener,noreferrer");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error al obtener URL del documento");
    } finally {
      setViewingId(null);
    }
  }, []);

  const handleDeactivate = useCallback(async (doc: DocumentoListItem) => {
    if (!window.confirm(`¿Desactivar "${doc.tipoNombre}" (${doc.nombreOriginal})?`)) return;
    setDeactivatingId(doc.id);
    try {
      if (doc.origen === "PERSONA") {
        await deactivateDocumentoPersona(doc.id);
        setDocsPersona((prev) =>
          prev.map((d) =>
            d.id === doc.id ? { ...d, activo: false, esVigente: false, estado: "inactivo" } : d
          )
        );
      } else {
        await deactivateDocumentoVinculacion(doc.id);
        setDocsVinculacion((prev) =>
          prev.map((d) =>
            d.id === doc.id ? { ...d, activo: false, esVigente: false, estado: "inactivo" } : d
          )
        );
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error al desactivar el documento");
    } finally {
      setDeactivatingId(null);
    }
  }, []);

  const handleUploadSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const { scope, file, tipoDocumentoId, fechaExpedicion, fechaVencimiento } = uploadForm;
      if (!file || !tipoDocumentoId.trim()) {
        setUploadForm((f) => ({ ...f, error: "Archivo y tipo de documento son requeridos." }));
        return;
      }
      setUploadForm((f) => ({ ...f, submitting: true, error: null }));
      const fields: DocumentoUploadFields = {
        tipo_documento_id: tipoDocumentoId.trim(),
        ...(fechaExpedicion ? { fecha_expedicion: fechaExpedicion } : {}),
        ...(fechaVencimiento ? { fecha_vencimiento: fechaVencimiento } : {}),
      };
      try {
        if (scope === "persona") {
          const result = await uploadDocumentoPersona(personaId, file, fields);
          setDocsPersona((prev) => [normalizeDocumentoPersona(result), ...prev]);
          setActiveTab("persona");
        } else {
          const result = await uploadDocumentoVinculacion(vinculacionId, file, fields);
          setDocsVinculacion((prev) => [normalizeDocumentoVinculacion(result), ...prev]);
          setActiveTab("vinculacion");
        }
        setShowUpload(false);
        setUploadForm(EMPTY_FORM);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (e) {
        setUploadForm((f) => ({
          ...f,
          submitting: false,
          error: e instanceof Error ? e.message : "Error al subir el documento",
        }));
      }
    },
    [uploadForm, personaId, vinculacionId]
  );

  return (
    <section style={S.panel}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.headerTitle}>
          <FileText size={18} />
          <h3 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600 }}>Documentos</h3>
        </div>
        <button
          type="button"
          style={S.uploadBtn}
          onClick={() => setShowUpload((v) => !v)}
        >
          <Upload size={14} />
          Subir documento
        </button>
      </div>

      {/* Upload form */}
      {showUpload && (
        <form onSubmit={(e) => { void handleUploadSubmit(e); }} style={S.uploadForm}>
          <div style={S.formRow}>
            <label style={S.label}>
              Destino
              <select
                value={uploadForm.scope}
                onChange={(e) =>
                  setUploadForm((f) => ({
                    ...f,
                    scope: e.target.value as "persona" | "vinculacion",
                  }))
                }
                style={S.input}
              >
                <option value="persona">Persona</option>
                <option value="vinculacion">Vinculación</option>
              </select>
            </label>

            <label style={S.label}>
              Tipo documental (ID) <span style={{ color: "#dc2626" }}>*</span>
              <input
                type="text"
                value={uploadForm.tipoDocumentoId}
                onChange={(e) =>
                  setUploadForm((f) => ({ ...f, tipoDocumentoId: e.target.value }))
                }
                placeholder="UUID del tipo de documento"
                style={S.input}
              />
            </label>

            <label style={S.label}>
              Fecha expedición
              <input
                type="date"
                value={uploadForm.fechaExpedicion}
                onChange={(e) =>
                  setUploadForm((f) => ({ ...f, fechaExpedicion: e.target.value }))
                }
                style={S.input}
              />
            </label>

            <label style={S.label}>
              Fecha vencimiento
              <input
                type="date"
                value={uploadForm.fechaVencimiento}
                onChange={(e) =>
                  setUploadForm((f) => ({ ...f, fechaVencimiento: e.target.value }))
                }
                style={S.input}
              />
            </label>
          </div>

          <div style={S.formActions}>
            <label style={{ ...S.label, flex: 1 }}>
              Archivo <span style={{ color: "#dc2626" }}>*</span>
              <input
                ref={fileInputRef}
                type="file"
                onChange={(e) =>
                  setUploadForm((f) => ({ ...f, file: e.target.files?.[0] ?? null }))
                }
                style={{ fontSize: "0.78rem" }}
              />
            </label>

            {uploadForm.error && (
              <span style={{ color: "#dc2626", fontSize: "0.75rem" }}>
                {uploadForm.error}
              </span>
            )}

            <button
              type="button"
              style={S.cancelBtn}
              disabled={uploadForm.submitting}
              onClick={() => {
                setShowUpload(false);
                setUploadForm(EMPTY_FORM);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            >
              Cancelar
            </button>

            <button type="submit" style={S.submitBtn} disabled={uploadForm.submitting}>
              {uploadForm.submitting ? <Loader2 size={13} /> : <Upload size={13} />}
              {uploadForm.submitting ? "Subiendo..." : "Subir"}
            </button>
          </div>
        </form>
      )}

      {/* Tabs */}
      <div style={S.tabs}>
        <button
          type="button"
          style={tabStyle(activeTab === "persona")}
          onClick={() => setActiveTab("persona")}
        >
          Persona ({docsPersona.length})
        </button>
        <button
          type="button"
          style={tabStyle(activeTab === "vinculacion")}
          onClick={() => setActiveTab("vinculacion")}
        >
          Vinculación ({docsVinculacion.length})
        </button>
        <button
          type="button"
          style={tabStyle(activeTab === "checklist")}
          onClick={() => setActiveTab("checklist")}
        >
          Checklist
        </button>
      </div>

      {/* Tab content */}
      <div style={S.tableWrap}>
        {activeTab === "persona" && (
          <DocTable
            docs={docsPersona}
            loading={loadingP}
            error={errorP}
            viewingId={viewingId}
            deactivatingId={deactivatingId}
            onView={handleView}
            onDeactivate={handleDeactivate}
            onRetry={loadPersona}
          />
        )}
        {activeTab === "vinculacion" && (
          <DocTable
            docs={docsVinculacion}
            loading={loadingV}
            error={errorV}
            viewingId={viewingId}
            deactivatingId={deactivatingId}
            onView={handleView}
            onDeactivate={handleDeactivate}
            onRetry={loadVinculacion}
          />
        )}
        {activeTab === "checklist" && (
          <ChecklistView
            checklist={checklist}
            loading={loadingC}
            error={errorC}
            onRetry={loadChecklist}
          />
        )}
      </div>
    </section>
  );
}

// ── DocTable ──────────────────────────────────────────────────────────────────

function DocTable({
  docs,
  loading,
  error,
  viewingId,
  deactivatingId,
  onView,
  onDeactivate,
  onRetry,
}: {
  docs: DocumentoListItem[];
  loading: boolean;
  error: string | null;
  viewingId: string | null;
  deactivatingId: string | null;
  onView: (doc: DocumentoListItem) => void;
  onDeactivate: (doc: DocumentoListItem) => void;
  onRetry: () => void;
}) {
  if (loading && docs.length === 0) {
    return <div style={S.center}>Cargando documentos...</div>;
  }
  if (error) {
    return (
      <div style={S.center}>
        <span style={{ color: "var(--color-danger, #ef4444)", fontSize: "0.8rem" }}>{error}</span>
        <button type="button" style={S.retryBtn} onClick={onRetry}>
          Reintentar
        </button>
      </div>
    );
  }
  if (docs.length === 0) {
    return <div style={S.center}>Sin documentos cargados</div>;
  }

  return (
    <table style={S.table}>
      <thead>
        <tr>
          <th style={S.th}>Tipo</th>
          <th style={S.th}>Archivo</th>
          <th style={S.th}>Ver.</th>
          <th style={S.th}>Estado</th>
          <th style={S.th}>Vencimiento</th>
          <th style={S.th}>Acciones</th>
        </tr>
      </thead>
      <tbody>
        {docs.map((doc) => (
          <tr key={doc.id} style={doc.activo ? undefined : { opacity: 0.55 }}>
            <td style={S.td}>{doc.tipoNombre}</td>
            <td
              style={{
                ...S.td,
                maxWidth: "160px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: "0.74rem",
                color: "var(--text-secondary)",
              }}
              title={doc.nombreOriginal}
            >
              {doc.nombreOriginal}
            </td>
            <td style={{ ...S.td, fontSize: "0.74rem" }}>v{doc.version}</td>
            <td style={S.td}>
              <span style={{ ...S.badge, ...(ESTADO_STYLE[doc.estado] ?? {}) }}>
                {ESTADO_LABEL[doc.estado] ?? doc.estado}
              </span>
            </td>
            <td style={{ ...S.td, fontSize: "0.74rem", color: "var(--text-secondary)" }}>
              {fmt(doc.fechaVencimiento)}
            </td>
            <td style={S.td}>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  type="button"
                  style={S.actionBtn}
                  disabled={viewingId === doc.id}
                  onClick={() => onView(doc)}
                  title="Ver documento"
                >
                  {viewingId === doc.id ? (
                    <Loader2 size={13} />
                  ) : (
                    <Eye size={13} />
                  )}
                </button>
                {doc.activo && (
                  <button
                    type="button"
                    style={{ ...S.actionBtn, color: "var(--color-danger, #ef4444)" }}
                    disabled={deactivatingId === doc.id}
                    onClick={() => onDeactivate(doc)}
                    title="Desactivar documento"
                  >
                    {deactivatingId === doc.id ? (
                      <Loader2 size={13} />
                    ) : (
                      <XCircle size={13} />
                    )}
                  </button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── ChecklistView ─────────────────────────────────────────────────────────────

function ChecklistView({
  checklist,
  loading,
  error,
  onRetry,
}: {
  checklist: VinculacionChecklistApi | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (loading) return <div style={S.center}>Cargando checklist...</div>;
  if (error) {
    return (
      <div style={S.center}>
        <span style={{ color: "var(--color-danger, #ef4444)", fontSize: "0.8rem" }}>{error}</span>
        <button type="button" style={S.retryBtn} onClick={onRetry}>
          Reintentar
        </button>
      </div>
    );
  }
  if (!checklist) return <div style={S.center}>Sin datos de checklist</div>;

  const { cumplimiento_porcentaje, total_requisitos, cargados, faltantes, vencidos, requisitos } =
    checklist;

  return (
    <div>
      <div style={S.checklistSummary}>
        <span>
          <strong>{Math.round(cumplimiento_porcentaje)}%</strong> cumplimiento
        </span>
        <span>
          {cargados}/{total_requisitos} cargados
        </span>
        {faltantes > 0 && (
          <span style={{ color: "#dc2626" }}>{faltantes} faltantes</span>
        )}
        {vencidos > 0 && (
          <span style={{ color: "#d97706" }}>{vencidos} vencidos</span>
        )}
      </div>

      <table style={S.table}>
        <thead>
          <tr>
            <th style={S.th}>Requisito</th>
            <th style={S.th}>Tipo documental</th>
            <th style={S.th}>Estado</th>
            <th style={S.th}>Vencimiento</th>
          </tr>
        </thead>
        <tbody>
          {requisitos.map((req) => (
            <tr key={req.requisito_id}>
              <td style={S.td}>
                {req.nombre_requisito}
                {req.obligatorio && (
                  <span style={{ color: "#dc2626", marginLeft: "4px" }} title="Obligatorio">
                    *
                  </span>
                )}
              </td>
              <td style={{ ...S.td, fontSize: "0.74rem", color: "var(--text-secondary)" }}>
                {req.tipo_documento_nombre ?? "—"}
              </td>
              <td style={S.td}>
                <span style={{ ...S.badge, ...(CHECKLIST_STYLE[req.estado] ?? {}) }}>
                  {req.estado}
                </span>
              </td>
              <td style={{ ...S.td, fontSize: "0.74rem", color: "var(--text-secondary)" }}>
                {fmt(req.fecha_vencimiento)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
