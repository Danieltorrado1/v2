# Diagnóstico sanitizado del turno externo

Fecha: 2026-10-14. Base: `0984122694651a836902638c61463a71d43e1a59`.
Rama: `fix/nomina-turnos-externos-dias-valores`.

## Evidencia READ ONLY

Conexión con `default_transaction_read_only=on`, transacción
`REPEATABLE READ READ ONLY`, verificación `transaction_read_only=on` y
`ROLLBACK` al finalizar. Sin llamadas a servicios de recálculo ni endpoints.
Las consultas seleccionan campos económicos y referencias técnicas; no se
incluyen nombres, documentos, credenciales ni direcciones de conexión.

| Campo | Valor observado |
| --- | --- |
| Turno / movimiento | 202 / 192 |
| Reemplazante externo / empleado de referencia | 33 / 837 |
| Periodo / contrato | 3 / 24 |
| Periodo | 2026-08-26 a 2026-09-25, ABIERTO |
| Inicio / fin de la novedad | 2026-09-08 / 2026-09-09 |
| Tipo PostgreSQL de ambas fechas | DATE |
| Días de la novedad | 2 |
| Cantidad del movimiento | 1 |
| Días calculados en PostgreSQL con fin - inicio + 1 | 2 |
| Modalidad | 1, Comida Caliente Almuerzo (CAA) |
| Tarifa del snapshot / tarifa configurada | 97.800 / 97.800 |
| Valor calculado / valor total persistido | 97.800 / 97.800 |
| Total proyectado con tarifa persistida | 195.600 |
| Diferencia | 97.800 por debajo del total esperado |
| Estado / activo | PENDIENTE / true |
| Afecta seguridad social | false |

La regla económica es `nomina_movimiento_tarifas.id=1`: activa, contrato 24,
tipo TURNO_EXTERNO, modalidad 1, vigencia 2026-07-29 a 2026-12-31,
valor_unitario 97.800. Sus campos municipio, institución y sede son NULL:
la tarifa está configurada por contrato, tipo y modalidad. El movimiento
referencia esta misma regla en `tarifa_config_id=1`. No se deriva de una
categoría salarial de la persona reemplazada.

## Causa comprobada y límite de la evidencia

Existe una desalineación persistida: la novedad contiene dos días y el
snapshot económico un día. La multiplicación del movimiento es coherente
con su cantidad equivocada (97.800 × 1). El cálculo inclusivo existente
en backend devuelve dos días; el frontend también calcula dos desde el
rango, pero muestra el valor total persistido del movimiento.

Antes de esta corrección, `repairMissingNominaTurnMovementSnapshots` solo seleccionaba snapshots
ausentes, sin tarifa, sin valor positivo o con afectación de seguridad
social. No seleccionaba cantidades o totales positivos inconsistentes con
el rango. Por ello el recálculo podía conservar este snapshot defectuoso.
`updateNominaMovimiento` también conservaba o aceptaba la cantidad sin
contrastarla con el rango de la novedad relacionada.

El historial Git (`80d9a56`) demuestra que la creación utilizó antes
`cantidad: 1`, luego sustituida por `cantidad: diasTurno`. Esto explica un
mecanismo capaz de producir el dato observado. La consulta de auditoría
del movimiento 192 no devolvió filas; no se puede atribuir con certeza
su creación a una versión histórica concreta ni descartar una edición.

No hay evidencia de que UTC origine este caso: PostgreSQL conserva las
fechas correctas como DATE y devuelve dos días sin conversión a JavaScript.
Las lecturas del rango de turnos usan `::text` y el frontend opera sobre
la parte YYYY-MM-DD a medianoche UTC.

## Propagación y límites

La pantalla de Turnos y sus exportes consumen el valor del movimiento.
La cuenta de cobro externa calcula días inclusivos pero toma el valor de
`nm.valor_total`: también puede conservar la desalineación. El movimiento
está PENDIENTE; no se debe describir como pago ya realizado. No se ejecutó
recálculo productivo. La propagación se verificó exclusivamente con fixtures
sintéticos locales. No se modificaron reglas de IBC ni turnos internos.

## Separación del trabajo previo

El workspace principal conserva sus tres archivos modificados y sus
archivos sin seguimiento. Este worktree nace del HEAD confirmado, sin
incorporar ni reemplazar esos cambios. No se accedió al workspace de
instituciones. No hubo merge, deploy, migración, seed ni escritura productiva.

## Corrección local autorizada

Tras la autorización explícita del usuario, se implementó una reparación
general de snapshots positivos de turnos externos. Calcula los días con
aritmética de PostgreSQL DATE, conserva valor_unitario y tarifa_config_id,
ajusta cantidad, valor_calculado y valor_total, y mantiene
afecta_seguridad_social=false. No modifica el estado de aprobación.

Se integra en la reparación existente, antes de agregar movimientos durante
el cálculo de Nómina. No crea turnos ni movimientos. Utiliza bloqueo por fila,
UPDATE condicionado al cambio y auditoría solo para filas devueltas por
RETURNING. Una segunda reparación no cambia importes, metadatos, timestamps
ni auditorías. El alcance por empleado del recálculo se conserva.

La edición de un movimiento externo enlazado toma la cantidad del rango de
su novedad, incluso si el formulario envía una cantidad obsoleta. Impide
desacoplar fecha o tipo del movimiento respecto de la novedad. El flujo de
creación ya utilizaba días inclusivos; se agregaron regresiones que ejecutan
ese orquestador con tarifa 97.800 para 1, 2, 3 días y cruce de mes.

No se cambió código del frontend: sus días inclusivos y sus totales derivados
del movimiento son consistentes una vez que se repara el snapshot. La función
real de días del frontend se ejecutó en las pruebas con fechas DATE/ISO y
zonas UTC, America/Bogota y Pacific/Auckland.

### Impacto proyectado, sin aplicación productiva

Para 202/192: cantidad 1 → 2; unitario 97.800 sin cambio;
valor_calculado y valor_total 97.800 → 195.600; diferencia +97.800;
estado PENDIENTE y afecta_seguridad_social=false sin cambio.
No se agrega un segundo movimiento ni un segundo pago.

El pago externo no se incorpora al salario ni al IBC del titular. Planilla
conserva la separación de adicionales internos y externos. El expediente
cuenta un registro externo con valor 195.600; el consolidado de turnos exporta
2 días y 195.600. La consulta real de cuenta externa devuelve 2 días,
97.800 diarios y 195.600 totales. Un movimiento pendiente no aparece en el
detalle aprobado del desprendible; después de una aprobación local simulada,
la consulta y el payload real conservan cantidad 2 y total 195.600, sin
sumarlo al salario/IBC del titular. No se aprobaron registros productivos.

### Históricos: sí requieren un proceso correctivo separado

El código no ejecuta ningún backfill al desplegarse. Los snapshots elegibles
en periodos abiertos se repararían al invocarse explícitamente el flujo de
recálculo existente. No se invocó ese flujo contra producción.

El caso 202/192 sigue intacto y requiere una autorización correctiva posterior,
con inventario READ ONLY y revisión del alcance antes de tocar datos reales.
La reparación nueva excluye periodos cerrados, movimientos rechazados o
inactivos, novedades inactivas, rangos invertidos, enlaces con rangos distintos
y snapshots sin tarifa certificada. Estos casos necesitan revisión específica.
Las cuentas/PDF/desprendibles ya emitidos son artefactos versionados: no se
reescriben por cambiar este código; deben revisarse y, si corresponde,
regenerarse mediante un procedimiento separado autorizado. No se borraron ni
reenviaron operaciones pendientes.

## Archivos de la corrección

- `src/modules/nomina/nomina.turnos-externos.ts`: carga del rango y reparación
  idempotente conservando tarifa y estado.
- `src/modules/nomina/nomina.service.ts`: integración de reparación y origen
  de cantidad en la edición del movimiento externo.
- `src/tests/nomina.external-turn-range.test.ts`: 21 pruebas locales de SQL,
  reparación, repetición, rollback, filtros, reglas internas y propagación.
- `src/tests/nomina.novedad-turno-separation.test.ts`: 4 regresiones de creación
  externa con tarifa 97.800 y conteo inclusivo real.
- Este informe sanitizado.

El script diagnóstico previo no se incluye en el commit. La configuración de
pruebas es local, sintética y excluida por Git; nunca se copió el .env productivo.

## Validación final de la corrección

- Backend `npm run typecheck`: PASS.
- Backend `npm run build`: PASS.
- Frontend `npm run build --prefix FrontendNuevo`: PASS; advertencia de chunk
  mayor de 500 kB. El primer intento fue bloqueado por EPERM del sandbox;
  el segundo, autorizado fuera del sandbox, terminó correctamente.
- Batería ampliada: 182 pruebas, 177 PASS y 5 fallos preexistentes. Las 25
  regresiones nuevas pasan. Incluye movimientos, turnos, Planilla, cuenta,
  matriz de efectos, base mensual, COBERTURA, repositorios económicos,
  recálculo, permisos económicos y actividad laboral.
- Se reprodujeron exactamente los 5 fallos de `nomina-5b1-cobertura.test.ts`
  usando el texto de `nomina.service.ts` del commit base, servido a las pruebas
  lectoras mediante un preload local, sin revertir ni reemplazar ningún fuente.
  Los demás fuentes leídos por esa suite están sin cambios frente a la base.
  Son expectativas antiguas: formato de ON CONFLICT, referencia SQL de empresa,
  etiqueta de tipos de turno, filtro interno y overflow horizontal de CSS.
  No se cambiaron esos tests ni reglas ajenas para ocultar los fallos.
- Pruebas ejecutadas con configuración sintética, trabajos deshabilitados y
  servicios en localhost:1; no se usaron credenciales productivas.
- `git diff --check`: PASS.
- Las pruebas ejecutan SQL real en PGlite en memoria y funciones reales del
  servicio/frontend. Se sustituyen en los límites los servicios externos,
  auditoría y recálculo del editor; no equivalen a una prueba de navegador
  completa ni a una certificación de concurrencia multi-conexión en PostgreSQL.

La corrección queda para revisión mediante commit y push normal exclusivamente
a la rama autorizada. No se realizó merge ni despliegue. La suite ampliada
conserva los cinco fallos previos señalados, que deben considerarse al integrar.
