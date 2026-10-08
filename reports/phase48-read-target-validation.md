# Validación de destino Supabase READ ONLY

Rama `fix/phase48-read-target-validation`, creada desde
`b653184f2fe8ff6b732166cdf79de4edd5935e2b`. El mutador, su SQL, sus compuertas,
LOCAL_RESTORATION_REQUIRED y .gitignore permanecen sin cambios frente a dcbd37a.

## Diagnóstico offline

La causa de READ_PROJECT_TARGET_INVALID fue la restricción del validador anterior
a un puerto explícito de sesión. El formato transaction pooler fue rechazado
aunque su identidad correspondía exactamente al proyecto esperado.

Sólo se extrajo DATABASE_URL del archivo expresamente autorizado, en memoria,
para analizar y validar su estructura. No se abrió ninguna conexión ni se
consultó health productivo. No se conserva la clasificación de la credencial
real en este documento, ni la URL, el usuario, el password, puerto real,
parámetros o tokens. La clasificación sanitizada se entregó sólo en consola.
La URL no declara SSL explícito; el transporte impone TLS con certificado y
hostname verificados y no permite que un parámetro lo desactive.

## Validación offline

`phase48-readonly-target.ts` usa URL y percent-decoding seguro, con errores que
sólo contienen códigos. La lectura de la clave admite espacios, comillas,
comentarios y export; rechaza ausencia, valores vacíos y claves duplicadas.

Se reconocen hosts directos oficiales exactos, poolers compartidos regionales
oficiales y el formato regional anterior documentado. Direct y dedicated pooler
obtienen el ref del segmento exacto del hostname; shared pooler lo obtiene
únicamente de un username de estructura exacta. Hostnames se normalizan a
minúsculas; los usernames conservan comparación exacta. La conexión directa
con DNS oficial puede resolver a IPv6 sin usar una IP literal como identidad.

Se distinguen DIRECT, SHARED_SESSION_POOLER, SHARED_TRANSACTION_POOLER y
DEDICATED_TRANSACTION_POOLER. No se cambian host, puerto ni credenciales de la
URL original para convertir un modo en otro. Se admite el puerto por defecto
omitido cuando corresponde al formato directo/session.

Se exige protocolo PostgreSQL, base postgres, password presente, dominio y ref
exactos. Se rechazan localhost, IPs literales, hosts personalizados, sufijos
adicionales, dominios parecidos, refs parciales, username ambiguo, fragments,
parámetros duplicados o desconocidos y overrides de conexión/SSL. Un ref en
password o query no concede identidad. Sólo se admiten parámetros explícitamente
enumerados, con valores limitados; no se entregan al driver como connectionString.
La configuración pg se construye por campos, con TLS rejectUnauthorized=true
y los parámetros READ ONLY/UTC obligatorios.

Estos formatos se contrastaron con [Connect to your database](https://supabase.com/docs/guides/database/connecting-to-postgres),
[Supavisor FAQ](https://supabase.com/docs/guides/troubleshooting/supavisor-faq-YyP5tI)
y [Use Supabase with Spring Boot](https://supabase.com/docs/guides/getting-started/quickstarts/spring-boot).
La documentación permite exigir SSL también mediante la configuración explícita
del driver, que aquí siempre verifica el certificado.

## Segunda barrera preparada

La entrada futura conserva Pool(max=1), READ ONLY, las transacciones y rollback
del contrato certificado. Dentro de la transacción principal, antes de leer
datos operativos, se consultan únicamente catálogos, database/version y
existencia del tenant. Se confirman PostgreSQL 17, base esperada, tablas
esperadas, empresa 15 y contrato 24 perteneciente a empresa 15. Se compara
la definición de esquema/constraints/índices/routines/triggers con la huella
certificada de la restauración:
`2fbba2269828d8573ed10eb5a6749d89e30d62adc75652ac713f375467df19a9`.
Un cambio produce READ_SCHEMA_IDENTITY_MISMATCH y nunca una frase utilizable.

Las barreras existentes de versión exacta 17.6/TLS productivo y 17.11/loopback
local se mantienen. La verificación posterior mínima y las reglas de PID,
snapshot, locks/DDL, flags y drift no se relajan. Reconocer offline un pooler
no prueba su comportamiento remoto: la ejecución futura debe pasar todas las
comprobaciones de transporte y estabilidad. En este turno esta segunda barrera
sólo se ejercitó contra la restauración local.

## Certificación

Se añaden los 21 casos pedidos con valores sintéticos, más casos de SSL,
IPv6 mediante DNS oficial y negativos de identidad del servidor. Los tests
nunca comparan ni imprimen credenciales; los errores están sanitizados.
El formato real se validó offline sin persistir su contenido.

La certificación local vuelve a ejecutar los 30 escenarios del contrato y los
27 del runner READ ONLY (incluyendo timeout real, conexión propia perdida,
snapshot estable frente a commit concurrente y revocación). Después ejecuta
el certificador mutador original, sin modificaciones, en otra restauración
descartable. Todas las alteraciones de fixtures son exclusivamente locales.

El resultado y limpieza se registran en
`phase48-read-target-validation.cert.json`. No se ejecuta el preflight real ni
se genera aprobación ACTIVE. El código mutador y su transporte conservan las
restricciones previas; esta ampliación pertenece sólo a la entrada READ ONLY.

## Preservación STOPPED

El recibo `phase48-preflight-4854b15b-1f17-42a3-8f0a-41f324fa9160` se movió al
subdirectorio stopped-preflights del backup indicado, con manifiesto sanitizado.
Tamaño: 4167 bytes. SHA-256 antes/después:
`5758b3d4d45e6f5c30159fa17d3af85be1b2dac0d28de4f9167923db6e25cc7e`.
Se verificaron run_id, estado, ausencia de secretos/datos personales y árbol
limpio antes de crear la rama. Ningún recibo productivo nuevo se crea aquí.

Resultado final: 24/24 pruebas del target validator (incluyen los 21 casos
pedidos), 30/30 contrato, 27/27 runner READ ONLY y 22/22 mutador intacto.
Pasan 86/86 unitarias relacionadas, typecheck, build backend/frontend y
git diff --check. El frontend conserva sólo su aviso de chunks grandes.
Se verificó la identidad y huella del servidor local. Cluster detenido y
eliminado, puerto libre y temporales retirados; cero conexiones/escrituras
productivas. La entrada compilada sigue rechazando modos/flags mutadores.

**VALIDACIÓN DE DESTINO CORREGIDA — LISTO PARA REPETIR PREFLIGHT READ ONLY**
