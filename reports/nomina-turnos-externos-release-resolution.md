# Release de turnos externos: resolución y certificación local

## Alcance y padres verificados

- Rama: `release/nomina-turnos-externos`.
- Primer padre: `09a71ddc2d2a769f6a7eacb9dc969cff339586f5` (`origin/main`).
- Segundo padre: `7361187c728e98b1f5b389ff84bdc0d565abfeef` (hotfix).
- Se continuó el merge explícito existente, sin abortarlo, squash ni rebase.
- Todo el trabajo de esta etapa se realizó dentro del worktree release en V2.
  No se modificó el workspace original ni el de instituciones.
- Sin navegador, Computer Use, conexión productiva, reparación histórica,
  recálculo productivo, migración, seed, merge a main o despliegue.

## Resolución por bloques

Se inspeccionaron 3 bloques de `src/modules/nomina/nomina.service.ts`:

| Bloque | Resolución semántica |
| --- | --- |
| Imports | Se conservó `projectInternalTurnEmployees` de main y se añadieron los dos helpers de turnos externos. |
| Tramos por defecto de COBERTURA | Se conservó `periodoRange.start/end`: main distingue el corte operativo del mes salarial. El hotfix no requiere cambiar esa regla. |
| Movimiento externo existente | Se conservó la política de main de no refrescar ni volver a poner pendiente un movimiento ya encontrado. La reparación de cantidad conserva tarifa y estado. |

Se inspeccionaron 15 bloques de `src/tests/nomina.novedad-turno-separation.test.ts`:

| Bloques | Resolución semántica |
| --- | --- |
| 1: encoding/import inicial | Se conservó la codificación y el import de main. |
| 2: imports de dominio | Se conservaron resolución/selección de contexto de main y se agregó el contador inclusivo real. |
| 3: firma del harness | Se mantuvo `movementFails` como tercer parámetro y se agregó `unitValue` como cuarto. |
| 4–7: contadores, SQL simulado, catálogo/contexto y commit | Se mantuvieron el contador de destinos, la inyección de fallos al crear movimiento, los resolvers actuales y la aserción commit antes de recálculo. Se parametrizó únicamente la tarifa. |
| 8–9: contador inclusivo y resultado del harness | Se usa la función real de días; se conservan todos los contadores de main. |
| 10: matrices de pruebas | Se conservaron los casos de main, incluida SUSPENSIÓN, y se añadieron las cuatro regresiones del hotfix: 1, 2, 3 días y cruce de mes. |
| 11: novedad ordinaria | Se conservaron las aserciones de turno nulo y cero resolución de destinos. |
| 12: contexto inválido | Se mantuvo la validación temprana de main, su código de error actual y cero novedades creadas antes del rollback. |
| 13–14: snapshot | Se conservaron la resolución de destino, el tipo de movimiento y todos los campos de contexto comprobados por main. |
| 15: validaciones y rollback | Se conservaron los tres casos de campos faltantes y ambos casos de fallo de creación con rollback. No se sustituyeron por la expectativa antigua de un error genérico. |

No se usó selección ours/theirs de archivos completos. No se eliminaron métodos,
validaciones ni casos recientes de main. No se modificaron controllers, rutas,
schemas ni contratos de respuesta API.

## Cambios automáticos heredados revisados

El historial de la rama del hotfix incluía cambios del mutador controlado de un
commit anterior que no pertenecen a `7361187`. Se excluyeron por hunks de esta
release: `nomina-audit.service.ts`, `nomina-periodo3-safe-correction-runner.ts`
y las opciones/auditoría/gestión de transacción controlada de
`recalculateNominaPeriodo`. Sus implementaciones quedan como en main.
La prueba del runner introducida por ese ancestro tampoco forma parte de esta
release; no estaba en main ni fue añadida por el commit del hotfix.

Se eliminaron del resultado del auto-merge una propiedad `contexto` duplicada
y validaciones antiguas redundantes con el resolver temprano actual de main.
Esto conserva las validaciones y contratos actuales, sin reintroducir errores
anteriores a los ajustes de main.

## Hotfix incorporado

- Se conservó íntegro `nomina.turnos-externos.ts`: lectura de DATE como texto,
  rango inclusivo, reparación de snapshots positivos, tarifa preservada,
  total redondeado cantidad × unitario y seguridad social false.
- Se incorporó su llamada antes de agregar los movimientos en Nómina.
- La edición de un movimiento externo enlazado deriva cantidad del rango y
  evita desacoplar fecha/tipo respecto de su novedad.
- La reparación no inserta movimientos ni turnos, conserva aprobación y
  emite auditoría solo para las filas efectivamente cambiadas.
- Se conservaron las 21 regresiones nuevas de reparación/propagación y las
  cuatro de creación. Se amplió el fixture SQL con `nomina_empleados` y los
  tres parámetros de periodo/fechas requeridos por la consulta actual de main.
  No se retiraron ni relajaron aserciones para adaptarlas.

## Validación

| Comprobación | Resultado |
| --- | --- |
| Marcadores de conflicto | Ninguno en fuentes; sin archivos Git sin resolver al cerrar el merge. |
| `git diff --check` | PASS. |
| `npm run typecheck` backend | PASS. |
| `npm run build` backend | PASS. |
| `npm run build --prefix FrontendNuevo` | PASS; advertencia de tamaño de chunk mayor a 500 kB. |
| Mismo día a 97.800 | PASS: 1 día, 97.800. |
| 08/09–09/09 a 97.800 | PASS: 2 días, 195.600. |
| Tres días | PASS: 3 × 97.800 = 293.400. |
| Cruce de mes | PASS: 31/08–01/09 son 2 días. |
| Snapshot positivo 1 → 2 | PASS; unitario y referencia de tarifa conservados. |
| Segunda reparación | PASS; cero cambios, timestamps iguales y cero auditorías adicionales. |
| Turnos internos a 34.740 | PASS; reparación externa no los altera y cálculo interno sin salud/pensión sobre el adicional. |
| Duplicados | PASS; ningún movimiento nuevo y enlaces repetidos al mismo rango no duplican la reparación. |
| Fechas DATE/ISO y zonas horarias | PASS: UTC, America/Bogota y Pacific/Auckland. |
| Nómina, Planilla, expediente, desprendible y exportes | Pruebas locales incluidas; se conservan separación interno/externo, corte operativo y proyección de beneficiarios de main. |

Se ejecutaron 75 archivos de pruebas de backend y frontend sobre la release y
74 sobre una copia exacta de `origin/main` creada mediante `git archive` dentro
del mismo worktree. No se modificaron fuentes de main para hacer la comparación.
Se usaron las mismas dependencias y configuración sintética, con jobs y flags
de integración deshabilitados y URLs de servicios en localhost:1.

| Resultado | Base main | Release |
| --- | ---: | ---: |
| Pruebas | 540 | 565 |
| Correctas | 507 | 532 |
| Fallidas | 33 | 33 |
| Fallos nuevos | — | 0 |
| Casos de main perdidos | — | 0 |
| Regresiones respecto de casos correctos en main | — | 0 |

Las 25 regresiones nuevas pasan. Los 33 fallos coinciden por archivo y nombre
con la base. Diez fallos incluyen ECONNREFUSED a la base local deliberadamente
no disponible; nueve pertenecen a la suite de contextos empresariales.
Los restantes son expectativas/asserts ya fallidos en main (estructura de
consultas, UI, mapper y Planilla). No se ocultaron ni deshabilitaron pruebas.
El detalle por archivo, nombres de fallos y casos nuevos está en
`nomina-turnos-externos-release-validation.json`.

La comparación estructural del AST confirmó 287 declaraciones intactas del
servicio, salvo los dos helpers/orquestadores modificados intencionalmente,
y 22 declaraciones/bloques intactos de la suite reciente de main, salvo el
harness ampliado. El mutador histórico y su helper de auditoría quedan sin
cambios respecto de main. No se reformatearon masivamente los archivos.

## Límites y decisión

RELEASE LISTA PARA INTEGRACIÓN por conservación de main y cero regresiones
nuevas en la batería comparada. La batería completa no está totalmente verde:
conserva los 33 fallos preexistentes/de entorno documentados. Esto no equivale
a una validación contra una base de pruebas completa, una prueba de navegador
ni una certificación productiva.

El turno 202 y el movimiento 192 siguen sin modificarse. Su proyección sigue
siendo cantidad 2 × 97.800 = 195.600, pendiente y sin IBC. Aplicar la reparación
histórica o regenerar documentos requiere procedimiento y autorización separados.
Esta etapa termina con el merge explícito y push normal solo de la rama release.
