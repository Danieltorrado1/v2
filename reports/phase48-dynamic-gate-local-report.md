**OPERACIÓN DETENIDA — PROTECCIÓN GLOBAL CONTRA CONCURRENCIA NO CERTIFICADA.**

Se implementó y probó un mecanismo dinámico exclusivamente local. La integración con el contrato, runner y mutador productivos se detuvo al demostrar una brecha real de catálogo. Este informe no autoriza producción ni certifica una sustitución completa del contrato histórico.

Informe cerrado el 14 de octubre de 2026, 02:12 UTC (13 de octubre, 21:12 Bogotá).

Rama: `fix/phase48-pooler-independent-read`. HEAD permanece `3a45f141b90fb779814b12ad4e8b62db6d7991fa`. Mutador histórico: `5759337bbdb8e936af4788491e4ab41cc6f31db3`. No se generaron commits ni se cambiaron esos pins. El working tree contiene los archivos nuevos de esta implementación y evidencia, sin cambios en archivos previamente versionados. Los pins históricos no certifican los archivos nuevos.

Se revisaron el contrato READ ONLY, autorización productiva, executor, repositorio de consultas, identidad de esquema, SQL Phase 48, pruebas de mutador/rollback y launcher PostgreSQL local. El contrato y executor históricos exigen 730 filas, admiten autorización de hasta diez minutos y combinan Phase 48 con correcciones de Albeny y Dary. El SQL histórico aplica un UPDATE general. Permanecen intactos: no aceptan el nuevo sello local ni se convierten silenciosamente en una autorización para 733.

Archivos nuevos:

| Archivo | Función |
| --- | --- |
| `src/modules/cobertura/phase48-dynamic-gate.ts` | Sello HMAC local, conteo dinámico, IDs canónicos, ocho digests, manifiesto de locks, TTL y nonce de un intento. |
| `src/modules/cobertura/phase48-dynamic-local.ts` | Dos lecturas independientes, revalidación SERIALIZABLE, DDL/backfill limitado a IDs sellados y rollback local. |
| `src/scripts/phase48-dynamic-local-guard.cjs` | Rechaza credenciales y conexiones productivas; SQL permitido únicamente en el cluster efímero dedicado. |
| `release/certify-phase48-dynamic-local.ps1` | Crea, inicia, prueba, detiene y elimina exclusivamente ese cluster nuevo PostgreSQL 17.11. |
| `src/tests/phase48.dynamic-local.test.ts` | 28 pruebas reales en PostgreSQL, incluyendo el contraejemplo que determina STOP. |
| `reports/phase48-dynamic-gate-local-proof.tap` | Evidencia sanitizada de las 28 pruebas. |
| `reports/phase48-dynamic-gate-local-report.md` | Este informe. |

El sello contiene versión `PHASE48_DYNAMIC_LOCAL_V1`, scope `IDENTITIES_ONLY_15_24`, issued_at, expires_at = issued_at + 120000 ms, nonce aleatorio y MAC con clave aleatoria privada de la autoridad local. Incluye candidate_count, lista completa de IDs decimales sin duplicados ordenados numéricamente, candidate_ids_digest, phase48_candidates_digest, source_digest, write_set_before_digest, schema_digest, protected_tables_digest, albeny_before_digest, dary_before_digest y periods_4_6_digest. El manifiesto ordenado de todas las tablas públicas también está firmado. No contiene nombres, documentos ni otros datos personales. No es un grant productivo; carece intencionadamente de permiso para ejecutarse remotamente.

Las dos certificaciones locales usan Clients físicamente nuevos; el primero termina antes de crear el segundo. Cada una inicia REPEATABLE READ READ ONLY, comprueba transaction_read_only=on, consulta nuevamente las fuentes y termina con ROLLBACK. Se comparan conteo, IDs y todos los digests sin caché compartida. La conexión de este laboratorio no usa TLS. La independencia de Pools/TLSSockets y los dos handshakes TLS de la ruta productiva histórica permanecen intactos y fueron cubiertos por la regresión existente; no se afirma haberlos integrado con el nuevo sello.

La ejecución consume el nonce antes de conectar y conserva una copia del sello. Inicia SERIALIZABLE, configura timeouts y toma un único `LOCK TABLE ... IN ACCESS EXCLUSIVE MODE NOWAIT` con todas las tablas del manifiesto **antes de cualquier SELECT**, incluyendo identidad del servidor y advisory lock. NOWAIT rechaza lectores/escritores con locks incompatibles sin esperar un snapshot obsoleto. ACCESS EXCLUSIVE bloquea también lecturas ordinarias sobre esas tablas: su impacto operativo sería amplio. Se comprueban versión 17.11, dirección local, puerto dedicado y directorio exacto del cluster. Se recalculan los ocho digests y la lista completa; cualquier divergencia, expiración o error aborta y revoca el nonce. No hay retry ni incorporación automática de nuevas altas.

El UPDATE utiliza únicamente `ca.id = ANY(ids_sellados)` junto con empresa 15, contrato 24 y las identidades actuales de focalización. RETURNING debe coincidir exactamente con IDs y tuplas certificadas. Se completan exclusivamente institucion_id, sede_id y modalidad_id, se elimina NOT NULL de focalizacion_final_id y se crea el índice de timeline. No se insertan asignaciones, empleados o vinculaciones; no se ejecutan correcciones históricas ni se cambian categorías, salarios, fechas, estados económicos o Nómina. Se verifica la conservación de todos los campos anteriores de las asignaciones y de todas las tablas protegidas. Albeny/Dary reciben solamente las mismas columnas de identidad del backfill general; sus campos anteriores permanecen idénticos. Los periodos 4/6 se exigen ANULADO y permanecen intactos.

ROLLBACK revierte DDL e identidades; dos conexiones nuevas recalculan los ocho digests y IDs y los comparan contra el sello previo. Se comprobó con conjuntos sintéticos de 730, 733 y 734, no con una restauración del esquema productivo completo. Los datos del laboratorio son técnicos y sintéticos: no se crearon filas de empleados ni de vinculaciones. La comprobación de commit local limita IDs y campos, pero no certifica auditorías ni un postcheck productivo independiente después del commit. La ruta local rechaza esquemas con triggers de usuario o secuencias, en vez de afirmar que sus efectos ya fueron certificados.

Resultados:

| Verificación | Resultado |
| --- | --- |
| Pruebas nuevas PostgreSQL cliente/servidor 17.11 | 28/28 pasan; la prueba 28 demuestra el límite de seguridad. |
| Dinámica 730/733/734 y rollback 8/8 | Pasa en fixture sintético; esquema y datos anteriores restaurados. |
| Alta intermedia, baja, ID reemplazado sin cambiar total | Rechazo antes del DDL/DML y nonce revocado. |
| Cambios de identidad, campo técnico, tabla protegida, periodo o esquema previo | Rechazo antes del DDL/DML. |
| Alteración de sello, conteo, IDs, manifiesto, digests o expiración | Rechazo de autenticación. |
| Divergencia individual de cada uno de los ocho digests | STOPPED_DRIFT 8/8. |
| Expiración a 120 segundos, reloj anterior a issued_at, expiración tras locks | Rechazo. |
| Escritor previo con transacción abierta | NOWAIT, SQLSTATE 55P03, sin DML Phase 48 y nonce revocado. |
| Escritores sin advisory: INSERT/UPDATE/DELETE, focalización, tabla protegida, TRUNCATE y ALTER TABLE existente | Bloqueados; lock_timeout 55P03 en conexión independiente. |
| Orden del primer SELECT | Probado después del lock completo y BEGIN SERIALIZABLE. |
| Fallo inducido después del UPDATE | ROLLBACK; esquema y ocho digests iguales al original. |
| Cambio inesperado en tabla protegida dentro de ejecución local | Rechazo y ROLLBACK. |
| Regresión READ ONLY, post-rollback, TLS, target, esquema crítico, contrato, mutador y publicación atómica | 150/150 pasan, protegidas contra acceso productivo. |
| Typecheck y build backend finales | Pasan. |
| Build FrontendNuevo | Pasa; advertencia de bundle mayor de 500 kB. |
| git diff --check, incluyendo comprobación de cada archivo nuevo sin staging | Pasa. |
| Cluster creado por esta ejecución | Detenido y eliminado; logs crudos del launcher eliminados. |

La primera ejecución de initdb bajo sandbox falló con restricted token error 87; se repitió el launcher con aprobación de ejecución local. La regresión Node inicial bajo sandbox falló por spawn EPERM y se repitió con el mismo guard aprobado: 150 pruebas pasan. Ninguno de estos intentos abrió conexiones productivas.

**Contraejemplo determinante:** después de adquirir todos los locks existentes y establecer el snapshot, otra conexión creó y confirmó `public.concurrent_new_source`. No necesitó modificar ni bloquear las tablas del manifiesto. La revalidación SERIALIZABLE conservó su snapshot anterior y el UPDATE local alcanzó a ejecutarse. La ejecución de prueba hizo ROLLBACK; las lecturas independientes posteriores detectaron el nuevo objeto y devolvieron STOPPED_DRIFT. La prueba confirma explícitamente que el DML local fue alcanzado y que no quedaron columnas Phase 48. Un error tardío no cumple la exigencia de rechazar toda divergencia antes del primer DML. Por ello no se habilitó una ruta productiva ni se sustituyó el contrato legado.

LOCK TABLE protege relaciones existentes y debe preceder al primer SELECT bajo SERIALIZABLE; no constituye un cerco universal del catálogo. Referencia: [PostgreSQL 17 LOCK](https://www.postgresql.org/docs/17/sql-lock.html). SERIALIZABLE conserva un snapshot y garantiza un orden serializable; no es un congelamiento administrativo de todos los escritores. Las secuencias tampoco son transaccionales. Referencia: [PostgreSQL 17 Transaction Isolation](https://www.postgresql.org/docs/17/transaction-iso.html). El límite de creación concurrente de tablas descrito aquí se demostró en el servidor local, además de estas propiedades documentadas.

Condiciones pendientes para cualquier futura autorización productiva, todas obligatorias:

1. Definir y demostrar un cerco efectivo contra DDL de catálogo, funciones, nuevos objetos y administradores concurrentes durante toda la ventana protegida. Un advisory lock o una observación DDL=0 no bastan. No se han autorizado ni realizado cambios de permisos o configuración productivos.
2. Resolver explícitamente las secuencias no transaccionales y los triggers/rutinas del esquema real sin rebobinar secuencias compartidas. Repetir pruebas adversariales y rollback sobre una restauración aislada completa, incluyendo identidad crítica phase48-critical-schema-v1 y todas las fuentes protegidas.
3. Integrar el gate dinámico en la ruta READ ONLY con Pools/sockets independientes, TLSv1.3, CA oficial y 8/8; preparar un grant exclusivo de identidades, ligado a commits finales, backup actual verificado, scope, IDs, digests, nonce durable de un uso y expiración máxima de 120 segundos. Endurecer el presupuesto temporal con reloj monotónico; la autoridad local actual usa reloj de pared y comprueba retrocesos anteriores a issued_at.
4. Sustituir expresamente la validación histórica de 730 y separar permanentemente las correcciones de Albeny/Dary. Certificar integridad de todos los candidatos vigentes y conservación de los 730 originales, sin reusar este fixture como reconciliación productiva.
5. Incorporar auditorías autorizadas de run_id y postcheck productivo independiente/recibo atómico con estados inequívocos para drift posterior al commit. Los locks se liberan al terminar la transacción: no se puede declarar ROLLED_BACK después de un COMMIT exitoso.
6. Garantizar que los escritores operativos posteriores generan correctamente las nuevas identidades. Certificar preservación de Nómina, salarios, categorías, estados anteriores de Albeny/Dary y periodos 4/6; no insertar vinculaciones ni introducir correcciones fuera del scope.
7. Obtener autorización separada para nuevos commits y pins, backup productivo actual con restauración verificada, controles health/flags/locks/DDL y autorización explícita de la ejecución exacta. Nada de esto queda autorizado por este turno.

Evidencia durable sanitizada: `reports/phase48-dynamic-gate-local-proof.tap`, SHA-256 `96f03d5469d3cb5bc1f7b50db4ea9cadeaa292cd16e529eee482b00033b375d6`. Se normalizaron únicamente CRLF a LF y BOM UTF-8 para revisión Git; el TAP original conserva SHA-256 `8ca60d06459d9b4bac8dabf2944bef5bddf692270b70107e1a586ee108e9e928` en `tmp/phase48-pooler-local/dynamic-proof.tap`. Guard: cero conexiones productivas, cero escrituras productivas, cero intentos prohibidos. No se consultaron tablas productivas ni se verificó health/flags productivos en este turno. No se creó un backup; no se ejecutaron migraciones remotas, Phase 48 productiva, correcciones históricas, commit, push, merge ni deploy.

**Decisión: detener la preparación productiva. El mecanismo local demuestra protección de filas en relaciones selladas, pero la protección completa exigida no está certificada.**
