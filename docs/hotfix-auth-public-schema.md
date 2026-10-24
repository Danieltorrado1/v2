# Hotfix de autenticación: referencias explícitas a public

## Base y aislamiento

- SHA productivo confirmado por el usuario: `1effd71930d23a6e3fc26e9f8792858c6ef5995a`.
- Worktree: `.worktrees/hotfix-auth-public-schema`.
- Rama: `fix/auth-public-schema`; HEAD sigue en el SHA productivo, sin commit del hotfix.
- El checkout principal y sus cambios de RFC-001/Nómina no se utilizan como fuente del parche.

## Causa y decisión

La evidencia productiva confirma `search_path` vacío, solo `pg_catalog` efectivo, `usuarios` sin resolver y `public.usuarios` existente con permisos. La consulta efectiva original de login falla con 42P01 en posición 1877. Se reproduce esa posición en PostgreSQL embebido PGlite usando el SQL del SHA productivo.

La procedencia administrativa del search_path vacío (ajuste de rol/base, startup options o pooler) no queda determinada por este parche. La corrección elimina esa dependencia en el recorrido seleccionado. No cambia el pool, inicializa sesiones ni usa SET como reparación. Es compatible con consultas independientes a través de Transaction Pooler porque cada referencia identifica su esquema.

## Cambios funcionales: exclusivamente SQL

| Archivo | Consultas calificadas |
|---|---|
| `src/modules/users/users.service.ts` | `getUserAuthQuery`, `getUserProfileSelect`: usuario, roles, permisos y asignaciones. `auth.users` se conserva. |
| `src/middlewares/authMiddleware.ts` | `AUTH_USER_LOOKUP_QUERY`: identidad y autorización actuales para cada petición. |
| `src/middlewares/tenantMiddleware.ts` | `loadTenantAccess`: roles y asignaciones activas, tanto con cliente externo como mediante dbQuery. |
| `src/modules/tenant/tenant.service.ts` | `getTenantMeContext`: empresas, organizaciones y contratos; filtros, orden y selección por defecto intactos. |
| `src/modules/auditoria/auditoria.helper.ts` | `insertLegacyAuditRows`, `insertHistorialDiffRows`: auditoría e historial. |
| `src/modules/auditoria/auditoria.service.ts` | `insertAuditEventRow`, `buildEventContext`: auditoría centralizada y contexto de vinculación. |
| `src/modules/saas/saas.service.ts` | `getEmpresaCapabilities`, `listModules`, `listGlobalCompanyControl`: capacidades y dashboard global inicial. |

Son siete archivos funcionales, 63 líneas sustituidas por sus equivalentes con esquema. No se cambia ninguna condición, parámetro, join, orden, rol, JWT, contraseña, transición, firma o contrato HTTP. El test contrasta hashes contra el SHA productivo tras normalizar exclusivamente las calificaciones SQL y verifica archivos de autenticación/pool/rutas que deben permanecer intactos.

Relaciones calificadas: `usuarios`, `usuario_roles`, `roles`, `rol_permisos`, `permisos`, `usuario_empresas`, `usuario_contratos`, `auditoria`, `historial_cambios`, `auditoria_eventos`, `vinculaciones`, `contratos`, `empresas`, `organizaciones`, `empresa_suscripciones`, `planes`, `modulos`, `plan_modulos`, `empresa_modulo_overrides`.

La pertenencia prevista a public se contrasta con el contrato del repositorio: `audit-users-schema.ts` inspecciona explícitamente public para las tablas de acceso; fases SaaS y organizaciones declaran public; las migraciones de auditoría y accesos definen las relaciones V1 del mismo esquema de aplicación. El catálogo de la base aislada verifica su resolución. Solo la existencia/permisos productivos de `public.usuarios` fueron aportados como evidencia directa; la comprobación productiva del resto debe preceder al despliegue, sin inferirla de los fixtures.

## Pruebas y resultados

- Nuevo: `src/tests/auth.public-schema.integration.test.ts`.
- Nuevo: `src/tests/fixtures/auth-public-schema.production-baseline.json`, capturado desde el SHA productivo, sin credenciales ni datos de usuarios.
- PostgreSQL PGlite en memoria con fixtures sintéticos; routers, servicios, middleware, bcrypt, JWT y auditoría reales. Se interceptan ambos accesos al pool antes de ejecutar handlers; no se conecta a Supabase. Las tablas de prueba existen solo dentro del proceso de pruebas; no hay migración ni DDL externo.
- 12 pruebas contando contenedores: reproducción del 42P01/1877 original, login válido/incorrecto/inactivo, middleware y /me, auditoría central/legacy/historial, tenant, capacidades, administrador global y resumen, igualdad de respuestas/permisos, y operaciones independientes manteniendo search_path vacío.
- Comando autónomo: `node --import tsx --test --test-reporter=tap src/tests/auth.public-schema.integration.test.ts`.
- 60/60 pruebas focalizadas aprobadas incluyendo las anteriores y `admin-2a-contexto-empresarial`, `admin-2a2-global-companies`, `admin-2b-saas`, `contracts.security`. Las pruebas antiguas que importan el entorno se ejecutaron con variables sintéticas pasadas al proceso, sin archivos .env ni secretos reales. La primera ejecución conjunta falló por variables ausentes en el worktree limpio; al configurar el entorno sintético pasó completa, sin cambiar código ni expectativas de esos tests.
- `npm run typecheck`: aprobado.
- `npm run build` backend: aprobado.
- `npm run build` en `FrontendNuevo`: aprobado; aviso de chunks mayores a 500 kB, sin error. No se modificó frontend.
- `git diff --check`: aprobado. Ningún archivo de Nómina, frontend, configuración del pool o RFC-001 en el diff.

PGlite no emula el protocolo de Supavisor ni reasigna sesiones reales. La prueba demuestra que las consultas calificadas funcionan sin public en la ruta y que el código no intenta fijar un estado de sesión; no es una certificación contra el pooler productivo.

## Consultas posteriores al login todavía dependientes de search_path

El hotfix no pretende corregir todas las consultas del backend:

- `users.service.ts`: CRUD administrativo, búsquedas auxiliares y enriquecimiento de usuarios fuera de los dos SELECTs indicados.
- `tenantMiddleware.ts`: verificaciones de otras entidades/contratos fuera de `loadTenantAccess`.
- `tenant.service.ts`: gestión de asignaciones, acceso de otros usuarios y sus helpers dinámicos.
- `saas.service.ts`: planes, historial, uso detallado, cambios de suscripción/overrides y `listCompanySaasSummaries` (el router inicial usa `listGlobalCompanyControl`).
- `saas.middleware.ts`: resolución de entidades y comprobaciones usadas al entrar a módulos.
- `auditoria.service.ts`: listados y exportaciones de auditoría; la escritura usada por login sí está cubierta.
- Notificaciones, configuración de producto, dashboards operativos y módulos de negocio conservan SQL sin esquema. Pueden devolver 42P01 al abrir esas rutas con el mismo contexto. Nómina se mantiene expresamente fuera del parche.

La recuperación verificada localmente comprende login, /me, /tenant/me, capacidades, catálogo de módulos y resumen global inicial. No implica que todas las pantallas posteriores funcionen.

## Validación productiva previa y publicación futura (no ejecutadas)

1. Desde la Shell autorizada de `empiria-v2-api`, importar `dist/config/db.js`; usar un cliente y BEGIN READ ONLY. Consultar pg_catalog para las 19 relaciones listadas y `auth.users`: existencia, esquema, USAGE y SELECT; para auditoría comprobar también INSERT. Mostrar solo nombres y permisos, sin datos, hashes de contraseña ni cadenas de conexión. ROLLBACK y liberar el cliente. No usar SQL Editor con otro contexto como sustituto.
2. Repetir contexto efectivo (base, rol, search_path, current_schemas). No modificarlo para validar la reparación.
3. Tras autorización explícita, publicar exclusivamente este hotfix sobre el SHA confirmado. Revisar el diff contra `1effd719...`; no hacer merge de `fix/nomina-mutador-controlado-234` ni copiar su dist. No incluir archivos .env, logs de tests ni node_modules.
4. Backend: instalar dependencias desde su lockfile y generar dist desde el checkout aprobado. No hace falta desplegar frontend; su build fue comprobación de compatibilidad.
5. Desplegar el artefacto aprobado en Render. Luego, con una cuenta autorizada, verificar login 200, /auth/me 200, /tenant/me, capacidades autorizadas, rechazo de otra empresa y carga del dashboard global cuando corresponda. Los intentos válidos generan la auditoría habitual; esta validación productiva necesita la autorización de publicación y operación correspondiente.
6. Revisar ausencia de 42P01 y presencia de LOGIN en ambas auditorías; no publicar tokens en logs. Si falla una ruta de negocio no cubierta, identificar su SQL y preparar un cambio separado, sin ampliar silenciosamente este parche.

## Reversión

Restaurar en Render el artefacto o despliegue anterior asociado a `1effd719...`, sin alterar base, roles ni parámetros. No hay migración o datos del hotfix que revertir. Esa versión seguirá expuesta al fallo original mientras el search_path permanezca vacío; la reversión contiene una regresión del parche, no constituye una solución alternativa del incidente.

No se realizaron commits, push, merge, despliegues, modificaciones de configuración productiva ni escrituras en bases externas.
