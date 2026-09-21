import { dbPool } from '../../src/config/db';
import { effectiveRetirementSql } from '../../src/modules/nomina/nomina.population';
async function main() {
 const c=await dbPool.connect();
 try {
  await c.query('BEGIN READ ONLY');
  const result=await c.query(`SELECT np.id::text, np.nombre_periodo, np.estado,
   (SELECT COUNT(*)::int FROM nomina_empleados ne WHERE ne.periodo_id=np.id) AS materializados,
   (SELECT COUNT(*)::int FROM nomina_empleados ne WHERE ne.periodo_id=np.id AND COALESCE(ne.activo,true)) AS operativos,
   (SELECT COUNT(DISTINCT v.id)::int FROM vinculaciones v WHERE v.contrato_id=np.contrato_id AND v.fecha_inicio<=np.fecha_fin AND (${effectiveRetirementSql} IS NULL OR ${effectiveRetirementSql}>=np.fecha_inicio)) AS elegibles,
   (SELECT COUNT(DISTINCT v.id)::int FROM vinculaciones v WHERE v.contrato_id=np.contrato_id AND v.fecha_inicio BETWEEN np.fecha_inicio AND np.fecha_fin) AS ingresos,
   (SELECT COUNT(DISTINCT v.id)::int FROM vinculaciones v WHERE v.contrato_id=np.contrato_id AND ${effectiveRetirementSql} BETWEEN np.fecha_inicio AND np.fecha_fin) AS retiros
   FROM nomina_periodos np WHERE np.fecha_inicio IN ('2026-08-01','2026-09-01') ORDER BY np.id`);
  console.log(JSON.stringify(result.rows));
 } finally {await c.query('ROLLBACK');c.release();await dbPool.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
