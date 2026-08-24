import { dbPool } from '../config/db';
const main=async()=>{const result=await dbPool.query(`SELECT
  to_regclass('public.nomina_contextos_operativos_base') IS NOT NULL AS snapshot_table,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='nomina_movimientos' AND column_name='contexto_nuevo') AS event_context,
  (SELECT COUNT(*)::int FROM nomina_movimientos WHERE periodo_id=2 AND familia_movimiento='CAMBIO_OPERATIVO' AND created_at >= DATE '2026-08-24') AS cambios_agosto_creados,
  (SELECT COUNT(*)::int FROM nomina_contextos_operativos_base WHERE periodo_id=2) AS snapshots_agosto_creados,
  (SELECT COUNT(*)::int FROM nomina_empleados WHERE periodo_id=2) AS empleados_snapshot`);console.log(JSON.stringify(result.rows[0],null,2));await dbPool.end();};
main().catch(async(error)=>{console.error(error);await dbPool.end();process.exitCode=1;});
