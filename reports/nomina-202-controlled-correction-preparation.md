# Caso 202/192: post-despliegue y preparación controlada

**Decisión: OPERACIÓN DETENIDA. No hay autorización ni modo de ejecución productiva.**

Base y SHA confirmado manualmente por el usuario en API y APP:
`1effd71930d23a6e3fc26e9f8792858c6ef5995a`.
La confirmación manual se acepta como evidencia del despliegue; el endpoint de
health no publica el SHA. No se usó navegador ni Computer Use.

Preparación exclusivamente local en `prepare/nomina-turno-202-correction-preview`,
dentro de `V2/.worktrees/nomina-turno-202-correction-preview`. No se modificó el
workspace original ni el de instituciones. Sin commit, merge, push o despliegue.

## 1. Health y flags

Última lectura HTTP: 2026-10-14 23:46:47 UTC. Lectura final de base:
2026-10-14 23:46:47 UTC. Los tiempos completos constan en el JSON adjunto.

| Comprobación | Resultado |
| --- | --- |
| HTTP | 200 |
| success / status / database.status | true / ok / ok |
| OUTBOX configured / enabled | false / false |
| RECALC requested / active | false / false |
| Worker started / running / cycle_running | false / false / false |
| Worker mode / processed | DISABLED / 0 |
| Locks esperando en la base actual | 0 |
| Periodo 3 | ABIERTO |
| SYNC configurado | No observable en health; confirmación manual solicitada y pendiente. |

No se infiere que SYNC esté configurado en false solamente porque OUTBOX y el
worker estén deshabilitados. No se certifica todavía ese requisito de fase 1.

## 2. Preflight READ ONLY

Las conexiones de diagnóstico usan `default_transaction_read_only=on` desde el
inicio. Cada lectura de negocio se ejecutó dentro de `BEGIN READ ONLY`, con
comprobación `SHOW transaction_read_only=on` y `ROLLBACK` al finalizar. Las
lecturas correlacionadas usan aislamiento REPEATABLE READ. No se ejecutó
recálculo ni se llamó a ningún endpoint de escritura.

| Campo | Observado |
| --- | --- |
| Empresa / contrato / periodo | 15 / 24 / 3 |
| Turno / movimiento / novedad | 202 / 192 / 929 |
| Empleado de referencia / vinculación | 837 / 847, sin datos identificativos personales |
| Reemplazante externo | referencia técnica 33 |
| Fecha inicial / final | 2026-09-08 / 2026-09-09, PostgreSQL DATE |
| Días de novedad / días inclusivos | 2 / 2 |
| Cantidad económica | 1 |
| Valor unitario / calculado / total | 97.800 / 97.800 / 97.800 |
| Estado / activo / afecta seguridad social | PENDIENTE / true / false |
| Modalidad / tarifa | CAA, modalidad 1 / tarifa 1 |
| Regla | TURNO_EXTERNO, contrato 24, modalidad CAA, unitario 97.800 |
| Vigencia de tarifa | 2026-07-29 a 2026-12-31, activa |
| Otros movimientos equivalentes activos | 0 |
| Enlaces activos del movimiento | Solo turno 202 |
| Auditorías económicas previas del movimiento en ambos repositorios | 0 |
| Cambios económicos en historial / correcciones vinculadas | 0 / 0 |

Solo se encontraron las auditorías de creación del turno, no una reparación del
movimiento. La lectura final confirma que el caso continúa PENDIENTE, con
cantidad 1, total 97.800 y seguridad social false. No se aplicó el after.

## 3. Derivados y bloqueos comprobados

No se encontraron liquidaciones ordinarias o finales, desprendibles, pagos
pendientes, cuentas legadas de turnos ni exportes del periodo vinculados según
las consultas de preflight. No hay evidencia en esas relaciones de que el
movimiento pendiente esté liquidado o pagado.

Sí existe **cuenta externa 77, detalle 220**, asociada a externo 33, movimiento
192 y turno 202. La cuenta y el detalle están activos, con total/valor 97.800.
El detalle ya reconoce 2 días a 97.800 por día. La cuenta sigue PENDIENTE, pero
conserva un archivo generado el 2026-10-02; no tiene archivo firmado. No se
descargó, modificó ni regeneró el documento. No se lo declara firmado o
definitivo: la evidencia prueba que existe un archivo generado previo, lo que
impide tratar el caso como libre de documentos derivados.

Una corrección exclusivamente del movimiento dejaría la cuenta/detalle y el
archivo en su valor previo. Su tratamiento necesita una decisión separada y
no está incluido en el write-set propuesto.

El trigger activo `trg_nomina_movimientos_invalida_revision` ejecuta
`nomina_invalidar_revision_operativa()` después de cada UPDATE del movimiento.
Su definición real, leída sin modificarla, hace UPSERT sobre
**nomina_revision_operativa**. En este caso, la revisión del empleado 837 está
REVISADO, versión 30. La actualización del movimiento la invalidaría a
REQUIERE_REVISION, versión 31, borrando sus marcas de revisión.

Esto se reprodujo en PostgreSQL local con el mismo cuerpo de función y trigger
observados, y después se revirtió mediante ROLLBACK. No se altera directamente
la fila de `nomina_empleados` mediante ese trigger; la escritura adicional es en
`nomina_revision_operativa`. No se deshabilitó ningún trigger productivo.

## 4. Preview económico y tablas

| Campo | Before | After solo proyectado |
| --- | ---: | ---: |
| cantidad | 1 | 2 |
| valor_unitario | 97.800 | 97.800 |
| valor_calculado | 97.800 | 195.600 |
| valor_total | 97.800 | 195.600 |
| estado | PENDIENTE | PENDIENTE |
| afecta_seguridad_social | false | false |

Diferencia proyectada: **+97.800**. El ajuste de `valor_calculado` evita dejar
el snapshot internamente inconsistente; figura expresamente en el preview y
en la frase de autorización revocada.

Write-set intencional del prototipo local:

1. `nomina_movimientos`: exclusivamente cantidad, valor_calculado y valor_total
   de id 192. No cambia fechas, unitario, tarifa, estado ni seguridad social.
2. `auditoria_eventos`: una fila estricta con before/after, actor y run_id.
3. `auditoria`: una fila estricta de la misma operación y run_id.

Una operación lógica de auditoría se refleja una vez en cada repositorio.
La segunda ejecución no agrega filas en ninguno. No se escribe historial,
outbox, novedad, turno, tarifa, empleado, liquidación o documento desde el kernel.

**Write-set efectivo actual si se actualizara producción:** esas tres tablas
más `nomina_revision_operativa` por el trigger. Por ello el alcance limitado
solicitado no es ejecutable con las condiciones actuales. No se intentó
suprimir, eludir ni compensar esa escritura no autorizada.

## 5. Runner y simulación

`src/scripts/nomina-turno-202-controlled-preview.ts` tiene CLI exclusivamente
PreviewOnly. Su única entrada que admite un cliente PostgreSQL de red abre
una transacción READ ONLY; fue ejecutada y devolvió BLOCKED con:

- `EXISTING_ACCOUNT_DOCUMENT`.
- `ENABLED_TRIGGER_REQUIRES_WRITE_SET_REVIEW`.

No existe un modo ApplyProduction ni una ruta de escritura productiva. La
función de simulación exige una instancia real de PGlite local, rechaza otros
executors antes de abrir transacción y solo acepta turno 202/movimiento 192.
Usa advisory transaction lock, bloqueo de filas, UPDATE condicionado al
before exacto, dos INSERTs estrictos de auditoría, verificación posterior y
rollback ante cualquier divergencia. No importa ni invoca recálculos.

Se preparó un fixture económico sanitizado a partir de las lecturas del caso,
la referencia documental y la definición real del trigger. No es una
restauración completa de producción. Sus campos económicos y relaciones del
caso son fieles; las filas de protección de salario/IBC y turno interno son
sintéticas. No contiene nombres, documentos de identidad, datos bancarios,
rutas de archivos reales ni credenciales.

SHA-256 del fixture:
`21e68d52220d3966637aef6134b87ed58f9d352bebf125e4b80929013708a9d2`.

El fixture observado bloquea correctamente cualquier aplicación. Para probar
el kernel positivo se usa, por separado, un escenario sintético elegible sin
cuenta previa ni trigger de invalidación. Ese escenario no se presenta como
habilitación del caso productivo.

## 6. Pruebas y resultados

`node --import tsx --test src/tests/nomina.case202-controlled-preview.test.ts`:
**14 pruebas, 14 PASS, 0 fallos**.

- Aplicación local exacta: cantidad 1 → 2, calculado/total 97.800 → 195.600.
- Write-set local exactamente movimiento y dos tablas de auditoría.
- Estado pendiente, unitario, IBC del empleado y turno interno 34.740 intactos.
- Segunda ejecución ALREADY_APPLIED, mismo run_id original, cero cambios y
  cero auditorías adicionales, incluso con otro run_id solicitado.
- Fallo en el segundo INSERT de auditoría revierte el movimiento y la primera
  auditoría; no quedan cambios de filas.
- Auditoría incompleta se rechaza, sin falsos ALREADY_APPLIED.
- Rechazo por drift de cantidad, tarifa, seguridad social, estado, fechas y periodo.
- Rechazo de movimiento equivalente, sin duplicados.
- Preview y aplicación local del fixture observado se bloquean sin escrituras.
- Prueba del trigger real: REVISADO/v30 → REQUIERE_REVISION/v31 y rollback total.
- IDs diferentes, executor no local y modo de CLI productivo rechazados.

`npm run typecheck`, `npm run build` y `git diff --check`: PASS.
Las pruebas no usan credenciales ni conexiones productivas. La única simulación
de UPDATE se ejecutó en PGlite local, incluida la prueba del trigger.

## 7. Autorización futura REVOCADA / NO UTILIZABLE

El siguiente texto es solo un registro del alcance propuesto. No es una
autorización vigente, no habilita el prototipo para producción y no puede
utilizarse mientras persistan los bloqueos. Actor y run_id no están aprobados.

> REVOCADA/NO UTILIZABLE — AUTORIZO CORRECCION CONTROLADA empresa=15 contrato=24 periodo=3 turno=202 movimiento=192 cantidad=1->2 valor_unitario=97800 valor_calculado=97800->195600 valor_total=97800->195600 estado=PENDIENTE afecta_seguridad_social=false run_id=<POR_DEFINIR> actor=<POR_AUTORIZAR> write_set=nomina_movimientos,auditoria_eventos,auditoria SIN_RECALCULO SIN_DOCUMENTOS

## 8. Cierre de esta etapa

**OPERACIÓN DETENIDA.** Se requiere resolver el alcance de la revisión operativa
y de la cuenta/documento existente, además de confirmar manualmente SYNC.
No basta con autorizar la frase anterior sin resolver esas condiciones.

**Cero escrituras productivas, cero recálculos productivos y cero cambios en
documentos, tarifas, turnos internos o instituciones.** El registro real y su
revisión siguen como estaban; no se ejecutó la reparación.
