import { useEffect, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
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
import { fmtDateLoose, fmtNum } from "../../lib/payloadHelpers";

// Empresa/contrato fijos hasta que exista un selector de empresa/contrato (fase futura).
const TENANT_PARAMS = { empresa_id: 1, contrato_id: 3 };

type FetchStatus = "loading" | "ready" | "error";

export interface PersonaFilterChip {
  id: number;
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

function personaNombreCompleto(p: RepositorioDocumento["persona"]): string {
  if (!p) return "—";
  const partes = [p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido].filter(Boolean);
  return partes.length > 0 ? partes.join(" ") : "—";
}

// ── Datos ────────────────────────────────────────────────────────────────────
function useRepositorioDocumentosData(filtros: RepositorioFiltros) {
  const [listState, setListState] = useState<{ status: FetchStatus; items: RepositorioDocumento[]; total: number }>({
    status: "loading", items: [], total: 0,
  });
  const [indicadoresState, setIndicadoresState] = useState<{ status: FetchStatus; data: RepositorioDocumentosIndicadoresResult | null }>({
    status: "loading", data: null,
  });

  const key = JSON.stringify(filtros);

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

function useAlertasDocumentales(personaId?: number, contratoId?: string) {
  const [state, setState] = useState<{ status: FetchStatus; items: AlertaDocumentalItem[]; total: number }>({
    status: "loading", items: [], total: 0,
  });

  const key = JSON.stringify({ personaId, contratoId });

  useEffect(() => {
    let active = true;
    setState(prev => ({ ...prev, status: "loading" }));
    alertasApi.listDocumentales({
      ...TENANT_PARAMS,
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

// ── Tab Documentos ───────────────────────────────────────────────────────────
function DocumentosTab({
  personaFilter, onClearPersonaFilter,
}: { personaFilter: PersonaFilterChip | null; onClearPersonaFilter: () => void }) {
  const [search, setSearch] = useState("");
  const [contratoId, setContratoId] = useState("");
  const [tipoDocumentoId, setTipoDocumentoId] = useState("");
  const [estado, setEstado] = useState<EstadoDocumental | "">("");

  const filtros: RepositorioFiltros = {
    ...TENANT_PARAMS,
    persona_id: personaFilter ? personaFilter.id : undefined,
    contrato_id: !personaFilter && contratoId ? contratoId : undefined,
    tipo_documento_id: tipoDocumentoId || undefined,
    estado_documental: estado || undefined,
    search: !personaFilter && search ? search : undefined,
  };

  const { listState, indicadoresState } = useRepositorioDocumentosData(filtros);
  const faltantes = useAlertasDocumentales(personaFilter?.id, contratoId);
  const faltantesTotal = faltantes.items.filter(a => a.tipo_alerta === "DOCUMENTO_FALTANTE").length;

  const tiposDisponibles = indicadoresState.data?.documentos_por_tipo ?? [];

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
            placeholder="Contrato (ID)"
            value={contratoId}
            onChange={e => setContratoId(e.target.value.replace(/[^0-9]/g, ""))}
          />
        )}
        <select
          className="px-2.5 py-1.5 rounded-xl border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-accent/30"
          value={tipoDocumentoId}
          onChange={e => setTipoDocumentoId(e.target.value)}
        >
          <option value="">Todos los tipos</option>
          {tiposDisponibles.map(t => (
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
                  {["Persona", "Documento", "Tipo", "Fecha carga", "Fecha vencimiento", "Estado"].map(h => (
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
                    <td className="px-4 py-2.5">
                      <span className={`text-[11px] px-2 py-0.5 rounded border ${estadoDocumentalBadgeClass(doc.estado_documental)}`} style={{ fontWeight: 500 }}>
                        {ESTADOS.find(e => e.value === doc.estado_documental)?.label ?? doc.estado_documental}
                      </span>
                    </td>
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

// ── Tab Alertas ──────────────────────────────────────────────────────────────
function AlertasTab({ personaFilter }: { personaFilter: PersonaFilterChip | null }) {
  const alertas = useAlertasDocumentales(personaFilter?.id);

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
export function DocumentosModule({ initialPersonaFilter = null }: { initialPersonaFilter?: PersonaFilterChip | null }) {
  const [tab, setTab] = useState<"documentos" | "alertas">("documentos");
  const [personaFilter, setPersonaFilter] = useState<PersonaFilterChip | null>(initialPersonaFilter);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: "1.1rem" }}>Centro de Documentos</h1>
          <p className="text-muted-foreground text-xs mt-0.5">Documentos del expediente y alertas documentales</p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-card rounded-2xl" style={{ boxShadow: "var(--shadow-card)" }}>
          {([["documentos", "Documentos"], ["alertas", "Alertas"]] as const).map(([id, label]) => (
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

      {tab === "documentos" && <DocumentosTab personaFilter={personaFilter} onClearPersonaFilter={() => setPersonaFilter(null)} />}
      {tab === "alertas" && <AlertasTab personaFilter={personaFilter} />}
    </div>
  );
}
