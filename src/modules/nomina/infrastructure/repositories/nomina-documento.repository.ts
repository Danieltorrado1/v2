import type { QueryResult, QueryResultRow } from 'pg';

import { dbPool } from '../../../../config/db';

export interface NominaDocumentoRepositoryExecutor {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<T>>;
}

export interface NominaDesprendibleRepositoryRow extends QueryResultRow {
  activo: boolean | null;
  archivo_path: string | null;
  auxilio_transporte: number | string | null;
  cargo_nombre: string | null;
  contrato_empresa_id: string | null;
  contrato_entidad_contratante: string | null;
  contrato_id: string;
  contrato_numero: string | null;
  created_at: Date | string;
  devengado_basico: number | string | null;
  devengado_otros: number | string | null;
  devengado_transporte: number | string | null;
  desprendible_reemplaza_id: string | null;
  dias_pagados: number | string | null;
  documento_persona_id: string | null;
  dp_mime_type: string | null;
  dp_nombre_original: string | null;
  dp_storage_bucket: string | null;
  dp_storage_path: string | null;
  dp_tamano_bytes: number | string | null;
  empresa_nit: string | null;
  empresa_nombre: string | null;
  es_vigente: boolean | null;
  estado: string;
  fecha_generacion: Date | string | null;
  id: string;
  neto_pagar: number | string | null;
  nomina_empleado_id: string;
  observacion: string | null;
  periodo_estado: string;
  periodo_fecha_fin: Date | string;
  periodo_fecha_inicio: Date | string;
  periodo_id: string;
  periodo_nombre: string;
  pension: number | string | null;
  persona_id: string;
  persona_numero_documento: string | null;
  primer_apellido: string | null;
  primer_nombre: string | null;
  revisado: boolean | null;
  salario_base: number | string | null;
  salud: number | string | null;
  segundo_apellido: string | null;
  segundo_nombre: string | null;
  tipo_desprendible: string | null;
  total_adiciones: number | string | null;
  total_deducciones: number | string | null;
  version: number | string | null;
  vinculacion_id: string;
}

export interface ListNominaDocumentoInput {
  includeVersions?: boolean;
  periodoId: string;
}

export interface NominaDocumentoMetadataInput {
  archivoPath: string;
  documentoPersonaId: string;
  estado?: string;
  observacion: string;
  periodoId: string;
  tipoDesprendible: string;
  vinculacionId: string;
  nominaEmpleadoId: string;
  version: number;
  reemplazaDesprendibleId?: string | null;
}

export interface PersonaDocumentoMetadataInput {
  archivoPath: string;
  documentoReemplazaId?: string | null;
  documentoTipoId: string;
  fechaExpedicion: string;
  fileName: string;
  mimeType: string;
  personaId: string;
  storageBucket: string;
  storagePath: string;
  tamanoBytes: number;
  vinculacionId: string;
  version: number;
}

const desprendibleSelect = `
  SELECT
    nd.id::text AS id,
    nd.periodo_id::text AS periodo_id,
    nd.nomina_empleado_id::text AS nomina_empleado_id,
    nd.vinculacion_id::text AS vinculacion_id,
    nd.tipo_desprendible,
    nd.archivo_path,
    nd.fecha_generacion,
    nd.estado,
    nd.observacion,
    COALESCE(nd.activo, TRUE) AS activo,
    nd.created_at,
    nd.documento_persona_id::text AS documento_persona_id,
    nd.version,
    COALESCE(nd.es_vigente, TRUE) AS es_vigente,
    nd.desprendible_reemplaza_id::text AS desprendible_reemplaza_id,
    ne.salario_base, ne.auxilio_transporte, ne.devengado_basico,
    ne.devengado_transporte, ne.devengado_otros, ne.dias_pagados,
    ne.total_adiciones, ne.total_deducciones, ne.neto_pagar, ne.salud, ne.pension,
    COALESCE(ne.revisado, FALSE) AS revisado,
    np.nombre_periodo AS periodo_nombre, np.fecha_inicio AS periodo_fecha_inicio,
    np.fecha_fin AS periodo_fecha_fin, np.estado AS periodo_estado,
    p.id::text AS persona_id, p.numero_documento AS persona_numero_documento,
    p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido,
    cc.nombre_cargo AS cargo_nombre,
    c.id::text AS contrato_id, c.numero_contrato AS contrato_numero,
    c.entidad_contratante AS contrato_entidad_contratante,
    c.empresa_id::text AS contrato_empresa_id,
    e.nombre_empresa AS empresa_nombre, e.nit AS empresa_nit,
    dp.storage_bucket AS dp_storage_bucket, dp.storage_path AS dp_storage_path,
    dp.nombre_original AS dp_nombre_original, dp.mime_type AS dp_mime_type,
    dp.tamano_bytes AS dp_tamano_bytes
  FROM nomina_desprendibles nd
  INNER JOIN nomina_empleados ne ON ne.id = nd.nomina_empleado_id
  INNER JOIN nomina_periodos np ON np.id = nd.periodo_id
  INNER JOIN vinculaciones v ON v.id = nd.vinculacion_id
  INNER JOIN personas p ON p.id = v.persona_id
  INNER JOIN contratos c ON c.id = v.contrato_id
  INNER JOIN empresas e ON e.id = c.empresa_id
  LEFT JOIN contrato_cargos cc ON cc.id = v.contrato_cargo_id
  LEFT JOIN documentos_persona dp ON dp.id = nd.documento_persona_id
`;

const getExecutor = (executor?: NominaDocumentoRepositoryExecutor): NominaDocumentoRepositoryExecutor =>
  executor ?? (dbPool as NominaDocumentoRepositoryExecutor);

export class NominaDocumentoRepository {
  public async listByPeriodo(
    input: ListNominaDocumentoInput,
    executor?: NominaDocumentoRepositoryExecutor
  ): Promise<NominaDesprendibleRepositoryRow[]> {
    const vigenteFilter = input.includeVersions ? '' : 'AND COALESCE(nd.es_vigente, TRUE) = TRUE';
    const result = await getExecutor(executor).query<NominaDesprendibleRepositoryRow>(
      `${desprendibleSelect}
       WHERE nd.periodo_id = $1::bigint
         AND COALESCE(nd.activo, TRUE) = TRUE
         ${vigenteFilter}
       ORDER BY nd.vinculacion_id ASC, nd.version DESC, nd.id DESC`,
      [input.periodoId]
    );
    return result.rows;
  }

  public async getLatestByPeriodoVinculacion(
    periodoId: string,
    vinculacionId: string,
    executor?: NominaDocumentoRepositoryExecutor
  ): Promise<NominaDesprendibleRepositoryRow | null> {
    const result = await getExecutor(executor).query<NominaDesprendibleRepositoryRow>(
      `${desprendibleSelect}
       WHERE nd.periodo_id = $1::bigint
         AND nd.vinculacion_id = $2::bigint
         AND COALESCE(nd.activo, TRUE) = TRUE
         AND COALESCE(nd.es_vigente, TRUE) = TRUE
       ORDER BY nd.version DESC, nd.id DESC LIMIT 1`,
      [periodoId, vinculacionId]
    );
    return result.rows[0] ?? null;
  }

  public async getLatestVersion(
    periodoId: string,
    nominaEmpleadoId: string,
    executor: NominaDocumentoRepositoryExecutor
  ): Promise<{ desprendible_id: string; documento_persona_id: string | null; version: number | string | null } | null> {
    const result = await executor.query<{ desprendible_id: string; documento_persona_id: string | null; version: number | string | null }>(
      `
        SELECT id::text AS desprendible_id, documento_persona_id::text AS documento_persona_id, version
        FROM nomina_desprendibles
        WHERE periodo_id = $1::bigint AND nomina_empleado_id = $2::bigint
          AND COALESCE(activo, TRUE) = TRUE AND COALESCE(es_vigente, TRUE) = TRUE
        ORDER BY COALESCE(es_vigente, TRUE) DESC, version DESC NULLS LAST, id DESC LIMIT 1
      `,
      [periodoId, nominaEmpleadoId]
    );
    return result.rows[0] ?? null;
  }

  public async markReplaced(
    desprendibleId: string,
    documentoPersonaId: string | null,
    executor: NominaDocumentoRepositoryExecutor
  ): Promise<void> {
    await executor.query(
      `UPDATE nomina_desprendibles SET es_vigente = FALSE, estado = 'REEMPLAZADO' WHERE id = $1::bigint`,
      [desprendibleId]
    );
    if (documentoPersonaId) {
      await executor.query(`UPDATE documentos_persona SET es_vigente = FALSE WHERE id = $1::bigint`, [documentoPersonaId]);
    }
  }

  public async createPersonaMetadata(
    input: PersonaDocumentoMetadataInput,
    executor: NominaDocumentoRepositoryExecutor
  ): Promise<string> {
    const result = await executor.query<{ id: string }>(
      `
        INSERT INTO documentos_persona (
          persona_id, tipo_documento_id, fecha_expedicion, fecha_vencimiento,
          archivo_path, fecha_carga, activo, vinculacion_id, version,
          documento_reemplaza_id, es_vigente, storage_bucket, storage_path,
          nombre_original, mime_type, tamano_bytes
        ) VALUES ($1::bigint, $2::bigint, $3::date, NULL, $4, NOW(), TRUE,
          $5::bigint, $6::int, $7::bigint, TRUE, $8, $9, $10, $11, $12::bigint)
        RETURNING id::text AS id
      `,
      [input.personaId, input.documentoTipoId, input.fechaExpedicion, input.archivoPath,
        input.vinculacionId, input.version, input.documentoReemplazaId ?? null,
        input.storageBucket, input.storagePath, input.fileName, input.mimeType, input.tamanoBytes]
    );
    const row = result.rows[0];
    if (!row) throw new Error('NominaDocumentoRepository.createPersonaMetadata returned no id');
    return row.id;
  }

  public async createMetadata(
    input: NominaDocumentoMetadataInput,
    executor: NominaDocumentoRepositoryExecutor
  ): Promise<string> {
    const result = await executor.query<{ id: string }>(
      `
        INSERT INTO nomina_desprendibles (
          periodo_id, nomina_empleado_id, vinculacion_id, tipo_desprendible,
          archivo_path, fecha_generacion, estado, observacion, activo,
          documento_persona_id, version, es_vigente, desprendible_reemplaza_id
        ) VALUES ($1::bigint, $2::bigint, $3::bigint, $4, $5, NOW(),
          $6, $7, TRUE, $8::bigint, $9::int, TRUE, $10::bigint)
        RETURNING id::text AS id
      `,
      [input.periodoId, input.nominaEmpleadoId, input.vinculacionId, input.tipoDesprendible,
        input.archivoPath, input.estado ?? 'GENERADO', input.observacion,
        input.documentoPersonaId, input.version, input.reemplazaDesprendibleId ?? null]
    );
    const row = result.rows[0];
    if (!row) throw new Error('NominaDocumentoRepository.createMetadata returned no id');
    return row.id;
  }

  public async countCurrentByPeriodo(periodoId: string, executor: NominaDocumentoRepositoryExecutor): Promise<number> {
    const result = await executor.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM nomina_desprendibles WHERE periodo_id = $1::bigint AND COALESCE(activo, TRUE) = TRUE AND COALESCE(es_vigente, TRUE) = TRUE`,
      [periodoId]
    );
    return result.rows[0]?.total ?? 0;
  }

  public async markFinalizedByPeriodo(periodoId: string, executor: NominaDocumentoRepositoryExecutor): Promise<number> {
    const result = await executor.query(
      `UPDATE nomina_desprendibles SET estado = 'FINALIZADO' WHERE periodo_id = $1::bigint AND COALESCE(activo, TRUE) = TRUE AND COALESCE(es_vigente, TRUE) = TRUE`,
      [periodoId]
    );
    return result.rowCount ?? 0;
  }
}

export const nominaDocumentoRepository = new NominaDocumentoRepository();
