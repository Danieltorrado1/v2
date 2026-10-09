# Verificación post-rollback Phase 48

Rama: `fix/phase48-postrollback-eight-digests`, creada desde
`dba731471164e5ff3c24ec64d868dbabddd327d8`.
Este informe certifica exclusivamente código y pruebas locales. No autoriza
preflight, conexiones, consultas health ni escrituras productivas.

El mutador de referencia es `9c344ce12ae196558ca1dab1c8f52a14150cdda7`.
El pin final se publica en `MUTATOR_COMMIT` y en el certificado adjunto.
El dominio histórico, SQL atómico y guard local conservan exactamente sus
fuentes de referencia. Se migra el campo de candidatos en la comprobación
del mutador para que comparta el contrato canónico del runner READ ONLY.

## Preservación previa al cambio de código

El estado inicial tenía únicamente el recibo STOPPED sin rastrear y el HEAD
base exacto. Se verificaron run_id, estado, tamaño y SHA antes y después de
moverlo sin sobrescribir archivos existentes. El árbol quedó limpio antes
de crear la rama.

Archivo preservado:
`C:/Users/CORE ULTRA/Documents/EmpiriaBackups/phase48-modalidad-pre-migracion-20261007T132031Z/stopped-preflights/phase48-preflight-5aef16dc-5729-4a56-b5c2-3213157fc496.stopped.json`

Tamaño: **6025 bytes**. SHA-256:
`5846563E3DC293D5D5DC6476566A266DAC90C10AF19F215E51DBEBCFD0C2A817`.
El manifiesto sanitizado está junto al recibo con sufijo `.manifest.json`.
La revisión de contenido encontró únicamente metadatos técnicos e indicadores
de detención; no credenciales, secretos, PEM ni filas personales.

Backup exacto, sin modificación:
`4271775ee853bf03b9f70402f7ecfd7becbe048269e3b10c76f027f981303e26`.
Certificado exacto, sin modificación:
`700723581420DD1AC98FD7E9AC529F0EF210EADCAF87FC868A3AD7D114C2F3B7`.

## Contrato vigente

Los doce nombres definitivos son:

```text
readonly_runner_commit
mutator_commit
backup_sha256
certificate_sha256
schema_digest
source_digest
phase48_candidates_digest
albeny_before_digest
dary_before_digest
protected_tables_digest
periods_4_6_digest
write_set_before_digest
```

La forma singular anterior se conserva únicamente como entrada negativa de
prueba. No se acepta como alias ni se normaliza. El parser rechaza campos
ausentes, adicionales, duplicados, reordenados, tipos/hash incorrectos,
espacios y representaciones numéricas o temporales ambiguas.

La frase tiene exactamente 36 campos, con prefijo
`AUTHORIZE_PHASE48_HISTORICAL`, en este orden:

```text
empresa=15
contrato=24
actor=12
expected_rows=730
readonly_runner_commit=<HEAD exacto del runner>
mutator_commit=<MUTATOR_COMMIT certificado>
backup_sha256=<backup exacto>
certificate_sha256=<certificado exacto>
project_ref=scuvsocqibbubqnesvuf
schema_digest=<64 hex minúsculas>
source_digest=<64 hex minúsculas>
phase48_candidates_digest=<64 hex minúsculas>
albeny_before_digest=<64 hex minúsculas>
dary_before_digest=<64 hex minúsculas>
protected_tables_digest=<64 hex minúsculas>
periods_4_6_digest=<64 hex minúsculas>
write_set_before_digest=<64 hex minúsculas>
nonce=<64 hex minúsculas>
issued_at=<ISO UTC milisegundos>
expires_at=<ISO UTC milisegundos, máximo 10 minutos>
atomicPhase48AndCorrections=true
suppressExternalSync=true
preserveOperationalSources=true
strictAudit=true
rollbackOnAnyFailure=true
preserveCancelledPeriods=true
preservedPeriods=4,6
albenyHistoricalCorrectionConfirmed=true
albenyCoverage=18/08/2026-08/09/2026
albenyExistingCoverage1224Preserved=true
albenyAttendancesPreserved=16
daryHistoricalCorrectionConfirmed=true
daryCoverage11=29/07/2026-31/07/2026
daryRequiresSalaryReview=true
daryCategory34Forbidden=true
daryAttendancesCreated=0
```

La serialización une esos campos con `|`, sin saltos de línea. Esta plantilla
no es una autorización. Las compuertas health, OUTBOX, SYNC, RECALC y worker
siguen siendo obligatorias en ambas lecturas; sus nombres no añaden campos
a la frase. El mutador y el grant usan el mismo parser, pin, certificado,
backup y ocho nombres de digest. La aprobación productiva sigue REVOCADA.

## Dos lecturas independientes

El runner usa un Pool de tamaño uno y obtiene un PoolClient principal.
Ejecuta `BEGIN`, `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`,
confirma READ ONLY, captura sesión/snapshot y hace todas las lecturas y previews
en esa transacción. El finally ejecuta ROLLBACK y se destruye el cliente con
`release(true)` antes de solicitar el segundo PoolClient.

La segunda transacción repite esas instrucciones y crea su propio repositorio.
Vuelve a consultar esquema, tablas, secuencias, candidatos, coberturas,
vinculaciones, asistencias, periodos y write-set. `recomputeDigests` recibe
exclusivamente los resultados nuevos. No usa objetos ni resultados de la
primera lectura para calcular los ocho valores posteriores.

Se compara individualmente cada digest antes de las compuertas finales. Un
drift produce STOPPED_DRIFT, lista únicamente los nombres afectados, deja
stable=false y revoca nonce/frase. No clasifica el cambio. También fallan
cerrado los errores de adquisición, lectura, ROLLBACK y cierre.

La segunda lectura vuelve a validar locks=0, DDL=0, NO_APLICADA, 730 candidatos,
tenant/actor, estados históricos, periodos ANULADOS 4/6, health y flags.
Septiembre se registra NOT_APPLICABLE. El segundo ROLLBACK está en finally.
La frase se emite después de confirmar ROLLBACK y cierre; el Pool termina
antes de publicar el recibo. Un fallo al cerrar el Pool revoca la frase.

La independencia se prueba con cliente, PID y virtual transaction distintos.
PostgreSQL puede devolver el mismo texto de `pg_current_snapshot()` en dos
transacciones nuevas si no hubo commits entre ellas: ese texto no identifica
la conexión. Ambos snapshots se capturan otra vez y quedan separados en el
recibo; no se fuerza una escritura para cambiar la representación del snapshot.

## Recibo único y revocación

El único archivo de un futuro preflight es
`reports/phase48-production-preflight-current.json`, schema_version=4.
Contiene first_snapshot, post_rollback_snapshot, first_digests,
post_rollback_digests, digest_comparison y stable. Pending requiere ocho
comparaciones verdaderas y todas las compuertas y cierres confirmados.

La publicación y el consumo se serializan mediante un directorio transitorio
exclusivo en la misma carpeta, sin archivos auxiliares. El directorio se elimina
al finalizar. Un bloqueo residual o un recibo parcialmente escrito falla
cerrado; no se consume ni ejecuta una autorización desde JSON corrupto.
La escritura del único recibo es directa, sin rename/archivo temporal.

Todas las frases del contrato anterior quedan revocadas: cambian nombre,
campos, orden y pin. Se rechazan además todos los commits del runner iguales
o anteriores al HEAD base. El nonce se liga al recibo verificado de ocho
digests, expira como máximo a los diez minutos y solo se consume una vez.
Un nuevo recibo registra la revocación del anterior.

## Límites de la certificación

No se leyó `.env` productivo, no se ejecutó la entrada productiva ni hubo
conexiones, health, DDL, DML, auditorías o operaciones de secuencias productivas.
Los fixtures SQL de rollback, drift e idempotencia se ejecutan exclusivamente
en una restauración desechable en 127.0.0.1:55466, PostgreSQL 17.11.
Los metadatos 17.6/TLS de los escenarios del mutador son sintéticos; las
transacciones y rollback locales son reales.

FrontendNuevo compila; informa un aviso de chunks superiores a 500 kB.
El frontend legado no tiene `Frontend/node_modules/.bin/vite.cmd`; no se
inició ni se instaló. No se modifica ningún workspace o rama de Nómina.
