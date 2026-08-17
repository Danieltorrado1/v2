import { useEffect, useState } from 'react';
import { AlertTriangle, Edit2, Eye, FileText, Plus, Power, Search } from 'lucide-react';

import { useAuth } from '../../../../context/AuthContext';
import { configuracionApi } from '../../../../services/configuracionApi';
import type {
  CatalogoItem,
  Contrato,
  ContratoDetail,
  CreateContratoPayload,
  Empresa,
  PaginationState,
  UpdateContratoPayload,
} from '../../../../types/configuracion.types';
import { FormModal } from '../components/FormModal';
import { ContratosDetailPanel } from './ContratosDetailPanel';
import { formatDate, getErrorMessage, hasAnyPermission, mapKnownError, toNullableText } from './adminTabUtils';

type EstadoFiltro = 'all' | 'active' | 'inactive';
type DetailTab = 'resumen' | 'expediente' | 'checklist' | 'eventos' | 'excepciones' | 'alertas';
type ModalState = { mode: 'create' } | { mode: 'edit'; contrato: Contrato } | null;
type ContratoForm = {
  empresa_id: string;
  numero_contrato: string;
  numero_licitacion: string;
  entidad_contratante: string;
  fecha_inicio: string;
  fecha_final_estimada: string;
  fecha_final_real: string;
  estado_contractual: string;
  contrato_padre_id: string;
  objeto_contractual: string;
  observaciones: string;
  aplica_cobertura: boolean;
};

const PAGE_SIZE = 10;
const CONTRACT_STATES = ['BORRADOR', 'PENDIENTE_INICIO', 'ACTIVO', 'PRORROGADO', 'SUSPENDIDO', 'FINALIZADO', 'LIQUIDADO', 'ANULADO'] as const;
function blankForm(): ContratoForm {
  return {
    empresa_id: '', numero_contrato: '', numero_licitacion: '', entidad_contratante: '', fecha_inicio: '',
    fecha_final_estimada: '', fecha_final_real: '', estado_contractual: 'BORRADOR', contrato_padre_id: '',
    objeto_contractual: '', observaciones: '', aplica_cobertura: false,
  };
}

function contratoToForm(contrato: Contrato): ContratoForm {
  return {
    empresa_id: String(contrato.empresa.id),
    numero_contrato: contrato.numero_contrato,
    numero_licitacion: contrato.numero_licitacion ?? '',
    entidad_contratante: contrato.entidad_contratante,
    fecha_inicio: contrato.fecha_inicio,
    fecha_final_estimada: contrato.fecha_final_estimada ?? contrato.fecha_finalizacion ?? '',
    fecha_final_real: contrato.fecha_final_real ?? '',
    estado_contractual: contrato.estado_contractual,
    contrato_padre_id: contrato.contrato_padre_id ? String(contrato.contrato_padre_id) : '',
    objeto_contractual: contrato.objeto_contractual ?? '',
    observaciones: contrato.observaciones ?? '',
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
    fecha_final_estimada: form.fecha_final_estimada || null,
    fecha_finalizacion: form.fecha_final_estimada || null,
    fecha_final_real: form.fecha_final_real || null,
    estado_contractual: form.estado_contractual,
    contrato_padre_id: form.contrato_padre_id ? Number(form.contrato_padre_id) : null,
    objeto_contractual: toNullableText(form.objeto_contractual),
    observaciones: toNullableText(form.observaciones),
    aplica_cobertura: form.aplica_cobertura,
  };
}

export function ContratosTab() {
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];
  const canRead = hasAnyPermission(permissions, ['configuracion.read', 'contratos.read', 'contracts.read']);
  const canCreate = hasAnyPermission(permissions, ['contratos.create', 'contracts.create']);
  const canUpdate = hasAnyPermission(permissions, ['contratos.update', 'contracts.update']);

  const [items, setItems] = useState<Contrato[]>([]);
  const [pagination, setPagination] = useState<PaginationState | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [search, setSearch] = useState('');
  const [estado, setEstado] = useState<EstadoFiltro>('all');
  const [estadoContractual, setEstadoContractual] = useState('');
  const [empresaFiltro, setEmpresaFiltro] = useState('');
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [tiposDocumento, setTiposDocumento] = useState<CatalogoItem[]>([]);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, ContratoDetail>>({});
  const [detailTab, setDetailTab] = useState<DetailTab>('resumen');
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<ContratoForm>(blankForm());
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toggleLoadingId, setToggleLoadingId] = useState<number | null>(null);
  const selectedDetail = selectedId ? details[selectedId] ?? null : null;

  useEffect(() => {
    let cancelled = false;
    if (!canRead && !canCreate && !canUpdate) return;
    configuracionApi.listarEmpresas({ page: 1, limit: 100, activo: true }).then((response) => {
      if (!cancelled) setEmpresas(response.items);
    }).catch(() => {
      if (!cancelled) setEmpresas([]);
    });
    configuracionApi.listarTiposDocumento({ page: 1, limit: 100, activo: true }).then((response) => {
      if (!cancelled) setTiposDocumento(response.items);
    }).catch(() => {
      if (!cancelled) setTiposDocumento([]);
    });
    return () => { cancelled = true; };
  }, [canCreate, canRead, canUpdate]);

  useEffect(() => {
    if (!canRead) {
      setItems([]); setPagination(null); setError('No tienes permisos para consultar contratos.'); return;
    }
    let cancelled = false;
    setLoading(true); setError('');
    configuracionApi.listarContratos({
      page, limit: PAGE_SIZE, search: search.trim() || undefined,
      activo: estado === 'all' ? undefined : estado === 'active',
      empresa_id: empresaFiltro ? Number(empresaFiltro) : undefined,
      estado_contractual: estadoContractual || undefined,
    }).then((response) => {
      if (cancelled) return;
      setItems(response.items); setPagination(response.pagination);
      if (selectedId && !response.items.some((item) => item.id === selectedId)) setSelectedId(null);
    }).catch((loadError) => {
      if (!cancelled) setError(getErrorMessage(loadError, 'No fue posible cargar los contratos.'));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [canRead, empresaFiltro, estado, estadoContractual, page, search, selectedId]);

  async function handleSelect(id: number) {
    setSelectedId(id); setDetailTab('resumen');
    if (details[id]) return;
    setDetailLoading(true);
    try {
      const detail = await configuracionApi.obtenerContratoDetalle(id);
      setDetails((current) => ({ ...current, [id]: detail }));
    } catch {
      setFeedback({ tone: 'error', text: 'No fue posible cargar el detalle contractual.' });
    } finally {
      setDetailLoading(false);
    }
  }

  async function reloadList(targetId?: number | null) {
    setLoading(true); setError('');
    try {
      const response = await configuracionApi.listarContratos({
        page, limit: PAGE_SIZE, search: search.trim() || undefined,
        activo: estado === 'all' ? undefined : estado === 'active',
        empresa_id: empresaFiltro ? Number(empresaFiltro) : undefined,
        estado_contractual: estadoContractual || undefined,
      });
      setItems(response.items); setPagination(response.pagination);
      if (targetId) {
        setDetails((current) => {
          const next = { ...current };
          delete next[targetId];
          return next;
        });
        await handleSelect(targetId);
      }
    } catch (reloadError) {
      setError(getErrorMessage(reloadError, 'No fue posible actualizar el listado de contratos.'));
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setForm({ ...blankForm(), empresa_id: empresas[0] ? String(empresas[0].id) : '' });
    setFormError(''); setModal({ mode: 'create' });
  }

  function openEdit(contrato: Contrato) {
    setForm(contratoToForm(contrato));
    setFormError(''); setModal({ mode: 'edit', contrato });
  }

  async function handleSave() {
    if (!form.empresa_id) return setFormError('Debes seleccionar una empresa juridica.');
    if (!form.numero_contrato.trim()) return setFormError('El numero de contrato es obligatorio.');
    if (!form.entidad_contratante.trim()) return setFormError('La entidad contratante es obligatoria.');
    if (!form.fecha_inicio) return setFormError('La fecha de inicio es obligatoria.');
    if (form.fecha_final_estimada && form.fecha_final_estimada < form.fecha_inicio) return setFormError('La fecha final estimada no puede ser menor a la fecha de inicio.');
    if (form.fecha_final_real && form.fecha_final_real < form.fecha_inicio) return setFormError('La fecha final real no puede ser menor a la fecha de inicio.');
    setSaving(true); setFormError('');
    try {
      const payload = buildPayload(form);
      const contrato = modal?.mode === 'edit'
        ? await configuracionApi.actualizarContrato(modal.contrato.id, payload as UpdateContratoPayload)
        : await configuracionApi.crearContrato(payload);
      setFeedback({ tone: 'success', text: modal?.mode === 'edit' ? 'Contrato actualizado correctamente.' : 'Contrato creado correctamente.' });
      setModal(null);
      await reloadList(contrato.id);
    } catch (saveError) {
      setFormError(mapKnownError(saveError, 'No fue posible guardar el contrato.', {
        CONTRATO_NUMERO_DUPLICATE: 'Ya existe un contrato con ese numero dentro de la empresa seleccionada.',
        INVALID_DATE_RANGE: 'La fecha final estimada debe ser mayor o igual a la fecha de inicio.',
      }));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(contrato: Contrato) {
    setToggleLoadingId(contrato.id);
    try {
      const updated = await configuracionApi.cambiarEstadoContrato(contrato.id, { activo: !contrato.activo });
      setFeedback({ tone: 'success', text: `Contrato ${updated.activo ? 'activado' : 'desactivado'} correctamente.` });
      await reloadList(selectedId === contrato.id ? contrato.id : null);
    } catch (toggleError) {
      setFeedback({ tone: 'error', text: mapKnownError(toggleError, 'No fue posible cambiar el estado del contrato.', {
        CONTRATO_HAS_ACTIVE_VINCULACIONES: 'No se puede desactivar este contrato porque tiene vinculaciones activas.',
      }) });
    } finally {
      setToggleLoadingId(null);
    }
  }

  if (!canRead) {
    return <div className="adm-notice warning"><AlertTriangle size={14} /> No tienes permisos para consultar contratos.</div>;
  }

  return (
    <div>
      <div className="adm-kpi-row">
        <div className="adm-kpi primary"><div className="adm-kpi-icon"><FileText size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{pagination?.total ?? 0}</span><span className="adm-kpi-lbl">Contratos registrados</span></div></div>
        <div className="adm-kpi success"><div className="adm-kpi-icon"><FileText size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{selectedDetail?.checklist.completitud_porcentaje ?? 0}%</span><span className="adm-kpi-lbl">Completitud del seleccionado</span></div></div>
        <div className="adm-kpi info"><div className="adm-kpi-icon"><AlertTriangle size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{selectedDetail?.alertas.length ?? 0}</span><span className="adm-kpi-lbl">Alertas del seleccionado</span></div></div>
      </div>

      <div className="cg-tab-header">
        <div><h4 className="cg-tab-title"><FileText size={15} /> Contratos</h4><p className="cg-tab-subtitle">Listado contractual con expediente, checklist, eventos y alertas.</p></div>
        {canCreate && <button className="adm-btn primary" onClick={openCreate} type="button"><Plus size={14} /> Nuevo contrato</button>}
      </div>

      {feedback && <div className={`adm-notice ${feedback.tone === 'error' ? 'warning' : 'info'}`} style={{ marginBottom: 12 }}><AlertTriangle size={14} /> {feedback.text}</div>}

      <div className="cg-filters">
        <div className="cg-search"><Search size={14} /><input placeholder="Buscar por numero, objeto o entidad" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></div>
        <select className="adm-select cg-filter-select" value={empresaFiltro} onChange={(event) => { setEmpresaFiltro(event.target.value); setPage(1); }}><option value="">Todas las empresas</option>{empresas.map((empresa) => <option key={empresa.id} value={empresa.id}>{empresa.nombre_empresa}</option>)}</select>
        <select className="adm-select cg-filter-select" value={estadoContractual} onChange={(event) => { setEstadoContractual(event.target.value); setPage(1); }}><option value="">Todos los estados</option>{CONTRACT_STATES.map((state) => <option key={state} value={state}>{state}</option>)}</select>
        <select className="adm-select cg-filter-select" value={estado} onChange={(event) => { setEstado(event.target.value as EstadoFiltro); setPage(1); }}><option value="all">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select>
      </div>

      {error && <div className="adm-notice warning" style={{ marginBottom: 12 }}><AlertTriangle size={14} /> {error}</div>}

      <div className="cg-table-card">
        {loading ? <div className="cg-table-empty">Cargando contratos...</div> : (
          <table className="adm-history">
            <thead><tr><th>Numero</th><th>Empresa</th><th>Entidad</th><th>Fechas</th><th>Estado</th><th>Completitud</th><th>Alertas</th><th>Acciones</th></tr></thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={8} className="cg-table-empty">Sin resultados</td></tr>}
              {items.map((contrato) => {
                const detail = details[contrato.id];
                return <tr key={contrato.id} className={selectedId === contrato.id ? 'cg-row-selected' : ''} onClick={() => void handleSelect(contrato.id)}>
                  <td><div className="cg-primary-cell">{contrato.numero_contrato}</div><div className="cg-secondary-cell">{contrato.numero_licitacion ?? 'Sin licitacion'}</div></td>
                  <td>{contrato.empresa.nombre_empresa ?? 'No disponible'}</td>
                  <td>{contrato.entidad_contratante}</td>
                  <td><div className="cg-primary-cell">Inicio: {formatDate(contrato.fecha_inicio)}</div><div className="cg-secondary-cell">Estimada: {formatDate(contrato.fecha_final_estimada)}</div></td>
                  <td><div className="cg-primary-cell">{contrato.estado_contractual}</div><div className="cg-secondary-cell">{contrato.activo ? 'Registro activo' : 'Registro inactivo'}</div></td>
                  <td>{detail ? `${detail.checklist.completitud_porcentaje}%` : '--'}</td>
                  <td>{detail ? detail.alertas.length : '--'}</td>
                  <td><div className="cg-actions"><button className="adm-btn ghost sm" onClick={(event) => { event.stopPropagation(); void handleSelect(contrato.id); }} type="button"><Eye size={13} /></button>{canUpdate && <button className="adm-btn ghost sm" onClick={(event) => { event.stopPropagation(); openEdit(contrato); }} type="button"><Edit2 size={13} /></button>}{canUpdate && <button className={`adm-btn sm ${contrato.activo ? 'danger-outline' : 'secondary'}`} onClick={(event) => { event.stopPropagation(); void handleToggle(contrato); }} disabled={toggleLoadingId === contrato.id} type="button"><Power size={12} /></button>}</div></td>
                </tr>;
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="cg-pagination">
        <div className="cg-pagination-summary">{!pagination || pagination.total === 0 ? 'Sin resultados' : `${(pagination.page - 1) * pagination.limit + 1} - ${Math.min(pagination.page * pagination.limit, pagination.total)} de ${pagination.total}`}</div>
        <div className="cg-pagination-actions"><button className="adm-btn secondary sm" disabled={!pagination || pagination.page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))} type="button">Anterior</button><button className="adm-btn secondary sm" disabled={!pagination || pagination.page >= pagination.total_pages || loading} onClick={() => setPage((current) => current + 1)} type="button">Siguiente</button></div>
      </div>

      <div className="adm-card">
        <h4 className="adm-card-title"><FileText size={15} /> Detalle contractual</h4>
        <ContratosDetailPanel
          contratoId={selectedId}
          detail={selectedDetail}
          detailLoading={detailLoading}
          detailTab={detailTab}
          onDetailTabChange={setDetailTab}
          onFeedback={setFeedback}
          onRefresh={async () => {
            if (selectedId) {
              setDetails((current) => {
                const next = { ...current };
                delete next[selectedId];
                return next;
              });
              await handleSelect(selectedId);
              await reloadList(selectedId);
            }
          }}
          permissions={permissions}
          tiposDocumento={tiposDocumento}
        />
      </div>

      {modal && <FormModal title={modal.mode === 'create' ? 'Nuevo contrato' : `Editar: ${modal.contrato.numero_contrato}`} onClose={() => setModal(null)} onSave={handleSave} saving={saving} wide>
        <div className="adm-form-grid">
          <div className="adm-field"><label className="adm-label">Empresa juridica *</label><select className="adm-select" value={form.empresa_id} onChange={(event) => setForm((current) => ({ ...current, empresa_id: event.target.value }))}><option value="">Seleccionar</option>{empresas.map((empresa) => <option key={empresa.id} value={empresa.id}>{empresa.nombre_empresa}</option>)}</select></div>
          <div className="adm-field"><label className="adm-label">Numero de contrato *</label><input className="adm-input" value={form.numero_contrato} onChange={(event) => setForm((current) => ({ ...current, numero_contrato: event.target.value }))} /></div>
          <div className="adm-field"><label className="adm-label">Numero de licitacion</label><input className="adm-input" value={form.numero_licitacion} onChange={(event) => setForm((current) => ({ ...current, numero_licitacion: event.target.value }))} /></div>
          <div className="adm-field"><label className="adm-label">Entidad contratante *</label><input className="adm-input" value={form.entidad_contratante} onChange={(event) => setForm((current) => ({ ...current, entidad_contratante: event.target.value }))} /></div>
          <div className="adm-field"><label className="adm-label">Fecha inicio *</label><input className="adm-input" type="date" value={form.fecha_inicio} onChange={(event) => setForm((current) => ({ ...current, fecha_inicio: event.target.value }))} /></div>
          <div className="adm-field"><label className="adm-label">Fecha final estimada</label><input className="adm-input" type="date" value={form.fecha_final_estimada} onChange={(event) => setForm((current) => ({ ...current, fecha_final_estimada: event.target.value }))} /></div>
          <div className="adm-field"><label className="adm-label">Fecha final real</label><input className="adm-input" type="date" value={form.fecha_final_real} onChange={(event) => setForm((current) => ({ ...current, fecha_final_real: event.target.value }))} /></div>
          <div className="adm-field"><label className="adm-label">Estado contractual</label><select className="adm-select" value={form.estado_contractual} onChange={(event) => setForm((current) => ({ ...current, estado_contractual: event.target.value }))}>{CONTRACT_STATES.map((state) => <option key={state} value={state}>{state}</option>)}</select></div>
          <div className="adm-field"><label className="adm-label">Contrato padre</label><select className="adm-select" value={form.contrato_padre_id} onChange={(event) => setForm((current) => ({ ...current, contrato_padre_id: event.target.value }))}><option value="">Sin contrato padre</option>{items.filter((item) => item.id !== (modal.mode === 'edit' ? modal.contrato.id : null)).map((contrato) => <option key={contrato.id} value={contrato.id}>{contrato.numero_contrato}</option>)}</select></div>
          <div className="adm-field full-width"><label className="adm-label">Objeto contractual</label><textarea className="adm-textarea" value={form.objeto_contractual} onChange={(event) => setForm((current) => ({ ...current, objeto_contractual: event.target.value }))} rows={3} /></div>
          <div className="adm-field full-width"><label className="adm-label">Observaciones</label><textarea className="adm-textarea" value={form.observaciones} onChange={(event) => setForm((current) => ({ ...current, observaciones: event.target.value }))} rows={3} /></div>
        </div>
        <label className="cg-checkbox-row" style={{ marginTop: 12 }}><input type="checkbox" checked={form.aplica_cobertura} onChange={(event) => setForm((current) => ({ ...current, aplica_cobertura: event.target.checked }))} /><span>Aplica cobertura</span></label>
        {formError && <div className="adm-notice warning" style={{ marginTop: 8 }}><AlertTriangle size={13} /> {formError}</div>}
      </FormModal>}
    </div>
  );
}
