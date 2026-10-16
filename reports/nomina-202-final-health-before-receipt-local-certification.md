# Nómina 202 — certificación local del orden final

Fecha de ejecución: 2026-10-16 (UTC). Rama de trabajo: `fix/nomina-turno-202-final-health-before-receipt`. Base: `8463962dab5a9aaf1ed32c9de1704df2dd03e49e`.

## Causa y corrección

La ejecución anterior podía publicar el baseline y la frase `PENDING_USER_CONFIRMATION` antes de completar el health final. El health se comprobó después, fuera de la secuencia del launcher; por tanto, el recibo previo no demostraba que el gate final hubiera pasado antes de su publicación. El baseline y el PENDING anteriores se conservan byte a byte, y el nonce anterior quedó registrado como `REVOKED_NO_UTILIZABLE` con razón `FINAL_HEALTH_AFTER_RECEIPT_AND_EXPIRY`.

El flujo del launcher ahora exige, en este orden, dos snapshots independientes, rollback y cierre de cada Client, comparación de digests/PDF, health final satisfactorio, baseline atómico, creación de frase/nonce y recibo PENDING atómico. Un health final fallido o un fallo de publicación no produce PENDING utilizable; el límite exterior dirige el fallo al recibo STOPPED. La validación del publicador y del contrato rechaza health ausente/fallido y timestamps ausentes o no estrictamente crecientes. El runner continúa sin importar ni invocar el corrector. La CA de pruebas locales se acepta sólo cuando su hash coincide con el `expectedCaSha256` del plan local; el precheck productivo conserva su pin de CA oficial.

## Recertificación PostgreSQL/TLS local

Se restauró el dump certificado en un cluster PostgreSQL `17.11` desechable con TLS `1.3`, CA local, hostname `localhost` y puerto dinámico `59550`. El cluster se detuvo y eliminó al finalizar. El harness se detuvo tras la lectura READ ONLY y la finalización sintética, antes de iniciar cualquier corrector. El setup de restauración inicializa las secuencias del dump; durante el runner no se emitieron DDL, DML ni `nextval`.

- Dump: SHA-256 `dd1f9d298e83fb9664d1795c4e452698c26b274569cca11715b2c2f03ff99d75`.
- Antes-state certificado: SHA-256 `44ca846355fc60ac3e30f51a74c3c0be8432db3678f0f047d75dc3d508e4ad95`.
- PDF histórico local: 3051 bytes, SHA-256 `cf061de69f85976bd884439e12a58281bde4d32d2542b36e653a96a3a9c7d8a4`.
- Runner: dos Clients/transacciones independientes, `REPEATABLE READ READ ONLY`, TLS autorizado `TLSv1.3`, dos `ROLLBACK` y dos cierres confirmados; 22 consultas de captura y 6 de transacción.
- Resultado: PENDING sintético; mutator no importado/invocado; cero escrituras productivas.
- Health final local: HTTP 200, database `ok`, OUTBOX/SYNC/RECALC `false`, worker detenido.
- Baseline sintético SHA-256 `8931cab71aa07ff81f122d78c096877a8577c16a1f9e70386eb407466f747294`; PENDING sintético SHA-256 `fbb95fcd1f2279a5eb495d8bd04fa058d4a5f322d33a632bf508ae7a957fa647`.
- Reporte JSON íntegro del harness: `C:\Users\COREUL~1\AppData\Local\Temp\nomina-202-readonly-order-report-20261016T011404Z\report.json`, 172391 bytes, SHA-256 `1524fbc9514db19cc66ef4727861e1959468784fba4d5427fb3ef2bbc67d7945`.

Los doce digests canónicos coincidieron entre snapshots:

| Digest | SHA-256 |
|---|---|
| critical_schema | `7dbedce501f61b4195e0dea7573f37d7fe4b8159b5383532f40c728eb0dd1f3d` |
| sources | `f1311c3825573ad017899740b7d6c8f8315a2b76dfabffb3142c873e19689963` |
| movement_192 | `bd48d5f3fce2c69361a36ab906affc1eafa35793da2fc8ac2d2a769d3aef015f` |
| detail_220 | `d2a34f142c3eff4e3a6883fe22a5393dae0cc423ed34ac058495bae4cc8ce01a` |
| account_77 | `c51a5542d18c8822b81212752f6ba671d15f215f506bf36aec87d2e3537e137d` |
| revision_20114 | `4a11d6150197d297bce1c9d800bf5046bc4a88189960985ac54e18faa3f33302` |
| related_audits | `1e1e668d297a40b2b1c603bb00bd156af545d66910603a1c706e09de64643af6` |
| related_history | `cc2643e26a9dcf944a552f9f82d3b97fd28c10c1e8ffa4c0135a95054e5dbeba` |
| pdf_metadata | `16113cd2141c950ac82ad380ef9d13fecb5152a245d0fb12ca9fa0f918322954` |
| protected_tables | `091aa63a5b2e12b60b48f5fd95a8c9fdd15eae6448e02e2489f313cba7e8ea04` |
| write_set_before | `95bfe3a5b6b57f4bdc7f7f3386673a83975866e96ce2c15c2ecec068359d1dc9` |
| sequence_baseline | `a9f0c7a20b6c9debcb01a4cfe65c65aafdd76ad37bc5c8e10cda97a3acbf7986` |

## Orden observado

| Evento | UTC |
|---|---|
| read1_rollback_completed_at | `2026-10-16T01:14:21.597Z` |
| read1_closed_at | `2026-10-16T01:14:21.598Z` |
| read2_rollback_completed_at | `2026-10-16T01:14:21.789Z` |
| read2_closed_at | `2026-10-16T01:14:21.790Z` |
| final_health_completed_at | `2026-10-16T01:14:21.818Z` |
| baseline_published_at | `2026-10-16T01:14:21.819Z` |
| pending_receipt_published_at | `2026-10-16T01:14:21.828Z` |

## Validación

El conjunto completo de pruebas de Nómina 202 pasó: 102/102. Typecheck, build backend y build frontend pasaron. El build frontend mantiene el aviso existente de bundle mayor a 500 kB. El `git diff --check` se ejecuta en el cierre de esta rama.

Pins de base conservados: política `0f074fcd5fdf828d82b7cb3b6f20787def236188`, entrada `610dd263d8f7734ac504a4b5fbb7d05c01a4ea9b`, corrector `95fc6bb6879409d37a088e451fb64f2edafacb5f`. El preflight productivo y el corrector no se ejecutaron.
