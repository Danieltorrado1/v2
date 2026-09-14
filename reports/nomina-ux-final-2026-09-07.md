# Corrección final de UX de Nómina

Cambios limitados al frontend. La auditoría inicial encontró únicamente dos artefactos previos sin seguimiento: `reports/nomina-periodos-personal-2026-09-07.md` y `tmp/nomina-population-qa/`. Se conservaron. No se modificaron servicios backend, fórmulas ni datos de la BD real.

## A–F. Scroll y KPIs

**A. Causa:** `MainLayout` ya dispone de `.page-scroll` con el alto restante bajo la topbar y scroll vertical. Dentro, Nómina conservaba `height: 100%`, `overflow: hidden`, una fila grid de alto restringido y otro scroll en `.payroll-periods`. La combinación creaba una segunda ventana de contenido y hacía poco visible el final de las cards.

**B. Corrección:** la lista de períodos crece por su contenido y utiliza `.page-scroll` como único scroll vertical principal. Se mantienen topbar y navegación. El cambio está condicionado a la presencia de `.nomina-page--period-host`, para no alterar otras pantallas. Se dejan 28 px al final. No se aumentó la altura de las filas.

**C. Footer visible: PASS.** Prueba en el `MainLayout` real: paginación, borde inferior y espacio final visibles, con un solo contenedor vertical desplazable. Evidencia: `tmp/nomina-ux-qa/footer.png`.

**D–E. KPIs:** estructura icono pequeño + título + valor, sin subtítulos. Contenedor **36 → 32 px**; icono **20 → 17 px**. El texto usa el ancho restante. Sidebar de escritorio conservado alrededor de 170 px.

**F. Valores completos: PASS.** Se mantienen los saltos controlados de montos, sin elipsis. Verificado sin desbordamiento horizontal a 1440, 1024, 768 y 390 px.

## G–I. Planilla Operativa

**G. Causa:** cuando el endpoint de empleados devolvía una lista vacía se renderizaba igualmente la cuadrícula virtual, con espacio de filas de altura cero y sin estado explicativo. Los errores de configuración podían dejar el indicador de carga sin resolución. No había acción de carga desde Planilla.

**H. Con cero materializados:** se consulta la disponibilidad mediante el dashboard existente cuando el usuario tiene `nomina.dashboard.read`. Se muestra la cantidad disponible y CARGAR PERSONAL, respetando `nomina.empleados.import` y período ABIERTO. Si no hay permiso de dashboard no se inventa una cantidad: se muestra un mensaje genérico de personal no cargado. También hay estados de carga, error con reintento, cero elegibles, ausencia de período y filtros sin coincidencias.

**I. Después de cargar:** se reutiliza `importNominaEmpleados`, se refresca el flujo existente de lectura y se conserva el período seleccionado. No requiere F5. Con personal aparece ACTUALIZAR PERSONAL. La prueba de navegador pasó con septiembre vacío y agosto abierto. Toda escritura de esta prueba fue interceptada: una sola petición a `/api/nomina/periodos/9/importar-empleados`, sin peticiones de recálculo.

## J–P. Ficha de una nómina

**J. Patrón auditado:** Personal operativo usa `PersonalMasterDrawer`, un panel amplio con cabecera de identidad y secciones; conserva el contexto de la lista mediante estado local. No tiene una ruta de ficha equivalente. Se adaptó ese patrón de ficha con cabecera, datos de contexto y secciones a una pantalla completa de React Router, como pide esta tarea; no se reutilizó el drawer ligado al dominio de Personal.

**K. Ruta:** `/nomina/gestion/:periodoId/empleado/:nominaEmpleadoId`, con la misma protección de módulo, permiso de lectura y exclusión de GESTOR que la lista de Nómina.

**L. Identificadores:** `periodoId` y `nominaEmpleadoId`. Se valida la pertenencia de la nómina al período recibido. Novedades, movimientos, turnos, ajustes, revisión y desprendibles se filtran por esos identificadores; no por nombre ni cédula. Se utilizan endpoints existentes. No se creó endpoint backend.

**M. Detalle no inline: PASS.** El ojo navega a la ruta, manteniendo título y aria-label. Se eliminó la expansión de empleado dentro de la tabla. La expansión de novedades, que no era objeto de este cambio, se mantiene intacta.

**N. Secciones:** identidad, documento, período, revisión, cargo, modalidad, municipio, institución y sede; devengados; días pagados; deducciones; total devengado, total deducciones y neto destacado; novedades con fechas/días/estado/observación/soporte; turnos internos/externos con persona cubierta, modalidad, valor y estado; movimientos de deducción; ajustes y trazabilidad; revisión con fecha/responsable disponibles; desprendibles existentes según permisos. No se añade impresión ni generación nueva de PDF. La acción de consulta de desprendible reutiliza el handler existente.

La representación financiera previa se trasladó sin duplicar la lógica económica. Se conservó el handler de ajustes manuales existente, sin modificar su implementación. Las consultas complementarias tienen carga, errores y reintento por sección; los turnos recorren todas las páginas del endpoint. La ficha tiene estados de carga, error con reintento y nómina no encontrada.

**O. Igualdad con backend: PASS en fixtures de navegador.** Se contrastaron total devengado, total deducciones y neto con las respuestas ficticias, y se inspeccionó la ficha. Las funciones financieras existentes no fueron alteradas.

**P. Volver conserva contexto: PASS.** Se conserva período, meses abiertos, búsqueda, filtros, orden, página y tamaño de página en memoria, separados por usuario/empresa/período. Se corrigieron los efectos que devolvían la paginación a 1 al montar o mientras aún no llegaban los empleados. Un acceso directo puede volver a la lista con `period_id`; el contexto en memoria no persiste tras una recarga completa del navegador.

## Q–V. No regresión y validaciones

**Q. Agosto intacto: PASS** en la prueba de lectura de Planilla con API ficticia.

**R. Asistencia bulk intacta: PASS.** Comparación literal contra HEAD de `flushAttendance`/`toggleAttendance` y del bloque de cola, pendientes, debounce y sessionStorage: sin cambios. También se compararon literalmente `handleSaveManualFinal` e `InternalTurnsDetail`: sin cambios. Hashes en `tmp/nomina-ux-qa/preservation.json`.

**S. Archivos modificados:**

- `FrontendNuevo/src/pages/nomina/NominaPage.tsx`
- `FrontendNuevo/src/pages/nomina/NominaPage.css`
- `FrontendNuevo/src/pages/nomina/PlanillaOperativaPage.tsx`
- `FrontendNuevo/src/pages/nomina/PlanillaOperativaPage.css`
- `FrontendNuevo/src/router/AppRouter.tsx`

Nuevos: `NominaEmpleadoDetallePage.tsx`, `NominaEmpleadoDetalleSections.tsx` y `NominaEmpleadoDetallePage.css`, dentro de la misma carpeta de Nómina. El CSS nuevo está limitado al prefijo `.nomina-employee-detail`. Se añaden este informe y los artefactos QA en `tmp/nomina-ux-qa/`.

**T. Frontend build: PASS**, ejecutado con `npm run build`. Conserva el aviso de bundle grande de Vite.

**U. Backend:** sin modificaciones; typecheck/build no requeridos por este cambio. Se ejecutó adicionalmente el build backend: **PASS**.

**V. `git diff --check`: PASS**.

Prueba reproducible: iniciar Vite en FrontendNuevo, puerto 5177, y ejecutar `node tmp/nomina-ux-qa/visual.mjs`. Usa playwright-core instalado en la carpeta QA previa y Edge en modo headless. Crea y elimina su entrada temporal; todas las peticiones API son ficticias. `result.json` registra diez grupos de comprobaciones PASS, incluidos error/reintento, no encontrado y retorno a página 2. Las imágenes de ficha, ficha móvil, footer y Planilla vacía fueron revisadas. No se hizo QA destructiva ni materialización en BD real.

## W–Y. Confirmaciones

MOTOR DE NÓMINA NO MODIFICADO. CÁLCULOS NO MODIFICADOS. VALORES NO MODIFICADOS. DNC NO MODIFICADO. TURNOS NO MODIFICADOS. NOVEDADES NO MODIFICADAS. ASISTENCIA BULK NO MODIFICADA. NO RECÁLCULO MASIVO.

Salario, transporte, recargos, salud/pensión, IBC, tarifas, fórmulas y handlers económicos existentes intactos. No se modificó `nomina.effects.ts`.

**NO COMMIT. NO PUSH.**

## Corrección urgente posterior (2026-09-07)

- `importNominaEmpleados` desempaqueta respuestas con sobre `{ success, data }`; Planilla limpia errores previos, muestra el resumen real y vuelve a consultar trabajadores, resumen y paginación manteniendo septiembre seleccionado.
- Nómina volvió a una caja de altura disponible: la página conserva su alto normal y cada listado usa `overflow-y: auto` interno con `min-height: 0`; la paginación permanece fuera del scroll de filas.
- `Ver detalle` abre ahora un drawer superpuesto con backdrop, bloqueo del fondo, scroll propio y cierre por X/backdrop/ESC. La ruta existente se conserva solo para deep-link.
- Frontend build y `git diff --check`: PASS. No hubo cambios backend ni económicos, ni commit/push.
