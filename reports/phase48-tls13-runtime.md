# Phase 48: validación TLS 1.3 del transporte Node

Base exacta: `9428f22644e895592e940193579d03202b9df1ec`.
Rama exclusiva: `fix/phase48-tls13-runtime-validation`.

## Causa

`productionReadOnlyPreflight` evaluaba `session.version === '17.6' && await repo.ssl()` después de BEGIN READ ONLY, configurar la transacción y obtener la sesión. El recibo STOPPED confirma `server_version=17.6`; por tanto falló `repo.ssl()`. Esa función consultaba `pg_stat_ssl` por el PID del backend y exigía `ssl=true, version=TLSv1.3`. En el pooler transaccional esa vista describe el enlace pooler–PostgreSQL, no el enlace Node–pooler. El mutador tenía el mismo error conceptual. No se guardó la fila de esa vista: no se puede afirmar si contenía TLS 1.2, otro valor o ausencia de SSL, y no se volvió a consultar.

El `tls.protocol=null` del recibo se calculaba a partir de `receipt.postgresql?.ssl`, que aún no existía al fallar la compuerta. Nunca fue el resultado de `TLSSocket.getProtocol()`. No hay evidencia de un problema de mayúsculas, espacios o comparación de `TLS1.3` con `TLSv1.3`.

El driver instalado pg 8.16.3 cambia `connection.stream` del Socket TCP a `tls.connect(options)` tras la respuesta PostgreSQL SSLRequest. Su evento `sslconnect` ocurre inmediatamente después de crear el socket, antes de `secureConnect`; no es prueba de handshake completo. `pool.connect()` devuelve el Client adquirido después de ReadyForQuery. El cliente real observado expone directamente `connection.stream` como TLSSocket; no requiere recorrer sockets anidados. El Socket TCP subyacente no es el objeto a validar. El repositorio construye además un objeto con sólo `query`; ahora valida el cliente original, conservando ese wrapper SQL sin modificaciones.

## Corrección y compuertas

`inspectProductionTls` es compartido por repositorio READ ONLY, runner y executor mutador (conexión principal y observador). Resuelve exclusivamente `client.connection.stream`, exige instancia real de TLSSocket, handshake completo (`_secureEstablished=true`, `secureConnecting=false`, socket abierto), encrypted/authorized verdaderos, ausencia de error, servername coincidente, peer presente e identidad comprobada con el checker nativo. Revalida la configuración estricta y la CA externa por SHA. Acepta únicamente `getProtocol() === 'TLSv1.3'` y cipher TLSv1.3; no normaliza ni admite desconocido/TLS 1.2. `_secureEstablished` es un detalle de Node certificado aquí en v24.14.1; un runtime incompatible falla cerrado.

Se conserva el pin de CA oficial, rejectUnauthorized=true, minVersion TLSv1.3 y checkServerIdentity nativo. El runner inspecciona el transporte antes de cualquier SQL y conserva evidencia real en el recibo; el repositorio vuelve a validarlo en ambas transacciones. El mutador valida ambos transportes antes de consultar versión. No cambian SQL de negocio, cálculos, digests, write-set, transacciones ni publicador atómico.

## Única sonda productiva

Necesaria para observar el protocolo real, ausente del recibo anterior. Evidencia inmutable de esta ejecución: `phase48-tls13-minimal-probe.json`. Se usó el .env autorizado del worktree principal V2, después de verificar CA/ACL/SHA; el destino se validó antes de conectar. Se abrió una conexión, se observó secureConnect y se inspeccionó el helper corregido. Sólo se ejecutaron `BEGIN READ ONLY`, `SELECT version(), current_setting('transaction_read_only') AS transaction_read_only` y `ROLLBACK`.

Protocolo real: **TLSv1.3**. Constructor/tipo: **TLSSocket / node:tls.TLSSocket**. encrypted=true; authorized=true; authorizationError=null; servername coincide; checker nativo activo; hostname y cadena válidos; peer presente. Cipher: **TLS_AES_256_GCM_SHA384 / TLSv1.3**. CA SHA-256: `700723581420DD1AC98FD7E9AC529F0EF210EADCAF87FC868A3AD7D114C2F3B7`. Peer SHA-256: `03709ca44d1b06e4504da0a83b6ca065761edc704cd5634bcc3894fd5c7b3248`. PostgreSQL 17.6; read_only=on; rollback confirmado; cliente y pool cerrados. No se registraron hostname completo, URL, usuario, contraseña, PEM ni certificado completo.

La sonda se ejecutó durante la edición sobre el HEAD base: `code_commit` identifica ese HEAD, no una afirmación de árbol limpio. El helper observado es el mismo archivo incluido y hasheado en la certificación final. No se repite la sonda después de los commits.

## Preservación

Recibo original movido sin modificar bytes, después de comprobar 2303 bytes y SHA-256 `8f4366f029247202b19f9807367170f9083ea25de199be3970a34329d0a5b540`:

`C:/Users/CORE ULTRA/Documents/EmpiriaBackups/phase48-modalidad-pre-migracion-20261007T132031Z/stopped-preflights/phase48-preflight-9c28b363-8202-4b2b-90f6-784a6ce0d3fa.stopped.json`

Manifiesto sanitizado en el mismo directorio: `phase48-preflight-9c28b363-8202-4b2b-90f6-784a6ce0d3fa.manifest.json`. Revisión completa: sin secretos ni datos personales; conserva identificadores técnicos de alcance. Working tree limpio después de preservarlo y antes de crear la rama desde la base exacta.

## Certificación y commits

Pruebas ejecutables y hashes de código: `phase48-tls13-runtime.cert.json`, regenerado por `node src/scripts/certify-phase48-tls13-runtime.cjs`. La suite cubre TLS exacto, TLS 1.2/null/desconocido/variantes rechazados, secureConnect pendiente, wrapper real pg y wrapper SQL, socket equivocado, authorized=false, authorizationError, hostname, CA incorrecta, rejectUnauthorized=false y helper compartido. Incluye todas las regresiones de contrato, target, post-rollback 8/8, runner, mutador/rollback/idempotencia y publicación atómica de STOPPED. Typecheck, backend build, FrontendNuevo build y git diff --check deben pasar. Las pruebas usan guard de transporte loopback y bloquean consultas pg, lectura de .env/CA reales y HTTP productivo. No se invocan scripts históricos que restauran BD o hacen DDL/DML.

El primer commit de código certificado de esta rama es el nuevo mutator_commit; un segundo commit publica exclusivamente su pin, evidencia y revocación de pin anterior. El pin final se encuentra en `MUTATOR_COMMIT` y en el certificado. HEAD final es readonly_runner_commit, obtenido con `git rev-parse HEAD`, sin hash autorreferente en archivos versionados. Se verifica igualdad del contrato normalizado y de todos los archivos certificados entre esos commits. `bdebcb2b0fcd1ab63f50c0177c6c403a7b36c7e7` queda revocado; también todos los runner commits hasta la base inclusive y todas las frases anteriores. Ninguna frase nueva fue emitida. Cambiar commits exige nueva certificación y autorización.

Archivos de código modificados: phase48-readonly-tls.ts, phase48-readonly-repository.ts, phase48-production-executor.ts, phase48-readonly-contract.ts, phase48-production-readonly.ts, phase48-historical-production.ts, phase48-readonly-tls-probe.ts, phase48.atomic-mutator-regression.test.ts. Archivos nuevos: phase48.tls13-runtime.test.ts, certify-phase48-tls13-runtime.cjs y los tres documentos/evidencias phase48-tls13-* de reports.

Cero consultas productivas a tablas o catálogos; cero escrituras de datos productivas; cero health requests productivos. Ningún preflight, mutación, migración, DDL, DML, auditoría productiva, merge o deploy. Las escrituras locales de código, manifiesto y evidencias están dentro del alcance autorizado.

**TLS 1.3 RUNTIME CERTIFICADO — LISTO PARA NUEVO PREFLIGHT READ ONLY**
