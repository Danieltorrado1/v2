import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../../services/apiClient';
import type { ApiResponse } from '../../types/api.types';
import { buildCambioPreview, contextoDestino, opcionesContexto, proposeCategoryForChange, type CambioTipo, type CategoryOption, type ContextoCambio, type OpcionCambio } from './cambioOperativo.domain';
import type { PlanillaCambio } from './planillaOperativa.domain';

type Props = {
  periodoId: string; empleadoId: string; vinculacionId: string; fecha: string;
  tipo: CambioTipo; canSave: boolean; existing?: PlanillaCambio | null;
  onSaved: (change: PlanillaCambio) => void; onCancel: () => void;
  onSavingChange?: (saving: boolean) => void;
  onFechaChange?: (fecha: string) => void;
};

/** Fields inside the existing Planilla novelty modal; persists through the existing change endpoint. */
export default function CambioOperativoFields(props: Props) {
  const [fecha, setFecha] = useState(props.existing?.fecha_inicio_efectiva ?? props.fecha);
  const [motivo, setMotivo] = useState(props.existing?.motivo ?? '');
  const [options, setOptions] = useState<OpcionCambio[]>([]);
  const [base, setBase] = useState<ContextoCambio | null>(null);
  const [categoryState, setCategoryState] = useState<{ id: string | null; ambiguous: boolean }>({ id: null, ambiguous: false });
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [institucion, setInstitucion] = useState('');
  const [sede, setSede] = useState('');
  const [modalidad, setModalidad] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const busy = useRef(false);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setBase(null);
    Promise.all([
      apiClient.get<ApiResponse<OpcionCambio[]>>(`/vinculaciones/${props.vinculacionId}/asignacion-operativa/opciones`),
      apiClient.get<ApiResponse<{ contexto: ContextoCambio }>>(`/nomina/periodos/${props.periodoId}/vinculaciones/${props.vinculacionId}/contexto-operativo/${fecha}`),
    ]).then(([catalog, current]) => {
      if (!active) return;
      const previous = props.existing?.contexto_anterior ?? current.data.contexto;
      const selected = props.existing?.contexto_nuevo ?? previous;
      const contexto = current.data.contexto as ContextoCambio & { categoria_salarial?: { id?: string | null } | null; ambiguedades?: string[] };
      setOptions(catalog.data); setBase(previous);
      const empresaId = (contexto as Record<string, unknown>).empresa_id;
      if (empresaId) void apiClient.get<ApiResponse<CategoryOption[]>>(`/company-settings/${empresaId}/salary-categories`).then((response) => active && setCategories(response.data)).catch(() => active && setCategories([]));
      setCategoryState({ id: contexto.categoria_salarial?.id ?? null, ambiguous: contexto.ambiguedades?.includes('CATEGORIA_SALARIAL') ?? false });
      setInstitucion(String(selected.institucion_id ?? ''));
      setSede(String(selected.sede_id ?? ''));
      setModalidad(String(selected.modalidad_id ?? ''));
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : 'No fue posible cargar el contexto y sus opciones.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [props.vinculacionId, props.periodoId, props.existing, fecha, attempt]);
  const catalogs = opcionesContexto(options, institucion, sede);
  const target = options.find(row => row.institucion_id === institucion && row.sede_id === sede && row.modalidad_id === modalidad);
  const targetContext = base && target ? contextoDestino(base, target) : null;
  const targetCategoryId = base && target && String(base.modalidad_id ?? '') === String(target.modalidad_id ?? '') ? categoryState.id : null;
  const categoryProposal = target && base ? proposeCategoryForChange(categories, (base as Record<string, unknown>).contrato_id as string | number | undefined, target.modalidad, fecha) : { estado: 'REQUIERE_REVISION_SALARIAL' as const, categoriaId: null };
  const preview = base && target && targetContext ? buildCambioPreview(base, targetContext, fecha, categoryState.ambiguous || categoryProposal.estado === 'REQUIERE_REVISION_SALARIAL', categoryProposal.categoriaId ?? targetCategoryId) : null;
  const save = async () => {
    if (busy.current || loading || !base || !target || !props.canSave || motivo.trim().length < 3) return;
    busy.current = true; setSaving(true); props.onSavingChange?.(true); setError('');
    try {
      const payload = { periodo_id: props.periodoId, nomina_empleado_id: props.empleadoId,
        vinculacion_id: props.vinculacionId, tipo: props.tipo, fecha_inicio_efectiva: fecha,
        regla_fecha_efectiva: 'MISMO_DIA', contexto_anterior: base,
        contexto_nuevo: contextoDestino(base, target), motivo: motivo.trim() };
      const result = props.existing
        ? await apiClient.patch<ApiResponse<PlanillaCambio>>(`/nomina/cambios-operativos/${props.existing.id}`, payload)
        : await apiClient.post<ApiResponse<PlanillaCambio>>('/nomina/cambios-operativos', payload);
      props.onSavingChange?.(false);
      props.onSaved(result.data);
    } catch (err) { setError(err instanceof Error ? err.message : 'No fue posible guardar el cambio.'); }
    finally { busy.current = false; setSaving(false); props.onSavingChange?.(false); }
  };
  return <>
    <p>El contexto anterior se conserva hasta el día anterior a la fecha efectiva.</p>
    <label className="op-form-field">Fecha efectiva<input type="date" value={fecha} disabled={saving} onChange={e => { if (props.onFechaChange) props.onFechaChange(e.target.value); else setFecha(e.target.value); }} /></label>
    {loading ? <p role="status">Cargando instituciones, sedes y modalidades…</p> : null}
    {error && <p role="alert">{error} <button type="button" disabled={saving} onClick={() => setAttempt(n => n + 1)}>Recargar contexto</button></p>}
    <fieldset disabled={loading || saving || !props.canSave}>
      <label className="op-form-field">Institución<select value={institucion} disabled={props.tipo === 'CAMBIO_DE_MODALIDAD'} onChange={e => { setInstitucion(e.target.value); setSede(''); setModalidad(''); }}><option value="">Seleccionar institución</option>{catalogs.instituciones.map(row => <option key={row.institucion_id} value={row.institucion_id!}>{row.institucion}</option>)}</select></label>
      <label className="op-form-field">Sede<select value={sede} disabled={!institucion || props.tipo === 'CAMBIO_DE_MODALIDAD'} onChange={e => { setSede(e.target.value); setModalidad(''); }}><option value="">Seleccionar sede</option>{catalogs.sedes.map(row => <option key={row.sede_id} value={row.sede_id!}>{row.sede}</option>)}</select></label>
      <label className="op-form-field">Modalidad<select value={modalidad} disabled={!sede} onChange={e => setModalidad(e.target.value)}><option value="">Seleccionar modalidad</option>{catalogs.modalidades.map(row => <option key={row.modalidad_id} value={row.modalidad_id!}>{row.modalidad}</option>)}</select></label>
      <label className="op-form-field">Observación / motivo<textarea value={motivo} onChange={e => setMotivo(e.target.value)} /></label>
    </fieldset>
    {!loading && !options.length && !error && <p>No hay combinaciones operativas disponibles para este contrato.</p>}
    {preview && <section aria-label="Vista previa de vigencia"><strong>Vista previa</strong><p>{preview.modalidadAnterior} hasta el día anterior; {preview.modalidadNueva} desde {preview.fechaEfectiva}.</p><p role={preview.categoriaEstado === 'REQUIERE_REVISION_SALARIAL' ? 'alert' : undefined}>{preview.categoriaEstado === 'REQUIERE_REVISION_SALARIAL' ? 'REQUIERE_REVISION_SALARIAL: verifique la categoría salarial para la nueva modalidad.' : 'Categoría salarial vigente detectada; validar antes de autorizar.'}</p></section>}
    {!props.canSave && <p>No tienes permiso para guardar este cambio operativo.</p>}
    <div className="op-modal-actions"><button type="button" disabled={saving} onClick={props.onCancel}>Cancelar</button><button type="button" disabled={loading || saving || !base || !target || !fecha || motivo.trim().length < 3 || !props.canSave} onClick={() => void save()}>{saving ? 'Guardando…' : 'Guardar novedad'}</button></div>
  </>;
}
