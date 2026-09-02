import PDFDocument from 'pdfkit';
import type { QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import { env } from '../../config/env';
import { getSupabaseAdminClient } from '../../config/supabaseAdmin';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { registerAuditEntry, type AuditRequestMeta } from '../auditoria/auditoria.helper';
import { AppError } from '../../utils/AppError';
import { createDocumentSignedUrlForBucket } from '../documentos/documentos.storage';
import type { GenerarCoberturaCuentaInput, ListCoberturaExternosQuery, UpsertCoberturaExternoInput } from './cobertura.externos.schemas';
import { appendNominaCoberturaScope } from './nomina.procesos';

type ExternoRow = QueryResultRow & { id: string; empresa_id: string; tipo_documento: string; numero_documento: string; nombre_completo: string; banco: string | null; tipo_cuenta: string | null; numero_cuenta: string | null; turnos: string | number; valor_total: string | number; cedula: boolean; banco_doc: boolean; cuenta_id: string | null; cuenta_estado: string };
type CuentaRow = QueryResultRow & { id: string; empresa_id: string; contrato_id: string; periodo_id: string; externo_id: string; numero_cuenta: string; estado: string; valor_total: string | number; generado_bucket: string | null; generado_path: string | null; firmado_bucket: string | null; firmado_path: string | null };

const assertTenantCompany = (tenant: TenantAccessContext | undefined, empresaId: number) => {
  if (tenant && !tenant.isGlobalAdmin && !tenant.empresaIds.includes(empresaId)) throw new AppError('Empresa fuera del alcance del usuario', 403, 'TENANT_COMPANY_FORBIDDEN');
};
const assertTenantContract = (tenant: TenantAccessContext | undefined, contratoId: number) => {
  if (tenant && !tenant.isGlobalAdmin && tenant.contratoIds.length > 0 && !tenant.contratoIds.includes(contratoId)) throw new AppError('Contrato fuera del alcance del usuario', 403, 'TENANT_CONTRACT_FORBIDDEN');
};
const jsonBuffer = (lines: string[]) => new Promise<Buffer>((resolve, reject) => {
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);
  for (const line of lines) doc.text(line);
  doc.end();
});
const upload = async (path: string, buffer: Buffer, mimeType: string) => {
  const result = await getSupabaseAdminClient().storage.from(env.SUPABASE_STORAGE_BUCKET).upload(path, buffer, { contentType: mimeType, upsert: false });
  if (result.error) throw new AppError('No fue posible cargar el documento en Storage', 502, 'STORAGE_UPLOAD_FAILED');
  return { bucket: env.SUPABASE_STORAGE_BUCKET, path };
};

export const upsertCoberturaExterno = async (input: UpsertCoberturaExternoInput, actor: string, tenant?: TenantAccessContext, meta?: AuditRequestMeta) => {
  assertTenantCompany(tenant, input.empresa_id);
  const result = await dbQuery<ExternoRow>(`INSERT INTO cobertura_externos (empresa_id,tipo_documento,numero_documento,nombre_completo,banco,tipo_cuenta,numero_cuenta) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (empresa_id,tipo_documento,numero_documento) WHERE activo = TRUE DO UPDATE SET nombre_completo=EXCLUDED.nombre_completo,banco=EXCLUDED.banco,tipo_cuenta=EXCLUDED.tipo_cuenta,numero_cuenta=EXCLUDED.numero_cuenta,updated_at=NOW() RETURNING id::text,empresa_id::text,tipo_documento,numero_documento,nombre_completo,banco,tipo_cuenta,numero_cuenta,0::int AS turnos,0::numeric AS valor_total,FALSE AS cedula,FALSE AS banco_doc`, [input.empresa_id, input.tipo_documento, input.numero_documento, input.nombre_completo, input.banco ?? null, input.tipo_cuenta ?? null, input.numero_cuenta ?? null]);
  const row = result.rows[0];
  if (!row) throw new AppError('No fue posible guardar el externo', 500, 'COBERTURA_EXTERNO_SAVE_FAILED');
  await registerAuditEntry({ usuario_id: actor, accion: 'COBERTURA_EXTERNO_UPSERT', tabla: 'cobertura_externos', registro_id: row.id, descripcion: 'Creacion o actualizacion de identidad externa de cobertura', after: row, ip: meta?.ip, user_agent: meta?.user_agent });
  return row;
};

export const listCoberturaExternos = async (query: ListCoberturaExternosQuery, tenant?: TenantAccessContext) => {
  const params: unknown[] = []; const where: string[] = ['ce.activo = TRUE'];
  if (query.empresa_id) { assertTenantCompany(tenant, query.empresa_id); params.push(query.empresa_id); where.push(`ce.empresa_id = $${params.length}`); }
  if (query.periodo_id) { params.push(query.periodo_id); where.push(`(nnt.periodo_id = $${params.length} OR nm.periodo_id = $${params.length})`); }
  if (query.contrato_id) { assertTenantContract(tenant, query.contrato_id); params.push(query.contrato_id); where.push(`(np.contrato_id = $${params.length} OR nmp.contrato_id = $${params.length})`); }
  if (tenant && !tenant.isGlobalAdmin && tenant.empresaIds.length) { params.push(tenant.empresaIds); where.push(`ce.empresa_id = ANY($${params.length}::bigint[])`); }
  const periodParam = query.periodo_id ? `$${params.length + 1}` : null;
  const result = await dbQuery<ExternoRow>(`SELECT ce.id::text,ce.empresa_id::text,ce.tipo_documento,ce.numero_documento,ce.nombre_completo,ce.banco,ce.tipo_cuenta,ce.numero_cuenta,COUNT(DISTINCT COALESCE(nm.id,nnt.id))::int AS turnos,COALESCE((SELECT SUM(nm2.valor_total) FROM nomina_movimientos nm2 INNER JOIN nomina_periodos np2 ON np2.id=nm2.periodo_id WHERE nm2.externo_id=ce.id AND nm2.activo=TRUE AND COALESCE(nm2.estado,'PENDIENTE') <> 'RECHAZADO' ${query.periodo_id ? `AND nm2.periodo_id=${periodParam}` : ''} ${query.contrato_id ? `AND np2.contrato_id=$${params.findIndex((value) => value === query.contrato_id) + 1}` : ''}),0) AS valor_total,EXISTS (SELECT 1 FROM cobertura_externo_documentos d WHERE d.externo_id=ce.id AND d.tipo_documento='CEDULA_EXTERNO_COBERTURA' AND d.activo AND d.es_vigente) AS cedula,EXISTS (SELECT 1 FROM cobertura_externo_documentos d WHERE d.externo_id=ce.id AND d.tipo_documento='CERTIFICACION_BANCARIA_EXTERNO_COBERTURA' AND d.activo AND d.es_vigente) AS banco_doc,(SELECT c.id::text FROM cobertura_cuentas_cobro_externas c WHERE c.externo_id=ce.id AND c.activo=TRUE ${query.periodo_id ? `AND c.periodo_id=${periodParam}` : ''} ORDER BY c.id DESC LIMIT 1) AS cuenta_id,COALESCE((SELECT c.estado FROM cobertura_cuentas_cobro_externas c WHERE c.externo_id=ce.id AND c.activo=TRUE ${query.periodo_id ? `AND c.periodo_id=${periodParam}` : ''} ORDER BY c.id DESC LIMIT 1),'PENDIENTE') AS cuenta_estado FROM cobertura_externos ce LEFT JOIN nomina_novedad_turnos nnt ON nnt.externo_id=ce.id AND nnt.activo LEFT JOIN nomina_movimientos nm ON nm.externo_id=ce.id AND nm.activo LEFT JOIN nomina_periodos np ON np.id=nnt.periodo_id LEFT JOIN nomina_periodos nmp ON nmp.id=nm.periodo_id WHERE ${where.join(' AND ')} GROUP BY ce.id ORDER BY ce.nombre_completo`, [...params, ...(query.periodo_id ? [query.periodo_id] : [])]);
  return result.rows;
};

export const listCoberturaExternosOperativos = async (query: ListCoberturaExternosQuery, tenant?: TenantAccessContext) => {
  const rows = await listCoberturaExternos(query, tenant);
  let scopedRows = rows;
  if (tenant && !tenant.isGlobalAdmin) {
    const params: unknown[] = [];
    const conditions = ['nnt.externo_id IS NOT NULL'];
    if (query.periodo_id) {
      params.push(query.periodo_id);
      conditions.push(`nnt.periodo_id = $${params.length}::bigint`);
    }
    appendNominaCoberturaScope(conditions, params, tenant);
    const allowed = await dbQuery<{ externo_id: string }>(
      `SELECT DISTINCT nnt.externo_id::text AS externo_id
       FROM nomina_novedad_turnos nnt
       JOIN nomina_empleados ne ON ne.id=nnt.nomina_empleado_id
       JOIN vinculaciones v ON v.id=ne.vinculacion_id
       JOIN nomina_periodos np ON np.id=nnt.periodo_id
       WHERE ${conditions.join(' AND ')}`,
      params
    );
    const allowedIds = new Set(allowed.rows.map((row) => row.externo_id));
    scopedRows = rows.filter((row) => allowedIds.has(row.id));
  }
  return scopedRows.map(({ banco: _banco, tipo_cuenta: _tipoCuenta, numero_cuenta: _numeroCuenta,
    valor_total: _valorTotal, cuenta_id: _cuentaId, cuenta_estado: _cuentaEstado,
    cedula: _cedula, banco_doc: _bancoDoc, ...operational }) => operational);
};

export const generateCoberturaCuenta = async (input: GenerarCoberturaCuentaInput, actor: string, tenant?: TenantAccessContext, meta?: AuditRequestMeta) => {
  assertTenantCompany(tenant, input.empresa_id); assertTenantContract(tenant, input.contrato_id);
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const requiredDocuments = await client.query<{ tipo_documento: string }>(
      `
        SELECT tipo_documento
        FROM cobertura_externo_documentos
        WHERE externo_id = $1::bigint
          AND activo = TRUE
          AND es_vigente = TRUE
          AND tipo_documento IN ('CEDULA_EXTERNO_COBERTURA', 'CERTIFICACION_BANCARIA_EXTERNO_COBERTURA')
        GROUP BY tipo_documento
      `,
      [input.externo_id]
    );
    const documentTypes = new Set(requiredDocuments.rows.map((row) => row.tipo_documento));
    const missingDocuments = ['CEDULA_EXTERNO_COBERTURA', 'CERTIFICACION_BANCARIA_EXTERNO_COBERTURA']
      .filter((type) => !documentTypes.has(type));
    if (missingDocuments.length > 0) {
      throw new AppError(
        'La cuenta de cobro requiere cedula y certificacion bancaria vigentes',
        409,
        'COBERTURA_DOCUMENTOS_EXTERNOS_INCOMPLETOS',
        { faltantes: missingDocuments }
      );
    }
    const turns = await client.query<{ id: string; fecha: string; valor: string | number }>(`SELECT nm.id::text,nm.fecha::text,nm.valor_total AS valor FROM nomina_movimientos nm INNER JOIN nomina_periodos np ON np.id=nm.periodo_id WHERE nm.externo_id=$1 AND nm.periodo_id=$2 AND np.contrato_id=$3 AND np.contrato_empresa_id=$4 AND nm.tipo_movimiento='TURNO_EXTERNO' AND nm.activo=TRUE AND COALESCE(nm.estado,'PENDIENTE') <> 'RECHAZADO'`, [input.externo_id,input.periodo_id,input.contrato_id,input.empresa_id]);
    if (!turns.rows.length) throw new AppError('No hay turnos externos activos para consolidar', 409, 'COBERTURA_CUENTA_SIN_TURNOS');
    const total = turns.rows.reduce((sum, row) => sum + Number(row.valor ?? 0), 0);
    const existing = await client.query<CuentaRow>(`SELECT * FROM cobertura_cuentas_cobro_externas WHERE externo_id=$1 AND empresa_id=$2 AND contrato_id=$3 AND periodo_id=$4 AND activo=TRUE FOR UPDATE`, [input.externo_id,input.empresa_id,input.contrato_id,input.periodo_id]);
    if (existing.rows[0]) throw new AppError('La cuenta ya fue generada; regenérala mediante una acción versionada explícita.',409,'COBERTURA_CUENTA_REGENERACION_REQUIERE_VERSION');
    const account = await client.query<CuentaRow>(`INSERT INTO cobertura_cuentas_cobro_externas (empresa_id,contrato_id,periodo_id,externo_id,estado,valor_total,generado_at,created_by) VALUES ($1,$2,$3,$4,'GENERADA',$5,NOW(),$6) RETURNING *`, [input.empresa_id,input.contrato_id,input.periodo_id,input.externo_id,total,actor]);
    const row = account.rows[0]; if (!row) throw new AppError('No fue posible crear la cuenta',500,'COBERTURA_CUENTA_CREATE_FAILED');
    await client.query(`DELETE FROM cobertura_cuenta_cobro_externa_detalle WHERE cuenta_id=$1`,[row.id]);
    for (const turn of turns.rows) await client.query(`INSERT INTO cobertura_cuenta_cobro_externa_detalle (cuenta_id,movimiento_id,fecha,valor) VALUES ($1,$2,$3,$4)`,[row.id,turn.id,turn.fecha,turn.valor]);
    const external = await client.query<{nombre_completo:string;numero_documento:string}>(`SELECT nombre_completo,numero_documento FROM cobertura_externos WHERE id=$1`,[input.externo_id]);
    const pdf = await jsonBuffer(['CUENTA DE COBRO - COBERTURA EXTERNA',`Cuenta: ${row.numero_cuenta}`,`Externo: ${external.rows[0]?.nombre_completo ?? ''}`,`Documento: ${external.rows[0]?.numero_documento ?? ''}`,`Periodo: ${input.periodo_id}`,`Turnos incluidos: ${turns.rows.length}`,`Total: ${total}`]);
    const stored = await upload(`cobertura/cuentas-cobro/${row.id}/generada.pdf`,pdf,'application/pdf');
    await client.query(`UPDATE cobertura_cuentas_cobro_externas SET generado_bucket=$2,generado_path=$3 WHERE id=$1`,[row.id,stored.bucket,stored.path]);
    await registerAuditEntry({client,usuario_id:actor,accion:'COBERTURA_CUENTA_GENERATE',tabla:'cobertura_cuentas_cobro_externas',registro_id:row.id,descripcion:'Generacion de cuenta de cobro de turnos externos',after:{turnos:turns.rows.map(t=>t.id),total},ip:meta?.ip,user_agent:meta?.user_agent});
    await client.query('COMMIT'); return { ...row, valor_total: total, generated_bucket: stored.bucket, generated_path: stored.path, turnos: turns.rows };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
};

export const uploadCoberturaExternoDocumento = async (externoId: number, tipo: 'CEDULA_EXTERNO_COBERTURA' | 'CERTIFICACION_BANCARIA_EXTERNO_COBERTURA', file: { buffer: Buffer; mimetype: string; originalname: string; size: number }, actor: string, tenant?: TenantAccessContext, meta?: AuditRequestMeta) => {
  if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) throw new AppError('El documento debe ser PDF o imagen', 400, 'COBERTURA_EXTERNO_DOCUMENT_MIME_INVALID');
  const externo = await dbQuery<{ id: string; empresa_id: string }>('SELECT id::text, empresa_id::text FROM cobertura_externos WHERE id=$1 AND activo=TRUE', [externoId]);
  const row = externo.rows[0]; if (!row) throw new AppError('Identidad externa no encontrada', 404, 'COBERTURA_EXTERNO_NOT_FOUND');
  assertTenantCompany(tenant, Number(row.empresa_id));
  const current = await dbQuery<{ id: string; version: number }>('SELECT id::text,version FROM cobertura_externo_documentos WHERE externo_id=$1 AND tipo_documento=$2 AND activo=TRUE AND es_vigente=TRUE', [externoId,tipo]);
  const version = Number(current.rows[0]?.version ?? 0) + 1;
  const path = `cobertura/externos/${externoId}/${tipo}/${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]+/g, '-')}`;
  const stored = await upload(path, file.buffer, file.mimetype);
  await dbQuery('UPDATE cobertura_externo_documentos SET es_vigente=FALSE WHERE externo_id=$1 AND tipo_documento=$2 AND es_vigente=TRUE', [externoId,tipo]);
  const saved = await dbQuery(`INSERT INTO cobertura_externo_documentos (externo_id,tipo_documento,storage_bucket,storage_path,nombre_original,mime_type,tamano_bytes,version,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id::text,version,storage_bucket,storage_path,nombre_original,mime_type`, [externoId,tipo,stored.bucket,stored.path,file.originalname,file.mimetype,file.size,version,actor]);
  await registerAuditEntry({usuario_id:actor,accion:'COBERTURA_EXTERNO_DOCUMENT_UPLOAD',tabla:'cobertura_externo_documentos',registro_id:saved.rows[0]?.id ?? '',descripcion:'Carga o reemplazo de documento de identidad externa',after:{externo_id:externoId,tipo,version},ip:meta?.ip,user_agent:meta?.user_agent});
  return saved.rows[0];
};

export const listCoberturaExternoDocumentos = async (externoId: number, tenant?: TenantAccessContext) => {
  const result = await dbQuery<{ id: string; tipo_documento: string; nombre_original: string; version: number; es_vigente: boolean; storage_bucket: string; storage_path: string }>('SELECT d.id::text,d.tipo_documento,d.nombre_original,d.version,d.es_vigente,d.storage_bucket,d.storage_path FROM cobertura_externo_documentos d INNER JOIN cobertura_externos e ON e.id=d.externo_id WHERE d.externo_id=$1 AND d.activo=TRUE AND e.activo=TRUE ORDER BY d.tipo_documento,d.version DESC', [externoId]);
  const empresa = await dbQuery<{ empresa_id: string }>('SELECT empresa_id::text FROM cobertura_externos WHERE id=$1', [externoId]);
  if (!empresa.rows[0]) throw new AppError('Identidad externa no encontrada',404,'COBERTURA_EXTERNO_NOT_FOUND');
  assertTenantCompany(tenant, Number(empresa.rows[0].empresa_id));
  return Promise.all(result.rows.map(async (document) => ({ ...document, url: await createDocumentSignedUrlForBucket(document.storage_bucket, document.storage_path, 300) })));
};

export const getCoberturaExternoDocumentoDownload = async (documentoId: number, tenant?: TenantAccessContext) => {
  const result = await dbQuery<{ empresa_id: string; storage_bucket: string; storage_path: string; nombre_original: string; mime_type: string }>('SELECT e.empresa_id::text,d.storage_bucket,d.storage_path,d.nombre_original,d.mime_type FROM cobertura_externo_documentos d INNER JOIN cobertura_externos e ON e.id=d.externo_id WHERE d.id=$1 AND d.activo=TRUE AND e.activo=TRUE', [documentoId]);
  const row = result.rows[0];
  if (!row) throw new AppError('Documento externo no encontrado', 404, 'COBERTURA_EXTERNO_DOCUMENT_NOT_FOUND');
  assertTenantCompany(tenant, Number(row.empresa_id));
  return { url: await createDocumentSignedUrlForBucket(row.storage_bucket, row.storage_path, 300), nombre_original: row.nombre_original, mime_type: row.mime_type };
};

export const getCoberturaCuentaDownload = async (accountId: number, tenant?: TenantAccessContext) => {
  const result = await dbQuery<CuentaRow>('SELECT * FROM cobertura_cuentas_cobro_externas WHERE id=$1 AND activo=TRUE', [accountId]);
  const row = result.rows[0]; if (!row) throw new AppError('Cuenta de cobro no encontrada',404,'COBERTURA_CUENTA_NOT_FOUND');
  assertTenantCompany(tenant, Number(row.empresa_id)); assertTenantContract(tenant, Number(row.contrato_id));
  if (!row.generado_bucket || !row.generado_path) throw new AppError('La cuenta aún no tiene documento generado',409,'COBERTURA_CUENTA_DOCUMENT_MISSING');
  return { url: await createDocumentSignedUrlForBucket(row.generado_bucket,row.generado_path,300), estado: row.estado, numero_cuenta: row.numero_cuenta };
};

export const getCoberturaCuentaFirmadaDownload = async (accountId: number, tenant?: TenantAccessContext) => {
  const result = await dbQuery<CuentaRow>('SELECT * FROM cobertura_cuentas_cobro_externas WHERE id=$1 AND activo=TRUE', [accountId]);
  const row = result.rows[0]; if (!row) throw new AppError('Cuenta de cobro no encontrada',404,'COBERTURA_CUENTA_NOT_FOUND');
  assertTenantCompany(tenant, Number(row.empresa_id)); assertTenantContract(tenant, Number(row.contrato_id));
  if (row.estado !== 'FIRMADA' || !row.firmado_bucket || !row.firmado_path) throw new AppError('La cuenta aún no tiene PDF firmado',409,'COBERTURA_CUENTA_SIGNED_DOCUMENT_MISSING');
  return { url: await createDocumentSignedUrlForBucket(row.firmado_bucket,row.firmado_path,300), estado: row.estado, numero_cuenta: row.numero_cuenta };
};

export const uploadCoberturaCuentaFirmada = async (accountId: number, file: { buffer: Buffer; mimetype: string; originalname: string }, actor: string, tenant?: TenantAccessContext, meta?: AuditRequestMeta) => {
  const result = await dbQuery<CuentaRow>('SELECT * FROM cobertura_cuentas_cobro_externas WHERE id=$1 AND activo=TRUE', [accountId]);
  const row = result.rows[0]; if (!row) throw new AppError('Cuenta de cobro no encontrada',404,'COBERTURA_CUENTA_NOT_FOUND');
  assertTenantCompany(tenant, Number(row.empresa_id)); assertTenantContract(tenant, Number(row.contrato_id));
  if (row.estado !== 'GENERADA') throw new AppError('Solo una cuenta GENERADA puede marcarse como firmada',409,'COBERTURA_CUENTA_SIGNATURE_INVALID_STATE');
  if (file.mimetype !== 'application/pdf') throw new AppError('La cuenta firmada debe ser un PDF', 400, 'COBERTURA_CUENTA_SIGNED_MIME_INVALID');
  const stored = await upload(`cobertura/cuentas-cobro/${accountId}/firmada-${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]+/g,'-')}`,file.buffer,file.mimetype);
  const updated = await dbQuery<CuentaRow>(`UPDATE cobertura_cuentas_cobro_externas SET estado='FIRMADA',firmado_bucket=$2,firmado_path=$3,firmado_at=NOW(),updated_by=$4,updated_at=NOW() WHERE id=$1 RETURNING *`,[accountId,stored.bucket,stored.path,actor]);
  await registerAuditEntry({usuario_id:actor,accion:'COBERTURA_CUENTA_FIRMADA_UPLOAD',tabla:'cobertura_cuentas_cobro_externas',registro_id:String(accountId),descripcion:'Carga de cuenta de cobro firmada de cobertura',after:{path:stored.path},ip:meta?.ip,user_agent:meta?.user_agent});
  return updated.rows[0];
};
