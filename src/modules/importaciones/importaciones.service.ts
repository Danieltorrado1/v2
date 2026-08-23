import { createHash } from 'node:crypto';

import { PoolClient, QueryResultRow } from 'pg';
import * as XLSX from 'xlsx';

import { dbPool, dbQuery } from '../../config/db';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import { registerAuditEntry } from '../auditoria/auditoria.helper';
import { normalizeNumeroDocumento } from '../personas/personas.identificaciones.helpers';
import { createPersona } from '../personas/personas.service';
import { createVinculacion } from '../vinculaciones/vinculaciones.service';
import { METODOS_PAGO } from '../vinculaciones/vinculaciones.schemas';
import {
  detectOperationalImportDuplicates,
  IMPORT_TEMPLATE_COLUMNS,
  type ImportPersonaStatus,
  type ImportRowGeneralStatus,
  type ImportVinculacionStatus,
  normalizeImportText,
  type OperationalImportRow
} from './importaciones.domain';
import { mapExcelRows } from './importaciones.mapper';
import type {
  ImportacionLoteEstado,
  ImportacionPreviewQuery,
  ImportPreviewFilter,
  ListImportacionLotesQuery
} from './importaciones.schemas';
import type { ImportRowValidationIssue } from './importaciones.validator';

interface CountRow extends QueryResultRow { total: number; }
interface ContractRow extends QueryResultRow {
  id: number | string;
  empresa_id: number | string;
  empresa_nombre: string | null;
  numero_contrato: string | null;
  fecha_inicio: string | Date | null;
  fecha_finalizacion: string | Date | null;
}
interface LoteRow extends QueryResultRow {
  id: number | string;
  tipo: string;
  archivo_nombre: string;
  estado: ImportacionLoteEstado;
  total_filas: number;
  filas_validas: number;
  filas_con_error: number;
  resumen: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_by: number | string;
  confirmed_by: number | string | null;
  cancelado_por: number | string | null;
  created_at: Date;
  updated_at: Date;
  confirmed_at: Date | null;
  cancelado_at: Date | null;
  contrato_id: number | string | null;
  empresa_id: number | string | null;
  archivo_mime_type: string | null;
  archivo_sha256: string | null;
}
interface ErrorRow extends QueryResultRow {
  id: number | string;
  fila_numero: number;
  staging_tipo: string;
  staging_id: number | string | null;
  campo: string;
  codigo: string;
  mensaje: string;
  created_at: Date;
}
interface DocTypeRow extends QueryResultRow { id: number | string; codigo: string | null; nombre_documento: string; }
interface CargoRow extends QueryResultRow { id: number | string; nombre_cargo: string; }
interface TipoVincRow extends QueryResultRow { id: number | string; codigo: string | null; nombre_vinculacion: string; }
interface PersonMatchRow extends QueryResultRow {
  id: number | string;
  identificacion_id: number | string;
  primer_nombre: string;
  segundo_nombre: string | null;
  primer_apellido: string;
  segundo_apellido: string | null;
}
interface ExistingLinkRow extends QueryResultRow { id: number | string; fecha_inicio: string | Date; estado_vinculacion: string | null; }
interface StageRowDb extends QueryResultRow {
  fila_numero: number;
  persona_payload_resuelto: PreviewPayload;
  persona_estado_final: string | null;
  persona_mensaje_final: string | null;
  persona_resultado_estado: string | null;
  persona_persona_id: number | string | null;
  persona_persona_existente_id: number | string | null;
  vinculacion_estado_final: string | null;
  vinculacion_mensaje_final: string | null;
  vinculacion_resultado_estado: string | null;
  vinculacion_vinculacion_id: number | string | null;
  vinculacion_vinculacion_existente_id: number | string | null;
}
interface StageConfirmRow extends QueryResultRow {
  fila_numero: number;
  numero_documento: string;
  tipo_documento_id: number | string | null;
  primer_nombre: string;
  segundo_nombre: string | null;
  primer_apellido: string;
  segundo_apellido: string | null;
  fecha_nacimiento: string | Date | null;
  fecha_expedicion_documento: string | Date | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  payload: PreviewPayload;
}
interface PreviewPayload {
  original: { tipo_identificacion: string | null; numero_documento: string | null; nombre: string | null; cargo: string | null; tipo_vinculacion: string | null; fecha_ingreso: string | null; metodo_pago: string | null; estado: string | null; };
  persona_status: ImportPersonaStatus;
  vinculacion_status: ImportVinculacionStatus;
  resultado: ImportRowGeneralStatus;
  ready_to_confirm: boolean;
  message: string;
  warnings: string[];
  errors: ImportRowValidationIssue[];
  resolved: { tipo_documento_id: number | null; persona_id: number | null; identificacion_id: number | null; cargo_id: number | null; tipo_vinculacion_id: number | null; vinculacion_id: number | null; fecha_ingreso: string | null; metodo_pago: string | null; };
}
export interface ImportacionLote { id: number; tipo: string; archivo_nombre: string; estado: ImportacionLoteEstado; total_filas: number; filas_validas: number; filas_con_error: number; resumen: Record<string, unknown> | null; metadata: Record<string, unknown> | null; created_by: string; confirmed_by: string | null; cancelado_por: string | null; created_at: string; updated_at: string; confirmed_at: string | null; cancelado_at: string | null; contrato_id: number | null; empresa_id: number | null; archivo_mime_type: string | null; archivo_sha256: string | null; }
export interface ImportacionLoteDetalle extends ImportacionLote { contrato: { id: number; empresa_id: number; empresa_nombre: string | null; numero_contrato: string | null; fecha_inicio: string | null; fecha_finalizacion: string | null; } | null; pendientes_confirmacion: number; puede_confirmar: boolean; }
export interface ImportacionError { id: number; fila_numero: number; staging_tipo: string; staging_id: number | null; campo: string; codigo: string; mensaje: string; created_at: string; }
export interface PaginatedImportacionLotes { items: ImportacionLote[]; pagination: { page: number; limit: number; total: number; total_pages: number; }; }
export interface ImportPreviewRow { fila: number; tipo_documento: string | null; numero_documento: string | null; nombre: string | null; cargo_original: string | null; tipo_vinculacion_original: string | null; estado_persona: string; estado_vinculacion: string; resultado: string; mensaje: string; persona_id: number | null; vinculacion_id: number | null; ready_to_confirm: boolean; warnings: string[]; errors: ImportRowValidationIssue[]; }
export interface ImportPreviewSummary { total_filas: number; listas: number; personas_nuevas: number; personas_reutilizadas: number; ya_vinculadas: number; con_errores: number; duplicadas: number; }
export interface UploadImportacionResult { lote: ImportacionLoteDetalle; summary: ImportPreviewSummary; }
export interface ImportacionPreviewResult { lote: ImportacionLoteDetalle; rows: ImportPreviewRow[]; summary: ImportPreviewSummary; pagination: { page: number; limit: number; total: number; total_pages: number; filter: ImportPreviewFilter; }; }
export interface ConfirmImportacionResult { lote: ImportacionLoteDetalle; created_personas: number; reused_personas: number; created_vinculaciones: number; skipped_already_linked: number; }

const IMPORT_TYPE = 'PERSONAS_VINCULACIONES';
const ACTIVE_LINK_STATES = new Set(['ACTIVA', 'ACTIVO', 'SUSPENDIDA']);

const toNumber = (value: string | number | null | undefined): number | null => value === null || value === undefined || value === '' ? null : Number(value);
const toRequiredNumber = (value: string | number | null | undefined, code = 'INVALID_NUMERIC_VALUE'): number => {
  const parsed = toNumber(value);
  if (parsed === null || !Number.isFinite(parsed)) throw new AppError('Invalid numeric value returned by database', 500, code);
  return parsed;
};
const formatDate = (value: string | Date | null | undefined): string | null => !value ? null : value instanceof Date ? value.toISOString().slice(0, 10) : value;
const formatTs = (value: Date | null | undefined): string | null => value ? value.toISOString() : null;
const normalizeState = (value: string | null | undefined): 'ACTIVA' | 'RETIRADA' | 'SUSPENDIDA' | null => {
  if (!value) return 'ACTIVA';
  const text = normalizeImportText(value).toUpperCase();
  if (text === 'ACTIVA' || text === 'ACTIVO') return 'ACTIVA';
  if (text === 'RETIRADA' || text === 'RETIRADO') return 'RETIRADA';
  if (text === 'SUSPENDIDA' || text === 'SUSPENDIDO') return 'SUSPENDIDA';
  return null;
};
const normalizeMetodoPago = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const text = normalizeImportText(value).toUpperCase();
  return METODOS_PAGO.find((item) => item === text) ?? null;
};
const issue = (field: string, code: string, message: string, severity: 'ERROR' | 'WARNING' = 'ERROR'): ImportRowValidationIssue => ({ field, code, message, severity });
const hasTenantContractAccess = (tenant: TenantAccessContext | undefined, contratoId: number, empresaId: number): boolean => {
  if (!tenant || tenant.isGlobalAdmin) return true;
  if (tenant.contratoIds.length > 0) return tenant.contratoIds.includes(contratoId);
  return tenant.empresaIds.includes(empresaId);
};
const buildName = (row: OperationalImportRow, match?: PersonMatchRow | null): string | null => {
  if (match) return [match.primer_nombre, match.segundo_nombre, match.primer_apellido, match.segundo_apellido].filter(Boolean).join(' ');
  const parts = [row.persona.primer_nombre, row.persona.segundo_nombre, row.persona.primer_apellido, row.persona.segundo_apellido].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : null;
};
const mapLote = (row: LoteRow): ImportacionLote => ({
  id: toRequiredNumber(row.id),
  tipo: row.tipo,
  archivo_nombre: row.archivo_nombre,
  estado: row.estado,
  total_filas: row.total_filas,
  filas_validas: row.filas_validas,
  filas_con_error: row.filas_con_error,
  resumen: row.resumen,
  metadata: row.metadata,
  created_by: String(row.created_by),
  confirmed_by: row.confirmed_by === null ? null : String(row.confirmed_by),
  cancelado_por: row.cancelado_por === null ? null : String(row.cancelado_por),
  created_at: row.created_at.toISOString(),
  updated_at: row.updated_at.toISOString(),
  confirmed_at: formatTs(row.confirmed_at),
  cancelado_at: formatTs(row.cancelado_at),
  contrato_id: toNumber(row.contrato_id),
  empresa_id: toNumber(row.empresa_id),
  archivo_mime_type: row.archivo_mime_type,
  archivo_sha256: row.archivo_sha256
});
const mapError = (row: ErrorRow): ImportacionError => ({ id: toRequiredNumber(row.id), fila_numero: row.fila_numero, staging_tipo: row.staging_tipo, staging_id: toNumber(row.staging_id), campo: row.campo, codigo: row.codigo, mensaje: row.mensaje, created_at: row.created_at.toISOString() });
const auditTrail = (metadata: Record<string, unknown> | null, entry: Record<string, unknown>): Record<string, unknown> => ({ ...(metadata ?? {}), audit_trail: [...(Array.isArray(metadata?.audit_trail) ? metadata.audit_trail : []), entry] });

const loadContractOrThrow = async (client: PoolClient, contratoId: number, tenant?: TenantAccessContext): Promise<ContractRow> => {
  const result = await client.query<ContractRow>(`SELECT c.id, c.empresa_id, c.numero_contrato, c.fecha_inicio, c.fecha_finalizacion, e.nombre_empresa AS empresa_nombre FROM contratos c INNER JOIN empresas e ON e.id = c.empresa_id WHERE c.id = $1::bigint LIMIT 1`, [contratoId]);
  const row = result.rows[0];
  if (!row) throw new AppError('Contrato no encontrado', 404, 'CONTRATO_NOT_FOUND');
  if (!hasTenantContractAccess(tenant, toRequiredNumber(row.id), toRequiredNumber(row.empresa_id))) throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  return row;
};
const getLoteRow = async (client: PoolClient, loteId: number, forUpdate = false): Promise<LoteRow | null> => {
  const sql = `SELECT id, tipo, archivo_nombre, estado, total_filas, filas_validas, filas_con_error, resumen, metadata, created_by, confirmed_by, cancelado_por, created_at, updated_at, confirmed_at, cancelado_at, contrato_id, empresa_id, archivo_mime_type, archivo_sha256 FROM importacion_lotes WHERE id = $1::bigint ${forUpdate ? 'FOR UPDATE' : ''} LIMIT 1`;
  const result = await client.query<LoteRow>(sql, [loteId]);
  return result.rows[0] ?? null;
};
const getLoteDetail = async (client: PoolClient, lote: LoteRow): Promise<ImportacionLoteDetalle> => {
  const pendingResult = await client.query<CountRow>(`SELECT COUNT(*)::int AS total FROM importacion_staging_personas WHERE lote_id = $1::bigint AND COALESCE((payload_resuelto ->> 'ready_to_confirm')::boolean, FALSE) = TRUE AND COALESCE(procesado, FALSE) = FALSE`, [toRequiredNumber(lote.id)]);
  const contrato = lote.contrato_id ? await loadContractOrThrow(client, toRequiredNumber(lote.contrato_id)) : null;
  return {
    ...mapLote(lote),
    contrato: contrato ? { id: toRequiredNumber(contrato.id), empresa_id: toRequiredNumber(contrato.empresa_id), empresa_nombre: contrato.empresa_nombre, numero_contrato: contrato.numero_contrato, fecha_inicio: formatDate(contrato.fecha_inicio), fecha_finalizacion: formatDate(contrato.fecha_finalizacion) } : null,
    pendientes_confirmacion: pendingResult.rows[0]?.total ?? 0,
    puede_confirmar: lote.estado !== 'CONFIRMADO' && lote.estado !== 'CANCELADO' && (pendingResult.rows[0]?.total ?? 0) > 0
  };
};
const appendTenantScope = (conditions: string[], params: unknown[], tenant?: TenantAccessContext): void => {
  if (!tenant || tenant.isGlobalAdmin) return;
  if (tenant.contratoIds.length === 0 && tenant.empresaIds.length === 0) { conditions.push('1 = 0'); return; }
  if (tenant.contratoIds.length > 0) { params.push(tenant.contratoIds); conditions.push(`contrato_id = ANY($${params.length}::bigint[])`); return; }
  params.push(tenant.empresaIds); conditions.push(`empresa_id = ANY($${params.length}::bigint[])`);
};
const loadDocTypes = async (client: PoolClient): Promise<DocTypeRow[]> => (await client.query<DocTypeRow>(`SELECT id, codigo, nombre_documento FROM tipos_documentos WHERE COALESCE(es_identificacion_personal, FALSE) = TRUE ORDER BY nombre_documento ASC, id ASC`)).rows;
const loadCargos = async (client: PoolClient, contratoId: number): Promise<CargoRow[]> => (await client.query<CargoRow>(`SELECT id, nombre_cargo FROM contrato_cargos WHERE contrato_id = $1::bigint AND COALESCE(activo, TRUE) = TRUE ORDER BY nombre_cargo ASC, id ASC`, [contratoId])).rows;
const loadTiposVinc = async (client: PoolClient): Promise<TipoVincRow[]> => (await client.query<TipoVincRow>(`SELECT id, codigo, nombre_vinculacion FROM tipos_vinculacion ORDER BY nombre_vinculacion ASC, id ASC`)).rows;
const resolveDocType = (value: string | null, docs: DocTypeRow[]) => {
  if (!value) return { id: null as number | null, matches: [] as DocTypeRow[] };
  const text = normalizeImportText(value);
  const byCode = docs.filter((item) => item.codigo && normalizeImportText(item.codigo) === text);
  if (byCode.length > 0) {
    const first = byCode[0];
    return { id: byCode.length === 1 && first ? toRequiredNumber(first.id) : null, matches: byCode };
  }
  const byName = docs.filter((item) => normalizeImportText(item.nombre_documento) === text);
  const first = byName[0];
  return { id: byName.length === 1 && first ? toRequiredNumber(first.id) : null, matches: byName };
};
const resolveCargo = (value: string | null, cargos: CargoRow[]) => {
  if (!value) return { id: null as number | null, matches: [] as CargoRow[] };
  const text = normalizeImportText(value);
  const matches = cargos.filter((item) => normalizeImportText(item.nombre_cargo) === text);
  const first = matches[0];
  return { id: matches.length === 1 && first ? toRequiredNumber(first.id) : null, matches };
};
const resolveTipoVinc = (value: string | null, tipos: TipoVincRow[]) => {
  if (!value) return { id: null as number | null, matches: [] as TipoVincRow[] };
  const text = normalizeImportText(value);
  const byCode = tipos.filter((item) => item.codigo && normalizeImportText(item.codigo) === text);
  if (byCode.length > 0) {
    const first = byCode[0];
    return { id: byCode.length === 1 && first ? toRequiredNumber(first.id) : null, matches: byCode };
  }
  const byName = tipos.filter((item) => normalizeImportText(item.nombre_vinculacion) === text);
  const first = byName[0];
  return { id: byName.length === 1 && first ? toRequiredNumber(first.id) : null, matches: byName };
};
const findPersonByIdentification = async (client: PoolClient, tipoDocumentoId: number, numeroDocumento: string): Promise<PersonMatchRow | null> => {
  const result = await client.query<PersonMatchRow>(`SELECT p.id, pi.id AS identificacion_id, p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido FROM persona_identificaciones pi INNER JOIN personas p ON p.id = pi.persona_id WHERE pi.tipo_documento_id = $1::bigint AND pi.numero_documento = $2 AND pi.es_vigente = TRUE ORDER BY pi.vigente_desde DESC NULLS LAST, pi.id DESC LIMIT 1`, [tipoDocumentoId, normalizeNumeroDocumento(numeroDocumento)]);
  return result.rows[0] ?? null;
};
const findExistingLink = async (client: PoolClient, personaId: number, contratoId: number, fechaIngreso: string | null): Promise<ExistingLinkRow | null> => {
  const rows = (await client.query<ExistingLinkRow>(`SELECT id, fecha_inicio, estado_vinculacion FROM vinculaciones WHERE persona_id = $1::bigint AND contrato_id = $2::bigint ORDER BY CASE WHEN estado_vinculacion IN ('ACTIVA','ACTIVO','SUSPENDIDA') THEN 0 ELSE 1 END, fecha_inicio DESC, id DESC`, [personaId, contratoId])).rows;
  const active = rows.find((row) => ACTIVE_LINK_STATES.has((row.estado_vinculacion ?? '').toUpperCase()));
  if (active) return active;
  return fechaIngreso ? rows.find((row) => formatDate(row.fecha_inicio) === fechaIngreso) ?? null : null;
};
const summaryFromRows = (rows: ImportPreviewRow[]): ImportPreviewSummary => ({ total_filas: rows.length, listas: rows.filter((row) => row.resultado === 'LISTO').length, personas_nuevas: rows.filter((row) => row.estado_persona === 'LISTO_CREAR_PERSONA').length, personas_reutilizadas: rows.filter((row) => row.estado_persona === 'LISTO_REUTILIZAR_PERSONA').length, ya_vinculadas: rows.filter((row) => row.resultado === 'YA_VINCULADO').length, con_errores: rows.filter((row) => row.resultado !== 'LISTO' && row.resultado !== 'YA_VINCULADO').length, duplicadas: rows.filter((row) => row.resultado === 'DUPLICADO_EN_ARCHIVO' || row.resultado === 'DUPLICADO_CONFLICTIVO').length });
const matchesFilter = (row: ImportPreviewRow, filter: ImportPreviewFilter): boolean => filter === 'TODOS' ? true : filter === 'LISTOS' ? row.resultado === 'LISTO' : filter === 'REUTILIZADOS' ? row.estado_persona === 'LISTO_REUTILIZAR_PERSONA' || row.estado_persona === 'REUTILIZADA' : filter === 'YA_VINCULADOS' ? row.resultado === 'YA_VINCULADO' || row.estado_vinculacion === 'YA_VINCULADO' : row.resultado !== 'LISTO' && row.resultado !== 'YA_VINCULADO';
const buildPreviewPayload = async (
  client: PoolClient,
  row: OperationalImportRow,
  contrato: ContractRow,
  docs: DocTypeRow[],
  cargos: CargoRow[],
  tipos: TipoVincRow[],
  duplicate: { kind: 'DUPLICADO_EN_ARCHIVO' | 'DUPLICADO_CONFLICTIVO'; rowNumbers: number[] } | null
): Promise<PreviewPayload> => {
  const errors: ImportRowValidationIssue[] = [];
  const warnings: string[] = [];
  const doc = resolveDocType(row.persona.tipo_identificacion, docs);
  const cargo = resolveCargo(row.vinculacion.cargo, cargos);
  const tipoVinc = resolveTipoVinc(row.vinculacion.tipo_vinculacion, tipos);
  const numeroDocumento = row.persona.numero_documento ? normalizeNumeroDocumento(row.persona.numero_documento) : null;
  const estado = normalizeState(row.vinculacion.estado);
  const metodoPago = normalizeMetodoPago(row.vinculacion.metodo_pago);

  if (!row.persona.tipo_identificacion) errors.push(issue('persona.tipo_identificacion', 'REQUIRED', 'Falta tipo de identificación.'));
  else if (doc.matches.length === 0) errors.push(issue('persona.tipo_identificacion', 'TIPO_DOCUMENTO_NO_ENCONTRADO', `Tipo de identificación no encontrado: ${row.persona.tipo_identificacion}`));
  else if (doc.matches.length > 1 && !doc.id) errors.push(issue('persona.tipo_identificacion', 'ERROR', `Tipo de identificación ambiguo: ${row.persona.tipo_identificacion}`));
  if (!numeroDocumento) errors.push(issue('persona.numero_documento', 'REQUIRED', 'Falta número de identificación.'));
  if (row.persona.fecha_nacimiento_raw && !row.persona.fecha_nacimiento) errors.push(issue('persona.fecha_nacimiento', 'FECHA_INVALIDA', `Fecha de nacimiento inválida: ${row.persona.fecha_nacimiento_raw}`));
  if (row.persona.fecha_expedicion_raw && !row.persona.fecha_expedicion) errors.push(issue('persona.fecha_expedicion', 'FECHA_INVALIDA', `Fecha de expedición inválida: ${row.persona.fecha_expedicion_raw}`));
  if (row.vinculacion.fecha_ingreso_raw && !row.vinculacion.fecha_ingreso) errors.push(issue('vinculacion.fecha_ingreso', 'FECHA_INVALIDA', `Fecha de ingreso inválida: ${row.vinculacion.fecha_ingreso_raw}`));
  if (duplicate) errors.push(issue('persona.numero_documento', duplicate.kind, duplicate.kind === 'DUPLICADO_CONFLICTIVO' ? `Documento repetido con datos conflictivos en filas ${duplicate.rowNumbers.join(', ')}` : `Documento duplicado en filas ${duplicate.rowNumbers.join(', ')}`));

  let person: PersonMatchRow | null = null;
  if (doc.id && numeroDocumento) person = await findPersonByIdentification(client, doc.id, numeroDocumento);
  if (!person) {
    if (!row.persona.primer_nombre) errors.push(issue('persona.primer_nombre', 'REQUIRED', 'Falta primer nombre.'));
    if (!row.persona.primer_apellido) errors.push(issue('persona.primer_apellido', 'REQUIRED', 'Falta primer apellido.'));
  }
  if (!row.persona.segundo_nombre) warnings.push('Falta segundo nombre.');
  if (!row.persona.telefono) warnings.push('Falta teléfono.');
  if (!row.persona.fecha_nacimiento) warnings.push('Falta fecha de nacimiento.');

  if (!row.vinculacion.cargo) errors.push(issue('vinculacion.cargo', 'REQUIRED', 'Falta cargo.'));
  else if (cargo.matches.length === 0) errors.push(issue('vinculacion.cargo', 'CARGO_NO_ENCONTRADO', `Cargo no encontrado: ${row.vinculacion.cargo}`));
  else if (cargo.matches.length > 1 && !cargo.id) errors.push(issue('vinculacion.cargo', 'CARGO_AMBIGUO', `Cargo ambiguo: ${row.vinculacion.cargo}`));

  if (!row.vinculacion.tipo_vinculacion) errors.push(issue('vinculacion.tipo_vinculacion', 'REQUIRED', 'Falta tipo de vinculación.'));
  else if (tipoVinc.matches.length === 0) errors.push(issue('vinculacion.tipo_vinculacion', 'TIPO_VINCULACION_NO_ENCONTRADO', `Tipo de vinculación no encontrado: ${row.vinculacion.tipo_vinculacion}`));
  else if (tipoVinc.matches.length > 1 && !tipoVinc.id) errors.push(issue('vinculacion.tipo_vinculacion', 'ERROR', `Tipo de vinculación ambiguo: ${row.vinculacion.tipo_vinculacion}`));

  if (!row.vinculacion.fecha_ingreso) errors.push(issue('vinculacion.fecha_ingreso', 'REQUIRED', 'Falta fecha de ingreso.'));
  if (row.vinculacion.fecha_ingreso && formatDate(contrato.fecha_inicio) && row.vinculacion.fecha_ingreso < formatDate(contrato.fecha_inicio)!) errors.push(issue('vinculacion.fecha_ingreso', 'FECHA_INVALIDA', `La fecha de ingreso ${row.vinculacion.fecha_ingreso} es anterior al inicio contractual ${formatDate(contrato.fecha_inicio)}.`));
  if (row.vinculacion.fecha_ingreso && formatDate(contrato.fecha_finalizacion) && row.vinculacion.fecha_ingreso > formatDate(contrato.fecha_finalizacion)!) errors.push(issue('vinculacion.fecha_ingreso', 'FECHA_INVALIDA', `La fecha de ingreso ${row.vinculacion.fecha_ingreso} es posterior al fin contractual ${formatDate(contrato.fecha_finalizacion)}.`));
  if (row.vinculacion.estado && !estado) errors.push(issue('vinculacion.estado', 'ERROR', `Estado de vinculación no soportado: ${row.vinculacion.estado}`));
  if (row.vinculacion.metodo_pago && !metodoPago) errors.push(issue('vinculacion.metodo_pago', 'ERROR', `Método de pago no soportado: ${row.vinculacion.metodo_pago}`));

  const existingLink = person ? await findExistingLink(client, toRequiredNumber(person.id), toRequiredNumber(contrato.id), row.vinculacion.fecha_ingreso) : null;
  const resultado: ImportRowGeneralStatus = existingLink ? 'YA_VINCULADO'
    : errors.some((item) => item.code === 'DUPLICADO_CONFLICTIVO') ? 'DUPLICADO_CONFLICTIVO'
    : errors.some((item) => item.code === 'DUPLICADO_EN_ARCHIVO') ? 'DUPLICADO_EN_ARCHIVO'
    : errors.some((item) => item.code === 'TIPO_DOCUMENTO_NO_ENCONTRADO') ? 'TIPO_DOCUMENTO_NO_ENCONTRADO'
    : errors.some((item) => item.code === 'CARGO_AMBIGUO') ? 'CARGO_AMBIGUO'
    : errors.some((item) => item.code === 'CARGO_NO_ENCONTRADO') ? 'CARGO_NO_ENCONTRADO'
    : errors.some((item) => item.code === 'TIPO_VINCULACION_NO_ENCONTRADO') ? 'TIPO_VINCULACION_NO_ENCONTRADO'
    : errors.some((item) => item.code === 'FECHA_INVALIDA') ? 'FECHA_INVALIDA'
    : errors.length > 0 ? (doc.id && numeroDocumento ? 'DATOS_INCOMPLETOS' : 'DOCUMENTO_INVALIDO')
    : 'LISTO';
  const personaStatus: ImportPersonaStatus = person ? 'LISTO_REUTILIZAR_PERSONA' : resultado === 'LISTO' ? 'LISTO_CREAR_PERSONA' : errors.some((item) => item.code === 'TIPO_DOCUMENTO_NO_ENCONTRADO') ? 'TIPO_DOCUMENTO_NO_ENCONTRADO' : resultado === 'DOCUMENTO_INVALIDO' ? 'DOCUMENTO_INVALIDO' : 'DATOS_INCOMPLETOS';
  const vinculacionStatus: ImportVinculacionStatus = existingLink ? 'YA_VINCULADO' : errors.some((item) => item.code === 'CARGO_AMBIGUO') ? 'CARGO_AMBIGUO' : errors.some((item) => item.code === 'CARGO_NO_ENCONTRADO') ? 'CARGO_NO_ENCONTRADO' : errors.some((item) => item.code === 'TIPO_VINCULACION_NO_ENCONTRADO') ? 'TIPO_VINCULACION_NO_ENCONTRADO' : errors.some((item) => item.code === 'FECHA_INVALIDA') ? 'FECHA_INVALIDA' : resultado === 'LISTO' ? 'LISTA_PARA_CREAR' : 'DATOS_INCOMPLETOS';
  const message = existingLink ? `Persona ya vinculada al contrato. Vinculación existente #${toRequiredNumber(existingLink.id)}.` : errors[0]?.message ?? (person ? `Persona existente reutilizada: #${toRequiredNumber(person.id)}.` : 'Persona nueva lista para crear y vincular.');

  return {
    original: { tipo_identificacion: row.persona.tipo_identificacion, numero_documento: row.persona.numero_documento, nombre: buildName(row), cargo: row.vinculacion.cargo, tipo_vinculacion: row.vinculacion.tipo_vinculacion, fecha_ingreso: row.vinculacion.fecha_ingreso_raw ?? row.vinculacion.fecha_ingreso, metodo_pago: row.vinculacion.metodo_pago, estado: row.vinculacion.estado },
    persona_status: personaStatus,
    vinculacion_status: vinculacionStatus,
    resultado,
    ready_to_confirm: resultado === 'LISTO',
    message,
    warnings,
    errors,
    resolved: { tipo_documento_id: doc.id, persona_id: person ? toRequiredNumber(person.id) : null, identificacion_id: person ? toRequiredNumber(person.identificacion_id) : null, cargo_id: cargo.id, tipo_vinculacion_id: tipoVinc.id, vinculacion_id: existingLink ? toRequiredNumber(existingLink.id) : null, fecha_ingreso: row.vinculacion.fecha_ingreso, metodo_pago: metodoPago }
  };
};

const mapPreviewRow = (row: StageRowDb): ImportPreviewRow => {
  const payload = row.persona_payload_resuelto;
  return {
    fila: row.fila_numero,
    tipo_documento: payload.original.tipo_identificacion,
    numero_documento: payload.original.numero_documento,
    nombre: payload.original.nombre,
    cargo_original: payload.original.cargo,
    tipo_vinculacion_original: payload.original.tipo_vinculacion,
    estado_persona: row.persona_estado_final ?? row.persona_resultado_estado ?? payload.persona_status,
    estado_vinculacion: row.vinculacion_estado_final ?? row.vinculacion_resultado_estado ?? payload.vinculacion_status,
    resultado: row.vinculacion_estado_final === 'VINCULADA' ? 'IMPORTADA' : row.vinculacion_estado_final ?? payload.resultado,
    mensaje: row.vinculacion_mensaje_final ?? row.persona_mensaje_final ?? payload.message,
    persona_id: toNumber(row.persona_persona_id ?? row.persona_persona_existente_id),
    vinculacion_id: toNumber(row.vinculacion_vinculacion_id ?? row.vinculacion_vinculacion_existente_id),
    ready_to_confirm: payload.ready_to_confirm && !row.vinculacion_estado_final,
    warnings: payload.warnings,
    errors: payload.errors
  };
};
const loadPreviewRows = async (client: PoolClient, loteId: number): Promise<ImportPreviewRow[]> => {
  const result = await client.query<StageRowDb>(`SELECT sp.fila_numero, sp.payload_resuelto AS persona_payload_resuelto, sp.resultado_estado AS persona_resultado_estado, sp.estado_final AS persona_estado_final, sp.mensaje_final AS persona_mensaje_final, sp.persona_id AS persona_persona_id, sp.persona_existente_id AS persona_persona_existente_id, sv.resultado_estado AS vinculacion_resultado_estado, sv.estado_final AS vinculacion_estado_final, sv.mensaje_final AS vinculacion_mensaje_final, sv.vinculacion_id AS vinculacion_vinculacion_id, sv.vinculacion_existente_id AS vinculacion_vinculacion_existente_id FROM importacion_staging_personas sp INNER JOIN importacion_staging_vinculaciones sv ON sv.lote_id = sp.lote_id AND sv.fila_numero = sp.fila_numero WHERE sp.lote_id = $1::bigint ORDER BY sp.fila_numero ASC`, [loteId]);
  return result.rows.map(mapPreviewRow);
};
const insertImportError = async (client: PoolClient, loteId: number, fila: number, stagingTipo: 'PERSONA' | 'VINCULACION', stagingId: number, rowData: Record<string, unknown>, err: ImportRowValidationIssue): Promise<void> => {
  await client.query(`INSERT INTO importacion_errores (lote_id, fila_numero, staging_tipo, staging_id, campo, codigo, mensaje, data_cruda) VALUES ($1::bigint, $2::int, $3, $4::bigint, $5, $6, $7, $8::jsonb)`, [loteId, fila, stagingTipo, stagingId, err.field, err.code, err.message, JSON.stringify(rowData)]);
};
export const buildOperationalImportTemplateCsv = (): string => {
  const header = IMPORT_TEMPLATE_COLUMNS.map((column) => column.label).join(',');
  const required = IMPORT_TEMPLATE_COLUMNS.map((column) => (column.required ? 'SI' : 'NO')).join(',');
  const sample = ['CC', '123456789', 'MARIA', '', 'PEREZ', '', '1990-05-10', '2008-07-15', 'Bogota', '3001234567', 'maria.perez@example.com', 'Cra 1 # 2-3', 'Bogota', 'Auxiliar de cocina', 'LABORAL', '2024-01-15', 'ASISTENCIA', 'ACTIVA'].join(',');
  return [header, required, sample].join('\n');
};

export const uploadPersonasVinculacionesExcel = async (fileBuffer: Buffer, fileOriginalName: string, fileMimeType: string | null, actorUserId: string, contratoId: number, tenant?: TenantAccessContext): Promise<UploadImportacionResult> => {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new AppError('El archivo no contiene hojas para importar', 400, 'EMPTY_WORKBOOK');
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) throw new AppError('No fue posible leer la hoja de trabajo', 400, 'INVALID_WORKSHEET');
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: null, raw: true });
  if (rawRows.length === 0) throw new AppError('El archivo no contiene filas para importar', 400, 'EMPTY_SHEET');

  const mappedRows = mapExcelRows(rawRows);
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const contrato = await loadContractOrThrow(client, contratoId, tenant);
    const sha256 = createHash('sha256').update(fileBuffer).digest('hex');
    const actorId = toRequiredNumber(actorUserId, 'INVALID_ACTOR_ID');
    const loteInsert = await client.query<LoteRow>(`INSERT INTO importacion_lotes (tipo, archivo_nombre, estado, total_filas, filas_validas, filas_con_error, resumen, metadata, created_by, contrato_id, empresa_id, archivo_mime_type, archivo_sha256, archivo_bytes) VALUES ($1, $2, 'PENDIENTE_CONFIRMACION', 0, 0, 0, '{}'::jsonb, $3::jsonb, $4::bigint, $5::bigint, $6::bigint, $7, $8, $9) RETURNING id, tipo, archivo_nombre, estado, total_filas, filas_validas, filas_con_error, resumen, metadata, created_by, confirmed_by, cancelado_por, created_at, updated_at, confirmed_at, cancelado_at, contrato_id, empresa_id, archivo_mime_type, archivo_sha256`, [IMPORT_TYPE, fileOriginalName, JSON.stringify({ archivo_sha256: sha256, archivo_bytes: fileBuffer.length }), actorId, toRequiredNumber(contrato.id), toRequiredNumber(contrato.empresa_id), fileMimeType, sha256, fileBuffer]);
    const lote = loteInsert.rows[0];
    if (!lote) throw new AppError('No fue posible crear el lote de importación', 500, 'IMPORT_LOTE_CREATE_FAILED');
    const loteId = toRequiredNumber(lote.id);
    const [docs, cargos, tipos] = await Promise.all([loadDocTypes(client), loadCargos(client, contratoId), loadTiposVinc(client)]);
    const docIds = new Map<number, number | null>();
    for (const row of mappedRows) docIds.set(row.rowNumber, resolveDocType(row.persona.tipo_identificacion, docs).id);
    const duplicates = detectOperationalImportDuplicates(mappedRows, docIds);

    for (const row of mappedRows) {
      const payload = await buildPreviewPayload(client, row, contrato, docs, cargos, tipos, duplicates.get(row.rowNumber) ?? null);
      const rawData = row.rawData as Record<string, unknown>;
      const personaInsert = await client.query<{ id: number | string }>(`INSERT INTO importacion_staging_personas (lote_id, fila_numero, numero_documento, tipo_documento_id, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, fecha_nacimiento, fecha_expedicion_documento, telefono, correo, direccion, data_cruda, estado_validacion, procesado, payload_resuelto, resultado_estado, resultado_mensaje, persona_existente_id, identificacion_vigente_id, persona_id) VALUES ($1::bigint, $2::int, $3, $4::bigint, $5, $6, $7, $8, $9::date, $10::date, $11, $12, $13, $14::jsonb, $15, FALSE, $16::jsonb, $17, $18, $19::bigint, $20::bigint, $21::bigint) RETURNING id`, [loteId, row.rowNumber, numeroDocumentoOrEmpty(payload), payload.resolved.tipo_documento_id, row.persona.primer_nombre ?? '', row.persona.segundo_nombre, row.persona.primer_apellido ?? '', row.persona.segundo_apellido, row.persona.fecha_nacimiento, row.persona.fecha_expedicion, row.persona.telefono, row.persona.correo, row.persona.direccion, JSON.stringify(rawData), payload.ready_to_confirm ? 'LISTO' : 'ERROR', JSON.stringify(payload), payload.persona_status, payload.message, payload.resolved.persona_id, payload.resolved.identificacion_id, payload.resolved.persona_id]);
      const personaStagingId = toRequiredNumber(personaInsert.rows[0]?.id ?? 0, 'IMPORT_STAGE_FAILED');
      const vincInsert = await client.query<{ id: number | string }>(`INSERT INTO importacion_staging_vinculaciones (lote_id, fila_numero, numero_documento, empresa_id, contrato_id, contrato_cargo_id, tipo_vinculacion_id, fecha_inicio, estado, metodo_pago, data_cruda, estado_validacion, procesado, persona_id, payload_resuelto, resultado_estado, resultado_mensaje, vinculacion_existente_id, vinculacion_id) VALUES ($1::bigint, $2::int, $3, $4::bigint, $5::bigint, $6::bigint, $7::bigint, $8::date, $9, $10, $11::jsonb, $12, FALSE, $13::bigint, $14::jsonb, $15, $16, $17::bigint, $18::bigint) RETURNING id`, [loteId, row.rowNumber, numeroDocumentoOrEmpty(payload), toRequiredNumber(contrato.empresa_id), toRequiredNumber(contrato.id), payload.resolved.cargo_id, payload.resolved.tipo_vinculacion_id, payload.resolved.fecha_ingreso, normalizeState(row.vinculacion.estado) ?? 'ACTIVA', payload.resolved.metodo_pago, JSON.stringify(rawData), payload.ready_to_confirm ? 'LISTO' : 'ERROR', payload.resolved.persona_id, JSON.stringify(payload), payload.vinculacion_status, payload.message, payload.resolved.vinculacion_id, payload.resolved.vinculacion_id]);
      const vincStagingId = toRequiredNumber(vincInsert.rows[0]?.id ?? 0, 'IMPORT_STAGE_FAILED');
      for (const err of payload.errors) await insertImportError(client, loteId, row.rowNumber, err.field.startsWith('persona.') ? 'PERSONA' : 'VINCULACION', err.field.startsWith('persona.') ? personaStagingId : vincStagingId, rawData, err);
    }

    const previewRows = await loadPreviewRows(client, loteId);
    const summary = summaryFromRows(previewRows);
    await client.query(`UPDATE importacion_lotes SET estado = $2, total_filas = $3::int, filas_validas = $4::int, filas_con_error = $5::int, resumen = $6::jsonb, metadata = $7::jsonb, updated_at = NOW() WHERE id = $1::bigint`, [loteId, summary.listas > 0 ? (summary.con_errores > 0 ? 'CON_ERRORES' : 'PENDIENTE_CONFIRMACION') : 'CON_ERRORES', summary.total_filas, summary.listas, summary.con_errores, JSON.stringify(summary), JSON.stringify(auditTrail(lote.metadata, { action: 'UPLOAD_PREVIEW', actor_user_id: actorId, at: new Date().toISOString(), summary }))]);
    const savedLote = await getLoteRow(client, loteId);
    if (!savedLote) throw new AppError('No fue posible recargar el lote creado', 500, 'IMPORT_LOTE_RELOAD_FAILED');
    await registerAuditEntry({ client, accion: 'IMPORTACION_LOTE_CREATE', tabla: 'importacion_lotes', registro_id: String(loteId), descripcion: 'Creación de lote de importación operativa de personal', usuario_id: String(actorId), after: { lote_id: loteId, contrato_id: toRequiredNumber(contrato.id), empresa_id: toRequiredNumber(contrato.empresa_id), archivo_nombre: fileOriginalName, archivo_sha256: sha256 } });
    await client.query('COMMIT');
    return { lote: await getLoteDetail(client, savedLote), summary };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const listImportacionLotes = async (query: ListImportacionLotesQuery, tenant?: TenantAccessContext): Promise<PaginatedImportacionLotes> => {
  const conditions: string[] = [];
  const params: unknown[] = [];
  appendTenantScope(conditions, params, tenant);
  if (query.estado) { params.push(query.estado); conditions.push(`estado = $${params.length}`); }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (query.page - 1) * query.limit;
  const total = (await dbQuery<CountRow>(`SELECT COUNT(*)::int AS total FROM importacion_lotes ${whereClause}`, params)).rows[0]?.total ?? 0;
  const result = await dbQuery<LoteRow>(`SELECT id, tipo, archivo_nombre, estado, total_filas, filas_validas, filas_con_error, resumen, metadata, created_by, confirmed_by, cancelado_por, created_at, updated_at, confirmed_at, cancelado_at, contrato_id, empresa_id, archivo_mime_type, archivo_sha256 FROM importacion_lotes ${whereClause} ORDER BY created_at DESC LIMIT $${params.length + 1}::int OFFSET $${params.length + 2}::int`, [...params, query.limit, offset]);
  return { items: result.rows.map(mapLote), pagination: { page: query.page, limit: query.limit, total, total_pages: total === 0 ? 0 : Math.ceil(total / query.limit) } };
};
export const getImportacionLoteById = async (loteId: number, tenant?: TenantAccessContext): Promise<ImportacionLoteDetalle | null> => {
  const client = await dbPool.connect();
  try {
    const lote = await getLoteRow(client, loteId);
    if (!lote) return null;
    if (lote.contrato_id) await loadContractOrThrow(client, toRequiredNumber(lote.contrato_id), tenant);
    return getLoteDetail(client, lote);
  } finally { client.release(); }
};
export const getImportacionLoteErrores = async (loteId: number, tenant?: TenantAccessContext): Promise<ImportacionError[]> => {
  const client = await dbPool.connect();
  try {
    const lote = await getLoteRow(client, loteId);
    if (!lote) throw new AppError('Lote no encontrado', 404, 'IMPORT_LOTE_NOT_FOUND');
    if (lote.contrato_id) await loadContractOrThrow(client, toRequiredNumber(lote.contrato_id), tenant);
    return (await client.query<ErrorRow>(`SELECT id, fila_numero, staging_tipo, staging_id, campo, codigo, mensaje, created_at FROM importacion_errores WHERE lote_id = $1::bigint ORDER BY fila_numero ASC, created_at ASC, id ASC`, [loteId])).rows.map(mapError);
  } finally { client.release(); }
};
export const getImportacionPreview = async (loteId: number, query: ImportacionPreviewQuery, tenant?: TenantAccessContext): Promise<ImportacionPreviewResult> => {
  const client = await dbPool.connect();
  try {
    const lote = await getLoteRow(client, loteId);
    if (!lote) throw new AppError('Lote no encontrado', 404, 'IMPORT_LOTE_NOT_FOUND');
    if (lote.contrato_id) await loadContractOrThrow(client, toRequiredNumber(lote.contrato_id), tenant);
    const allRows = await loadPreviewRows(client, loteId);
    const filtered = allRows.filter((row) => matchesFilter(row, query.filter));
    const offset = (query.page - 1) * query.limit;
    return { lote: await getLoteDetail(client, lote), rows: filtered.slice(offset, offset + query.limit), summary: summaryFromRows(allRows), pagination: { page: query.page, limit: query.limit, total: filtered.length, total_pages: filtered.length === 0 ? 0 : Math.ceil(filtered.length / query.limit), filter: query.filter } };
  } finally { client.release(); }
};
export const downloadImportacionReport = async (loteId: number, tenant?: TenantAccessContext): Promise<{ content: string; fileName: string }> => {
  const preview = await getImportacionPreview(loteId, { page: 1, limit: 50000, filter: 'TODOS' }, tenant);
  const header = ['fila','tipo_documento','numero_documento','nombre','cargo_original','tipo_vinculacion_original','estado_persona','estado_vinculacion','resultado','mensaje','persona_id','vinculacion_id'];
  const lines = [header.join(',')];
  for (const row of preview.rows) {
    const values = [row.fila, row.tipo_documento ?? '', row.numero_documento ?? '', row.nombre ?? '', row.cargo_original ?? '', row.tipo_vinculacion_original ?? '', row.estado_persona, row.estado_vinculacion, row.resultado, row.mensaje, row.persona_id ?? '', row.vinculacion_id ?? ''].map((value) => { const text = String(value); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; });
    lines.push(values.join(','));
  }
  return { content: lines.join('\n'), fileName: `importacion-personal-lote-${loteId}.csv` };
};
const numeroDocumentoOrEmpty = (payload: PreviewPayload): string => payload.original.numero_documento ? normalizeNumeroDocumento(payload.original.numero_documento) : '';
const loadRowsForConfirm = async (client: PoolClient, loteId: number): Promise<StageConfirmRow[]> => (await client.query<StageConfirmRow>(`SELECT fila_numero, numero_documento, tipo_documento_id, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, fecha_nacimiento, fecha_expedicion_documento, telefono, correo, direccion, payload_resuelto AS payload FROM importacion_staging_personas WHERE lote_id = $1::bigint AND COALESCE((payload_resuelto ->> 'ready_to_confirm')::boolean, FALSE) = TRUE AND COALESCE(procesado, FALSE) = FALSE ORDER BY fila_numero ASC`, [loteId])).rows;
const markRowOutcome = async (client: PoolClient, loteId: number, fila: number, personaState: string, personaMessage: string, personaId: number | null, vincState: string, vincMessage: string, vinculacionId: number | null): Promise<void> => {
  await client.query(`UPDATE importacion_staging_personas SET procesado = TRUE, persona_id = COALESCE($3::bigint, persona_id), estado_final = $4, mensaje_final = $5, updated_at = NOW() WHERE lote_id = $1::bigint AND fila_numero = $2::int`, [loteId, fila, personaId, personaState, personaMessage]);
  await client.query(`UPDATE importacion_staging_vinculaciones SET procesado = TRUE, persona_id = COALESCE($3::bigint, persona_id), vinculacion_id = COALESCE($4::bigint, vinculacion_id), estado_final = $5, mensaje_final = $6, updated_at = NOW() WHERE lote_id = $1::bigint AND fila_numero = $2::int`, [loteId, fila, personaId, vinculacionId, vincState, vincMessage]);
};

export const confirmImportacionLote = async (loteId: number, actorUserId: string, tenant?: TenantAccessContext): Promise<ConfirmImportacionResult> => {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const lote = await getLoteRow(client, loteId, true);
    if (!lote) throw new AppError('Lote no encontrado', 404, 'IMPORT_LOTE_NOT_FOUND');
    const contrato = lote.contrato_id ? await loadContractOrThrow(client, toRequiredNumber(lote.contrato_id), tenant) : null;
    if (!contrato) throw new AppError('El lote no tiene contrato asociado', 400, 'IMPORT_LOTE_CONTRACT_REQUIRED');
    if (lote.estado === 'CANCELADO') throw new AppError('El lote fue cancelado y no puede confirmarse', 409, 'IMPORT_LOTE_CANCELLED');
    if (lote.estado === 'CONFIRMADO') {
      const confirmacion = (lote.resumen?.confirmacion ?? {}) as Record<string, unknown>;
      await client.query('COMMIT');
      return { lote: await getLoteDetail(client, lote), created_personas: Number(confirmacion.created_personas ?? 0), reused_personas: Number(confirmacion.reused_personas ?? 0), created_vinculaciones: Number(confirmacion.created_vinculaciones ?? 0), skipped_already_linked: Number(confirmacion.skipped_already_linked ?? 0) };
    }

    const rows = await loadRowsForConfirm(client, loteId);
    if (rows.length === 0) throw new AppError('El lote no tiene filas válidas para confirmar', 409, 'IMPORT_LOTE_WITHOUT_VALID_ROWS');
    const actorId = String(actorUserId);
    const actorIdNumber = toRequiredNumber(actorUserId, 'INVALID_ACTOR_ID');
    let createdPersonas = 0;
    let reusedPersonas = 0;
    let createdVinculaciones = 0;
    let skippedAlreadyLinked = 0;

    for (const row of rows) {
      const payload = row.payload;
      let personaId = payload.resolved.persona_id;
      let personaState = 'REUTILIZADA';
      let personaMessage = payload.message;

      if (payload.resolved.tipo_documento_id === null || !payload.original.numero_documento) continue;

      let existingPerson = personaId ? { id: personaId } : null;
      if (!existingPerson) {
        try {
          const createdPersona = await createPersona({ tipo_documento_id: payload.resolved.tipo_documento_id, numero_documento: payload.original.numero_documento, primer_nombre: row.primer_nombre, segundo_nombre: row.segundo_nombre, primer_apellido: row.primer_apellido, segundo_apellido: row.segundo_apellido, fecha_nacimiento: formatDate(row.fecha_nacimiento), fecha_expedicion_documento: formatDate(row.fecha_expedicion_documento), municipio_nacimiento_id: null, municipio_residencia_id: null, sexo_id: null, estado_civil_id: null, tipo_sangre_id: null, estatura: null, telefono: row.telefono, correo: row.correo, direccion: row.direccion, barrio: null, zona_id: null, pais_nacimiento: 'COLOMBIA', nacimiento_extranjero: false, ciudad_nacimiento_extranjero: null, motivo_cambio_identificacion: null, municipio_expedicion_id: null }, { actorUserId: actorId });
          personaId = createdPersona.id;
          createdPersonas += 1;
          personaState = 'CREADA';
          personaMessage = `Persona creada: #${personaId}.`;
        } catch {
          const matched = await findPersonByIdentification(client, payload.resolved.tipo_documento_id, payload.original.numero_documento);
          if (!matched) throw new AppError('No fue posible crear ni reutilizar la persona al confirmar', 500, 'IMPORT_CONFIRM_PERSON_FAILED');
          personaId = toRequiredNumber(matched.id);
          reusedPersonas += 1;
          personaState = 'REUTILIZADA';
          personaMessage = `Persona reutilizada: #${personaId}.`;
        }
      } else {
        reusedPersonas += 1;
        personaMessage = `Persona reutilizada: #${personaId}.`;
      }

      const linked = await findExistingLink(client, toRequiredNumber(personaId), toRequiredNumber(contrato.id), payload.resolved.fecha_ingreso);
      if (linked) {
        skippedAlreadyLinked += 1;
        await markRowOutcome(client, loteId, row.fila_numero, personaState, personaMessage, toRequiredNumber(personaId), 'YA_VINCULADO', `Persona ya vinculada al contrato. Vinculación existente #${toRequiredNumber(linked.id)}.`, toRequiredNumber(linked.id));
        continue;
      }

      try {
        const vinculacion = await createVinculacion({ persona_id: toRequiredNumber(personaId), empresa_id: toRequiredNumber(contrato.empresa_id), contrato_id: toRequiredNumber(contrato.id), tipo_vinculacion_id: toRequiredNumber(payload.resolved.tipo_vinculacion_id), contrato_cargo_id: toRequiredNumber(payload.resolved.cargo_id), fecha_inicio: payload.resolved.fecha_ingreso ?? '', fecha_fin: null, estado_vinculacion: normalizeState(payload.original.estado) ?? 'ACTIVA', cuenta_como_experiencia: true, metodo_pago: payload.resolved.metodo_pago as (typeof METODOS_PAGO)[number] | null }, actorIdNumber, tenant);
        createdVinculaciones += 1;
        await markRowOutcome(client, loteId, row.fila_numero, personaState, personaMessage, toRequiredNumber(personaId), 'VINCULADA', `Vinculación creada: #${vinculacion.id}.`, vinculacion.id);
      } catch {
        const relinked = await findExistingLink(client, toRequiredNumber(personaId), toRequiredNumber(contrato.id), payload.resolved.fecha_ingreso);
        if (!relinked) throw new AppError('No fue posible crear la vinculación al confirmar', 500, 'IMPORT_CONFIRM_LINK_FAILED');
        skippedAlreadyLinked += 1;
        await markRowOutcome(client, loteId, row.fila_numero, personaState, personaMessage, toRequiredNumber(personaId), 'YA_VINCULADO', `Persona ya vinculada al contrato. Vinculación existente #${toRequiredNumber(relinked.id)}.`, toRequiredNumber(relinked.id));
      }
    }

    const allRows = await loadPreviewRows(client, loteId);
    const summary = summaryFromRows(allRows);
    await client.query(`UPDATE importacion_lotes SET estado = 'CONFIRMADO', confirmed_by = $2::bigint, confirmed_at = NOW(), resumen = $3::jsonb, metadata = $4::jsonb, updated_at = NOW() WHERE id = $1::bigint`, [loteId, actorIdNumber, JSON.stringify({ ...summary, confirmacion: { created_personas: createdPersonas, reused_personas: reusedPersonas, created_vinculaciones: createdVinculaciones, skipped_already_linked: skippedAlreadyLinked } }), JSON.stringify(auditTrail(lote.metadata, { action: 'CONFIRM', actor_user_id: actorIdNumber, at: new Date().toISOString() }))]);
    const saved = await getLoteRow(client, loteId);
    if (!saved) throw new AppError('No fue posible recargar el lote confirmado', 500, 'IMPORT_LOTE_RELOAD_FAILED');
    await registerAuditEntry({ client, accion: 'IMPORTACION_LOTE_CONFIRM', tabla: 'importacion_lotes', registro_id: String(loteId), descripcion: 'Confirmación de lote de importación operativa de personal', usuario_id: String(actorIdNumber), after: { lote_id: loteId, created_personas: createdPersonas, reused_personas: reusedPersonas, created_vinculaciones: createdVinculaciones, skipped_already_linked: skippedAlreadyLinked } });
    await client.query('COMMIT');
    return { lote: await getLoteDetail(client, saved), created_personas: createdPersonas, reused_personas: reusedPersonas, created_vinculaciones: createdVinculaciones, skipped_already_linked: skippedAlreadyLinked };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
};

export const cancelImportacionLote = async (loteId: number, actorUserId: string, tenant?: TenantAccessContext): Promise<ImportacionLoteDetalle> => {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const lote = await getLoteRow(client, loteId, true);
    if (!lote) throw new AppError('Lote no encontrado', 404, 'IMPORT_LOTE_NOT_FOUND');
    if (lote.contrato_id) await loadContractOrThrow(client, toRequiredNumber(lote.contrato_id), tenant);
    if (lote.estado === 'CONFIRMADO') throw new AppError('Un lote confirmado no puede cancelarse', 409, 'IMPORT_LOTE_ALREADY_CONFIRMED');
    if (lote.estado !== 'CANCELADO') {
      const actorIdNumber = toRequiredNumber(actorUserId, 'INVALID_ACTOR_ID');
      await client.query(`UPDATE importacion_lotes SET estado = 'CANCELADO', cancelado_por = $2::bigint, cancelado_at = NOW(), metadata = $3::jsonb, updated_at = NOW() WHERE id = $1::bigint`, [loteId, actorIdNumber, JSON.stringify(auditTrail(lote.metadata, { action: 'CANCEL', actor_user_id: actorIdNumber, at: new Date().toISOString() }))]);
      await registerAuditEntry({ client, accion: 'IMPORTACION_LOTE_CANCEL', tabla: 'importacion_lotes', registro_id: String(loteId), descripcion: 'Cancelación de lote de importación operativa de personal', usuario_id: String(actorIdNumber), after: { lote_id: loteId, estado: 'CANCELADO' } });
    }
    const saved = await getLoteRow(client, loteId);
    if (!saved) throw new AppError('No fue posible recargar el lote cancelado', 500, 'IMPORT_LOTE_RELOAD_FAILED');
    await client.query('COMMIT');
    return await getLoteDetail(client, saved);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
};
