# Certificación local del instrumento READ_QUERY V6

Decisión: **INSTRUMENTO READ_QUERY CERTIFICADO LOCALMENTE — REQUIERE NUEVA AUTORIZACIÓN DIAGNÓSTICA**.

Se trabajó en `fix/phase48-v6-read-query-observability`, desde la base `4a2e9d94440442809b5b416532a53ca3403ad508`. No se leyó `.env`, `DATABASE_URL`, CA productiva ni credenciales; no se abrió conexión ni se escribió en producción. No se generó nonce, frase ni autorización productiva.

## Forense del ReferenceError anterior

El intento no produjo stack persistente ni recibo. Su script temporal tenía un `catch` genérico (conservado, SHA-256 `0bc0564d25f4f8dcced9ffa63b43e2aeb5fd6909dbdef0e1e7700e6eb0daaf5f`) que descartó el identificador, archivo, línea, fase y estado de recursos. El resultado esperado está ausente. No se puede recuperar la causa exacta ni afirmar que ese intento cerró una conexión. El fallo original permanece `NO_DETERMINADO`; el instrumento versionado ahora publica recibo sanitizado en `catch/finally`.

## Puerto y harness

El puerto fijo 55470 produjo `Permission denied` al enlazar PostgreSQL. No había listener, la reserva TCP excluida no lo cubría y un bind separado funcionó después; por ello no se atribuye una causa que no está demostrada. Clasificación: `LOCAL_BIND_FAILURE_NO_DETERMINABLE`. El harness selecciona y registra un puerto loopback alto, clona el fixture detenido a un directorio único, crea TLS local y comprueba ejecutable, PID, puerto y data directory antes de ejecutar. Falla cerradamente ante carrera/identidad incorrecta y no detiene clusters externos.

Corrida final: PostgreSQL **17.11**, `127.0.0.1:52927`, postmaster PID `2808`, data directory temporal `tmp/phase48-v6-read-query-certification/run-96c71c72b79c41788d61db2e24d21468/cluster`. Tras las pruebas se confirmó `pg_ctl status = no server`, ausencia del listener propio, y se eliminó únicamente ese directorio de la corrida exitosa. Los directorios/logs de corridas fallidas anteriores se conservaron y están detenidos.

El release gate dejó de ser circular: el checkpoint local contiene el runner y las pruebas; el harness ejecuta parser/launcher con árbol limpio antes de crear cluster, recibos o temporales. El guard de los subprocesos comprueba el puerto alto y la ruta exacta `run-<GUID>/cluster`. No se relajó el chequeo de rama, HEAD ni ancestro.

## Resultado PostgreSQL real

El instrumento usó un `pg.Client` real sobre TLS local TLSv1.3, CA local fijada, hostname `localhost`, `rejectUnauthorized=true` y autorización TLS. Ejecutó `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`; leyó `transaction_read_only=on` e `isolation=repeatable read`; ejecutó secuencialmente **164 consultas** (159 SELECT), obtuvo **740 candidatos** y calculó **17/17 digests**. El `virtualtransaction` fue `1/2`, snapshot `80009:80009:`. Confirmó `ROLLBACK`, `client.end()` y publicación atómica del recibo. No hubo DDL, DML, `nextval`, llamada/importación del mutador ni filas personales en el recibo.

Digests de la captura local:

| Digest | SHA-256 |
|---|---|
| candidates_digest | `1684e5cb2fbb5ebef59268d67c5b5622c3de959f14fd58de30f5c70c4b0afcf3` |
| phase48_candidates_digest | `ac145f895c3dec957a995154f2cd1a3a259df1dc1af850a911f427ced2f52dc8` |
| critical_schema_digest | `f873cca8e42198dbf6a89483e590b99590454eb2cfdbf26800cccb58c718b3b8` |
| source_digest | `0bf9d122ba24be2231974725114005b450bfc4d6fe3b02a9de5d00bfe8aaf048` |
| protected_tables_digest | `3731d4f5972f23e6ed22f05976801d669bf32fbf138592805d0700ccdcce6976` |
| write_set_before_digest | `ace70fc9874e9327dda57213b4a4d6721a2b1eba3319190df8517c03dd9db329` |
| periods_4_6_digest | `a9686543b16b70096fa6967aac873eb40a7acad4ff272a40fbf55700c244fa08` |
| albeny_before_digest | `5cae6bfb53c8094deed8aa28e8c4b0c43b2e9c000e40766f4f2e44b751883409` |
| dary_before_digest | `ee617dad305eb2bad40b755622c27f7bdf982af126792388651255d1c9c3098c` |
| assignment_1203_before_digest | `84314b31d9a6afd7712012e8c9150eaea0c16ac36bd65c1bfeff615866d17dde` |
| archived_versions_digest | `5622ef2c7138ece2678f63866b1fffa94ee005bef1e82c054419fb35642ad8af` |
| event_triggers_digest | `676c9251747e5fb02358de275bfa4d3b1e25f5e8e256b28ed643a9efec631243` |
| critical_definitions_digest | `3c73d47e5ba7ca09dbd0039209f8b91c812aa89367678cd39bffa6541f6d4318` |
| critical_sequences_digest | `e6c2d0b57721a3def73cf664995e6968836538761c5c1f3e875bcc846ea6197b` |
| manifest_digest | `834b8262fc49ef3f06eb8d650c6d229df8eece7b5e109bebae1dbfae7cd3b644` |
| salary_decision_digest | `5e83322433549c4560a0b01d57947ec15275f85d3852a2e9b2810dca0c3f6d1e` |
| salary_review_assignments_digest | `1923aa70ec2de163010d7f246e415967532341ab06383d21948ff34bf926f571` |

## Fallos y regresiones

En PostgreSQL real se indujeron columna inexistente (`42703`), relación inexistente (`42P01`), permiso denegado (`42501`), `statement_timeout` (`57014`) y colisión de destino; el instrumento detuvo la secuencia, confirmó rollback/cierre y preservó el destino. Las pruebas unitarias inyectaron ReferenceError antes/después de crear Client, conexión/TLS/transacción, excepción sin SQLSTATE, rollback/end/publicación fallidos, sanitización, primer SELECT fallido, cierre y carrera. Cubren 19/19 casos del instrumento.

La primera suite ampliada dio 208/251; las 43 fallas apuntaron al guard antiguo que aún fijaba 55470 en subprocesos. Se corrigió el harness, no el contrato operativo. La corrida final tuvo **148/148 PASS** en V6, ventanas/sellos, procesos, recibos atómicos y regresiones del mutador; incluyó una operación sintética local de 740 filas con COMMIT e idempotencia y reversiones/rollbacks en el fixture desechable. Los cuatro `ALTER SEQUENCE ... CACHE 1` se verificaron con locks, bloqueo de `nextval/setval` y rollback de metadatos.

También pasaron: launcher/parser 7/7; PostgreSQL real 4/4; runner/TLS/autorización 59/59; `npm run typecheck`; `npm run build` backend; `npm run build` en `FrontendNuevo`; `git diff --check`. Frontend informó su advertencia preexistente de chunk mayor de 500 kB.

Los recibos STOPPED protegidos continúan intactos: SHA-256 `e5a71ee01913b1ef778a80854a4ba8d2ac46189f81c1ac87dc25d2adeb26d9a4` y `b6368989c72dd8b21ecd48e52b0495d066fd51e22dce98dfbe986761c73b481a`.

## Evidencia y pins

- Certificado sanitizado: `reports/phase48-v6-read-query-certificate-20261015T162859144Z-3ecc13c737384db89363cbbe05b3485f.local.json`, 2,497 bytes, SHA-256 `24688bf41e0751f223defd72afd9c0f2b1275485bd44b3cb9ec00edaa389a1d`.
- Recibo real del instrumento: `reports/phase48-v6-read-query-20261015T162859144Z-3ecc13c737384db89363cbbe05b3485f.receipt.json`, 32,573 bytes, SHA-256 `299568c249889c1f06f44208d9cdbd37b43d1569019d3595854da66f513bd07d`.
- Checkpoint provisional local inicial: `d894dc909b0e4ba764f9a326a3724842bb1cd704`; fue actualizado mediante amend autorizado para incluir el harness. El commit de fuente mutadora recertificada es `58a187cbf7f0f6fe4fa0ed7b6abd3416a6996911`.
- Commit de instrumento diagnóstico: `0160238c317637196bb38c8abde1ced5e4737339`.
- El `readonly_runner_commit` definitivo se registra después del commit final de este certificado. No se revocan permisos ni se habilita ejecución productiva por esta certificación local.

No hubo producción, diagnóstico productivo, nonce/autorización real, merge ni deploy. Esta certificación sólo habilita solicitar una nueva autorización diagnóstica; no autoriza conexión productiva ni Phase 48.
