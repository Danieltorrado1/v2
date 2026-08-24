import { dbPool } from '../config/db';

async function main() {
const marker = `NOMINA32B_ROLLBACK_${Date.now()}`;
const client = await dbPool.connect();
try {
  const employee = await client.query<{ id:string; vinculacion_id:string }>(`SELECT id::text,vinculacion_id::text FROM nomina_empleados WHERE periodo_id=2 ORDER BY id LIMIT 1`);
  const tipo = await client.query<{ id:string; codigo_operativo:string }>(`SELECT id::text,codigo_operativo FROM nomina_tipos_novedad WHERE codigo_operativo='PR1' LIMIT 1`);
  if (!employee.rows[0] || !tipo.rows[0]) throw new Error('Fixture base PR1 no disponible');
  await client.query('BEGIN');
  const novelty = await client.query<{id:string}>(`INSERT INTO nomina_novedades(periodo_id,nomina_empleado_id,vinculacion_id,tipo_novedad_id,tipo_novedad_codigo_operativo,fecha_inicio,fecha_fin,dias,observacion,activo) VALUES(2,$1,$2,$3,'PR1','2026-08-18','2026-08-18',1,$4,TRUE) RETURNING id::text`,[employee.rows[0].id,employee.rows[0].vinculacion_id,tipo.rows[0].id,marker]);
  try { await client.query(`INSERT INTO nomina_novedad_turnos(periodo_id,nomina_novedad_id,nomina_empleado_id,vinculacion_id,tipo_turno,contexto_operativo) VALUES(2,$1,$2,$3,'FORCED_FAILURE','{}')`,[novelty.rows[0]!.id,employee.rows[0].id,employee.rows[0].vinculacion_id]); } catch { /* error deliberado */ }
  await client.query('ROLLBACK');
  const left = await client.query(`SELECT COUNT(*)::int AS count FROM nomina_novedades WHERE observacion=$1`,[marker]);
  const orphan = await client.query(`SELECT COUNT(*)::int AS count FROM nomina_novedad_turnos t JOIN nomina_novedades n ON n.id=t.nomina_novedad_id WHERE n.observacion=$1`,[marker]);
  console.log(JSON.stringify({marker,rollback:true,novedades_residuales:left.rows[0].count,relaciones_residuales:orphan.rows[0].count}));
} finally { client.release(); await dbPool.end(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
