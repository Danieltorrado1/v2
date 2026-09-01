import dotenv from 'dotenv';
import pg from 'pg';
dotenv.config();
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const result = await client.query(`
  select
    e.id as empresa_id,
    e.nombre_empresa,
    c.id as contrato_id,
    c.numero_contrato,
    np.id as periodo_id,
    np.nombre_periodo,
    np.estado,
    np.fecha_inicio::text,
    np.fecha_fin::text,
    count(distinct ncs.id) as categorias,
    count(distinct ne.id) as empleados
  from empresas e
  join contratos c on c.empresa_id = e.id
  left join nomina_periodos np on np.contrato_id = c.id
  left join nomina_categorias_salariales ncs on ncs.contrato_id = c.id and coalesce(ncs.activo, true) = true
  left join nomina_empleados ne on ne.periodo_id = np.id and coalesce(ne.activo, true) = true
  group by e.id, e.nombre_empresa, c.id, c.numero_contrato, np.id, np.nombre_periodo, np.estado, np.fecha_inicio, np.fecha_fin
  having count(distinct ncs.id) > 0 and count(distinct ne.id) > 0
  order by case when np.estado = 'ABIERTO' then 0 else 1 end, empleados desc, categorias desc
  limit 30
`);
console.log(JSON.stringify(result.rows, null, 2));
await client.end();
