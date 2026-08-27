import type { PoolClient, QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import {
  assertTenantAccessForVinculacionId,
  type TenantAccessContext
} from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import { registerAuditEntry } from '../auditoria/auditoria.helper';
import { buildContextualVinculacionChecklist } from '../documentos/documentos.checklist.service';
import {
  buildLicitacionQuotaDelta,
  deriveCumpleRequisitosState,
  looksLikeManipuladoraCargo,
  rangesOverlap,
  validateVigenciaRange
} from './vinculaciones.personal.domain';
import type {
  CreateAsignacionLaboralInput,
  CreatePresentacionLicitacionInput,
  UpdateAsignacionLaboralInput,
  UpdatePresentacionLicitacionInput
} from './vinculaciones.personal.schemas';

interface VinculacionContextRow extends QueryResultRow {
  cargo_nombre: string | null;
  contrato_cargo_id: string;
  contrato_id: string;
  estado_vinculacion: string | null;
  id: string;
  persona_id: string;
  tipo_vinculacion_id: string;
}

interface AsignacionOperativaRow extends QueryResultRow {
  activo: boolean;
  categoria_cobertura: string | null;
  created_at: Date;
  fecha_fin: Date | string | null;
  fecha_inicio: Date | string;
  focalizacion_final_id: string;
  id: string;
  institucion: string;
  modalidad: string;
  municipio_id: string | null;
  observacion: string | null;
  porcentaje_cobertura: string | number;
  sede: string;
  tipo_asignacion: string;
}

interface AsignacionLaboralRow extends QueryResultRow {
  created_at: Date;
  created_by_user_id: string | null;
  estado: string;
  id: string;
  nombre_ubicacion: string;
  observacion: string | null;
  origen: string;
  ubicacion_laboral_id: string;
  updated_at: Date;
  vigencia_desde: Date | string;
  vigencia_hasta: Date | string | null;
}

interface PerfilLicitacionRow extends QueryResultRow {
  cantidad_requerida: number;
  contrato_cargo_equivalente_id: string | null;
  contrato_cargo_equivalente_nombre: string | null;
  id: string;
  nombre_perfil: string;
  vigencia_desde: Date | string;
  vigencia_hasta: Date | string | null;
}

interface PresentacionLicitacionRow extends QueryResultRow {
  created_at: Date;
  created_by_user_id: string | null;
  cumple_requisitos: boolean | null;
  estado: string;
  id: string;
  observacion: string | null;
  perfil_cantidad_requerida: number;
  perfil_contrato_cargo_equivalente_id: string | null;
  perfil_contrato_cargo_equivalente_nombre: string | null;
  perfil_licitacion_id: string;
  perfil_nombre: string;
  updated_at: Date;
  vigencia_desde: Date | string;
  vigencia_hasta: Date | string | null;
}

interface PerfilResumenRow extends QueryResultRow {
  acreditadas: number;
  cantidad_requerida: number;
  contrato_cargo_equivalente_id: string | null;
  contrato_cargo_equivalente_nombre: string | null;
  id: string;
  nombre_perfil: string;
  vigencia_desde: Date | string;
  vigencia_hasta: Date | string | null;
}

export interface AsignacionOperativaItem {
  activo: boolean;
  categoria_cobertura: string | null;
  created_at: string;
  fecha_fin: string | null;
  fecha_inicio: string;
  focalizacion_final_id: number;
  id: number;
  institucion: string;
  modalidad: string;
  municipio_id: number | null;
  observacion: string | null;
  porcentaje_cobertura: number;
  sede: string;
  tipo_asignacion: string;
}

export interface AsignacionLaboralItem {
  created_at: string;
  created_by_user_id: number | null;
  estado: 'ACTIVA' | 'FINALIZADA' | 'ANULADA';
  id: number;
  nombre_ubicacion: string;
  observacion: string | null;
  origen: 'MANUAL' | 'IMPORTACION' | 'AJUSTE';
  ubicacion_laboral_id: number;
  updated_at: string;
  vigencia_desde: string;
  vigencia_hasta: string | null;
}

export interface PresentacionLicitacionItem {
  created_at: string;
  created_by_user_id: number | null;
  cumple_requisitos: boolean | null;
  cumple_requisitos_estado: 'CUMPLE' | 'NO_CUMPLE' | 'PENDIENTE';
  estado: 'PRESENTADA' | 'RETIRADA' | 'REEMPLAZADA' | 'ANULADA';
  id: number;
  observacion: string | null;
  perfil: {
    cantidad_requerida: number;
    contrato_cargo_equivalente: {
      id: number | null;
      nombre_cargo: string | null;
    };
    id: number;
    nombre_perfil: string;
  };
  updated_at: string;
  vigencia_desde: string;
  vigencia_hasta: string | null;
}

export interface PerfilLicitacionResumenItem {
  acreditadas: number;
  cantidad_requerida: number;
  diferencia: number;
  estado: 'CUMPLE' | 'DEFICIT' | 'EXCESO';
  perfil: {
    contrato_cargo_equivalente: {
      id: number | null;
      nombre_cargo: string | null;
    };
    id: number;
    nombre_perfil: string;
  };
  vigencia_desde: string;
  vigencia_hasta: string | null;
}

export interface VinculacionPersonalContext {
  asignacion_laboral_actual: AsignacionLaboralItem | null;
  asignacion_operativa_actual: AsignacionOperativaItem | null;
  es_manipuladora: boolean;
  historial_asignacion_laboral: AsignacionLaboralItem[];
  historial_asignacion_operativa: AsignacionOperativaItem[];
  historial_presentacion_licitacion: PresentacionLicitacionItem[];
  presentada_licitacion_actual: PresentacionLicitacionItem | null;
}

const TODAY_ISO = '2026-08-21';

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
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
};

const recordAudit = async (input: {
  action: string;
  actorUserId: number;
  after?: unknown;
  before?: unknown;
  client: PoolClient;
  description: string;
  recordId: string;
  table: string;
}): Promise<void> => {
  await registerAuditEntry({
    client: input.client,
    usuario_id: String(input.actorUserId),
    accion: input.action,
    tabla: input.table,
    registro_id: input.recordId,
    descripcion: input.description,
    before: input.before,
    after: input.after
  });
};

const getVinculacionContextRow = async (
  client: PoolClient,
  vinculacionId: number,
  options?: { forUpdate?: boolean }
): Promise<VinculacionContextRow> => {
  const result = await client.query<VinculacionContextRow>(
    `
      SELECT
        v.id::text AS id,
        v.persona_id::text AS persona_id,
        v.contrato_id::text AS contrato_id,
        v.contrato_cargo_id::text AS contrato_cargo_id,
        v.tipo_vinculacion_id::text AS tipo_vinculacion_id,
        v.estado_vinculacion,
        cc.nombre_cargo AS cargo_nombre
      FROM vinculaciones v
      LEFT JOIN contrato_cargos cc ON cc.id = v.contrato_cargo_id
      WHERE v.id = $1::bigint
      LIMIT 1
      ${options?.forUpdate ? 'FOR UPDATE OF v' : ''}
    `,
    [vinculacionId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Vinculacion not found', 404, 'VINCULACION_NOT_FOUND');
  }

  return row;
};

const mapAsignacionOperativa = (row: AsignacionOperativaRow): AsignacionOperativaItem => ({
  id: toNumber(row.id),
  focalizacion_final_id: toNumber(row.focalizacion_final_id),
  institucion: row.institucion,
  sede: row.sede,
  modalidad: row.modalidad,
  categoria_cobertura: row.categoria_cobertura,
  municipio_id: row.municipio_id ? toNumber(row.municipio_id) : null,
  porcentaje_cobertura:
    typeof row.porcentaje_cobertura === 'number'
      ? row.porcentaje_cobertura
      : Number(row.porcentaje_cobertura),
  fecha_inicio: toDateString(row.fecha_inicio) ?? '',
  fecha_fin: toDateString(row.fecha_fin),
  observacion: row.observacion,
  activo: row.activo,
  created_at: row.created_at.toISOString(),
  tipo_asignacion: row.tipo_asignacion
});

const mapAsignacionLaboral = (row: AsignacionLaboralRow): AsignacionLaboralItem => ({
  id: toNumber(row.id),
  ubicacion_laboral_id: toNumber(row.ubicacion_laboral_id),
  nombre_ubicacion: row.nombre_ubicacion,
  vigencia_desde: toDateString(row.vigencia_desde) ?? '',
  vigencia_hasta: toDateString(row.vigencia_hasta),
  estado: row.estado as AsignacionLaboralItem['estado'],
  origen: row.origen as AsignacionLaboralItem['origen'],
  observacion: row.observacion,
  created_by_user_id: row.created_by_user_id ? toNumber(row.created_by_user_id) : null,
  created_at: row.created_at.toISOString(),
  updated_at: row.updated_at.toISOString()
});

const buildPresentacionLicitacionItem = async (
  row: PresentacionLicitacionRow,
  vinculacionId: number,
  tenant?: TenantAccessContext
): Promise<PresentacionLicitacionItem> => {
  let cumplimientoPorcentaje: number | null = null;
  let tieneConfiguracion: boolean | null = null;

  if (row.perfil_contrato_cargo_equivalente_id) {
    const checklist = await buildContextualVinculacionChecklist(String(vinculacionId), tenant, {
      audit: false,
      contratoCargoIdOverride: toNumber(row.perfil_contrato_cargo_equivalente_id)
    });
    cumplimientoPorcentaje = checklist.cumplimiento_porcentaje;
    tieneConfiguracion = checklist.tiene_configuracion;
  }

  return {
    id: toNumber(row.id),
    vigencia_desde: toDateString(row.vigencia_desde) ?? '',
    vigencia_hasta: toDateString(row.vigencia_hasta),
    estado: row.estado as PresentacionLicitacionItem['estado'],
    cumple_requisitos: row.cumple_requisitos,
    cumple_requisitos_estado: deriveCumpleRequisitosState({
      checklistCumplimientoPorcentaje: cumplimientoPorcentaje,
      checklistTieneConfiguracion: tieneConfiguracion,
      cumpleRequisitosExplicit: row.cumple_requisitos
    }),
    observacion: row.observacion,
    created_by_user_id: row.created_by_user_id ? toNumber(row.created_by_user_id) : null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    perfil: {
      id: toNumber(row.perfil_licitacion_id),
      nombre_perfil: row.perfil_nombre,
      cantidad_requerida: row.perfil_cantidad_requerida,
      contrato_cargo_equivalente: {
        id: row.perfil_contrato_cargo_equivalente_id
          ? toNumber(row.perfil_contrato_cargo_equivalente_id)
          : null,
        nombre_cargo: row.perfil_contrato_cargo_equivalente_nombre
      }
    }
  };
};

const ensureUbicacionBelongsContrato = async (
  client: PoolClient,
  contratoId: number,
  ubicacionId: number
): Promise<void> => {
  const result = await client.query<{ id: string }>(
    `
      SELECT id::text AS id
      FROM contrato_ubicaciones_laborales
      WHERE id = $1::bigint
        AND contrato_id = $2::bigint
        AND activo = TRUE
      LIMIT 1
    `,
    [ubicacionId, contratoId]
  );

  if (!result.rows[0]) {
    throw new AppError(
      'Ubicacion laboral not found for contrato',
      404,
      'UBICACION_LABORAL_NOT_FOUND'
    );
  }
};

const getPerfilLicitacion = async (
  client: PoolClient,
  contratoId: number,
  perfilId: number
): Promise<PerfilLicitacionRow> => {
  const result = await client.query<PerfilLicitacionRow>(
    `
      SELECT
        cpl.id::text AS id,
        cpl.nombre_perfil,
        cpl.cantidad_requerida,
        cpl.vigencia_desde,
        cpl.vigencia_hasta,
        cpl.contrato_cargo_equivalente_id::text AS contrato_cargo_equivalente_id,
        cc.nombre_cargo AS contrato_cargo_equivalente_nombre
      FROM contrato_perfiles_licitacion cpl
      LEFT JOIN contrato_cargos cc ON cc.id = cpl.contrato_cargo_equivalente_id
      WHERE cpl.id = $1::bigint
        AND cpl.contrato_id = $2::bigint
      LIMIT 1
    `,
    [perfilId, contratoId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError(
      'Perfil de licitacion not found for contrato',
      404,
      'PERFIL_LICITACION_NOT_FOUND'
    );
  }

  return row;
};

const ensureNoLaborOverlap = async (
  client: PoolClient,
  vinculacionId: number,
  range: { desde: string; hasta: string | null },
  excludedId?: number
): Promise<void> => {
  const params: unknown[] = [vinculacionId];
  let sql = `
    SELECT
      id::text AS id,
      vigencia_desde,
      vigencia_hasta
    FROM personal_asignaciones_laborales
    WHERE vinculacion_id = $1::bigint
      AND estado <> 'ANULADA'
  `;

  if (excludedId !== undefined) {
    params.push(excludedId);
    sql += ` AND id <> $${params.length}::bigint`;
  }

  const result = await client.query<{
    id: string;
    vigencia_desde: Date | string;
    vigencia_hasta: Date | string | null;
  }>(sql, params);

  for (const row of result.rows) {
    if (
      rangesOverlap(
        { desde: toDateString(row.vigencia_desde) ?? '', hasta: toDateString(row.vigencia_hasta) },
        { desde: range.desde, hasta: range.hasta }
      )
    ) {
      throw new AppError(
        'Asignacion laboral overlaps with an existing vigencia',
        409,
        'ASIGNACION_LABORAL_OVERLAP'
      );
    }
  }
};

const ensureNoPresentacionOverlap = async (
  client: PoolClient,
  vinculacionId: number,
  range: { desde: string; hasta: string | null },
  excludedId?: number
): Promise<void> => {
  const params: unknown[] = [vinculacionId];
  let sql = `
    SELECT
      id::text AS id,
      vigencia_desde,
      vigencia_hasta
    FROM personal_presentaciones_licitacion
    WHERE vinculacion_id = $1::bigint
      AND estado <> 'ANULADA'
  `;

  if (excludedId !== undefined) {
    params.push(excludedId);
    sql += ` AND id <> $${params.length}::bigint`;
  }

  const result = await client.query<{
    id: string;
    vigencia_desde: Date | string;
    vigencia_hasta: Date | string | null;
  }>(sql, params);

  for (const row of result.rows) {
    if (
      rangesOverlap(
        { desde: toDateString(row.vigencia_desde) ?? '', hasta: toDateString(row.vigencia_hasta) },
        { desde: range.desde, hasta: range.hasta }
      )
    ) {
      throw new AppError(
        'Presentacion de licitacion overlaps with an existing vigencia',
        409,
        'PRESENTACION_LICITACION_OVERLAP'
      );
    }
  }
};

export const listAsignacionesOperativasByVinculacion = async (
  vinculacionId: number,
  tenant?: TenantAccessContext
): Promise<AsignacionOperativaItem[]> => {
  await assertTenantAccessForVinculacionId(tenant, vinculacionId);

  const result = await dbQuery<AsignacionOperativaRow>(
    `
      SELECT
        id::text AS id,
        focalizacion_final_id::text AS focalizacion_final_id,
        institucion,
        sede,
        modalidad,
        categoria_cobertura,
        municipio_id::text AS municipio_id,
        porcentaje_cobertura,
        fecha_inicio,
        fecha_fin,
        observacion,
        activo,
        created_at,
        tipo_asignacion
      FROM cobertura_asignaciones
      WHERE vinculacion_id = $1::bigint
      ORDER BY fecha_inicio DESC, id DESC
    `,
    [vinculacionId]
  );

  return result.rows.map(mapAsignacionOperativa);
};

export const listOpcionesAsignacionOperativa = async (vinculacionId: number, tenant?: TenantAccessContext) => {
  await assertTenantAccessForVinculacionId(tenant, vinculacionId);
  const context = await dbPool.query<{ contrato_id: string }>('SELECT contrato_id::text FROM vinculaciones WHERE id=$1::bigint', [vinculacionId]);
  if (!context.rows[0]) throw new AppError('Vinculacion not found', 404, 'VINCULACION_NOT_FOUND');
  return (await dbPool.query(`SELECT ff.id::text,ff.municipio_id::text,COALESCE(mu.nombre_municipio,ff.municipio_texto) municipio,ff.institucion_id::text,ff.institucion_final institucion,ff.sede_id::text,ff.sede_final sede,ff.modalidad_id::text,ff.modalidad_final modalidad FROM focalizacion_final ff LEFT JOIN municipios mu ON mu.id=ff.municipio_id WHERE ff.contrato_id=$1::bigint AND COALESCE(ff.activo,TRUE)=TRUE ORDER BY municipio,institucion,sede,modalidad`, [context.rows[0].contrato_id])).rows;
};

export const replaceAsignacionOperativaPersonal = async (vinculacionId: number, focalizacionFinalId: number, actorUserId: any, tenant?: TenantAccessContext) => {
  await assertTenantAccessForVinculacionId(tenant, vinculacionId);
  const client=await dbPool.connect();
  try {
    await client.query('BEGIN');
    const vinculacion=await getVinculacionContextRow(client,vinculacionId,{forUpdate:true});
    const target=await client.query<any>(`SELECT ff.*,COALESCE(mu.nombre_municipio,ff.municipio_texto) municipio_nombre FROM focalizacion_final ff LEFT JOIN municipios mu ON mu.id=ff.municipio_id WHERE ff.id=$1::bigint AND ff.contrato_id=$2::bigint AND COALESCE(ff.activo,TRUE)=TRUE`,[focalizacionFinalId,vinculacion.contrato_id]);
    if(!target.rows[0])throw new AppError('La sede no pertenece al municipio, institucion o contrato seleccionado',409,'ASIGNACION_OPERATIVA_CONTEXTO_INVALIDO');
    const current=await client.query<any>(`SELECT * FROM cobertura_asignaciones WHERE vinculacion_id=$1::bigint AND activo=TRUE AND fecha_inicio<=CURRENT_DATE AND (fecha_fin IS NULL OR fecha_fin>=CURRENT_DATE) ORDER BY fecha_inicio DESC,id DESC LIMIT 1 FOR UPDATE`,[vinculacionId]);
    if(String(current.rows[0]?.focalizacion_final_id)===String(focalizacionFinalId)){await client.query('COMMIT');return current.rows[0];}
    if(current.rows[0])await client.query(`UPDATE cobertura_asignaciones SET activo=FALSE,fecha_fin=GREATEST(fecha_inicio,CURRENT_DATE-1),observacion=CONCAT_WS(' · ',observacion,'Corregida desde Personal') WHERE id=$1::bigint`,[current.rows[0].id]);
    const f=target.rows[0];
    const inserted=await client.query<any>(`INSERT INTO cobertura_asignaciones(contrato_id,municipio_id,focalizacion_final_id,vinculacion_id,institucion,sede,consecutivo_sede,modalidad,categoria_cobertura,tipo_asignacion,porcentaje_cobertura,fecha_inicio,fecha_fin,observacion,activo) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10,'PRINCIPAL'),COALESCE($11,1),CURRENT_DATE,NULL,'Correccion operativa desde Personal',TRUE) RETURNING *`,[vinculacion.contrato_id,f.municipio_id,focalizacionFinalId,vinculacionId,f.institucion_final,f.sede_final,f.consecutivo_final,f.modalidad_final,f.categoria_cobertura,current.rows[0]?.tipo_asignacion,current.rows[0]?.porcentaje_cobertura]);
    await registerAuditEntry({client,usuario_id:actorUserId,accion:'PERSONAL_ASIGNACION_OPERATIVA_UPDATE',tabla:'cobertura_asignaciones',registro_id:String(inserted.rows[0].id),descripcion:'Correccion versionada de municipio, institucion y sede desde Personal',before:current.rows[0]??null,after:inserted.rows[0]});
    await client.query('COMMIT');return inserted.rows[0];
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
};

export const listAsignacionesLaboralesByVinculacion = async (
  vinculacionId: number,
  tenant?: TenantAccessContext
): Promise<AsignacionLaboralItem[]> => {
  await assertTenantAccessForVinculacionId(tenant, vinculacionId);

  const result = await dbQuery<AsignacionLaboralRow>(
    `
      SELECT
        pal.id::text AS id,
        pal.ubicacion_laboral_id::text AS ubicacion_laboral_id,
        cul.nombre_ubicacion,
        pal.vigencia_desde,
        pal.vigencia_hasta,
        pal.estado,
        pal.origen,
        pal.observacion,
        pal.created_by_user_id::text AS created_by_user_id,
        pal.created_at,
        pal.updated_at
      FROM personal_asignaciones_laborales pal
      INNER JOIN contrato_ubicaciones_laborales cul ON cul.id = pal.ubicacion_laboral_id
      WHERE pal.vinculacion_id = $1::bigint
      ORDER BY pal.vigencia_desde DESC, pal.id DESC
    `,
    [vinculacionId]
  );

  return result.rows.map(mapAsignacionLaboral);
};

export const listPresentacionesLicitacionByVinculacion = async (
  vinculacionId: number,
  tenant?: TenantAccessContext
): Promise<PresentacionLicitacionItem[]> => {
  await assertTenantAccessForVinculacionId(tenant, vinculacionId);

  const result = await dbQuery<PresentacionLicitacionRow>(
    `
      SELECT
        ppl.id::text AS id,
        ppl.perfil_licitacion_id::text AS perfil_licitacion_id,
        cpl.nombre_perfil AS perfil_nombre,
        cpl.cantidad_requerida AS perfil_cantidad_requerida,
        cpl.contrato_cargo_equivalente_id::text AS perfil_contrato_cargo_equivalente_id,
        cc.nombre_cargo AS perfil_contrato_cargo_equivalente_nombre,
        ppl.vigencia_desde,
        ppl.vigencia_hasta,
        ppl.estado,
        ppl.cumple_requisitos,
        ppl.observacion,
        ppl.created_by_user_id::text AS created_by_user_id,
        ppl.created_at,
        ppl.updated_at
      FROM personal_presentaciones_licitacion ppl
      INNER JOIN contrato_perfiles_licitacion cpl ON cpl.id = ppl.perfil_licitacion_id
      LEFT JOIN contrato_cargos cc ON cc.id = cpl.contrato_cargo_equivalente_id
      WHERE ppl.vinculacion_id = $1::bigint
      ORDER BY ppl.vigencia_desde DESC, ppl.id DESC
    `,
    [vinculacionId]
  );

  return Promise.all(result.rows.map((row) => buildPresentacionLicitacionItem(row, vinculacionId, tenant)));
};

export const getVinculacionPersonalContext = async (
  vinculacionId: number,
  tenant?: TenantAccessContext
): Promise<VinculacionPersonalContext> => {
  await assertTenantAccessForVinculacionId(tenant, vinculacionId);
  const client = await dbPool.connect();

  try {
    const vinculacion = await getVinculacionContextRow(client, vinculacionId);
    const esManipuladora = looksLikeManipuladoraCargo(vinculacion.cargo_nombre);
    const [historialOperativo, historialLaboral, historialLicitacion] = await Promise.all([
      listAsignacionesOperativasByVinculacion(vinculacionId, tenant),
      listAsignacionesLaboralesByVinculacion(vinculacionId, tenant),
      listPresentacionesLicitacionByVinculacion(vinculacionId, tenant)
    ]);

    const pickCurrent = <T extends { fecha_inicio?: string; fecha_fin?: string | null; vigencia_desde?: string; vigencia_hasta?: string | null; estado?: string; activo?: boolean }>(
      items: T[],
      keys: { from: 'fecha_inicio' | 'vigencia_desde'; to: 'fecha_fin' | 'vigencia_hasta'; active?: 'activo'; state?: 'estado' }
    ): T | null =>
      items.find((item) => {
        const from = item[keys.from] as string | undefined;
        const to = item[keys.to] as string | null | undefined;
        const activeOk = keys.active ? Boolean(item[keys.active]) : true;
        const stateValue = keys.state ? (item[keys.state] as string | undefined) : undefined;
        const stateOk = stateValue ? !['ANULADA', 'RETIRADA', 'FINALIZADA'].includes(stateValue) : true;
        return Boolean(from) && activeOk && stateOk && from! <= TODAY_ISO && (!to || to >= TODAY_ISO);
      }) ?? null;

    return {
      es_manipuladora: esManipuladora,
      historial_asignacion_operativa: historialOperativo,
      historial_asignacion_laboral: historialLaboral,
      historial_presentacion_licitacion: historialLicitacion,
      asignacion_operativa_actual: pickCurrent(historialOperativo, {
        from: 'fecha_inicio',
        to: 'fecha_fin',
        active: 'activo'
      }),
      asignacion_laboral_actual: pickCurrent(historialLaboral, {
        from: 'vigencia_desde',
        to: 'vigencia_hasta',
        state: 'estado'
      }),
      presentada_licitacion_actual: pickCurrent(historialLicitacion, {
        from: 'vigencia_desde',
        to: 'vigencia_hasta',
        state: 'estado'
      })
    };
  } finally {
    client.release();
  }
};

export const createAsignacionLaboral = async (
  vinculacionId: number,
  input: CreateAsignacionLaboralInput,
  actorUserId: number,
  tenant?: TenantAccessContext
): Promise<AsignacionLaboralItem> => {
  validateVigenciaRange({ desde: input.vigencia_desde, hasta: input.vigencia_hasta });
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await assertTenantAccessForVinculacionId(tenant, vinculacionId);
    const vinculacion = await getVinculacionContextRow(client, vinculacionId, { forUpdate: true });

    if (looksLikeManipuladoraCargo(vinculacion.cargo_nombre)) {
      throw new AppError(
        'Manipuladora de alimentos must use cobertura asignaciones, not ubicacion laboral',
        409,
        'MANIPULADORA_REQUIERE_ASIGNACION_OPERATIVA'
      );
    }

    await ensureUbicacionBelongsContrato(client, toNumber(vinculacion.contrato_id), input.ubicacion_laboral_id);
    await ensureNoLaborOverlap(client, vinculacionId, {
      desde: input.vigencia_desde,
      hasta: input.vigencia_hasta
    });

    const result = await client.query<AsignacionLaboralRow>(
      `
        INSERT INTO personal_asignaciones_laborales (
          vinculacion_id,
          contrato_id,
          ubicacion_laboral_id,
          vigencia_desde,
          vigencia_hasta,
          estado,
          origen,
          observacion,
          created_by_user_id
        )
        VALUES ($1::bigint, $2::bigint, $3::bigint, $4::date, $5::date, $6, $7, $8, $9::bigint)
        RETURNING
          id::text AS id,
          ubicacion_laboral_id::text AS ubicacion_laboral_id,
          (SELECT nombre_ubicacion FROM contrato_ubicaciones_laborales WHERE id = $3::bigint) AS nombre_ubicacion,
          vigencia_desde,
          vigencia_hasta,
          estado,
          origen,
          observacion,
          created_by_user_id::text AS created_by_user_id,
          created_at,
          updated_at
      `,
      [
        vinculacionId,
        vinculacion.contrato_id,
        input.ubicacion_laboral_id,
        input.vigencia_desde,
        input.vigencia_hasta,
        input.estado,
        input.origen,
        input.observacion,
        actorUserId
      ]
    );

    const created = mapAsignacionLaboral(result.rows[0]!);
    await recordAudit({
      client,
      action: 'ASIGNACION_LABORAL_CREATE',
      actorUserId,
      after: created,
      description: 'Creacion de asignacion laboral',
      recordId: String(created.id),
      table: 'personal_asignaciones_laborales'
    });
    await client.query('COMMIT');
    return created;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateAsignacionLaboral = async (
  vinculacionId: number,
  asignacionId: number,
  input: UpdateAsignacionLaboralInput,
  actorUserId: number,
  tenant?: TenantAccessContext
): Promise<AsignacionLaboralItem> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await assertTenantAccessForVinculacionId(tenant, vinculacionId);
    const vinculacion = await getVinculacionContextRow(client, vinculacionId, { forUpdate: true });

    const currentResult = await client.query<AsignacionLaboralRow>(
      `
        SELECT
          pal.id::text AS id,
          pal.ubicacion_laboral_id::text AS ubicacion_laboral_id,
          cul.nombre_ubicacion,
          pal.vigencia_desde,
          pal.vigencia_hasta,
          pal.estado,
          pal.origen,
          pal.observacion,
          pal.created_by_user_id::text AS created_by_user_id,
          pal.created_at,
          pal.updated_at
        FROM personal_asignaciones_laborales pal
        INNER JOIN contrato_ubicaciones_laborales cul ON cul.id = pal.ubicacion_laboral_id
        WHERE pal.id = $1::bigint
          AND pal.vinculacion_id = $2::bigint
        LIMIT 1
        FOR UPDATE OF pal
      `,
      [asignacionId, vinculacionId]
    );

    const currentRow = currentResult.rows[0];

    if (!currentRow) {
      throw new AppError('Asignacion laboral not found', 404, 'ASIGNACION_LABORAL_NOT_FOUND');
    }

    const current = mapAsignacionLaboral(currentRow);
    const nextValues = {
      ubicacion_laboral_id: input.ubicacion_laboral_id ?? current.ubicacion_laboral_id,
      vigencia_desde: input.vigencia_desde ?? current.vigencia_desde,
      vigencia_hasta:
        input.vigencia_hasta !== undefined ? input.vigencia_hasta : current.vigencia_hasta,
      estado: input.estado ?? current.estado,
      observacion: input.observacion !== undefined ? input.observacion : current.observacion
    };

    validateVigenciaRange({ desde: nextValues.vigencia_desde, hasta: nextValues.vigencia_hasta });

    if (looksLikeManipuladoraCargo(vinculacion.cargo_nombre)) {
      throw new AppError(
        'Manipuladora de alimentos must use cobertura asignaciones, not ubicacion laboral',
        409,
        'MANIPULADORA_REQUIERE_ASIGNACION_OPERATIVA'
      );
    }

    await ensureUbicacionBelongsContrato(client, toNumber(vinculacion.contrato_id), nextValues.ubicacion_laboral_id);
    await ensureNoLaborOverlap(
      client,
      vinculacionId,
      { desde: nextValues.vigencia_desde, hasta: nextValues.vigencia_hasta },
      asignacionId
    );

    const result = await client.query<AsignacionLaboralRow>(
      `
        UPDATE personal_asignaciones_laborales
        SET
          ubicacion_laboral_id = $3::bigint,
          vigencia_desde = $4::date,
          vigencia_hasta = $5::date,
          estado = $6,
          observacion = $7,
          updated_at = NOW()
        WHERE id = $1::bigint
          AND vinculacion_id = $2::bigint
        RETURNING
          id::text AS id,
          ubicacion_laboral_id::text AS ubicacion_laboral_id,
          (SELECT nombre_ubicacion FROM contrato_ubicaciones_laborales WHERE id = $3::bigint) AS nombre_ubicacion,
          vigencia_desde,
          vigencia_hasta,
          estado,
          origen,
          observacion,
          created_by_user_id::text AS created_by_user_id,
          created_at,
          updated_at
      `,
      [
        asignacionId,
        vinculacionId,
        nextValues.ubicacion_laboral_id,
        nextValues.vigencia_desde,
        nextValues.vigencia_hasta,
        nextValues.estado,
        nextValues.observacion
      ]
    );

    const updated = mapAsignacionLaboral(result.rows[0]!);
    await recordAudit({
      client,
      action: 'ASIGNACION_LABORAL_UPDATE',
      actorUserId,
      before: current,
      after: updated,
      description: 'Actualizacion de asignacion laboral',
      recordId: String(updated.id),
      table: 'personal_asignaciones_laborales'
    });
    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const createPresentacionLicitacion = async (
  vinculacionId: number,
  input: CreatePresentacionLicitacionInput,
  actorUserId: number,
  tenant?: TenantAccessContext
): Promise<PresentacionLicitacionItem> => {
  validateVigenciaRange({ desde: input.vigencia_desde, hasta: input.vigencia_hasta });
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await assertTenantAccessForVinculacionId(tenant, vinculacionId);
    const vinculacion = await getVinculacionContextRow(client, vinculacionId, { forUpdate: true });
    const perfil = await getPerfilLicitacion(client, toNumber(vinculacion.contrato_id), input.perfil_licitacion_id);

    await ensureNoPresentacionOverlap(client, vinculacionId, {
      desde: input.vigencia_desde,
      hasta: input.vigencia_hasta
    });

    let cumpleRequisitos = input.cumple_requisitos;
    if (cumpleRequisitos === null && perfil.contrato_cargo_equivalente_id) {
      const checklist = await buildContextualVinculacionChecklist(String(vinculacionId), tenant, {
        audit: false,
        contratoCargoIdOverride: toNumber(perfil.contrato_cargo_equivalente_id)
      });
      cumpleRequisitos = checklist.tiene_configuracion && checklist.cumplimiento_porcentaje >= 100
        ? true
        : null;
    }

    const insertResult = await client.query<PresentacionLicitacionRow>(
      `
        INSERT INTO personal_presentaciones_licitacion (
          vinculacion_id,
          contrato_id,
          perfil_licitacion_id,
          vigencia_desde,
          vigencia_hasta,
          estado,
          cumple_requisitos,
          observacion,
          created_by_user_id
        )
        VALUES ($1::bigint, $2::bigint, $3::bigint, $4::date, $5::date, $6, $7, $8, $9::bigint)
        RETURNING
          id::text AS id,
          perfil_licitacion_id::text AS perfil_licitacion_id,
          (SELECT nombre_perfil FROM contrato_perfiles_licitacion WHERE id = $3::bigint) AS perfil_nombre,
          (SELECT cantidad_requerida FROM contrato_perfiles_licitacion WHERE id = $3::bigint) AS perfil_cantidad_requerida,
          (SELECT contrato_cargo_equivalente_id::text FROM contrato_perfiles_licitacion WHERE id = $3::bigint) AS perfil_contrato_cargo_equivalente_id,
          (
            SELECT cc.nombre_cargo
            FROM contrato_perfiles_licitacion cpl
            LEFT JOIN contrato_cargos cc ON cc.id = cpl.contrato_cargo_equivalente_id
            WHERE cpl.id = $3::bigint
          ) AS perfil_contrato_cargo_equivalente_nombre,
          vigencia_desde,
          vigencia_hasta,
          estado,
          cumple_requisitos,
          observacion,
          created_by_user_id::text AS created_by_user_id,
          created_at,
          updated_at
      `,
      [
        vinculacionId,
        vinculacion.contrato_id,
        input.perfil_licitacion_id,
        input.vigencia_desde,
        input.vigencia_hasta,
        input.estado,
        cumpleRequisitos,
        input.observacion,
        actorUserId
      ]
    );

    const created = await buildPresentacionLicitacionItem(insertResult.rows[0]!, vinculacionId, tenant);
    await recordAudit({
      client,
      action: 'PRESENTACION_LICITACION_CREATE',
      actorUserId,
      after: created,
      description: 'Creacion de presentacion de licitacion',
      recordId: String(created.id),
      table: 'personal_presentaciones_licitacion'
    });
    await client.query('COMMIT');
    return created;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updatePresentacionLicitacion = async (
  vinculacionId: number,
  presentacionId: number,
  input: UpdatePresentacionLicitacionInput,
  actorUserId: number,
  tenant?: TenantAccessContext
): Promise<PresentacionLicitacionItem> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await assertTenantAccessForVinculacionId(tenant, vinculacionId);
    const vinculacion = await getVinculacionContextRow(client, vinculacionId, { forUpdate: true });
    const currentResult = await client.query<PresentacionLicitacionRow>(
      `
        SELECT
          ppl.id::text AS id,
          ppl.perfil_licitacion_id::text AS perfil_licitacion_id,
          cpl.nombre_perfil AS perfil_nombre,
          cpl.cantidad_requerida AS perfil_cantidad_requerida,
          cpl.contrato_cargo_equivalente_id::text AS perfil_contrato_cargo_equivalente_id,
          cc.nombre_cargo AS perfil_contrato_cargo_equivalente_nombre,
          ppl.vigencia_desde,
          ppl.vigencia_hasta,
          ppl.estado,
          ppl.cumple_requisitos,
          ppl.observacion,
          ppl.created_by_user_id::text AS created_by_user_id,
          ppl.created_at,
          ppl.updated_at
        FROM personal_presentaciones_licitacion ppl
        INNER JOIN contrato_perfiles_licitacion cpl ON cpl.id = ppl.perfil_licitacion_id
        LEFT JOIN contrato_cargos cc ON cc.id = cpl.contrato_cargo_equivalente_id
        WHERE ppl.id = $1::bigint
          AND ppl.vinculacion_id = $2::bigint
        LIMIT 1
        FOR UPDATE OF ppl
      `,
      [presentacionId, vinculacionId]
    );

    const currentRow = currentResult.rows[0];

    if (!currentRow) {
      throw new AppError(
        'Presentacion de licitacion not found',
        404,
        'PRESENTACION_LICITACION_NOT_FOUND'
      );
    }

    const current = await buildPresentacionLicitacionItem(currentRow, vinculacionId, tenant);
    const nextPerfilId = input.perfil_licitacion_id ?? current.perfil.id;
    const perfil = await getPerfilLicitacion(client, toNumber(vinculacion.contrato_id), nextPerfilId);
    const nextValues = {
      perfil_licitacion_id: nextPerfilId,
      vigencia_desde: input.vigencia_desde ?? current.vigencia_desde,
      vigencia_hasta:
        input.vigencia_hasta !== undefined ? input.vigencia_hasta : current.vigencia_hasta,
      estado: input.estado ?? current.estado,
      observacion: input.observacion !== undefined ? input.observacion : current.observacion
    };

    validateVigenciaRange({ desde: nextValues.vigencia_desde, hasta: nextValues.vigencia_hasta });
    await ensureNoPresentacionOverlap(
      client,
      vinculacionId,
      { desde: nextValues.vigencia_desde, hasta: nextValues.vigencia_hasta },
      presentacionId
    );

    let cumpleRequisitos = input.cumple_requisitos !== undefined
      ? input.cumple_requisitos
      : current.cumple_requisitos;

    if (cumpleRequisitos === null && perfil.contrato_cargo_equivalente_id) {
      const checklist = await buildContextualVinculacionChecklist(String(vinculacionId), tenant, {
        audit: false,
        contratoCargoIdOverride: toNumber(perfil.contrato_cargo_equivalente_id)
      });
      cumpleRequisitos = checklist.tiene_configuracion && checklist.cumplimiento_porcentaje >= 100
        ? true
        : null;
    }

    const result = await client.query<PresentacionLicitacionRow>(
      `
        UPDATE personal_presentaciones_licitacion
        SET
          perfil_licitacion_id = $3::bigint,
          vigencia_desde = $4::date,
          vigencia_hasta = $5::date,
          estado = $6,
          cumple_requisitos = $7,
          observacion = $8,
          updated_at = NOW()
        WHERE id = $1::bigint
          AND vinculacion_id = $2::bigint
        RETURNING
          id::text AS id,
          perfil_licitacion_id::text AS perfil_licitacion_id,
          (SELECT nombre_perfil FROM contrato_perfiles_licitacion WHERE id = $3::bigint) AS perfil_nombre,
          (SELECT cantidad_requerida FROM contrato_perfiles_licitacion WHERE id = $3::bigint) AS perfil_cantidad_requerida,
          (SELECT contrato_cargo_equivalente_id::text FROM contrato_perfiles_licitacion WHERE id = $3::bigint) AS perfil_contrato_cargo_equivalente_id,
          (
            SELECT cc.nombre_cargo
            FROM contrato_perfiles_licitacion cpl
            LEFT JOIN contrato_cargos cc ON cc.id = cpl.contrato_cargo_equivalente_id
            WHERE cpl.id = $3::bigint
          ) AS perfil_contrato_cargo_equivalente_nombre,
          vigencia_desde,
          vigencia_hasta,
          estado,
          cumple_requisitos,
          observacion,
          created_by_user_id::text AS created_by_user_id,
          created_at,
          updated_at
      `,
      [
        presentacionId,
        vinculacionId,
        nextValues.perfil_licitacion_id,
        nextValues.vigencia_desde,
        nextValues.vigencia_hasta,
        nextValues.estado,
        cumpleRequisitos,
        nextValues.observacion
      ]
    );

    const updated = await buildPresentacionLicitacionItem(result.rows[0]!, vinculacionId, tenant);
    await recordAudit({
      client,
      action: 'PRESENTACION_LICITACION_UPDATE',
      actorUserId,
      before: current,
      after: updated,
      description: 'Actualizacion de presentacion de licitacion',
      recordId: String(updated.id),
      table: 'personal_presentaciones_licitacion'
    });
    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const getContratoLicitacionResumen = async (
  contratoId: number,
  tenant?: TenantAccessContext
): Promise<PerfilLicitacionResumenItem[]> => {
  const client = await dbPool.connect();

  try {
    const vinculacionContext = await client.query<{ empresa_id: string | null }>(
      `
        SELECT empresa_id::text AS empresa_id
        FROM contratos
        WHERE id = $1::bigint
        LIMIT 1
      `,
      [contratoId]
    );

    const empresaId = vinculacionContext.rows[0]?.empresa_id;
    if (!empresaId) {
      throw new AppError('Contrato not found', 404, 'CONTRATO_NOT_FOUND');
    }

    if (tenant && !tenant.isGlobalAdmin && tenant.contratoIds.length > 0 && !tenant.contratoIds.includes(contratoId)) {
      throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
    }

    if (
      tenant &&
      !tenant.isGlobalAdmin &&
      tenant.contratoIds.length === 0 &&
      !tenant.empresaIds.includes(toNumber(empresaId))
    ) {
      throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
    }

    const result = await client.query<PerfilResumenRow>(
      `
        SELECT
          cpl.id::text AS id,
          cpl.nombre_perfil,
          cpl.cantidad_requerida,
          cpl.vigencia_desde,
          cpl.vigencia_hasta,
          cpl.contrato_cargo_equivalente_id::text AS contrato_cargo_equivalente_id,
          cc.nombre_cargo AS contrato_cargo_equivalente_nombre,
          COALESCE((
            SELECT COUNT(*)::int
            FROM personal_presentaciones_licitacion ppl
            WHERE ppl.contrato_id = cpl.contrato_id
              AND ppl.perfil_licitacion_id = cpl.id
              AND ppl.estado = 'PRESENTADA'
              AND ppl.vigencia_desde <= CURRENT_DATE
              AND (ppl.vigencia_hasta IS NULL OR ppl.vigencia_hasta >= CURRENT_DATE)
          ), 0) AS acreditadas
        FROM contrato_perfiles_licitacion cpl
        LEFT JOIN contrato_cargos cc ON cc.id = cpl.contrato_cargo_equivalente_id
        WHERE cpl.contrato_id = $1::bigint
          AND cpl.activo = TRUE
          AND cpl.vigencia_desde <= CURRENT_DATE
          AND (cpl.vigencia_hasta IS NULL OR cpl.vigencia_hasta >= CURRENT_DATE)
        ORDER BY cpl.nombre_perfil ASC, cpl.id ASC
      `,
      [contratoId]
    );

    return result.rows.map((row) => {
      const quota = buildLicitacionQuotaDelta(row.cantidad_requerida, row.acreditadas);

      return {
        perfil: {
          id: toNumber(row.id),
          nombre_perfil: row.nombre_perfil,
          contrato_cargo_equivalente: {
            id: row.contrato_cargo_equivalente_id
              ? toNumber(row.contrato_cargo_equivalente_id)
              : null,
            nombre_cargo: row.contrato_cargo_equivalente_nombre
          }
        },
        cantidad_requerida: row.cantidad_requerida,
        acreditadas: row.acreditadas,
        diferencia: quota.diferencia,
        estado: quota.estado,
        vigencia_desde: toDateString(row.vigencia_desde) ?? '',
        vigencia_hasta: toDateString(row.vigencia_hasta)
      };
    });
  } finally {
    client.release();
  }
};
