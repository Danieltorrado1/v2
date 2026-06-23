import { useEffect, useState } from "react";
import { Loader2, Info } from "lucide-react";
import { coberturaApi } from "../../services/coberturaApi";
import { vinculacionesApi, type Vinculacion } from "../../services/vinculacionesApi";
import { personasApi, type Persona } from "../../services/personasApi";
import { getArray, getNumber, getString, fmtNum, fmtPercent, fmtDateLoose } from "../../lib/payloadHelpers";

// Contrato fijo hasta que exista un selector de empresa/contrato (fase futura).
// El endpoint /cobertura/resumen no filtra por empresa_id, solo por contrato_id.
const CONTRATO_PARAMS = { contrato_id: 3 };
const MAX_PAGES = 20; // límite defensivo de paginación — no bloquea la pantalla ante datasets grandes

type RowStatus = "loading" | "ready";
type DataSource = "real" | "fallback";

interface ListState {
  status: RowStatus;
  items: unknown[];
  source: DataSource;
}

// ── Mocks de respaldo — usados solo si /cobertura/resumen falla ─────────────
const MOCK_RESUMEN_ITEMS = [
  { id: "1", institucion_id: "1", institucion_nombre: "I.E. San José", sede_id: "1", sede_nombre: "Sede Principal", municipio_nombre: "Acacías", modalidad_base: "CAA", cupos_aprobados: 180, manipuladores_requeridos: 2, asignados_cobertura: 2, estado_cobertura: "COMPLETA" },
  { id: "2", institucion_id: "1", institucion_nombre: "I.E. San José", sede_id: "2", sede_nombre: "Sede Rural", municipio_nombre: "Acacías", modalidad_base: "RI", cupos_aprobados: 250, manipuladores_requeridos: 1, asignados_cobertura: 0, estado_cobertura: "FALTANTE" },
  { id: "3", institucion_id: "2", institucion_nombre: "I.E. La Esperanza", sede_id: "3", sede_nombre: "Sede Principal", municipio_nombre: "Granada", modalidad_base: "CAARES", cupos_aprobados: 40, manipuladores_requeridos: 1, asignados_cobertura: 2, estado_cobertura: "SOBRECOBERTURA" },
  { id: "4", institucion_id: "3", institucion_nombre: "I.E. Vistahermosa", sede_id: "4", sede_nombre: "Sede Centro", municipio_nombre: "Vistahermosa", modalidad_base: "CAA", cupos_aprobados: 60, manipuladores_requeridos: 1, asignados_cobertura: 1, estado_cobertura: "COMPLETA" },
];

const MOCK_ASIGNACIONES = [
  { id: "1", vinculacion_id: "1", manipulador_nombre: "Operario de Prueba", institucion: "I.E. San José", sede: "Sede Principal", modalidad: "CAA", porcentaje_cobertura: 1, fecha_inicio: "2026-01-15", fecha_fin: null, activo: true },
  { id: "2", vinculacion_id: "2", manipulador_nombre: "Carmen Alicia Ruiz Moreno", institucion: "I.E. La Esperanza", sede: "Sede Principal", modalidad: "CAARES", porcentaje_cobertura: 0.5, fecha_inicio: "2026-02-01", fecha_fin: null, activo: true },
];

function personaNombreCompleto(p: Persona): string | null {
  const partes = [p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido].filter(Boolean);
  return partes.length > 0 ? partes.join(" ") : null;
}

// /cobertura/resumen está paginado (máx. 100 por página) y no expone un total
// agregado: se recorren todas las páginas reales para tener el dataset completo
// que alimenta Resumen/Instituciones/Sedes/Modalidades/Indicadores.
async function fetchAllCoberturaResumen(extra: Record<string, unknown> = {}): Promise<unknown[]> {
  const first = await coberturaApi.getResumen({ ...CONTRATO_PARAMS, ...extra, page: 1, limit: 100 });
  const items = getArray(first, ["items"]);
  const totalPages = Math.min(getNumber(first, ["pagination", "total_pages"]) ?? (items.length > 0 ? 1 : 0), MAX_PAGES);

  if (totalPages <= 1) {
    return items;
  }

  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) => i + 2).map(page =>
      coberturaApi.getResumen({ ...CONTRATO_PARAMS, ...extra, page, limit: 100 })
        .then(res => getArray(res, ["items"]))
        .catch(() => [] as unknown[])
    )
  );

  return [...items, ...rest.flat()];
}

function useCoberturaResumenAll(label: string): ListState {
  const [state, setState] = useState<ListState>({ status: "loading", items: [], source: "real" });

  useEffect(() => {
    let active = true;
    fetchAllCoberturaResumen()
      .then(items => { if (active) setState({ status: "ready", items, source: "real" }); })
      .catch(error => {
        if (!active) return;
        console.warn(`[cobertura] ${label} no disponible, usando fallback mock:`, error);
        setState({ status: "ready", items: MOCK_RESUMEN_ITEMS, source: "fallback" });
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}

// Asignaciones no tiene listado plano: se toman los combos sede×modalidad con
// asignados > 0 (los demás no pueden tener asignaciones), se consulta el detalle
// de cada uno (GET /cobertura/sede-modalidad/:id, que sí incluye asignaciones), y
// se resuelve el nombre del manipulador encadenando vinculacion_id → persona_id
// (GET /vinculaciones/:id y GET /personas/:id, ambos endpoints reales). Si la
// resolución de nombre falla para una fila puntual, esa fila muestra el id crudo.
function useCoberturaAsignaciones(): ListState {
  const [state, setState] = useState<ListState>({ status: "loading", items: [], source: "real" });

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const resumenItems = await fetchAllCoberturaResumen();
        const candidateIds = resumenItems
          .filter(item => (getNumber(item, ["asignados_cobertura"]) ?? 0) > 0)
          .map(item => getString(item, ["id"]))
          .filter((id): id is string => id !== null);

        const details = await Promise.all(
          candidateIds.map(id => coberturaApi.getSedeModalidadDetalle(id).catch(() => null))
        );

        const asignaciones = details.flatMap(detail => (detail ? getArray(detail, ["asignaciones"]) : []));

        const vinculacionIds = Array.from(new Set(
          asignaciones.map(item => getNumber(item, ["vinculacion_id"])).filter((id): id is number => id !== null)
        ));

        const vinculacionEntries = await Promise.all(
          vinculacionIds.map(id =>
            vinculacionesApi.getById(id).then(v => [id, v] as const).catch(() => [id, null] as const)
          )
        );
        const vinculacionMap = new Map<number, Vinculacion | null>(vinculacionEntries);

        const personaIds = Array.from(new Set(
          Array.from(vinculacionMap.values())
            .map(v => v?.persona_id ?? null)
            .filter((id): id is number => id !== null)
        ));

        const personaEntries = await Promise.all(
          personaIds.map(id =>
            personasApi.getById(id).then(p => [id, p] as const).catch(() => [id, null] as const)
          )
        );
        const personaMap = new Map<number, Persona | null>(personaEntries);

        const enriched = asignaciones.map(item => {
          const vinculacionId = getNumber(item, ["vinculacion_id"]);
          const vinculacion = vinculacionId !== null ? vinculacionMap.get(vinculacionId) ?? null : null;
          const persona = vinculacion ? personaMap.get(vinculacion.persona_id) ?? null : null;

          return {
            ...(item as Record<string, unknown>),
            manipulador_nombre: persona ? personaNombreCompleto(persona) : null,
            manipulador_documento: persona?.numero_documento ?? null,
          };
        });

        if (!active) return;
        setState({ status: "ready", items: enriched, source: "real" });
      } catch (error) {
        if (!active) return;
        console.warn("[cobertura] asignaciones no disponible, usando fallback mock:", error);
        setState({ status: "ready", items: MOCK_ASIGNACIONES, source: "fallback" });
      }
    })();

    return () => { active = false; };
  }, []);

  return state;
}

// ── Agregaciones client-side (no existe endpoint de instituciones/sedes/modalidades) ─
interface GroupRow {
  key: string;
  nombre: string;
  municipio: string | null;
  institucion: string | null;
  sedesCount: number;
  modalidadesCount: number;
  itemsCount: number;
  requeridos: number;
  asignados: number;
  estado: string;
}

function resolveGroupEstado(estados: Set<string>): string {
  if (estados.has("FALTANTE")) return "FALTANTE";
  if (estados.has("SOBRECOBERTURA")) return "SOBRECOBERTURA";
  if (estados.has("COMPLETA")) return "COMPLETA";
  return "NO_REQUIERE";
}

function aggregateBy(items: unknown[], keyOf: (item: unknown) => string, labelOf: (item: unknown) => string): GroupRow[] {
  const map = new Map<string, {
    nombre: string; municipio: string | null; institucion: string | null;
    sedes: Set<string>; modalidades: Set<string>; estados: Set<string>;
    requeridos: number; asignados: number; itemsCount: number;
  }>();

  items.forEach(item => {
    const key = keyOf(item);
    const sedeKey = getString(item, ["sede_id"]) ?? getString(item, ["sede_nombre"]) ?? "—";
    const modalidad = getString(item, ["modalidad_base"]) ?? "—";
    const estado = getString(item, ["estado_cobertura"]) ?? "NO_REQUIERE";

    if (!map.has(key)) {
      map.set(key, {
        nombre: labelOf(item),
        municipio: getString(item, ["municipio_nombre"]),
        institucion: getString(item, ["institucion_nombre"]),
        sedes: new Set(), modalidades: new Set(), estados: new Set(),
        requeridos: 0, asignados: 0, itemsCount: 0,
      });
    }

    const group = map.get(key)!;
    group.sedes.add(sedeKey);
    group.modalidades.add(modalidad);
    group.estados.add(estado);
    group.requeridos += getNumber(item, ["manipuladores_requeridos"]) ?? 0;
    group.asignados += getNumber(item, ["asignados_cobertura"]) ?? 0;
    group.itemsCount += 1;
  });

  return Array.from(map.entries())
    .map(([key, group]) => ({
      key,
      nombre: group.nombre,
      municipio: group.municipio,
      institucion: group.institucion,
      sedesCount: group.sedes.size,
      modalidadesCount: group.modalidades.size,
      itemsCount: group.itemsCount,
      requeridos: group.requeridos,
      asignados: group.asignados,
      estado: resolveGroupEstado(group.estados),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// ── UI compartida ────────────────────────────────────────────────────────────
function estadoBadgeClass(estado: string | null): string {
  if (!estado) return "bg-secondary text-muted-foreground border-border";
  const v = estado.toLowerCase();
  if (/(faltante|inactiv)/.test(v)) return "bg-red-50 text-red-700 border-red-200";
  if (/(completa|activ)/.test(v)) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (/sobrecobertura/.test(v)) return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-amber-50 text-amber-700 border-amber-200"; // no_requiere...
}

function EstadoBadge({ estado }: { estado: string | null }) {
  if (!estado) return <span className="text-[11px] text-muted-foreground">—</span>;
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded border ${estadoBadgeClass(estado)}`} style={{ fontWeight: 500 }}>
      {estado}
    </span>
  );
}

function SourceBanner({ source, resource }: { source: DataSource; resource: string }) {
  if (source !== "fallback") return null;
  return (
    <p className="text-[10.5px] mb-2" style={{ color: "#f59e0b", fontWeight: 500 }}>
      ● Sin conexión con /{resource} — mostrando datos de ejemplo
    </p>
  );
}

function TableShell({
  state, resource, headers, rows, renderRow, emptyLabel,
}: {
  state: ListState;
  resource: string;
  headers: string[];
  rows: unknown[];
  renderRow: (item: unknown, index: number) => React.ReactNode;
  emptyLabel: string;
}) {
  if (state.status === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm">Cargando…</span>
      </div>
    );
  }

  return (
    <div>
      <SourceBanner source={state.source} resource={resource} />
      {rows.length === 0 ? (
        <div className="bg-card rounded-lg border border-border py-10 text-center text-[12px] text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40">
              <tr className="border-b border-border">
                {headers.map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wide whitespace-nowrap" style={{ fontWeight: 600 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((item, i) => (
                <tr key={i} className="border-b border-border last:border-b-0 hover:bg-secondary/20 transition-colors">
                  {renderRow(item, i)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <td className={`px-4 py-2.5 text-[12px] text-foreground whitespace-nowrap ${right ? "text-right" : ""}`}>{children ?? "—"}</td>;
}

function KpiCard({ label, value, status, source }: { label: string; value: string; status: RowStatus; source: DataSource }) {
  return (
    <div className="bg-card rounded-2xl p-5 flex flex-col gap-3" style={{ boxShadow: "var(--shadow-card)" }}>
      <p className="text-xs text-muted-foreground" style={{ fontWeight: 500 }}>{label}</p>
      {status === "loading" ? (
        <div className="h-7 w-20 rounded-md bg-muted animate-pulse" />
      ) : (
        <p style={{ fontWeight: 700, fontSize: "1.4rem", lineHeight: 1, letterSpacing: "-0.03em" }}>{value}</p>
      )}
      <span
        className="text-[11px]"
        style={{ fontWeight: 500, color: status === "loading" ? "#9ca3af" : source === "fallback" ? "#f59e0b" : "#10b981" }}
      >
        {status === "loading" ? "Cargando…" : source === "fallback" ? "● Estimado (sin datos)" : "● En vivo"}
      </span>
    </div>
  );
}

// ── Resumen ───────────────────────────────────────────────────────────────────
function ResumenTab() {
  const state = useCoberturaResumenAll("resumen");
  const { status, items, source } = state;

  const institucionesCount = aggregateBy(items, i => getString(i, ["institucion_id"]) ?? getString(i, ["institucion_nombre"]) ?? "—", i => getString(i, ["institucion_nombre"]) ?? "—").length;
  const sedesCount = aggregateBy(items, i => `${getString(i, ["institucion_id"]) ?? "—"}::${getString(i, ["sede_id"]) ?? getString(i, ["sede_nombre"]) ?? "—"}`, i => getString(i, ["sede_nombre"]) ?? "—").length;
  const modalidadesCount = new Set(items.map(i => getString(i, ["modalidad_base"])).filter(Boolean)).size;
  const manipuladoresAsignados = items.reduce((sum, i) => sum + (getNumber(i, ["asignados_cobertura"]) ?? 0), 0);
  const coberturaRequerida = items.reduce((sum, i) => sum + (getNumber(i, ["manipuladores_requeridos"]) ?? 0), 0);
  const coberturaCubierta = items.filter(i => {
    const estado = getString(i, ["estado_cobertura"]);
    return estado === "COMPLETA" || estado === "SOBRECOBERTURA";
  }).length;
  const coberturaPendiente = items.filter(i => getString(i, ["estado_cobertura"]) === "FALTANTE").length;

  return (
    <div className="space-y-4">
      {source === "fallback" && status === "ready" && (
        <SourceBanner source="fallback" resource="cobertura/resumen" />
      )}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Instituciones" status={status} source={source} value={fmtNum(institucionesCount) ?? "—"} />
        <KpiCard label="Sedes" status={status} source={source} value={fmtNum(sedesCount) ?? "—"} />
        <KpiCard label="Modalidades" status={status} source={source} value={fmtNum(modalidadesCount) ?? "—"} />
        <KpiCard label="Manipuladores asignados" status={status} source={source} value={fmtNum(manipuladoresAsignados) ?? "—"} />
        <KpiCard label="Cobertura requerida" status={status} source={source} value={fmtNum(coberturaRequerida) ?? "—"} />
        <KpiCard label="Cobertura cubierta (combos)" status={status} source={source} value={fmtNum(coberturaCubierta) ?? "—"} />
        <KpiCard label="Cobertura pendiente (combos)" status={status} source={source} value={fmtNum(coberturaPendiente) ?? "—"} />
      </div>
    </div>
  );
}

// ── Instituciones ─────────────────────────────────────────────────────────────
function InstitucionesTab() {
  const state = useCoberturaResumenAll("instituciones");
  const rows = aggregateBy(
    state.items,
    i => getString(i, ["institucion_id"]) ?? getString(i, ["institucion_nombre"]) ?? "—",
    i => getString(i, ["institucion_nombre"]) ?? "Institución sin nombre"
  );

  return (
    <TableShell
      state={state}
      resource="cobertura/resumen"
      headers={["Institución", "Municipio", "Sedes", "Modalidades", "Requeridos", "Asignados", "Estado"]}
      rows={rows}
      emptyLabel="No hay instituciones con cobertura registrada"
      renderRow={row => {
        const g = row as GroupRow;
        return (
          <>
            <Td>{g.nombre}</Td>
            <Td>{g.municipio ?? "—"}</Td>
            <Td right>{fmtNum(g.sedesCount)}</Td>
            <Td right>{fmtNum(g.modalidadesCount)}</Td>
            <Td right>{fmtNum(g.requeridos)}</Td>
            <Td right>{fmtNum(g.asignados)}</Td>
            <td className="px-4 py-2.5"><EstadoBadge estado={g.estado} /></td>
          </>
        );
      }}
    />
  );
}

// ── Sedes ─────────────────────────────────────────────────────────────────────
function SedesTab() {
  const state = useCoberturaResumenAll("sedes");
  const rows = aggregateBy(
    state.items,
    i => `${getString(i, ["institucion_id"]) ?? "—"}::${getString(i, ["sede_id"]) ?? getString(i, ["sede_nombre"]) ?? "—"}`,
    i => getString(i, ["sede_nombre"]) ?? "Sede sin nombre"
  );

  return (
    <TableShell
      state={state}
      resource="cobertura/resumen"
      headers={["Sede", "Institución", "Municipio", "Modalidades", "Requeridos", "Asignados", "Estado"]}
      rows={rows}
      emptyLabel="No hay sedes con cobertura registrada"
      renderRow={row => {
        const g = row as GroupRow;
        return (
          <>
            <Td>{g.nombre}</Td>
            <Td>{g.institucion ?? "—"}</Td>
            <Td>{g.municipio ?? "—"}</Td>
            <Td right>{fmtNum(g.modalidadesCount)}</Td>
            <Td right>{fmtNum(g.requeridos)}</Td>
            <Td right>{fmtNum(g.asignados)}</Td>
            <td className="px-4 py-2.5"><EstadoBadge estado={g.estado} /></td>
          </>
        );
      }}
    />
  );
}

// ── Modalidades ───────────────────────────────────────────────────────────────
function ModalidadesTab() {
  const state = useCoberturaResumenAll("modalidades");
  const rows = aggregateBy(
    state.items,
    i => getString(i, ["modalidad_base"]) ?? "—",
    i => getString(i, ["modalidad_base"]) ?? "Sin modalidad"
  );

  return (
    <TableShell
      state={state}
      resource="cobertura/resumen"
      headers={["Modalidad", "Combos sede×modalidad", "Sedes", "Requeridos", "Asignados", "Estado predominante"]}
      rows={rows}
      emptyLabel="No hay modalidades con cobertura registrada"
      renderRow={row => {
        const g = row as GroupRow;
        return (
          <>
            <Td>{g.nombre}</Td>
            <Td right>{fmtNum(g.itemsCount)}</Td>
            <Td right>{fmtNum(g.sedesCount)}</Td>
            <Td right>{fmtNum(g.requeridos)}</Td>
            <Td right>{fmtNum(g.asignados)}</Td>
            <td className="px-4 py-2.5"><EstadoBadge estado={g.estado} /></td>
          </>
        );
      }}
    />
  );
}

// ── Asignaciones ──────────────────────────────────────────────────────────────
function AsignacionesTab() {
  const state = useCoberturaAsignaciones();
  return (
    <TableShell
      state={state}
      resource="cobertura/sede-modalidad/:id"
      headers={["Manipulador", "Institución", "Sede", "Modalidad", "% Cobertura", "Fecha inicio", "Fecha fin", "Estado"]}
      rows={state.items}
      emptyLabel="No hay asignaciones de manipuladores registradas"
      renderRow={item => {
        const vinculacionId = getNumber(item, ["vinculacion_id"]);
        const nombre = getString(item, ["manipulador_nombre"]) ?? (vinculacionId !== null ? `Vinculación #${vinculacionId}` : "—");
        const documento = getString(item, ["manipulador_documento"]);
        const activo = (item as Record<string, unknown>).activo !== false;
        return (
          <>
            <td className="px-4 py-2.5">
              <p className="text-[12px] text-foreground" style={{ fontWeight: 500 }}>{nombre}</p>
              {documento && <p className="text-[10px] text-muted-foreground">CC {documento}</p>}
            </td>
            <Td>{getString(item, ["institucion"])}</Td>
            <Td>{getString(item, ["sede"])}</Td>
            <Td>{getString(item, ["modalidad"])}</Td>
            <Td right>{fmtPercent((getNumber(item, ["porcentaje_cobertura"]) ?? 0) * 100)}</Td>
            <Td>{fmtDateLoose(getString(item, ["fecha_inicio"]))}</Td>
            <Td>{fmtDateLoose(getString(item, ["fecha_fin"])) ?? "—"}</Td>
            <td className="px-4 py-2.5"><EstadoBadge estado={activo ? "ACTIVO" : "INACTIVO"} /></td>
          </>
        );
      }}
    />
  );
}

// ── Novedades ─────────────────────────────────────────────────────────────────
// El backend solo expone POST /cobertura/novedades (y ni siquiera persiste en
// base de datos: el servicio devuelve un objeto en memoria con un id aleatorio).
// No existe ningún GET para listar novedades, así que no hay nada real que
// consultar aquí — se documenta la limitación en vez de simular datos.
function NovedadesTab() {
  return (
    <div className="bg-card rounded-lg border border-border py-10 px-6 text-center">
      <Info className="w-6 h-6 text-muted-foreground mx-auto mb-3" />
      <p className="text-foreground text-[13px] mb-1" style={{ fontWeight: 600 }}>No hay un listado disponible todavía</p>
      <p className="text-muted-foreground text-[12px] max-w-md mx-auto">
        El backend de Cobertura solo expone <code>POST /cobertura/novedades</code> para registrar novedades.
        No existe un endpoint de lectura (GET) ni una tabla donde se persistan, por lo que esta vista no puede
        mostrar datos reales por ahora.
      </p>
    </div>
  );
}

// ── Indicadores ───────────────────────────────────────────────────────────────
function IndicadoresTab() {
  const state = useCoberturaResumenAll("indicadores");
  const { status, items, source } = state;

  const requeridos = items.reduce((sum, i) => sum + (getNumber(i, ["manipuladores_requeridos"]) ?? 0), 0);
  const asignados = items.reduce((sum, i) => sum + (getNumber(i, ["asignados_cobertura"]) ?? 0), 0);
  const cumplimientoGeneral = requeridos === 0 ? 100 : Math.min(100, (asignados / requeridos) * 100);

  const porModalidad = aggregateBy(
    items,
    i => getString(i, ["modalidad_base"]) ?? "—",
    i => getString(i, ["modalidad_base"]) ?? "Sin modalidad"
  );

  const estadoCounts = {
    COMPLETA: items.filter(i => getString(i, ["estado_cobertura"]) === "COMPLETA").length,
    FALTANTE: items.filter(i => getString(i, ["estado_cobertura"]) === "FALTANTE").length,
    SOBRECOBERTURA: items.filter(i => getString(i, ["estado_cobertura"]) === "SOBRECOBERTURA").length,
    NO_REQUIERE: items.filter(i => getString(i, ["estado_cobertura"]) === "NO_REQUIERE").length,
  };

  return (
    <div className="space-y-5">
      {source === "fallback" && status === "ready" && (
        <SourceBanner source="fallback" resource="cobertura/resumen" />
      )}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Cumplimiento general" status={status} source={source} value={fmtPercent(cumplimientoGeneral) ?? "—"} />
        <KpiCard label="Combos completos" status={status} source={source} value={fmtNum(estadoCounts.COMPLETA) ?? "—"} />
        <KpiCard label="Combos faltantes" status={status} source={source} value={fmtNum(estadoCounts.FALTANTE) ?? "—"} />
        <KpiCard label="Combos en sobrecobertura" status={status} source={source} value={fmtNum(estadoCounts.SOBRECOBERTURA) ?? "—"} />
      </div>

      {status === "loading" ? (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Cargando…</span>
        </div>
      ) : porModalidad.length === 0 ? (
        <div className="bg-card rounded-lg border border-border py-10 text-center text-[12px] text-muted-foreground">
          No hay datos suficientes para calcular cumplimiento por modalidad
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40">
              <tr className="border-b border-border">
                {["Modalidad", "Requeridos", "Asignados", "Cumplimiento", "Estado predominante"].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wide whitespace-nowrap" style={{ fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {porModalidad.map(g => {
                const cumplimiento = g.requeridos === 0 ? 100 : Math.min(100, (g.asignados / g.requeridos) * 100);
                return (
                  <tr key={g.key} className="border-b border-border last:border-b-0 hover:bg-secondary/20 transition-colors">
                    <Td>{g.nombre}</Td>
                    <Td right>{fmtNum(g.requeridos)}</Td>
                    <Td right>{fmtNum(g.asignados)}</Td>
                    <Td right>{fmtPercent(cumplimiento)}</Td>
                    <td className="px-4 py-2.5"><EstadoBadge estado={g.estado} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
type CoberturaTabId = "resumen" | "instituciones" | "sedes" | "modalidades" | "asignaciones" | "novedades" | "indicadores";

const TABS: { id: CoberturaTabId; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "instituciones", label: "Instituciones" },
  { id: "sedes", label: "Sedes" },
  { id: "modalidades", label: "Modalidades" },
  { id: "asignaciones", label: "Asignaciones" },
  { id: "novedades", label: "Novedades" },
  { id: "indicadores", label: "Indicadores" },
];

export function CoberturaModule() {
  const [tab, setTab] = useState<CoberturaTabId>("resumen");

  return (
    <div className="p-6 space-y-5 max-w-none">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: "1.1rem" }}>Cobertura PAE</h1>
          <p className="text-muted-foreground text-xs mt-0.5">Seguimiento de cobertura del programa de alimentación por municipio</p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-card rounded-2xl flex-wrap" style={{ boxShadow: "var(--shadow-card)" }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3.5 py-1.5 rounded-xl text-[13px] transition-all ${tab === t.id ? "bg-foreground text-card" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
              style={{ fontWeight: tab === t.id ? 600 : 400 }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "resumen" && <ResumenTab />}
      {tab === "instituciones" && <InstitucionesTab />}
      {tab === "sedes" && <SedesTab />}
      {tab === "modalidades" && <ModalidadesTab />}
      {tab === "asignaciones" && <AsignacionesTab />}
      {tab === "novedades" && <NovedadesTab />}
      {tab === "indicadores" && <IndicadoresTab />}
    </div>
  );
}
