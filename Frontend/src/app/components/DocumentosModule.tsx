import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Search, X, Upload, Download, XCircle } from "lucide-react";
import {
  repositorioApi,
  type RepositorioDocumento,
  type RepositorioDocumentosIndicadoresResult,
  type RepositorioFiltros,
  type EstadoDocumental,
} from "../../services/repositorioApi";
import {
  alertasApi,
  type AlertaDocumentalItem,
  type SeveridadAlertaDocumental,
} from "../../services/alertasApi";
import {
  documentosApi,
  type ChecklistItem,
  type VinculacionChecklist,
} from "../../services/documentosApi";
import { personasApi, type Persona } from "../../services/personasApi";
import { vinculacionesApi, type Vinculacion } from "../../services/vinculacionesApi";
import { fmtDateLoose, fmtNum } from "../../lib/payloadHelpers";

type FetchStatus = "loading" | "ready" | "error";

export interface PersonaFilterChip {
  id: number;
  nombre: string;
}

export interface TipoDocumentoOption {
  id: number | string;
  nombre: string;
}

const ESTADOS: { value: EstadoDocumental | ""; label: string }[] = [
  { value: "", label: "Todos los estados" },
  { value: "vigente", label: "Vigente" },
  { value: "vencido", label: "Vencido" },
  { value: "reemplazado", label: "Reemplazado" },
  { value: "sin_vencimiento", label: "Sin vencimiento" },
];

function estadoDocumentalBadgeClass(estado: EstadoDocumental): string {
  if (estado === "vigente") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (estado === "vencido") return "bg-red-50 text-red-700 border-red-200";
  if (estado === "reemplazado") return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-secondary text-muted-foreground border-border"; // sin_vencimiento
}

function severidadBadgeClass(severidad: SeveridadAlertaDocumental): string {
  if (severidad === "CRITICA") return "bg-red-50 text-red-700 border-red-200";
  if (severidad === "ALTA") return "bg-amber-50 text-amber-700 border-amber-200";
  if (severidad === "MEDIA") return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-secondary text-muted-foreground border-border"; // BAJA
}

function checklistBadgeClass(estado: ChecklistItem["estado"]): string {
  if (estado === "CARGADO") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (estado === "VENCIDO") return "bg-red-50 text-red-700 border-red-200";
  return "bg-amber-50 text-amber-700 border-amber-200"; // FALTANTE
}

function EstadoChecklistBadge({ estado }: { estado: ChecklistItem["estado"] }) {
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded border ${checklistBadgeClass(estado)}`} style={{ fontWeight: 500 }}>
      {estado}
    </span>
  );
}

function personaNombreCompleto(p: RepositorioDocumento["persona"]): string {
  if (!p) return "—";
  const partes = [p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido].filter(Boolean);
  return partes.length > 0 ? partes.join(" ") : "—";
}

function personaDisplayName(p: Persona): string {
  const partes = [p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido].filter(Boolean);
  return partes.length > 0 ? partes.join(" ") : `Persona #${p.id}`;
}

// ── Datos ────────────────────────────────────────────────────────────────────
function useRepositorioDocumentosData(filtros: RepositorioFiltros, refreshTick: number) {
  const [listState, setListState] = useState<{ status: FetchStatus; items: RepositorioDocumento[]; total: number }>({
    status: "loading", items: [], total: 0,
  });
  const [indicadoresState, setIndicadoresState] = useState<{ status: FetchStatus; data: RepositorioDocumentosIndicadoresResult | null }>({
    status: "loading", data: null,
  });

  const key = JSON.stringify(filtros) + `:${refreshTick}`;

  useEffect(() => {
    let active = true;
    setListState(prev => ({ ...prev, status: "loading" }));
    repositorioApi.listDocumentos({ ...filtros, limit: 100 })
      .then(res => {
        if (!active) return;
        setListState({ status: "ready", items: res.items ?? [], total: res.pagination?.total ?? 0 });
      })
      .catch(error => {
        if (!active) return;
        console.warn("[documentos] GET /repositorio/documentos falló:", error);
        setListState({ status: "error", items: [], total: 0 });
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    let active = true;
    setIndicadoresState(prev => ({ ...prev, status: "loading" }));
    repositorioApi.getIndicadores(filtros)
      .then(data => {
        if (!active) return;
        setIndicadoresState({ status: "ready", data });
      })
      .catch(error => {
        if (!active) return;
        console.warn("[documentos] GET /repositorio/documentos/indicadores falló:", error);
        setIndicadoresState({ status: "error", data: null });
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { listState, indicadoresState };
}

function useAlertasDocumentales(empresaId?: number, personaId?: number, contratoId?: string | number) {
  const [state, setState] = useState<{ status: FetchStatus; items: AlertaDocumentalItem[]; total: number }>({
    status: "loading", items: [], total: 0,
  });

  const key = JSON.stringify({ empresaId, personaId, contratoId });

  useEffect(() => {
    let active = true;
    setState(prev => ({ ...prev, status: "loading" }));
    alertasApi.listDocumentales({
      empresa_id: empresaId,
      persona_id: personaId,
      contrato_id: contratoId || undefined,
      estado: "ACTIVA",
      limit: 100,
    })
      .then(res => {
        if (!active) return;
        setState({ status: "ready", items: res.items ?? [], total: res.pagination?.total ?? 0 });
      })
      .catch(error => {
        if (!active) return;
        console.warn("[documentos] GET /alertas/documentales falló:", error);
        setState({ status: "error", items: [], total: 0 });
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}

function useChecklist(vinculacionId: number | null) {
  const [state, setState] = useState<{ status: FetchStatus; data: VinculacionChecklist | null }>({
    status: "loading", data: null,
  });

  useEffect(() => {
    if (vinculacionId === null) {
      setState({ status: "loading", data: null });
      return;
    }

    let active = true;
    setState({ status: "loading", data: null });
    documentosApi.getChecklist(vinculacionId)
      .then(data => { if (active) setState({ status: "ready", data }); })
      .catch(error => {
        if (!active) return;
        console.warn("[documentos] GET /documentos/vinculacion/:id/checklist falló:", error);
        setState({ status: "error", data: null });
      });
    return () => { active = false; };
  }, [vinculacionId]);

  return state;
}

// ── UI compartida ────────────────────────────────────────────────────────────
function Kpi({ label, value, status, accent }: { label: string; value: string; status: FetchStatus; accent?: string }) {
  return (
    <div className="bg-card rounded-2xl p-5 flex flex-col gap-2" style={{ boxShadow: "var(--shadow-card)" }}>
      <p className="text-xs text-muted-foreground" style={{ fontWeight: 500 }}>{label}</p>
      {status === "loading" ? (
        <div className="h-7 w-16 rounded-md bg-muted animate-pulse" />
      ) : (
        <p style={{ fontWeight: 700, fontSize: "1.5rem", lineHeight: 1, letterSpacing: "-0.03em", color: accent }}>{value}</p>
      )}
      {status === "error" && <span className="text-[10.5px]" style={{ color: "#f59e0b", fontWeight: 500 }}>● No disponible</span>}
    </div>
  );
}

function SectionError({ label }: { label: string }) {
  return <p className="text-[11.5px] text-amber-600 py-2">No se pudo cargar {label}.</p>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-2.5 text-[12px] text-muted-foreground whitespace-nowrap">{children ?? "—"}</td>;
}

// Buscador de persona reutilizado por el formulario de carga y el tab de checklist
// cuando no hay un personaFilter activo. No es un endpoint nuevo: reusa GET /personas.
function PersonaPicker({ onSelect }: { onSelect: (persona: { id: number; nombre: string }) => void }) {
  const [search, setSearch] = useState("");
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [status, setStatus] = useState<FetchStatus>("ready");

  useEffect(() => {
    if (!search) { setPersonas([]); return; }
    const handle = setTimeout(() => {
      setStatus("loading");
      personasApi.list({ search, limit: 8 })
        .then(res => { setPersonas(res.items); setStatus("ready"); })
        .catch(error => {
          console.warn("[documentos] GET /personas (buscador) falló:", error);
          setStatus("error");
        });
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-border bg-background text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30"
          placeholder="Buscar persona por nombre o documento…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoFocus
        />
      </div>
      {status === "loading" && <p className="text-[11px] text-muted-foreground">Buscando…</p>}
      {status === "error" && <p className="text-[11px] text-amber-600">No se pudo buscar personas.</p>}
      {personas.length > 0 && (
        <div className="divide-y divide-border max-h-40 overflow-y-auto rounded-xl border border-border">
          {personas.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect({ id: p.id, nombre: personaDisplayName(p) })}
              className="w-full text-left px-3 py-2 hover:bg-secondary text-[12px] transition-colors"
            >
              {personaDisplayName(p)} <span className="text-muted-foreground text-[10px]">CC {p.numero_documento}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Formulario de carga — compartido con el Expediente 360 de Operarios ────
// (Parte D: "usar los mismos servicios, no duplicar lógica").
export interface DocumentUploadFormProps {
  personaId: number;
  personaNombre: string;
  vinculaciones: Vinculacion[];
  vinculacionesStatus: FetchStatus;
  tiposDisponibles: TipoDocumentoOption[];
  defaultTipoDocumentoId?: string;
  defaultScope?: "persona" | "vinculacion";
  defaultVinculacionId?: number;
  onUploaded: () => void;
  onCancel: () => void;
}

export function DocumentUploadForm({
  personaId, personaNombre, vinculaciones, vinculacionesStatus, tiposDisponibles,
  defaultTipoDocumentoId, defaultScope, defaultVinculacionId, onUploaded, onCancel,
}: DocumentUploadFormProps) {
  const [scope, setScope] = useState<"persona" | "vinculacion">(defaultScope ?? "persona");
  const [vinculacionId, setVinculacionId] = useState<string>(defaultVinculacionId ? String(defaultVinculacionId) : "");
  const [tipoDocumentoId, setTipoDocumentoId] = useState(defaultTipoDocumentoId ?? "");
  const [tipoDocumentoManual, setTipoDocumentoManual] = useState("");
  const [fechaExpedicion, setFechaExpedicion] = useState("");
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const effectiveTipoId = tipoDocumentoId || tipoDocumentoManual;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file || !effectiveTipoId) return;

    setStatus("loading");
    setErrorMessage(null);

    try {
      const input = {
        tipo_documento_id: effectiveTipoId,
        fecha_expedicion: fechaExpedicion || null,
        fecha_vencimiento: fechaVencimiento || null,
      };

      if (scope === "persona") {
        await documentosApi.uploadPersonaDocument(personaId, file, input);
      } else {
        if (!vinculacionId) {
          throw new Error("Selecciona una vinculación para este documento.");
        }
        await documentosApi.uploadVinculacionDocument(vinculacionId, file, input);
      }

      setStatus("success");
      onUploaded();
    } catch (error) {
      console.warn("[documentos] upload falló:", error);
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "No se pudo cargar el documento.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-card rounded-2xl p-4 space-y-3 border border-border" style={{ boxShadow: "var(--shadow-card)" }}>
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>Subir documento — {personaNombre}</p>
        <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground">
          <X size={14} />
        </button>
      </div>

      <div className="flex items-center gap-1 p-1 bg-secondary rounded-xl w-fit">
        {(["persona", "vinculacion"] as const).map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setScope(s)}
            className={`px-3 py-1 rounded-lg text-[12px] transition-colors ${scope === s ? "bg-card text-foreground" : "text-muted-foreground"}`}
            style={{ fontWeight: scope === s ? 600 : 400 }}
          >
            {s === "persona" ? "Documento de persona" : "Documento de vinculación"}
          </button>
        ))}
      </div>

      {scope === "vinculacion" && (
        <div>
          {vinculacionesStatus === "loading" && <p className="text-[11px] text-muted-foreground">Cargando vinculaciones…</p>}
          {vinculacionesStatus === "error" && <p className="text-[11px] text-amber-600">No se pudieron cargar las vinculaciones de esta persona.</p>}
          {vinculacionesStatus === "ready" && (
            vinculaciones.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">Esta persona no tiene vinculaciones registradas.</p>
            ) : (
              <select
                className="w-full px-2.5 py-1.5 rounded-xl border border-border bg-background text-xs"
                value={vinculacionId}
                onChange={e => setVinculacionId(e.target.value)}
              >
                <option value="">Selecciona una vinculación…</option>
                {vinculaciones.map(v => (
                  <option key={v.id} value={v.id}>
                    Vinculación #{v.id} — contrato {v.contrato_id} ({v.estado_vinculacion})
                  </option>
                ))}
              </select>
            )
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <select
          className="px-2.5 py-1.5 rounded-xl border border-border bg-background text-xs"
          value={tipoDocumentoId}
          onChange={e => setTipoDocumentoId(e.target.value)}
        >
          <option value="">Tipo de documento…</option>
          {tiposDisponibles.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
        <input
          className="px-2.5 py-1.5 rounded-xl border border-border bg-background text-xs placeholder:text-muted-foreground"
          placeholder="…o ID de tipo manual"
          value={tipoDocumentoManual}
          onChange={e => setTipoDocumentoManual(e.target.value.replace(/[^0-9]/g, ""))}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-muted-foreground flex flex-col gap-1">
          Fecha expedición (opcional)
          <input type="date" className="px-2.5 py-1.5 rounded-xl border border-border bg-background text-xs" value={fechaExpedicion} onChange={e => setFechaExpedicion(e.target.value)} />
        </label>
        <label className="text-[11px] text-muted-foreground flex flex-col gap-1">
          Fecha vencimiento (opcional)
          <input type="date" className="px-2.5 py-1.5 rounded-xl border border-border bg-background text-xs" value={fechaVencimiento} onChange={e => setFechaVencimiento(e.target.value)} />
        </label>
      </div>

      <input
        type="file"
        onChange={e => setFile(e.target.files?.[0] ?? null)}
        className="text-[12px] text-muted-foreground"
      />

      {status === "error" && errorMessage && <p className="text-[11.5px] text-red-600">{errorMessage}</p>}
      {status === "success" && <p className="text-[11.5px] text-emerald-600">Documento cargado correctamente.</p>}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-xl border border-border text-xs text-muted-foreground hover:bg-secondary transition-colors">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={status === "loading" || !file || !effectiveTipoId}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-foreground text-card text-xs hover:opacity-90 transition-all disabled:opacity-50"
        >
          {status === "loading" ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          Subir
        </button>
      </div>
    </form>
  );
}

// Lanza el flujo de carga: si no hay una persona en contexto, primero pide
// buscarla y seleccionarla (reusa PersonaPicker); luego resuelve sus
// vinculaciones (GET /vinculaciones?persona_id=) y muestra el formulario.
function UploadLauncher({
  tiposDisponibles, onUploaded, presetPersona,
}: { tiposDisponibles: TipoDocumentoOption[]; onUploaded: () => void; presetPersona: PersonaFilterChip | null }) {
  const [open, setOpen] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState<{ id: number; nombre: string } | null>(null);
  const [vinculaciones, setVinculaciones] = useState<Vinculacion[]>([]);
  const [vinculacionesStatus, setVinculacionesStatus] = useState<FetchStatus>("loading");

  useEffect(() => {
    if (!selectedPersona) return;
    let active = true;
    setVinculacionesStatus("loading");
    vinculacionesApi.list({ persona_id: selectedPersona.id, limit: 50 })
      .then(res => { if (active) { setVinculaciones(res.items); setVinculacionesStatus("ready"); } })
      .catch(error => {
        console.warn("[documentos] GET /vinculaciones (para carga) falló:", error);
        if (active) setVinculacionesStatus("error");
      });
    return () => { active = false; };
  }, [selectedPersona]);

  function reset() {
    setOpen(false);
    setSelectedPersona(null);
    setVinculaciones([]);
  }

  if (!open) {
    return (
      <button
        onClick={() => {
          setOpen(true);
          if (presetPersona) setSelectedPersona({ id: presetPersona.id, nombre: presetPersona.nombre });
        }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-foreground text-card text-xs hover:opacity-90 transition-all"
        style={{ fontWeight: 500, boxShadow: "var(--shadow-card)" }}
      >
        <Upload size={13} /> Subir documento
      </button>
    );
  }

  if (!selectedPersona) {
    return (
      <div className="bg-card rounded-2xl p-4 border border-border space-y-2 max-w-md" style={{ boxShadow: "var(--shadow-card)" }}>
        <div className="flex items-center justify-between">
          <p className="text-[12.5px] text-foreground" style={{ fontWeight: 600 }}>¿Para quién es el documento?</p>
          <button onClick={reset} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
        </div>
        <PersonaPicker onSelect={setSelectedPersona} />
      </div>
    );
  }

  return (
    <DocumentUploadForm
      personaId={selectedPersona.id}
      personaNombre={selectedPersona.nombre}
      vinculaciones={vinculaciones}
      vinculacionesStatus={vinculacionesStatus}
      tiposDisponibles={tiposDisponibles}
      onUploaded={() => { reset(); onUploaded(); }}
      onCancel={reset}
    />
  );
}

// Acciones por fila de la tabla de documentos: descargar (URL firmada real) y
// desactivar (no elimina físicamente). "generado" no tiene endpoint de gestión
// (ni download-url ni deactivate cubren esos documentos), así que solo se deja
// el intento de descarga ahí y se deshabilita desactivar.
function DocumentRowActions({ doc, onChanged }: { doc: RepositorioDocumento; onChanged: () => void }) {
  const [busy, setBusy] = useState<"download" | "deactivate" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scope: "persona" | "vinculacion" | null =
    doc.origen === "persona" ? "persona" : doc.origen === "vinculacion" ? "vinculacion" : null;

  async function handleDownload() {
    setBusy("download");
    setError(null);
    try {
      const info = await documentosApi.getDownloadUrl(doc.documento_id, scope ?? undefined);
      window.open(info.download_url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.warn("[documentos] GET /documentos/:id/download-url falló:", err);
      setError("No se pudo generar el enlace de descarga.");
    } finally {
      setBusy(null);
    }
  }

  async function handleDeactivate() {
    if (!scope) return;
    if (!window.confirm("¿Desea desactivar este documento?")) return;

    setBusy("deactivate");
    setError(null);
    try {
      await documentosApi.deactivateDocument(doc.documento_id, scope);
      onChanged();
    } catch (err) {
      console.warn("[documentos] deactivate falló:", err);
      setError("No se pudo desactivar el documento.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <td className="px-4 py-2.5">
      <div className="flex items-center gap-2.5">
        <button
          onClick={handleDownload}
          disabled={busy !== null}
          title="Descargar"
          className="text-muted-foreground hover:text-accent disabled:opacity-40 transition-colors"
        >
          {busy === "download" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        </button>
        <button
          onClick={handleDeactivate}
          disabled={busy !== null || !scope}
          title={scope ? "Desactivar" : "Documento generado por el sistema: no se puede desactivar aquí"}
          className="text-muted-foreground hover:text-red-600 disabled:opacity-30 transition-colors"
        >
          {busy === "deactivate" ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
        </button>
      </div>
      {error && <p className="text-[10px] text-red-600 mt-1">{error}</p>}
    </td>
  );
}

// ── Tab Documentos ───────────────────────────────────────────────────────────
function DocumentosTab({
  empresaId, contratoId, personaFilter, onClearPersonaFilter,
}: { empresaId?: number; contratoId?: number; personaFilter: PersonaFilterChip | null; onClearPersonaFilter: () => void }) {
  const [search, setSearch] = useState("");
  // Permite acotar a otro contrato puntual sin perder el tenant global (vacío = usar el seleccionado en el TopNav).
  const [contratoIdInput, setContratoIdInput] = useState("");
  const [tipoDocumentoId, setTipoDocumentoId] = useState("");
  const [estado, setEstado] = useState<EstadoDocumental | "">("");
  const [refreshTick, setRefreshTick] = useState(0);
  const [showUpload, setShowUpload] = useState(false);

  const effectiveContratoId = contratoIdInput || contratoId;

  const filtros: RepositorioFiltros = {
    empresa_id: empresaId,
    persona_id: personaFilter ? personaFilter.id : undefined,
    contrato_id: !personaFilter ? effectiveContratoId : undefined,
    tipo_documento_id: tipoDocumentoId || undefined,
    estado_documental: estado || undefined,
    search: !personaFilter && search ? search : undefined,
  };

  const { listState, indicadoresState } = useRepositorioDocumentosData(filtros, refreshTick);
  const faltantes = useAlertasDocumentales(empresaId, personaFilter?.id, effectiveContratoId);
  const faltantesTotal = faltantes.items.filter(a => a.tipo_alerta === "DOCUMENTO_FALTANTE").length;

  const tiposDisponibles: TipoDocumentoOption[] = (indicadoresState.data?.documentos_por_tipo ?? [])
    .filter((t): t is { tipo_documento_id: number; nombre_tipo_documento: string | null; total: number } => t.tipo_documento_id !== null)
    .map(t => ({ id: t.tipo_documento_id, nombre: t.nombre_tipo_documento ?? `Tipo #${t.tipo_documento_id}` }));

  function handleChanged() {
    setRefreshTick(prev => prev + 1);
  }

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label="Total documentos" status={indicadoresState.status} value={fmtNum(indicadoresState.data?.total_documentos ?? null) ?? "—"} />
        <Kpi label="Vigentes" status={indicadoresState.status} value={fmtNum(indicadoresState.data?.vigentes ?? null) ?? "—"} accent="#10b981" />
        <Kpi label="Vencidos" status={indicadoresState.status} value={fmtNum(indicadoresState.data?.vencidos ?? null) ?? "—"} accent="#ef4444" />
        <Kpi label="Próximos a vencer" status={indicadoresState.status} value={fmtNum(indicadoresState.data?.por_vencer_30_dias ?? null) ?? "—"} accent="#f59e0b" />
        <Kpi label="Faltantes" status={faltantes.status} value={faltantes.status === "ready" ? String(faltantesTotal) : "—"} accent="#ef4444" />
      </div>

      {/* Carga de documentos */}
      {showUpload ? (
        <UploadLauncher
          tiposDisponibles={tiposDisponibles}
          presetPersona={personaFilter}
          onUploaded={() => { setShowUpload(false); handleChanged(); }}
        />
      ) : (
        <div>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-foreground text-card text-xs hover:opacity-90 transition-all"
            style={{ fontWeight: 500, boxShadow: "var(--shadow-card)" }}
          >
            <Upload size={13} /> Subir documento
          </button>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-card rounded-2xl p-4 flex flex-wrap items-center gap-2" style={{ boxShadow: "var(--shadow-card)" }}>
        {personaFilter ? (
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent/10 text-accent text-xs" style={{ fontWeight: 500 }}>
            Persona: {personaFilter.nombre}
            <button onClick={onClearPersonaFilter} className="hover:opacity-70">
              <X size={12} />
            </button>
          </span>
        ) : (
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30"
              placeholder="Buscar persona (nombre o documento)…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        )}
        {!personaFilter && (
          <input
            className="w-32 px-2.5 py-1.5 rounded-xl border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-accent/30"
            placeholder={contratoId ? `Contrato (${contratoId})` : "Contrato (ID)"}
            value={contratoIdInput}
            onChange={e => setContratoIdInput(e.target.value.replace(/[^0-9]/g, ""))}
          />
        )}
        <select
          className="px-2.5 py-1.5 rounded-xl border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-accent/30"
          value={tipoDocumentoId}
          onChange={e => setTipoDocumentoId(e.target.value)}
        >
          <option value="">Todos los tipos</option>
          {(indicadoresState.data?.documentos_por_tipo ?? []).map(t => (
            <option key={`${t.tipo_documento_id}-${t.nombre_tipo_documento}`} value={t.tipo_documento_id ?? ""}>
              {t.nombre_tipo_documento ?? "Sin tipo"} ({t.total})
            </option>
          ))}
        </select>
        <select
          className="px-2.5 py-1.5 rounded-xl border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-accent/30"
          value={estado}
          onChange={e => setEstado(e.target.value as EstadoDocumental | "")}
        >
          {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
        </select>
      </div>

      {/* Tabla */}
      {listState.status === "loading" && (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 size={16} className="animate-spin" /> <span className="text-sm">Cargando documentos…</span>
        </div>
      )}
      {listState.status === "error" && <SectionError label="el listado de documentos" />}
      {listState.status === "ready" && (
        listState.items.length === 0 ? (
          <div className="bg-card rounded-lg border border-border py-10 text-center text-[12px] text-muted-foreground">
            No hay documentos para los filtros seleccionados
          </div>
        ) : (
          <div className="bg-card rounded-lg border border-border overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40">
                <tr className="border-b border-border">
                  {["Persona", "Documento", "Tipo", "Fecha carga", "Fecha vencimiento", "Versión", "Estado", "Acciones"].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wide whitespace-nowrap" style={{ fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listState.items.map((doc, i) => (
                  <tr key={`${doc.origen}-${doc.documento_id}-${i}`} className="border-b border-border last:border-b-0 hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-2.5">
                      <p className="text-[12px] text-foreground" style={{ fontWeight: 500 }}>{personaNombreCompleto(doc.persona)}</p>
                      {doc.persona?.numero_documento && <p className="text-[10px] text-muted-foreground">CC {doc.persona.numero_documento}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-foreground whitespace-nowrap">{doc.nombre_archivo ?? doc.nombre_tipo_documento ?? "—"}</td>
                    <td className="px-4 py-2.5 text-[12px] text-muted-foreground whitespace-nowrap">{doc.nombre_tipo_documento ?? "—"}</td>
                    <td className="px-4 py-2.5 text-[12px] text-muted-foreground whitespace-nowrap">{fmtDateLoose(doc.fecha_carga) ?? "—"}</td>
                    <td className="px-4 py-2.5 text-[12px] text-muted-foreground whitespace-nowrap">{fmtDateLoose(doc.fecha_vencimiento) ?? "—"}</td>
                    <td className="px-4 py-2.5 text-[12px] text-muted-foreground text-center">{doc.version ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[11px] px-2 py-0.5 rounded border ${estadoDocumentalBadgeClass(doc.estado_documental)}`} style={{ fontWeight: 500 }}>
                        {ESTADOS.find(e => e.value === doc.estado_documental)?.label ?? doc.estado_documental}
                      </span>
                    </td>
                    <DocumentRowActions doc={doc} onChanged={handleChanged} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

// ── Tab Checklist ────────────────────────────────────────────────────────────
// Consume GET /documentos/vinculacion/:vinculacion_id/checklist tal cual: no se
// inventan cálculos de cumplimiento, los porcentajes y conteos vienen del backend.
function ChecklistTab({ personaFilter }: { personaFilter: PersonaFilterChip | null }) {
  const [selectedPersona, setSelectedPersona] = useState<{ id: number; nombre: string } | null>(
    personaFilter ? { id: personaFilter.id, nombre: personaFilter.nombre } : null
  );
  const [vinculaciones, setVinculaciones] = useState<Vinculacion[]>([]);
  const [vinculacionesStatus, setVinculacionesStatus] = useState<FetchStatus>("loading");
  const [selectedVinculacionId, setSelectedVinculacionId] = useState<number | null>(null);

  useEffect(() => {
    if (!selectedPersona) return;
    let active = true;
    setVinculacionesStatus("loading");
    setSelectedVinculacionId(null);
    vinculacionesApi.list({ persona_id: selectedPersona.id, limit: 50 })
      .then(res => {
        if (!active) return;
        setVinculaciones(res.items);
        setVinculacionesStatus("ready");
        if (res.items.length === 1) setSelectedVinculacionId(res.items[0].id);
      })
      .catch(error => {
        console.warn("[documentos] GET /vinculaciones (checklist) falló:", error);
        if (active) setVinculacionesStatus("error");
      });
    return () => { active = false; };
  }, [selectedPersona]);

  const checklist = useChecklist(selectedVinculacionId);

  function reset() {
    setSelectedPersona(null);
    setVinculaciones([]);
    setSelectedVinculacionId(null);
  }

  if (!selectedPersona) {
    return (
      <div className="bg-card rounded-2xl p-4 border border-border space-y-2 max-w-md" style={{ boxShadow: "var(--shadow-card)" }}>
        <p className="text-[12.5px] text-foreground" style={{ fontWeight: 600 }}>Busca una persona para ver su checklist documental</p>
        <PersonaPicker onSelect={setSelectedPersona} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent/10 text-accent text-xs" style={{ fontWeight: 500 }}>
          {selectedPersona.nombre}
          <button onClick={reset} className="hover:opacity-70"><X size={12} /></button>
        </span>
        {vinculacionesStatus === "ready" && vinculaciones.length > 1 && (
          <select
            className="px-2.5 py-1.5 rounded-xl border border-border bg-background text-xs"
            value={selectedVinculacionId ?? ""}
            onChange={e => setSelectedVinculacionId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Selecciona vinculación…</option>
            {vinculaciones.map(v => (
              <option key={v.id} value={v.id}>Vinculación #{v.id} — contrato {v.contrato_id} ({v.estado_vinculacion})</option>
            ))}
          </select>
        )}
      </div>

      {vinculacionesStatus === "loading" && (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 size={16} className="animate-spin" /> <span className="text-sm">Cargando vinculaciones…</span>
        </div>
      )}
      {vinculacionesStatus === "error" && <SectionError label="las vinculaciones de esta persona" />}
      {vinculacionesStatus === "ready" && vinculaciones.length === 0 && (
        <div className="bg-card rounded-lg border border-border py-10 text-center text-[12px] text-muted-foreground">
          Esta persona no tiene vinculaciones registradas — el checklist depende de una vinculación y su contrato/cargo.
        </div>
      )}

      {selectedVinculacionId !== null && (
        <>
          {checklist.status === "loading" && (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 size={16} className="animate-spin" /> <span className="text-sm">Cargando checklist…</span>
            </div>
          )}
          {checklist.status === "error" && <SectionError label="el checklist documental" />}
          {checklist.status === "ready" && checklist.data && (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Kpi label="Requeridos" status="ready" value={fmtNum(checklist.data.total_requisitos) ?? "—"} />
                <Kpi label="Cargados" status="ready" value={fmtNum(checklist.data.cargados) ?? "—"} accent="#10b981" />
                <Kpi label="Faltantes" status="ready" value={fmtNum(checklist.data.faltantes) ?? "—"} accent="#ef4444" />
                <Kpi label="Vencidos" status="ready" value={fmtNum(checklist.data.vencidos) ?? "—"} accent="#f59e0b" />
              </div>

              {checklist.data.requisitos.length === 0 ? (
                <div className="bg-card rounded-lg border border-border py-10 text-center text-[12px] text-muted-foreground">
                  Este contrato/cargo no tiene requisitos documentales configurados
                </div>
              ) : (
                <div className="bg-card rounded-lg border border-border overflow-hidden overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/40">
                      <tr className="border-b border-border">
                        {["Requisito", "Tipo documento", "Origen", "Vence", "Estado"].map(h => (
                          <th key={h} className="text-left px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wide whitespace-nowrap" style={{ fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {checklist.data.requisitos.map(r => (
                        <tr key={r.requisito_id} className="border-b border-border last:border-b-0 hover:bg-secondary/20 transition-colors">
                          <td className="px-4 py-2.5 text-[12px] text-foreground" style={{ fontWeight: 500 }}>
                            {r.nombre_requisito}
                            {r.obligatorio && <span className="ml-1.5 text-[9px] text-amber-600">●</span>}
                          </td>
                          <Td>{r.tipo_documento_nombre}</Td>
                          <Td>{r.origen === "GENERAL" ? "General" : "Por cargo"}</Td>
                          <Td>{fmtDateLoose(r.fecha_vencimiento)}</Td>
                          <td className="px-4 py-2.5"><EstadoChecklistBadge estado={r.estado} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Tab Versiones ────────────────────────────────────────────────────────────
// NO existe un endpoint de historial de versiones en el backend (documentos.routes.ts
// no expone nada como GET /documentos/:id/versions, y la única lista plana con id
// real -repositorio/documentos- no incluye quién cargó cada versión). Por
// instrucción explícita de la tarea ("si no existe endpoint: ocultar completamente
// la pestaña"), este tab no se renderiza — ver informe de entrega para el detalle.

// ── Tab Alertas ──────────────────────────────────────────────────────────────
function AlertasTab({ empresaId, contratoId, personaFilter }: { empresaId?: number; contratoId?: number; personaFilter: PersonaFilterChip | null }) {
  const alertas = useAlertasDocumentales(empresaId, personaFilter?.id, contratoId);

  const conteo = (sev: SeveridadAlertaDocumental) => alertas.items.filter(a => a.severidad === sev).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Críticas" status={alertas.status} value={alertas.status === "ready" ? String(conteo("CRITICA")) : "—"} accent="#ef4444" />
        <Kpi label="Altas" status={alertas.status} value={alertas.status === "ready" ? String(conteo("ALTA")) : "—"} accent="#f59e0b" />
        <Kpi label="Medias" status={alertas.status} value={alertas.status === "ready" ? String(conteo("MEDIA")) : "—"} accent="#3b82f6" />
        <Kpi label="Bajas" status={alertas.status} value={alertas.status === "ready" ? String(conteo("BAJA")) : "—"} />
      </div>

      {alertas.status === "loading" && (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 size={16} className="animate-spin" /> <span className="text-sm">Cargando alertas…</span>
        </div>
      )}
      {alertas.status === "error" && <SectionError label="las alertas documentales" />}
      {alertas.status === "ready" && (
        alertas.items.length === 0 ? (
          <div className="bg-card rounded-lg border border-border py-10 text-center text-[12px] text-muted-foreground">
            Sin alertas documentales activas
          </div>
        ) : (
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <div className="divide-y divide-border">
              {alertas.items.map(a => (
                <div key={a.id} className="px-5 py-3 flex items-start gap-3">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md border flex-shrink-0 mt-0.5 ${severidadBadgeClass(a.severidad)}`} style={{ fontWeight: 600 }}>
                    {a.severidad}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] text-foreground" style={{ fontWeight: 500 }}>{a.titulo}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {a.persona_nombre ?? "Persona no identificada"}
                      {a.tipo_documento_nombre ? ` · ${a.tipo_documento_nombre}` : ""}
                      {a.dias_restantes !== null ? ` · ${a.dias_restantes >= 0 ? `${a.dias_restantes} días restantes` : `${Math.abs(a.dias_restantes)} días de retraso`}` : ""}
                    </p>
                  </div>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">{fmtDateLoose(a.fecha_alerta) ?? "—"}</span>
                </div>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
}

// ── Root ────────────────────────────────────────────────────────────────────
export function DocumentosModule({
  empresaId, contratoId, initialPersonaFilter = null,
}: { empresaId?: number; contratoId?: number; initialPersonaFilter?: PersonaFilterChip | null }) {
  const [tab, setTab] = useState<"documentos" | "checklist" | "alertas">("documentos");
  const [personaFilter, setPersonaFilter] = useState<PersonaFilterChip | null>(initialPersonaFilter);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: "1.1rem" }}>Centro de Documentos</h1>
          <p className="text-muted-foreground text-xs mt-0.5">Gestión documental: carga, descarga, checklist y alertas</p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-card rounded-2xl" style={{ boxShadow: "var(--shadow-card)" }}>
          {([["documentos", "Documentos"], ["checklist", "Checklist"], ["alertas", "Alertas"]] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-3.5 py-1.5 rounded-xl text-[13px] transition-all ${tab === id ? "bg-foreground text-card" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
              style={{ fontWeight: tab === id ? 600 : 400 }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "documentos" && <DocumentosTab empresaId={empresaId} contratoId={contratoId} personaFilter={personaFilter} onClearPersonaFilter={() => setPersonaFilter(null)} />}
      {tab === "checklist" && <ChecklistTab personaFilter={personaFilter} />}
      {tab === "alertas" && <AlertasTab empresaId={empresaId} contratoId={contratoId} personaFilter={personaFilter} />}
    </div>
  );
}
