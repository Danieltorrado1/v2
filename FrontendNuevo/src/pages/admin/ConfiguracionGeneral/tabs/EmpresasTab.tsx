import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Building2, Edit2, Eye, Plus, Power, Search, Settings } from 'lucide-react';
import { useAuth } from '../../../../context/AuthContext';
import { configuracionApi } from '../../../../services/configuracionApi';
import { saasApi, type CompanySaasSummary } from '../../../../services/saasApi';
import type {
  CreateEmpresaPayload,
  Empresa,
  PaginationState,
  UpdateEmpresaPayload,
} from '../../../../types/configuracion.types';
import { FormModal } from '../components/FormModal';
import {
  getErrorMessage,
  hasAnyPermission,
  mapKnownError,
  toNullableText,
} from './adminTabUtils';

type EstadoFiltro = 'all' | 'active' | 'inactive';
type EmpresaForm = {
  organizacion_id: string;
  tipo_empresa: string;
  nombre_empresa: string;
  nit: string;
  representante_legal: string;
  documento_representante: string;
  telefono: string;
  correo: string;
  direccion: string;
  ciudad: string;
  departamento: string;
};

type ModalState =
  | { mode: 'create' }
  | { mode: 'edit'; empresa: Empresa }
  | null;

const PAGE_SIZE = 10;

function createBlankForm(): EmpresaForm {
  return {
    organizacion_id: '',
    tipo_empresa: '',
    nombre_empresa: '',
    nit: '',
    representante_legal: '',
    documento_representante: '',
    telefono: '',
    correo: '',
    direccion: '',
    ciudad: '',
    departamento: '',
  };
}

function mapEmpresaToForm(empresa: Empresa): EmpresaForm {
  return {
    organizacion_id: String(empresa.organizacion.id),
    tipo_empresa: empresa.tipo_empresa,
    nombre_empresa: empresa.nombre_empresa,
    nit: empresa.nit,
    representante_legal: empresa.representante_legal ?? '',
    documento_representante: empresa.documento_representante ?? '',
    telefono: empresa.telefono ?? '',
    correo: empresa.correo ?? '',
    direccion: empresa.direccion ?? '',
    ciudad: empresa.ciudad ?? '',
    departamento: empresa.departamento ?? '',
  };
}

function buildPayload(form: EmpresaForm): CreateEmpresaPayload {
  return {
    organizacion_id: form.organizacion_id ? Number(form.organizacion_id) : null,
    tipo_empresa: form.tipo_empresa.trim(),
    nombre_empresa: form.nombre_empresa.trim(),
    nit: form.nit.trim(),
    representante_legal: toNullableText(form.representante_legal),
    documento_representante: toNullableText(form.documento_representante),
    telefono: toNullableText(form.telefono),
    correo: toNullableText(form.correo)?.toLowerCase() ?? null,
    direccion: toNullableText(form.direccion),
    ciudad: toNullableText(form.ciudad),
    departamento: toNullableText(form.departamento),
  };
}

function getEstadoLabel(activo: boolean): string {
  return activo ? 'Activa' : 'Inactiva';
}

export function EmpresasTab({onConfigureSaas}:{onConfigureSaas:(empresaId:number)=>void}) {
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];
  const canRead = hasAnyPermission(permissions, ['configuracion.read', 'empresas.read']);
  const canCreate = hasAnyPermission(permissions, ['empresas.create']);
  const canUpdate = hasAnyPermission(permissions, ['empresas.update']);

  const [items, setItems] = useState<Empresa[]>([]);
  const [allEmpresas, setAllEmpresas] = useState<Empresa[]>([]);
  const [pagination, setPagination] = useState<PaginationState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [estado, setEstado] = useState<EstadoFiltro>('all');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedEmpresa, setSelectedEmpresa] = useState<Empresa | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<EmpresaForm>(createBlankForm());
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [toggleLoadingId, setToggleLoadingId] = useState<number | null>(null);
  const [saasSummaries,setSaasSummaries]=useState<Record<number,CompanySaasSummary>>({});

  useEffect(() => {
    if (!feedback) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setFeedback(null), 4500);
    return () => window.clearTimeout(timeoutId);
  }, [feedback]);

  useEffect(() => {
    if (!canRead) {
      setItems([]);
      setAllEmpresas([]);
      setPagination(null);
      setSelectedEmpresa(null);
      setError('No tienes permisos para consultar empresas.');
      return;
    }

    let cancelled = false;

    async function loadEmpresas() {
      setLoading(true);
      setError('');
      setItems([]);
      setPagination(null);
      setSelectedEmpresa(null);

      try {
        const response = await configuracionApi.listarEmpresas({
          page,
          limit: PAGE_SIZE,
          search: search.trim() || undefined,
          activo: estado === 'all' ? undefined : estado === 'active',
        });
        const [allResponse,saasRows] = await Promise.all([configuracionApi.listarEmpresas({
          page: 1,
          limit: 500,
        }),saasApi.companySummaries()]);

        if (cancelled) {
          return;
        }

        setItems(response.items);
        setAllEmpresas(allResponse.items);
        setPagination(response.pagination);
        setSaasSummaries(Object.fromEntries(saasRows.map((row)=>[Number(row.empresa_id),row])));

        if (selectedId && response.items.some((item) => item.id === selectedId)) {
          void loadDetail(selectedId, cancelled);
        } else {
          setSelectedId(null);
          setSelectedEmpresa(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(getErrorMessage(loadError, 'No fue posible cargar las empresas.'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    async function loadDetail(id: number, localCancelled = false) {
      setDetailLoading(true);
      try {
        const detail = await configuracionApi.obtenerEmpresa(id);
        if (!cancelled && !localCancelled) {
          setSelectedEmpresa(detail);
        }
      } catch {
        if (!cancelled && !localCancelled) {
          setSelectedEmpresa(null);
        }
      } finally {
        if (!cancelled && !localCancelled) {
          setDetailLoading(false);
        }
      }
    }

    void loadEmpresas();

    return () => {
      cancelled = true;
    };
  }, [canRead, estado, page, search, selectedId]);

  const totalItems = pagination?.total ?? 0;
  const organizationOptions = useMemo(
    () =>
      Array.from(
        new Map(allEmpresas.map((empresa) => [empresa.organizacion.id, empresa.organizacion])).values()
      ).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [allEmpresas]
  );
  const pageLabel = useMemo(() => {
    if (!pagination || totalItems === 0) {
      return 'Sin resultados';
    }

    const from = (pagination.page - 1) * pagination.limit + 1;
    const to = Math.min(pagination.page * pagination.limit, pagination.total);
    return `${from} - ${to} de ${pagination.total}`;
  }, [pagination, totalItems]);

  function openCreate() {
    setForm(createBlankForm());
    setFormError('');
    setModal({ mode: 'create' });
  }

  function openEdit(empresa: Empresa) {
    setForm(mapEmpresaToForm(empresa));
    setFormError('');
    setModal({ mode: 'edit', empresa });
  }

  async function handleSelect(id: number) {
    setSelectedId(id);
    setSelectedEmpresa(null);
    setDetailLoading(true);
    try {
      const detail = await configuracionApi.obtenerEmpresa(id);
      setSelectedEmpresa(detail);
    } catch {
      setSelectedEmpresa(null);
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
      const response = await configuracionApi.listarEmpresas({
        page,
        limit: PAGE_SIZE,
        search: search.trim() || undefined,
        activo: estado === 'all' ? undefined : estado === 'active',
      });
      const allResponse = await configuracionApi.listarEmpresas({
        page: 1,
        limit: 500,
      });
      setItems(response.items);
      setAllEmpresas(allResponse.items);
      setPagination(response.pagination);

      if (targetId) {
        setSelectedId(targetId);
        const detail = await configuracionApi.obtenerEmpresa(targetId);
        setSelectedEmpresa(detail);
      } else {
        setSelectedId(null);
        setSelectedEmpresa(null);
      }
    } catch (reloadError) {
      setError(getErrorMessage(reloadError, 'No fue posible actualizar el listado de empresas.'));
    } finally {
      setLoading(false);
      setDetailLoading(false);
    }
  }

  async function handleSave() {
    if (!form.tipo_empresa.trim()) {
      setFormError('El tipo de empresa es obligatorio.');
      return;
    }

    if (!form.nombre_empresa.trim()) {
      setFormError('El nombre de la empresa es obligatorio.');
      return;
    }

    if (!form.nit.trim()) {
      setFormError('El NIT es obligatorio.');
      return;
    }

    setSaving(true);
    setFormError('');

    try {
      const payload = buildPayload(form);
      let empresa: Empresa;

      if (modal?.mode === 'edit') {
        empresa = await configuracionApi.actualizarEmpresa(
          modal.empresa.id,
          payload as UpdateEmpresaPayload,
        );
        setFeedback({ tone: 'success', text: 'Empresa actualizada correctamente.' });
      } else {
        empresa = await configuracionApi.crearEmpresa(payload);
        setFeedback({ tone: 'success', text: 'Empresa creada correctamente.' });
      }

      setModal(null);
      await reloadList(empresa.id);
    } catch (saveError) {
      setFormError(
        mapKnownError(saveError, 'No fue posible guardar la empresa.', {
          EMPRESA_NIT_DUPLICATE: 'Ya existe una empresa con ese NIT.',
          EMPRESA_NOMBRE_DUPLICATE: 'Ya existe una empresa con ese nombre.',
        }),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(empresa: Empresa) {
    if (!canUpdate) {
      return;
    }

    setToggleLoadingId(empresa.id);
    try {
      const updated = await configuracionApi.cambiarEstadoEmpresa(empresa.id, {
        activo: !empresa.activo,
      });
      setFeedback({
        tone: 'success',
        text: `Empresa ${updated.activo ? 'activada' : 'desactivada'} correctamente.`,
      });
      await reloadList(selectedId === empresa.id ? empresa.id : null);
    } catch (toggleError) {
      setFeedback({
        tone: 'error',
        text: mapKnownError(toggleError, 'No fue posible cambiar el estado de la empresa.', {
          EMPRESA_HAS_ACTIVE_CONTRATOS:
            'No se puede desactivar esta empresa porque tiene contratos activos.',
        }),
      });
    } finally {
      setToggleLoadingId(null);
    }
  }

  if (!canRead) {
    return (
      <div className="adm-notice warning">
        <AlertTriangle size={14} /> No tienes permisos para consultar empresas.
      </div>
    );
  }

  return (
    <div>
      <div className="adm-kpi-row">
        <div className="adm-kpi primary">
          <div className="adm-kpi-icon"><Building2 size={16} /></div>
          <div className="adm-kpi-body">
            <span className="adm-kpi-val">{pagination?.total ?? 0}</span>
            <span className="adm-kpi-lbl">Empresas registradas</span>
          </div>
        </div>
        <div className="adm-kpi success">
          <div className="adm-kpi-icon"><Building2 size={16} /></div>
          <div className="adm-kpi-body">
            <span className="adm-kpi-val">{items.filter((item) => item.activo).length}</span>
            <span className="adm-kpi-lbl">Activas en pagina</span>
          </div>
        </div>
        <div className="adm-kpi neutral">
          <div className="adm-kpi-icon"><Building2 size={16} /></div>
          <div className="adm-kpi-body">
            <span className="adm-kpi-val">{items.filter((item) => !item.activo).length}</span>
            <span className="adm-kpi-lbl">Inactivas en pagina</span>
          </div>
        </div>
      </div>

      <div className="cg-tab-header">
        <div>
          <h4 className="cg-tab-title"><Building2 size={15} /> Empresas</h4>
          <p className="cg-tab-subtitle">Listado real, detalle y mantenimiento de empresas</p>
        </div>
        {canCreate && (
          <button className="adm-btn primary" onClick={openCreate} type="button">
            <Plus size={14} /> Nueva empresa
          </button>
        )}
      </div>

      {feedback && (
        <div className={`adm-notice ${feedback.tone === 'error' ? 'warning' : 'info'}`} style={{ marginBottom: 12 }}>
          {feedback.tone === 'error' ? <AlertTriangle size={14} /> : <Building2 size={14} />}
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
            placeholder="Buscar por nombre, NIT o ciudad"
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
          value={estado}
          onChange={(event) => {
            setEstado(event.target.value as EstadoFiltro);
            setPage(1);
            setSelectedId(null);
          }}
        >
          <option value="all">Todas</option>
          <option value="active">Activas</option>
          <option value="inactive">Inactivas</option>
        </select>
      </div>

      {error && (
        <div className="adm-notice warning" style={{ marginBottom: 12 }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      <div className="cg-table-card">
        {loading ? (
          <div className="cg-table-empty">Cargando empresas...</div>
        ) : (
          <table className="adm-history">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>NIT</th>
                <th>Plan / suscripción</th>
                <th>Módulos</th>
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
              {items.map((empresa) => (
                <tr
                  key={empresa.id}
                  className={selectedId === empresa.id ? 'cg-row-selected' : ''}
                  onClick={() => void handleSelect(empresa.id)}
                >
                  <td>
                    <div className="cg-primary-cell" title={empresa.nombre_empresa}>{empresa.nombre_empresa}</div>
                    <div className="cg-secondary-cell" title={empresa.organizacion.nombre}>
                      {empresa.organizacion.nombre}
                    </div>
                  </td>
                  <td className="cg-mono-cell">{empresa.nit}</td>
                  <td>
                    <div className="cg-primary-cell">{saasSummaries[empresa.id]?.plan_nombre??'LEGACY / SIN PLAN CONFIGURADO'}</div>
                    <div className="cg-secondary-cell">{saasSummaries[empresa.id]?.estado_suscripcion??'LEGACY'}</div>
                  </td>
                  <td><span className="adm-badge active">{saasSummaries[empresa.id]?.modulos_activos??'—'} activos</span></td>
                  <td>
                    <span className={`adm-badge ${empresa.activo ? 'active' : 'inactive'}`}>
                      {getEstadoLabel(empresa.activo)}
                    </span>
                  </td>
                  <td>
                    <div className="cg-actions">
                      <button
                        className="adm-btn ghost sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleSelect(empresa.id);
                        }}
                        title="Ver detalle"
                        type="button"
                      >
                        <Eye size={13} />
                      </button>
                      {canUpdate && (
                        <button className="adm-btn ghost sm" onClick={(event)=>{event.stopPropagation();onConfigureSaas(empresa.id);}} title="Configurar plan, módulos e histórico" type="button"><Settings size={13}/></button>
                      )}
                      {canUpdate && (
                        <button
                          className="adm-btn ghost sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            openEdit(empresa);
                          }}
                          title="Editar"
                          type="button"
                        >
                          <Edit2 size={13} />
                        </button>
                      )}
                      {canUpdate && (
                        <button
                          className={`adm-btn sm ${empresa.activo ? 'danger-outline' : 'secondary'}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleToggle(empresa);
                          }}
                          disabled={toggleLoadingId === empresa.id}
                          title={empresa.activo ? 'Desactivar' : 'Activar'}
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
        <div className="cg-pagination-summary">{pageLabel}</div>
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
        <h4 className="adm-card-title"><Building2 size={15} /> Detalle de empresa</h4>
        {detailLoading ? (
          <div className="adm-empty"><p>Cargando detalle...</p></div>
        ) : !selectedEmpresa ? (
          <div className="adm-empty"><p>Selecciona una empresa para ver su detalle.</p></div>
        ) : (
          <div className="cg-detail-grid">
            <div><span className="cg-detail-label">Organizacion</span><strong>{selectedEmpresa.organizacion.nombre}</strong></div>
            <div><span className="cg-detail-label">Nombre</span><strong>{selectedEmpresa.nombre_empresa}</strong></div>
            <div><span className="cg-detail-label">NIT</span><strong>{selectedEmpresa.nit}</strong></div>
            <div><span className="cg-detail-label">Tipo</span><strong>{selectedEmpresa.tipo_empresa}</strong></div>
            <div><span className="cg-detail-label">Estado</span><strong>{getEstadoLabel(selectedEmpresa.activo)}</strong></div>
            <div><span className="cg-detail-label">Representante legal</span><strong>{selectedEmpresa.representante_legal ?? 'No disponible'}</strong></div>
            <div><span className="cg-detail-label">Documento representante</span><strong>{selectedEmpresa.documento_representante ?? 'No disponible'}</strong></div>
            <div><span className="cg-detail-label">Telefono</span><strong>{selectedEmpresa.telefono ?? 'No disponible'}</strong></div>
            <div><span className="cg-detail-label">Correo</span><strong>{selectedEmpresa.correo ?? 'No disponible'}</strong></div>
            <div><span className="cg-detail-label">Ciudad</span><strong>{selectedEmpresa.ciudad ?? 'No disponible'}</strong></div>
            <div><span className="cg-detail-label">Departamento</span><strong>{selectedEmpresa.departamento ?? 'No disponible'}</strong></div>
            <div className="cg-detail-full"><span className="cg-detail-label">Direccion</span><strong>{selectedEmpresa.direccion ?? 'No disponible'}</strong></div>
          </div>
        )}
      </div>

      {modal && (
        <FormModal
          title={modal.mode === 'create' ? 'Nueva empresa' : `Editar: ${modal.empresa.nombre_empresa}`}
          onClose={() => setModal(null)}
          onSave={handleSave}
          saving={saving}
          wide
        >
          <div className="adm-form-grid">
            <div className="adm-field adm-field full-width">
              <label className="adm-label">Organizacion</label>
              <select
                className="adm-input"
                value={form.organizacion_id}
                onChange={(event) => setForm((current) => ({ ...current, organizacion_id: event.target.value }))}
              >
                <option value="">Crear organizacion 1:1 automaticamente</option>
                {organizationOptions.map((organizacion) => (
                  <option key={organizacion.id} value={organizacion.id}>
                    {organizacion.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="adm-field">
              <label className="adm-label">Tipo de empresa *</label>
              <input
                className="adm-input"
                value={form.tipo_empresa}
                onChange={(event) => setForm((current) => ({ ...current, tipo_empresa: event.target.value }))}
              />
            </div>
            <div className="adm-field">
              <label className="adm-label">Nombre *</label>
              <input
                className="adm-input"
                value={form.nombre_empresa}
                onChange={(event) => setForm((current) => ({ ...current, nombre_empresa: event.target.value }))}
              />
            </div>
            <div className="adm-field">
              <label className="adm-label">NIT *</label>
              <input
                className="adm-input"
                value={form.nit}
                onChange={(event) => setForm((current) => ({ ...current, nit: event.target.value }))}
              />
            </div>
            <div className="adm-field">
              <label className="adm-label">Representante legal</label>
              <input
                className="adm-input"
                value={form.representante_legal}
                onChange={(event) => setForm((current) => ({ ...current, representante_legal: event.target.value }))}
              />
            </div>
            <div className="adm-field">
              <label className="adm-label">Documento representante</label>
              <input
                className="adm-input"
                value={form.documento_representante}
                onChange={(event) => setForm((current) => ({ ...current, documento_representante: event.target.value }))}
              />
            </div>
            <div className="adm-field">
              <label className="adm-label">Telefono</label>
              <input
                className="adm-input"
                value={form.telefono}
                onChange={(event) => setForm((current) => ({ ...current, telefono: event.target.value }))}
              />
            </div>
            <div className="adm-field">
              <label className="adm-label">Correo</label>
              <input
                className="adm-input"
                type="email"
                value={form.correo}
                onChange={(event) => setForm((current) => ({ ...current, correo: event.target.value }))}
              />
            </div>
            <div className="adm-field">
              <label className="adm-label">Ciudad</label>
              <input
                className="adm-input"
                value={form.ciudad}
                onChange={(event) => setForm((current) => ({ ...current, ciudad: event.target.value }))}
              />
            </div>
            <div className="adm-field">
              <label className="adm-label">Departamento</label>
              <input
                className="adm-input"
                value={form.departamento}
                onChange={(event) => setForm((current) => ({ ...current, departamento: event.target.value }))}
              />
            </div>
            <div className="adm-field adm-field full-width">
              <label className="adm-label">Direccion</label>
              <input
                className="adm-input"
                value={form.direccion}
                onChange={(event) => setForm((current) => ({ ...current, direccion: event.target.value }))}
              />
            </div>
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



