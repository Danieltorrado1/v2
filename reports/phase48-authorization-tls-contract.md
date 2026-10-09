# Certificaci?n del contrato TLS de autorizaci?n Phase 48

Rama: `fix/phase48-authorization-tls-contract`.
Base exacta: `5eeb4f6f0efd5fbb4044991fa44c0d1f08d4222e`.
Implementaci?n del mutador de reemplazo: `9c344ce12ae196558ca1dab1c8f52a14150cdda7`.
El HEAD de entrega contiene el pin de ese commit y la certificaci?n final. Se debe ejecutar desde ese HEAD limpio, no desde el commit intermedio de implementaci?n. No se crea ni activa una aprobaci?n productiva en esta certificaci?n.

El commit `dcbd37a` (`dcbd37adacc9c6a0a67439eaef92a8b47b8abf67`) queda sustituido. Todas las frases anteriores quedan REVOCADAS para este protocolo: se exige el nuevo pin, el certificado obligatorio, el recibo actual, el nonce vigente y el commit READ ONLY igual al HEAD ejecutado. El recibo detenido no hab?a emitido nonce ni autorizaci?n.

## Recibo preservado

Archivo durable:
`C:/Users/CORE ULTRA/Documents/EmpiriaBackups/phase48-modalidad-pre-migracion-20261007T132031Z/stopped-preflights/phase48-preflight-027f4ffb-a4f5-4f29-a70e-3dc12df311b3.json`.

Tama?o: 3602 bytes.
SHA-256: `3C783ECEE38C3252BB84FA02700B7105CBEEBDC1C0985A1CCB816F21EA7EE33F`.
Manifiesto sanitizado: el mismo nombre con sufijo `.manifest.json`.
Se comprob? igualdad de tama?o y SHA despu?s de moverlo. La revisi?n completa y el escaneo no encontraron credenciales, PEM ni datos personales. El working tree s?lo conten?a ese archivo y qued? limpio antes de crear la rama.

Backup autorizado, sin modificaciones:
`4271775ee853bf03b9f70402f7ecfd7becbe048269e3b10c76f027f981303e26`.
Certificado oficial externo, sin modificaciones:
`700723581420DD1AC98FD7E9AC529F0EF210EADCAF87FC868A3AD7D114C2F3B7`.

## Contrato can?nico final

Esta es una plantilla documental, no una autorizaci?n ni un nonce utilizable. `HEAD_READONLY` ser? el SHA exacto del HEAD de entrega que ejecute un pr?ximo preflight autorizado. Cada digest y el nonce tendr? 64 caracteres hexadecimales; los ocho digests y el nonce usan min?sculas. El hash del certificado exige exactamente las may?sculas indicadas. El orden y todos los bytes de la frase son obligatorios:

```text
AUTHORIZE_PHASE48_HISTORICAL|readonly_runner_commit=<HEAD_READONLY>|mutator_commit=9c344ce12ae196558ca1dab1c8f52a14150cdda7|backup_sha256=4271775ee853bf03b9f70402f7ecfd7becbe048269e3b10c76f027f981303e26|certificate_sha256=700723581420DD1AC98FD7E9AC529F0EF210EADCAF87FC868A3AD7D114C2F3B7|project_ref=scuvsocqibbubqnesvuf|empresa=15|contrato=24|actor=12|expected_rows=730|schema_digest=<64hex>|source_digest=<64hex>|phase48_candidate_digest=<64hex>|albeny_before_digest=<64hex>|dary_before_digest=<64hex>|protected_tables_digest=<64hex>|periods_4_6_digest=<64hex>|write_set_before_digest=<64hex>|nonce=<64hex>|issued_at=<UTC_ISO_MILLISECONDS>|expires_at=<UTC_ISO_MILLISECONDS>|OUTBOX=false|SYNC=false|RECALC=false|suppressExternalSync=true|preserveOperationalSources=true|noPayrollRecalculation=true|atomicPhase48AndCorrections=true|status=PENDIENTE_DE_AUTORIZACION
```

El parser reconstruye y compara la frase completa en tiempo constante para entradas de igual tama?o. Rechaza campos ausentes, adicionales, duplicados, reordenados, espacios, escapes, n?meros alternativos, certificado incorrecto y frases del mutador sustituido. La emisi?n no admite fecha futura ni caducidad superior a diez minutos. El recibo, la autorizaci?n, su parser y la comprobaci?n/consumo del nonce exigen el mismo `certificate_sha256`.

Una futura aprobaci?n externa del mutador conservar? su condici?n ACTIVE expl?cita y el habilitador separado, con JSON minificado can?nico y estas claves exactamente en este orden: `authorization`, `actor`, `empresa`, `contrato`, `expectedRows`, `backupSha`, `commit`, `runId`, `projectRef`, `baseline`, `confirmation`, `authorizationIssuedAt`, `authorizationExpiresAt`, `syncManualConfirmation`, `certificate_sha256`, `authorizationPhrase`. Se rechazan duplicados, alias mediante escapes, claves desconocidas, espacios adicionales y saltos de l?nea fuera de valores. La confirmaci?n de mutaci?n incorpora el certificado y el SHA-256 de la frase completa, por lo que tambi?n vincula el nonce. Este informe no crea ese archivo.

## TLS compartido y barreras

Los dos runners usan `verifiedProductionConfig`. Primero exige el SHA oficial exacto en configuraci?n, valida el archivo real externo (ruta/allowlist, ausencia de enlaces, ACL, tama?o, SHA, PEM/X.509, CA, Key Usage y vigencia) y s?lo entonces llama al lector de credencial. El certificado se conserva en memoria; no se copia al repositorio ni se instala en Windows.

La configuraci?n exige `ssl.ca` expl?cito, `rejectUnauthorized=true`, `minVersion=TLSv1.3`, `servername` igual al host oficial validado y `node:tls.checkServerIdentity` sin reemplazos. Se rechazan entornos inseguros y par?metros URL contradictorios. Ambos caminos usan el mismo `validateReadTarget`, incluyendo project_ref, host, usuario, base, puertos y par?metros exactos. El servidor futuro debe confirmar PostgreSQL 17.6 y TLSv1.3. No se observ? ning?n servidor productivo en este turno.

Antes de abrir conexiones se validan certificado, aprobaci?n estricta, frase, nonce vigente, fecha, commits y fuentes certificadas. El contrato permite ?nicamente cambiar el literal del pin entre el commit de implementaci?n y el HEAD de entrega; cualquier otro drift del contrato o de las fuentes protegidas bloquea la conexi?n.

El nonce se consume antes de conectar y su estado CONSUMED permanece aun si falla la conexi?n o la transacci?n. Un lock exclusivo compartido serializa publicaci?n del recibo y consumo entre procesos. Un fallo de persistencia nunca abre la conexi?n; un recibo corrupto o un lock residual falla cerrado. No se devuelve un nonce consumido al estado pendiente. Un nuevo recibo revoca al anterior.

El mutador compara los ocho digests con el baseline inmediato dentro de su transacci?n inicial READ ONLY, antes de cualquier escritura. Conserva SERIALIZABLE, advisory lock, revalidaci?n desde observador independiente, locks de tablas, write-set restringido, rollback total, idempotencia y auditor?a estricta. El SQL Phase 48, el dominio hist?rico y el guard LOCAL_RESTORATION_REQUIRED permanecen sin modificaciones.

## Validaci?n local

La evidencia final est? en `phase48-authorization-tls-contract.cert.json`, con fuentes, escenarios, huellas y limpieza.

- 44/44 pruebas de contrato, parser, nonce, flags, destino y runner; 37 comprobaciones TLS dentro de la bater?a.
- 30/30 escenarios del contrato READ ONLY y 27/27 regresiones del runner sobre restauraci?n aislada.
- 26/26 escenarios del mutador: los 22 anteriores m?s advisory lock ocupado, baseline inmediato incorrecto, cada uno de los ocho digests alterado y autorizaci?n completa correcta.
- Los escenarios 24?26 usan clientes conectados exclusivamente a loopback. S?lo los metadatos de versi?n 17.6/TLS son sint?ticos para recorrer esas compuertas; el servidor real local es PostgreSQL 17.11 y las consultas, snapshots, locks, rollback y escritura at?mica son reales en la base desechable.
- Certificado oficial verificado offline con credencial sint?tica, sin conexi?n de red ni lectura del archivo de credenciales productivas.
- Typecheck, build backend, build FrontendNuevo y git diff --check. FrontendNuevo informa ?nicamente el aviso de tama?o de chunks.
- Escaneo de objetos Git y fuentes versionadas: cero contenido del certificado productivo.
- Cluster desechable detenido y eliminado, conexiones locales cerradas y temporales crudos retirados. Credenciales y variables TLS temporales limpiadas en los procesos ejecutados.

Cero conexiones productivas, cero consultas health productivas, cero DDL, DML, auditor?as y operaciones de secuencias productivas. No se ley? la credencial productiva. No hubo preflight productivo, migraci?n, merge ni deploy.

**CONTRATO TLS COMPLETO ? LISTO PARA NUEVO PREFLIGHT READ ONLY**
