# Rollback operativo de Integración Phase 52–55

Este rollback es lógico y no elimina tablas ni datos de integración.

1. Apagar las tres flags de aplicación, en orden: `INTEGRACION_RECALC_ENABLED`, `INTEGRACION_SYNC_ENABLED`, `INTEGRACION_OUTBOX_ENABLED`.
2. Confirmar por healthcheck que el worker quedó detenido y que no hay procesamiento nuevo.
3. Si es necesario, revertir el backend a la versión anterior mediante el procedimiento autorizado de despliegue.
4. Conservar `integracion_eventos` e `integracion_evento_impactos` para auditoría y posible reanudación.
5. No ejecutar archivos `down` automáticamente en producción.

Los `down` sólo pueden ejecutarse con aprobación expresa, respaldo verificado, ventana de mantenimiento y revisión de dependencias. El orden local autorizado es 55, 54, 53, 52. Phase 54 normaliza `TRAZABILIDAD_PERSONAL` a `SIN_IMPACTO`; por eso su reversión es destructiva respecto de esa distinción.

El backend usa `pg.Pool`/`node-postgres` directamente con el rol de `DATABASE_URL`; no consulta estas tablas por PostgREST. Las tablas nuevas conservan el modelo interno: propietario del rol que ejecuta la migración, sin grants a `anon`/`authenticated` y sin RLS añadido. Si el rol de aplicación es distinto al propietario, debe recibir sólo los grants internos ya usados por el backend mediante el procedimiento de permisos existente.
