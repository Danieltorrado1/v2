# Preflight productivo read-only — nómina periodo 3

Fecha de ejecución: 2026-09-26 (America/Bogota). Alcance: empresa 15, contrato 24, periodo 3.

## Estado

- `HEAD` y `origin/main`: `62dda0a139eaca4ad8b344fd6e3ef5407f332238`.
- El commit `62dda0a` contiene `d5bd6c3`.
- Working tree limpio.
- No se invocó el endpoint ni el método mutador de recálculo.

## Backup y health

- Backup y manifiesto accesibles.
- Manifiesto: 15 dumps esperados/verificados; hashes SHA-256 actuales: 15/15 coincidentes.
- Health archivado en el backup: HTTP 200, `status=ok`, `database.status=ok`, worker detenido, OUTBOX=false, SYNC inactivo y RECALC=false/inactivo.
- El health público actual no pudo ser revalidado porque no se encontró una URL pública configurada y `127.0.0.1:4110` no estaba disponible. Esto requiere corrección/verificación antes de escribir.
- Cliente usado: `psql` 17.11 con sesión `BEGIN READ ONLY`, timeouts locales y `ROLLBACK`. El servidor reportó 17.6; queda como diferencia de versión a confirmar.

## Estado de periodos

- Periodo 3: `ABIERTO`, 2026-08-26 a 2026-09-25.
- Periodos 4 y 6: `ANULADO`.
- Periodo 5: `ABIERTO`; 788 empleados y 1 novedad activa observada. La integridad declarada en el manifiesto es `period_5_intact=true`.
- Locks esperando: 0.
- Novedades activas pertenecientes a periodos 4 y 6: 0.

## Alcance sanitizado

- Empleados materializados: 795.
- Empleados con novedades activas: 173.
- Empleados sin novedades activas: 622.
- Empleados con efecto económico: 171.
- DNC/DCO: 166 empleados.
- PNR/suspensión: 8 empleados.
- Transporte: 171 empleados.
- Novedades de más de tres días o con efecto en recargos: 167 empleados; 3 registros con rango mayor de tres días.
- Empleados con dos o más novedades: 99 (máximo observado: 5; no se exponen IDs).
- Solapamientos: 0 pares.
- Duplicados exactos: 0 pares.
- Fuera de vigencia laboral: 0.
- Liquidaciones: 0.
- Desprendibles: 0.
- Ajustes manuales activos: 0.
- Empleados con movimientos activos: 26; registros: 32.
- Empleados con turnos activos: 26; registros: 32.
- Proxy de deducción no reflejada en `detalle_calculo`: 8 empleados; requiere validación durante la ventana autorizada, no es una prueba concluyente.
- Novedades posteriores al registro del empleado: 173.
- Novedades posteriores al último evento de auditoría de recálculo observado: 42 registros, 276 empleados según el histórico de auditoría disponible.

### Novedades por código

| Código | Activas | Empleados | Fecha mínima | Fecha máxima |
|---|---:|---:|---|---|
| DNC | 272 | 166 | 2026-09-01 | 2026-09-25 |
| INC_ARL | 1 | 1 | 2026-09-02 | 2026-09-03 |
| INC_GENERAL | 8 | 4 | 2026-09-07 | 2026-09-25 |
| PNR | 8 | 8 | 2026-09-02 | 2026-09-25 |
| PR1 | 10 | 7 | 2026-09-02 | 2026-09-25 |
| PR2 | 2 | 2 | 2026-09-10 | 2026-09-24 |
| PR3 | 3 | 3 | 2026-09-04 | 2026-09-18 |
| PR4 | 1 | 1 | 2026-09-10 | 2026-09-11 |
| TA | 7 | 7 | 2026-09-02 | 2026-09-24 |
| Código vacío | 6 | 5 | 2026-08-31 | 2026-09-18 |

## Auditoría de código

- La creación ordinaria (`createNominaNovedad`) registra la novedad, auditoría y evento laboral; después del `COMMIT` llama a `recalculateNominaPeriodo(periodo_id, { force: true, nomina_empleado_id })`. Por tanto, el hotfix recalcula sólo el empleado afectado para la ruta ordinaria.
- La ruta con turno recalcula, después del `COMMIT`, cada empleado afectado: titular y, si aplica, trabajador de cobertura.
- La creación de novedad canónica y las actualizaciones/desactivaciones canónicas llaman al recálculo del periodo sin `nomina_empleado_id`; esas rutas son de alcance completo del periodo.
- El endpoint administrativo es `POST /api/nomina/periodos/:id/recalcular`, protegido por `nomina.recalculate`. El método oficial es `recalculateNominaPeriodo`.
- El método oficial lee empleados, novedades, asistencia, movimientos, ajustes, contextos y parámetros; persiste en `nomina_empleados` los campos calculados y `detalle_calculo`; registra auditoría de recálculo.
- Adicionalmente puede actualizar/crear snapshots en `nomina_movimientos` y enlazarlos desde `nomina_novedad_turnos`; para el periodo completo puede sincronizar cuentas de cobro externas. Por ello no es función pura ni read-only.
- La transacción del método es `BEGIN`/`COMMIT` con `ROLLBACK` ante error. La idempotencia del resultado depende de sobrescritura determinista por empleado; la reparación de snapshots es descrita como idempotente, pero sigue siendo escritura.
- No se observaron liquidaciones finalizadas/pagadas ni desprendibles en periodo 3. Aun así, el código excluye recálculo de estados distintos de `ABIERTO`, salvo `REVISADO` con `force` y administrador global; estados finalizados/pagados/cerrados/anulados deben excluirse obligatoriamente.
- El método recibe un `periodoId` y un filtro opcional de empleado; no implementa por sí mismo un filtro de empresa/contrato independiente. La limitación empresa 15/contrato 24 debe comprobarse antes de cada lote mediante el conjunto candidato.
- Los periodos anulados no son recalcables por `assertPeriodoAllowsRecalculate`, pero las novedades canónicas se proyectan por vigencia y el recálculo completo lee eventos canónicos de la vinculación. Debe bloquearse explícitamente cualquier candidato que cruce o proyecte sobre periodos anulados.
- Existen efectos externos: eventos laborales/outbox, auditoría, snapshots de turnos y sincronización de cuentas externas. Con OUTBOX/SYNC/RECALC apagados no se debe activar ningún worker durante la ventana.

## Candidatos y exclusiones propuestas

- Candidatos técnicos: 173 empleados con novedad activa en el periodo 3, restringidos por empresa 15, contrato 24, estado de periodo `ABIERTO`, y con IDs técnicos en archivo local protegido; no se imprimen aquí.
- Excluidos: 622 empleados sin novedad activa; cualquier empleado cuyo periodo no sea 3/`ABIERTO`; cualquier registro asociado a periodos 4/6 anulados; cualquier caso con cierre/finalización/pago/desprendible detectado; cualquier candidato fuera de empresa 15/contrato 24.
- La ejecución controlada no debe llamar al endpoint period-wide. Debe usar la forma selectiva por empleado y rechazar cualquier respuesta que indique procesamiento distinto de un empleado.

## Procedimiento mínimo propuesto

1. Revalidar health público HTTP 200, `database.status=ok`, flags apagadas, worker detenido, backup/hash sin cambios y cero locks.
2. Congelar cambios de nómina y capturar nuevamente el conjunto técnico de 173 candidatos, excluyendo cualquier protección nueva.
3. Procesar en lotes de 10, con una transacción por empleado, `statement_timeout=30s`, `lock_timeout=5s`, y sin activar OUTBOX/SYNC/RECALC.
4. Antes y después de cada empleado comparar totales y `detalle_calculo`, verificar que sólo cambien tablas permitidas y registrar auditoría con idempotency key.
5. Ejecutar una segunda pasada formal sobre el mismo conjunto; debe producir cero diferencias económicas y cero nuevas escrituras relevantes.
6. Hacer rollback del lote ante timeout, lock, cambio de alcance, estado protegido, evento externo inesperado o divergencia de conteos.
7. Postflight: hashes/backup de protección, periodos 3/4/5/6, flags, worker, locks, conteos, auditoría y pruebas manuales de DNC, PNR, transporte, recargo >3 días, turno y deducción.

## Comparación económica

No se ejecutó. La ruta completa no puede demostrarse pura: contiene `UPDATE`, reparación de snapshots, auditoría y sincronización externa. Los totales actuales observados sólo como referencia, no como estimación antes/después, fueron: devengado 1,262,372,941.00; salud 43,750,800.00; pensión 43,750,800.00; otras deducciones 87,501,600.00; neto 1,264,684,042.00.

## Seguridad y decisión

- Escrituras productivas realizadas: cero.
- Endpoints/métodos de recálculo invocados: cero.
- Migraciones, flags, workers, commit, push, merge y despliegue: cero.
- Credenciales temporales de PostgreSQL eliminadas en `finally` tras cada consulta.

**RECÁLCULO DETENIDO — REQUIERE CORRECCIÓN**

Motivos: no fue posible verificar el health público actual y el servidor reporta PostgreSQL 17.6 mientras el control solicitado exige PostgreSQL 17.11. Deben resolverse esas verificaciones antes de autorizar cualquier escritura.
