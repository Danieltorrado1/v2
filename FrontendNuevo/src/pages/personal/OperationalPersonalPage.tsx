import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  FileText,
  Search,
  Upload,
  UserPlus,
} from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import { ApiClientError } from "../../services/apiClient";
import { configuracionApi } from "../../services/configuracionApi";
import {
  getContractPersonal,
  getContractPersonalFilterOptions,
  getVinculacionExpediente,
  getPersonalResumen,
} from "../../services/vinculacionesApi";
import type { CatalogoItem, Contrato } from "../../types/configuracion.types";
import type { VinculacionEstado, VinculacionExpedienteApi } from "../../types/personas.types";
import type { ContractPersonalFilterOptions, ContractPersonalListResponse, PersonalResumen } from "../../types/vinculaciones.types";
import { useCompanyContext } from "../../context/CompanyContext";
import { EmpiriaIcon } from "../../components/EmpiriaIcon";
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
    return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
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
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [cargos, setCargos] = useState<CatalogoItem[]>([]);
  const [tiposDocumento, setTiposDocumento] = useState<CatalogoItem[]>([]);
  const [tiposIdentificacion, setTiposIdentificacion] = useState<CatalogoItem[]>([]);

  const { empresaId, empresaActiva } = useCompanyContext();
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
  const [personalResumen, setPersonalResumen] = useState<PersonalResumen | null>(null);
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  const [tableData, setTableData] = useState<PersonalTableData | null>(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableError, setTableError] = useState("");

  const [selectedVinculacionId, setSelectedVinculacionId] = useState<number | null>(null);
  const [selectedExpediente, setSelectedExpediente] = useState<VinculacionExpedienteApi | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [selectedError, setSelectedError] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);

  const searchValue = search.trim();
  const contratoSeleccionado = contratos.find((contrato) => contrato.id === contratoId) ?? null;

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
    if (!canReadContext) return;
    let cancelled = false;
    void Promise.all([
      configuracionApi.listarTiposDocumento({ page: 1, limit: 200, activo: true }),
      configuracionApi.listarTiposDocumento({ page: 1, limit: 200, activo: true, es_identificacion_personal: true }),
    ]).then(([documentos, identificaciones]) => {
      if (!cancelled) { setTiposDocumento(documentos.items); setTiposIdentificacion(identificaciones.items); }
    }).catch(() => {
      if (!cancelled) { setTiposDocumento([]); setTiposIdentificacion([]); }
    });
    return () => { cancelled = true; };
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
      setPersonalResumen(null);
      return;
    }
    let cancelled = false;
    void getPersonalResumen({ contrato_id: contratoId, fecha: fechaConsulta })
      .then((summary) => { if (!cancelled) setPersonalResumen(summary); })
      .catch(() => { if (!cancelled) setPersonalResumen(null); });
    return () => { cancelled = true; };
  }, [canReadPersonal, contratoId, fechaConsulta, refreshIndex]);
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

const activeFilterCount = [ubicacionId, coberturaFiltro, licitacionFiltro].filter(Boolean).length;
  const clearFilters = () => {
    setSearch(""); setMunicipioId(""); setInstitucionId(""); setSedeId(""); setModalidadId("");
    setCargoId(""); setUbicacionId(""); setCoberturaFiltro(""); setLicitacionFiltro(""); setEstadoFiltro("");
    setPage(1);
  };
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
      <header className="op-page-header"><div><div className="op-eyebrow"><EmpiriaIcon name="personal" size={18} variant="duotone" /> Personal</div><div className="op-title-row"><h1>Personal</h1><label className="op-contract-compact"><FileText size={14} /><span>Contrato</span><select value={contratoId ?? ""} onChange={(event) => { setContratoId(event.target.value ? Number(event.target.value) : null); setSelectedVinculacionId(null); setSelectedExpediente(null); setSelectedError(""); }} disabled={!empresaId}><option value="">Seleccionar</option>{contratos.map((contrato) => <option key={contrato.id} value={contrato.id}>{contrato.numero_contrato}</option>)}</select></label></div><p>Gestiona y consulta la información de todos los trabajadores.</p></div><div className="op-header-actions"><button type="button" className="op-button secondary" onClick={() => setShowImportModal(true)} disabled={!contratoId || !canImportPersonal}><Upload size={15} /> Importar</button><button type="button" className="op-button primary" onClick={() => navigate(buildManagementUrl(true))} disabled={!contratoId || !canCreateVinculacion}><UserPlus size={15} /> Nuevo trabajador</button></div></header>
      <section className="op-kpi-grid" aria-label="Resumen de personal">
        <article className="op-kpi"><div className="op-kpi-icon op-kpi-icon--active"><EmpiriaIcon name="personal" size={19} variant="duotone" /></div><div><span>Trabajadores activos</span><strong>{personalResumen?.trabajadores_activos ?? "—"}</strong><small>Vigentes al {formatDate(fechaConsulta)}</small></div></article>
        <article className="op-kpi"><div className="op-kpi-icon op-kpi-icon--income"><EmpiriaIcon name="income" size={19} variant="duotone" /></div><div><span>Ingresos del mes</span><strong>{personalResumen?.ingresos_mes ?? "—"}</strong><small>Inicios dentro del mes</small></div></article>
        <article className="op-kpi"><div className="op-kpi-icon op-kpi-icon--retirement"><EmpiriaIcon name="retirement" size={19} variant="duotone" /></div><div><span>Retiros del mes</span><strong>{personalResumen?.retiros_mes ?? "—"}</strong><small>Fechas fin dentro del mes</small></div></article>
        <article className="op-kpi"><div className="op-kpi-icon op-kpi-icon--vacancy"><EmpiriaIcon name="vacancy" size={19} variant="duotone" /></div><div><span>Vacantes / cargos sin cubrir</span><strong>{personalResumen?.vacantes ?? "—"}</strong><small>Déficit territorial agregado</small></div></article>
      </section>
      <section className="op-tools-bar"><div className="op-search-row"><label className="op-search" aria-label="Buscar por documento o nombre"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, documento o institución..." /></label><button type="button" className={`op-button secondary op-more-filters ${showMoreFilters ? "is-open" : ""}`} onClick={() => setShowMoreFilters((current) => !current)} aria-expanded={showMoreFilters}>Más filtros{activeFilterCount > 0 && <b>{activeFilterCount}</b>}</button></div><div className="op-primary-filters"><label className="op-filter"><span><EmpiriaIcon name="municipio" size={13} /> Municipio</span><select value={municipioId} onChange={(event) => { setMunicipioId(event.target.value); setInstitucionId(""); setSedeId(""); setModalidadId(""); }} disabled={!contratoId}><option value="">Todos</option>{filterOptions.municipios.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label><label className="op-filter"><span><EmpiriaIcon name="institucion" size={13} /> Institución</span><select value={institucionId} onChange={(event) => { setInstitucionId(event.target.value); setSedeId(""); setModalidadId(""); }} disabled={!contratoId || !municipioId}><option value="">Todas</option>{filterOptions.instituciones.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label><label className="op-filter"><span><EmpiriaIcon name="sede" size={13} /> Sede</span><select value={sedeId} onChange={(event) => { setSedeId(event.target.value); setModalidadId(""); }} disabled={!contratoId || !institucionId}><option value="">Todas</option>{filterOptions.sedes.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label><label className="op-filter"><span><EmpiriaIcon name="modalidad" size={13} /> Modalidad</span><select value={modalidadId} onChange={(event) => setModalidadId(event.target.value)} disabled={!contratoId || !sedeId}><option value="">Todas</option>{filterOptions.modalidades.map((item) => <option key={item.id} value={item.id}>{item.codigo ?? item.nombre}</option>)}</select></label><label className="op-filter"><span><EmpiriaIcon name="cargo" size={13} /> Cargo</span><select value={cargoId} onChange={(event) => setCargoId(event.target.value)} disabled={!contratoId}><option value="">Todos</option>{cargos.map((cargo) => <option key={cargo.id} value={cargo.id}>{cargo.label}</option>)}</select></label><label className="op-filter"><span><EmpiriaIcon name="estado" size={13} /> Estado</span><select value={estadoFiltro} onChange={(event) => setEstadoFiltro(event.target.value as "" | VinculacionEstado)} disabled={!contratoId}><option value="">Todos</option><option value="ACTIVA">Activa</option><option value="SUSPENDIDA">Suspendida</option><option value="RETIRADA">Retirada</option></select></label></div>{showMoreFilters && <div className="op-more-filters-panel"><label className="op-filter"><span>Ubicación laboral</span><select value={ubicacionId} onChange={(event) => setUbicacionId(event.target.value)} disabled={!contratoId}><option value="">Todas</option>{filterOptions.ubicaciones_laborales.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label><label className="op-filter"><span>Cobertura</span><select value={coberturaFiltro} onChange={(event) => setCoberturaFiltro(event.target.value as "" | "SI" | "NO" | "RETIRADA")} disabled={!contratoId}><option value="">Todas</option><option value="SI">Con cobertura</option><option value="NO">Sin cobertura</option><option value="RETIRADA">Retirada</option></select></label><label className="op-filter"><span>Oferta</span><select value={licitacionFiltro} onChange={(event) => setLicitacionFiltro(event.target.value as "" | "PRESENTADA" | "NO_PRESENTADA")} disabled={!contratoId}><option value="">Todas</option><option value="PRESENTADA">Presentada</option><option value="NO_PRESENTADA">No presentada</option></select></label><label className="op-filter"><span>Fecha de consulta</span><input type="date" value={fechaConsulta} onChange={(event) => setFechaConsulta(event.target.value)} disabled={!contratoId} /></label></div>}{(searchValue || municipioId || institucionId || sedeId || modalidadId || cargoId || ubicacionId || coberturaFiltro || licitacionFiltro || estadoFiltro) && <div className="op-active-filters"><span>Filtros activos</span>{searchValue && <button type="button" onClick={() => setSearch("")}>Búsqueda: {searchValue} ×</button>}{municipioId && <button type="button" onClick={() => { setMunicipioId(""); setInstitucionId(""); setSedeId(""); setModalidadId(""); }}>Municipio ×</button>}{institucionId && <button type="button" onClick={() => { setInstitucionId(""); setSedeId(""); setModalidadId(""); }}>Institución ×</button>}{sedeId && <button type="button" onClick={() => { setSedeId(""); setModalidadId(""); }}>Sede ×</button>}{modalidadId && <button type="button" onClick={() => setModalidadId("")}>Modalidad ×</button>}{cargoId && <button type="button" onClick={() => setCargoId("")}>Cargo ×</button>}{estadoFiltro && <button type="button" onClick={() => setEstadoFiltro("")}>Estado ×</button>}<button type="button" className="op-clear-inline" onClick={clearFilters}>Limpiar todo</button></div>}</section>
      <section className="op-table-card">
        <div className="op-table-meta"><span className="op-count-inline">{tableData?.pagination.total ? `${(tableData.pagination.personas_total ?? tableData.pagination.total).toLocaleString("es-CO")} trabajadores · ${personalResumen?.trabajadores_activos ?? "—"} activos · ${tableData.pagination.total.toLocaleString("es-CO")} vinculaciones` : "0 trabajadores"}</span><label className="op-page-size"><span>Filas</span><select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} disabled={!contratoId || tableLoading}>{PAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></label></div>
        {!contratoId ? <div className="op-empty">Selecciona un contrato para abrir la vista operativa.</div> : tableError ? <div className="op-state error"><AlertTriangle size={16} />{tableError}</div> : tableLoading && !tableData ? <div className="op-empty">Cargando personal del contrato...</div> : <>
          <div className="op-table-scroll"><table className="op-table"><thead><tr><th className="is-worker">Trabajador</th><th className="is-role">Cargo</th><th className="is-assignment">Asignación</th><th className="is-modality">Modalidad</th><th className="is-offer">Oferta</th><th className="is-status">Estado</th><th className="is-date">Ingreso</th><th className="is-updated">Última actualización</th><th className="is-action">Expediente</th></tr></thead><tbody>
            {(tableData?.items ?? []).length === 0 && <tr><td colSpan={9} className="op-empty-row">No hay personal vinculado a este contrato con los filtros actuales.</td></tr>}
            {(tableData?.items ?? []).map((item) => <tr key={item.vinculacion_id} className={item.vinculacion_id === selectedVinculacionId ? "is-selected" : ""} onClick={() => setSelectedVinculacionId(item.vinculacion_id)}>
              <td className="is-worker"><div className="op-worker-cell"><span className="op-avatar" aria-hidden="true">{getInitials(item.nombre_completo)}</span><div className="op-worker-copy"><strong>{item.nombre_completo}</strong><small>{item.numero_documento}</small></div></div></td><td className="is-role"><span className="op-clamp-2">{item.cargo_nombre ?? "Sin cargo"}</span></td><td className="is-assignment"><div className="op-assignment-cell">{item.asignacion_actual.institucion ? <><strong>{item.asignacion_actual.institucion}</strong>{item.asignacion_actual.sede && <small>{item.asignacion_actual.sede}</small>}{item.asignacion_actual.municipio && <small>{item.asignacion_actual.municipio}</small>}{item.asignacion_actual.modalidad && <span className="op-assignment-status">Cobertura sí</span>}</> : <><strong>{item.asignacion_actual.nombre ?? "Sin ubicación laboral"}</strong><small>Personal administrativo</small></>}</div></td><td className="is-modality">{item.asignacion_actual.modalidad ? <span className="op-badge status-info">{item.asignacion_actual.modalidad}</span> : <span className="op-muted">—</span>}</td><td className="is-offer"><div className="op-offer-cell"><span className={`op-badge ${item.presentada_licitacion_actual ? "status-activa" : "status-suspendida"}`}>{item.presentada_licitacion_actual ? "PRESENTADA" : "NO PRESENTADA"}</span>{item.presentada_licitacion_actual && item.perfil_licitacion_actual && <small title={item.perfil_licitacion_actual}>{item.perfil_licitacion_actual}</small>}</div></td><td className="is-status"><span className={`op-badge status-${item.estado_vinculacion.toLowerCase()}`}>{getStatusLabel(item.estado_vinculacion)}</span></td><td className="is-date">{formatDate(item.fecha_ingreso)}</td><td className="is-updated op-last-updated">—</td><td className="is-action"><button type="button" className="op-link-button" onClick={(event) => { event.stopPropagation(); setSelectedVinculacionId(item.vinculacion_id); }}>Ver expediente <ArrowRight size={14} /></button></td>
            </tr>)}
          </tbody></table></div><div className="op-pagination"><span>{tableData?.pagination.total ? `${(tableData.pagination.page - 1) * tableData.pagination.limit + 1} - ${Math.min(tableData.pagination.page * tableData.pagination.limit, tableData.pagination.total)} de ${tableData.pagination.total}` : "Sin resultados"}</span><div className="op-pagination-actions"><button type="button" className="op-button secondary" disabled={!tableData || tableData.pagination.page <= 1 || tableLoading} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</button><button type="button" className="op-button secondary" disabled={!tableData || tableData.pagination.page >= tableData.pagination.total_pages || tableLoading} onClick={() => setPage((current) => current + 1)}>Siguiente</button></div></div>
        </>}
      </section>{showImportModal && contratoId && empresaActiva && contratoSeleccionado && <OperationalImportModal contratoId={contratoId} empresaNombre={empresaActiva.nombre_empresa} contratoNombre={contratoSeleccionado.numero_contrato} canConfirm={canConfirmImport} onClose={() => setShowImportModal(false)} onImported={() => setRefreshIndex((current) => current + 1)} />}{selectedVinculacionId !== null && <div className="op-drawer-layer" onClick={closeDrawer}><aside className="op-drawer" onClick={(event) => event.stopPropagation()}><PersonalMasterDrawer expediente={selectedExpediente} loading={selectedLoading} error={selectedError} onClose={closeDrawer} onOpenManagement={() => navigate(buildManagementUrl(false))} onRefresh={() => setRefreshIndex((current) => current + 1)} permissions={permissions} tipoDocumentoOptions={tiposDocumento} tipoIdentificacionOptions={tiposIdentificacion} /></aside></div>}
    </div>
  );}
