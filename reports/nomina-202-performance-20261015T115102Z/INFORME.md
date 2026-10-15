# Corrector 202/192 — recertificación local de rendimiento

**CORRECTOR POSTGRESQL CERTIFICADO CON SECUENCIAS MONOTÓNICAS.**

Código ejecutado: 95fc6bb6879409d37a088e451fb64f2edafacb5f, rama fix/nomina-turno-202-correction-performance, basada en 1233f6931e93e53f66caa27ec4bd642a45783bd9. PostgreSQL 17.11, 127.0.0.1:52268. La rama integral anterior se conserva. No se ejecutó un corrector productivo.

## Secuencias

`nextval()` no se revierte con ROLLBACK. Los huecos no son filas persistidas, auditorías creadas ni corrupción. [Documentación PostgreSQL 17](https://www.postgresql.org/docs/17/functions-sequence.html).

El rollback exige datos idénticos en las 262 tablas y cero filas nuevas persistidas. En el fallo inducido se observaron auditoria_eventos +4, auditoria +1 y nomina_revision_operativa +1; ninguna otra secuencia cambió. Los tres avances son monotónicos y autorizados para ese ensayo. La segunda pasada ALREADY_APPLIED no consume valores en ninguna de las 213 secuencias. No se ejecutó setval(), ALTER SEQUENCE RESTART, rebobinado ni compensación ni se reutilizaron IDs.

Para respetar la prohibición literal de la función de reinicio durante la propia restauración, se omitieron las 213 instrucciones SEQUENCE SET del dump y se alcanzaron los estados exactos consumiendo únicamente nextval en las secuencias nuevas: 614.134 valores por restauración. No se omitieron datos de aplicación, auth o storage. Se mantuvieron únicamente las diez exclusiones gestionadas de vault ya certificadas, además de esa sustitución de inicialización de secuencias.

## Perfil y optimización

| Trabajo en las 744 consultas anteriores | Cantidad |
|---|---:|
| Preflight transaccional y gates/locks | 12 |
| Captura completa de baseline público | 225 |
| DML explícito (incluye coste de trigger) | 3 |
| Dos repositorios de auditoría | 8 |
| Historial canónico por fila | 42 |
| Dos capturas completas de postflight | 450 |
| Rol y timestamp | 2 |
| COMMIT | 1 |
| Instrumentación | 1 |
| Comparación global de 262 tablas dentro de esas 744 | 0 |

El registro anterior no separaba consultas internas del trigger ni medía exactamente BEGIN/COMMIT; no se reconstruyen números retrospectivos inexistentes. Los 17.393 ms corresponden al corrector anterior completo, no a una medición aislada de su transacción.

Ahora son 20 consultas de cliente por aplicación: 19 propias y una de instrumentación. Preflight y baseline inicializados fuera de la transacción: cuatro consultas trazadas y una verificación de identidad de conexión. Un único PoolClient se conserva desde preflight hasta COMMIT.

| Fase de aplicación | Consultas | Tiempo SQL cliente (ms) |
|---|---:|---:|
| transaction_control | 4 | 1.558 |
| gates | 7 | 27.773 |
| dml | 3 | 7.212 |
| scoped_postflight | 1 | 2.208 |
| audit_events | 1 | 3.004 |
| audit_legacy | 1 | 1.323 |
| history | 1 | 1.867 |
| test_instrumentation | 1 | 1.124 |
| commit | 1 | 1.173 |

El servidor registró 4 sentencias SQL internas del trigger de nómina y 59 comprobaciones indexadas de claves foráneas (0.137 ms). Son integridad obligatoria por fila, no rondas N+1 del cliente. Sus costes están incluidos en las sentencias DML/INSERT superiores: no deben sumarse otra vez. Los trazos y planes ANALYZE/BUFFERS están sanitizados.

Se eliminaron las capturas completas dentro de la transacción, la materialización de auditorías/historial en Node, las búsquedas cuadráticas sobre ese corpus y las 50 inserciones individuales. Las tres inserciones set-based conservan exactamente cuatro filas por repositorio y 42 historiales canónicos. Se reutilizan los verificadores y el generador canónico originales, con prueba diferencial de payloads.

Permanecen dentro del advisory lock: SERIALIZABLE, cuatro row locks, hashes y allowlist de triggers/reglas, actor y tenant, periodo, tarifa, fechas, relaciones, duplicados, IBC/empleado protegido, before-state y evidencia documental. El baseline acotado e inmutable enlaza el digest global de certificación en el manifiesto. El rol local carece de permisos de escritura fuera de las siete tablas; instituciones no tiene permisos de escritura ni cambios de datos.

El gate de identidad de operación inspecciona auditorías mediante SQL, con resultados acotados (5/5/43) y sin cargar el corpus completo en Node. El esquema restaurado no tiene índices de acción/motivo adecuados; conservar ese chequeo global dentro del lock evita aceptar una operación parcial o extra. Sus planes y costes están medidos; no se agregaron índices locales que oculten el coste. La agregación SQL ordenada de digests completos utiliza memoria del servidor únicamente en la certificación externa.

## Medición separada

| Ventana | Tiempo (ms) |
|---|---:|
| Preflight y baseline completos del ejecutor, fuera de la transacción | 56.318 |
| Gate local de preflight de cada llamada | 0.057 |
| Transacción: inicio cliente de BEGIN hasta respuesta de COMMIT | 58.847 |
| COMMIT (incluido en transacción) | 1.175 |
| Gates dentro de la transacción | 28.026 |
| DML incluido el trigger real | 7.262 |
| Captura acotada posterior y payloads | 4.818 |
| Tres batches de auditoría/historial | 6.312 |
| Verificación canónica acotada | 7.614 |
| Instrumentación dentro de la transacción | 1.143 |
| Coste exclusivo del corrector, sin instrumentación | 57.769 |
| Comparación global inicial de 262 tablas | 2699.251 |
| Postflight global de 262 tablas | 2658.428 |
| Todos los batches SQL de las 7 comparaciones completas | 18379.861 |
| Certificación completa, incluidas dos restauraciones y todos los ensayos | 52387.861 |
| Certificación externa excluyendo primera llamada mutadora | 52328.948 |

Locks: 203 en el snapshot propio antes de COMMIT, todos concedidos; advisory (202,192) y cuatro row locks retenidos como máximo 58.477 ms en la ventana observada por el cliente. Ese intervalo incluye latencia de ida/vuelta y es una cota observada, no un cronómetro interno exacto del motor.

La duración se justifica por tres cambios económicos explícitos, invalidación de revisión mediante el trigger original, 50 registros canónicos de auditoría/historial y todos los gates, con una retención de locks de unos 59 ms. No se impone un umbral arbitrario. No hay N+1 del cliente, búsquedas cuadráticas sobre el corpus, ni materialización del historial en el ejecutor.

RSS: ejecutor Node aislado 67.96 MiB (máximo del proceso; durante APPLY 66.86 MiB); runner externo 71.82 MiB; suma máxima observada de working sets PostgreSQL 476.48 MiB. La suma PostgreSQL puede contar páginas compartidas varias veces y contempla los chequeos globales externos. No se suman esos valores para compararlos con el antiguo RSS.

El antiguo 1.013,4 MiB era un solo proceso Node combinando ejecutor y runner, medido con process.memoryUsage().rss. PostgreSQL no formaba parte. Ese proceso mantenía snapshots públicos completos y JSON/canonicalizaciones temporales; no se registró una atribución exacta por asignación. El nuevo aislamiento y los digests SQL separan explícitamente los costes.

## Resultado funcional

- Dump SHA-256: dd1f9d298e83fb9664d1795c4e452698c26b274569cca11715b2c2f03ff99d75. PDF histórico SHA-256: cf061de69f85976bd884439e12a58281bde4d32d2542b36e653a96a3a9c7d8a4. Ambos intactos al sellar la evidencia.
- 262 tablas completas con conteos/digests iniciales exactos; 213 secuencias exactas; before-state SHA-256 44ca846355fc60ac3e30f51a74c3c0be8432db3678f0f047d75dc3d508e4ad95. Inventario de funciones/triggers/constraints/índices idéntico al PG17.11 restaurado certificado.
- Movimiento 192: cantidad 2, calculado/total $195.600, afecta_seguridad_social=false. Detalle 220: identidad conservada, $195.600. Cuenta 77: PENDIENTE, $195.600, referencia anterior invalidada. Revisión 20114: REQUIERE_REVISION/v31.
- Exactamente siete tablas modificadas y 255 intactas. Cero duplicados. SQL adicional protege todas las otras filas de las cuatro tablas de dominio y verifica los SHA del corpus original completo: auditoria 14.878; auditoria_eventos 60.068; historial_cambios 208.425.
- Cuatro auditorías en cada repositorio y 42 historiales canónicos; las secuencias de éxito avanzan +4, +4, +42 y +1 de revisión, respectivamente.
- ALREADY_APPLIED con el mismo run_id: cero nuevas filas/auditorías, igualdad de las 262 tablas y cero avance de las 213 secuencias.
- Fallo inducido SQLSTATE 23514: igualdad de las 262 tablas, cero filas nuevas persistidas y únicamente los tres avances monotónicos autorizados. Sin compensar ni reutilizar IDs.
- PDF nuevo por $195.600 con clave nueva y hash 8f9055a89b1cebf1a2964821648bc9b7692fb4e98222b8265663f4c1af4143c9. Histórico preservado; cuenta PENDIENTE. Fallo posterior al commit y recuperación documental de la misma clave sin repetir economía. Publicación exclusivamente local simulada; sin referencia productiva DB/Storage.
- Pruebas de gates nativos: default, confirmación, nonce, expiración, custodia, hash de trigger y baseline de IBC. Cero cambios de datos/secuencias en esos rechazos. 56 pruebas de regresión/unidad aprobadas; typecheck, build backend, build FrontendNuevo y git diff --check aprobados.
- Cluster final y dos intentos anteriores apagados y eliminados; cero procesos propios de PostgreSQL, ejecutor, sampler o runner, cero listeners propios. Clusters ajenos intactos. Los logs privados se eliminaron preservando sus hashes. PDF de una página renderizado y revisado visualmente.
- Cero conexiones y escrituras productivas. Sin corrector productivo, instituciones modificadas, recálculo de nómina, regeneración productiva, merge ni deploy.

Los detalles están en report.json, performance-profile.json, legacy-744-profile.json, server-statements-first.json, explain-analyze-sanitized.json, 262-table-comparison.json y cleanup.json. SHA256SUMS.txt protege los artefactos de esta carpeta.
