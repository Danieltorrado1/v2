# Recertificación final local del runner READ ONLY

Fecha: 2026-10-15, America/Bogota\
Commit de entrada/runner/certificador: `62e8c52f6a3ac4e3a7e495931beb0e535f299e03`\
Commit del corrector certificado: `95fc6bb6879409d37a088e451fb64f2edafacb5f`\
Informe completo: `report.json`, SHA-256 `1e2d8cfed0889bd238383054296870c1226be0f5fc89793d652755c584cabca8`

## Aislamiento

El lector independiente usa `pg.Client`, no importa el corrector ni su adaptador, y devuelve solamente `PENDING_USER_CONFIRMATION`. Valida pins de commit/artefactos/destino antes del proveedor de credenciales. Git recibe una allowlist explícita de variables no secretas; el código no enumera el entorno, no carga `.env`, no consulta `DATABASE_URL` ni lee credenciales productivas.

La certificación restauró el dump verificado en un cluster PostgreSQL 17.11 nuevo, loopback puerto 65217, con TLS 1.3, CA/certificado efímeros, health loopback y credenciales sintéticas. Dos clientes nuevos y secuenciales ejecutaron `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, verificaron `transaction_read_only=on`, tomaron snapshots reales, ejecutaron `ROLLBACK` explícito y cerraron. No se generó run_id/nonce/frase productivos ni se invocó el mutador desde el runner.

## Before-state y snapshots

El before-state fue exacto: movimiento 192 PENDIENTE, cantidad 1, tarifa/calculado/total 97.800 y seguridad social falsa; turno 202 del 8 al 9 de septiembre de 2026 con dos días inclusivos; detalle 220 activo por 97.800; cuenta 77 activa PENDIENTE por 97.800; revisión 20114 REVISADO/v30; periodo abierto; actor 12 activo y autorizado en empresa 15/contrato 24. Health 200/database ok, OUTBOX/SYNC/RECALC falsos y worker detenido; locks esperando=0, DDL=0; sin duplicados, reparación previa ni bloqueadores de pagos/liquidación/desprendibles. El PDF histórico midió 3.051 bytes y el SHA esperado.

Los dos snapshots coincidieron en los doce digests canónicos. Sus valores, baseline de secuencias, conteos de auditoría/historial y verificaciones están en `report.json`; `initial-table-digests.json`, `262-table-comparison.json` y `explain-analyze-sanitized.json` conservan la evidencia de digests, write-set y planes.

## Seguridad, rendimiento y regresión económica

El preflight positivo tardó 537.2 ms: 28 consultas SQL, 22 de captura (11 por snapshot) y 6 de transacción/verificación (BEGIN, confirmación READ ONLY y ROLLBACK por snapshot). Las auditorías/historial se consultan por alcance con topes; el runner no materializa el historial global ni usa N+1. DDL, DML y `nextval()` fueron rechazados por PostgreSQL con SQLSTATE `25006`; la secuencia de prueba no avanzó.

Casos negativos reales locales: HTTP 503, SYNC=true, hostname incorrecto, CA no confiable, conexión rechazada, drift PDF, drift de snapshot y drift de una fila de cuenta entre las dos transacciones produjeron STOPPED. El último caso alteró temporalmente sólo el cluster de prueba después del primer snapshot, verificó `STOPPED_SNAPSHOT_DRIFT` y restauró la fila; no tocó datos externos. Contrato inválido, PENDING/no ACTIVE, nonces expirado/revocado/reutilizado/desconocido, cambios de campos/digests y colisiones/rutas de recibo también se rechazaron en las pruebas.

El corrector separado pasó con exactamente 7 tablas modificadas y 255 intactas: cantidad 2 y total 195.600; detalle 220 conservó identidad y valor; cuenta 77 siguió PENDIENTE con referencia antigua invalidada; revisión pasó a REQUIERE_REVISION/v31; 4 auditorías por repositorio y 42 historiales canónicos. El PDF histórico quedó intacto y la generación/recuperación documental local pasó después del commit económico.

Secuencias COMMIT exactas: `auditoria_id_seq +4`, `auditoria_eventos_id_seq +4`, `nomina_revision_operativa_id_seq +1`, `historial_cambios_id_seq +42`. ALREADY_APPLIED no insertó filas ni avanzó ninguna de las 213 secuencias. Rollback inducido conservó datos de las 262 tablas y persistió cero filas; los huecos observados `+4/+4/+1/+1` fueron monotónicos y no superaron máximos `4/4/1/42`. Sin `setval`, reinicios, retroceso ni reutilización.

El corrector tardó 61.7 ms. Las comparaciones globales de 262 tablas tardaron 2.687 s antes y 2.690 s después, fuera de la transacción mutadora. El RSS del proceso Node certificador fue 82.776.064 bytes; PostgreSQL se ejecutó aparte. Locks/DDL quedaron en cero. El cluster desechable se detuvo (PID 36276) y el inventario posterior no encontró procesos huérfanos.

## Validación y alcance

La suite `test:nomina-202:performance` pasó 72/72; typecheck, backend build, frontend build y `git diff --check` pasaron. El build frontend conserva el aviso de bundle grande. No hubo merge ni deploy. El resultado habilita únicamente solicitar un preflight real READ ONLY en un paso futuro; no autoriza corrección, recálculo, sincronización ni publicación productiva.
