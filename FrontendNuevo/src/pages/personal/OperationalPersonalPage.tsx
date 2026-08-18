import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  Download,
  FileText,
  FolderOpen,
  RefreshCw,
  Search,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import { ApiClientError } from "../../services/apiClient";
import { configuracionApi } from "../../services/configuracionApi";
import {
  getContractPersonal,
  getVinculacionExpediente,
} from "../../services/vinculacionesApi";
import type { CatalogoItem, Contrato, Empresa } from "../../types/configuracion.types";
import type { VinculacionEstado, VinculacionExpedienteApi } from "../../types/personas.types";
import type { ContractPersonalListResponse } from "../../types/vinculaciones.types";
import ExpedienteDocumentosPanel from "./ExpedienteDocumentosPanel";
import "./OperationalPersonalPage.css";

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [25, 50, 100];

type PersonalRow = {
  vinculacion_id: number;
  numero_documento: string;
  nombre_completo: string;
  cargo_nombre: string | null;
  estado_vinculacion: VinculacionEstado;
  fecha_ingreso: string;
};

type PersonalTableData = {
  items: PersonalRow[];
  pagination: ContractPersonalListResponse["pagination"];
};

function hasAnyPermission(current: string[], expected: string[]): boolean {
  return expected.some((permission) => current.includes(permission));
}

function buildNombreCompleto(persona: {
  primer_nombre: string;
  segundo_nombre: string | null;
  primer_apellido: string;
  segundo_apellido: string | null;
}): string {
  return [
    persona.primer_nombre,
    persona.segundo_nombre,
    persona.primer_apellido,
    persona.segundo_apellido,
  ]
    .filter(Boolean)
    .join(" ");
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "Sin fecha";
  }

  try {
    return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" }).format(
      new Date(`${value}T00:00:00`)
    );
  } catch {
    return value;
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

function getStatusLabel(status: VinculacionEstado): string {
  if (status === "ACTIVA") return "Activa";
  if (status === "RETIRADA") return "Retirada";
  return "Suspendida";
}

export default function OperationalPersonalPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];

  const canReadContext = hasAnyPermission(permissions, [
    "configuracion.read",
    "empresas.read",
    "contratos.read",
    "contracts.read",
  ]);
  const canReadPersonal = permissions.includes("vinculaciones.read");
  const canCreateVinculacion = permissions.includes("vinculaciones.create");

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [cargos, setCargos] = useState<CatalogoItem[]>([]);
  const [tiposDocumento, setTiposDocumento] = useState<CatalogoItem[]>([]);

  const [empresaId, setEmpresaId] = useState<number | null>(null);
  const [contratoId, setContratoId] = useState<number | null>(null);
  const [cargoId, setCargoId] = useState<string>("");
  const [estadoFiltro, setEstadoFiltro] = useState<"" | VinculacionEstado>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [refreshIndex, setRefreshIndex] = useState(0);

  const [tableData, setTableData] = useState<PersonalTableData | null>(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableError, setTableError] = useState("");

  const [selectedVinculacionId, setSelectedVinculacionId] = useState<number | null>(null);
  const [selectedExpediente, setSelectedExpediente] = useState<VinculacionExpedienteApi | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [selectedError, setSelectedError] = useState("");

  const searchValue = search.trim();
  const importMessage =
    "Existe backend de importaciones personas-vinculaciones, pero el flujo UI de lotes, validación y confirmación todavía no está integrado en /personal.";
  const exportMessage =
    "No existe todavía un endpoint exportable de personal por contrato que respete filtros activos fuera de la página visible.";

  useEffect(() => {
    if (!canReadContext) {
      return;
    }

    let cancelled = false;

    async function loadEmpresas() {
      try {
        const response = await configuracionApi.listarEmpresas({
          page: 1,
          limit: 100,
          activo: true,
        });

        if (cancelled) return;

        setEmpresas(response.items);
        setEmpresaId((current) => {
          if (current && response.items.some((empresa) => empresa.id === current)) {
            return current;
          }
          return response.items[0]?.id ?? null;
        });
      } catch {
        if (!cancelled) {
          setEmpresas([]);
          setEmpresaId(null);
        }
      }
    }

    void loadEmpresas();

    return () => {
      cancelled = true;
    };
  }, [canReadContext]);

  useEffect(() => {
    if (!canReadContext || !empresaId) {
      setContratos([]);
      setContratoId(null);
      return;
    }

    let cancelled = false;
    const currentEmpresaId = empresaId;

    async function loadContratos() {
      try {
        const response = await configuracionApi.listarContratos({
          page: 1,
          limit: 100,
          activo: true,
          empresa_id: currentEmpresaId,
        });

        if (cancelled) return;

        setContratos(response.items);
        setContratoId((current) => {
          if (current && response.items.some((contrato) => contrato.id === current)) {
            return current;
          }
          return response.items[0]?.id ?? null;
        });
      } catch {
        if (!cancelled) {
          setContratos([]);
          setContratoId(null);
        }
      }
    }

    void loadContratos();

    return () => {
      cancelled = true;
    };
  }, [canReadContext, empresaId]);

  useEffect(() => {
    if (!canReadContext || !contratoId) {
      setCargos([]);
      setCargoId("");
      return;
    }

    let cancelled = false;
    const currentContratoId = contratoId;

    async function loadCargos() {
      try {
        const response = await configuracionApi.listarCargos({
          page: 1,
          limit: 100,
          contrato_id: currentContratoId,
          activo: true,
        });

        if (cancelled) return;

        const nextCargos = response.items.map((item) => ({
          id: item.id,
          label: item.nombre_cargo,
        }));
        setCargos(nextCargos);
        setCargoId((current) =>
          current && nextCargos.some((item) => String(item.id) === current) ? current : ""
        );
      } catch {
        if (!cancelled) {
          setCargos([]);
          setCargoId("");
        }
      }
    }

    void loadCargos();

    return () => {
      cancelled = true;
    };
  }, [canReadContext, contratoId]);

  useEffect(() => {
    if (!canReadContext) {
      return;
    }

    let cancelled = false;

    async function loadTiposDocumento() {
      try {
        const response = await configuracionApi.listarTiposDocumento({
          page: 1,
          limit: 100,
          activo: true,
        });

        if (!cancelled) {
          setTiposDocumento(response.items);
        }
      } catch {
        if (!cancelled) {
          setTiposDocumento([]);
        }
      }
    }

    void loadTiposDocumento();

    return () => {
      cancelled = true;
    };
  }, [canReadContext]);

  useEffect(() => {
    if (!canReadPersonal || !contratoId) {
      setTableData(null);
      setTableError("");
      setSelectedVinculacionId(null);
      setSelectedExpediente(null);
      return;
    }

    let cancelled = false;
    const currentContratoId = contratoId;

    async function loadPersonal() {
      setTableLoading(true);
      setTableError("");

      try {
        const response = await getContractPersonal({
          contrato_id: currentContratoId,
          contrato_cargo_id: cargoId ? Number(cargoId) : undefined,
          estado_vinculacion: estadoFiltro || undefined,
          search: searchValue || undefined,
          page,
          limit: pageSize,
        });

        if (cancelled) return;

        const nextData: PersonalTableData = {
          items: response.items.map((item) => ({
            vinculacion_id: item.vinculacion_id,
            numero_documento: item.numero_documento,
            nombre_completo: item.nombre_completo,
            cargo_nombre: item.cargo.nombre_cargo,
            estado_vinculacion: item.estado_vinculacion,
            fecha_ingreso: item.fecha_ingreso,
          })),
          pagination: response.pagination,
        };

        setTableData(nextData);
        setSelectedVinculacionId((current) =>
          current && nextData.items.some((item) => item.vinculacion_id === current) ? current : null
        );
      } catch (error) {
        if (!cancelled) {
          setTableData(null);
          setSelectedVinculacionId(null);
          setSelectedExpediente(null);
          setTableError(getErrorMessage(error, "No fue posible cargar el personal del contrato."));
        }
      } finally {
        if (!cancelled) {
          setTableLoading(false);
        }
      }
    }

    void loadPersonal();

    return () => {
      cancelled = true;
    };
  }, [
    canReadPersonal,
    cargoId,
    contratoId,
    estadoFiltro,
    page,
    pageSize,
    refreshIndex,
    searchValue,
  ]);

  useEffect(() => {
    if (!selectedVinculacionId) {
      setSelectedExpediente(null);
      setSelectedError("");
      return;
    }

    let cancelled = false;
    const currentVinculacionId = selectedVinculacionId;

    async function loadExpediente() {
      setSelectedLoading(true);
      setSelectedError("");

      try {
        const response = await getVinculacionExpediente(currentVinculacionId);
        if (!cancelled) {
          setSelectedExpediente(response);
        }
      } catch (error) {
        if (!cancelled) {
          setSelectedExpediente(null);
          setSelectedError(getErrorMessage(error, "No fue posible abrir el expediente."));
        }
      } finally {
        if (!cancelled) {
          setSelectedLoading(false);
        }
      }
    }

    void loadExpediente();

    return () => {
      cancelled = true;
    };
  }, [refreshIndex, selectedVinculacionId]);

  useEffect(() => {
    setPage(1);
  }, [cargoId, contratoId, empresaId, estadoFiltro, pageSize, searchValue]);

  function buildManagementUrl(openAdd = false): string {
    const params = new URLSearchParams();

    if (empresaId) {
      params.set("empresa_id", String(empresaId));
    }

    if (contratoId) {
      params.set("contrato_id", String(contratoId));
    }

    if (openAdd) {
      params.set("open_add", "1");
    }

    const query = params.toString();
    return query
      ? `/administracion/vinculaciones?${query}`
      : "/administracion/vinculaciones";
  }

  function closeDrawer() {
    setSelectedVinculacionId(null);
    setSelectedExpediente(null);
    setSelectedError("");
  }

  if (!canReadContext || !canReadPersonal) {
    return (
      <div className="op-personal-page">
        <div className="op-state error">
          <AlertTriangle size={16} />
          No tienes permisos para consultar empresas, contratos o personal vinculado.
        </div>
      </div>
    );
  }

  return (
    <div className="op-personal-page">
      <header className="op-header">
        <div className="op-header-copy">
          <span className="op-eyebrow">Personal</span>
          <div className="op-header-title-row">
            <h1>Personal del contrato</h1>
            <button
              type="button"
              className="op-button ghost"
              onClick={() => navigate(buildManagementUrl(false))}
            >
              <BriefcaseBusiness size={15} />
              Gestionar vinculaciones
            </button>
          </div>
          <p>Consulta masiva, búsqueda operativa y acceso rápido al expediente sin salir del contexto contractual.</p>
        </div>
      </header>

      <section className="op-context-bar">
        <label className="op-context-field">
          <span>Empresa</span>
          <div className="op-context-control">
            <Building2 size={14} />
            <select
              value={empresaId ?? ""}
              onChange={(event) => {
                setEmpresaId(event.target.value ? Number(event.target.value) : null);
                setContratoId(null);
                setSelectedVinculacionId(null);
                setSelectedExpediente(null);
                setSelectedError("");
              }}
            >
              <option value="">Seleccionar empresa</option>
              {empresas.map((empresa) => (
                <option key={empresa.id} value={empresa.id}>
                  {empresa.nombre_empresa}
                </option>
              ))}
            </select>
          </div>
        </label>

        <label className="op-context-field">
          <span>Contrato</span>
          <div className="op-context-control">
            <FileText size={14} />
            <select
              value={contratoId ?? ""}
              onChange={(event) => {
                setContratoId(event.target.value ? Number(event.target.value) : null);
                setSelectedVinculacionId(null);
                setSelectedExpediente(null);
                setSelectedError("");
              }}
              disabled={!empresaId}
            >
              <option value="">Seleccionar contrato</option>
              {contratos.map((contrato) => (
                <option key={contrato.id} value={contrato.id}>
                  {contrato.numero_contrato}
                </option>
              ))}
            </select>
          </div>
        </label>
      </section>

      <section className="op-tools-card">
        <div className="op-tools-main">
          <label className="op-search" aria-label="Buscar por documento o nombre">
            <Search size={15} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar documento, nombres o apellidos..."
            />
          </label>

          <div className="op-filters">
            <label className="op-filter">
              <BriefcaseBusiness size={14} />
              <select
                value={cargoId}
                onChange={(event) => setCargoId(event.target.value)}
                disabled={!contratoId}
              >
                <option value="">Todos los cargos</option>
                {cargos.map((cargo) => (
                  <option key={cargo.id} value={cargo.id}>
                    {cargo.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="op-filter">
              <Users size={14} />
              <select
                value={estadoFiltro}
                onChange={(event) => setEstadoFiltro(event.target.value as "" | VinculacionEstado)}
                disabled={!contratoId}
              >
                <option value="">Todos los estados</option>
                <option value="ACTIVA">Activa</option>
                <option value="SUSPENDIDA">Suspendida</option>
                <option value="RETIRADA">Retirada</option>
              </select>
            </label>
          </div>
        </div>

        <div className="op-tools-actions">
          <button
            type="button"
            className="op-button secondary"
            disabled
            title={importMessage}
            aria-disabled="true"
          >
            <Upload size={15} />
            Importar
          </button>
          <button
            type="button"
            className="op-button secondary"
            disabled
            title={exportMessage}
            aria-disabled="true"
          >
            <Download size={15} />
            Exportar
          </button>
          <button
            type="button"
            className="op-button secondary"
            onClick={() => setRefreshIndex((current) => current + 1)}
          >
            <RefreshCw size={15} />
            Actualizar
          </button>
          <button
            type="button"
            className="op-button primary"
            onClick={() => navigate(buildManagementUrl(true))}
            disabled={!contratoId || !canCreateVinculacion}
          >
            <UserPlus size={15} />
            Nuevo trabajador
          </button>
        </div>
      </section>

      <section className="op-table-card">
        <div className="op-card-header">
          <div>
            <span className="op-eyebrow">Listado</span>
            <h2>Personal del contrato</h2>
          </div>

          <div className="op-card-meta">
            <span className="op-count">
              {tableData?.pagination.total ? tableData.pagination.total.toLocaleString("es-CO") : "0"}
            </span>
            <label className="op-page-size">
              <span>Filas</span>
              <select
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
                disabled={!contratoId || tableLoading}
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {!contratoId ? (
          <div className="op-empty">Selecciona empresa y contrato para abrir la vista operativa.</div>
        ) : tableError ? (
          <div className="op-state error">
            <AlertTriangle size={16} />
            {tableError}
          </div>
        ) : tableLoading && !tableData ? (
          <div className="op-empty">Cargando personal del contrato...</div>
        ) : (
          <>
            <div className="op-table-scroll">
              <table className="op-table">
                <thead>
                  <tr>
                    <th className="is-document">Documento</th>
                    <th className="is-name">Nombre completo</th>
                    <th className="is-role">Cargo</th>
                    <th className="is-status">Estado</th>
                    <th className="is-date">Ingreso</th>
                    <th className="is-action">Expediente</th>
                  </tr>
                </thead>
                <tbody>
                  {(tableData?.items ?? []).length === 0 && (
                    <tr>
                      <td colSpan={6} className="op-empty-row">
                        No hay personal vinculado a este contrato con los filtros actuales.
                      </td>
                    </tr>
                  )}
                  {(tableData?.items ?? []).map((item) => (
                    <tr
                      key={item.vinculacion_id}
                      className={item.vinculacion_id === selectedVinculacionId ? "is-selected" : ""}
                      onClick={() => setSelectedVinculacionId(item.vinculacion_id)}
                    >
                      <td className="op-mono">{item.numero_documento}</td>
                      <td className="op-name-cell">{item.nombre_completo}</td>
                      <td>{item.cargo_nombre ?? "Sin cargo"}</td>
                      <td>
                        <span className={`op-badge status-${item.estado_vinculacion.toLowerCase()}`}>
                          {getStatusLabel(item.estado_vinculacion)}
                        </span>
                      </td>
                      <td>{formatDate(item.fecha_ingreso)}</td>
                      <td>
                        <button
                          type="button"
                          className="op-link-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedVinculacionId(item.vinculacion_id);
                          }}
                        >
                          Ver <ArrowRight size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="op-pagination">
              <span>
                {tableData?.pagination.total
                  ? `${(tableData.pagination.page - 1) * tableData.pagination.limit + 1} - ${Math.min(
                      tableData.pagination.page * tableData.pagination.limit,
                      tableData.pagination.total
                    )} de ${tableData.pagination.total}`
                  : "Sin resultados"}
              </span>

              <div className="op-pagination-actions">
                <button
                  type="button"
                  className="op-button secondary"
                  disabled={!tableData || tableData.pagination.page <= 1 || tableLoading}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  className="op-button secondary"
                  disabled={
                    !tableData ||
                    tableData.pagination.page >= tableData.pagination.total_pages ||
                    tableLoading
                  }
                  onClick={() => setPage((current) => current + 1)}
                >
                  Siguiente
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {selectedVinculacionId !== null && (
        <div className="op-drawer-layer" onClick={closeDrawer}>
          <aside className="op-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="op-drawer-header">
              <div>
                <span className="op-eyebrow">Expediente</span>
                <h2>Expediente del trabajador</h2>
                <p>Consulta datos de vinculación y gestiona documentos sin salir del contrato actual.</p>
              </div>
              <button
                type="button"
                className="op-close-button"
                onClick={closeDrawer}
                aria-label="Cerrar expediente"
              >
                <X size={16} />
              </button>
            </div>

            <div className="op-drawer-body">
              {selectedError ? (
                <div className="op-state error">
                  <AlertTriangle size={16} />
                  {selectedError}
                </div>
              ) : selectedLoading && !selectedExpediente ? (
                <div className="op-empty">Abriendo expediente...</div>
              ) : !selectedExpediente ? (
                <div className="op-empty">Selecciona una vinculación para abrir su expediente.</div>
              ) : (
                <>
                  <div className="op-summary-grid">
                    <div className="op-summary-item">
                      <span>Trabajador</span>
                      <strong>{buildNombreCompleto(selectedExpediente.persona)}</strong>
                    </div>
                    <div className="op-summary-item">
                      <span>Documento</span>
                      <strong>{selectedExpediente.persona.numero_documento}</strong>
                    </div>
                    <div className="op-summary-item">
                      <span>Cargo</span>
                      <strong>{selectedExpediente.cargo.nombre_cargo ?? "Sin cargo"}</strong>
                    </div>
                    <div className="op-summary-item">
                      <span>Estado</span>
                      <strong>{getStatusLabel(selectedExpediente.vinculacion.estado_vinculacion)}</strong>
                    </div>
                    <div className="op-summary-item">
                      <span>Ingreso</span>
                      <strong>{formatDate(selectedExpediente.vinculacion.fecha_inicio)}</strong>
                    </div>
                    <div className="op-summary-item">
                      <span>Documentos</span>
                      <strong>
                        {selectedExpediente.documentos_persona.length +
                          selectedExpediente.documentos_vinculacion.length}
                      </strong>
                    </div>
                  </div>

                  <div className="op-drawer-actions">
                    <button
                      type="button"
                      className="op-button secondary"
                      onClick={() => navigate(buildManagementUrl(true))}
                    >
                      <UserPlus size={15} />
                      Nuevo trabajador
                    </button>
                    <button
                      type="button"
                      className="op-button ghost"
                      onClick={() => navigate(buildManagementUrl(false))}
                    >
                      <FolderOpen size={15} />
                      Modo avanzado
                    </button>
                  </div>

                  <ExpedienteDocumentosPanel
                    personaId={selectedExpediente.persona.id}
                    vinculacionId={selectedExpediente.vinculacion.id}
                    tipoDocumentoOptions={tiposDocumento}
                  />
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
