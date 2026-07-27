import { useEffect, useState } from 'react';
import { AlertTriangle, Edit2, Eye, FileText, Plus, Power, Search } from 'lucide-react';
import { useAuth } from '../../../../context/AuthContext';
import { configuracionApi } from '../../../../services/configuracionApi';
import type {
  Contrato,
  CreateContratoPayload,
  Empresa,
  PaginationState,
  UpdateContratoPayload,
} from '../../../../types/configuracion.types';
import { FormModal } from '../components/FormModal';
import {
  formatDate,
  getErrorMessage,
  hasAnyPermission,
  mapKnownError,
  toNullableText,
} from './adminTabUtils';

type EstadoFiltro = 'all' | 'active' | 'inactive';
type ModalState = { mode: 'create' } | { mode: 'edit'; contrato: Contrato } | null;
type ContratoForm = {
  empresa_id: string;
  numero_contrato: string;
  numero_licitacion: string;
  entidad_contratante: string;
  fecha_inicio: string;
  fecha_finalizacion: string;
  objeto_contractual: string;
  aplica_cobertura: boolean;
};

const PAGE_SIZE = 10;

function createBlankForm(): ContratoForm {
  return {
    empresa_id: '',
    numero_contrato: '',
    numero_licitacion: '',
    entidad_contratante: '',
    fecha_inicio: '',
    fecha_finalizacion: '',
    objeto_contractual: '',
    aplica_cobertura: false,
  };
}

function mapContratoToForm(contrato: Contrato): ContratoForm {
  return {
    empresa_id: String(contrato.empresa.id),
    numero_contrato: contrato.numero_contrato,
    numero_licitacion: contrato.numero_licitacion ?? '',
    entidad_contratante: contrato.entidad_contratante,
    fecha_inicio: contrato.fecha_inicio,
    fecha_finalizacion: contrato.fecha_finalizacion,
    objeto_contractual: contrato.objeto_contractual ?? '',
    aplica_cobertura: contrato.aplica_cobertura,
  };
}

function buildPayload(form: ContratoForm): CreateContratoPayload {
  return {
    empresa_id: Number(form.empresa_id),
    numero_contrato: form.numero_contrato.trim(),
    numero_licitacion: toNullableText(form.numero_licitacion),
    entidad_contratante: form.entidad_contratante.trim(),
    fecha_inicio: form.fecha_inicio,
    fecha_finalizacion: form.fecha_finalizacion,
    objeto_contractual: toNullableText(form.objeto_contractual),
    aplica_cobertura: form.aplica_cobertura,
  };
}

export function ContratosTab() {
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];
  const canRead = hasAnyPermission(permissions, ['configuracion.read', 'contratos.read']);
  const canCreate = hasAnyPermission(permissions, ['contratos.create']);
  const canUpdate = hasAnyPermission(permissions, ['contratos.update']);

  const [items, setItems] = useState<Contrato[]>([]);
  const [pagination, setPagination] = useState<PaginationState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [estado, setEstado] = useState<EstadoFiltro>('all');
  const [empresaFiltro, setEmpresaFiltro] = useState('');
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedContrato, setSelectedContrato] = useState<Contrato | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<ContratoForm>(createBlankForm());
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

    async function loadEmpresas() {
      try {
        const response = await configuracionApi.listarEmpresas({ page: 1, limit: 100, activo: true });
        if (!cancelled) {
          setEmpresas(response.items);
        }
      } catch {
        if (!cancelled) {
          setEmpresas([]);
        }
      }
    }

    void loadEmpresas();

    return () => {
      cancelled = true;
    };
  }, [canCreate, canRead, canUpdate]);

  useEffect(() => {
    if (!canRead) {
      setItems([]);
      setPagination(null);
      setSelectedContrato(null);
      setError('No tienes permisos para consultar contratos.');
      return;
    }

    let cancelled = false;

    async function loadContratos() {
      setLoading(true);
      setError('');
      setItems([]);
      setPagination(null);
      setSelectedContrato(null);

      try {
        const response = await configuracionApi.listarContratos({
          page,
          limit: PAGE_SIZE,
          search: search.trim() || undefined,
          activo: estado === 'all' ? undefined : estado === 'active',
          empresa_id: empresaFiltro ? Number(empresaFiltro) : undefined,
        });

        if (!cancelled) {
          setItems(response.items);
          setPagination(response.pagination);
          if (selectedId && response.items.some((item) => item.id === selectedId)) {
            void handleSelect(selectedId);
          } else {
            setSelectedId(null);
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(getErrorMessage(loadError, 'No fue posible cargar los contratos.'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadContratos();

    return () => {
      cancelled = true;
    };
  }, [canRead, empresaFiltro, estado, page, search, selectedId]);

  async function handleSelect(id: number) {
    setSelectedId(id);
    setSelectedContrato(null);
    setDetailLoading(true);
    try {
      const detail = await configuracionApi.obtenerContrato(id);
      setSelectedContrato(detail);
    } catch {
      setSelectedContrato(null);
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
      const response = await configuracionApi.listarContratos({
        page,
        limit: PAGE_SIZE,
        search: search.trim() || undefined,
        activo: estado === 'all' ? undefined : estado === 'active',
        empresa_id: empresaFiltro ? Number(empresaFiltro) : undefined,
      });
      setItems(response.items);
      setPagination(response.pagination);
      if (targetId) {
        await handleSelect(targetId);
      } else {
        setSelectedId(null);
        setSelectedContrato(null);
      }
    } catch (reloadError) {
      setError(getErrorMessage(reloadError, 'No fue posible actualizar el listado de contratos.'));
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setForm({ ...createBlankForm(), empresa_id: empresas[0] ? String(empresas[0].id) : '' });
    setFormError('');
    setModal({ mode: 'create' });
  }

  function openEdit(contrato: Contrato) {
    setForm(mapContratoToForm(contrato));
    setFormError('');
    setModal({ mode: 'edit', contrato });
  }

  async function handleSave() {
    if (!form.empresa_id) {
      setFormError('Debes seleccionar una empresa.');
      return;
    }
    if (!form.numero_contrato.trim()) {
      setFormError('El numero de contrato es obligatorio.');
      return;
    }
    if (!form.entidad_contratante.trim()) {
      setFormError('La entidad contratante es obligatoria.');
      return;
    }
    if (!form.fecha_inicio || !form.fecha_finalizacion) {
      setFormError('Las fechas de inicio y finalizacion son obligatorias.');
      return;
    }
    if (form.fecha_finalizacion < form.fecha_inicio) {
      setFormError('La fecha de finalizacion no puede ser menor a la fecha de inicio.');
      return;
    }

    setSaving(true);
    setFormError('');

    try {
      const payload = buildPayload(form);
      let contrato: Contrato;

      if (modal?.mode === 'edit') {
        contrato = await configuracionApi.actualizarContrato(
          modal.contrato.id,
          payload as UpdateContratoPayload,
        );
        setFeedback({ tone: 'success', text: 'Contrato actualizado correctamente.' });
      } else {
        contrato = await configuracionApi.crearContrato(payload);
        setFeedback({ tone: 'success', text: 'Contrato creado correctamente.' });
      }

      setModal(null);
      await reloadList(contrato.id);
    } catch (saveError) {
      setFormError(
        mapKnownError(saveError, 'No fue posible guardar el contrato.', {
          CONTRATO_NUMERO_DUPLICATE:
            'Ya existe un contrato con ese numero dentro de la empresa seleccionada.',
          INVALID_DATE_RANGE:
            'La fecha de finalizacion debe ser mayor o igual a la fecha de inicio.',
        }),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(contrato: Contrato) {
    setToggleLoadingId(contrato.id);
    try {
      const updated = await configuracionApi.cambiarEstadoContrato(contrato.id, {
        activo: !contrato.activo,
      });
      setFeedback({
        tone: 'success',
        text: `Contrato ${updated.activo ? 'activado' : 'desactivado'} correctamente.`,
      });
      await reloadList(selectedId === contrato.id ? contrato.id : null);
    } catch (toggleError) {
      setFeedback({
        tone: 'error',
        text: mapKnownError(toggleError, 'No fue posible cambiar el estado del contrato.', {
          CONTRATO_HAS_ACTIVE_VINCULACIONES:
            'No se puede desactivar este contrato porque tiene vinculaciones activas.',
        }),
      });
    } finally {
      setToggleLoadingId(null);
    }
  }

  if (!canRead) {
    return (
      <div className="adm-notice warning">
        <AlertTriangle size={14} /> No tienes permisos para consultar contratos.
      </div>
    );
  }

  return (
    <div>
      <div className="adm-kpi-row">
        <div className="adm-kpi primary">
          <div className="adm-kpi-icon"><FileText size={16} /></div>
          <div className="adm-kpi-body">
            <span className="adm-kpi-val">{pagination?.total ?? 0}</span>
            <span className="adm-kpi-lbl">Contratos registrados</span>
          </div>
        </div>
        <div className="adm-kpi success">
          <div className="adm-kpi-icon"><FileText size={16} /></div>
          <div className="adm-kpi-body">
            <span className="adm-kpi-val">{items.filter((item) => item.activo).length}</span>
            <span className="adm-kpi-lbl">Activos en pagina</span>
          </div>
        </div>
        <div className="adm-kpi info">
          <div className="adm-kpi-icon"><FileText size={16} /></div>
          <div className="adm-kpi-body">
            <span className="adm-kpi-val">{items.filter((item) => item.aplica_cobertura).length}</span>
            <span className="adm-kpi-lbl">Con cobertura</span>
          </div>
        </div>
      </div>

      <div className="cg-tab-header">
        <div>
          <h4 className="cg-tab-title"><FileText size={15} /> Contratos</h4>
          <p className="cg-tab-subtitle">Listado real, filtro por empresa y detalle de contratos</p>
        </div>
        {canCreate && (
          <button className="adm-btn primary" onClick={openCreate} type="button">
            <Plus size={14} /> Nuevo contrato
          </button>
        )}
      </div>

      {feedback && (
        <div className={`adm-notice ${feedback.tone === 'error' ? 'warning' : 'info'}`} style={{ marginBottom: 12 }}>
          {feedback.tone === 'error' ? <AlertTriangle size={14} /> : <FileText size={14} />}
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
            placeholder="Buscar por numero o entidad"
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
          value={empresaFiltro}
          onChange={(event) => {
            setEmpresaFiltro(event.target.value);
            setPage(1);
            setSelectedId(null);
          }}
        >
          <option value="">Todas las empresas</option>
          {empresas.map((empresa) => (
            <option key={empresa.id} value={empresa.id}>{empresa.nombre_empresa}</option>
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
          <div className="cg-table-empty">Cargando contratos...</div>
        ) : (
          <table className="adm-history">
            <thead>
              <tr>
                <th>Contrato</th>
                <th>Empresa</th>
                <th>Entidad</th>
                <th>Vigencia</th>
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
              {items.map((contrato) => (
                <tr
                  key={contrato.id}
                  className={selectedId === contrato.id ? 'cg-row-selected' : ''}
                  onClick={() => void handleSelect(contrato.id)}
                >
                  <td>
                    <div className="cg-primary-cell" title={contrato.numero_contrato}>{contrato.numero_contrato}</div>
                    <div className="cg-secondary-cell" title={contrato.numero_licitacion ?? ''}>
                      Licitacion: {contrato.numero_licitacion ?? 'No disponible'}
                    </div>
                  </td>
                  <td title={contrato.empresa.nombre_empresa ?? ''}>{contrato.empresa.nombre_empresa ?? 'No disponible'}</td>
                  <td title={contrato.entidad_contratante}>{contrato.entidad_contratante}</td>
                  <td>
                    <div className="cg-primary-cell">{formatDate(contrato.fecha_inicio)}</div>
                    <div className="cg-secondary-cell">{formatDate(contrato.fecha_finalizacion)}</div>
                  </td>
                  <td>
                    <span className={`adm-badge ${contrato.activo ? 'active' : 'inactive'}`}>
                      {contrato.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <div className="cg-actions">
                      <button
                        className="adm-btn ghost sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleSelect(contrato.id);
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
                            openEdit(contrato);
                          }}
                          title="Editar"
                          type="button"
                        >
                          <Edit2 size={13} />
                        </button>
                      )}
                      {canUpdate && (
                        <button
                          className={`adm-btn sm ${contrato.activo ? 'danger-outline' : 'secondary'}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleToggle(contrato);
                          }}
                          disabled={toggleLoadingId === contrato.id}
                          title={contrato.activo ? 'Desactivar' : 'Activar'}
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
        <h4 className="adm-card-title"><FileText size={15} /> Detalle de contrato</h4>
        {detailLoading ? (
          <div className="adm-empty"><p>Cargando detalle...</p></div>
        ) : !selectedContrato ? (
          <div className="adm-empty"><p>Selecciona un contrato para ver su detalle.</p></div>
        ) : (
          <div className="cg-detail-grid">
            <div><span className="cg-detail-label">Numero</span><strong>{selectedContrato.numero_contrato}</strong></div>
            <div><span className="cg-detail-label">Empresa</span><strong>{selectedContrato.empresa.nombre_empresa ?? 'No disponible'}</strong></div>
            <div><span className="cg-detail-label">Entidad contratante</span><strong>{selectedContrato.entidad_contratante}</strong></div>
            <div><span className="cg-detail-label">Estado</span><strong>{selectedContrato.activo ? 'Activo' : 'Inactivo'}</strong></div>
            <div><span className="cg-detail-label">Fecha inicio</span><strong>{formatDate(selectedContrato.fecha_inicio)}</strong></div>
            <div><span className="cg-detail-label">Fecha finalizacion</span><strong>{formatDate(selectedContrato.fecha_finalizacion)}</strong></div>
            <div><span className="cg-detail-label">Numero de licitacion</span><strong>{selectedContrato.numero_licitacion ?? 'No disponible'}</strong></div>
            <div><span className="cg-detail-label">Cobertura</span><strong>{selectedContrato.aplica_cobertura ? 'Aplica' : 'No aplica'}</strong></div>
            <div className="cg-detail-full"><span className="cg-detail-label">Objeto contractual</span><strong>{selectedContrato.objeto_contractual ?? 'No disponible'}</strong></div>
          </div>
        )}
      </div>

      {modal && (
        <FormModal
          title={modal.mode === 'create' ? 'Nuevo contrato' : `Editar: ${modal.contrato.numero_contrato}`}
          onClose={() => setModal(null)}
          onSave={handleSave}
          saving={saving}
          wide
        >
          <div className="adm-form-grid">
            <div className="adm-field">
              <label className="adm-label">Empresa *</label>
              <select
                className="adm-select"
                value={form.empresa_id}
                onChange={(event) => setForm((current) => ({ ...current, empresa_id: event.target.value }))}
              >
                <option value="">Seleccionar</option>
                {empresas.map((empresa) => (
                  <option key={empresa.id} value={empresa.id}>{empresa.nombre_empresa}</option>
                ))}
              </select>
            </div>
            <div className="adm-field">
              <label className="adm-label">Numero de contrato *</label>
              <input
                className="adm-input"
                value={form.numero_contrato}
                onChange={(event) => setForm((current) => ({ ...current, numero_contrato: event.target.value }))}
              />
            </div>
            <div className="adm-field">
              <label className="adm-label">Numero de licitacion</label>
              <input
                className="adm-input"
                value={form.numero_licitacion}
                onChange={(event) => setForm((current) => ({ ...current, numero_licitacion: event.target.value }))}
              />
            </div>
            <div className="adm-field">
              <label className="adm-label">Entidad contratante *</label>
              <input
                className="adm-input"
                value={form.entidad_contratante}
                onChange={(event) => setForm((current) => ({ ...current, entidad_contratante: event.target.value }))}
              />
            </div>
            <div className="adm-field">
              <label className="adm-label">Fecha inicio *</label>
              <input
                className="adm-input"
                type="date"
                value={form.fecha_inicio}
                onChange={(event) => setForm((current) => ({ ...current, fecha_inicio: event.target.value }))}
              />
            </div>
            <div className="adm-field">
              <label className="adm-label">Fecha finalizacion *</label>
              <input
                className="adm-input"
                type="date"
                value={form.fecha_finalizacion}
                onChange={(event) => setForm((current) => ({ ...current, fecha_finalizacion: event.target.value }))}
              />
            </div>
            <div className="adm-field adm-field full-width">
              <label className="adm-label">Objeto contractual</label>
              <textarea
                className="adm-textarea"
                value={form.objeto_contractual}
                onChange={(event) => setForm((current) => ({ ...current, objeto_contractual: event.target.value }))}
                rows={3}
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

