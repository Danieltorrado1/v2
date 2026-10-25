# Estabilización posterior al login: inventario y condiciones

Base local y SHA productivo confirmado por el usuario: `06b2bbab2ffd0d802e0f58b9609d2681998c5ff7`. Rama: `fix/configuracion-public-schema`; worktree `.worktrees/stabilize-config-public-schema`. El usuario aportó el preflight aprobado ejecutado en Render: SHA coincidente, 15/15 relaciones, sin faltantes ni permisos insuficientes. Corrección implementada y validada localmente; sin publicación.

## Corrección delimitada, implementada después del preflight

Único archivo funcional modificado: `src/modules/configuracion/configuracion.admin.service.ts`. Se calificaron las dos referencias del helper `listCatalogoSimple` y contratos/empresas en las consultas de conteo y listado de `listContratos`: seis prefijos public en cinco líneas. Se conservaron filtros, placeholders, defaults, orden, paginación, autorización y alcance de tenant. Pool, conexión, datos externos, frontend y otros servicios intactos.

Relaciones verificadas en Render según el preflight aportado: tipos_vinculacion, tipos_jornada, departamentos, municipios, zonas, eps, arl, fondos_pension, cajas_compensacion, niveles_estudio, estados_civiles, sexo, tipos_documentos, contratos, empresas. Existencia en public y permisos de lectura aprobados. El comando siguiente se conserva para una eventual revalidación, no se ejecutó de nuevo desde este entorno.

## Comando de preflight para Render Shell

Desde el directorio que contiene dist, ejecutar una vez sin cambiar search_path:

```bash
node <<'NODE'
(async () => {
  const { dbPool: pool } = require('./dist/config/db.js');
  let c;
  try {
    c = await pool.connect();
    await c.query('BEGIN READ ONLY');
    const names = ['tipos_vinculacion','tipos_jornada','departamentos','municipios',
      'zonas','eps','arl','fondos_pension','cajas_compensacion','niveles_estudio',
      'estados_civiles','sexo','tipos_documentos','contratos','empresas'];
    const { rows } = await c.query(`
      SELECT e.nombre, t.oid IS NOT NULL AS existe,
        COALESCE(pg_catalog.has_schema_privilege(n.oid,'USAGE'),false) AS uso,
        CASE WHEN t.relkind IN ('r','p','v','m','f')
          THEN pg_catalog.has_table_privilege(t.oid,'SELECT')
          ELSE false END AS lectura
      FROM unnest($1::text[]) e(nombre)
      LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
      LEFT JOIN pg_catalog.pg_class t
        ON t.relnamespace=n.oid AND t.relname=e.nombre
      ORDER BY e.nombre`, [names]);
    const faltantes = rows.filter(r=>!r.existe).map(r=>r.nombre);
    const permisos = rows.filter(r=>r.existe && (!r.uso || !r.lectura));
    console.log(JSON.stringify({sha:process.env.RENDER_GIT_COMMIT || null,
      esperadas:15, encontradas:rows.filter(r=>r.existe).length,
      faltantes, permisos_insuficientes:permisos,
      aprobado:!faltantes.length && !permisos.length},null,2));
  } catch(e) {
    console.log(JSON.stringify({aprobado:false,codigo:e.code || 'ERROR'}));
  } finally {
    if(c) { try { await c.query('ROLLBACK'); } catch {} c.release(); }
    await pool.end();
  }
})().catch(()=>console.log('{"aprobado":false,"codigo":"CONEXION_O_CIERRE"}'));
NODE
```

Criterio: SHA igual a `06b2bbab2ffd0d802e0f58b9609d2681998c5ff7`, 15/15 relaciones y arrays de faltantes/permisos vacíos. El campo aprobado comprueba relaciones; el SHA debe contrastarse además. No imprimir DATABASE_URL ni otros valores de entorno.

## Inventario por módulo

Las cifras cuentan sitios de llamada en código, no consultas fallidas ni sentencias únicas. Incluyen BEGIN/COMMIT/ROLLBACK. Las llamadas con nombres sin esquema son candidatos estáticos; no son incidentes productivos confirmados. Los builders reutilizados se registran separadamente y no deben sumarse a las llamadas.

| Módulo | Llamadas | Con referencia candidata sin esquema | Revisión dinámica adicional | Impacto posible |
|---|---:|---:|---:|---|
| config | 1 | 0 | 1 | Adaptador PostgreSQL |
| jobs | 6 | 6 | 0 | Tareas programadas |
| middlewares | 10 | 3 | 5 | Validación de contexto fuera del recorrido ya corregido |
| alertas | 73 | 38 | 7 | Alertas y notificaciones |
| auditoria | 23 | 1 | 3 | Lecturas/listados pendientes; escritura de login ya corregida |
| cobertura | 178 | 101 | 6 | Asignaciones, ubicación, maestros y sincronización |
| configuracion | 123 | 51 | 15 | Catálogos, empresas, contratos, cargos y calculadoras |
| contratos | 46 | 23 | 0 | Ciclo de vida, requisitos y evidencia contractual |
| dashboard | 26 | 26 | 0 | Resúmenes y contadores |
| documentos | 80 | 31 | 17 | Cumplimiento, versiones, cargas y metadatos |
| empresa-configuracion | 41 | 21 | 10 | Preferencias, módulos y contexto de empresa |
| evaluaciones | 53 | 39 | 2 | Revisión de integración |
| expedientes | 11 | 11 | 0 | Lecturas agregadas y evidencia de expedientes |
| health | 1 | 0 | 0 | Comprobación SELECT NOW() |
| importaciones | 71 | 37 | 2 | Staging, aplicación y errores de importación |
| integracion | 75 | 35 | 0 | Outbox, sincronización e impactos |
| logistica | 38 | 13 | 9 | Bodegas, rutas, movimientos y remisiones |
| nomina | 605 | 314 | 48 | Cálculo, captura, estados, prestaciones y documentos V1; solo inventariado |
| operacion | 49 | 29 | 14 | Focalización, instituciones, sedes, modalidades y SIMAT |
| personas | 52 | 21 | 9 | Identidad, búsqueda, alta y actualización de personas |
| plantillas | 17 | 6 | 0 | Plantillas, variables y documentos generados |
| reportes | 8 | 8 | 0 | Proyecciones y exportación |
| repositorioDocumental | 9 | 1 | 8 | Repositorio, consultas y proyecciones documentales |
| saas | 39 | 19 | 3 | Planes, suscripciones, overrides y otras lecturas no cubiertas por el hotfix |
| sst | 254 | 76 | 45 | Eventos, inspecciones, planes y gestión SST |
| sstIndicadores | 20 | 11 | 5 | Indicadores SST |
| tenant | 30 | 13 | 1 | Gestión de accesos fuera del bootstrap corregido |
| users | 57 | 21 | 6 | CRUD y enriquecimiento administrativo fuera de autenticación |
| vinculaciones | 171 | 95 | 16 | Personal: asignación, vigencias y condiciones |

## Clasificación por consulta

Cada entrada de `reports/post-login-search-path-inventory.json` contiene archivo, lónea, función, executor, operación, referencias explícitas y candidatas sin esquema, interpolación, hash del SQL literal y clasificación de impacto. Hay 2167 llamadas y 1305 fragmentos/builders, con finalidades diferentes.

- `unqualified-reference`: riesgo alto de 42P01 bajo ruta vacía. Lectura: bloquea listados, contexto, dashboards o exportación. Escritura: puede abortar CRUD, captura o una transacción; no afirma que hubo escrituras parciales.
- `dynamic-review-required`: requiere reconstruir la consulta efectiva; variables, builders y nombres interpolados impiden concluir solo por el literal del call site.
- `transaction-control`: límite transaccional; no es una referencia a tabla ni debe ser alterado en esta estabilización.
- `no-direct-unqualified-reference`: sin dependencia de resolución de tablas detectada en ese literal; no certifica funciones, triggers ni SQL almacenado.

Las referencias dinámicas y CTEs reconocidos parcialmente requieren revisión manual. No se ha consultado el catálogo de producción para los módulos auditados. El inventario no garantiza exhaustividad sobre SQL construido fuera de los call sites, identificadores entrecomillados, funciones o triggers de la base. No se recomienda prefijar mediante regex todo el backend.

## Pruebas y resultados de Configuración

1. Reproducir 42P01/posición 36 en los dos conteos originales con ruta vacía y fixtures sintéticos.
2. Comparar resultados anteriores con ruta public contra resultados corregidos con ruta vacía: conteo/listado, páginas vacías, búsqueda, activo, empresa, estado contractual, identificación personal y orden.
3. Verificar los 13 catálogos del helper confirmado, dos empresas, contrato autorizado/no autorizado y permisos HTTP.
4. Reejecutar las 60 pruebas focalizadas del hotfix de autenticación y bootstrap, typecheck y build.
5. Revisar que el diff funcional sea exclusivamente Configuración y conservar el hotfix existente.

Se añadieron `src/tests/configuracion.public-schema.integration.test.ts` y `src/tests/fixtures/configuracion-public-schema.baseline.json`. La fixture se capturó del SHA productivo antes de editar el service; no se ajustó para obtener verde. Las pruebas nuevas fallaron antes de la reparación y pasan después.

- 21/21 pruebas de Configuración aprobadas, incluidos los contenedores del runner.
- 60/60 pruebas previas focalizadas de autenticación, tenant y SaaS aprobadas; ejecución conjunta: 81/81, cero fallos.
- Typecheck backend, build backend y `git diff --check`: aprobados. No hay script de lint backend.
- Se comparan resultados y secuencias de SQL/parámetros del código original bajo search_path public con el corregido bajo search_path vacío. La normalización solo retira los prefijos agregados.
- Se ejecutan routers, autorización, middleware y services reales contra PGlite en memoria; los dos accesos del pool están interceptados y no se conecta a Supabase. Las escrituras de fixtures ocurren solo dentro de la base sintética. Ningún handler de lectura escribe ni ejecuta SET.
- Incluye los 13 catálogos, páginas vacías, búsqueda parametrizada, activo, NULLs, identificación personal, municipio/departamento, defaults, orden, fechas de contratos y filtros combinados. Preserva prioridad del scope de contratos, acceso por empresa, denegación sin asignación y estados HTTP 200/401/403.
- Los tests prueban que el archivo funcional completo coincide con el SHA aprobado tras retirar únicamente las seis calificaciones SQL.

Comandos: `node --import tsx --test --test-reporter=tap src/tests/configuracion.public-schema.integration.test.ts`; batería anterior de cinco archivos de autenticación más el nuevo test, con entorno sintético en el proceso; `npm run typecheck`; `npm run build`. Resultados resumidos en `reports/configuracion-public-schema-validation.json`; TAP en `tmp/configuracion-public-schema-*.tap`. No es una prueba del protocolo Supavisor real ni una validación productiva posterior al despliegue.

## Riesgos restantes y publicación independiente

El parche previsto no corregirá las dependencias identificadas en otros módulos. El origen administrativo de search_path vacío sigue pendiente de pg_settings/pg_db_role_setting/opciones efectivas; no se altera globalmente para resolverlo.

La implementación está terminada localmente y no tiene commit. Una publicación futura requerirá autorización explícita: revisar y preparar exclusivamente el service de Configuración, sus pruebas/fixture y documentación correspondiente; excluir logs de tmp y artefactos. Crear un commit cuyo padre sea `06b2bbab...`, publicar solo `fix/configuracion-public-schema` y desplegar ese commit específico en Render sin modificar main ni incorporar otras ramas. Verificar después health, login, sesión, ambos endpoints y ausencia de 42P01 en esas operaciones. Reversión: volver al artefacto `06b2bbab...`, que conserva el login; los dos endpoints de Configuración volverían a estar expuestos al error anterior. No hay migraciones o datos del parche que revertir.

El inventario JSON continúa siendo una fotografía estática del SHA base, previa a este parche. No se corrigieron los otros módulos inventariados. Sin cambios de Nómina/RFC-001, frontend, configuración de PostgreSQL o pool; sin migraciones, cambios de datos externos, commits, push, merge o despliegues.
