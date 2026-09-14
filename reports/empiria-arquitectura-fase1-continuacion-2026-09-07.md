# Continuación de arquitectura Empiria — 2026-09-07

## A. Qué encontré ya hecho

Se ejecutaron primero `git status --short`, `git diff -- FrontendNuevo` y `git diff --stat`. Había nueve archivos frontend modificados y carpetas nuevas `architecture/` y `pages/workspace/`, una auditoría y pruebas locales. Se conservaron esos cambios. Los reportes y artefactos anteriores de nómina también se conservaron.

Ya existían los dos ámbitos Admin/Empresa, catálogo central tipado, navegación principal/secundaria, guard de acceso, ficha de clientes, planes reutilizados, catálogo maestro, configuración del producto y rutas hacia las pantallas operativas existentes. Había pruebas guardadas con APIs simuladas.

## B. Qué estaba incompleto

El login seguía eligiendo una ruta por permisos sin consultar módulos de empresa. Las raíces de Operación, Logística y Configuración enviaban a un submódulo fijo. Configuración ignoraba sus flags explícitos. Las pestañas internas de SST no se filtraban por submódulo. Portal de servicios mostraba una estructura preparatoria aunque existía PortalPage. Se habían retirado accesos del menú anterior de nómina. La ficha permitía cambiar la empresa del selector comercial y la creación de contratos podía iniciar con otra empresa. Los cambios comerciales no refrescaban el contexto activo ni mostraban todos los errores de guardado.

No se encontró el prompt completo anterior en el contexto ni en los archivos revisados. Se solicitó durante la ejecución. Por tanto, no se certifica una comparación literal con ese documento ausente. La auditoría previa es evidencia de decisiones anteriores, no un reemplazo del prompt.

## C. Qué continué

- Login empresarial dirigido a `/empresa`, que resuelve el primer módulo permitido.
- Raíces de módulos dirigidas a su primer submódulo disponible.
- Flags explícitos de Configuración respetados, conservando acceso por permisos cuando no hay flags configurados.
- Pestañas de SST filtradas con el mismo mecanismo del menú y de las URLs.
- PortalPage reutilizada en Portal de servicios.
- Menú «Opciones de nómina» con rutas existentes y sus permisos; destino inicial compatible con permisos específicos y restricciones de GESTOR.
- Actualización del contexto tras guardar planes/overrides y visualización de errores de esas acciones.
- Selector comercial bloqueado a la empresa de la ficha; creación de contrato inicializada y bloqueada a esa empresa.
- Recuperación de estado de carga/error empresarial y limpieza del indicador de carga al cambiar contrato.
- Corrección del texto accesible «Submódulos».
- Ampliación y ejecución de pruebas de acceso y regresión.

## D. Arquitectura Admin final

| Sección | Ruta |
| --- | --- |
| Dashboard | `/admin-global` |
| Empresas / Clientes | `/admin-global/empresas` |
| Planes | `/admin-global/planes` |
| Módulos | `/admin-global/modulos` |
| Configuración General | `/admin-global/configuracion` |

Acceso exclusivo al rol global existente `ADMINISTRADOR`. La ficha conserva General, Contratos, Usuarios, Plan, Módulos, Uso y Auditoría. Algunas métricas y secciones son preparatorias y muestran «No disponible».

## E. Arquitectura Empresa final

Orden del catálogo: Agenda Operativa, Personal, Operación, Logística, SST y Configuración. Solo se muestran grupos con acceso y al menos un submódulo disponible. No se muestran siempre las seis secciones: dependen de las capacidades reales y del usuario.

## F. Módulos y submódulos

| Módulo | Submódulos del catálogo |
| --- | --- |
| Agenda Operativa | Página con Hoy, Mi semana, Tareas, Pendientes, Recordatorios, Actividad próxima y Pendientes por módulo |
| Personal | Estadísticas, Base de datos, Repositorio, Cobertura, Nómina, Portal de servicios, Evaluación de desempeño, Legislación, Herramientas |
| Operación | Estadísticas, Instituciones, Verificación SIMAT, Reporte diario, Descuentos semanales, Planilla final, Evaluación operacional |
| Logística | Estadísticas, Generador de remisiones, Historial de remisiones, Inventario, Bodegas, Documentos de bodega, Conductores y vehículos |
| SST | Clasificación, Estadísticas, Documentos, Legislación activa, Plan de trabajo, Inspecciones, Incidentes / Accidentes, Riesgos, Capacitaciones, Comités, Auditoría |
| Configuración | Empresa, Contratos, Nómina, Requisitos documentales, Cargos, Áreas, Usuarios, Roles y permisos, Catálogos, Integraciones |

Son seis módulos y 44 submódulos. La presencia en el catálogo no significa que cada funcionalidad esté implementada ni registrada comercialmente.

## G. Rutas

- Entrada: `/` separa Admin/Empresa; `/empresa` resuelve acceso dinámico; `/admin` conserva alias hacia clientes.
- Agenda: `/agenda`.
- Personal: `/personal/{estadisticas,base-datos,repositorio,cobertura,nomina,portal,evaluacion,legislacion,herramientas}`.
- Operación: `/operacion/{estadisticas,instituciones,simat,reporte-diario,descuentos-semanales,planilla-final,evaluacion}`.
- Logística: `/logistica/{estadisticas,remisiones,historial-remisiones,inventario,bodegas,documentos-bodega,conductores-vehiculos}`.
- SST: `/sst/{clasificacion,estadisticas,documentos,legislacion,plan-trabajo,inspecciones,incidentes-accidentes,matriz-riesgos,formacion,comites,auditoria}`.
- Configuración: `/configuracion/{empresa,contratos,nomina,requisitos-documentales,cargos,areas,usuarios,roles,catalogos,integraciones}`.
- Se conservan las rutas originales `/personal`, `/administracion/vinculaciones`, `/repositorio`, `/repositorio/subir`, `/herramientas/*`, `/portal`, `/sst?tab=...` y todas las rutas `/nomina/*`, incluido detalle de empleado.

## H. Habilitación por empresa

CompanyProvider obtiene `/tenant/me`, valida la empresa autorizada y consulta `/saas/companies/:id/capabilities`. La respuesta `modulos` alimenta el menú y WorkspaceAccess. El backend existente calcula plan, suscripción y overrides. Las capacidades de otra empresa no habilitan navegación.

El adaptador conserva los códigos comerciales históricos PERSONAL, NOMINA, COBERTURA, REPOSITORIO, SST, DASHBOARD y PORTAL_COLABORADOR. Un flag específico prevalece sobre su fallback. Los nuevos módulos/submódulos sin códigos históricos requieren habilitación explícita. Configuración conserva su excepción comercial cuando no existen flags, pero respeta cualquier denegación explícita.

La política Legacy del backend permanece intacta. El grupo Personal conserva compatibilidad con planes que solo incluyen nómina u otro producto histórico. La edición comercial usa los endpoints existentes y vuelve a consultar el contexto.

## I. Permisos

Menú y rutas combinan habilitación empresarial con permisos. Se mantienen ModuleRoute, restricciones de GESTOR y controles de backend existentes. Usuarios, Áreas y Configuración de nómina conservan restricciones globales del catálogo. Un módulo habilitado no concede permisos al usuario. La ocultación frontend no sustituye autorización de API.

## J. Pantallas reutilizadas

| Ubicación | Pantalla existente |
| --- | --- |
| Personal → Base de datos | OperationalPersonalPage, con su drawer/expediente |
| Personal → Repositorio | VerDocumentosPage y SubirDocumentosPage |
| Personal → Cobertura | CoberturaDashboardPage y rutas auxiliares existentes |
| Personal → Nómina | NominaHubPage y todas las pantallas y rutas actuales |
| Personal → Portal de servicios | PortalPage |
| SST operativo | SstPage con sus pestañas existentes |
| Configuración | EmpresaConfiguracionTab, ContratosTab, CargosTab, CatalogosTab, UsuariosTab, NominaProcesosTab |

No se modificaron motor, cálculos, valores, DNC, asistencia bulk, turnos, novedades, liquidaciones, lógica de cobertura, documentos funcionales ni expediente. El cambio de SstPage se limita a filtrar navegación.

## K. Archivos modificados

Modificados antes de retomar y conservados: `CompanyContext.tsx`, `MainLayout.tsx`, `ContratosTab.tsx`, `EmpresasTab.tsx`, `NominaProcesosTab.tsx`, `PlanesModulosTab.tsx`, `UsuariosTab.tsx`, `AppRouter.tsx`, `roleNavigation.ts`.

De esos archivos, esta continuación ajustó CompanyContext, MainLayout, ContratosTab, PlanesModulosTab, AppRouter y roleNavigation. Además modificó `pages/sst/SstPage.tsx`.

En el cierre se actualizó `sql/phase-34-1-planes-modulos-saas.sql` para registrar el catálogo completo de Fase 1: los seis módulos de Empresa y sus 44 submódulos. Los códigos están disponibles para asignación explícita; el backend Legacy solo hereda el conjunto histórico, por lo que los espacios futuros no se habilitan automáticamente.

Archivos nuevos de arquitectura presentes: `moduleCatalog.ts`, `moduleAccess.ts`, `productSettings.ts`, `WorkspaceAccess.tsx`, `Workspace.css`; esta continuación añadió `payrollNavigation.ts` y ajustó moduleAccess.

Archivos nuevos de workspace presentes: `AdminDashboardPage.tsx`, `CompaniesPage.tsx`, `ContractOverview.tsx`, `ModuleCatalogPage.tsx`, `ProductConfigurationPage.tsx`, `StructuralPage.tsx`, `WorkspacePage.tsx`; esta continuación ajustó ContractOverview y WorkspacePage.

Evidencia: auditoría previa, este reporte, `tmp/architecture-qa/access.test.ts`, `browser.mjs`, `regression.mjs`, resultados JSON y capturas. Se ampliaron access.test.ts y regression.mjs y se regeneraron resultados/capturas. Los archivos nuevos no aparecen en `git diff --stat` hasta ser agregados; no se agregaron al índice.

## L. Build y pruebas

- `npm.cmd run build` en FrontendNuevo: PASS (`tsc -b && vite build`, 578 módulos transformados).
- Advertencia de Vite: bundle principal mayor de 500 kB; no impide build.
- `tsx tmp/architecture-qa/access.test.ts`: PASS.
- `node tmp/architecture-qa/browser.mjs`: PASS, sin errores de página ni escrituras.
- `node tmp/architecture-qa/regression.mjs`: PASS, incluida regresión nueva de flags y navegación.
- Nómina: 771 empleados simulados, scroll exclusivo de filas, cabeceras/footer y drawer conservados a 1920, 1600 y 1366 píxeles. Verificación móvil y cambio de tema.
- Backend: se modificó únicamente la semilla de migración SQL del catálogo; `npm.cmd run typecheck` y `npm.cmd run build` pasaron.

Las pruebas de navegador interceptan APIs con fixtures locales. No validan persistencia real, despliegue ni cálculos contra la base de datos.

## M. git diff --check

PASS, código de salida 0. Git informa conversión futura LF/CRLF en algunos archivos; no reporta errores de whitespace.

## N. Pendientes reales

1. Contrastar el prompt original completo: no está disponible. No se declara terminada toda la Fase 1 original sin esa comparación.
2. Catálogo comercial persistido: los códigos ya quedaron registrados en la migración; los módulos futuros se dejaron inactivos y requieren activación deliberada antes de asignarse a un plan. No se aplicó la migración ni se activaron funcionalidades a empresas reales.
3. Agenda, operaciones futuras, logística, nuevas áreas de SST y otros espacios estructurales siguen en preparación. No tienen CRUD operativo completo. La auditoría anterior los había tratado como estructura de fase 1; falta confirmar ese alcance con el prompt original.
4. Configuración global editable, capacidades comerciales de usuarios/personal/almacenamiento, versiones de módulos, métricas sin endpoint y auditoría integral siguen sin persistencia o fuente de datos. Las pantallas lo indican sin simular guardados.
5. La autorización de los nuevos códigos de submódulo queda preparada en el frontend y en el catálogo persistido; el middleware backend sigue aplicando los controles de módulo históricos. Si se exige autorización API granular para cada nuevo submódulo, requiere endpoints/backend específicos fuera de esta reorganización.

## O. NO COMMIT

Confirmado: no se ejecutó commit ni se agregó contenido al índice.

## P. NO PUSH

Confirmado: no se ejecutó push ni despliegue.
