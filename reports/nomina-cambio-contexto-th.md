# Corrección de cambios operativos y pensión — 17/09/2026

## Auditoría previa, sin modificaciones

Se consultó la base configurada en modo `BEGIN READ ONLY`. Catálogo encontrado:

| ID | Nombre | Código operativo | Activo |
| --- | --- | --- | --- |
| 14 | CAMBIO DE MODALIDAD | NULL | Sí |
| 15 | CAMBIO DE SEDE | NULL | Sí |

Ambos son eventos operativos, sin rango, días, horas ni valor obligatorios. No hay un tipo separado de cambio de institución: se cambia junto con la sede de destino. Los IDs no se hardcodean en el formulario.

### Recorrido anterior y causa

`FrontendNuevo/src/pages/nomina/PlanillaOperativaPage.tsx`, modal `Registrar novedad`, lista `types` → `saveNovelty` → `createNominaNovedad` de `services/nominaApi.ts` → `POST /nomina/novedades` → `createNominaNovedadSchema` → `nomina.service.ts:createNominaNovedad` → `infrastructure/repositories/nomina-novedad.repository.ts` → `nomina_novedades`.

Al seleccionar estos tipos no se renderizaba ningún selector de institución, sede ni modalidad. El payload genérico enviaba tipo, persona, periodo, fechas y observación, pero ningún contexto de destino. Su schema y repository tampoco contienen ese contexto. Guardar el evento genérico no alimenta la lista de cambios que Planilla usa para proyectar el contexto por día. Es una desconexión de formulario/payload/persistencia/proyección, no falta de permiso de novedades de TH.

Permisos anteriores confirmados en la base:

- ADMINISTRADOR y TALENTO_HUMANO: `nomina.novedades.create/update/deactivate`, `nomina.movimientos.create/update/deactivate/read`, `nomina.operativa.read`, `vinculaciones.read`.
- GESTOR: novedades y lectura operativa, pero no escritura de movimientos.
- TH no tenía `vinculaciones.update`, `vinculacion.editar` ni `nomina.recalculate`.

No se ejecutó una sesión de navegador autenticada como TH. La reproducción se hizo revisando el formulario/payload reales, consultando los permisos reales y mediante regresiones ejecutables del componente, servicio y SQL en una base aislada. No se atribuye una respuesta HTTP observada en producción a esta reproducción.

## Corrección sobre el recorrido especializado ya existente

Los mismos tipos del catálogo, seleccionados en el mismo modal de Planilla, ahora usan los campos del cambio operativo existente:

| Capa | Implementación existente reutilizada |
| --- | --- |
| Catálogo real | `GET /vinculaciones/:id/asignacion-operativa/opciones`, `listOpcionesAsignacionOperativa` en `vinculaciones.personal.service.ts` |
| Origen por fecha | `GET /nomina/periodos/:periodo_id/vinculaciones/:vinculacion_id/contexto-operativo/:fecha` |
| Guardar | `POST /nomina/cambios-operativos` |
| Editar / anular | `PATCH /nomina/cambios-operativos/:id` y `/:id/deactivate` |
| Schema | `createCambioOperativoSchema` / `updateCambioOperativoSchema`, `cambios-operativos.schemas.ts` |
| Service y persistencia | `cambios-operativos.service.ts`; SQL directo, sin repository separado |
| Tablas existentes | `nomina_movimientos`, familia `CAMBIO_OPERATIVO`, y snapshot `nomina_contextos_operativos_base` |
| Permisos | `nomina.movimientos.create/update/deactivate`; catálogo `vinculaciones.read`; lectura `nomina.operativa.read` o `nomina.movimientos.read` |
| Restricciones de servicio | Tenant, alcance del empleado, periodo abierto, empleado no cerrado, combinación válida del contrato y continuidad histórica |

Payload: `periodo_id`, `nomina_empleado_id`, `vinculacion_id`, `tipo` (`CAMBIO_DE_MODALIDAD` o `CAMBIO_DE_SEDE`), `fecha_inicio_efectiva`, `regla_fecha_efectiva = MISMO_DIA`, `contexto_anterior`, `contexto_nuevo` y `motivo`. El destino incluye `institucion_id`, `sede_id`, `modalidad_id`, municipio y etiquetas reales. No se agregan campos `nueva_*` duplicados.

La opción de sede permite seleccionar la institución de destino; al cambiar institución se limpian sede y modalidad. Modalidades se obtienen de combinaciones activas de `focalizacion_final` del contrato de la vinculación y se restringen a la sede elegida. El servidor comprueba las relaciones y obtiene las etiquetas del catálogo, en lugar de confiar en texto suministrado por el cliente.

El cambio aparece como marca C y detalle en su fecha efectiva, permite editar/anular con los permisos existentes, cuenta en el filtro de novedades y vuelve a cargarse desde la lista existente de cambios operativos. El snapshot previo se toma del servidor. Planilla usa `contexto_anterior` del primer cambio para los días anteriores a su fecha efectiva. No se reemplaza el contexto maestro de la vinculación ni se rediseñan los tramos.

En la base consultada no existían novedades activas de tipos 14/15 ni movimientos activos de cambios operativos. No se migraron eventos históricos genéricos ni se inventaron destinos para registros antiguos. El formulario genérico de edición histórica permanece para esos registros.

## Cotiza pensión, en su pantalla actual

`NominaPage.tsx` ya guarda el concepto `EXCLUIR_PENSION_FINAL` en `nomina_ajustes_manuales` para el periodo. El frontend exigía edición de vinculaciones, aunque no modifica esa tabla. Ahora exige los permisos reales de crear/actualizar movimientos y rol ADMINISTRADOR o TALENTO_HUMANO. El servicio también comprueba esos roles para crear, editar y anular la exclusión; otros conceptos de deducción conservan sus reglas.

El recálculo posterior usa `nomina.recalculate`. Se aplicó `sql/fix-nomina-th-recalculate-permission.sql`, que asigna ese permiso ya existente solo a ADMINISTRADOR y TALENTO_HUMANO. Consulta posterior confirmó exactamente esos dos roles. No se otorgó edición general de vinculaciones ni permisos completos de administrador. Una sesión con permisos antiguos debe renovarse para reflejar la asignación.

Se conserva la semántica existente: la exclusión es del periodo y no puede activar pensión si la vinculación base no cotiza. No se agregó el campo a Planilla.

## Regresiones

- `FrontendNuevo/src/pages/nomina/cambioOperativo.test.ts`: selección de tipos sin código, catálogo dependiente, permiso de pensión, componente real de captura, limpieza de sede, IDs del payload, endpoint existente, fecha efectiva, doble clic y borrador ante 403/429.
- `src/tests/nomina.cambio-contexto.test.ts`: middleware real de permiso, roles de pensión, SQL del catálogo y del servicio de cambios, persistencia/recarga, historia anterior al 10/09, institución/sede, rechazo de relaciones incompatibles y contexto falsificado, guardado/reactivación de pensión e idempotencia del permiso.

Las pruebas SQL usan PGlite y servicios reales; autenticación, auditoría y comprobaciones de alcance dependientes del entorno se sustituyen en esa prueba aislada. El middleware de permisos y las reglas de pensión se prueban directamente. No se realizaron cambios de contexto o pensión en personas reales.

## Validación

- `npm.cmd run typecheck`, `npm.cmd run build`, `npm.cmd run build --prefix FrontendNuevo`: aprobados. Vite mantiene advertencia de tamaño del bundle.
- Batería focalizada de cambios, pensión, tramos y Planilla: 60/60 aprobadas, incluidas 16 pruebas nuevas (conteo del runner, que incluye el grupo SQL).
- Batería ampliada: `tsx --test --test-concurrency=2 src/tests/nomina*.test.ts FrontendNuevo/src/pages/nomina/*.test.ts`: 349 pruebas, 329 aprobadas, 20 fallidas.
- Se repitieron los nueve archivos con fallos leyendo la versión HEAD de los cinco archivos modificados preexistentes, mediante un preloader de solo lectura, sin restaurar ni sobrescribir archivos del working tree: 112 pruebas, 92 aprobadas y exactamente los mismos 20 fallos. Son fallos previos de comprobaciones de cobertura, scopes, CRUD de áreas, asistencia, Personal y estilos del logo.
- Logs locales: `tmp/nomina-contexto-tests.log` y `tmp/nomina-head-baseline.log`.
