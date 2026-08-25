import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  FolderOpen,
  BriefcaseBusiness,
  Plus,
  RefreshCw,
  Search,

  TrendingDown,
  TrendingUp,
  UserPlus,
  MoreHorizontal,
  Users,
  X,
} from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import { useCompanyContext } from "../../context/CompanyContext";
import { ApiClientError } from "../../services/apiClient";
import { configuracionApi } from "../../services/configuracionApi";
import { createPersona, getPersonaByDocumento } from "../../services/personasApi";
import {
  createVinculacion,
  getContractPersonal,
  getPersonalResumen,
  getContractPersonalFilterOptions,
  getVinculacionExpediente,
} from "../../services/vinculacionesApi";
import type {
  CatalogoItem,
  Contrato,
  MetodoPagoPermitido,
} from "../../types/configuracion.types";
import type {
  PersonaApi,
  VinculacionEstado,
  VinculacionExpedienteApi,
} from "../../types/personas.types";
import type { ContractPersonalFilterOptions, ContractPersonalListResponse, PersonalResumen } from "../../types/vinculaciones.types";
import ExpedienteDocumentosPanel from "./ExpedienteDocumentosPanel";
import "./ContractPersonalPage.css";

const EMPTY_FILTER_OPTIONS: ContractPersonalFilterOptions = {
  gestores: [],
  municipios: [],
  instituciones: [],
  sedes: [],
  modalidades: [],
  ubicaciones_laborales: [],
};

type PersonaNuevaForm = {
  tipo_documento_id: string;
  numero_documento: string;
  primer_nombre: string;
  segundo_nombre: string;
  primer_apellido: string;
  segundo_apellido: string;
  telefono: string;
  correo: string;
};

type VinculacionForm = {
  contrato_cargo_id: string;
  tipo_vinculacion_id: string;
  fecha_inicio: string;
  metodo_pago: string;
  estado_vinculacion: VinculacionEstado;
};

const PAGE_SIZE = 20;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

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

function getInitials(name: string): string {
  return name.split(/s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "??";
}
function createBlankPersona(tipoDocumentoId = "", numeroDocumento = ""): PersonaNuevaForm {
  return {
    tipo_documento_id: tipoDocumentoId,
    numero_documento: numeroDocumento,
    primer_nombre: "",
    segundo_nombre: "",
    primer_apellido: "",
    segundo_apellido: "",
    telefono: "",
    correo: "",
  };
}

function createBlankVinculacion(cargoId = "", tipoVinculacionId = ""): VinculacionForm {
  return {
    contrato_cargo_id: cargoId,
    tipo_vinculacion_id: tipoVinculacionId,
    fecha_inicio: todayIso(),
    metodo_pago: "",
    estado_vinculacion: "ACTIVA",
  };
}

export default function ContractPersonalPage() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { empresas, empresaId, setEmpresaId } = useCompanyContext();
  const permissions = user?.permissions ?? [];
  const requestedEmpresaId = Number(searchParams.get("empresa_id") ?? "");
  const requestedContratoId = Number(searchParams.get("contrato_id") ?? "");
  const shouldAutoOpenAdd = searchParams.get("open_add") === "1";
  const autoOpenHandledRef = useRef(false);

  const canReadContext = hasAnyPermission(permissions, [
    "configuracion.read",
    "empresas.read",
    "contratos.read",
    "contracts.read",
  ]);
  const canReadPersonal = hasAnyPermission(permissions, ["vinculaciones.read"]);
  const canCreatePersona = permissions.includes("personas.create");
  const canCreateVinculacion = permissions.includes("vinculaciones.create");
  const [personalSearch, setPersonalSearch] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState<"" | VinculacionEstado>("");
  const [cargoFiltro, setCargoFiltro] = useState<number | null>(null);
  const [gestorFiltro, setGestorFiltro] = useState<number | null>(null);
  const [sinGestorFiltro, setSinGestorFiltro] = useState(false);
  const [municipioFiltro, setMunicipioFiltro] = useState<number | null>(null);
  const [institucionFiltro, setInstitucionFiltro] = useState<number | null>(null);
  const [sedeFiltro, setSedeFiltro] = useState<number | null>(null);
  const [modalidadFiltro, setModalidadFiltro] = useState<number | null>(null);
  const [ubicacionFiltro, setUbicacionFiltro] = useState<number | null>(null);
  const [coberturaFiltro, setCoberturaFiltro] = useState<"" | "SI" | "NO">("");
  const [licitacionFiltro, setLicitacionFiltro] = useState<"" | "PRESENTADA" | "NO_PRESENTADA">("");
  const [fechaConsulta, setFechaConsulta] = useState(todayIso());
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);

  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [cargos, setCargos] = useState<CatalogoItem[]>([]);
  const [tiposVinculacion, setTiposVinculacion] = useState<CatalogoItem[]>([]);
  const [tiposDocumento, setTiposDocumento] = useState<CatalogoItem[]>([]);
  const [tiposIdentificacion, setTiposIdentificacion] = useState<CatalogoItem[]>([]);
  const [metodosPago, setMetodosPago] = useState<MetodoPagoPermitido[]>([]);
  const [filterOptions, setFilterOptions] = useState<ContractPersonalFilterOptions>(EMPTY_FILTER_OPTIONS);

  const [contratoId, setContratoId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [refreshIndex, setRefreshIndex] = useState(0);

  const [personal, setPersonal] = useState<ContractPersonalListResponse | null>(null);
  const [personalResumen, setPersonalResumen] = useState<PersonalResumen | null>(null);
  const [personalLoading, setPersonalLoading] = useState(false);
  const [personalError, setPersonalError] = useState("");

  const [selectedVinculacionId, setSelectedVinculacionId] = useState<number | null>(null);
  const [selectedExpediente, setSelectedExpediente] = useState<VinculacionExpedienteApi | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [selectedError, setSelectedError] = useState("");

  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [foundPersona, setFoundPersona] = useState<PersonaApi | null>(null);
  const [requiresCreation, setRequiresCreation] = useState(false);
  const [personaForm, setPersonaForm] = useState<PersonaNuevaForm>(createBlankPersona());
  const [vinculacionForm, setVinculacionForm] = useState<VinculacionForm>(createBlankVinculacion());
  const [savingWorker, setSavingWorker] = useState(false);

  const selectedContrato = useMemo(
    () => contratos.find((contrato) => contrato.id === contratoId) ?? null,
    [contratoId, contratos]
  );

  useEffect(() => {
    if (!Number.isFinite(requestedEmpresaId) || requestedEmpresaId <= 0 || empresas.length === 0) {
      return;
    }

    if (empresas.some((empresa) => empresa.id === requestedEmpresaId) && empresaId !== requestedEmpresaId) {
      setEmpresaId(requestedEmpresaId);
    }
  }, [empresaId, empresas, requestedEmpresaId, setEmpresaId]);

  useEffect(() => {
    if (!Number.isFinite(requestedContratoId) || requestedContratoId <= 0 || contratos.length === 0) {
      return;
    }

    if (contratos.some((contrato) => contrato.id === requestedContratoId) && contratoId !== requestedContratoId) {
      setContratoId(requestedContratoId);
    }
  }, [contratoId, contratos, requestedContratoId]);

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
      } catch (error) {
        if (!cancelled) {
          setContratos([]);
          setContratoId(null);
          setFeedback({
            tone: "error",
            text: getErrorMessage(error, "No fue posible cargar los contratos autorizados."),
          });
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

        if (!cancelled) {
          setCargos(
            response.items.map((item) => ({
              id: item.id,
              label: item.nombre_cargo,
            }))
          );
        }
      } catch {
        if (!cancelled) {
          setCargos([]);
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

    async function loadCatalogos() {
      try {
        const [tiposVinculacionResponse, metodosPagoResponse, tiposDocumentoResponse, tiposIdentificacionResponse] =
          await Promise.all([
            configuracionApi.listarTiposVinculacion({ page: 1, limit: 100 }),
            configuracionApi.listarMetodosPago(),
            configuracionApi.listarTiposDocumento({ page: 1, limit: 100, activo: true }),
            configuracionApi.listarTiposDocumento({
              page: 1,
              limit: 100,
              activo: true,
              es_identificacion_personal: true,
            }),
          ]);

        if (cancelled) return;

        setTiposVinculacion(tiposVinculacionResponse.items);
        setMetodosPago(metodosPagoResponse);
        setTiposDocumento(tiposDocumentoResponse.items);
        setTiposIdentificacion(tiposIdentificacionResponse.items);
      } catch (error) {
        if (!cancelled) {
          setFeedback({
            tone: "error",
            text: getErrorMessage(error, "No fue posible cargar los catalogos del flujo."),
          });
        }
      }
    }

    void loadCatalogos();

    return () => {
      cancelled = true;
    };
  }, [canReadContext]);

  useEffect(() => {
    if (!canReadPersonal || !contratoId) {
      setPersonalResumen(null);
      return;
    }
    let cancelled = false;
    void getPersonalResumen({ contrato_id: contratoId, fecha: fechaConsulta })
      .then((response) => { if (!cancelled) setPersonalResumen(response); })
      .catch(() => { if (!cancelled) setPersonalResumen(null); });
    return () => { cancelled = true; };
  }, [canReadPersonal, contratoId, fechaConsulta, refreshIndex]);
  useEffect(() => {
    if (!canReadPersonal || !contratoId) {
      setFilterOptions(EMPTY_FILTER_OPTIONS);
      return;
    }
    let cancelled = false;
    void getContractPersonalFilterOptions({
      contrato_id: contratoId,
      fecha: fechaConsulta,
      municipio_id: municipioFiltro ?? undefined,
      institucion_id: institucionFiltro ?? undefined,
      sede_id: sedeFiltro ?? undefined,
    }).then((response) => {
      if (!cancelled) setFilterOptions(response);
    }).catch(() => {
      if (!cancelled) setFilterOptions(EMPTY_FILTER_OPTIONS);
    });
    return () => { cancelled = true; };
  }, [canReadPersonal, contratoId, fechaConsulta, municipioFiltro, institucionFiltro, sedeFiltro]);

  useEffect(() => {
    if (!canReadPersonal || !contratoId) {
      setPersonal(null);
      setSelectedVinculacionId(null);
      setSelectedExpediente(null);
      setSelectedError("");
      return;
    }

    let cancelled = false;
    const currentContratoId = contratoId;

    async function loadPersonal() {
      setPersonalLoading(true);
      setPersonalError("");

      try {
        const response = await getContractPersonal({
          contrato_id: currentContratoId,
          search: personalSearch.trim() || undefined,
          estado_vinculacion: estadoFiltro || undefined,
          contrato_cargo_id: cargoFiltro ?? undefined,
          gestor_usuario_id: gestorFiltro ?? undefined,
          sin_gestor: sinGestorFiltro || undefined,
          municipio_id: municipioFiltro ?? undefined,
          institucion_id: institucionFiltro ?? undefined,
          sede_id: sedeFiltro ?? undefined,
          modalidad_id: modalidadFiltro ?? undefined,
          ubicacion_laboral_id: ubicacionFiltro ?? undefined,
          cobertura: coberturaFiltro || undefined,
          licitacion: licitacionFiltro || undefined,
          fecha: fechaConsulta,
          page,
          limit: PAGE_SIZE,
        });

        if (cancelled) return;

        setPersonal(response);
        setSelectedVinculacionId((current) => {
          if (current && response.items.some((item) => item.vinculacion_id === current)) {
            return current;
          }
          return response.items[0]?.vinculacion_id ?? null;
        });
      } catch (error) {
        if (!cancelled) {
          setPersonal(null);
          setSelectedVinculacionId(null);
          setSelectedExpediente(null);
          setPersonalError(getErrorMessage(error, "No fue posible cargar el personal del contrato."));
        }
      } finally {
        if (!cancelled) {
          setPersonalLoading(false);
        }
      }
    }

    void loadPersonal();

    return () => {
      cancelled = true;
    };
  }, [canReadPersonal, contratoId, estadoFiltro, cargoFiltro, gestorFiltro, sinGestorFiltro, page, personalSearch, municipioFiltro, institucionFiltro, sedeFiltro, modalidadFiltro, ubicacionFiltro, coberturaFiltro, licitacionFiltro, fechaConsulta, refreshIndex]);

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
  }, [selectedVinculacionId]);

  useEffect(() => {
    setPage(1);
  }, [contratoId, estadoFiltro, cargoFiltro, gestorFiltro, sinGestorFiltro, personalSearch, municipioFiltro, institucionFiltro, sedeFiltro, modalidadFiltro, ubicacionFiltro, coberturaFiltro, licitacionFiltro, fechaConsulta]);

  useEffect(() => {
    if (!showModal) {
      return;
    }

    setVinculacionForm((current) => ({
      ...current,
      contrato_cargo_id: current.contrato_cargo_id || String(cargos[0]?.id ?? ""),
      tipo_vinculacion_id: current.tipo_vinculacion_id || String(tiposVinculacion[0]?.id ?? ""),
      fecha_inicio: current.fecha_inicio || todayIso(),
    }));
    setPersonaForm((current) => ({
      ...current,
      tipo_documento_id: current.tipo_documento_id || String(tiposIdentificacion[0]?.id ?? ""),
    }));
  }, [cargos, showModal, tiposIdentificacion, tiposVinculacion]);

  const resetWorkerFlow = useCallback(() => {
    setLookupLoading(false);
    setLookupError("");
    setFoundPersona(null);
    setRequiresCreation(false);
    setPersonaForm(createBlankPersona(String(tiposIdentificacion[0]?.id ?? ""), ""));
    setVinculacionForm(
      createBlankVinculacion(String(cargos[0]?.id ?? ""), String(tiposVinculacion[0]?.id ?? ""))
    );
    setSavingWorker(false);
  }, [cargos, tiposIdentificacion, tiposVinculacion]);

  const openWorkerModal = useCallback(() => {
    if (!tiposIdentificacion.length) {
      setFeedback({
        tone: "error",
        text: "No hay tipos de identificacion personal configurados para este flujo.",
      });
      return;
    }

    resetWorkerFlow();
    setShowModal(true);
  }, [resetWorkerFlow, tiposIdentificacion]);

  useEffect(() => {
    if (!shouldAutoOpenAdd || autoOpenHandledRef.current) {
      return;
    }

    if (!selectedContrato || !tiposIdentificacion.length || !canCreateVinculacion) {
      return;
    }

    autoOpenHandledRef.current = true;
    openWorkerModal();
  }, [canCreateVinculacion, openWorkerModal, selectedContrato, shouldAutoOpenAdd, tiposIdentificacion.length]);

  const closeWorkerModal = useCallback(() => {
    setShowModal(false);
    resetWorkerFlow();
  }, [resetWorkerFlow]);

  async function handleBuscarPersona() {
    if (!personaForm.numero_documento.trim()) {
      setLookupError("Debes ingresar el numero de identificacion.");
      return;
    }

    setLookupLoading(true);
    setLookupError("");
    setFoundPersona(null);
    setRequiresCreation(false);

    try {
      const persona = await getPersonaByDocumento(personaForm.numero_documento.trim());
      setFoundPersona(persona);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404) {
        setRequiresCreation(true);
        setPersonaForm((current) => ({
          ...current,
          numero_documento: current.numero_documento.trim(),
        }));
      } else {
        setLookupError(getErrorMessage(error, "No fue posible buscar la persona."));
      }
    } finally {
      setLookupLoading(false);
    }
  }

  async function handleGuardarTrabajador() {
    if (!empresaId || !contratoId) {
      setLookupError("Debes seleccionar una empresa y un contrato antes de vincular personal.");
      return;
    }

    if (!canCreatePersona && requiresCreation) {
      setLookupError("No tienes permisos para crear personas.");
      return;
    }

    if (!canCreateVinculacion) {
      setLookupError("No tienes permisos para crear vinculaciones.");
      return;
    }

    if (
      !vinculacionForm.contrato_cargo_id ||
      !vinculacionForm.tipo_vinculacion_id ||
      !vinculacionForm.fecha_inicio
    ) {
      setLookupError("Cargo, tipo de vinculacion y fecha de ingreso son obligatorios.");
      return;
    }

    if (requiresCreation) {
      if (!personaForm.tipo_documento_id || !personaForm.primer_nombre.trim() || !personaForm.primer_apellido.trim()) {
        setLookupError("Completa los datos minimos de la persona nueva.");
        return;
      }
    }

    setSavingWorker(true);
    setLookupError("");

    try {
      let persona = foundPersona;

      if (!persona && requiresCreation) {
        persona = await createPersona({
          tipo_documento_id: Number(personaForm.tipo_documento_id),
          numero_documento: personaForm.numero_documento.trim(),
          primer_nombre: personaForm.primer_nombre.trim(),
          segundo_nombre: personaForm.segundo_nombre.trim() || null,
          primer_apellido: personaForm.primer_apellido.trim(),
          segundo_apellido: personaForm.segundo_apellido.trim() || null,
          telefono: personaForm.telefono.trim() || null,
          correo: personaForm.correo.trim() || null,
        });
      }

      if (!persona) {
        throw new Error("Debes buscar o crear una persona antes de continuar.");
      }

      const vinculacion = await createVinculacion({
        persona_id: persona.id,
        empresa_id: empresaId,
        contrato_id: contratoId,
        contrato_cargo_id: Number(vinculacionForm.contrato_cargo_id),
        tipo_vinculacion_id: Number(vinculacionForm.tipo_vinculacion_id),
        fecha_inicio: vinculacionForm.fecha_inicio,
        fecha_fin: null,
        estado_vinculacion: vinculacionForm.estado_vinculacion,
        metodo_pago: vinculacionForm.metodo_pago ? (vinculacionForm.metodo_pago as never) : null,
      });

      const expediente = await getVinculacionExpediente(vinculacion.id);
      setSelectedVinculacionId(vinculacion.id);
      setSelectedExpediente(expediente);
      setSelectedError("");
      setShowModal(false);
      setFeedback({
        tone: "success",
        text: "Vinculacion creada. Ya puedes cargar documentos y continuar con el siguiente trabajador.",
      });
      setPage(1);
      setPersonalSearch("");
      setEstadoFiltro("");
      setRefreshIndex((current) => current + 1);
      resetWorkerFlow();
    } catch (error) {
      if (error instanceof ApiClientError && error.code === "VINCULACION_ACTIVE_CONFLICT") {
        setLookupError("La persona ya tiene una vinculacion activa en este contrato.");
      } else {
        setLookupError(getErrorMessage(error, "No fue posible guardar la vinculacion."));
      }
    } finally {
      setSavingWorker(false);
    }
  }

  if (!canReadContext || !canReadPersonal) {
    return (
      <div className="cp-page">
        <div className="cp-state error">
          <AlertTriangle size={16} />
          No tienes permisos para consultar empresas, contratos o personal vinculado.
        </div>
      </div>
    );
  }

  return (
    <div className="cp-page">
      <div className="cp-toolbar">
        <div>
          <h1>Personal</h1>
          <p>Gestiona y consulta la informacion de todos los trabajadores.</p>
        </div>

        <div className="cp-toolbar-actions">
          <label className="cp-compact-contract" title={selectedContrato?.numero_contrato ?? "Contrato activo"}>
            <span>Contrato</span>
            <select value={contratoId ?? ""} onChange={(event) => { setContratoId(event.target.value ? Number(event.target.value) : null); setSelectedVinculacionId(null); setSelectedExpediente(null); }} disabled={!empresaId}>
              <option value="">Seleccionar</option>
              {contratos.map((contrato) => <option key={contrato.id} value={contrato.id}>{contrato.numero_contrato}</option>)}
            </select>
          </label>
          <button
            type="button"
            className="cp-button secondary"
            onClick={() => setRefreshIndex((current) => current + 1)}
          >
            <RefreshCw size={15} />
            Actualizar
          </button>
          <button
            type="button"
            className="cp-button primary"
            onClick={openWorkerModal}
            disabled={!selectedContrato || !canCreateVinculacion || !tiposIdentificacion.length}
          >
            <UserPlus size={15} />
            Nuevo trabajador
          </button>

        </div>
      </div>

      {feedback && (
        <div className={`cp-state ${feedback.tone === "error" ? "error" : "success"}`}>
          {feedback.tone === "error" ? <AlertTriangle size={16} /> : <FolderOpen size={16} />}
          {feedback.text}
        </div>
      )}

      <section className="cp-kpi-grid" aria-label="Resumen de personal">
        <article className="cp-kpi-card">
          <span className="cp-kpi-icon"><Users size={17} /></span>
          <div><span className="cp-kpi-label">Trabajadores activos</span><strong>{personalResumen?.trabajadores_activos ?? 0}</strong><small>Vigentes al {formatDate(fechaConsulta)}</small></div>
        </article>
        <article className="cp-kpi-card">
          <span className="cp-kpi-icon"><TrendingUp size={17} /></span>
          <div><span className="cp-kpi-label">Ingresos del mes</span><strong>{personalResumen?.ingresos_mes ?? 0}</strong><small>Inicio de vinculacion</small></div>
        </article>
        <article className="cp-kpi-card">
          <span className="cp-kpi-icon"><TrendingDown size={17} /></span>
          <div><span className="cp-kpi-label">Retiros del mes</span><strong>{personalResumen?.retiros_mes ?? 0}</strong><small>Fecha fin del mes</small></div>
        </article>
        <article className="cp-kpi-card">
          <span className="cp-kpi-icon"><BriefcaseBusiness size={17} /></span>
          <div><span className="cp-kpi-label">Vacantes / cargos sin cubrir</span><strong>{personalResumen?.vacantes ?? 0}</strong><small>Deficit de cobertura agregado</small></div>
        </article>
      </section>
      <div className="cp-layout">
        <section className="cp-card cp-list-card">
          <div className="cp-card-header">
            <div>
              <span className="cp-eyebrow">Personal</span>
              <h2>Personal asociado al contrato</h2>
            </div>
            <Users size={18} />
          </div>

          <div className="cp-filter-stack">
            <div className="cp-search-row">
              <div className="cp-input-wrap cp-search-filter">
                <Search size={15} />
                <input className="cp-input" value={personalSearch} onChange={(event) => setPersonalSearch(event.target.value)} placeholder="Buscar por nombre, documento o institucion..." disabled={!selectedContrato} />
              </div>
              <button type="button" className="cp-more-filters" onClick={() => setMoreFiltersOpen((open) => !open)} aria-expanded={moreFiltersOpen}>
                Mas filtros {[ubicacionFiltro, coberturaFiltro, licitacionFiltro, estadoFiltro].filter(Boolean).length > 0 ? "(" + [ubicacionFiltro, coberturaFiltro, licitacionFiltro, estadoFiltro].filter(Boolean).length + ")" : ""}
              </button>
            </div>
            <div className="cp-primary-filters">
              <select
                className="cp-select"
                value={sinGestorFiltro ? "sin_gestor" : gestorFiltro ?? ""}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  if (nextValue === "sin_gestor") {
                    setSinGestorFiltro(true);
                    setGestorFiltro(null);
                    return;
                  }

                  setSinGestorFiltro(false);
                  setGestorFiltro(Number(nextValue) || null);
                }}
                disabled={!selectedContrato}
              >
                <option value="">Gestor</option>
                <option value="sin_gestor">Sin gestor</option>
                {filterOptions.gestores.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre}
                  </option>
                ))}
              </select>
              <select className="cp-select" value={municipioFiltro ?? ""} onChange={(event) => { setMunicipioFiltro(Number(event.target.value) || null); setInstitucionFiltro(null); setSedeFiltro(null); setModalidadFiltro(null); }} disabled={!selectedContrato}>
                <option value="">Municipio</option>{filterOptions.municipios.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
              </select>
              <select className="cp-select" value={institucionFiltro ?? ""} onChange={(event) => { setInstitucionFiltro(Number(event.target.value) || null); setSedeFiltro(null); setModalidadFiltro(null); }} disabled={!selectedContrato || !municipioFiltro}>
                <option value="">Institucion</option>{filterOptions.instituciones.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
              </select>
              <select className="cp-select" value={sedeFiltro ?? ""} onChange={(event) => { setSedeFiltro(Number(event.target.value) || null); setModalidadFiltro(null); }} disabled={!selectedContrato || !institucionFiltro}>
                <option value="">Sede</option>{filterOptions.sedes.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
              </select>
              <select className="cp-select" value={modalidadFiltro ?? ""} onChange={(event) => setModalidadFiltro(Number(event.target.value) || null)} disabled={!selectedContrato || !sedeFiltro}>
                <option value="">Modalidad</option>{filterOptions.modalidades.map((item) => <option key={item.id} value={item.id}>{item.codigo ?? item.nombre}</option>)}
              </select>
              <select className="cp-select" value={cargoFiltro ?? ""} onChange={(event) => setCargoFiltro(Number(event.target.value) || null)} disabled={!selectedContrato}>
                <option value="">Cargo</option>{cargos.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
              <select className="cp-select" value={estadoFiltro} onChange={(event) => setEstadoFiltro(event.target.value as "" | VinculacionEstado)} disabled={!selectedContrato}>
                <option value="">Estado</option><option value="ACTIVA">Activas</option><option value="SUSPENDIDA">Suspendidas</option><option value="RETIRADA">Retiradas</option>
              </select>
            </div>
            {moreFiltersOpen && <div className="cp-more-filters-panel">
              <select className="cp-select" value={ubicacionFiltro ?? ""} onChange={(event) => setUbicacionFiltro(Number(event.target.value) || null)} disabled={!selectedContrato}>
                <option value="">Ubicacion asignada</option>{filterOptions.ubicaciones_laborales.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
              </select>
              <select className="cp-select" value={coberturaFiltro} onChange={(event) => setCoberturaFiltro(event.target.value as "" | "SI" | "NO")} disabled={!selectedContrato}>
                <option value="">Cobertura</option><option value="SI">Con cobertura</option><option value="NO">Sin cobertura</option>
              </select>
              <select className="cp-select" value={licitacionFiltro} onChange={(event) => setLicitacionFiltro(event.target.value as "" | "PRESENTADA" | "NO_PRESENTADA")} disabled={!selectedContrato}>
                <option value="">Oferta</option><option value="PRESENTADA">Presentada</option><option value="NO_PRESENTADA">No presentada</option>
              </select>
              <label className="cp-date-filter">Fecha <input className="cp-input-solid" type="date" value={fechaConsulta} onChange={(event) => setFechaConsulta(event.target.value)} disabled={!selectedContrato} /></label>
            </div>}
            {(gestorFiltro || sinGestorFiltro || municipioFiltro || institucionFiltro || sedeFiltro || modalidadFiltro || cargoFiltro || ubicacionFiltro || coberturaFiltro || licitacionFiltro || estadoFiltro) && (
              <div className="cp-active-filters">
                <span>Filtros activos:</span>
                {(gestorFiltro || sinGestorFiltro) && <span className="cp-filter-chip">Gestor <button type="button" onClick={() => { setGestorFiltro(null); setSinGestorFiltro(false); }}>x</button></span>}
                {municipioFiltro && <span className="cp-filter-chip">Municipio <button type="button" onClick={() => { setMunicipioFiltro(null); setInstitucionFiltro(null); setSedeFiltro(null); setModalidadFiltro(null); }}>x</button></span>}
                {institucionFiltro && <span className="cp-filter-chip">Institucion <button type="button" onClick={() => { setInstitucionFiltro(null); setSedeFiltro(null); setModalidadFiltro(null); }}>x</button></span>}
                {sedeFiltro && <span className="cp-filter-chip">Sede <button type="button" onClick={() => { setSedeFiltro(null); setModalidadFiltro(null); }}>x</button></span>}
                {modalidadFiltro && <span className="cp-filter-chip">Modalidad <button type="button" onClick={() => setModalidadFiltro(null)}>x</button></span>}
                {cargoFiltro && <span className="cp-filter-chip">Cargo <button type="button" onClick={() => setCargoFiltro(null)}>x</button></span>}
                {estadoFiltro && <span className="cp-filter-chip">Estado <button type="button" onClick={() => setEstadoFiltro("")}>x</button></span>}
                {coberturaFiltro && <span className="cp-filter-chip">Cobertura <button type="button" onClick={() => setCoberturaFiltro("")}>x</button></span>}
                {licitacionFiltro && <span className="cp-filter-chip">Oferta <button type="button" onClick={() => setLicitacionFiltro("")}>x</button></span>}
                {ubicacionFiltro && <span className="cp-filter-chip">Ubicacion <button type="button" onClick={() => setUbicacionFiltro(null)}>x</button></span>}
                <button type="button" className="cp-clear-filters" onClick={() => { setPersonalSearch(""); setGestorFiltro(null); setSinGestorFiltro(false); setMunicipioFiltro(null); setInstitucionFiltro(null); setSedeFiltro(null); setModalidadFiltro(null); setCargoFiltro(null); setUbicacionFiltro(null); setCoberturaFiltro(""); setLicitacionFiltro(""); setEstadoFiltro(""); setFechaConsulta(todayIso()); setPage(1); }}>Limpiar todo</button>
              </div>
            )}
          </div>
          <div className="cp-results-summary"><strong>{personal?.pagination.personas_total ?? personal?.pagination.total ?? 0} personas</strong><span></span><span>{personal?.pagination.total ?? 0} vinculaciones</span></div>

          {!selectedContrato ? (
            <div className="cp-list-body">
              <div className="cp-empty">Selecciona un contrato para cargar su personal.</div>
            </div>
          ) : personalError ? (
            <div className="cp-list-body">
              <div className="cp-state error">
                <AlertTriangle size={16} />
                {personalError}
              </div>
            </div>
          ) : personalLoading && !personal ? (
            <div className="cp-list-body">
              <div className="cp-empty">Cargando personal del contrato...</div>
            </div>
          ) : (
            <div className="cp-list-body">
              <div className="cp-table-wrap">
                <table className="cp-table">
                  <colgroup><col className="cp-col-worker" /><col className="cp-col-cargo" /><col className="cp-col-assignment" /><col className="cp-col-modality" /><col className="cp-col-offer" /><col className="cp-col-status" /><col className="cp-col-date" /><col className="cp-col-updated" /><col className="cp-col-expediente" /><col className="cp-col-action" /></colgroup>
                  <thead>
                     <tr>
                       <th>Trabajador</th><th>Cargo</th><th>Asignacion</th><th>Modalidad</th><th>Oferta</th><th>Estado</th><th>Ingreso</th><th>Ultima actualizacion</th><th>Expediente</th><th>Accion</th>
                     </tr>
                   </thead>
                  <tbody>
                    {(personal?.items ?? []).length === 0 && (
                      <tr>
                        <td colSpan={10} className="cp-empty-row">
                          No hay personal vinculado a este contrato con los filtros actuales.
                        </td>
                      </tr>
                    )}
                    {(personal?.items ?? []).map((item) => (
                      <tr
                        key={item.vinculacion_id}
                        className={item.vinculacion_id === selectedVinculacionId ? "is-selected" : ""}
                        onClick={() => setSelectedVinculacionId(item.vinculacion_id)}
                      >
                        <td className="cp-worker-cell">
                           <span className="cp-worker-avatar" aria-hidden="true">{getInitials(item.nombre_completo)}</span>
                           <span className="cp-worker-copy"><strong>{item.nombre_completo}</strong><small>DOC {item.numero_documento}</small></span>
                         </td>
                         <td className="cp-cargo-cell">{item.cargo.nombre_cargo ?? "Sin cargo"}</td>
                         <td className="cp-assignment-cell">
                           {item.es_manipuladora ? <><strong>{item.asignacion_actual.institucion ?? "Institucion no informada"}</strong><span>{item.asignacion_actual.sede ?? "Sede no informada"}</span><small>{item.asignacion_actual.municipio ?? "Municipio no informado"}</small><span className="cp-assignment-status">Gestor {item.gestor_actual?.nombre ?? "Sin gestor"}</span></> : <><strong>Administrativo</strong><span>{item.asignacion_actual.nombre ?? "Sin ubicacion laboral"}</span><small>Gestor {item.gestor_actual?.nombre ?? "Sin gestor"}</small></>}
                         </td>
                         <td className="cp-modality-cell">{item.es_manipuladora ? <span className="cp-badge modality-badge">{item.asignacion_actual.modalidad ?? "—"}</span> : <span className="cp-muted">—</span>}</td>
                         <td className="cp-offer-cell"><span className={item.presentada_licitacion_actual ? "cp-badge offer-presented" : "cp-badge offer-none"}>{item.presentada_licitacion_actual ? "Presentada" : "No presentada"}</span>{item.presentada_licitacion_actual && item.perfil_licitacion_actual && <small title={item.perfil_licitacion_actual}>{item.perfil_licitacion_actual}</small>}</td>
                         <td><span className={"cp-badge status-" + item.estado_vinculacion.toLowerCase()}>{getStatusLabel(item.estado_vinculacion)}</span></td>
                         <td className="cp-date-cell">{formatDate(item.fecha_ingreso)}</td>
                         <td className="cp-date-cell cp-updated-cell">—</td>
                         <td><button type="button" className="cp-link-button" onClick={(event) => { event.stopPropagation(); setSelectedVinculacionId(item.vinculacion_id); }}>Ver expediente <ArrowRight size={14} /></button></td>
                         <td><button type="button" className="cp-icon-action" title="Abrir expediente" aria-label="Abrir expediente" onClick={(event) => { event.stopPropagation(); setSelectedVinculacionId(item.vinculacion_id); }}><MoreHorizontal size={17} /></button></td>
                       </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="cp-pagination">
                <span>
                  {personal?.pagination.total
                    ? `${(personal.pagination.page - 1) * personal.pagination.limit + 1} - ${Math.min(
                        personal.pagination.page * personal.pagination.limit,
                        personal.pagination.total
                      )} de ${personal.pagination.total}`
                    : "Sin resultados"}
                </span>
                <div className="cp-pagination-actions">
                  <button
                    type="button"
                    className="cp-button secondary"
                    disabled={!personal || personal.pagination.page <= 1 || personalLoading}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    className="cp-button secondary"
                    disabled={!personal || personal.pagination.page >= personal.pagination.total_pages || personalLoading}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="cp-card cp-detail-card">
          <div className="cp-card-header">
            <div>
              <span className="cp-eyebrow">Expediente</span>
              <h2>Expediente y documentos</h2>
            </div>
            <FolderOpen size={18} />
          </div>

          {selectedError ? (
            <div className="cp-detail-body">
              <div className="cp-state error">
                <AlertTriangle size={16} />
                {selectedError}
              </div>
            </div>
          ) : selectedLoading && !selectedExpediente ? (
            <div className="cp-detail-body">
              <div className="cp-empty">Abriendo expediente...</div>
            </div>
          ) : !selectedExpediente ? (
            <div className="cp-detail-body">
              <div className="cp-empty">Selecciona una vinculacion para abrir su expediente.</div>
            </div>
          ) : (
            <div className="cp-detail-body">
              <div className="cp-summary-grid">
                <div className="cp-summary-item">
                  <span>Trabajador</span>
                  <strong>{buildNombreCompleto(selectedExpediente.persona)}</strong>
                </div>
                <div className="cp-summary-item">
                  <span>Documento</span>
                  <strong>{selectedExpediente.persona.numero_documento}</strong>
                </div>
                <div className="cp-summary-item">
                  <span>Cargo</span>
                  <strong>{selectedExpediente.cargo.nombre_cargo ?? "Sin cargo"}</strong>
                </div>
                <div className="cp-summary-item">
                  <span>Estado</span>
                  <strong>{getStatusLabel(selectedExpediente.vinculacion.estado_vinculacion)}</strong>
                </div>
                <div className="cp-summary-item">
                  <span>Ingreso</span>
                  <strong>{formatDate(selectedExpediente.vinculacion.fecha_inicio)}</strong>
                </div>
                <div className="cp-summary-item">
                  <span>Documentos persona</span>
                  <strong>{selectedExpediente.documentos_persona.length}</strong>
                </div>
                <div className="cp-summary-item">
                  <span>Documentos vinculacion</span>
                  <strong>{selectedExpediente.documentos_vinculacion.length}</strong>
                </div>
                <div className="cp-summary-item">
                  <span>Contrato</span>
                  <strong>{selectedExpediente.contrato.numero_contrato ?? "Sin numero"}</strong>
                </div>
              </div>

              <div className="cp-next-worker">
                <button type="button" className="cp-button primary" onClick={openWorkerModal}>
                  <Plus size={15} />
                  Guardar y agregar siguiente
                </button>
              </div>

              <ExpedienteDocumentosPanel
                personaId={selectedExpediente.persona.id}
                vinculacionId={selectedExpediente.vinculacion.id}
                tipoDocumentoOptions={tiposDocumento}
              />
            </div>
          )}
        </section>
      </div>

      {showModal && (
        <div className="cp-modal-backdrop" onClick={closeWorkerModal}>
          <div className="cp-modal" onClick={(event) => event.stopPropagation()}>
            <div className="cp-modal-header">
              <div>
                <span className="cp-eyebrow">Agregar personal</span>
                <h2>Nuevo trabajador</h2>
                <p className="cp-modal-helper">
                  Buscar, crear o reutilizar persona y completar su vinculacion.
                </p>
              </div>
              <button
                type="button"
                className="cp-modal-close"
                onClick={closeWorkerModal}
                aria-label="Cerrar modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="cp-modal-body">
              <section className="cp-modal-section">
                <div className="cp-modal-section-head">
                  <span className="cp-modal-section-eyebrow">1</span>
                  <div>
                    <h3 className="cp-subtitle">Buscar persona</h3>
                    <p className="cp-modal-helper">
                      La bsqueda reutiliza la identificacion vigente y evita duplicar personas.
                    </p>
                  </div>
                </div>

                <div className="cp-modal-grid">
                  <label className="cp-label">
                    Tipo de identificacion
                    <select
                      className="cp-select"
                      value={personaForm.tipo_documento_id}
                      onChange={(event) =>
                        setPersonaForm((current) => ({ ...current, tipo_documento_id: event.target.value }))
                      }
                    >
                      <option value="">Seleccionar</option>
                      {tiposIdentificacion.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.codigo ? `${item.codigo}  ${item.label}` : item.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="cp-label">
                    Nmero de identificacion
                    <input
                      className="cp-input cp-input-solid"
                      value={personaForm.numero_documento}
                      onChange={(event) =>
                        setPersonaForm((current) => ({ ...current, numero_documento: event.target.value }))
                      }
                      placeholder="Buscar primero antes de crear"
                    />
                  </label>
                </div>

                <div className="cp-modal-actions">
                  <button
                    type="button"
                    className="cp-button secondary"
                    onClick={handleBuscarPersona}
                    disabled={lookupLoading}
                  >
                    <Search size={15} />
                    {lookupLoading ? "Buscando..." : "Buscar persona"}
                  </button>
                </div>

                {foundPersona && (
                  <div className="cp-state success cp-modal-persona-summary">
                    <FolderOpen size={16} />
                    Persona existente encontrada:
                    <strong>{buildNombreCompleto(foundPersona)}</strong>
                    <span className="cp-mono">{foundPersona.numero_documento}</span>
                  </div>
                )}

                {!foundPersona && !requiresCreation && lookupError && (
                  <div className="cp-state error">
                    <AlertTriangle size={16} />
                    {lookupError}
                  </div>
                )}

                {requiresCreation && (
                  <div className="cp-state cp-modal-notice">
                    <AlertTriangle size={16} />
                    No existe una persona con esa identificacion vigente. Completa los datos minimos para crearla.
                  </div>
                )}
              </section>

              {requiresCreation && (
                <section className="cp-modal-section">
                  <div className="cp-modal-section-head">
                    <span className="cp-modal-section-eyebrow">2</span>
                    <div>
                      <h3 className="cp-subtitle">Datos personales</h3>
                      <p className="cp-modal-helper">
                        Solo se solicitan los datos minimos soportados por el backend actual.
                      </p>
                    </div>
                  </div>

                  <div className="cp-modal-grid">
                    <label className="cp-label">
                      Primer nombre
                      <input
                        className="cp-input cp-input-solid"
                        value={personaForm.primer_nombre}
                        onChange={(event) =>
                          setPersonaForm((current) => ({ ...current, primer_nombre: event.target.value }))
                        }
                      />
                    </label>
                    <label className="cp-label">
                      Segundo nombre
                      <input
                        className="cp-input cp-input-solid"
                        value={personaForm.segundo_nombre}
                        onChange={(event) =>
                          setPersonaForm((current) => ({ ...current, segundo_nombre: event.target.value }))
                        }
                      />
                    </label>
                    <label className="cp-label">
                      Primer apellido
                      <input
                        className="cp-input cp-input-solid"
                        value={personaForm.primer_apellido}
                        onChange={(event) =>
                          setPersonaForm((current) => ({ ...current, primer_apellido: event.target.value }))
                        }
                      />
                    </label>
                    <label className="cp-label">
                      Segundo apellido
                      <input
                        className="cp-input cp-input-solid"
                        value={personaForm.segundo_apellido}
                        onChange={(event) =>
                          setPersonaForm((current) => ({ ...current, segundo_apellido: event.target.value }))
                        }
                      />
                    </label>
                    <label className="cp-label">
                      Telfono
                      <input
                        className="cp-input cp-input-solid"
                        value={personaForm.telefono}
                        onChange={(event) =>
                          setPersonaForm((current) => ({ ...current, telefono: event.target.value }))
                        }
                      />
                    </label>
                    <label className="cp-label">
                      Correo
                      <input
                        className="cp-input cp-input-solid"
                        type="email"
                        value={personaForm.correo}
                        onChange={(event) =>
                          setPersonaForm((current) => ({ ...current, correo: event.target.value }))
                        }
                      />
                    </label>
                  </div>
                </section>
              )}

              {(foundPersona || requiresCreation) && (
                <section className="cp-modal-section">
                  <div className="cp-modal-section-head">
                    <span className="cp-modal-section-eyebrow">{requiresCreation ? "3" : "2"}</span>
                    <div>
                      <h3 className="cp-subtitle">Datos de vinculacion</h3>
                      <p className="cp-modal-helper">
                        Estos datos pertenecen al contrato activo y no a la persona maestra.
                      </p>
                    </div>
                  </div>

                  <div className="cp-modal-grid">
                    <label className="cp-label">
                      Cargo
                      <select
                        className="cp-select"
                        value={vinculacionForm.contrato_cargo_id}
                        onChange={(event) =>
                          setVinculacionForm((current) => ({ ...current, contrato_cargo_id: event.target.value }))
                        }
                      >
                        <option value="">Seleccionar cargo</option>
                        {cargos.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="cp-label">
                      Tipo de vinculacion
                      <select
                        className="cp-select"
                        value={vinculacionForm.tipo_vinculacion_id}
                        onChange={(event) =>
                          setVinculacionForm((current) => ({ ...current, tipo_vinculacion_id: event.target.value }))
                        }
                      >
                        <option value="">Seleccionar tipo</option>
                        {tiposVinculacion.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.codigo ? `${item.codigo}  ${item.label}` : item.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="cp-label">
                      Fecha de ingreso
                      <input
                        className="cp-input cp-input-solid"
                        type="date"
                        value={vinculacionForm.fecha_inicio}
                        onChange={(event) =>
                          setVinculacionForm((current) => ({ ...current, fecha_inicio: event.target.value }))
                        }
                      />
                    </label>

                    <label className="cp-label">
                      Mtodo de pago
                      <select
                        className="cp-select"
                        value={vinculacionForm.metodo_pago}
                        onChange={(event) =>
                          setVinculacionForm((current) => ({ ...current, metodo_pago: event.target.value }))
                        }
                      >
                        <option value="">Sin metodo</option>
                        {metodosPago.map((item) => (
                          <option key={item.valor} value={item.valor}>
                            {item.etiqueta}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="cp-label">
                      Estado
                      <select
                        className="cp-select"
                        value={vinculacionForm.estado_vinculacion}
                        onChange={(event) =>
                          setVinculacionForm((current) => ({
                            ...current,
                            estado_vinculacion: event.target.value as VinculacionEstado,
                          }))
                        }
                      >
                        <option value="ACTIVA">Activa</option>
                        <option value="SUSPENDIDA">Suspendida</option>
                        <option value="RETIRADA">Retirada</option>
                      </select>
                    </label>
                  </div>

                  {lookupError && (
                    <div className="cp-state error">
                      <AlertTriangle size={16} />
                      {lookupError}
                    </div>
                  )}
                </section>
              )}
            </div>

            <div className="cp-modal-footer">
              <button type="button" className="cp-button secondary" onClick={closeWorkerModal}>
                Cancelar
              </button>
              {(foundPersona || requiresCreation) && (
                <button
                  type="button"
                  className="cp-button primary"
                  onClick={handleGuardarTrabajador}
                  disabled={savingWorker}
                >
                  <Plus size={15} />
                  {savingWorker ? "Guardando..." : "Guardar vinculacion"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
