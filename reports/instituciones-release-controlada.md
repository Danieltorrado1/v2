# Integración controlada de modalidad por vigencia

**INTEGRACIÓN DETENIDA — PRERREQUISITO NO CERTIFICADO**

La release está preparada y el SQL pasó en una restauración aislada del backup verificado. Falta certificar el estado productivo actual: no hay credencial temporal autorizada disponible y el health no informa SYNC. No se declara autorización ni disponibilidad para aplicar SQL/desplegar.

## 1. origin/main actual

`git fetch --prune origin` completado. `origin/main`: **09a71ddc2d2a769f6a7eacb9dc969cff339586f5**, reconfirmado al terminar. No cambió durante esta preparación.

Worktree usado: `C:\Users\CORE ULTRA\Desktop\V2-instituciones-modalidad`. Inventarios adjuntos: `instituciones-release-worktrees.txt` y `instituciones-release-branches.txt`; son inventarios de referencias, no certificaciones de los working trees ajenos. Se añadió sólo un checkout propio, detached en ese SHA, dentro de `tmp/release-origin-main-baseline` para comparar pruebas. Sus dependencias apuntan a las instaladas en este worktree. No se usó `main-asignaciones`, no se modificó el workspace original de Nómina ni se inspeccionaron/aplicaron stashes.

## 2. Hotfix certificado

**40983586f77e3ceda994eadc6855297d38373484**, rama `fix/instituciones-cambio-modalidad-vigente`, limpio al inicio. Coincide con `origin/fix/instituciones-cambio-modalidad-vigente`. Su padre es el SHA de main indicado arriba: contiene un único commit adicional publicado, sin dependencia de commits locales inéditos. La rama hotfix permanece en ese SHA. Sin squash ni rebase.

## 3. SQL exacto y clasificación

Único SQL incorporado por el hotfix: `sql/phase-48-operational-assignment-identities.sql`.

SHA256: **646e74d7b9e7c94515049b1787ceaa98a90165258eb13c88dfca3bad4b34a996**. Se ejecutó ese archivo sin modificaciones, únicamente en PostgreSQL local.

| Aspecto | Inventario exacto |
| --- | --- |
| Tablas | Modifica sólo `cobertura_asignaciones`; no crea tablas |
| Columnas | Agrega `institucion_id`, `sede_id`, `modalidad_id`: bigint, nullable, sin default; quita NOT NULL de `focalizacion_final_id` |
| Índice | Btree no único `idx_cobertura_asignaciones_timeline(contrato_id,vinculacion_id,fecha_inicio,fecha_fin)` |
| Constraints | Tres FK hacia `instituciones(id)`, `sedes(id)`, `modalidades(id)`, acciones por defecto NO ACTION; conserva PK y FK anteriores |
| Funciones | Ninguna creada/modificada |
| Triggers | Ninguno creado/modificado; funciones/triggers de aplicación permanecen iguales en el restore |
| Permisos | Ningún GRANT/REVOKE, RLS ni cambio de roles/propietarios |
| Comentarios | Sólo comentarios `--` del archivo; no ejecuta COMMENT ON |
| Backfill/DML | UPDATE de los tres IDs desde `focalizacion_final` por su ID, mismo contrato y los tres IDs previamente nulos; no cambia vigencias, nombres, activo ni porcentajes |
| Idempotencia | IF NOT EXISTS para columnas/índice; DROP NOT NULL repetible; backfill deja de encontrar filas después de la primera ejecución |
| Down | No existe down; no se ejecutó rollback ni se inventó eliminación de columnas |
| Dependencias | Esquema base de cobertura y catálogos: las cinco tablas anteriores, `focalizacion_final`, IDs/contrato y campos temporales. No requiere aplicar otra fase 48/52–57 junto con este hotfix; las fases de Nómina/outbox ya presentes se conservan |
| Necesidad | La versión operativa independiente usa los nuevos IDs y `focalizacion_final_id=NULL`. El preview impide guardar si faltan los IDs. El índice es de acceso temporal; no impone exclusión de intervalos |

**Clasificación del backup restaurado: REQUERIDO. Clasificación productiva actual: NO_DETERMINABLE.** El backup es del 1 de octubre, no evidencia del esquema del 5 de octubre.

Criterios para la comparación futura: YA_APLICADO sólo si tipos/nullability, tres FK validadas, definición del índice y backfill son equivalentes; REQUERIDO si faltan íntegramente los elementos nuevos y el esquema base es compatible; PARCIALMENTE_APLICADO si existe una parte, faltan FK o hay backfill parcial; INCOMPATIBLE si tipos, referencias o índice no corresponden. Los dos últimos estados deben detener la integración, sin completar el SQL a ciegas. IF NOT EXISTS por sí solo no certifica compatibilidad de un objeto existente.

## 4. Restauración local

Backup completo más reciente encontrado en `Documents/EmpiriaBackups` con certificación de restore: `focalizacion-septiembre-pre-import-retry-20261001T125631Z/full.dump` (8.191.184 bytes).

SHA256 revalidado antes y después: **2e2f0608f609e2e3123e6bfdf56067bae08f11719cc3939ca73d0cdc387f0bc1**. No se modificaron dump, manifiesto, lista ni archivos de backup.

Cluster **nuevo** PostgreSQL **17.11**, sólo `127.0.0.1:55463`, base `modalidad_release`, directorio `tmp/modalidad-release-cert/cluster`. No se reutilizó ningún cluster previo. Sin preload ni workers de PostgreSQL; autovacuum deshabilitado sólo en este cluster desechable. No se cambiaron flags de aplicación.

Restore `pg_restore --single-transaction --exit-on-error --no-owner --no-privileges`: **exit 0**. Se usó la lista local certificada del backup: nueve exclusiones administradas de Supabase/Vault ya documentadas en su manifiesto (Vault no disponible y seis event triggers del proveedor). El dump sigue completo. Se restauraron todos los objetos/tablas/funciones/triggers de la aplicación; no se emularon ACL productivas.

Baseline de esquema, conteos/digests por tabla, funciones/triggers e intervalos preservado antes del SQL. Primera ejecución: **exit 0**, tres columnas, tres FK, un índice y **727 filas** completadas. Las **224 tablas públicas** conservaron contenido previo: para cobertura se compararon todas las columnas antiguas excluyendo únicamente los tres IDs nuevos; el resto se comparó íntegro. Esto incluye economía, liquidaciones, empleados, snapshots y focalización histórica. No cambió ninguna función/trigger público de aplicación.

Postflight READ ONLY local: 727 asignaciones (718 activas); 5 periodos abiertos, 2 anulados y 1 cerrado; locks esperando 0; solapamientos 0; huecos internos entre versiones activas 0; intervalos negativos 0; contextos huérfanos 0; operaciones duplicadas 0; operaciones sin asignación coincidente 0. Actor 12 activo **en el backup**, no certificado para producción actual. Los controles de huecos internos no afirman cobertura completa fuera del horizonte de las asignaciones existentes.

Cluster detenido mediante pg_ctl dirigido exclusivamente al nuevo directorio; comprobación final: `no server running`. Se conservan el cluster detenido y los logs dentro de rutas locales ignoradas, sin versionar datos restaurados.

Evidencia: `instituciones-modalidad-sql-local.json`. Tooling: `release/restore-instituciones-modalidad-local.ps1` y `src/scripts/certify-instituciones-modalidad-sql-local.cjs`. El wrapper rehúsa inicializar/reutilizar un cluster existente; reproducir requiere un checkout limpio y puerto libre. Su inicio/restauración/certificación se ejecutaron en los pasos equivalentes antes de consolidar el wrapper; el wrapper no se reejecutó sobre el cluster ya creado.

## 5. Idempotencia y rollback

Segunda ejecución del mismo archivo: **exit 0, UPDATE 0**, avisos esperados de columnas/índice existentes. Esquema y datos completos, incluidos los IDs nuevos, idénticos a la primera ejecución.

No existe down seguro en el hotfix. No se ejecutó down/reaplicación. Las ejecuciones locales se envolvieron en una única transacción con ON_ERROR_STOP, por lo que un error de aplicación no queda parcialmente confirmado. No se certificó una prueba de fallo inducido de esta migración.

Después de escrituras funcionales nuevas, quitar los IDs o restaurar NOT NULL puede perder información o fallar. Un rollback futuro debe distinguir antes/después de cambios funcionales y preservar esos datos; necesita autorización y plan específico. No hay reversión automática propuesta.

## 6. Release

Rama **release/instituciones-cambio-modalidad-vigente**, creada desde el origin/main actualizado. Merge explícito `--no-ff` de la rama hotfix: **7a302e3d4272cecfdefc3bfd22c4e9135f026509**, padres main/hotfix indicados arriba. El SHA final de la release incorpora el commit posterior de evidencias/tooling y se entrega en la respuesta final; usar `git rev-parse release/instituciones-cambio-modalidad-vigente` para consultarlo.

## 7. Conflictos y resolución

**Cero conflictos de merge.** El árbol resultante del merge conserva íntegro el hotfix porque su padre coincide con el main actualizado. No se descartaron hotfixes de Nómina/focalización.

La suite completa encontró dos verificaciones textuales desactualizadas: la de base mensual incluía también el nuevo resolver independiente; la de gestor prohibía el parámetro `$4::date` requerido por consulta histórica. Se ajustaron únicamente esas pruebas para mantener sus invariantes originales, sin modificar lógica funcional ni el SQL certificado. Sus 21 casos pasaron. Tooling adicional y evidencias se incorporan exclusivamente a release.

## 8. Pruebas completas

Typecheck backend, build backend y build frontend: **PASS**; `git diff --check`: **PASS**. Advertencia habitual de tamaño de chunk Vite, sin fallo de build.

Comparación de **164 archivos comunes**, comando y argumentos idénticos, mismas variables y dependencias, Node/tsx iguales. Cambia sólo el cwd para seleccionar cada árbol. Conexiones ficticias a `127.0.0.1:1`, jobs y flags de integración deshabilitados en el proceso de pruebas; no se hereda una URL productiva. Los logs TAP completos permanecen locales y sus SHA256 se registran en `instituciones-release-suite-comparison.json`.

| Árbol | Casos | PASS | FAIL | SKIP |
| --- | ---: | ---: | ---: | ---: |
| origin/main | 1079 | 1038 | 40 | 1 |
| Release | 1080 | 1044 | 35 | 1 |

**Nuevos fallos: 0.** Los 35 fallos de release tienen el mismo nombre en main; se resolvieron cinco fallos previos. La suite completa NO se declara totalmente PASS. Incluye comprobaciones textuales antiguas, fallos por conexión ficticia en tests que no aíslan correctamente dbQuery y otros defectos previos enumerados en el JSON. Ambas omiten la misma prueba PostgreSQL de documentos por requerir entorno específico.

Nueva prueba no presente en main: **17/17 PASS**, cubre transacción de modalidad, catálogo sin asignación, categoría única/ambigua/ausente, Personal por fecha, Planilla diaria, Nómina por tramo, historial, idempotencia, fechas, periodos y RBAC. La lista común incluye ingresos/retiros, novedades, turnos, periodización, tenant y permisos. Comparación de fallos incluye tests anidados, no sólo archivos o padres.

Navegador sobre build real de release: cuatro escenarios, todas las APIs interceptadas, credenciales sintéticas; **PASS**, sin mutaciones, errores de render, rutas inesperadas o bucles. No se envió ningún POST funcional productivo.

## 9. Preflight productivo READ ONLY

Health público GET `https://api.empiriasuite.com/api/health` el 2026-10-05T23:42:56Z: **HTTP 200**, `database.status=ok`, OUTBOX=false, RECALC requested/active=false, worker started/running=false. Evidencia sanitizada: `instituciones-release-health-readonly.json`.

**SYNC: NO_DETERMINABLE**, no expuesto por health. No se reutiliza una confirmación manual histórica como estado actual.

Sin credencial temporal autorizada en este worktree/entorno. Se solicitó la ruta segura y no se recibió. No se abrió conexión SQL productiva. Quedan **NO_DETERMINABLE**: esquema productivo actual y necesidad efectiva del SQL, locks esperando, periodos actuales, solapamientos/huecos, actor técnico/tenant/permisos actuales y ausencia de operaciones parciales. Un health `ok` no certifica estos controles.

`release/preflight-instituciones-modalidad-readonly.sql` queda preparado y fue ejecutado contra la restauración local con salida 0. Usa REPEATABLE READ READ ONLY, timeouts, parámetros tipados y conteos sin identidad personal; no adquiere advisory locks ni cambia filas. La ejecución futura requiere conexión temporal autorizada con `default_transaction_read_only=on`, actor explícito y alcance/RBAC comprobado separadamente.

## 10. Backup disponible

El backup indicado está íntegro, disponible y verificado por restore anterior más esta nueva restauración. Su fecha es **1 de octubre**. No sustituye un backup fresco/consistente para una futura intervención productiva si hubo cambios posteriores; no se creó un nuevo backup productivo en esta tarea.

## 11. Cero escrituras productivas

**0 escrituras productivas, 0 conexiones SQL productivas.** Sólo GET público de health. No SQL/migraciones productivas, POST de cambio operativo, modificaciones de modalidades reales, importación de focalización, recálculo, cambios de flags, merge/push a main ni despliegue. Backups/clusters previos conservados. El único SQL mutador ejecutado fue el prerrequisito sobre la nueva restauración local.

Commit/push de evidencias, tooling y ajustes de validación únicamente a la rama release. Main y hotfix no se modifican.

## 12. Pasos posteriores exactos, aún NO autorizados

1. Proporcionar credencial temporal READ ONLY autorizada y evidencia vigente de SYNC=false del servicio. Volver a capturar health/flags/worker, actor con membresía/permisos del contrato objetivo y backup disponible.
2. Ejecutar el preflight READ ONLY preparado, verificar esquema/constraints/index/backfill y clasificar. PARCIALMENTE_APLICADO o INCOMPATIBLE detienen el proceso; NO_DETERMINABLE impide certificar. Comprobar cero locks, solapamientos, huecos y operaciones parciales. Validar los extremos de vigencia del caso objetivo además de los huecos internos.
3. Actualizar `origin/main` y confirmar que sigue en el SHA certificado. Si avanzó, integrar sus cambios sólo en release y repetir comparación/builds/certificación pertinente; no trasladar esta certificación sin revisión.
4. Si REQUERIDO, preparar una ejecución transaccional del archivo exacto con SHA certificado, `search_path=public,pg_catalog`, ON_ERROR_STOP, timeouts y postflight; no incluir otras fases por el número del archivo. Si YA_APLICADO, documentar equivalencia y omitir SQL. Revisar el riesgo del backfill bajo triggers y concurrencia actuales.
5. Antes de cualquier intervención, disponer de backup completo fresco y restore certificado, plan de contingencia que no elimine historial y autorización explícita que delimite SQL, merge y despliegue. Este informe no constituye esa autorización.
6. Sólo tras esa autorización, ejecutar la secuencia productiva aprobada, confirmar postflight y registrar hashes/conteos. Luego integrar/desplegar únicamente el SHA release autorizado, con health y flags verificados. La secuencia exacta de cambio de código/SQL debe quedar aprobada antes de ejecutar.
7. Una prueba funcional productiva, cambio real RI→CAA o recálculo económico necesita autorización adicional explícita; no está incluida en la integración del código/esquema.

## 13. Decisión

**INTEGRACIÓN DETENIDA — PRERREQUISITO NO CERTIFICADO**

SQL **certificado localmente**, release preparada y **sin regresiones nuevas**. Falta evidencia actual del esquema y controles productivos, incluida SYNC. No aplicar SQL ni integrar/desplegar hasta completar esos gates y obtener la autorización correspondiente.
