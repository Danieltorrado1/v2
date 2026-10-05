# Cambio de modalidad por vigencia — revisión de integración

Fecha: 2026-10-05. Worktree exclusivo: `C:\Users\CORE ULTRA\Desktop\V2-instituciones-modalidad`. Rama: `fix/instituciones-cambio-modalidad-vigente`.

## 1. Causa actual

El formulario compartido obtenía opciones desde asignaciones activas de `focalizacion_final`, mediante `/vinculaciones/:id/asignacion-operativa/opciones`. La validación exigía además una relación activa de `sede_modalidades` en esa misma sede y una proyección mensual coincidente. Una modalidad válida del contrato sin asignación vigente en esa sede quedaba excluida.

También se encontraron: selección de todos los empleados como respaldo cuando ninguno coincidía con la sede; diferencias entre permisos de creación/actualización; desactivación de la versión histórica que los lectores filtraban como inactiva; sustitución del registro en el primer día; lectura de tramos desde movimientos en lugar del contexto canónico; reutilización de categoría anterior; y posibilidad de recálculo automático desde el outbox existente.

## 2. Qué ya existía y qué faltaba

Auditoría inicial: ruta y rama correctas, working tree limpio, HEAD `09a71ddc2d2a769f6a7eacb9dc969cff339586f5`. El commit histórico `6b8f2adecd13e5699d476a8578be3af2639787d6` es ancestro de HEAD y de la referencia local `main`. No se hizo cherry-pick.

Ya existían `resolveOperationalContextAtDate`, `resolveOperationalContextTimeline`, `cobertura_asignaciones` como fuente, movimientos operativos, reparación de snapshots y consultas salariales. Se corrigieron catálogo independiente, versiones temporales sin proyección mensual nueva, confirmación con revisión del servidor, conservación del historial, propagación de identidades directas y categorías por tramo, controles de acceso coherentes y prevención del recálculo automático para este evento.

Esquema auditado: SQL y lectores del repositorio; constraints de claves de las nuevas identidades probados en PostgreSQL embebido PGlite. No se inspeccionó ni certificó el esquema instalado en producción: no se suministró credencial temporal autorizada.

## 3. Endpoint usado

Persistencia: `POST /api/nomina/cambios-operativos`, tipo `CAMBIO_DE_MODALIDAD`. No se creó un segundo mecanismo de escritura. Los movimientos de modalidad son inmutables: PATCH/anulación de esos movimientos se rechazan; un cambio posterior crea otra versión.

Lecturas de la pantalla:

- `GET /api/operacion/instituciones/nomina-periodo`: periodo aplicable.
- `GET /api/nomina/periodos/:id/modalidad-trabajadores`: empleados, sin exigir permiso económico.
- `GET /api/nomina/periodos/:periodo_id/vinculaciones/:vinculacion_id/modalidad-opciones`: catálogo.
- `GET /api/nomina/periodos/:periodo_id/vinculaciones/:vinculacion_id/modalidad-contexto/:fecha`: contexto por fecha.
- `GET /api/nomina/cambios-operativos/preview-modalidad`: antes/después, vigencias, salario, impactos y revisión SHA256.

El POST vuelve a validar bajo transacción y bloqueos de vinculación/periodos. Una revisión caducada se rechaza. Una repetición idéntica devuelve el movimiento existente sin otra versión.

## 4. Fuente del selector

`contractModalityOptions` toma modalidades activas del contrato desde la unión de `sede_modalidades` de todo el contrato y `calculadora_personal_config` activa; las cruza con `modalidades` activas y las instituciones/sedes activas de ese contrato. No exige que la modalidad destino tenga focalización ni asignación en la sede seleccionada.

La fila mensual sigue identificada como «Modalidad en focalización». El contexto operativo se consulta por fecha; la categoría se consulta por contrato, empresa, modalidad y vigencia. No se ejecuta el importador mensual ni se escribe `focalizacion_final`/`focalizacion_vigencias`.

## 5. Archivos modificados

Frontend:

- `FrontendNuevo/src/pages/nomina/CambioModalidadFields.tsx` (nuevo).
- `FrontendNuevo/src/pages/nomina/CambioOperativoFields.tsx`.
- `FrontendNuevo/src/pages/nomina/cambioOperativo.test.ts`.
- `FrontendNuevo/src/pages/operacion/OperacionInstitucionesFinalPage.tsx`.
- `FrontendNuevo/src/pages/operacion/institucionesPresentation.ts`.
- `FrontendNuevo/src/pages/operacion/institucionesPresentation.test.ts`.
- `FrontendNuevo/src/services/nominaApi.ts`.
- `FrontendNuevo/tests/instituciones-runtime.test.mjs`.

Backend:

- `src/middlewares/operationalChangePermission.ts` (nuevo).
- `src/modules/cobertura/modalidad-contract-catalog.ts` (nuevo).
- `src/modules/cobertura/cobertura-asignacion.service.ts`.
- `src/modules/integracion/contexto-laboral.service.ts`.
- `src/modules/integracion/integracion.service.ts`.
- `src/modules/nomina/modalidad-change-preview.ts` (nuevo).
- `src/modules/nomina/canonical-salary-timeline.ts` (nuevo).
- `src/modules/nomina/cambios-operativos.controller.ts`.
- `src/modules/nomina/cambios-operativos.schemas.ts`.
- `src/modules/nomina/cambios-operativos.service.ts`.
- `src/modules/nomina/infrastructure/repositories/nomina-poblacion.repository.ts`.
- `src/modules/nomina/nomina.procesos.ts`.
- `src/modules/nomina/nomina.routes.ts`.
- `src/modules/nomina/nomina.service.ts`.
- `src/modules/operacion/operacion.routes.ts`.
- `src/modules/vinculaciones/vinculaciones.controller.ts`.
- `src/modules/vinculaciones/vinculaciones.personal.controller.ts`.
- `src/modules/vinculaciones/vinculaciones.personal.service.ts`.
- `src/modules/vinculaciones/vinculaciones.service.ts`.

Pruebas y soporte:

- `src/tests/instituciones.modalidad-temporal.test.ts` (nuevo).
- `src/tests/integracion.fase1.test.ts`.
- `src/tests/nomina.4b1.scopes.test.ts`.
- `src/tests/nomina.cambio-contexto.test.ts`.
- `src/tests/personal-3a-asignacion-operativa.test.ts`.
- `src/tests/planilla-consistencia.test.ts`.
- `src/scripts/test-instituciones-modalidad.cjs` (nuevo).
- `package.json`.
- `sql/phase-48-operational-assignment-identities.sql` (nuevo).
- Este informe.

**Prerrequisito de integración:** el SQL agrega IDs de institución/sede/modalidad y permite `focalizacion_final_id` nulo en versiones independientes. Incluye backfill desde la proyección existente y un índice temporal; no modifica focalización. Se probó dos veces en memoria. No se aplicó a una base externa. Si falta este esquema, el preview responde `ASIGNACION_ESQUEMA_REQUERIDO` y no habilita guardar. Su aplicación queda para el proceso controlado de integración, fuera de este trabajo.

## 6. RI → CAA

Caso probado: RI 2026-09-01 a 2026-09-06 inclusive; CAA desde 2026-09-07. Dos versiones, una institución, una sede, misma persona/vinculación y 30 días de septiembre contados una vez. Se conserva el fin aplicable de asignación/contrato/vinculación. El historial anterior permanece consultable. Un cambio en el primer día conserva la fila sustituida como inactiva, sin fabricar un intervalo negativo; la nueva versión empieza ese día.

## 7. Personal

Expediente/contexto personal aceptan `?fecha=YYYY-MM-DD` y seleccionan la versión vigente en esa fecha. Se conservan asignación laboral, identidad y vigencias. La prueba consulta el servicio de Personal antes/después del día 7 contra asignaciones reales persistidas en PGlite, con catálogos auxiliares aislados.

## 8. Planilla

El resolver devuelve modalidad por cada fecha del periodo. Sólo se reparan snapshots operativos de periodos `ABIERTO` para la misma vinculación. Las pruebas comparan asistencia, novedades, turnos, asignación laboral, identidad y snapshot cerrado antes/después: permanecen iguales. No se trasladan registros ni se crea otra fila de empleado.

## 9. Nómina

El cálculo manual usa la línea temporal canónica y divide modalidades/categorías por vigencia. RI hasta el 6 y CAA desde el 7 generan dos tramos sin duplicar días. Se marca `requiere_recalculo` en liquidaciones abiertas afectadas sin alterar importes. El outbox de origen `INSTITUCIONES_MODALIDAD_VIGENCIA` conserva trazabilidad y evita recálculo automático sin cambiar flags. Los periodos cerrados/anulados afectados bloquean la operación; los no afectados quedan intactos.

Se verificó el cálculo puro de los tramos en memoria; no se ejecutó un recálculo contra una base externa.

## 10. Categorías salariales

Una categoría única válida se propone; ausencia/ambigüedad devuelven `REQUIERE_REVISION_SALARIAL`, sin selección arbitraria. El contexto puede versionarse con esa advertencia y el motor económico rechaza el cálculo hasta resolver categorías inequívocas. El motor también divide en límites de vigencia salarial y valida cada intervalo, no sólo la fecha inicial. El formulario muestra categoría actual del snapshot y nombre de la propuesta.

## 11. Permisos

UI/backend: ADMINISTRADOR autorizado; TALENTO_HUMANO requiere permiso efectivo `nomina.movimientos.create`; GESTOR y lectura rechazados incluso con ese permiso. Sólo tener permiso de actualización no autoriza crear. Backend comprueba tenant de la vinculación, contrato del periodo, correspondencia del empleado, catálogo del contrato y alcance operativo. El contexto consultado debe coincidir con institución/sede seleccionadas; se eliminó el respaldo a todos los empleados.

## 12. Pruebas y reproducción

Resultados: **281 pruebas aprobadas, 0 fallos**, en 32 archivos; comprobación posterior de Nómina/Planilla/scope tras completar el lector de contexto de turnos: **77 aprobadas, 0 fallos**. Typecheck backend, build backend, build frontend y `git diff --check` aprobados. Vite conserva su advertencia de tamaño de chunk; no impide el build.

Navegador sobre el build real: cuatro escenarios ADMINISTRADOR/GESTOR, con APIs interceptadas y credenciales sintéticas. Catálogo CAA disponible, confirmación habilita guardar, cambios de fecha conservan periodo correcto, cancelación conserva filtros. Cero mutaciones, errores de render, rutas inesperadas o bucles.

| Requisito | Evidencia |
| --- | --- |
| 1 RI → CAA; 2 CAA → RI | Servicio transaccional real y versiones persistidas |
| 3 primer día; 4 último día; 5 futuro | Casos separados con total de días e historial |
| 6 retroactivo abierto | RI → CAA con fecha de septiembre en fixture abierto |
| 7 cerrado; 8 anulado | Rechazo en periodo actual y cerrado posterior afectado |
| 9 historial; 10 idempotencia | Filas históricas conservadas, mismo movimiento en reintento |
| 11 solapamiento; 12 hueco | Rechazo explícito antes de persistir |
| 13 empresa/contrato | Fixture ajeno y suites tenant/seguridad/alcance |
| 14 destino sin asignación | CAA sólo configurada en catálogo, sin relación vigente en la sede |
| 15 única; 16 ambigua; 17 ausente | Propuesta única o revisión; motor bloqueado |
| 18 Planilla por día | Consulta de los 30 días contra servicio canónico |
| 19 Nómina dos tramos | Categorías RI/CAA, 6+24 días, cálculo puro |
| 20 Personal vigente | Servicio Personal consulta días 6 y 7 e historial |
| 21 ADMIN; 22 TH; 23 GESTOR | Middleware efectivo y pruebas UI/RBAC |
| 24 cancelar no escribe | Navegador intercepta cualquier método distinto de GET |

Reproducir desde este worktree:

```powershell
npm run typecheck
npm run build
npm run test:instituciones-modalidad
npm --prefix FrontendNuevo run build
node FrontendNuevo/tests/instituciones-runtime.test.mjs
git diff --check
```

El runner sustituye conexiones por destinos inválidos, desactiva jobs y usa fixtures PGlite en memoria. En este entorno el sandbox bloqueó inicialmente procesos Node con EPERM; se repitió con la aprobación de ejecución correspondiente, sin habilitar conexiones productivas. El navegador requiere Chromium local compatible.

## 13. Git

Entrega mediante commit y push exclusivamente a `fix/instituciones-cambio-modalidad-vigente`. El hash final se informa en la respuesta y se identifica con `git log -1` en esta rama. Sin merge a main ni deploy.

## 14. Producción y límites

**Cero escrituras productivas y cero conexiones productivas.** No hubo credencial temporal autorizada, por lo que no se afirman resultados de una base productiva. No se ejecutaron importaciones, recálculos externos, migraciones productivas ni cambios de flags. No se tocó el workspace principal, focalización septiembre, agosto, stashes, main-asignaciones, ramas de Nómina, backups, clusters ni snapshots/digests certificados. Las mutaciones de prueba ocurrieron exclusivamente en bases embebidas desechables.

## 15. Decisión

**CAMBIO DE MODALIDAD POR VIGENCIA COMPLETADO — LISTO PARA INTEGRACIÓN**

Listo como cambio de código probado y artefacto SQL revisable; todavía no desplegado ni aplicado en producción.
