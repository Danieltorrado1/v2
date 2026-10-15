# V6: ventana de ejecución y recibos

Decisión: **V6 RECERTIFICADO — REQUIERE NUEVO PREFLIGHT Y AUTORIZACIÓN**.

Alcance: PostgreSQL **17.11**, fixtures sintéticos de 740 candidatos, exclusivamente en `127.0.0.1:55470`. Este trabajo no constituye un preflight productivo. Conexiones productivas = 0; escrituras productivas = 0; no se generó nonce productivo. No se hizo merge ni deploy.

Rama aislada: `fix/phase48-v6-execution-window`, creada desde `6f0e6930dfcb8752e7c9cdbea9360a57f2d4c769`. El mutador anterior `e165a537c577334241cf013d3f474d4c226333e8` y el runner anterior quedan rechazados para autorizaciones nuevas. Se conservan en el historial Git. El nuevo contrato es `phase48-scoped-v6-window-1`; no acepta frases del contrato anterior.

## Causa temporal exacta

En el intento detenido, `mutateV6` llamaba a `authority.issue` antes de crear/conectar los clientes. El TTL de `SCOPED_TTL_MS=120000` empezaba en esa llamada y consumía flags, conexión, identidad, primera captura completa, inicio SERIALIZABLE, advisory lock, locks de tablas/secuencias y la segunda captura independiente bajo lock. Después todavía faltaban la captura del writer, definiciones, DDL, DML, auditorías y postchecks.

| Evento preservado | UTC | Tiempo desde creación del sello |
|---|---|---:|
| Sello anterior creado | 2026-10-15 11:32:15.745 | 0 s |
| AFTER_LOCK, locks esperando=0, DDL=0 | 11:33:43.097 | 87,352 s |
| Expiración del sello | 11:34:15.745 | 120 s |
| Cierre del intento, SCOPED_SEAL_EXPIRED | 11:35:03.165 | 167,420 s |

La revalidación tras la captura independiente detectó expiración antes de la captura final del writer y del primer DML. Se revirtieron los cuatro ALTER SEQUENCE; no hubo DML ni nuevas auditorías. Los dos recibos originales y el marcador CONSUMED conservan sus bytes, rutas y hashes: [manifiesto](preserved-evidence.json). El parser archivado se ejecutó offline contra la frase original y devolvió `V6_AUTHORIZATION_EXPIRED`; el contrato nuevo devuelve `V6_SCOPE_REQUIRED`. [Evidencia de rechazo](prior-authorization-rejection.json).

## Autorización humana y autoridad interna

La autorización humana conserva su nonce, issued_at y expires_at, con máximo de 15 minutos. Se comprueba al iniciar el intento, durante las capturas y nuevamente inmediatamente antes de adquirir autoridad mutadora. El nonce se reclama mediante creación exclusiva de un directorio persistente, además del marcador CONSUMED. Una caída entre ambas publicaciones también impide reutilizarlo con otro run_id.

El sello nuevo se emite **dentro de SERIALIZABLE**, después de:

1. Captura inicial y comparación de población/digests.
2. Advisory lock 15/2449, locks de tablas y de secuencias.
3. Captura independiente fresca bajo lock y captura del writer.
4. Comparación de los 17 digests, plan histórico, identidades, 1203, categorías, archivos y períodos.
5. Definiciones críticas, flags, actividad y comprobación de los locks efectivos.

Solo entonces se crea y publica el sello; comienza la fase de escritura, incluyendo el DDL de Phase 48 y después el primer UPDATE. Ningún DML ni DDL de Phase 48 puede precederlo. Los ALTER SEQUENCE para adquirir locks son la excepción explícita anterior al sello, dentro de la misma transacción.

El HMAC del sello enlaza población/IDs, 17 digests, autorización completa, hash de frase, hash de preflight, política de tiempo, PID, transaction_id, virtual transaction, inventario de locks, write-set y estados originales de secuencias. Antes del DML y COMMIT se comprueban PID/transacción/locks. Cada consulta sellada comprueba vigencia antes y después; el presupuesto también limita el número de consultas a 400. La API que aceptaba sellos previos a la transacción y sus rutas heredadas quedan rechazadas.

La reversión post-COMMIT tiene autorización y nonce propios, otro run_id de ejecución y otro sello interno emitido bajo sus locks. Nunca se ejecuta automáticamente.

## TTL medido, margen y límite

El TTL interno es **100.000 ms**, con límite absoluto **120.000 ms**. No se aumentó el límite anterior.

| Latencia añadida por consulta, exclusivamente local | Tramo desde creación del sello hasta COMMIT |
|---:|---:|
| 0 ms | 548,541 ms |
| 25 ms | 9.461,890 ms |
| 100 ms | 32.018,379 ms |

Fórmula: `ceil((max_medido × 3 + 2000 ms) / 5000 ms) × 5000 ms = 100000 ms`. El margen conserva un factor tres sobre el peor perfil medido y dos segundos fijos. Si la medición excede el límite, la certificación se detiene. Los SELECT de postcheck dejaron de emitir un SET redundante por consulta; se mantienen verificaciones de vigencia y timeout de sentencia de hasta 5 s, con deadline restante refrescado para mutaciones y COMMIT. Se aplica también timeout de cliente de 5 s e inactividad transaccional de 5 s en el tramo sellado.

Las mediciones no prometen finalización frente a cualquier latencia productiva. Si se agota el presupuesto, no se permite continuar hasta COMMIT. Una respuesta perdida de COMMIT se trata como estado desconocido que requiere verificación de auditorías; no se declara rollback ni se ejecuta reversión automática.

Una prueba real esperó **121 segundos** antes de crear el sello y después completó COMMIT local. No usó un salto de reloj para esa espera: [medición](real-slow-gate.json). Hay pruebas adicionales con reloj controlado para expiración antes de autoridad, antes del primer DML, durante DML y dentro de un postcheck real.

## Cronometría por fase

Ejemplo de la pasada final con cuatro secuencias, en milisegundos locales:

| Fase | Tiempo |
|---|---:|
| Lectura/parser de autorización | 0,294 |
| Conexión writer / observer | 15,193 / 14,637 |
| Captura inicial | 148,859 |
| Inicio SERIALIZABLE / advisory lock | 0,246 / 0,227 |
| Locks de tablas | 0,552 |
| Locks de secuencias, individualmente | 1,595 / 0,542 / 0,887 / 0,437 |
| Captura independiente bajo lock | 105,308 |
| Captura del writer bajo lock | 122,741 |
| Crear y publicar sello | 152,861 |
| UPDATE Phase 48 / INSERT Albeny | 10,831 / 0,926 |
| UPDATE Dary / UPDATE 1203 | 0,437 / 0,323 |
| Validación exacta del write-set original | 5,790 |
| Ocho INSERT de auditoría, acumulado | 24,282 |
| Postchecks internos / externos | 130,343 / 101,755 |
| COMMIT / publicación COMMITTED | 7,627 / 149,283 |

La fase offline del host de pruebas es un doble sin credenciales; su tiempo no representa Git/TLS/credenciales productivas. La verificación posterior del pin Git se hace offline, sin invocar el host productivo. El JSON detallado contiene población, cada cálculo de digest, proyecciones, validaciones individuales de Albeny/Dary/1203, archivos, períodos 4/6, primer/último DML, auditorías y publicación.

El primer informe conservó tiempos de proyección de campos ya calculados. El suplemento final distingue `digest:*` (cálculo real) de `digest_projection:*` (lectura del contrato), sin reemplazar ese informe: [cronometría final](timing-computation-final.json), [perfiles de latencia](timing-profiles.json).

## Rutas exclusivas e inmutables

Todas bajo el directorio privado de recibos configurado, con `phase48-<uuid>`:

| Tipo | Nombre |
|---|---|
| Base preflight | `<preflight_run_id>.preflight.json` |
| Autorización pendiente | `<run_id>.pending.json` |
| Intento iniciado | `<run_id>.started.json` |
| Sello interno | `<run_id>.seal.json` |
| Detenido | `<run_id>.stopped.json` |
| Rollback confirmado | `<run_id>.rolledback.json` |
| COMMIT | `<run_id>.committed.json` |
| Postflight | `<run_id>.postflight.json` |
| Idempotencia | `<run_id>.idempotency.json` |
| Reversión separada | `<reversal_run_id>.reversed.json` |

Pendiente enlaza el preflight; iniciado enlaza preflight/pendiente; sello enlaza iniciado; COMMITTED enlaza sello; postflight e idempotencia enlazan COMMITTED. STOPPED y ROLLED_BACK tienen rutas propias. La reversión enlaza el COMMITTED original mediante su iniciado y sello propios.

Se conservan publicación atómica, fsync, creación exclusiva y rename sin reemplazo. Un destino existente se rechaza incluso con bytes idénticos. Hay precheck de destinos antes de conectar. Los marcadores de intento y nonce se conservan tras caída; no se recuperan para repetir DML. Solo se limpian temporales del publicador actual. Los locks/temporales huérfanos de otro proceso no se borran: si impiden publicar, la recuperación se detiene sin sobrescribir. En Windows no hay garantía portable de fsync del directorio frente a pérdida de alimentación; se conserva la limitación del publicador certificado.

La recuperación verifica HMAC, frase/preflight, postimages, auditorías estrictas, datos protegidos y rutas/hashes del recibo COMMITTED existente. Es READ ONLY. Una colisión de publicación después de COMMIT no autoriza repetir ni revertir la operación.

## Auditoría de secuencias

Se mantienen los locks de las cuatro secuencias observadas: `auditoria_eventos_id_seq`, `auditoria_id_seq`, `cobertura_asignaciones_id_seq` y `nomina_periodo_26_25_auditoria_id_seq`. El SQL utiliza el CACHE sellado, no una constante que lo cambie a 1.

En PostgreSQL 17.11 local, `ALTER SEQUENCE ... CACHE <valor_actual>` obtiene `ShareRowExclusiveLock`. La prueba verificó bloqueo de `nextval` y `setval` en una conexión independiente para las cuatro. Se ensayaron CACHE 1 y 7 y un cambio real a 9 dentro de la transacción; después de ROLLBACK reapareció el valor original. No se consumen IDs al tomar el lock. ALTER es una operación de catálogo y puede producir actividad observable aunque mantenga el mismo valor lógico; no se afirma que sea físicamente una lectura.

`LOCK TABLE <secuencia>` devolvió SQLSTATE 42809. Un advisory lock por sí solo no bloquea consumidores ordinarios de secuencias. No se demostró otra alternativa equivalente sin operación de catálogo, por lo que no se relajó la protección. PostgreSQL documenta que ALTER SEQUENCE bloquea las llamadas concurrentes a las funciones de secuencia: [documentación oficial 17](https://www.postgresql.org/docs/17/sql-altersequence.html).

El fixture de operación completa incorporó una cuarta secuencia con el nombre observado mediante ownership en la clausura crítica; no se presenta como una restauración productiva. Los recibos guardan estado previo y postchecks de las cuatro secuencias: [prueba de locks](sequence-lock-audit.json), [operación completa](four-sequence-full.json). El intento productivo anterior queda acreditado únicamente por sus recibos preservados, sin nuevas conexiones.

## Pruebas y límites

**103 casos únicos aprobados**: suite completa de 100, 39 regresiones finales (incluidas tres nuevas), más dos operaciones completas finales con la instrumentación de cálculo de hashes. Typecheck, build y diff-check aprobados. El clúster local se detuvo y sus logs se conservaron.

Cobertura: 740 candidatos, las tres correcciones, períodos anulados y archivos, conservación económica, 17 alteraciones de digests rechazadas, expiración de autorización/sello, rollback de datos/esquema/secuencias/auditorías, fallos reales de constraint, carreras, todas las rutas de recibos, caídas antes/después de cada publicación y en conexión/locks/DML/auditorías/COMMIT, reinicio sin repetir DML, recibo alterado, idempotencia y reversión autorizada aparte. La espera de 121 s y las latencias inyectadas son pruebas locales reproducibles, no una medición actual de Render/Supabase.

Evidencias: [certificado inicial](certificate.local.json), [suplemento final enlazado](certificate.final.json), [suite](full-suite.tap), [regresiones](final-regressions.tap), [instrumentación final](timing-computation-regressions.tap). No se sustituyeron evidencias intermedias.

[Frase sintética REVOCADA](synthetic-revoked-phrase.json): nonce fijo de ceros, commits ficticios y expiración en 1970. No constituye solicitud productiva. El nonce anterior real continúa CONSUMED.

El nuevo `mutator_commit` queda fijado en `phase48-v6-evidence.ts` después del commit de implementación; `readonly_runner_commit` es el HEAD limpio que contiene ese pin. Se requiere un preflight nuevo y autorización literal nueva antes de cualquier ejecución productiva.
