# Hotfix: población mensual y base salarial de 30 días

## Selección y materialización

La selección estaba en `NominaPoblacionService.syncPopulation`: enviaba las fechas
del corte operativo a `listImportCandidates`, `excludeOutOfScope` y la revisión de
vinculaciones múltiples. Además, recortaba las fechas de pago al mismo corte.
`syncSelective` también materializaba exclusivamente esa intersección.

Ahora ambas rutas derivan el mes liquidado de la fecha de cierre del período,
como ya hace el cálculo salarial. Selección, exclusión, revisión de duplicidades
y nuevas fechas de pago usan la intersección con ese mes. Las nuevas filas tienen
divisor de 30 días y días pagados obtenidos de `calculateNominaMonthBase`.
La actualización selectiva por retiro también usa esa base salarial.

No se modifican las fechas del período ni las consultas, reglas o escrituras de
novedades/asistencia. La importación no crea asistencias posteriores al 25.

## Convención salarial definitiva

Primero se intersecta la vinculación con las fechas reales del mes liquidado.
Si no hay intersección, la base es cero. Sin ingreso/retiro dentro del mes, la
base sigue siendo 30. Para vinculación parcial, se cuenta inclusivamente entre
los ordinales salariales de sus extremos: día salarial = mínimo(día real, 30).
Por tanto, los días reales 30 y 31 comparten el día salarial 30. No se limita
simplemente la longitud de un intervalo calendario; se normalizan sus extremos.
Las fechas reales permanecen en la información de pago y auditoría.

Ejemplos de agosto de 2026:

| Vinculación | Días base |
| --- | ---: |
| Todo el mes / ingreso 01 | 30 |
| Ingreso 02, sin retiro | 29 |
| Ingreso 07, sin retiro | 24 |
| Ingreso 31, sin retiro | 1 |
| Retiro 31, activo desde antes del mes | 30 |
| Ingreso 07 y retiro 20 | 14 |
| Ingreso 07 y retiro 31 | 24 |
| Ingreso 30 y retiro 31 | 1 |
| Ingreso y retiro 31 | 1 |
| Retiro anterior al ingreso | 0 |

COBERTURA utiliza la misma convención al distribuir la base parcial entre
categorías. Los meses de 30 días mantienen todos los resultados aprobados de
septiembre. Febrero conserva la regla anterior: 30 para vinculación sin eventos
intrames y días calendario inclusivos para una vinculación parcial.

## Validación

- Suite enfocada: **79 aprobadas, 0 fallidas**, incluidas base mensual, población,
  persistencia, COBERTURA, runner de corrección segura, digest económico,
  aislamiento del generador y regresión de transporte 1322.
- Suite completa de nómina: **387 pruebas, 366 aprobadas, 21 fallidas**.
  Registro: `tmp/nomina-month-edge-suite.log`.
  Los fallos corresponden a 5B.1/5C.1, 4B.1, 4B.2, 4B.3, 4B.6, 4B.8, 4B.9 y
  el mapper del período. No se modificaron esos tests ni sus fuentes verificadas
  durante este hotfix. El fallo conocido 4B.6 permanece intacto.
- Nuevas regresiones de población ejecutan SQL real en PGlite aislado:
  ingresos 25/26/27/30 de septiembre incluidos; 01 de octubre y retiro de agosto
  excluidos; repetición idempotente; asistencia preservada.
- Se recorren los 961 intervalos de cada uno de los siete meses de 31 días
  (6.727 intervalos); ninguna base sale del rango 0–30.
- `npm run typecheck`: aprobado.
- `npm run build`: aprobado.
- `git diff --check`: aprobado.

## Impacto

No se ejecutaron operaciones sobre bases externas, migraciones ni recálculos
de nóminas existentes. La siguiente sincronización autorizada de un período
abierto podrá importar o reactivar personas del 26 al fin del mes, y excluir
vinculaciones terminadas antes del día 01 aunque intersecten el corte operativo.
Las filas existentes que siguen dentro del mes conservan sus snapshots económicos
en la sincronización general. Un recálculo posterior aplica la nueva convención
de 31 días: intervalos parciales que antes contaban el día extra pueden disminuir
un día; un mes completo nunca genera 31. Los períodos cerrados siguen protegidos.

El cambio acotado pasa las pruebas relevantes y las comprobaciones de compilación.
La suite global todavía no está verde; sus 21 fallos deben constar al decidir el
commit. No se hizo commit ni push.
