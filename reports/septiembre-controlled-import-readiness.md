# Septiembre 2026: preview controlado, detenido

Base origin/main e250e64b0ee7b0d5d808b972718ffd5fe16d759e.
Rama aislada fix/focalizacion-septiembre-importacion-controlada.
No merge/deploy, no endpoint productivo invocado, writes=0.

## Fuente aprobada y estructura

data/focalizacion-septiembre-2026.xlsx, aprobado por el usuario.
SHA256 745e04bbf1cc51ed194e5514704c3441b2b9088e34fe513f2e8f2ecf9db566a3.
56,741,977 bytes, 8 hojas; seleccionada DETALLADO (espacio final).
Las hojas auxiliares se registran como IDs y hashes de nombres para no
publicar etiquetas potencialmente personales. No se publican celdas de personas.
Encabezados completos/grupos en el JSON sanitizado.
Columnas: consecutivo, municipio, institución, sede, modalidad;
TECHO primaria/secundaria/total; FOCALIZACION primaria/secundaria/total.
El encabezado dice 1 AL 30 DE SEPTIEMBRE; año2026 y rango completo provienen
de la confirmación expresa del usuario. No usar rango26..25 de Nómina.

697 filas físicas posteriores al encabezado: 4 vacías, 693 no vacías.
688 filas con identidad y 688 combinaciones canónicas únicas, sin duplicados.
Cinco filas adicionales sin identidad: 691,692,693,697,699.
La691 contiene totales y las demás no tienen los seis valores numéricos.
El parser oficial las omite; el preview estricto las conserva en auxiliary_rows
y exige revisión explícita de exclusión. No se descartan datos silenciosamente.

En las688 filas candidatas no se encontraron números negativos, fraccionarios,
texto en los seis campos numéricos ni totales diferentes de sus desgloses.
688 identidades sede/institución/modalidad resueltas en catálogos activos
del contrato24. Ningún catálogo creado ni modificado.
No hay columnas explícitas de DANE de institución/sede ni jornada.
El consecutivo permitió identificar sedes; NO certifica por sí solo DANE o jornada.
Se requiere un mapeo oficial aprobado a los códigos canónicos y jornada,
o confirmar expresamente su no aplicabilidad al modelo mensual.

## Diferencias independientes contra carga4

| Medida | Resultado |
| --- | ---: |
| Agosto | 687 |
| Septiembre candidato | 688 |
| Altas de combinación | 25 |
| Bajas de combinación | 24 |
| Sustituciones de modalidad | 24 |
| Combinaciones conservadas sin cambios | 265 |
| Cupos cambiados | 393 |
| Matriculados cambiados | 367 |
| Cualquier métrica cambiada | 398 |
| Instituciones afectadas | 108 |
| Sedes afectadas | 358 |

Altas/bajas por sede_id+modalidad_id, nunca nombres. Listas exactas de IDs
y antes/después numérico en septiembre-controlled-preview.json.
Los393 y367 se superponen; su unión398 no debe sumarse como760.
No transformar24 sustituciones de modalidad de focalización en movimientos
de Personal o novedades de Planilla.

## Bloqueos reales

25 filas candidatas pertenecen a instituciones83 y86:
filas491..499 y514..529.
Municipio de fuente resuelto:728; municipio de institución/sede en catálogo:734.
Esto no se resuelve usando automáticamente el municipio del catálogo ni
cambiando catálogos. Se requiere corroboración oficial de identidades/DANE
y decisión administrativa explícita sobre fuente o catálogo correcto.
No hay autorización para cambiar catálogos en esta rama.

Otros bloqueos:

- Revisión de las cinco filas sin identidad y exclusión explícita.
- DANE/jornada ausentes en fuente: aportar mapeo/aplicabilidad oficial.
- Actor para una eventual importación todavía no designado/validado.
- Runner de mutación NO implementado mientras el preview está bloqueado.

## Cobertura

Reglas vigentes por contrato/modalidad consultadas READ ONLY, en inicio/fin
y transiciones intrames. Cálculo con calculateCoverageFromRule oficial.
Agosto almacenado:662 puestos requeridos; propuesta aritmética septiembre:695;
diferencia+33. Detalle técnico rule_id/sede_id/modalidad_id en JSON.
Es estimación de cobertura, no contratación, traslado ni recálculo de Nómina.
No es certificación final por las25 discrepancias de municipio pendientes.

## Semántica temporal

Carga propuesta nueva, ID sin asignar; empresa15/contrato24, mes2026-09,
vigencia2026-09-01..2026-09-30. Carga4/687 vigencias de agosto inmutables.
Agosto termina08-31 y septiembre comienza09-01: no solapamiento para
combinaciones conservadas. Las24 bajas describen población mensual, no
órdenes de borrar agosto ni “huecos” que se deban rellenar copiándolo.
No copiar IDs, estados, auditorías, modalidad/cupos/matrícula de agosto.
focalizacion_vigencias.valor_anterior_id puede referenciar la versión anterior
sin modificarla. focalizacion_final es una proyección canónica mutable,
no el archivo histórico: cualquier actualización futura deberá respaldarse
y postvalidar que la consulta histórica de carga4 conserva687 filas.
No cerrar/extender/editar vigencias de agosto para esta transición.
La carga PROCESADO con688 vigencias sería seleccionable como Septiembre2026.
Nómina3 existe ABIERTO26-08..25-09, entidad independiente; no se toca.

## Auditoría del importador oficial

POST /api/cobertura/focalizacion/importaciones,
uploadHistoricalFocalizacionFile en cobertura.focalizacion.service.ts.
No certificado para esta operación:

- BEGIN/COMMIT existe, pero savepoints por fila capturan errores y permiten
  commit parcial del lote; no satisface rollback total ante una fila inválida.
- No advisory lock mensual en el importador general.
- Identidad actual contrato+hash+rango+estado; no protege explícitamente
  empresa+contrato+mes contra un archivo distinto/concurrencia.
- SIN_VIGENCIA puede persistir lote sin vigencias.
- resolveInstitutionAndSede/createInstitucion/createSede/ensureSedeModalidad
  pueden crear catálogos; prohibidos para esta operación.
- Almacenamiento externo anterior a commit no se revierte con rollback DB.
- registerAuditEntry captura errores; no garantiza auditoría obligatoria.
- La ruta aplica auth/tenant/permiso administrativo, pero el runner deberá
  validar separadamente actor activo, tenant15/24 y permiso requerido.
- Idempotencia de segunda importación productiva y rollback mutador NO
  certificados en este trabajo: sólo se prueban previews y SQL local aislado.

Por ello no se modifica el endpoint general ni se invoca para ensayar el archivo.
Se preparó runner separado estrictamente PreviewOnly, sin modo mutador:
src/scripts/preview-focalizacion-septiembre-controlada.ts.
Scope/rango/hash fijo; no acepta flags de mutación ni scope externo.
BEGIN REPEATABLE READ READ ONLY, SHOW read_only, advisory lock transaccional
(15,24092026), SELECT y ROLLBACK siempre, también ante error.
Health público obligatorio, OUTBOX/RECALC/worker apagados; SYNC=false tiene
evidencia manual de Render, no se infiere de un campo inexistente del health.
Identifica carga previa y distingue mismo hash de contenido conflictivo;
ambos quedan bloqueados para postflight, no se inserta nada.
Credenciales no se publican, campos de personas no se leen.
Actor opcional únicamente para comprobar preview; será obligatorio y tenant/RBAC
validado antes de implementar una futura transacción mutadora.
No existe propagación a outbox, Personal, Planilla o Nómina.

## Preview y digest

JSON: septiembre-controlled-preview.json.
status PREVIEW_DETENIDO, writes=0.
Contiene filas técnicas, razones, deltas, cobertura, digests y dependencias FK.
final_set_digest fija scope/hash/IDs/métricas/reglas calculadas del candidato.
Valor: 734aa3157bb4f66129d85531d81c67e1c328b204333f2972eef3d46ecb0bd7d8.
Digest agosto: 0dd7e60cb6a37299728dc610c52e83cd1024bbf87ad00dbaa91787957c20f2f8.
Digest no es frase de autorización ni permite ejecutar mutaciones.
Se revisan693 filas no vacías; sólo688 se comparan como combinaciones.
Se puede repetir el comando (sólo lectura):

    npx tsx src/scripts/preview-focalizacion-septiembre-controlada.ts --file <archivo_aprobado> --credentials-env <archivo_credencial_seguro> --output reports/septiembre-controlled-preview.json

No usar variables de producción para ejecutar tests. Las pruebas requieren
ENV_FILE sanitizado y PostgreSQL/PGlite aislado, jobs/flags apagados.

## Tablas propuestas y backup

Futuro allowlist, no ejecutado:
focalizacion_cargas, focalizacion_preliminar, focalizacion_vigencias
(sólo inserciones septiembre), focalizacion_final (proyección/postflight),
auditoria, auditoria_eventos, historial_cambios.
Auditoría propuesta focalizacion.septiembre.controlled-import con actor válido,
scope/hash/digest/conteos/backup identificado; cualquier fallo abortará todo.
Insertadas688 vigencias, actualizadas agosto0, rechazadas0 es condición futura,
no un resultado de importación.
No DML en instituciones/sedes/modalidades/cobertura_asignaciones, Personal,
Planilla, Nómina, outbox ni flags.

Exigir BACKUP COMPLETO de la base antes de autorizar una importación:
clientes pg_dump/pg_restore17.x compatibles con servidor17.x, formato custom,
schema/datos/secuencias/constraints/extensiones de todos los schemas necesarios.
Credencial de lectura vía servicio/passfile seguro; no URL con contraseña en CLI.
Guardar tamaño/SHA256/versión/hora/snapshot y log, revisar advertencias/exit0.
Inspeccionar listado pg_restore y restaurar previamente en PostgreSQL17 aislado;
comparar conteos/digests, FK, consultas históricas y rollback inducido.
Roles/tablespaces son globales: exportación aparte si necesaria para restauración
(pg_dump no incluye todo el cluster). ArchivoXLSX y storage existente requieren
respaldo separado; un dump de DB no respalda storage externo.

Backup mínimo parcial insuficiente: FKs entre final/preliminar/vigencias/cargas,
catálogos/contratos/usuarios/reglas/sede_modalidades y tablas de identidad;
otros consumidores como cobertura_asignaciones/auditorías deben conservarse.
Dump completo incluirá todo ello sin adivinar dependencias.
No se creó backup porque PreviewOnly no lo requiere.
No restaurar ni “rollback” global en producción automáticamente.
Referencia oficial: https://www.postgresql.org/docs/17/app-pgdump.html

## Pruebas y estado

Pruebas nuevas: parser numérico estricto, campos ausentes, delta/digest,
rechazo mutación, lock/readOnly, rollback inducido con PostgreSQL aislado,
repetición sin cambios, scope fijo y ausencia DML/propagación.
Las escrituras del test de rollback existen sólo en PGlite en memoria.
Backend typecheck y build: PASS. FrontendNuevo build productivo: PASS.
Suite enfocada: 137/137 PASS, cero FAIL/SKIP. Incluye las9 pruebas nuevas,
parser/importador, selector mensual, Instituciones, modalidad, periodización,
aislamiento administrativo y helpers de Personal/Planilla/Nómina.
FrontendNuevo/tests/instituciones-runtime.test.mjs: 4/4 escenarios PASS
sobre dist productivo servido localmente; sin mutaciones al abrir/cancelar.
Las pruebas no certifican propagación económica ni una importación real.
git diff --check debe pasar también sobre los archivos staged antes del commit.
No se certificó un importador mutador inexistente.
Archivo oficial original y workspace de Nómina intactos.
Decisión: PREVIEW DETENIDO — REQUIERE CORRECCIÓN.
