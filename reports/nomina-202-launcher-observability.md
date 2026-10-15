# Nómina 202: observabilidad del lanzador

Fecha: 2026-10-15. Alcance: diagnóstico offline y pruebas locales sintéticas. No se consultó `.env`, health, PostgreSQL ni Storage productivos; no se ejecutó el corrector.

## Reconciliación del intento anterior

El resultado conservado de la sesión fue `LAUNCHER_STOPPED_UNEXPECTED`. El directorio de recibos `reports/nomina-202-entry` no existía al inventariar el workspace y no había recibo baseline ni final. Se registra para ese intento: **`MISSING_EXECUTION_RECEIPT`**. No se creó ni reconstruyó un recibo retrospectivo.

No se encontró un log o temporal identificable como perteneciente a esa ejecución. Los artefactos de certificación preexistentes se dejaron intactos; el informe de rutas/target existente quedó identificado por SHA-256 `fa6229facbbb67f8e763ade33a6ec475711c09ce0d46247f7bc2d0762cbd0ac` y no se atribuyó al intento fallido. La fase efectiva no puede establecerse con la evidencia disponible.

## Causa demostrable

El código anterior colocaba `createProductionPlan()` antes del `try/finally` del lanzador. La CLI convertía cualquier error cuyo mensaje no coincidiera con el patrón de códigos conocidos —incluidos valores lanzados que no fueran `Error`— en `LAUNCHER_STOPPED_UNEXPECTED`. Además, varios `catch` del runner sustituían errores de conexión, lectura o snapshot por errores genéricos sin conservar su causa. Estos defectos explican cómo se produjo la etiqueta genérica, pero no demuestran qué operación falló en la ejecución productiva anterior.

## Cambio local

- La frontera de ejecución cubre la creación del plan y cada fase posterior, y mantiene un estado fail-closed con intentos/resultados de health, credenciales, target, dos conexiones, dos transacciones, rollback/cierre, PDF y publicación. `writes` permanece en cero y `mutator_invoked` es siempre `false`.
- El runner emite eventos de fase antes de operaciones fallables. Los errores de captura/rollback/cierre mantienen la causa original internamente; el recibo expone sólo tipo, código/SQLSTATE permitido, categoría, fase, tipo de causa y SHA-256 del stack.
- Ante fallo después de iniciar el precheck, el lanzador intenta health final cuando health inicial fue intentado y publica un STOPPED en su ruta reservada. Si el primer intento de publicación falla, reintenta con un recibo mínimo en la misma ruta mediante el publicador atómico.
- STOPPED requiere esquema versionado, JSON serializado con LF, parseo de comprobación, publicación atómica sin reemplazo y verificación posterior de tamaño, SHA y JSON. No requiere baseline ni nonce.
- La CLI ya no emite `LAUNCHER_STOPPED_UNEXPECTED`; muestra un código y metadatos sanitizados. Los mensajes, URLs, secretos, filas y bytes documentales no se incorporan al recibo ni a stderr.

## Certificación local

La matriz sintética inyectó throwables etiquetados con las fases de precheck, health inicial/final, credenciales, target, CA, conexiones, BEGIN, consulta, rollback, cierre, drift, PDF, publicaciones baseline/final y publicación STOPPED en la frontera común de registro. Verificó fase, categoría, hash de stack, ausencia de texto secreto, `writes=0`, mutador falso y conservación de colisiones. También cubrió un throwable no-`Error` y el reintento de publicación. No simula cada proveedor de red ni demuestra una conexión PostgreSQL/TLS integral en este cambio.

Validación ejecutada: typecheck backend PASS; build backend PASS; suite `test:nomina-202:performance` PASS (94/94); build frontend PASS; `git diff --check` PASS. El frontend informó su aviso usual de chunk mayor a 500 kB.

Esta certificación demuestra el manejo del límite exterior y del publicador con fixtures locales. No determina la fase ni la causa del intento productivo previo y no sustituye una futura repetición autorizada del preflight.
