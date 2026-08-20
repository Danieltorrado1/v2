import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Pencil, Plus, Power, RefreshCcw, ShieldAlert, XCircle } from 'lucide-react';

import { configuracionApi } from '../../../../services/configuracionApi';
import type {
  AmbitoDocumental,
  CatalogoItem,
  ContratoCargo,
  ContratoRequisitoDocumental,
} from '../../../../types/configuracion.types';
import { FormModal } from '../components/FormModal';
import { hasAnyPermission, mapKnownError, type AdminFeedback } from './adminTabUtils';

type RequirementForm = {
  activo: boolean;
  ambito_documental: AmbitoDocumental;
  contrato_cargo_id: string;
  dias_proximo_vencimiento: string;
  obligatorio: boolean;
  requiere_fecha_expedicion: boolean;
  requiere_fecha_vencimiento: boolean;
  tipo_documento_id: string;
  tipo_vinculacion_id: string;
  vigencia_meses: string;
};

type Props = {
  contratoId: number;
  onFeedback: (feedback: AdminFeedback) => void;
  permissions: string[];
  tiposDocumentoBase?: CatalogoItem[];
};

const EMPTY_FORM: RequirementForm = {
  activo: true,
  ambito_documental: 'PERSONA',
  contrato_cargo_id: '',
  dias_proximo_vencimiento: '30',
  obligatorio: true,
  requiere_fecha_expedicion: false,
  requiere_fecha_vencimiento: false,
  tipo_documento_id: '',
  tipo_vinculacion_id: '',
  vigencia_meses: '',
};

const SCOPE_LABEL: Record<AmbitoDocumental, string> = {
  PERSONA: 'Persona',
  VINCULACION: 'Vinculacion',
};

const getCatalogLabel = (item: { codigo?: string | null; label?: string; nombre?: string | null }) => {
  const name = item.label ?? item.nombre ?? 'Sin nombre';
  return item.codigo ? `${item.codigo} · ${name}` : name;
};

function normalizeForm(item?: ContratoRequisitoDocumental | null): RequirementForm {
  if (!item) {
    return EMPTY_FORM;
  }

  return {
    activo: item.activo,
    ambito_documental: item.ambito_documental,
    contrato_cargo_id: item.cargo.id ? String(item.cargo.id) : '',
    dias_proximo_vencimiento: String(item.dias_proximo_vencimiento ?? 30),
    obligatorio: item.obligatorio,
    requiere_fecha_expedicion: item.requiere_fecha_expedicion,
    requiere_fecha_vencimiento: item.requiere_fecha_vencimiento,
    tipo_documento_id: String(item.tipo_documento.id),
    tipo_vinculacion_id: item.tipo_vinculacion.id ? String(item.tipo_vinculacion.id) : '',
    vigencia_meses: item.vigencia_meses === null ? '' : String(item.vigencia_meses),
  };
}

export function ContratoRequisitosDocumentalesPanel({
  contratoId,
  onFeedback,
  permissions,
  tiposDocumentoBase = [],
}: Props) {
  const canManage = hasAnyPermission(permissions, ['configuracion.update', 'contratos.update', 'contracts.update']);
  const canRead = hasAnyPermission(permissions, ['configuracion.read', 'contratos.read', 'contracts.read']);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<ContratoRequisitoDocumental[]>([]);
  const [tiposDocumento, setTiposDocumento] = useState<CatalogoItem[]>(tiposDocumentoBase);
  const [cargos, setCargos] = useState<ContratoCargo[]>([]);
  const [tiposVinculacion, setTiposVinculacion] = useState<CatalogoItem[]>([]);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ContratoRequisitoDocumental | null>(null);
  const [form, setForm] = useState<RequirementForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');

  const filteredTiposDocumento = useMemo(() => {
    if (!form.ambito_documental) {
      return tiposDocumento;
    }

    return tiposDocumento.filter((item) => {
      if (!item.alcance) {
        return true;
      }

      const alcance = item.alcance.toUpperCase();
      return alcance === 'GENERAL' || alcance === form.ambito_documental;
    });
  }, [form.ambito_documental, tiposDocumento]);

  const loadData = async () => {
    setLoading(true);
    setError('');

    try {
      const [requirements, cargosResponse, tiposVinculacionResponse, tiposDocumentoResponse] = await Promise.all([
        configuracionApi.listarContratoRequisitosDocumentales(contratoId),
        configuracionApi.listarCargos({ contrato_id: contratoId, activo: true, page: 1, limit: 200 }),
        configuracionApi.listarTiposVinculacion({ activo: true, page: 1, limit: 200 }),
        tiposDocumentoBase.length > 0
          ? Promise.resolve({ items: tiposDocumentoBase })
          : configuracionApi.listarTiposDocumento({ activo: true, page: 1, limit: 500 }),
      ]);

      setItems(requirements);
      setCargos(cargosResponse.items);
      setTiposVinculacion(tiposVinculacionResponse.items);
      setTiposDocumento(tiposDocumentoResponse.items);
    } catch (requestError) {
      setError(mapKnownError(requestError, 'No fue posible cargar los requisitos documentales.', {}));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canRead) {
      return;
    }

    void loadData();
  }, [canRead, contratoId]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (item: ContratoRequisitoDocumental) => {
    setEditing(item);
    setForm(normalizeForm(item));
    setFormError('');
    setFormOpen(true);
  };

  const submit = async () => {
    if (!form.tipo_documento_id) {
      setFormError('Selecciona un tipo documental.');
      return;
    }

    setSubmitting(true);
    setFormError('');

    try {
      const payload = {
        activo: form.activo,
        ambito_documental: form.ambito_documental,
        contrato_cargo_id: form.contrato_cargo_id ? Number(form.contrato_cargo_id) : null,
        tipo_vinculacion_id: form.tipo_vinculacion_id ? Number(form.tipo_vinculacion_id) : null,
        tipo_documento_id: Number(form.tipo_documento_id),
        obligatorio: form.obligatorio,
        requiere_fecha_expedicion: form.requiere_fecha_expedicion,
        requiere_fecha_vencimiento: form.requiere_fecha_vencimiento,
        vigencia_meses: form.vigencia_meses ? Number(form.vigencia_meses) : null,
        dias_proximo_vencimiento: Number(form.dias_proximo_vencimiento || 30),
      };

      if (editing) {
        await configuracionApi.actualizarContratoRequisitoDocumental(contratoId, editing.id, payload);
        onFeedback({ tone: 'success', text: 'Requisito documental actualizado.' });
      } else {
        await configuracionApi.crearContratoRequisitoDocumental(contratoId, payload);
        onFeedback({ tone: 'success', text: 'Requisito documental creado.' });
      }

      setFormOpen(false);
      await loadData();
    } catch (requestError) {
      setFormError(
        mapKnownError(requestError, 'No fue posible guardar el requisito documental.', {
          CONTRATO_REQUISITO_DOCUMENTAL_DUPLICATE:
            'Ya existe un requisito activo con el mismo tipo documental, ambito y contexto.',
        })
      );
    } finally {
      setSubmitting(false);
    }
  };

  const toggleEstado = async (item: ContratoRequisitoDocumental) => {
    setSubmitting(true);

    try {
      await configuracionApi.cambiarEstadoContratoRequisitoDocumental(
        contratoId,
        item.id,
        !item.activo
      );
      onFeedback({
        tone: 'success',
        text: item.activo ? 'Requisito documental inactivado.' : 'Requisito documental reactivado.',
      });
      await loadData();
    } catch (requestError) {
      onFeedback({
        tone: 'error',
        text: mapKnownError(requestError, 'No fue posible cambiar el estado del requisito.', {}),
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!canRead) {
    return <div className="adm-empty"><p>No tienes permisos para consultar requisitos documentales.</p></div>;
  }

  return (
    <div className="cg-table-card">
      <div className="cg-tab-header" style={{ padding: '14px 16px 0' }}>
        <div>
          <h4 className="cg-tab-title">
            <ShieldAlert size={14} /> Requisitos documentales
          </h4>
          <p className="cg-tab-subtitle">
            Configuracion contextual por contrato, cargo, tipo de vinculacion y ambito documental.
          </p>
        </div>
        <div className="cg-actions" style={{ flexWrap: 'wrap' }}>
          <button className="adm-btn secondary sm" type="button" onClick={() => void loadData()} disabled={loading}>
            <RefreshCcw size={13} /> Recargar
          </button>
          {canManage && (
            <button className="adm-btn primary sm" type="button" onClick={openCreate}>
              <Plus size={13} /> Agregar requisito
            </button>
          )}
        </div>
      </div>

      {error ? (
        <div className="adm-notice warning" style={{ margin: 16 }}>
          <XCircle size={13} /> {error}
        </div>
      ) : loading && items.length === 0 ? (
        <div className="cg-table-empty">Cargando requisitos documentales...</div>
      ) : items.length === 0 ? (
        <div className="cg-table-empty">
          No hay requisitos documentales configurados para este contrato.
        </div>
      ) : (
        <table className="adm-history">
          <thead>
            <tr>
              <th>Documento</th>
              <th>Ambito</th>
              <th>Contexto</th>
              <th>Fechas</th>
              <th>Estado</th>
              {canManage && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <div className="cg-primary-cell">{item.tipo_documento.nombre ?? item.nombre_requisito}</div>
                  <div className="cg-secondary-cell">{item.tipo_documento.codigo ?? item.nombre_requisito}</div>
                </td>
                <td>
                  <div className="cg-primary-cell">{SCOPE_LABEL[item.ambito_documental]}</div>
                  <div className="cg-secondary-cell">{item.obligatorio ? 'Obligatorio' : 'Opcional'}</div>
                </td>
                <td>
                  <div className="cg-primary-cell">{item.cargo.nombre ?? 'Todos los cargos'}</div>
                  <div className="cg-secondary-cell">
                    {item.tipo_vinculacion.nombre ?? 'Todos los tipos de vinculacion'}
                  </div>
                </td>
                <td>
                  <div className="cg-primary-cell">
                    Expedicion: {item.requiere_fecha_expedicion ? 'Si' : 'No'}
                  </div>
                  <div className="cg-secondary-cell">
                    Vencimiento: {item.requiere_fecha_vencimiento ? 'Si' : 'No'}
                    {item.vigencia_meses ? ` · ${item.vigencia_meses} meses` : ''}
                    {` · alerta ${item.dias_proximo_vencimiento} dias`}
                  </div>
                </td>
                <td>
                  <span className={`adm-badge ${item.activo ? 'active' : 'inactive'}`}>
                    {item.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                {canManage && (
                  <td>
                    <div className="cg-actions" style={{ flexWrap: 'wrap' }}>
                      <button className="adm-btn ghost sm" type="button" onClick={() => openEdit(item)}>
                        <Pencil size={13} /> Editar
                      </button>
                      <button
                        className="adm-btn ghost sm"
                        type="button"
                        onClick={() => void toggleEstado(item)}
                        disabled={submitting}
                      >
                        <Power size={13} /> {item.activo ? 'Inactivar' : 'Activar'}
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {formOpen && (
        <FormModal
          title={editing ? 'Editar requisito documental' : 'Agregar requisito documental'}
          onClose={() => setFormOpen(false)}
          onSave={() => void submit()}
          saving={submitting}
          saveLabel={editing ? 'Guardar cambios' : 'Crear requisito'}
          wide
        >
          <div className="adm-form-grid">
            <div className="adm-field">
              <label className="adm-label">Tipo documental *</label>
              <select
                className="adm-select"
                value={form.tipo_documento_id}
                onChange={(event) => setForm((current) => ({ ...current, tipo_documento_id: event.target.value }))}
              >
                <option value="">Seleccionar</option>
                {filteredTiposDocumento.map((item) => (
                  <option key={item.id} value={item.id}>
                    {getCatalogLabel(item)}
                  </option>
                ))}
              </select>
            </div>
            <div className="adm-field">
              <label className="adm-label">Ambito *</label>
              <select
                className="adm-select"
                value={form.ambito_documental}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    ambito_documental: event.target.value as AmbitoDocumental,
                    tipo_documento_id: '',
                  }))
                }
              >
                <option value="PERSONA">Persona</option>
                <option value="VINCULACION">Vinculacion</option>
              </select>
            </div>
            <div className="adm-field">
              <label className="adm-label">Cargo</label>
              <select
                className="adm-select"
                value={form.contrato_cargo_id}
                onChange={(event) => setForm((current) => ({ ...current, contrato_cargo_id: event.target.value }))}
              >
                <option value="">Todos</option>
                {cargos.map((cargo) => (
                  <option key={cargo.id} value={cargo.id}>
                    {cargo.nombre_cargo}
                  </option>
                ))}
              </select>
            </div>
            <div className="adm-field">
              <label className="adm-label">Tipo vinculacion</label>
              <select
                className="adm-select"
                value={form.tipo_vinculacion_id}
                onChange={(event) =>
                  setForm((current) => ({ ...current, tipo_vinculacion_id: event.target.value }))
                }
              >
                <option value="">Todos</option>
                {tiposVinculacion.map((item) => (
                  <option key={item.id} value={item.id}>
                    {getCatalogLabel(item)}
                  </option>
                ))}
              </select>
            </div>
            <div className="adm-field">
              <label className="adm-label">Vigencia meses</label>
              <input
                className="adm-input"
                type="number"
                min="0"
                value={form.vigencia_meses}
                onChange={(event) => setForm((current) => ({ ...current, vigencia_meses: event.target.value }))}
              />
            </div>
            <div className="adm-field">
              <label className="adm-label">Alerta proxima (dias)</label>
              <input
                className="adm-input"
                type="number"
                min="0"
                value={form.dias_proximo_vencimiento}
                onChange={(event) =>
                  setForm((current) => ({ ...current, dias_proximo_vencimiento: event.target.value }))
                }
              />
            </div>
          </div>

          <div className="cg-actions" style={{ gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
            <label className="adm-check">
              <input
                type="checkbox"
                checked={form.obligatorio}
                onChange={(event) => setForm((current) => ({ ...current, obligatorio: event.target.checked }))}
              />{' '}
              Obligatorio
            </label>
            <label className="adm-check">
              <input
                type="checkbox"
                checked={form.requiere_fecha_expedicion}
                onChange={(event) =>
                  setForm((current) => ({ ...current, requiere_fecha_expedicion: event.target.checked }))
                }
              />{' '}
              Requiere expedicion
            </label>
            <label className="adm-check">
              <input
                type="checkbox"
                checked={form.requiere_fecha_vencimiento}
                onChange={(event) =>
                  setForm((current) => ({ ...current, requiere_fecha_vencimiento: event.target.checked }))
                }
              />{' '}
              Requiere vencimiento
            </label>
            <label className="adm-check">
              <input
                type="checkbox"
                checked={form.activo}
                onChange={(event) => setForm((current) => ({ ...current, activo: event.target.checked }))}
              />{' '}
              Activo
            </label>
          </div>

          {formError && (
            <div className="adm-notice warning" style={{ marginTop: 16 }}>
              <XCircle size={13} /> {formError}
            </div>
          )}

          {!formError && (
            <div className="adm-notice info" style={{ marginTop: 16 }}>
              <CheckCircle2 size={13} /> Los requisitos se acumulan por contrato y contexto; no se aplican overrides implícitos.
            </div>
          )}
        </FormModal>
      )}
    </div>
  );
}
