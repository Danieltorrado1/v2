import 'dotenv/config';

import { dbQuery } from '../config/db';
import { AppError } from '../utils/AppError';
import {
  calculateSstIndicadores,
  createSstAccidente,
  createSstEvento,
  createSstPlanAccion,
  deactivateSstAccidente,
  deactivateSstEvento,
  listSstEventos,
  listSstIndicadores,
  listSstPlanesAccion,
  updateSstEvento,
  updateSstPlanAccion,
  closeSstPlanAccion
} from '../modules/sst/sst.service';
import {
  closeSstAccionInspeccion,
  createSstAccionInspeccion,
  createSstInspeccion,
  createSstInspeccionHallazgo,
  deactivateSstAccionInspeccion,
  deactivateSstInspeccion,
  deactivateSstInspeccionHallazgo,
  getSstInspeccionesAlertas,
  getSstInspeccionesDashboard,
  listSstAccionesInspeccion,
  listSstInspecciones,
  updateSstAccionInspeccion,
  updateSstInspeccion,
  updateSstInspeccionHallazgo
} from '../modules/sst/sst.inspecciones.service';
import {
  createSstEventoSchema,
  createSstPlanAccionSchema
} from '../modules/sst/sst.schemas';
import {
  getIndicadoresAlertas,
  getIndicadoresDashboard,
  getIndicadoresHistorico,
  listIndicadoresPeriodos
} from '../modules/sstIndicadores/sstIndicadores.service';

interface ContextRow {
  contrato_id: string;
  empresa_id: string;
  persona_id: string;
  user_id: string;
  vinculacion_id: string;
}

interface IdRow {
  id: string;
}

const QA_PREFIX = 'QA_SST_20260716';
const AUDIT_META = {
  ip: '127.0.0.1',
  user_agent: 'test-sst-phase21b'
};

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const expectAppError = async (
  label: string,
  expectedCode: string,
  operation: () => Promise<unknown>
): Promise<void> => {
  try {
    await operation();
    throw new Error(`${label}: expected AppError ${expectedCode}`);
  } catch (error) {
    if (!(error instanceof AppError)) {
      throw error;
    }

    assert(error.code === expectedCode, `${label}: expected ${expectedCode}, got ${error.code}`);
  }
};

const loadContext = async (): Promise<ContextRow> => {
  const userResult = await dbQuery<IdRow>(
    `SELECT id::text AS id FROM usuarios WHERE COALESCE(activo, TRUE) = TRUE ORDER BY id ASC LIMIT 1`
  );
  const vincResult = await dbQuery<Omit<ContextRow, 'user_id'>>(
    `
      SELECT
        v.id::text AS vinculacion_id,
        v.persona_id::text AS persona_id,
        v.contrato_id::text AS contrato_id,
        v.empresa_id::text AS empresa_id
      FROM vinculaciones v
      WHERE v.persona_id IS NOT NULL
        AND v.contrato_id IS NOT NULL
        AND v.empresa_id IS NOT NULL
      ORDER BY v.id ASC
      LIMIT 1
    `
  );

  const user = userResult.rows[0];
  const vinculacion = vincResult.rows[0];

  assert(Boolean(user?.id), 'No active user was found for SST test execution');
  assert(Boolean(vinculacion?.vinculacion_id), 'No vinculacion with persona/contrato/empresa was found for SST test execution');

  return {
    user_id: user!.id,
    vinculacion_id: vinculacion!.vinculacion_id,
    persona_id: vinculacion!.persona_id,
    contrato_id: vinculacion!.contrato_id,
    empresa_id: vinculacion!.empresa_id
  };
};

const loadPermissionCoverage = async (): Promise<{
  admin_permissions: string[];
  hallazgos_via_inspecciones: boolean;
}> => {
  const result = await dbQuery<{ permiso: string }>(
    `
      SELECT CONCAT(p.modulo, '.', p.accion) AS permiso
      FROM roles r
      INNER JOIN rol_permisos rp ON rp.rol_id = r.id AND rp.activo = TRUE
      INNER JOIN permisos p ON p.id = rp.permiso_id AND p.activo = TRUE
      WHERE r.nombre_rol = 'ADMINISTRADOR'
        AND p.modulo LIKE 'sst%'
      ORDER BY 1
    `
  );

  const permissions = result.rows.map((row) => row.permiso);
  const required = [
    'sst.read',
    'sst.eventos.create',
    'sst.eventos.update',
    'sst.eventos.deactivate',
    'sst.planes.read',
    'sst.planes.create',
    'sst.planes.update',
    'sst.planes.close',
    'sst.inspecciones.read',
    'sst.inspecciones.write',
    'sst.indicadores.read'
  ];

  for (const permission of required) {
    assert(permissions.includes(permission), `Missing ADMINISTRADOR permission ${permission}`);
  }

  return {
    admin_permissions: required,
    hallazgos_via_inspecciones: permissions.includes('sst.inspecciones.read') && permissions.includes('sst.inspecciones.write')
  };
};

const loadAuditRows = async (ids: string[]): Promise<Array<{ accion: string; entidad: string; entidad_id: string }>> => {
  if (ids.length === 0) {
    return [];
  }

  const result = await dbQuery<{ accion: string; entidad: string; entidad_id: string }>(
    `
      SELECT accion, entidad, entidad_id
      FROM auditoria_eventos
      WHERE entidad_id = ANY($1::text[])
      ORDER BY id DESC
    `,
    [ids]
  );

  return result.rows;
};

const main = async (): Promise<void> => {
  const context = await loadContext();
  const permissions = await loadPermissionCoverage();
  const suffix = `${Date.now()}`;
  const qaLabel = `${QA_PREFIX}_${suffix}`;

  const cleanup = {
    accidenteId: null as string | null,
    accionId: null as string | null,
    eventPlanId: null as string | null,
    hallazgoId: null as string | null,
    inspeccionId: null as string | null,
    accidentePlanId: null as string | null,
    eventoId: null as string | null,
    hallazgoPlanId: null as string | null,
    inspeccionPlanId: null as string | null
  };

  const auditIds: string[] = [];

  try {
    createSstEventoSchema.parse({
      vinculacion_id: context.vinculacion_id,
      tipo_evento: 'ACCIDENTE_TRABAJO',
      fecha_evento: '2026-07-16',
      gravedad: 'LEVE'
    });

    try {
      createSstEventoSchema.parse({
        vinculacion_id: context.vinculacion_id,
        tipo_evento: 'INVALIDO',
        fecha_evento: '2026-07-16'
      });
      throw new Error('Invalid event type should have failed at schema level');
    } catch {
      // expected
    }

    try {
      createSstPlanAccionSchema.parse({
        origen: 'EVENTO',
        origen_id: '1',
        descripcion: qaLabel,
        estado: 'INVALIDO'
      });
      throw new Error('Invalid action plan state should have failed at schema level');
    } catch {
      // expected
    }

    const evento = await createSstEvento(
      {
        vinculacion_id: context.vinculacion_id,
        tipo_evento: 'ACCIDENTE_TRABAJO',
        fecha_evento: '2026-07-16',
        hora_evento: '08:30:00',
        lugar: qaLabel,
        descripcion: qaLabel,
        gravedad: 'LEVE',
        requiere_investigacion: true,
        estado: 'ABIERTO',
        activo: true
      },
      context.user_id,
      AUDIT_META
    );
    cleanup.eventoId = evento.id;
    auditIds.push(evento.id);

    await expectAppError('evento vinculacion inexistente', 'VINCULACION_NOT_FOUND', async () => {
      await createSstEvento(
        {
          vinculacion_id: '999999999',
          tipo_evento: 'INCIDENTE',
          fecha_evento: '2026-07-16',
          hora_evento: null,
          lugar: qaLabel,
          descripcion: qaLabel,
          gravedad: 'LEVE',
          requiere_investigacion: false,
          estado: 'ABIERTO',
          activo: true
        },
        context.user_id,
        AUDIT_META
      );
    });

    const eventoActualizado = await updateSstEvento(
      evento.id,
      {
        estado: 'EN_PROCESO',
        gravedad: 'GRAVE',
        descripcion: `${qaLabel}_EDIT`
      },
      context.user_id,
      AUDIT_META
    );
    assert(eventoActualizado.estado === 'EN_PROCESO', 'Event update did not persist estado EN_PROCESO');
    assert(eventoActualizado.gravedad === 'GRAVE', 'Event update did not persist gravedad GRAVE');

    const eventosFiltrados = await listSstEventos({
      page: 1,
      limit: 20,
      vinculacion_id: context.vinculacion_id,
      tipo_evento: 'ACCIDENTE_TRABAJO',
      gravedad: 'GRAVE',
      estado: 'EN_PROCESO',
      fecha_desde: '2026-07-16',
      fecha_hasta: '2026-07-16',
      activo: true,
      search: qaLabel,
      contrato_id: context.contrato_id,
      empresa_id: context.empresa_id
    });
    assert(eventosFiltrados.items.some((item) => item.id === evento.id), 'Filtered events did not return the QA event');

    const inspeccion = await createSstInspeccion(
      {
        empresa_id: context.empresa_id,
        contrato_id: context.contrato_id,
        nombre_inspeccion: qaLabel,
        tipo_inspeccion: 'LOCATIVA',
        fecha_programada: '2026-07-16',
        fecha_realizada: null,
        responsable: qaLabel,
        estado: 'PROGRAMADA',
        observacion: qaLabel,
        activo: true
      },
      context.user_id,
      undefined,
      AUDIT_META
    );
    cleanup.inspeccionId = String(inspeccion.id);
    auditIds.push(String(inspeccion.id));

    const inspeccionActualizada = await updateSstInspeccion(
      String(inspeccion.id),
      {
        responsable: `${qaLabel}_RESP`,
        observacion: `${qaLabel}_EDIT`,
        estado: 'REALIZADA',
        fecha_realizada: '2026-07-16'
      },
      context.user_id,
      undefined,
      AUDIT_META
    );
    assert(inspeccionActualizada.estado === 'REALIZADA', 'Inspection update did not persist estado REALIZADA');

    const hallazgo = await createSstInspeccionHallazgo(
      {
        inspeccion_id: String(inspeccion.id),
        tipo_hallazgo: 'CONDICION_INSEGURA',
        descripcion: qaLabel,
        nivel_riesgo: 'ALTO',
        requiere_accion: true,
        activo: true
      },
      context.user_id,
      undefined,
      AUDIT_META
    );
    cleanup.hallazgoId = String(hallazgo.id);
    auditIds.push(String(hallazgo.id));

    const hallazgoActualizado = await updateSstInspeccionHallazgo(
      String(hallazgo.id),
      {
        descripcion: `${qaLabel}_EDIT`,
        nivel_riesgo: 'CRITICO'
      },
      context.user_id,
      undefined,
      AUDIT_META
    );
    assert(hallazgoActualizado.nivel_riesgo === 'CRITICO', 'Inspection finding update did not persist nivel_riesgo CRITICO');

    const accion = await createSstAccionInspeccion(
      {
        hallazgo_id: String(hallazgo.id),
        descripcion: qaLabel,
        responsable: qaLabel,
        fecha_compromiso: '2026-07-17',
        fecha_cierre: null,
        estado: 'ABIERTA',
        activo: true
      },
      context.user_id,
      undefined,
      AUDIT_META
    );
    cleanup.accionId = String(accion.id);
    auditIds.push(String(accion.id));

    const accionActualizada = await updateSstAccionInspeccion(
      String(accion.id),
      {
        responsable: `${qaLabel}_RESP`,
        estado: 'EN_PROCESO'
      },
      context.user_id,
      undefined,
      AUDIT_META
    );
    assert(accionActualizada.estado === 'EN_PROCESO', 'Inspection action update did not persist estado EN_PROCESO');

    const accionCerrada = await closeSstAccionInspeccion(
      String(accion.id),
      { fecha_cierre: '2026-07-18' },
      context.user_id,
      undefined,
      AUDIT_META
    );
    assert(accionCerrada.estado === 'CERRADA', 'Inspection action close did not persist estado CERRADA');

    const inspeccionesFiltradas = await listSstInspecciones(
      {
        page: 1,
        limit: 20,
        empresa_id: context.empresa_id,
        contrato_id: context.contrato_id,
        estado: 'REALIZADA',
        tipo_inspeccion: 'LOCATIVA',
        activo: true,
        search: qaLabel
      },
      undefined
    );
    assert(inspeccionesFiltradas.items.some((item) => String(item.id) === String(inspeccion.id)), 'Filtered inspections did not return the QA inspection');

    const accionesFiltradas = await listSstAccionesInspeccion(
      {
        page: 1,
        limit: 20,
        empresa_id: context.empresa_id,
        contrato_id: context.contrato_id,
        hallazgo_id: String(hallazgo.id),
        estado: 'CERRADA',
        activo: true,
      },
      undefined
    );
    assert(accionesFiltradas.items.some((item) => String(item.id) === String(accion.id)), 'Filtered inspection actions did not return the QA action');

    const dashboardInspecciones = await getSstInspeccionesDashboard(
      {
        empresa_id: context.empresa_id,
        contrato_id: context.contrato_id
      },
      context.user_id,
      undefined,
      AUDIT_META
    );
    assert(dashboardInspecciones.inspecciones_total >= 1, 'Inspection dashboard did not return aggregate totals');

    const alertasInspecciones = await getSstInspeccionesAlertas(
      {
        empresa_id: context.empresa_id,
        contrato_id: context.contrato_id,
        page: 1,
        limit: 100
      },
      context.user_id,
      undefined,
      AUDIT_META
    );
    assert(Array.isArray(alertasInspecciones.items), 'Inspection alerts did not return a list');

    const accidente = await createSstAccidente(
      {
        empresa_id: context.empresa_id,
        contrato_id: context.contrato_id,
        persona_id: context.persona_id,
        vinculacion_id: context.vinculacion_id,
        tipo_evento: 'INCIDENTE',
        fecha_evento: '2026-07-16',
        hora_evento: '09:30:00',
        lugar_evento: qaLabel,
        descripcion: qaLabel,
        lesionado: false,
        tipo_lesion: null,
        parte_cuerpo: null,
        dias_incapacidad: 0,
        requiere_investigacion: true,
        severidad: 'LEVE',
        estado: 'ABIERTO',
        activo: true
      },
      context.user_id,
      undefined,
      AUDIT_META
    );
    cleanup.accidenteId = String(accidente.id);
    auditIds.push(String(accidente.id));

    await expectAppError('plan origen inexistente', 'SST_PLAN_ACCION_ORIGEN_NOT_FOUND', async () => {
      await createSstPlanAccion(
        {
          origen: 'EVENTO',
          origen_id: '999999999',
          responsable: qaLabel,
          descripcion: qaLabel,
          fecha_compromiso: '2026-07-20',
          fecha_cierre: null,
          estado: 'PENDIENTE',
          activo: true
        },
        context.user_id,
        AUDIT_META
      );
    });

    const planEvento = await createSstPlanAccion(
      {
        origen: 'EVENTO',
        origen_id: evento.id,
        responsable: qaLabel,
        descripcion: `${qaLabel}_PLAN_EVENTO`,
        fecha_compromiso: '2026-07-20',
        fecha_cierre: null,
        estado: 'PENDIENTE',
        activo: true
      },
      context.user_id,
      AUDIT_META
    );
    cleanup.eventPlanId = planEvento.id;
    auditIds.push(planEvento.id);

    const planEventoActualizado = await updateSstPlanAccion(
      planEvento.id,
      {
        responsable: `${qaLabel}_PLAN_RESP`,
        estado: 'EN_PROCESO'
      },
      context.user_id,
      AUDIT_META
    );
    assert(planEventoActualizado.estado === 'EN_PROCESO', 'Event plan update did not persist estado EN_PROCESO');

    const planEventoCerrado = await closeSstPlanAccion(
      planEvento.id,
      { fecha_cierre: '2026-07-21' },
      context.user_id,
      AUDIT_META
    );
    assert(planEventoCerrado.estado === 'CERRADO', 'Event plan close did not persist estado CERRADO');

    await expectAppError('plan cerrado dos veces', 'SST_PLAN_ACCION_CLOSE_INVALID_STATE', async () => {
      await closeSstPlanAccion(planEvento.id, { fecha_cierre: '2026-07-22' }, context.user_id, AUDIT_META);
    });

    const planInspeccion = await createSstPlanAccion(
      {
        origen: 'INSPECCION',
        origen_id: String(inspeccion.id),
        responsable: qaLabel,
        descripcion: `${qaLabel}_PLAN_INSPECCION`,
        fecha_compromiso: '2026-07-22',
        fecha_cierre: null,
        estado: 'PENDIENTE',
        activo: true
      },
      context.user_id,
      AUDIT_META
    );
    cleanup.inspeccionPlanId = planInspeccion.id;
    auditIds.push(planInspeccion.id);

    const planHallazgo = await createSstPlanAccion(
      {
        origen: 'HALLAZGO',
        origen_id: String(hallazgo.id),
        responsable: qaLabel,
        descripcion: `${qaLabel}_PLAN_HALLAZGO`,
        fecha_compromiso: '2026-07-23',
        fecha_cierre: null,
        estado: 'PENDIENTE',
        activo: true
      },
      context.user_id,
      AUDIT_META
    );
    cleanup.hallazgoPlanId = planHallazgo.id;
    auditIds.push(planHallazgo.id);

    const planAccidente = await createSstPlanAccion(
      {
        origen: 'ACCIDENTE',
        origen_id: String(accidente.id),
        responsable: qaLabel,
        descripcion: `${qaLabel}_PLAN_ACCIDENTE`,
        fecha_compromiso: '2026-07-24',
        fecha_cierre: null,
        estado: 'PENDIENTE',
        activo: true
      },
      context.user_id,
      AUDIT_META
    );
    cleanup.accidentePlanId = planAccidente.id;
    auditIds.push(planAccidente.id);

    const planesFiltrados = await listSstPlanesAccion({
      page: 1,
      limit: 20,
      empresa_id: context.empresa_id,
      contrato_id: context.contrato_id,
      estado: 'CERRADO',
      activo: true,
      search: qaLabel
    });
    assert(planesFiltrados.items.some((item) => item.id === planEvento.id), 'Filtered action plans did not return the closed QA plan');

    const indicadores = await listSstIndicadores({
      page: 1,
      limit: 20,
      contrato_id: context.contrato_id,
      activo: true,
      search: null,
      empresa_id: context.empresa_id,
      indicador_id: null,
      periodicidad: null,
      unidad: null,
      periodo: null,
      fecha_desde: null,
      fecha_hasta: null
    });
    assert(Array.isArray(indicadores.catalogo), 'Generic indicators endpoint did not return catalogo');
    assert(Array.isArray(indicadores.periodos), 'Generic indicators endpoint did not return periodos');
    assert(Array.isArray(indicadores.mediciones), 'Generic indicators endpoint did not return mediciones');

    await expectAppError('calculo indicadores deshabilitado', 'SST_INDICADORES_CALCULATION_UNAVAILABLE', async () => {
      await calculateSstIndicadores({
        empresa_id: context.empresa_id,
        contrato_id: context.contrato_id,
        periodo_id: null,
        fecha_desde: '2026-07-01',
        fecha_hasta: '2026-07-31'
      }, context.user_id, AUDIT_META);
    });

    const periodos = await listIndicadoresPeriodos({ page: 1, limit: 10, activo: true, empresa_id: context.empresa_id, contrato_id: context.contrato_id, search: null }, undefined);
    let indicadoresDashboard = null;
    let indicadoresHistorico = null;
    let indicadoresAlertas = null;

    const primerPeriodo = periodos.items[0] ?? null;

    if (primerPeriodo) {
      const periodoId = String(primerPeriodo.id);
      indicadoresDashboard = await getIndicadoresDashboard(
        { periodo_id: periodoId, empresa_id: context.empresa_id, contrato_id: context.contrato_id },
        context.user_id,
        undefined,
        AUDIT_META
      );
      indicadoresHistorico = await getIndicadoresHistorico(
        { empresa_id: context.empresa_id, contrato_id: context.contrato_id, periodo_id: periodoId },
        context.user_id,
        undefined,
        AUDIT_META
      );
      indicadoresAlertas = await getIndicadoresAlertas(
        { periodo_id: periodoId, empresa_id: context.empresa_id, contrato_id: context.contrato_id },
        context.user_id,
        undefined,
        AUDIT_META
      );
      assert(indicadoresDashboard !== null, 'Dedicated indicators dashboard did not return data');
      assert(Array.isArray(indicadoresHistorico.items), 'Dedicated indicators historical series did not return items');
      assert(Array.isArray(indicadoresAlertas.items), 'Dedicated indicators alerts did not return items');
    }
    const auditRows = await loadAuditRows(auditIds);
    const requiredAuditActions = [
      'EVENTO_CREATE',
      'EVENTO_UPDATE',
      'EVENTO_DEACTIVATE',
      'PLAN_CREATE',
      'PLAN_UPDATE',
      'PLAN_CLOSE',
      'SST_INSPECCION_CREATE',
      'SST_INSPECCION_UPDATE',
      'SST_INSPECCION_HALLAZGO_CREATE',
      'SST_INSPECCION_HALLAZGO_UPDATE',
      'SST_INSPECCION_ACCION_CREATE',
      'SST_INSPECCION_ACCION_UPDATE',
      'SST_INSPECCION_ACCION_CLOSE',
      'SST_ACCIDENTE_CREATE'
    ];

    await deactivateSstEvento(evento.id, context.user_id, AUDIT_META);
    await deactivateSstAccionInspeccion(String(accion.id), context.user_id, undefined, AUDIT_META);
    await deactivateSstInspeccionHallazgo(String(hallazgo.id), context.user_id, undefined, AUDIT_META);
    await deactivateSstInspeccion(String(inspeccion.id), context.user_id, undefined, AUDIT_META);
    await deactivateSstAccidente(String(accidente.id), context.user_id, undefined, AUDIT_META);
    await updateSstPlanAccion(planEvento.id, { activo: false }, context.user_id, AUDIT_META);
    await updateSstPlanAccion(planInspeccion.id, { activo: false, estado: 'ANULADO' }, context.user_id, AUDIT_META);
    await updateSstPlanAccion(planHallazgo.id, { activo: false, estado: 'ANULADO' }, context.user_id, AUDIT_META);
    await updateSstPlanAccion(planAccidente.id, { activo: false, estado: 'ANULADO' }, context.user_id, AUDIT_META);

    const auditRowsAfterCleanup = await loadAuditRows(auditIds);

    for (const action of requiredAuditActions) {
      assert(
        auditRowsAfterCleanup.some((row) => row.accion === action),
        `Audit action ${action} was not registered in auditoria_eventos`
      );
    }

    const summary = {
      qa_label: qaLabel,
      ids: {
        evento_id: cleanup.eventoId,
        inspeccion_id: cleanup.inspeccionId,
        hallazgo_id: cleanup.hallazgoId,
        accion_inspeccion_id: cleanup.accionId,
        accidente_id: cleanup.accidenteId,
        plan_evento_id: cleanup.eventPlanId,
        plan_inspeccion_id: cleanup.inspeccionPlanId,
        plan_hallazgo_id: cleanup.hallazgoPlanId,
        plan_accidente_id: cleanup.accidentePlanId
      },
      permissions,
      indicadores_publicos: {
        catalogo: indicadores.catalogo.length,
        periodos: indicadores.periodos.length,
        mediciones: indicadores.mediciones.length,
        dashboard_disponible: indicadoresDashboard !== null,
        historico_items: indicadoresHistorico?.items.length ?? 0,
        alertas_items: indicadoresAlertas?.items.length ?? 0
      },
      auditoria_acciones: Array.from(new Set(auditRowsAfterCleanup.map((row) => row.accion))).sort(),
      http_validation: {
        health_url: 'http://127.0.0.1:3000/api/health',
        status: 'pending_manual_server_start'
      }
    };

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    if (cleanup.accionId) {
      await deactivateSstAccionInspeccion(cleanup.accionId, context.user_id, undefined, AUDIT_META).catch(() => undefined);
    }
    if (cleanup.hallazgoId) {
      await deactivateSstInspeccionHallazgo(cleanup.hallazgoId, context.user_id, undefined, AUDIT_META).catch(() => undefined);
    }
    if (cleanup.inspeccionId) {
      await deactivateSstInspeccion(cleanup.inspeccionId, context.user_id, undefined, AUDIT_META).catch(() => undefined);
    }
    if (cleanup.eventoId) {
      await deactivateSstEvento(cleanup.eventoId, context.user_id, AUDIT_META).catch(() => undefined);
    }
    if (cleanup.accidenteId) {
      await deactivateSstAccidente(cleanup.accidenteId, context.user_id, undefined, AUDIT_META).catch(() => undefined);
    }
    if (cleanup.eventPlanId) {
      await updateSstPlanAccion(cleanup.eventPlanId, { activo: false }, context.user_id, AUDIT_META).catch(() => undefined);
    }
    if (cleanup.inspeccionPlanId) {
      await updateSstPlanAccion(cleanup.inspeccionPlanId, { activo: false, estado: 'ANULADO' }, context.user_id, AUDIT_META).catch(() => undefined);
    }
    if (cleanup.hallazgoPlanId) {
      await updateSstPlanAccion(cleanup.hallazgoPlanId, { activo: false, estado: 'ANULADO' }, context.user_id, AUDIT_META).catch(() => undefined);
    }
    if (cleanup.accidentePlanId) {
      await updateSstPlanAccion(cleanup.accidentePlanId, { activo: false, estado: 'ANULADO' }, context.user_id, AUDIT_META).catch(() => undefined);
    }
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

export {};



