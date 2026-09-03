import { useEffect, useMemo, useState } from 'react';
import { Eye, FileText } from 'lucide-react';
import { useCompanyContext } from '../../context/CompanyContext';
import { ApiClientError } from '../../services/apiClient';
import { getAllNominaTurnos, getCoberturaExternos, getNominaPeriodos, generarCoberturaCuenta, descargarCoberturaCuenta } from '../../services/nominaApi';
import type { CoberturaExternoResumenApi, NominaPeriodoApi, NominaTurno } from '../../types/nomina.types';
import CoberturaFlowNav from './CoberturaFlowNav';
import './NominaPages.css';

const money = (n: number) => `$${Number(n).toLocaleString('es-CO')}`;

export default function CuentasCobroPage() {
  const { empresaId } = useCompanyContext();
  const [periods, setPeriods] = useState<NominaPeriodoApi[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [rows, setRows] = useState<CoberturaExternoResumenApi[]>([]);
  const [turns, setTurns] = useState<NominaTurno[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const period = periods.find((item) => item.id === periodId);
  const load = async (id: string) => { if (!id) return; const [external, movements] = await Promise.all([getCoberturaExternos(id, empresaId ? String(empresaId) : undefined), getAllNominaTurnos({ periodo_id: id, activo: true })]); setRows(external); setTurns(movements.items.filter((item) => item.tipo_movimiento === 'TURNO_EXTERNO')); };
  useEffect(() => { getNominaPeriodos({ page: 1, limit: 100 }).then((data) => { setPeriods(data.items); setPeriodId(data.items[0]?.id ?? ''); }); }, []);
  useEffect(() => { void load(periodId); }, [periodId, empresaId]);
  const detail = useMemo(() => selected ? turns.filter((item) => item.externo_id === selected) : [], [selected, turns]);
  const generate = async (row: CoberturaExternoResumenApi) => { if (!period || !empresaId || row.turnos_con_tarifa <= 0) return; setBusy(row.id); setError(''); try { await generarCoberturaCuenta(String(empresaId), String(period.contrato_id), period.id, row.id); await load(period.id); } catch (cause) { setError(cause instanceof ApiClientError ? cause.message : 'No fue posible generar la cuenta.'); } finally { setBusy(null); } };
  return <div className="np-page"><CoberturaFlowNav periodId={periodId} /><header className="np-header"><div><h1>Cuentas de cobro</h1><p>Consolidado de cuentas externas por persona y periodo.</p></div></header><div className="np-toolbar"><select className="np-select" value={periodId} onChange={(event) => setPeriodId(event.target.value)}>{periods.map((item) => <option key={item.id} value={item.id}>{item.nombre_periodo}</option>)}</select></div>{error && <div className="np-alert">{error}</div>}<div className="np-table-card"><div className="np-table-scroll"><table className="np-table"><thead><tr><th>Externo</th><th>Cédula</th><th>Periodo</th><th>Turnos</th><th>Listos</th><th>Pendientes tarifa</th><th>Días listos</th><th>Valor listo</th><th>Documentos</th><th>Estado</th><th>Número cuenta</th><th>Acciones</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.nombre_completo}</td><td>{row.numero_documento}</td><td>{period?.nombre_periodo ?? '—'}</td><td>{row.turnos}</td><td>{row.turnos_con_tarifa}</td><td>{row.turnos_sin_tarifa > 0 ? <span title="Revisar turno y configurar tarifa">{row.turnos_sin_tarifa} · SIN TARIFA</span> : 0}</td><td>{row.dias_listos}</td><td>{row.dias_listos > 0 ? money(row.valor_listo) : '—'}</td><td>{row.cedula && row.banco_doc ? 'Completos' : 'Pendientes'}</td><td>{row.cuenta_estado}</td><td>{row.cuenta_id ?? '—'}</td><td><button className="np-btn" onClick={() => setSelected(row.id)}><Eye size={14} /> {row.turnos_sin_tarifa > 0 ? 'Ver pendientes' : 'Gestionar'}</button>{row.cuenta_estado === 'PENDIENTE' && row.turnos_con_tarifa > 0 ? <button className="np-btn primary" disabled={busy !== null && busy !== row.id} onClick={() => void generate(row)}>{busy === row.id ? 'Generando...' : 'Generar'}</button> : row.cuenta_id ? <button className="np-btn" onClick={() => void descargarCoberturaCuenta(row.cuenta_id!).then((result) => window.open(result.url, '_blank'))}><FileText size={14} /> Ver PDF</button> : null}</td></tr>)}</tbody></table></div></div>{selected && <section className="np-table-card" style={{ padding: 16 }}><h2>Detalle de cuenta · {rows.find((row) => row.id === selected)?.nombre_completo}</h2><p>Estado {rows.find((row) => row.id === selected)?.cuenta_estado}</p><h3>Turnos incluidos y pendientes</h3><div className="np-table-scroll"><table className="np-table"><thead><tr><th>Persona cubierta</th><th>Institución / sede</th><th>Modalidad</th><th>Fecha</th><th>Días</th><th>Tarifa diaria</th><th>Subtotal</th><th>Estado</th></tr></thead><tbody>{detail.map((item) => <tr key={item.id}><td>{item.persona_reemplazada?.nombre_completo ?? 'No disponible'}</td><td>{[item.contexto_operativo?.institucion, item.contexto_operativo?.sede].filter(Boolean).join(' / ') || 'No disponible'}</td><td>{item.contexto_operativo?.modalidad ?? 'No disponible'}</td><td>{item.fecha ?? '—'}</td><td>{item.cantidad ?? 1}</td><td>{item.valor_unitario ? money(item.valor_unitario) : 'SIN TARIFA'}</td><td>{item.valor_unitario ? money(item.valor_total) : '—'}</td><td>{item.valor_unitario ? 'LISTO' : 'PENDIENTE DE TARIFA'}</td></tr>)}</tbody></table></div></section>}</div>;
}
