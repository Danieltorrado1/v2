> DOCUMENTO HISTÓRICO SUSTITUIDO: todas sus frases quedan REVOCADAS. Véase [contrato vigente](phase48-postrollback-eight-digests.md).

# Certificación del contrato TLS de autorización Phase 48

Rama: `fix/phase48-authorization-tls-contract`.
Base exacta: `5eeb4f6f0efd5fbb4044991fa44c0d1f08d4222e`.
Implementación del mutador de reemplazo: `9c344ce12ae196558ca1dab1c8f52a14150cdda7`.
El HEAD de entrega contiene el pin de ese commit y la certificación final. Se debe ejecutar desde ese HEAD limpio, no desde el commit intermedio de implementación. No se crea ni activa una aprobación productiva en esta certificación.

El commit `dcbd37a` (`dcbd37adacc9c6a0a67439eaef92a8b47b8abf67`) queda sustituido. Todas las frases anteriores quedan REVOCADAS para este protocolo: se exige el nuevo pin, el certificado obligatorio, el recibo actual, el nonce vigente y el commit READ ONLY igual al HEAD ejecutado. El recibo detenido no había emitido nonce ni autorización.

## Recibo preservado

Archivo durable:
`C:/Users/CORE ULTRA/Documents/EmpiriaBackups/phase48-modalidad-pre-migracion-20261007T132031Z/stopped-preflights/phase48-preflight-027f4ffb-a4f5-4f29-a70e-3dc12df311b3.json`.

Tamaño: 3602 bytes.
SHA-256: `3C783ECEE38C3252BB84FA02700B7105CBEEBDC1C0985A1CCB816F21EA7EE33F`.
Manifiesto sanitizado: el mismo nombre con sufijo `.manifest.json`.
Se comprobó igualdad de tamaño y SHA después de moverlo. La revisión completa y el escaneo no encontraron credenciales, PEM ni datos personales. El working tree sólo contenía ese archivo y quedó limpio antes de crear la rama.

Backup autorizado, sin modificaciones:
`4271775ee853bf03b9f70402f7ecfd7becbe048269e3b10c76f027f981303e26`.
Certificado oficial externo, sin modificaciones:
`700723581420DD1AC98FD7E9AC529F0EF210EADCAF87FC868A3AD7D114C2F3B7`.

## Contrato canónico final

Esta es una plantilla documental, no una autorización ni un nonce utilizable. `HEAD_READONLY` será el SHA exacto del HEAD de entrega que ejecute un próximo preflight autorizado. Cada digest y el nonce tendrá 64 caracteres hexadecimales; los ocho digests y el nonce usan minúsculas. El hash del certificado exige exactamente las mayúsculas indicadas. El orden y todos los bytes de la frase son obligatorios:

```text
Plantilla anterior revocada. Contrato vigente: phase48-postrollback-eight-digests.md
```

El parser reconstruye y compara la frase completa en tiempo constante para entradas de igual tamaño. Rechaza campos ausentes, adicionales, duplicados, reordenados, espacios, escapes, números alternativos, certificado incorrecto y frases del mutador sustituido. La emisión no admite fecha futura ni caducidad superior a diez minutos. El recibo, la autorización, su parser y la comprobación/consumo del nonce exigen el mismo `certificate_sha256`.

Una futura aprobación externa del mutador conservará su condición ACTIVE explícita y el habilitador separado, con JSON minificado canónico y estas claves exactamente en este orden: `authorization`, `actor`, `empresa`, `contrato`, `expectedRows`, `backupSha`, `commit`, `runId`, `projectRef`, `baseline`, `confirmation`, `authorizationIssuedAt`, `authorizationExpiresAt`, `syncManualConfirmation`, `certificate_sha256`, `authorizationPhrase`. Se rechazan duplicados, alias mediante escapes, claves desconocidas, espacios adicionales y saltos de línea fuera de valores. La confirmación de mutación incorpora el certificado y el SHA-256 de la frase completa, por lo que también vincula el nonce. Este informe no crea ese archivo.

## TLS compartido y barreras

Los dos runners usan `verifiedProductionConfig`. Primero exige el SHA oficial exacto en configuración, valida el archivo real externo (ruta/allowlist, ausencia de enlaces, ACL, tamaño, SHA, PEM/X.509, CA, Key Usage y vigencia) y sólo entonces llama al lector de credencial. El certificado se conserva en memoria; no se copia al repositorio ni se instala en Windows.

La configuración exige `ssl.ca` explícito, `rejectUnauthorized=true`, `minVersion=TLSv1.3`, `servername` igual al host oficial validado y `node:tls.checkServerIdentity` sin reemplazos. Se rechazan entornos inseguros y parámetros URL contradictorios. Ambos caminos usan el mismo `validateReadTarget`, incluyendo project_ref, host, usuario, base, puertos y parámetros exactos. El servidor futuro debe confirmar PostgreSQL 17.6 y TLSv1.3. No se observó ningún servidor productivo en este turno.

Antes de abrir conexiones se validan certificado, aprobación estricta, frase, nonce vigente, fecha, commits y fuentes certificadas. El contrato permite únicamente cambiar el literal del pin entre el commit de implementación y el HEAD de entrega; cualquier otro drift del contrato o de las fuentes protegidas bloquea la conexión.

El nonce se consume antes de conectar y su estado CONSUMED permanece aun si falla la conexión o la transacción. Un lock exclusivo compartido serializa publicación del recibo y consumo entre procesos. Un fallo de persistencia nunca abre la conexión; un recibo corrupto o un lock residual falla cerrado. No se devuelve un nonce consumido al estado pendiente. Un nuevo recibo revoca al anterior.

El mutador compara los ocho digests con el baseline inmediato dentro de su transacción inicial READ ONLY, antes de cualquier escritura. Conserva SERIALIZABLE, advisory lock, revalidación desde observador independiente, locks de tablas, write-set restringido, rollback total, idempotencia y auditoría estricta. El SQL Phase 48, el dominio histórico y el guard LOCAL_RESTORATION_REQUIRED permanecen sin modificaciones.

## Validación local

La evidencia final está en `phase48-authorization-tls-contract.cert.json`, con fuentes, escenarios, huellas y limpieza.

- 44/44 pruebas de contrato, parser, nonce, flags, destino y runner; 37 comprobaciones TLS dentro de la batería.
- 30/30 escenarios del contrato READ ONLY y 27/27 regresiones del runner sobre restauración aislada.
- 26/26 escenarios del mutador: los 22 anteriores más advisory lock ocupado, baseline inmediato incorrecto, cada uno de los ocho digests alterado y autorización completa correcta.
- Los escenarios 24–26 usan clientes conectados exclusivamente a loopback. Sólo los metadatos de versión 17.6/TLS son sintéticos para recorrer esas compuertas; el servidor real local es PostgreSQL 17.11 y las consultas, snapshots, locks, rollback y escritura atómica son reales en la base desechable.
- Certificado oficial verificado offline con credencial sintética, sin conexión de red ni lectura del archivo de credenciales productivas.
- Typecheck, build backend, build FrontendNuevo y git diff --check. FrontendNuevo informa únicamente el aviso de tamaño de chunks.
- Escaneo de objetos Git y fuentes versionadas: cero contenido del certificado productivo.
- Cluster desechable detenido y eliminado, conexiones locales cerradas y temporales crudos retirados. Credenciales y variables TLS temporales limpiadas en los procesos ejecutados.

Cero conexiones productivas, cero consultas health productivas, cero DDL, DML, auditorías y operaciones de secuencias productivas. No se leyó la credencial productiva. No hubo preflight productivo, migración, merge ni deploy.

**CONTRATO TLS COMPLETO — LISTO PARA NUEVO PREFLIGHT READ ONLY**
