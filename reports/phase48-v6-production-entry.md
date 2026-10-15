# Entrada productiva V6 — certificación exclusivamente local

Rama exclusiva: `fix/phase48-v6-production-entry`. Base conservada: `4588fa2e00fafc9ceb396c3f13c18297bc6350a1`; mutador histórico anterior: `d138214538e6f1e2ff727b006a589058b6e7a47f`.

La entrada independiente `src/scripts/phase48-v6-production.ts` implementa PreviewOnly, PreflightOnly y Mutate. La reversión tiene entrada separada en `phase48-v6-production-rollback.ts`. No se ha ejecutado ninguna de estas entradas contra producción. La autorización permanece REVOKED; no se publica ninguna solicitud ACTIVE.

El contrato `phase48-scoped-v6` liga la población dinámica y sus IDs/digests, dos lecturas independientes, esquema/definiciones/secuencias críticas, tablas protegidas, archivos históricos, decisiones salariales, versiones Git y evidencias. La población certificada de este trabajo es 740; la entrada anterior de 730 queda rechazada. No se convierte 740 en constante general del algoritmo: la operación debe coincidir exactamente con la población del preflight sellado.

Evidencias fijadas:

- Backup: `7b899f07210f09fbebb0facf1ba9b356510c2316d26a0e521a42639ba135b16c`.
- Preflight certificado previo: `4fe345365f5df29d8c6cdb3f911dc15a140cb184ad5c3ede6d4e01ee4dbe9732`.
- Solicitud bloqueada: `cb8d2db7218d138c5b3deeb9fbf6d423f456ec20ac2895f14db0224e0fb34d66`.

La transacción incluye Phase 48, Albeny, Dary y cierre 1203 a 2026-08-31 conservando activo=true. Preserva economía, períodos 4/6 anulados, siete versiones archivadas y revisiones salariales. Usa SERIALIZABLE, advisory lock 15/2449, locks de tablas/secuencias, observador independiente, cuatro auditorías emparejadas y rollback completo. Recibos atómicos, preparación autenticada y nonces persistentes permiten detectar reutilización y recuperar idempotencia después de un reinicio. La reversión exige frase/nonce propios, recibo firmado y postimages exactos; conserva auditorías y no rebobina secuencias.

La configuración productiva verifica rama limpia y pin del código, hashes de archivos de evidencia, CA/TLS e identidad antes de aceptar operaciones. La clave persistente debe ser privada y estar fuera del repositorio. Mutate requiere su gate explícito y aprobación literal fresca (máximo 15 minutos); no existe aprobación automática. La confirmación de ventana sin DDL es una precondición operativa: un administrador todavía podría reemplazar funciones después de la última comprobación.

## Reanudación conservadora

Se encontraron ocho archivos de implementación/pruebas y un script de certificación sin commit, junto con recibos y un TAP interrumpido. No había modificaciones rastreadas. El reflog sólo mostraba la creación/cambio a la rama objetivo sobre la base indicada. No se cambió de rama, ni se usó reset, clean, stash o checkout destructivo.

El TAP anterior conservaba cuatro pruebas aprobadas, hasta AFTER_ALBENY, sin cierre de suite. No había proceso de pruebas activo; el clúster local estaba detenido tras una interrupción. `release/resume-phase48-v6-local.ps1` recuperó ese mismo clúster y excluyó exactamente las cuatro pruebas terminadas. Los intentos de arranque y sus logs se conservaron: el primero falló por el token restringido del sandbox; el segundo inició PostgreSQL pero detectó un ExitCode nulo de Start-Process. Se corrigió la comprobación usando pg_ctl status y se continuó en ese servidor local ya iniciado.

No se descartó ningún archivo. Los recibos y logs completos permanecen en `tmp/phase48-v6-local/`, ahora ignorado para conservarlos sin publicar su contenido. El clúster queda detenido y preservado. Los dos TAP sanitizados y sus hashes se publican en `reports/phase48-v6-proofs/`.

## Alcance de validación

Fixtures sintéticos de PostgreSQL 17.11 exclusivamente en 127.0.0.1:55470, con guard de red/SQL y bloqueo de lectura de .env/CA productiva. La prueba inicial ya aprobada cubre COMMIT de 740, conservación económica/archivos, auditorías, idempotencia y reversión. La continuación cubre los restantes fallos de transacción/auditoría, drift de población/identidades, hashes y commits incorrectos, expiración/revocación/reutilización de nonce, concurrencia, publicación atómica y controles de flags/preparación.

Resultado: 49/49 pruebas aprobadas (4 conservadas y 45 pendientes ejecutadas), cero fallos. Guard: production_connections=0, production_writes=0, forbidden_attempts=0. Typecheck, build del backend y git diff --check aprobados. El TAP reanudado se exportó a UTF-8 para revisión; su original permanece intacto. No se repitieron las suites históricas certificadas ni se modificó el workspace de Nómina. Estos fixtures no acreditan una nueva lectura ni ejecución productiva, ni sustituyen un preflight productivo fresco. No se hizo merge ni deploy.

Mutador V6 certificado: `51c22eabd3ff717bc5b355d95d3a16b4382b010c`. El readonly_runner_commit es el HEAD limpio que contiene ese pin. La validación offline posterior comprueba ambos sin abrir conexiones.
