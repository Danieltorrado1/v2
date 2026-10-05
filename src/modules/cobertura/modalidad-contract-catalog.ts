import type { PoolClient } from 'pg';
import { AppError } from '../../utils/AppError';

// Contract membership comes from its coverage rules and configured modalities,
// never from the selected monthly focalization or this site's current assignment.
export async function contractModalityOptions(client: Pick<PoolClient, 'query'>, contratoId: string) {
  const result = await client.query<{
    id: string; modalidad_id: string; modalidad: string;
    institucion_id: string; institucion: string; sede_id: string; sede: string;
    municipio_id: string; municipio: string;
  }>(`
    WITH contract_modes AS (
      SELECT modalidad_id FROM sede_modalidades
      WHERE contrato_id=$1::bigint AND COALESCE(activo,TRUE)
      UNION
      SELECT modalidad_id FROM calculadora_personal_config
      WHERE contrato_id=$1::bigint AND LOWER(estado)='activo'
    )
    SELECT CONCAT(s.id,':',m.id) id, m.id::text modalidad_id,
      COALESCE(m.codigo_original,m.nombre_modalidad) modalidad,
      i.id::text institucion_id,i.nombre_institucion institucion,
      s.id::text sede_id,s.nombre_sede sede,s.municipio_id::text municipio_id,
      mu.nombre_municipio municipio
    FROM instituciones i JOIN sedes s ON s.institucion_id=i.id
    JOIN municipios mu ON mu.id=s.municipio_id
    CROSS JOIN modalidades m
    WHERE i.contrato_id=$1::bigint AND COALESCE(i.activo,TRUE)
      AND COALESCE(s.activo,TRUE) AND COALESCE(m.activo,TRUE)
      AND m.id IN (SELECT modalidad_id FROM contract_modes)
    ORDER BY institucion,sede,modalidad`, [contratoId]);
  return result.rows;
}

export async function contractModalityContext(client: Pick<PoolClient, 'query'>, contratoId: string,
  input: { institucion_id?: unknown; sede_id?: unknown; modalidad_id?: unknown; municipio_id?: unknown }) {
  const matches = (await contractModalityOptions(client, contratoId)).filter(row =>
    row.institucion_id===String(input.institucion_id) && row.sede_id===String(input.sede_id)
    && row.modalidad_id===String(input.modalidad_id)
    && (!input.municipio_id || row.municipio_id===String(input.municipio_id)));
  if (matches.length!==1) throw new AppError('Destino fuera del catálogo del contrato',409,'NOMINA_CAMBIO_CONTEXTO_INVALIDO');
  return matches[0]!;
}
