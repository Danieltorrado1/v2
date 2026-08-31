import { dbQuery } from "./src/config/db";

async function main() {
  const estados = await dbQuery("SELECT COALESCE(estado, 'NULL') AS estado, COUNT(*)::int AS total FROM nomina_empleados GROUP BY 1 ORDER BY 1");
  const columnas = await dbQuery("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'nomina_empleados' AND column_name IN ('estado','cerrado_por','cerrado_en','reabierto_por','reabierto_en','motivo_reapertura') ORDER BY column_name");
  console.log(JSON.stringify({ estados: estados.rows, columnas: columnas.rows }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
