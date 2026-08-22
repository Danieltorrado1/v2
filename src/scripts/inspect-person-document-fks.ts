import { dbPool } from '../config/db';
const main = async (): Promise<void> => {
const c = await dbPool.connect();
console.log((await c.query(`SELECT tc.table_name,kcu.column_name,ccu.table_name AS ref_table,ccu.column_name AS ref_column FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name AND ccu.table_schema=tc.table_schema WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_name IN ('personas','persona_identificaciones')`)).rows);
console.log((await c.query(`SELECT id,codigo,nombre_documento FROM tipos_documentos ORDER BY id`)).rows);
console.log((await c.query(`SELECT * FROM tipos_identificacion ORDER BY id`)).rows);
c.release(); await dbPool.end();

};
void main();

