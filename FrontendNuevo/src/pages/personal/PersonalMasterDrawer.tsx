import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardList,
  FileText,
  FolderOpen,
  Loader2,
  PencilLine,
  ShieldPlus,
  UserCircle2,
  X,
} from 'lucide-react';

import { configuracionApi } from '../../services/configuracionApi';
import { getDocumentoDownloadUrl, getDocumentosPersona } from '../../services/documentosApi';
import {
  getPersonaById,
  getPersonaIdentificaciones,
  getVinculacionesByPersonaId,
  updatePersona,
} from '../../services/personasApi';
import {
  crearExamenPersonaSst,
  listarExamenesOcupacionalesSst,
  listarExamenesPersonaSst,
  type CreateSstExamenPersonaRecordPayload,
  type SstExamenConceptoMedico,
  type SstExamenOcupacionalRecord,
  type SstExamenPersonaRecord,
} from '../../services/sstApi';
import type {
  CatalogoItem,
  Contrato,
  ContratoCargo,
  Municipio,
} from '../../types/configuracion.types';
import type { DocumentoPersonaApi } from '../../types/documentos.types';
import type {
  PersonaApi,
  PersonaIdentificacionApi,
  VinculacionApi,
  VinculacionExpedienteApi,
} from '../../types/personas.types';
import ChangeIdentificationModal from './ChangeIdentificationModal';
import ExpedienteDocumentosPanel from './ExpedienteDocumentosPanel';
import './PersonalMasterDrawer.css';

type MasterTab = 'datos' | 'vinculacion' | 'documentos' | 'salud';

type PersonalFormState = {
  primer_nombre: string;
  segundo_nombre: string;
  primer_apellido: string;
  segundo_apellido: string;
  fecha_nacimiento: string;
  sexo_id: string;
  estado_civil_id: string;
  telefono: string;
  correo: string;
  direccion: string;
  barrio: string;
  municipio_residencia_id: string;
  pais_nacimiento: string;
  nacionalidad: string;
  nivel_escolaridad: string;
  contacto_nombre: string;
  contacto_parentesco: string;
  contacto_telefono: string;
  contacto_direccion: string;
};

type RequisitoFormState = {
  examen_id: string;
  fecha_examen: string;
  fecha_vencimiento: string;
  concepto_medico: SstExamenConceptoMedico;
  restricciones: string;
  observacion: string;
  documento_persona_id: string;
};

interface PersonalMasterDrawerProps {
  expediente: VinculacionExpedienteApi | null;
  loading: boolean;
  error: string;
  onClose: () => void;
  onOpenManagement: () => void;
  onRefresh: () => void;
  permissions: string[];
  tipoDocumentoOptions: CatalogoItem[];
  tipoIdentificacionOptions: CatalogoItem[];
}

interface SectionLoadState {
  error: string;
  loading: boolean;
}

const IDLE_SECTION_STATE: SectionLoadState = { error: '', loading: false };
const API_MAX_PAGE_SIZE = 100;

const TAB_META: Array<{ id: MasterTab; label: string; icon: typeof UserCircle2 }> = [
  { id: 'datos', label: 'Datos personales', icon: UserCircle2 },
  { id: 'vinculacion', label: 'Vinculación', icon: BriefcaseBusiness },
  { id: 'documentos', label: 'Documentos', icon: FileText },
  { id: 'salud', label: 'Salud / Requisitos', icon: ShieldPlus },
];

const EMPTY_PERSONAL_FORM: PersonalFormState = {
  primer_nombre: '',
  segundo_nombre: '',
  primer_apellido: '',
  segundo_apellido: '',
  fecha_nacimiento: '',
  sexo_id: '',
  estado_civil_id: '',
  telefono: '',
  correo: '',
  direccion: '',
  barrio: '',
  municipio_residencia_id: '',
  pais_nacimiento: '',
  nacionalidad: '',
  nivel_escolaridad: '',
  contacto_nombre: '',
  contacto_parentesco: '',
  contacto_telefono: '',
  contacto_direccion: '',
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
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
    .join(' ');
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return 'Sin registrar';
  }

  try {
    return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(
      new Date(`${value}T00:00:00`),
    );
  } catch {
    return value;
  }
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return 'Sin registrar';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function displayValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return 'Sin registrar';
  }

  return String(value);
}

function abbreviateIdentification(value: string | null | undefined): string {
  const normalized = value?.toLocaleLowerCase('es-CO') ?? '';
  if (normalized.includes('ciudadan')) return 'C.C.';
  if (normalized.includes('extranjer')) return 'C.E.';
  if (normalized.includes('pasaporte')) return 'P.P.';
  if (normalized.includes('identidad')) return 'T.I.';
  return value || 'Identificación';
}

function toOptionMap<T extends { id: number }>(items: T[]): Map<number, T> {
  return new Map(items.map((item) => [item.id, item]));
}

async function getAllCatalogPages<T>(
  fetchPage: (page: number, limit: number) => Promise<{ items: T[]; pagination: { total_pages: number } }>,
  limit = API_MAX_PAGE_SIZE,
): Promise<T[]> {
  const firstPage = await fetchPage(1, limit);
  const items = [...firstPage.items];

  for (let page = 2; page <= firstPage.pagination.total_pages; page += 1) {
    const nextPage = await fetchPage(page, limit);
    items.push(...nextPage.items);
  }

  return items;
}

function buildPersonalForm(persona: PersonaApi | null): PersonalFormState {
  if (!persona) {
    return EMPTY_PERSONAL_FORM;
  }

  return {
    primer_nombre: persona.primer_nombre ?? '',
    segundo_nombre: persona.segundo_nombre ?? '',
    primer_apellido: persona.primer_apellido ?? '',
    segundo_apellido: persona.segundo_apellido ?? '',
    fecha_nacimiento: persona.fecha_nacimiento ?? '',
    sexo_id: persona.sexo_id ? String(persona.sexo_id) : '',
    estado_civil_id: persona.estado_civil_id ? String(persona.estado_civil_id) : '',
    telefono: persona.telefono ?? '',
    correo: persona.correo ?? '',
    direccion: persona.direccion ?? '',
    barrio: persona.barrio ?? '',
    municipio_residencia_id: persona.municipio_residencia_id ? String(persona.municipio_residencia_id) : '',
    pais_nacimiento: persona.pais_nacimiento ?? '',
    nacionalidad: persona.perfil_demografico?.nacionalidad ?? '',
    nivel_escolaridad: persona.perfil_demografico?.nivel_escolaridad ?? '',
    contacto_nombre: persona.contacto_emergencia?.nombre_contacto ?? '',
    contacto_parentesco: persona.contacto_emergencia?.parentesco ?? '',
    contacto_telefono: persona.contacto_emergencia?.telefono ?? '',
    contacto_direccion: persona.contacto_emergencia?.direccion ?? '',
  };
}

function buildFichaChecklist(persona: PersonaApi | null): string[] {
  if (!persona) {
    return [];
  }

  const missing: string[] = [];

  if (!persona.identificacion_vigente?.numero_documento && !persona.numero_documento) missing.push('Identificación vigente');
  if (!persona.primer_nombre) missing.push('Primer nombre');
  if (!persona.primer_apellido) missing.push('Primer apellido');
  if (!persona.fecha_nacimiento) missing.push('Fecha de nacimiento');
  if (!persona.telefono) missing.push('Teléfono');
  if (!persona.correo) missing.push('Correo');
  if (!persona.direccion) missing.push('Dirección');
  if (!persona.municipio_residencia_id) missing.push('Municipio de residencia');

  return missing;
}

function buildRequisitoForm(): RequisitoFormState {
  return {
    examen_id: '',
    fecha_examen: todayIso(),
    fecha_vencimiento: '',
    concepto_medico: 'APTO',
    restricciones: '',
    observacion: '',
    documento_persona_id: '',
  };
}

export default function PersonalMasterDrawer({
  expediente,
  loading,
  error,
  onClose,
  onOpenManagement,
  onRefresh,
  permissions,
  tipoDocumentoOptions,
  tipoIdentificacionOptions,
}: PersonalMasterDrawerProps) {
  const [activeTab, setActiveTab] = useState<MasterTab>('datos');
  const [personaDetail, setPersonaDetail] = useState<PersonaApi | null>(null);
  const [identificaciones, setIdentificaciones] = useState<PersonaIdentificacionApi[]>([]);
  const [vinculacionesHistory, setVinculacionesHistory] = useState<VinculacionApi[]>([]);
  const [contratosHistoryMap, setContratosHistoryMap] = useState<Map<number, Contrato>>(new Map());
  const [cargosHistoryMap, setCargosHistoryMap] = useState<Map<number, ContratoCargo>>(new Map());
  const [documentosPersona, setDocumentosPersona] = useState<DocumentoPersonaApi[]>([]);
  const [sstCatalog, setSstCatalog] = useState<SstExamenOcupacionalRecord[]>([]);
  const [sstExamenes, setSstExamenes] = useState<SstExamenPersonaRecord[]>([]);
  const [datosState, setDatosState] = useState<SectionLoadState>(IDLE_SECTION_STATE);
  const [vinculacionState, setVinculacionState] = useState<SectionLoadState>(IDLE_SECTION_STATE);
  const [documentosState, setDocumentosState] = useState<SectionLoadState>(IDLE_SECTION_STATE);
  const [saludState, setSaludState] = useState<SectionLoadState>(IDLE_SECTION_STATE);
  const [datosRetry, setDatosRetry] = useState(0);
  const [vinculacionRetry, setVinculacionRetry] = useState(0);
  const [documentosRetry, setDocumentosRetry] = useState(0);
  const [saludRetry, setSaludRetry] = useState(0);
  const [isEditingPersonal, setIsEditingPersonal] = useState(false);
  const [showIdentificationModal, setShowIdentificationModal] = useState(false);
  const [showRequisitoForm, setShowRequisitoForm] = useState(false);
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [savingRequisito, setSavingRequisito] = useState(false);
  const [personalError, setPersonalError] = useState('');
  const [requisitoError, setRequisitoError] = useState('');
  const [personalForm, setPersonalForm] = useState<PersonalFormState>(EMPTY_PERSONAL_FORM);
  const [requisitoForm, setRequisitoForm] = useState<RequisitoFormState>(buildRequisitoForm());
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [sexos, setSexos] = useState<CatalogoItem[]>([]);
  const [estadosCiviles, setEstadosCiviles] = useState<CatalogoItem[]>([]);
  const [nivelesEstudio, setNivelesEstudio] = useState<CatalogoItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  const canUpdatePersona = permissions.includes('personas.update');
  const canReadSst = permissions.includes('sst.examenes.read');
  const canWriteSst = permissions.includes('sst.examenes.write');
  const municipioMap = useMemo(() => toOptionMap(municipios), [municipios]);
  const sexosMap = useMemo(() => toOptionMap(sexos), [sexos]);
  const estadosCivilesMap = useMemo(() => toOptionMap(estadosCiviles), [estadosCiviles]);
  const fichaMissingFields = useMemo(() => buildFichaChecklist(personaDetail), [personaDetail]);
  const fichaCompleta = fichaMissingFields.length === 0;
  const fichaStatus = datosState.loading && !personaDetail
    ? { label: 'Verificando ficha...', tone: 'loading' }
    : datosState.error && !personaDetail
      ? { label: 'No se pudo verificar', tone: 'error' }
      : personaDetail
        ? { label: fichaCompleta ? 'Ficha completa' : 'Ficha incompleta', tone: fichaCompleta ? 'ok' : 'warn' }
        : { label: 'Verificando ficha...', tone: 'loading' };
  const currentIdentification = personaDetail?.identificacion_vigente ?? identificaciones.find((item) => item.es_vigente) ?? null;

  useEffect(() => {
    setActiveTab('datos');
    setIsEditingPersonal(false);
    setShowIdentificationModal(false);
    setShowRequisitoForm(false);
    setPersonalError('');
    setRequisitoError('');
  }, [expediente?.vinculacion.id]);

  useEffect(() => {
    if (!expediente) {
      setPersonaDetail(null);
      setIdentificaciones([]);
      setVinculacionesHistory([]);
      setContratosHistoryMap(new Map());
      setCargosHistoryMap(new Map());
      setDocumentosPersona([]);
      setSstCatalog([]);
      setSstExamenes([]);
      setDatosState(IDLE_SECTION_STATE);
      setVinculacionState(IDLE_SECTION_STATE);
      setDocumentosState(IDLE_SECTION_STATE);
      setSaludState(IDLE_SECTION_STATE);
      return;
    }

    let cancelled = false;
    const activeExpediente = expediente;

    async function loadDatos() {
      setDatosState({ loading: true, error: '' });
      const [personaResult, identificacionesResult] = await Promise.allSettled([
        getPersonaById(activeExpediente.persona.id),
        getPersonaIdentificaciones(activeExpediente.persona.id),
      ]);
      if (cancelled) return;

      if (personaResult.status === 'fulfilled') {
        setPersonaDetail(personaResult.value);
        setPersonalForm(buildPersonalForm(personaResult.value));
      } else {
        setPersonaDetail(null);
      }
      if (identificacionesResult.status === 'fulfilled') {
        setIdentificaciones(identificacionesResult.value);
      } else {
        setIdentificaciones([]);
      }

      const errorMessage = personaResult.status === 'rejected'
        ? 'No fue posible cargar los datos personales.'
        : identificacionesResult.status === 'rejected'
          ? 'No fue posible cargar el historial de identificaciones.'
          : '';
      setDatosState({ loading: false, error: errorMessage });
    }

    void loadDatos();

    return () => {
      cancelled = true;
    };
  }, [datosRetry, expediente]);

  useEffect(() => {
    if (!expediente) return;
    let cancelled = false;
    const activeExpediente = expediente;

    async function loadVinculaciones() {
      setVinculacionState({ loading: true, error: '' });
      try {
        const vinculacionesResult = await getVinculacionesByPersonaId(activeExpediente.persona.id);
        const contractIds = Array.from(new Set(vinculacionesResult.map((item) => item.contrato_id)));
        const cargoIds = Array.from(new Set(vinculacionesResult.map((item) => item.contrato_cargo_id)));
        const [contratosResult, cargosResult] = await Promise.all([
          Promise.allSettled(contractIds.map(async (id) => [id, await configuracionApi.obtenerContrato(id)] as const)),
          Promise.allSettled(cargoIds.map(async (id) => [id, await configuracionApi.obtenerCargo(id)] as const)),
        ]);
        if (cancelled) return;
        setVinculacionesHistory(vinculacionesResult);
        setContratosHistoryMap(new Map(contratosResult.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])));
        setCargosHistoryMap(new Map(cargosResult.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])));
        const hasMetadataError = [...contratosResult, ...cargosResult].some((result) => result.status === 'rejected');
        setVinculacionState({ loading: false, error: hasMetadataError ? 'Algunos detalles del historial contractual no pudieron cargarse.' : '' });
      } catch {
        if (!cancelled) {
          setVinculacionesHistory([]);
          setVinculacionState({ loading: false, error: 'No fue posible cargar las vinculaciones.' });
        }
      }
    }

    void loadVinculaciones();
    return () => { cancelled = true; };
  }, [expediente, vinculacionRetry]);

  useEffect(() => {
    if (!expediente) return;
    let cancelled = false;
    const personaId = expediente.persona.id;
    setDocumentosState({ loading: true, error: '' });
    void getDocumentosPersona(personaId)
      .then((result) => {
        if (!cancelled) {
          setDocumentosPersona(result);
          setDocumentosState({ loading: false, error: '' });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDocumentosPersona([]);
          setDocumentosState({ loading: false, error: 'No fue posible cargar los documentos.' });
        }
      });
    return () => { cancelled = true; };
  }, [documentosRetry, expediente]);

  useEffect(() => {
    if (!expediente) return;
    if (!canReadSst) {
      setSstExamenes([]);
      setSstCatalog([]);
      setSaludState(IDLE_SECTION_STATE);
      return;
    }
    let cancelled = false;
    const activeExpediente = expediente;
    setSaludState({ loading: true, error: '' });

    void Promise.allSettled([
      listarExamenesPersonaSst({ persona_id: activeExpediente.persona.id, page: 1, limit: API_MAX_PAGE_SIZE, activo: true }),
      listarExamenesOcupacionalesSst({
        empresa_id: activeExpediente.empresa.id,
        contrato_id: activeExpediente.contrato.id,
        activo: true,
        page: 1,
        limit: API_MAX_PAGE_SIZE,
      }),
    ]).then(([examenesResult, catalogoResult]) => {
      if (cancelled) return;
      setSstExamenes(examenesResult.status === 'fulfilled' ? examenesResult.value.items : []);
      setSstCatalog(catalogoResult.status === 'fulfilled' ? catalogoResult.value.items : []);
      const failed = Number(examenesResult.status === 'rejected') + Number(catalogoResult.status === 'rejected');
      setSaludState({
        loading: false,
        error: failed === 0 ? '' : failed === 2
          ? 'No fue posible cargar los requisitos de salud.'
          : 'Parte de la información de salud no pudo cargarse.',
      });
    });
    return () => { cancelled = true; };
  }, [canReadSst, expediente, saludRetry]);

  useEffect(() => {
    if (!isEditingPersonal && !showIdentificationModal) {
      return;
    }

    if (municipios.length > 0 && sexos.length > 0 && estadosCiviles.length > 0 && nivelesEstudio.length > 0) {
      return;
    }

    let cancelled = false;

    async function loadCatalogs() {
      setCatalogLoading(true);

      try {
        const [municipiosResult, sexosResult, estadosCivilesResult, nivelesEstudioResult] = await Promise.all([
          municipios.length > 0
            ? Promise.resolve(municipios)
            : getAllCatalogPages((page, limit) => configuracionApi.listarMunicipios({ page, limit, activo: true })),
          sexos.length > 0
            ? Promise.resolve(sexos)
            : getAllCatalogPages((page, limit) => configuracionApi.listarSexos({ page, limit })),
          estadosCiviles.length > 0
            ? Promise.resolve(estadosCiviles)
            : getAllCatalogPages((page, limit) => configuracionApi.listarEstadosCiviles({ page, limit })),
          nivelesEstudio.length > 0
            ? Promise.resolve(nivelesEstudio)
            : getAllCatalogPages((page, limit) => configuracionApi.listarNivelesEstudio({ page, limit })),
        ]);

        if (cancelled) {
          return;
        }

        setMunicipios(municipiosResult);
        setSexos(sexosResult);
        setEstadosCiviles(estadosCivilesResult);
        setNivelesEstudio(nivelesEstudioResult);
      } finally {
        if (!cancelled) {
          setCatalogLoading(false);
        }
      }
    }

    void loadCatalogs();

    return () => {
      cancelled = true;
    };
  }, [estadosCiviles, isEditingPersonal, municipios, nivelesEstudio, sexos, showIdentificationModal]);

  useEffect(() => {
    if (!personaDetail) {
      return;
    }

    setPersonalForm(buildPersonalForm(personaDetail));
  }, [personaDetail]);

  if (!expediente) {
    return null;
  }

  const activeExpediente = expediente;

  function setFormField<K extends keyof PersonalFormState>(field: K, value: PersonalFormState[K]) {
    setPersonalForm((current) => ({ ...current, [field]: value }));
  }

  function setRequisitoField<K extends keyof RequisitoFormState>(field: K, value: RequisitoFormState[K]) {
    setRequisitoForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSavePersonal() {
    if (!personaDetail) {
      return;
    }

    setSavingPersonal(true);
    setPersonalError('');

    try {
      const nivelEstudioOption = nivelesEstudio.find((item) => String(item.id) === personalForm.nivel_escolaridad);
      await updatePersona(personaDetail.id, {
        primer_nombre: personalForm.primer_nombre.trim(),
        segundo_nombre: personalForm.segundo_nombre.trim() || null,
        primer_apellido: personalForm.primer_apellido.trim(),
        segundo_apellido: personalForm.segundo_apellido.trim() || null,
        fecha_nacimiento: personalForm.fecha_nacimiento || null,
        sexo_id: personalForm.sexo_id ? Number(personalForm.sexo_id) : null,
        estado_civil_id: personalForm.estado_civil_id ? Number(personalForm.estado_civil_id) : null,
        telefono: personalForm.telefono.trim() || null,
        correo: personalForm.correo.trim() || null,
        direccion: personalForm.direccion.trim() || null,
        barrio: personalForm.barrio.trim() || null,
        municipio_residencia_id: personalForm.municipio_residencia_id ? Number(personalForm.municipio_residencia_id) : null,
        pais_nacimiento: personalForm.pais_nacimiento.trim() || null,
        contacto_emergencia:
          personalForm.contacto_nombre.trim() ||
          personalForm.contacto_parentesco.trim() ||
          personalForm.contacto_telefono.trim() ||
          personalForm.contacto_direccion.trim()
            ? {
                nombre_contacto: personalForm.contacto_nombre.trim() || null,
                parentesco: personalForm.contacto_parentesco.trim() || null,
                telefono: personalForm.contacto_telefono.trim() || null,
                direccion: personalForm.contacto_direccion.trim() || null,
                activo: true,
              }
            : null,
        perfil_demografico:
          personalForm.nacionalidad.trim() || nivelEstudioOption
            ? {
                nacionalidad: personalForm.nacionalidad.trim() || null,
                nivel_escolaridad: nivelEstudioOption?.label ?? (personalForm.nivel_escolaridad || null),
              }
            : null,
      });

      const refreshedPersona = await getPersonaById(personaDetail.id);
      setPersonaDetail(refreshedPersona);
      setIsEditingPersonal(false);
      onRefresh();
    } catch (saveError) {
      setPersonalError(saveError instanceof Error ? saveError.message : 'No fue posible guardar los datos personales.');
    } finally {
      setSavingPersonal(false);
    }
  }

  async function handleCreateRequisito() {
    if (!personaDetail) {
      return;
    }

    if (!requisitoForm.examen_id || !requisitoForm.fecha_examen) {
      setRequisitoError('Selecciona el tipo de requisito y la fecha de realización.');
      return;
    }

    setSavingRequisito(true);
    setRequisitoError('');

    try {
      const payload: CreateSstExamenPersonaRecordPayload = {
        examen_id: Number(requisitoForm.examen_id),
        persona_id: personaDetail.id,
        vinculacion_id: activeExpediente.vinculacion.id,
        fecha_examen: requisitoForm.fecha_examen,
        fecha_vencimiento: requisitoForm.fecha_vencimiento || null,
        concepto_medico: requisitoForm.concepto_medico,
        restricciones: requisitoForm.restricciones.trim() || null,
        observacion: requisitoForm.observacion.trim() || null,
        documento_persona_id: requisitoForm.documento_persona_id ? Number(requisitoForm.documento_persona_id) : null,
      };

      await crearExamenPersonaSst(payload);
      const refreshed = await listarExamenesPersonaSst({
        persona_id: personaDetail.id,
        page: 1,
        limit: API_MAX_PAGE_SIZE,
        activo: true,
      });
      setSstExamenes(refreshed.items);
      setShowRequisitoForm(false);
      setRequisitoForm(buildRequisitoForm());
    } catch (saveError) {
      setRequisitoError(saveError instanceof Error ? saveError.message : 'No fue posible registrar el requisito.');
    } finally {
      setSavingRequisito(false);
    }
  }

  async function handleOpenDocumento(documentoId: string) {
    const response = await getDocumentoDownloadUrl(documentoId, 'PERSONA');
    window.open(response.download_url, '_blank', 'noopener,noreferrer');
  }

  function renderDatosTab() {
    if (datosState.loading && !personaDetail) {
      return <StateBlock message="Cargando ficha maestra..." />;
    }

    if (datosState.error && !personaDetail) {
      return <StateBlock tone="error" message={datosState.error} onAction={() => setDatosRetry((value) => value + 1)} />;
    }

    if (!personaDetail) {
      return <StateBlock tone="error" message="No fue posible cargar los datos personales." onAction={() => setDatosRetry((value) => value + 1)} />;
    }

    return (
      <div className="pmd-stack">
        <section className="pmd-card">
          <div className="pmd-card-header">
            <div>
              <h3>Identificación</h3>
              <p>La identificación vigente se conserva con historial.</p>
            </div>
            <button
              type="button"
              className="pmd-button ghost"
              onClick={() => setShowIdentificationModal(true)}
              disabled={!canUpdatePersona}
            >
              <ClipboardList size={15} />
              Cambiar identificación
            </button>
          </div>

          {datosState.error && (
            <StateBlock tone="error" message={datosState.error} compact onAction={() => setDatosRetry((value) => value + 1)} />
          )}

          <div className="pmd-info-grid compact-four">
            <DataItem label="Tipo de identificación" value={currentIdentification?.tipo_documento_nombre ?? `Tipo ${currentIdentification?.tipo_documento_id ?? activeExpediente.persona.tipo_documento_id ?? '—'}`} />
            <DataItem label="Número de identificación" value={currentIdentification?.numero_documento ?? activeExpediente.persona.numero_documento} />
            <DataItem label="Fecha de expedición" value={formatDate(currentIdentification?.fecha_expedicion_documento ?? activeExpediente.persona.fecha_expedicion_documento)} />
            <DataItem label="Lugar de expedición" value={currentIdentification?.municipio_expedicion_nombre ?? 'Sin registrar'} />
          </div>

          {identificaciones.length > 1 && <details className="pmd-inline-history">
            <summary>Ver historial de identificaciones ({identificaciones.length})</summary>
            <div className="pmd-history-list">
            {identificaciones.map((item) => (
              <div key={item.id} className="pmd-history-item">
                <div className="pmd-history-head">
                  <strong>
                    {item.tipo_documento_nombre ?? `Tipo ${item.tipo_documento_id}`} · {item.numero_documento}
                  </strong>
                  <span className={`pmd-inline-badge ${item.es_vigente ? 'ok' : 'muted'}`}>
                    {item.es_vigente ? 'Vigente' : 'Histórica'}
                  </span>
                </div>
                <div className="pmd-history-meta">
                  <span>Motivo: {item.motivo_cambio}</span>
                  <span>Desde: {formatDateTime(item.vigente_desde)}</span>
                  <span>Hasta: {formatDateTime(item.vigente_hasta)}</span>
                </div>
              </div>
            ))}
            </div>
          </details>}
        </section>

        <section className="pmd-card">
          <div className="pmd-card-header">
            <div>
              <h3>Información personal</h3>
              <p>Consulta rápida de identidad, contacto y residencia.</p>
            </div>
            <button
              type="button"
              className="pmd-button ghost"
              onClick={() => {
                setPersonalForm(buildPersonalForm(personaDetail));
                setIsEditingPersonal((current) => !current);
                setPersonalError('');
              }}
              disabled={!canUpdatePersona}
            >
              <PencilLine size={15} />
              {isEditingPersonal ? 'Cancelar edición' : 'Editar datos'}
            </button>
          </div>

          {isEditingPersonal ? (
            <div className="pmd-edit-layout">
              <div className="pmd-grid two">
                <Field label="Primer nombre *">
                  <input value={personalForm.primer_nombre} onChange={(event) => setFormField('primer_nombre', event.target.value)} />
                </Field>
                <Field label="Segundo nombre">
                  <input value={personalForm.segundo_nombre} onChange={(event) => setFormField('segundo_nombre', event.target.value)} />
                </Field>
                <Field label="Primer apellido *">
                  <input value={personalForm.primer_apellido} onChange={(event) => setFormField('primer_apellido', event.target.value)} />
                </Field>
                <Field label="Segundo apellido">
                  <input value={personalForm.segundo_apellido} onChange={(event) => setFormField('segundo_apellido', event.target.value)} />
                </Field>
                <Field label="Fecha de nacimiento">
                  <input type="date" value={personalForm.fecha_nacimiento} onChange={(event) => setFormField('fecha_nacimiento', event.target.value)} />
                </Field>
                <Field label="Sexo">
                  <select value={personalForm.sexo_id} onChange={(event) => setFormField('sexo_id', event.target.value)} disabled={catalogLoading}>
                    <option value="">Sin registrar</option>
                    {sexos.map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Estado civil">
                  <select value={personalForm.estado_civil_id} onChange={(event) => setFormField('estado_civil_id', event.target.value)} disabled={catalogLoading}>
                    <option value="">Sin registrar</option>
                    {estadosCiviles.map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Teléfono">
                  <input value={personalForm.telefono} onChange={(event) => setFormField('telefono', event.target.value)} />
                </Field>
                <Field label="Correo electrónico">
                  <input type="email" value={personalForm.correo} onChange={(event) => setFormField('correo', event.target.value)} />
                </Field>
                <Field label="Dirección">
                  <input value={personalForm.direccion} onChange={(event) => setFormField('direccion', event.target.value)} />
                </Field>
                <Field label="Barrio">
                  <input value={personalForm.barrio} onChange={(event) => setFormField('barrio', event.target.value)} />
                </Field>
                <Field label="Municipio de residencia">
                  <select value={personalForm.municipio_residencia_id} onChange={(event) => setFormField('municipio_residencia_id', event.target.value)} disabled={catalogLoading}>
                    <option value="">Sin registrar</option>
                    {municipios.map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="País de nacimiento">
                  <input value={personalForm.pais_nacimiento} onChange={(event) => setFormField('pais_nacimiento', event.target.value)} />
                </Field>
                <Field label="Nacionalidad">
                  <input value={personalForm.nacionalidad} onChange={(event) => setFormField('nacionalidad', event.target.value)} />
                </Field>
                <Field label="Nivel educativo">
                  <select value={personalForm.nivel_escolaridad} onChange={(event) => setFormField('nivel_escolaridad', event.target.value)} disabled={catalogLoading}>
                    <option value="">Sin registrar</option>
                    {nivelesEstudio.map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="pmd-subcard">
                <h4>Contacto de emergencia</h4>
                <div className="pmd-grid two">
                  <Field label="Nombre">
                    <input value={personalForm.contacto_nombre} onChange={(event) => setFormField('contacto_nombre', event.target.value)} />
                  </Field>
                  <Field label="Parentesco">
                    <input value={personalForm.contacto_parentesco} onChange={(event) => setFormField('contacto_parentesco', event.target.value)} />
                  </Field>
                  <Field label="Teléfono">
                    <input value={personalForm.contacto_telefono} onChange={(event) => setFormField('contacto_telefono', event.target.value)} />
                  </Field>
                  <Field label="Dirección">
                    <input value={personalForm.contacto_direccion} onChange={(event) => setFormField('contacto_direccion', event.target.value)} />
                  </Field>
                </div>
              </div>

              {personalError && <StateBlock tone="error" message={personalError} compact />}

              <div className="pmd-actions-row">
                <button type="button" className="pmd-button secondary" onClick={() => setIsEditingPersonal(false)}>
                  Cancelar
                </button>
                <button type="button" className="pmd-button primary" onClick={() => { void handleSavePersonal(); }} disabled={savingPersonal}>
                  {savingPersonal ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />}
                  Guardar cambios
                </button>
              </div>
            </div>
          ) : (
            <div className="pmd-profile-sections">
              <section className="pmd-info-section">
                <h4>Información personal</h4>
                <div className="pmd-info-grid compact-three">
                <DataItem label="Primer nombre" value={personaDetail.primer_nombre} />
                <DataItem label="Segundo nombre" value={displayValue(personaDetail.segundo_nombre)} />
                <DataItem label="Primer apellido" value={personaDetail.primer_apellido} />
                <DataItem label="Segundo apellido" value={displayValue(personaDetail.segundo_apellido)} />
                <DataItem label="Fecha de nacimiento" value={formatDate(personaDetail.fecha_nacimiento)} />
                <DataItem label="Sexo" value={personaDetail.sexo_id ? sexosMap.get(personaDetail.sexo_id)?.label ?? displayValue(activeExpediente.persona.sexo) : displayValue(activeExpediente.persona.sexo)} />
                <DataItem label="Estado civil" value={personaDetail.estado_civil_id ? estadosCivilesMap.get(personaDetail.estado_civil_id)?.label ?? displayValue(activeExpediente.persona.estado_civil) : displayValue(activeExpediente.persona.estado_civil)} />
                <DataItem label="Tipo de sangre" value={displayValue(activeExpediente.persona.tipo_sangre)} />
                <DataItem label="Estatura" value={personaDetail.estatura == null ? 'Sin registrar' : `${personaDetail.estatura} cm`} />
                <DataItem label="Nacionalidad" value={displayValue(personaDetail.perfil_demografico?.nacionalidad)} />
                <DataItem label="Nivel educativo" value={displayValue(personaDetail.perfil_demografico?.nivel_escolaridad)} />
                </div>
              </section>

              <section className="pmd-info-section">
                <h4>Contacto y residencia</h4>
                <div className="pmd-info-grid compact-three">
                <DataItem label="Teléfono" value={displayValue(personaDetail.telefono)} />
                <DataItem label="Correo" value={displayValue(personaDetail.correo)} />
                <DataItem label="Dirección" value={displayValue(personaDetail.direccion)} />
                <DataItem label="Barrio" value={displayValue(personaDetail.barrio)} />
                <DataItem label="Municipio de residencia" value={personaDetail.municipio_residencia_id ? municipioMap.get(personaDetail.municipio_residencia_id)?.label ?? `ID ${personaDetail.municipio_residencia_id}` : 'Sin registrar'} />
                <DataItem label="País de nacimiento" value={displayValue(personaDetail.pais_nacimiento)} />
                </div>
              </section>

              <section className="pmd-info-section">
                <h4>Contacto de emergencia</h4>
                <div className="pmd-info-grid compact-four">
                  <DataItem label="Nombre" value={displayValue(personaDetail.contacto_emergencia?.nombre_contacto)} />
                  <DataItem label="Parentesco" value={displayValue(personaDetail.contacto_emergencia?.parentesco)} />
                  <DataItem label="Teléfono" value={displayValue(personaDetail.contacto_emergencia?.telefono)} />
                  <DataItem label="Dirección" value={displayValue(personaDetail.contacto_emergencia?.direccion)} />
                </div>
              </section>
            </div>
          )}
        </section>
      </div>
    );
  }

  function renderVinculacionTab() {
    const personalContext = activeExpediente.personal_contexto;
    const licitacionActual = personalContext.presentada_licitacion_actual;

    return (
      <div className="pmd-stack">
        <section className="pmd-card">
          <div className="pmd-card-header">
            <div>
              <h3>Vinculación actual</h3>
              <p>Los datos contractuales permanecen separados de la persona maestra.</p>
            </div>
            <button type="button" className="pmd-button ghost" onClick={onOpenManagement}>
              <FolderOpen size={15} />
              Gestionar vinculaciones
            </button>
          </div>

          <div className="pmd-info-grid compact-four">
            <DataItem label="Empresa" value={displayValue(activeExpediente.empresa.nombre_empresa)} />
            <DataItem label="Contrato" value={displayValue(activeExpediente.contrato.numero_contrato)} />
            <DataItem label="Cargo" value={displayValue(activeExpediente.cargo.nombre_cargo)} />
            <DataItem label="Tipo de vinculación" value={displayValue(activeExpediente.tipo_vinculacion.nombre_vinculacion)} />
            <DataItem label="Ingreso" value={formatDate(activeExpediente.vinculacion.fecha_inicio)} />
            <DataItem label="Retiro" value={formatDate(activeExpediente.vinculacion.fecha_fin)} />
            <DataItem label="Estado" value={activeExpediente.vinculacion.estado_vinculacion} />
            <DataItem label="Método de pago" value={displayValue(activeExpediente.vinculacion.metodo_pago)} />
          </div>
        </section>

        <section className="pmd-card">
          <div className="pmd-card-header">
            <div>
              <h3>{personalContext.es_manipuladora ? 'Asignación operativa' : 'Asignación laboral'}</h3>
              <p>
                {personalContext.es_manipuladora
                  ? 'La cobertura vigente se toma desde la sede-modalidad asignada.'
                  : 'La ubicación laboral se conserva separada del cargo real y de la cobertura.'}
              </p>
            </div>
          </div>

          {personalContext.es_manipuladora ? (
            <div className="pmd-info-grid compact-four">
              <DataItem label="Cobertura" value={personalContext.asignacion_operativa_actual ? 'Cuenta cobertura' : 'Sin asignación'} />
              <DataItem label="Institución" value={displayValue(personalContext.asignacion_operativa_actual?.institucion)} />
              <DataItem label="Sede" value={displayValue(personalContext.asignacion_operativa_actual?.sede)} />
              <DataItem label="Modalidad" value={displayValue(personalContext.asignacion_operativa_actual?.modalidad)} />
            </div>
          ) : (
            <div className="pmd-info-grid compact-four">
              <DataItem label="Asignación actual" value={displayValue(personalContext.asignacion_laboral_actual?.nombre_ubicacion)} />
              <DataItem label="Estado asignación" value={displayValue(personalContext.asignacion_laboral_actual?.estado)} />
              <DataItem label="Desde" value={formatDate(personalContext.asignacion_laboral_actual?.vigencia_desde)} />
              <DataItem label="Hasta" value={formatDate(personalContext.asignacion_laboral_actual?.vigencia_hasta)} />
            </div>
          )}
        </section>

        <section className="pmd-card">
          <div className="pmd-card-header">
            <div>
              <h3>Licitación</h3>
              <p>La acreditación de licitación se muestra sin alterar el cargo real.</p>
            </div>
          </div>

          <div className="pmd-info-grid compact-four">
            <DataItem label="Presentada en licitación" value={licitacionActual ? 'Sí' : 'No'} />
            <DataItem label="Perfil licitación" value={displayValue(licitacionActual?.perfil.nombre_perfil)} />
            <DataItem label="Estado requisitos" value={displayValue(licitacionActual?.cumple_requisitos_estado)} />
            <DataItem label="Vigencia actual" value={licitacionActual ? `${formatDate(licitacionActual.vigencia_desde)} a ${formatDate(licitacionActual.vigencia_hasta)}` : 'Sin registrar'} />
          </div>
        </section>

        <section className="pmd-card">
          <div className="pmd-card-header">
            <div>
              <h3>Historial de vinculaciones</h3>
              <p>Una misma persona puede tener múltiples contratos sin duplicarse.</p>
            </div>
          </div>

          {vinculacionState.loading && vinculacionesHistory.length === 0 ? (
            <StateBlock message="Cargando historial contractual..." compact />
          ) : vinculacionState.error && vinculacionesHistory.length === 0 ? (
            <StateBlock tone="error" message={vinculacionState.error} compact onAction={() => setVinculacionRetry((value) => value + 1)} />
          ) : vinculacionesHistory.length === 0 ? (
            <StateBlock tone="empty" message="Esta persona no tiene vinculaciones registradas." compact />
          ) : (
            <>
              {vinculacionState.error && (
                <StateBlock tone="error" message={vinculacionState.error} compact onAction={() => setVinculacionRetry((value) => value + 1)} />
              )}
              <div className="pmd-table-wrap">
                <table className="pmd-compact-table">
                  <thead><tr><th>Contrato</th><th>Empresa</th><th>Cargo</th><th>Ingreso</th><th>Retiro</th><th>Estado</th></tr></thead>
                  <tbody>{vinculacionesHistory.map((item) => (
                    <tr key={item.id}>
                      <td>{contratosHistoryMap.get(item.contrato_id)?.numero_contrato ?? `#${item.contrato_id}`}</td>
                      <td>{contratosHistoryMap.get(item.contrato_id)?.empresa.nombre_empresa ?? `#${item.empresa_id}`}</td>
                      <td>{cargosHistoryMap.get(item.contrato_cargo_id)?.nombre_cargo ?? `#${item.contrato_cargo_id}`}</td>
                      <td>{formatDate(item.fecha_inicio)}</td>
                      <td>{formatDate(item.fecha_fin)}</td>
                      <td><span className={`pmd-inline-badge ${item.estado_vinculacion === 'ACTIVA' ? 'ok' : item.estado_vinculacion === 'SUSPENDIDA' ? 'warn' : 'danger'}`}>{item.estado_vinculacion}</span></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    );
  }

  function renderDocumentosTab() {
    return (
      <div className="pmd-stack">
        {documentosState.loading && documentosPersona.length === 0 && <StateBlock message="Cargando documentos..." compact />}
        {documentosState.error && (
          <StateBlock tone="error" message={documentosState.error} compact onAction={() => setDocumentosRetry((value) => value + 1)} />
        )}
        <ExpedienteDocumentosPanel
          personaId={activeExpediente.persona.id}
          vinculacionId={activeExpediente.vinculacion.id}
          tipoDocumentoOptions={tipoDocumentoOptions}
        />
      </div>
    );
  }

  function renderSaludTab() {
    if (!canReadSst) {
      return (
        <StateBlock
          tone="error"
          message="No tienes permisos SST para consultar exámenes y requisitos de esta persona."
        />
      );
    }

    if (saludState.loading && sstExamenes.length === 0 && sstCatalog.length === 0) {
      return <StateBlock message="Cargando requisitos de salud..." />;
    }

    if (saludState.error && sstExamenes.length === 0 && sstCatalog.length === 0) {
      return <StateBlock tone="error" message={saludState.error} onAction={() => setSaludRetry((value) => value + 1)} />;
    }

    return (
      <div className="pmd-stack">
        {saludState.error && (
          <StateBlock tone="error" message={saludState.error} compact onAction={() => setSaludRetry((value) => value + 1)} />
        )}
        <section className="pmd-card">
          <div className="pmd-card-header">
            <div>
              <h3>Salud y requisitos</h3>
              <p>Se reutiliza la estructura histórica SST con soporte documental opcional.</p>
            </div>
            <button
              type="button"
              className="pmd-button ghost"
              onClick={() => {
                setShowRequisitoForm((current) => !current);
                setRequisitoError('');
              }}
              disabled={!canWriteSst}
            >
              <ShieldPlus size={15} />
              Registrar requisito
            </button>
          </div>

          {showRequisitoForm && (
            <div className="pmd-subcard">
              <div className="pmd-grid two">
                <Field label="Tipo de requisito *">
                  <select value={requisitoForm.examen_id} onChange={(event) => setRequisitoField('examen_id', event.target.value)}>
                    <option value="">Seleccionar</option>
                    {sstCatalog.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nombre_examen}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Concepto">
                  <select value={requisitoForm.concepto_medico} onChange={(event) => setRequisitoField('concepto_medico', event.target.value as SstExamenConceptoMedico)}>
                    <option value="APTO">Apto</option>
                    <option value="APTO_CON_RESTRICCIONES">Apto con restricciones</option>
                    <option value="NO_APTO">No apto</option>
                    <option value="PENDIENTE">Pendiente</option>
                  </select>
                </Field>
                <Field label="Fecha de realización *">
                  <input type="date" value={requisitoForm.fecha_examen} onChange={(event) => setRequisitoField('fecha_examen', event.target.value)} />
                </Field>
                <Field label="Fecha de vencimiento">
                  <input type="date" value={requisitoForm.fecha_vencimiento} onChange={(event) => setRequisitoField('fecha_vencimiento', event.target.value)} />
                </Field>
                <Field label="Documento soporte">
                  <select value={requisitoForm.documento_persona_id} onChange={(event) => setRequisitoField('documento_persona_id', event.target.value)}>
                    <option value="">Sin asociar</option>
                    {documentosPersona.map((documento) => (
                      <option key={documento.id} value={documento.id}>
                        {documento.tipo_documento_nombre ?? `Documento ${documento.id}`} · {documento.nombre_original}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Restricciones">
                  <input value={requisitoForm.restricciones} onChange={(event) => setRequisitoField('restricciones', event.target.value)} />
                </Field>
              </div>

              <Field label="Observaciones">
                <textarea value={requisitoForm.observacion} onChange={(event) => setRequisitoField('observacion', event.target.value)} />
              </Field>

              {requisitoError && <StateBlock tone="error" message={requisitoError} compact />}

              <div className="pmd-actions-row">
                <button type="button" className="pmd-button secondary" onClick={() => setShowRequisitoForm(false)}>
                  Cancelar
                </button>
                <button type="button" className="pmd-button primary" onClick={() => { void handleCreateRequisito(); }} disabled={savingRequisito}>
                  {savingRequisito ? <Loader2 size={15} className="spin" /> : <ShieldPlus size={15} />}
                  Guardar requisito
                </button>
              </div>
            </div>
          )}

          {sstExamenes.length === 0 ? (
            <StateBlock
              tone="empty"
              message="No hay requisitos de salud registrados."
              compact
              actionLabel="Registrar requisito"
              onAction={canWriteSst ? () => setShowRequisitoForm(true) : undefined}
            />
          ) : (
            <div className="pmd-requirements-list">
              {sstExamenes.map((item) => (
                <div key={item.id} className="pmd-requirement-row">
                  <div>
                    <strong>{item.examen_nombre}</strong>
                    <div className="pmd-history-meta">
                      <span>Realización: {formatDate(item.fecha_examen)}</span>
                      <span>Vencimiento: {formatDate(item.fecha_vencimiento)}</span>
                      <span>Concepto: {item.concepto_medico}</span>
                    </div>
                  </div>
                  <div className="pmd-requirement-actions">
                    <span className={`pmd-inline-badge ${mapEstadoExamenTone(item.estado_examen)}`}>
                      {mapEstadoExamenLabel(item.estado_examen)}
                    </span>
                    {item.documento_id && (
                      <button type="button" className="pmd-button ghost" onClick={() => { void handleOpenDocumento(item.documento_id!); }}>
                        Ver soporte
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <>
      <aside className="pmd-shell">
        <div className="pmd-header">
          <div>
            <div className="pmd-header-top">
              <h2>{buildNombreCompleto(activeExpediente.persona)}</h2>
              <span className={`pmd-status-chip ${fichaStatus.tone}`}>
                {fichaStatus.label}
              </span>
            </div>
            <p>
              {abbreviateIdentification(currentIdentification?.tipo_documento_nombre)} {currentIdentification?.numero_documento ?? activeExpediente.persona.numero_documento}
              {' · '}
              {activeExpediente.cargo.nombre_cargo ?? 'Sin cargo'}
            </p>
            {personaDetail && !datosState.loading && !datosState.error && !fichaCompleta && (
              <small><strong>Faltan {fichaMissingFields.length} datos:</strong> {fichaMissingFields.join(', ')}</small>
            )}
          </div>

          <div className="pmd-header-actions">
            <button type="button" className="pmd-close" onClick={onClose} aria-label="Cerrar ficha">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="pmd-tabs">
          {TAB_META.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                className={`pmd-tab ${activeTab === tab.id ? 'is-active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="pmd-body">
          {error ? (
            <StateBlock tone="error" message={error} />
          ) : loading && !expediente ? (
            <StateBlock message="Abriendo ficha..." />
          ) : activeTab === 'datos' ? (
            renderDatosTab()
          ) : activeTab === 'vinculacion' ? (
            renderVinculacionTab()
          ) : activeTab === 'documentos' ? (
            renderDocumentosTab()
          ) : (
            renderSaludTab()
          )}
        </div>
      </aside>

      {showIdentificationModal && personaDetail && (
        <ChangeIdentificationModal
          currentIdentification={currentIdentification}
          onClose={() => setShowIdentificationModal(false)}
          onSuccess={async () => {
            setShowIdentificationModal(false);
            setPersonaDetail(await getPersonaById(personaDetail.id));
            setIdentificaciones(await getPersonaIdentificaciones(personaDetail.id));
            onRefresh();
          }}
          personaId={personaDetail.id}
          tipoDocumentoOptions={tipoIdentificacionOptions}
          municipioOptions={municipios}
        />
      )}
    </>
  );
}

function Field({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="pmd-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function DataItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const isEmpty = value === 'Sin registrar';
  return (
    <div className={`pmd-data-item ${isEmpty ? 'is-empty' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StateBlock({
  actionLabel = 'Reintentar',
  compact = false,
  message,
  onAction,
  tone = 'default',
}: {
  actionLabel?: string;
  compact?: boolean;
  message: string;
  onAction?: () => void;
  tone?: 'default' | 'empty' | 'error';
}) {
  return (
    <div className={`pmd-state ${tone === 'error' ? 'is-error' : ''} ${compact ? 'is-compact' : ''}`}>
      {tone === 'error' ? <AlertTriangle size={16} /> : tone === 'empty' ? <ClipboardList size={16} /> : <Loader2 size={16} className="spin-soft" />}
      <span>{message}</span>
      {onAction && (
        <button type="button" className="pmd-button ghost" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function mapEstadoExamenLabel(estado: string): string {
  if (estado === 'proximo_a_vencer') return 'Próximo a vencer';
  if (estado === 'sin_vencimiento') return 'Sin vencimiento';
  if (estado === 'vencido') return 'Vencido';
  return 'Vigente';
}

function mapEstadoExamenTone(estado: string): 'ok' | 'warn' | 'danger' | 'muted' {
  if (estado === 'vencido') return 'danger';
  if (estado === 'proximo_a_vencer') return 'warn';
  if (estado === 'sin_vencimiento') return 'muted';
  return 'ok';
}
