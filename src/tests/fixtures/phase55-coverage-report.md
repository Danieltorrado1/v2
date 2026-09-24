# Fase 4 — matriz de trazabilidad y cobertura por capas

Este informe usa únicamente fixtures sintéticos locales. Las pruebas financieras ejercitan las reglas y fórmulas; el E2E ejercita la conexión evento → worker → recálculo canónico y sus invariantes.

| Regla | Prueba financiera existente | Evento que dispara worker | Cobertura E2E | Verificación |
|---|---|---|---|---|
| Categoría por tramos | `nomina.effects-matrix.test.ts`: categoría, tramo efectivo y conceptos salariales | `VINCULACION_ACTUALIZADA` | E2E general del worker y motor canónico | Fórmula cubierta por pruebas financieras; conexión evento → worker → motor cubierta por la E2E general |
| PNR | `nomina.effects-matrix.test.ts`: PNR/FNJ/S | `NOVEDAD_CREADA` / actualizada / desactivada | PNR > 3 días dedicado | Salario y transporte descontados, recargo según configuración, idempotencia y otra vinculación intacta |
| Suspensión | `nomina.effects-matrix.test.ts`: regla S | `NOVEDAD_CREADA` | Capa financiera | Se conserva independiente del E2E |
| Transporte 3 días | `nomina.effects-matrix.test.ts`: DNC/PR1 | `NOVEDAD_CREADA` | Capa financiera | Regla de umbral cubierta |
| Transporte 4 días | `nomina.effects-matrix.test.ts`: DNC/PR1 | `NOVEDAD_CREADA` | PNR representativo > 3 días | Umbral y propagación al motor cubiertos |
| Turno interno | `nomina.cobertura.test.ts` y matriz de efectos | `TURNO_CREADO`, `TURNO_ACTUALIZADO`, `TURNO_DESACTIVADO` | Ciclo de turnos dedicado | Neto cambia, IBC permanece, actualización y reversión |
| Turno externo | `nomina.cobertura.test.ts` y reglas de turnos | `TURNO_CREADO`, `TURNO_ACTUALIZADO`, `TURNO_DESACTIVADO` | Ciclo de turnos dedicado | Modalidad obligatoria y aislamiento de otra vinculación |

## Flags

La matriz de estados 8/8 está en `integracion.fase4.flags.test.ts`. El worker habilitado cubre el flujo runtime con `OUTBOX=true, SYNC=true, RECALC=true`; el worker deshabilitado cubre el comportamiento sin procesamiento/escrituras, y la ejecución sin `PHASE55_RECALC` cubre sincronización sin recálculo. Las dependencias inválidas permanecen inactivas por la matriz pura.

## Garantías observadas en el E2E activo

- salida `LIQUIDACION_RECALCULADA` no vuelve a encolar recálculo;
- eventos repetidos producen `SIN_CAMBIOS`;
- el rollback sintético deja el evento en `ERROR`;
- el periodo cerrado conserva estado y total;
- hashes de personas, vinculaciones, cobertura, población, asistencia, novedades, turnos y liquidaciones ajenas permanecen iguales;
- el aislamiento por empresa/contrato permanece intacto;
- no se generan ciclos al procesar `LIQUIDACION_RECALCULADA` o `LIQUIDACION_FINALIZADA`;
- los 38 tests financieros permanecen en una capa independiente.
