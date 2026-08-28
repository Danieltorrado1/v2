import type { Request } from 'express';
import { dbQuery } from '../../config/db';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { assertTenantAccessForPersonaId } from '../../middlewares/tenantMiddleware';
import { registerAuditEntry, type AuditRequestMeta } from '../auditoria/auditoria.helper';
import { uploadPersonaDocumento } from '../documentos/documentos.service';
import { createDocumentSignedUrlForBucket } from '../documentos/documentos.storage';
import { AppError } from '../../utils/AppError';

type SupportRow = { id: string; documento_persona_id: string; storage_bucket: string; storage_path: string; nombre_original: string; mime_type: string; version: number };

const loadNovedadPersona = async (novedadId: number) => {
  const result = await dbQuery<{ persona_id: string }>(`SELECT v.persona_id::text FROM nomina_novedades n INNER JOIN nomina_empleados ne ON ne.id=n.nomina_empleado_id INNER JOIN vinculaciones v ON v.id=ne.vinculacion_id WHERE n.id=$1 AND COALESCE(n.activo,TRUE)=TRUE`, [novedadId]);
  if (!result.rows[0]) throw new AppError('Novedad no encontrada', 404, 'NOMINA_NOVEDAD_NOT_FOUND');
  return result.rows[0].persona_id;
};

export const getNovedadSupport = async (novedadId: number, tenant?: TenantAccessContext) => {
  const personaId = await loadNovedadPersona(novedadId);
  await assertTenantAccessForPersonaId(tenant, personaId);
  const result = await dbQuery<SupportRow>(`SELECT d.id::text,d.id::text AS documento_persona_id,d.storage_bucket,d.storage_path,d.nombre_original,d.mime_type,d.version FROM nomina_novedad_documentos nd INNER JOIN documentos_persona d ON d.id=nd.documento_persona_id WHERE nd.nomina_novedad_id=$1 AND nd.activo=TRUE AND d.activo=TRUE ORDER BY d.version DESC,d.id DESC LIMIT 1`, [novedadId]);
  const row = result.rows[0];
  if (!row) return null;
  return { ...row, url: await createDocumentSignedUrlForBucket(row.storage_bucket, row.storage_path, 300) };
};

export const uploadNovedadSupport = async (novedadId: number, file: Express.Multer.File, actor: string, tenant?: TenantAccessContext, meta?: AuditRequestMeta) => {
  if (file.mimetype !== 'application/pdf') throw new AppError('El soporte de novedad debe ser PDF', 400, 'NOMINA_NOVEDAD_SUPPORT_MIME_INVALID');
  const personaId = await loadNovedadPersona(novedadId);
  await assertTenantAccessForPersonaId(tenant, personaId);
  const typeResult = await dbQuery<{ id: string }>(`SELECT id::text FROM tipos_documentos WHERE codigo='NOMINA_NOVEDAD' AND activo=TRUE LIMIT 1`);
  if (!typeResult.rows[0]) throw new AppError('Tipo documental NOMINA_NOVEDAD no configurado', 409, 'NOMINA_NOVEDAD_SUPPORT_TYPE_MISSING');
  const document = await uploadPersonaDocumento(personaId, file, { tipo_documento_id: typeResult.rows[0].id, fecha_expedicion: null, fecha_vencimiento: null }, actor, tenant);
  const relation = await dbQuery<{ id: string }>(`INSERT INTO nomina_novedad_documentos (nomina_novedad_id,documento_persona_id,created_by) VALUES ($1,$2,$3) RETURNING id::text`, [novedadId, document.id, actor]);
  await dbQuery(`UPDATE nomina_novedades SET documento_persona_id=$2 WHERE id=$1`, [novedadId, document.id]);
  await registerAuditEntry({ usuario_id: actor, accion: 'NOMINA_NOVEDAD_SUPPORT_UPLOAD', tabla: 'nomina_novedad_documentos', registro_id: relation.rows[0]?.id ?? String(novedadId), descripcion: 'Carga o reemplazo de soporte documental de novedad', after: { novedad_id: novedadId, documento_persona_id: document.id }, ip: meta?.ip, user_agent: meta?.user_agent });
  return getNovedadSupport(novedadId, tenant);
};

export const requestMetaFrom = (req: Request) => ({ ip: req.ip, user_agent: req.get('user-agent') });
