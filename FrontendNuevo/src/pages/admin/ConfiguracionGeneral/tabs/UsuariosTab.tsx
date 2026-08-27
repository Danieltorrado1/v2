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
  closeGestorMunicipioAssignment,
  createGestorMunicipioAssignment,
  getGestorMunicipios
} from '../../../../services/vinculacionesApi';
import type {
  Contrato,
  CreateUsuarioAdminPayload,
  Empresa,
  Municipio,
  Rol,
  UpdateUsuarioAdminPayload,
  UsuarioAdminRecord
} from '../../../../types/configuracion.types';
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

function isGestorRoleSelected(roleIds: string[], rolesCatalog: Rol[]): boolean {
  const selected = new Set(roleIds);
  return rolesCatalog.some((role) => selected.has(String(role.id)) && role.nombre_rol.toUpperCase().includes('GESTOR'));
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

export function UsuariosTab() {
  const { user } = useAuth();
  const isAdmin = user?.roles.includes(ADMIN_ROLE_NAME) === true;

  const [users, setUsers] = useState<UsuarioAdminRecord[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [municipioSearch, setMunicipioSearch] = useState('');
  const [gestorMunicipios, setGestorMunicipios] = useState<Record<number, number[]>>({});
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
        const [usersResponse, rolesResponse, empresasResponse, contratosResponse, municipiosResponse] = await Promise.all([
          configuracionApi.listarUsuariosAdmin(),
          configuracionApi.listarRoles(),
          getAllCatalogPages((params) => configuracionApi.listarEmpresas(params)),
          getAllCatalogPages((params) => configuracionApi.listarContratos(params)),
          getAllCatalogPages((params) => configuracionApi.listarMunicipios(params))
        ]);

        if (cancelled) {
          return;
        }

        setUsers(usersResponse);
        setRoles(rolesResponse);
        setEmpresas(empresasResponse);
        setContratos(contratosResponse);
        setMunicipios(municipiosResponse);
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
  const selectedEmpresaSet = useMemo(() => new Set(form.empresaIds), [form.empresaIds]);

  const availableContracts = useMemo(() => {
    if (selectedEmpresaSet.size === 0) {
      return [];
    }

    return contratos.filter((contrato) => selectedEmpresaSet.has(contrato.empresa.id));
  }, [contratos, selectedEmpresaSet]);

  const filteredMunicipios = useMemo(() => {
    const normalized = municipioSearch.trim().toLowerCase();
    return municipios.filter((item) => !normalized || item.label.toLowerCase().includes(normalized));
  }, [municipioSearch, municipios]);

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
    try {
      const entries = await Promise.all(contratoIds.map(async (contratoId) => {
        const response = await getGestorMunicipios({ contrato_id: contratoId, gestor_usuario_id: Number(userId) });
        return [contratoId, response.items] as const;
      }));
      setGestorMunicipios(Object.fromEntries(entries.map(([contratoId, items]) => [
        contratoId,
        items.filter((item) => item.activo).map((item) => item.municipio.id)
      ])));
    } catch (scopeError) {
      setFormError(getErrorMessage(scopeError, 'No fue posible cargar los municipios asignados al gestor.'));
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

  async function syncGestorScopes(userId: string, originalContratoIds: number[]) {
    const contractsToSync = Array.from(new Set([...originalContratoIds, ...form.contratoIds]));
    const today = new Date().toISOString().slice(0, 10);

    for (const contratoId of contractsToSync) {
      const response = await getGestorMunicipios({ contrato_id: contratoId, gestor_usuario_id: Number(userId) });
      const current = response.items.filter((item) => item.activo);
      const desired = new Set(isGestorTarget && form.active && form.contratoIds.includes(contratoId)
        ? (gestorMunicipios[contratoId] ?? [])
        : []);

      await Promise.all(current
        .filter((item) => !desired.has(item.municipio.id))
        .map((item) => closeGestorMunicipioAssignment(item.id, {
          vigencia_hasta: today,
          observacion: 'Actualizacion desde Administracion de usuarios'
        })));

      const currentIds = new Set(current.map((item) => item.municipio.id));
      await Promise.all(Array.from(desired)
        .filter((municipioId) => !currentIds.has(municipioId))
        .map((municipioId) => createGestorMunicipioAssignment({
          contrato_id: contratoId,
          gestor_usuario_id: Number(userId),
          municipio_id: municipioId,
          vigencia_desde: today,
          observacion: 'Asignacion desde Administracion de usuarios'
        })));
    }
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

      return {
        ...current,
        empresaIds: nextEmpresaIds,
        contratoIds: nextContratoIds
      };
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

      return {
        ...current,
        roleIds,
        empresaIds: nextEmpresaIds,
        contratoIds: nextContratoIds
      };
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
    setForm((current) => ({
      ...current,
      contratoIds: checked
        ? Array.from(new Set([...current.contratoIds, contratoId]))
        : current.contratoIds.filter((currentContratoId) => currentContratoId !== contratoId)
    }));
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
          contratoIds: form.contratoIds
        };

        const created = await configuracionApi.crearUsuarioAdmin(payload);
        await syncGestorScopes(created.id, []);
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
          contratoIds: form.contratoIds
        };

        const originalContratoIds = userModal.user.contratoIds;
        const updated = await configuracionApi.actualizarUsuarioAdmin(userModal.user.id, payload);
        await syncGestorScopes(updated.id, originalContratoIds);
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

          {isGestorTarget && (
            <div className="cg-user-form-block">
              <div className="cg-role-selector-header">
                <span><MapPin size={14} /> Municipios asignados</span>
                <span className="cg-secondary-cell">Alcance general del gestor por contrato</span>
              </div>
              <p className="cg-secondary-cell cg-user-scope-help">
                Selecciona los municipios sobre los que este gestor puede operar. El alcance de Nómina se configura aparte.
              </p>
              <label className="cg-search-field">
                <Search size={14} />
                <input
                  value={municipioSearch}
                  onChange={(event) => setMunicipioSearch(event.target.value)}
                  placeholder="Buscar municipio..."
                />
              </label>
              {loadingGestorScope ? (
                <div className="cg-selector-empty">Cargando municipios asignados...</div>
              ) : availableContracts.length === 0 ? (
                <div className="cg-selector-empty">Selecciona al menos un contrato para asignar municipios.</div>
              ) : availableContracts.map((contrato) => {
                const selected = gestorMunicipios[contrato.id] ?? [];
                return (
                  <div key={contrato.id} className="cg-manager-contract-scope">
                    <div className="cg-manager-contract-header">
                      <strong>{contrato.numero_contrato ?? `Contrato ${contrato.id}`}</strong>
                      <span>
                        <button type="button" onClick={() => setGestorMunicipios((current) => ({ ...current, [contrato.id]: filteredMunicipios.map((item) => item.id) }))}>Seleccionar todos</button>
                        <button type="button" onClick={() => setGestorMunicipios((current) => ({ ...current, [contrato.id]: [] }))}>Limpiar selección</button>
                      </span>
                    </div>
                    <div className="cg-access-selector-grid cg-manager-municipality-list">
                      {filteredMunicipios.map((municipio) => (
                        <label key={municipio.id} className="cg-role-checkbox">
                          <input
                            type="checkbox"
                            checked={selected.includes(municipio.id)}
                            onChange={(event) => toggleGestorMunicipio(contrato.id, municipio.id, event.target.checked)}
                          />
                          <span>{municipio.label}</span>
                        </label>
                      ))}
                    </div>
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
    </div>
  );
}
