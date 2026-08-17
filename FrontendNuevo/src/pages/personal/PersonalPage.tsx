import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle,
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
import { useNavigate } from "react-router-dom";
import "./PersonalPage.css";
import ExpedienteDocumentosPanel from "./ExpedienteDocumentosPanel";
import IdentificationHistoryCard from "./IdentificationHistoryCard";
import ChangeIdentificationModal from "./ChangeIdentificationModal";
import { useApiState } from "../../hooks/useApiState";
import {
  getPersonas,
  getPersonaById,
  getPersonaActiveExpediente,
  getPersonaIdentificaciones,
  getVinculacionesByPersonaId,
  normalizePersonaListItem,
  buildNombreCompleto,
  createPersona,
  isPersonaDuplicateDocumentError,
  updatePersona,
} from "../../services/personasApi";
import {
  retirarVinculacion,
  suspenderVinculacion,
  reactivarVinculacion,
} from "../../services/vinculacionesApi";
import { getExpedienteConsolidado } from "../../services/expedienteApi";
import type {
  PersonaApi,
  PaginatedPersonasApi,
  VinculacionApi,
  VinculacionExpedienteApi,
  VinculacionExpedientePersona,
  PersonaIdentificacionApi,
  PersonaListItem,
} from "../../types/personas.types";
import type { ExpedienteLaboralConsolidadoApi } from "../../types/expediente.types";
import type { CreatePersonaPayload } from "../../services/personasApi";

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

function getInitialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? "";
  return (first + second).toUpperCase() || "?";
}

const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
] as const;

function formatFechaCorta(fecha: string | null | undefined): string {
  if (!fecha) return "â€”";
  const [y, m, d] = fecha.split("-");
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (!year || !month || !day) return fecha;
  return `${String(day).padStart(2, "0")} ${MESES[month - 1] ?? "?"} ${year}`;
}

function calcularEdad(fechaNacimiento: string | null | undefined): string {
  if (!fechaNacimiento) return "â€”";
  const hoy = new Date();
  const nac = new Date(fechaNacimiento + "T12:00:00");
  let edad = hoy.getFullYear() - nac.getFullYear();
  const diffMes = hoy.getMonth() - nac.getMonth();
  if (diffMes < 0 || (diffMes === 0 && hoy.getDate() < nac.getDate())) edad--;
  return `${edad} aÃ±os`;
}

function todayIso(): string {
  return new Date().toISOString().split("T")[0] ?? "";
}

const MODAL_OVERLAY: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  zIndex: 400,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const MODAL_BOX: React.CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--border-color)",
  borderRadius: 16,
  padding: "28px 32px",
  maxWidth: 520,
  width: "92%",
  boxShadow: "0 8px 40px rgba(0,0,0,0.2)",
  maxHeight: "90vh",
  overflowY: "auto",
};

const FIELD_LABEL: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-secondary)",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const FIELD_INPUT: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "7px 10px",
  border: "1px solid var(--border-color)",
  borderRadius: 7,
  background: "var(--bg-secondary)",
  color: "var(--text-primary)",
  fontSize: 13,
  boxSizing: "border-box",
};

// â”€â”€ Toolbar filter labels â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const PENDING_FILTERS = [
  "Cargo",
  "DocumentaciÃ³n",
  "Municipio",
  "Gestor de Zona",
  "InstituciÃ³n",
  "Sede",
  "Modalidad",
  "Ordenar por...",
];

// â”€â”€ CSV Export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function exportarCSV(rows: PaginatedPersonasApi["items"]): void {
  const header = "Nombre completo,Documento,Correo,TelÃ©fono";
  const lines = rows.map((p) => {
    const nombre = [p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido]
      .filter(Boolean)
      .join(" ");
    const doc = p.numero_documento;
    const correo = p.correo ?? "";
    const tel = p.telefono ?? "";
    return [nombre, doc, correo, tel]
      .map((v) => `"${v.replace(/"/g, '""')}"`)
      .join(",");
  });
  const csv = [header, ...lines].join("\n");
  const blob = new Blob(["ï»¿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `colaboradores-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// â”€â”€ PersonalPage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    data: personaDetalle,
    loading: personaLoading,
    error: personaError,
    run: runPersonaDetalle,
    reset: resetPersonaDetalle,
  } = useApiState<PersonaApi>();

  const {
    data: identificaciones,
    loading: identificacionesLoading,
    error: identificacionesError,
    run: runIdentificaciones,
    reset: resetIdentificaciones,
  } = useApiState<PersonaIdentificacionApi[]>();

  const {
    data: vinculaciones,
    loading: vinculacionesLoading,
    error: vinculacionesError,
    run: runVinculaciones,
    reset: resetVinculaciones,
  } = useApiState<VinculacionApi[]>();

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

  const [toast, setToast] = useState<string | null>(null);
  const [showNuevoModal, setShowNuevoModal] = useState(false);
  const [showImportarModal, setShowImportarModal] = useState(false);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  const total = personasPage?.pagination.total ?? 0;
  const totalPages = Math.max(personasPage?.pagination.total_pages ?? 1, 1);
  const personaRows = (personasPage?.items ?? []).map((p) => ({
    persona: p,
    item: normalizePersonaListItem(p),
  }));

  const fetchPersonas = useCallback(
    (search: string, page: number) => {
      void runPersonas(() =>
        getPersonas({ search: search || undefined, page, limit: ITEMS_PER_PAGE })
      );
    },
    [runPersonas]
  );

  useEffect(() => {
    fetchPersonas(searchText, currentPage);
  }, [fetchPersonas, searchText, currentPage]);

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
      resetPersonaDetalle();
      resetIdentificaciones();
      resetVinculaciones();
      resetExpediente();
      resetConsolidado();
      void runPersonaDetalle(() => getPersonaById(personaId));
      void runIdentificaciones(() => getPersonaIdentificaciones(personaId));
      void runVinculaciones(() => getVinculacionesByPersonaId(personaId));
      void runExpediente(() => getPersonaActiveExpediente(personaId));
      void runConsolidado(() => getExpedienteConsolidado(personaId));
    },
    [
      runPersonaDetalle,
      resetPersonaDetalle,
      runVinculaciones,
      resetVinculaciones,
      runExpediente,
      resetExpediente,
      runConsolidado,
      resetConsolidado,
    ]
  );

  const handleClose = useCallback(() => {
    setSelectedPersonaId(null);
    resetPersonaDetalle();
    resetVinculaciones();
    resetExpediente();
    resetConsolidado();
  }, [resetPersonaDetalle, resetVinculaciones, resetExpediente, resetConsolidado]);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const handlePersonaUpdated = useCallback(
    (personaId: number) => {
      fetchPersonas(searchText, currentPage);
      handleSelectPersona(personaId);
    },
    [fetchPersonas, searchText, currentPage, handleSelectPersona]
  );

  const handleVinculacionChanged = useCallback(() => {
    fetchPersonas(searchText, currentPage);
    handleClose();
  }, [fetchPersonas, searchText, currentPage, handleClose]);

  const handleNuevoSuccess = useCallback((persona: PersonaApi) => {
    setShowNuevoModal(false);
    showToast("Colaborador registrado correctamente.");
    setInputSearch(persona.numero_documento);
    setSearchText(persona.numero_documento);
    setCurrentPage(1);
    handleSelectPersona(persona.id);
  }, [handleSelectPersona]);

  return (
    <div className="personal-module">
      <div className="personal-toolbar">
        <div className="toolbar-row">
          <div className="toolbar-actions">
            <button
              type="button"
              className="toolbar-button primary"
              onClick={() => setShowNuevoModal(true)}
            >
              <Plus size={18} />
              Nuevo empleado
            </button>

            <button
              type="button"
              className="toolbar-button"
              onClick={() => setShowImportarModal(true)}
            >
              <Upload size={18} />
              Importar Excel
            </button>

            <button
              type="button"
              className="toolbar-button"
              onClick={() => fetchPersonas(searchText, currentPage)}
            >
              <RefreshCw size={18} />
              Actualizar
            </button>

            <button
              type="button"
              className="toolbar-button"
              disabled={!personasPage || personasPage.items.length === 0}
              onClick={() => {
                if (personasPage) exportarCSV(personasPage.items);
              }}
            >
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
            {PENDING_FILTERS.map((label) => (
              <div
                className="toolbar-select-wrap"
                key={label}
                title="Filtro pendiente de endpoint"
                style={{ opacity: 0.5, cursor: "not-allowed" }}
              >
                <select className="toolbar-select" disabled>
                  <option>{label}</option>
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
                        <small>{item.correo ?? item.telefono ?? "â€”"}</small>
                      </div>

                      <div className="alert ok">Ver</div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="people-table">
                  <div className="table-head">
                    <span>Empleado</span>
                    <span>Municipio / InstituciÃ³n</span>
                    <span>Ingreso / Retiro</span>
                    <span>DocumentaciÃ³n</span>
                    <span>Alertas</span>
                    <span>AcciÃ³n</span>
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
                            <strong>â€”</strong>
                            <span>â€”</span>
                          </div>

                          <div className="cell-date">
                            <span>â€”</span>
                            <strong>â€”</strong>
                          </div>

                          <div className="cell-doc">â€”</div>

                          <div className="alert ok">â€”</div>

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
                <option value="25">25 por pÃ¡gina</option>
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
                <span style={{ padding: "0 2px", color: "var(--text-secondary)" }}>â€¦</span>
              )}

              {currentPage !== 1 && currentPage !== totalPages && (
                <button type="button" className="active-page">
                  {currentPage}
                </button>
              )}

              {totalPages > 2 && currentPage < totalPages - 1 && (
                <span style={{ padding: "0 2px", color: "var(--text-secondary)" }}>â€¦</span>
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
              persona={personaDetalle}
              personaLoading={personaLoading}
              personaError={personaError}
              identificaciones={identificaciones}
              identificacionesLoading={identificacionesLoading}
              identificacionesError={identificacionesError}
              vinculaciones={vinculaciones}
              vinculacionesLoading={vinculacionesLoading}
              vinculacionesError={vinculacionesError}
              expediente={expediente}
              consolidado={consolidado}
              consolidadoLoading={consolidadoLoading}
              expedienteLoading={expedienteLoading}
              expedienteError={expedienteError}
              onClose={handleClose}
              onShowToast={showToast}
              onPersonaUpdated={handlePersonaUpdated}
              onVinculacionChanged={handleVinculacionChanged}
            />
          </main>
        )}
      </section>

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: "var(--bg)",
            border: "1px solid var(--border-color)",
            borderRadius: 12,
            padding: "12px 18px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.14)",
            fontSize: 13,
            zIndex: 500,
            display: "flex",
            alignItems: "center",
            gap: 10,
            maxWidth: 360,
            color: "var(--text-primary)",
          }}
        >
          <CheckCircle size={15} style={{ color: "var(--color-primary)", flexShrink: 0 }} />
          {toast}
        </div>
      )}

      {showNuevoModal && (
        <NuevoEmpleadoModal
          onClose={() => setShowNuevoModal(false)}
          onSuccess={handleNuevoSuccess}
        />
      )}

      {showImportarModal && (
        <ImportarModal onClose={() => setShowImportarModal(false)} />
      )}
    </div>
  );
}

// â”€â”€ RIESGO color map â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const RIESGO_COLOR: Record<string, string> = {
  BAJO: "var(--color-success, #22c55e)",
  MEDIO: "var(--color-warning, #f59e0b)",
  ALTO: "var(--color-danger, #ef4444)",
  CRITICO: "var(--color-danger, #ef4444)",
};

const VINCULACION_STATUS_LABEL: Record<VinculacionApi["estado_vinculacion"], string> = {
  ACTIVA: "Activa",
  RETIRADA: "Retirada",
  SUSPENDIDA: "Suspendida",
};

function getVinculacionEstadoLabel(estado: VinculacionApi["estado_vinculacion"]): string {
  return VINCULACION_STATUS_LABEL[estado] ?? estado;
}

function formatVinculacionResumen(vinculacion: VinculacionApi): string {
  return [
    `Contrato ${vinculacion.contrato_id}`,
    `Cargo ${vinculacion.contrato_cargo_id}`,
    `Tipo ${vinculacion.tipo_vinculacion_id}`,
  ].join(" Â· ");
}

// â”€â”€ QuickEmployeeView â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function QuickEmployeeView({
  persona,
  personaLoading,
  personaError,
  identificaciones,
  identificacionesLoading,
  identificacionesError,
  vinculaciones,
  vinculacionesLoading,
  vinculacionesError,
  expediente,
  consolidado,
  consolidadoLoading,
  expedienteLoading,
  expedienteError,
  onClose,
  onShowToast,
  onPersonaUpdated,
  onVinculacionChanged,
}: {
  persona: PersonaApi | null;
  personaLoading: boolean;
  personaError: string | null;
  identificaciones: PersonaIdentificacionApi[] | null;
  identificacionesLoading: boolean;
  identificacionesError: string | null;
  vinculaciones: VinculacionApi[] | null;
  vinculacionesLoading: boolean;
  vinculacionesError: string | null;
  expediente: VinculacionExpedienteApi | null;
  consolidado: ExpedienteLaboralConsolidadoApi | null;
  consolidadoLoading: boolean;
  expedienteLoading: boolean;
  expedienteError: string | null;
  onClose: () => void;
  onShowToast: (msg: string) => void;
  onPersonaUpdated: (personaId: number) => void;
  onVinculacionChanged: () => void;
}) {
  const navigate = useNavigate();
  const [showMasAcciones, setShowMasAcciones] = useState(false);
  const [showEditarModal, setShowEditarModal] = useState(false);
  const [showCambiarIdentificacionModal, setShowCambiarIdentificacionModal] = useState(false);
  const [showRetirarModal, setShowRetirarModal] = useState(false);
  const [showSuspenderModal, setShowSuspenderModal] = useState(false);
  const [showReactivarModal, setShowReactivarModal] = useState(false);

  const personaActual = persona ?? consolidado?.persona ?? expediente?.persona ?? null;
  const vinculacionesActuales = vinculaciones ?? consolidado?.vinculaciones ?? [];
  const vinculacionPrincipal =
    expediente?.vinculacion
    ?? vinculacionesActuales.find((item) => item.estado_vinculacion === "ACTIVA")
    ?? vinculacionesActuales[0]
    ?? null;

  const identificacionVigente = (
    persona && 'identificacion_vigente' in persona ? persona.identificacion_vigente : null
  ) ?? consolidado?.persona.identificacion_vigente ?? identificaciones?.find((item) => item.es_vigente) ?? null;
  const documentoVigente = identificacionVigente?.numero_documento ?? personaActual?.numero_documento ?? "—";
  const nombreCompleto = personaActual ? buildNombreCompleto(personaActual) : "";
  const estado = vinculacionPrincipal?.estado_vinculacion;

  const checklistPct = consolidado?.indicadores.checklist_cumplimiento_promedio ?? null;
  const riesgoNivel = consolidado?.indicadores.riesgo_documental?.nivel ?? null;
  const alertasActivas = consolidado?.indicadores.alertas_activas ?? null;
  const checklistFaltantes = consolidado?.indicadores.checklist_faltantes ?? null;
  const docsVencidos = consolidado?.indicadores.documentos_vencidos ?? null;
  const recentAudit = consolidado?.auditoria.slice(0, 2) ?? [];
  const isInitialLoading = (personaLoading || expedienteLoading) && !personaActual;
  const showPersonaError = personaError && !personaActual;

  return (
    <div className="quick-employee-view">
      <div className="profile-actions">
        <span className="profile-view-label">Vista rÃ¡pida del colaborador</span>

        <div className="profile-actions-buttons">
          <button
            type="button"
            onClick={() => setShowEditarModal(true)}
            disabled={!personaActual}
          >
            <Edit3 size={17} />
            Editar
          </button>

          <button
            type="button"
            onClick={() => setShowCambiarIdentificacionModal(true)}
            disabled={!personaActual}
          >
            <IdCard size={17} />
            Identificación
          </button>

          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setShowMasAcciones((v) => !v)}
              disabled={!vinculacionPrincipal}
            >
              <MoreHorizontal size={18} />
              MÃ¡s acciones
              <ChevronDown size={15} />
            </button>

            {showMasAcciones && vinculacionPrincipal && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  right: 0,
                  background: "var(--bg)",
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                  boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
                  zIndex: 60,
                  minWidth: 210,
                  padding: "4px 0",
                }}
              >
                <button
                  type="button"
                  style={{ display: "block", width: "100%", padding: "9px 16px", textAlign: "left", background: "none", border: "none", cursor: "not-allowed", fontSize: 13, color: "var(--text-secondary)", opacity: 0.55 }}
                  title="Requiere catÃ¡logo de cargos â€” pendiente de endpoint"
                  disabled
                >
                  Cambio de cargo
                </button>
                <button
                  type="button"
                  style={{ display: "block", width: "100%", padding: "9px 16px", textAlign: "left", background: "none", border: "none", cursor: "not-allowed", fontSize: 13, color: "var(--text-secondary)", opacity: 0.55 }}
                  title="Requiere catÃ¡logo de municipios â€” pendiente de endpoint"
                  disabled
                >
                  Traslado de municipio
                </button>

                <div style={{ height: 1, background: "var(--border-color)", margin: "4px 0" }} />

                {estado === "ACTIVA" && (
                  <button
                    type="button"
                    style={{ display: "block", width: "100%", padding: "9px 16px", textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--color-warning, #f59e0b)" }}
                    onClick={() => { setShowSuspenderModal(true); setShowMasAcciones(false); }}
                  >
                    Suspender vinculaciÃ³n
                  </button>
                )}

                {estado === "SUSPENDIDA" && (
                  <button
                    type="button"
                    style={{ display: "block", width: "100%", padding: "9px 16px", textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--color-primary)" }}
                    onClick={() => { setShowReactivarModal(true); setShowMasAcciones(false); }}
                  >
                    Reactivar vinculaciÃ³n
                  </button>
                )}

                {(estado === "ACTIVA" || estado === "SUSPENDIDA") && (
                  <button
                    type="button"
                    style={{ display: "block", width: "100%", padding: "9px 16px", textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--color-danger)" }}
                    onClick={() => { setShowRetirarModal(true); setShowMasAcciones(false); }}
                  >
                    Retirar colaborador
                  </button>
                )}

                {estado === "RETIRADA" && (
                  <button
                    type="button"
                    style={{ display: "block", width: "100%", padding: "9px 16px", textAlign: "left", background: "none", border: "none", cursor: "not-allowed", fontSize: 13, color: "var(--text-secondary)", opacity: 0.55 }}
                    disabled
                    title="La vinculaciÃ³n ya estÃ¡ retirada"
                  >
                    Colaborador ya retirado
                  </button>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            title="Generar PDF del expediente â€” prÃ³ximamente disponible"
            onClick={() => onShowToast("GeneraciÃ³n de PDF del expediente: prÃ³ximamente disponible")}
          >
            <FileText size={17} />
          </button>

          <button
            type="button"
            className="profile-close-button"
            onClick={onClose}
            aria-label="Cerrar vista rÃ¡pida"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {isInitialLoading && (
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

      {showPersonaError && (
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
            Error al cargar el colaborador
          </p>
          <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{personaError}</p>
        </div>
      )}

      {expediente && (
        <>
          <section className="profile-hero">
            <div className="photo-wrap">
              <div
                className={`avatar ${getAvatarColor(expediente.persona.id)}`}
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.9rem",
                  fontWeight: 800,
                  borderRadius: "50%",
                }}
              >
                {getInitialsFromName(nombreCompleto)}
              </div>
              <span />
            </div>

            <div className="hero-main">
              <h2>{nombreCompleto}</h2>
              <p>{expediente.cargo.nombre_cargo ?? "â€”"}</p>

              <div className="hero-subtitle">
                <span>{expediente.empresa.nombre_empresa ?? "â€”"}</span>
                <i />
                <span>{expediente.tipo_vinculacion.nombre_vinculacion ?? "â€”"}</span>
                <b className={estado === "ACTIVA" ? "" : "retired"}>{estado}</b>
              </div>

              <div className="hero-chips">
                <div>
                  <MapPin size={17} />
                  {expediente.persona.pais_nacimiento ?? "â€”"}
                </div>
                <div>
                  <FileText size={17} />
                  {expediente.contrato.numero_contrato ?? "Sin contrato"}
                </div>
                <div>
                  <UserRound size={17} />
                  {expediente.cargo.nombre_cargo ?? "â€”"}
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
              title="InformaciÃ³n personal"
              rows={[
                ["Documento", documentoVigente],
                ["Fecha de nacimiento", formatFechaCorta(expediente.persona.fecha_nacimiento)],
                ["Edad", calcularEdad(expediente.persona.fecha_nacimiento)],
                ["Sexo", expediente.persona.sexo ?? "â€”"],
                ["Estado civil", expediente.persona.estado_civil ?? "â€”"],
                ["Grupo sanguÃ­neo", expediente.persona.tipo_sangre ?? "â€”"],
                ["DirecciÃ³n", expediente.persona.direccion ?? "â€”"],
                ["Barrio", expediente.persona.barrio ?? "â€”"],
                ["Zona", expediente.persona.zona ?? "â€”"],
              ]}
            />

            <InfoCard
              icon={<BriefcaseBusiness size={18} />}
              title="InformaciÃ³n laboral"
              rows={[
                ["Empresa", expediente.empresa.nombre_empresa ?? "â€”"],
                ["Contrato", expediente.contrato.numero_contrato ?? "â€”"],
                ["Cargo", expediente.cargo.nombre_cargo ?? "â€”"],
                ["Tipo vinculaciÃ³n", expediente.tipo_vinculacion.nombre_vinculacion ?? "â€”"],
                ["Sede", "â€”"],
                ["Modalidad", "â€”"],
                ["Municipio", "â€”"],
              ]}
            />

            <InfoCard
              icon={<ShieldCheck size={18} />}
              title="Afiliaciones"
              rows={[
                ["EPS", expediente.afiliaciones?.eps ?? "â€”"],
                ["AFP", expediente.afiliaciones?.pension ?? "â€”"],
                ["ARL", expediente.afiliaciones?.arl ?? "â€”"],
                ["Caja de compensaciÃ³n", expediente.afiliaciones?.caja_compensacion ?? "â€”"],
                ["CesantÃ­as", "â€”"],
              ]}
            />
          </section>

          <IdentificationHistoryCard
            persona={personaActual}
            expedientePersona={expediente.persona}
            identificaciones={identificaciones}
            identificacionesLoading={identificacionesLoading}
            identificacionesError={identificacionesError}
            onRequestChange={() => setShowCambiarIdentificacionModal(true)}
          />

          <section className="profile-card vinculaciones-card">
            <div className="card-title">
              <BriefcaseBusiness size={18} />
              <h3>Vinculaciones</h3>
            </div>

            {vinculacionesLoading && vinculacionesActuales.length === 0 ? (
              <div className="empty-card-state">Cargando vinculaciones...</div>
            ) : vinculacionesError && vinculacionesActuales.length === 0 ? (
              <div className="empty-card-state">{vinculacionesError}</div>
            ) : vinculacionesActuales.length === 0 ? (
              <div className="empty-card-state">Esta persona no tiene vinculaciones registradas.</div>
            ) : (
              <div className="vinculaciones-list">
                {vinculacionesActuales.map((vinculacion) => (
                  <div
                    key={vinculacion.id}
                    className={`vinculacion-row ${expediente.vinculacion.id === vinculacion.id ? "active" : ""}`}
                  >
                    <div className="vinculacion-main">
                      <strong>Vinculacion #{vinculacion.id}</strong>
                      <span>{formatVinculacionResumen(vinculacion)}</span>
                    </div>

                    <div className="vinculacion-meta">
                      <span>{formatFechaCorta(vinculacion.fecha_inicio)} - {formatFechaCorta(vinculacion.fecha_fin)}</span>
                      <b className={vinculacion.estado_vinculacion === "ACTIVA" ? "" : "retired"}>
                        {getVinculacionEstadoLabel(vinculacion.estado_vinculacion)}
                      </b>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <ExpedienteDocumentosPanel
            personaId={expediente.persona.id}
            vinculacionId={expediente.vinculacion.id}
          />

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
                  detail={`${expediente.cargo.nombre_cargo ?? "Cargo"} Â· ${expediente.empresa.nombre_empresa ?? "Empresa"}`}
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

              <button
                type="button"
                className="link-button"
                onClick={() => onShowToast("Historial completo: mÃ³dulo de auditorÃ­a prÃ³ximamente disponible")}
              >
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
                          : "â€”"}
                    </strong>
                  </div>
                </div>
                <p>DocumentaciÃ³n</p>
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
                <button
                  type="button"
                  onClick={() => onShowToast("Alertas activas: revise la pestaÃ±a Documentos del expediente")}
                >
                  <span className="status-icon warning">
                    <AlertTriangle size={12} />
                  </span>
                  <strong>{alertasActivas ?? (consolidadoLoading ? "..." : "â€”")}</strong>
                  Alertas activas
                  <ChevronRight size={15} />
                </button>

                <button
                  type="button"
                  onClick={() => onShowToast("Documentos faltantes: revise el checklist del expediente")}
                >
                  <span className="status-icon info">i</span>
                  <strong>{checklistFaltantes ?? (consolidadoLoading ? "..." : "â€”")}</strong>
                  Docs faltantes
                  <ChevronRight size={15} />
                </button>

                <button
                  type="button"
                  style={docsVencidos !== null && docsVencidos > 0 ? { color: "var(--color-danger)" } : undefined}
                  onClick={() => onShowToast("Documentos vencidos: revise la pestaÃ±a Documentos del expediente")}
                >
                  <span className="status-icon success">âœ“</span>
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

              <button
                type="button"
                className="repository-button"
                onClick={() => navigate(`/repositorio?persona_id=${expediente.persona.id}`)}
              >
                Ir al Repositorio documental <ChevronRight size={17} />
              </button>
            </div>
          </section>
        </>
      )}

      {personaActual && !expediente && (
        <>
          <section className="profile-hero">
            <div className="photo-wrap">
              <div
                className={`avatar ${getAvatarColor(personaActual.id)}`}
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.9rem",
                  fontWeight: 800,
                  borderRadius: "50%",
                }}
              >
                {getInitialsFromName(nombreCompleto)}
              </div>
              <span style={{ background: vinculacionesActuales.length > 0 ? "var(--color-warning)" : "var(--border-color)" }} />
            </div>

            <div className="hero-main">
              <h2>{nombreCompleto}</h2>
              <p>{vinculacionesActuales.length > 0 ? "Sin expediente activo" : "Sin vinculaciones registradas"}</p>

              <div className="hero-subtitle">
                <span>{vinculacionesActuales.length > 0 ? `${vinculacionesActuales.length} vinculacion(es)` : "Persona sin vinculacion"}</span>
                <i />
                <span>{personaActual.correo ?? personaActual.telefono ?? "Sin contacto principal"}</span>
                <b className="retired">
                  {vinculacionesActuales.length > 0 ? "Expediente no disponible" : "Sin vinculacion"}
                </b>
              </div>

              <div className="hero-chips">
                <div>
                  <MapPin size={17} />
                  {personaActual.pais_nacimiento ?? "â€”"}
                </div>
                <div>
                  <IdCard size={17} />
                  {documentoVigente}
                </div>
                <div>
                  <UserRound size={17} />
                  {personaActual.primer_apellido}
                </div>
                <div>
                  <CalendarDays size={17} />
                  {formatFechaCorta(personaActual.fecha_nacimiento)}
                </div>
              </div>
            </div>
          </section>

          <div className="profile-inline-message warning">
            {expedienteError ?? "No se pudo resolver un expediente activo para esta persona."}
          </div>

          <section className="profile-grid three">
            <InfoCard
              icon={<IdCard size={18} />}
              title="Informacion personal"
              rows={[
                ["Documento", documentoVigente],
                ["Fecha de nacimiento", formatFechaCorta(personaActual.fecha_nacimiento)],
                ["Edad", calcularEdad(personaActual.fecha_nacimiento)],
                ["Correo", personaActual.correo ?? "â€”"],
                ["Telefono", personaActual.telefono ?? "â€”"],
                ["Direccion", personaActual.direccion ?? "â€”"],
                ["Barrio", personaActual.barrio ?? "â€”"],
              ]}
            />

            <div className="profile-card vinculaciones-card">
              <div className="card-title">
                <BriefcaseBusiness size={18} />
                <h3>Vinculaciones</h3>
              </div>

              {vinculacionesLoading && vinculacionesActuales.length === 0 ? (
                <div className="empty-card-state">Cargando vinculaciones...</div>
              ) : vinculacionesError && vinculacionesActuales.length === 0 ? (
                <div className="empty-card-state">{vinculacionesError}</div>
              ) : vinculacionesActuales.length === 0 ? (
                <div className="empty-card-state">Esta persona no tiene vinculaciones registradas.</div>
              ) : (
                <div className="vinculaciones-list">
                  {vinculacionesActuales.map((vinculacion) => (
                    <div key={vinculacion.id} className="vinculacion-row">
                      <div className="vinculacion-main">
                        <strong>Vinculacion #{vinculacion.id}</strong>
                        <span>{formatVinculacionResumen(vinculacion)}</span>
                      </div>
                      <div className="vinculacion-meta">
                        <span>{formatFechaCorta(vinculacion.fecha_inicio)} - {formatFechaCorta(vinculacion.fecha_fin)}</span>
                        <b className={vinculacion.estado_vinculacion === "ACTIVA" ? "" : "retired"}>
                          {getVinculacionEstadoLabel(vinculacion.estado_vinculacion)}
                        </b>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="profile-card">
              <div className="card-title">
                <ShieldCheck size={18} />
                <h3>Expediente activo</h3>
              </div>
              <div className="empty-card-state">
                No hay expediente activo disponible para habilitar documentos y checklist.
              </div>
            </div>
          </section>

          <IdentificationHistoryCard
            persona={personaActual}
            expedientePersona={null}
            identificaciones={identificaciones}
            identificacionesLoading={identificacionesLoading}
            identificacionesError={identificacionesError}
            onRequestChange={() => setShowCambiarIdentificacionModal(true)}
          />
        </>
      )}

      {showEditarModal && personaActual && (
        <EditarEmpleadoModal
          persona={personaActual}
          onClose={() => setShowEditarModal(false)}
          onSuccess={() => {
            setShowEditarModal(false);
            onPersonaUpdated(personaActual.id);
          }}
        />
      )}

      {showCambiarIdentificacionModal && personaActual && (
        <ChangeIdentificationModal
          personaId={personaActual.id}
          currentIdentification={identificacionVigente}
          onClose={() => setShowCambiarIdentificacionModal(false)}
          onSuccess={() => {
            setShowCambiarIdentificacionModal(false);
            onPersonaUpdated(personaActual.id);
          }}
        />
      )}

      {showRetirarModal && vinculacionPrincipal && (
        <RetirarModal
          vinculacionId={vinculacionPrincipal.id}
          nombreCompleto={nombreCompleto}
          onClose={() => setShowRetirarModal(false)}
          onSuccess={() => {
            setShowRetirarModal(false);
            onVinculacionChanged();
          }}
        />
      )}

      {showSuspenderModal && vinculacionPrincipal && (
        <SuspenderModal
          vinculacionId={vinculacionPrincipal.id}
          nombreCompleto={nombreCompleto}
          onClose={() => setShowSuspenderModal(false)}
          onSuccess={() => {
            setShowSuspenderModal(false);
            onVinculacionChanged();
          }}
        />
      )}

      {showReactivarModal && vinculacionPrincipal && (
        <ReactivarModal
          vinculacionId={vinculacionPrincipal.id}
          nombreCompleto={nombreCompleto}
          onClose={() => setShowReactivarModal(false)}
          onSuccess={() => {
            setShowReactivarModal(false);
            onVinculacionChanged();
          }}
        />
      )}
    </div>
  );
}

// â”€â”€ InfoCard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ TimelineItem â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ FormError â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function FormError({ msg }: { msg: string }) {
  return (
    <div
      style={{
        background: "rgba(239,68,68,0.08)",
        border: "1px solid rgba(239,68,68,0.3)",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12.5,
        color: "var(--color-danger, #ef4444)",
        marginTop: 12,
      }}
    >
      {msg}
    </div>
  );
}

// â”€â”€ ModalHeader â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--text-primary)" }}>
        {title}
      </h3>
      <button
        type="button"
        onClick={onClose}
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: 4, display: "flex" }}
      >
        <X size={20} />
      </button>
    </div>
  );
}

// â”€â”€ ModalFooter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ModalFooter({
  onCancel,
  submitLabel,
  submitting,
  danger,
}: {
  onCancel: () => void;
  submitLabel: string;
  submitting: boolean;
  danger?: boolean;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
      <button
        type="button"
        onClick={onCancel}
        disabled={submitting}
        style={{ padding: "8px 18px", border: "1px solid var(--border-color)", borderRadius: 8, background: "transparent", color: "var(--text-secondary)", cursor: "pointer", fontSize: 13 }}
      >
        Cancelar
      </button>
      <button
        type="submit"
        disabled={submitting}
        style={{
          padding: "8px 20px",
          border: "none",
          borderRadius: 8,
          background: danger ? "var(--color-danger, #ef4444)" : "var(--color-primary)",
          color: "#fff",
          cursor: submitting ? "wait" : "pointer",
          fontSize: 13,
          fontWeight: 600,
          opacity: submitting ? 0.7 : 1,
        }}
      >
        {submitting ? "Procesando..." : submitLabel}
      </button>
    </div>
  );
}

// â”€â”€ NuevoEmpleadoModal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function NuevoEmpleadoModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (persona: PersonaApi) => void;
}) {
  const [form, setForm] = useState<CreatePersonaPayload>({
    tipo_documento_id: 0,
    numero_documento: "",
    primer_nombre: "",
    segundo_nombre: "",
    primer_apellido: "",
    segundo_apellido: "",
    correo: "",
    telefono: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  function set(field: keyof CreatePersonaPayload, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.primer_nombre.trim() || !form.primer_apellido.trim() || !form.numero_documento.trim()) {
      setApiError("Nombre, apellido y nÃºmero de documento son obligatorios.");
      return;
    }
    if (!form.tipo_documento_id || form.tipo_documento_id <= 0) {
      setApiError("Ingrese un ID de tipo de documento vÃ¡lido (nÃºmero mayor a 0).");
      return;
    }
    setSubmitting(true);
    setApiError(null);
    try {
      const payload: CreatePersonaPayload = {
        tipo_documento_id: form.tipo_documento_id,
        numero_documento: form.numero_documento.trim(),
        primer_nombre: form.primer_nombre.trim(),
        segundo_nombre: form.segundo_nombre?.trim() || null,
        primer_apellido: form.primer_apellido.trim(),
        segundo_apellido: form.segundo_apellido?.trim() || null,
        correo: form.correo?.trim() || null,
        telefono: form.telefono?.trim() || null,
      };
      const createdPersona = await createPersona(payload);
      onSuccess(createdPersona);
    } catch (err) {
      if (isPersonaDuplicateDocumentError(err)) {
        setApiError("Ya existe una persona con ese numero de documento.");
      } else {
        setApiError(err instanceof Error ? err.message : "Error al registrar el colaborador.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={MODAL_OVERLAY} onClick={onClose}>
      <div style={MODAL_BOX} onClick={(e) => e.stopPropagation()}>
        <ModalHeader title="Nuevo colaborador" onClose={onClose} />

        <div
          style={{
            background: "rgba(99,102,241,0.06)",
            border: "1px solid rgba(99,102,241,0.2)",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 18,
            fontSize: 12,
            color: "var(--text-secondary)",
            lineHeight: 1.55,
          }}
        >
          El ID del tipo de documento es un valor numÃ©rico del sistema (ej: 1 para CÃ©dula de ciudadanÃ­a).
          El catÃ¡logo de tipos estarÃ¡ disponible prÃ³ximamente.
        </div>

        <form onSubmit={(e) => { void handleSubmit(e); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={FIELD_LABEL}>
              ID Tipo de documento *
              <input
                type="number"
                min={1}
                required
                style={FIELD_INPUT}
                value={form.tipo_documento_id || ""}
                onChange={(e) => set("tipo_documento_id", parseInt(e.target.value) || 0)}
                placeholder="Ej: 1"
              />
            </label>

            <label style={FIELD_LABEL}>
              NÃºmero de documento *
              <input
                type="text"
                required
                style={FIELD_INPUT}
                value={form.numero_documento}
                onChange={(e) => set("numero_documento", e.target.value)}
                placeholder="1234567890"
              />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={FIELD_LABEL}>
                Primer nombre *
                <input
                  type="text"
                  required
                  style={FIELD_INPUT}
                  value={form.primer_nombre}
                  onChange={(e) => set("primer_nombre", e.target.value)}
                  placeholder="Juan"
                />
              </label>
              <label style={FIELD_LABEL}>
                Segundo nombre
                <input
                  type="text"
                  style={FIELD_INPUT}
                  value={form.segundo_nombre ?? ""}
                  onChange={(e) => set("segundo_nombre", e.target.value)}
                  placeholder="Carlos"
                />
              </label>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={FIELD_LABEL}>
                Primer apellido *
                <input
                  type="text"
                  required
                  style={FIELD_INPUT}
                  value={form.primer_apellido}
                  onChange={(e) => set("primer_apellido", e.target.value)}
                  placeholder="GarcÃ­a"
                />
              </label>
              <label style={FIELD_LABEL}>
                Segundo apellido
                <input
                  type="text"
                  style={FIELD_INPUT}
                  value={form.segundo_apellido ?? ""}
                  onChange={(e) => set("segundo_apellido", e.target.value)}
                  placeholder="LÃ³pez"
                />
              </label>
            </div>

            <label style={FIELD_LABEL}>
              Correo electrÃ³nico
              <input
                type="email"
                style={FIELD_INPUT}
                value={form.correo ?? ""}
                onChange={(e) => set("correo", e.target.value)}
                placeholder="colaborador@empresa.com"
              />
            </label>

            <label style={FIELD_LABEL}>
              TelÃ©fono
              <input
                type="text"
                style={FIELD_INPUT}
                value={form.telefono ?? ""}
                onChange={(e) => set("telefono", e.target.value)}
                placeholder="310 000 0000"
              />
            </label>
          </div>

          {apiError && <FormError msg={apiError} />}
          <ModalFooter onCancel={onClose} submitLabel="Registrar colaborador" submitting={submitting} />
        </form>
      </div>
    </div>
  );
}

// â”€â”€ EditarEmpleadoModal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function EditarEmpleadoModal({
  persona,
  onClose,
  onSuccess,
}: {
  persona: PersonaApi | VinculacionExpedientePersona;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    primer_nombre: persona.primer_nombre,
    segundo_nombre: persona.segundo_nombre ?? "",
    primer_apellido: persona.primer_apellido,
    segundo_apellido: persona.segundo_apellido ?? "",
    correo: persona.correo ?? "",
    telefono: persona.telefono ?? "",
    direccion: persona.direccion ?? "",
    barrio: persona.barrio ?? "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  function set(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.primer_nombre.trim() || !form.primer_apellido.trim()) {
      setApiError("Nombre y apellido son obligatorios.");
      return;
    }
    setSubmitting(true);
    setApiError(null);
    try {
      await updatePersona(persona.id, {
        primer_nombre: form.primer_nombre.trim(),
        segundo_nombre: form.segundo_nombre.trim() || null,
        primer_apellido: form.primer_apellido.trim(),
        segundo_apellido: form.segundo_apellido.trim() || null,
        correo: form.correo.trim() || null,
        telefono: form.telefono.trim() || null,
        direccion: form.direccion.trim() || null,
        barrio: form.barrio.trim() || null,
      });
      onSuccess();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Error al actualizar el colaborador.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={MODAL_OVERLAY} onClick={onClose}>
      <div style={MODAL_BOX} onClick={(e) => e.stopPropagation()}>
        <ModalHeader title="Editar colaborador" onClose={onClose} />

        <form onSubmit={(e) => { void handleSubmit(e); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={FIELD_LABEL}>
                Primer nombre *
                <input type="text" required style={FIELD_INPUT} value={form.primer_nombre}
                  onChange={(e) => set("primer_nombre", e.target.value)} />
              </label>
              <label style={FIELD_LABEL}>
                Segundo nombre
                <input type="text" style={FIELD_INPUT} value={form.segundo_nombre}
                  onChange={(e) => set("segundo_nombre", e.target.value)} />
              </label>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={FIELD_LABEL}>
                Primer apellido *
                <input type="text" required style={FIELD_INPUT} value={form.primer_apellido}
                  onChange={(e) => set("primer_apellido", e.target.value)} />
              </label>
              <label style={FIELD_LABEL}>
                Segundo apellido
                <input type="text" style={FIELD_INPUT} value={form.segundo_apellido}
                  onChange={(e) => set("segundo_apellido", e.target.value)} />
              </label>
            </div>

            <label style={FIELD_LABEL}>
              Correo electrÃ³nico
              <input type="email" style={FIELD_INPUT} value={form.correo}
                onChange={(e) => set("correo", e.target.value)} />
            </label>

            <label style={FIELD_LABEL}>
              TelÃ©fono
              <input type="text" style={FIELD_INPUT} value={form.telefono}
                onChange={(e) => set("telefono", e.target.value)} />
            </label>

            <label style={FIELD_LABEL}>
              DirecciÃ³n
              <input type="text" style={FIELD_INPUT} value={form.direccion}
                onChange={(e) => set("direccion", e.target.value)} />
            </label>

            <label style={FIELD_LABEL}>
              Barrio
              <input type="text" style={FIELD_INPUT} value={form.barrio}
                onChange={(e) => set("barrio", e.target.value)} />
            </label>
          </div>

          {apiError && <FormError msg={apiError} />}
          <ModalFooter onCancel={onClose} submitLabel="Guardar cambios" submitting={submitting} />
        </form>
      </div>
    </div>
  );
}

// â”€â”€ RetirarModal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function RetirarModal({
  vinculacionId,
  nombreCompleto,
  onClose,
  onSuccess,
}: {
  vinculacionId: number;
  nombreCompleto: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [fecha, setFecha] = useState(todayIso());
  const [motivo, setMotivo] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fecha) { setApiError("La fecha de retiro es obligatoria."); return; }
    setSubmitting(true);
    setApiError(null);
    try {
      await retirarVinculacion(vinculacionId, {
        fecha_retiro: fecha,
        motivo_retiro: motivo.trim() || null,
        observaciones: observaciones.trim() || null,
      });
      onSuccess();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Error al procesar el retiro.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={MODAL_OVERLAY} onClick={onClose}>
      <div style={{ ...MODAL_BOX, maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <ModalHeader title="Retirar colaborador" onClose={onClose} />

        <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-secondary)" }}>
          EstÃ¡ a punto de retirar a <strong style={{ color: "var(--text-primary)" }}>{nombreCompleto}</strong>.
          Esta acciÃ³n cambiarÃ¡ el estado de la vinculaciÃ³n a RETIRADA.
        </p>

        <form onSubmit={(e) => { void handleSubmit(e); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={FIELD_LABEL}>
              Fecha de retiro *
              <input type="date" required style={FIELD_INPUT} value={fecha}
                onChange={(e) => setFecha(e.target.value)} />
            </label>

            <label style={FIELD_LABEL}>
              Motivo de retiro
              <input type="text" style={FIELD_INPUT} value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej: Renuncia voluntaria, vencimiento de contrato..." />
            </label>

            <label style={FIELD_LABEL}>
              Observaciones
              <textarea
                style={{ ...FIELD_INPUT, resize: "vertical", minHeight: 72 }}
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Observaciones adicionales..."
              />
            </label>
          </div>

          {apiError && <FormError msg={apiError} />}
          <ModalFooter onCancel={onClose} submitLabel="Confirmar retiro" submitting={submitting} danger />
        </form>
      </div>
    </div>
  );
}

// â”€â”€ SuspenderModal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SuspenderModal({
  vinculacionId,
  nombreCompleto,
  onClose,
  onSuccess,
}: {
  vinculacionId: number;
  nombreCompleto: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [fecha, setFecha] = useState(todayIso());
  const [motivo, setMotivo] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fecha) { setApiError("La fecha de suspensiÃ³n es obligatoria."); return; }
    setSubmitting(true);
    setApiError(null);
    try {
      await suspenderVinculacion(vinculacionId, {
        fecha_suspension: fecha,
        motivo_suspension: motivo.trim() || null,
        observaciones: observaciones.trim() || null,
      });
      onSuccess();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Error al procesar la suspensiÃ³n.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={MODAL_OVERLAY} onClick={onClose}>
      <div style={{ ...MODAL_BOX, maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <ModalHeader title="Suspender vinculaciÃ³n" onClose={onClose} />

        <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-secondary)" }}>
          Se suspenderÃ¡ la vinculaciÃ³n activa de{" "}
          <strong style={{ color: "var(--text-primary)" }}>{nombreCompleto}</strong>.
        </p>

        <form onSubmit={(e) => { void handleSubmit(e); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={FIELD_LABEL}>
              Fecha de suspensiÃ³n *
              <input type="date" required style={FIELD_INPUT} value={fecha}
                onChange={(e) => setFecha(e.target.value)} />
            </label>

            <label style={FIELD_LABEL}>
              Motivo
              <input type="text" style={FIELD_INPUT} value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej: Licencia de maternidad, incapacidad..." />
            </label>

            <label style={FIELD_LABEL}>
              Observaciones
              <textarea
                style={{ ...FIELD_INPUT, resize: "vertical", minHeight: 64 }}
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
              />
            </label>
          </div>

          {apiError && <FormError msg={apiError} />}
          <ModalFooter onCancel={onClose} submitLabel="Suspender" submitting={submitting} />
        </form>
      </div>
    </div>
  );
}

// â”€â”€ ReactivarModal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ReactivarModal({
  vinculacionId,
  nombreCompleto,
  onClose,
  onSuccess,
}: {
  vinculacionId: number;
  nombreCompleto: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [fecha, setFecha] = useState(todayIso());
  const [observaciones, setObservaciones] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setApiError(null);
    try {
      await reactivarVinculacion(vinculacionId, {
        fecha_reactivacion: fecha || undefined,
        observaciones: observaciones.trim() || null,
      });
      onSuccess();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Error al reactivar la vinculaciÃ³n.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={MODAL_OVERLAY} onClick={onClose}>
      <div style={{ ...MODAL_BOX, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <ModalHeader title="Reactivar vinculaciÃ³n" onClose={onClose} />

        <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-secondary)" }}>
          Se reactivarÃ¡ la vinculaciÃ³n de{" "}
          <strong style={{ color: "var(--text-primary)" }}>{nombreCompleto}</strong>.
        </p>

        <form onSubmit={(e) => { void handleSubmit(e); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={FIELD_LABEL}>
              Fecha de reactivaciÃ³n
              <input type="date" style={FIELD_INPUT} value={fecha}
                onChange={(e) => setFecha(e.target.value)} />
            </label>

            <label style={FIELD_LABEL}>
              Observaciones
              <textarea
                style={{ ...FIELD_INPUT, resize: "vertical", minHeight: 64 }}
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
              />
            </label>
          </div>

          {apiError && <FormError msg={apiError} />}
          <ModalFooter onCancel={onClose} submitLabel="Reactivar" submitting={submitting} />
        </form>
      </div>
    </div>
  );
}

// â”€â”€ ImportarModal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ImportarModal({ onClose }: { onClose: () => void }) {
  return (
    <div style={MODAL_OVERLAY} onClick={onClose}>
      <div style={{ ...MODAL_BOX, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <ModalHeader title="Importar desde Excel" onClose={onClose} />

        <div
          style={{
            background: "rgba(99,102,241,0.06)",
            border: "1px dashed rgba(99,102,241,0.4)",
            borderRadius: 10,
            padding: "28px 20px",
            textAlign: "center",
            marginBottom: 16,
          }}
        >
          <Upload size={32} style={{ color: "var(--color-primary)", marginBottom: 10, opacity: 0.7 }} />
          <p style={{ margin: "0 0 6px", fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" }}>
            ImportaciÃ³n masiva pendiente de endpoint
          </p>
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.55 }}>
            El endpoint de importaciÃ³n desde Excel no estÃ¡ disponible aÃºn en el backend.
            Registre colaboradores individualmente desde el botÃ³n{" "}
            <strong>Nuevo empleado</strong>.
          </p>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: "8px 20px", border: "1px solid var(--border-color)", borderRadius: 8, background: "transparent", color: "var(--text-secondary)", cursor: "pointer", fontSize: 13 }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}










