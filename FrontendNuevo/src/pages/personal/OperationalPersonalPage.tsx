import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  Download,
  FileText,
  RefreshCw,
  Search,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import { ApiClientError } from "../../services/apiClient";
import { configuracionApi } from "../../services/configuracionApi";
import {
  getContractPersonal,
  getContractPersonalFilterOptions,
  getVinculacionExpediente,
} from "../../services/vinculacionesApi";
import type { CatalogoItem, Contrato, Empresa } from "../../types/configuracion.types";
import type { VinculacionEstado, VinculacionExpedienteApi } from "../../types/personas.types";
import type { ContractPersonalFilterOptions, ContractPersonalListResponse } from "../../types/vinculaciones.types";
import PersonalMasterDrawer from "./PersonalMasterDrawer";
import OperationalImportModal from "./OperationalImportModal";
import "./OperationalPersonalPage.css";

const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [25, 50, 100];

type PersonalRow = {
  vinculacion_id: number;
  numero_documento: string;
  nombre_completo: string;
  cargo_nombre: string | null;
  estado_vinculacion: VinculacionEstado;
  fecha_ingreso: string;
  asignacion_actual: { nombre: string | null; institucion: string | null; municipio: string | null; sede: string | null; modalidad: string | null };
  presentada_licitacion_actual: boolean;
  perfil_licitacion_actual: string | null;
};

type PersonalTableData = {
  items: PersonalRow[];
  pagination: ContractPersonalListResponse["pagination"];
};

function hasAnyPermission(current: string[], expected: string[]): boolean {
  return expected.some((permission) => current.includes(permission));
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
  const canImportPersonal = permissions.includes("importaciones.upload") && permissions.includes("importaciones.read");
  const canConfirmImport = permissions.includes("importaciones.confirm");

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [cargos, setCargos] = useState<CatalogoItem[]>([]);
  const [tiposDocumento, setTiposDocumento] = useState<CatalogoItem[]>([]);
  const [tiposIdentificacion, setTiposIdentificacion] = useState<CatalogoItem[]>([]);

  const [empresaId, setEmpresaId] = useState<number | null>(null);
  const [contratoId, setContratoId] = useState<number | null>(null);
  const [cargoId, setCargoId] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState<"" | VinculacionEstado>("");
  const [search, setSearch] = useState("");
  const [fechaConsulta, setFechaConsulta] = useState(() => new Date().toISOString().slice(0, 10));
  const [municipioId, setMunicipioId] = useState("");
  const [institucionId, setInstitucionId] = useState("");
  const [sedeId, setSedeId] = useState("");
  const [modalidadId, setModalidadId] = useState("");
  const [ubicacionId, setUbicacionId] = useState("");
  const [coberturaFiltro, setCoberturaFiltro] = useState<"" | "SI" | "NO" | "RETIRADA">("");
  const [licitacionFiltro, setLicitacionFiltro] = useState<"" | "PRESENTADA" | "NO_PRESENTADA">("");
  const [filterOptions, setFilterOptions] = useState<ContractPersonalFilterOptions>({ municipios: [], instituciones: [], sedes: [], modalidades: [], ubicaciones_laborales: [] });
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
  const [showImportModal, setShowImportModal] = useState(false);

  const searchValue = search.trim();
  const empresaSeleccionada = empresas.find((empresa) => empresa.id === empresaId) ?? null;
  const contratoSeleccionado = contratos.find((contrato) => contrato.id === contratoId) ?? null;

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
        const [documentosResponse, identificacionesResponse] = await Promise.all([
          configuracionApi.listarTiposDocumento({
            page: 1,
            limit: 200,
            activo: true,
          }),
          configuracionApi.listarTiposDocumento({
            page: 1,
            limit: 200,
            activo: true,
            es_identificacion_personal: true,
          }),
        ]);

        if (!cancelled) {
          setTiposDocumento(documentosResponse.items);
          setTiposIdentificacion(identificacionesResponse.items);
        }
      } catch {
        if (!cancelled) {
          setTiposDocumento([]);
          setTiposIdentificacion([]);
        }
      }
    }

    void loadTiposDocumento();

    return () => {
      cancelled = true;
    };
  }, [canReadContext]);

  useEffect(() => {
    if (!contratoId) {
      setFilterOptions({ municipios: [], instituciones: [], sedes: [], modalidades: [], ubicaciones_laborales: [] });
      return;
    }
    let cancelled = false;
    void getContractPersonalFilterOptions({ contrato_id: contratoId, municipio_id: municipioId ? Number(municipioId) : undefined, institucion_id: institucionId ? Number(institucionId) : undefined, sede_id: sedeId ? Number(sedeId) : undefined, fecha: fechaConsulta }).then((options) => {
      if (!cancelled) {
        setFilterOptions(options);
        if (institucionId && !options.instituciones.some((item) => String(item.id) === institucionId)) { setInstitucionId(""); setSedeId(""); setModalidadId(""); }
        if (sedeId && !options.sedes.some((item) => String(item.id) === sedeId)) { setSedeId(""); setModalidadId(""); }
        if (modalidadId && !options.modalidades.some((item) => String(item.id) === modalidadId)) setModalidadId("");
      }
    }).catch(() => {
      if (!cancelled) setFilterOptions({ municipios: [], instituciones: [], sedes: [], modalidades: [], ubicaciones_laborales: [] });
    });
    return () => { cancelled = true; };
  }, [contratoId, fechaConsulta, municipioId, institucionId, sedeId, modalidadId]);

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
          fecha: fechaConsulta,
          municipio_id: municipioId ? Number(municipioId) : undefined,
          institucion_id: institucionId ? Number(institucionId) : undefined,
          sede_id: sedeId ? Number(sedeId) : undefined,
          modalidad_id: modalidadId ? Number(modalidadId) : undefined,
          ubicacion_laboral_id: ubicacionId ? Number(ubicacionId) : undefined,
          cobertura: coberturaFiltro || undefined,
          licitacion: licitacionFiltro || undefined,
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
            asignacion_actual: item.asignacion_actual,
            presentada_licitacion_actual: item.presentada_licitacion_actual,
            perfil_licitacion_actual: item.perfil_licitacion_actual,
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
    fechaConsulta,
    municipioId,
    institucionId,
    sedeId,
    modalidadId,
    ubicacionId,
    coberturaFiltro,
    licitacionFiltro,
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
  }, [cargoId, contratoId, empresaId, estadoFiltro, fechaConsulta, pageSize, searchValue, municipioId, institucionId, sedeId, modalidadId, ubicacionId, coberturaFiltro, licitacionFiltro]);

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
              <option value="">Empresa</option>
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
              <option value="">Contrato</option>
              {contratos.map((contrato) => (
                <option key={contrato.id} value={contrato.id}>
                  {contrato.numero_contrato}
                </option>
              ))}
            </select>
          </div>
        </label>

        <div className="op-context-actions">
          <button
            type="button"
            className="op-button ghost"
            onClick={() => navigate(buildManagementUrl(false))}
          >
            <BriefcaseBusiness size={15} />
            Gestionar vinculaciones
          </button>
        </div>
      </section>

      <section className="op-tools-bar">
        <div className="op-tools-row">
          <label className="op-search" aria-label="Buscar por documento o nombre">
            <Search size={15} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar documento, nombres o apellidos..."
            />
          </label>

          <div className="op-filters">
            <label className="op-filter"><span>Municipio</span><select value={municipioId} onChange={(event) => { setMunicipioId(event.target.value); setInstitucionId(""); setSedeId(""); setModalidadId(""); }} disabled={!contratoId}><option value="">Todos</option>{filterOptions.municipios.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
            <label className="op-filter"><span>InstituciÃ³n</span><select value={institucionId} onChange={(event) => { setInstitucionId(event.target.value); setSedeId(""); setModalidadId(""); }} disabled={!contratoId || !municipioId}><option value="">Todas</option>{filterOptions.instituciones.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
            <label className="op-filter"><span>Sede</span><select value={sedeId} onChange={(event) => { setSedeId(event.target.value); setModalidadId(""); }} disabled={!contratoId || !institucionId}><option value="">Todas</option>{filterOptions.sedes.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
            <label className="op-filter"><span>Modalidad</span><select value={modalidadId} onChange={(event) => setModalidadId(event.target.value)} disabled={!contratoId || !sedeId}><option value="">Todas</option>{filterOptions.modalidades.map((item) => <option key={item.id} value={item.id}>{item.codigo ?? item.nombre}</option>)}</select></label>
            <label className="op-filter"><span>UbicaciÃ³n</span><select value={ubicacionId} onChange={(event) => setUbicacionId(event.target.value)} disabled={!contratoId}><option value="">Todas</option>{filterOptions.ubicaciones_laborales.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
            <label className="op-filter"><span>Cobertura</span><select value={coberturaFiltro} onChange={(event) => setCoberturaFiltro(event.target.value as "" | "SI" | "NO" | "RETIRADA")} disabled={!contratoId}><option value="">Todas</option><option value="SI">Con cobertura</option><option value="NO">Sin cobertura</option><option value="RETIRADA">Retirada</option></select></label>
            <label className="op-filter"><span>Oferta</span><select value={licitacionFiltro} onChange={(event) => setLicitacionFiltro(event.target.value as "" | "PRESENTADA" | "NO_PRESENTADA")} disabled={!contratoId}><option value="">Todas</option><option value="PRESENTADA">Presentada</option><option value="NO_PRESENTADA">No presentada</option></select></label>
            <label className="op-filter">
              <span>Al</span>
              <input type="date" value={fechaConsulta} onChange={(event) => setFechaConsulta(event.target.value)} disabled={!contratoId} />
            </label>
            <label className="op-filter">
              <BriefcaseBusiness size={14} />
              <select
                value={cargoId}
                onChange={(event) => setCargoId(event.target.value)}
                disabled={!contratoId}
              >
                <option value="">Cargo</option>
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
                <option value="">Estado</option>
                <option value="ACTIVA">Activa</option>
                <option value="SUSPENDIDA">Suspendida</option>
                <option value="RETIRADA">Retirada</option>
              </select>
            </label>
          </div>

          <button type="button" className="op-button ghost" onClick={() => { setSearch(""); setMunicipioId(""); setInstitucionId(""); setSedeId(""); setModalidadId(""); setCargoId(""); setUbicacionId(""); setCoberturaFiltro(""); setLicitacionFiltro(""); setEstadoFiltro(""); setPage(1); }}>Limpiar filtros</button>
          <div className="op-tools-actions">
            <button
              type="button"
              className="op-button secondary"
              onClick={() => setShowImportModal(true)}
              disabled={!contratoId || !canImportPersonal}
            >
              <Upload size={15} />
              Importar
            </button>

            <button
              type="button"
              className="op-button secondary"
              disabled
              title="Proximamente"
              aria-disabled="true"
            >
              <Download size={15} />
              Exportar
            </button>

            <button
              type="button"
              className="op-button secondary op-icon-button"
              onClick={() => setRefreshIndex((current) => current + 1)}
              aria-label="Actualizar"
              title="Actualizar"
            >
              <RefreshCw size={15} />
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
        </div>
      </section>

      <section className="op-table-card">
        <div className="op-table-meta">
          <span className="op-count-inline">
            {tableData?.pagination.total ? tableData.pagination.total.toLocaleString("es-CO") : "0"} trabajadores
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
                    <th>Municipio</th>
                    <th>UbicaciÃ³n / cobertura</th>
                    <th>Oferta</th>
                    <th className="is-status">Estado</th>
                    <th className="is-date">Ingreso</th>
                    <th className="is-action">Expediente</th>
                  </tr>
                </thead>
                <tbody>
                  {(tableData?.items ?? []).length === 0 && (
                    <tr>
                      <td colSpan={8} className="op-empty-row">
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
                      <td>{item.asignacion_actual.municipio ?? "Sin municipio"}</td>
                      <td>
                        <div className="op-context-cell">
                          <strong>{item.asignacion_actual.institucion && item.asignacion_actual.sede ? `${item.asignacion_actual.institucion} Â· ${item.asignacion_actual.sede}` : item.asignacion_actual.nombre ?? "Sin asignaciÃ³n"}</strong>
                          {item.asignacion_actual.modalidad && <small>{item.asignacion_actual.modalidad}</small>}
                          <span className={`op-badge ${item.estado_vinculacion === "RETIRADA" ? "status-retirada" : item.asignacion_actual.institucion ? "status-activa" : "status-suspendida"}`}>
                            {item.estado_vinculacion === "RETIRADA" ? "RETIRADA" : item.asignacion_actual.institucion ? "COBERTURA SÃ" : "COBERTURA NO"}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`op-badge ${item.presentada_licitacion_actual ? "status-activa" : "status-suspendida"}`}>
                          {item.presentada_licitacion_actual ? `PRESENTADA${item.perfil_licitacion_actual ? ` Â· ${item.perfil_licitacion_actual}` : ""}` : "NO PRESENTADA"}
                        </span>
                      </td>
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

      {showImportModal && contratoId && empresaSeleccionada && contratoSeleccionado && (
        <OperationalImportModal
          contratoId={contratoId}
          empresaNombre={empresaSeleccionada.nombre_empresa}
          contratoNombre={contratoSeleccionado.numero_contrato}
          canConfirm={canConfirmImport}
          onClose={() => setShowImportModal(false)}
          onImported={() => setRefreshIndex((current) => current + 1)}
        />
      )}

      {selectedVinculacionId !== null && (
        <div className="op-drawer-layer" onClick={closeDrawer}>
          <aside className="op-drawer" onClick={(event) => event.stopPropagation()}>
            <PersonalMasterDrawer
              expediente={selectedExpediente}
              loading={selectedLoading}
              error={selectedError}
              onClose={closeDrawer}
              onOpenManagement={() => navigate(buildManagementUrl(false))}
              onRefresh={() => setRefreshIndex((current) => current + 1)}
              permissions={permissions}
              tipoDocumentoOptions={tiposDocumento}
              tipoIdentificacionOptions={tiposIdentificacion}
            />
          </aside>
        </div>
      )}
    </div>
  );
}
