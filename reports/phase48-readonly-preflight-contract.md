> DOCUMENTO HISTÓRICO SUSTITUIDO: no autoriza ejecución. Recibo y post-rollback vigentes: [certificación nueva](phase48-postrollback-eight-digests.md).

# Contrato del preflight READ ONLY

Rama `fix/phase48-readonly-preflight-contract`, creada exactamente desde
`b3b61f6ba34701893a18b60f9f88fd6612e42d64`. El mutador y su SQL permanecen
idénticos a `dcbd37adacc9c6a0a67439eaef92a8b47b8abf67`. No se modifica
`.gitignore`, ninguna rama anterior, el guard LOCAL_RESTORATION_REQUIRED ni
las compuertas de autorización del mutador.

## Recibo único

La entrada productiva sólo publica
`reports/phase48-production-preflight-current.json`. Rechaza una ruta de recibo
alternativa antes de leer credenciales. El árbol de fuentes debe estar limpio;
la única salida no versionada admitida es ese mismo recibo para permitir su
reemplazo en el siguiente preflight.

La publicación reserva exclusivamente un temporal fijo en esa carpeta mediante
`wx`, lee el nonce anterior bajo esa reserva, registra su revocación, cierra el
archivo y hace rename al nombre final. El finally elimina sólo el temporal que
creó esta invocación. Si otra invocación posee el temporal, la publicación falla
sin tocarlo. Un error de rename conserva el recibo anterior. Al finalizar una
invocación normal sólo queda el recibo final; no se crean índices, manifests,
locks separados, raw, snapshots ni archivos de autorización. La consola sólo
emite estado, run_id, ubicación de recibo, código de motivo y writes=0.

## Ocho digests

Todos se calculan dentro del snapshot principal: `schema_digest`,
`source_digest`, `phase48_candidates_digest`, `albeny_before_digest`,
`dary_before_digest`, `protected_tables_digest`, `periods_4_6_digest` y
`write_set_before_digest`.

El write-set incluye el esquema, constraints, índices y triggers de la tabla
que cambiaría Phase 48; las 730 identidades y las 730 filas candidatas completas
ordenadas por ID técnico; coberturas de las vinculaciones 1555/249; ambas
vinculaciones; las coberturas 1224/11; conteos/digests de filas existentes en las
tablas relacionadas; secuencias relevantes de cobertura y auditoría; y conteos/
digests iniciales de ambas tablas de auditoría. Ninguna fila personal sale al
recibo. Las consultas de hash de tablas se ejecutan con timezone=UTC.

La representación canónica ordena claves de objetos, mantiene el ORDER BY de
los arrays y distingue null, cero y cadena vacía. Timestamps con offset se
normalizan a ISO UTC conservando seis decimales; los timestamps Date tienen
precisión de milisegundos y se completan con ceros. Fechas sin hora siguen siendo
fechas. El write-set lleva versión explícita de formato. Se vuelve a calcular
al final del mismo snapshot y se exige igualdad, además de la igualdad de la
captura completa de tablas/esquema/secuencias y de la sesión.

## Frase

La frase incluye, en orden fijo, readonly_runner_commit (HEAD completo),
mutator_commit=dcbd37a, backup_sha256, project_ref, empresa=15, contrato=24,
actor=12, expected_rows=730, cada uno de los ocho digests, nonce aleatorio de
256 bits, issued_at, expires_at y todas las condiciones:
OUTBOX=false, SYNC=false, RECALC=false, suppressExternalSync=true,
preserveOperationalSources=true, noPayrollRecalculation=true,
atomicPhase48AndCorrections=true, status=PENDIENTE_DE_AUTORIZACION.

Cada campo es obligatorio; se validan valores, hashes, commits, flags y fechas
UTC canónicas. La expiración debe ser positiva, futura y como máximo de diez
minutos. El constructor produce la misma cadena independientemente del orden
de entrada de las propiedades. El nonce y los timestamps se crean sólo después
de confirmar la estabilidad posterior y cerrar ambas conexiones. La frase no
crea ACTIVE ni es un archivo de activación del mutador.

## Dos conexiones consecutivas

1. El Pool(max=1) obtiene un PoolClient. Preflight y Preview comparten un único
   BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY, PID y snapshot.
   Se confirman READ ONLY, aislamiento, transacción virtual, servidor y TLS
   productivo. Se conservan las barreras SQL y RLS. Se hace ROLLBACK explícito
   y release(true), que destruye esa conexión.
2. Se vuelve a observar health público y flags, con igualdad frente al inicio.
3. Se obtiene una conexión nueva con PID distinto. Hace BEGIN READ ONLY y fija
   REPEATABLE READ antes de la primera lectura, de modo que su comprobación
   mínima tenga un snapshot consistente propio. Sólo verifica transporte/RLS,
   locks/DDL, estado pendiente del esquema y marcadores de auditoría de Phase 48,
   conteo 730 y conteo de candidatos, hashes equivalentes de las vinculaciones/
   coberturas/asistencias históricas y de los periodos 4/6.
4. Se compara con el baseline mínimo capturado dentro del snapshot principal.
   Se hace ROLLBACK y se cierra la conexión. Una diferencia, flag insegura o
   fallo posterior devuelve STOPPED_DRIFT, authorization_status=REVOCADA,
   nonce=null, frase=null y writes=0.

La segunda conexión no comparte snapshot con la primera. Detecta drift
confirmado entre ambas observaciones; no garantiza ausencia de nuevos commits
después de su propia captura. El mutador conserva su revalidación inmediata
independiente antes de cualquier escritura futura autorizada.

## Certificación local

`release/certify-phase48-readonly-local.ps1` crea únicamente un cluster nuevo
PostgreSQL 17.11 en loopback:55466. Rechaza un cluster previo o puerto ocupado,
verifica el SHA del dump y restaura con las nueve exclusiones administradas ya
certificadas. Se comprueban los conteos/digests de las 224 tablas frente al
backup. No se lee ningún .env ni se consulta HTTP/productivo.

`src/scripts/certify-phase48-readonly-contract-local.cjs` verifica los 30
escenarios del contrato, incluyendo drift real confirmado, lock/DDL real de
fixtures, fallos de publicación, revocación, timestamps y campos ausentes.
Las alteraciones de fixtures ocurren exclusivamente en la restauración local;
se restaura el baseline antes de comprobar otra lectura completa sin cambios.
El certificado incluye hashes de fuentes y evidencia sanitizada. Las frases
locales usan un commit ficticio y se revocan/eliminan al terminar.

El script de certificación anterior delega en esta suite. El certificador
mutador original se ejecuta sin cambios en otra restauración descartable.
El finally detiene/elimina sólo el cluster creado, elimina temporales raw y
limpia PGPASSWORD y PRODUCTION_MIGRATION_DATABASE_URL.

## Recibo STOPPED preservado

Se movió, sin borrarlo, el recibo
`phase48-preflight-a8f849cd-cf10-43cd-b0cb-3f71fb03a8c2` al subdirectorio
`stopped-preflights` del backup indicado, con manifiesto sanitizado junto a él.
Tamaño: 2782 bytes. SHA-256 antes y después:
`a233da9669abd6ba34004e70328a621694298a33216842b3fb3dfc84408c75db`.
Su run_id/estado y ausencia de credenciales/datos personales se verificaron.
El árbol volvió a estar limpio antes de crear la nueva rama.

El resultado de esta certificación se registra en
`phase48-readonly-preflight-contract.cert.json`. No es un recibo productivo ni
autoriza conexión, migración, correcciones, recalculo, merge o deploy.

Resultado final: 30/30 escenarios del contrato, 22/22 del mutador intacto y
62/62 pruebas unitarias relacionadas (6 READ ONLY, 8 de compuertas mutadoras
y 48 de cobertura/modalidad/periodos). Pasan typecheck, build backend, build
frontend y git diff --check. El frontend sólo emite su aviso de chunks grandes.
La entrada compilada rechaza MutateProduction y ENABLE_MUTATE antes de acceder
a archivos de credenciales o transportar consultas. Cluster detenido/eliminado,
puerto libre, temporales retirados, cero conexiones/escrituras productivas.

**CONTRATO READ ONLY CERTIFICADO — LISTO PARA PREFLIGHT PRODUCTIVO**
