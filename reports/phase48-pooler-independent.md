# Certificación local de conexiones READ ONLY detrás del transaction pooler

Base: `68d2c092c4d1fcc04708a81cd035567aff7b8663`. Rama exclusiva: `fix/phase48-pooler-independent-read`.

## Causa y regla sustituida

El destino utiliza un transaction pooler. El runner ya documentaba ese modo y eliminaba opciones de sesión fuera de la transacción. El recibo preservado terminó `STOPPED_DRIFT / SEPARATE_READ_CONNECTION_REQUIRED`: primera y segunda lecturas recibieron PID `988347`, pero transacciones virtuales `48/60011` y `48/60014`. La comparación rechazó la segunda conexión antes de recalcular sus digests. No se atribuye este STOPPED a drift de datos: no hubo segunda muestra completa.

La condición eliminada es `session.pid !== result.session.pid`. Un pooler puede asignar secuencialmente el mismo backend PostgreSQL a clientes físicos distintos. PID igual no demuestra reutilización insegura; PID diferente tampoco demuestra independencia. Se conserva el PID como evidencia informativa. Snapshot textual igual también se permite; un snapshot diferente se permite si coinciden los ocho digests.

Había además un único Pool compartido por las dos lecturas. Liberar un Client con `release(true)` no acreditaba dos Pools diferentes ni registraba dos eventos TLS. Esta implementación exige también esa separación física.

## Evidencia exigida

La fábrica crea un Pool nuevo por invocación y un Client nuevo, instala el observador de `secureConnect` desde el constructor del Client, antes del SSLRequest, y valida el TLSSocket real con el inspector TLS certificado. `sslconnect` sólo señala que existe el socket; no se cuenta como handshake. Se exigen exactamente un `secureConnect` observado por conexión y dos sockets distintos en producción.

La lectura A inicia `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`, calcula gates, previews y ocho digests, hace ROLLBACK, libera su Client y termina su Pool. Se espera tanto `Pool.end()` como el evento `close` del socket; también se exige `destroyed=true`. Sólo después se puede invocar la fábrica para B.

Se comparan por referencia Pool, Client, stream y TLSSocket. Se exige una nueva identidad local aleatoria y una transacción virtual válida diferente. B crea su propio repositorio y vuelve a consultar snapshot, candidatos, cobertura, afectados, estado mínimo y write-set. Cada origen debe incrementar el contador de consultas. Los objetos de los resultados de A se registran privadamente en un WeakSet: compartir cualquier objeto con B detiene la operación. No hay caché ni memoización de resultados entre lecturas.

El recibo registra únicamente UUID local, TLS protocol/cipher, PID informativo, transacción virtual, snapshot, contadores de consultas por origen y total, y timestamps de apertura, handshake, rollback y cierre. No serializa Pool, Client, stream, socket, IP, hostname, puertos, URL, usuario, contraseña ni certificados. Los resultados internos de A no se entregan a los cálculos de B.

Se mantienen TLSv1.3, authorized=true, rejectUnauthorized=true, CA/cadena/hostname/servername, READ ONLY, REPEATABLE READ, ROLLBACK, schema identity crítico, comparación 8/8, publicación atómica y contrato de autorización. Los módulos de TLS, target, repositorio/SQL, identidad crítica, recibos y economía/ejecutor del mutador se verifican sin cambios frente a la base.

## Prueba real local y alcance

Se inicializó un cluster PostgreSQL **17.11** aislado, accesible sólo por loopback. Un doble TLS de transaction pooler mantuvo un único backend real y recibió dos frontends Node nuevos. Ambos frontends tuvieron TLSv1.3, autorización del certificado sintético y un handshake observado; A cerró antes de crear B. El backend PID real fue igual, las transacciones virtuales distintas y el snapshot textual igual. Cada conexión ejecutó BEGIN READ ONLY con REPEATABLE READ, una consulta de metadatos y ROLLBACK: seis consultas totales, cero tablas de negocio, cero DDL/DML por la prueba. El cluster se detuvo y eliminó. La evidencia sanitizada exacta queda en `phase48-pooler-independent.cert.json`.

La prueba del ciclo completo y de los ocho digests utiliza dobles que generan objetos nuevos y contabilizan consultas; no ejecuta un preflight real ni lee tablas productivas. Se prueba PID igual y distinto; Pool/Client/stream/TLSSocket compartidos; A todavía abierta; transacción virtual repetida; snapshots iguales y diferentes; drift individual de cada uno de los ocho digests; handshake B ausente; fallo de cierre A; fallo B; resultados compartidos o copiados sin consultas; publicación atómica. Resultado: **151/151 pruebas, cero fallos y cero skips**, con el pin del mutador nuevo. Se ejecutan también runner, post-rollback 8/8, TLS, target, esquema crítico, contrato, mutador/rollback/idempotencia, typecheck, backend build, FrontendNuevo build y git diff --check. FrontendNuevo conserva el aviso no bloqueante sobre tamaño de chunks.

No se realizó sonda productiva mínima. Cero conexiones, consultas a tablas, escrituras y health calls productivos durante esta corrección. Sin preflight completo, migración, Phase 48, auditoría productiva, merge ni deploy. Las frases de las pruebas pertenecen exclusivamente a dobles; no se emitió autorización productiva.

## Mutador y commits

El contrato compartido del mutador valida `phase48-readonly-preflight.ts` y el entrypoint READ ONLY, que cambiaron. La validación añade también el nuevo módulo de conexión. Por ello se reemplaza y revoca `806f6f058b57b11aeadc478e4f35530b601cc128`. Se actualiza únicamente la rama permitida del entrypoint del mutador, conservando sus barreras y ejecución. No se ejecuta el mutador en producción.

El `mutator_commit` nuevo es `5759337bbdb8e936af4788491e4ab41cc6f31db3`, fijado en `phase48-readonly-contract.ts` y registrado en el certificado tras repetir las suites locales. El `readonly_runner_commit` final es el HEAD limpio publicado de esta rama, entregado en el informe final. El contrato sólo permite publicar el pin después del commit de código; cualquier otra diferencia en código validado detiene la conexión. Todos los runners hasta la base están revocados; la autorización vincula el commit del runner y el pin del mutador. Cambiar un commit invalida las frases anteriores.

## Recibo STOPPED preservado

Run ID: `phase48-preflight-9fe2295d-4282-482b-9533-385a31f5ef4b`.

Ruta durable: `C:/Users/CORE ULTRA/Documents/EmpiriaBackups/phase48-modalidad-pre-migracion-20261007T132031Z/stopped-preflights/phase48-preflight-9fe2295d-4282-482b-9533-385a31f5ef4b.stopped.json`.

Tamaño: **42386 bytes**. SHA-256: `2ad76ed669552616c018252ecc1d6449e3d307004628358552d41c52d56c2660`.

Se verificaron tamaño, SHA, run ID, STOPPED_DRIFT, nonce/frase nulos y ausencia de credenciales, endpoints, certificados e identificadores personales directos. Se movió intacto, sin regenerar JSON. El manifiesto sanitizado está en la misma carpeta, con sufijo `.manifest.json`. Tamaño y SHA se comprobaron después del movimiento.

## Archivos modificados frente a la base

- `.gitignore`
- `release/certify-phase48-pooler-local.ps1`
- `src/modules/cobertura/phase48-readonly-connection.ts`
- `src/modules/cobertura/phase48-readonly-contract.ts`
- `src/modules/cobertura/phase48-readonly-preflight.ts`
- `src/scripts/phase48-production-readonly.ts`
- `src/scripts/phase48-historical-production.ts`
- `src/scripts/phase48-pooler-local-guard.cjs`
- `src/scripts/certify-phase48-pooler-independent.cjs`
- `src/tests/phase48.pooler-local.test.ts`
- `src/tests/phase48.postrollback-eight.test.ts`
- `src/tests/phase48.readonly-runner.test.ts`
- `src/tests/phase48.tls13-runtime.test.ts`
- `reports/phase48-pooler-independent.cert.json`
- `reports/phase48-pooler-independent.md`

Decisión, sujeta al certificado exitoso y al HEAD final limpio: **CONEXIONES READ ONLY INDEPENDIENTES CERTIFICADAS — LISTO PARA NUEVO PREFLIGHT**. Este resultado no autoriza ejecutar un nuevo preflight.
