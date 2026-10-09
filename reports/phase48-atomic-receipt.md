# Certificación local de publicación atómica Phase 48

Rama `fix/phase48-atomic-receipt`, creada desde el HEAD exacto
`d25043019fca8c5dd6dc8513f67f083a30de5540`, con working tree inicialmente limpio.
Mutador nuevo: `bdebcb2b0fcd1ab63f50c0177c6c403a7b36c7e7`.
El HEAD final de esta rama es el `readonly_runner_commit` que debe usar el
siguiente preflight expresamente autorizado. El commit posterior al mutador
sólo fija su pin, añade la prueba de revocación y publica esta evidencia.
El hash final se obtiene con `git rev-parse HEAD`; no se incluye un hash
autorreferente en su propio contenido versionado.

La evidencia ejecutable está en `phase48-atomic-receipt.cert.json`; se genera con
`node src/scripts/certify-phase48-atomic-receipts.cjs`.
No es un recibo productivo, una frase de autorización ni una activación.

## Algoritmo exacto

1. READ ONLY convierte el recibo a JSON en memoria y valida el resultado completo:
   certificado, estado final, writes=0, ocho digests independientes, rollbacks,
   cierre de conexiones y frase exacta cuando corresponde. Los STOPPED no pueden
   contener nonce ni frase. El publicador valida run_id y nombre autorizado,
   serializa JSON con indentación de dos espacios y LF final, codifica UTF-8,
   parsea los bytes completos y calcula su SHA-256 antes de tocar el filesystem.
2. Rechaza componentes `..`, directorios UNC, symlinks/junctions en cada componente,
   archivos no regulares y hardlinks en destinos/temporales. Resuelve el directorio
   canónico; admite los alias Windows 8.3 sólo si dev/ino identifican el mismo
   directorio. El nombre final es un basename limitado, ligado al run_id en
   baseline/receipt del mutador, sin traversal ni streams NTFS.
3. Reserva exclusivamente `.<nombre-final>.tmp` como directorio de bloqueo. Si
   existe, se detiene; nunca borra el bloqueo de otra ejecución. Verifica la
   identidad del directorio autorizado.
4. Si el final existe, compara run_id, tamaño, SHA-256 y bytes exactos. Sólo una
   igualdad completa devuelve éxito idempotente, sin abrir un descriptor de
   escritura ni renombrar/borrar el final. Cualquier diferencia detiene la operación.
5. Genera `.<nombre-final>.<UUID>.tmp` dentro del mismo directorio canónico.
   Abre con `wx`, modo 0600 (restricción POSIX; Windows conserva ACL heredadas).
   Registra identidad y propiedad del temporal después de la apertura exclusiva.
6. Escribe el Buffer completo con writeSync en un bucle: las escrituras cortas se
   completan y un avance cero se rechaza. Ejecuta fsyncSync sobre el descriptor;
   después closeSync. Ante error de cierre intenta cerrar de nuevo en finally.
7. Ya cerrado, comprueba que sigue siendo el mismo archivo regular, su tamaño
   exacto y el SHA-256 de los bytes releídos. Revalida directorio y destino final.
8. Publica mediante `[System.IO.File]::Move` de Windows PowerShell/.NET Framework:
   rename nativo MoveFile sin reemplazo, con origen y destino en el mismo
   directorio/volumen. No usa fs.renameSync (permite reemplazo), copyFile ni un
   temporal en otro volumen. Los paths pasan como variables de entorno, nunca
   interpolados en código de shell. El helper recibe sólo SystemRoot y ambos paths;
   no recibe credenciales, NODE_OPTIONS ni variables productivas.
9. La negativa nativa a reemplazar protege también contra un final creado entre
   la última comprobación y el rename. El archivo competidor permanece intacto.
10. Finally cierra el descriptor restante y elimina sólo el temporal cuya apertura
    exclusiva e identidad pertenecen a esta ejecución. Retira sólo su bloqueo
    vacío. Nunca unlink, truncate, chmod ni reemplazo del recibo final.

El mutador usa este publicador para baseline y todos sus resultados: READY,
ALREADY_APPLIED, SUCCESS, STOPPED y ROLLED_BACK, incluidos resultados de rollback
no confirmado. Las excepciones después de entrar en su bloque de conexión se
publican como STOPPED por el mismo mecanismo, sin inventar writes ni rollback.
Los rechazos de argumentos/autorización antes de ese bloque siguen fallando
cerrados y no crean recibos. No se alteró el executor ni su SQL/transacción.

Para consumir el nonce una sola vez, conserva inmutable el preflight y publica
`phase48-consumed-<nonce>.json` con estado CONSUMED, run_id, hash del preflight y
timestamp. Ambos locks y la publicación compartida impiden dobles consumos.
Una repetición devuelve NONCE_REVOKED_OR_REUSED. No hay restauración del nonce
tras errores. Un nuevo recibo diferente requiere un destino libre aprobado;
este código no borra, archiva ni reemplaza automáticamente el recibo anterior.

## Garantías y límites reales de Windows

Probado realmente en Windows (`win32`), Node `v24.14.1`, con procesos Node
independientes y Windows PowerShell del sistema. El archivo final aparece sólo
después de escritura completa, fsync y cierre del temporal, por rename nativo
en el mismo directorio/volumen. El destino preexistente no se reemplaza, incluso
en una carrera contra un escritor que no usa nuestro lock. La ACL del directorio
permanece exactamente igual antes/después; no se invoca chmod, Set-Acl ni icacls
desde el publicador. El archivo temporal hereda las restricciones del directorio
y el movimiento dentro de éste conserva su ACL.

No se ejecuta fsync del directorio: Node/Windows no ofrece aquí una operación
portable de sincronización del directorio. **No se garantiza que el rename o su
entrada de directorio sobrevivan a pérdida de energía, fallo del sistema o del
dispositivo.** fsync del archivo no equivale a sincronización del directorio.
La certificación cubre visibilidad atómica durante ejecución y caídas de proceso;
no simula ni afirma durabilidad del directorio frente a corte eléctrico.

El helper nativo está certificado en Windows. En otra plataforma o sin SystemRoot
falla cerrado con RECEIPT_ATOMIC_PLATFORM_UNCERTIFIED; si PowerShell/MoveFile
no están disponibles, falla con RECEIPT_ATOMIC_RENAME_FAILED y limpia su temporal.
No hay fallback a un rename que permita reemplazo ni a una copia.

Las ACL existentes deben impedir cambios hostiles de directorios/reparse points.
Se rechazan links/junctions y cambios de identidad observables, pero Node no
ofrece un open relativo a un handle de directorio que permita garantizar ausencia
de sustitución maliciosa después de la última comprobación. No se afirma esa
garantía contra un atacante con permiso para modificar el árbol autorizado.
No se amplían permisos para intentar resolverla.

Un kill abrupto puede dejar el temporal y su lock propios. La prueba termina un
proceso con exit(73) antes del rename: no existe final; el temporal contiene JSON
completo, sincronizado y cerrado. Otra ejecución falla cerrada, sin eliminar esos
artefactos. La recuperación requiere inspección explícita; no se implementa un
scavenger. Los errores controlados probados no dejan temporales. Un fallo físico
persistente de cierre/unlink puede impedir limpieza; no se promete recuperación
de I/O inexistente. Si el helper publica y luego muere sin reportar éxito, el
final permanece válido y una repetición exacta puede reconciliarlo idempotentemente.

## Matriz de pruebas solicitadas

| Caso | Resultado y evidencia |
|---|---|
| Escritura completa | PASS; bytes UTF-8 exactos y único archivo final |
| Lectura inmediata | PASS; JSON.parse completo e igualdad de todos los campos |
| Fallo antes de escribir | PASS; sin final ni temporal propio |
| Escritura parcial inducida | PASS; 7 bytes en temporal y fallo posterior; final ausente |
| Fallo durante escritura | PASS; cleanup y final ausente |
| Fallo fsync | PASS; nunca rename; cleanup |
| Fallo al cerrar | PASS; reintento de cierre en finally; cleanup, sin final |
| Fallo antes de rename | PASS; fallo tras cierre durante verificación; cleanup |
| Fallo durante rename | PASS; sin final propio y sin temporal propio |
| Final preexistente idéntico | PASS; mismo run_id/hash/tamaño/bytes; sin descriptor de escritura, rename o unlink |
| Final preexistente diferente | PASS; se detiene y conserva bytes originales |
| Colisión entre escritores | PASS; pruebas reentrante y con dos procesos reales; perdedor no borra lock/temporal/final del ganador |
| Temporal preexistente | PASS; wx devuelve EEXIST; conserva los bytes del otro propietario |
| Caída antes de rename | PASS; exit(73), sin final; sólo temp completo y lock huérfanos propios |
| Sin temporales tras fallo controlado | PASS; readdir vacío en todos los fallos inyectados |
| Ningún borrado del final existente | PASS; bytes/inode preservados; malformed JSON, directorio y hardlink tampoco reemplazados |
| SHA y tamaño | PASS; iguales al Buffer serializado y al temporal verificado |
| Unicode y saltos | PASS; español, chino, emoji, LF y CRLF internos; LF final estable |
| Nombre/directorio autorizado | PASS; basename ligado a run_id, sin paths externos ni NTFS ADS |
| Symlink/junction/traversal | PASS; junction Windows real en directorio y ancestro; symlink final por lstat equivalente inyectado; traversal y hardlink rechazados |
| Windows real/equivalente | PASS; File.Move real, dos procesos independientes, ACL SDDL del directorio igual antes/después |
| READ ONLY y mutador | PASS; mismo publicador para preflight, baseline, SUCCESS, STOPPED, ROLLED_BACK y consumo; barrera estática sin escrituras directas |
| Final creado justo antes del rename | PASS adicional; File.Move real rechaza reemplazo y conserva el JSON competidor |

La prueba de observación lee la ruta final repetidamente mientras otro proceso
escribe el temporal en fragmentos de 512 bytes. Cada lectura sólo puede observar
ausencia o JSON completo con las 20.000 repeticiones de `漢字🧪`. Cero JSON parcial
observado; las cuentas concretas de ausencias y lecturas completas están en
`observer` del certificado. Las pruebas inyectadas además comprueban ausencia
del final en cada write/fsync/close y el orden fsync → close → rename.

## Regresiones y alcance

92/92 tests, cero fallos y cero skips:
20 de publicación atómica, 6 del executor con dobles de protocolo, 5 del contrato
de autorización/TLS/nonce, 22 post-rollback (incluye igualdad 8/8 y drift individual
de cada digest), 6 READ ONLY, 24 target validation, 1 TLS con 37 aserciones locales,
8 de compuertas del mutador. Typecheck, build backend, build FrontendNuevo y
git diff --check pasan. Vite sólo informa el aviso de chunks superiores a 500 kB.

El mutador y rollback/idempotencia se prueban con el executor real y dependencias
en memoria; ningún query string se ejecuta en una base de datos. No se arrancó
PostgreSQL, no se restauró backup ni se ejecutaron las suites históricas de
restauración con DDL/DML. Esta certificación es del publicador y sus regresiones
locales, no una nueva auditoría de datos ni una certificación SQL productiva.
La suite histórica READ ONLY se adapta al contrato inmutable para una futura
ejecución local separadamente autorizada; no fue invocada ahora.

`git diff --exit-code` frente al HEAD base demuestra igualdad exacta de executor,
domain, controlled, SQL, repository, preflight, TLS, target y authorization.
No cambiaron reglas económicas, SQL, transacciones, cálculos de digests, campos
de la frase ni write-set. Sí cambió la persistencia del nonce para respetar la
inmutabilidad exigida, conservando su consumo único y el fallo cerrado.

El preload local bloquea conexiones no loopback, puertos de BD 5432/55466,
pg.Client.query, fetch fuera de loopback y lectura de .env/EmpiriaCertificates.
Los contadores de la suite muestran cero intentos prohibidos. Las únicas
conexiones de prueba son los servidores TLS sintéticos en loopback.

## Archivos modificados

- src/modules/cobertura/phase48-readonly-receipts.ts
- src/modules/cobertura/phase48-readonly-contract.ts
- src/scripts/phase48-historical-production.ts
- src/scripts/phase48-production-readonly.ts
- src/scripts/certify-phase48-readonly-contract-local.cjs
- src/scripts/certify-phase48-atomic-receipts.cjs
- src/scripts/phase48-atomic-local-guard.cjs
- src/tests/phase48.atomic-receipts.test.ts
- src/tests/phase48.atomic-mutator-regression.test.ts
- src/tests/phase48.authorization-tls-contract.test.ts
- src/tests/phase48.postrollback-eight.test.ts
- reports/phase48-atomic-receipt.md
- reports/phase48-atomic-receipt.cert.json

## Revocación y estado

Queda revocado `57063aedca261557256a23eee616dae473b94f54`: receipts.ts estaba en
su conjunto certificado y además el entrypoint mutador cambió para compartir
el publicador. No puede conservarse honestamente ese mutator_commit.

Todas las frases anteriores quedan revocadas. El parser rechaza los runner
commits hasta `d25043019fca8c5dd6dc8513f67f083a30de5540` inclusive y sus ancestros,
y exige el nuevo mutator_commit completo. La prueba incluye explícitamente el
HEAD base y el pin 57063aed revocados. Las compuertas futuras comparan además
readonly_runner_commit con el HEAD exacto real, el contrato normalizado con el
mutador certificado y la igualdad de su conjunto de archivos.

El próximo preflight deberá usar el HEAD final exacto de esta rama y
mutator_commit `bdebcb2b0fcd1ab63f50c0177c6c403a7b36c7e7`. No se generó frase
productiva ni se autorizó ningún preflight, conexión, mutación, merge o deploy.
Los documentos/certificados históricos se conservan como evidencia histórica;
sus frases/commits anteriores no autorizan una ejecución nueva.

Cero conexiones y cero escrituras productivas. Cero lecturas del .env/CA
productivos y cero health requests productivos. Sin migración, DDL, DML,
auditorías productivas, merge ni deploy.

**PUBLICACIÓN ATÓMICA CERTIFICADA — LISTO PARA NUEVO PREFLIGHT READ ONLY**
