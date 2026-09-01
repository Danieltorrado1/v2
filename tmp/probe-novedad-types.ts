import { dbPool } from '../src/config/db';

async function main() {
  const tipo = await dbPool.query(`
    SELECT id::text, codigo_operativo, nombre, COALESCE(permite_rango, FALSE) AS permite_rango,
           COALESCE(afecta_cobertura, FALSE) AS afecta_cobertura,
           COALESCE(requiere_revision, FALSE) AS requiere_revision,
           COALESCE(requiere_soporte, FALSE) AS requiere_soporte,
           COALESCE(requiere_dias, FALSE) AS requiere_dias,
           COALESCE(requiere_horas, FALSE) AS requiere_horas,
           COALESCE(requiere_valor, FALSE) AS requiere_valor,
           COALESCE(grupo_exclusividad, 'NINGUNA') AS grupo_exclusividad,
           COALESCE(activo, TRUE) AS activo
    FROM nomina_tipos_novedad
    WHERE COALESCE(activo, TRUE) = TRUE
    ORDER BY COALESCE(afecta_cobertura, FALSE) DESC, COALESCE(permite_rango, FALSE) DESC, id
    LIMIT 30
  `);
  console.log(JSON.stringify(tipo.rows, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await dbPool.end(); });
