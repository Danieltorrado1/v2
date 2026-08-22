import { dbPool } from '../config/db';
const main = async (): Promise<void> => {
 const c=await dbPool.connect();
 for (const t of ['personas','vinculaciones','cobertura_asignaciones','personal_asignaciones_laborales','personal_presentaciones_licitacion','vinculacion_condiciones_economicas']) console.log(t,(await c.query(`SELECT COUNT(*)::int AS total FROM ${t}`)).rows[0]);
 console.log((await c.query(`SELECT p.id,pi.numero_documento,pi.tipo_documento_id FROM personas p JOIN persona_identificaciones pi ON pi.persona_id=p.id AND pi.es_vigente=TRUE WHERE pi.numero_documento IN ('1122626274','40429520','40434226','1122122126','25707622','1122117236','6038597','1006945972')`)).rows);
 c.release(); await dbPool.end();
}; void main().catch((e)=>{console.error(e);process.exitCode=1});
