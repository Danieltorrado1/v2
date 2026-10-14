# Cierre histórico 1203 — certificación local

CIERRE 1203 CERTIFICADO — LISTO PARA BACKUP ACTUAL

Certificación realizada el 14/10/2026 exclusivamente con PostgreSQL 17.11 desechable, datos sintéticos y conexiones loopback protegidas. No se abrió ninguna conexión productiva, ni se ejecutó un backup, una migración productiva, un recálculo o una corrección productiva. La autorización económica continúa en false. La publicación Git se limita a fix/phase48-close-assignment-1203; no hay merge ni deploy.

## Before/after autorizado

| Campo | Before | After |
|---|---|---|
| cobertura_asignacion_id | 1203 | 1203 |
| vinculacion_id / persona_id | 1461 / 1134 | sin cambios |
| empresa / contrato | 15 / 24 | sin cambios |
| focalización | 829 | sin cambios |
| institución / sede / municipio / modalidad | 110 / 592 / 1101 / 1 (CAA), resueltos desde focalización | sin cambios de identidad; Phase 48 materializa sus tres columnas previstas |
| fecha_inicio | 2026-07-29 | 2026-07-29 |
| fecha_fin | 2026-11-30 | **2026-08-31** |
| activo | true | **true** |
| retiro de vinculación | 2026-08-31 | 2026-08-31 |

El UPDATE de cierre contiene únicamente SET fecha_fin. No borra ni recrea la fila y no cambia observación, timestamps, vinculación, focalización, categorías, importes o datos de Nómina. Los tres campos estructurales añadidos por Phase 48 pertenecen al backfill independiente del mismo run.

Before digest productivo ya consultado: `05cf66574baabbf9b46a66184f0a4d35a962d3ba0463d52f6f3f53325a6f5fe1`. Procedencia: evidencia sanitizada SHA-256 `c8477e9b6659bef4ed6b83554c4e8944645b96499a4fcaf324d8926047951c92`. El certificado versionado fija todos los campos del registro mediante SHA-256 de JSON.stringify del objeto obtenido por PostgreSQL to_jsonb, con el mismo algoritmo utilizado por esa evidencia. No es un digest de unos pocos campos ni sustituye al digest SQL nativo del write-set.

El after_digest se deriva del before-image validado reemplazando sólo fecha_fin; se emite en el próximo preflight READ ONLY, preview y auditoría. No se inventa aquí un after_digest productivo: este turno no consultó producción. Los pins sintéticos utilizados para probar el ejecutor no equivalen a los pins productivos.

## Semántica de activo

Se conserva activo=true. `persistTemporalVersion` en cobertura-asignacion.service.ts documenta que las versiones históricas válidas permanecen activas para lectores por intervalo; activo=false representa anulación. Para un cambio posterior al primer día, ese servicio cierra únicamente fecha_fin y conserva activo. Los selectores de Personal y el contexto operativo de Nómina exigen activo y también intersección con fechas: una versión cerrada al 31/08 no es vigente el 01/09, pero sigue disponible para su intervalo histórico.

La ruta antigua de reemplazo puede inactivar una versión al sustituirla; no es el cierre de vigencia confirmado en este caso. El servicio general también puede reparar snapshots o marcar liquidaciones para recálculo, por lo que no se invoca. El catálogo productivo certificado existente no registra triggers de fila sobre cobertura_asignaciones. El nuevo preflight sigue cerrando la clausura de dependencias y sellando cualquier trigger crítico presente; efectos inesperados en tablas protegidas causan rollback.

## Transacción y write-set exacto

Se mantienen SERIALIZABLE, advisory lock 15/2449, locks deterministas de tablas y secuencias críticas, doble lectura READ ONLY independiente y observador fresco tras los locks. El advisory lock coordina sólo participantes que lo respetan; los table locks protegen frente a escritores ordinarios. SERIALIZABLE no congela definiciones ni hace transaccional nextval. Los IDs del ejecutor y las secuencias se manejan con el mecanismo certificado de IDs explícitos y ALTER SEQUENCE transaccional, conservando sus pruebas anteriores.

Antes del primer DML se recalculan candidate_count, IDs, candidate_ids_digest, phase48_candidates_digest, source_digest, write_set_before_digest, critical_schema_digest, critical_definition_digest y critical_sequences_digest. La política de cierre y archivos también queda ligada al manifest_digest y al pin de código. No se fija 730, 733 o 740 como población autorizada constante ni se incorporan altas posteriores silenciosamente.

Se validan el registro 1203 completo, retiro 31/08, estado RETIRADA, persona/vinculación/tenant, focalización y referencias exactas. Además se exige retiro **efectivo** 31/08 usando la semántica del dominio: LEAST de fecha_fin y la primera novedad activa FECHA DE RETIRO. Una novedad activa anterior bloquea. Sólo se tolera la contradicción de fin anterior de 1203 cuando pasa este certificado exacto; no hay excepción general de vigencia.

| Objeto | Cambio permitido en el run |
|---|---|
| cobertura_asignaciones: conjunto dinámico sellado | backfill de institucion_id, sede_id y modalidad_id |
| cobertura_asignaciones: Albeny | inserción histórica ya certificada, con postimage completo comprobado |
| cobertura_asignaciones: Dary, ID 11 | activo y observación según su plan ya certificado |
| cobertura_asignaciones: ID 1203 | sólo fecha_fin, 30/11 → 31/08 |
| auditoria / auditoria_eventos | cuatro publicaciones estrictas en cada tabla: PHASE48, ALBENY, DARY y CLOSE1203 |
| secuencias consumidas | IDs explícitos certificados para nueva cobertura y auditorías; estados comprobados |
| resto de tablas protegidas | ningún cambio de datos |

Después se verifica el registro íntegro de 1203, ausencia de vigencia posterior al retiro, ausencia de solapamientos activos y write-set completo. Una proyección SQL de filas originales deshace exclusivamente las diferencias previstas para comprobar el hash nativo previo; conserva precisión numérica y temporal de PostgreSQL. Cualquier modificación económica, de Nómina o de otro campo causa ROLLBACK total.

Funciones, event triggers y definiciones críticas conservan sus gates anteriores: ventana sin deploy/migraciones, sellado por digest y comprobación inmediata. El riesgo administrativo residual de sustituir una función después del último check permanece documentado; un lock de tabla no lo elimina. El allowlist de nomina_invalidar_revision_operativa y el parser OLD/NEW no se amplían.

## Auditoría prevista

Cada acción se liga por HMAC al sello y run_id. CLOSE1203 registra actor 12, empresa 15, contrato 24, asignación 1203, vinculación 1461, fecha anterior 2026-11-30, fecha nueva 2026-08-31, motivo RETIRO_CONFIRMADO, before_digest y after_digest. La referencia legacy registro_id y entidad_id del evento identifican 1203; el run_id sigue dentro del payload firmado. Los datos nuevos del cierre contienen identificadores técnicos y digests, sin nombres, documentos, contactos ni importes personales.

El resto de auditorías conserva el journal de rollback del contrato previo. Se preservan auditorías existentes y publicaciones/reversiones. Tras reversión se añade una auditoría REVERSAL en cada tabla; no se borran publicaciones ni se rebobinan secuencias.

## Históricos inactivos y altas

1214, 1215, 1216, 1217, 1218, 1219 y 1222: ARCHIVED_INACTIVE_VERSIONS. Cada fila debe existir, permanecer inactiva, conservar vinculación 249/contrato 24, focalización certificada, intervalo 03/09–03/09 y full-row before digest exacto. Sólo estos siete IDs certificados se exceptúan del bloqueo de sus duplicados inactivos. Duplicados activos, solapamientos activos, inactivos desconocidos o drift de un archivo siguen bloqueando. Sus IDs/digests quedan en operational_preview y recibo; nunca se eliminan ni se reactivan. Phase 48 completa sólo identidades.

1280–1286 permanecen en el conjunto dinámico. Si no hay empleado/categoría materializados, el preview/recibo emite requires_salary_review=true y REQUIERE_REVISION_SALARIAL. No crea empleados, categorías, importes ni actividad operativa. Si hay categoría registrada se conserva sin reclasificarla ni afirmar una nueva compatibilidad salarial. 1277/1279 mantienen categoría 35 y revisión; 1278 conserva categoría 34 compatible.

## Rollback e idempotencia

Se probaron fallos antes de Phase 48, después de Phase 48, tras la inserción Albeny, tras Dary, antes y después del cierre 1203, durante auditoría y antes de COMMIT. Se reprodujo un fallo real de constraint de auditoría después de tres publicaciones. Todos restauran esquema, datos, auditorías y secuencias del baseline completo.

Una segunda ejecución del mismo run devuelve ALREADY_APPLIED y no agrega auditorías. La reversión post-COMMIT exige publicación firmada, sello/run_id y postimages exactos; sólo entonces restaura 1203 a 30/11, revierte los cambios propios y conserva actividad en objetos ajenos. Una divergencia de 1203 detiene la reversión. Los cambios de objetos críticos posteriores al COMMIT pueden detenerla; no se intenta reconciliarlos ni sobrescribir actividad no atribuible. Los locks/secuencias y controles protegidos del contrato previo permanecen vigentes.

## Pruebas y límites

- 149/149 pruebas en PostgreSQL 17.11: cierre exacto, todos los fallos, idempotencia, reversión, drift de fila/retirada/identidades, cambios antes/después del lock, archivos admitidos, duplicados bloqueados, altas preservadas, poblaciones sintéticas 730/733/734/735/740, event triggers, SQL constante allowlisted, OLD/NEW y funciones críticas.
- 115/115 pruebas de runner, TLS 1.3, target READ ONLY, autorización, esquema, publicación atómica y regresiones del mutador.
- Typecheck, build backend, build FrontendNuevo y git diff --check: PASS. Frontend emite su aviso de tamaño de bundle; build exit code 0.
- Guards: production_connections=0, production_writes=0, forbidden_attempts=0. No lectura de .env ni CA productiva durante la certificación. Cluster desechable detenido y eliminado; ningún cluster preexistente modificado.

La primera corrida detectó una expectativa de conteo de auditorías anterior y el registro durable de nonces aún ligado a V5; ambos quedaron corregidos y la corrida final pasó. El contrato ahora es PHASE48_SCOPED_CLOSE1203_V6. Los commits anteriores ee2e28f982ab651f5e8e2b40108f87b10594f9b7 y 4a616e774fea82d57f2fc51e8902ab48a707bd4e, sus ancestros y el sello V5 están revocados.

La certificación prueba fixtures sintéticos y componentes críticos reproducibles. No afirma haber restaurado un backup productivo actual ni haber revalidado hoy sus filas; ése es el próximo paso autorizado por separado. Los pins productivos se conservan del certificado READ ONLY existente y no pueden sustituirse por pins de fixture fuera del cluster local con identidad verificada.

Pruebas y hashes durables: reports/phase48-close1203-proofs/manifest.json. El mutator_commit final se fija en phase48-scoped-release.ts; readonly_runner_commit corresponde al HEAD limpio del commit que publica ese pin, validado por scopedRelease. Ambos se comunicarán con sus hashes exactos tras el push a la rama exclusiva.
