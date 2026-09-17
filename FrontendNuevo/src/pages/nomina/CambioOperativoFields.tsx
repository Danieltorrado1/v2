import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../../services/apiClient';
import type { ApiResponse } from '../../types/api.types';
import { contextoDestino, opcionesContexto, type CambioTipo, type ContextoCambio, type OpcionCambio } from './cambioOperativo.domain';
import type { PlanillaCambio } from './planillaOperativa.domain';

type Props = {
  periodoId: string; empleadoId: string; vinculacionId: string; fecha: string;
  tipo: CambioTipo; canSave: boolean; existing?: PlanillaCambio | null;
  onSaved: (change: PlanillaCambio) => void; onCancel: () => void;
  onSavingChange?: (saving: boolean) => void;
};

/** Fields inside the existing Planilla novelty modal; persists through the existing change endpoint. */
export default function CambioOperativoFields(props: Props) {
  const [fecha, setFecha] = useState(props.existing?.fecha_inicio_efectiva ?? props.fecha);
  const [motivo, setMotivo] = useState(props.existing?.motivo ?? '');
  const [options, setOptions] = useState<OpcionCambio[]>([]);
  const [base, setBase] = useState<ContextoCambio | null>(null);
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
      setOptions(catalog.data); setBase(previous);
      setInstitucion(String(selected.institucion_id ?? ''));
      setSede(String(selected.sede_id ?? ''));
      setModalidad(String(selected.modalidad_id ?? ''));
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : 'No fue posible cargar el contexto y sus opciones.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [props.vinculacionId, props.periodoId, props.existing, fecha, attempt]);
  const catalogs = opcionesContexto(options, institucion, sede);
  const target = options.find(row => row.institucion_id === institucion && row.sede_id === sede && row.modalidad_id === modalidad);
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
    <label className="op-form-field">Fecha efectiva<input type="date" value={fecha} disabled={saving} onChange={e => setFecha(e.target.value)} /></label>
    {loading ? <p role="status">Cargando instituciones, sedes y modalidades…</p> : null}
    {error && <p role="alert">{error} <button type="button" disabled={saving} onClick={() => setAttempt(n => n + 1)}>Recargar contexto</button></p>}
    <fieldset disabled={loading || saving || !props.canSave}>
      <label className="op-form-field">Institución<select value={institucion} disabled={props.tipo === 'CAMBIO_DE_MODALIDAD'} onChange={e => { setInstitucion(e.target.value); setSede(''); setModalidad(''); }}><option value="">Seleccionar institución</option>{catalogs.instituciones.map(row => <option key={row.institucion_id} value={row.institucion_id!}>{row.institucion}</option>)}</select></label>
      <label className="op-form-field">Sede<select value={sede} disabled={!institucion || props.tipo === 'CAMBIO_DE_MODALIDAD'} onChange={e => { setSede(e.target.value); setModalidad(''); }}><option value="">Seleccionar sede</option>{catalogs.sedes.map(row => <option key={row.sede_id} value={row.sede_id!}>{row.sede}</option>)}</select></label>
      <label className="op-form-field">Modalidad<select value={modalidad} disabled={!sede} onChange={e => setModalidad(e.target.value)}><option value="">Seleccionar modalidad</option>{catalogs.modalidades.map(row => <option key={row.modalidad_id} value={row.modalidad_id!}>{row.modalidad}</option>)}</select></label>
      <label className="op-form-field">Observación / motivo<textarea value={motivo} onChange={e => setMotivo(e.target.value)} /></label>
    </fieldset>
    {!loading && !options.length && !error && <p>No hay combinaciones operativas disponibles para este contrato.</p>}
    {!props.canSave && <p>No tienes permiso para guardar este cambio operativo.</p>}
    <div className="op-modal-actions"><button type="button" disabled={saving} onClick={props.onCancel}>Cancelar</button><button type="button" disabled={loading || saving || !base || !target || !fecha || motivo.trim().length < 3 || !props.canSave} onClick={() => void save()}>{saving ? 'Guardando…' : 'Guardar novedad'}</button></div>
  </>;
}
