import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { apiClient } from '../../services/apiClient';
import { useCompanyContext } from '../../context/CompanyContext';
import './NominaPages.css';

const procesos = [
  { codigo: 'COBERTURA', titulo: 'Cobertura', descripcion: 'Gestión por cobertura', href: '/nomina/cobertura' },
  { codigo: 'ASISTENCIA', titulo: 'Asistencia', descripcion: 'Gestión por asistencia', href: '/nomina/asistencia' },
  { codigo: 'OPS', titulo: 'OPS', descripcion: 'Gestión de contratistas', href: '/nomina/ops' },
];

export default function NominaHubPage() {
  const { empresaId } = useCompanyContext();
  const [acceso, setAcceso] = useState<Array<{ proceso: string; responsable: boolean; administrative?: boolean }> | null>(null);
  useEffect(() => { let active = true; if (!empresaId) { setAcceso([]); return () => { active = false; }; } apiClient.get<{ data: Array<{ proceso: string; responsable: boolean; administrative?: boolean }> }>('/nomina/procesos/acceso', { params: { empresa_id: empresaId } }).then((response) => { if (active) setAcceso(response.data); }).catch(() => { if (active) setAcceso([]); }); return () => { active = false; }; }, [empresaId]);
  const admin = Boolean(acceso?.some((item) => item.administrative));
  const visibles = acceso === null ? [] : procesos.filter((proceso) => acceso.some((item) => item.proceso === proceso.codigo && (item.responsable || item.administrative)));
  return <main className="payroll-page"><header><h1>Nómina</h1><p>{visibles.length ? (admin ? 'Consulta administrativa y procesos operativos autorizados.' : 'Selecciona el proceso operativo que tienes autorizado.') : 'Sin asignación de nómina'}</p></header><section className="payroll-process-grid">{visibles.map((proceso) => <Link className="payroll-process-card" key={proceso.codigo} to={proceso.href}><strong>{proceso.titulo}</strong><span>{proceso.descripcion}</span><small>Ingresar</small></Link>)}</section></main>;
}
