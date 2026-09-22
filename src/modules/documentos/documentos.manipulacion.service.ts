import type { PoolClient } from 'pg';
import { dbPool, dbQuery } from '../../config/db';
import { assertTenantAccessForPersonaId, assertTenantAccessForVinculacionId, type TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import { inferManipulationMode, type ManipulationMode } from './documentos.manipulacion.domain';

type Scope = 'persona' | 'vinculacion';
const ownerTable = (scope: Scope) => scope === 'persona' ? 'personas' : 'vinculaciones';
export async function manipulationContext(scope: Scope, owner: string, client?: PoolClient) {
  const query = client ? client.query.bind(client) : dbQuery;
  const result = await query(`SELECT manipulacion_modalidad FROM ${ownerTable(scope)} WHERE id=$1::bigint`, [owner]);
  if (!result.rows.length) throw new AppError('Titular no encontrado',404,'DOCUMENT_OWNER_NOT_FOUND');
  const docs = await query(`SELECT d.id,d.metadatos_revision AS metadata,a.componente_codigo AS component FROM documentos_${scope} d
    LEFT JOIN documentos_requisitos_aliases a ON a.tipo_documento_id=d.tipo_documento_id
    LEFT JOIN documentos_requisitos_canonicos c ON c.id=a.requisito_canonico_id AND c.codigo='MANIPULACION'
    WHERE d.${scope}_id=$1::bigint AND d.activo AND d.es_vigente AND d.tipo_documento_id IN (
      SELECT a.tipo_documento_id FROM documentos_requisitos_aliases a JOIN documentos_requisitos_canonicos c ON c.id=a.requisito_canonico_id WHERE c.codigo='MANIPULACION')`,[owner]);
  return { mode: inferManipulationMode(result.rows[0]!.manipulacion_modalidad, docs.rows), documents: docs.rows };
}
export async function lockManipulation(client: PoolClient, scope: Scope, owner: string) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`manipulacion:${scope}:${owner}`]);
}
export async function setManipulationMode(scope: Scope, owner: string, mode: ManipulationMode, confirmed: boolean, actor: string, tenant?: TenantAccessContext, options?: { reutilizarDocumentoId?: string | null }) {
  await (scope === 'persona' ? assertTenantAccessForPersonaId(tenant,owner) : assertTenantAccessForVinculacionId(tenant,owner));
  const client=await dbPool.connect();
  try {
    await client.query('BEGIN');
    await lockManipulation(client,scope,owner);
    const before=await manipulationContext(scope,owner,client);
    if(before.mode !== mode && before.documents.length && !confirmed) throw new AppError('Confirma el cambio: los soportes actuales se conservarán en el historial.',409,'MANIPULATION_CONFIRM_REQUIRED');
    let selectedDocument: { id: string; active: boolean } | null = null;
    if (mode === 'COMBINADO' && options?.reutilizarDocumentoId) {
      const selectedResult = await client.query(`SELECT d.id::text AS id,d.es_vigente AS active
        FROM documentos_${scope} d
        JOIN documentos_requisitos_aliases a ON a.tipo_documento_id=d.tipo_documento_id
        JOIN documentos_requisitos_canonicos c ON c.id=a.requisito_canonico_id AND c.codigo='MANIPULACION'
        WHERE d.id=$1::bigint AND d.${scope}_id=$2::bigint AND d.activo`, [options.reutilizarDocumentoId, owner]);
      if (!selectedResult.rows.length) throw new AppError('El documento seleccionado no pertenece al trabajador o no es un soporte de Manipulación válido.', 409, 'MANIPULATION_DOCUMENT_INVALID');
      selectedDocument = selectedResult.rows[0] as { id: string; active: boolean };
    }
    const selectedWasArchived = !!selectedDocument && !selectedDocument.active;
    if (before.mode !== mode && mode === 'COMBINADO' && before.documents.length) {
      const selectedId = options?.reutilizarDocumentoId ?? (before.documents.length === 1 ? String(before.documents[0]!.id) : null);
      if (!selectedId || !before.documents.some(document => String(document.id) === String(selectedId))) {
        if (!selectedDocument) throw new AppError('Selecciona qué archivo existente se conservará como soporte combinado.', 409, 'MANIPULATION_COMBINED_DOCUMENT_REQUIRED');
      }
      const effectiveSelectedId = selectedId ?? selectedDocument!.id;
      await client.query(`UPDATE documentos_${scope} SET es_vigente=false WHERE id=ANY($1::bigint[]) AND id<>$2::bigint`, [before.documents.map(d=>d.id), effectiveSelectedId]);
      await client.query(`UPDATE documentos_${scope} SET es_vigente=true, metadatos_revision=COALESCE(metadatos_revision,'{}'::jsonb) || $2::jsonb WHERE id=$1::bigint`, [effectiveSelectedId, JSON.stringify({ manipulacion_modalidad: 'COMBINADO', componentes: ['CURSO','EXAMENES'] })]);
    } else if (mode === 'COMBINADO' && selectedDocument) {
      // Explicit recovery: a previous transition may have archived the selected
      // support before it could be reused. Restore that same physical document.
      await client.query(`UPDATE documentos_${scope} SET es_vigente=false WHERE id=ANY($1::bigint[]) AND id<>$2::bigint`, [before.documents.map(d=>d.id), selectedDocument.id]);
      await client.query(`UPDATE documentos_${scope} SET es_vigente=true, metadatos_revision=COALESCE(metadatos_revision,'{}'::jsonb) || $2::jsonb WHERE id=$1::bigint`, [selectedDocument.id, JSON.stringify({ manipulacion_modalidad: 'COMBINADO', componentes: ['CURSO','EXAMENES'] })]);
      selectedDocument = { ...selectedDocument, active: true };
    }
    if (before.mode !== mode && mode !== 'COMBINADO' && before.documents.length) {
      // A combined file is kept in history when moving to separated supports.
      await client.query(`UPDATE documentos_${scope} SET es_vigente=false WHERE id=ANY($1::bigint[])`,[before.documents.map(d=>d.id)]);
    }
    await client.query(`UPDATE ${ownerTable(scope)} SET manipulacion_modalidad=$2 WHERE id=$1::bigint`,[owner,mode]);
    await client.query(`INSERT INTO auditoria_eventos(usuario_id,modulo,entidad,entidad_id,accion,descripcion,datos_anteriores,datos_nuevos)
      VALUES($1::bigint,'DOCUMENTOS',$2,$3,$4,$5,$6::jsonb,$7::jsonb)`,[actor,ownerTable(scope),owner,selectedWasArchived ? 'MANIPULATION_MODE_RECOVERY' : 'MANIPULATION_MODE',selectedWasArchived ? 'Recuperación de soporte de manipulación para cambio de modalidad' : 'Cambio de modalidad de manipulación',JSON.stringify(before),JSON.stringify({mode,reutilizado_documento_id:selectedDocument?.id??null})]);
    await client.query('COMMIT');
    return {mode};
  } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function prepareManipulationUpload(client: PoolClient, scope: Scope, owner: string, code: string, component: string | null, requested: ManipulationMode | undefined, file: Express.Multer.File) {
  if(code !== 'MANIPULACION') {
    if(requested) throw new AppError('La modalidad solo corresponde a Manipulación.',400,'MANIPULATION_TYPE_INVALID');
    return {};
  }
  await lockManipulation(client,scope,owner);
  const {mode}=await manipulationContext(scope,owner,client);
  // Old clients may still upload an independent component. Never infer combined.
  const effective=mode ?? requested ?? 'SEPARADO';
  if ((requested && requested !== effective) || (effective === 'COMBINADO' && requested !== effective)) throw new AppError('La modalidad cambió. Actualiza el repositorio antes de cargar.',409,'MANIPULATION_MODE_CONFLICT');
  if(effective === 'COMBINADO' && (file.mimetype !== 'application/pdf' || file.buffer.subarray(0,5).toString() !== '%PDF-')) throw new AppError('El soporte combinado debe ser un PDF.',400,'MANIPULATION_PDF_REQUIRED');
  if(!['CURSO','EXAMENES'].includes(component ?? '')) throw new AppError('Componente de manipulación no configurado.',400,'MANIPULATION_COMPONENT_INVALID');
  await client.query(`UPDATE ${ownerTable(scope)} SET manipulacion_modalidad=$2 WHERE id=$1::bigint`,[owner,effective]);
  // Replacement applies to the covered component(s), including canonical aliases.
  await client.query(`UPDATE documentos_${scope} d SET es_vigente=false WHERE d.${scope}_id=$1::bigint AND d.es_vigente AND d.tipo_documento_id IN (
    SELECT a.tipo_documento_id FROM documentos_requisitos_aliases a JOIN documentos_requisitos_canonicos c ON c.id=a.requisito_canonico_id
    WHERE c.codigo='MANIPULACION' AND ($2='COMBINADO' OR a.componente_codigo=$3))`,[owner,effective,component]);
  return {manipulacion_modalidad:effective,componentes:effective === 'COMBINADO' ? ['CURSO','EXAMENES'] : [component!]};
}
