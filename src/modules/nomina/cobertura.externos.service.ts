import PDFDocument from 'pdfkit';
import type { PoolClient, QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import { env } from '../../config/env';
import { getSupabaseAdminClient } from '../../config/supabaseAdmin';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import {
  registerAuditEntry,
  type AuditRequestMeta,
} from '../auditoria/auditoria.helper';
import { createDocumentSignedUrlForBucket } from '../documentos/documentos.storage';
import type {
  GenerarCoberturaCuentaInput,
  ListCoberturaExternosQuery,
  UpsertCoberturaExternoInput,
} from './cobertura.externos.schemas';
import {
  appendNominaCoberturaScope,
  assertNominaExternoCoberturaScope,
} from './nomina.procesos';

type ExternoRow = QueryResultRow & {
  id: string;
  empresa_id: string;
  tipo_documento: string;
  numero_documento: string;
  nombre_completo: string;
  banco: string | null;
  tipo_cuenta: string | null;
  numero_cuenta: string | null;
  turnos: string | number;
  turnos_con_tarifa: string | number;
  turnos_sin_tarifa: string | number;
  dias_turnos: string | number;
  dias_listos: string | number;
  valor_listo: string | number;
  valor_total: string | number;
  cedula: boolean;
  banco_doc: boolean;
  cuenta_id: string | null;
  cuenta_estado: string;
};

type CuentaRow = QueryResultRow & {
  id: string;
  empresa_id: string;
  contrato_id: string;
  periodo_id: string;
  externo_id: string;
  numero_cuenta: string;
  estado: string;
  valor_total: string | number;
  generado_bucket: string | null;
  generado_path: string | null;
  firmado_bucket: string | null;
  firmado_path: string | null;
};

type CoberturaPeriodoScopeRow = QueryResultRow & {
  contrato_id: string;
  empresa_id: string;
  periodo_id: string;
};

type CoberturaCuentaTurnSnapshotRow = QueryResultRow & {
  movimiento_id: string;
  turno_id: string | null;
  titular_referencia: string | null;
  municipio: string | null;
  fecha: string;
  fecha_inicio: string;
  fecha_fin: string;
  dias_efectivos: number;
  valor: string | number;
  valor_diario: string | number | null;
  tarifa_config_id: string | null;
  modalidad_id: string | null;
  modalidad: string | null;
  institucion: string | null;
  sede: string | null;
};

type CoberturaCuentaDetalleRow = QueryResultRow & {
  movimiento_id: string | null;
  turno_id: string | null;
  titular_referencia: string | null;
  municipio: string | null;
  fecha: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  dias_efectivos: number | null;
  valor: string | number;
  valor_diario: string | number | null;
  tarifa_config_id: string | null;
  modalidad_id: string | null;
  modalidad: string | null;
  institucion: string | null;
  sede: string | null;
};

type CoberturaCuentaSyncResult = {
  cuenta: CuentaRow | null;
  turnos: CoberturaCuentaTurnSnapshotRow[];
  actualizada: boolean;
};

const assertTenantCompany = (
  tenant: TenantAccessContext | undefined,
  empresaId: number,
) => {
  if (
    tenant &&
    !tenant.isGlobalAdmin &&
    !tenant.empresaIds.includes(empresaId)
  ) {
    throw new AppError(
      'Empresa fuera del alcance del usuario',
      403,
      'TENANT_COMPANY_FORBIDDEN',
    );
  }
};

const assertTenantContract = (
  tenant: TenantAccessContext | undefined,
  contratoId: number,
) => {
  if (
    tenant &&
    !tenant.isGlobalAdmin &&
    tenant.contratoIds.length > 0 &&
    !tenant.contratoIds.includes(contratoId)
  ) {
    throw new AppError(
      'Contrato fuera del alcance del usuario',
      403,
      'TENANT_CONTRACT_FORBIDDEN',
    );
  }
};

const upload = async (
  path: string,
  buffer: Buffer,
  mimeType: string,
) => {
  const result = await getSupabaseAdminClient()
    .storage
    .from(env.SUPABASE_STORAGE_BUCKET)
    .upload(path, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (result.error) {
    throw new AppError(
      'No fue posible cargar el documento en Storage',
      502,
      'STORAGE_UPLOAD_FAILED',
    );
  }

  return {
    bucket: env.SUPABASE_STORAGE_BUCKET,
    path,
  };
};

const toNumberValue = (
  value: string | number | null | undefined,
) => {
  if (value === null || value === undefined) {
    return 0;
  }

  return Number(value);
};

const roundCurrency = (value: number) =>
  Number(value.toFixed(2));

const normalizeNullableText = (
  value: string | null | undefined,
) => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
};

const loadCoberturaPeriodoScopeOrThrow = async (
  periodoId: number,
  tenant?: TenantAccessContext,
  client?: PoolClient,
) => {
  const executor = client ?? dbPool;

  const result = await executor.query<CoberturaPeriodoScopeRow>(
    `
      SELECT
        np.id::text AS periodo_id,
        c.id::text AS contrato_id,
        c.empresa_id::text AS empresa_id
      FROM nomina_periodos np
      INNER JOIN contratos c
        ON c.id = np.contrato_id
      WHERE np.id = $1::bigint
      LIMIT 1
    `,
    [periodoId],
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError(
      'Periodo de nomina no encontrado',
      404,
      'COBERTURA_PERIODO_NOT_FOUND',
    );
  }

  assertTenantCompany(
    tenant,
    Number(row.empresa_id),
  );

  assertTenantContract(
    tenant,
    Number(row.contrato_id),
  );

  return row;
};

const loadCoberturaCuentaTurnSnapshots = async (
  input: GenerarCoberturaCuentaInput,
  client: PoolClient,
) => {
  const result =
    await client.query<CoberturaCuentaTurnSnapshotRow>(
      `
        SELECT
          nm.id::text AS movimiento_id,
          turno.id::text AS turno_id,
          NULLIF(CONCAT_WS(' ', pr.primer_nombre, pr.segundo_nombre, pr.primer_apellido, pr.segundo_apellido), '') AS titular_referencia,
          COALESCE(nm.contexto_municipio, turno.contexto_operativo ->> 'municipio') AS municipio,
          COALESCE(nn.fecha_inicio, nm.fecha)::text AS fecha_inicio,
          COALESCE(nn.fecha_fin, nn.fecha_inicio, nm.fecha)::text AS fecha_fin,
          COALESCE(nn.fecha_inicio, nm.fecha)::text AS fecha,
          (COALESCE(nn.fecha_fin, nn.fecha_inicio, nm.fecha) - COALESCE(nn.fecha_inicio, nm.fecha) + 1)::int AS dias_efectivos,
          nm.valor_total AS valor,
          nm.valor_unitario AS valor_diario,
          nm.tarifa_config_id::text AS tarifa_config_id,

          COALESCE(
            nm.modalidad_id::text,
            CASE
              WHEN NULLIF(
                turno.contexto_operativo ->> 'modalidad_id',
                ''
              ) ~ '^[0-9]+$'
                THEN (
                  turno.contexto_operativo ->> 'modalidad_id'
                )::bigint::text
              ELSE NULL
            END
          ) AS modalidad_id,

          COALESCE(
            nm.contexto_modalidad,
            turno.contexto_operativo ->> 'modalidad',
            mo.nombre_modalidad
          ) AS modalidad,

          COALESCE(
            nm.contexto_institucion,
            turno.contexto_operativo ->> 'institucion',
            ins.nombre_institucion
          ) AS institucion,

          COALESCE(
            nm.contexto_sede,
            turno.contexto_operativo ->> 'sede',
            s.nombre_sede
          ) AS sede

        FROM nomina_movimientos nm

        INNER JOIN nomina_periodos np
          ON np.id = nm.periodo_id

        INNER JOIN contratos contrato_periodo
          ON contrato_periodo.id = np.contrato_id

        LEFT JOIN LATERAL (
          SELECT
            nnt.id,
            nnt.contexto_operativo,
            nnt.nomina_novedad_id
          FROM nomina_novedad_turnos nnt
          WHERE nnt.movimiento_id = nm.id
            AND COALESCE(nnt.activo, TRUE) = TRUE
          ORDER BY nnt.id DESC
          LIMIT 1
        ) turno
          ON TRUE

          LEFT JOIN nomina_novedades nn
            ON nn.id = turno.nomina_novedad_id

        LEFT JOIN personas pr
          ON pr.id = nm.persona_reemplazada_id

        LEFT JOIN modalidades mo
          ON mo.id = COALESCE(
            nm.modalidad_id,
            CASE
              WHEN NULLIF(
                turno.contexto_operativo ->> 'modalidad_id',
                ''
              ) ~ '^[0-9]+$'
                THEN (
                  turno.contexto_operativo ->> 'modalidad_id'
                )::bigint
              ELSE NULL
            END
          )

        LEFT JOIN instituciones ins
          ON ins.id = nm.institucion_id

        LEFT JOIN sedes s
          ON s.id = nm.sede_id

        WHERE nm.externo_id = $1::bigint
          AND nm.periodo_id = $2::bigint
          AND np.contrato_id = $3::bigint
          AND contrato_periodo.empresa_id = $4::bigint
          AND nm.tipo_movimiento = 'TURNO_EXTERNO'
          AND COALESCE(nm.activo, TRUE) = TRUE
          AND COALESCE(
            nm.estado,
            'PENDIENTE'
          ) <> 'RECHAZADO'
          AND nm.valor_total IS NOT NULL

        ORDER BY
          nm.fecha ASC,
          nm.id ASC
      `,
      [
        input.externo_id,
        input.periodo_id,
        input.contrato_id,
        input.empresa_id,
      ],
    );

  return result.rows;
};

const loadCoberturaCuentaDetalles = async (
  cuentaId: string,
  client: PoolClient,
) => {
  const result =
    await client.query<CoberturaCuentaDetalleRow>(
      `
        SELECT
          movimiento_id::text AS movimiento_id,
          turno_id::text AS turno_id,
          titular_referencia,
          municipio,
          fecha::text AS fecha,
          fecha_inicio::text AS fecha_inicio,
          fecha_fin::text AS fecha_fin,
          dias_efectivos,
          valor,
          valor_diario,
          tarifa_config_id::text AS tarifa_config_id,
          modalidad_id::text AS modalidad_id,
          modalidad,
          institucion,
          sede
        FROM cobertura_cuenta_cobro_externa_detalle
        WHERE cuenta_id = $1::bigint
          AND COALESCE(activo, TRUE) = TRUE
        ORDER BY
          fecha ASC,
          movimiento_id ASC NULLS LAST,
          id ASC
      `,
      [cuentaId],
    );

  return result.rows;
};

const compareCoberturaCuentaDetalle = (
  current: CoberturaCuentaDetalleRow[],
  next: CoberturaCuentaTurnSnapshotRow[],
) => {
  if (current.length !== next.length) {
    return false;
  }

  return current.every((row, index) => {
    const target = next[index];

    if (!target) {
      return false;
    }

    return (
      row.movimiento_id ===
        target.movimiento_id &&
      row.turno_id === target.turno_id &&
      normalizeNullableText(row.titular_referencia) ===
        normalizeNullableText(target.titular_referencia) &&
      normalizeNullableText(row.municipio) ===
        normalizeNullableText(target.municipio) &&
      row.fecha === target.fecha &&
      (row.fecha_inicio ?? row.fecha) === target.fecha_inicio &&
      (row.fecha_fin ?? row.fecha) === target.fecha_fin &&
      (row.dias_efectivos ?? 1) === target.dias_efectivos &&
      roundCurrency(
        toNumberValue(row.valor),
      ) ===
        roundCurrency(
          toNumberValue(target.valor),
        ) &&
      row.tarifa_config_id ===
        target.tarifa_config_id &&
      roundCurrency(toNumberValue(row.valor_diario)) ===
        roundCurrency(toNumberValue(target.valor_diario)) &&
      row.modalidad_id ===
        target.modalidad_id &&
      normalizeNullableText(
        row.modalidad,
      ) ===
        normalizeNullableText(
          target.modalidad,
        ) &&
      normalizeNullableText(
        row.institucion,
      ) ===
        normalizeNullableText(
          target.institucion,
        ) &&
      normalizeNullableText(row.sede) ===
        normalizeNullableText(target.sede)
    );
  });
};

const rewriteCoberturaCuentaDetalle = async (
  cuentaId: string,
  turnos: CoberturaCuentaTurnSnapshotRow[],
  client: PoolClient,
) => {
  await client.query(
    `
      DELETE
      FROM cobertura_cuenta_cobro_externa_detalle
      WHERE cuenta_id = $1::bigint
    `,
    [cuentaId],
  );

  for (const turno of turnos) {
    await client.query(
      `
        INSERT INTO cobertura_cuenta_cobro_externa_detalle (
          cuenta_id,
          movimiento_id,
          turno_id,
          titular_referencia,
          municipio,
          fecha,
          fecha_inicio,
          fecha_fin,
          dias_efectivos,
          valor,
          valor_diario,
          tarifa_config_id,
          modalidad_id,
          modalidad,
          institucion,
          sede,
          activo
        )
        VALUES (
          $1::bigint,
          $2::bigint,
          $3::bigint,
          $4,
          $5,
          $6::date,
          $7::date,
          $8::date,
          $9::int,
          $10::numeric,
          $11::numeric,
          $12::bigint,
          $13::bigint,
          $14,
          $15,
          $16,
          TRUE
        )
      `,
      [
        cuentaId,
        turno.movimiento_id,
        turno.turno_id,
        normalizeNullableText(turno.titular_referencia),
        normalizeNullableText(turno.municipio),
        turno.fecha,
        turno.fecha_inicio,
        turno.fecha_fin,
        turno.dias_efectivos,
        toNumberValue(turno.valor),
        toNumberValue(turno.valor_diario),
        turno.tarifa_config_id,
        turno.modalidad_id,
        normalizeNullableText(
          turno.modalidad,
        ),
        normalizeNullableText(
          turno.institucion,
        ),
        normalizeNullableText(
          turno.sede,
        ),
      ],
    );
  }
};

const syncCoberturaCuentaCobroExternaRow =
  async (
    input: GenerarCoberturaCuentaInput,
    actor: string,
    client: PoolClient,
    meta?: AuditRequestMeta,
  ): Promise<CoberturaCuentaSyncResult> => {
    const turnos =
      await loadCoberturaCuentaTurnSnapshots(
        input,
        client,
      );

    const total = roundCurrency(
      turnos.reduce(
        (sum, row) =>
          sum + toNumberValue(row.valor),
        0,
      ),
    );

    const existing =
      await client.query<CuentaRow>(
        `
          SELECT *
          FROM cobertura_cuentas_cobro_externas
          WHERE externo_id = $1::bigint
            AND empresa_id = $2::bigint
            AND contrato_id = $3::bigint
            AND periodo_id = $4::bigint
            AND activo = TRUE
          FOR UPDATE
        `,
        [
          input.externo_id,
          input.empresa_id,
          input.contrato_id,
          input.periodo_id,
        ],
      );

    const current =
      existing.rows[0] ?? null;

    if (turnos.length === 0) {
      if (!current) {
        return {
          cuenta: null,
          turnos,
          actualizada: false,
        };
      }

      await client.query(
        `
          UPDATE cobertura_cuentas_cobro_externas
          SET
            estado = 'PENDIENTE',
            valor_total = 0,
            generado_bucket = NULL,
            generado_path = NULL,
            firmado_bucket = NULL,
            firmado_path = NULL,
            generado_at = NULL,
            firmado_at = NULL,
            updated_by = $2::bigint,
            updated_at = NOW()
          WHERE id = $1::bigint
        `,
        [current.id, actor],
      );

      await client.query(
        `
          DELETE
          FROM cobertura_cuenta_cobro_externa_detalle
          WHERE cuenta_id = $1::bigint
        `,
        [current.id],
      );

      const updated =
        (
          await client.query<CuentaRow>(
            `
              SELECT *
              FROM cobertura_cuentas_cobro_externas
              WHERE id = $1::bigint
              LIMIT 1
            `,
            [current.id],
          )
        ).rows[0] ?? null;

      await registerAuditEntry({
        client,
        usuario_id: actor,
        accion: 'COBERTURA_CUENTA_SYNC',
        tabla:
          'cobertura_cuentas_cobro_externas',
        registro_id: current.id,
        descripcion:
          'Cuenta de cobro externa sincronizada sin turnos vigentes',
        before: current,
        after: {
          ...updated,
          turnos: [],
          total: 0,
        },
        ip: meta?.ip,
        user_agent: meta?.user_agent,
      });

      return {
        cuenta: updated,
        turnos,
        actualizada: true,
      };
    }

    if (!current) {
      const created =
        await client.query<CuentaRow>(
          `
            INSERT INTO cobertura_cuentas_cobro_externas (
              empresa_id,
              contrato_id,
              periodo_id,
              externo_id,
              estado,
              valor_total,
              created_by,
              updated_by
            )
            VALUES (
              $1::bigint,
              $2::bigint,
              $3::bigint,
              $4::bigint,
              'PENDIENTE',
              $5::numeric,
              $6::bigint,
              $6::bigint
            )
            RETURNING *
          `,
          [
            input.empresa_id,
            input.contrato_id,
            input.periodo_id,
            input.externo_id,
            total,
            actor,
          ],
        );

      const cuenta =
        created.rows[0] ?? null;

      if (!cuenta) {
        throw new AppError(
          'No fue posible sincronizar la cuenta de cobro',
          500,
          'COBERTURA_CUENTA_SYNC_FAILED',
        );
      }

      await rewriteCoberturaCuentaDetalle(
        cuenta.id,
        turnos,
        client,
      );

      await registerAuditEntry({
        client,
        usuario_id: actor,
        accion: 'COBERTURA_CUENTA_SYNC',
        tabla:
          'cobertura_cuentas_cobro_externas',
        registro_id: cuenta.id,
        descripcion:
          'Cuenta de cobro externa creada desde turnos externos vigentes',
        before: null,
        after: {
          ...cuenta,
          total,
          turnos: turnos.map(
            (turno) =>
              turno.movimiento_id,
          ),
        },
        ip: meta?.ip,
        user_agent: meta?.user_agent,
      });

      return {
        cuenta,
        turnos,
        actualizada: true,
      };
    }

    const currentDetails =
      await loadCoberturaCuentaDetalles(
        current.id,
        client,
      );

    const requiresReset =
      roundCurrency(
        toNumberValue(
          current.valor_total,
        ),
      ) !== total ||
      !compareCoberturaCuentaDetalle(
        currentDetails,
        turnos,
      );

    if (!requiresReset) {
      return {
        cuenta: current,
        turnos,
        actualizada: false,
      };
    }

    const updated =
      (
        await client.query<CuentaRow>(
          `
            UPDATE cobertura_cuentas_cobro_externas
            SET
              estado = 'PENDIENTE',
              valor_total = $2::numeric,
              generado_bucket = NULL,
              generado_path = NULL,
              firmado_bucket = NULL,
              firmado_path = NULL,
              generado_at = NULL,
              firmado_at = NULL,
              updated_by = $3::bigint,
              updated_at = NOW()
            WHERE id = $1::bigint
            RETURNING *
          `,
          [
            current.id,
            total,
            actor,
          ],
        )
      ).rows[0] ?? null;

    if (!updated) {
      throw new AppError(
        'No fue posible actualizar la cuenta de cobro',
        500,
        'COBERTURA_CUENTA_SYNC_FAILED',
      );
    }

    await rewriteCoberturaCuentaDetalle(
      updated.id,
      turnos,
      client,
    );

    await registerAuditEntry({
      client,
      usuario_id: actor,
      accion: 'COBERTURA_CUENTA_SYNC',
      tabla:
        'cobertura_cuentas_cobro_externas',
      registro_id: updated.id,
      descripcion:
        'Cuenta de cobro externa resincronizada desde turnos externos vigentes',
      before: current,
      after: {
        ...updated,
        total,
        turnos: turnos.map(
          (turno) =>
            turno.movimiento_id,
        ),
      },
      ip: meta?.ip,
      user_agent: meta?.user_agent,
    });

    return {
      cuenta: updated,
      turnos,
      actualizada: true,
    };
  };

type CuentaCobroPdfInput = {
  cuenta: CuentaRow;
  empresa: {
    nombre: string;
    nit: string | null;
    logo_url: string | null;
    contrato: string | null;
  };
  externo: {
    nombre: string;
    tipo_documento: string;
    numero_documento: string;
    banco: string | null;
    tipo_cuenta: string | null;
    numero_cuenta: string | null;
  };
  periodo: {
    nombre: string;
    fecha_inicio: string;
    fecha_fin: string;
  };
  fecha_generacion: string;
  total: number;
  turnos: CoberturaCuentaTurnSnapshotRow[];
};

const numberWordsUnderThousand = (value: number): string => {
  const units = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
  const teens = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
  const tens = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const hundreds = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
  if (value === 0) return '';
  if (value === 100) return 'CIEN';
  if (value < 10) return units[value] ?? '';
  if (value < 20) return teens[value - 10] ?? '';
  if (value < 30) {
    if (value === 20) return 'VEINTE';
    const veinte = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
    return `VEINTI${veinte[value - 20] ?? ''}`;
  }
  if (value < 100) return (tens[Math.floor(value / 10)] ?? '') + (value % 10 ? ` Y ${units[value % 10] ?? ''}` : '');
  return `${hundreds[Math.floor(value / 100)] ?? ''}${value % 100 ? ` ${numberWordsUnderThousand(value % 100)}` : ''}`;
};

export const numberToSpanishWords = (input: number) => {
  const value = Math.max(0, Math.round(input));
  if (value === 0) return 'CERO';
  const millions = Math.floor(value / 1_000_000);
  const thousands = Math.floor((value % 1_000_000) / 1_000);
  const remainder = value % 1_000;
  const parts: string[] = [];
  if (millions) parts.push(millions === 1 ? 'UN MILLON' : `${numberWordsUnderThousand(millions)} MILLONES`);
  if (thousands) parts.push(thousands === 1 ? 'MIL' : `${numberWordsUnderThousand(thousands)} MIL`);
  if (remainder) parts.push(numberWordsUnderThousand(remainder));
  return parts.join(' ');
};

const formatPdfDate = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
};

const safeFilePart = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toUpperCase();

const loadCompanyLogo = async (logoUrl: string | null) => {
  if (!logoUrl) return null;
  try {
    const response = await fetch(logoUrl);
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
};

const buildCoberturaCuentaPdf = async (input: CuentaCobroPdfInput) => {
  const doc = new PDFDocument({ size: 'LETTER', layout: 'portrait', margin: 36, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const navy = '#0A1628';
  const cyan = '#00AFC0';
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const logo = await loadCompanyLogo(input.empresa.logo_url);
  let y = 36;
  if (logo) {
    try { doc.image(logo, 36, y, { fit: [88, 46] }); } catch { /* fallback textual */ }
  }
  doc.fillColor(navy).fontSize(15).font('Helvetica-Bold').text(input.empresa.nombre, logo ? 136 : 36, y + 3, { width: pageWidth - (logo ? 100 : 0) });
  doc.font('Helvetica').fontSize(8).fillColor('#475569').text(`NIT: ${input.empresa.nit ?? 'No registrado'}`, logo ? 136 : 36, y + 23);
  doc.font('Helvetica-Bold').fontSize(16).fillColor(navy).text('CUENTA DE COBRO', 36, y + 58, { align: 'right', width: pageWidth });
  doc.font('Helvetica').fontSize(8).fillColor('#475569').text(`Cuenta ${input.cuenta.numero_cuenta} · Generada ${formatPdfDate(input.fecha_generacion)}`, 36, y + 78, { align: 'right', width: pageWidth });
  y += 106;
  doc.strokeColor(cyan).lineWidth(1.2).moveTo(36, y).lineTo(36 + pageWidth, y).stroke();
  y += 14;
  doc.fillColor(navy).fontSize(9).font('Helvetica-Bold').text('DATOS DEL CLIENTE / EMPRESA', 36, y);
  y += 14;
  doc.font('Helvetica').fontSize(8).fillColor('#1f2937').text(`Razón social: ${input.empresa.nombre}`, 36, y);
  doc.text(`NIT: ${input.empresa.nit ?? 'No registrado'}`, 36, y + 12);
  if (input.empresa.contrato) doc.text(`Contrato / proyecto: ${input.empresa.contrato}`, 36, y + 24, { width: pageWidth });
  y += input.empresa.contrato ? 52 : 38;
  doc.fillColor(navy).fontSize(9).font('Helvetica-Bold').text('DATOS DEL COBRADOR', 36, y);
  y += 14;
  doc.font('Helvetica').fontSize(8).fillColor('#1f2937').text(`Nombre completo: ${input.externo.nombre}`, 36, y);
  doc.text(`Documento: ${input.externo.tipo_documento} ${input.externo.numero_documento}`, 36, y + 12);
  doc.text(`Banco: ${input.externo.banco ?? 'No registrado'}`, 300, y);
  doc.text(`Tipo de cuenta: ${input.externo.tipo_cuenta ?? 'No registrado'}`, 300, y + 12);
  doc.text(`Número de cuenta: ${input.externo.numero_cuenta ?? 'No registrado'}`, 300, y + 24);
  y += 48;
  doc.fillColor(navy).font('Helvetica-Bold').text(input.periodo.nombre.toUpperCase(), 36, y);
  doc.font('Helvetica').text(`${formatPdfDate(input.periodo.fecha_inicio)} - ${formatPdfDate(input.periodo.fecha_fin)}`, 36, y + 13);
  y += 30;
  doc.fillColor(navy).fontSize(9).font('Helvetica-Bold').text('CONCEPTO DEL COBRO', 36, y);
  y += 14;
  doc.fillColor('#1f2937').fontSize(8).font('Helvetica').text(`Por medio de la presente solicito el pago correspondiente a los turnos externos realizados durante el período ${input.periodo.nombre.toUpperCase()}, relacionados a continuación.`, 36, y, { width: pageWidth });
  y += 32;

  const columns = [
    ['#', 20], ['Fecha', 47], ['Titular / referencia', 92], ['Municipio', 57], ['Institución', 70], ['Sede', 57], ['Modalidad', 58], ['Días', 25], ['Valor día', 50], ['Total', 54],
  ] as const;
  const drawTableHeader = () => {
    let x = 36;
    doc.rect(36, y, pageWidth, 22).fill('#E8F7F9');
    doc.fillColor(navy).font('Helvetica-Bold').fontSize(7.2);
    for (const [label, width] of columns) { doc.text(label, x + 3, y + 7, { width: width - 6, align: label === '#' || label === 'Días' ? 'center' : 'left' }); x += width; }
    y += 22;
  };
  const drawRow = (values: string[], index: number) => {
    doc.fontSize(7.2);
    const lines = values.map((value, i) => doc.heightOfString(value || '—', { width: (columns[i]?.[1] ?? 40) - 6, lineGap: 1 }));
    const height = Math.max(28, ...lines.map((line) => line + 12));
    if (y + height > doc.page.height - 108) { doc.addPage(); y = 36; drawTableHeader(); }
    if (index % 2 === 1) doc.rect(36, y, pageWidth, height).fill('#F8FAFC');
    let x = 36;
    doc.fillColor('#1f2937').font('Helvetica').fontSize(7.2);
    values.forEach((value, i) => { const width = columns[i]?.[1] ?? 40; doc.text(value || '—', x + 3, y + 5, { width: width - 6, height: height - 8, align: i === 0 || i === 7 ? 'center' : 'left' }); x += width; });
    doc.strokeColor('#CBD5E1').lineWidth(0.35).moveTo(36, y + height).lineTo(36 + pageWidth, y + height).stroke();
    y += height;
  };
  drawTableHeader();
  input.turnos.forEach((turno, index) => drawRow([
    String(index + 1),
    formatPdfDate(turno.fecha),
    turno.titular_referencia ?? 'Referencia no disponible',
    turno.municipio ?? '—',
    turno.institucion ?? '—',
    turno.sede ?? '—',
    turno.modalidad ?? '—',
    String(turno.dias_efectivos),
    `$${toNumberValue(turno.valor_diario).toLocaleString('es-CO')}`,
    `$${toNumberValue(turno.valor).toLocaleString('es-CO')}`,
  ], index));
  y += 16;
  if (y > doc.page.height - 230) {
    doc.addPage();
    y = 48;
  }
  doc.fillColor(navy).font('Helvetica-Bold').fontSize(10).text(`TOTAL A COBRAR: $${input.total.toLocaleString('es-CO')}`, 36, y, { align: 'right', width: pageWidth });
  doc.font('Helvetica').fontSize(8).text(`${numberToSpanishWords(input.total)} PESOS M/CTE.`, 36, y + 16, { align: 'right', width: pageWidth });
  y += 58;
  doc.fillColor(navy).fontSize(9).font('Helvetica-Bold').text('DECLARACIÓN Y CERTIFICACIÓN', 36, y);
  y += 14;
  doc.fillColor('#1f2937').font('Helvetica').fontSize(8).text('Declaro que la información relacionada en esta cuenta de cobro corresponde a los servicios efectivamente realizados durante el período indicado, y que los valores aquí registrados son verídicos.', 36, y, { width: pageWidth });
  y += 42;
  doc.fillColor('#1f2937').fontSize(8).font('Helvetica').text('Firma del cobrador:', 36, y);
  doc.moveTo(36, y + 42).lineTo(230, y + 42).strokeColor('#64748B').stroke();
  doc.text(input.externo.nombre, 36, y + 48);
  doc.text(`${input.externo.tipo_documento} ${input.externo.numero_documento}`, 36, y + 60);
  doc.fontSize(7).fillColor('#64748B').text('Documento generado por Empiria', 36, doc.page.height - 54, { align: 'center', width: pageWidth });
  doc.end();
  return done;
};

export const syncCoberturaCuentaCobroExterna =
  async (
    input: GenerarCoberturaCuentaInput,
    actor: string,
    tenant?: TenantAccessContext,
    meta?: AuditRequestMeta,
    clientOverride?: PoolClient,
  ) => {
    const ownsClient =
      !clientOverride;

    const client =
      clientOverride ??
      (await dbPool.connect());

    try {
      if (ownsClient) {
        await client.query('BEGIN');
      }

      await loadCoberturaPeriodoScopeOrThrow(
        input.periodo_id,
        tenant,
        client,
      );

      const synced =
        await syncCoberturaCuentaCobroExternaRow(
          input,
          actor,
          client,
          meta,
        );

      if (ownsClient) {
        await client.query('COMMIT');
      }

      return synced;
    } catch (error) {
      if (ownsClient) {
        await client.query(
          'ROLLBACK',
        );
      }

      throw error;
    } finally {
      if (ownsClient) {
        client.release();
      }
    }
  };

export const syncCoberturaCuentasCobroExternasPeriodo =
  async (
    periodoId: number,
    actor: string,
    tenant?: TenantAccessContext,
    meta?: AuditRequestMeta,
    clientOverride?: PoolClient,
  ) => {
    const ownsClient =
      !clientOverride;

    const client =
      clientOverride ??
      (await dbPool.connect());

    try {
      if (ownsClient) {
        await client.query('BEGIN');
      }

      const periodo =
        await loadCoberturaPeriodoScopeOrThrow(
          periodoId,
          tenant,
          client,
        );

      const externos =
        await client.query<{
          externo_id: string;
        }>(
          `
            SELECT DISTINCT
              externo_id::text AS externo_id
            FROM (
              SELECT
                nm.externo_id
              FROM nomina_movimientos nm
              WHERE nm.periodo_id = $1::bigint
                AND nm.tipo_movimiento = 'TURNO_EXTERNO'
                AND nm.externo_id IS NOT NULL

              UNION

              SELECT
                ccce.externo_id
              FROM cobertura_cuentas_cobro_externas ccce
              WHERE ccce.periodo_id = $1::bigint
                AND ccce.empresa_id = $2::bigint
                AND ccce.contrato_id = $3::bigint
                AND ccce.activo = TRUE
            ) externos
          `,
          [
            periodoId,
            periodo.empresa_id,
            periodo.contrato_id,
          ],
        );

      for (
        const row of externos.rows
      ) {
        await syncCoberturaCuentaCobroExternaRow(
          {
            empresa_id: Number(
              periodo.empresa_id,
            ),
            contrato_id: Number(
              periodo.contrato_id,
            ),
            periodo_id: Number(
              periodo.periodo_id,
            ),
            externo_id: Number(
              row.externo_id,
            ),
          },
          actor,
          client,
          meta,
        );
      }

      if (ownsClient) {
        await client.query('COMMIT');
      }

      return {
        periodo_id:
          periodo.periodo_id,
        externos_procesados:
          externos.rows.length,
      };
    } catch (error) {
      if (ownsClient) {
        await client.query(
          'ROLLBACK',
        );
      }

      throw error;
    } finally {
      if (ownsClient) {
        client.release();
      }
    }
  };

export const upsertCoberturaExterno =
  async (
    input: UpsertCoberturaExternoInput,
    actor: string,
    tenant?: TenantAccessContext,
    meta?: AuditRequestMeta,
  ) => {
    assertTenantCompany(
      tenant,
      input.empresa_id,
    );

    const result =
      await dbQuery<ExternoRow>(
        `
          INSERT INTO cobertura_externos (
            empresa_id,
            tipo_documento,
            numero_documento,
            nombre_completo,
            banco,
            tipo_cuenta,
            numero_cuenta
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7
          )
          ON CONFLICT (
            empresa_id,
            tipo_documento,
            numero_documento
          )
          WHERE activo = TRUE
          DO UPDATE
          SET
            nombre_completo = EXCLUDED.nombre_completo,
            banco = EXCLUDED.banco,
            tipo_cuenta = EXCLUDED.tipo_cuenta,
            numero_cuenta = EXCLUDED.numero_cuenta,
            updated_at = NOW()
          RETURNING
            id::text,
            empresa_id::text,
            tipo_documento,
            numero_documento,
            nombre_completo,
            banco,
            tipo_cuenta,
            numero_cuenta,
            0::int AS turnos,
            0::numeric AS valor_total,
            FALSE AS cedula,
            FALSE AS banco_doc
        `,
        [
          input.empresa_id,
          input.tipo_documento,
          input.numero_documento,
          input.nombre_completo,
          input.banco ?? null,
          input.tipo_cuenta ?? null,
          input.numero_cuenta ??
            null,
        ],
      );

    const row =
      result.rows[0];

    if (!row) {
      throw new AppError(
        'No fue posible guardar el externo',
        500,
        'COBERTURA_EXTERNO_SAVE_FAILED',
      );
    }

    await registerAuditEntry({
      usuario_id: actor,
      accion:
        'COBERTURA_EXTERNO_UPSERT',
      tabla: 'cobertura_externos',
      registro_id: row.id,
      descripcion:
        'Creacion o actualizacion de identidad externa de cobertura',
      after: row,
      ip: meta?.ip,
      user_agent: meta?.user_agent,
    });

    return row;
  };

const filterCoberturaExternosByScope = async (
  rows: ExternoRow[],
  query: ListCoberturaExternosQuery,
  tenant?: TenantAccessContext,
) => {
  if (!tenant || tenant.isGlobalAdmin) {
    return rows;
  }

  const allowed = new Set<string>();
  for (const source of ['movimiento', 'novedad'] as const) {
    const params: unknown[] = [];
    const conditions: string[] = [
      source === 'movimiento'
        ? 'nm.externo_id IS NOT NULL'
        : 'nnt.externo_id IS NOT NULL',
      source === 'movimiento'
        ? 'COALESCE(nm.activo, TRUE) = TRUE'
        : 'COALESCE(nnt.activo, TRUE) = TRUE',
    ];
    if (query.periodo_id) {
      params.push(query.periodo_id);
      conditions.push(`${source === 'movimiento' ? 'nm' : 'nnt'}.periodo_id = $${params.length}::bigint`);
    }
    appendNominaCoberturaScope(conditions, params, tenant);
    const result = await dbQuery<{ externo_id: string }>(
      source === 'movimiento'
        ? `
          SELECT DISTINCT nm.externo_id::text AS externo_id
          FROM nomina_movimientos nm
          INNER JOIN nomina_periodos np ON np.id = nm.periodo_id
          INNER JOIN vinculaciones v ON v.id = nm.vinculacion_id
          INNER JOIN contratos c ON c.id = np.contrato_id
          WHERE ${conditions.join(' AND ')}
        `
        : `
          SELECT DISTINCT nnt.externo_id::text AS externo_id
          FROM nomina_novedad_turnos nnt
          INNER JOIN nomina_empleados ne ON ne.id = nnt.nomina_empleado_id
          INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id
          INNER JOIN nomina_periodos np ON np.id = nnt.periodo_id
          INNER JOIN contratos c ON c.id = np.contrato_id
          WHERE ${conditions.join(' AND ')}
        `,
      params,
    );
    result.rows.forEach((row) => allowed.add(row.externo_id));
  }

  return rows.filter((row) => allowed.has(String(row.id)));
};

export const listCoberturaExternos =
  async (
    query: ListCoberturaExternosQuery,
    tenant?: TenantAccessContext,
  ) => {
    const params: unknown[] = [];
    const where: string[] = [
      'ce.activo = TRUE',
    ];

    let periodoParamIndex:
      | number
      | null = null;

    let contratoParamIndex:
      | number
      | null = null;

    if (query.empresa_id) {
      assertTenantCompany(
        tenant,
        query.empresa_id,
      );

      params.push(
        query.empresa_id,
      );

      where.push(
        `ce.empresa_id = $${params.length}`,
      );
    }

    if (query.periodo_id) {
      params.push(
        query.periodo_id,
      );

      periodoParamIndex =
        params.length;

      where.push(
        `(nnt.periodo_id = $${periodoParamIndex} OR nm.periodo_id = $${periodoParamIndex})`,
      );
    }

    if (query.contrato_id) {
      assertTenantContract(
        tenant,
        query.contrato_id,
      );

      params.push(
        query.contrato_id,
      );

      contratoParamIndex =
        params.length;

      where.push(
        `(np.contrato_id = $${contratoParamIndex} OR nmp.contrato_id = $${contratoParamIndex})`,
      );
    }

    if (
      tenant &&
      !tenant.isGlobalAdmin &&
      tenant.empresaIds.length > 0
    ) {
      params.push(
        tenant.empresaIds,
      );

      where.push(
        `ce.empresa_id = ANY($${params.length}::bigint[])`,
      );
    }

    const result =
      await dbQuery<ExternoRow>(
        `
          SELECT
            ce.id::text,
            ce.empresa_id::text,
            ce.tipo_documento,
            ce.numero_documento,
            ce.nombre_completo,
            ce.banco,
            ce.tipo_cuenta,
            ce.numero_cuenta,

            COUNT(DISTINCT nm.id) FILTER (
              WHERE nm.tipo_movimiento = 'TURNO_EXTERNO'
                AND COALESCE(nm.activo, TRUE) = TRUE
                AND COALESCE(nm.estado, 'PENDIENTE') <> 'RECHAZADO'
            )::int AS turnos,

            COUNT(DISTINCT nm.id) FILTER (
              WHERE nm.tipo_movimiento = 'TURNO_EXTERNO'
                AND COALESCE(nm.estado, 'PENDIENTE') <> 'RECHAZADO'
                AND nm.tarifa_config_id IS NOT NULL
                AND nm.valor_unitario IS NOT NULL
                AND nm.valor_unitario > 0
            )::int AS turnos_con_tarifa,

            COUNT(DISTINCT nm.id) FILTER (
              WHERE nm.tipo_movimiento = 'TURNO_EXTERNO'
                AND COALESCE(nm.estado, 'PENDIENTE') <> 'RECHAZADO'
                AND (nm.tarifa_config_id IS NULL OR nm.valor_unitario IS NULL OR nm.valor_unitario <= 0)
            )::int AS turnos_sin_tarifa,

            COUNT(DISTINCT nm.id) FILTER (
              WHERE nm.tipo_movimiento = 'TURNO_EXTERNO'
                AND COALESCE(nm.estado, 'PENDIENTE') <> 'RECHAZADO'
            )::int AS dias_turnos,

            COUNT(DISTINCT nm.id) FILTER (
              WHERE nm.tipo_movimiento = 'TURNO_EXTERNO'
                AND COALESCE(nm.estado, 'PENDIENTE') <> 'RECHAZADO'
                AND nm.tarifa_config_id IS NOT NULL
                AND nm.valor_unitario IS NOT NULL
                AND nm.valor_unitario > 0
            )::int AS dias_listos,

            COALESCE(
              (
                SELECT
                  SUM(nm2.valor_total)
                FROM nomina_movimientos nm2
                INNER JOIN nomina_periodos np2
                  ON np2.id = nm2.periodo_id
                WHERE nm2.externo_id = ce.id
                  AND nm2.activo = TRUE
                  AND COALESCE(
                    nm2.estado,
                    'PENDIENTE'
                  ) <> 'RECHAZADO'
                  ${
                    periodoParamIndex
                      ? `AND nm2.periodo_id = $${periodoParamIndex}`
                      : ''
                  }
                  ${
                    contratoParamIndex
                      ? `AND np2.contrato_id = $${contratoParamIndex}`
                      : ''
                  }
              ),
              0
            ) AS valor_total,

            COALESCE(SUM(nm.valor_total) FILTER (
              WHERE nm.tipo_movimiento = 'TURNO_EXTERNO'
                AND COALESCE(nm.estado, 'PENDIENTE') <> 'RECHAZADO'
                AND nm.tarifa_config_id IS NOT NULL
                AND nm.valor_unitario IS NOT NULL
                AND nm.valor_unitario > 0
            ), 0) AS valor_listo,

            EXISTS (
              SELECT 1
              FROM cobertura_externo_documentos d
              WHERE d.externo_id = ce.id
                AND d.tipo_documento =
                  'CEDULA_EXTERNO_COBERTURA'
                AND d.activo = TRUE
                AND d.es_vigente = TRUE
            ) AS cedula,

            EXISTS (
              SELECT 1
              FROM cobertura_externo_documentos d
              WHERE d.externo_id = ce.id
                AND d.tipo_documento =
                  'CERTIFICACION_BANCARIA_EXTERNO_COBERTURA'
                AND d.activo = TRUE
                AND d.es_vigente = TRUE
            ) AS banco_doc,

            (
              SELECT
                c.id::text
              FROM cobertura_cuentas_cobro_externas c
              WHERE c.externo_id = ce.id
                AND c.activo = TRUE
                ${
                  periodoParamIndex
                    ? `AND c.periodo_id = $${periodoParamIndex}`
                    : ''
                }
              ORDER BY c.id DESC
              LIMIT 1
            ) AS cuenta_id,

            COALESCE(
              (
                SELECT
                  c.estado
                FROM cobertura_cuentas_cobro_externas c
                WHERE c.externo_id = ce.id
                  AND c.activo = TRUE
                  ${
                    periodoParamIndex
                      ? `AND c.periodo_id = $${periodoParamIndex}`
                      : ''
                  }
                ORDER BY c.id DESC
                LIMIT 1
              ),
              'PENDIENTE'
            ) AS cuenta_estado

          FROM cobertura_externos ce

          LEFT JOIN nomina_novedad_turnos nnt
            ON nnt.externo_id = ce.id
           AND nnt.activo = TRUE
           ${periodoParamIndex ? `AND nnt.periodo_id = $${periodoParamIndex}` : ''}

          LEFT JOIN nomina_movimientos nm
            ON nm.externo_id = ce.id
           AND nm.activo = TRUE
           AND nm.tipo_movimiento = 'TURNO_EXTERNO'
           ${periodoParamIndex ? `AND nm.periodo_id = $${periodoParamIndex}` : ''}

          LEFT JOIN nomina_periodos np
            ON np.id = nnt.periodo_id

          LEFT JOIN nomina_periodos nmp
            ON nmp.id = nm.periodo_id

          WHERE ${where.join(
            ' AND ',
          )}

          GROUP BY ce.id

          ORDER BY ce.nombre_completo
        `,
        params,
      );

    return filterCoberturaExternosByScope(result.rows, query, tenant);
  };

export const listCoberturaExternosOperativos =
  async (
    query: ListCoberturaExternosQuery,
    tenant?: TenantAccessContext,
  ) => {
    const rows =
      await listCoberturaExternos(
        query,
        tenant,
      );

    let scopedRows = rows;

    if (
      tenant &&
      !tenant.isGlobalAdmin
    ) {
      const params: unknown[] = [];

      const conditions: string[] = [
        'nnt.externo_id IS NOT NULL',
      ];

      if (query.periodo_id) {
        params.push(
          query.periodo_id,
        );

        conditions.push(
          `nnt.periodo_id = $${params.length}::bigint`,
        );
      }

      appendNominaCoberturaScope(
        conditions,
        params,
        tenant,
      );

      const allowed =
        await dbQuery<{
          externo_id: string;
        }>(
          `
            SELECT DISTINCT
              nnt.externo_id::text AS externo_id
            FROM nomina_novedad_turnos nnt
            INNER JOIN nomina_empleados ne
              ON ne.id = nnt.nomina_empleado_id
            INNER JOIN vinculaciones v
              ON v.id = ne.vinculacion_id
            INNER JOIN nomina_periodos np
              ON np.id = nnt.periodo_id
            WHERE ${conditions.join(
              ' AND ',
            )}
          `,
          params,
        );

      const allowedIds =
        new Set(
          allowed.rows.map(
            (row) =>
              row.externo_id,
          ),
        );

      scopedRows =
        rows.filter((row) =>
          allowedIds.has(row.id),
        );
    }

    return scopedRows.map(
      ({
        banco: _banco,
        tipo_cuenta:
          _tipoCuenta,
        numero_cuenta:
          _numeroCuenta,
        valor_total:
          _valorTotal,
        cuenta_id:
          _cuentaId,
        cuenta_estado:
          _cuentaEstado,
        cedula: _cedula,
        banco_doc:
          _bancoDoc,
        ...operational
      }) => operational,
    );
  };

export const generateCoberturaCuenta =
  async (
    input: GenerarCoberturaCuentaInput,
    actor: string,
    tenant?: TenantAccessContext,
    meta?: AuditRequestMeta,
  ) => {
    assertTenantCompany(
      tenant,
      input.empresa_id,
    );

    assertTenantContract(
      tenant,
      input.contrato_id,
    );

    const client =
      await dbPool.connect();

    try {
      await client.query('BEGIN');

      await assertNominaExternoCoberturaScope(
        input.externo_id,
        input.periodo_id,
        tenant,
        client,
      );

      const signedAccount = await client.query<{ id: string }>(
        `
          SELECT id::text
          FROM cobertura_cuentas_cobro_externas
          WHERE externo_id = $1::bigint
            AND empresa_id = $2::bigint
            AND contrato_id = $3::bigint
            AND periodo_id = $4::bigint
            AND activo = TRUE
            AND estado = 'FIRMADA'
          LIMIT 1
        `,
        [input.externo_id, input.empresa_id, input.contrato_id, input.periodo_id],
      );
      if (signedAccount.rows[0]) {
        throw new AppError(
          'La cuenta firmada no puede sobrescribirse automáticamente; cree una nueva versión mediante el flujo autorizado.',
          409,
          'COBERTURA_CUENTA_FIRMADA_REGENERACION_INVALIDA',
        );
      }

      const synced =
        await syncCoberturaCuentaCobroExterna(
          input,
          actor,
          tenant,
          meta,
          client,
        );

      const requiredDocuments =
        await client.query<{
          tipo_documento: string;
        }>(
          `
            SELECT
              tipo_documento
            FROM cobertura_externo_documentos
            WHERE externo_id = $1::bigint
              AND activo = TRUE
              AND es_vigente = TRUE
              AND tipo_documento IN (
                'CEDULA_EXTERNO_COBERTURA',
                'CERTIFICACION_BANCARIA_EXTERNO_COBERTURA'
              )
            GROUP BY tipo_documento
          `,
          [input.externo_id],
        );

      const documentTypes =
        new Set(
          requiredDocuments.rows.map(
            (row) =>
              row.tipo_documento,
          ),
        );

      const missingDocuments = [
        'CEDULA_EXTERNO_COBERTURA',
        'CERTIFICACION_BANCARIA_EXTERNO_COBERTURA',
      ].filter(
        (type) =>
          !documentTypes.has(type),
      );

      if (!synced.cuenta || synced.turnos.length === 0) {
        const pendingTariff = await client.query<{ movimiento_id: string }>(
          `
            SELECT id::text AS movimiento_id
            FROM nomina_movimientos
            WHERE externo_id = $1::bigint
              AND periodo_id = $2::bigint
              AND tipo_movimiento = 'TURNO_EXTERNO'
              AND COALESCE(activo, TRUE) = TRUE
              AND COALESCE(estado, 'PENDIENTE') <> 'RECHAZADO'
              AND (tarifa_config_id IS NULL OR valor_unitario IS NULL OR valor_unitario <= 0)
            ORDER BY id
          `,
          [input.externo_id, input.periodo_id]
        );
        if (pendingTariff.rows.length > 0) {
          throw new AppError(
            `No hay turnos listos para cuenta; ${pendingTariff.rows.length} turno(s) tienen tarifa pendiente`,
            409,
            'COBERTURA_CUENTA_TURNOS_SIN_TARIFA',
            { movimiento_ids: pendingTariff.rows.map((row) => row.movimiento_id) }
          );
        }
        throw new AppError(
          'No hay turnos externos activos para consolidar',
          409,
          'COBERTURA_CUENTA_SIN_TURNOS',
        );
      }


      const total =
        roundCurrency(
          synced.turnos.reduce(
            (sum, row) =>
              sum +
              toNumberValue(
                row.valor,
              ),
            0,
          ),
        );

      const external =
        await client.query<{
          nombre_completo: string;
          tipo_documento: string;
          numero_documento: string;
          banco: string | null;
          tipo_cuenta: string | null;
          numero_cuenta: string | null;
        }>(
          `
            SELECT
              nombre_completo,
              tipo_documento,
              numero_documento,
              banco,
              tipo_cuenta,
              numero_cuenta
            FROM cobertura_externos
            WHERE id = $1::bigint
            LIMIT 1
          `,
          [input.externo_id],
        );

      const periodAndCompany = await client.query<{
        nombre_periodo: string;
        fecha_inicio: string;
        fecha_fin: string;
        nombre_empresa: string;
        nit: string | null;
        logo_url: string | null;
        numero_contrato: string | null;
      }>(
        `
          SELECT
            np.nombre_periodo,
            np.fecha_inicio::text,
            np.fecha_fin::text,
            e.nombre_empresa,
            e.nit,
            ec.logo_url
            ,c.numero_contrato
          FROM nomina_periodos np
          INNER JOIN contratos c ON c.id = np.contrato_id
          INNER JOIN empresas e ON e.id = c.empresa_id
          LEFT JOIN empresa_configuracion_general ec ON ec.empresa_id = e.id
          WHERE np.id = $1::bigint
            AND np.contrato_id = $2::bigint
            AND c.empresa_id = $3::bigint
          LIMIT 1
        `,
        [input.periodo_id, input.contrato_id, input.empresa_id],
      );
      const periodCompany = periodAndCompany.rows[0];
      const externalRow = external.rows[0];
      if (!externalRow || !periodCompany) {
        throw new AppError('No fue posible resolver la identidad del cobrador o del período.', 404, 'COBERTURA_CUENTA_DATOS_INCOMPLETOS');
      }

      const pdf =
        await buildCoberturaCuentaPdf({
          cuenta: synced.cuenta,
          empresa: {
            nombre: periodCompany.nombre_empresa,
            nit: periodCompany.nit,
            logo_url: periodCompany.logo_url,
            contrato: periodCompany.numero_contrato,
          },
          externo: {
            nombre: externalRow.nombre_completo,
            tipo_documento: externalRow.tipo_documento,
            numero_documento: externalRow.numero_documento,
            banco: externalRow.banco,
            tipo_cuenta: externalRow.tipo_cuenta,
            numero_cuenta: externalRow.numero_cuenta,
          },
          periodo: {
            nombre: periodCompany.nombre_periodo,
            fecha_inicio: periodCompany.fecha_inicio,
            fecha_fin: periodCompany.fecha_fin,
          },
          fecha_generacion: new Date().toISOString(),
          total,
          turnos: synced.turnos,
        });

      const stored =
        await upload(
          `cobertura/cuentas-cobro/${synced.cuenta.id}/CUENTA_COBRO_${safeFilePart(externalRow.nombre_completo)}_${safeFilePart(periodCompany.nombre_periodo)}-${Date.now()}.pdf`,
          pdf,
          'application/pdf',
        );

      const account =
        await client.query<CuentaRow>(
          `
            UPDATE cobertura_cuentas_cobro_externas
            SET
              estado = $6,
              valor_total = $2::numeric,
              generado_bucket = $3,
              generado_path = $4,
              generado_at = NOW(),
              updated_by = $5::bigint,
              updated_at = NOW()
            WHERE id = $1::bigint
            RETURNING *
          `,
          [
            synced.cuenta.id,
            total,
            stored.bucket,
            stored.path,
            actor,
            missingDocuments.length > 0 ? 'PENDIENTE' : 'GENERADA',
          ],
        );

      const row =
        account.rows[0];

      if (!row) {
        throw new AppError(
          'No fue posible crear la cuenta',
          500,
          'COBERTURA_CUENTA_CREATE_FAILED',
        );
      }

      await registerAuditEntry({
        client,
        usuario_id: actor,
        accion:
          'COBERTURA_CUENTA_GENERATE',
        tabla:
          'cobertura_cuentas_cobro_externas',
        registro_id: row.id,
        descripcion:
          'Generacion de cuenta de cobro de turnos externos',
        after: {
          turnos:
            synced.turnos.map(
              (turno) =>
                turno.movimiento_id,
            ),
          total,
        },
        ip: meta?.ip,
        user_agent:
          meta?.user_agent,
      });

      await client.query(
        'COMMIT',
      );

      return {
        ...row,
        valor_total: total,
        generated_bucket:
          stored.bucket,
        generated_path:
          stored.path,
        turnos: synced.turnos,
      };
    } catch (error) {
      await client.query(
        'ROLLBACK',
      );

      throw error;
    } finally {
      client.release();
    }
  };

export const uploadCoberturaExternoDocumento =
  async (
    externoId: number,
    tipo:
      | 'CEDULA_EXTERNO_COBERTURA'
      | 'CERTIFICACION_BANCARIA_EXTERNO_COBERTURA',
    file: {
      buffer: Buffer;
      mimetype: string;
      originalname: string;
      size: number;
    },
    actor: string,
    tenant?: TenantAccessContext,
    meta?: AuditRequestMeta,
  ) => {
    const allowedMimeTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
    ];

    if (
      !allowedMimeTypes.includes(
        file.mimetype,
      )
    ) {
      throw new AppError(
        'El documento debe ser PDF o imagen',
        400,
        'COBERTURA_EXTERNO_DOCUMENT_MIME_INVALID',
      );
    }

    const externo =
      await dbQuery<{
        id: string;
        empresa_id: string;
      }>(
        `
          SELECT
            id::text,
            empresa_id::text
          FROM cobertura_externos
          WHERE id = $1::bigint
            AND activo = TRUE
          LIMIT 1
        `,
        [externoId],
      );

    const row =
      externo.rows[0];

    if (!row) {
      throw new AppError(
        'Identidad externa no encontrada',
        404,
        'COBERTURA_EXTERNO_NOT_FOUND',
      );
    }

    assertTenantCompany(
      tenant,
      Number(row.empresa_id),
    );

    await assertNominaExternoCoberturaScope(
      externoId,
      undefined,
      tenant,
    );

    const current =
      await dbQuery<{
        id: string;
        version: number;
      }>(
        `
          SELECT
            id::text,
            version
          FROM cobertura_externo_documentos
          WHERE externo_id = $1::bigint
            AND tipo_documento = $2
            AND activo = TRUE
            AND es_vigente = TRUE
          ORDER BY version DESC
          LIMIT 1
        `,
        [externoId, tipo],
      );

    const version =
      Number(
        current.rows[0]
          ?.version ?? 0,
      ) + 1;

    const safeFileName =
      file.originalname.replace(
        /[^a-zA-Z0-9._-]+/g,
        '-',
      );

    const path =
      `cobertura/externos/${externoId}/${tipo}/` +
      `${Date.now()}-${safeFileName}`;

    const stored =
      await upload(
        path,
        file.buffer,
        file.mimetype,
      );

    await dbQuery(
      `
        UPDATE cobertura_externo_documentos
        SET es_vigente = FALSE
        WHERE externo_id = $1::bigint
          AND tipo_documento = $2
          AND es_vigente = TRUE
      `,
      [externoId, tipo],
    );

    const saved =
      await dbQuery(
        `
          INSERT INTO cobertura_externo_documentos (
            externo_id,
            tipo_documento,
            storage_bucket,
            storage_path,
            nombre_original,
            mime_type,
            tamano_bytes,
            version,
            created_by
          )
          VALUES (
            $1::bigint,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9::bigint
          )
          RETURNING
            id::text,
            version,
            storage_bucket,
            storage_path,
            nombre_original,
            mime_type
        `,
        [
          externoId,
          tipo,
          stored.bucket,
          stored.path,
          file.originalname,
          file.mimetype,
          file.size,
          version,
          actor,
        ],
      );

    await registerAuditEntry({
      usuario_id: actor,
      accion:
        'COBERTURA_EXTERNO_DOCUMENT_UPLOAD',
      tabla:
        'cobertura_externo_documentos',
      registro_id:
        saved.rows[0]?.id ?? '',
      descripcion:
        'Carga o reemplazo de documento de identidad externa',
      after: {
        externo_id: externoId,
        tipo,
        version,
      },
      ip: meta?.ip,
      user_agent:
        meta?.user_agent,
    });

    return saved.rows[0];
  };

export const listCoberturaExternoDocumentos =
  async (
    externoId: number,
    tenant?: TenantAccessContext,
  ) => {
    const empresa =
      await dbQuery<{
        empresa_id: string;
      }>(
        `
          SELECT
            empresa_id::text
          FROM cobertura_externos
          WHERE id = $1::bigint
            AND activo = TRUE
          LIMIT 1
        `,
        [externoId],
      );

    const empresaRow =
      empresa.rows[0];

    if (!empresaRow) {
      throw new AppError(
        'Identidad externa no encontrada',
        404,
        'COBERTURA_EXTERNO_NOT_FOUND',
      );
    }

    assertTenantCompany(
      tenant,
      Number(
        empresaRow.empresa_id,
      ),
    );

    await assertNominaExternoCoberturaScope(
      externoId,
      undefined,
      tenant,
    );

    const result =
      await dbQuery<{
        id: string;
        tipo_documento: string;
        nombre_original: string;
        version: number;
        es_vigente: boolean;
        storage_bucket: string;
        storage_path: string;
      }>(
        `
          SELECT
            d.id::text,
            d.tipo_documento,
            d.nombre_original,
            d.version,
            d.es_vigente,
            d.storage_bucket,
            d.storage_path
          FROM cobertura_externo_documentos d
          INNER JOIN cobertura_externos e
            ON e.id = d.externo_id
          WHERE d.externo_id = $1::bigint
            AND d.activo = TRUE
            AND e.activo = TRUE
          ORDER BY
            d.tipo_documento,
            d.version DESC
        `,
        [externoId],
      );

    return Promise.all(
      result.rows.map(
        async (document) => ({
          ...document,
          url:
            await createDocumentSignedUrlForBucket(
              document.storage_bucket,
              document.storage_path,
              300,
            ),
        }),
      ),
    );
  };

export const getCoberturaExternoDocumentoDownload =
  async (
    documentoId: number,
    tenant?: TenantAccessContext,
  ) => {
    const result =
      await dbQuery<{
        empresa_id: string;
        externo_id: string;
        storage_bucket: string;
        storage_path: string;
        nombre_original: string;
        mime_type: string;
      }>(
        `
          SELECT
            e.empresa_id::text,
            d.externo_id::text,
            d.storage_bucket,
            d.storage_path,
            d.nombre_original,
            d.mime_type
          FROM cobertura_externo_documentos d
          INNER JOIN cobertura_externos e
            ON e.id = d.externo_id
          WHERE d.id = $1::bigint
            AND d.activo = TRUE
            AND e.activo = TRUE
          LIMIT 1
        `,
        [documentoId],
      );

    const row =
      result.rows[0];

    if (!row) {
      throw new AppError(
        'Documento externo no encontrado',
        404,
        'COBERTURA_EXTERNO_DOCUMENT_NOT_FOUND',
      );
    }

    assertTenantCompany(
      tenant,
      Number(row.empresa_id),
    );

    await assertNominaExternoCoberturaScope(
      row.externo_id,
      undefined,
      tenant,
    );

    return {
      url:
        await createDocumentSignedUrlForBucket(
          row.storage_bucket,
          row.storage_path,
          300,
        ),
      nombre_original:
        row.nombre_original,
      mime_type: row.mime_type,
    };
  };

export const getCoberturaCuentaDownload =
  async (
    accountId: number,
    tenant?: TenantAccessContext,
  ) => {
    const result =
      await dbQuery<CuentaRow>(
        `
          SELECT *
          FROM cobertura_cuentas_cobro_externas
          WHERE id = $1::bigint
            AND activo = TRUE
          LIMIT 1
        `,
        [accountId],
      );

    const row =
      result.rows[0];

    if (!row) {
      throw new AppError(
        'Cuenta de cobro no encontrada',
        404,
        'COBERTURA_CUENTA_NOT_FOUND',
      );
    }

    assertTenantCompany(
      tenant,
      Number(row.empresa_id),
    );

    await assertNominaExternoCoberturaScope(
      row.externo_id,
      row.periodo_id,
      tenant,
    );

    assertTenantContract(
      tenant,
      Number(row.contrato_id),
    );

    if (
      !row.generado_bucket ||
      !row.generado_path
    ) {
      throw new AppError(
        'La cuenta aun no tiene documento generado',
        409,
        'COBERTURA_CUENTA_DOCUMENT_MISSING',
      );
    }

    return {
      url:
        await createDocumentSignedUrlForBucket(
          row.generado_bucket,
          row.generado_path,
          300,
        ),
      estado: row.estado,
      numero_cuenta:
        row.numero_cuenta,
    };
  };

export const getCoberturaCuentaFirmadaDownload =
  async (
    accountId: number,
    tenant?: TenantAccessContext,
  ) => {
    const result =
      await dbQuery<CuentaRow>(
        `
          SELECT *
          FROM cobertura_cuentas_cobro_externas
          WHERE id = $1::bigint
            AND activo = TRUE
          LIMIT 1
        `,
        [accountId],
      );

    const row =
      result.rows[0];

    if (!row) {
      throw new AppError(
        'Cuenta de cobro no encontrada',
        404,
        'COBERTURA_CUENTA_NOT_FOUND',
      );
    }

    assertTenantCompany(
      tenant,
      Number(row.empresa_id),
    );

    await assertNominaExternoCoberturaScope(
      row.externo_id,
      row.periodo_id,
      tenant,
    );

    assertTenantContract(
      tenant,
      Number(row.contrato_id),
    );

    if (
      row.estado !== 'FIRMADA' ||
      !row.firmado_bucket ||
      !row.firmado_path
    ) {
      throw new AppError(
        'La cuenta aun no tiene PDF firmado',
        409,
        'COBERTURA_CUENTA_SIGNED_DOCUMENT_MISSING',
      );
    }

    return {
      url:
        await createDocumentSignedUrlForBucket(
          row.firmado_bucket,
          row.firmado_path,
          300,
        ),
      estado: row.estado,
      numero_cuenta:
        row.numero_cuenta,
    };
  };

export const uploadCoberturaCuentaFirmada =
  async (
    accountId: number,
    file: {
      buffer: Buffer;
      mimetype: string;
      originalname: string;
    },
    actor: string,
    tenant?: TenantAccessContext,
    meta?: AuditRequestMeta,
  ) => {
    const result =
      await dbQuery<CuentaRow>(
        `
          SELECT *
          FROM cobertura_cuentas_cobro_externas
          WHERE id = $1::bigint
            AND activo = TRUE
          LIMIT 1
        `,
        [accountId],
      );

    const row =
      result.rows[0];

    if (!row) {
      throw new AppError(
        'Cuenta de cobro no encontrada',
        404,
        'COBERTURA_CUENTA_NOT_FOUND',
      );
    }

    assertTenantCompany(
      tenant,
      Number(row.empresa_id),
    );

    assertTenantContract(
      tenant,
      Number(row.contrato_id),
    );

    await assertNominaExternoCoberturaScope(
      row.externo_id,
      row.periodo_id,
      tenant,
    );

    if (
      row.estado !== 'GENERADA'
    ) {
      throw new AppError(
        'Solo una cuenta GENERADA puede marcarse como firmada',
        409,
        'COBERTURA_CUENTA_SIGNATURE_INVALID_STATE',
      );
    }

    if (
      file.mimetype !==
      'application/pdf'
    ) {
      throw new AppError(
        'La cuenta firmada debe ser un PDF',
        400,
        'COBERTURA_CUENTA_SIGNED_MIME_INVALID',
      );
    }

    const safeFileName =
      file.originalname.replace(
        /[^a-zA-Z0-9._-]+/g,
        '-',
      );

    const stored =
      await upload(
        `cobertura/cuentas-cobro/${accountId}/firmada-${Date.now()}-${safeFileName}`,
        file.buffer,
        file.mimetype,
      );

    const updated =
      await dbQuery<CuentaRow>(
        `
          UPDATE cobertura_cuentas_cobro_externas
          SET
            estado = 'FIRMADA',
            firmado_bucket = $2,
            firmado_path = $3,
            firmado_at = NOW(),
            updated_by = $4::bigint,
            updated_at = NOW()
          WHERE id = $1::bigint
          RETURNING *
        `,
        [
          accountId,
          stored.bucket,
          stored.path,
          actor,
        ],
      );

    const updatedRow =
      updated.rows[0];

    if (!updatedRow) {
      throw new AppError(
        'No fue posible registrar la cuenta firmada',
        500,
        'COBERTURA_CUENTA_SIGNATURE_UPDATE_FAILED',
      );
    }

    await registerAuditEntry({
      usuario_id: actor,
      accion:
        'COBERTURA_CUENTA_FIRMADA_UPLOAD',
      tabla:
        'cobertura_cuentas_cobro_externas',
      registro_id:
        String(accountId),
      descripcion:
        'Carga de cuenta de cobro firmada de cobertura',
      after: {
        path: stored.path,
      },
      ip: meta?.ip,
      user_agent:
        meta?.user_agent,
    });

    return updatedRow;
  };
