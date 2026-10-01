# Auditoría y corrección del selector de focalización

Base: origin/main 03e7692b6507ff563dd59995b0001342eb2f33d6.
Rama: fix/instituciones-focalizacion-selector.
Scope productivo: empresa 15, contrato 24. No merge ni despliegue.

## Evidencia productiva

Auditoría con PostgreSQL: BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY,
SHOW transaction_read_only=on, SELECT y ROLLBACK. Sin SQL mutador.
Snapshot sanitizado completo: instituciones-focalizacion-audit-readonly.json.
No contiene credenciales, documentos de trabajadores ni nombres personales.

Endpoint: GET /api/operacion/instituciones?contrato_id=24.
El selector anterior lee filter_options.periodos. Se reconstruyó exactamente
su consulta SQL desde el código desplegado; no se realizó una petición HTTP
autenticada al listado. El snapshot incluye las 687 opciones completas y sus
IDs/datos relacionales enriquecidos; distingue esta evidencia de una captura HTTP.

Origen anterior: focalizacion_vigencias JOIN focalizacion_final JOIN contratos.
SELECT DISTINCT fv.id, nombre_mes, año, mes no deduplica meses: fv.id es una
vigencia por institución/sede/modalidad, no la identidad mensual.
TO_CHAR(...,'TMMonth YYYY') depende del locale de PostgreSQL: August 2026.

Agosto:

| Fuente | Filas físicas | IDs distintos | Cargas canónicas |
| --- | ---: | ---: | ---: |
| focalizacion_vigencias | 687 | 687 | 1 |
| JOIN del selector anterior | 687 | 687 | 1 |
| focalizacion_final | 687 | 687 vigencias relacionadas | 1 |
| Selector corregido | 1 opción | 1 carga | 1 |

Carga canónica 4: empresa15, contrato24, PROCESADO, activo=true,
versión1, es_vigente=false, 2026-08-01..2026-08-31.
Vigencias168..854, por combinaciones de institución/sede/modalidad.
No es un JOIN multiplicador ni una clave React duplicada: cada opción tenía
un ID distinto. La unidad canónica del selector era incorrecta.

Septiembre de focalización: NO_EXISTE.
No hay cargas ni vigencias de septiembre, incluso buscando globalmente
fechas, etiquetas y todos los estados/contratos. focalizacion_final tampoco
tiene septiembre; preliminar/final del contrato24 apuntan a carga4 de agosto.
No existe una tabla canónica adicional de períodos operativos.
Detallado y la vista de cobertura no aportan una identidad mensual autónoma
que sustituya a cargas/vigencias. Inventario de fuentes en el snapshot.

Septiembre de Nómina SÍ existe, pero NO es focalización:
ID3, empresa15, contrato24, ABIERTO, activo=true,
2026-08-26..2026-09-25. ID4 (misma fecha, canónico3) e ID6
(2026-09-01..30) están ANULADOS/inactivos. Octubre abierto ID5 cubre
2026-09-26..2026-10-25. No se alteró ninguno.

## Corrección

- Una opción por focalizacion_cargas.id seleccionable, con vigencias activas
  del mismo contrato. Orden descendente de fecha/versión/ID.
- Deduplicación defensiva frontend por ID canónico y aislamiento empresa/contrato.
  Versiones distintas no se colapsan por nombre.
- Español explícito, independiente del locale; versiones se distinguen en etiqueta.
- Default: vigencia aplicable hoy o última válida disponible; no elige un
  mes futuro si hay uno válido anterior.
- URL focalizacion_id identifica la carga mensual. URL heredada periodo_id=168
  y focalizacion_vigencia_id=168 se resuelven a carga4, nunca a Nómina.
- Instituciones/cupos/matriculados filtran por fv.carga_id, conservando todas las
  combinaciones mensuales. El ID de fila se mantiene como focalizacion_vigencia_id
  para el ajuste individual existente (no se ejecutó).
- El middleware SaaS ignora exclusivamente el periodo_id heredado del GET
  del listado de Instituciones. Nómina mantiene su validación original.
- Abrir el modal sin fecha no consulta Nómina. Elegir fecha usa el nuevo
  GET /api/operacion/instituciones/nomina-periodo?contrato_id=24&fecha_efectiva=YYYY-MM-DD.
  Resuelve empresa autoritativa del contrato, tenant y único período activo ABIERTO
  aplicable; devuelve null si no existe y 409 si hay ambigüedad.
- No se usa getNominaPeriodos/listNominaPeriodos: ese GET llama a
  ensureCurrentNominaPeriods y puede crear períodos. La resolución nueva sólo SELECT.
- Cambiar la fecha invalida el preview anterior antes de cargar otro período;
  el formulario recibe sólo el nomina_periodo_id resuelto.
- Ausencia de período aplicable se informa dentro del modal después de elegir
  fecha, nunca al cargar el listado. Abrir/cancelar no persiste cambios.
- Se eliminó el bypass de tenant cuando contratoIds estaba vacío: debe existir
  autorización de contrato o empresa; no se modificaron permisos productivos.

## Creación controlada de septiembre: PREPARADA, NO EJECUTADA

Fuente autorizada: importación oficial de focalización del módulo Cobertura;
servicio src/modules/cobertura/cobertura.focalizacion.service.ts.
No usar nómina_periodos ni clonar IDs o agosto para inventar septiembre.

1. Obtener archivo oficial de septiembre aprobado y validar localmente la
   plantilla/parseWorkbookRows. Faltan archivo autoritativo validado, cantidades
   oficiales por sede/modalidad, fechas efectivas confirmadas, reglas de cobertura
   vigentes, resolución de sedes/modalidades y autorización expresa del responsable.
2. Preparar manifiesto local: contrato24/empresa15, fechas, SHA-256 del archivo,
   conteos de filas/duplicados/conflictos, reglas y observaciones.
3. Probar el archivo y la idempotencia en PostgreSQL local/restaurable.
   Consultar READ ONLY cargas solapadas y ajustes manuales antes de autorizar.
4. Sólo con aprobación posterior: flujo oficial POST
   /api/cobertura/focalizacion/importaciones (archivo + contrato_id), nunca SQL manual.
   La implementación ya usa SHA-256 + contrato + rango + estados activos
   para reutilizar importaciones idénticas. Verificar esos controles antes de ejecutar.
5. Si una importación necesita corrección, consultar su reporte; un reproceso
   POST /api/cobertura/focalizacion/importaciones/:id/reprocesar requiere una
   autorización separada. No usar reproceso de agosto para fabricar septiembre.
6. Verificar posteriormente READ ONLY carga/vigencias/selector, estado y versión,
   sin modificar Nómina ni modalidad.

Impacto esperado del flujo oficial: almacenamiento del archivo, carga/preliminares,
versionado de focalizacion_vigencias, sincronización de focalizacion_final,
posible cierre de vigencias solapadas, cobertura/alertas y auditoría.
El volumen sólo puede calcularse con el archivo oficial; no asumir 687 filas.
Este plan no es autorización para importar, reprocesar o recalcular.

## Certificación

- npm run typecheck: PASS.
- npm run build (backend): PASS.
- npm run build --prefix FrontendNuevo: PASS (advertencia de tamaño de chunk).
- Suite enfocada Operación/focalización/periodización/modalidad y presentación:
  58 tests, 57 PASS, 1 FAIL preexistente, 0 SKIP.
- SaaS/RBAC, formulario canónico y Planilla/filtros: 73/73 PASS.
- node tests/instituciones-runtime.test.mjs, cwd FrontendNuevo:
  cuatro escenarios PASS sobre el dist productivo, AppRouter y providers reales:
  ADMIN agosto solamente, ADMIN agosto+septiembre, default septiembre y GESTOR.
  Todos con fixtures locales/intercepción de cada petición API, sin producción.
  Comprueban opciones únicas, aislamiento, español, URL heredada/canónica,
  cupos, acción/preview, fecha distinta cambia payroll3 a payroll5, ausencia de
  período se muestra sólo en modal, cancelación conserva URL/filtros/paginación.
  Cero POST/PATCH/otras mutaciones, HTTP500, errores de consola/render o bucles.
- git diff --check: PASS.

Las primeras pruebas ampliadas encontraron entorno ausente. Se completó con
.env.selector-test sanitizado e ignorado, DATABASE_URL apuntando a localhost:1
(inaccesible), sin credenciales productivas, jobs/outbox/sync/recalc apagados.
Las pruebas de SQL usan PGlite aislado en memoria, no esa conexión.

Fallo baseline individual:
src/tests/nomina.periodo.mapper.test.ts:
"mapNominaPeriodo conserva campos, fechas, nulls y contrato".
Mensaje: Expected values to be strictly deep-equal.
Actual agrega anulado_at:null, anulado_por:undefined,
motivo_anulacion:undefined, periodo_canonico_id:undefined.
Esperado omite esos cuatro campos. Causa: mapper incluye metadata de anulación,
expectativa antigua no la contempla.
Reproducido individualmente en main limpio 03e7692 y esta rama; mismo
test/mensaje/esperado/actual/causa. Clasificación PREEXISTENTE_IDÉNTICO.
Prueba SHA-256 (ambos):
AEA6E4B66AE5FA09483B0A71C68E58C0B3BE695055ABD2E1A04613D0713E2826.
Mapper src/modules/nomina/domain/nomina-periodo.mapper.ts (ambos):
EF2166A0B94A8DFC355AC3FD9642269288B7F1321AA3DA82C5EF3D374207D049.
No se modificó ni se omitió esta prueba.

Todos los cambios están en el worktree instituciones-focalizacion.
Workspace original fix/nomina-mutador-controlado-234 no modificado.
Ninguna escritura productiva, creación de septiembre, migración, seed,
guardado de modalidad, cambio de flag/permiso o recálculo.
No merge a main ni deploy.

Decisión: SELECTOR CORREGIDO — SEPTIEMBRE REQUIERE CREACIÓN CONTROLADA.
