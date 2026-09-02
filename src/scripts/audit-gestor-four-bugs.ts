import dotenv from 'dotenv';
import { Pool } from 'pg';

const envArg = process.argv.find((value) => value.startsWith('--env='));
dotenv.config({ path: envArg?.slice('--env='.length) || '.env.qa' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const companyUsers = await pool.query(`
    SELECT u.id::text, u.nombre_completo AS name, u.correo AS email,
      array_agg(DISTINCT r.nombre_rol) FILTER (WHERE r.nombre_rol IS NOT NULL) AS roles,
      array_agg(DISTINCT ue.empresa_id ORDER BY ue.empresa_id) AS empresas
    FROM usuarios u
    JOIN usuario_empresas ue ON ue.usuario_id=u.id AND COALESCE(ue.activo,TRUE)
    LEFT JOIN usuario_roles ur ON ur.usuario_id=u.id AND COALESCE(ur.activo,TRUE)
    LEFT JOIN roles r ON r.id=ur.rol_id AND COALESCE(r.activo,TRUE)
    WHERE ue.empresa_id=15 AND COALESCE(u.activo,TRUE)
    GROUP BY u.id,u.nombre_completo,u.correo ORDER BY u.nombre_completo`);
  const gestor = await pool.query(`
    SELECT u.id::text,u.nombre_completo,u.correo,gma.contrato_id::text,gma.municipio_id::text,
      m.nombre_municipio,gma.alcance_personal,gma.vigencia_desde::text,gma.vigencia_hasta::text,gma.activo
    FROM usuarios u JOIN gestor_municipio_asignaciones gma ON gma.usuario_id=u.id
    JOIN municipios m ON m.id=gma.municipio_id
    WHERE UPPER(u.nombre_completo) LIKE '%MARY LUZ%' ORDER BY gma.id`);
  const gestorPersonal = await pool.query(`SELECT gpa.vinculacion_id::text,gpa.contrato_id::text,gpa.vigencia_desde::text,gpa.vigencia_hasta::text,gpa.activo
    FROM gestor_personal_asignaciones gpa WHERE gpa.usuario_id=8 ORDER BY gpa.vinculacion_id`);
  const responsibilities = await pool.query(`SELECT nru.id::text,nru.proceso,nru.activo,array_agg(nrm.municipio_id) FILTER (WHERE nrm.municipio_id IS NOT NULL) municipios
    FROM nomina_responsabilidades_usuario nru LEFT JOIN nomina_responsabilidad_municipios nrm ON nrm.responsabilidad_id=nru.id
    WHERE nru.usuario_id=8 AND nru.empresa_id=15 GROUP BY nru.id,nru.proceso,nru.activo ORDER BY nru.proceso`);
  const turns = await pool.query(`
    SELECT COALESCE(mu.nombre_municipio,nm.contexto_municipio,'SIN MUNICIPIO') municipio,
      nnt.tipo_turno,COUNT(*)::int total
    FROM nomina_novedad_turnos nnt
    JOIN nomina_empleados ne ON ne.id=nnt.nomina_empleado_id
    JOIN vinculaciones v ON v.id=ne.vinculacion_id
    JOIN nomina_periodos np ON np.id=nnt.periodo_id
    LEFT JOIN nomina_movimientos nm ON nm.id=nnt.movimiento_id
    LEFT JOIN LATERAL (SELECT ff.municipio_id FROM cobertura_asignaciones ca JOIN focalizacion_final ff ON ff.id=ca.focalizacion_final_id
      WHERE ca.vinculacion_id=v.id AND ca.activo AND ca.fecha_inicio<=np.fecha_fin AND (ca.fecha_fin IS NULL OR ca.fecha_fin>=np.fecha_inicio)
      ORDER BY ca.fecha_inicio DESC,ca.id DESC LIMIT 1) ctx ON TRUE
    LEFT JOIN municipios mu ON mu.id=ctx.municipio_id
    WHERE COALESCE(nnt.activo,TRUE) GROUP BY 1,2 ORDER BY 1,2`);
  const scopedTurns = await pool.query(`
    WITH gestor AS (SELECT id FROM usuarios WHERE UPPER(nombre_completo)='MARY LUZ SANCHEZ PARDO' LIMIT 1)
    SELECT COALESCE(mu.nombre_municipio,nm.contexto_municipio,'SIN MUNICIPIO') municipio,
      nnt.tipo_turno,COUNT(*)::int total
    FROM nomina_novedad_turnos nnt JOIN nomina_empleados ne ON ne.id=nnt.nomina_empleado_id
    JOIN vinculaciones v ON v.id=ne.vinculacion_id JOIN nomina_periodos np ON np.id=nnt.periodo_id
    JOIN gestor g ON TRUE
    LEFT JOIN nomina_movimientos nm ON nm.id=nnt.movimiento_id
    LEFT JOIN LATERAL (SELECT ff.municipio_id FROM cobertura_asignaciones ca JOIN focalizacion_final ff ON ff.id=ca.focalizacion_final_id
      WHERE ca.vinculacion_id=v.id AND ca.activo AND ca.fecha_inicio<=np.fecha_fin AND (ca.fecha_fin IS NULL OR ca.fecha_fin>=np.fecha_inicio)
      ORDER BY ca.fecha_inicio DESC,ca.id DESC LIMIT 1) ctx ON TRUE LEFT JOIN municipios mu ON mu.id=ctx.municipio_id
    WHERE COALESCE(nnt.activo,TRUE)
      AND EXISTS (SELECT 1 FROM nomina_responsabilidades_usuario nru JOIN nomina_responsabilidad_municipios nrm ON nrm.responsabilidad_id=nru.id
        JOIN cobertura_asignaciones ca ON ca.vinculacion_id=v.id JOIN focalizacion_final ff ON ff.id=ca.focalizacion_final_id
        WHERE nru.usuario_id=g.id AND nru.empresa_id=v.empresa_id AND nru.proceso='COBERTURA' AND nru.activo
          AND ff.municipio_id=nrm.municipio_id AND ca.fecha_inicio<=np.fecha_fin AND (ca.fecha_fin IS NULL OR ca.fecha_fin>=np.fecha_inicio))
      AND (EXISTS (SELECT 1 FROM gestor_personal_asignaciones gpa WHERE gpa.usuario_id=g.id AND gpa.vinculacion_id=v.id
        AND gpa.contrato_id=v.contrato_id AND COALESCE(gpa.activo,TRUE) AND gpa.vigencia_desde<=np.fecha_fin
        AND (gpa.vigencia_hasta IS NULL OR gpa.vigencia_hasta>=np.fecha_inicio))
      OR EXISTS (SELECT 1 FROM gestor_municipio_asignaciones gma JOIN cobertura_asignaciones ca ON ca.vinculacion_id=v.id
        JOIN focalizacion_final ff ON ff.id=ca.focalizacion_final_id WHERE gma.usuario_id=g.id AND gma.contrato_id=v.contrato_id
        AND COALESCE(gma.activo,TRUE) AND COALESCE(gma.alcance_personal,'PERSONAL_SELECCIONADO')='TODO_MUNICIPIO'
        AND gma.vigencia_desde<=np.fecha_fin AND (gma.vigencia_hasta IS NULL OR gma.vigencia_hasta>=np.fecha_inicio)
        AND ca.fecha_inicio<=np.fecha_fin AND (ca.fecha_fin IS NULL OR ca.fecha_fin>=np.fecha_inicio) AND ff.municipio_id=gma.municipio_id))
    GROUP BY 1,2 ORDER BY 1,2`);
  const planillaMesetas = await pool.query(`
    SELECT ne.id::text nomina_empleado_id,v.id::text vinculacion_id,v.contrato_id::text contrato_id,
      np.nombre_periodo,np.fecha_inicio::text periodo_inicio,np.fecha_fin::text periodo_fin,
      CONCAT_WS(' ',p.primer_nombre,p.segundo_nombre,p.primer_apellido,p.segundo_apellido) persona,
      m.nombre_municipio,
      array_agg(DISTINCT u.nombre_completo) FILTER (WHERE u.id IS NOT NULL) gestores_territoriales,
      COUNT(DISTINCT gma.usuario_id)::int total_gestores
    FROM nomina_empleados ne JOIN nomina_periodos np ON np.id=ne.periodo_id
    JOIN vinculaciones v ON v.id=ne.vinculacion_id JOIN personas p ON p.id=v.persona_id
    JOIN cobertura_asignaciones ca ON ca.vinculacion_id=v.id AND ca.activo AND ca.fecha_inicio<=np.fecha_fin AND (ca.fecha_fin IS NULL OR ca.fecha_fin>=np.fecha_inicio)
    JOIN focalizacion_final ff ON ff.id=ca.focalizacion_final_id JOIN municipios m ON m.id=ff.municipio_id
    LEFT JOIN gestor_municipio_asignaciones gma ON gma.contrato_id=v.contrato_id AND gma.municipio_id=ff.municipio_id AND COALESCE(gma.activo,TRUE)
      AND gma.vigencia_desde<=CURRENT_DATE AND (gma.vigencia_hasta IS NULL OR gma.vigencia_hasta>=CURRENT_DATE)
    LEFT JOIN usuarios u ON u.id=gma.usuario_id
    WHERE UPPER(m.nombre_municipio)='MESETAS'
    GROUP BY ne.id,v.id,p.id,m.nombre_municipio,np.nombre_periodo,np.fecha_inicio,np.fecha_fin ORDER BY ne.id DESC LIMIT 10`);
  const period = await pool.query(`SELECT id::text FROM nomina_periodos WHERE contrato_id=24 ORDER BY fecha_fin DESC,id DESC LIMIT 1`);
  const periodId = period.rows[0]?.id as string | undefined;
  const { loadTenantAccess } = await import('../middlewares/tenantMiddleware.js');
  const { getNominaMovimientoById, getNominaMovimientosOperativos, listNominaEmpleadosOperativos, listNominaNovedadTurnosOperativos } = await import('../modules/nomina/nomina.service.js');
  const maryTenant = await loadTenantAccess(8);
  const thTenant = await loadTenantAccess(7);
  const adminTenant = { userId: 1, contratoIds: [], empresaIds: [], isGlobalAdmin: true, roleNames: ['ADMINISTRADOR'] };
  const maryEmployees = periodId ? await listNominaEmpleadosOperativos(periodId, { page: 1, limit: 500, empresa_id: '15' }, maryTenant) : null;
  const maryMovements = periodId ? await getNominaMovimientosOperativos({ page: 1, limit: 500, periodo_id: periodId, activo: true }, maryTenant) : null;
  const maryTurns = periodId ? await listNominaNovedadTurnosOperativos({ page: 1, limit: 500, periodo_id: periodId, activo: true }, maryTenant) : null;
  const adminMovements = periodId ? await getNominaMovimientosOperativos({ page: 1, limit: 500, periodo_id: periodId, activo: true }, adminTenant) : null;
  const thEmployees = periodId ? await listNominaEmpleadosOperativos(periodId, { page: 1, limit: 500, empresa_id: '15' }, thTenant) : null;
  const outOfScope = await pool.query(`SELECT nm.id::text FROM nomina_movimientos nm
    JOIN nomina_empleados ne ON ne.id=nm.nomina_empleado_id JOIN vinculaciones v ON v.id=ne.vinculacion_id
    JOIN nomina_periodos np ON np.id=nm.periodo_id
    LEFT JOIN LATERAL (SELECT ff.municipio_id FROM cobertura_asignaciones ca JOIN focalizacion_final ff ON ff.id=ca.focalizacion_final_id
      WHERE ca.vinculacion_id=v.id AND ca.activo AND ca.fecha_inicio<=np.fecha_fin AND (ca.fecha_fin IS NULL OR ca.fecha_fin>=np.fecha_inicio)
      ORDER BY ca.fecha_inicio DESC,ca.id DESC LIMIT 1) ctx ON TRUE LEFT JOIN municipios m ON m.id=ctx.municipio_id
    WHERE UPPER(COALESCE(m.nombre_municipio,nm.contexto_municipio,''))='EL CASTILLO' ORDER BY nm.id DESC LIMIT 1`);
  let directOutOfScope = 'NO_FIXTURE';
  if (outOfScope.rows[0]?.id) {
    try { await getNominaMovimientoById(outOfScope.rows[0].id, maryTenant); directOutOfScope = 'UNEXPECTED_ALLOWED'; }
    catch (error) { directOutOfScope = `${(error as { statusCode?: number }).statusCode ?? 'ERROR'}:${(error as { code?: string }).code ?? 'UNKNOWN'}`; }
  }
  console.log(JSON.stringify({
    usuariosEmpresa15:{ total: companyUsers.rowCount, items: companyUsers.rows },
    maryLuzScope:gestor.rows,
    maryLuzPersonal:{total:gestorPersonal.rowCount,items:gestorPersonal.rows},
    maryLuzResponsabilidades:responsibilities.rows,
    turnosAntesPorMunicipio:turns.rows,
    turnosDespuesScopeMaryLuz:scopedTurns.rows,
    planillaMesetas:planillaMesetas.rows
    ,qaServicios: {
      periodoId: periodId,
      maryEmpleados: maryEmployees ? { total: maryEmployees.pagination.total, municipios: [...new Set((maryEmployees.items as Array<any>).map((item) => item.municipio))], gestores: [...new Set((maryEmployees.items as Array<any>).map((item) => item.gestor ? `${item.gestor.nombre_completo}:${item.gestor.origen}` : 'Sin gestor'))] } : null,
      maryMovimientos: maryMovements ? { total: maryMovements.pagination.total, municipios: [...new Set((maryMovements.items as Array<any>).map((item) => item.contexto_operativo?.municipio))] } : null,
      maryTurnosCanonicos: maryTurns ? { total: maryTurns.pagination.total, municipios: [...new Set(maryTurns.items.map((item) => item.municipio))] } : null,
      adminMovimientos: adminMovements?.pagination.total ?? null,
      thEmpleados: thEmployees ? { total: thEmployees.pagination.total, municipios: [...new Set((thEmployees.items as Array<any>).map((item) => item.municipio))] } : null,
      accesoDirectoElCastillo: directOutOfScope
    }
  }, null, 2));
}

main().finally(() => pool.end()).catch((error) => { console.error(error); process.exitCode=1; });
