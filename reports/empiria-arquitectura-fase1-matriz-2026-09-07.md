# Matriz final de cumplimiento — Fase 1

Fecha: 2026-09-07. Se conserva el estado previo y se aplicaron solo ajustes de arquitectura, navegación, catálogo y migración de códigos. No se ejecutó commit ni push.

| Punto del prompt | Estado | Evidencia / alcance |
|---|---|---|
| Auditoría previa y estado Git | PASS | Auditoría y diff iniciales documentados en `empiria-arquitectura-fase1-auditoria.md` y reporte de continuación. |
| Dos experiencias separadas | PASS | `MainLayout`, `adminScope`, `WorkspaceAccess`, rutas globales y tenant. |
| Admin con exactamente cinco módulos | PASS | `adminModules`: Dashboard, Empresas/Clientes, Planes, Módulos, Configuración General. |
| Dashboard global | PASS | KPIs y secciones; métricas no disponibles se muestran como tal. |
| Empresas/Clientes y acciones | PASS | Tabla, ficha, Ver, Editar, Entrar, Usuarios, Contratos, Plan y activar/desactivar según APIs existentes. |
| Ficha de empresa | PASS | Drawer con GENERAL, CONTRATOS, USUARIOS, PLAN, MÓDULOS, USO y AUDITORÍA. |
| Planes | PASS | Crear, editar, duplicar, desactivar y módulos incluidos; capacidades comerciales futuras se muestran sin inventar datos. |
| Catálogo maestro Admin | PASS | `ModuleCatalogPage` muestra códigos, descripción, icono, estado, versión, dependencias, planes y submódulos. |
| Todos los códigos de módulos/submódulos | PASS | Catálogo tipado frontend y seed SQL incluyen los seis módulos Empresa, 44 submódulos y códigos históricos compatibles; los nuevos códigos son administrables por plan/override. |
| Configuración General de producto | PASS | Diez secciones: Identidad, Apariencia, Tipografía, Etiquetas, Formatos, Plantillas, Correos, Versiones, Feature flags y Sistema. |
| Identidad y tokens | PASS | Assets actuales y tokens existentes se consultan sin reemplazo automático ni theme engine nuevo. |
| Empresa con seis módulos conceptuales | PASS | Agenda, Personal, Operación, Logística, SST y Configuración en `moduleCatalog`. |
| Visibilidad por empresa | PASS | `/tenant/me` + `/saas/companies/:id/capabilities`; capacidades stale no habilitan navegación. |
| Visibilidad por submódulo | PASS | `visibleTenantModules`, `canAccessEntry` y `WorkspaceAccess`; flags explícitos prevalecen. |
| Configuración independiente del plan | PASS | Fallback disponible por permisos; una denegación explícita sigue bloqueando. |
| Separación módulo/permiso | PASS | Empresa habilitada AND permiso del usuario; guards frontend y middleware existente. |
| Agenda Operativa | PASS | Pantalla estructural con Hoy, semana, tareas, pendientes, recordatorios y actividad; sin persistencia falsa. |
| Personal y nueve submódulos | PASS | Estadísticas, Base de datos, Repositorio, Cobertura, Nómina, Portal, Evaluación, Legislación y Herramientas. |
| Reutilización Personal existente | PASS | OperationalPersonalPage/Expediente, repositorio, Cobertura, PortalPage y todas las rutas de Nómina. |
| Personal Estadísticas | PASS | Resumen real por contrato; métricas no disponibles no se inventan. |
| Portal de servicios | PASS | PortalPage existente reutilizada; estructura/empty states cuando aplica. |
| Evaluación y Legislación estructurales | PASS | Secciones previstas y estados legales visuales. |
| Operación y siete submódulos | PASS | Catálogo y pantallas estructurales; Instituciones consulta opciones reales existentes. |
| Logística y siete submódulos | PASS | Catálogo y pantallas estructurales sin motor de remisiones/inventario ficticio. |
| SST y once submódulos | PASS | Clasificación primero, SstPage existente reutilizada y tabs filtradas por flags/permisos. |
| Configuración Empresa y diez submódulos | PASS | Rutas y catálogo; reutiliza EmpresaConfiguracionTab, ContratosTab, CargosTab, Catálogos, Usuarios y Nómina de configuración. |
| Nómina configuración | PASS | NominaProcesosTab existente; no se alteran cálculos ni motor económico. |
| Requisitos documentales | PASS | Pantalla estructural enlazada a contratos/expediente existente. |
| Rutas nuevas | PASS | `/admin-global/*`, `/agenda`, `/personal/*`, `/operacion/*`, `/logistica/*`, `/sst/*`, `/configuracion/*`. |
| Aliases y rutas antiguas | PASS | `/personal`, `/repositorio`, `/herramientas/*`, `/portal`, `/sst?tab=*`, `/nomina/*`, administración y expediente conservados. |
| Diseño y responsive | PASS | Shell actual, topbar, scroll interno de nómina, light/dark, responsive y QA móvil. |
| No funcionalidad falsa | PASS | Estructurales son empty states; no hay botones de persistencia donde no existe API. |
| Admin global vs tenant | PASS | Rol `ADMINISTRADOR`; rutas globales bloqueadas a usuarios normales. |
| No regresión operativa | PASS | No se tocaron motor/cálculos/valores/DNC/asistencia bulk/turnos/novedades/liquidaciones; pantallas existentes permanecen montadas. |
| Backend | PARCIAL | Middleware SaaS histórico queda vigente; códigos nuevos están registrados en SQL, pero autorización granular de API por cada submódulo futuro requeriría endpoints específicos. |
| Módulos futuros completos | PENDIENTE | Agenda avanzada, operación futura, logística futura y configuración global editable son estructuras de Fase 1, sin CRUD operativo; el catálogo los deja disponibles para habilitación explícita, sin activarlos por Legacy. |
| Métricas comerciales no expuestas por API | PARCIAL | Cards preparadas muestran “No disponible”; no se inventan fuentes. |

## Validaciones ejecutadas

- Frontend: `npm.cmd run build` — PASS.
- Backend: `npm.cmd run typecheck` y `npm.cmd run build` — PASS, porque se actualizó la migración SQL del catálogo.
- Unitarias SaaS/configuración: 46/46 PASS.
- QA de acceso y regresión de navegador: PASS, sin errores de página ni escrituras; rutas existentes, empresa correcta, permisos, flags, SST, Personal y Nómina verificadas.
- `git diff --check` — PASS (solo advertencias normales de conversión LF/CRLF).

Los QA de navegador usan fixtures locales para evitar mutaciones; no sustituyen una validación contra base de datos de producción.

NO COMMIT. NO PUSH.
