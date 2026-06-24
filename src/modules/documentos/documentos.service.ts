import { randomUUID } from 'node:crypto';
import { PoolClient, QueryResultRow } from 'pg';

import { env } from '../../config/env';
import { dbPool, dbQuery } from '../../config/db';
import { registerAuditEntry } from '../auditoria/auditoria.helper';
import {
  assertTenantAccessForPersonaId,
  assertTenantAccessForVinculacionId,
  TenantAccessContext
} from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import { createDocumentSignedUrl, uploadDocumentToStorage } from './documentos.storage';
import {
  normalizeRequirementName,
  resolveDocumentCodeByRequirementName
} from './documentos.equivalencias';
import { UpdateDocumentoInput, UploadDocumentoInput } from './documentos.schemas';
import {
  ensurePersonaExists,
  ensureTipoDocumentoExists,
  ensureVinculacionExists
} from './documentos.validator';

interface DocumentoBaseRow extends QueryResultRow {
  activo: boolean;
  archivo_path: string | null;
  fecha_carga: Date | string | null;
  fecha_expedicion: Date | string | null;
  fecha_vencimiento: Date | string | null;
  id: string;
  mime_type: string;
  nombre_original: string;
  storage_bucket: string;
  storage_path: string;
  tamano_bytes: number;
  tipo_documento_id: string;
  tipo_documento_nombre: string | null;
}

interface DocumentoPersonaRow extends DocumentoBaseRow {
  persona_id: string;
  vinculacion_id: string | null;
  version: number | string;
  documento_reemplaza_id: string | null;
  es_vigente: boolean;
}

interface DocumentoVinculacionRow extends DocumentoBaseRow {
  contrato_cargo_id: string | null;
  contrato_id: string | null;
  persona_id: string | null;
  vinculacion_id: string;
}

interface ChecklistRequirementBaseRow extends QueryResultRow {
  activo: boolean;
  descripcion: string | null;
  id: string;
  nombre_requisito: string;
  obligatorio: boolean;
  tipo_requisito: string | null;
}

interface ChecklistLoadedRow extends QueryResultRow {
  activo: boolean;
  fecha_vencimiento: Date | string | null;
  id: string;
  nombre_original: string;
  tipo_documento_id: string;
  tipo_documento_nombre: string | null;
}

interface PersonaDocumentoSummaryRow extends QueryResultRow {
  es_vigente: boolean;
  fecha_expedicion: Date | string | null;
  fecha_vencimiento: Date | string | null;
  nombre_original: string;
  storage_bucket: string;
  storage_path: string;
  tipo_documento: string | null;
  version: number | string;
}

interface DownloadLookupRow extends QueryResultRow {
  activo: boolean;
  document_scope: 'PERSONA' | 'VINCULACION';
  id: string;
  persona_id: string | null;
  mime_type: string;
  nombre_original: string;
  contrato_id: string | null;
  storage_bucket: string;
  storage_path: string;
  vinculacion_id: string | null;
}

export interface DocumentoPersona {
  activo: boolean;
  archivo_path: string | null;
  fecha_carga: string | null;
  fecha_expedicion: string | null;
  fecha_vencimiento: string | null;
  id: string;
  mime_type: string;
  nombre_original: string;
  persona_id: string;
  storage_bucket: string;
  storage_path: string;
  tamano_bytes: number;
  tipo_documento_id: string;
  tipo_documento_nombre: string | null;
  vinculacion_id: string | null;
  version: number;
  documento_reemplaza_id: string | null;
  es_vigente: boolean;
}

export interface DocumentoVinculacion {
  activo: boolean;
  archivo_path: string | null;
  fecha_carga: string | null;
  fecha_expedicion: string | null;
  fecha_vencimiento: string | null;
  id: string;
  mime_type: string;
  nombre_original: string;
  persona_id: string | null;
  storage_bucket: string;
  storage_path: string;
  tamano_bytes: number;
  tipo_documento_id: string;
  tipo_documento_nombre: string | null;
  vinculacion_id: string;
  contrato_id: string | null;
  contrato_cargo_id: string | null;
}

export interface DocumentoDownloadInfo {
  document_scope: 'PERSONA' | 'VINCULACION';
  download_url: string;
  expires_in_seconds: number;
  id: string;
  mime_type: string;
  nombre_original: string;
}

export interface ChecklistItem {
  codigo: string | null;
  documento_id: number | null;
  estado: 'CARGADO' | 'FALTANTE' | 'VENCIDO';
  fecha_vencimiento: string | null;
  fuente_documento: 'PERSONA' | 'VINCULACION' | null;
  nombre_requisito: string;
  observacion: string | null;
  obligatorio: boolean;
  origen: 'GENERAL' | 'CARGO';
  requisito_id: number;
  tipo_documento_id: number | null;
  tipo_documento_nombre: string | null;
  tipo_requisito: string | null;
}

interface TipoDocumentoChecklistRow extends QueryResultRow {
  codigo: string;
  id: string;
  nombre_documento: string | null;
}

export interface PersonaDocumentoSummaryItem {
  es_vigente: boolean;
  fecha_expedicion: string | null;
  fecha_vencimiento: string | null;
  nombre_original: string;
  storage_bucket: string;
  storage_path: string;
  tipo_documento: string | null;
  version: number;
}

export interface VinculacionChecklist {
  cargados: number;
  contrato_cargo_id: number;
  contrato_id: number;
  cumplimiento_porcentaje: number;
  faltantes: number;
  persona_id: number;
  requisitos: ChecklistItem[];
  total_requisitos: number;
  vinculacion_id: number;
  vencidos: number;
}

const toDateString = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value;
};

const toNumber = (value: number | string): number => {
  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    throw new AppError('Invalid numeric value returned by database', 500, 'INVALID_NUMERIC_VALUE');
  }

  return parsed;
};

const buildTestStoragePath = (personaId: number, nombreOriginal: string): string => {
  return `test/persona_${personaId}/${Date.now()}_${nombreOriginal}`;
};

const normalizeDocumentKey = (value: string): string => {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^A-Z0-9_]/g, '');
};

const normalizeExactMatchKey = (value: string): string => {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
};

const registerDocumentAudit = async (input: {
  action: 'DOCUMENT_UPLOAD' | 'DOCUMENT_REPLACE' | 'DOCUMENT_DEACTIVATE' | 'DOCUMENT_GENERATED';
  actorUserId: string;
  after?: unknown;
  before?: unknown;
  descripcion: string;
  registroId: string;
  tabla: 'documentos_persona' | 'documentos_vinculacion';
}): Promise<void> => {
  try {
    await registerAuditEntry({
      usuario_id: input.actorUserId,
      accion: input.action,
      tabla: input.tabla,
      registro_id: input.registroId,
      descripcion: input.descripcion,
      before: input.before,
      after: input.after
    });
  } catch (error) {
    console.error('Failed to register document audit entry', {
      action: input.action,
      error,
      registro_id: input.registroId,
      tabla: input.tabla
    });
  }
};

const mapDocumentoPersona = (row: DocumentoPersonaRow): DocumentoPersona => {
  return {
    id: row.id,
    persona_id: row.persona_id,
    vinculacion_id: row.vinculacion_id,
    tipo_documento_id: row.tipo_documento_id,
    tipo_documento_nombre: row.tipo_documento_nombre,
    archivo_path: row.archivo_path,
    storage_bucket: row.storage_bucket,
    storage_path: row.storage_path,
    nombre_original: row.nombre_original,
    mime_type: row.mime_type,
    tamano_bytes: row.tamano_bytes,
    fecha_expedicion: toDateString(row.fecha_expedicion),
    fecha_vencimiento: toDateString(row.fecha_vencimiento),
    activo: row.activo,
    fecha_carga: toDateString(row.fecha_carga),
    version: Number(row.version),
    documento_reemplaza_id: row.documento_reemplaza_id,
    es_vigente: row.es_vigente
  };
};

const mapDocumentoVinculacion = (row: DocumentoVinculacionRow): DocumentoVinculacion => {
  return {
    id: row.id,
    vinculacion_id: row.vinculacion_id,
    persona_id: row.persona_id,
    contrato_id: row.contrato_id,
    contrato_cargo_id: row.contrato_cargo_id,
    tipo_documento_id: row.tipo_documento_id,
    tipo_documento_nombre: row.tipo_documento_nombre,
    archivo_path: row.archivo_path,
    storage_bucket: row.storage_bucket,
    storage_path: row.storage_path,
    nombre_original: row.nombre_original,
    mime_type: row.mime_type,
    tamano_bytes: row.tamano_bytes,
    fecha_expedicion: toDateString(row.fecha_expedicion),
    fecha_vencimiento: toDateString(row.fecha_vencimiento),
    activo: row.activo,
    fecha_carga: toDateString(row.fecha_carga)
  };
};

const getDocumentoPersonaSelect = (): string => {
  return `
    SELECT
      dp.id::text AS id,
      dp.persona_id::text AS persona_id,
      dp.vinculacion_id::text AS vinculacion_id,
      dp.tipo_documento_id::text AS tipo_documento_id,
      td.nombre_documento AS tipo_documento_nombre,
      dp.archivo_path,
      dp.storage_bucket,
      dp.storage_path,
      dp.nombre_original,
      dp.mime_type,
      dp.tamano_bytes,
      dp.fecha_expedicion,
      dp.fecha_vencimiento,
      dp.activo,
      dp.fecha_carga,
      dp.version,
      dp.documento_reemplaza_id::text AS documento_reemplaza_id,
      dp.es_vigente
    FROM documentos_persona dp
    INNER JOIN tipos_documentos td ON td.id = dp.tipo_documento_id
  `;
};

const getDocumentoVinculacionSelect = (): string => {
  return `
    SELECT
      dv.id::text AS id,
      dv.vinculacion_id::text AS vinculacion_id,
      v.persona_id::text AS persona_id,
      v.contrato_id::text AS contrato_id,
      v.contrato_cargo_id::text AS contrato_cargo_id,
      dv.tipo_documento_id::text AS tipo_documento_id,
      td.nombre_documento AS tipo_documento_nombre,
      dv.archivo_path,
      dv.storage_bucket,
      dv.storage_path,
      dv.nombre_original,
      dv.mime_type,
      dv.tamano_bytes,
      dv.fecha_expedicion,
      dv.fecha_vencimiento,
      dv.activo,
      dv.fecha_carga
    FROM documentos_vinculacion dv
    INNER JOIN vinculaciones v ON v.id = dv.vinculacion_id
    INNER JOIN tipos_documentos td ON td.id = dv.tipo_documento_id
  `;
};

const getDocumentoPersonaByIdForUpdate = async (
  client: PoolClient,
  documentoId: string
): Promise<DocumentoPersonaRow | null> => {
  const result = await client.query<DocumentoPersonaRow>(
    `
      ${getDocumentoPersonaSelect()}
      WHERE dp.id::text = $1
      LIMIT 1
      FOR UPDATE
    `,
    [documentoId]
  );

  return result.rows[0] ?? null;
};

const getDocumentoVinculacionByIdForUpdate = async (
  client: PoolClient,
  documentoId: string
): Promise<DocumentoVinculacionRow | null> => {
  const result = await client.query<DocumentoVinculacionRow>(
    `
      ${getDocumentoVinculacionSelect()}
      WHERE dv.id::text = $1
      LIMIT 1
      FOR UPDATE
    `,
    [documentoId]
  );

  return result.rows[0] ?? null;
};

interface PersonaDocumentoVersionRow extends QueryResultRow {
  id: string;
  es_vigente: boolean;
  version: number | string;
}

const getLatestPersonaDocumentoVersion = async (
  client: PoolClient,
  personaId: string,
  tipoDocumentoId: string
): Promise<PersonaDocumentoVersionRow | null> => {
  const result = await client.query<PersonaDocumentoVersionRow>(
    `
      SELECT
        id::text AS id,
        es_vigente,
        version
      FROM documentos_persona
      WHERE persona_id::text = $1
        AND tipo_documento_id::text = $2
      ORDER BY version DESC, fecha_carga DESC, id DESC
      LIMIT 1
      FOR UPDATE
    `,
    [personaId, tipoDocumentoId]
  );

  return result.rows[0] ?? null;
};

const getLatestPersonaVigenteDocumento = async (
  client: PoolClient,
  personaId: string,
  tipoDocumentoId: string
): Promise<PersonaDocumentoVersionRow | null> => {
  const result = await client.query<PersonaDocumentoVersionRow>(
    `
      SELECT
        id::text AS id,
        es_vigente,
        version
      FROM documentos_persona
      WHERE persona_id::text = $1
        AND tipo_documento_id::text = $2
        AND es_vigente = TRUE
      ORDER BY version DESC, fecha_carga DESC, id DESC
      LIMIT 1
      FOR UPDATE
    `,
    [personaId, tipoDocumentoId]
  );

  return result.rows[0] ?? null;
};

export const uploadPersonaDocumento = async (
  personaId: string,
  file: Express.Multer.File,
  input: UploadDocumentoInput,
  actorUserId: string,
  tenant?: TenantAccessContext
): Promise<DocumentoPersona> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await ensurePersonaExists(personaId, client);
    await assertTenantAccessForPersonaId(tenant, personaId);
    await ensureTipoDocumentoExists(input.tipo_documento_id, client);

    const latestVersion = await getLatestPersonaDocumentoVersion(
      client,
      personaId,
      input.tipo_documento_id
    );
    const latestVigente = await getLatestPersonaVigenteDocumento(
      client,
      personaId,
      input.tipo_documento_id
    );

    if (latestVigente) {
      await client.query(
        `
          UPDATE documentos_persona
          SET es_vigente = FALSE
          WHERE persona_id::text = $1
            AND tipo_documento_id::text = $2
            AND es_vigente = TRUE
        `,
        [personaId, input.tipo_documento_id]
      );
    }

    const storage = await uploadDocumentToStorage({
      scope: 'personas',
      targetId: personaId,
      tipoDocumentoId: input.tipo_documento_id,
      originalFileName: file.originalname,
      fileBuffer: file.buffer,
      mimeType: file.mimetype
    });

    const result = await client.query<DocumentoPersonaRow>(
      `
        INSERT INTO documentos_persona (
          persona_id,
          tipo_documento_id,
          vinculacion_id,
          archivo_path,
          storage_bucket,
          storage_path,
          nombre_original,
          mime_type,
          tamano_bytes,
          fecha_expedicion,
          fecha_vencimiento,
          fecha_carga,
          activo,
          version,
          documento_reemplaza_id,
          es_vigente
        )
        VALUES (
          $1::bigint,
          $2::bigint,
          NULL,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          NOW(),
          TRUE,
          $11,
          $12::bigint,
          TRUE
        )
        RETURNING
          id::text AS id,
          persona_id::text AS persona_id,
          vinculacion_id::text AS vinculacion_id,
          tipo_documento_id::text AS tipo_documento_id,
          (SELECT nombre_documento FROM tipos_documentos WHERE id = $2::bigint) AS tipo_documento_nombre,
          archivo_path,
          storage_bucket,
          storage_path,
          nombre_original,
          mime_type,
          tamano_bytes,
          fecha_expedicion,
          fecha_vencimiento,
          activo,
          fecha_carga,
          version,
          documento_reemplaza_id::text AS documento_reemplaza_id,
          es_vigente
      `,
      [
        personaId,
        input.tipo_documento_id,
        storage.path,
        storage.bucket,
        storage.path,
        file.originalname,
        file.mimetype,
        file.size,
        input.fecha_expedicion,
        input.fecha_vencimiento,
        Number(latestVersion?.version ?? 0) + 1,
        latestVigente?.id ?? null
      ]
    );

    const created = result.rows[0];

    if (!created) {
      throw new AppError('Failed to create persona document', 500, 'DOCUMENTO_PERSONA_CREATE_FAILED');
    }

    const document = mapDocumentoPersona(created);

    void registerDocumentAudit({
      action: 'DOCUMENT_UPLOAD',
      actorUserId,
      after: document,
      descripcion: 'Carga de documento de persona',
      registroId: document.id,
      tabla: 'documentos_persona'
    });

    await client.query('COMMIT');
    return document;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const createTestPersonaDocumento = async (
  input: {
    fecha_expedicion: string;
    fecha_vencimiento: string;
    mime_type: string;

    nombre_original: string;
    persona_id: number;
    tamano_bytes: number;
    tipo_documento_id: number;
  },
  actorUserId: string,
  tenant?: TenantAccessContext
): Promise<DocumentoPersona> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const personaId = String(input.persona_id);
    const tipoDocumentoId = String(input.tipo_documento_id);

    await ensurePersonaExists(personaId, client);
    await assertTenantAccessForPersonaId(tenant, personaId);
    await ensureTipoDocumentoExists(tipoDocumentoId, client);

    const latestVersion = await getLatestPersonaDocumentoVersion(client, personaId, tipoDocumentoId);
    const latestVigente = await getLatestPersonaVigenteDocumento(client, personaId, tipoDocumentoId);

    if (latestVigente) {
      await client.query(
        `
          UPDATE documentos_persona
          SET es_vigente = FALSE
          WHERE id::text = $1
        `,
        [latestVigente.id]
      );
    }

    const storagePath = buildTestStoragePath(input.persona_id, input.nombre_original);
    const version = Number(latestVersion?.version ?? 0) + 1;
    const documentoReemplazaId = latestVigente?.id ?? null;

    const result = await client.query<DocumentoPersonaRow>(
      `
        INSERT INTO documentos_persona (
          persona_id,
          tipo_documento_id,
          fecha_expedicion,
          fecha_vencimiento,
          archivo_path,
          fecha_carga,
          activo,
          vinculacion_id,
          version,
          documento_reemplaza_id,
          es_vigente,
          storage_bucket,
          storage_path,
          nombre_original,
          mime_type,
          tamano_bytes
        )
        VALUES (
          $1::bigint,
          $2::bigint,
          $3::date,
          $4::date,
          $5,
          NOW(),
          TRUE,
          NULL,
          $6::int,
          $7::bigint,
          TRUE,
          $8,
          $9,
          $10,
          $11,
          $12::bigint
        )
        RETURNING
          id::text AS id,
          persona_id::text AS persona_id,
          vinculacion_id::text AS vinculacion_id,
          tipo_documento_id::text AS tipo_documento_id,
          (SELECT nombre_documento FROM tipos_documentos WHERE id = $2::bigint) AS tipo_documento_nombre,
          archivo_path,
          storage_bucket,
          storage_path,
          nombre_original,
          mime_type,
          tamano_bytes,
          fecha_expedicion,
          fecha_vencimiento,
          activo,
          fecha_carga,
          version,
          documento_reemplaza_id::text AS documento_reemplaza_id,
          es_vigente
      `,
      [
        personaId,
        tipoDocumentoId,
        input.fecha_expedicion,
        input.fecha_vencimiento,
        storagePath,
        version,
        documentoReemplazaId,
        env.SUPABASE_STORAGE_BUCKET,
        storagePath,
        input.nombre_original,
        input.mime_type,
        input.tamano_bytes
      ]
    );

    const created = result.rows[0];

    if (!created) {
      throw new AppError('Failed to create test persona document', 500, 'DOCUMENTO_TEST_CREATE_FAILED');
    }

    const document = mapDocumentoPersona(created);

    void registerDocumentAudit({
      action: 'DOCUMENT_UPLOAD',
      actorUserId,
      after: document,
      descripcion: 'Carga de documento de prueba de persona',
      registroId: document.id,
      tabla: 'documentos_persona'
    });

    await client.query('COMMIT');
    return document;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const listPersonaDocumentosForValidation = async (
  personaId: number,
  tenant?: TenantAccessContext
): Promise<PersonaDocumentoSummaryItem[]> => {
  await assertTenantAccessForPersonaId(tenant, personaId);

  const result = await dbQuery<PersonaDocumentoSummaryRow>(
    `
      SELECT
        td.nombre_documento AS tipo_documento,
        dp.nombre_original,
        dp.version,
        dp.es_vigente,
        dp.fecha_expedicion,
        dp.fecha_vencimiento,
        dp.storage_bucket,
        dp.storage_path
      FROM documentos_persona dp
      INNER JOIN tipos_documentos td ON td.id = dp.tipo_documento_id
      WHERE dp.persona_id = $1::bigint
      ORDER BY dp.es_vigente DESC, dp.version DESC, dp.fecha_carga DESC, dp.id DESC
    `,
    [personaId]
  );

  return result.rows.map((row) => ({
    tipo_documento: row.tipo_documento,
    nombre_original: row.nombre_original,
    version: Number(row.version),
    es_vigente: row.es_vigente,
    fecha_expedicion: toDateString(row.fecha_expedicion),
    fecha_vencimiento: toDateString(row.fecha_vencimiento),
    storage_bucket: row.storage_bucket,
    storage_path: row.storage_path
  }));
};

export const uploadVinculacionDocumento = async (
  vinculacionId: string,
  file: Express.Multer.File,
  input: UploadDocumentoInput,
  actorUserId: string,
  tenant?: TenantAccessContext
): Promise<DocumentoVinculacion> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await ensureVinculacionExists(vinculacionId, client);
    await assertTenantAccessForVinculacionId(tenant, vinculacionId);
    await ensureTipoDocumentoExists(input.tipo_documento_id, client);

    const storage = await uploadDocumentToStorage({
      scope: 'vinculaciones',
      targetId: vinculacionId,
      tipoDocumentoId: input.tipo_documento_id,
      originalFileName: file.originalname,
      fileBuffer: file.buffer,
      mimeType: file.mimetype
    });

    const result = await client.query<DocumentoVinculacionRow>(
      `
        INSERT INTO documentos_vinculacion (
          vinculacion_id,
          tipo_documento_id,
          archivo_path,
          storage_bucket,
          storage_path,
          nombre_original,
          mime_type,
          tamano_bytes,
          fecha_expedicion,
          fecha_vencimiento,
          fecha_carga,
          activo
        )
        VALUES (
          $1::bigint,
          $2::bigint,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          NOW(),
          TRUE
        )
        RETURNING
          id::text AS id,
          vinculacion_id::text AS vinculacion_id,
          (SELECT persona_id::text FROM vinculaciones WHERE id = $1::bigint) AS persona_id,
          (SELECT contrato_id::text FROM vinculaciones WHERE id = $1::bigint) AS contrato_id,
          (SELECT contrato_cargo_id::text FROM vinculaciones WHERE id = $1::bigint) AS contrato_cargo_id,
          tipo_documento_id::text AS tipo_documento_id,
          (SELECT nombre_documento FROM tipos_documentos WHERE id = $2::bigint) AS tipo_documento_nombre,
          archivo_path,
          storage_bucket,
          storage_path,
          nombre_original,
          mime_type,
          tamano_bytes,
          fecha_expedicion,
          fecha_vencimiento,
          activo,
          fecha_carga
      `,
      [
        vinculacionId,
        input.tipo_documento_id,
        storage.path,
        storage.bucket,
        storage.path,
        file.originalname,
        file.mimetype,
        file.size,
        input.fecha_expedicion,
        input.fecha_vencimiento
      ]
    );

    const created = result.rows[0];

    if (!created) {
      throw new AppError(
        'Failed to create vinculacion document',
        500,
        'DOCUMENTO_VINCULACION_CREATE_FAILED'
      );
    }

    const document = mapDocumentoVinculacion(created);

    void registerDocumentAudit({
      action: 'DOCUMENT_UPLOAD',
      actorUserId,
      after: document,
      descripcion: 'Carga de documento de vinculacion',
      registroId: document.id,
      tabla: 'documentos_vinculacion'
    });

    await client.query('COMMIT');
    return document;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const listPersonaDocumentos = async (
  personaId: string,
  tenant?: TenantAccessContext
): Promise<DocumentoPersona[]> => {
  await ensurePersonaExists(personaId);
  await assertTenantAccessForPersonaId(tenant, personaId);

  const result = await dbQuery<DocumentoPersonaRow>(
    `
      ${getDocumentoPersonaSelect()}
      WHERE dp.persona_id::text = $1
      ORDER BY dp.es_vigente DESC, dp.version DESC, dp.fecha_carga DESC
    `,
    [personaId]
  );

  return result.rows.map(mapDocumentoPersona);
};

export const listVinculacionDocumentos = async (
  vinculacionId: string,
  tenant?: TenantAccessContext
): Promise<DocumentoVinculacion[]> => {
  await ensureVinculacionExists(vinculacionId);
  await assertTenantAccessForVinculacionId(tenant, vinculacionId);

  const result = await dbQuery<DocumentoVinculacionRow>(
    `
      ${getDocumentoVinculacionSelect()}
      WHERE dv.vinculacion_id::text = $1
      ORDER BY dv.activo DESC, dv.fecha_carga DESC
    `,
    [vinculacionId]
  );

  return result.rows.map(mapDocumentoVinculacion);
};

const DOCUMENTO_PERSONA_DOWNLOAD_LOOKUP = `
  SELECT
    dp.id::text AS id,
    'PERSONA'::text AS document_scope,
    dp.persona_id::text AS persona_id,
    dp.vinculacion_id::text AS vinculacion_id,
    NULL::text AS contrato_id,
    dp.storage_bucket,
    COALESCE(dp.storage_path, dp.archivo_path) AS storage_path,
    dp.nombre_original,
    dp.mime_type,
    dp.activo
  FROM documentos_persona dp
  WHERE dp.id::text = $1
`;

const DOCUMENTO_VINCULACION_DOWNLOAD_LOOKUP = `
  SELECT
    dv.id::text AS id,
    'VINCULACION'::text AS document_scope,
    v.persona_id::text AS persona_id,
    dv.vinculacion_id::text AS vinculacion_id,
    v.contrato_id::text AS contrato_id,
    dv.storage_bucket,
    COALESCE(dv.storage_path, dv.archivo_path) AS storage_path,
    dv.nombre_original,
    dv.mime_type,
    dv.activo
  FROM documentos_vinculacion dv
  INNER JOIN vinculaciones v ON v.id = dv.vinculacion_id
  WHERE dv.id::text = $1
`;

export const getDocumentoDownloadUrl = async (
  documentoId: string,
  tenant?: TenantAccessContext,
  scope?: 'persona' | 'vinculacion'
): Promise<DocumentoDownloadInfo> => {
  // documentos_persona.id y documentos_vinculacion.id son secuencias independientes:
  // sin `scope`, la misma id numérica puede existir en ambas tablas y esta consulta
  // combinada solo puede devolver una (la primera que encuentre). Cuando el llamador
  // ya sabe el scope (caso normal desde el frontend), se evita la ambigüedad.
  const query =
    scope === 'persona'
      ? DOCUMENTO_PERSONA_DOWNLOAD_LOOKUP
      : scope === 'vinculacion'
        ? DOCUMENTO_VINCULACION_DOWNLOAD_LOOKUP
        : `${DOCUMENTO_PERSONA_DOWNLOAD_LOOKUP} UNION ALL ${DOCUMENTO_VINCULACION_DOWNLOAD_LOOKUP} LIMIT 1`;

  const result = await dbQuery<DownloadLookupRow>(query, [documentoId]);

  const document = result.rows[0];

  if (!document || !document.activo) {
    throw new AppError('Document not found', 404, 'DOCUMENTO_NOT_FOUND');
  }

  if (document.document_scope === 'VINCULACION' && document.vinculacion_id) {
    await assertTenantAccessForVinculacionId(tenant, document.vinculacion_id);
  } else if (document.persona_id) {
    await assertTenantAccessForPersonaId(tenant, document.persona_id);
  }

  const expiresInSeconds = 3600;
  const downloadUrl = await createDocumentSignedUrl(document.storage_path, expiresInSeconds);

  return {
    id: document.id,
    document_scope: document.document_scope,
    download_url: downloadUrl,
    expires_in_seconds: expiresInSeconds,
    nombre_original: document.nombre_original,
    mime_type: document.mime_type
  };
};

export const updatePersonaDocumento = async (
  documentoId: string,
  input: UpdateDocumentoInput,
  actorUserId: string,
  tenant?: TenantAccessContext
): Promise<DocumentoPersona> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const current = await getDocumentoPersonaByIdForUpdate(client, documentoId);

    if (!current) {
      throw new AppError('Documento persona not found', 404, 'DOCUMENTO_PERSONA_NOT_FOUND');
    }

    if (current.vinculacion_id) {
      await assertTenantAccessForVinculacionId(tenant, current.vinculacion_id);
    } else {
      await assertTenantAccessForPersonaId(tenant, current.persona_id);
    }

    if (input.tipo_documento_id) {
      await ensureTipoDocumentoExists(input.tipo_documento_id, client);
    }

    const nextTipoDocumentoId = input.tipo_documento_id ?? current.tipo_documento_id;
    const nextFechaExpedicion =
      input.fecha_expedicion !== undefined
        ? input.fecha_expedicion
        : toDateString(current.fecha_expedicion);
    const nextFechaVencimiento =
      input.fecha_vencimiento !== undefined
        ? input.fecha_vencimiento
        : toDateString(current.fecha_vencimiento);
    const nextActivo = input.activo ?? current.activo;

    const result = await client.query<DocumentoPersonaRow>(
      `
        UPDATE documentos_persona
        SET
          tipo_documento_id = $2::bigint,
          fecha_expedicion = $3,
          fecha_vencimiento = $4,
          activo = $5
        WHERE id::text = $1
        RETURNING
          id::text AS id,
          persona_id::text AS persona_id,
          vinculacion_id::text AS vinculacion_id,
          tipo_documento_id::text AS tipo_documento_id,
          (SELECT nombre_documento FROM tipos_documentos WHERE id = $2::bigint) AS tipo_documento_nombre,
          archivo_path,
          storage_bucket,
          storage_path,
          nombre_original,
          mime_type,
          tamano_bytes,
          fecha_expedicion,
          fecha_vencimiento,
          activo,
          fecha_carga,
          version,
          documento_reemplaza_id::text AS documento_reemplaza_id,
          es_vigente
      `,
      [
        documentoId,
        nextTipoDocumentoId,
        nextFechaExpedicion,
        nextFechaVencimiento,
        nextActivo
      ]
    );

    const updated = result.rows[0];

    if (!updated) {
      throw new AppError('Failed to update persona document', 500, 'DOCUMENTO_PERSONA_UPDATE_FAILED');
    }

    const updatedDocument = mapDocumentoPersona(updated);

    void registerDocumentAudit({
      action: 'DOCUMENT_REPLACE',
      actorUserId,
      before: mapDocumentoPersona(current),
      after: updatedDocument,
      descripcion: 'Actualizacion de documento de persona',
      registroId: updatedDocument.id,
      tabla: 'documentos_persona'
    });

    await client.query('COMMIT');
    return updatedDocument;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateVinculacionDocumento = async (
  documentoId: string,
  input: UpdateDocumentoInput,
  actorUserId: string,
  tenant?: TenantAccessContext
): Promise<DocumentoVinculacion> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const current = await getDocumentoVinculacionByIdForUpdate(client, documentoId);

    if (!current) {
      throw new AppError(
        'Documento vinculacion not found',
        404,
        'DOCUMENTO_VINCULACION_NOT_FOUND'
      );
    }

    await assertTenantAccessForVinculacionId(tenant, current.vinculacion_id);

    if (input.tipo_documento_id) {
      await ensureTipoDocumentoExists(input.tipo_documento_id, client);
    }

    const nextTipoDocumentoId = input.tipo_documento_id ?? current.tipo_documento_id;
    const nextFechaExpedicion =
      input.fecha_expedicion !== undefined
        ? input.fecha_expedicion
        : toDateString(current.fecha_expedicion);
    const nextFechaVencimiento =
      input.fecha_vencimiento !== undefined
        ? input.fecha_vencimiento
        : toDateString(current.fecha_vencimiento);
    const nextActivo = input.activo ?? current.activo;

    const result = await client.query<DocumentoVinculacionRow>(
      `
        UPDATE documentos_vinculacion
        SET
          tipo_documento_id = $2::bigint,
          fecha_expedicion = $3,
          fecha_vencimiento = $4,
          activo = $5
        WHERE id::text = $1
        RETURNING
          id::text AS id,
          vinculacion_id::text AS vinculacion_id,
          (SELECT persona_id::text FROM vinculaciones WHERE id = documentos_vinculacion.vinculacion_id) AS persona_id,
          (SELECT contrato_id::text FROM vinculaciones WHERE id = documentos_vinculacion.vinculacion_id) AS contrato_id,
          (SELECT contrato_cargo_id::text FROM vinculaciones WHERE id = documentos_vinculacion.vinculacion_id) AS contrato_cargo_id,
          tipo_documento_id::text AS tipo_documento_id,
          (SELECT nombre_documento FROM tipos_documentos WHERE id = $2::bigint) AS tipo_documento_nombre,
          storage_bucket,
          storage_path,
          archivo_path,
          nombre_original,
          mime_type,
          tamano_bytes,
          fecha_expedicion,
          fecha_vencimiento,
          activo,
          fecha_carga
      `,
      [
        documentoId,
        nextTipoDocumentoId,
        nextFechaExpedicion,
        nextFechaVencimiento,
        nextActivo
      ]
    );

    const updated = result.rows[0];

    if (!updated) {
      throw new AppError(
        'Failed to update vinculacion document',
        500,
        'DOCUMENTO_VINCULACION_UPDATE_FAILED'
      );
    }

    const updatedDocument = mapDocumentoVinculacion(updated);

    void registerDocumentAudit({
      action: 'DOCUMENT_REPLACE',
      actorUserId,
      before: mapDocumentoVinculacion(current),
      after: updatedDocument,
      descripcion: 'Actualizacion de documento de vinculacion',
      registroId: updatedDocument.id,
      tabla: 'documentos_vinculacion'
    });

    await client.query('COMMIT');
    return updatedDocument;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const deactivatePersonaDocumento = async (
  documentoId: string,
  actorUserId: string,
  tenant?: TenantAccessContext
): Promise<DocumentoPersona> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const current = await getDocumentoPersonaByIdForUpdate(client, documentoId);

    if (!current) {
      throw new AppError('Documento persona not found', 404, 'DOCUMENTO_PERSONA_NOT_FOUND');
    }

    if (current.vinculacion_id) {
      await assertTenantAccessForVinculacionId(tenant, current.vinculacion_id);
    } else {
      await assertTenantAccessForPersonaId(tenant, current.persona_id);
    }

    const result = await client.query<DocumentoPersonaRow>(
      `
        UPDATE documentos_persona
        SET
          activo = FALSE,
          es_vigente = FALSE
        WHERE id::text = $1
        RETURNING
          id::text AS id,
          persona_id::text AS persona_id,
          vinculacion_id::text AS vinculacion_id,
          tipo_documento_id::text AS tipo_documento_id,
          (SELECT nombre_documento FROM tipos_documentos WHERE id = documentos_persona.tipo_documento_id) AS tipo_documento_nombre,
          archivo_path,
          storage_bucket,
          storage_path,
          nombre_original,
          mime_type,
          tamano_bytes,
          fecha_expedicion,
          fecha_vencimiento,
          activo,
          fecha_carga,
          version,
          documento_reemplaza_id::text AS documento_reemplaza_id,
          es_vigente
      `,
      [documentoId]
    );

    const updated = result.rows[0];

    if (!updated) {
      throw new AppError(
        'Failed to deactivate persona document',
        500,
        'DOCUMENTO_PERSONA_DEACTIVATE_FAILED'
      );
    }

    const updatedDocument = mapDocumentoPersona(updated);

    void registerDocumentAudit({
      action: 'DOCUMENT_DEACTIVATE',
      actorUserId,
      before: mapDocumentoPersona(current),
      after: updatedDocument,
      descripcion: 'Desactivacion de documento de persona',
      registroId: updatedDocument.id,
      tabla: 'documentos_persona'
    });

    await client.query('COMMIT');
    return updatedDocument;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const deactivateVinculacionDocumento = async (
  documentoId: string,
  actorUserId: string,
  tenant?: TenantAccessContext
): Promise<DocumentoVinculacion> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const current = await getDocumentoVinculacionByIdForUpdate(client, documentoId);

    if (!current) {
      throw new AppError(
        'Documento vinculacion not found',
        404,
        'DOCUMENTO_VINCULACION_NOT_FOUND'
      );
    }

    await assertTenantAccessForVinculacionId(tenant, current.vinculacion_id);

    const result = await client.query<DocumentoVinculacionRow>(
      `
        UPDATE documentos_vinculacion
        SET
          activo = FALSE
        WHERE id::text = $1
        RETURNING
          id::text AS id,
          vinculacion_id::text AS vinculacion_id,
          (SELECT persona_id::text FROM vinculaciones WHERE id = documentos_vinculacion.vinculacion_id) AS persona_id,
          (SELECT contrato_id::text FROM vinculaciones WHERE id = documentos_vinculacion.vinculacion_id) AS contrato_id,
          (SELECT contrato_cargo_id::text FROM vinculaciones WHERE id = documentos_vinculacion.vinculacion_id) AS contrato_cargo_id,
          tipo_documento_id::text AS tipo_documento_id,
          (SELECT nombre_documento FROM tipos_documentos WHERE id = documentos_vinculacion.tipo_documento_id) AS tipo_documento_nombre,
          storage_bucket,
          storage_path,
          archivo_path,
          nombre_original,
          mime_type,
          tamano_bytes,
          fecha_expedicion,
          fecha_vencimiento,
          activo,
          fecha_carga
      `,
      [documentoId]
    );

    const updated = result.rows[0];

    if (!updated) {
      throw new AppError(
        'Failed to deactivate vinculacion document',
        500,
        'DOCUMENTO_VINCULACION_DEACTIVATE_FAILED'
      );
    }

    const updatedDocument = mapDocumentoVinculacion(updated);

    void registerDocumentAudit({
      action: 'DOCUMENT_DEACTIVATE',
      actorUserId,
      before: mapDocumentoVinculacion(current),
      after: updatedDocument,
      descripcion: 'Desactivacion de documento de vinculacion',
      registroId: updatedDocument.id,
      tabla: 'documentos_vinculacion'
    });

    await client.query('COMMIT');
    return updatedDocument;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const getVinculacionChecklist = async (
  vinculacionId: string,
  tenant?: TenantAccessContext,
  options?: {
    audit?: boolean;
  }
): Promise<VinculacionChecklist> => {
  await assertTenantAccessForVinculacionId(tenant, vinculacionId);
  const vinculacion = await ensureVinculacionExists(vinculacionId);

  const [requirementsResult, tiposDocumentosResult, vinculacionDocumentsResult, personaDocumentsResult] =
    await Promise.all([
      dbQuery<ChecklistRequirementBaseRow>(
        `
          SELECT
            crg.id::text AS id,
            crg.tipo_requisito,
            crg.nombre_requisito,
            crg.descripcion,
            crg.obligatorio,
            crg.activo,
            'GENERAL'::text AS origen
          FROM contrato_requisitos_generales crg
          WHERE crg.contrato_id::text = $1
            AND crg.activo = TRUE

          UNION ALL

          SELECT
            ccr.id::text AS id,
            ccr.tipo_requisito,
            ccr.nombre_requisito,
            ccr.descripcion,
            ccr.obligatorio,
            ccr.activo,
            'CARGO'::text AS origen
          FROM contrato_cargo_requisitos ccr
          WHERE ccr.contrato_cargo_id::text = $2
            AND ccr.activo = TRUE
        `,
        [vinculacion.contrato_id, vinculacion.contrato_cargo_id]
      ),
      dbQuery<TipoDocumentoChecklistRow>(
        `
          SELECT
            id::text AS id,
            codigo,
            nombre_documento
          FROM tipos_documentos
        `
      ),
      dbQuery<ChecklistLoadedRow>(
        `
          SELECT
            dv.id::text AS id,
            dv.tipo_documento_id::text AS tipo_documento_id,
            td.nombre_documento AS tipo_documento_nombre,
            dv.nombre_original,
            dv.fecha_vencimiento,
            dv.activo
          FROM documentos_vinculacion dv
          INNER JOIN tipos_documentos td ON td.id = dv.tipo_documento_id
          WHERE dv.vinculacion_id::text = $1
            AND dv.activo = TRUE
          ORDER BY dv.fecha_carga DESC, dv.id DESC
        `,
        [vinculacionId]
      ),
      dbQuery<ChecklistLoadedRow>(
        `
          SELECT
            dp.id::text AS id,
            dp.tipo_documento_id::text AS tipo_documento_id,
            td.nombre_documento AS tipo_documento_nombre,
            dp.nombre_original,
            dp.fecha_vencimiento,
            dp.activo
          FROM documentos_persona dp
          INNER JOIN tipos_documentos td ON td.id = dp.tipo_documento_id
          WHERE dp.persona_id::text = $1
            AND dp.activo = TRUE
            AND dp.es_vigente = TRUE
          ORDER BY dp.fecha_carga DESC, dp.version DESC, dp.id DESC
        `,
        [vinculacion.persona_id]
      )
    ]);

  const tipoDocumentoIndex = new Map<string, { codigo: string; id: number; nombre_documento: string | null }>();

  for (const tipoDocumento of tiposDocumentosResult.rows) {
    const mapped = {
      codigo: tipoDocumento.codigo,
      id: toNumber(tipoDocumento.id),
      nombre_documento: tipoDocumento.nombre_documento
    };

    tipoDocumentoIndex.set(normalizeExactMatchKey(tipoDocumento.codigo), mapped);

    if (tipoDocumento.nombre_documento) {
      tipoDocumentoIndex.set(normalizeExactMatchKey(tipoDocumento.nombre_documento), mapped);
    }
  }

  const vinculacionDocumentIndex = new Map<number, ChecklistLoadedRow>();
  for (const document of vinculacionDocumentsResult.rows) {
    const tipoDocumentoId = toNumber(document.tipo_documento_id);
    if (!vinculacionDocumentIndex.has(tipoDocumentoId)) {
      vinculacionDocumentIndex.set(tipoDocumentoId, document);
    }
  }

  const personaDocumentIndex = new Map<number, ChecklistLoadedRow>();
  for (const document of personaDocumentsResult.rows) {
    const tipoDocumentoId = toNumber(document.tipo_documento_id);
    if (!personaDocumentIndex.has(tipoDocumentoId)) {
      personaDocumentIndex.set(tipoDocumentoId, document);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const requisitos = requirementsResult.rows.map((requirement) => {
    const requirementKey = normalizeExactMatchKey(requirement.nombre_requisito);
    const tipoDocumentoMatch = tipoDocumentoIndex.get(requirementKey) ?? null;
    const equivalenceCode = tipoDocumentoMatch ? null : resolveDocumentCodeByRequirementName(requirement.nombre_requisito);
    const equivalenceMatch = equivalenceCode
      ? tiposDocumentosResult.rows.find(
          (tipoDocumento) => normalizeExactMatchKey(tipoDocumento.codigo) === normalizeExactMatchKey(equivalenceCode)
        ) ?? null
      : null;
    const resolvedTipoDocumento = tipoDocumentoMatch ?? (equivalenceMatch
      ? {
          codigo: equivalenceMatch.codigo,
          id: toNumber(equivalenceMatch.id),
          nombre_documento: equivalenceMatch.nombre_documento
        }
      : null);
    const tipoDocumentoId = resolvedTipoDocumento?.id ?? null;
    const tipoDocumentoNombre = resolvedTipoDocumento?.nombre_documento ?? null;
    const codigo = resolvedTipoDocumento?.codigo ?? null;
    const documentoVinculacion = tipoDocumentoId !== null ? vinculacionDocumentIndex.get(tipoDocumentoId) ?? null : null;
    const documentoPersona = tipoDocumentoId !== null ? personaDocumentIndex.get(tipoDocumentoId) ?? null : null;
    const documento = documentoVinculacion ?? documentoPersona;
    const fuenteDocumento = documentoVinculacion ? 'VINCULACION' : documentoPersona ? 'PERSONA' : null;
    const fechaVencimiento = documento ? toDateString(documento.fecha_vencimiento) : null;
    let estado: 'CARGADO' | 'FALTANTE' | 'VENCIDO' = 'FALTANTE';
    let observacion: string | null = null;

    if (!resolvedTipoDocumento) {
      observacion = equivalenceCode
        ? 'Equivalencia documental definida pero no existe en tipos_documentos'
        : 'Requisito no asociado a tipos_documentos';

      if (env.NODE_ENV === 'development') {
        console.debug('Checklist requirement not resolved', {
          equivalenceCode,
          nombre_requisito: requirement.nombre_requisito
        });
      }
    } else if (documento) {
      estado = fechaVencimiento !== null && fechaVencimiento < today ? 'VENCIDO' : 'CARGADO';
    } else if (env.NODE_ENV === 'development' && equivalenceCode) {
      console.debug('Checklist requirement resolved via equivalence', {
        equivalenceCode,
        nombre_requisito: requirement.nombre_requisito
      });
    }

    return {
      codigo,
      documento_id: documento ? toNumber(documento.id) : null,
      estado,
      fecha_vencimiento: fechaVencimiento,
      fuente_documento: fuenteDocumento,
      nombre_requisito: requirement.nombre_requisito,
      observacion,
      obligatorio: requirement.obligatorio,
      origen: requirement.origen,
      requisito_id: toNumber(requirement.id),
      tipo_documento_id: tipoDocumentoId,
      tipo_documento_nombre: tipoDocumentoNombre,
      tipo_requisito: requirement.tipo_requisito
    } satisfies ChecklistItem;
  });

  const totalRequisitos = requisitos.length;
  const cargados = requisitos.filter((item) => item.estado === 'CARGADO').length;
  const vencidos = requisitos.filter((item) => item.estado === 'VENCIDO').length;
  const faltantes = requisitos.filter((item) => item.estado === 'FALTANTE').length;
  const cumplimientoPorcentaje =
    totalRequisitos === 0 ? 0 : Number(((cargados / totalRequisitos) * 100).toFixed(2));

  if (options?.audit !== false) {
    try {
      await registerAuditEntry({
        accion: 'CONSULTA_CHECKLIST',
        after: {
          cargados,
          cumplimiento_porcentaje: cumplimientoPorcentaje,
          faltantes,
          total_requisitos: totalRequisitos,
          vencidos,
          vinculacionId
        },
        descripcion: 'Consulta de checklist documental de vinculacion',
        registro_id: randomUUID(),
        tabla: 'documentos_vinculacion_checklist',
        usuario_id: null
      });
    } catch (error) {
      console.error('Failed to audit checklist consultation', error);
    }
  }

  return {
    vinculacion_id: toNumber(vinculacionId),
    persona_id: toNumber(vinculacion.persona_id),
    contrato_id: toNumber(vinculacion.contrato_id),
    contrato_cargo_id: toNumber(vinculacion.contrato_cargo_id),
    total_requisitos: totalRequisitos,
    cargados,
    faltantes,
    vencidos,
    cumplimiento_porcentaje: cumplimientoPorcentaje,
    requisitos
  };
};



