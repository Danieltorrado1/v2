# MODELO TEMPORAL CORREGIDO Y MUTADOR LOCAL CERTIFICADO — REQUIERE INTEGRACIÓN

Empresa 15, contrato 24, septiembre 2026. Certificación exclusivamente local. Sin conexiones ni escrituras productivas, sin migraciones productivas, merge o deploy. No se emite autorización productiva.

## 1. Causa y semántica demostrada

`uq_focalizacion_final_clave` exige unicidad de `(contrato_id, clave_sede_modalidad)` para filas activas, sin mes. Esa garantía corresponde a una **proyección actual de la combinación**, no a un histórico mensual. La simulación anterior intentaba insertar nuevamente las 663 combinaciones comunes de agosto y septiembre como proyecciones activas independientes y produjo 23505.

Evidencia del modelo existente:

- `src/modules/cobertura/cobertura.focalizacion.service.ts`, `syncFocalizacionFinal`: selecciona la última vigencia activa de sede/modalidad, conserva el ID de la proyección y actualiza sus referencias a carga/preliminar, fechas y métricas. No inserta una fila por mes cuando la combinación ya existe.
- `sql/phase-22-1-focalizacion-historica-importacion.sql`: crea `focalizacion_vigencias` con carga, preliminar, fechas, métricas, reglas, origen y valor anterior; a `focalizacion_final` sólo le añade campos de proyección. No redefine ésta como histórico mensual.
- El preflight de esa fase detecta duplicados de contrato/sede_modalidad **sin agrupar por carga**.
- Los FK de `cobertura_asignaciones` y `focalizacion_novedades` apuntan al ID estable de la proyección; el segundo tiene ON DELETE CASCADE. Eliminar/recrear proyecciones rompería referencias o perdería novedades.
- Cobertura, vistas SQL, alertas y validadores consultan la proyección activa. Personal/Planilla/Nómina resuelven identidad por esos IDs estables; su temporalidad procede de asignaciones, contextos y períodos.
- El selector mensual consulta cargas/vigencias; las métricas históricas de Instituciones proceden de vigencias.

**Conclusión:** A es la semántica canónica demostrada. Antes de la corrección había mezcla C en la simulación local y en lectores históricos que reutilizaban nombres, actividad u ordenación de la proyección actual. B no está respaldada por el importador operativo ni sus consumidores.

El origen exacto del DDL inicial del índice heredado no está en las fases SQL encontradas: se verifica su definición real en la restauración certificada. No se inventó una migración para atribuirle otra semántica.

## 2. Consumidores auditados

Inventario reproducible: `reports/septiembre-temporal-consumer-inventory.json`, con 81 archivos, hashes y líneas de referencia; 34 módulos backend y 11 archivos frontend. Esquema, índices, constraints, triggers, FK, funciones y vistas restauradas: `reports/septiembre-temporal-schema-audit.json`.

| Grupo | Consumidores y supuesto | Resultado |
|---|---|---|
| Importación | cobertura.focalizacion.service; reglas/domain; preliminares; ajustes manuales | Proyección última por combinación, historial en vigencias. Se conserva ID/clave y se busca por sede/modalidad aunque falte vínculo opcional a sede_modalidades. |
| Cobertura actual | cobertura.service; dashboard; validator; cobertura-asignacion.service; alertas.generator | Una proyección activa por combinación. Las bajas quedan inactivas, sin borrar filas ni referencias. |
| Cobertura por fecha | resumen/dashboard/faltantes/sobrecobertura | Ahora usa vigencia/preliminar del día, incluyendo las combinaciones retiradas de la proyección actual. Sin fecha explícita conserva la vista actual. El detalle por ID sin fecha continúa siendo detalle de la proyección. |
| Instituciones/selector | operacion.instituciones.service; focalizacion-selector; operacion.service | Mes por carga/vigencias; nombres históricos por preliminar; actividad por vigencia. Join lateral elige a lo sumo una proyección por identidad. El listado de catálogo puede mostrar estados inactivos. |
| Personal y vinculaciones | personas.master.service; vinculaciones.service/personal.service; personalMeta26DryRun/helpers; contexto-laboral.service | FK/identidades y fechas de asignación. Se preservan IDs de proyección y todas sus tablas de datos; no se propagan cambios. |
| Planilla/Nómina | nomina.service; nomina.procesos; cambios-operativos; repositorios poblacion/novedad; contexto laboral | Períodos/asignaciones/contextos, nunca interpretar carga como nomina_periodo. Se confirma que septiembre operativo se cruza por fecha con nomina_periodo_id=3. Sin escrituras económicas. |
| Alcance/configuración | users; municipal-scope; alertas.visibility; empresa-configuracion | Identidades/FK estables y opciones activas. No cambios en membresías, tarifas o permisos. |
| Logística | logistica.service | Identidad por asignación/proyección. Sin modificar sus tablas. |
| Frontend | CoberturaDashboardPage y coberturaApi; página/API/types de Instituciones; PersonalPage/Drawer/ContractPersonalPage; tipos y vinculacionesApi | Carga mensual, fecha o ID estable según la API. No se cambian flujos ni se mezclan IDs operativos con Nómina. |
| Herramientas históricas | scripts de auditoría, reparación territorial, importaciones personales y purge/smoke | Se inventarían duplicados si final se convirtiera en histórico. No se ejecutaron herramientas mutadoras ajenas; algunas sumas legadas sin activo no son una consulta mensual y deben tratarse como diagnósticos de su versión. |
| SQL legado | generar_focalizacion_final; aplicar_novedad_focalizacion; tres vistas | Generador por preliminar y novedades anteriores al dominio de vigencias: no tienen llamadas desde el código operativo auditado y no se invocaron. No son el publicador mensual ni una alternativa para eludir el índice. Su uso externo directo no se certifica. Las vistas activas mantienen su semántica actual. |

Se inspeccionaron también los dos triggers del alcance: validan que el contrato aplique cobertura. No hay trigger de estas tablas que propague la publicación a Personal/Planilla/Nómina. La comparación de todas las tablas públicas confirma que no ocurrió propagación.

## 3. Alternativas comparadas

| Alternativa | Tablas/consultas | Agosto y consumidores | Rollback/idempotencia | Decisión |
|---|---|---|---|---|
| 1. Proyección actual, publicación atómica | Nuevas carga/preliminares/vigencias; UPDATE de proyecciones comunes, INSERT de altas, inactivación de bajas; historial y ambas auditorías. Lectores históricos usan vigencias/preliminares. | Agosto permanece íntegro en sus tres tablas históricas. Se conservan IDs/keys/FK; Cobertura actual tiene 688 filas; Instituciones y Cobertura histórica muestran agosto completo. Tablas personales/económicas intactas. | Una transacción; fallos revierten datos. Segunda aplicación verifica estado, digest, auditoría y proyección sin escribir. | **Elegida**, respaldada por el servicio y fase existentes. No eliminar/recrear IDs. |
| 2. Final como histórico por carga o rango | Requiere redefinir unicidad, hacer dependientes del mes las consultas actuales, agregaciones, vistas, validadores y asignaciones, y especificar a qué fila temporal apunta cada FK. | Multiplicaría las 663 identidades en consumidores sin mes, alteraría asignaciones y sumas; las bajas/referencias exigirían reglas nuevas. Agosto podría conservar filas, pero perder compatibilidad funcional. | Down bloqueado cuando existan dos meses y claves duplicadas; rollback/idempotencia requieren otro modelo completo. | Descartada: cambia el modelo, no corrige el mutador existente. |
| 3. Diseño ya previsto en phase-22-1 | Historial en vigencias/preliminares y una proyección por combinación; ajustes manuales también sincronizan esa proyección. | Compatible con las fechas, el selector mensual y los FK estables. No necesita ampliar final para duplicar meses. | Mismas garantías transaccionales que 1; hay que completar retiro de bajas y lecturas históricas. | Adoptado como fundamento de 1. No se usa el generador SQL legado por preliminar. |

## 4. Implementación y garantía de unicidad

`septiembre-monthly-publisher.ts` es un publicador **exclusivamente local**: PreviewOnly por defecto, confirmación local para mutar, comprobación del servidor/puerto/base/directorio restaurado y PostgreSQL 17.11, actor 12 con empresa/contrato/RBAC, fechas/digest exactos, advisory lock y locks de escritura sobre las tablas del alcance. SHA del Excel y dump se verifican en el runner.

Dentro del lock se revalidan agosto, septiembre inexistente o aplicación exacta, las 688 identidades, las reglas en ambos extremos del mes y ausencia de transiciones intrames. Antes del COMMIT se comprueban conjunto resultante, proyección, auditorías estrictas y digests protegidos. No se llama al importador general, a RPC legados ni a sincronizadores económicos.

- 663 proyecciones se actualizan **conservando sus IDs y claves existentes**.
- 25 combinaciones nuevas se insertan con clave técnica `sede:<id>|modalidad:<id>`.
- 24 bajas sólo dejan de pertenecer a la proyección activa; sus filas se conservan y sus antes/después se registran en historial.
- El vínculo `sede_modalidad_id` es nullable y no es la identidad certificada. Las 25 altas carecen de ese vínculo en el backup. Se conserva NULL sin crear ese catálogo; tienen municipio/institución/sede/modalidad resueltos. El importador general ahora encuentra la proyección por sede/modalidad y conserva su clave aunque posteriormente se establezca el vínculo opcional.
- No se cambian claves de las 663 combinaciones para eludir colisiones, no se elimina el índice y no se usa ON CONFLICT DO NOTHING.
- El postflight confirma cero duplicados de identidad activa y rechaza también inconsistencias nulas usando IS DISTINCT FROM.

No hay fase SQL nueva, migración up/down ni cambio de esquema. Se comparó la firma de índices antes/después: idéntica.

## 5. Simulación local y resultados

PostgreSQL 17.11, loopback 55440, cluster `tmp/septiembre-mutator-cluster`, sin preload/workers. Base principal `septiembre_local`; restauración limpia para fallos `septiembre_temporal_rollback`; baseline adicional de sólo lectura `septiembre_temporal_baseline` para comparar DTO históricos. Todas derivan del dump certificado, con la misma lista de exclusiones locales de Vault/hooks ya documentada. Backup no repetido ni sobrescrito.

Evidencia principal: `reports/septiembre-temporal-local-certification.json`.

| Validación | Resultado |
|---|---:|
| Cargas de septiembre | 1 |
| Combinaciones/preliminares/vigencias/proyección activa de septiembre | 688 |
| Duplicados y solapamientos | 0 |
| Cinco filas excluidas insertadas | 0 |
| Puestos | 695 |
| Altas / bajas / cambios modalidad | 25 / 24 / 24 |
| Agosto por Instituciones y Cobertura histórica | 687 |
| Ambos meses en Instituciones | 1375 |
| Tablas protegidas sin cambios | 217 |
| Tablas públicas comparadas en rollback | 224 |

Digest postflight recomputado desde IDs, métricas, regla, cobertura y fila almacenadas: `bfb2204f4a89b9fad18045a1a14ec128cbfe322a9bfc04a287c545f0e7b4f38e`.

Agosto mantiene la carga 4 y sus 687 vigencias, digest `0dd7e60cb6a37299728dc610c52e83cd1024bbf87ad00dbaa91787957c20f2f8`. Sus cargas/preliminares/vigencias completos permanecen iguales, no sólo las métricas seleccionadas. DTO histórico y resumen de Instituciones/Cobertura de agosto idénticos tras la publicación, incluido el orden histórico. Puerto Rico 734 y Cubarral 861 forman parte del conjunto exacto validado. Las exclusiones 691, 692, 693, 697 y 699 no están insertadas.

Carga principal local: **8**; run_id **bf0cde03-ebde-4304-b868-0edfd7a54575**. No es un ID de Nómina ni un ID productivo. Un evento en cada auditoría, actor 12, empresa 15/contrato 24, run_id y digest; historial por proyección afectada. La segunda ejecución devuelve ALREADY_APPLIED, reutiliza el mismo run_id y no cambia tablas, auditorías **ni secuencias**.

Las siete tablas que cambian son cargas, preliminares, vigencias, proyección, historial y las dos auditorías. Las otras **217 tablas públicas** mantienen conteos y digests, incluyendo catálogos/sede_modalidades, Personal, Planilla, Nómina, asistencia, novedades, turnos, cuentas e integración. No se asignan personas ni se recalculan importes.

## 6. Rollback y secuencias

En la restauración limpia se probaron tres fallos: tras 344 filas completas; tras escribir la primera auditoría; tras el postflight completo. Cada rollback conserva los datos de las 224 tablas públicas exactamente iguales al baseline, incluidas proyecciones y filas retiradas.

**Política de secuencias resuelta explícitamente:** son identificadores técnicos, no contadores de filas ni numeración contable. PostgreSQL no revierte nextval. Se aceptan huecos y sólo avance; no se ejecuta setval, no se reciclan IDs abandonados y no se promete igualdad física de secuencias tras una transacción fallida. La siguiente publicación en la base limpia usa carga 11, superior a los IDs reservados durante los fallos, y produce el mismo conjunto certificado. La idempotencia sí conserva las secuencias, porque no reserva ningún ID.

Se probaron además dos corrupciones temporales, revertidas: vínculo de preliminar a vigencia NULL y municipio de proyección NULL. Ambas detienen el postflight. La sincronización del importador general se ejecutó localmente sobre una nueva proyección con vínculo opcional NULL: conservó ID/clave y no creó un duplicado. Tras esas pruebas, todas las tablas y secuencias permanecen iguales. Evidencia: `reports/septiembre-temporal-postflight-hardening.json`.

No hay migración que revertir. El rollback de código no implica borrar la historia mensual; la prueba de transacción abortada revierte también los cambios de proyección.

## 7. Pruebas

- Backend typecheck y build: PASS.
- FrontendNuevo build: PASS; aviso de tamaño de bundle, sin error.
- Suite relacionada final: **188 PASS, 0 FAIL, 0 SKIP**. Parser/importador, reglas y cobertura temporal, selector/Instituciones, modalidad, RBAC, tenant/contrato, contexto laboral, repositorios Nómina, retiro efectivo, rollback/idempotencia y pruebas de la certificación real.
- Frontend Instituciones: **4 escenarios PASS** en Chromium con API interceptada; sin mutaciones, errores de render o requests inesperados.
- Checks de whitespace Git, incluidos archivos nuevos staged: PASS.

Se corrigió una aserción obsoleta de cobertura.temporal que esperaba v.fecha_fin: el HEAD inicial ya usaba effectiveRetirementSql. Se verificó el helper vigente y se añadieron sus pruebas; no se modificó la lógica de retiro de negocio. También se corrigieron el alias SQL reservado del primer postflight y la ordenación histórica por nombres del preliminar. Los intentos y fallos de preparación permanecen en logs; la validación final terminó sin fallos.

## 8. Archivos y operación posterior

Cambian servicios de focalización, Cobertura e Instituciones; sus pruebas de selector/cobertura temporal; se añade el publicador local y sus pruebas. Runners reproducibles: `src/scripts/certify-septiembre-temporal-local.cjs`, `restore-septiembre-temporal-local.cjs` y `verify-septiembre-temporal-local.cjs`. Se conserva también el diagnóstico anterior y su evidencia de bloqueo como antecedente.

Para una restauración local nueva: build backend, restaurar la base limpia con el runner y ejecutar la certificación con `.env.certified-test.local`. Para el estado conservado se admite `--resume-applied`, usando la evidencia previa y el baseline restaurado, sin repetir una publicación completada. Estos runners tienen conexiones locales fijas; no habilitan producción.

Rama única autorizada: `fix/focalizacion-septiembre-importacion-controlada`. Commit/push se realizan sólo después de todos los checks. No merge, deploy, migración/importación productiva ni frase de autorización. El código debe integrarse y revisarse antes de considerar cualquier habilitación productiva; esta certificación no autoriza ese paso.

El cluster se detiene al cerrar la tarea y se conservan sus tres bases, logs y datos. Workspace original de Nómina y sus cambios permanecen intactos; sólo se lee el Excel de septiembre. El snapshot y el backup certificados se conservan. No se revalidó producción en esta continuación porque no se abrió ninguna conexión a ella.
