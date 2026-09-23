# Manifiesto sintético Fase 3

Este manifiesto documenta únicamente el esquema ficticio creado por `phase53-synthetic-e2e.ts` en `empiria_integration_test`. No es dump, migración productiva ni contiene datos reales.

## Relaciones y claves

| Relación | Columnas explícitas consultadas | Claves/relaciones | Estados relevantes |
|---|---|---|---|
| empresas | `id bigint`, `nombre_empresa text` | PK `id` | — |
| contratos | `id bigint`, `empresa_id bigint` | PK `id`, FK empresa | — |
| personas | `id bigint`, nombres básicos | PK `id` | — |
| vinculaciones | `id`, `persona_id`, `contrato_id`, `estado_vinculacion`, `fecha_inicio`, `fecha_fin`, `cotiza_pension`, `contrato_cargo_id` | PK, FK persona/contrato/cargo | `ACTIVA`, `RETIRADA`, `SUSPENDIDA` |
| nomina_periodos | `id`, `contrato_id`, `fecha_inicio`, `fecha_fin`, `estado` | PK, FK contrato | `ABIERTO`, `EN_PROCESO`, `CERRADO` |
| nomina_empleados | identidad, periodo/vinculación, fechas de pago, días, importes snapshot, `estado`, `activo`, `revisado` | PK, FK periodo/vinculación | `PENDIENTE`, `REVISADO`, `CERRADO` |
| nomina_asistencia_diaria | periodo/vinculación, `fecha`, horas, `estado_dia`, `observacion`, `activo`, `created_at` | PK, FK periodo/vinculación, UNIQUE periodo+vinculación+fecha | `PRESENTE`, `PENDIENTE`, `AUSENTE`, `JUSTIFICADA` |
| nomina_tipos_novedad | catálogo operativo y flags de efecto | PK, UNIQUE `codigo_operativo` | `activo` |
| nomina_novedades | periodo/empleado/vinculación/tipo, rango, días/horas/valor, revisión, cobertura, activo | PK, FK periodo/empleado/vinculación/tipo | activa/inactiva |
| nomina_novedad_documentos | relación de soporte y revisión | PK, FK novedad | — |
| nomina_novedad_coberturas | cobertura interna/externa y snapshot | PK, FK novedad | `activo` |
| nomina_novedad_turnos | novedad/empleado/vinculación, `tipo_turno`, externo, reemplazo, contexto, movimiento, activo | PK, FK periodo/novedad/empleado/vinculación | `INTERNO`, `EXTERNO` |
| nomina_movimientos | fecha, tipo/familia, estado, cantidades/valores, contexto anterior/nuevo, reemplazos, externo, activo | PK, FK periodo/empleado/vinculación | `PENDIENTE`, `APROBADO`, `REVISADO`, `RECHAZADO` |
| nomina_liquidaciones | periodo/vinculación, fechas, conceptos, `estado`, `requiere_recalculo`, total, activo | PK, FK periodo/vinculación, UNIQUE periodo+vinculación | `GENERADA`, `PRELIMINAR`, `CALCULADA`, `FINALIZADA` |
| nomina_revision_operativa | periodo/empleado/persona/vinculación, estado, auditoría, versión | PK, FK, UNIQUE periodo+empleado | `PENDIENTE`, `REVISADO`, `REQUIERE_REVISION` |
| nomina_contextos_operativos_base | periodo/empleado/vinculación, `contexto`, fuente | PK, FK, UNIQUE periodo+empleado | — |
| cobertura_asignaciones | contrato/vinculación, focalización y contexto, fechas, activo | PK, FK lógica de contrato/vinculación | activo/inactivo |
| integracion_eventos | agregado, empresa/contrato/persona/vinculación, fecha, payload sanitizado, idempotencia y locks | PK, FK, UNIQUE `idempotency_key` | `PENDIENTE`, `PROCESANDO`, `PROCESADO`, `ERROR` |
| integracion_evento_impactos | evento/periodo/vinculación, rango, acción, contexto, versión y estado | PK, FK, UNIQUE evento+vinculación+periodo | `PENDIENTE`, `APLICADO`, `SIN_CAMBIOS`, `BLOQUEADO_CIERRE`, `ERROR`; acción `TRAZABILIDAD_PERSONAL` |

## Consultas auditadas

- Actividad laboral: periodos, asistencia, novedades + catálogo, movimientos, liquidaciones, revisión operativa e integración; una consulta paginada de periodos y una consulta de eventos, sin consultas por fila.
- Asistencia: `periodo_id`, `vinculacion_id`, `fecha`, `estado_dia`, `activo` y auditoría de lote.
- Novedades: catálogo por `tipo_novedad_id`, rango, días/horas/valor, cobertura, documentos y estado activo.
- Turnos/movimientos: tipo interno/externo, contexto, reemplazos, externo, valores y activo.
- Liquidaciones: estado, total, deducciones, conceptos y `requiere_recalculo`.
- Revisión operativa: estado/version por periodo y empleado.
- Eventos inversos: empresa, contrato, persona, vinculación, periodo, fecha efectiva, clave idempotente y resumen allowlist.
