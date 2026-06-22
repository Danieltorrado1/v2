import { env } from '../../config/env';
import { getSupabaseAdminClient } from '../../config/supabaseAdmin';
import { AppError } from '../../utils/AppError';

const sanitizeFileName = (fileName: string): string => {
  return fileName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
};

export const buildStoragePath = (
  scope: 'personas' | 'vinculaciones',
  entityId: string,
  tipoDocumentoId: string,
  originalFileName: string
): string => {
  const sanitizedName = sanitizeFileName(originalFileName);
  const timestamp = Date.now();

  return `${scope}/${entityId}/${tipoDocumentoId}/${timestamp}-${sanitizedName}`;
};

export const uploadDocumentToStorage = async (input: {
  fileBuffer: Buffer;
  mimeType: string;
  originalFileName: string;
  scope: 'personas' | 'vinculaciones';
  targetId: string;
  tipoDocumentoId: string;
}): Promise<{ bucket: string; path: string }> => {
  const supabaseAdmin = getSupabaseAdminClient();
  const path = buildStoragePath(
    input.scope,
    input.targetId,
    input.tipoDocumentoId,
    input.originalFileName
  );

  const uploadResult = await supabaseAdmin.storage
    .from(env.SUPABASE_STORAGE_BUCKET)
    .upload(path, input.fileBuffer, {
      contentType: input.mimeType,
      upsert: false
    });

  if (uploadResult.error) {
    throw new AppError(
      'Failed to upload document to storage',
      502,
      'STORAGE_UPLOAD_FAILED',
      uploadResult.error.message
    );
  }

  return {
    bucket: env.SUPABASE_STORAGE_BUCKET,
    path
  };
};

export const createDocumentSignedUrlForBucket = async (
  storageBucket: string,
  storagePath: string,
  expiresInSeconds = 3600
): Promise<string> => {
  const normalizedBucket = storageBucket.trim();
  const normalizedPath = storagePath.trim();

  if (!normalizedBucket || !normalizedPath) {
    throw new AppError(
      'El documento existe en base de datos, pero no tiene archivo fisico disponible en Storage.',
      404,
      'DOCUMENT_STORAGE_NOT_AVAILABLE'
    );
  }

  const supabaseAdmin = getSupabaseAdminClient();
  const signedUrlResult = await supabaseAdmin.storage
    .from(normalizedBucket)
    .createSignedUrl(normalizedPath, expiresInSeconds);

  if (signedUrlResult.error || !signedUrlResult.data?.signedUrl) {
    const storageErrorMessage = signedUrlResult.error?.message?.toLowerCase() ?? '';

    if (storageErrorMessage.includes('object') && storageErrorMessage.includes('not found')) {
      throw new AppError(
        'El documento existe en base de datos, pero no tiene archivo fisico disponible en Storage.',
        404,
        'DOCUMENT_STORAGE_NOT_AVAILABLE'
      );
    }

    throw new AppError(
      'Failed to generate signed download URL',
      502,
      'STORAGE_SIGNED_URL_FAILED',
      signedUrlResult.error?.message
    );
  }

  return signedUrlResult.data.signedUrl;
};

export const createDocumentSignedUrl = async (
  storagePath: string,
  expiresInSeconds = 3600
): Promise<string> => {
  return createDocumentSignedUrlForBucket(
    env.SUPABASE_STORAGE_BUCKET,
    storagePath,
    expiresInSeconds
  );
};
