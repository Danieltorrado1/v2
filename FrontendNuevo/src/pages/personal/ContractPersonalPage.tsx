import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  FileText,
  FolderOpen,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import { ApiClientError } from "../../services/apiClient";
import { configuracionApi } from "../../services/configuracionApi";
import { createPersona, getPersonaByDocumento } from "../../services/personasApi";
import {
  createVinculacion,
  getContractPersonal,
  getVinculacionExpediente,
} from "../../services/vinculacionesApi";
import type {
  CatalogoItem,
  Contrato,
  Empresa,
  MetodoPagoPermitido,
} from "../../types/configuracion.types";
import type {
  PersonaApi,
  VinculacionEstado,
  VinculacionExpedienteApi,
} from "../../types/personas.types";
import type { ContractPersonalListResponse } from "../../types/vinculaciones.types";
import ExpedienteDocumentosPanel from "./ExpedienteDocumentosPanel";
import "./ContractPersonalPage.css";

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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
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
  const canOpenAdmin = user?.roles.includes("ADMINISTRADOR") === true;

  const [empresaSearch, setEmpresaSearch] = useState("");
  const [contratoSearch, setContratoSearch] = useState("");
  const [personalSearch, setPersonalSearch] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState<"" | VinculacionEstado>("");

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [cargos, setCargos] = useState<CatalogoItem[]>([]);
  const [tiposVinculacion, setTiposVinculacion] = useState<CatalogoItem[]>([]);
  const [tiposDocumento, setTiposDocumento] = useState<CatalogoItem[]>([]);
  const [tiposIdentificacion, setTiposIdentificacion] = useState<CatalogoItem[]>([]);
  const [metodosPago, setMetodosPago] = useState<MetodoPagoPermitido[]>([]);

  const [empresaId, setEmpresaId] = useState<number | null>(null);
  const [contratoId, setContratoId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [refreshIndex, setRefreshIndex] = useState(0);

  const [personal, setPersonal] = useState<ContractPersonalListResponse | null>(null);
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

  const selectedEmpresa = useMemo(
    () => empresas.find((empresa) => empresa.id === empresaId) ?? null,
    [empresaId, empresas]
  );
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
  }, [empresaId, empresas, requestedEmpresaId]);

  useEffect(() => {
    if (!Number.isFinite(requestedContratoId) || requestedContratoId <= 0 || contratos.length === 0) {
      return;
    }

    if (contratos.some((contrato) => contrato.id === requestedContratoId) && contratoId !== requestedContratoId) {
      setContratoId(requestedContratoId);
    }
  }, [contratoId, contratos, requestedContratoId]);

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
          search: empresaSearch.trim() || undefined,
        });

        if (cancelled) return;

        setEmpresas(response.items);
        setEmpresaId((current) => {
          if (current && response.items.some((empresa) => empresa.id === current)) {
            return current;
          }
          return response.items[0]?.id ?? null;
        });
      } catch (error) {
        if (!cancelled) {
          setEmpresas([]);
          setEmpresaId(null);
          setFeedback({
            tone: "error",
            text: getErrorMessage(error, "No fue posible cargar las empresas autorizadas."),
          });
        }
      }
    }

    void loadEmpresas();

    return () => {
      cancelled = true;
    };
  }, [canReadContext, empresaSearch]);

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
          search: contratoSearch.trim() || undefined,
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
  }, [canReadContext, contratoSearch, empresaId]);

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
            text: getErrorMessage(error, "No fue posible cargar los catálogos del flujo."),
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
  }, [canReadPersonal, contratoId, estadoFiltro, page, personalSearch, refreshIndex]);

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
  }, [contratoId, estadoFiltro, personalSearch]);

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
        text: "No hay tipos de identificación personal configurados para este flujo.",
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
      setLookupError("Debes ingresar el número de identificación.");
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
      setLookupError("Cargo, tipo de vinculación y fecha de ingreso son obligatorios.");
      return;
    }

    if (requiresCreation) {
      if (!personaForm.tipo_documento_id || !personaForm.primer_nombre.trim() || !personaForm.primer_apellido.trim()) {
        setLookupError("Completa los datos mínimos de la persona nueva.");
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
        text: "Vinculación creada. Ya puedes cargar documentos y continuar con el siguiente trabajador.",
      });
      setPage(1);
      setPersonalSearch("");
      setEstadoFiltro("");
      setRefreshIndex((current) => current + 1);
      resetWorkerFlow();
    } catch (error) {
      if (error instanceof ApiClientError && error.code === "VINCULACION_ACTIVE_CONFLICT") {
        setLookupError("La persona ya tiene una vinculación activa en este contrato.");
      } else {
        setLookupError(getErrorMessage(error, "No fue posible guardar la vinculación."));
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
          <h1>Personal del contrato</h1>
          <p>Flujo operativo real: empresa, contrato, personal, vinculación, expediente y documentos.</p>
        </div>

        <div className="cp-toolbar-actions">
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
            Agregar personal al contrato
          </button>
          {canOpenAdmin && (
            <button type="button" className="cp-button ghost" onClick={() => navigate("/admin")}>
              <ShieldCheck size={15} />
              Administrar empresas y contratos
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div className={`cp-state ${feedback.tone === "error" ? "error" : "success"}`}>
          {feedback.tone === "error" ? <AlertTriangle size={16} /> : <FolderOpen size={16} />}
          {feedback.text}
        </div>
      )}

      <div className="cp-context-grid">
        <section className="cp-card">
          <div className="cp-card-header">
            <div>
              <span className="cp-eyebrow">Empresa</span>
              <h2>Seleccionar empresa</h2>
            </div>
            <Building2 size={18} />
          </div>
          <div className="cp-field-stack">
            <label className="cp-label">
              Buscar empresa
              <div className="cp-input-wrap">
                <Search size={15} />
                <input
                  className="cp-input"
                  value={empresaSearch}
                  onChange={(event) => setEmpresaSearch(event.target.value)}
                  placeholder="Nombre, NIT o ciudad"
                />
              </div>
            </label>
            <label className="cp-label">
              Empresa activa
              <select
                className="cp-select"
                value={empresaId ?? ""}
                onChange={(event) => {
                  setEmpresaId(event.target.value ? Number(event.target.value) : null);
                  setContratoId(null);
                  setSelectedVinculacionId(null);
                  setSelectedExpediente(null);
                }}
              >
                <option value="">Seleccionar empresa</option>
                {empresas.map((empresa) => (
                  <option key={empresa.id} value={empresa.id}>
                    {empresa.nombre_empresa}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="cp-card">
          <div className="cp-card-header">
            <div>
              <span className="cp-eyebrow">Contrato</span>
              <h2>Seleccionar contrato</h2>
            </div>
            <FileText size={18} />
          </div>
          <div className="cp-field-stack">
            <label className="cp-label">
              Buscar contrato
              <div className="cp-input-wrap">
                <Search size={15} />
                <input
                  className="cp-input"
                  value={contratoSearch}
                  onChange={(event) => setContratoSearch(event.target.value)}
                  placeholder="Número, objeto o entidad"
                  disabled={!empresaId}
                />
              </div>
            </label>
            <label className="cp-label">
              Contrato activo
              <select
                className="cp-select"
                value={contratoId ?? ""}
                onChange={(event) => {
                  setContratoId(event.target.value ? Number(event.target.value) : null);
                  setSelectedVinculacionId(null);
                  setSelectedExpediente(null);
                }}
                disabled={!empresaId}
              >
                <option value="">Seleccionar contrato</option>
                {contratos.map((contrato) => (
                  <option key={contrato.id} value={contrato.id}>
                    {contrato.numero_contrato} · {contrato.entidad_contratante}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
      </div>

      <div className="cp-active-context">
        <div>
          <span>EMPRESA ACTIVA</span>
          <strong>{selectedEmpresa?.nombre_empresa ?? "Sin seleccionar"}</strong>
        </div>
        <div>
          <span>CONTRATO ACTIVO</span>
          <strong>{selectedContrato?.numero_contrato ?? "Sin seleccionar"}</strong>
        </div>
      </div>

      <div className="cp-layout">
        <section className="cp-card cp-list-card">
          <div className="cp-card-header">
            <div>
              <span className="cp-eyebrow">Personal</span>
              <h2>Personal asociado al contrato</h2>
            </div>
            <Users size={18} />
          </div>

          <div className="cp-list-filters">
            <div className="cp-input-wrap">
              <Search size={15} />
              <input
                className="cp-input"
                value={personalSearch}
                onChange={(event) => setPersonalSearch(event.target.value)}
                placeholder="Documento, nombres o apellidos"
                disabled={!selectedContrato}
              />
            </div>
            <select
              className="cp-select"
              value={estadoFiltro}
              onChange={(event) => setEstadoFiltro(event.target.value as "" | VinculacionEstado)}
              disabled={!selectedContrato}
            >
              <option value="">Todos los estados</option>
              <option value="ACTIVA">Activas</option>
              <option value="SUSPENDIDA">Suspendidas</option>
              <option value="RETIRADA">Retiradas</option>
            </select>
          </div>

          {!selectedContrato ? (
            <div className="cp-list-body">
              <div className="cp-empty">Selecciona una empresa y un contrato para cargar su personal.</div>
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
                  <thead>
                    <tr>
                      <th>Documento</th>
                      <th>Nombre completo</th>
                      <th>Cargo</th>
                      <th>Asignación actual</th>
                      <th>Licitación</th>
                      <th>Estado</th>
                      <th>Ingreso</th>
                      <th>Expediente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(personal?.items ?? []).length === 0 && (
                      <tr>
                        <td colSpan={8} className="cp-empty-row">
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
                        <td className="cp-mono">{item.numero_documento}</td>
                        <td>{item.nombre_completo}</td>
                        <td>{item.cargo.nombre_cargo ?? "Sin cargo"}</td>
                        <td>
                          {item.es_manipuladora
                            ? [item.asignacion_actual.institucion, item.asignacion_actual.sede, item.asignacion_actual.modalidad].filter(Boolean).join(" · ") || "Sin asignación"
                            : item.asignacion_actual.nombre || "Sin asignación"}
                        </td>
                        <td>{item.presentada_licitacion_actual ? item.perfil_licitacion_actual ?? "Sí" : "No"}</td>
                        <td>
                          <span className={`cp-badge status-${item.estado_vinculacion.toLowerCase()}`}>
                            {getStatusLabel(item.estado_vinculacion)}
                          </span>
                        </td>
                        <td>{formatDate(item.fecha_ingreso)}</td>
                        <td>
                          <button
                            type="button"
                            className="cp-link-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedVinculacionId(item.vinculacion_id);
                            }}
                          >
                            Abrir <ArrowRight size={14} />
                          </button>
                        </td>
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
              <div className="cp-empty">Selecciona una vinculación para abrir su expediente.</div>
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
                  <span>Documentos vinculación</span>
                  <strong>{selectedExpediente.documentos_vinculacion.length}</strong>
                </div>
                <div className="cp-summary-item">
                  <span>Contrato</span>
                  <strong>{selectedExpediente.contrato.numero_contrato ?? "Sin número"}</strong>
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
                <h2>Agregar personal al contrato</h2>
                <p className="cp-modal-helper">
                  Buscar, crear o reutilizar persona y completar su vinculación.
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
                      La búsqueda reutiliza la identificación vigente y evita duplicar personas.
                    </p>
                  </div>
                </div>

                <div className="cp-modal-grid">
                  <label className="cp-label">
                    Tipo de identificación
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
                          {item.codigo ? `${item.codigo} · ${item.label}` : item.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="cp-label">
                    Número de identificación
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
                    No existe una persona con esa identificación vigente. Completa los datos mínimos para crearla.
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
                        Solo se solicitan los datos mínimos soportados por el backend actual.
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
                      Teléfono
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
                      <h3 className="cp-subtitle">Datos de vinculación</h3>
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
                      Tipo de vinculación
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
                            {item.codigo ? `${item.codigo} · ${item.label}` : item.label}
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
                      Método de pago
                      <select
                        className="cp-select"
                        value={vinculacionForm.metodo_pago}
                        onChange={(event) =>
                          setVinculacionForm((current) => ({ ...current, metodo_pago: event.target.value }))
                        }
                      >
                        <option value="">Sin método</option>
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
                  {savingWorker ? "Guardando..." : "Guardar vinculación"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
