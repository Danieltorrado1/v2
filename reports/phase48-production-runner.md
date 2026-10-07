# Ejecutor Phase 48 e históricos

La operación productiva está **REVOCADA**. Este cambio implementa un ejecutor
separado y permite certificar su transacción en PostgreSQL 17.11 local. No
constituye autorización para abrir conexiones ni ejecutar mutaciones productivas.

## Entrada y compuerta

`release/phase48-historical-production.ps1` y
`src/scripts/phase48-historical-production.ts` tienen `PreflightOnly` como modo
predeterminado. También reconocen `PreviewOnly`, `SimulateLocal` y
`MutateProduction`; rechazan cualquier otro modo/argumento. La simulación sólo
acepta localhost:55466 y el directorio exacto del cluster de certificación.
Los modos locales no cargan dotenv, el servidor de aplicación, jobs ni outbox.

Sin un archivo de aprobación ACTIVE nuevo, `MutateProduction` se rechaza con
`AUTHORIZATION_REVOKED`, antes de leer una credencial o abrir conexiones.
Una activación futura requiere una nueva autorización expresa y un archivo
externo correlacionado con commit, run_id, baseline, confirmación literal y
una ventana máxima de 30 minutos; no necesita eludir el guard local.
El script no se autoautoriza al concluir las pruebas. Tampoco produce una
autorización ACTIVE. La futura entrada productiva utiliza una credencial
temporal por variable de proceso, TLS con validación y project_ref exacto;
no pasa credenciales al shell. El puerto productivo es 5432, para evitar un
pool transaccional que no conserve la misma sesión.

Se preparó únicamente esta **plantilla NO UTILIZABLE / REVOCADA**:

```text
MUTATE_PHASE48_HISTORICAL|project=scuvsocqibbubqnesvuf|actor=12|empresa=15|contrato=24|rows=730|backup=4271775ee853bf03b9f70402f7ecfd7becbe048269e3b10c76f027f981303e26|commit=<COMMIT_EXACTO_DEL_RUNNER>|run_id=<RUN_ID_NUEVO>|baseline=<SHA256_BASELINE_INMEDIATO>
```

La igualdad de la confirmación es literal, sin trim ni normalización. El
ejecutor requiere actor 12, empresa 15, contrato 24, 730, SHA del backup,
commit exacto frente al HEAD real, project_ref, UUID de ejecución, habilitación
explícita, autorización ACTIVE, baseline y observación de health/flags. El
baseline del backup no sustituye al baseline inmediato.

## Una transacción

La captura inicial usa una transacción SERIALIZABLE READ ONLY que se revierte.
No escribe ni toma el advisory lock. El recibo sanitizado contiene conteos,
digests de las tablas, esquema, filas afectadas y secuencias. Las filas completas
del write-set se conservan en memoria; no se persisten datos personales.

La mutación completa usa **una sola** transacción SERIALIZABLE: configura
timeouts, run_id/actor/application_name, toma `pg_try_advisory_xact_lock(15,2448)`
y bloquea las tablas públicas frente a escritores. Repite la captura y valida
el baseline. Un observador independiente READ COMMITTED compara antes y después
de adquirir los locks de tablas: evita que una lectura del snapshot fijo de
SERIALIZABLE oculte un commit concurrente ocurrido durante la adquisición.
Estos locks no terminan ni cancelan sesiones ajenas. Un timeout, DDL, lock en
espera o drift detiene la operación.

El SQL original `phase-48-operational-assignment-identities.sql` permanece
intacto. No contiene BEGIN/COMMIT/ROLLBACK propios; el ejecutor comprueba esa
condición antes de ejecutarlo. Sus ALTER TABLE, UPDATE, CREATE INDEX y los
INSERT/UPDATE históricos se revierten junto con sus auditorías. No se usa
CREATE INDEX CONCURRENTLY ni una frontera transaccional interna.

Phase 48, Albeny, Dary, tres auditorías legacy y tres eventos se ejecutan con
el mismo cliente. No se usan savepoints para silenciar auditorías. El COMMIT
sólo ocurre después de comprobar datos, write-set, constraints, índice,
funciones/triggers, tenant, periodos, auditorías y tablas protegidas. Un fallo
previo revierte la operación completa. Un fallo posterior al COMMIT se reporta
como STOPPED con `committed=true`; nunca se afirma un rollback ni se restaura
el backup automáticamente. Si se pierde la confirmación de COMMIT o de
ROLLBACK, devuelve STOPPED con resultado UNKNOWN y run_id; nunca declara
falsamente cero escrituras ni un rollback confirmado.

## Write-set y protección

Únicamente: tres columnas bigint, tres FK, nulabilidad de focalizacion_final_id,
índice timeline y 730 identidades en cobertura_asignaciones; una fila histórica
de Albeny; activo/observacion de la cobertura 11; tres filas nuevas de auditoria
y tres de auditoria_eventos. El run_id, actor, scope, IDs, acción, digests,
commit, backup, timestamp y resultado están en ambas auditorías.

CAA se exige con categoría 34. Dary exige ausencia de categoría CAA-JU válida,
conserva `category_id=null` y utiliza la marca certificada
`PHASE48_HISTORICAL_15_24_V1:249:REQUIERE_REVISION_SALARIAL` en observacion.
No se inventa una nueva tabla o columna salarial.

La suma exacta es **224 tablas = 221 sin cambios + 3 tablas del write-set**.
La petición de 222 tablas totalmente intactas es incompatible con registrar
auditorías tanto en auditoria como en auditoria_eventos, además de cobertura.
Se verifica la totalidad de las 224, y las filas anteriores de ambas auditorías
deben conservar sus conteos/digests; sólo se permiten tres anexos por tabla.
Asistencias, novedades, movimientos, turnos, importes, liquidaciones,
desprendibles, focalización, periodos y catálogos permanecen intactos.

No se utiliza nextval para asignar IDs de esta operación: se reservan bajo
los locks y se avanza cada secuencia mediante ALTER SEQUENCE RESTART, que
PostgreSQL revierte transaccionalmente. El algoritmo certificado puede dejar
saltos entre IDs de auditorías. Los valores antes/después y `is_called` se
documentan en el certificado; ningún fallo consume secuencias.

READY, ALREADY_APPLIED, STOPPED, SUCCESS y ROLLED_BACK son los estados posibles.
Un estado parcial devuelve STOPPED/PARTIAL_STATE_DETECTED y nunca se completa
automáticamente. Un estado completo exige las seis auditorías correlacionadas,
los dos históricos y las identidades; ALREADY_APPLIED no escribe ni audita.
El destino predeterminado es Local; un PreflightOnly/PreviewOnly productivo
futuro exige Target=Production y una nueva aprobación externa, flags observadas,
backup, scope y commit. El preflight entrega el baseline sin exigir la
confirmación de mutación. SimulateLocal siempre rechaza Target=Production.
Ninguna aprobación ACTIVE fue creada en este turno.

## Certificación reproducible

`release/certify-phase48-production-local.ps1` crea un cluster nuevo, exige
17.11 y puerto libre, restaura el backup con su SHA exacto y compara las 224
tablas contra la evidencia. Crea placeholders NOLOGIN, usa --no-owner y
--no-privileges y excluye sólo las nueve entradas previamente certificadas:
Vault, su comentario/datos y los seis hooks administrados. No reproduce ACL
de Supabase ni modifica el dump/globals originales.

Cada caso destructivo usa una copia local nueva del restore intacto. Se
ensayan los 22 escenarios pedidos, incluyendo errores SQL reales 23502 en
las dos auditorías y drift confirmado por una segunda conexión local. El
certificador no lee el .env productivo ni realiza llamadas HTTP.

El runner local original y su guard LOCAL_RESTORATION_REQUIRED permanecen
idénticos al archivo de fd6e4aa; el certificado verifica su SHA y su rechazo
de una identidad remota ficticia, sin abrir una conexión remota.

Los resultados completos se guardan en
`reports/phase48-production-runner.cert.json` tras concluir la certificación.
El wrapper detiene y elimina sólo el cluster creado y limpia temporales crudos
y variables sensibles en finally. No crea backups nuevos ni despliega código.

## Resultado de esta certificación

PostgreSQL 17.11: los 22 escenarios obligatorios pasan. También se probó una
auditoría incompleta: STOPPED/PARTIAL_STATE_DETECTED, sin cambios. La primera
simulación devuelve SUCCESS (730 identidades, ambos históricos, seis auditorías);
la segunda devuelve ALREADY_APPLIED, sin escrituras ni auditorías nuevas.

| Escenarios | Resultado |
| --- | --- |
| 1–2: preflight y preview | READY, cero escrituras |
| 3–7: operación atómica y resultados de ambos casos | SUCCESS, 730/730, categoría 34 sólo Albeny; Dary requiere revisión |
| 8: segunda ejecución | ALREADY_APPLIED, cero cambios |
| 9–13: fallos durante/después de Phase 48, entre casos y en ambas auditorías | ROLLED_BACK total; datos, esquema y secuencias idénticos |
| 14–15: drift antes/dentro del lock | STOPPED, cero escrituras del ejecutor |
| 16–19: población, SHA, actor y flags incorrectos | STOPPED |
| 20: estado parcial | PARTIAL_STATE_DETECTED |
| 21: confirmación revocada | AUTHORIZATION_REVOKED |
| 22: runner local original frente a identidad remota simulada | LOCAL_RESTORATION_REQUIRED |

Typecheck y builds backend/frontend pasan; 283 pruebas relacionadas y ocho
pruebas de compuertas pasan. El frontend sólo informa el aviso de tamaño de
chunks. No hubo fallos que clasificar contra origin/main. git diff --check pasa.

Las huellas de los fuentes certificados y del backup se verificaron otra vez
antes de guardar el certificado. El cluster se detuvo y eliminó, junto con
temporales crudos; cero conexiones y escrituras productivas. Ninguna aprobación
ACTIVE se generó. La integración o ejecución productiva exige una nueva
autorización expresa.

**EJECUTOR PRODUCTIVO CERTIFICADO LOCALMENTE — REQUIERE NUEVA AUTORIZACIÓN**
