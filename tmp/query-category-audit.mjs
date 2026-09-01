import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env.qa' });
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const result = await client.query(`
  select usuario_id::text as usuario_id, empresa_id::text as empresa_id, contrato_id::text as contrato_id,
    entidad, entidad_id, accion, descripcion, datos_anteriores, datos_nuevos, fecha_evento::text as fecha_evento
  from auditoria_eventos
  where entidad = 'nomina_categorias_salariales' and entidad_id = '8' and accion = 'UPDATE'
  order by fecha_evento desc
  limit 3
`);
console.log(JSON.stringify(result.rows, null, 2));
await client.end();
