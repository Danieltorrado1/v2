# Manifiesto sintético Phase 55

Este harness es exclusivamente local y sintético. No copia dumps, migraciones completas ni datos reales.

Las estructuras añadidas o completadas se derivan de las consultas de `recalculateNominaPeriodo`, `nominaPoblacionService.syncSelective`, `nominaPeriodoRepository`, auditoría y resolución contextual:

- `nomina_periodos`: `nombre_periodo`, `tipo_periodo`, `requiere_asistencia`, `activo`, `created_at`.
- `nomina_empleados`: columnas financieras explícitas, fechas de pago, `detalle_calculo` y `created_at`.
- `nomina_liquidaciones`: estado, `requiere_recalculo`, componentes financieros y deducciones.
- `nomina_novedades`, `nomina_novedades_canonicas`, `nomina_tipos_novedad`.
- `nomina_asistencia_diaria`, `nomina_movimientos`, `nomina_novedad_turnos`, `nomina_ajustes_manuales`.
- `nomina_parametros_economicos`, `nomina_contextos_operativos_base`, categorías y catálogos contextuales.
- `auditoria_eventos`, `auditoria`, `historial_cambios`.

La preparación sólo crea objetos ausentes o columnas sintéticas faltantes en la base autorizada `empiria_integration_test`; los datos usan IDs a partir de `900000` y se eliminan al finalizar. Phase 52, 53, 54 y 55 se conservan aplicadas.
