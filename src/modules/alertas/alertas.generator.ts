import { PoolClient, QueryResultRow } from 'pg';

import { PrioridadAlerta, TipoAlerta } from './alertas.schemas';

export interface GeneratedAlertCandidate {
  descripcion: string;
  entidad: string;
  fecha_vencimiento: string | null;
  metadata?: Record<string, unknown>;
  prioridad: PrioridadAlerta;
  registro_id: string;
  tipo_alerta: TipoAlerta;
  titulo: string;
  usuario_id?: string | null;
}

interface DocumentAlertRow extends QueryResultRow {
  fecha_vencimiento: Date | string;
  id: string;
  scope: 'documentos_persona' | 'documentos_vinculacion';
}

interface ContratoAlertRow extends QueryResultRow {
  fecha_finalizacion: Date | string;
  id: string;
}

interface VinculacionAlertRow extends QueryResultRow {
  fecha_fin: Date | string;
  id: string;
}

interface PlanSstAlertRow extends QueryResultRow {
  fecha_compromiso: Date | string;
  id: string;
}

interface NominaPeriodoAlertRow extends QueryResultRow {
  estado_liquidacion: string;
  fecha_fin: Date | string;
  id: string;
  nombre: string;
}

interface CoberturaContratoAlertRow extends QueryResultRow {
  contrato_id: string;
  contrato_nombre: string | null;
  faltantes: number;
  sobrecobertura: number;
}

const toDateString = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value;
};

const toIsoDate = (date: Date): string => {
  return date.toISOString().slice(0, 10);
};

const addDays = (date: Date, days: number): Date => {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
};

const includeType = (tipos: Set<TipoAlerta> | null, tipo: TipoAlerta): boolean => {
  return !tipos || tipos.has(tipo);
};

export const generateSystemAlertCandidates = async (
  client: PoolClient,
  tiposFiltro?: TipoAlerta[]
): Promise<GeneratedAlertCandidate[]> => {
  const today = new Date();
  const todayString = toIsoDate(today);
  const next7DaysString = toIsoDate(addDays(today, 7));
  const next30DaysString = toIsoDate(addDays(today, 30));
  const selectedTypes = tiposFiltro && tiposFiltro.length > 0 ? new Set(tiposFiltro) : null;
  const candidates: GeneratedAlertCandidate[] = [];

  if (
    includeType(selectedTypes, 'DOCUMENTO_VENCIDO') ||
    includeType(selectedTypes, 'DOCUMENTO_POR_VENCER')
  ) {
    const documentsResult = await client.query<DocumentAlertRow>(
      `
        SELECT
          dp.id::text AS id,
          dp.fecha_vencimiento,
          'documentos_persona'::text AS scope
        FROM documentos_persona dp
        WHERE dp.activo = TRUE
          AND dp.fecha_vencimiento IS NOT NULL
          AND dp.fecha_vencimiento <= $1

        UNION ALL

        SELECT
          dv.id::text AS id,
          dv.fecha_vencimiento,
          'documentos_vinculacion'::text AS scope
        FROM documentos_vinculacion dv
        WHERE dv.activo = TRUE
          AND dv.fecha_vencimiento IS NOT NULL
          AND dv.fecha_vencimiento <= $1
      `,
      [next30DaysString]
    );

    for (const row of documentsResult.rows) {
      const fechaVencimiento = toDateString(row.fecha_vencimiento);

      if (!fechaVencimiento) {
        continue;
      }

      if (fechaVencimiento < todayString && includeType(selectedTypes, 'DOCUMENTO_VENCIDO')) {
        candidates.push({
          tipo_alerta: 'DOCUMENTO_VENCIDO',
          prioridad: 'CRITICA',
          entidad: row.scope,
          registro_id: row.id,
          fecha_vencimiento: fechaVencimiento,
          titulo: 'Documento vencido',
          descripcion: 'Se detecto un documento vencido',
          metadata: {
            fecha_vencimiento: fechaVencimiento
          }
        });
      } else if (
        fechaVencimiento >= todayString &&
        fechaVencimiento <= next30DaysString &&
        includeType(selectedTypes, 'DOCUMENTO_POR_VENCER')
      ) {
        candidates.push({
          tipo_alerta: 'DOCUMENTO_POR_VENCER',
          prioridad: 'ALTA',
          entidad: row.scope,
          registro_id: row.id,
          fecha_vencimiento: fechaVencimiento,
          titulo: 'Documento por vencer',
          descripcion: 'Se detecto un documento proximo a vencer',
          metadata: {
            fecha_vencimiento: fechaVencimiento
          }
        });
      }
    }
  }

  if (includeType(selectedTypes, 'CONTRATO_POR_VENCER')) {
    const contratosResult = await client.query<ContratoAlertRow>(
      `
        SELECT
          c.id::text AS id,
          c.fecha_finalizacion
        FROM contratos c
        WHERE c.fecha_finalizacion IS NOT NULL
          AND c.fecha_finalizacion >= $1
          AND c.fecha_finalizacion <= $2
      `,
      [todayString, next30DaysString]
    );

    for (const row of contratosResult.rows) {
      const fechaFinalizacion = toDateString(row.fecha_finalizacion);

      candidates.push({
        tipo_alerta: 'CONTRATO_POR_VENCER',
        prioridad: 'ALTA',
        entidad: 'contratos',
        registro_id: row.id,
        fecha_vencimiento: fechaFinalizacion,
        titulo: 'Contrato por vencer',
        descripcion: 'Se detecto un contrato proximo a finalizar',
        metadata: {
          fecha_finalizacion: fechaFinalizacion
        }
      });
    }
  }

  if (includeType(selectedTypes, 'VINCULACION_POR_VENCER')) {
    const vinculacionesResult = await client.query<VinculacionAlertRow>(
      `
        SELECT
          v.id::text AS id,
          v.fecha_fin
        FROM vinculaciones v
        WHERE v.estado = 'ACTIVA'
          AND v.fecha_fin IS NOT NULL
          AND v.fecha_fin >= $1
          AND v.fecha_fin <= $2
      `,
      [todayString, next30DaysString]
    );

    for (const row of vinculacionesResult.rows) {
      const fechaFin = toDateString(row.fecha_fin);

      candidates.push({
        tipo_alerta: 'VINCULACION_POR_VENCER',
        prioridad: 'MEDIA',
        entidad: 'vinculaciones',
        registro_id: row.id,
        fecha_vencimiento: fechaFin,
        titulo: 'Vinculacion por vencer',
        descripcion: 'Se detecto una vinculacion proxima a finalizar',
        metadata: {
          fecha_fin: fechaFin
        }
      });
    }
  }

  if (
    includeType(selectedTypes, 'PLAN_SST_VENCIDO') ||
    includeType(selectedTypes, 'PLAN_SST_POR_VENCER')
  ) {
    const planesResult = await client.query<PlanSstAlertRow>(
      `
        SELECT
          spa.id::text AS id,
          spa.fecha_compromiso
        FROM sst_planes_accion spa
        WHERE spa.activo = TRUE
          AND spa.estado <> 'CERRADO'
          AND spa.estado <> 'ANULADO'
          AND spa.fecha_compromiso <= $2
      `,
      [todayString, next7DaysString]
    );

    for (const row of planesResult.rows) {
      const fechaCompromiso = toDateString(row.fecha_compromiso);

      if (!fechaCompromiso) {
        continue;
      }

      if (fechaCompromiso < todayString && includeType(selectedTypes, 'PLAN_SST_VENCIDO')) {
        candidates.push({
          tipo_alerta: 'PLAN_SST_VENCIDO',
          prioridad: 'CRITICA',
          entidad: 'sst_planes_accion',
          registro_id: row.id,
          fecha_vencimiento: fechaCompromiso,
          titulo: 'Plan SST vencido',
          descripcion: 'Se detecto un plan de accion SST vencido',
          metadata: {
            fecha_compromiso: fechaCompromiso
          }
        });
      } else if (
        fechaCompromiso >= todayString &&
        fechaCompromiso <= next7DaysString &&
        includeType(selectedTypes, 'PLAN_SST_POR_VENCER')
      ) {
        candidates.push({
          tipo_alerta: 'PLAN_SST_POR_VENCER',
          prioridad: 'ALTA',
          entidad: 'sst_planes_accion',
          registro_id: row.id,
          fecha_vencimiento: fechaCompromiso,
          titulo: 'Plan SST por vencer',
          descripcion: 'Se detecto un plan de accion SST proximo a vencer',
          metadata: {
            fecha_compromiso: fechaCompromiso
          }
        });
      }
    }
  }

  if (
    includeType(selectedTypes, 'NOMINA_PERIODO_ABIERTO') ||
    includeType(selectedTypes, 'NOMINA_PENDIENTE')
  ) {
    const nominaResult = await client.query<NominaPeriodoAlertRow>(
      `
        SELECT
          np.id::text AS id,
          np.nombre,
          np.fecha_fin,
          np.estado_liquidacion
        FROM nomina_periodos np
        WHERE np.estado = 'ABIERTO'
      `
    );

    for (const row of nominaResult.rows) {
      const fechaFin = toDateString(row.fecha_fin);

      if (includeType(selectedTypes, 'NOMINA_PERIODO_ABIERTO')) {
        candidates.push({
          tipo_alerta: 'NOMINA_PERIODO_ABIERTO',
          prioridad: 'MEDIA',
          entidad: 'nomina_periodos',
          registro_id: row.id,
          fecha_vencimiento: fechaFin,
          titulo: 'Periodo de nomina abierto',
          descripcion: `El periodo de nomina ${row.nombre} sigue abierto`,
          metadata: {
            estado_liquidacion: row.estado_liquidacion,
            fecha_fin: fechaFin
          }
        });
      }

      if (includeType(selectedTypes, 'NOMINA_PENDIENTE') && row.estado_liquidacion !== 'FINAL') {
        candidates.push({
          tipo_alerta: 'NOMINA_PENDIENTE',
          prioridad: 'ALTA',
          entidad: 'nomina_periodos',
          registro_id: row.id,
          fecha_vencimiento: fechaFin,
          titulo: 'Nomina pendiente de finalizar',
          descripcion: `El periodo de nomina ${row.nombre} tiene liquidacion pendiente`,
          metadata: {
            estado_liquidacion: row.estado_liquidacion,
            fecha_fin: fechaFin
          }
        });
      }
    }
  }

  if (
    includeType(selectedTypes, 'COBERTURA_INSUFICIENTE') ||
    includeType(selectedTypes, 'SOBRECOBERTURA')
  ) {
    const coberturaResult = await client.query<CoberturaContratoAlertRow>(
      `
        WITH cobertura_resumen AS (
          SELECT
            ff.contrato_id::text AS contrato_id,
            c.nombre AS contrato_nombre,
            ff.manipuladores_requeridos,
            COALESCE(asg.asignados_cobertura, 0)::numeric AS asignados_cobertura
          FROM focalizacion_final ff
          INNER JOIN contratos c ON c.id = ff.contrato_id
          LEFT JOIN (
            SELECT
              ca.focalizacion_final_id::text AS focalizacion_final_id,
              COALESCE(SUM(ca.fraccion_cobertura), 0) AS asignados_cobertura
            FROM cobertura_asignaciones ca
            WHERE ca.activo = TRUE
            GROUP BY ca.focalizacion_final_id::text
          ) asg ON asg.focalizacion_final_id = ff.id::text
          WHERE ff.activo = TRUE
        )
        SELECT
          cr.contrato_id,
          MAX(cr.contrato_nombre) AS contrato_nombre,
          COUNT(*) FILTER (WHERE cr.asignados_cobertura < cr.manipuladores_requeridos)::int AS faltantes,
          COUNT(*) FILTER (WHERE cr.asignados_cobertura > cr.manipuladores_requeridos)::int AS sobrecobertura
        FROM cobertura_resumen cr
        GROUP BY cr.contrato_id
      `
    );

    for (const row of coberturaResult.rows) {
      if (row.faltantes > 0 && includeType(selectedTypes, 'COBERTURA_INSUFICIENTE')) {
        candidates.push({
          tipo_alerta: 'COBERTURA_INSUFICIENTE',
          prioridad: 'CRITICA',
          entidad: 'contratos',
          registro_id: row.contrato_id,
          fecha_vencimiento: null,
          titulo: 'Cobertura insuficiente',
          descripcion: `El contrato ${row.contrato_nombre ?? row.contrato_id} presenta cobertura insuficiente`,
          metadata: {
            sedes_faltantes: row.faltantes
          }
        });
      }

      if (row.sobrecobertura > 0 && includeType(selectedTypes, 'SOBRECOBERTURA')) {
        candidates.push({
          tipo_alerta: 'SOBRECOBERTURA',
          prioridad: 'MEDIA',
          entidad: 'contratos',
          registro_id: row.contrato_id,
          fecha_vencimiento: null,
          titulo: 'Sobrecobertura detectada',
          descripcion: `El contrato ${row.contrato_nombre ?? row.contrato_id} presenta sobrecobertura`,
          metadata: {
            sedes_sobrecobertura: row.sobrecobertura
          }
        });
      }
    }
  }

  return candidates;
};
