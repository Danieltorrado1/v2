import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  FileText,
  History,
  IdCard,
  MapPin,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import "./PersonalPage.css";
import { useApiState } from "../../hooks/useApiState";
import {
  getPersonas,
  getVinculacionesByPersonaId,
  getVinculacionExpediente,
  normalizePersonaListItem,
  buildNombreCompleto,
} from "../../services/personasApi";
import { getExpedienteConsolidado } from "../../services/expedienteApi";
import type {
  PaginatedPersonasApi,
  VinculacionExpedienteApi,
  PersonaListItem,
} from "../../types/personas.types";
import type { ExpedienteLaboralConsolidadoApi } from "../../types/expediente.types";

const ITEMS_PER_PAGE = 25;

const AVATAR_COLORS = ["green", "blue", "purple", "orange", "red", "cyan"] as const;
type AvatarColor = (typeof AVATAR_COLORS)[number];

function getAvatarColor(id: number): AvatarColor {
  return AVATAR_COLORS[id % AVATAR_COLORS.length] ?? "blue";
}

function getInitials(item: PersonaListItem): string {
  const parts = item.nombreCompleto.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? "";
  return (first + second).toUpperCase() || "?";
}

const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
] as const;

function formatFechaCorta(fecha: string | null | undefined): string {
  if (!fecha) return "—";
  const [y, m, d] = fecha.split("-");
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (!year || !month || !day) return fecha;
  return `${String(day).padStart(2, "0")} ${MESES[month - 1] ?? "?"} ${year}`;
}

function calcularEdad(fechaNacimiento: string | null | undefined): string {
  if (!fechaNacimiento) return "—";
  const hoy = new Date();
  const nac = new Date(fechaNacimiento + "T12:00:00");
  let edad = hoy.getFullYear() - nac.getFullYear();
  const diffMes = hoy.getMonth() - nac.getMonth();
  if (diffMes < 0 || (diffMes === 0 && hoy.getDate() < nac.getDate())) edad--;
  return `${edad} años`;
}

const toolbarFilters = [
  "Todos",
  "Cargo",
  "Documentación",
  "Municipio",
  "Gestor de Zona",
  "Institución",
  "Sede",
  "Modalidad",
  "Ordenar por...",
];

export default function PersonalPage() {
  const {
    data: personasPage,
    loading: listLoading,
    error: listError,
    run: runPersonas,
  } = useApiState<PaginatedPersonasApi>();

  const {
    data: expediente,
    loading: expedienteLoading,
    error: expedienteError,
    run: runExpediente,
    reset: resetExpediente,
  } = useApiState<VinculacionExpedienteApi>();

  const {
    data: consolidado,
    loading: consolidadoLoading,
    run: runConsolidado,
    reset: resetConsolidado,
  } = useApiState<ExpedienteLaboralConsolidadoApi>();

  const [selectedPersonaId, setSelectedPersonaId] = useState<number | null>(null);
  const [inputSearch, setInputSearch] = useState("");
  const [searchText, setSearchText] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const total = personasPage?.pagination.total ?? 0;
  const totalPages = Math.max(personasPage?.pagination.total_pages ?? 1, 1);
  const personaRows = (personasPage?.items ?? []).map((p) => ({
    persona: p,
    item: normalizePersonaListItem(p),
  }));

  useEffect(() => {
    void runPersonas(() =>
      getPersonas({
        search: searchText || undefined,
        page: currentPage,
        limit: ITEMS_PER_PAGE,
      })
    );
  }, [runPersonas, searchText, currentPage]);

  const handleSearchInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchText(value);
      setCurrentPage(1);
    }, 350);
  }, []);

  const handleClearSearch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setInputSearch("");
    setSearchText("");
    setCurrentPage(1);
  }, []);

  const handleSelectPersona = useCallback(
    (personaId: number) => {
      setSelectedPersonaId(personaId);
      resetExpediente();
      resetConsolidado();
      void runExpediente(async () => {
        const vincs = await getVinculacionesByPersonaId(personaId);
        const active = vincs.find((v) => v.estado_vinculacion === "ACTIVA") ?? vincs[0];
        if (!active) throw new Error("Este colaborador no tiene vinculaciones registradas.");
        return getVinculacionExpediente(active.id);
      });
      void runConsolidado(() => getExpedienteConsolidado(personaId));
    },
    [runExpediente, resetExpediente, runConsolidado, resetConsolidado]
  );

  const handleClose = useCallback(() => {
    setSelectedPersonaId(null);
    resetExpediente();
    resetConsolidado();
  }, [resetExpediente, resetConsolidado]);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  return (
    <div className="personal-module">
      <div className="personal-toolbar">
        <div className="toolbar-row">
          <div className="toolbar-actions">
            <button type="button" className="toolbar-button primary">
              <Plus size={18} />
              Nuevo empleado
            </button>

            <button type="button" className="toolbar-button">
              <Upload size={18} />
              Importar Excel
            </button>

            <button
              type="button"
              className="toolbar-button"
              onClick={() => {
                void runPersonas(() =>
                  getPersonas({
                    search: searchText || undefined,
                    page: currentPage,
                    limit: ITEMS_PER_PAGE,
                  })
                );
              }}
            >
              <RefreshCw size={18} />
              Actualizar
            </button>

            <button type="button" className="toolbar-button">
              <Download size={18} />
              Exportar
            </button>
          </div>

          <div className="toolbar-search">
            <Search size={18} />
            <input
              placeholder="Buscar por nombre o documento"
              value={inputSearch}
              onChange={handleSearchInput}
            />
          </div>
        </div>

        <div className="toolbar-row">
          <div className="toolbar-filters">
            {toolbarFilters.map((label) => (
              <div className="toolbar-select-wrap" key={label}>
                <select className="toolbar-select" defaultValue={label}>
                  <option value={label}>{label}</option>
                </select>
                <ChevronDown size={14} />
              </div>
            ))}

            <button type="button" className="toolbar-clear" onClick={handleClearSearch}>
              Limpiar
            </button>
          </div>
        </div>
      </div>

      <section className={`personal-page ${selectedPersonaId !== null ? "split-view" : "list-view"}`}>
        <aside className="people-panel">
          <div className="people-header">
            <div>
              <span>Personal</span>
              <h1>Colaboradores</h1>
              <p>
                {listLoading && !personasPage
                  ? "Cargando..."
                  : `${total.toLocaleString("es-CO")} registros`}
              </p>
            </div>
          </div>

          {listError ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                padding: "32px 24px",
                textAlign: "center",
              }}
            >
              <p
                style={{
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  color: listError.includes("permisos")
                    ? "var(--color-warning)"
                    : "var(--color-danger)",
                }}
              >
                {listError.includes("permisos")
                  ? "No tienes permisos para consultar personal."
                  : "Error al cargar colaboradores"}
              </p>
              {!listError.includes("permisos") && (
                <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                  {listError}
                </p>
              )}
            </div>
          ) : (
            <>
              {selectedPersonaId !== null ? (
                <div className="people-list">
                  {personaRows.map(({ persona, item }) => (
                    <button
                      key={persona.id}
                      type="button"
                      onClick={() => handleSelectPersona(persona.id)}
                      className={`employee-row ${selectedPersonaId === persona.id ? "selected" : ""}`}
                    >
                      <div className={`avatar ${getAvatarColor(persona.id)}`}>
                        {getInitials(item)}
                      </div>

                      <div className="employee-info">
                        <div className="employee-name-line">
                          <strong>{item.nombreCompleto}</strong>
                        </div>
                        <p>CC {item.numeroDocumento}</p>
                        <small>{item.correo ?? item.telefono ?? "—"}</small>
                      </div>

                      <div className="alert ok">Ver</div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="people-table">
                  <div className="table-head">
                    <span>Empleado</span>
                    <span>Municipio / Institución</span>
                    <span>Ingreso / Retiro</span>
                    <span>Documentación</span>
                    <span>Alertas</span>
                    <span>Acción</span>
                  </div>

                  {listLoading && personaRows.length === 0 ? (
                    <div
                      style={{
                        padding: "40px 24px",
                        textAlign: "center",
                        color: "var(--text-secondary)",
                        fontSize: "0.85rem",
                      }}
                    >
                      Cargando colaboradores...
                    </div>
                  ) : personaRows.length === 0 ? (
                    <div
                      style={{
                        padding: "40px 24px",
                        textAlign: "center",
                        color: "var(--text-secondary)",
                        fontSize: "0.85rem",
                      }}
                    >
                      {searchText
                        ? `Sin resultados para "${searchText}"`
                        : "Sin colaboradores registrados"}
                    </div>
                  ) : (
                    <div className="table-body">
                      {personaRows.map(({ persona, item }) => (
                        <div
                          key={persona.id}
                          className="table-row"
                          role="button"
                          tabIndex={0}
                          onClick={() => handleSelectPersona(persona.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSelectPersona(persona.id);
                          }}
                        >
                          <div className="cell-employee">
                            <div className={`avatar ${getAvatarColor(persona.id)}`}>
                              {getInitials(item)}
                            </div>

                            <div className="employee-info">
                              <div className="employee-name-line">
                                <strong>{item.nombreCompleto}</strong>
                              </div>
                              <p>CC {item.numeroDocumento}</p>
                            </div>
                          </div>

                          <div className="cell-meta">
                            <strong>—</strong>
                            <span>—</span>
                          </div>

                          <div className="cell-date">
                            <span>—</span>
                            <strong>—</strong>
                          </div>

                          <div className="cell-doc">—</div>

                          <div className="alert ok">—</div>

                          <div className="cell-action">
                            Ver <ChevronRight size={14} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <div className="people-pagination">
            <span>
              Mostrando{" "}
              {total === 0
                ? "0"
                : `${(currentPage - 1) * ITEMS_PER_PAGE + 1} a ${Math.min(
                    currentPage * ITEMS_PER_PAGE,
                    total
                  )}`}{" "}
              de {total.toLocaleString("es-CO")}
            </span>

            <div>
              <select defaultValue="25">
                <option value="25">25 por página</option>
              </select>

              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
              >
                <ChevronLeft size={16} />
              </button>

              <button
                type="button"
                className={currentPage === 1 ? "active-page" : ""}
                onClick={() => handlePageChange(1)}
              >
                1
              </button>

              {currentPage > 2 && (
                <span style={{ padding: "0 2px", color: "var(--text-secondary)" }}>…</span>
              )}

              {currentPage !== 1 && currentPage !== totalPages && (
                <button type="button" className="active-page">
                  {currentPage}
                </button>
              )}

              {totalPages > 2 && currentPage < totalPages - 1 && (
                <span style={{ padding: "0 2px", color: "var(--text-secondary)" }}>…</span>
              )}

              {totalPages > 1 && (
                <button
                  type="button"
                  className={currentPage === totalPages ? "active-page" : ""}
                  onClick={() => handlePageChange(totalPages)}
                >
                  {totalPages}
                </button>
              )}

              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </aside>

        {selectedPersonaId !== null && (
          <main className="employee-profile">
            <QuickEmployeeView
              expediente={expediente}
              consolidado={consolidado}
              consolidadoLoading={consolidadoLoading}
              loading={expedienteLoading}
              error={expedienteError}
              onClose={handleClose}
            />
          </main>
        )}
      </section>
    </div>
  );
}

const RIESGO_COLOR: Record<string, string> = {
  BAJO: "var(--color-success, #22c55e)",
  MEDIO: "var(--color-warning, #f59e0b)",
  ALTO: "var(--color-danger, #ef4444)",
  CRITICO: "var(--color-danger, #ef4444)",
};

function QuickEmployeeView({
  expediente,
  consolidado,
  consolidadoLoading,
  loading,
  error,
  onClose,
}: {
  expediente: VinculacionExpedienteApi | null;
  consolidado: ExpedienteLaboralConsolidadoApi | null;
  consolidadoLoading: boolean;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const nombreCompleto = expediente ? buildNombreCompleto(expediente.persona) : "";
  const estado = expediente?.vinculacion.estado_vinculacion ?? "";

  const checklistPct = consolidado?.indicadores.checklist_cumplimiento_promedio ?? null;
  const riesgoNivel = consolidado?.indicadores.riesgo_documental?.nivel ?? null;
  const alertasActivas = consolidado?.indicadores.alertas_activas ?? null;
  const checklistFaltantes = consolidado?.indicadores.checklist_faltantes ?? null;
  const docsVencidos = consolidado?.indicadores.documentos_vencidos ?? null;
  const recentAudit = consolidado?.auditoria.slice(0, 2) ?? [];

  return (
    <div className="quick-employee-view">
      <div className="profile-actions">
        <span className="profile-view-label">Vista rápida del colaborador</span>

        <div className="profile-actions-buttons">
          <button type="button">
            <Edit3 size={17} />
            Editar
          </button>

          <button type="button">
            <MoreHorizontal size={18} />
            Más acciones
            <ChevronDown size={15} />
          </button>

          <button type="button">
            <FileText size={17} />
          </button>

          <button
            type="button"
            className="profile-close-button"
            onClick={onClose}
            aria-label="Cerrar vista rápida"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {loading && !expediente && (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-secondary)",
            fontSize: "0.85rem",
          }}
        >
          Cargando datos del colaborador...
        </div>
      )}

      {error && !expediente && (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            padding: "32px 24px",
            textAlign: "center",
          }}
        >
          <p style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--color-danger)" }}>
            Error al cargar el expediente
          </p>
          <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{error}</p>
        </div>
      )}

      {expediente && (
        <>
          <section className="profile-hero">
            <div className="photo-wrap">
              <img
                src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=240&h=240&fit=crop&crop=face"
                alt={nombreCompleto}
              />
              <span />
            </div>

            <div className="hero-main">
              <h2>{nombreCompleto}</h2>
              <p>{expediente.cargo.nombre_cargo ?? "—"}</p>

              <div className="hero-subtitle">
                <span>{expediente.empresa.nombre_empresa ?? "—"}</span>
                <i />
                <span>{expediente.tipo_vinculacion.nombre_vinculacion ?? "—"}</span>
                <b className={estado === "ACTIVA" ? "" : "retired"}>{estado}</b>
              </div>

              <div className="hero-chips">
                <div>
                  <MapPin size={17} />
                  {expediente.persona.pais_nacimiento ?? "—"}
                </div>
                <div>
                  <FileText size={17} />
                  {expediente.contrato.numero_contrato ?? "Sin contrato"}
                </div>
                <div>
                  <UserRound size={17} />
                  {expediente.cargo.nombre_cargo ?? "—"}
                </div>
                <div>
                  <CalendarDays size={17} />
                  {estado === "ACTIVA"
                    ? `Ingreso: ${formatFechaCorta(expediente.vinculacion.fecha_inicio)}`
                    : `Retiro: ${formatFechaCorta(expediente.vinculacion.fecha_fin)}`}
                </div>
              </div>
            </div>
          </section>

          <section className="profile-grid three">
            <InfoCard
              icon={<IdCard size={18} />}
              title="Información personal"
              rows={[
                ["Documento", expediente.persona.numero_documento],
                ["Fecha de nacimiento", formatFechaCorta(expediente.persona.fecha_nacimiento)],
                ["Edad", calcularEdad(expediente.persona.fecha_nacimiento)],
                ["Sexo", "—"],
                ["Estado civil", "—"],
                ["Grupo sanguíneo", "—"],
                ["Nacionalidad", expediente.persona.pais_nacimiento ?? "Colombia"],
              ]}
            />

            <InfoCard
              icon={<BriefcaseBusiness size={18} />}
              title="Información laboral"
              rows={[
                ["Empresa", expediente.empresa.nombre_empresa ?? "—"],
                ["Contrato", expediente.contrato.numero_contrato ?? "—"],
                ["Cargo", expediente.cargo.nombre_cargo ?? "—"],
                ["Tipo vinculación", expediente.tipo_vinculacion.nombre_vinculacion ?? "—"],
                ["Sede", "—"],
                ["Modalidad", "—"],
                ["Municipio", "—"],
              ]}
            />

            <InfoCard
              icon={<ShieldCheck size={18} />}
              title="Afiliaciones"
              rows={[
                ["EPS", "—"],
                ["AFP", "—"],
                ["ARL", "—"],
                ["Caja de compensación", "—"],
                ["Cesantías", "—"],
              ]}
            />
          </section>

          <section className="profile-grid bottom">
            <div className="profile-card history-card">
              <div className="card-title">
                <History size={18} />
                <h3>Historial reciente</h3>
              </div>

              <div className="timeline">
                <TimelineItem
                  date={formatFechaCorta(expediente.vinculacion.fecha_inicio)}
                  title="Ingreso"
                  detail={`${expediente.cargo.nombre_cargo ?? "Cargo"} · ${expediente.empresa.nombre_empresa ?? "Empresa"}`}
                  author="Sistema"
                />
                {expediente.vinculacion.fecha_fin && (
                  <TimelineItem
                    date={formatFechaCorta(expediente.vinculacion.fecha_fin)}
                    title="Retiro"
                    detail={expediente.vinculacion.motivo_retiro ?? "Sin motivo registrado"}
                    author="Sistema"
                  />
                )}
                {recentAudit.map((evt) => (
                  <TimelineItem
                    key={evt.id}
                    date={formatFechaCorta(evt.fecha_evento)}
                    title={evt.accion}
                    detail={evt.descripcion}
                    author={evt.usuario.nombre ?? evt.usuario.email ?? "Sistema"}
                  />
                ))}
              </div>

              <button type="button" className="link-button">
                Ver todo el historial <ChevronRight size={16} />
              </button>
            </div>

            <div className="profile-card status-card">
              <div className="card-title">
                <Bell size={18} />
                <h3>Estado general</h3>
              </div>

              <div className="status-content">
                <div
                  className="progress-ring"
                  style={{
                    background:
                      checklistPct !== null
                        ? `conic-gradient(var(--color-brand) ${checklistPct}%, var(--border-color) ${checklistPct}% 100%)`
                        : "conic-gradient(var(--border-color) 0 100%)",
                  }}
                >
                  <div>
                    <strong>
                      {checklistPct !== null
                        ? `${Math.round(checklistPct)}%`
                        : consolidadoLoading
                          ? "..."
                          : "—"}
                    </strong>
                  </div>
                </div>
                <p>Documentación</p>
                <span
                  style={
                    riesgoNivel
                      ? { color: RIESGO_COLOR[riesgoNivel], fontWeight: 600 }
                      : undefined
                  }
                >
                  {riesgoNivel
                    ? `Riesgo ${riesgoNivel}`
                    : consolidadoLoading
                      ? "Cargando..."
                      : "Sin datos de checklist"}
                </span>
              </div>

              <div className="status-summary">
                <button type="button">
                  <span className="status-icon warning">
                    <AlertTriangle size={12} />
                  </span>
                  <strong>{alertasActivas ?? (consolidadoLoading ? "..." : "—")}</strong>
                  Alertas activas
                  <ChevronRight size={15} />
                </button>

                <button type="button">
                  <span className="status-icon info">i</span>
                  <strong>{checklistFaltantes ?? (consolidadoLoading ? "..." : "—")}</strong>
                  Docs faltantes
                  <ChevronRight size={15} />
                </button>

                <button
                  type="button"
                  style={docsVencidos !== null && docsVencidos > 0 ? { color: "var(--color-danger)" } : undefined}
                >
                  <span className="status-icon success">✓</span>
                  {docsVencidos !== null
                    ? docsVencidos === 0
                      ? "Sin documentos vencidos"
                      : `${docsVencidos} doc${docsVencidos > 1 ? "s" : ""} vencido${docsVencidos > 1 ? "s" : ""}`
                    : consolidadoLoading
                      ? "..."
                      : "Sin datos"}
                  <ChevronRight size={15} />
                </button>
              </div>

              <button type="button" className="repository-button">
                Ir al Repositorio documental <ChevronRight size={17} />
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function InfoCard({
  icon,
  title,
  rows,
}: {
  icon: React.ReactNode;
  title: string;
  rows: [string, string][];
}) {
  return (
    <div className="profile-card info-card">
      <div className="card-title">
        {icon}
        <h3>{title}</h3>
      </div>

      <div className="info-rows">
        {rows.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelineItem({
  date,
  title,
  detail,
  author,
}: {
  date: string;
  title: string;
  detail: string;
  author: string;
}) {
  return (
    <div className="timeline-item">
      <div className="timeline-dot" />
      <span>{date}</span>
      <strong>{title}</strong>
      <p>{detail}</p>
      <small>{author}</small>
    </div>
  );
}
