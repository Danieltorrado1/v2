# Auditor?a previa ? arquitectura fase 1

Estado inicial: git status solo conten?a reports/nomina-periodos-personal-2026-09-07.md, reports/nomina-ux-final-2026-09-07.md y tmp/nomina-{population,ux}-qa/ sin seguimiento. git diff y git diff --stat vac?os. No se modifican esos trabajos.

- MainLayout: un ?nico shell mezcla Dashboard, Personal, N?mina, Herramientas, SST, Portal, Repositorio y Administraci?n; arrays separados de navegaci?n.
- AppRouter: ProtectedRoute autentica; ModuleRoute combina c?digos SaaS y permisos. AdminPage exige ADMINISTRADOR. Las rutas originales permanecen.
- Administrador global: ADMINISTRADOR, confirmado en tenantMiddleware.loadTenantAccess y saas.routes.globalAdmin. No existe un rol SUPERADMIN separado.
- Empresa activa: CompanyProvider obtiene /tenant/me; valida selecci?n autorizada, persiste empiria_empresa_id y carga /saas/companies/:id/capabilities. API y backend conservan validaci?n tenant.
- Contrato activo: estado local de las pantallas operativas, filtrado por empresa. No existe contexto ?nico que deba sustituirse.
- SaaS: modulos, planes, plan_modulos, empresa_suscripciones, empresa_modulo_overrides, historial auditado; cat?logo de c?digos string extensible. Estados de suscripci?n ACTIVA/PRUEBA/SUSPENDIDA/VENCIDA/CANCELADA. Legacy habilita m?dulos activos en backend, no se alterar? esa pol?tica.
- Configuraci?n: EmpresasTab, ContratosTab, UsuariosTab, CargosTab, CatalogosTab, EmpresaConfiguracionTab y NominaProcesosTab conectados a APIs reales. RolesTab y RequisitosTab antiguos contienen mocks: no se reutilizar?n. Requisitos reales est?n en el expediente de contrato. Roles/permisos s? tienen endpoints de lectura.
- Personal /personal reutiliza OperationalPersonalPage y PersonalMasterDrawer. /repositorio reutiliza VerDocumentosPage. /herramientas/cobertura reutiliza CoberturaDashboardPage. /nomina y todas sus rutas se conservan, incluida gesti?n con scroll interno y drawer.
- SST mantiene SstPage y sus tabs. Instituciones/sedes existen en opciones de Personal por contrato; no se crea cat?logo duplicado.
- Tokens light/dark, assets de marca y componentes existentes se reutilizan. Configuraci?n de producto y flags de madurez futuros requieren persistencia adicional; no se simular? guardado.

Decisi?n: cat?logo frontend tipado de dos scopes, adaptaci?n expl?cita de c?digos existentes, nuevos m?dulos cerrados por defecto, flags expl?citos de subm?dulo con prioridad sobre fallback, guard compartido para rutas nuevas y antiguas. Configuraci?n no depende de plan pero respeta permisos. Backend intacto.
