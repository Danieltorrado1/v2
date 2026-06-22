import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const assertServiceRoleKey = (value: string | undefined): string => {
  if (!value?.trim()) {
    throw new Error('CONFIGURATION_ERROR: SUPABASE_SERVICE_ROLE_KEY is required');
  }

  const parts = value.trim().split('.');

  if (parts.length !== 3 || !parts[1]) {
    throw new Error(
      'CONFIGURATION_ERROR: SUPABASE_SERVICE_ROLE_KEY must be a valid JWT with service_role claims'
    );
  }

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      role?: string;
    };

    if (payload.role !== 'service_role') {
      throw new Error(
        'CONFIGURATION_ERROR: SUPABASE_SERVICE_ROLE_KEY must belong to the service_role'
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('CONFIGURATION_ERROR:')) {
      throw error;
    }

    throw new Error(
      'CONFIGURATION_ERROR: SUPABASE_SERVICE_ROLE_KEY could not be validated as a service_role JWT'
    );
  }

  return value.trim();
};

const main = async (): Promise<void> => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = assertServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const bucket = process.env.SUPABASE_STORAGE_BUCKET;

  if (!supabaseUrl?.trim()) {
    throw new Error('CONFIGURATION_ERROR: SUPABASE_URL is required');
  }

  if (!bucket?.trim()) {
    throw new Error('CONFIGURATION_ERROR: SUPABASE_STORAGE_BUCKET is required');
  }

  const supabaseAdmin = createClient(supabaseUrl.trim(), supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const storagePath = `storage-tests/service-role-${Date.now()}.pdf`;
  const content = Buffer.from(
    `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << >> >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT /F1 12 Tf 72 120 Td (storage test) Tj ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000010 00000 n 
0000000060 00000 n 
0000000117 00000 n 
0000000225 00000 n 
trailer
<< /Root 1 0 R /Size 5 >>
startxref
322
%%EOF`,
    'utf8'
  );

  console.info('Testing storage upload with service role', {
    bucket,
    storage_path: storagePath
  });

  const uploadResult = await supabaseAdmin.storage.from(bucket.trim()).upload(storagePath, content, {
    contentType: 'application/pdf',
    upsert: false
  });

  if (uploadResult.error) {
    throw new Error(`Storage upload failed: ${uploadResult.error.message}`);
  }

  const removeResult = await supabaseAdmin.storage.from(bucket.trim()).remove([storagePath]);

  if (removeResult.error) {
    throw new Error(`Storage cleanup failed: ${removeResult.error.message}`);
  }

  console.log('Storage service role OK');
};

main().catch((error) => {
  console.error('Storage service role test failed', error);
  process.exitCode = 1;
});
