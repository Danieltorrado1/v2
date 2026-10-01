# MUTADOR DETENIDO — NO SEGURO PARA PRODUCCIÓN

La simulación sobre la restauración PostgreSQL 17.11 demostró un conflicto real en la proyección `focalizacion_final`. No se certificó una aplicación completa ni la idempotencia del mutador. El diagnóstico conserva PreviewOnly como modo predeterminado, acepta únicamente la simulación local y no contiene ninguna ruta de COMMIT ni de conexión productiva.

## Punto recuperado

Worktree: `C:/Users/CORE ULTRA/Desktop/V2/.worktrees/septiembre-importacion-controlada`.
Rama: `fix/focalizacion-septiembre-importacion-controlada`; HEAD conservado: `68ded0c`.

Estaban terminados el backup certificado, el preview certificado, la restauración para la prueba del mutador y la extracción del esquema en `tmp/local-schema.json`. Estaban guardados `tmp/setup-septiembre-local.cjs`, `tmp/probe-mutator-schema.cjs` y el cluster en `tmp/septiembre-mutator-cluster`. No había mutador implementado ni evidencia de simulación finalizada. El cluster estaba detenido, con un PID histórico residual; se arrancó el mismo directorio y no se repitió la restauración.

El historial previo se consultó en `history.jsonl` y en el rollout de la sesión `01a0f704-bbb7-7e02-9553-6fba04b0b4c9`. Se revisaron Git, logs, procesos y configuración local antes de la simulación.

## Artefactos certificados conservados

- Backup: `C:/Users/CORE ULTRA/Documents/EmpiriaBackups/focalizacion-septiembre-pre-import-retry-20261001T125631Z`.
- Dump SHA-256: `2e2f0608f609e2e3123e6bfdf56067bae08f11719cc3939ca73d0cdc387f0bc1`.
- Snapshot: `reports/septiembre-certified-snapshot.json`.
- Digest: `bfb2204f4a89b9fad18045a1a14ec128cbfe322a9bfc04a287c545f0e7b4f38e`.
- Excel SHA-256: `745e04bbf1cc51ed194e5514704c3441b2b9088e34fe513f2e8f2ecf9db566a3`.

Se verificaron sus hashes leyendo los archivos existentes. No se repitieron el backup productivo ni el preview certificado. No se sobrescribió el backup ni el snapshot.

## Evidencia local

Conexión fija: `127.0.0.1:55440`, base `septiembre_local`, usuario `local_verifier`. Se comprobaron versión 17.11, directorio exacto del cluster, escucha sólo en loopback, workers deshabilitados y ausencia de preload. Empresa 15, contrato 24, actor 12 activo con membresía de empresa y permiso cobertura/update. Advisory lock mensual `(15,24092026)` dentro de la transacción. Cero locks esperando.

El conjunto de 688 identidades del snapshot sigue existiendo en los catálogos restaurados. Las métricas del Excel concuerdan con el snapshot. El digest canónico del snapshot es exacto. Agosto conserva 687 vigencias y digest `0dd7e60cb6a37299728dc610c52e83cd1024bbf87ad00dbaa91787957c20f2f8`.

El índice existente es:

```sql
CREATE UNIQUE INDEX uq_focalizacion_final_clave
ON public.focalizacion_final USING btree (contrato_id, clave_sede_modalidad)
WHERE (activo = true)
```

Hay 663 combinaciones de septiembre que ya tienen proyección activa en agosto. La simulación insertó una carga local de septiembre y una fila preliminar/vigencia; al insertar su proyección activa con la clave existente, PostgreSQL produjo **23505 / uq_focalizacion_final_clave**. La transacción completa se revirtió.

No se cambiaron claves para eludir el índice, no se actualizaron ni desactivaron filas de agosto, y no se alteraron índices, catálogos o consultas de la aplicación. La proyección mensual y el selector deben revisarse conjuntamente antes de construir un mutador certificable; el listado actual permite unir por identidad aunque el preliminar sea distinto, por lo que añadir proyecciones mensuales también requiere comprobar la deduplicación y las referencias existentes.

## Rollback, postflight e idempotencia

- Run de rollback inducido: `fd52f362-931a-40b4-ac37-7e50aebbb952`.
- Se insertaron 344 preliminares/vigencias e historiales locales, junto con carga y ambas auditorías; se indujo la excepción `INDUCED_FAILURE_AT_344`.
- Run del conflicto de proyección: `d04a0989-c05a-444a-ae79-e3800fa82826`.
- Tras ambos rollback, los conteos y digests de las **224 tablas públicas** coinciden con el baseline, incluidos catálogos, auditorías y tablas de Personal, Planilla, Nómina, asistencia, novedades, turnos, cuentas e integración presentes en ese esquema.
- Septiembre: **0 cargas persistidas**. Agosto: **687 vigencias intactas**.
- Las seis secuencias usadas por el rollback inducido avanzaron al reservar IDs. PostgreSQL no revierte nextval con ROLLBACK. Se registró esa diferencia; no se certifica igualdad física de toda la base ni se manipularon secuencias para ocultarla.
- Auditorías de simulación revertidas con la transacción; los run_id quedan documentados en el reporte sanitizado, sin auditorías persistidas.
- Aplicación de 688 combinaciones, digest postimportación y segunda aplicación ALREADY_APPLIED: **no certificados**. Se detuvo la prueba ante el conflicto real; no hay una primera aplicación exitosa sobre la que demostrar idempotencia.

## Pruebas y checks

- Typecheck backend: PASS.
- Build backend: PASS.
- Build FrontendNuevo: PASS; aviso de tamaño de bundle preexistente.
- Suite relacionada: **69 PASS, 0 FAIL, 0 SKIP**. Incluye parser/domain, resoluciones aprobadas, restricciones tenant/contrato, digest/revocación, rollback, selector, Instituciones, RBAC y modalidad; las cuatro pruebas nuevas verifican el bloqueo local documentado y los argumentos que podrían intentar habilitar producción.
- Frontend Instituciones: **4 escenarios PASS** con Chromium y API completamente interceptada; sin mutaciones, errores de render ni requests inesperados.
- Logs: `tmp/septiembre-local-tests.log` y `tmp/septiembre-local-frontend-tests.log`.
- `git diff --check`: PASS para los cambios versionados; los archivos nuevos se verificaron por separado.

Los primeros intentos de tsx y del runner Node fueron bloqueados por spawn EPERM del sandbox; las ejecuciones autorizadas posteriores terminaron correctamente. No fue un fallo de las pruebas funcionales.

## Archivos y cierre

Nuevos: `src/scripts/certify-septiembre-mutator-local.ts`, `src/tests/focalizacion.septiembre-local-mutator.test.ts`, `reports/septiembre-local-preflight.json`, `reports/septiembre-local-mutator-certification.json` y este informe. Helper de inspección conservado en `tmp/inspect-septiembre-resume.cjs`.

Cluster local detenido mediante pg_ctl; sus datos y logs quedan conservados para una continuación posterior. Los otros procesos PostgreSQL se conservaron. Sin commit/push nuevos, porque la autorización previa de commit/push estaba condicionada a la certificación completa. Sin merge ni deploy. Workspace original de Nómina intacto; sólo se leyó su Excel oficial.

**Cero conexiones o escrituras productivas en esta continuación.** El estado actual de producción no se reconsultó; no se afirma una revalidación productiva nueva. No se generó una frase de autorización productiva.
