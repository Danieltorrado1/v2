import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Edit2, Eye, KeyRound, Power, ShieldCheck, User, Users } from 'lucide-react';
import { useAuth } from '../../../../context/AuthContext';
import { configuracionApi } from '../../../../services/configuracionApi';
import type {
  AccesoUsuario,
  Permiso,
  Rol,
  UpdateUsuarioPayload,
  UsuarioAdministracion,
} from '../../../../types/configuracion.types';
import { FormModal } from '../components/FormModal';
import {
  formatDateTime,
  getErrorMessage,
  hasAnyPermission,
  mapKnownError,
} from './adminTabUtils';

type EstadoFiltro = 'all' | 'active' | 'inactive';
type ModalState = { user: UsuarioAdministracion } | null;
type UserForm = {
  email: string;
  name: string;
  password: string;
  roleIds: string[];
};

function createForm(user: UsuarioAdministracion, roleIds: string[]): UserForm {
  return {
    email: user.email,
    name: user.name,
    password: '',
    roleIds,
  };
}

export function UsuariosTab() {
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];
  const canReadUsers = hasAnyPermission(permissions, ['configuracion.read', 'usuarios.read']);
  const canUpdateUsers = hasAnyPermission(permissions, ['usuarios.update', 'users.update']);
  const canReadRoles = hasAnyPermission(permissions, ['configuracion.read', 'roles.read']);
  const canReadPermisos = hasAnyPermission(permissions, ['configuracion.read', 'permisos.read']);
  const canReadAccess = hasAnyPermission(permissions, ['tenant.access.read', 'tenant.access.update']);

  const [users, setUsers] = useState<UsuarioAdministracion[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [permisos, setPermisos] = useState<Permiso[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [estado, setEstado] = useState<EstadoFiltro>('all');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UsuarioAdministracion | null>(null);
  const [selectedAccess, setSelectedAccess] = useState<AccesoUsuario | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [accessLoading, setAccessLoading] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<UserForm>({ email: '', name: '', password: '', roleIds: [] });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toggleLoadingId, setToggleLoadingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!feedback) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setFeedback(null), 4500);
    return () => window.clearTimeout(timeoutId);
  }, [feedback]);

  useEffect(() => {
    if (!canReadUsers) {
      setUsers([]);
      setError('No tienes permisos para consultar usuarios administrativos.');
      return;
    }

    let cancelled = false;

    async function loadResources() {
      setLoading(true);
      setError('');
      try {
        const [usersResponse, rolesResponse, permisosResponse] = await Promise.all([
          configuracionApi.listarUsuarios(),
          canReadRoles ? configuracionApi.listarRoles() : Promise.resolve([]),
          canReadPermisos ? configuracionApi.listarPermisos() : Promise.resolve([]),
        ]);

        if (!cancelled) {
          setUsers(usersResponse);
          setRoles(rolesResponse);
          setPermisos(permisosResponse);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(getErrorMessage(loadError, 'No fue posible cargar usuarios y accesos.'));
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
  }, [canReadPermisos, canReadRoles, canReadUsers]);

  const filteredUsers = useMemo(() => {
    return users.filter((item) => {
      const matchesSearch =
        search.trim().length === 0 ||
        item.name.toLowerCase().includes(search.trim().toLowerCase()) ||
        item.email.toLowerCase().includes(search.trim().toLowerCase()) ||
        item.roles.some((role) => role.toLowerCase().includes(search.trim().toLowerCase()));
      const matchesEstado =
        estado === 'all' || (estado === 'active' ? item.active : !item.active);
      return matchesSearch && matchesEstado;
    });
  }, [estado, search, users]);

  async function handleSelect(userId: string) {
    setSelectedUserId(userId);
    setDetailLoading(true);
    if (canReadAccess) {
      setAccessLoading(true);
    }
    try {
      const [userDetail, userAccess] = await Promise.all([
        configuracionApi.obtenerUsuario(userId),
        canReadAccess ? configuracionApi.obtenerAccesoUsuario(userId) : Promise.resolve(null),
      ]);
      setSelectedUser(userDetail);
      setSelectedAccess(userAccess);
    } catch {
      setSelectedUser(null);
      setSelectedAccess(null);
    } finally {
      setDetailLoading(false);
      setAccessLoading(false);
    }
  }

  async function reloadUsers(targetUserId?: string | null) {
    setLoading(true);
    setError('');
    try {
      const usersResponse = await configuracionApi.listarUsuarios();
      setUsers(usersResponse);
      if (targetUserId) {
        await handleSelect(targetUserId);
      } else {
        setSelectedUserId(null);
        setSelectedUser(null);
        setSelectedAccess(null);
      }
    } catch (reloadError) {
      setError(getErrorMessage(reloadError, 'No fue posible actualizar usuarios.'));
    } finally {
      setLoading(false);
    }
  }

  function openEdit(userItem: UsuarioAdministracion) {
    const selectedRoles = roles
      .filter((role) => userItem.roles.includes(role.nombre_rol))
      .map((role) => String(role.id));
    setForm(createForm(userItem, selectedRoles));
    setFormError('');
    setModal({ user: userItem });
  }

  async function handleSave() {
    if (!modal) {
      return;
    }

    if (!form.name.trim()) {
      setFormError('El nombre es obligatorio.');
      return;
    }
    if (!form.email.trim() || !form.email.includes('@')) {
      setFormError('Debes ingresar un correo valido.');
      return;
    }
    if (form.password && form.password.length < 8) {
      setFormError('La nueva contrasena debe tener al menos 8 caracteres.');
      return;
    }

    setSaving(true);
    setFormError('');

    try {
      const payload: UpdateUsuarioPayload = {
        email: form.email.trim().toLowerCase(),
        name: form.name.trim(),
        roleIds: form.roleIds,
      };
      if (form.password.trim()) {
        payload.password = form.password;
      }

      const updated = await configuracionApi.actualizarUsuario(modal.user.id, payload);
      setFeedback({ tone: 'success', text: 'Usuario actualizado correctamente.' });
      setModal(null);
      await reloadUsers(updated.id);
    } catch (saveError) {
      setFormError(
        mapKnownError(saveError, 'No fue posible actualizar el usuario.', {
          EMAIL_ALREADY_IN_USE: 'Ya existe un usuario con ese correo.',
          INVALID_ROLE_IDS: 'Hay roles seleccionados que ya no son validos.',
        }),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(userItem: UsuarioAdministracion) {
    setToggleLoadingId(userItem.id);
    try {
      const updated = userItem.active
        ? await configuracionApi.desactivarUsuario(userItem.id)
        : await configuracionApi.activarUsuario(userItem.id);
      setFeedback({
        tone: 'success',
        text: `Usuario ${updated.active ? 'activado' : 'desactivado'} correctamente.`,
      });
      await reloadUsers(updated.id);
    } catch (toggleError) {
      setFeedback({
        tone: 'error',
        text: getErrorMessage(toggleError, 'No fue posible cambiar el estado del usuario.'),
      });
    } finally {
      setToggleLoadingId(null);
    }
  }

  if (!canReadUsers) {
    return (
      <div className="adm-notice warning">
        <AlertTriangle size={14} /> No tienes permisos para consultar usuarios administrativos.
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
          <div className="adm-kpi-icon"><User size={16} /></div>
          <div className="adm-kpi-body">
            <span className="adm-kpi-val">{users.filter((item) => item.active).length}</span>
            <span className="adm-kpi-lbl">Activos</span>
          </div>
        </div>
        <div className="adm-kpi info">
          <div className="adm-kpi-icon"><ShieldCheck size={16} /></div>
          <div className="adm-kpi-body">
            <span className="adm-kpi-val">{roles.length}</span>
            <span className="adm-kpi-lbl">Roles visibles</span>
          </div>
        </div>
      </div>

      <div className="cg-tab-header">
        <div>
          <h4 className="cg-tab-title"><Users size={15} /> Usuarios y accesos</h4>
          <p className="cg-tab-subtitle">Usuarios reales, acceso tenant y consulta de roles/permisos</p>
        </div>
      </div>

      {feedback && (
        <div className={`adm-notice ${feedback.tone === 'error' ? 'warning' : 'info'}`} style={{ marginBottom: 12 }}>
          {feedback.tone === 'error' ? <AlertTriangle size={14} /> : <Users size={14} />}
          {feedback.text}
          <button className="adm-inline-close" onClick={() => setFeedback(null)} type="button">
            Cerrar
          </button>
        </div>
      )}

      <div className="cg-filters">
        <div className="cg-search">
          <Users size={14} />
          <input
            placeholder="Buscar por nombre, correo o rol"
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
                <th>Usuario</th>
                <th>Roles</th>
                <th>Permisos</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={5} className="cg-table-empty">Sin resultados</td>
                </tr>
              )}
              {filteredUsers.map((item) => (
                <tr
                  key={item.id}
                  className={selectedUserId === item.id ? 'cg-row-selected' : ''}
                  onClick={() => void handleSelect(item.id)}
                >
                  <td>
                    <div className="cg-primary-cell" title={item.name}>{item.name}</div>
                    <div className="cg-secondary-cell" title={item.email}>{item.email}</div>
                  </td>
                  <td>
                    <div className="cg-chip-wrap">
                      {item.roles.length === 0 ? (
                        <span className="cg-secondary-cell">Sin roles</span>
                      ) : (
                        item.roles.map((role) => <span key={role} className="cg-chip">{role}</span>)
                      )}
                    </div>
                  </td>
                  <td>{item.permissions.length}</td>
                  <td>
                    <span className={`adm-badge ${item.active ? 'active' : 'inactive'}`}>
                      {item.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <div className="cg-actions">
                      <button
                        className="adm-btn ghost sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleSelect(item.id);
                        }}
                        title="Ver detalle"
                        type="button"
                      >
                        <Eye size={13} />
                      </button>
                      {canUpdateUsers && (
                        <button
                          className="adm-btn ghost sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            openEdit(item);
                          }}
                          title="Editar"
                          type="button"
                        >
                          <Edit2 size={13} />
                        </button>
                      )}
                      {canUpdateUsers && (
                        <button
                          className={`adm-btn sm ${item.active ? 'danger-outline' : 'secondary'}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleToggle(item);
                          }}
                          disabled={toggleLoadingId === item.id}
                          title={item.active ? 'Desactivar' : 'Activar'}
                          type="button"
                        >
                          <Power size={12} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="adm-card">
        <h4 className="adm-card-title"><User size={15} /> Detalle de usuario</h4>
        {detailLoading ? (
          <div className="adm-empty"><p>Cargando detalle...</p></div>
        ) : !selectedUser ? (
          <div className="adm-empty"><p>Selecciona un usuario para ver su detalle y acceso.</p></div>
        ) : (
          <div className="cg-user-detail-layout">
            <div className="cg-user-detail-main">
              <div className="cg-detail-grid">
                <div><span className="cg-detail-label">Nombre</span><strong>{selectedUser.name}</strong></div>
                <div><span className="cg-detail-label">Correo</span><strong>{selectedUser.email}</strong></div>
                <div><span className="cg-detail-label">Estado</span><strong>{selectedUser.active ? 'Activo' : 'Inactivo'}</strong></div>
                <div><span className="cg-detail-label">Creado</span><strong>{formatDateTime(selectedUser.createdAt)}</strong></div>
                <div className="cg-detail-full"><span className="cg-detail-label">Roles</span><strong>{selectedUser.roles.join(', ') || 'Sin roles'}</strong></div>
              </div>

              <div className="cg-access-cards">
                <div className="cg-mini-card">
                  <h5>Acceso a empresas</h5>
                  {!canReadAccess ? (
                    <p>No tienes permiso para consultar accesos tenant.</p>
                  ) : accessLoading ? (
                    <p>Cargando accesos...</p>
                  ) : selectedAccess?.empresas.length ? (
                    <ul className="cg-simple-list">
                      {selectedAccess.empresas.map((empresa) => (
                        <li key={empresa.empresa_id}>
                          <span>{empresa.nombre_empresa}</span>
                          <span>{empresa.activo ? 'Activo' : 'Inactivo'}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>Sin accesos asignados.</p>
                  )}
                </div>
                <div className="cg-mini-card">
                  <h5>Acceso a contratos</h5>
                  {!canReadAccess ? (
                    <p>No tienes permiso para consultar accesos tenant.</p>
                  ) : accessLoading ? (
                    <p>Cargando accesos...</p>
                  ) : selectedAccess?.contratos.length ? (
                    <ul className="cg-simple-list">
                      {selectedAccess.contratos.map((contrato) => (
                        <li key={contrato.contrato_id}>
                          <span>{contrato.numero_contrato ?? 'Sin numero'}</span>
                          <span>{contrato.activo ? 'Activo' : 'Inactivo'}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>Sin accesos asignados.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="cg-user-detail-side">
              <div className="cg-mini-card">
                <h5>Roles disponibles</h5>
                {!canReadRoles ? (
                  <p>No tienes permiso para consultar roles.</p>
                ) : roles.length === 0 ? (
                  <p>Sin roles visibles.</p>
                ) : (
                  <ul className="cg-simple-list">
                    {roles.map((role) => (
                      <li key={role.id}>
                        <span>{role.nombre_rol}</span>
                        <span>{role.activo ? 'Activo' : 'Inactivo'}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="cg-mini-card">
                <h5>Permisos disponibles</h5>
                {!canReadPermisos ? (
                  <p>No tienes permiso para consultar permisos.</p>
                ) : permisos.length === 0 ? (
                  <p>Sin permisos visibles.</p>
                ) : (
                  <div className="cg-permission-list">
                    {permisos.map((permiso) => (
                      <span key={permiso.id} className="cg-chip">{permiso.codigo}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {modal && (
        <FormModal
          title={`Editar: ${modal.user.name}`}
          onClose={() => setModal(null)}
          onSave={handleSave}
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
            <div className="adm-field adm-field full-width">
              <label className="adm-label">Nueva contrasena</label>
              <input
                className="adm-input"
                type="password"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="Dejar vacio para no cambiarla"
              />
            </div>
          </div>

          <div className="cg-role-selector">
            <div className="cg-role-selector-header">
              <span><KeyRound size={14} /> Roles permitidos</span>
            </div>
            {!canReadRoles ? (
              <div className="adm-notice warning">
                <AlertTriangle size={13} /> No tienes permiso para consultar roles.
              </div>
            ) : (
              <div className="cg-role-selector-grid">
                {roles.map((role) => {
                  const checked = form.roleIds.includes(String(role.id));
                  return (
                    <label key={role.id} className="cg-role-checkbox">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          setForm((current) => ({
                            ...current,
                            roleIds: event.target.checked
                              ? [...current.roleIds, String(role.id)]
                              : current.roleIds.filter((item) => item !== String(role.id)),
                          }));
                        }}
                      />
                      <span>{role.nombre_rol}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {formError && (
            <div className="adm-notice warning" style={{ marginTop: 8 }}>
              <AlertTriangle size={13} /> {formError}
            </div>
          )}
        </FormModal>
      )}
    </div>
  );
}
