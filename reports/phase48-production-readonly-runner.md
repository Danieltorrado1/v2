# Runner separado de lectura

`src/scripts/phase48-production-readonly.ts` es una entrada independiente de
`phase48-historical-production.ts`. No importa el ejecutor mutador ni el dominio
mixto. Usa `Pool(max:1)`, obtiene un solo PoolClient, configura la conexión con
`default_transaction_read_only=on` y la cierra con release(true)/pool.end.

Sólo acepta PreflightOnly, PreviewOnly y PreflightAndPreview (predeterminado y
recomendado). Todos validan las mismas condiciones históricas y calculan su
preview en el mismo snapshot; no existe un segundo dispatcher. Rechaza Mutate,
MutateProduction, Apply, Resume, modos desconocidos y argumentos habilitadores.
La ausencia de aprobación ACTIVE o una aprobación mutadora revocada no impide
este camino. No consulta habilitadores mutadores.

La única transacción usa BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ
ONLY. Confirma transaction_read_only=on, transaction_isolation=repeatable read,
PID, snapshot y transacción virtual. No fuerza un XID permanente para demostrar
identidad. Preflight, preview y digests usan esa misma sesión y snapshot. Siempre
intenta ROLLBACK en finally; una conexión perdida devuelve STOPPED, invalida la
frase y exige cerrar el transporte. No hay advisory lock exclusivo.

## Barreras

El repositorio dedicado expone métodos específicos (snapshot, actor, plan,
candidatos, periodos, cobertura y actividad); no expone query ni recibe SQL del
usuario. Sus consultas sólo son SELECT parametrizados. No permite CTE, múltiples
sentencias, locks de filas o funciones fuera de una lista cerrada de catálogo.
Los literales se distinguen de tokens ejecutables. Las funciones SQL usan
pg_catalog explícitamente. Si RLS pudiera ejecutar políticas de aplicación, el
preflight se detiene salvo que el rol evite esas políticas. No se ejecutan
funciones de aplicación, auditoría, reparación, recálculo o sincronización.

La prueba estática recorre el AST de imports y llamadas SQL, además del filtro
de tokens/funciones: falla ante dependencias mutadoras, imports dinámicos, eval,
SQL opaco fuera del repositorio o consultas que no sean de lectura. El servidor
READ ONLY es una barrera adicional, no la única.

El mutador, su entrada, el SQL de Phase 48, el dominio anterior y el runner local
permanecen sin cambios frente a dcbd37a. Sus compuertas, auditorías, write-set,
transacción SERIALIZABLE y LOCAL_RESTORATION_REQUIRED no se modificaron.

## Transporte y recibos

El destino predeterminado es Local, loopback:55466/PostgreSQL 17.11. Requiere
una observación local explícita de flags; no hace HTTP ni lee credenciales.
Una futura lectura productiva exige Target=Production, el project_ref exacto,
puerto de sesión 5432, TLS validado, servidor 17.6 y confirmación manual vigente
de SYNC apagado. El archivo de credenciales sólo puede leerse si se proporciona
explícitamente para ese futuro destino. No hay carga automática de dotenv.
Este turno no leyó el archivo productivo ni abrió conexiones productivas.

Flags ausentes, indefinidas o encendidas producen STOPPED. Se consultan locks,
DDL, actor, tenant, ausencia de aplicación parcial, 730 candidatos, coberturas
históricas, categorías, asistencias, solapamientos y periodos 4/6 anulados.
Los recibos no incluyen nombres, documentos, credenciales ni filas personales.

El recibo incluye schema/source/candidate digests, digests técnicos de las dos
vinculaciones, tablas protegidas, periodos 4/6 y secuencias, commit, backup,
project_ref, actor/tenant, flags y preview. La frase contiene esos digests,
nonce criptográfico de 256 bits, caducidad UTC de diez minutos y las condiciones
de preservación/supresión de sync y recálculo. Queda PENDIENTE_DE_AUTORIZACION.
El registro de recibos en disco serializa las escrituras y revoca los pendientes
anteriores al guardar uno nuevo. Jamás emite ACTIVE o habilita la mutación.

Esta frase de lectura no es un archivo de activación del mutador dcbd37a ni
reemplaza su confirmación exacta. Una nueva autorización humana en otro turno
deberá correlacionarse con ella y con el baseline inmediato de la mutación.
Las frases del certificado local usan un commit ficticio y no son utilizables
para producción.

Repeatable Read demuestra estabilidad del snapshot, no ausencia de commits
concurrentes: la prueba 24 cambia una fuente desde una sesión externa local y
confirma que la lectura conserva su vista. Sin una segunda conexión ni otro
snapshot no sería correcto afirmar que se midió el estado vivo al final.
El mutador conserva su captura inmediata, locks y revalidación de drift.

## Certificación

`release/certify-phase48-readonly-local.ps1` crea únicamente un cluster nuevo
17.11 en el directorio aislado de certificación y puerto libre 55466. Restaura
el backup íntegro con SHA obligatorio, placeholders NOLOGIN sin passwords,
--no-owner/--no-privileges y las nueve exclusiones locales ya certificadas de
Vault y seis hooks administrados. No modifica dump, globals o manifiestos.
Compara las 224 tablas públicas con los conteos/digests del backup.

Los errores y cambios inducidos ocurren exclusivamente en esa restauración
local. La sesión terminada en la prueba de desconexión pertenece al certificador;
no se cancelan sesiones ajenas. El cambio de la prueba 24 pertenece al fixture
externo, no al runner de lectura. La batería del mutador se ejecuta después,
en una base local nueva, con su código certificado intacto.

| Escenarios | Comprobación |
| --- | --- |
| 1–2 | PreflightOnly/PreviewOnly sin habilitación mutadora |
| 3–7 | Un PID, BEGIN y snapshot; transacción virtual; READ ONLY; Repeatable Read; ROLLBACK |
| 8–10 | 224 tablas, secuencias y auditorías sin cambios |
| 11–15 | Phase 48 NO_APLICADA, 730, ambas propuestas y periodos 4/6 |
| 16–18 | Error, timeout real 57014 y conexión perdida; rollback/cierre sin backend huérfano |
| 19–20 | Modos mutadores e imports/capacidades mutadoras rechazados |
| 21–23 | Aprobación ausente/revocada no bloquea; flags desconocidas sí bloquean |
| 24 | Snapshot permanece estable ante commit externo local |
| 25 | Nonce nuevo y revocación del recibo anterior |
| 26–27 | Mutador conserva 22/22 y runner local conserva su guard |

Los resultados, huellas y limpieza final se registran en
`phase48-production-readonly-runner.cert.json`. El cluster creado se detiene y
elimina en finally, se retiran temporales crudos y se limpian variables sensibles.
No se usa producción ni se crea un backup nuevo.

## Resultado local

Pasan los 27 escenarios, los 22 del mutador intacto, cuatro pruebas unitarias
READ ONLY, ocho de compuertas mutadoras y 283 relacionadas. Pasan typecheck,
build backend, build frontend y git diff --check. El frontend sólo informa el
aviso de tamaño de chunks. No hay fallos finales que clasificar contra
origin/main (09a71ddc2d2a769f6a7eacb9dc969cff339586f5).

La sesión observada fue PID 21896, transacción virtual 3/670, snapshot 741:741:,
READ ONLY on y repeatable read, PostgreSQL 17.11. Las 224 tablas públicas,
secuencias y ambas auditorías permanecieron idénticas durante la lectura. Las
propuestas conservaron categoría 34 y 16 asistencias de la vinculación 1555,
y categoría null/revisión salarial y cero asistencias nuevas de la 249.

La entrada compilada rechazó MutateProduction con UNKNOWN_READ_MODE y un
habilitador no admitido con READ_ARGUMENT_NOT_ALLOWED, antes de conectar.
Se verificaron las huellas de los fuentes y del backup tras la certificación.
El cluster fue detenido/eliminado, su puerto quedó libre y se retiraron los
temporales crudos. No se leyó el .env productivo; cero conexiones/escrituras
productivas. No se generó ninguna autorización ACTIVE.

El recibo detenido anterior se preservó fuera de Git con manifiesto, tamaño
1910 bytes y SHA-256
`9a929e469ef8dc34101d434c2e22b8dca90a53a0ab8c7d15f7e6f77abeceaab7`.
La rama parte exactamente de dcbd37a; .gitignore no se modificó.

**RUNNER READ ONLY CERTIFICADO — LISTO PARA PREFLIGHT PRODUCTIVO**
