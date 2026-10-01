import { useEffect, useState } from 'react';
import { apiClient } from '../../services/apiClient';
import type { ApiResponse } from '../../types/api.types';

export type TurnContext = {
  municipio_id: string; municipio: string;
  institucion_id: string; institucion: string;
  sede_id: string; sede: string;
  modalidad_id: string; modalidad: string;
};

export default function TurnContextFields({ periodoId, empleadoId, fecha, fechaFin, value, onChange, disabled }: {
  periodoId: string; empleadoId: string; fecha: string; fechaFin?: string;
  value: TurnContext | null; onChange: (value: TurnContext | null) => void; disabled?: boolean;
}) {
  const [options, setOptions] = useState<TurnContext[]>([]);
  const [institution, setInstitution] = useState('');
  const [site, setSite] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setOptions([]); setInstitution(''); setSite(''); setError(''); setLoading(true);
    onChange(null);
    if (!periodoId || !empleadoId || !fecha) { setLoading(false); return; }
    void apiClient.get<ApiResponse<TurnContext[]>>('/nomina/turnos/contextos', {
      params: { periodo_id: periodoId, nomina_empleado_id: empleadoId, fecha, fecha_fin: fechaFin ?? fecha },
    }).then(response => { if (!cancelled) setOptions(response.data); })
      .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'No fue posible cargar los contextos'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // onChange is a state setter; reload only when the scope or dates change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodoId, empleadoId, fecha, fechaFin]);
  const institutions = [...new Map(options.map(option => [option.institucion_id, option.institucion])).entries()];
  const sites = [...new Map(options.filter(option => option.institucion_id === institution).map(option => [option.sede_id, option.sede])).entries()];
  const modalities = options.filter(option => option.institucion_id === institution && option.sede_id === site);
  return <fieldset disabled={disabled || loading} className="np-form-grid">
    <legend>Contexto del turno adicional</legend>
    <label>Institución destino<select required value={institution} onChange={event => {
      setInstitution(event.target.value); setSite(''); onChange(null);
    }}><option value="">Selecciona institución</option>{institutions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    <label>Sede destino<select required value={site} onChange={event => { setSite(event.target.value); onChange(null); }}>
      <option value="">Selecciona sede</option>{sites.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    <label>Modalidad del turno<select required value={value?.modalidad_id ?? ''} onChange={event => {
      onChange(modalities.find(option => option.modalidad_id === event.target.value) ?? null);
    }}><option value="">Selecciona modalidad</option>{modalities.map(option => <option key={option.modalidad_id} value={option.modalidad_id}>{option.modalidad}</option>)}</select></label>
    {loading ? <small>Cargando contextos vigentes…</small> : error ? <small role="alert">{error}</small> : !options.length ? <small>No hay contextos operativos vigentes para estas fechas y tu alcance.</small> : null}
  </fieldset>;
}
