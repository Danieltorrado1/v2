import { useEffect, useState } from "react";
import { Loader2, Download } from "lucide-react";
import {
  repositorioApi,
  type RepositorioDocumento,
  type RepositorioDocumentosIndicadoresResult,
} from "../../services/repositorioApi";
import { personasApi } from "../../services/personasApi";
import { fmtDateLoose, fmtNum } from "../../lib/payloadHelpers";

// Empresa/contrato fijos hasta que exista un selector de empresa/contrato (fase futura).
const TENANT_PARAMS = { empresa_id: 1, contrato_id: 3 };

type FetchStatus = "loading" | "ready" | "error";

function personaNombreCompleto(p: RepositorioDocumento["persona"]): string {
  if (!p) return "—";
  const partes = [p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido].filter(Boolean);
  return partes.length > 0 ? partes.join(" ") : "—";
}

function useRepositorioOverview() {
  const [listState, setListState] = useState<{ status: FetchStatus; items: RepositorioDocumento[] }>({ status: "loading", items: [] });
  const [indicadoresState, setIndicadoresState] = useState<{ status: FetchStatus; data: RepositorioDocumentosIndicadoresResult | null }>({ status: "loading", data: null });
  const [totalPersonasState, setTotalPersonasState] = useState<{ status: FetchStatus; total: number }>({ status: "loading", total: 0 });

  useEffect(() => {
    let active = true;
    repositorioApi.listDocumentos({ ...TENANT_PARAMS, limit: 100 })
      .then(res => { if (active) setListState({ status: "ready", items: res.items ?? [] }); })
      .catch(error => {
        if (!active) return;
        console.warn("[repositorio] GET /repositorio/documentos falló:", error);
        setListState({ status: "error", items: [] });
      });

    repositorioApi.getIndicadores(TENANT_PARAMS)
      .then(data => { if (active) setIndicadoresState({ status: "ready", data }); })
      .catch(error => {
        if (!active) return;
        console.warn("[repositorio] GET /repositorio/documentos/indicadores falló:", error);
        setIndicadoresState({ status: "error", data: null });
      });

    // "Total personas" no viene en los indicadores del repositorio (ese campo
    // cuenta documentos por origen, no personas distintas) — se reutiliza
    // GET /personas, ya integrado en el módulo de Operarios.
    personasApi.list({ limit: 1 })
      .then(res => { if (active) setTotalPersonasState({ status: "ready", total: res.pagination?.total ?? 0 }); })
      .catch(error => {
        if (!active) return;
        console.warn("[repositorio] GET /personas falló:", error);
        setTotalPersonasState({ status: "error", total: 0 });
      });

    return () => { active = false; };
  }, []);

  return { listState, indicadoresState, totalPersonasState };
}

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

export function RepositorioModule() {
  const { listState, indicadoresState, totalPersonasState } = useRepositorioOverview();
  const [exportState, setExportState] = useState<{ status: "idle" | "loading" | "error" }>({ status: "idle" });

  async function handleExport() {
    setExportState({ status: "loading" });
    try {
      const blob = await repositorioApi.exportCsv(TENANT_PARAMS);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "repositorio-documental.csv";
      link.click();
      URL.revokeObjectURL(url);
      setExportState({ status: "idle" });
    } catch (error) {
      console.warn("[repositorio] GET /repositorio/documentos/export falló:", error);
      setExportState({ status: "error" });
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: "1.1rem" }}>Repositorio HV</h1>
          <p className="text-muted-foreground text-xs mt-0.5">Repositorio documental unificado — personas, vinculaciones y documentos generados</p>
        </div>
        <button
          onClick={handleExport}
          disabled={exportState.status === "loading"}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-card text-xs text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-50"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          {exportState.status === "loading" ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          Exportar CSV
        </button>
      </div>
      {exportState.status === "error" && (
        <p className="text-[11.5px] text-amber-600">No se pudo exportar el repositorio. Intenta de nuevo.</p>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Total archivos" status={indicadoresState.status} value={fmtNum(indicadoresState.data?.total_documentos ?? null) ?? "—"} />
        <Kpi label="Total personas" status={totalPersonasState.status} value={fmtNum(totalPersonasState.total) ?? "—"} />
        <Kpi label="Documentos vigentes" status={indicadoresState.status} value={fmtNum(indicadoresState.data?.vigentes ?? null) ?? "—"} accent="#10b981" />
        <Kpi label="Documentos vencidos" status={indicadoresState.status} value={fmtNum(indicadoresState.data?.vencidos ?? null) ?? "—"} accent="#ef4444" />
      </div>

      {/* Tabla */}
      {listState.status === "loading" && (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 size={16} className="animate-spin" /> <span className="text-sm">Cargando repositorio…</span>
        </div>
      )}
      {listState.status === "error" && (
        <p className="text-[11.5px] text-amber-600 py-2">No se pudo cargar el listado del repositorio.</p>
      )}
      {listState.status === "ready" && (
        listState.items.length === 0 ? (
          <div className="bg-card rounded-lg border border-border py-10 text-center text-[12px] text-muted-foreground">
            No hay documentos en el repositorio
          </div>
        ) : (
          <div className="bg-card rounded-lg border border-border overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40">
                <tr className="border-b border-border">
                  {["Persona", "Documento", "Tipo", "Versión", "Fecha carga"].map(h => (
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
                    <td className="px-4 py-2.5 text-[12px] text-muted-foreground text-center">{doc.version ?? "—"}</td>
                    <td className="px-4 py-2.5 text-[12px] text-muted-foreground whitespace-nowrap">{fmtDateLoose(doc.fecha_carga) ?? "—"}</td>
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
