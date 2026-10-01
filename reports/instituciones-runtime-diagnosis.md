# Instituciones: diagnóstico y regresión de ruta productiva

Base: ae7ac1d4288c7de886030d4621c3dee322d07050.
Rama: fix/instituciones-runtime-cupos-acciones.

## Causa probada

AppRouter registra dos rutas con path operacion/instituciones. La generada
desde tenantEntries (OPERACION_INSTITUCIONES) aparece antes de la explícita.
La primera monta WorkspacePage, cuyo view=institutions monta ContractOverview
e InstitutionsView. Esa vista usa item.cupos.toLocaleString y Acciones=—.
Un objeto de cupos devuelve [object Object]; la vista no contiene la acción.

La página nueva OperacionInstitucionesFinalPage, su normalización, formulario
canónico y guard sí están incluidos en los tres commits examinados:
192756dbbe3bc105c8a98e98db428abbc54107b2,
ae1735337f4a7e53c74a9468e3b62a61321848af y
ae7ac1d4288c7de886030d4621c3dee322d07050.
Los blobs de página y helper son idénticos respectivamente:
2c7f6eae27786c8db1966e434a5a8496147e890e y
896e2ef9a93f96f79b5966d2731b57a9aaae14a4.

## Bundle público y configuración

GET https://app.empiriasuite.com/operacion/instituciones devuelve HTML que
referencia /assets/index-D74PkFGA.js. Ese asset devuelve HTTP 200 y contiene
Cambiar modalidad, REQUIERE_REVISION_SALARIAL y Preescolar/primaria:.
Cache-Control observado: public, max-age=0, s-maxage=300.
La evidencia demuestra que el código nuevo está en el bundle público; no
demuestra que la ruta lo monte. La reproducción demuestra el componente elegido.
No se encontró registro de service worker en FrontendNuevo/src o public.

FrontendNuevo usa npm run build = tsc -b && vite build, entrada src/main.tsx
→ App → AppRouter y salida dist. El Dockerfile del repositorio es del backend.
No hay blueprint Render versionado ni acceso a su panel desde esta sesión;
los valores exactos Root Directory/Build Command/Publish Directory de Render
no se afirman como inspeccionados. Los marcadores del asset público y el
comportamiento reproducido coinciden con FrontendNuevo.

## Corrección mínima

Excluir OPERACION_INSTITUCIONES de las rutas genéricas del catálogo.
La ruta explícita existente conserva ModuleRoute, permisos, contexto de empresa,
presentación de cupos y formulario canónico. No cambia permisos ni datos.

## Regresión en navegador sobre dist

FrontendNuevo/tests/instituciones-runtime.test.mjs sirve dist con HTTP local,
monta la aplicación completa por /operacion/instituciones y usa Chromium.
Intercepta todas las llamadas API con fixtures sanitizados; bloquea métodos
distintos de GET y registra intentos. Usa sesión sintética y módulo OPERACION.

Antes de corregir: npm run build sobre ae7ac1d y
node tests/instituciones-runtime.test.mjs --expect-legacy reprodujeron cupos
[object Object] y ausencia de Cambiar modalidad, sin errores de renderizado.
Ese modo usa las dos filas no nulas para aislar el defecto de ruta.

Después: npm run test:instituciones-runtime construye y verifica la ruta real:
cupos total 200, primaria 120, secundaria 80, cero y Sin dato; ADMINISTRADOR
puede abrir el formulario, cargar contexto y seleccionar CAA; cancelar conserva
URL/filtros/paginación. GESTOR queda bloqueado incluso con permiso create en
la sesión sintética. Cero POST/PATCH u otras mutaciones intentadas, cero errores
de renderizado, cero solicitudes API inesperadas y número de solicitudes acotado.
Para otro equipo puede indicarse PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.

## Verificación

Backend npm run typecheck y npm run build: PASS.
Frontend npm run build y prueba runtime: PASS.
Instituciones/presentación/modalidad: 10/10 PASS.
Guards backend de cambios y pensión: verificados mediante pruebas enfocadas.
git diff --check: PASS. Advertencia existente de tamaño del chunk frontend.

Health público durante el diagnóstico: HTTP 200, success=true, status=ok,
database.status=ok; outbox configured/enabled/started/running=false y recalc
requested/active=false. Sólo se hicieron GET públicos y pruebas con fixtures.
Cero escrituras productivas. Workspace original de Nómina conservado.
No se realizó integración a main ni despliegue de esta corrección.
