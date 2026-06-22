import { PoolClient, QueryResultRow } from 'pg';

import {
  importPersonaPayloadSchema,
  importVinculacionPayloadSchema,
  ImportPersonaPayload,
  ImportVinculacionPayload
} from './importaciones.schemas';
import { MappedImportRow } from './importaciones.mapper';

interface ExistsRow extends QueryResultRow {
  exists: boolean;
}

export interface ImportRowValidationError {
  code: string;
  field: string;
  message: string;
}

export interface ValidatedImportRow {
  errors: ImportRowValidationError[];
  persona: ImportPersonaPayload | null;
  vinculacion: ImportVinculacionPayload | null;
}

const mapZodErrors = (
  fieldPrefix: string,
  issues: Array<{ message: string; path: PropertyKey[] }>
): ImportRowValidationError[] => {
  return issues.map((issue) => ({
    field: [fieldPrefix, ...issue.path.map(String)].join('.'),
    code: 'INVALID_FIELD',
    message: issue.message
  }));
};

const checkExists = async (
  client: PoolClient,
  tableName: 'empresas' | 'contratos' | 'contrato_cargos',
  id: string
): Promise<boolean> => {
  const result = await client.query<ExistsRow>(
    `SELECT EXISTS (SELECT 1 FROM ${tableName} WHERE id::text = $1) AS exists`,
    [id]
  );

  return result.rows[0]?.exists ?? false;
};

export const validateMappedImportRow = async (
  client: PoolClient,
  row: MappedImportRow
): Promise<ValidatedImportRow> => {
  const errors: ImportRowValidationError[] = [];

  if (!row.numeroDocumento) {
    errors.push({
      field: 'persona.numero_documento',
      code: 'REQUIRED',
      message: 'numero_documento is required'
    });
  }

  if (!row.persona.primer_nombre) {
    errors.push({
      field: 'persona.primer_nombre',
      code: 'REQUIRED',
      message: 'primer_nombre is required'
    });
  }

  if (!row.persona.primer_apellido) {
    errors.push({
      field: 'persona.primer_apellido',
      code: 'REQUIRED',
      message: 'primer_apellido is required'
    });
  }

  if (!row.persona.tipo_documento_id) {
    errors.push({
      field: 'persona.tipo_documento_id',
      code: 'REQUIRED',
      message: 'tipo_documento_id is required'
    });
  }

  if (!row.vinculacion.empresa_id) {
    errors.push({
      field: 'vinculacion.empresa_id',
      code: 'REQUIRED',
      message: 'empresa_id is required'
    });
  }

  if (!row.vinculacion.contrato_id) {
    errors.push({
      field: 'vinculacion.contrato_id',
      code: 'REQUIRED',
      message: 'contrato_id is required'
    });
  }

  if (!row.vinculacion.contrato_cargo_id) {
    errors.push({
      field: 'vinculacion.contrato_cargo_id',
      code: 'REQUIRED',
      message: 'contrato_cargo_id is required'
    });
  }

  if (!row.vinculacion.fecha_inicio) {
    errors.push({
      field: 'vinculacion.fecha_inicio',
      code: 'REQUIRED',
      message: 'fecha_inicio is required'
    });
  }

  const personaResult = importPersonaPayloadSchema.safeParse(row.persona);
  const vinculacionResult = importVinculacionPayloadSchema.safeParse({
    ...row.vinculacion,
    estado: row.vinculacion.estado ?? 'ACTIVA'
  });

  if (!personaResult.success) {
    errors.push(...mapZodErrors('persona', personaResult.error.issues));
  }

  if (!vinculacionResult.success) {
    errors.push(...mapZodErrors('vinculacion', vinculacionResult.error.issues));
  }

  if (vinculacionResult.success) {
    const empresaExists = await checkExists(client, 'empresas', vinculacionResult.data.empresa_id);

    if (!empresaExists) {
      errors.push({
        field: 'vinculacion.empresa_id',
        code: 'NOT_FOUND',
        message: 'empresa_id does not exist'
      });
    }

    const contratoExists = await checkExists(client, 'contratos', vinculacionResult.data.contrato_id);

    if (!contratoExists) {
      errors.push({
        field: 'vinculacion.contrato_id',
        code: 'NOT_FOUND',
        message: 'contrato_id does not exist'
      });
    }

    const contratoCargoExists = await checkExists(
      client,
      'contrato_cargos',
      vinculacionResult.data.contrato_cargo_id
    );

    if (!contratoCargoExists) {
      errors.push({
        field: 'vinculacion.contrato_cargo_id',
        code: 'NOT_FOUND',
        message: 'contrato_cargo_id does not exist'
      });
    }
  }

  return {
    errors,
    persona: personaResult.success ? personaResult.data : null,
    vinculacion: vinculacionResult.success ? vinculacionResult.data : null
  };
};
