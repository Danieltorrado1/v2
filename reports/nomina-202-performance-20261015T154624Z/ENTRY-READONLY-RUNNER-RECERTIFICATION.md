# Recertificación local del runner PostgreSQL READ ONLY

Fecha: 2026-10-15, America/Bogota\
Commit de entrada y runner: `d2d458ce98791550475a8f47138d446eca85bdeb`\
Commit base del corrector certificado: `95fc6bb6879409d37a088e451fb64f2edafacb5f`\
Informe de certificación: `report.json`, SHA-256 `91336f619712ccd4cfb9524590d0c44329479f86740fbe0c50998d5afabca686`

## Aislamiento

El runner usa `pg.Client` independiente, separado de los adaptadores mutadores y sin dependencia que permita invocar el corrector. Valida pins offline, branch/HEAD/ancestro, artefactos y destino antes de solicitar credenciales. Git recibe sólo variables de proceso explícitamente permitidas (`PATH`, rutas del sistema y temporales); ni el runner ni el certificador enumeran el entorno, cargan `.env`, consultan `DATABASE_URL` o leen credenciales productivas.

La certificación usó una restauración completa local PostgreSQL 17.11, loopback `127.0.0.1:56526`, TLS 1.3 con certificado/CA efímeros, endpoint health loopback, copia local del dump y del PDF, y credenciales sintéticas. Se crearon dos clientes nuevos y secuenciales; cada uno inició `REPEATABLE READ READ ONLY`, confirmó `transaction_read_only=on`, calculó los datos reales, ejecutó `ROLLBACK` explícito y cerró. El resultado fue exclusivamente `PENDING_USER_CONFIRMATION` sintético. No se generaron IDs de autorización, no se activó nonce y no se invocó el mutador desde el runner.

## Before-state y digests

Se verificó movimiento 192 PENDIENTE, cantidad 1, tarifa/calculado/total 97.800, `afecta_seguridad_social=false`; turno 202 del 8 al 9 de septiembre de 2026 con dos días inclusivos; detalle 220 activo por 97.800; cuenta 77 activa PENDIENTE por 97.800; revisión 20114 REVISADO/v30; periodo abierto; actor 12 activo y con rol/scope de empresa 15 y contrato 24. Health fue 200 con database ok, OUTBOX/SYNC/RECALC falsos y worker detenido. Locks esperando=0, DDL=0; no se encontraron duplicados, reparación previa ni bloqueadores de pagos/liquidaciones/desprendibles. El PDF histórico mantuvo 3.051 bytes y su SHA-256 certificado.

Los dos snapshots coincidieron exactamente en los 12 digests; sus valores completos, secuencias iniciales, conteos de auditoría/historial y checks están en `report.json`. También se conservaron `initial-table-digests.json`, `262-table-comparison.json` y los planes sanitizados en `explain-analyze-sanitized.json`.

## Ejecución y protecciones

El preflight positivo tomó 552.9 ms y emitió 28 queries PostgreSQL: 22 consultas de captura (11 por snapshot) y 6 de transacción/verificación (BEGIN, confirmación READ ONLY y ROLLBACK por snapshot). No materializa el historial completo en Node; las lecturas relacionadas están limitadas por alcance y topes, y un alcance saturado detiene la entrada. DDL, DML y `nextval()` fueron rechazados en transacciones reales READ ONLY con SQLSTATE `25006`, sin cambio de la secuencia probada.

Los casos negativos locales produjeron STOPPED para HTTP 503, SYNC=true, hostname inválido, CA no confiable, conexión rechazada, cambio de PDF y drift entre snapshots. Las pruebas también cubren error de contrato antes del callback de credenciales, nonce vencido/revocado/reutilizado/desconocido, rechazo de PENDING como ACTIVE, alteración de digests/campos, rutas separadas y publicación atómica sin reemplazo.

El corrector independiente pasó en el mismo dump restaurado: siete tablas autorizadas modificadas y 255 intactas; movimiento/detalle/cuenta por 195.600; cuenta aún PENDIENTE; revisión REQUIERE_REVISION/v31; cuatro filas nuevas por repositorio de auditoría y 42 historiales canónicos. El PDF histórico quedó preservado y el versionado/recuperación documental local pasó después del commit económico.

Avances exactos de secuencia en COMMIT: `auditoria_id_seq +4`, `auditoria_eventos_id_seq +4`, `nomina_revision_operativa_id_seq +1`, `historial_cambios_id_seq +42`. ALREADY_APPLIED no avanzó ninguna de las 213 secuencias ni agregó filas. El rollback inducido conservó los datos de las 262 tablas, persistió cero filas y produjo únicamente huecos monotónicos permitidos `+4/+4/+1/+1`, todos bajo los máximos `4/4/1/42`. No hubo `setval`, reinicios, retrocesos ni reutilización.

Rendimiento local: corrector 60.2 ms; comparación de 262 tablas antes 2.671 s y después 2.620 s, fuera de la transacción mutadora; comparación completa y restore registrados en el informe. El RSS del proceso Node certificador fue 84.201.472 bytes; PostgreSQL fue un proceso separado. Los locks y DDL siguieron en cero. La certificación detuvo su cluster desechable (PID 25964), y el inventario final no encontró procesos huérfanos.

## Validación y límites

`test:nomina-202:performance`: 72/72; typecheck y builds backend/frontend pasaron; `git diff --check` pasó. El build frontend conserva el aviso habitual sobre el tamaño del bundle. Ningún merge o deploy se realizó. Esta evidencia habilita sólo un futuro preflight real READ ONLY tras autorización separada; no autoriza la corrección, recálculo, sincronización ni publicación documental productiva.
