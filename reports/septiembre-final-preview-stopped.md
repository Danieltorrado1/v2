# Septiembre: PREVIEW FINAL DETENIDO

Empresa 15, contrato 24, vigencia 2026-09-01 a 2026-09-30. El preflight productivo fue READ ONLY y terminó con ROLLBACK. Escrituras productivas: 0. No importación, endpoint POST, carga nueva, catálogos, migraciones, seeds, activación de flags, recálculo, merge ni deploy.

La aprobación recibida cubre exclusivamente las 25 filas de Puerto Rico y las cinco exclusiones. Se aplicó en memoria. El Excel conserva SHA-256 `745e04bbf1cc51ed194e5514704c3441b2b9088e34fe513f2e8f2ecf9db566a3`.

## Causa de la detención

Al eliminar la coincidencia por consecutivo y el fallback por fragmento DANE, las filas 559–562 no encuentran municipio por nombre. Fuente: CUBARRAL. Catálogo: SAN LUIS DE CUBARRAL, municipio 861. Las instituciones y sedes coinciden por nombre, pero falta una correspondencia explícita de ambos textos en este resolver. No se aplicó un alias adicional para alcanzar los valores esperados.

| Fila | Municipio fuente | Municipio catálogo | Institución ID | Sede ID |
| --- | --- | --- | --- | --- |
| 559 | CUBARRAL | SAN LUIS DE CUBARRAL / 861 | 97 | 482 |
| 560 | CUBARRAL | SAN LUIS DE CUBARRAL / 861 | 97 | 482 |
| 561 | CUBARRAL | SAN LUIS DE CUBARRAL / 861 | 97 | 483 |
| 562 | CUBARRAL | SAN LUIS DE CUBARRAL / 861 | 98 | 484 |

Evidencia productiva sanitizada: `septiembre-stopped-identity-evidence.json`. Consulta aislada, tenant validado a través del contrato, READ ONLY y ROLLBACK.

688 filas operativas candidatas; 684 completamente resueltas; cuatro identidades bloqueadas. Entre las 684 resueltas hay cero duplicados. Dos colisiones de claves nulas en las cuatro pendientes NO representan duplicados operativos reales. La comparación diagnóstica de las 688 candidatas incluye identidades pendientes; sus deltas no son certificables ni acciones productivas.

| Medida | Esperada | Diagnóstico detenido |
| --- | ---: | ---: |
| Altas | 25 | 29 |
| Bajas | 24 | 28 |
| Modalidades | 24 | 24 |
| Cupos | 393 | 390 |
| Matriculados | 367 | 364 |
| Unión de métricas | 398 | 395 |
| Instituciones afectadas | 108 | 109 |
| Sedes afectadas | 358 | 360 |
| Puestos estimados | 695 | 695 |
| Variación provisional | +33 | +33 |

Las cuatro identidades nulas producen cuatro altas y cuatro bajas aparentes adicionales; tres de las cuatro filas estaban entre los cambios métricos de agosto. El ID nulo también afecta las cardinalidades de instituciones y sedes. Por eso se detuvo el conjunto completo y no se certificó ningún delta.

## Aprobaciones aplicadas

Filas 491–499: institución 83; filas 514–529: institución 86. Texto exacto del Excel PUERTO RICO; catálogo municipal 734 / META; institución y sede de contrato 24; empresa 15 validada en contratos; historial de agosto carga 4 concordante. Se rechaza Puerto Rico / Caquetá, ID 733. No se usa consecutivo ni fragmento DANE como identidad.

Exclusiones explícitas: 691 TOTAL_DEPARTAMENTAL; 692 RESIDUO_FORMULA; 693 FORMULA_REF; 697 LEYENDA; 699 SEPARADOR. Excel sin modificaciones, catálogos sin modificaciones. DANE y jornada ausentes siguen documentados como opcionales/no aplicables al modelo mensual actual; no se inventan códigos.

## Snapshot y digest

`reports/septiembre-preview-stopped-snapshot.json`, schema `focalizacion.septiembre.stopped.v1`, contiene timestamp UTC, tooling, SHA fuente, scope, exclusiones aprobadas, combinaciones técnicas, diferencias, cuatro pendientes y evidencia de preflight. `certified=false`, `writes=0`.

Digest canónico del candidato NO CERTIFICADO:
`95b49e8dd511b81e5e8664f7cc1c9c3893be7061b87a6ffa63fc8b26507a745b`.

SHA-256 sobre JSON con claves recursivamente ordenadas y filas por sede/modalidad numéricas. No existe digest final certificado. El candidato conserva las cuatro filas pendientes para no ocultar ni excluir registros operativos. Sólo IDs, municipios, métricas y reglas; sin personas, documentos o credenciales. El snapshot original y la auditoría anterior se conservan como antecedentes.

## Preflight productivo

PostgreSQL 17.6; transaction_read_only=on desde la conexión y en la transacción REPEATABLE READ. Advisory lock transaccional obtenido; locks esperando=0. Septiembre inexistente. Agosto carga 4: 687 vigencias y digest idéntico al preview anterior. Periodos de Nómina, incluidos anulados, idénticos al snapshot anterior. Health HTTP 200, database.status=ok, OUTBOX=false, RECALC solicitado/activo=false, worker started/running=false. SYNC=false actual pendiente de confirmación manual; no se infiere del health ni de variables locales. Archivo original estable. Digest candidato determinista verificado localmente.

## Runner futuro

PreviewOnly es el único modo. MUTATE falla antes de abrir una transacción. No se llama al importador general. No existe ruta que haga DML productivo. Gates futuros documentados y validados de forma cerrada en `FUTURE_REQUIRED_GATES`: SHA, digest, scope y fechas exactos; actor activo con tenant/RBAC; PostgreSQL 17.x; backup completo restaurado y verificado; advisory lock; flags/worker apagados; septiembre ausente; digest de agosto intacto; transacción única y rollback total; idempotencia, auditoría obligatoria, postflight y segunda ejecución sin duplicados; prohibición de catálogos automáticos, propagación Personal/Planilla/Nómina y recálculo económico.

La preparación de gates no implementa ni certifica un mutador. Incluso con todas las evidencias verdaderas, `assertFutureEvidence` rechaza la mutación. Actor, backup, auditoría mutadora, postflight de importación y segunda ejecución mutadora siguen pendientes de una futura implementación y validación aislada.

Allowlist futura propuesta: focalizacion_cargas, focalizacion_preliminar, focalizacion_vigencias (sólo inserciones septiembre), focalizacion_final y auditoria/auditoria_eventos/historial_cambios. Requiere revisar las dependencias y la auditoría estricta antes de habilitar un futuro runner; ninguna tabla fue escrita.

## Backup requerido, todavía no ejecutado

1. Usar pg_dump/pg_restore 17.x y credenciales mediante servicio/passfile seguro. Verificar identidad de la base productiva y versiones, con flags apagadas y worker detenido. Exportar snapshot consistente en una conexión READ ONLY que permanezca abierta; capturar bajo ese mismo snapshot inventario, conteos y digests de todas las tablas protegidas.
2. Dump completo, sin filtros de schema/tablas y sin omitir datos, secuencias, objetos grandes, constraints, ACL ni ownership. Comando futuro: `pg_dump --dbname=service=production_readonly --format=custom --snapshot=<snapshot_exportado> --verbose --file=<ruta_segura>/full.dump`. Cerrar la conexión de snapshot con ROLLBACK después del dump. Revisar exit 0 y stderr; registrar UTC, versiones, tamaño, SHA-256, inventario y snapshot en manifiesto seguro.
3. Respaldar roles/tablespaces por separado con `pg_dumpall --globals-only --no-role-passwords --database=service=production_readonly --file=<ruta_segura>/globals.sql`, con permisos suficientes y sin publicar datos del backup. Registrar cualquier restricción del proveedor. Respaldo separado de Excel/storage externo. El dump de una base no contiene globales del cluster ni storage externo.
4. Inspeccionar `pg_restore --list full.dump`. Restaurar previamente, sólo en PostgreSQL 17 aislado y compatible con las extensiones, usando `pg_restore --exit-on-error --create --dbname=service=isolated_restore full.dump` y los globales necesarios. Nunca restaurar sobre producción durante esta preparación.
5. Comparar inventario completo, conteos y digests contra el snapshot del dump; verificar FK, secuencias, agosto carga 4/687 vigencias, Nómina y anulados. Conservar logs y manifiesto de restore exitoso. Ensayar en esa copia rollback total, auditoría estricta, postflight y dos ejecuciones sin duplicados cuando exista mutador autorizado. Un dump parcial o una lista de objetos sin restore exitoso no satisface el gate de backup.
6. Antes de una futura ejecución, revalidar fuente, digest certificado, ausencia de septiembre y digests protegidos; si cambió el estado relevante, detener y renovar preview/backup. No se genera frase de autorización productiva.

Referencias: [pg_dump 17](https://www.postgresql.org/docs/17/app-pgdump.html), [pg_restore 17](https://www.postgresql.org/docs/17/app-pgrestore.html), [pg_dumpall 17](https://www.postgresql.org/docs/17/app-pg-dumpall.html).

## Pruebas y Git

Suite enfocada: 34/34 PASS, cero FAIL/SKIP, con entorno local sanitizado: parser numérico y XLSX, Puerto Rico/Meta, rechazo Caquetá, exclusiones, conteos que fallan cerrados, digest canónico, idempotencia PreviewOnly, tenant, lock, rollback PGlite aislado, rechazo DML/autocatálogos y gates futuros. Los tests de PostgreSQL aislado prueban READ ONLY, rollback y repetición del preview; no certifican un mutador inexistente.

Backend typecheck/build y FrontendNuevo build completados. git diff --check requerido antes de cada commit. Sólo commit/push a fix/focalizacion-septiembre-importacion-controlada. Sin merge/deploy. Main permanece e250e64b0ee7b0d5d808b972718ffd5fe16d759e. Workspace original de Nómina sin modificaciones por esta tarea.

Commit de tooling: f0ab95a14708132ae21bbb22703bdd82465134ce. El código de preview se committed sin cambios tras capturar la evidencia READ ONLY; el snapshot identifica además el commit base observado durante la captura y hashes de los dos archivos ejecutados. La metadata se finalizó localmente sin ejecutar otro preview productivo.

Decisión: PREVIEW FINAL DETENIDO. Resolver la correspondencia CUBARRAL/SAN LUIS DE CUBARRAL y confirmar manualmente SYNC antes de intentar un nuevo preview; no hay autorización para importar.
