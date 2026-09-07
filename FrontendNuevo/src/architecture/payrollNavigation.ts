import type { AccessUser } from './moduleAccess';

// Routes and permissions of the existing payroll screens; no business logic here.
const payrollLinks = [
  { to: '/nomina', label: 'Centro de nómina', permissions: ['nomina.read'], denyGestor: true },
  { to: '/nomina/cobertura', label: 'Planilla operativa', permissions: ['nomina.operativa.read', 'nomina.read'] },
  { to: '/nomina/gestion', label: 'Gestión de nómina', permissions: ['nomina.read'], denyGestor: true },
  { to: '/nomina/asistencia', label: 'Asistencia', permissions: ['nomina.read'], denyGestor: true },
  { to: '/nomina/turnos', label: 'Turnos', permissions: ['nomina.operativa.read'] },
  { to: '/nomina/novedades', label: 'Novedades', permissions: ['nomina.operativa.read', 'nomina.read'] },
  { to: '/nomina/liquidacion', label: 'Liquidación', permissions: ['nomina.read'], denyGestor: true },
  { to: '/nomina/cambios-operativos', label: 'Cambios operativos', permissions: ['nomina.movimientos.read'], denyGestor: true },
  { to: '/nomina/personal-ops', label: 'Personal OPS', permissions: ['nomina.cuentas_cobro_ops.read'], denyGestor: true },
  { to: '/nomina/correccion', label: 'Corrección Nómina', permissions: ['nomina.correcciones.read'], denyGestor: true },
  { to: '/nomina/ajustes-manuales', label: 'Ajustes manuales', permissions: ['nomina.economico.read'], denyGestor: true },
  { to: '/nomina/cuentas-cobro', label: 'Cuentas de cobro', permissions: ['nomina.movimientos.read'] },
  { to: '/nomina/pago', label: 'Pago', permissions: ['nomina.read'], denyGestor: true },
  { to: '/nomina/documentos', label: 'Documentos', permissions: ['nomina.read'], denyGestor: true },
];

export function visiblePayrollLinks(user: AccessUser | null | undefined) {
  return payrollLinks.filter(link => user && !(link.denyGestor && user.roles.includes('GESTOR'))
    && link.permissions.some(permission => user.permissions.includes(permission)));
}
