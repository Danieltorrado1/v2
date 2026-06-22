import PDFDocument from 'pdfkit';

import { PoolClient, QueryResultRow } from 'pg';

import { env } from '../../config/env';
import { dbPool, dbQuery } from '../../config/db';
import { getSupabaseAdminClient } from '../../config/supabaseAdmin';
import { AppError } from '../../utils/AppError';
import { registerAuditEntry } from '../auditoria/auditoria.helper';
import {
  assertTenantAccessForVinculacionId,
  TenantAccessContext
} from '../../middlewares/tenantMiddleware';
import { getVinculacionExpediente } from '../vinculaciones/vinculaciones.service';
import {
  assertTemplateIsRenderable,
  buildPlantillaRenderContext,
  hasDoubleSpaces,
  hasUnresolvedTemplateTokens,
  findRepeatedAdjacentWords,
  renderPlantillaTemplate
} from './plantillas.renderer';
import {
  CreatePlantillaInput,
  GenerarPlantillaDocumentoInput,
  TipoPlantilla,
  UpdatePlantillaInput
} from './plantillas.schemas';

interface PlantillaRow extends QueryResultRow {
  activo: boolean;
  codigo: string;
  contenido_template: string;
  created_at: Date | string | null;
  descripcion: string | null;
  id: string;
  nombre: string;
  tipo_plantilla: string;
  updated_at: Date | string | null;
}

interface PlantillaVariableRow extends QueryResultRow {
  activo: boolean;
  created_at: Date | string | null;
  descripcion: string | null;
  id: string;
  obligatoria: boolean;
  plantilla_id: string;
  variable: string;
}

interface DocumentoGeneradoRow extends QueryResultRow {
  activo: boolean;
  contenido_generado: string | null;
  created_at: Date | string | null;
  fecha_generacion: Date | string | null;
  generado_por: string | null;
  id: string;
  mime_type: string | null;
  nombre_archivo: string;
  plantilla_codigo: string;
  plantilla_id: string;
  plantilla_nombre: string;
  storage_bucket: string | null;
  storage_path: string | null;
  tamano_bytes: string | number | null;
  vinculacion_id: string;
}

interface DocumentoVinculacionGeneratedRow extends QueryResultRow {
  archivo_path: string | null;
  activo: boolean;
  fecha_carga: Date | string | null;
  fecha_expedicion: Date | string | null;
  fecha_vencimiento: Date | string | null;
  id: string;
  mime_type: string | null;
  nombre_original: string;
  storage_bucket: string | null;
  storage_path: string | null;
  tamano_bytes: string | number | null;
  tipo_documento_id: string;
  vinculacion_id: string;
}

interface PlantillaVariable {
  activo: boolean;
  descripcion: string | null;
  id: number;
  obligatoria: boolean;
  plantilla_id: number;
  variable: string;
}

interface RenderedPlantillaResult {
  content: string;
  recomendaciones: string[];
  unresolvedTokens: string[];
}

export interface Plantilla {
  activo: boolean;
  codigo: string;
  contenido_template: string;
  created_at: string | null;
  descripcion: string | null;
  id: number;
  nombre: string;
  tipo_plantilla: TipoPlantilla;
  updated_at: string | null;
  variables: PlantillaVariable[];
}

export interface DocumentoGenerado {
  activo: boolean;
  contenido_generado: string | null;
  created_at: string | null;
  fecha_generacion: string | null;
  generado_por: number | null;
  id: number;
  mime_type: string | null;
  nombre_archivo: string;
  plantilla: {
    codigo: string;
    id: number;
    nombre: string;
  };
  storage_bucket: string | null;
  storage_path: string | null;
  tamano_bytes: number | null;
  vinculacion_id: number;
}

export interface PlantillaGeneracionResult {
  documento_generado: DocumentoGenerado;
  contenido_generado: string;
  recomendaciones: string[];
  plantilla: Plantilla;
  vinculacion_id: number;
}

export interface PlantillaDocumentoGeneracionResult extends PlantillaGeneracionResult {
  documento_vinculacion: DocumentoVinculacionGenerado | null;
}

export interface DocumentoVinculacionGenerado {
  archivo_path: string | null;
  activo: boolean;
  fecha_carga: string | null;
  fecha_expedicion: string | null;
  fecha_vencimiento: string | null;
  id: number;
  mime_type: string | null;
  nombre_original: string;
  storage_bucket: string | null;
  storage_path: string | null;
  tamano_bytes: number | null;
  tipo_documento_id: number;
  vinculacion_id: number;
}

const toNumber = (value: string | number): number => {
  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    throw new AppError('Invalid numeric value returned by database', 500, 'INVALID_NUMERIC_VALUE');
  }

  return parsed;
};

const toDateString = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
};

export const sanitizeGeneratedFilename = (value: string): string => {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  return trimmed.replace(/[\0\r\n\t]/g, '').replace(/[\\/]+/g, '_');
};

const buildDefaultGeneratedFilename = (
  codigo: string,
  vinculacionId: number,
  extension: 'html' | 'pdf'
): string => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeCodigo = codigo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return `${safeCodigo || 'plantilla'}-${vinculacionId}-${timestamp}.${extension}`;
};

const buildGeneratedStoragePath = (
  vinculacionId: number,
  nombreArchivo: string,
  timestampToken: string
): string => {
  const safeNombre = sanitizeGeneratedFilename(nombreArchivo);
  return `generados/vinculacion_${vinculacionId}/${timestampToken}_${safeNombre}`;
};

const htmlToPlainText = (html: string): string => {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|section|article|h1|h2|h3|h4|h5|h6|li|tr)\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '- ')
    .replace(/<\s*tr[^>]*>/gi, '\n')
    .replace(/<\s*\/\s*td\s*>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
};

const generatePdfBufferFromHtml = async (html: string): Promise<Buffer> => {
  const pdf = new PDFDocument({ autoFirstPage: true, margin: 48, size: 'A4' });
  const chunks: Buffer[] = [];

  const bufferPromise = new Promise<Buffer>((resolve, reject) => {
    pdf.on('data', (chunk: Buffer | Uint8Array) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
  });

  pdf.fontSize(11).text(htmlToPlainText(html), {
    align: 'left',
    lineGap: 4
  });
  pdf.end();

  return bufferPromise;
};

const uploadGeneratedDocumentToStorage = async (
  buffer: Buffer,
  mimeType: string,
  storagePath: string
): Promise<{ bucket: string; path: string }> => {
  const supabaseAdmin = getSupabaseAdminClient();
  console.info('Uploading generated document to storage', {
    bucket: env.SUPABASE_STORAGE_BUCKET,
    storage_path: storagePath
  });

  const uploadResult = await supabaseAdmin.storage
    .from(env.SUPABASE_STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: false
    });

  if (uploadResult.error) {
    throw new AppError(
      'Failed to upload generated document to storage',
      502,
      'STORAGE_UPLOAD_FAILED',
      uploadResult.error.message
    );
  }

  return {
    bucket: env.SUPABASE_STORAGE_BUCKET,
    path: storagePath
  };
};

const buildGenerationRecommendations = (content: string): string[] => {
  const recommendations: string[] = [];
  const duplicatedPhrases = findRepeatedAdjacentWords(content);
  const normalizedContent = content.trim();

  if (normalizedContent.length === 0) {
    recommendations.push('El contenido generado quedo vacio.');
  }

  if (normalizedContent.length > 0 && normalizedContent.length < 80) {
    recommendations.push('El contenido generado es demasiado corto para uso operativo.');
  }

  if (hasDoubleSpaces(content)) {
    recommendations.push('Se detectaron espacios dobles en el contenido generado.');
  }

  if (hasUnresolvedTemplateTokens(content)) {
    recommendations.push('Existen variables no reemplazadas en el contenido generado.');
  }

  if (duplicatedPhrases.length > 0) {
    recommendations.push(
      `Se detectaron repeticiones potenciales en el contenido: ${duplicatedPhrases.join(', ')}`
    );
    recommendations.push('Revisar la plantilla base para evitar duplicados visibles en el documento final.');
  }

  return recommendations;
};

const mapPlantillaVariable = (row: PlantillaVariableRow): PlantillaVariable => {
  return {
    id: toNumber(row.id),
    plantilla_id: toNumber(row.plantilla_id),
    variable: row.variable,
    descripcion: row.descripcion,
    obligatoria: row.obligatoria,
    activo: row.activo
  };
};

const mapPlantillaRow = async (row: PlantillaRow): Promise<Plantilla> => {
  const variablesResult = await dbQuery<PlantillaVariableRow>(
    `
      SELECT
        id::text AS id,
        plantilla_id::text AS plantilla_id,
        variable,
        descripcion,
        obligatoria,
        activo,
        created_at
      FROM plantilla_variables
      WHERE plantilla_id::text = $1
      ORDER BY variable ASC
    `,
    [row.id]
  );

  return {
    id: toNumber(row.id),
    codigo: row.codigo,
    nombre: row.nombre,
    descripcion: row.descripcion,
    tipo_plantilla: row.tipo_plantilla as TipoPlantilla,
    contenido_template: row.contenido_template,
    activo: row.activo,
    created_at: toDateString(row.created_at),
    updated_at: toDateString(row.updated_at),
    variables: variablesResult.rows.map(mapPlantillaVariable)
  };
};

const mapDocumentoGeneradoRow = (row: DocumentoGeneradoRow): DocumentoGenerado => {
  return {
    id: toNumber(row.id),
    vinculacion_id: toNumber(row.vinculacion_id),
    contenido_generado: row.contenido_generado,
    nombre_archivo: row.nombre_archivo,
    storage_bucket: row.storage_bucket,
    storage_path: row.storage_path,
    mime_type: row.mime_type,
    tamano_bytes: row.tamano_bytes === null ? null : toNumber(row.tamano_bytes),
    generado_por: row.generado_por === null ? null : toNumber(row.generado_por),
    fecha_generacion: toDateString(row.fecha_generacion),
    created_at: toDateString(row.created_at),
    activo: row.activo,
    plantilla: {
      id: toNumber(row.plantilla_id),
      codigo: row.plantilla_codigo,
      nombre: row.plantilla_nombre
    }
  };
};

const mapDocumentoVinculacionGeneratedRow = (
  row: DocumentoVinculacionGeneratedRow
): DocumentoVinculacionGenerado => {
  return {
    id: toNumber(row.id),
    vinculacion_id: toNumber(row.vinculacion_id),
    tipo_documento_id: toNumber(row.tipo_documento_id),
    fecha_expedicion: toDateString(row.fecha_expedicion),
    fecha_vencimiento: toDateString(row.fecha_vencimiento),
    archivo_path: row.archivo_path,
    fecha_carga: toDateString(row.fecha_carga),
    activo: row.activo,
    storage_bucket: row.storage_bucket,
    storage_path: row.storage_path,
    nombre_original: row.nombre_original,
    mime_type: row.mime_type,
    tamano_bytes: row.tamano_bytes === null ? null : toNumber(row.tamano_bytes)
  };
};

const insertDocumentoGenerado = async (
  client: PoolClient,
  input: {
    contenidoGenerado: string;
    generadoPor: number;
    nombreArchivo: string;
    mimeType: string;
    plantillaId: number;
    storageBucket: string | null;
    storagePath: string | null;
    tamanoBytes: number;
    vinculacionId: number;
  }
): Promise<DocumentoGenerado> => {
  const result = await client.query<DocumentoGeneradoRow>(
    `
      INSERT INTO documentos_generados (
        plantilla_id,
        vinculacion_id,
        nombre_archivo,
        contenido_generado,
        storage_bucket,
        storage_path,
        mime_type,
        tamano_bytes,
        generado_por,
        fecha_generacion,
        activo
      )
      VALUES ($1::bigint, $2::bigint, $3, $4, $5, $6, $7, $8::bigint, $9::bigint, NOW(), TRUE)
      RETURNING
        id::text AS id,
        plantilla_id::text AS plantilla_id,
        vinculacion_id::text AS vinculacion_id,
        nombre_archivo,
        contenido_generado,
        storage_bucket,
        storage_path,
        mime_type,
        tamano_bytes,
        generado_por::text AS generado_por,
        fecha_generacion,
        activo,
        created_at,
        (SELECT codigo FROM plantillas WHERE id = documentos_generados.plantilla_id) AS plantilla_codigo,
        (SELECT nombre FROM plantillas WHERE id = documentos_generados.plantilla_id) AS plantilla_nombre
    `,
    [
      input.plantillaId,
      input.vinculacionId,
      input.nombreArchivo,
      input.contenidoGenerado,
      input.storageBucket,
      input.storagePath,
      input.mimeType,
      input.tamanoBytes,
      input.generadoPor
    ]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Failed to generate document', 500, 'PLANTILLA_GENERATION_FAILED');
  }

  return mapDocumentoGeneradoRow(row);
};

const insertDocumentoVinculacionGenerated = async (
  client: PoolClient,
  input: {
    nombreArchivo: string;
    mimeType: string;
    storageBucket: string;
    storagePath: string;
    tipoDocumentoId: number;
    vinculacionId: number;
    tamanoBytes: number;
  }
): Promise<DocumentoVinculacionGenerado> => {
  const result = await client.query<DocumentoVinculacionGeneratedRow>(
    `
      INSERT INTO documentos_vinculacion (
        vinculacion_id,
        tipo_documento_id,
        fecha_expedicion,
        fecha_vencimiento,
        archivo_path,
        activo,
        storage_bucket,
        storage_path,
        nombre_original,
        mime_type,
        tamano_bytes,
        fecha_carga
      )
      VALUES (
        $1::bigint,
        $2::bigint,
        CURRENT_DATE,
        NULL,
        $3,
        TRUE,
        $4,
        $5,
        $6,
        $7,
        $8::bigint,
        NOW()
      )
      RETURNING
        id::text AS id,
        vinculacion_id::text AS vinculacion_id,
        tipo_documento_id::text AS tipo_documento_id,
        fecha_expedicion,
        fecha_vencimiento,
        archivo_path,
        fecha_carga,
        activo,
        storage_bucket,
        storage_path,
        nombre_original,
        mime_type,
        tamano_bytes
    `,
    [
      input.vinculacionId,
      input.tipoDocumentoId,
      input.storagePath,
      input.storageBucket,
      input.storagePath,
      input.nombreArchivo,
      input.mimeType,
      input.tamanoBytes
    ]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError(
      'Failed to create vinculacion document',
      500,
      'DOCUMENTO_VINCULACION_CREATE_FAILED'
    );
  }

  return mapDocumentoVinculacionGeneratedRow(row);
};

const buildRenderedPlantilla = async (
  plantillaId: number,
  vinculacionId: number,
  tenant?: TenantAccessContext
): Promise<{
  contenido_generado: string;
  nombre_default_html: string;
  nombre_default_pdf: string;
  plantilla: Plantilla;
  recomendaciones: string[];
  unresolvedTokens: string[];
}> => {
  const plantilla = await getPlantillaById(plantillaId);

  if (!plantilla) {
    throw new AppError('Plantilla not found', 404, 'PLANTILLA_NOT_FOUND');
  }

  if (!plantilla.activo) {
    throw new AppError('Plantilla is inactive', 409, 'PLANTILLA_INACTIVA');
  }

  const expediente = await getVinculacionExpediente(vinculacionId, tenant);
  const context = buildPlantillaRenderContext(expediente);
  assertTemplateIsRenderable(plantilla.contenido_template);
  const rendered = renderPlantillaTemplate(plantilla.contenido_template, context);
  const recomendaciones = buildGenerationRecommendations(rendered.content);

  return {
    contenido_generado: rendered.content,
    nombre_default_html: buildDefaultGeneratedFilename(plantilla.codigo, vinculacionId, 'html'),
    nombre_default_pdf: buildDefaultGeneratedFilename(plantilla.codigo, vinculacionId, 'pdf'),
    plantilla,
    recomendaciones,
    unresolvedTokens: rendered.unresolvedTokens
  };
};

export const previewPlantillaForVinculacion = async (
  plantillaId: number,
  vinculacionId: number,
  tenant?: TenantAccessContext
): Promise<{
  contenido_generado: string;
  recomendaciones: string[];
  plantilla: Plantilla;
  unresolvedTokens: string[];
  vinculacion_id: number;
}> => {
  const rendered = await buildRenderedPlantilla(plantillaId, vinculacionId, tenant);

  return {
    contenido_generado: rendered.contenido_generado,
    recomendaciones: rendered.recomendaciones,
    plantilla: rendered.plantilla,
    unresolvedTokens: rendered.unresolvedTokens,
    vinculacion_id: vinculacionId
  };
};

const persistGeneratedHtmlDocument = async (input: {
  actorUserId: number;
  contenidoGenerado: string;
  mimeType: string;
  nombreArchivo: string;
  plantilla: Plantilla;
  recomendaciones: string[];
  storageBucket: string | null;
  storagePath: string;
  tamanoBytes: number;
  vinculacionId: number;
}): Promise<PlantillaGeneracionResult> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    const documentoGenerado = await insertDocumentoGenerado(client, {
      contenidoGenerado: input.contenidoGenerado,
      generadoPor: input.actorUserId,
      mimeType: input.mimeType,
      nombreArchivo: input.nombreArchivo,
      plantillaId: input.plantilla.id,
      storageBucket: input.storageBucket,
      storagePath: input.storagePath,
      tamanoBytes: input.tamanoBytes,
      vinculacionId: input.vinculacionId
    });

    await client.query('COMMIT');

    return {
      documento_generado: documentoGenerado,
      contenido_generado: input.contenidoGenerado,
      recomendaciones: input.recomendaciones,
      plantilla: input.plantilla,
      vinculacion_id: input.vinculacionId
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const listPlantillas = async (): Promise<Plantilla[]> => {
  const result = await dbQuery<PlantillaRow>(
    `
      SELECT
        id::text AS id,
        codigo,
        nombre,
        descripcion,
        tipo_plantilla,
        contenido_template,
        activo,
        created_at,
        updated_at
      FROM plantillas
      WHERE activo = TRUE
      ORDER BY created_at DESC, id DESC
    `
  );

  return Promise.all(result.rows.map(mapPlantillaRow));
};

export const getPlantillaById = async (id: number): Promise<Plantilla | null> => {
  const result = await dbQuery<PlantillaRow>(
    `
      SELECT
        id::text AS id,
        codigo,
        nombre,
        descripcion,
        tipo_plantilla,
        contenido_template,
        activo,
        created_at,
        updated_at
      FROM plantillas
      WHERE id = $1::bigint
      LIMIT 1
    `,
    [id]
  );

  const row = result.rows[0];
  return row ? mapPlantillaRow(row) : null;
};

export const createPlantilla = async (
  input: CreatePlantillaInput,
  actorUserId?: number | null
): Promise<Plantilla> => {
  const result = await dbQuery<PlantillaRow>(
    `
      INSERT INTO plantillas (
        codigo,
        nombre,
        descripcion,
        tipo_plantilla,
        contenido_template,
        activo
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING
        id::text AS id,
        codigo,
        nombre,
        descripcion,
        tipo_plantilla,
        contenido_template,
        activo,
        created_at,
        updated_at
    `,
    [
      input.codigo,
      input.nombre,
      input.descripcion,
      input.tipo_plantilla,
      input.contenido_template,
      input.activo
    ]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Failed to create plantilla', 500, 'PLANTILLA_CREATE_FAILED');
  }

  try {
    await registerAuditEntry({
      accion: 'PLANTILLA_CREATE',
      after: {
        codigo: row.codigo,
        contenido_template: row.contenido_template,
        nombre: row.nombre,
        plantilla_id: toNumber(row.id),
        tipo_plantilla: row.tipo_plantilla
      },
      descripcion: 'Creacion de plantilla contractual',
      registro_id: String(row.id),
      tabla: 'plantillas',
      usuario_id: actorUserId != null ? String(actorUserId) : null
    });
  } catch (error) {
    console.error('Failed to register plantilla create audit entry', error);
  }

  return mapPlantillaRow(row);
};

export const updatePlantilla = async (
  id: number,
  input: UpdatePlantillaInput,
  actorUserId?: number | null
): Promise<Plantilla> => {
  const current = await getPlantillaById(id);

  if (!current) {
    throw new AppError('Plantilla not found', 404, 'PLANTILLA_NOT_FOUND');
  }

  const nextCodigo = input.codigo ?? current.codigo;
  const nextNombre = input.nombre ?? current.nombre;
  const nextDescripcion = input.descripcion !== undefined ? input.descripcion : current.descripcion;
  const nextTipoPlantilla = input.tipo_plantilla ?? current.tipo_plantilla;
  const nextContenidoTemplate = input.contenido_template ?? current.contenido_template;
  const nextActivo = input.activo ?? current.activo;

  const result = await dbQuery<PlantillaRow>(
    `
      UPDATE plantillas
      SET
        codigo = $2,
        nombre = $3,
        descripcion = $4,
        tipo_plantilla = $5,
        contenido_template = $6,
        activo = $7,
        updated_at = NOW()
      WHERE id = $1::bigint
      RETURNING
        id::text AS id,
        codigo,
        nombre,
        descripcion,
        tipo_plantilla,
        contenido_template,
        activo,
        created_at,
        updated_at
    `,
    [id, nextCodigo, nextNombre, nextDescripcion, nextTipoPlantilla, nextContenidoTemplate, nextActivo]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Failed to update plantilla', 500, 'PLANTILLA_UPDATE_FAILED');
  }

  try {
    await registerAuditEntry({
      accion: 'PLANTILLA_UPDATE',
      after: {
        codigo: row.codigo,
        contenido_template: row.contenido_template,
        nombre: row.nombre,
        plantilla_id: toNumber(row.id),
        tipo_plantilla: row.tipo_plantilla
      },
      before: current,
      descripcion: 'Actualizacion de plantilla contractual',
      registro_id: String(row.id),
      tabla: 'plantillas',
      usuario_id: actorUserId != null ? String(actorUserId) : null
    });
  } catch (error) {
    console.error('Failed to register plantilla update audit entry', error);
  }

  return mapPlantillaRow(row);
};

export const generatePlantillaForVinculacion = async (
  plantillaId: number,
  vinculacionId: number,
  actorUserId: number,
  tenant?: TenantAccessContext
): Promise<PlantillaGeneracionResult> => {
  const rendered = await buildRenderedPlantilla(plantillaId, vinculacionId, tenant);
  const timestampToken = new Date().toISOString().replace(/[:.]/g, '-');
  const nombreArchivo = rendered.nombre_default_html;
  const storagePath = buildGeneratedStoragePath(vinculacionId, nombreArchivo, timestampToken);

  return persistGeneratedHtmlDocument({
    actorUserId,
    contenidoGenerado: rendered.contenido_generado,
    mimeType: 'text/html',
    nombreArchivo,
    plantilla: rendered.plantilla,
    recomendaciones: rendered.recomendaciones,
    storageBucket: env.SUPABASE_STORAGE_BUCKET,
    storagePath,
    tamanoBytes: Buffer.byteLength(rendered.contenido_generado, 'utf8'),
    vinculacionId
  });
};

export const generatePlantillaDocumentoForVinculacion = async (
  plantillaId: number,
  vinculacionId: number,
  input: GenerarPlantillaDocumentoInput,
  actorUserId: number,
  tenant?: TenantAccessContext
): Promise<PlantillaDocumentoGeneracionResult> => {
  const rendered = await buildRenderedPlantilla(plantillaId, vinculacionId, tenant);
  const timestampToken = new Date().toISOString().replace(/[:.]/g, '-');
  const nombreArchivo = sanitizeGeneratedFilename(input.nombre_archivo ?? rendered.nombre_default_html) ||
    rendered.nombre_default_html;
  const storagePath = buildGeneratedStoragePath(vinculacionId, nombreArchivo, timestampToken);
  const generated = await persistGeneratedHtmlDocument({
    actorUserId,
    contenidoGenerado: rendered.contenido_generado,
    mimeType: 'text/html',
    nombreArchivo,
    plantilla: rendered.plantilla,
    recomendaciones: rendered.recomendaciones,
    storageBucket: env.SUPABASE_STORAGE_BUCKET,
    storagePath,
    tamanoBytes: Buffer.byteLength(rendered.contenido_generado, 'utf8'),
    vinculacionId
  });
  let documentoVinculacion: DocumentoVinculacionGenerado | null = null;

  if (input.registrar_documento_vinculacion) {
    if (input.tipo_documento_id === undefined) {
      throw new AppError(
        'tipo_documento_id is required when registrar_documento_vinculacion is true',
        400,
        'TIPO_DOCUMENTO_REQUIRED'
      );
    }

    const pdfOrHtmlBytes = Buffer.byteLength(generated.contenido_generado, 'utf8');
    const cliente = await dbPool.connect();

    try {
      await cliente.query('BEGIN');

      const documento = await insertDocumentoVinculacionGenerated(cliente, {
        nombreArchivo,
        mimeType: 'text/html',
        storageBucket: env.SUPABASE_STORAGE_BUCKET,
        storagePath,
        tipoDocumentoId: input.tipo_documento_id,
        vinculacionId,
        tamanoBytes: pdfOrHtmlBytes
      });

      await cliente.query('COMMIT');
      documentoVinculacion = documento;
    } catch (error) {
      await cliente.query('ROLLBACK');
      throw error;
    } finally {
      cliente.release();
    }
  }

  if (documentoVinculacion) {
    try {
      await registerAuditEntry({
        accion: 'DOCUMENT_GENERATED',
        after: {
          documento_vinculacion_id: documentoVinculacion.id,
          formato: 'HTML',
          nombre_archivo: documentoVinculacion.nombre_original,
          plantilla_id: plantillaId,
          storage_path: documentoVinculacion.storage_path,
          vinculacion_id: vinculacionId
        },
        descripcion: 'Registro de documento generado desde plantilla',
        registro_id: String(documentoVinculacion.id),
        tabla: 'documentos_vinculacion',
        usuario_id: String(actorUserId)
      });
    } catch (error) {
      console.error('Failed to register generated document audit entry', error);
    }
  }

  try {
    await registerAuditEntry({
      accion: 'PLANTILLA_GENERATE',
      after: {
        plantilla_id: plantillaId,
        plantilla_codigo: rendered.plantilla.codigo,
        plantilla_nombre: rendered.plantilla.nombre,
        vinculacion_id: vinculacionId,
        registrar_documento_vinculacion: input.registrar_documento_vinculacion,
        tipo_documento_id: input.tipo_documento_id ?? null
      },
      descripcion: 'Generacion de plantilla contractual',
      registro_id: String(plantillaId),
      tabla: 'plantillas',
      usuario_id: String(actorUserId)
    });
  } catch (error) {
    console.error('Failed to register plantilla generation audit entry', error);
  }

  return {
    ...generated,
    documento_vinculacion: documentoVinculacion
  };
};

export const generatePlantillaPdfForVinculacion = async (
  plantillaId: number,
  vinculacionId: number,
  input: GenerarPlantillaDocumentoInput,
  actorUserId: number,
  tenant?: TenantAccessContext
): Promise<PlantillaDocumentoGeneracionResult> => {
  const rendered = await buildRenderedPlantilla(plantillaId, vinculacionId, tenant);
  const timestampToken = new Date().toISOString().replace(/[:.]/g, '-');
  const nombreArchivo = sanitizeGeneratedFilename(input.nombre_archivo ?? rendered.nombre_default_pdf) ||
    rendered.nombre_default_pdf;
  const storagePath = buildGeneratedStoragePath(vinculacionId, nombreArchivo, timestampToken);
  const pdfBuffer = await generatePdfBufferFromHtml(rendered.contenido_generado);

  await uploadGeneratedDocumentToStorage(pdfBuffer, 'application/pdf', storagePath);

  const generated = await persistGeneratedHtmlDocument({
    actorUserId,
    contenidoGenerado: rendered.contenido_generado,
    mimeType: 'application/pdf',
    nombreArchivo,
    plantilla: rendered.plantilla,
    recomendaciones: rendered.recomendaciones,
    storageBucket: env.SUPABASE_STORAGE_BUCKET,
    storagePath,
    tamanoBytes: pdfBuffer.length,
    vinculacionId
  });

  let documentoVinculacion: DocumentoVinculacionGenerado | null = null;

  if (input.registrar_documento_vinculacion) {
    if (input.tipo_documento_id === undefined) {
      throw new AppError(
        'tipo_documento_id is required when registrar_documento_vinculacion is true',
        400,
        'TIPO_DOCUMENTO_REQUIRED'
      );
    }

    const cliente = await dbPool.connect();

    try {
      await cliente.query('BEGIN');

      documentoVinculacion = await insertDocumentoVinculacionGenerated(cliente, {
        nombreArchivo,
        mimeType: 'application/pdf',
        storageBucket: env.SUPABASE_STORAGE_BUCKET,
        storagePath,
        tipoDocumentoId: input.tipo_documento_id,
        vinculacionId,
        tamanoBytes: pdfBuffer.length
      });

      await cliente.query('COMMIT');
    } catch (error) {
      await cliente.query('ROLLBACK');
      throw error;
    } finally {
      cliente.release();
    }
  }

  if (documentoVinculacion) {
    try {
      await registerAuditEntry({
        accion: 'DOCUMENT_GENERATED',
        after: {
          documento_vinculacion_id: documentoVinculacion.id,
          formato: 'PDF',
          nombre_archivo: documentoVinculacion.nombre_original,
          plantilla_id: plantillaId,
          storage_path: documentoVinculacion.storage_path,
          vinculacion_id: vinculacionId
        },
        descripcion: 'Registro de documento PDF generado desde plantilla',
        registro_id: String(documentoVinculacion.id),
        tabla: 'documentos_vinculacion',
        usuario_id: String(actorUserId)
      });
    } catch (error) {
      console.error('Failed to register generated PDF document audit entry', error);
    }
  }

  try {
    await registerAuditEntry({
      accion: 'PLANTILLA_GENERATE',
      after: {
        formato: 'PDF',
        plantilla_id: plantillaId,
        plantilla_codigo: rendered.plantilla.codigo,
        plantilla_nombre: rendered.plantilla.nombre,
        vinculacion_id: vinculacionId,
        registrar_documento_vinculacion: input.registrar_documento_vinculacion,
        tipo_documento_id: input.tipo_documento_id ?? null
      },
      descripcion: 'Generacion PDF de plantilla contractual',
      registro_id: String(plantillaId),
      tabla: 'plantillas',
      usuario_id: String(actorUserId)
    });
  } catch (error) {
    console.error('Failed to register plantilla PDF generation audit entry', error);
  }

  return {
    ...generated,
    documento_vinculacion: documentoVinculacion
  };
};

export const listDocumentosGeneradosByVinculacion = async (
  vinculacionId: number,
  tenant?: TenantAccessContext
): Promise<DocumentoGenerado[]> => {
  await assertTenantAccessForVinculacionId(tenant, vinculacionId);
  const result = await dbQuery<DocumentoGeneradoRow>(
    `
      SELECT
        dg.id::text AS id,
        dg.plantilla_id::text AS plantilla_id,
        dg.vinculacion_id::text AS vinculacion_id,
        dg.nombre_archivo,
        dg.contenido_generado,
        dg.storage_bucket,
        dg.storage_path,
        dg.mime_type,
        dg.tamano_bytes,
        dg.generado_por::text AS generado_por,
        dg.fecha_generacion,
        dg.activo,
        dg.created_at,
        p.codigo AS plantilla_codigo,
        p.nombre AS plantilla_nombre
      FROM documentos_generados dg
      INNER JOIN plantillas p ON p.id = dg.plantilla_id
      WHERE dg.vinculacion_id = $1::bigint
      ORDER BY dg.fecha_generacion DESC, dg.id DESC
    `,
    [vinculacionId]
  );

  return result.rows.map(mapDocumentoGeneradoRow);
};
