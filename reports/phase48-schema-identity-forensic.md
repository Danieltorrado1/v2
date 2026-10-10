# Phase 48: reconciliación de schema identity

Base: `cfe8b63276ef948ce72bc36f535d74509542e447`. Rama exclusiva: `fix/phase48-schema-identity-forensic`. No se ejecutó un nuevo preflight completo.

## Causa demostrada

El pin anterior `2fbba2269828d8573ed10eb5a6749d89e30d62adc75652ac713f375467df19a9` se reproduce exactamente al restaurar el backup certificado en PostgreSQL 17.11 local. Producción 17.6 devuelve `c5ac9e39dffedbca6638a6fe0fb0a1d3d486627dc5e0d11dbbb5735933267630` con las mismas consultas, search_path y canonicalización global. El algoritmo anterior incluía todas las columnas, constraints, índices, funciones y triggers de public, sin limitarse al write-set ni a sus dependencias. Conservaba además el orden SQL de las listas.

Las diferencias que explican el digest global son **once CHECK y un índice parcial**. Sus doce hashes productivos coinciden exactamente con las definiciones originales del dump certificado, decodificado únicamente en memoria. Por tanto no se atribuyen a cambios productivos ni a migraciones posteriores: la divergencia se reproduce en el round trip de restauración en 17.11. La huella global depende de la representación de esos casts. No hubo diferencias en columnas/defaults, funciones o triggers de las cinco colecciones originales; tampoco se detectó un problema de orden que explicase el rechazo.

Lista exacta de los doce objetos:

| Objeto | Clasificación |
|---|---|
| calculadora_personal_config.calculadora_personal_config_estado_check | COMPATIBLE_NO_MATERIAL |
| calculadora_personal_config.calculadora_personal_config_metodo_check | COMPATIBLE_NO_MATERIAL |
| calculadora_personal_config.calculadora_personal_config_regla_redondeo_check | COMPATIBLE_NO_MATERIAL |
| calculadora_personal_rangos.calculadora_personal_rangos_estado_check | AJENA |
| empresa_modulo_configuracion.ck_empresa_modulo_config_estado | AJENA |
| empresa_suscripciones.chk_empresa_suscripcion_estado | AJENA |
| nomina_novedad_documentos.nomina_novedad_documentos_estado_revision_check | AJENA |
| nomina_novedad_documentos.nomina_novedad_documentos_tipo_relacion_check | AJENA |
| nomina_parametros_economicos.ck_nomina_parametros_redondeo | AJENA |
| planes.chk_planes_periodicidad | AJENA |
| sst_matriz_riesgos.chk_sst_matriz_riesgos_clasificacion | AJENA |
| empresa_suscripciones.uq_empresa_suscripcion_abierta | AJENA |

Los hashes anteriores/actuales/originales, primera evidencia temporal, propiedad y efecto de cada objeto están en `phase48-schema-original-dump-comparison.json` y `phase48-schema-reconciliation.json`. No se guardan las definiciones ni sus literales. Primera evidencia disponible utilizada: backup certificado del 2026-10-07; no se atribuye ningún cambio a un commit sin prueba.

El inventario estructural ampliado registra **523 diferencias de propiedades**: 109 COMPATIBLE_NO_MATERIAL en el alcance y 414 AJENA; cero CRÍTICA y cero NO_DETERMINABLE. Incluye ACL omitidas por la restauración --no-owner/--no-privileges y posiciones internas de columnas/FK regeneradas tras eliminar huecos de columnas borradas. Las FK se comparan por nombres de columnas referidas, conservando orden, acciones, match type, validation y deferrability. El sentinel 0 de constraints de exclusión representa expresiones: su definición completa e índice siguen fijados por hash. Las capabilities efectivas SELECT/INSERT/UPDATE/DELETE y schema USAGE coinciden en ambos inventarios; las ACL textuales se conservan como evidencia y no se confunden con drift productivo.

## Huella crítica

`schema_identity_version = phase48-critical-schema-v1`.

Digest esperado, derivado **del backup**, y observado normalizado en producción:
`b2721653fcb198b17c91d27e454c526fedc99a8e71e9d3e28f4c8e2f8e34d98a`.

Raíces directas: cobertura_asignaciones, auditoria, auditoria_eventos, nomina_asistencia_diaria, nomina_periodos, nomina_categorias_salariales, focalizacion_final, calculadora_personal_config y sede_modalidades. Se añaden raíces explícitas de actor/roles/permisos y empleados/contextos/condiciones económicas de Nómina. Se cierra transitivamente sobre FK, tablas nombradas por los cuerpos de funciones, funciones llamadas, triggers y dependencias de vistas. La única ejecución SQL dinámica en las funciones incluidas utiliza un literal fijo de SELECT; sus referencias también se incluyeron. El generador rechaza SQL dinámico no resuelto, funciones modificadas o dependencias a esquemas externos no inventariados. Los cuerpos de las siete funciones coinciden entre backup y producción y quedan fijados íntegramente por SHA.

Conjunto final: **51 tablas, 684 columnas, 269 constraints, 170 índices, 7 funciones, 10 triggers, 51 secuencias y 51 registros de capacidades**. No hay vistas ni tipos definidos por el usuario utilizados por este alcance; añadir una vista al alcance o cambiar una columna a un tipo no certificado falla cerrado. Se incluyen metadata de tipos, nullability, defaults, collation, identity/generated, PK/UK/FK/CHECK/exclusion, predicados parciales, funciones, triggers, parámetros/ownership de secuencias y RLS. El manifiesto exacto de objetos directos y transitivos es `phase48-schema-scope.json`; la proyección completa está en `phase48-schema-reconciliation.json`.

Quedan fuera **192 tablas/vistas**, identificadas individualmente y justificadas en esos archivos: no son consultadas por la lógica específica de Phase 48/correcciones ni alcanzadas por sus FK, triggers, funciones o vistas. Los barridos globales de snapshots y las protecciones existentes siguen intactos; sus metadatos globales son evidencia de estabilidad, no el pin de identidad esperado.

La canonicalización ordena registros y propiedades de forma determinista. No elimina casts arbitrariamente: sólo acepta los dos hashes conocidos por cada objeto cuya equivalencia fue demostrada por el dump y su restauración. Un tercer hash, un cambio de tipo, nullability, default, constraint, índice, función, trigger, secuencia o dependencia del alcance se rechaza. El valor global anterior se conserva como constante histórica y los valores globales actuales se registran informativamente. La comparación 8/8 entre conexiones y la frase canónica conservan sus campos y algoritmo anteriores; no se emite ni activa una frase en esta tarea.

READ ONLY y mutador importan el mismo helper, versión, scope, canonicalización, expected digest y validador. Ambos entrypoints y el contrato protegen por igualdad Git los tres módulos compartidos nuevos. El mutador comprueba el gate antes de su baseline, dentro de su transacción READ ONLY y nuevamente con sus locks antes del write-set. No se ejecutó el mutador en producción.

## Evidencia productiva y local

Una conexión productiva, TLSv1.3 certificado, BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY, read_only=on, consultas exclusivamente a pg_catalog/information_schema/metadatos, ROLLBACK confirmado y cliente/Pool cerrados. Evidencia sanitizada: `phase48-schema-production-catalogs.json`. Cero filas de negocio consultadas, incluso conteos; cero health calls; cero escrituras productivas; cero auditorías de aplicación.

Dos restauraciones locales aisladas del mismo backup con SHA `4271775ee853bf03b9f70402f7ecfd7becbe048269e3b10c76f027f981303e26`, PostgreSQL 17.11 y loopback 55468. Se conservan las nueve exclusiones Supabase previamente certificadas; ninguna excluye objetos de public. Roles locales sin login y sin credenciales. La primera reproduce el pin; la segunda confirma el digest crítico y prueba DDL local reversible: añadir una columna crítica cambia la huella, crear una tabla ajena no la cambia; ambos hacen ROLLBACK. Ambos clusters se detuvieron y eliminaron junto con todos los temporales y logs raw. Sólo quedan inventarios/evidencias sanitizadas.

STOPPED ahora conserva expected_schema_digest, observed_schema_digest, canonicalization_version, schema_identity_version, fase/conexión de divergencia y digest global cuando está disponible, con status=STOPPED, nonce=null y writes_productive=0. No incluye definiciones ni filas. El recibo histórico se conserva intacto y no se reescribe.

Pruebas y builds: **138/138 pruebas, cero fallos y cero skips**, registradas en `phase48-schema-identity.cert.json`. Incluye alteraciones de columna, nullability, default, FK, UK, CHECK, índice parcial, trigger, función, secuencia, vista, dependencia transitiva, capacidades y RLS; objeto ajeno; orden; casts equivalentes; STOPPED con observed digest y publicación atómica. También runner, mutador/atomicidad/rollback/idempotencia, TLS, target, contrato, post-rollback 8/8, typecheck, backend build, FrontendNuevo build y git diff --check. El guard bloquea accesos productivos durante esas suites.

## Preservación y Git

Recibo preservado, 2953 bytes, SHA `aa61f0d544f791eee2308e837eb4a68bb5faf1b430cd8761288277880018a8d2`:

`C:/Users/CORE ULTRA/Documents/EmpiriaBackups/phase48-modalidad-pre-migracion-20261007T132031Z/stopped-preflights/phase48-preflight-11ebe8a2-8b6a-4be7-992a-8fb399ac3e71.stopped.json`

Manifiesto sanitizado junto a él: `phase48-preflight-11ebe8a2-8b6a-4be7-992a-8fb399ac3e71.manifest.json`. Tamaño/SHA verificados antes y después; sin secretos ni datos personales. Working tree limpio tras preservarlo y antes de crear la rama desde la base exacta.

El primer commit de código certificado de esta rama es el nuevo mutator_commit; un segundo publica su pin y la evidencia final. HEAD final será readonly_runner_commit, obtenido con git rev-parse HEAD sin hash autorreferente. El pin final se registra en MUTATOR_COMMIT y en el certificado. Quedan revocados a1e709ca89c37ed31e9ec27b4dff2e4c17c295ce, los runner commits hasta cfe8b632 inclusive y todas las frases previas. Sólo se permite push a esta rama. Ningún merge, deploy, migración, Phase 48 ni corrección productiva se ejecutó.

**ESQUEMA CRÍTICO RECONCILIADO — LISTO PARA NUEVO PREFLIGHT READ ONLY**
