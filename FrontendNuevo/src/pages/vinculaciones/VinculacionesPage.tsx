import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  Shield,
  UserCheck,
  UserMinus,
  UserX,
  X,
} from 'lucide-react';
import type { VinculacionApi, VinculacionEstado, VinculacionExpedienteApi } from '../../types/personas.types';
import type { VinculacionFilters, VinculacionListResponse } from '../../types/vinculaciones.types';
import {
  getVinculaciones,
  getVinculacionExpediente,
  retirarVinculacion,
  suspenderVinculacion,
  reactivarVinculacion,
} from '../../services/vinculacionesApi';
import './vinculaciones.css';

const LIMIT = 20;

type ActionType = 'retirar' | 'suspender' | 'reactivar';

interface EstadoConfig { label: string; cls: string; }
const ESTADO_CFG: Record<VinculacionEstado, EstadoConfig> = {
  ACTIVA:     { label: 'Activa',     cls: 'vinc-badge activa' },
  RETIRADA:   { label: 'Retirada',   cls: 'vinc-badge retirada' },
  SUSPENDIDA: { label: 'Suspendida', cls: 'vinc-badge suspendida' },
};

const METODO_LABEL: Record<string, string> = {
  ASISTENCIA:       'Asistencia',
  CATEGORIA:        'Categoría',
  OPS_CUENTA_COBRO: 'OPS Cta. Cobro',
  OPS_VALOR_FIJO:   'OPS Valor Fijo',
  OPS_POR_PRODUCTO: 'OPS x Producto',
};

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d ?? '?'}/${m ?? '?'}/${y ?? '?'}`;
}

function buildNombre(p: VinculacionExpedienteApi['persona']): string {
  return [p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido]
    .filter(Boolean)
    .join(' ');
}

interface KpiState {
  total: number;
  activas: number;
  retiradas: number;
  suspendidas: number;
}

export default function VinculacionesPage() {
  // ── List ──────────────────────────────────────────────────────────────────────
  const [list, setList]       = useState<VinculacionListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  // ── Filters ───────────────────────────────────────────────────────────────────
  const [fEstado, setFEstado]           = useState<VinculacionEstado | ''>('');
  const [fDesde, setFDesde]             = useState('');
  const [fHasta, setFHasta]             = useState('');
  const [pIdInput, setPIdInput]         = useState('');
  const [pIdDebounced, setPIdDebounced] = useState('');
  const [page, setPage]                 = useState(1);

  // ── KPIs ──────────────────────────────────────────────────────────────────────
  const [kpis, setKpis]           = useState<KpiState>({ total: 0, activas: 0, retiradas: 0, suspendidas: 0 });
  const [kpisLoading, setKpisLoading] = useState(true);

  // ── Detail panel ──────────────────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expediente, setExpediente] = useState<VinculacionExpedienteApi | null>(null);
  const [expLoading, setExpLoading] = useState(false);
  const [expError, setExpError]     = useState<string | null>(null);

  // ── Action form ───────────────────────────────────────────────────────────────
  const [actionType, setActionType]     = useState<ActionType | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError]   = useState<string | null>(null);
  const [actionFecha, setActionFecha]   = useState('');
  const [actionMotivo, setActionMotivo] = useState('');

  // ── Debounce persona ID ────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => { setPIdDebounced(pIdInput); setPage(1); }, 500);
    return () => clearTimeout(t);
  }, [pIdInput]);

  // ── Load KPIs ─────────────────────────────────────────────────────────────────
  const loadKpis = useCallback(async () => {
    setKpisLoading(true);
    try {
      const [all, act, ret, sus] = await Promise.all([
        getVinculaciones({ limit: 1, page: 1 }),
        getVinculaciones({ limit: 1, page: 1, estado_vinculacion: 'ACTIVA' }),
        getVinculaciones({ limit: 1, page: 1, estado_vinculacion: 'RETIRADA' }),
        getVinculaciones({ limit: 1, page: 1, estado_vinculacion: 'SUSPENDIDA' }),
      ]);
      setKpis({
        total:       all.pagination.total,
        activas:     act.pagination.total,
        retiradas:   ret.pagination.total,
        suspendidas: sus.pagination.total,
      });
    } catch {
      // non-critical
    } finally {
      setKpisLoading(false);
    }
  }, []);

  useEffect(() => { void loadKpis(); }, [loadKpis]);

  // ── Load list ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      const filters: VinculacionFilters = {
        page,
        limit: LIMIT,
        ...(fEstado      && { estado_vinculacion: fEstado }),
        ...(fDesde       && { fecha_inicio_desde: fDesde }),
        ...(fHasta       && { fecha_inicio_hasta: fHasta }),
        ...(pIdDebounced && { persona_id: Number(pIdDebounced) }),
      };
      try {
        const data = await getVinculaciones(filters);
        if (!cancelled) setList(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error al cargar vinculaciones');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [fEstado, fDesde, fHasta, pIdDebounced, page]);

  // ── Load expediente ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (selectedId === null) { setExpediente(null); return; }
    let cancelled = false;
    const load = async () => {
      setExpLoading(true);
      setExpError(null);
      try {
        const data = await getVinculacionExpediente(selectedId);
        if (!cancelled) setExpediente(data);
      } catch (e) {
        if (!cancelled) setExpError(e instanceof Error ? e.message : 'Error al cargar detalle');
      } finally {
        if (!cancelled) setExpLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [selectedId]);

  // ── Handlers ──────────────────────────────────────────────────────────────────
  function openPanel(id: number) {
    if (selectedId === id) return;
    setSelectedId(id);
    setExpediente(null);
    setActionType(null);
    setActionError(null);
  }

  function closePanel() {
    setSelectedId(null);
    setExpediente(null);
    setActionType(null);
  }

  function startAction(type: ActionType) {
    setActionType(type);
    setActionError(null);
    setActionFecha('');
    setActionMotivo('');
  }

  async function submitAction() {
    if (!selectedId || !actionType) return;
    if ((actionType === 'retirar' || actionType === 'suspender') && !actionFecha) {
      setActionError(
        actionType === 'retirar'
          ? 'La fecha de retiro es requerida'
          : 'La fecha de suspensión es requerida'
      );
      return;
    }
    setActionLoading(true);
    setActionError(null);
    try {
      let updated: VinculacionApi;
      if (actionType === 'retirar') {
        updated = await retirarVinculacion(selectedId, {
          fecha_retiro: actionFecha,
          motivo_retiro: actionMotivo || null,
        });
      } else if (actionType === 'suspender') {
        updated = await suspenderVinculacion(selectedId, {
          fecha_suspension: actionFecha,
          motivo_suspension: actionMotivo || null,
        });
      } else {
        updated = await reactivarVinculacion(selectedId, {
          fecha_reactivacion: actionFecha || undefined,
        });
      }
      setList(prev =>
        prev ? { ...prev, items: prev.items.map(v => (v.id === selectedId ? updated : v)) } : null
      );
      setExpediente(prev => (prev ? { ...prev, vinculacion: updated } : null));
      setActionType(null);
      void loadKpis();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Error al ejecutar la acción');
    } finally {
      setActionLoading(false);
    }
  }

  function resetFilters() {
    setFEstado('');
    setFDesde('');
    setFHasta('');
    setPIdInput('');
    setPIdDebounced('');
    setPage(1);
  }

  const hasFilters  = !!(fEstado || fDesde || fHasta || pIdInput);
  const pagination  = list?.pagination;
  const currentVinc = expediente?.vinculacion;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="vinc-page">

      {/* Header */}
      <div className="vinc-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Briefcase size={20} style={{ color: 'var(--color-primary)' }} />
            <h1 className="vinc-title">Vinculaciones</h1>
            {pagination && (
              <span className="vinc-badge-count">{pagination.total.toLocaleString()}</span>
            )}
          </div>
          <p className="vinc-subtitle">Gestión de vinculaciones laborales · backend real</p>
        </div>
        <button
          className="vinc-btn ghost"
          onClick={() => { void loadKpis(); }}
          title="Actualizar contadores"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* KPI Cards */}
      <div className="vinc-kpis">
        {([
          { label: 'Total',      value: kpis.total,       color: 'var(--color-primary)', bg: 'rgba(99,102,241,.07)' },
          { label: 'Activas',    value: kpis.activas,     color: '#16a34a',              bg: 'rgba(34,197,94,.07)' },
          { label: 'Retiradas',  value: kpis.retiradas,   color: 'var(--color-danger)',  bg: 'rgba(239,68,68,.07)' },
          { label: 'Suspendidas',value: kpis.suspendidas, color: '#d97706',              bg: 'rgba(245,158,11,.07)' },
        ] as const).map(({ label, value, color, bg }) => (
          <div key={label} className="vinc-kpi-card" style={{ background: bg }}>
            {kpisLoading ? (
              <Loader2 size={18} className="vinc-spin" style={{ color, marginBottom: 6 }} />
            ) : (
              <div className="vinc-kpi-value" style={{ color }}>{value.toLocaleString()}</div>
            )}
            <div className="vinc-kpi-label">{label}</div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="vinc-filters">
        <select
          className="vinc-filter-select"
          value={fEstado}
          onChange={e => { setFEstado(e.target.value as VinculacionEstado | ''); setPage(1); }}
        >
          <option value="">Todos los estados</option>
          <option value="ACTIVA">Activa</option>
          <option value="RETIRADA">Retirada</option>
          <option value="SUSPENDIDA">Suspendida</option>
        </select>

        <input
          className="vinc-filter-input"
          type="date"
          value={fDesde}
          title="Fecha inicio desde"
          onChange={e => { setFDesde(e.target.value); setPage(1); }}
        />
        <input
          className="vinc-filter-input"
          type="date"
          value={fHasta}
          title="Fecha inicio hasta"
          onChange={e => { setFHasta(e.target.value); setPage(1); }}
        />
        <input
          className="vinc-filter-input"
          type="number"
          min={1}
          placeholder="Persona ID"
          value={pIdInput}
          style={{ width: 110 }}
          onChange={e => setPIdInput(e.target.value)}
        />
        {hasFilters && (
          <button className="vinc-btn ghost" onClick={resetFilters}>
            <X size={12} /> Limpiar
          </button>
        )}
      </div>

      {/* Table */}
      <div className="vinc-table-wrap">
        {loading && (
          <div className="vinc-state-center">
            <Loader2 size={22} className="vinc-spin" />
            <span>Cargando vinculaciones…</span>
          </div>
        )}
        {!loading && error && (
          <div className="vinc-state-center vinc-error">
            <AlertCircle size={22} />
            <span>{error}</span>
            <button className="vinc-btn ghost" onClick={() => setPage(p => p)}>Reintentar</button>
          </div>
        )}
        {!loading && !error && list && list.items.length === 0 && (
          <div className="vinc-state-center">
            <Shield size={40} style={{ color: 'var(--text-muted)', opacity: .4 }} />
            <span>No se encontraron vinculaciones</span>
            {hasFilters && (
              <button className="vinc-btn ghost" onClick={resetFilters}>Limpiar filtros</button>
            )}
          </div>
        )}
        {!loading && !error && list && list.items.length > 0 && (
          <table className="vinc-table">
            <thead>
              <tr>
                <th>Estado</th>
                <th>#</th>
                <th>Persona</th>
                <th>Empresa</th>
                <th>Contrato</th>
                <th>Cargo</th>
                <th>Tipo</th>
                <th>Inicio</th>
                <th>Fin</th>
                <th>Método</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.items.map(v => {
                const ec = ESTADO_CFG[v.estado_vinculacion];
                return (
                  <tr
                    key={v.id}
                    className={selectedId === v.id ? 'selected' : ''}
                    onClick={() => openPanel(v.id)}
                  >
                    <td><span className={ec.cls}>{ec.label}</span></td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>
                      #{v.id}
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>P-{v.persona_id}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>E-{v.empresa_id}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>C-{v.contrato_id}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Cg-{v.contrato_cargo_id}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>T-{v.tipo_vinculacion_id}</td>
                    <td style={{ fontSize: 12 }}>{fmtDate(v.fecha_inicio)}</td>
                    <td style={{ fontSize: 12, color: v.fecha_fin ? 'var(--text-secondary)' : '#16a34a' }}>
                      {v.fecha_fin ? fmtDate(v.fecha_fin) : 'Vigente'}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {v.metodo_pago ? (METODO_LABEL[v.metodo_pago] ?? v.metodo_pago) : '—'}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <button className="vinc-btn-row" onClick={() => openPanel(v.id)}>
                        Ver
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.total_pages > 1 && (
        <div className="vinc-pagination">
          <span className="vinc-pag-info">
            Página {pagination.page} de {pagination.total_pages}
            {' '}·{' '}
            {pagination.total.toLocaleString()} vinculaciones
          </span>
          <div className="vinc-pag-controls">
            <button
              className="vinc-btn ghost"
              disabled={pagination.page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              <ChevronLeft size={14} />
            </button>
            <button
              className="vinc-btn ghost"
              disabled={pagination.page >= pagination.total_pages}
              onClick={() => setPage(p => p + 1)}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Detail Panel */}
      {selectedId !== null && (
        <div
          className="vinc-panel-overlay"
          onClick={e => { if (e.target === e.currentTarget) closePanel(); }}
        >
          <div className="vinc-panel">

            {/* Panel header */}
            <div className="vinc-panel-header">
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                  Vinculación #{selectedId}
                </div>
                {expediente && (
                  <div className="vinc-panel-persona">{buildNombre(expediente.persona)}</div>
                )}
                {expLoading && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Cargando…</div>
                )}
              </div>
              <button className="vinc-btn ghost" onClick={closePanel} style={{ padding: '6px' }}>
                <X size={16} />
              </button>
            </div>

            {/* Panel body */}
            <div className="vinc-panel-body">

              {expLoading && !expediente && (
                <div className="vinc-state-center" style={{ padding: '40px 0' }}>
                  <Loader2 size={20} className="vinc-spin" />
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Cargando expediente…</span>
                </div>
              )}

              {expError && !expLoading && (
                <div className="vinc-state-center vinc-error" style={{ padding: '32px 0' }}>
                  <AlertCircle size={18} />
                  <span style={{ fontSize: 13 }}>{expError}</span>
                </div>
              )}

              {expediente && currentVinc && (
                <>
                  {/* Estado */}
                  <div className="vinc-panel-section">
                    <div className="vinc-panel-field-row">
                      <span className="vinc-panel-field-label">Estado</span>
                      <span className={ESTADO_CFG[currentVinc.estado_vinculacion].cls}>
                        {ESTADO_CFG[currentVinc.estado_vinculacion].label}
                      </span>
                    </div>
                    {currentVinc.motivo_retiro && (
                      <div className="vinc-panel-field-row">
                        <span className="vinc-panel-field-label">Motivo</span>
                        <span className="vinc-panel-field-val" style={{ color: 'var(--color-danger)', fontSize: 12 }}>
                          {currentVinc.motivo_retiro}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Persona */}
                  <div className="vinc-panel-section">
                    <div className="vinc-panel-section-title">Persona</div>
                    <div className="vinc-panel-field-row">
                      <span className="vinc-panel-field-label">Nombre</span>
                      <span className="vinc-panel-field-val">{buildNombre(expediente.persona)}</span>
                    </div>
                    <div className="vinc-panel-field-row">
                      <span className="vinc-panel-field-label">Documento</span>
                      <span className="vinc-panel-field-val" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                        {expediente.persona.numero_documento}
                      </span>
                    </div>
                    {expediente.persona.correo && (
                      <div className="vinc-panel-field-row">
                        <span className="vinc-panel-field-label">Correo</span>
                        <span className="vinc-panel-field-val" style={{ fontSize: 12 }}>{expediente.persona.correo}</span>
                      </div>
                    )}
                    {expediente.persona.telefono && (
                      <div className="vinc-panel-field-row">
                        <span className="vinc-panel-field-label">Teléfono</span>
                        <span className="vinc-panel-field-val" style={{ fontSize: 12 }}>{expediente.persona.telefono}</span>
                      </div>
                    )}
                  </div>

                  {/* Empresa / Contrato */}
                  <div className="vinc-panel-section">
                    <div className="vinc-panel-section-title">Empresa · Contrato</div>
                    <div className="vinc-panel-field-row">
                      <span className="vinc-panel-field-label">Empresa</span>
                      <span className="vinc-panel-field-val">
                        {expediente.empresa.nombre_empresa ?? `#${expediente.empresa.id}`}
                      </span>
                    </div>
                    <div className="vinc-panel-field-row">
                      <span className="vinc-panel-field-label">Contrato</span>
                      <span className="vinc-panel-field-val" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                        {expediente.contrato.numero_contrato ?? `#${expediente.contrato.id}`}
                      </span>
                    </div>
                    {expediente.contrato.entidad_contratante && (
                      <div className="vinc-panel-field-row">
                        <span className="vinc-panel-field-label">Entidad</span>
                        <span className="vinc-panel-field-val" style={{ fontSize: 12 }}>
                          {expediente.contrato.entidad_contratante}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Cargo / Tipo */}
                  <div className="vinc-panel-section">
                    <div className="vinc-panel-section-title">Cargo · Tipo</div>
                    <div className="vinc-panel-field-row">
                      <span className="vinc-panel-field-label">Cargo</span>
                      <span className="vinc-panel-field-val">
                        {expediente.cargo.nombre_cargo ?? `#${expediente.cargo.id}`}
                      </span>
                    </div>
                    <div className="vinc-panel-field-row">
                      <span className="vinc-panel-field-label">Tipo vinculación</span>
                      <span className="vinc-panel-field-val">
                        {expediente.tipo_vinculacion.nombre_vinculacion
                          ?? expediente.tipo_vinculacion.codigo
                          ?? `#${expediente.tipo_vinculacion.id}`}
                      </span>
                    </div>
                  </div>

                  {/* Vigencia */}
                  <div className="vinc-panel-section">
                    <div className="vinc-panel-section-title">Vigencia</div>
                    <div className="vinc-panel-field-row">
                      <span className="vinc-panel-field-label">Fecha inicio</span>
                      <span className="vinc-panel-field-val">{fmtDate(currentVinc.fecha_inicio)}</span>
                    </div>
                    <div className="vinc-panel-field-row">
                      <span className="vinc-panel-field-label">Fecha fin</span>
                      <span
                        className="vinc-panel-field-val"
                        style={{ color: currentVinc.fecha_fin ? undefined : '#16a34a' }}
                      >
                        {currentVinc.fecha_fin ? fmtDate(currentVinc.fecha_fin) : 'Sin fecha fin'}
                      </span>
                    </div>
                    {currentVinc.metodo_pago && (
                      <div className="vinc-panel-field-row">
                        <span className="vinc-panel-field-label">Método de pago</span>
                        <span className="vinc-panel-field-val">
                          {METODO_LABEL[currentVinc.metodo_pago] ?? currentVinc.metodo_pago}
                        </span>
                      </div>
                    )}
                    <div className="vinc-panel-field-row">
                      <span className="vinc-panel-field-label">Cuenta experiencia</span>
                      <span className="vinc-panel-field-val">
                        {currentVinc.cuenta_como_experiencia ? 'Sí' : 'No'}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  {actionType === null && (
                    <div className="vinc-panel-section">
                      <div className="vinc-panel-section-title">Acciones</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {currentVinc.estado_vinculacion !== 'RETIRADA' && (
                          <button className="vinc-btn danger" onClick={() => startAction('retirar')}>
                            <UserMinus size={13} /> Retirar
                          </button>
                        )}
                        {currentVinc.estado_vinculacion === 'ACTIVA' && (
                          <button className="vinc-btn warning" onClick={() => startAction('suspender')}>
                            <UserX size={13} /> Suspender
                          </button>
                        )}
                        {currentVinc.estado_vinculacion === 'SUSPENDIDA' && (
                          <button className="vinc-btn success" onClick={() => startAction('reactivar')}>
                            <UserCheck size={13} /> Reactivar
                          </button>
                        )}
                        {currentVinc.estado_vinculacion === 'RETIRADA' && (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            Sin acciones disponibles
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Action form */}
                  {actionType !== null && (
                    <div className="vinc-action-form">
                      <div className="vinc-action-form-title">
                        {actionType === 'retirar'    && 'Registrar retiro'}
                        {actionType === 'suspender'  && 'Suspender vinculación'}
                        {actionType === 'reactivar'  && 'Reactivar vinculación'}
                      </div>

                      {(actionType === 'retirar' || actionType === 'suspender') && (
                        <>
                          <label className="vinc-action-label">
                            {actionType === 'retirar' ? 'Fecha de retiro *' : 'Fecha de suspensión *'}
                          </label>
                          <input
                            type="date"
                            className="vinc-action-input"
                            value={actionFecha}
                            onChange={e => setActionFecha(e.target.value)}
                          />
                          <label className="vinc-action-label">
                            {actionType === 'retirar' ? 'Motivo de retiro' : 'Motivo de suspensión'}
                          </label>
                          <input
                            type="text"
                            className="vinc-action-input"
                            placeholder="Opcional"
                            value={actionMotivo}
                            onChange={e => setActionMotivo(e.target.value)}
                          />
                        </>
                      )}

                      {actionType === 'reactivar' && (
                        <>
                          <label className="vinc-action-label">Fecha de reactivación (opcional)</label>
                          <input
                            type="date"
                            className="vinc-action-input"
                            value={actionFecha}
                            onChange={e => setActionFecha(e.target.value)}
                          />
                        </>
                      )}

                      {actionError && (
                        <div className="vinc-action-error">{actionError}</div>
                      )}

                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="vinc-btn primary"
                          disabled={actionLoading}
                          onClick={() => { void submitAction(); }}
                        >
                          {actionLoading && <Loader2 size={12} className="vinc-spin" />}
                          Confirmar
                        </button>
                        <button
                          className="vinc-btn ghost"
                          onClick={() => { setActionType(null); setActionError(null); }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
