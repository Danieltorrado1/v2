# Estado Personal y Nómina

## A. Arquitectura vigente

- Backend oficial: `V2/src` ejecutado desde la raíz del repositorio.
- Frontend oficial: `V2/FrontendNuevo`.
- Frontend legado: `V2/Frontend`, conservado solo como referencia.
- Validación de estructura:
  - No se encontró import, enlace ni referencia activa de `Frontend/` dentro de `FrontendNuevo`.
  - No se creó una carpeta `Backend` artificial.
  - La estructura raíz se mantiene sin cambios.

## B. Módulos completados

- Personal conectado a datos reales.
- Nómina principal conectada a períodos, dashboard, empleados y recalcular.
- Novedades conectadas.
- Liquidación conectada.
- Turnos externos conectados mediante `nomina_movimientos`.
- Personal OPS conectado mediante `vinculaciones`.
- Corrección Nómina adaptada a recursos reales disponibles.
- Exportes conectados al backend real.
- Desprendibles conectados a listado y apertura del vigente.

## C. Endpoints usados por módulo

### Personal

- `GET /personas`
- `GET /personas/:id`
- `GET /personas/documento/:numeroDocumento`
- `GET /vinculaciones/persona/:personaId`
- `GET /vinculaciones/:id/expediente`
- `POST /personas`
- `PATCH /personas/:id`

### Personal OPS

- `GET /vinculaciones`
- `GET /vinculaciones/:id/expediente`
- El filtro OPS se completa en frontend usando `metodo_pago` real de la vinculación.

### Nómina principal

- `GET /nomina/periodos`
- `GET /nomina/periodos/:id`
- `POST /nomina/periodos`
- `GET /nomina/periodos/:id/dashboard`
- `GET /nomina/periodos/:id/empleados`
- `POST /nomina/periodos/:id/recalcular`

### Novedades

- `GET /nomina/novedades`
- `POST /nomina/novedades`
- `PATCH /nomina/novedades/:id`
- `PATCH /nomina/novedades/:id/desactivar`

### Liquidación

- `GET /nomina/liquidaciones/:periodoId`
- `POST /nomina/liquidaciones/:periodoId/generar`
- `GET /nomina/export/:periodoId?tipo=liquidaciones`

### Turnos externos

- `GET /nomina/movimientos`
- `POST /nomina/movimientos`
- `PATCH /nomina/movimientos/:id`
- `PATCH /nomina/movimientos/:id/desactivar`
- `GET /nomina/export/:periodoId?tipo=movimientos`

### Exportes y desprendibles

- `GET /nomina/export/:periodoId?tipo=todo`
- `GET /nomina/export/:periodoId?tipo=movimientos`
- `GET /nomina/export/:periodoId?tipo=liquidaciones`
- `GET /nomina/desprendibles/:periodoId`
- `GET /nomina/desprendibles/:periodoId/:vinculacionId`
- `POST /nomina/desprendibles/:periodoId/generar`

## D. Brechas reales pendientes

- No existe catálogo expuesto de tipos de novedad.
- Los empleados del período no traen municipio ni conteo propio de novedades.
- No existe tipo claro `TC` / `MT` / `OPS` en el endpoint de empleados.
- No existe recurso real de `turnos` independiente.
- No existe `TURNO_INTERNO`.
- No existen cuentas de cobro consolidadas.
- No existe endpoint específico de Personal OPS.
- No existe filtro backend por `metodo_pago` para OPS.
- No existe recurso real de cuentas de cobro OPS.
- No existe `nomina_correcciones`.
- No existe flujo backend de aprobar / rechazar / aplicar correcciones.
- Los exportes confirmados en esta integración son CSV.
- No existe descarga histórica específica de desprendible por versión.
- No existe descarga masiva de desprendibles.
- No existe envío por correo de desprendibles o exportes.
- `api.ts` y `apiClient.ts` conviven; hay solapamiento técnico, pero no se hizo una migración masiva por riesgo.

## E. Validaciones ejecutadas

### Backend

- `npm run typecheck`
- `npm run build`
- `npm run db:test`
- Verificación manual de `GET /api/health`
  - `status`: `200`
  - `database.status`: `ok`
  - puerto observado: `4000`

### FrontendNuevo

- `npm run build`
- `npm run lint`
- No existe script `npm run typecheck` en `FrontendNuevo/package.json`.

## F. Warning no bloqueante de Vite

- El build de `FrontendNuevo` sigue mostrando warning por chunk mayor a `500 kB`.
- Chunk principal observado: `dist/assets/index-C0y2lErL.js` con `900.17 kB` minificado.
- No bloquea build ni despliegue, pero conviene dividir rutas pesadas en una fase posterior.

## G. Próximas prioridades recomendadas

1. Exponer en backend un recurso real para correcciones de nómina.
2. Exponer catálogos faltantes de novedades y clasificaciones de empleados.
3. Agregar filtros backend para OPS por `metodo_pago`.
4. Separar o consolidar gradualmente `api.ts` y `apiClient.ts`.
5. Dividir bundle de `FrontendNuevo` con lazy loading en páginas grandes de Personal y Nómina.
