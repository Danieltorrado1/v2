export const AGENDA_PERMISSIONS = ['agenda.read','agenda.create','agenda.update','agenda.assign','agenda.complete','agenda.cancel','agenda.reopen','agenda.manage','agenda.audit'] as const;
export type AgendaPermission = typeof AGENDA_PERMISSIONS[number];
export type AgendaEstado = 'PENDIENTE'|'EN_PROCESO'|'TERMINADA'|'REPROGRAMADA'|'CANCELADA';
export type AgendaPrioridad = 'A'|'B'|'C';
export type AgendaTipo = 'TALENTO_HUMANO'|'COBERTURA'|'NOMINA'|'DOCUMENTOS'|'SST'|'REMISIONES'|'CONTRATOS'|'ADMINISTRATIVA'|'OTRA';
export type AgendaOrigen = 'MANUAL'|'MODULO'|'SISTEMA';
export type AgendaSeguimientoTipo = 'COMENTARIO'|'CAMBIO_ESTADO'|'EVIDENCIA'|'REPROGRAMACION'|'REASIGNACION'|'CIERRE'|'REAPERTURA';
export interface AgendaScope { empresaId: number; userId: number; canManage: boolean; canAudit: boolean; }
