import { dbPool } from '../config/db';
const main=async()=>{const result=await dbPool.query(`SELECT
 (SELECT COUNT(*)::int FROM nomina_empleados WHERE periodo_id=2 AND COALESCE(activo,TRUE)=TRUE) empleados,
 (SELECT COUNT(*)::int FROM nomina_novedades WHERE periodo_id=2 AND created_at>=DATE '2026-08-24') novedades_creadas_fase,
 (SELECT COUNT(*)::int FROM nomina_movimientos WHERE periodo_id=2 AND familia_movimiento='ADICION_DEVENGO' AND created_at>=DATE '2026-08-24') ta_creados_fase,
 (SELECT COUNT(*)::int FROM nomina_movimientos WHERE periodo_id=2 AND familia_movimiento='CAMBIO_OPERATIVO' AND created_at>=DATE '2026-08-24') cambios_creados_fase,
 (SELECT COUNT(*)::int FROM nomina_liquidaciones WHERE periodo_id=2 AND created_at>=DATE '2026-08-24') liquidaciones_creadas_fase,
 (SELECT COUNT(*)::int FROM nomina_contextos_operativos_base WHERE periodo_id=2) snapshots_operativos`);console.log(JSON.stringify(result.rows[0],null,2));await dbPool.end();};main().catch(async e=>{console.error(e);await dbPool.end();process.exitCode=1;});
