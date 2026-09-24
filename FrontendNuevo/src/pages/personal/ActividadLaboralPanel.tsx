import { useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { getActividadLaboral } from '../../services/vinculacionesApi';
import type { ActividadLaboralResponse } from '../../types/actividadLaboral.types';

export default function ActividadLaboralPanel({ vinculacionId, contratoId, permissions }: { vinculacionId: number; contratoId: number; permissions: string[] }) {
  const [state, setState] = useState<'loading' | 'success' | 'empty' | 'error'>('loading');
  const [data, setData] = useState<ActividadLaboralResponse | null>(null);
  const [error, setError] = useState('');
  const requestRef = useRef(0);
  const canSeeEconomics = permissions.includes('nomina.economico.read') || permissions.includes('nomina.read');
  const load = () => {
    const requestId = ++requestRef.current;
    const controller = new AbortController();
    setState('loading'); setError('');
    void getActividadLaboral(vinculacionId, { contrato_id: contratoId, page: 1, limit: 10 }, controller.signal).then((result) => {
      if (requestId !== requestRef.current) return;
      setData(result); setState(result.items.length ? 'success' : 'empty');
    }).catch((reason: unknown) => {
      if (requestId !== requestRef.current || (reason instanceof DOMException && reason.name === 'AbortError')) return;
      setError(reason instanceof Error ? reason.message : 'No se pudo cargar la actividad laboral'); setState('error');
    });
    return () => controller.abort();
  };
  useEffect(() => load(), [vinculacionId, contratoId]);
  if (state === 'loading') return <div className="pmd-section-state"><Loader2 className="spin" size={18} /> Cargando actividad laboral...</div>;
  if (state === 'error') return <div className="pmd-section-state error">{error}<button type="button" className="pmd-button secondary" onClick={load}><RefreshCw size={14} /> Reintentar</button></div>;
  if (state === 'empty' || !data) return <div className="pmd-section-state">Sin actividad laboral registrada.</div>;
  return <div className="pmd-activity-list">
    {data.items.map((item) => <article className="pmd-activity-card" key={item.periodo.id}>
      <header><strong>{item.periodo.fecha_inicio} — {item.periodo.fecha_fin}</strong><span>{item.periodo.estado}</span></header>
      <p>Asistencia: {item.asistencia.dias} días · Ausencias: {item.asistencia.ausencias} · Novedades: {item.novedades.length}</p>
      <p>Turnos internos: {item.turnos.internos} · externos: {item.turnos.externos} · Liquidación: {item.liquidacion.estado}</p>
      <p>Sincronización: {item.sincronizacion.eventos[0]?.estado ?? 'SIN_EVENTOS'} · Último cambio: {item.ultimo_cambio ?? 'Sin registrar'} · Origen: {item.origen ?? 'Sin registrar'}</p>
      {canSeeEconomics && item.liquidacion.neto != null ? <p>Neto: {item.liquidacion.neto}</p> : null}
      <nav className="pmd-activity-actions" aria-label="Navegar actividad laboral">
        <a href={`/nomina/asistencia?empresa_id=${data.empresa_id}&contrato_id=${data.contrato_id}&periodo_id=${item.periodo.id}&vinculacion_id=${vinculacionId}`}>Ver en Planilla</a>
        <a href={`/nomina/novedades?empresa_id=${data.empresa_id}&contrato_id=${data.contrato_id}&periodo_id=${item.periodo.id}&vinculacion_id=${vinculacionId}`}>Ver novedades</a>
        <a href={`/nomina/turnos?empresa_id=${data.empresa_id}&contrato_id=${data.contrato_id}&periodo_id=${item.periodo.id}&vinculacion_id=${vinculacionId}`}>Ver turnos</a>
        {canSeeEconomics ? <a href={`/nomina/liquidacion?empresa_id=${data.empresa_id}&contrato_id=${data.contrato_id}&periodo_id=${item.periodo.id}&vinculacion_id=${vinculacionId}`}>Ver liquidación</a> : null}
      </nav>
    </article>)}
  </div>;
}
