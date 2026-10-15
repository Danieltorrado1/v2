# Nómina 202: lanzador de preflight READ ONLY

El lanzador `src/scripts/nomina-turno-202-production-launcher-cli.ts` solo llama al runner PostgreSQL READ ONLY. No importa el corrector ni acepta estados ACTIVE. Requiere argumentos `--nombre=valor` en el orden estricto exportado por `ARGUMENT_ORDER`; acepta los pines de caso publicados más `--db-host`, `--db-port`, `--db-name` y `--project-ref-sha256` para fijar el destino de forma explícita. No existe búsqueda automática de `.env`.

| Dependencia | Proveedor del repositorio | Variables | Cuándo se lee | Validación/cierre |
| --- | --- | --- | --- | --- |
| PostgreSQL | `pg.Client` del runner; `src/config/db.ts` es solo referencia de configuración y no se importa por usar TLS permisivo | `DATABASE_URL` | Tras validar Git, reportes, dump/PDF, CA, manifiesto, destino y health | URL PostgreSQL; host/puerto/base y project ref fijados; CA SHA pin; TLS 1.3, hostname verificado; transacción `REPEATABLE READ READ ONLY`; `ROLLBACK`; cierre de cada Client |
| CA | Archivo explícito de confianza; el runner fija el SHA de la CA pública | Ninguna | Antes del health GET | Archivo regular sin symlink, tamaño/hash fijados; bytes temporales borrados |
| Health | Ruta del backend `src/modules/health/health.routes.ts`, fijada a `https://api.empiriasuite.com/api/health` | Ninguna | Después del precheck offline, antes de leer credenciales | Solo GET, HTTPS/hostname/path exactos, redirecciones rechazadas; respuesta del controller mapeada desde `data.database` e `data.integracion_outbox` |
| Storage PDF | SDK existente `@supabase/supabase-js`; misma familia/configuración que `src/config/supabaseAdmin.ts` y el lector `.storage.from(bucket).download(path)` de `src/modules/expedientes/expedientes.service.ts` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` | Después de precheck y health; durante cada snapshot se resuelve bucket/path desde cuenta 77 | project ref y rol `service_role`; `.info` seguido por `.download`; MIME/tamaño/SHA/ETag; no se firman URLs ni se escribe Storage; buffers PDF se ponen a cero al terminar el snapshot |
| Atestaciones | Confirmaciones indicadas explícitamente en CLI | Ninguna | No se leen secretos | `--sync-confirmed=true` y `--pdf-attestation-confirmed=true`; el código no cambia Render |

La lectura de `.env` usa únicamente la ruta absoluta dada por `--env-file`, tras revisar archivo regular, ACL y estabilidad de identidad/tamaño/mtime. Solo extrae las cuatro variables enumeradas; no llama a `dotenv.config`, no modifica `process.env`, rechaza duplicados de variables requeridas y limpia el objeto mutable al finalizar. Ningún valor o referencia documental se incluye en logs o recibos. Los errores del CLI se reducen a códigos estables.

El SHA esperado del project ref se recibe como argumento porque no está versionado en el repositorio. Se calcula comparando el ref derivado de `SUPABASE_URL` con el de `DATABASE_URL`, y ambos se contrastan con su SHA fijado por el operador. El nombre de host y puerto de PostgreSQL también deben coincidir literalmente con argumentos de destino.

Los dos recibos se publican con creación exclusiva y enlaces duros atómicos en rutas `baseline` y `pending` distintas. El recibo pendiente enlaza ruta relativa y SHA del baseline. No hay ruta `committed` expuesta al lanzador.

La certificación de este lanzador debe ejecutarse solamente con variables, CA, PostgreSQL TLS y Storage sintéticos. La evidencia de pruebas no habilita conexiones productivas ni activa el nonce.
