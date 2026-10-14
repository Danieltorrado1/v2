**OPERACIÓN DETENIDA — DELTA O CONCURRENCIA NO CERTIFICADOS**

Se creó `fix/phase48-scoped-dynamic-contract` desde el HEAD exacto `3a45f141b90fb779814b12ad4e8b62db6d7991fa`. El código del contrato y del mutador no fue modificado. Los archivos no versionados de la auditoría anterior se conservaron.

Se abrió una conexión productiva TLS 1.3 y una única transacción REPEATABLE READ READ ONLY. Snapshot `131785:131785:` del 14 de octubre de 2026, 11:43 UTC. La transacción observó 733 asignaciones; el conjunto completo quedó capturado. La comparación offline posterior contra los 730 IDs históricos confirma exactamente las altas 1277, 1278 y 1279, sin altas adicionales ni bajas históricas. El esquema `phase48-critical-schema-v1` coincide con `b2721653fcb198b17c91d27e454c526fedc99a8e71e9d3e28f4c8e2f8e34d98a`. Los periodos 4 y 6 se observaron ANULADO.

La sonda temporal falló al interpretar los nombres de columnas de FK retornados por PostgreSQL. La transacción hizo ROLLBACK y se confirmó el cierre de la conexión. No hubo DDL ni DML productivo, ni backup, autorización mutadora, preflight mutador, migración, commit, push, merge o deploy.

El fallo local se reprodujo en PostgreSQL 17.11: pg entrega `name[]` como string; intentar `.map` no funciona. La conversión SQL explícita de `attname` a `text` produce `text[]` correctamente decodificado. La prueba local de esa corrección pasó 1/1, con cero conexiones productivas. Se corrigió sólo la sonda temporal. No se afirma que esta prueba certifique el resto de la auditoría ni el contrato solicitado.

| ID conocido | Presente en snapshot | Clasificación disponible |
| --- | --- | --- |
| 1277 | Sí | NO_DETERMINABLE: auditoría incompleta por fallo de la sonda |
| 1278 | Sí | NO_DETERMINABLE: auditoría incompleta por fallo de la sonda |
| 1279 | Sí | NO_DETERMINABLE: auditoría incompleta por fallo de la sonda |

Esta clasificación describe insuficiencia de evidencia, no un defecto demostrado en las altas. No se autorizó ampliar la única transacción productiva a una segunda lectura. Se solicitó autorización específica para repetir únicamente la auditoría del delta después de la comprobación local; mientras no llegue, no se realizan conexiones adicionales ni se cambia el contrato.

Los digests capturados son forenses y no constituyen un sello mutador:

| Campo | Valor |
| --- | --- |
| candidate_count | 733 |
| candidate_ids_digest (formato forense) | `6fe5848585b0eb1f2098eb834f804cd337eed7bae92b4028af55bb2d3e470277` |
| phase48_candidates_digest (formato forense) | `5c7edd2828484733f1bdc4b4fab6398b92d98936e51f67dfa605323817069c99` |
| write_set_before_digest (formato forense) | `2834e46bccf47202b75893c16363221caab9ac671019bcd298183a7ca05dab27` |
| critical_schema_digest | `b2721653fcb198b17c91d27e454c526fedc99a8e71e9d3e28f4c8e2f8e34d98a` |
| source_digest acotado, critical_definition_digest, critical_sequences_digest | No emitidos; contrato nuevo no implementado |

Los IDs y su hash están en `phase48-scoped-delta-readonly-attempt1.json`. Se mantiene la distinción entre evidencia histórica, evidencia del snapshot y certificación futura. No se extrapolan digests de formatos diferentes.

No se construyó ni certificó un nuevo manifiesto, política mutadora o rollback postcommit; hacerlo antes de reconciliar materialmente las altas violaría el orden autorizado. Las suites del runner, mutador, TLS, contrato, Albeny/Dary, typecheck y builds no se ejecutaron como certificación de una implementación inexistente. Los 43 tests de concurrencia del turno anterior siguen siendo evidencia del contrato anterior.

No se generaron nuevos readonly_runner_commit ni mutator_commit; el pin histórico permanece `5759337bbdb8e936af4788491e4ab41cc6f31db3` y no constituye autorización vigente para publicar el nuevo contrato. No se revocaron pins en código antes de completar el paso 2.

Evidencia de lectura: `phase48-scoped-delta-readonly-attempt1.json`. Evidencia local de la corrección de catálogo: `../tmp/phase48-pooler-local/fk-probe-proof.tap`. Cero escrituras productivas. Operación bloqueada antes de modificar el contrato.
