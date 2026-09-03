import dotenv from 'dotenv';
import { Pool } from 'pg';

import { registerAuditEntry } from '../modules/auditoria/auditoria.helper';
import { countInclusiveDays } from '../modules/nomina/nomina.effects';

dotenv.config(process.env.ENV_FILE?.trim() ? { path: process.env.ENV_FILE.trim() } : undefined);

const apply = process.argv.includes('--apply');
const periodoId = process.argv.find((value) => /^\d+$/.test(value)) ?? '2';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const text = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const result = value.trim();
  return result.length > 0 ? result : null;
};

const main = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    const actorResult = await client.query<{ id: string }>('SELECT id::text FROM usuarios ORDER BY id LIMIT 1');
    const actor = actorResult.rows[0]?.id;
    if (!actor) throw new Error('No hay usuario auditor disponible');

    const rows = await client.query(`
      SELECT nnt.id::text AS turno_id, nnt.tipo_turno, nnt.nomina_novedad_id::text,
        nnt.nomina_empleado_id::text, nnt.vinculacion_id::text, nnt.movimiento_id::text,
        nnt.contexto_operativo, nn.fecha_inicio::text, nn.fecha_fin::text,
        np.contrato_id::text, nm.id::text AS nm_id, nm.valor_total, nm.tarifa_config_id::text,
        p.nombre_municipio, i.nombre_institucion, s.nombre_sede,
        v.fecha_inicio::text AS vinculacion_inicio, v.fecha_fin::text AS vinculacion_fin
      FROM nomina_novedad_turnos nnt
      JOIN nomina_novedades nn ON nn.id = nnt.nomina_novedad_id
      JOIN nomina_periodos np ON np.id = nnt.periodo_id
      JOIN vinculaciones v ON v.id = nnt.vinculacion_id
      LEFT JOIN nomina_movimientos nm ON nm.id = nnt.movimiento_id
      LEFT JOIN LATERAL (SELECT nombre_municipio FROM municipios WHERE LOWER(BTRIM(nombre_municipio)) = LOWER(BTRIM(nnt.contexto_operativo->>'municipio')) LIMIT 1) p ON TRUE
      LEFT JOIN LATERAL (SELECT nombre_institucion FROM instituciones WHERE LOWER(BTRIM(nombre_institucion)) = LOWER(BTRIM(nnt.contexto_operativo->>'institucion')) LIMIT 1) i ON TRUE
      LEFT JOIN LATERAL (SELECT nombre_sede FROM sedes WHERE LOWER(BTRIM(nombre_sede)) = LOWER(BTRIM(nnt.contexto_operativo->>'sede')) LIMIT 1) s ON TRUE
      WHERE nnt.periodo_id = $1::bigint AND nnt.tipo_turno IN ('INTERNO','EXTERNO')
        AND COALESCE(nnt.activo, TRUE) AND COALESCE(nn.activo, TRUE)
        AND (COALESCE(nm.valor_total, 0) = 0 OR nm.tarifa_config_id IS NULL OR nm.id IS NULL)
      ORDER BY nnt.id
    `, [periodoId]);

    const report: Array<Record<string, unknown>> = [];
    if (apply) await client.query('BEGIN');
    for (const row of rows.rows) {
      const context = (row.contexto_operativo && typeof row.contexto_operativo === 'object') ? row.contexto_operativo : {};
      const modalityCode = text(context.modalidad_codigo);
      const modalityName = text(context.modalidad);
      const resolved = await client.query(`
        SELECT m.id::text, m.nombre_modalidad, m.codigo_base, m.codigo_original
        FROM modalidades m
        WHERE LOWER(BTRIM(COALESCE(m.codigo_base, ''))) = LOWER(BTRIM($1))
           OR LOWER(BTRIM(COALESCE(m.codigo_original, ''))) = LOWER(BTRIM($1))
           OR LOWER(BTRIM(m.nombre_modalidad)) = LOWER(BTRIM($2))
      `, [modalityCode, modalityName]);
      const exactNameMatches = modalityName
        ? resolved.rows.filter((item: any) => String(item.nombre_modalidad).trim().toLowerCase() === modalityName.trim().toLowerCase())
        : [];
      const modality = exactNameMatches.length === 1
        ? exactNameMatches[0]
        : resolved.rows.length === 1
          ? resolved.rows[0]
          : null;
      const start = row.fecha_inicio;
      const end = row.fecha_fin ?? start;
      const days = start && end ? countInclusiveDays(start, end) : 0;
      const tariffs = modality && start ? await client.query(`
        SELECT id::text, valor_unitario, municipio_id::text, institucion_id::text, sede_id::text, modalidad_id::text,
          (CASE WHEN sede_id IS NULL THEN 0 ELSE 8 END + CASE WHEN institucion_id IS NULL THEN 0 ELSE 4 END +
           CASE WHEN municipio_id IS NULL THEN 0 ELSE 2 END + CASE WHEN modalidad_id IS NULL THEN 0 ELSE 1 END) AS specificity
        FROM nomina_movimiento_tarifas
        WHERE contrato_id = $1::bigint AND tipo_movimiento = $2
          AND COALESCE(activo, TRUE) AND vigencia_desde <= $3::date
          AND (vigencia_hasta IS NULL OR vigencia_hasta >= $3::date)
          AND (modalidad_id IS NULL OR modalidad_id = $4::bigint)
        ORDER BY specificity DESC, vigencia_desde DESC, id DESC
      `, [row.contrato_id, row.tipo_turno === 'INTERNO' ? 'TURNO_INTERNO' : 'TURNO_EXTERNO', start, modality.id]) : { rows: [] };
      const top = tariffs.rows[0];
      const ambiguous = Boolean(top && tariffs.rows.filter((item) => item.specificity === top.specificity).length > 1);
      const item = {
        turno_id: row.turno_id, movimiento_id: row.nm_id, tipo_turno: row.tipo_turno,
        fecha_inicio: start, fecha_fin: end, dias_efectivos: days,
        modalidad: modality?.nombre_modalidad ?? modalityName,
        tarifa_config_id: ambiguous ? null : top?.id ?? null,
        valor_diario: ambiguous ? null : top?.valor_unitario ?? null,
        valor_total: ambiguous || !top ? null : Number(top.valor_unitario) * days,
        estado: !modality ? 'SKIPPED_MODALIDAD' : !top ? 'SKIPPED_TARIFA' : ambiguous ? 'SKIPPED_TARIFA_AMBIGUA' : 'READY'
      };
      report.push(item);
      if (!apply || item.estado !== 'READY') continue;

      const mergedContext = { ...context, modalidad_id: modality.id, modalidad_codigo: modality.codigo_base ?? modality.codigo_original, modalidad: modality.nombre_modalidad };
      let movementId = row.nm_id;
      if (!movementId) {
        const inserted = await client.query<{ id: string }>(`
          INSERT INTO nomina_movimientos
            (periodo_id, nomina_empleado_id, vinculacion_id, fecha, tipo_movimiento, familia_movimiento, estado,
             descripcion, cantidad, valor_unitario, valor_calculado, valor_total, modalidad_id, contexto_modalidad,
             tarifa_config_id, es_devengado, es_deduccion, afecta_seguridad_social, activo, updated_by, aprobado_por, aprobado_at)
          VALUES ($1,$2,$3,$4,$5,'ADICION_DEVENGO',$6,$7,$8,$9,$10,$11,$12,$13,$14,TRUE,FALSE,$15,TRUE,$16,
                  CASE WHEN $6 = 'APROBADO' THEN $16 ELSE NULL END, CASE WHEN $6 = 'APROBADO' THEN NOW() ELSE NULL END)
          RETURNING id::text
        `, [periodoId, row.nomina_empleado_id, row.vinculacion_id, start,
          row.tipo_turno === 'INTERNO' ? 'TURNO_INTERNO' : 'TURNO_EXTERNO', row.tipo_turno === 'INTERNO' ? 'APROBADO' : 'PENDIENTE',
          `Regularizacion controlada turno ${row.turno_id}`, days, top.valor_unitario, Number(top.valor_unitario) * days,
          Number(top.valor_unitario) * days, modality.id, modality.nombre_modalidad, row.tipo_turno === 'INTERNO', actor]);
        movementId = inserted.rows[0]?.id ?? null;
        if (movementId) await client.query('UPDATE nomina_novedad_turnos SET movimiento_id = $2::bigint, contexto_operativo = $3::jsonb, updated_by = $4::bigint, updated_at = NOW() WHERE id = $1::bigint', [row.turno_id, movementId, JSON.stringify(mergedContext), actor]);
      } else {
        await client.query(`UPDATE nomina_movimientos SET cantidad=$2,valor_unitario=$3,valor_calculado=$4,valor_total=$4,modalidad_id=$5,contexto_modalidad=$6,tarifa_config_id=$7,updated_by=$8,updated_at=NOW() WHERE id=$1::bigint`, [movementId, days, top.valor_unitario, Number(top.valor_unitario) * days, modality.id, modality.nombre_modalidad, top.id, actor]);
        await client.query('UPDATE nomina_novedad_turnos SET contexto_operativo = $2::jsonb, updated_by = $3::bigint, updated_at = NOW() WHERE id = $1::bigint', [row.turno_id, JSON.stringify(mergedContext), actor]);
      }
      await registerAuditEntry({ client, usuario_id: actor, accion: 'NOMINA_TURNO_BACKFILL', tabla: 'nomina_movimientos', registro_id: movementId, descripcion: 'Backfill controlado de turno sin tarifa snapshot', before: row, after: item });
    }
    if (apply) { await client.query('COMMIT'); } else { await client.query('ROLLBACK').catch(() => undefined); }
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', periodo_id: periodoId, total: report.length, ready: report.filter((item) => item.estado === 'READY').length, skipped: report.filter((item) => item.estado !== 'READY'), items: report }, null, 2));
  } catch (error) {
    if (apply) await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { client.release(); }
};

main().catch(async (error) => { console.error(error); await pool.end(); process.exitCode = 1; }).finally(() => pool.end().catch(() => undefined));
