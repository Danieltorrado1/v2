import type { PoolClient } from 'pg';
import { registerAuditEntry } from '../auditoria/auditoria.helper';
import { AppError } from '../../utils/AppError';

export interface CanonicalAssignmentContext { municipio_id?: number | string | null; institucion_id?: number | string | null; institucion?: string | null; sede_id?: number | string | null; sede?: string | null; modalidad_id?: number | string | null; modalidad?: string | null; cobertura_asignacion_id?: number | string | null; }

export const persistCanonicalAssignmentVersion = async (client: PoolClient, input: { contratoId: string | number; vinculacionId: string | number; fechaDesde: string; contexto: CanonicalAssignmentContext; actor: string; motivo: string; replaceExisting?: boolean }): Promise<void> => {
  const columns = await client.query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='cobertura_asignaciones'`);
  const available = new Set(columns.rows.map((row) => row.column_name));
  if (!['contrato_id','institucion','sede','modalidad','categoria_cobertura','tipo_asignacion','porcentaje_cobertura','observacion'].every((column) => available.has(column))) return;
  const current = await client.query<any>(`SELECT * FROM cobertura_asignaciones WHERE vinculacion_id=$1::bigint AND COALESCE(activo,TRUE) AND fecha_inicio<=$2::date AND (fecha_fin IS NULL OR fecha_fin>=$2::date) ORDER BY fecha_inicio DESC,id DESC LIMIT 1 FOR UPDATE`, [input.vinculacionId, input.fechaDesde]);
  const next = await client.query<{ fecha_inicio: string }>(`SELECT fecha_inicio::text FROM cobertura_asignaciones WHERE vinculacion_id=$1::bigint AND COALESCE(activo,TRUE) AND fecha_inicio>$2::date ORDER BY fecha_inicio,id LIMIT 1 FOR UPDATE`, [input.vinculacionId, input.fechaDesde]);
  const existing = current.rows[0] as Record<string, any> | undefined;
  const same = existing && String(existing.municipio_id ?? '') === String(input.contexto.municipio_id ?? '') && String(existing.institucion ?? '') === String(input.contexto.institucion ?? '') && String(existing.sede ?? '') === String(input.contexto.sede ?? '') && String(existing.modalidad ?? '') === String(input.contexto.modalidad ?? '');
  if (same) return;
  if (input.replaceExisting && existing && String(existing.id) === String(input.contexto.cobertura_asignacion_id ?? '')) {
    await client.query(`UPDATE cobertura_asignaciones SET focalizacion_final_id=(SELECT ff.id FROM focalizacion_final ff WHERE ff.contrato_id=$7::bigint AND ff.municipio_id=$2::bigint AND ff.institucion_id=$8::bigint AND ff.sede_id=$9::bigint AND ff.modalidad_id=$10::bigint AND COALESCE(ff.activo,TRUE) ORDER BY ff.id DESC LIMIT 1),municipio_id=$2::bigint,institucion=$3,sede=$4,modalidad=$5,observacion=$6 WHERE id=$1::bigint`, [existing.id, input.contexto.municipio_id ?? null, input.contexto.institucion ?? null, input.contexto.sede ?? null, input.contexto.modalidad ?? null, input.motivo, input.contratoId, input.contexto.institucion_id ?? null, input.contexto.sede_id ?? null, input.contexto.modalidad_id ?? null]);
    return;
  }
  if (existing && String(existing.fecha_inicio).slice(0, 10) < input.fechaDesde) {
    await client.query(`UPDATE cobertura_asignaciones SET fecha_fin=$2::date-1,activo=FALSE,observacion=CONCAT_WS(' · ',observacion,$3) WHERE id=$1::bigint`, [existing.id, input.fechaDesde, input.motivo]);
  } else if (existing) {
    await client.query(`UPDATE cobertura_asignaciones SET focalizacion_final_id=(SELECT ff.id FROM focalizacion_final ff WHERE ff.contrato_id=$7::bigint AND ff.municipio_id=$2::bigint AND ff.institucion_id=$8::bigint AND ff.sede_id=$9::bigint AND ff.modalidad_id=$10::bigint AND COALESCE(ff.activo,TRUE) ORDER BY ff.id DESC LIMIT 1),municipio_id=$2::bigint,institucion=$3,sede=$4,modalidad=$5,observacion=$6 WHERE id=$1::bigint`, [existing.id, input.contexto.municipio_id ?? null, input.contexto.institucion ?? null, input.contexto.sede ?? null, input.contexto.modalidad ?? null, input.motivo, input.contratoId, input.contexto.institucion_id ?? null, input.contexto.sede_id ?? null, input.contexto.modalidad_id ?? null]);
    return;
  }
  const inserted = await client.query<{ id: string }>(`INSERT INTO cobertura_asignaciones(contrato_id,municipio_id,focalizacion_final_id,vinculacion_id,institucion,sede,consecutivo_sede,modalidad,categoria_cobertura,tipo_asignacion,porcentaje_cobertura,fecha_inicio,fecha_fin,observacion,activo) SELECT $1::bigint,$2::bigint,ff.id,$3::bigint,ff.institucion_final,ff.sede_final,ff.consecutivo_final,ff.modalidad_final,ff.categoria_cobertura,COALESCE($4,'PRINCIPAL'),COALESCE($5::numeric,1),$6::date,CASE WHEN $7::date IS NULL THEN NULL ELSE $7::date-1 END,$8,TRUE FROM focalizacion_final ff WHERE ff.contrato_id=$1::bigint AND ff.municipio_id=$2::bigint AND ff.institucion_id=$9::bigint AND ff.sede_id=$10::bigint AND ff.modalidad_id=$11::bigint AND COALESCE(ff.activo,TRUE) RETURNING id::text`, [input.contratoId, input.contexto.municipio_id ?? null, input.vinculacionId, existing?.tipo_asignacion ?? null, existing?.porcentaje_cobertura ?? null, input.fechaDesde, next.rows[0]?.fecha_inicio ?? null, input.motivo, input.contexto.institucion_id ?? null, input.contexto.sede_id ?? null, input.contexto.modalidad_id ?? null]);
  if (!inserted.rows[0]) throw new AppError('La asignación operativa canónica no existe en el catálogo', 409, 'NOMINA_CAMBIO_CONTEXTO_INVALIDO');
  await registerAuditEntry({ accion: 'VERSION_ASSIGNMENT', tabla: 'cobertura_asignaciones', registro_id: inserted.rows[0].id, descripcion: input.motivo, usuario_id: input.actor, before: existing ?? null, after: { vinculacion_id: input.vinculacionId, fecha_inicio: input.fechaDesde, contexto: input.contexto }, client });
};
