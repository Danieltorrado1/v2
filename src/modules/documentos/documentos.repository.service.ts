import { dbQuery } from '../../config/db';
import { buildTenantWhereClause, type TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { buildContextualVinculacionChecklist } from './documentos.checklist.service';

// A bounded page request. Every linkage is authorized by the checklist service.
export async function getRepositoryPageSummary(ids: number[], tenant: TenantAccessContext | undefined, canReadSst: boolean) {
  const checklists = [];
  for (let offset = 0; offset < ids.length; offset += 4) {
    checklists.push(...await Promise.all(ids.slice(offset, offset + 4).map(id =>
      buildContextualVinculacionChecklist(String(id), tenant, { audit: false }))));
  }
  const scope = tenant ? buildTenantWhereClause({ tenant, contratoColumn: 'i.contrato_id', empresaColumn: 'i.empresa_id' }) : { sql: '', params: [] };
  const personParam = scope.params.length + 1;
  const history = canReadSst && checklists.length ? await dbQuery<{
    id: number; persona_id: number; tipo: 'DOTACION' | 'EPP'; fecha: string;
    elemento: string; cantidad: string; estado: string; documento_id: number | null;
  }>(`
    SELECT e.id::int, e.persona_id::int, i.tipo_item AS tipo,
      to_char(e.fecha_entrega, 'YYYY-MM-DD') AS fecha, i.nombre_item AS elemento,
      e.cantidad::text, e.estado_entrega AS estado, e.documento_persona_id::int AS documento_id
    FROM sst_dotacion_epp_entregas e JOIN sst_dotacion_epp i ON i.id = e.item_id
    ${scope.sql || 'WHERE TRUE'} AND e.persona_id = ANY($${personParam}::bigint[])
      AND e.activo AND i.tipo_item IN ('DOTACION', 'EPP')
    ORDER BY e.fecha_entrega DESC, e.id DESC
  `, [...scope.params, checklists.map(c => c.persona_id)]) : { rows: [] };
  return checklists.map(checklist => ({
    checklist,
    entregas: canReadSst ? history.rows.filter(e => e.persona_id === checklist.persona_id) : null,
  }));
}
