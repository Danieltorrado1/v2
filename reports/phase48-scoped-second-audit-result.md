**OPERACIÓN DETENIDA — ALTA PRODUCTIVA MATERIALMENTE NO DETERMINABLE**

La segunda lectura autorizada se completó. Se separaron DATA_VALIDITY y ORIGIN_ATTRIBUTION. La ausencia de auditoría directa no se utilizó para invalidar datos. No se implementó el contrato dinámico porque 1277 y 1279 no superaron la condición salarial exigida para continuar.

Estado inicial: rama `fix/phase48-scoped-dynamic-contract`, HEAD `3a45f141b90fb779814b12ad4e8b62db6d7991fa`, sin modificaciones de archivos versionados. `git status --short --untracked-files=all` enumeró 14 archivos no versionados, todos procedentes de las implementaciones locales y evidencias de los turnos anteriores:

- `release/certify-phase48-dynamic-local.ps1`.
- `reports/phase48-concurrency-audit-proof.tap`, `phase48-concurrency-dependency-inventory.json`, `phase48-concurrency-technical-audit.md`.
- `reports/phase48-dynamic-gate-local-proof.tap`, `phase48-dynamic-gate-local-report.md`.
- `reports/phase48-scoped-delta-readonly-attempt1.json`, `phase48-scoped-delta-readonly.json`, `phase48-scoped-dynamic-contract-status.md`.
- `src/modules/cobertura/phase48-dynamic-gate.ts`, `phase48-dynamic-local.ts`.
- `src/scripts/phase48-dynamic-local-guard.cjs`, `src/tests/phase48.dynamic-local.test.ts`.
- `tmp/phase48-scoped-delta-readonly.ts`.

Los nombres abreviados de cada bullet comparten su directorio inicial. No hubo cambios ajenos identificados. No se descartó ningún archivo. La corrección FK está en `tmp/phase48-scoped-delta-readonly.ts`: ambas proyecciones de `pg_attribute.attname` se convierten explícitamente a text, produciendo text[] en lugar de name[]. La prueba y launcher de esa corrección están en `tmp/phase48-pooler-local/audit-fk-probe.test.ts` y `audit-fk-probe-local.ps1`; su evidencia está en `fk-probe-proof.tap`. Estos archivos temporales del subdirectorio están ignorados por Git. La sonda nueva `tmp/phase48-delta-second.ts` conserva esa conversión.

Se ejecutó primero la prueba local PostgreSQL 17.11 del parser: **1/1**. Se ejecutaron después dos pruebas locales adicionales: separación de clasificaciones y ejecución de todas las consultas de la sonda con los nombres/tipos de columnas del catálogo histórico, en fixture sintético sin personas reales: **2/2**. Ninguna conectó a producción. El cluster local fue detenido y eliminado por su launcher.

Lectura productiva: una conexión PoolClient/Pool nueva con TLS 1.3, validación de hostname/cadena y CA oficial con hash fijado. Una única transacción adicional `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, con `ROLLBACK` en finally y cierre completo confirmado. El servidor remoto observado es **17.6**; **17.11** corresponde al laboratorio local. No se cambió ni se afirmó cambiar la versión productiva.

Población del snapshot: **733** IDs en contrato 24, exactamente **1277, 1278 y 1279** adicionales frente a los 730 históricos. Sin bajas históricas ni altas adicionales no examinadas. Los datos completos de negocio consultados se limitaron a estas altas y sus relaciones; la comparación poblacional sólo leyó IDs técnicos. La evidencia persistida no contiene nombres, documentos, correos, teléfonos, importes salariales ni contenido personal de auditorías.

| Asignación | DATA_VALIDITY | ORIGIN_ATTRIBUTION | Motivo de decisión |
| --- | --- | --- | --- |
| 1277 | NOT_DETERMINABLE | INDIRECT_AUDIT_CORRELATED | Compatibilidad salarial no acreditada; no se observó bloqueo explícito REQUIERE_REVISION_SALARIAL. |
| 1278 | VALID_COMPATIBLE | INDIRECT_AUDIT_CORRELATED | Categoría 34 compatible con modalidad CAA y vigencia consultada. |
| 1279 | NOT_DETERMINABLE | INDIRECT_AUDIT_CORRELATED | Compatibilidad salarial no acreditada; no se observó bloqueo explícito REQUIERE_REVISION_SALARIAL. |

No se detectaron FK inválidas, contradicciones de scope, fechas incoherentes, diferencias de identidad textual frente a la fuente, duplicados ni solapamientos en ninguna de las tres filas. Son hallazgos específicos del snapshot, no una certificación del contrato nuevo.

| Asignación | Vinculación | Empleados técnicos | Vigencia de asignación | Identidades que completaría Phase 48 | Modalidad original | Categoría en Nómina |
| --- | --- | --- | --- | --- | --- | --- |
| 1277 | 1605 | 2376, 2379 | 2026-09-07; fin NULL | institución 6, sede 16, modalidad 3 | CAJM/JT-RI | 35 |
| 1278 | 1606 | 2377 | 2026-10-01; fin NULL | institución 42, sede 167, modalidad 1 | CAA | 34 |
| 1279 | 1607 | 2378 | 2026-10-13; fin NULL | institución 39, sede 132, modalidad 3 | CAJM/JT-RI | 35 |

Scope de las tres filas: empresa 15 / contrato 24. Activas. Columnas a completar: institucion_id, sede_id y modalidad_id. El backfill de identidades está determinado por focalizacion_final, sin inferencia de una categoría salarial. IDs de municipio y focalización, comprobaciones de cada FK, vigencias de vinculación/contrato y timestamps están en el JSON adjunto.

La consulta salarial buscó categorías activas por igualdad de modalidad normalizada con el **código original**, e intersección de vigencia. Para CAJM/JT-RI no obtuvo coincidencias; para CAA obtuvo 34. En 1277 y 1279 los empleados ya referencian 35, cuya FK existe. **Esto no demuestra que la categoría 35 sea incorrecta ni que no exista una correspondencia válida por código base.** El código de Nómina también contempla codigo_base en algunos contextos; no se obtuvo evidencia suficiente en esta lectura para acreditar esa correspondencia y vigencia salarial de 35. No se infirió equivalencia ni se asignó salario. No se observó el bloqueo explícito requerido en las asignaciones, empleados, detalles o contextos relacionados consultados. La restricción material es falta de prueba de una de las dos condiciones autorizadas: categoría compatible o bloqueo salarial explícito.

| Asignación | Asistencias | Novedades | Movimientos | Turnos | Periodos intersectados |
| --- | --- | --- | --- | --- | --- |
| 1277 | 0 | 0 | 0 | 0 | 3 ABIERTO, 4 ANULADO, 5 ABIERTO, 6 ANULADO |
| 1278 | 0 | 0 | 0 | 0 | 5 ABIERTO |
| 1279 | 0 | 0 | 0 | 0 | 5 ABIERTO |

Los conteos y sus digests corresponden a toda la actividad registrada para cada vinculación en las tablas consultadas. No se confunden con actividad sólo dentro del intervalo de la nueva asignación.

La atribución indirecta se basa en auditoria/auditoria_eventos VINCULACION_CREATE sobre el mismo ID de vinculación y timestamps dentro de cinco minutos de created_at de la asignación:

| Asignación | Eventos correlacionados | Timestamp | Actor seudonimizado |
| --- | --- | --- | --- |
| 1277 | 16880, 61172 | 2026-10-13 16:43:29.030876 | actor-af513bb017065fc9 |
| 1278 | 16884, 61210 | 2026-10-13 18:24:37.290479 | actor-fd3947f4541f96c3 |
| 1279 | 16887, 61215 | 2026-10-13 18:26:44.468555 | actor-fd3947f4541f96c3 |

Correlación temporal y de ID no equivale a prueba directa de quién insertó cobertura_asignaciones. Auditorías directas, indirectas e historial consultados se registran separadamente en el JSON, sin valores personales de cambios.

No se demostró que 1277 o 1279 necesiten una corrección histórica adicional: esa decisión permanece no determinada por el bloqueo de validación salarial. Para 1278 no se identificó una corrección histórica adicional requerida por la evidencia examinada. No se atribuyen a estas altas las correcciones preexistentes de Albeny/Dary.

Digests del snapshot y estado de implementación:

| Campo | Valor / estado |
| --- | --- |
| candidate_count | 733 |
| candidate_ids_digest, formato forense | `6fe5848585b0eb1f2098eb834f804cd337eed7bae92b4028af55bb2d3e470277` |
| critical_schema_digest v1 | `b2721653fcb198b17c91d27e454c526fedc99a8e71e9d3e28f4c8e2f8e34d98a` |
| phase48_candidates_digest, source_digest acotado, write_set_before_digest, critical_definition_digest, critical_sequences_digest del contrato nuevo | No emitidos: no existe certificación ni sello mutador nuevo. Los hashes individuales de antes y los backfills determinados están en el JSON. |
| manifiesto crítico nuevo | No implementado; el inventario crítico histórico se conserva como evidencia, sin certificarlo como contrato nuevo. |
| readonly_runner_commit final | No generado. HEAD sigue en `3a45f141b90fb779814b12ad4e8b62db6d7991fa`. |
| mutator_commit final | No generado. Pin histórico conservado: `5759337bbdb8e936af4788491e4ab41cc6f31db3`; no es autorización para este contrato nuevo. |

No se ejecutaron como certificación suites ni builds del contrato solicitado, porque la condición para implementarlo no pasó. La prueba local del parser, las dos pruebas de la sonda y `git diff --check` pasaron. Los 43 tests de la auditoría previa pertenecen al contrato anterior. No se modificó código versionado del contrato, gate, runner ni mutador, ni se revocaron pins antes de superar la validación.

Evidencia: `phase48-scoped-delta-readonly-attempt2.json`, SHA-256 `06c35f462ea941f60172ac2fec3e242bb91e983404ba64655717425c34b1742d`. Pruebas: `../tmp/phase48-pooler-local/fk-probe-proof.tap`, `second-probe-local-proof.tap`. Los archivos de la primera lectura y las evidencias anteriores permanecen intactos.

**Cero escrituras productivas.** Sin backup, mutación, migración, DDL/DML remoto, auditorías productivas, commit, push, merge o deploy. No se abrió una tercera lectura. Se detuvo antes de cambiar el contrato, conforme al paso 5.
