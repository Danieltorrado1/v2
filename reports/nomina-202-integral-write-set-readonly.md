# Caso 202 / movimiento 192: alcance integral, auditoría READ ONLY

**Auditoría completada. Reparación NO ejecutada. Prototipo original BLOCKED y sin cambios.**

## Continuidad recuperada

El directorio inicial de la sesión fue `V2`, rama `fix/nomina-mutador-controlado-234`,
HEAD `0984122694651a836902638c61463a71d43e1a59`, con cambios ajenos al caso.
La inspección de `git worktree list` localizó el trabajo existente en
`.worktrees/nomina-turno-202-correction-preview`, rama
`prepare/nomina-turno-202-correction-preview`, HEAD
`1effd71930d23a6e3fc26e9f8792858c6ef5995a`.
Su reflog contiene la creación y una entrada `reset: moving to HEAD` del
2026-10-14 18:37:37 -0500, anteriores a esta reanudación. Esta sesión no ejecutó
reset, clean, checkout, descarte, cambio de rama, commit, merge, push ni despliegue.

Se encontraron cinco archivos no rastreados existentes: informe MD/JSON,
prototipo PreviewOnly, fixture y pruebas del caso. Se leyeron y conservaron.
El último punto válido del informe anterior fue 2026-10-14 23:46:47 UTC:
PENDIENTE, cantidad 1, total 97.800; cuenta 77/documento existente y revisión
REVISADO/v30. Constaban 14/14 pruebas, typecheck, build y diff-check aprobados.
No se repitieron esas etapas ni la simulación local del trigger.

## Evidencia nueva

Lectura correlacionada: **2026-10-14 23:59:16.519 UTC**.
Lectura adicional de alcance: **2026-10-15 00:00:25.537 UTC**
(14 de octubre, 19:00:25 en Bogotá).
Conexiones con `default_transaction_read_only=on`, transacciones READ ONLY,
verificación de `transaction_read_only=on` y cierre con ROLLBACK.
No se importaron servicios de negocio ni se llamaron endpoints de aplicación.

| Elemento | Resultado |
| --- | --- |
| Movimiento 192 | Cantidad 1; unitario/calculado/total 97.800; PENDIENTE; activo; seguridad social false |
| Familia del movimiento | ADICION_DEVENGO; motivo del trigger: TA_MODIFICADO |
| Periodo 3 | ABIERTO |
| Cuenta 77 | Empresa 15, contrato 24, periodo 3, externo 33; activa, PENDIENTE, total 97.800 |
| Detalles de cuenta 77 | Un único detalle, id 220; activo; movimiento 192 / turno 202 |
| Detalle 220 | 2026-09-08 a 2026-09-09; 2 días; valor diario 97.800; valor 97.800 |
| Otras cuentas del mismo ámbito | Ninguna, incluidas inactivas |
| Otros movimientos externos del mismo ámbito económico | Ninguno; solo 192 |
| Revisión operativa | id 20114; periodo 3 / empleado 837; REVISADO; versión 30; con revisor y fecha de revisión |
| Archivo generado | Objeto presente; PDF, 3.051 bytes; cuenta generado_at 2026-10-02 19:56:31.439 UTC |
| Archivo firmado | Sin referencia ni fecha de firma |
| Storage | Bucket privado; objeto creado/actualizado 2026-10-02 19:56:32.706 UTC |

Las auditorías encontradas de cuenta 77 son COBERTURA_CUENTA_SYNC y
COBERTURA_CUENTA_GENERATE, una de cada tipo en ambos repositorios; el total
registrado es 97.800. No se encontró auditoría de corrección del movimiento
en esta nueva consulta. El historial existente de cuenta 77 debe conservarse.

El objeto fue leído mediante GET autenticado directo, HTTP 200, a las
2026-10-14 23:59:42.879 UTC. Se preservó copia local sin transformar el PDF.
ETag idéntico al catálogo: `87c206854451cd5852be88c0ac0e42d1`.
SHA-256 del contenido:
`cf061de69f85976bd884439e12a58281bde4d32d2542b36e653a96a3a9c7d8a4`.
Se extrajo texto y se inspeccionó visualmente su única página renderizada:
cuenta 77, 02/10/2026, 2 días, valor día 97.800, total de línea 97.800,
TOTAL A COBRAR 97.800 y el mismo importe en letras. La línea de firma visible
está vacía; esto no pretende certificar ausencia de copias firmadas externas.

La única cuenta que referencia ese objeto es 77. La búsqueda de igualdad exacta
en las 25 columnas públicas text/varchar con nombres path/ruta/url encontró
solo `cobertura_cuentas_cobro_externas.generado_path` (una fila). No es una
búsqueda exhaustiva en JSON, auditorías, texto libre, otros esquemas o copias
descargadas. Las rutas reales y los datos personales no se reproducen aquí.

## Trigger y efectos indirectos

Se inspeccionaron triggers, funciones, constraints y reglas de las siete tablas
indicadas abajo. Solo existe un trigger de usuario en ese conjunto:
`trg_nomina_movimientos_invalida_revision`, habilitado O, AFTER INSERT/UPDATE/DELETE,
FOR EACH ROW. No tiene filtro de columnas ni condición WHEN. No hay reglas
en esas tablas. Los demás triggers son de integridad referencial.

El cuerpo productivo de `nomina_invalidar_revision_operativa()` confirma este
after proyectado sobre la fila **20114**, sin ejecutar el trigger:

| Campo de revisión | Before | After proyectado |
| --- | --- | --- |
| estado_revision | REVISADO | REQUIERE_REVISION |
| version_revision | 30 | 31 |
| revisado_por | Presente | NULL |
| revisado_at | 2026-10-01 01:18:55.684 UTC | NULL |
| invalidado_at | NULL | Timestamp de la transacción futura |
| motivo_invalidacion | NULL | TA_MODIFICADO |
| updated_at | 2026-10-01 01:18:55.684 UTC | Timestamp de la transacción futura |

`invalidado_por` no lo asigna esta función; actualmente está NULL.
No existe trigger de usuario posterior en revisión operativa, cuenta, detalle,
auditorías o historial. Actualizar columnas económicas sin cambiar IDs/FKs no
provoca las acciones ON DELETE CASCADE observadas en el catálogo.

**Efectos sobre secuencias:** el INSERT ... ON CONFLICT del trigger evalúa el
default `nextval('nomina_revision_operativa_id_seq')`, aunque actualice la fila
existente. Una ejecución futura también consumiría IDs de auditorías e historial.
Esos contadores son efectos persistentes y no se revierten con ROLLBACK.
Esta auditoría no invocó nextval ni DML. No se deben prometer cero efectos de
secuencias en un ensayo futuro sobre producción, aunque termine en ROLLBACK.

## Write-set integral propuesto, NO autorizado ni implementado

Resultado coherente sin regeneración: importes corregidos, cuenta PENDIENTE
sin documento generado vigente, PDF antiguo preservado como evidencia y revisión
REQUIERE_REVISION. No se presenta el caso como si tuviera ya PDF corregido.

| Tabla / fila | Cambio futuro necesario o propuesto |
| --- | --- |
| nomina_movimientos / 192 | cantidad 1→2; valor_calculado y valor_total 97.800→195.600. Añadir updated_by/updated_at como metadatos explícitos del alcance futuro. Unitario, fechas, tarifa, estado y seguridad social se conservan. |
| cobertura_cuenta_cobro_externa_detalle / 220 | valor 97.800→195.600 mediante UPDATE de esa fila. Ya tiene días=2 y diario=97.800; conservar id, enlaces y demás snapshot. No tiene columnas updated_by/updated_at. |
| cobertura_cuentas_cobro_externas / 77 | valor_total 97.800→195.600; generado_bucket, generado_path y generado_at → NULL; updated_by/updated_at explícitos. Mantener PENDIENTE, identidad/número de cuenta, ámbito y activo. Los tres campos firmado_* ya son NULL y deben permanecer así. |
| nomina_revision_operativa / 20114 | Los siete campos del efecto automático anterior; exactamente un UPDATE del movimiento produce v31. No restaurar REVISADO ni compensar la versión. |
| auditoria_eventos | Propuesta: cuatro eventos estrictos, uno por movimiento, detalle, cuenta con invalidación documental y revisión automática, con before/after, actor y el mismo run_id. |
| auditoria | Propuesta: cuatro filas correlacionadas, mismas cuatro entidades y run_id; fallo en cualquier inserción debe abortar la operación completa. |
| historial_cambios | Propuesta para conservar la trazabilidad habitual: snapshot before/after por cada una de esas cuatro entidades y diff de campos realmente modificados, incluida invalidación documental y revisión. Cantidad exacta depende del before completo y actor; debe fijarse en el manifiesto de ejecución futuro. |

**Mínimo de consistencia más el par de auditorías del prototipo: seis tablas**
(cuatro de negocio + dos de auditoría). `historial_cambios` no es un efecto
automático del trigger ni del prototipo: es la séptima tabla de la propuesta
integral de trazabilidad. Si se autoriza un kernel estricto sin historial, se
debe expresar esa excepción; no atribuirle silenciosamente el comportamiento
de `registerAuditEntry`. Para el flujo nativo de sincronización, historial sí
forma parte de su write-set efectivo por código.

Storage necesita **cero escrituras** para la variante de invalidación sin
regeneración. Conservar el objeto antiguo y su referencia exacta en evidencia
controlada/auditoría futura; retirar la referencia vigente de la cuenta evita
que el endpoint habitual siga emitiendo descargas de ese PDF. No elimina copias
externas ni revoca por sí solo URLs previamente emitidas. El endpoint de cuenta
usa URLs firmadas de 300 segundos; no se inspeccionaron URLs ya emitidas.
No se propone borrar, sobrescribir ni marcar mediante DML `storage.objects`.

Una futura regeneración sería otra etapa: nuevo objeto PDF y actualización de
referencias/fecha de cuenta más auditoría/historial. No está autorizada ni se
ejecutó en esta sesión. El estado resultante de generación también depende de
los documentos requeridos del externo; no se presupone GENERADA.

## Por qué no invocar los flujos existentes para esta corrección

En `cobertura.externos.service.ts`, `syncCoberturaCuentaCobroExternaRow` lee todos
los movimientos elegibles del externo y compara snapshots. Ante el nuevo total
resetea cuenta y referencias generado_*/firmado_*, luego
`rewriteCoberturaCuentaDetalle` hace DELETE de todos los detalles de la cuenta
y los recrea. En este caso eso borraría detalle 220 y generaría otra identidad,
consumiendo también la secuencia de detalles. No es equivalente al UPDATE mínimo
propuesto y tendría que autorizarse explícitamente si se eligiera esa vía.

`registerAuditEntry` escribe auditoria_eventos, auditoria e historial_cambios
(snapshot y diffs). Sus manejos de errores no ofrecen por sí solos la garantía
de auditoría estricta del kernel existente. La futura corrección controlada
necesitaría inserts estrictos correlacionados y rollback ante divergencias.

`generarCoberturaCuenta...` sincroniza y después construye/sube otro PDF y
actualiza la cuenta. La sincronización general del periodo también se invoca
desde recálculo general de nómina. Ninguno se invocó ni es necesario para el
write-set mínimo del caso. No se habilitó recálculo, worker, outbox o SYNC.

## Condiciones para una etapa posterior

Esta determinación no convierte el prototipo previo en ejecutable. Su alcance
original de tres tablas es insuficiente; ambos bloqueos permanecen válidos.
Antes de cualquier reparación se necesitarían autorización explícita del
alcance ampliado y política documental elegida; actor/run_id; confirmar SYNC
(seguía sin evidencia en la etapa previa); precondiciones exactas de los cuatro
registros; y validación local del nuevo alcance e idempotencia. No se generó
frase de autorización ni runner de aplicación en esta reanudación.

En una implementación futura habría que bloquear y validar esas cuatro filas
con un orden fijo, mantener un solo UPDATE al movimiento y rechazar drift de
importes, versión, revisión, estado, archivo o composición de la cuenta.
El after deberá satisfacer 2×97.800=195.600 en movimiento/detalle/cuenta y
revisión v31. La segunda ejecución deberá ser no-op con la misma evidencia.
La evidencia anterior y el prototipo local no certifican todavía ese alcance
ampliado; tampoco se presentan como prueba completa de salario/IBC productivo.

**Cierre:** solo SELECT/SHOW en transacciones READ ONLY, un GET del PDF y archivos
locales nuevos de auditoría. Cero DML/DDL productivo, cero solicitudes de mutación
a Storage, cero recálculos, cero regeneraciones y cero reparación.

Evidencia técnica: `nomina-202-account-trigger-readonly.json`,
`nomina-202-write-set-readonly.json`, `nomina-202-document-readonly.json`;
scripts diagnósticos nuevos bajo `tmp/nomina-202-*-readonly.cjs`.
El informe anterior, prototipo, fixture y pruebas permanecen intactos.
