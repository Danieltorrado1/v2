import { useEffect, useState } from 'react';
import { AlertTriangle, Briefcase, Edit2, Eye, Plus, Power, Search } from 'lucide-react';
import { useAuth } from '../../../../context/AuthContext';
import { configuracionApi } from '../../../../services/configuracionApi';
import type {
  Contrato,
  ContratoCargo,
  PaginationState,
  UpdateCargoPayload,
} from '../../../../types/configuracion.types';
import { FormModal } from '../components/FormModal';
import {
  getErrorMessage,
  hasAnyPermission,
  mapKnownError,
} from './adminTabUtils';

type EstadoFiltro = 'all' | 'active' | 'inactive';
type ModalState = { mode: 'create' } | { mode: 'edit'; cargo: ContratoCargo } | null;
type CargoForm = {
  contrato_id: string;
  nombre_cargo: string;
  cantidad_requerida: string;
  aplica_cobertura: boolean;
};

const PAGE_SIZE = 10;

function createBlankForm(): CargoForm {
  return {
    contrato_id: '',
    nombre_cargo: '',
    cantidad_requerida: '',
    aplica_cobertura: false,
  };
}

function mapCargoToForm(cargo: ContratoCargo): CargoForm {
  return {
    contrato_id: String(cargo.contrato.id),
    nombre_cargo: cargo.nombre_cargo,
    cantidad_requerida: cargo.cantidad_requerida?.toString() ?? '',
    aplica_cobertura: cargo.aplica_cobertura,
  };
}

export function CargosTab() {
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];
  const canRead = hasAnyPermission(permissions, ['configuracion.read', 'cargos.read']);
  const canCreate = hasAnyPermission(permissions, ['cargos.create']);
  const canUpdate = hasAnyPermission(permissions, ['cargos.update']);

  const [items, setItems] = useState<ContratoCargo[]>([]);
  const [pagination, setPagination] = useState<PaginationState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [estado, setEstado] = useState<EstadoFiltro>('all');
  const [contratoFiltro, setContratoFiltro] = useState('');
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedCargo, setSelectedCargo] = useState<ContratoCargo | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<CargoForm>(createBlankForm());
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [toggleLoadingId, setToggleLoadingId] = useState<number | null>(null);

  useEffect(() => {
    if (!feedback) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setFeedback(null), 4500);
    return () => window.clearTimeout(timeoutId);
  }, [feedback]);

  useEffect(() => {
    if (!canRead && !canCreate && !canUpdate) {
      return;
    }

    let cancelled = false;

    async function loadContratos() {
      try {
        const response = await configuracionApi.listarContratos({ page: 1, limit: 100 });
        if (!cancelled) {
          setContratos(response.items);
        }
      } catch {
        if (!cancelled) {
          setContratos([]);
        }
      }
    }

    void loadContratos();

    return () => {
      cancelled = true;
    };
  }, [canCreate, canRead, canUpdate]);

  useEffect(() => {
    if (!canRead) {
      setItems([]);
      setPagination(null);
      setSelectedCargo(null);
      setError('No tienes permisos para consultar cargos.');
      return;
    }

    let cancelled = false;

    async function loadCargos() {
      setLoading(true);
      setError('');
      setItems([]);
      setPagination(null);
      setSelectedCargo(null);

      try {
        const response = await configuracionApi.listarCargos({
          page,
          limit: PAGE_SIZE,
          search: search.trim() || undefined,
          activo: estado === 'all' ? undefined : estado === 'active',
          contrato_id: contratoFiltro ? Number(contratoFiltro) : undefined,
        });
        if (!cancelled) {
          setItems(response.items);
          setPagination(response.pagination);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(getErrorMessage(loadError, 'No fue posible cargar los cargos.'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadCargos();

    return () => {
      cancelled = true;
    };
  }, [canRead, contratoFiltro, estado, page, search]);

  async function handleSelect(id: number) {
    setSelectedId(id);
    setSelectedCargo(null);
    setDetailLoading(true);
    try {
      const detail = await configuracionApi.obtenerCargo(id);
      setSelectedCargo(detail);
    } catch {
      setSelectedCargo(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function reloadList(targetId?: number | null) {
    setLoading(true);
    setError('');
    setItems([]);
    setPagination(null);

    try {
      const response = await configuracionApi.listarCargos({
        page,
        limit: PAGE_SIZE,
        search: search.trim() || undefined,
        activo: estado === 'all' ? undefined : estado === 'active',
        contrato_id: contratoFiltro ? Number(contratoFiltro) : undefined,
      });
      setItems(response.items);
      setPagination(response.pagination);
      if (targetId) {
        await handleSelect(targetId);
      } else {
        setSelectedId(null);
        setSelectedCargo(null);
      }
    } catch (reloadError) {
      setError(getErrorMessage(reloadError, 'No fue posible actualizar el listado de cargos.'));
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setForm({ ...createBlankForm(), contrato_id: contratos[0] ? String(contratos[0].id) : '' });
    setFormError('');
    setModal({ mode: 'create' });
  }

  function openEdit(cargo: ContratoCargo) {
    setForm(mapCargoToForm(cargo));
    setFormError('');
    setModal({ mode: 'edit', cargo });
  }

  async function handleSave() {
    if (!form.contrato_id) {
      setFormError('Debes seleccionar un contrato.');
      return;
    }
    if (!form.nombre_cargo.trim()) {
      setFormError('El nombre del cargo es obligatorio.');
      return;
    }
    if (form.cantidad_requerida && Number(form.cantidad_requerida) <= 0) {
      setFormError('La cantidad requerida debe ser mayor a cero.');
      return;
    }

    setSaving(true);
    setFormError('');

    try {
      const payload = {
        contrato_id: Number(form.contrato_id),
        nombre_cargo: form.nombre_cargo.trim(),
        cantidad_requerida: form.cantidad_requerida ? Number(form.cantidad_requerida) : null,
        aplica_cobertura: form.aplica_cobertura,
      };
      let cargo: ContratoCargo;

      if (modal?.mode === 'edit') {
        cargo = await configuracionApi.actualizarCargo(modal.cargo.id, payload as UpdateCargoPayload);
        setFeedback({ tone: 'success', text: 'Cargo actualizado correctamente.' });
      } else {
        cargo = await configuracionApi.crearCargo(payload);
        setFeedback({ tone: 'success', text: 'Cargo creado correctamente.' });
      }

      setModal(null);
      await reloadList(cargo.id);
    } catch (saveError) {
      setFormError(
        mapKnownError(saveError, 'No fue posible guardar el cargo.', {
          CONTRATO_CARGO_NOMBRE_DUPLICATE:
            'Ya existe un cargo con ese nombre dentro del contrato seleccionado.',
        }),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(cargo: ContratoCargo) {
    setToggleLoadingId(cargo.id);
    try {
      const updated = await configuracionApi.cambiarEstadoCargo(cargo.id, {
        activo: !cargo.activo,
      });
      setFeedback({
        tone: 'success',
        text: `Cargo ${updated.activo ? 'activado' : 'desactivado'} correctamente.`,
      });
      await reloadList(selectedId === cargo.id ? cargo.id : null);
    } catch (toggleError) {
      setFeedback({
        tone: 'error',
        text: mapKnownError(toggleError, 'No fue posible cambiar el estado del cargo.', {
          CONTRATO_CARGO_HAS_ACTIVE_VINCULACIONES:
            'No se puede desactivar este cargo porque tiene vinculaciones activas.',
        }),
      });
    } finally {
      setToggleLoadingId(null);
    }
  }

  if (!canRead) {
    return (
      <div className="adm-notice warning">
        <AlertTriangle size={14} /> No tienes permisos para consultar cargos.
      </div>
    );
  }

  return (
    <div>
      <div className="adm-kpi-row">
        <div className="adm-kpi primary">
          <div className="adm-kpi-icon"><Briefcase size={16} /></div>
          <div className="adm-kpi-body">
            <span className="adm-kpi-val">{pagination?.total ?? 0}</span>
            <span className="adm-kpi-lbl">Cargos registrados</span>
          </div>
        </div>
        <div className="adm-kpi success">
          <div className="adm-kpi-icon"><Briefcase size={16} /></div>
          <div className="adm-kpi-body">
            <span className="adm-kpi-val">{items.filter((item) => item.activo).length}</span>
            <span className="adm-kpi-lbl">Activos en pagina</span>
          </div>
        </div>
        <div className="adm-kpi info">
          <div className="adm-kpi-icon"><Briefcase size={16} /></div>
          <div className="adm-kpi-body">
            <span className="adm-kpi-val">{items.filter((item) => item.aplica_cobertura).length}</span>
            <span className="adm-kpi-lbl">Con cobertura</span>
          </div>
        </div>
      </div>

      <div className="cg-tab-header">
        <div>
          <h4 className="cg-tab-title"><Briefcase size={15} /> Cargos</h4>
          <p className="cg-tab-subtitle">Cargos reales por contrato con bloqueo de desactivacion</p>
        </div>
        {canCreate && (
          <button className="adm-btn primary" onClick={openCreate} type="button">
            <Plus size={14} /> Nuevo cargo
          </button>
        )}
      </div>

      {feedback && (
        <div className={`adm-notice ${feedback.tone === 'error' ? 'warning' : 'info'}`} style={{ marginBottom: 12 }}>
          {feedback.tone === 'error' ? <AlertTriangle size={14} /> : <Briefcase size={14} />}
          {feedback.text}
          <button className="adm-inline-close" onClick={() => setFeedback(null)} type="button">
            Cerrar
          </button>
        </div>
      )}

      <div className="cg-filters">
        <div className="cg-search">
          <Search size={14} />
          <input
            placeholder="Buscar por cargo, empresa o contrato"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
              setSelectedId(null);
            }}
          />
        </div>
        <select
          className="adm-select cg-filter-select"
          value={contratoFiltro}
          onChange={(event) => {
            setContratoFiltro(event.target.value);
            setPage(1);
            setSelectedId(null);
          }}
        >
          <option value="">Todos los contratos</option>
          {contratos.map((contrato) => (
            <option key={contrato.id} value={contrato.id}>{contrato.numero_contrato}</option>
          ))}
        </select>
        <select
          className="adm-select cg-filter-select"
          value={estado}
          onChange={(event) => {
            setEstado(event.target.value as EstadoFiltro);
            setPage(1);
            setSelectedId(null);
          }}
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
          <div className="cg-table-empty">Cargando cargos...</div>
        ) : (
          <table className="adm-history">
            <thead>
              <tr>
                <th>Cargo</th>
                <th>Contrato</th>
                <th>Empresa</th>
                <th>Cantidad</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="cg-table-empty">Sin resultados</td>
                </tr>
              )}
              {items.map((cargo) => (
                <tr
                  key={cargo.id}
                  className={selectedId === cargo.id ? 'cg-row-selected' : ''}
                  onClick={() => void handleSelect(cargo.id)}
                >
                  <td>
                    <div className="cg-primary-cell" title={cargo.nombre_cargo}>{cargo.nombre_cargo}</div>
                    <div className="cg-secondary-cell">
                      {cargo.aplica_cobertura ? 'Aplica cobertura' : 'Sin cobertura'}
                    </div>
                  </td>
                  <td title={cargo.contrato.numero_contrato ?? ''}>{cargo.contrato.numero_contrato ?? 'No disponible'}</td>
                  <td title={cargo.empresa.nombre_empresa ?? ''}>{cargo.empresa.nombre_empresa ?? 'No disponible'}</td>
                  <td>{cargo.cantidad_requerida ?? 'No disponible'}</td>
                  <td>
                    <span className={`adm-badge ${cargo.activo ? 'active' : 'inactive'}`}>
                      {cargo.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <div className="cg-actions">
                      <button
                        className="adm-btn ghost sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleSelect(cargo.id);
                        }}
                        title="Ver detalle"
                        type="button"
                      >
                        <Eye size={13} />
                      </button>
                      {canUpdate && (
                        <button
                          className="adm-btn ghost sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            openEdit(cargo);
                          }}
                          title="Editar"
                          type="button"
                        >
                          <Edit2 size={13} />
                        </button>
                      )}
                      {canUpdate && (
                        <button
                          className={`adm-btn sm ${cargo.activo ? 'danger-outline' : 'secondary'}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleToggle(cargo);
                          }}
                          disabled={toggleLoadingId === cargo.id}
                          title={cargo.activo ? 'Desactivar' : 'Activar'}
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

      <div className="cg-pagination">
        <div className="cg-pagination-summary">
          {!pagination || pagination.total === 0
            ? 'Sin resultados'
            : `${(pagination.page - 1) * pagination.limit + 1} - ${Math.min(
                pagination.page * pagination.limit,
                pagination.total,
              )} de ${pagination.total}`}
        </div>
        <div className="cg-pagination-actions">
          <button
            className="adm-btn secondary sm"
            disabled={!pagination || pagination.page <= 1 || loading}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            type="button"
          >
            Anterior
          </button>
          <button
            className="adm-btn secondary sm"
            disabled={!pagination || pagination.page >= pagination.total_pages || loading}
            onClick={() => setPage((current) => current + 1)}
            type="button"
          >
            Siguiente
          </button>
        </div>
      </div>

      <div className="adm-card">
        <h4 className="adm-card-title"><Briefcase size={15} /> Detalle de cargo</h4>
        {detailLoading ? (
          <div className="adm-empty"><p>Cargando detalle...</p></div>
        ) : !selectedCargo ? (
          <div className="adm-empty"><p>Selecciona un cargo para ver su detalle.</p></div>
        ) : (
          <div className="cg-detail-grid">
            <div><span className="cg-detail-label">Nombre</span><strong>{selectedCargo.nombre_cargo}</strong></div>
            <div><span className="cg-detail-label">Estado</span><strong>{selectedCargo.activo ? 'Activo' : 'Inactivo'}</strong></div>
            <div><span className="cg-detail-label">Contrato</span><strong>{selectedCargo.contrato.numero_contrato ?? 'No disponible'}</strong></div>
            <div><span className="cg-detail-label">Empresa</span><strong>{selectedCargo.empresa.nombre_empresa ?? 'No disponible'}</strong></div>
            <div><span className="cg-detail-label">Cantidad requerida</span><strong>{selectedCargo.cantidad_requerida ?? 'No disponible'}</strong></div>
            <div><span className="cg-detail-label">Cobertura</span><strong>{selectedCargo.aplica_cobertura ? 'Aplica' : 'No aplica'}</strong></div>
          </div>
        )}
      </div>

      {modal && (
        <FormModal
          title={modal.mode === 'create' ? 'Nuevo cargo' : `Editar: ${modal.cargo.nombre_cargo}`}
          onClose={() => setModal(null)}
          onSave={handleSave}
          saving={saving}
          wide
        >
          <div className="adm-form-grid">
            <div className="adm-field">
              <label className="adm-label">Contrato *</label>
              <select
                className="adm-select"
                value={form.contrato_id}
                onChange={(event) => setForm((current) => ({ ...current, contrato_id: event.target.value }))}
              >
                <option value="">Seleccionar</option>
                {contratos.map((contrato) => (
                  <option key={contrato.id} value={contrato.id}>
                    {contrato.numero_contrato} - {contrato.entidad_contratante}
                  </option>
                ))}
              </select>
            </div>
            <div className="adm-field">
              <label className="adm-label">Nombre del cargo *</label>
              <input
                className="adm-input"
                value={form.nombre_cargo}
                onChange={(event) => setForm((current) => ({ ...current, nombre_cargo: event.target.value }))}
              />
            </div>
            <div className="adm-field">
              <label className="adm-label">Cantidad requerida</label>
              <input
                className="adm-input"
                type="number"
                min={1}
                value={form.cantidad_requerida}
                onChange={(event) => setForm((current) => ({ ...current, cantidad_requerida: event.target.value }))}
              />
            </div>
          </div>
          <label className="cg-checkbox-row" style={{ marginTop: 12 }}>
            <input
              type="checkbox"
              checked={form.aplica_cobertura}
              onChange={(event) => setForm((current) => ({ ...current, aplica_cobertura: event.target.checked }))}
            />
            <span>Aplica cobertura</span>
          </label>
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
