import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardList,
  FileText,
  FolderOpen,
  Landmark,
  Loader2,
  PencilLine,
  ShieldPlus,
  UserCircle2,
  X,
} from 'lucide-react';

import { configuracionApi } from '../../services/configuracionApi';
import {
  createPersonaCuentaBancaria,
  getPersonaById,
  getPersonaCuentasBancarias,
  getPersonaHistorialCambios,
  getPersonaIdentificaciones,
  getVinculacionesByPersonaId,
  updatePersona,
  updatePersonaCuentaBancaria,
} from '../../services/personasApi';
import { updateVinculacion } from '../../services/vinculacionesApi';
import type {
  CatalogoItem,
  Contrato,
  ContratoCargo,
  Municipio,
} from '../../types/configuracion.types';
import type { PersonaCuentaBancariaApi, PersonaHistorialCambioApi, PersonaApi, PersonaIdentificacionApi, VinculacionApi, VinculacionExpedienteApi } from '../../types/personas.types';
import ChangeIdentificationModal from './ChangeIdentificationModal';
import ExpedienteDocumentosPanel from './ExpedienteDocumentosPanel';
import PersonalSstProfilePanel from './PersonalSstProfilePanel';
import './PersonalMasterDrawer.css';

type MasterTab = 'personal' | 'sst' | 'laboral' | 'documentos' | 'historial';

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
  motivo_cambio: string;
};

type LaboralFormState = {
  contrato_cargo_id: string;
  tipo_vinculacion_id: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado_vinculacion: 'ACTIVA' | 'RETIRADA' | 'SUSPENDIDA';
  cotiza_pension: boolean;
  motivo_cambio: string;
};

type BankFormState = {
  entidad_bancaria: string;
  tipo_cuenta: 'AHORROS' | 'CORRIENTE' | 'OTRA';
  numero_cuenta: string;
  titular: string;
  nombre_titular: string;
  documento_titular: string;
  estado: 'PENDIENTE' | 'VERIFICADA' | 'RECHAZADA' | 'INACTIVA';
  fecha_verificacion: string;
  observaciones: string;
  motivo_cambio: string;
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
  { id: 'personal', label: 'Personal', icon: UserCircle2 },
  { id: 'sst', label: 'SST', icon: ClipboardList },
  { id: 'laboral', label: 'Laboral', icon: BriefcaseBusiness },
  { id: 'documentos', label: 'Documentos', icon: FileText },
  { id: 'historial', label: 'Historial', icon: ShieldPlus },
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
  motivo_cambio: '',
};

const EMPTY_BANK_FORM: BankFormState = {
  entidad_bancaria: '',
  tipo_cuenta: 'AHORROS',
  numero_cuenta: '',
  titular: 'PERSONA',
  nombre_titular: '',
  documento_titular: '',
  estado: 'PENDIENTE',
  fecha_verificacion: '',
  observaciones: '',
  motivo_cambio: '',
};

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
  if (!value) return 'Sin registrar';
  try {
    return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(
      new Date(`${value}T00:00:00`),
    );
  } catch {
    return value;
  }
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Sin registrar';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function displayValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return 'Sin registrar';
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
  if (!persona) return EMPTY_PERSONAL_FORM;

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
    motivo_cambio: '',
  };
}

function buildLaboralForm(expediente: VinculacionExpedienteApi | null): LaboralFormState {
  return {
    contrato_cargo_id: expediente?.vinculacion.contrato_cargo_id
      ? String(expediente.vinculacion.contrato_cargo_id)
      : '',
    tipo_vinculacion_id: expediente?.vinculacion.tipo_vinculacion_id
      ? String(expediente.vinculacion.tipo_vinculacion_id)
      : '',
    fecha_inicio: expediente?.vinculacion.fecha_inicio ?? '',
    fecha_fin: expediente?.vinculacion.fecha_fin ?? '',
    estado_vinculacion: expediente?.vinculacion.estado_vinculacion ?? 'ACTIVA',
    cotiza_pension: expediente?.vinculacion.cotiza_pension ?? true,
    motivo_cambio: '',
  };
}

function buildBankForm(account: PersonaCuentaBancariaApi | null): BankFormState {
  if (!account) {
    return EMPTY_BANK_FORM;
  }

  return {
    entidad_bancaria: account.entidad_bancaria,
    tipo_cuenta: account.tipo_cuenta,
    numero_cuenta: '',
    titular: account.titular,
    nombre_titular: account.nombre_titular ?? '',
    documento_titular: account.documento_titular ?? '',
    estado: account.estado,
    fecha_verificacion: account.fecha_verificacion ?? '',
    observaciones: account.observaciones ?? '',
    motivo_cambio: '',
  };
}

function buildFichaChecklist(persona: PersonaApi | null): string[] {
  if (!persona) return [];

  const missing: string[] = [];
  if (!persona.identificacion_vigente?.numero_documento && !persona.numero_documento) missing.push('Identificación vigente');
  if (!persona.primer_nombre) missing.push('Primer nombre');
  if (!persona.primer_apellido) missing.push('Primer apellido');
  if (!persona.telefono) missing.push('Teléfono');
  if (!persona.correo) missing.push('Correo');
  if (!persona.direccion) missing.push('Dirección');
  return missing;
}

function hasAnyPermission(current: string[], expected: string[]): boolean {
  return expected.some((permission) => current.includes(permission));
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
  const [activeTab, setActiveTab] = useState<MasterTab>('personal');
  const [personaDetail, setPersonaDetail] = useState<PersonaApi | null>(null);
  const [identificaciones, setIdentificaciones] = useState<PersonaIdentificacionApi[]>([]);
  const [vinculacionesHistory, setVinculacionesHistory] = useState<VinculacionApi[]>([]);
  const [contratosHistoryMap, setContratosHistoryMap] = useState<Map<number, Contrato>>(new Map());
  const [cargosHistoryMap, setCargosHistoryMap] = useState<Map<number, ContratoCargo>>(new Map());
  const [bankAccounts, setBankAccounts] = useState<PersonaCuentaBancariaApi[]>([]);
  const [historyItems, setHistoryItems] = useState<PersonaHistorialCambioApi[]>([]);
  const [datosState, setDatosState] = useState<SectionLoadState>(IDLE_SECTION_STATE);
  const [vinculacionState, setVinculacionState] = useState<SectionLoadState>(IDLE_SECTION_STATE);
  const [bankState, setBankState] = useState<SectionLoadState>(IDLE_SECTION_STATE);
  const [historyState, setHistoryState] = useState<SectionLoadState>(IDLE_SECTION_STATE);
  const [datosRetry, setDatosRetry] = useState(0);
  const [vinculacionRetry, setVinculacionRetry] = useState(0);
  const [bankRetry, setBankRetry] = useState(0);
  const [historyRetry, setHistoryRetry] = useState(0);
  const [isEditingPersonal, setIsEditingPersonal] = useState(false);
  const [isEditingLaboral, setIsEditingLaboral] = useState(false);
  const [isEditingBank, setIsEditingBank] = useState(false);
  const [showIdentificationModal, setShowIdentificationModal] = useState(false);
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [savingLaboral, setSavingLaboral] = useState(false);
  const [savingBank, setSavingBank] = useState(false);
  const [personalError, setPersonalError] = useState('');
  const [laboralError, setLaboralError] = useState('');
  const [bankError, setBankError] = useState('');
  const [personalForm, setPersonalForm] = useState<PersonalFormState>(EMPTY_PERSONAL_FORM);
  const [laboralForm, setLaboralForm] = useState<LaboralFormState>(buildLaboralForm(expediente));
  const [bankForm, setBankForm] = useState<BankFormState>(EMPTY_BANK_FORM);
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [sexos, setSexos] = useState<CatalogoItem[]>([]);
  const [estadosCiviles, setEstadosCiviles] = useState<CatalogoItem[]>([]);
  const [nivelesEstudio, setNivelesEstudio] = useState<CatalogoItem[]>([]);
  const [tiposVinculacion, setTiposVinculacion] = useState<CatalogoItem[]>([]);
  const [cargoOptions, setCargoOptions] = useState<ContratoCargo[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  const canUpdatePersona = hasAnyPermission(permissions, [
    'personas.update',
    'persona.editar',
    'persona.editar_contacto',
    'persona.editar_identidad',
  ]);
  const canUpdateVinculacion = hasAnyPermission(permissions, [
    'vinculaciones.update',
    'vinculacion.editar',
    'vinculacion.editar_cargo',
    'vinculacion.editar_fechas',
    'vinculacion.editar_estado',
  ]);
  const canReadBank = hasAnyPermission(permissions, [
    'personas.update',
    'bancario.ver',
    'bancario.editar',
    'bancario.verificar',
    'bancario.ver_numero_completo',
  ]);
  const canWriteBank = hasAnyPermission(permissions, [
    'personas.update',
    'bancario.editar',
    'bancario.verificar',
  ]);
  const canReadSst = hasAnyPermission(permissions, [
    'sst.perfil.ver',
    'sst.perfil.crear',
    'sst.perfil.editar',
  ]);
  const visibleTabs = canReadSst ? TAB_META : TAB_META.filter((tab) => tab.id !== 'sst');

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
  const currentBankAccount = bankAccounts.find((item) => item.es_vigente) ?? bankAccounts[0] ?? null;

  useEffect(() => {
    setActiveTab('personal');
    setIsEditingPersonal(false);
    setIsEditingLaboral(false);
    setIsEditingBank(false);
    setShowIdentificationModal(false);
    setPersonalError('');
    setLaboralError('');
    setBankError('');
  }, [expediente?.vinculacion.id]);

  useEffect(() => {
    setLaboralForm(buildLaboralForm(expediente));
  }, [expediente]);

  useEffect(() => {
    setBankForm(buildBankForm(currentBankAccount));
  }, [currentBankAccount]);

  useEffect(() => {
    if (!expediente) {
      setPersonaDetail(null);
      setIdentificaciones([]);
      setDatosState(IDLE_SECTION_STATE);
      return;
    }

    let cancelled = false;
    const personaId = expediente.persona.id;

    void (async () => {
      setDatosState({ loading: true, error: '' });
      const [personaResult, identificacionesResult] = await Promise.allSettled([
        getPersonaById(personaId),
        getPersonaIdentificaciones(personaId),
      ]);
      if (cancelled) return;

      if (personaResult.status === 'fulfilled') {
        setPersonaDetail(personaResult.value);
        setPersonalForm(buildPersonalForm(personaResult.value));
      } else {
        setPersonaDetail(null);
      }

      setIdentificaciones(identificacionesResult.status === 'fulfilled' ? identificacionesResult.value : []);
      setDatosState({
        loading: false,
        error:
          personaResult.status === 'rejected'
            ? 'No fue posible cargar la ficha maestra.'
            : identificacionesResult.status === 'rejected'
              ? 'No fue posible cargar el historial de identificaciones.'
              : '',
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [datosRetry, expediente]);

  useEffect(() => {
    if (!expediente) {
      setVinculacionesHistory([]);
      setContratosHistoryMap(new Map());
      setCargosHistoryMap(new Map());
      setVinculacionState(IDLE_SECTION_STATE);
      return;
    }

    let cancelled = false;
    const personaId = expediente.persona.id;

    void (async () => {
      setVinculacionState({ loading: true, error: '' });
      try {
        const vinculacionesResult = await getVinculacionesByPersonaId(personaId);
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
        setVinculacionState({
          loading: false,
          error: [...contratosResult, ...cargosResult].some((result) => result.status === 'rejected')
            ? 'Algunos detalles del historial contractual no pudieron cargarse.'
            : '',
        });
      } catch {
        if (!cancelled) {
          setVinculacionesHistory([]);
          setVinculacionState({ loading: false, error: 'No fue posible cargar las vinculaciones.' });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [expediente, vinculacionRetry]);

  useEffect(() => {
    if (!expediente || !canReadBank) {
      setBankAccounts([]);
      setBankState(IDLE_SECTION_STATE);
      return;
    }

    let cancelled = false;
    void (async () => {
      setBankState({ loading: true, error: '' });
      try {
        const result = await getPersonaCuentasBancarias(expediente.persona.id);
        if (!cancelled) {
          setBankAccounts(result);
          setBankState({ loading: false, error: '' });
        }
      } catch {
        if (!cancelled) {
          setBankAccounts([]);
          setBankState({ loading: false, error: 'No fue posible cargar la información bancaria.' });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bankRetry, canReadBank, expediente]);

  useEffect(() => {
    if (!expediente) {
      setHistoryItems([]);
      setHistoryState(IDLE_SECTION_STATE);
      return;
    }

    let cancelled = false;
    void (async () => {
      setHistoryState({ loading: true, error: '' });
      try {
        const result = await getPersonaHistorialCambios(expediente.persona.id, 80);
        if (!cancelled) {
          setHistoryItems(result);
          setHistoryState({ loading: false, error: '' });
        }
      } catch {
        if (!cancelled) {
          setHistoryItems([]);
          setHistoryState({ loading: false, error: 'No fue posible cargar el historial de cambios.' });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [expediente, historyRetry]);

  useEffect(() => {
    if (!expediente || (!isEditingPersonal && !isEditingLaboral)) {
      return;
    }

    let cancelled = false;
    const contratoId = expediente.contrato.id;

    void (async () => {
      setCatalogLoading(true);
      try {
        const [
          municipiosResult,
          sexosResult,
          estadosCivilesResult,
          nivelesEstudioResult,
          tiposVinculacionResult,
          cargosResult,
        ] = await Promise.all([
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
          tiposVinculacion.length > 0
            ? Promise.resolve(tiposVinculacion)
            : getAllCatalogPages((page, limit) => configuracionApi.listarTiposVinculacion({ page, limit })),
          configuracionApi.listarCargos({ contrato_id: contratoId, activo: true, page: 1, limit: 200 }).then((result) => result.items),
        ]);

        if (cancelled) return;
        setMunicipios(municipiosResult);
        setSexos(sexosResult);
        setEstadosCiviles(estadosCivilesResult);
        setNivelesEstudio(nivelesEstudioResult);
        setTiposVinculacion(tiposVinculacionResult);
        setCargoOptions(cargosResult);
      } finally {
        if (!cancelled) {
          setCatalogLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [expediente, isEditingLaboral, isEditingPersonal, municipios, sexos, estadosCiviles, nivelesEstudio, tiposVinculacion]);

  if (!expediente) {
    return null;
  }

  const activeExpediente = expediente;

  function setPersonalField<K extends keyof PersonalFormState>(field: K, value: PersonalFormState[K]) {
    setPersonalForm((current) => ({ ...current, [field]: value }));
  }

  function setLaboralField<K extends keyof LaboralFormState>(field: K, value: LaboralFormState[K]) {
    setLaboralForm((current) => ({ ...current, [field]: value }));
  }

  function setBankField<K extends keyof BankFormState>(field: K, value: BankFormState[K]) {
    setBankForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSavePersonal() {
    if (!personaDetail) return;
    if (!personalForm.motivo_cambio.trim()) {
      setPersonalError('El motivo es obligatorio para guardar cambios de persona.');
      return;
    }

    setSavingPersonal(true);
    setPersonalError('');

    try {
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
        motivo_cambio: personalForm.motivo_cambio.trim(),
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
      });

      const refreshedPersona = await getPersonaById(personaDetail.id);
      setPersonaDetail(refreshedPersona);
      setPersonalForm(buildPersonalForm(refreshedPersona));
      setIsEditingPersonal(false);
      onRefresh();
      setHistoryRetry((value) => value + 1);
    } catch (saveError) {
      setPersonalError(saveError instanceof Error ? saveError.message : 'No fue posible guardar los datos personales.');
    } finally {
      setSavingPersonal(false);
    }
  }

  async function handleSaveLaboral() {
    if (!laboralForm.motivo_cambio.trim()) {
      setLaboralError('El motivo es obligatorio para guardar cambios de vinculación.');
      return;
    }

    const currentCotizaPension = activeExpediente.vinculacion.cotiza_pension ?? true;
    if (currentCotizaPension !== laboralForm.cotiza_pension) {
      const confirmation = laboralForm.cotiza_pension
        ? 'Este cambio volverá a activar el cálculo de pensión para esta vinculación. ¿Deseas continuar?'
        : 'Este cambio hará que la vinculación no genere deducción por pensión en los recálculos de nómina. ¿Deseas continuar?';
      if (!window.confirm(confirmation)) return;
    }

    setSavingLaboral(true);
    setLaboralError('');

    try {
      await updateVinculacion(activeExpediente.vinculacion.id, {
        contrato_cargo_id: laboralForm.contrato_cargo_id ? Number(laboralForm.contrato_cargo_id) : undefined,
        tipo_vinculacion_id: laboralForm.tipo_vinculacion_id ? Number(laboralForm.tipo_vinculacion_id) : undefined,
        fecha_inicio: laboralForm.fecha_inicio || undefined,
        fecha_fin: laboralForm.fecha_fin || null,
        estado_vinculacion: laboralForm.estado_vinculacion,
        cotiza_pension: laboralForm.cotiza_pension,
        motivo_cambio: laboralForm.motivo_cambio.trim(),
      });

      setIsEditingLaboral(false);
      onRefresh();
      setVinculacionRetry((value) => value + 1);
      setHistoryRetry((value) => value + 1);
    } catch (saveError) {
      setLaboralError(saveError instanceof Error ? saveError.message : 'No fue posible guardar la vinculación.');
    } finally {
      setSavingLaboral(false);
    }
  }

  async function handleSaveBank() {
    if (!activeExpediente.persona.id) return;
    if (!bankForm.entidad_bancaria.trim() || !bankForm.numero_cuenta.trim()) {
      setBankError('Banco y número de cuenta son obligatorios.');
      return;
    }
    if (!bankForm.motivo_cambio.trim()) {
      setBankError('El motivo es obligatorio para guardar información bancaria.');
      return;
    }

    setSavingBank(true);
    setBankError('');

    try {
      const payload = {
        entidad_bancaria: bankForm.entidad_bancaria.trim(),
        tipo_cuenta: bankForm.tipo_cuenta,
        numero_cuenta: bankForm.numero_cuenta.trim(),
        titular: bankForm.titular.trim() || 'PERSONA',
        nombre_titular: bankForm.nombre_titular.trim() || null,
        documento_titular: bankForm.documento_titular.trim() || null,
        estado: bankForm.estado,
        fecha_verificacion: bankForm.fecha_verificacion || null,
        observaciones: bankForm.observaciones.trim() || null,
        motivo_cambio: bankForm.motivo_cambio.trim(),
      } as const;

      if (currentBankAccount) {
        await updatePersonaCuentaBancaria(activeExpediente.persona.id, currentBankAccount.id, payload);
      } else {
        await createPersonaCuentaBancaria(activeExpediente.persona.id, {
          ...payload,
          marcar_como_vigente: true,
        });
      }

      setIsEditingBank(false);
      setBankForm(EMPTY_BANK_FORM);
      setBankRetry((value) => value + 1);
      setHistoryRetry((value) => value + 1);
    } catch (saveError) {
      setBankError(saveError instanceof Error ? saveError.message : 'No fue posible guardar la información bancaria.');
    } finally {
      setSavingBank(false);
    }
  }

  function renderPersonalTab() {
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
              <p>La identificación vigente se conserva con historial auditable.</p>
            </div>
            <button type="button" className="pmd-button ghost" onClick={() => setShowIdentificationModal(true)} disabled={!canUpdatePersona}>
              <ClipboardList size={15} />
              Cambiar identificación
            </button>
          </div>

          <div className="pmd-info-grid compact-four">
            <DataItem label="Tipo de identificación" value={currentIdentification?.tipo_documento_nombre ?? `Tipo ${currentIdentification?.tipo_documento_id ?? activeExpediente.persona.tipo_documento_id ?? '—'}`} />
            <DataItem label="Número de identificación" value={currentIdentification?.numero_documento ?? activeExpediente.persona.numero_documento} />
            <DataItem label="Fecha de expedición" value={formatDate(currentIdentification?.fecha_expedicion_documento ?? activeExpediente.persona.fecha_expedicion_documento)} />
            <DataItem label="Lugar de expedición" value={currentIdentification?.municipio_expedicion_nombre ?? 'Sin registrar'} />
          </div>

          {identificaciones.length > 1 && (
            <details className="pmd-inline-history">
              <summary>Ver historial de identificaciones ({identificaciones.length})</summary>
              <div className="pmd-history-list">
                {identificaciones.map((item) => (
                  <div key={item.id} className="pmd-history-item">
                    <div className="pmd-history-head">
                      <strong>{item.tipo_documento_nombre ?? `Tipo ${item.tipo_documento_id}`} · {item.numero_documento}</strong>
                      <span className={`pmd-inline-badge ${item.es_vigente ? 'ok' : 'muted'}`}>{item.es_vigente ? 'Vigente' : 'Histórica'}</span>
                    </div>
                    <div className="pmd-history-meta">
                      <span>Motivo: {item.motivo_cambio}</span>
                      <span>Desde: {formatDateTime(item.vigente_desde)}</span>
                      <span>Hasta: {formatDateTime(item.vigente_hasta)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>

        <section className="pmd-card">
          <div className="pmd-card-header">
            <div>
              <h3>Datos personales</h3>
              <p>La ficha maestra se edita por bloques compactos, con motivo obligatorio.</p>
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
              {isEditingPersonal ? 'Cancelar edición' : 'Editar persona'}
            </button>
          </div>

          {isEditingPersonal ? (
            <div className="pmd-edit-layout">
              <div className="pmd-grid two">
                <Field label="Primer nombre *"><input value={personalForm.primer_nombre} onChange={(event) => setPersonalField('primer_nombre', event.target.value)} /></Field>
                <Field label="Segundo nombre"><input value={personalForm.segundo_nombre} onChange={(event) => setPersonalField('segundo_nombre', event.target.value)} /></Field>
                <Field label="Primer apellido *"><input value={personalForm.primer_apellido} onChange={(event) => setPersonalField('primer_apellido', event.target.value)} /></Field>
                <Field label="Segundo apellido"><input value={personalForm.segundo_apellido} onChange={(event) => setPersonalField('segundo_apellido', event.target.value)} /></Field>
                <Field label="Fecha de nacimiento"><input type="date" value={personalForm.fecha_nacimiento} onChange={(event) => setPersonalField('fecha_nacimiento', event.target.value)} /></Field>
                <Field label="Sexo"><select value={personalForm.sexo_id} onChange={(event) => setPersonalField('sexo_id', event.target.value)} disabled={catalogLoading}><option value="">Sin registrar</option>{sexos.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
                <Field label="Estado civil"><select value={personalForm.estado_civil_id} onChange={(event) => setPersonalField('estado_civil_id', event.target.value)} disabled={catalogLoading}><option value="">Sin registrar</option>{estadosCiviles.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
                <Field label="Teléfono"><input value={personalForm.telefono} onChange={(event) => setPersonalField('telefono', event.target.value)} /></Field>
                <Field label="Correo electrónico"><input type="email" value={personalForm.correo} onChange={(event) => setPersonalField('correo', event.target.value)} /></Field>
                <Field label="Dirección"><input value={personalForm.direccion} onChange={(event) => setPersonalField('direccion', event.target.value)} /></Field>
                <Field label="Barrio"><input value={personalForm.barrio} onChange={(event) => setPersonalField('barrio', event.target.value)} /></Field>
                <Field label="Municipio de residencia"><select value={personalForm.municipio_residencia_id} onChange={(event) => setPersonalField('municipio_residencia_id', event.target.value)} disabled={catalogLoading}><option value="">Sin registrar</option>{municipios.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
                <Field label="País de nacimiento"><input value={personalForm.pais_nacimiento} onChange={(event) => setPersonalField('pais_nacimiento', event.target.value)} /></Field>
              </div>

              <div className="pmd-subcard">
                <h4>Contacto de emergencia</h4>
                <div className="pmd-grid two">
                  <Field label="Nombre"><input value={personalForm.contacto_nombre} onChange={(event) => setPersonalField('contacto_nombre', event.target.value)} /></Field>
                  <Field label="Parentesco"><input value={personalForm.contacto_parentesco} onChange={(event) => setPersonalField('contacto_parentesco', event.target.value)} /></Field>
                  <Field label="Teléfono"><input value={personalForm.contacto_telefono} onChange={(event) => setPersonalField('contacto_telefono', event.target.value)} /></Field>
                  <Field label="Dirección"><input value={personalForm.contacto_direccion} onChange={(event) => setPersonalField('contacto_direccion', event.target.value)} /></Field>
                </div>
              </div>

              <Field label="Motivo del cambio *">
                <textarea value={personalForm.motivo_cambio} onChange={(event) => setPersonalField('motivo_cambio', event.target.value)} />
              </Field>

              {personalError && <StateBlock tone="error" message={personalError} compact />}

              <div className="pmd-actions-row">
                <button type="button" className="pmd-button secondary" onClick={() => setIsEditingPersonal(false)}>Cancelar</button>
                <button type="button" className="pmd-button primary" onClick={() => { void handleSavePersonal(); }} disabled={savingPersonal}>
                  {savingPersonal ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />}
                  Guardar persona
                </button>
              </div>
            </div>
          ) : (
            <div className="pmd-profile-sections">
              <section className="pmd-info-section">
                <h4>Datos personales</h4>
                <div className="pmd-info-grid compact-three">
                  <DataItem label="Primer nombre" value={personaDetail.primer_nombre} />
                  <DataItem label="Segundo nombre" value={displayValue(personaDetail.segundo_nombre)} />
                  <DataItem label="Primer apellido" value={personaDetail.primer_apellido} />
                  <DataItem label="Segundo apellido" value={displayValue(personaDetail.segundo_apellido)} />
                  <DataItem label="Fecha de nacimiento" value={formatDate(personaDetail.fecha_nacimiento)} />
                  <DataItem label="Sexo" value={personaDetail.sexo_id ? sexosMap.get(personaDetail.sexo_id)?.label ?? displayValue(activeExpediente.persona.sexo) : displayValue(activeExpediente.persona.sexo)} />
                  <DataItem label="Estado civil" value={personaDetail.estado_civil_id ? estadosCivilesMap.get(personaDetail.estado_civil_id)?.label ?? displayValue(activeExpediente.persona.estado_civil) : displayValue(activeExpediente.persona.estado_civil)} />
                  <DataItem label="Tipo de sangre" value={displayValue(activeExpediente.persona.tipo_sangre)} />
                </div>
              </section>

              <section className="pmd-info-section">
                <h4>Contacto</h4>
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

        <section className="pmd-card">
          <div className="pmd-card-header">
            <div>
              <h3>Información bancaria</h3>
              <p>Número enmascarado por defecto y edición con vigencia histórica.</p>
            </div>
            <button
              type="button"
              className="pmd-button ghost"
              onClick={() => {
                setBankForm(buildBankForm(currentBankAccount));
                setIsEditingBank((current) => !current);
                setBankError('');
              }}
              disabled={!canWriteBank}
            >
              <Landmark size={15} />
              {isEditingBank ? 'Cancelar edición' : currentBankAccount ? 'Editar cuenta vigente' : 'Registrar cuenta'}
            </button>
          </div>

          {bankState.loading && bankAccounts.length === 0 ? (
            <StateBlock message="Cargando información bancaria..." compact />
          ) : bankState.error ? (
            <StateBlock tone="error" message={bankState.error} compact onAction={() => setBankRetry((value) => value + 1)} />
          ) : (
            <>
              {currentBankAccount ? (
                <div className="pmd-info-grid compact-four">
                  <DataItem label="Banco" value={currentBankAccount.entidad_bancaria} />
                  <DataItem label="Tipo cuenta" value={currentBankAccount.tipo_cuenta} />
                  <DataItem label="Número cuenta" value={currentBankAccount.numero_cuenta} />
                  <DataItem label="Estado" value={currentBankAccount.estado} />
                  <DataItem label="Titular" value={currentBankAccount.titular} />
                  <DataItem label="Nombre titular" value={displayValue(currentBankAccount.nombre_titular)} />
                  <DataItem label="Documento titular" value={displayValue(currentBankAccount.documento_titular)} />
                  <DataItem label="Verificada" value={formatDate(currentBankAccount.fecha_verificacion)} />
                </div>
              ) : (
                <StateBlock tone="empty" message="Esta persona no tiene cuenta bancaria vigente registrada." compact />
              )}

              {bankAccounts.length > 1 && (
                <details className="pmd-inline-history">
                  <summary>Ver histórico bancario ({bankAccounts.length})</summary>
                  <div className="pmd-history-list">
                    {bankAccounts.map((item) => (
                      <div key={item.id} className="pmd-history-item">
                        <div className="pmd-history-head">
                          <strong>{item.entidad_bancaria} · {item.numero_cuenta}</strong>
                          <span className={`pmd-inline-badge ${item.es_vigente ? 'ok' : 'muted'}`}>{item.es_vigente ? 'Vigente' : 'Histórica'}</span>
                        </div>
                        <div className="pmd-history-meta">
                          <span>{item.tipo_cuenta}</span>
                          <span>Desde: {formatDate(item.vigencia_desde)}</span>
                          <span>Hasta: {formatDate(item.vigencia_hasta)}</span>
                          <span>Estado: {item.estado}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </>
          )}

          {isEditingBank && (
            <div className="pmd-subcard">
              <div className="pmd-grid two">
                <Field label="Banco *"><input value={bankForm.entidad_bancaria} onChange={(event) => setBankField('entidad_bancaria', event.target.value)} /></Field>
                <Field label="Tipo de cuenta"><select value={bankForm.tipo_cuenta} onChange={(event) => setBankField('tipo_cuenta', event.target.value as BankFormState['tipo_cuenta'])}><option value="AHORROS">Ahorros</option><option value="CORRIENTE">Corriente</option><option value="OTRA">Otra</option></select></Field>
                <Field label="Número de cuenta">{currentBankAccount ? <input placeholder="Ingresa el nuevo número solo si cambia" value={bankForm.numero_cuenta} onChange={(event) => setBankField('numero_cuenta', event.target.value)} /> : <input value={bankForm.numero_cuenta} onChange={(event) => setBankField('numero_cuenta', event.target.value)} />}</Field>
                <Field label="Titular"><input value={bankForm.titular} onChange={(event) => setBankField('titular', event.target.value)} /></Field>
                <Field label="Nombre titular"><input value={bankForm.nombre_titular} onChange={(event) => setBankField('nombre_titular', event.target.value)} /></Field>
                <Field label="Documento titular"><input value={bankForm.documento_titular} onChange={(event) => setBankField('documento_titular', event.target.value)} /></Field>
                <Field label="Estado"><select value={bankForm.estado} onChange={(event) => setBankField('estado', event.target.value as BankFormState['estado'])}><option value="PENDIENTE">Pendiente</option><option value="VERIFICADA">Verificada</option><option value="RECHAZADA">Rechazada</option><option value="INACTIVA">Inactiva</option></select></Field>
                <Field label="Fecha verificación"><input type="date" value={bankForm.fecha_verificacion} onChange={(event) => setBankField('fecha_verificacion', event.target.value)} /></Field>
              </div>
              <Field label="Observaciones"><textarea value={bankForm.observaciones} onChange={(event) => setBankField('observaciones', event.target.value)} /></Field>
              <Field label="Motivo del cambio *"><textarea value={bankForm.motivo_cambio} onChange={(event) => setBankField('motivo_cambio', event.target.value)} /></Field>
              {bankError && <StateBlock tone="error" compact message={bankError} />}
              <div className="pmd-actions-row">
                <button type="button" className="pmd-button secondary" onClick={() => setIsEditingBank(false)}>Cancelar</button>
                <button type="button" className="pmd-button primary" onClick={() => { void handleSaveBank(); }} disabled={savingBank}>
                  {savingBank ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />}
                  Guardar cuenta
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    );
  }

  function renderLaboralTab() {
    const personalContext = activeExpediente.personal_contexto;
    const licitacionActual = personalContext.presentada_licitacion_actual;

    return (
      <div className="pmd-stack">
        <section className="pmd-card">
          <div className="pmd-card-header">
            <div>
              <h3>Vinculación actual</h3>
              <p>La edición contractual se mantiene separada de la ficha maestra de persona.</p>
            </div>
            <div className="pmd-header-actions">
              <button type="button" className="pmd-button ghost" onClick={onOpenManagement}>
                <FolderOpen size={15} />
                Gestionar vinculaciones
              </button>
              <button
                type="button"
                className="pmd-button ghost"
                onClick={() => {
                  setLaboralForm(buildLaboralForm(expediente));
                  setIsEditingLaboral((current) => !current);
                  setLaboralError('');
                }}
                disabled={!canUpdateVinculacion}
              >
                <PencilLine size={15} />
                {isEditingLaboral ? 'Cancelar edición' : 'Editar vinculación'}
              </button>
            </div>
          </div>

          {isEditingLaboral ? (
            <div className="pmd-edit-layout">
              <div className="pmd-grid two">
                <Field label="Cargo"><select value={laboralForm.contrato_cargo_id} onChange={(event) => setLaboralField('contrato_cargo_id', event.target.value)} disabled={catalogLoading}><option value="">Seleccionar</option>{cargoOptions.map((item) => <option key={item.id} value={item.id}>{item.nombre_cargo}</option>)}</select></Field>
                <Field label="Tipo de vinculación"><select value={laboralForm.tipo_vinculacion_id} onChange={(event) => setLaboralField('tipo_vinculacion_id', event.target.value)} disabled={catalogLoading}><option value="">Seleccionar</option>{tiposVinculacion.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
                <Field label="Fecha inicio"><input type="date" value={laboralForm.fecha_inicio} onChange={(event) => setLaboralField('fecha_inicio', event.target.value)} /></Field>
                <Field label="Fecha fin"><input type="date" value={laboralForm.fecha_fin} onChange={(event) => setLaboralField('fecha_fin', event.target.value)} /></Field>
                <Field label="Estado"><select value={laboralForm.estado_vinculacion} onChange={(event) => setLaboralField('estado_vinculacion', event.target.value as LaboralFormState['estado_vinculacion'])}><option value="ACTIVA">Activa</option><option value="SUSPENDIDA">Suspendida</option><option value="RETIRADA">Retirada</option></select></Field>
                <Field label="Cotiza pensión"><select value={laboralForm.cotiza_pension ? 'true' : 'false'} onChange={(event) => setLaboralField('cotiza_pension', event.target.value === 'true')}><option value="true">Sí</option><option value="false">No</option></select></Field>
              </div>
              <Field label="Motivo del cambio *"><textarea value={laboralForm.motivo_cambio} onChange={(event) => setLaboralField('motivo_cambio', event.target.value)} /></Field>
              {laboralError && <StateBlock tone="error" compact message={laboralError} />}
              <div className="pmd-actions-row">
                <button type="button" className="pmd-button secondary" onClick={() => setIsEditingLaboral(false)}>Cancelar</button>
                <button type="button" className="pmd-button primary" onClick={() => { void handleSaveLaboral(); }} disabled={savingLaboral}>
                  {savingLaboral ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />}
                  Guardar vinculación
                </button>
              </div>
            </div>
          ) : (
            <div className="pmd-info-grid compact-four">
              <DataItem label="Empresa" value={displayValue(activeExpediente.empresa.nombre_empresa)} />
              <DataItem label="Contrato" value={displayValue(activeExpediente.contrato.numero_contrato)} />
              <DataItem label="Cargo" value={displayValue(activeExpediente.cargo.nombre_cargo)} />
              <DataItem label="Tipo de vinculación" value={displayValue(activeExpediente.tipo_vinculacion.nombre_vinculacion)} />
              <DataItem label="Ingreso" value={formatDate(activeExpediente.vinculacion.fecha_inicio)} />
              <DataItem label="Retiro" value={formatDate(activeExpediente.vinculacion.fecha_fin)} />
              <DataItem label="Estado" value={activeExpediente.vinculacion.estado_vinculacion} />
              <DataItem label="Método de pago" value={displayValue(activeExpediente.vinculacion.metodo_pago)} />
              <DataItem label="Cotiza pensión" value={activeExpediente.vinculacion.cotiza_pension ? 'Sí' : 'No'} />
            </div>
          )}
        </section>

        <section className="pmd-card">
          <div className="pmd-card-header">
            <div>
              <h3>Asignación y seguridad social</h3>
              <p>Cobertura y afiliaciones se muestran sin invadir el flujo específico de Cobertura.</p>
            </div>
          </div>

          <div className="pmd-info-grid compact-four">
            <DataItem label="Cobertura" value={personalContext.es_manipuladora ? (personalContext.asignacion_operativa_actual ? 'Sí' : 'No') : 'No aplica'} />
            <DataItem label="Institución" value={displayValue(personalContext.asignacion_operativa_actual?.institucion ?? personalContext.asignacion_laboral_actual?.nombre_ubicacion)} />
            <DataItem label="Sede" value={displayValue(personalContext.asignacion_operativa_actual?.sede)} />
            <DataItem label="Modalidad" value={displayValue(personalContext.asignacion_operativa_actual?.modalidad)} />
            <DataItem label="EPS" value={displayValue(activeExpediente.afiliaciones?.eps)} />
            <DataItem label="AFP" value={displayValue(activeExpediente.afiliaciones?.pension)} />
            <DataItem label="ARL" value={displayValue(activeExpediente.afiliaciones?.arl)} />
            <DataItem label="Caja" value={displayValue(activeExpediente.afiliaciones?.caja_compensacion)} />
          </div>

          <div className="pmd-info-grid compact-four">
            <DataItem label="Licitación" value={licitacionActual ? 'Presentada' : 'No presentada'} />
            <DataItem label="Perfil licitación" value={displayValue(licitacionActual?.perfil.nombre_perfil)} />
            <DataItem label="Estado requisitos" value={displayValue(licitacionActual?.cumple_requisitos_estado)} />
            <DataItem label="Vigencia licitación" value={licitacionActual ? `${formatDate(licitacionActual.vigencia_desde)} a ${formatDate(licitacionActual.vigencia_hasta)}` : 'Sin registrar'} />
          </div>
        </section>

        <section className="pmd-card">
          <div className="pmd-card-header">
            <div>
              <h3>Historial de vinculaciones</h3>
              <p>Una misma persona puede transitar por varios contratos sin duplicarse.</p>
            </div>
          </div>

          {vinculacionState.loading && vinculacionesHistory.length === 0 ? (
            <StateBlock message="Cargando historial contractual..." compact />
          ) : vinculacionState.error && vinculacionesHistory.length === 0 ? (
            <StateBlock tone="error" message={vinculacionState.error} compact onAction={() => setVinculacionRetry((value) => value + 1)} />
          ) : vinculacionesHistory.length === 0 ? (
            <StateBlock tone="empty" message="Esta persona no tiene vinculaciones registradas." compact />
          ) : (
            <div className="pmd-table-wrap">
              <table className="pmd-compact-table">
                <thead>
                  <tr>
                    <th>Contrato</th>
                    <th>Empresa</th>
                    <th>Cargo</th>
                    <th>Ingreso</th>
                    <th>Retiro</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {vinculacionesHistory.map((item) => (
                    <tr key={item.id}>
                      <td>{contratosHistoryMap.get(item.contrato_id)?.numero_contrato ?? `#${item.contrato_id}`}</td>
                      <td>{contratosHistoryMap.get(item.contrato_id)?.empresa.nombre_empresa ?? `#${item.empresa_id}`}</td>
                      <td>{cargosHistoryMap.get(item.contrato_cargo_id)?.nombre_cargo ?? `#${item.contrato_cargo_id}`}</td>
                      <td>{formatDate(item.fecha_inicio)}</td>
                      <td>{formatDate(item.fecha_fin)}</td>
                      <td><span className={`pmd-inline-badge ${item.estado_vinculacion === 'ACTIVA' ? 'ok' : item.estado_vinculacion === 'SUSPENDIDA' ? 'warn' : 'danger'}`}>{item.estado_vinculacion}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    );
  }

  function renderSstTab() {
    if (!canReadSst) {
      return <StateBlock tone="error" message="No tienes permisos para consultar el perfil SST." />;
    }

    return (
      <PersonalSstProfilePanel
        expediente={activeExpediente}
        permissions={permissions}
        onRefresh={onRefresh}
      />
    );
  }

  function renderDocumentosTab() {
    return (
      <div className="pmd-stack">
        <ExpedienteDocumentosPanel
          personaId={activeExpediente.persona.id}
          vinculacionId={activeExpediente.vinculacion.id}
          tipoDocumentoOptions={tipoDocumentoOptions}
        />
      </div>
    );
  }

  function renderHistorialTab() {
    if (historyState.loading && historyItems.length === 0) {
      return <StateBlock message="Cargando historial de cambios..." />;
    }

    if (historyState.error && historyItems.length === 0) {
      return <StateBlock tone="error" message={historyState.error} onAction={() => setHistoryRetry((value) => value + 1)} />;
    }

    return (
      <div className="pmd-stack">
        <section className="pmd-card">
          <div className="pmd-card-header">
            <div>
              <h3>Historial de cambios</h3>
              <p>Cada cambio sensible conserva campo, antes, después, usuario y motivo.</p>
            </div>
          </div>

          {historyItems.length === 0 ? (
            <StateBlock tone="empty" message="No hay cambios auditados visibles para esta persona." compact />
          ) : (
            <div className="pmd-history-list">
              {historyItems.map((item) => (
                <div key={item.id} className="pmd-history-item">
                  <div className="pmd-history-head">
                    <strong>{item.tabla_afectada} · {item.campo}</strong>
                    <span className="pmd-inline-badge muted">{formatDateTime(item.fecha_hora)}</span>
                  </div>
                  <div className="pmd-history-meta">
                    <span>Usuario: {item.usuario_nombre ?? item.usuario_correo ?? 'Sin registrar'}</span>
                    <span>Antes: {displayValue(item.valor_anterior)}</span>
                    <span>Después: {displayValue(item.valor_nuevo)}</span>
                    <span>Motivo: {displayValue(item.motivo)}</span>
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
              <span className={`pmd-status-chip ${fichaStatus.tone}`}>{fichaStatus.label}</span>
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
          {visibleTabs.map((tab) => {
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
          ) : activeTab === 'personal' ? (
            renderPersonalTab()
          ) : activeTab === 'sst' ? (
            renderSstTab()
          ) : activeTab === 'laboral' ? (
            renderLaboralTab()
          ) : activeTab === 'documentos' ? (
            renderDocumentosTab()
          ) : (
            renderHistorialTab()
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
            setHistoryRetry((value) => value + 1);
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
