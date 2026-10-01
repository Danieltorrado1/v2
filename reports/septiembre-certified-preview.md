# Focalización septiembre certificada — requiere backup productivo

Certificación del preview únicamente. Empresa 15, contrato 24, vigencia 2026-09-01 a 2026-09-30. PreviewOnly, certified=true, writes=0. No se autoriza ni ejecuta importación, backup, endpoint POST, SQL mutador, migración, seed, recálculo, cambio de flags, merge o deploy.

## Fuente y conjunto

Excel oficial: data/focalizacion-septiembre-2026.xlsx. SHA-256 sin cambios:
`745e04bbf1cc51ed194e5514704c3441b2b9088e34fe513f2e8f2ecf9db566a3`.

El archivo se vuelve a parsear íntegramente en cada ejecución; las filas se resuelven contra consultas productivas READ ONLY actuales. Los conteos anteriores se usan exclusivamente como expectativas de validación, no como entrada del cálculo. El preview histórico sólo sirve de ancla para comprobar los digests protegidos de agosto y Nómina.

| Medida recalculada | Resultado |
| --- | ---: |
| Combinaciones operativas candidatas | 688 |
| Combinaciones resueltas | 688 |
| Bloqueadas | 0 |
| Identidades pendientes | 0 |
| Duplicados sede/modalidad | 0 |
| Exclusiones no operativas | 5 |
| Agosto carga 4 | 687 |
| Altas respecto de agosto | 25 |
| Bajas | 24 |
| Cambios de modalidad | 24 |
| Cambios de cupos | 393 |
| Cambios de matriculados | 367 |
| Unión de cambios métricos | 398 |
| Combinaciones conservadas sin cambios | 265 |
| Instituciones afectadas | 108 |
| Sedes afectadas | 358 |
| Puestos estimados agosto | 662 |
| Puestos estimados septiembre | 695 |
| Variación provisional | +33 |

Altas/bajas por sede_id+modalidad_id; cupos y matrícula comparan los seis campos numéricos originales; las dos categorías se superponen. Regla de cobertura oficial por modalidad/contrato, válida durante todo septiembre y sin transiciones intrames. Los puestos son una estimación operativa, sin propagación a Personal, Planilla o Nómina y sin recálculo económico.

## Resolución Cubarral aprobada

Regla limitada al texto normalizado CUBARRAL, empresa 15, contrato 24 y filas 559–562. Municipio destino 861 / SAN LUIS DE CUBARRAL. No es un alias global de catálogo y no se modifica el texto del Excel.

| Fila | Institución ID | Sede ID | Modalidad ID | Municipio |
| --- | --- | --- | --- | --- |
| 559 | 97 | 482 | 3 | 861 |
| 560 | 97 | 482 | 2 | 861 |
| 561 | 97 | 483 | 3 | 861 |
| 562 | 98 | 484 | 3 | 861 |

Validaciones obligatorias: nombres normalizados de institución y sede; pertenencia al catálogo del contrato; institución y sede ambas con municipio 861; historial carga 4 de agosto con los mismos IDs y municipio; focalizacion_final concordante. Esta proyección conserva las referencias de carga 4 / IDs 711–714. La consulta de municipios referenciados por instituciones y sedes del contrato, incluidos catálogos inactivos, devuelve un único candidato entre CUBARRAL y SAN LUIS DE CUBARRAL: 861. Las cuatro resoluciones y evidencia técnica completa quedan en approved_cubarral_resolutions del snapshot.

La regla rechaza otra empresa, contrato, fila, institución, sede, nombres discordantes, falta de evidencia histórica/proyección o un segundo candidato. No utiliza consecutivos ni fragmentos DANE.

## Resoluciones y exclusiones anteriores conservadas

Las 25 filas 491–499 y 514–529 permanecen resueltas como Puerto Rico, Meta, municipio 734. Texto fuente exacto PUERTO RICO; instituciones 83 y 86; institución/sede concordantes con agosto, catálogo y tenant 15/24. Se rechaza el homónimo Puerto Rico/Caquetá, ID 733.

Exclusiones aprobadas: 691 TOTAL_DEPARTAMENTAL; 692 RESIDUO_FORMULA; 693 FORMULA_REF; 697 LEYENDA; 699 SEPARADOR. Se conserva número de fila, motivo y aprobación humana. No se excluyen silenciosamente registros operativos. Excel y catálogos intactos.

## Snapshot, tooling y revocación

Artefacto final: reports/septiembre-certified-snapshot.json.
schema_version focalizacion.septiembre.certified.v1; certified=true; writes=0.
Contiene SHA fuente, scope completo, timestamp UTC, commit/hashes del tooling, 25 resoluciones Puerto Rico, cuatro resoluciones Cubarral, cinco exclusiones, 688 combinaciones con IDs/métricas/reglas, comparación con agosto y preflight.

Nuevo digest canónico certificado:
`bfb2204f4a89b9fad18045a1a14ec128cbfe322a9bfc04a287c545f0e7b4f38e`.

SHA-256 de JSON con claves recursivamente ordenadas, filas ordenadas por sede_id y modalidad_id numéricos y payload {scope, source SHA, rows}. Las filas incluyen IDs técnicos, métricas, rule_id y puestos; el timestamp y el commit no alteran el digest del conjunto. No hay personas, documentos ni credenciales.

Digest anterior revocado y rechazado por assertCertifiedSnapshot:
`95b49e8dd511b81e5e8664f7cc1c9c3893be7061b87a6ffa63fc8b26507a745b`.
El snapshot detenido anterior se conserva como antecedente no certificable. reports/septiembre-preview-digest-revocations.json registra su sustitución. Ninguna operación futura puede utilizar ese digest.

Tooling: commit ed6fb43, creado tras el primer preview válido y las pruebas. La segunda ejecución parte del Excel y de consultas nuevas, registra ese commit exacto y reproduce el mismo digest. reports/septiembre-preview-repeatability.json conserva la evidencia sanitizada de las dos ejecuciones.

## Preflight READ ONLY

Conexión default_transaction_read_only=on; BEGIN REPEATABLE READ READ ONLY; SHOW transaction_read_only=on; advisory lock mensual transaccional; ROLLBACK al finalizar y ante cualquier excepción. PostgreSQL 17.6; locks esperando=0. Septiembre inexistente.

Agosto carga 4 conserva 687 vigencias; digest intacto:
`0dd7e60cb6a37299728dc610c52e83cd1024bbf87ad00dbaa91787957c20f2f8`.
Periodos de Nómina del contrato, incluidos anulados, idénticos al baseline anterior. No DML ni llamadas que propaguen novedades o recálculos a Nómina.

Health HTTP 200; database.status=ok; OUTBOX=false; RECALC solicitado/activo=false; worker started/running=false. INTEGRACION_SYNC_ENABLED=false por confirmación manual vigente del usuario sobre Render; no se exige de nuevo y no se infiere desde variables locales. Evidencia explícita de cambio contradice la confirmación y detiene el preview. Excel verificado antes/después de cada ejecución.

## Runner y pasos futuros

Sólo PreviewOnly. Cualquier MUTATE se rechaza antes de abrir transacción. No se llama al importador general. La validación del snapshot exige certified=true, schema, nuevo digest exacto, SHA exacto, empresa 15/contrato 24, fechas y conjunto íntegro, y rechaza el digest revocado.

Los gates futuros exigen: actor válido con tenant/RBAC, PostgreSQL 17.x, backup completo verificado mediante restauración aislada, advisory lock, flags apagadas/worker detenido, septiembre inexistente, agosto intacto, transacción única, rollback total, idempotencia, auditoría estricta, postflight y segunda ejecución sin duplicados. Se prohíben creación de catálogos, propagación a Personal/Planilla/Nómina y recálculo automático.

La implementación mutadora continúa inexistente y deshabilitada: incluso todas las evidencias positivas no habilitan DML. Esta certificación no certifica una importación ni reemplaza el backup. Actor y backup son requisitos futuros, no requisitos para este preview READ ONLY.

No se crea backup en esta tarea. La estrategia exacta de dump completo PostgreSQL 17, manifiesto/SHA, snapshot consistente, globales/storage separados y restauración aislada se conserva en la sección de backup de septiembre-final-preview-stopped.md. Antes de cualquier trabajo productivo futuro se deberá revalidar el estado relevante y disponer del backup íntegro verificado.

## Verificación y Git

Suite enfocada 41/41 PASS, cero FAIL/SKIP: Cubarral y restricciones de tenant/fila/evidencia; Puerto Rico Meta y rechazo Caquetá; cinco exclusiones; 688 identidades; digest determinista/revocación/conjunto alterado; idempotencia y cero DML PreviewOnly; rollback simulado y rechazo de escritura en PGlite aislado; parser y modelo de focalización. Entorno de prueba ficticio, sin credenciales productivas.

Backend typecheck/build PASS. FrontendNuevo build PASS. git diff --check PASS, incluidos staged. Repetición productiva exclusivamente READ ONLY, sin duplicados ni cambio de digest. Rama fix/focalizacion-septiembre-importacion-controlada; commit/push sólo a esa rama. Main e250e64b0ee7b0d5d808b972718ffd5fe16d759e sin cambios, sin merge/deploy y sin tocar el workspace original de Nómina.

Decisión: FOCALIZACIÓN SEPTIEMBRE CERTIFICADA — REQUIERE BACKUP PRODUCTIVO.
