import { dbPool } from '../config/db';
async function main(){
 const q=await dbPool.query(`SELECT
 (SELECT COUNT(*) FROM personas)::int personas,
 (SELECT COUNT(*) FROM vinculaciones)::int vinculaciones,
 (SELECT COUNT(*) FROM nomina_empleados WHERE periodo_id=2)::int nomina_empleados,
 (SELECT COUNT(*) FROM nomina_novedades WHERE periodo_id=2)::int novedades,
 (SELECT COUNT(*) FROM nomina_asistencia_diaria WHERE periodo_id=2)::int asistencias,
 (SELECT COUNT(*) FROM nomina_movimientos WHERE periodo_id=2 AND familia_movimiento='ADICION_DEVENGO')::int ta,
 (SELECT COUNT(*) FROM nomina_movimientos WHERE periodo_id=2 AND familia_movimiento='CAMBIO_OPERATIVO')::int cambios,
 (SELECT COUNT(*) FROM nomina_liquidaciones WHERE periodo_id=2)::int liquidaciones`);
 console.log(JSON.stringify(q.rows[0])); await dbPool.end();
}
main().catch(e=>{console.error(e);process.exitCode=1});
