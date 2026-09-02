import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Edit2,
  FileText,
  KeyRound,
  MapPin,
  Plus,
  Power,
  Search,
  ShieldCheck,
  Users
} from 'lucide-react';

import { useAuth } from '../../../../context/AuthContext';
import { configuracionApi } from '../../../../services/configuracionApi';
import {
  createGestorMunicipioAssignment,
  getGestorAssignmentWorkspace,
  getContractPersonalFilterOptions,
  getGestorMunicipios,
  saveGestorAssignments
} from '../../../../services/vinculacionesApi';
import type {
  Contrato,
  CreateUsuarioAdminPayload,
  Empresa,
  Rol,
  UpdateUsuarioAdminPayload,
  UsuarioAdminRecord
} from '../../../../types/configuracion.types';
import type { GestorAssignmentWorkspace } from '../../../../types/vinculaciones.types';
import { FormModal } from '../components/FormModal';
import {
  getErrorMessage,
  mapKnownError
} from './adminTabUtils';

type EstadoFiltro = 'all' | 'active' | 'inactive';
type UserModalState =
  | { mode: 'create' }
  | { mode: 'edit'; user: UsuarioAdminRecord }
  | null;

type PasswordModalState =
  | { user: UsuarioAdminRecord }
  | null;

type AssignmentModalState = {
  contratoId: number;
  departamentoId: number | null;
  municipioId: number;
  municipioNombre: string;
  userId: number;
  userName: string;
} | null;

type TerritorialMunicipioOption = {
  id: number;
  nombre: string;
  departamento_id: number | null;
  departamento_nombre: string | null;
};

type TerritorialScopeCatalog = {
  departamentos: Array<{ id: number; nombre: string }>;
  municipios: TerritorialMunicipioOption[];
};

type UserForm = {
  active: boolean;
  contratoIds: number[];
  email: string;
  empresaIds: number[];
  name: string;
  password: string;
  roleIds: string[];
};

const EMPTY_FORM: UserForm = {
  name: '',
  email: '',
  password: '',
  active: true,
  roleIds: [],
  empresaIds: [],
  contratoIds: []
};

const ADMIN_ROLE_NAME = 'ADMINISTRADOR';
const CATALOG_BATCH_LIMIT = 100;

function humanizeRole(role: string): string {
  return role
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function hasRoleSelected(roleIds: string[], rolesCatalog: Rol[], roleName: string): boolean {
  const selected = new Set(roleIds);
  return rolesCatalog.some((role) => selected.has(String(role.id)) && role.nombre_rol === roleName);
}

function isGestorRoleSelected(roleIds: string[], rolesCatalog: Rol[]): boolean {
  return hasRoleSelected(roleIds, rolesCatalog, 'GESTOR');
}

function isTerritorialRoleSelected(roleIds: string[], rolesCatalog: Rol[]): boolean {
  return hasRoleSelected(roleIds, rolesCatalog, 'GESTOR') || hasRoleSelected(roleIds, rolesCatalog, 'TALENTO_HUMANO');
}

function isAdminRoleSelected(roleIds: string[], rolesCatalog: Rol[]): boolean {
  const selected = new Set(roleIds);
  return rolesCatalog.some((role) => selected.has(String(role.id)) && role.nombre_rol === ADMIN_ROLE_NAME);
}

function mapUserToForm(user: UsuarioAdminRecord): UserForm {
  return {
    name: user.name,
    email: user.email,
    password: '',
    active: user.active,
    roleIds: user.roleIds.map(String),
    empresaIds: [...user.empresaIds],
    contratoIds: [...user.contratoIds]
  };
}

function buildContratoLookup(contratos: Contrato[]): Map<number, Contrato> {
  return new Map(contratos.map((contrato) => [contrato.id, contrato]));
}

async function getAllCatalogPages<T>(
  loader: (params: { page: number; limit: number }) => Promise<{ items: T[]; pagination: { total_pages: number } }>
): Promise<T[]> {
  const firstPage = await loader({ page: 1, limit: CATALOG_BATCH_LIMIT });
  const totalPages = firstPage.pagination.total_pages;

  if (totalPages <= 1) {
    return firstPage.items;
  }

  const remainingPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      loader({
        page: index + 2,
        limit: CATALOG_BATCH_LIMIT
      })
    )
  );

  return [
    ...firstPage.items,
    ...remainingPages.flatMap((pageData) => pageData.items)
  ];
}

function renderSummaryChips(values: string[], maxVisible = 2) {
  if (values.length === 0) {
    return <span className="cg-secondary-cell">Sin asignar</span>;
  }

  const visible = values.slice(0, maxVisible);
  const remaining = values.length - visible.length;

  return (
    <div className="cg-chip-wrap">
      {visible.map((value) => (
        <span key={value} className="cg-chip">{value}</span>
      ))}
      {remaining > 0 && <span className="cg-chip more">+{remaining}</span>}
    </div>
  );
}

const EMPTY_TERRITORIAL_SCOPE: TerritorialScopeCatalog = {
  departamentos: [],
  municipios: []
};

function buildTerritorialScopeCatalog(municipios: Array<Record<string, unknown>>): TerritorialScopeCatalog {
  const departamentos = new Map<number, { id: number; nombre: string }>();
  const municipiosMap = new Map<number, TerritorialMunicipioOption>();

  for (const rawMunicipio of municipios) {
    const id = Number(rawMunicipio.id ?? rawMunicipio.municipio_id);
    const departamentoIdValue = rawMunicipio.departamento_id ?? rawMunicipio.departamentoId;
    const departamentoId = departamentoIdValue === null || departamentoIdValue === undefined || departamentoIdValue === ''
      ? null
      : Number(departamentoIdValue);
    const normalizedDepartamentoId = typeof departamentoId === 'number' && Number.isInteger(departamentoId) && departamentoId > 0 ? departamentoId : null;
    const nombre = String(rawMunicipio.nombre ?? rawMunicipio.municipio_nombre ?? '').trim();
    const departamentoNombre = rawMunicipio.departamento_nombre ?? rawMunicipio.departamentoNombre;
    const normalizedDepartamentoNombre = departamentoNombre === null || departamentoNombre === undefined
      ? null
      : String(departamentoNombre).trim();

    if (!Number.isInteger(id) || id <= 0 || !nombre) {
      continue;
    }

    municipiosMap.set(id, {
      id,
      nombre,
      departamento_id: normalizedDepartamentoId,
      departamento_nombre: normalizedDepartamentoNombre
    });

    if (normalizedDepartamentoId !== null) {
      departamentos.set(normalizedDepartamentoId, {
        id: normalizedDepartamentoId,
        nombre: normalizedDepartamentoNombre || ("Departamento " + normalizedDepartamentoId)
      });
    }
  }

  return {
    departamentos: Array.from(departamentos.values()).sort((left, right) => left.nombre.localeCompare(right.nombre, 'es')),
    municipios: Array.from(municipiosMap.values()).sort((left, right) => left.nombre.localeCompare(right.nombre, 'es'))
  };
}

function filterTerritorialMunicipios(catalog: TerritorialScopeCatalog, departamentoId: number | null, search: string) {
  if (departamentoId === null) {
    return [];
  }

  const normalized = search.trim().toLowerCase();
  return catalog.municipios.filter((municipio) => Number(municipio.departamento_id) === Number(departamentoId) && (!normalized || municipio.nombre.toLowerCase().includes(normalized)));
}

function summarizeTerritorialSelection(catalog: TerritorialScopeCatalog, selectedIds: number[]) {
  const selectedSet = new Set(selectedIds);
  const grouped = new Map<string, number>();

  for (const municipio of catalog.municipios) {
    if (!selectedSet.has(municipio.id)) {
      continue;
    }

    const key = municipio.departamento_nombre ?? 'Sin departamento';
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }

  return Array.from(grouped.entries())
    .sort((left, right) => left[0].localeCompare(right[0], 'es'))
    .map(([departamento, total]) => departamento + " - " + total);
}

export function UsuariosTab() {
  const { user } = useAuth();
  const isAdmin = user?.roles.includes(ADMIN_ROLE_NAME) === true;

  const [users, setUsers] = useState<UsuarioAdminRecord[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [municipioSearch, setMunicipioSearch] = useState('');
  const [gestorMunicipios, setGestorMunicipios] = useState<Record<number, number[]>>({});
  const [territorialCatalogs, setTerritorialCatalogs] = useState<Record<number, TerritorialScopeCatalog>>({});
  const [territorialCatalogErrors, setTerritorialCatalogErrors] = useState<Record<number, string>>({});
  const [selectedDepartamentoIds, setSelectedDepartamentoIds] = useState<Record<number, number | null>>({});
  const [loadingTerritorialCatalogs, setLoadingTerritorialCatalogs] = useState(false);
  const [loadingGestorScope, setLoadingGestorScope] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [search, setSearch] = useState('');
  const [estado, setEstado] = useState<EstadoFiltro>('all');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userModal, setUserModal] = useState<UserModalState>(null);
  const [passwordModal, setPasswordModal] = useState<PasswordModalState>(null);
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [passwordValue, setPasswordValue] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [saving, setSaving] = useState(false);
  const [stateLoadingId, setStateLoadingId] = useState<string | null>(null);
  const [assignmentModal, setAssignmentModal] = useState<AssignmentModalState>(null);
  const [assignmentWorkspace, setAssignmentWorkspace] = useState<GestorAssignmentWorkspace | null>(null);
  const [assignmentSearch, setAssignmentSearch] = useState('');
  const [assignmentMode, setAssignmentMode] = useState<'SELECCION' | 'REEMPLAZAR_MUNICIPIO'>('SELECCION');
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<number[]>([]);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignmentSaving, setAssignmentSaving] = useState(false);

  useEffect(() => {
    if (!feedback) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setFeedback(null), 4500);
    return () => window.clearTimeout(timeoutId);
  }, [feedback]);

  useEffect(() => {
    if (!isAdmin) {
      setUsers([]);
      setRoles([]);
      setEmpresas([]);
      setContratos([]);
      setError('Solo un usuario ADMINISTRADOR puede acceder a este modulo.');
      return;
    }

    let cancelled = false;

    async function loadResources() {
      setLoading(true);
      setError('');

      try {
        const [usersResponse, rolesResponse, empresasResponse, contratosResponse] = await Promise.all([
          configuracionApi.listarUsuariosAdmin(),
          configuracionApi.listarRoles(),
          getAllCatalogPages((params) => configuracionApi.listarEmpresas(params)),
          getAllCatalogPages((params) => configuracionApi.listarContratos(params))
        ]);

        if (cancelled) {
          return;
        }

        setUsers(usersResponse);
        setRoles(rolesResponse);
        setEmpresas(empresasResponse);
        setContratos(contratosResponse);
      } catch (loadError) {
        if (!cancelled) {
          setError(getErrorMessage(loadError, 'No fue posible cargar usuarios, roles y accesos.'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadResources();

    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const contratosById = useMemo(() => buildContratoLookup(contratos), [contratos]);
  const isGlobalAdminTarget = useMemo(() => isAdminRoleSelected(form.roleIds, roles), [form.roleIds, roles]);
  const isGestorTarget = useMemo(() => isGestorRoleSelected(form.roleIds, roles), [form.roleIds, roles]);
  const isTerritorialTarget = useMemo(() => isTerritorialRoleSelected(form.roleIds, roles), [form.roleIds, roles]);
  const selectedEmpresaSet = useMemo(() => new Set(form.empresaIds), [form.empresaIds]);

  const availableContracts = useMemo(() => {
    if (selectedEmpresaSet.size === 0) {
      return [];
    }

    return contratos.filter((contrato) => selectedEmpresaSet.has(contrato.empresa.id));
  }, [contratos, selectedEmpresaSet]);

  const loadingTerritorial = loadingGestorScope || loadingTerritorialCatalogs;

  const getTerritorialCatalog = (contratoId: number): TerritorialScopeCatalog => territorialCatalogs[contratoId] ?? EMPTY_TERRITORIAL_SCOPE;

  const getVisibleTerritorialMunicipios = (contratoId: number) =>
    filterTerritorialMunicipios(getTerritorialCatalog(contratoId), selectedDepartamentoIds[contratoId] ?? null, municipioSearch);

  const getTerritorialSummary = (contratoId: number) =>
    summarizeTerritorialSelection(getTerritorialCatalog(contratoId), gestorMunicipios[contratoId] ?? []);

  async function ensureTerritorialCatalogs(contratoIds: number[]) {
    const missingContratoIds = contratoIds.filter((contratoId) => !territorialCatalogs[contratoId]);

    if (missingContratoIds.length === 0) {
      return;
    }

    setLoadingTerritorialCatalogs(true);

    try {
      const entries = await Promise.all(missingContratoIds.map(async (contratoId) => {
        const response = await getContractPersonalFilterOptions({ contrato_id: contratoId });
        const responseBody = response as unknown as { municipios?: unknown; data?: { municipios?: unknown }; items?: unknown };
        const municipios = responseBody.municipios ?? responseBody.data?.municipios ?? responseBody.items ?? [];
        return [contratoId, buildTerritorialScopeCatalog((Array.isArray(municipios) ? municipios : []) as Array<Record<string, unknown>>)] as const;
      }));

      setTerritorialCatalogErrors((current) => {
        const next = { ...current };
        for (const [contratoId] of entries) delete next[contratoId];
        return next;
      });

      setTerritorialCatalogs((current) => {
        const next = { ...current };
        for (const [contratoId, catalog] of entries) {
          next[contratoId] = catalog;
        }
        return next;
      });
    } catch (catalogError) {
      const message = getErrorMessage(catalogError, 'No fue posible cargar el alcance territorial del contrato.');
      setTerritorialCatalogErrors((current) => ({
        ...current,
        ...Object.fromEntries(missingContratoIds.map((contratoId) => [contratoId, message]))
      }));
      setFormError(message);
    } finally {
      setLoadingTerritorialCatalogs(false);
    }
  }

  useEffect(() => {
    if (!userModal || !isTerritorialTarget || form.contratoIds.length === 0) {
      return;
    }

    // Re-run after edit/create state settles so catalog loading is not tied only to click handlers.
    void ensureTerritorialCatalogs(form.contratoIds);
  }, [form.contratoIds, isTerritorialTarget, userModal]);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return users.filter((item) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        item.name.toLowerCase().includes(normalizedSearch) ||
        item.email.toLowerCase().includes(normalizedSearch) ||
        (item.primaryRole ?? '').toLowerCase().includes(normalizedSearch) ||
        item.empresas.some((empresa) => empresa.nombre_empresa.toLowerCase().includes(normalizedSearch));

      const matchesEstado =
        estado === 'all' || (estado === 'active' ? item.active : !item.active);

      return matchesSearch && matchesEstado;
    });
  }, [estado, search, users]);

  const activeUsers = users.filter((item) => item.active).length;
  const globalAdmins = users.filter((item) => item.isGlobalAdmin).length;

  function resetForm() {
    setForm(EMPTY_FORM);
    setFormError('');
    setMunicipioSearch('');
    setGestorMunicipios({});
    setSelectedDepartamentoIds({});
    setAssignmentModal(null);
    setAssignmentWorkspace(null);
    setSelectedAssignmentIds([]);
    setAssignmentSearch('');
  }

  async function openAssignmentModal(contratoId: number, municipioId: number, municipioNombre: string, departamentoId: number | null) {
    if (!userModal || userModal.mode !== 'edit' || !isGestorTarget) return;
    setAssignmentModal({ contratoId, departamentoId, municipioId, municipioNombre, userId: Number(userModal.user.id), userName: userModal.user.name });
    setAssignmentLoading(true);
    try {
      const workspace = await getGestorAssignmentWorkspace({
        contrato_id: contratoId,
        gestor_usuario_id: Number(userModal.user.id),
        municipio_id: municipioId
      });
      setAssignmentWorkspace(workspace);
      setSelectedAssignmentIds(workspace.items.filter((item) => item.gestor_actual?.usuario_id === Number(userModal.user.id)).map((item) => item.vinculacion_id));
    } catch (workspaceError) {
      setFormError(getErrorMessage(workspaceError, 'No fue posible cargar el personal del municipio.'));
      setAssignmentModal(null);
    } finally {
      setAssignmentLoading(false);
    }
  }

  async function handleSaveAssignments() {
    if (!assignmentModal) return;
    setAssignmentSaving(true);
    try {
      if (assignmentMode === 'REEMPLAZAR_MUNICIPIO') {
        await createGestorMunicipioAssignment({
          contrato_id: assignmentModal.contratoId,
          gestor_usuario_id: assignmentModal.userId,
          municipio_id: assignmentModal.municipioId,
          departamento_id: assignmentModal.departamentoId,
          alcance_personal: 'TODO_MUNICIPIO',
          observacion: 'Alcance dinamico desde Administracion de usuarios'
        });
      } else {
        await saveGestorAssignments({
          contrato_id: assignmentModal.contratoId,
          gestor_usuario_id: assignmentModal.userId,
          municipio_id: assignmentModal.municipioId,
          departamento_id: assignmentModal.departamentoId,
          modo: 'REEMPLAZAR_MUNICIPIO',
          vinculacion_ids: selectedAssignmentIds,
          observacion: 'Asignacion desde Administracion de usuarios'
        });
      }
      setFeedback({ tone: 'success', text: 'Personal del gestor actualizado correctamente.' });
      setAssignmentModal(null);
      setAssignmentWorkspace(null);
    } catch (saveError) {
      setFormError(getErrorMessage(saveError, 'No fue posible guardar la asignacion de personal.'));
    } finally {
      setAssignmentSaving(false);
    }
  }

  function openCreate() {
    resetForm();
    setUserModal({ mode: 'create' });
  }

  function openEdit(targetUser: UsuarioAdminRecord) {
    setSelectedUserId(targetUser.id);
    setForm(mapUserToForm(targetUser));
    setFormError('');
    setUserModal({ mode: 'edit', user: targetUser });
    void loadGestorScopes(targetUser.id, targetUser.contratoIds);
  }

  async function loadGestorScopes(userId: string, contratoIds: number[]) {
    setLoadingGestorScope(true);
    await ensureTerritorialCatalogs(contratoIds);
    try {
      const entries = await Promise.all(contratoIds.map(async (contratoId) => {
        const response = await getGestorMunicipios({ contrato_id: contratoId, gestor_usuario_id: Number(userId) });
        return [contratoId, response.items] as const;
      }));
      setGestorMunicipios(Object.fromEntries(entries.map(([contratoId, items]) => [
        contratoId,
        items.filter((item) => item.activo).map((item) => item.municipio.id)
      ])));
      setSelectedDepartamentoIds((current) => {
        const next = { ...current };
        for (const [contratoId, items] of entries) {
          const firstActive = items.find((item) => item.activo && item.municipio.departamento_id !== null);
          next[contratoId] = firstActive?.municipio.departamento_id ?? next[contratoId] ?? null;
        }
        return next;
      });
    } catch (scopeError) {
      setFormError(getErrorMessage(scopeError, 'No fue posible cargar los municipios asignados al usuario territorial.'));
    } finally {
      setLoadingGestorScope(false);
    }
  }

  function toggleGestorMunicipio(contratoId: number, municipioId: number, checked: boolean) {
    setGestorMunicipios((current) => {
      const selected = current[contratoId] ?? [];
      return {
        ...current,
        [contratoId]: checked
          ? Array.from(new Set([...selected, municipioId]))
          : selected.filter((id) => id !== municipioId)
      };
    });
  }

  function pruneTerritorialState(allowedContratoIds: number[]) {
    const allowed = new Set(allowedContratoIds);

    setGestorMunicipios((current) => Object.fromEntries(
      Object.entries(current).filter(([contratoId]) => allowed.has(Number(contratoId)))
    ) as Record<number, number[]>);

    setSelectedDepartamentoIds((current) => Object.fromEntries(
      Object.entries(current).filter(([contratoId]) => allowed.has(Number(contratoId)))
    ) as Record<number, number | null>);
  }


  function buildTerritorialScopes() {
    if (!isTerritorialTarget || !form.active) return [];
    return form.contratoIds.flatMap((contratoId) => {
      const departamentoId = selectedDepartamentoIds[contratoId] ?? null;
      return departamentoId === null ? [] : [{ contrato_id: contratoId, departamento_id: departamentoId, municipio_ids: gestorMunicipios[contratoId] ?? [] }];
    });
  }

  function openPasswordModal(targetUser: UsuarioAdminRecord) {
    setSelectedUserId(targetUser.id);
    setPasswordValue('');
    setPasswordError('');
    setPasswordModal({ user: targetUser });
  }

  function updateCompanies(nextEmpresaIds: number[]) {
    setForm((current) => {
      const allowedEmpresaIds = new Set(nextEmpresaIds);
      const nextContratoIds = current.contratoIds.filter((contratoId) => {
        const contrato = contratosById.get(contratoId);
        return contrato ? allowedEmpresaIds.has(contrato.empresa.id) : false;
      });

      const nextState = {
        ...current,
        empresaIds: nextEmpresaIds,
        contratoIds: nextContratoIds
      };

      pruneTerritorialState(nextContratoIds);
      return nextState;
    });
  }

  function toggleRole(roleId: string, checked: boolean) {
    setForm((current) => {
      const roleIds = checked
        ? Array.from(new Set([...current.roleIds, roleId]))
        : current.roleIds.filter((currentRoleId) => currentRoleId !== roleId);
      const nextEmpresaIds = current.empresaIds;
      const allowedEmpresaIds = new Set(nextEmpresaIds);
      const nextContratoIds = current.contratoIds.filter((contratoId) => {
        const contrato = contratosById.get(contratoId);
        return contrato ? allowedEmpresaIds.has(contrato.empresa.id) : false;
      });

      const nextState = {
        ...current,
        roleIds,
        empresaIds: nextEmpresaIds,
        contratoIds: nextContratoIds
      };

      pruneTerritorialState(nextContratoIds);
      return nextState;
    });
  }

  function toggleEmpresa(empresaId: number, checked: boolean) {
    updateCompanies(
      checked
        ? Array.from(new Set([...form.empresaIds, empresaId]))
        : form.empresaIds.filter((currentEmpresaId) => currentEmpresaId !== empresaId)
    );
  }

  function toggleContrato(contratoId: number, checked: boolean) {
    setForm((current) => {
      const contratoIds = checked
        ? Array.from(new Set([...current.contratoIds, contratoId]))
        : current.contratoIds.filter((currentContratoId) => currentContratoId !== contratoId);

      pruneTerritorialState(contratoIds);
      return {
        ...current,
        contratoIds
      };
    });

    if (checked) {
      void ensureTerritorialCatalogs([contratoId]);
    }
  }

  function validateForm(mode: 'create' | 'edit'): string | null {
    if (!form.name.trim()) {
      return 'El nombre es obligatorio.';
    }

    if (!form.email.trim() || !form.email.includes('@')) {
      return 'Debes ingresar un correo valido.';
    }

    if (mode === 'create' && form.password.trim().length < 8) {
      return 'La contrasena debe tener al menos 8 caracteres.';
    }

    if (form.roleIds.length === 0) {
      return 'Debes seleccionar al menos un rol.';
    }

    if (!isGlobalAdminTarget && form.empresaIds.length < 1) {
      return 'Los usuarios que no son ADMINISTRADOR deben tener al menos una empresa.';
    }

    if (form.contratoIds.some((contratoId) => {
      const contrato = contratosById.get(contratoId);
      return !contrato || !selectedEmpresaSet.has(contrato.empresa.id);
    })) {
      return 'No puedes asignar contratos de otra empresa.';
    }

    return null;
  }

  async function reloadUsers(targetUserId?: string | null) {
    const usersResponse = await configuracionApi.listarUsuariosAdmin();
    setUsers(usersResponse);
    setSelectedUserId(targetUserId ?? null);
  }

  async function handleSaveUser() {
    if (!userModal) {
      return;
    }

    const validationError = validateForm(userModal.mode);

    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSaving(true);
    setFormError('');

    try {
      if (userModal.mode === 'create') {
        const payload: CreateUsuarioAdminPayload = {
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password.trim(),
          active: form.active,
          roleIds: form.roleIds,
          empresaIds: form.empresaIds,
          contratoIds: form.contratoIds,
          territorialScopes: buildTerritorialScopes()
        };

        const created = await configuracionApi.crearUsuarioAdmin(payload);
        setFeedback({ tone: 'success', text: 'Usuario creado correctamente.' });
        setUserModal(null);
        resetForm();
        await reloadUsers(created.id);
      } else {
        const payload: UpdateUsuarioAdminPayload = {
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          active: form.active,
          roleIds: form.roleIds,
          empresaIds: form.empresaIds,
          contratoIds: form.contratoIds,
          territorialScopes: buildTerritorialScopes()
        };

        const updated = await configuracionApi.actualizarUsuarioAdmin(userModal.user.id, payload);
        setFeedback({ tone: 'success', text: 'Usuario actualizado correctamente.' });
        setUserModal(null);
        resetForm();
        await reloadUsers(updated.id);
      }
    } catch (saveError) {
          setFormError(
            mapKnownError(saveError, 'No fue posible guardar el usuario.', {
          EMAIL_ALREADY_IN_USE: 'Ya existe un usuario con ese correo.',
          ROLE_REQUIRED: 'Debes seleccionar al menos un rol.',
          INVALID_ROLE_IDS: 'Hay roles seleccionados que ya no son validos.',
          INVALID_EMPRESA_IDS: 'Hay empresas seleccionadas que ya no son validas.',
          INVALID_CONTRATO_IDS: 'Hay contratos seleccionados que ya no son validos.',
          EMPRESA_REQUIRED: 'Los usuarios no administradores deben tener al menos una empresa.',
          CONTRATOS_EMPRESA_MISMATCH: 'No puedes asignar contratos de otra empresa.'
        })
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSavePassword() {
    if (!passwordModal) {
      return;
    }

    if (passwordValue.trim().length < 8) {
      setPasswordError('La nueva contrasena debe tener al menos 8 caracteres.');
      return;
    }

    setSaving(true);
    setPasswordError('');

    try {
      await configuracionApi.actualizarPasswordUsuarioAdmin(passwordModal.user.id, {
        password: passwordValue.trim()
      });
      setFeedback({ tone: 'success', text: 'Contrasena actualizada correctamente.' });
      setPasswordModal(null);
      setPasswordValue('');
      await reloadUsers(passwordModal.user.id);
    } catch (saveError) {
      setPasswordError(getErrorMessage(saveError, 'No fue posible actualizar la contrasena.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleState(targetUser: UsuarioAdminRecord) {
    setStateLoadingId(targetUser.id);

    try {
      const updated = await configuracionApi.actualizarEstadoUsuarioAdmin(targetUser.id, {
        active: !targetUser.active
      });
      setFeedback({
        tone: 'success',
        text: `Usuario ${updated.active ? 'activado' : 'desactivado'} correctamente.`
      });
      await reloadUsers(updated.id);
    } catch (toggleError) {
      setFeedback({
        tone: 'error',
        text: getErrorMessage(toggleError, 'No fue posible cambiar el estado del usuario.')
      });
    } finally {
      setStateLoadingId(null);
    }
  }

  if (!isAdmin) {
    return (
      <div className="adm-notice warning">
        <AlertTriangle size={14} /> Solo un usuario ADMINISTRADOR puede acceder a este modulo.
      </div>
    );
  }

  return (
    <div>
      <div className="adm-kpi-row">
        <div className="adm-kpi primary">
          <div className="adm-kpi-icon"><Users size={16} /></div>
          <div className="adm-kpi-body">
            <span className="adm-kpi-val">{users.length}</span>
            <span className="adm-kpi-lbl">Usuarios</span>
          </div>
        </div>
        <div className="adm-kpi success">
          <div className="adm-kpi-icon"><ShieldCheck size={16} /></div>
          <div className="adm-kpi-body">
            <span className="adm-kpi-val">{activeUsers}</span>
            <span className="adm-kpi-lbl">Activos</span>
          </div>
        </div>
        <div className="adm-kpi info">
          <div className="adm-kpi-icon"><Building2 size={16} /></div>
          <div className="adm-kpi-body">
            <span className="adm-kpi-val">{globalAdmins}</span>
            <span className="adm-kpi-lbl">Admins globales</span>
          </div>
        </div>
      </div>

      <div className="cg-tab-header">
        <div>
          <h4 className="cg-tab-title"><Users size={15} /> Usuarios</h4>
          <p className="cg-tab-subtitle">Administracion de usuarios, roles, empresas y contratos</p>
        </div>
        <button className="adm-btn primary" type="button" onClick={openCreate}>
          <Plus size={14} /> Nuevo usuario
        </button>
      </div>

      {feedback && (
        <div className={`adm-notice ${feedback.tone === 'error' ? 'warning' : 'info'}`} style={{ marginBottom: 12 }}>
          <AlertTriangle size={14} /> {feedback.text}
          <button className="adm-inline-close" onClick={() => setFeedback(null)} type="button">
            Cerrar
          </button>
        </div>
      )}

      <div className="cg-filters">
        <div className="cg-search">
          <Users size={14} />
          <input
            placeholder="Buscar por nombre, correo, rol o empresa"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <select
          className="adm-select cg-filter-select"
          value={estado}
          onChange={(event) => setEstado(event.target.value as EstadoFiltro)}
        >
          <option value="all">Todos</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
        </select>
      </div>

      {error && (
        <div className="adm-notice warning" style={{ marginBottom: 12 }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      <div className="cg-table-card">
        {loading ? (
          <div className="cg-table-empty">Cargando usuarios...</div>
        ) : (
          <table className="adm-history">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Rol principal</th>
                <th>Empresa</th>
                <th>Contratos</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={7} className="cg-table-empty">Sin resultados</td>
                </tr>
              )}
              {filteredUsers.map((item) => (
                <tr
                  key={item.id}
                  className={selectedUserId === item.id ? 'cg-row-selected' : ''}
                  onClick={() => setSelectedUserId(item.id)}
                >
                  <td>
                    <div className="cg-primary-cell" title={item.name}>{item.name}</div>
                  </td>
                  <td>
                    <div className="cg-secondary-cell" title={item.email}>{item.email}</div>
                  </td>
                  <td>
                    <div className="cg-primary-cell">{item.primaryRole ? humanizeRole(item.primaryRole) : 'Sin rol'}</div>
                    {item.roles.length > 1 && <div className="cg-secondary-cell">+{item.roles.length - 1} rol(es)</div>}
                  </td>
                  <td>
                    {renderSummaryChips(item.empresas.map((empresa) => empresa.nombre_empresa))}
                  </td>
                  <td>
                    {renderSummaryChips(
                      item.contratos.map((contrato) => contrato.numero_contrato ?? `Contrato ${contrato.contrato_id}`)
                    )}
                  </td>
                  <td>
                    <span className={`adm-badge ${item.active ? 'active' : 'inactive'}`}>
                      {item.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <div className="cg-actions">
                      <button
                        className="adm-btn ghost sm"
                        type="button"
                        title="Editar"
                        onClick={(event) => {
                          event.stopPropagation();
                          openEdit(item);
                        }}
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        className="adm-btn ghost sm"
                        type="button"
                        title="Cambiar contrasena"
                        onClick={(event) => {
                          event.stopPropagation();
                          openPasswordModal(item);
                        }}
                      >
                        <KeyRound size={13} />
                      </button>
                      <button
                        className={`adm-btn sm ${item.active ? 'danger-outline' : 'secondary'}`}
                        type="button"
                        title={item.active ? 'Desactivar' : 'Activar'}
                        disabled={stateLoadingId === item.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleToggleState(item);
                        }}
                      >
                        <Power size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {userModal && (
        <FormModal
          title={userModal.mode === 'create' ? 'Nuevo usuario' : `Editar: ${userModal.user.name}`}
          onClose={() => {
            setUserModal(null);
            resetForm();
          }}
          onSave={handleSaveUser}
          saving={saving}
          wide
        >
          <div className="adm-form-grid">
            <div className="adm-field">
              <label className="adm-label">Nombre *</label>
              <input
                className="adm-input"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </div>
            <div className="adm-field">
              <label className="adm-label">Correo *</label>
              <input
                className="adm-input"
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              />
            </div>
            {userModal.mode === 'create' && (
              <div className="adm-field adm-field full-width">
                <label className="adm-label">Contrasena *</label>
                <input
                  className="adm-input"
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                />
              </div>
            )}
          </div>

          <div className="cg-user-form-block">
            <div className="cg-role-selector-header">
              <span><ShieldCheck size={14} /> Roles</span>
              <span className="cg-secondary-cell">Selecciona al menos uno</span>
            </div>
            <div className="cg-role-selector-grid">
              {roles.map((role) => {
                const checked = form.roleIds.includes(String(role.id));

                return (
                  <label key={role.id} className="cg-role-checkbox">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => toggleRole(String(role.id), event.target.checked)}
                    />
                    <span>{humanizeRole(role.nombre_rol)}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {isTerritorialTarget && (
            <div className="cg-user-form-block">
              <div className="cg-role-selector-header">
                <span><MapPin size={14} /> Municipios a cargo</span>
                <span className="cg-secondary-cell">Alcance territorial por contrato</span>
              </div>
              <p className="cg-secondary-cell cg-user-scope-help">
                Selecciona los municipios sobre los que este usuario puede operar. La responsabilidad de Nomina se configura aparte.
              </p>
              <label className="cg-search-field">
                <Search size={14} />
                <input
                  value={municipioSearch}
                  onChange={(event) => setMunicipioSearch(event.target.value)}
                  placeholder="Buscar municipio del departamento seleccionado..."
                />
              </label>
              {loadingTerritorial ? (
                <div className="cg-selector-empty">Cargando alcance territorial...</div>
              ) : availableContracts.length === 0 ? (
                <div className="cg-selector-empty">Selecciona al menos un contrato para asignar municipios.</div>
              ) : availableContracts.map((contrato) => {
                const selected = gestorMunicipios[contrato.id] ?? [];
                const catalog = getTerritorialCatalog(contrato.id);
                const selectedDepartamentoId = selectedDepartamentoIds[contrato.id] ?? null;
                const visibleMunicipios = getVisibleTerritorialMunicipios(contrato.id);
                const scopeSummary = getTerritorialSummary(contrato.id);

                return (
                  <div key={contrato.id} className="cg-manager-contract-scope">
                    <div className="cg-manager-contract-header">
                      <strong>{contrato.numero_contrato ?? ("Contrato " + contrato.id)}</strong>
                      <span className="cg-secondary-cell">{scopeSummary.length > 0 ? scopeSummary.join(" | ") : "Sin municipios seleccionados"}</span>
                    </div>

                    <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
                      <label className="adm-field" style={{ margin: 0 }}>
                        <span className="adm-label">Departamento</span>
                        <select
                          className="adm-select"
                          value={selectedDepartamentoId ?? ""}
                          onChange={(event) => setSelectedDepartamentoIds((current) => ({
                            ...current,
                            [contrato.id]: event.target.value ? Number(event.target.value) : null
                          }))}
                        >
                          <option value="">Selecciona un departamento</option>
                          {catalog.departamentos.map((departamento) => (
                            <option key={departamento.id} value={departamento.id}>
                              {departamento.nombre}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {territorialCatalogErrors[contrato.id] ? (
                      <div className="cg-selector-empty">No fue posible cargar los departamentos.</div>
                    ) : catalog.departamentos.length === 0 ? (
                      <div className="cg-selector-empty">No hay departamentos disponibles para este contrato.</div>
                    ) : selectedDepartamentoId === null ? (
                      <div className="cg-selector-empty">Selecciona primero un departamento para consultar sus municipios.</div>
                    ) : visibleMunicipios.length === 0 ? (
                      <div className="cg-selector-empty">
                        {municipioSearch.trim() ? "No hay municipios del departamento seleccionado que coincidan con la busqueda." : "El contrato no tiene municipios disponibles en ese departamento."}
                      </div>
                    ) : (
                      <>
                        <div className="cg-manager-contract-header">
                          <strong>Municipios</strong>
                          <span>
                            <button
                              type="button"
                              onClick={() => setGestorMunicipios((current) => ({
                                ...current,
                                [contrato.id]: Array.from(new Set([...(current[contrato.id] ?? []), ...visibleMunicipios.map((item) => item.id)]))
                              }))}
                            >
                              Seleccionar todos
                            </button>
                            <button
                              type="button"
                              onClick={() => setGestorMunicipios((current) => ({
                                ...current,
                                [contrato.id]: (current[contrato.id] ?? []).filter((municipioId) => !visibleMunicipios.some((item) => item.id === municipioId))
                              }))}
                            >
                              Limpiar departamento
                            </button>
                          </span>
                        </div>
                        <div className="cg-access-selector-grid cg-manager-municipality-list">
                          {visibleMunicipios.map((municipio) => (
                            <label key={municipio.id} className="cg-role-checkbox">
                              <input
                                type="checkbox"
                                checked={selected.includes(municipio.id)}
                                onChange={(event) => toggleGestorMunicipio(contrato.id, municipio.id, event.target.checked)}
                              />
                              <span>{municipio.nombre}</span>
                            </label>
                          ))}
                        </div>
                      </>
                    )}

                    {userModal.mode === "edit" && isGestorTarget && selected.length > 0 && (
                      <div className="cg-manager-assignment-summary">
                        {catalog.municipios.filter((municipio) => selected.includes(municipio.id)).map((municipio) => (
                          <button
                            key={municipio.id}
                            className="adm-btn ghost sm"
                            type="button"
                            onClick={() => void openAssignmentModal(contrato.id, municipio.id, municipio.nombre, municipio.departamento_id ?? null)}
                          >
                            <Users size={12} /> Gestionar personal de {municipio.nombre}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="cg-user-form-block">
            <div className="cg-role-selector-header">
              <span><Building2 size={14} /> Empresa</span>
              <span className="cg-secondary-cell">
                {isGlobalAdminTarget ? 'Puedes seleccionar multiples empresas' : 'Selecciona una o varias empresas'}
              </span>
            </div>
            <div className="cg-access-selector-grid">
              {empresas.map((empresa) => {
                const checked = form.empresaIds.includes(empresa.id);

                return (
                  <label key={empresa.id} className="cg-role-checkbox">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => toggleEmpresa(empresa.id, event.target.checked)}
                    />
                    <span>{empresa.nombre_empresa}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="cg-user-form-block">
            <div className="cg-role-selector-header">
              <span><FileText size={14} /> Contratos</span>
              <span className="cg-secondary-cell">Dependen de la empresa seleccionada</span>
            </div>
            <div className="cg-access-selector-grid">
              {availableContracts.length === 0 ? (
                <div className="cg-selector-empty">Selecciona una empresa para ver contratos disponibles.</div>
              ) : (
                availableContracts.map((contrato) => {
                  const checked = form.contratoIds.includes(contrato.id);

                  return (
                    <label key={contrato.id} className="cg-role-checkbox">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => toggleContrato(contrato.id, event.target.checked)}
                      />
                      <span>
                        {contrato.numero_contrato} · {contrato.empresa.nombre_empresa ?? 'Sin empresa'}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <div className="cg-user-form-block">
            <div className="cg-role-selector-header">
              <span><Power size={14} /> Estado</span>
            </div>
            <label className="cg-role-checkbox">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
              />
              <span>Usuario activo</span>
            </label>
          </div>

          {formError && (
            <div className="adm-notice warning" style={{ marginTop: 8 }}>
              <AlertTriangle size={13} /> {formError}
            </div>
          )}
        </FormModal>
      )}

      {passwordModal && (
        <FormModal
          title={`Cambiar contrasena: ${passwordModal.user.name}`}
          onClose={() => {
            setPasswordModal(null);
            setPasswordValue('');
            setPasswordError('');
          }}
          onSave={handleSavePassword}
          saving={saving}
        >
          <div className="adm-field">
            <label className="adm-label">Nueva contrasena *</label>
            <input
              className="adm-input"
              type="password"
              value={passwordValue}
              onChange={(event) => setPasswordValue(event.target.value)}
            />
          </div>

          {passwordError && (
            <div className="adm-notice warning" style={{ marginTop: 8 }}>
              <AlertTriangle size={13} /> {passwordError}
            </div>
          )}
        </FormModal>
      )}

      {assignmentModal && (
        <FormModal
          title={`Personal: ${assignmentModal.userName} · ${assignmentModal.municipioNombre}`}
          onClose={() => { setAssignmentModal(null); setAssignmentWorkspace(null); }}
          onSave={handleSaveAssignments}
          saving={assignmentSaving}
          wide
        >
          {assignmentLoading ? (
            <div className="cg-selector-empty">Cargando personal...</div>
          ) : assignmentWorkspace ? (
            <>
              <div className="cg-secondary-cell" style={{ marginBottom: 10 }}>
                {assignmentWorkspace.resumen.asignados_a_gestor} asignados de {assignmentWorkspace.resumen.total_trabajadores} trabajadores.
              </div>
              <div className="cg-role-selector-grid" style={{ marginBottom: 10 }}>
                <label className="cg-role-checkbox">
                  <input type="radio" name="assignment-mode" checked={assignmentMode === 'REEMPLAZAR_MUNICIPIO'} onChange={() => setAssignmentMode('REEMPLAZAR_MUNICIPIO')} />
                  <span>Todo el municipio</span>
                </label>
                <label className="cg-role-checkbox">
                  <input type="radio" name="assignment-mode" checked={assignmentMode === 'SELECCION'} onChange={() => setAssignmentMode('SELECCION')} />
                  <span>Personal seleccionado</span>
                </label>
              </div>
              {assignmentMode === 'SELECCION' && (
                <>
                  <label className="cg-search-field">
                    <Search size={14} />
                    <input value={assignmentSearch} onChange={(event) => setAssignmentSearch(event.target.value)} placeholder="Buscar nombre, documento, institucion o sede..." />
                  </label>
                  <div className="cg-access-selector-grid">
                    {assignmentWorkspace.items
                      .filter((item) => !assignmentSearch.trim() || `${item.nombre_completo} ${item.numero_documento} ${item.asignacion_actual.institucion ?? ''} ${item.asignacion_actual.sede ?? ''}`.toLowerCase().includes(assignmentSearch.toLowerCase()))
                      .map((item) => {
                        const checked = selectedAssignmentIds.includes(item.vinculacion_id);
                        return (
                          <label key={item.vinculacion_id} className="cg-role-checkbox">
                            <input type="checkbox" checked={checked} onChange={() => setSelectedAssignmentIds((current) => checked ? current.filter((id) => id !== item.vinculacion_id) : [...current, item.vinculacion_id])} />
                            <span>{item.nombre_completo} · {item.numero_documento}</span>
                          </label>
                        );
                      })}
                  </div>
                </>
              )}
            </>
          ) : null}
        </FormModal>
      )}
    </div>
  );
}
