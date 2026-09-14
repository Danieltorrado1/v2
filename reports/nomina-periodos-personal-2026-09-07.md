# Nómina: períodos, KPIs y sincronización de personal

## Alcance y diagnóstico

Auditoría inicial: `git status --short`, `git diff --stat` y `git diff` sin cambios previos. No se modificó `FrontendNuevo/src/services/vinculacionesApi.ts`.

**A–B. Acordeón.** Existían dos causas: el JSX solo renderizaba la tabla si `isSelected` era verdadero; los otros meses abiertos mostraban una nota. Además, `flex: 1 1 0` en el detalle, alturas restringidas y `overflow: hidden` comprimían el contenido. Cada card abierta ahora monta el mismo espacio operativo existente con estado propio, fijado a su `period_id`: filtros, filas, detalle, acciones, formularios y paginación. No copia la tabla seleccionada a otras cards. Los hijos no escriben la selección global en sessionStorage ni precargan dashboards de otros meses. Las alturas se calculan por contenido; los encabezados de tabla no se superponen entre meses. Se normalizan los IDs de períodos a string.

**C–D. KPIs.** Había descripciones largas y elipsis sobre títulos y valores. Se eliminaron las descripciones y se muestran icono, título y valor: EMPLEADOS, REVISADAS, PENDIENTES, NOVEDADES, DÍAS NOVEDAD, INGRESOS, RETIROS, DEVENGADO y NETO. Los importes permiten saltos entre grupos de miles. El sidebar de escritorio conserva 170 px; la zona operativa ocupa el resto.

**E. Ingresos.** Fuente: `vinculaciones.fecha_inicio`. Cuenta `DISTINCT v.id` dentro del rango inclusivo del período y del contrato correspondiente, coherente con la población por vinculación de Nómina.

**F–J. Retiros.** El proceso formal de retiro de Vinculaciones y la liquidación final actualizan `vinculaciones.fecha_fin`. La novedad FECHA DE RETIRO no actualiza ese campo en el flujo auditado. Por tanto, la fecha efectiva utilizada por disponibilidad, sincronización y KPI es la menor fecha no nula entre `vinculaciones.fecha_fin` y `MIN(COALESCE(n.fecha_inicio,n.fecha_fin))` de las novedades activas cuyo tipo se llama FECHA DE RETIRO, de la misma vinculación. No se usa el estado actual RETIRADA como sustituto de las fechas. `COUNT(DISTINCT v.id)` impide contar dos veces una vinculación con ambas fuentes. No se modificó la relación existente entre esas fuentes.

Consulta de la BD configurada, exclusivamente en una transacción `READ ONLY`, el 7 de septiembre de 2026:

| Período | ID | Estado | Materializados | Operativos | Elegibles | Ingresos | Retiros |
|---|---:|---|---:|---:|---:|---:|---:|
| Agosto 2026 | 2 | ABIERTO | 771 | 771 | 773 | 4 | 23 |
| Septiembre 2026 | 3 | ABIERTO | 0 | 0 | 750 | 0 | 0 |

**G. Septiembre.** Los 750 son disponibilidad, no registros operativos existentes. No se cargó personal en la BD real durante esta implementación. La primera materialización se ejecuta explícitamente con CARGAR PERSONAL cuando se use el código actualizado. La prueba de 750 materializados se realizó en PostgreSQL en memoria con datos ficticios.

**H–I. Carga y actualización.** Se reutiliza `POST /nomina/periodos/:id/importar-empleados` y su permiso `nomina.empleados.import`. La interfaz antes mantenía ese botón deshabilitado alegando que no existía endpoint. Sin registros muestra CARGAR PERSONAL; con registros muestra ACTUALIZAR PERSONAL. El servicio original ya insertaba solo vínculos faltantes, con valores económicos iniciales en cero, sin llamar a recálculo ni sobrescribir existentes; conservaba su detección de vínculos solapados que requieren revisión. Ahora también excluye lógicamente a quienes dejaron de ser elegibles y reactiva exclusivamente exclusiones hechas por este sincronizador cuando una corrección de fechas vuelve a hacerlos elegibles. La respuesta e indicador visual muestran nuevos, reactivados, excluidos, sin cambios y casos para revisión. Se bloquean períodos no abiertos. Un bloqueo de la fila del período serializa las importaciones concurrentes.

**K. Vigencia.** `fecha_inicio <= fin_del_período` y retiro efectivo nulo o `>= inicio_del_período`. Retiro 31/08: excluido de septiembre. Retiro 15/09: permanece. Retiro en octubre: permanece en septiembre.

**L–P. Historial e idempotencia.** Se utiliza `activo = false`, sin DELETE, y se agrega el marcador `PERSONAL_FUERA_VIGENCIA` a `motivo_caso_especial`, preservando el texto anterior. Se detectan asistencia, novedades, turnos, movimientos, ajustes, revisión y detalle de cálculo; se informan los IDs excluidos con actividad que requieren revisión. La auditoría guarda los IDs excluidos y el resultado. No se modifican filas relacionadas ni columnas económicas de empleados existentes. Los registros históricos siguen en la base aunque no aparezcan en la población operativa. Repetir la sincronización sin cambios no duplica registros ni vuelve a excluirlos.

**M. Planilla Operativa.** Su selector ya obtiene los períodos disponibles y permite operar el propio período ABIERTO, sin exigir cierre del anterior. El único cambio en esta página filtra empleados con `activo === false`. No se tocó asistencia bulk, cola, debounce, paginación, pendientes ni control de 429. La prueba de navegador mostró personal de septiembre con agosto abierto y respuestas API ficticias.

**N. Novedades.** Conservan el formulario, permisos, asignación de `periodo_id` y validaciones de fechas existentes. La restricción auditada corresponde al período propio, no al anterior. No se modificaron efectos económicos ni se creó una novedad real durante la QA.

## QA y límites de la evidencia

`npm run test:nomina-population`: **20 PASS, 0 FAIL**. Ejecuta el servicio de importación real y su SQL en PGlite (PostgreSQL en memoria), con el pool externo bloqueado. Solo la persistencia de auditoría se sustituye por un recolector; las consultas y escrituras de población se ejecutan en PostgreSQL.

| Caso | Resultado |
|---|---|
| 750 materializados, anterior ABIERTO, economía inicial cero | PASS, aislado |
| No copiar valores de agosto | PASS, aislado |
| Ingreso tardío +1 | PASS |
| Retiro previo excluido | PASS |
| Retiro durante el mes permanece | PASS |
| Retiro posterior permanece | PASS |
| Idempotencia | PASS |
| Preservación de asistencia/novedades/turnos/movimientos/ajustes/valores | PASS |
| Reactivación tras corregir fecha | PASS |
| Retiro por ambas fuentes sin duplicado; novedad anulada ignorada | PASS |
| Período cerrado rechazado sin cambios | PASS |
| Septiembre y agosto despliegan sus propias filas y detalles simultáneamente | PASS, navegador con API ficticia |
| CARGAR/ACTUALIZAR envían el ID de su card, sin solicitud de recálculo | PASS, navegador con API ficticia |
| KPIs completos y sidebar compacto | PASS, navegador e inspección de imágenes |
| Sin desbordamiento horizontal, incluido el contenido de tablas, en 1440/1024/768/390 px | PASS |
| Planilla muestra septiembre materializado | PASS, navegador con API ficticia |
| Registro de novedad de extremo a extremo contra BD real | No ejecutado; flujo auditado, sin modificar efectos |
| Materialización en BD real | No ejecutada; diagnóstico de solo lectura |

Evidencia visual y script: `tmp/nomina-population-qa/visual.mjs`, `visual.json`, `desktop.png`, `mobile.png`. El script necesita Vite de FrontendNuevo en el puerto 5177 y playwright-core en esa carpeta temporal; crea y elimina su propia página de prueba. Todas las solicitudes API se interceptan. `audit.ts` contiene la consulta de diagnóstico de solo lectura.

## Archivos

**Q. Frontend:** `FrontendNuevo/src/pages/nomina/NominaPage.tsx`, `NominaPage.css`, `PlanillaOperativaPage.tsx`, `FrontendNuevo/src/services/nominaApi.ts`, `FrontendNuevo/src/types/nomina.types.ts`.

**R. Backend:** `src/modules/nomina/nomina.service.ts`, `src/modules/nomina/nomina.population.ts`. Sin cambios de controlador/ruta ni migraciones.

**S. Tests y soporte:** `src/tests/nomina.population-sync.test.ts`; `package.json` y `package-lock.json` añaden PGlite como dependencia de desarrollo y el comando de prueba. Se ejecuta también `src/tests/nomina.population.test.ts` existente.

**T–W. Verificaciones:** frontend build **PASS**, backend typecheck **PASS**, backend build **PASS** y `git diff --check` **PASS**. El build frontend conserva el aviso de bundle grande; no es un error de compilación.

**X. Confirmaciones:** MOTOR ECONÓMICO NO MODIFICADO. SALARIO NO MODIFICADO. TRANSPORTE NO MODIFICADO. RECARGOS NO MODIFICADOS. DNC NO MODIFICADO. SALUD/PENSIÓN NO MODIFICADA. IBC NO MODIFICADO. TURNOS NO MODIFICADOS. VALORES EXISTENTES NO MODIFICADOS. NO RECÁLCULO MASIVO. Tampoco se modificaron tarifas, fórmulas, deducciones, neto, ajustes manuales ni exportes económicos. `nomina.effects.ts` intacto.

**Y–Z. NO COMMIT. NO PUSH.**
