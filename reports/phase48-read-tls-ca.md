# Certificación local de CA externa para READ ONLY

Base: `fix/phase48-read-target-validation`, `e0686e36d82020868abb94b89d7a6b7220ff5dc9`.
Rama de entrega: `fix/phase48-read-tls-ca`.

El diagnóstico `phase48-transport-3869d5a2-11b1-4d9b-a270-279eb189ea43`
se preservó en el archivo solicitado dentro de `EmpiriaBackups/stopped-preflights`,
con manifiesto sanitizado, tamaño 5538 bytes y SHA-256
`667C802D2818FB3EC00135B832761F9B8C3C4250DEF6D6F4117ACD4B74031CA7`.
Se verificó igualdad del hash tras moverlo y working tree limpio antes de crear la rama.

El certificado externo tiene 1367 bytes y SHA-256
`700723581420DD1AC98FD7E9AC529F0EF210EADCAF87FC868A3AD7D114C2F3B7`.
Es X.509/PEM, CA=true en Basic Constraints, Key Usage permite firma de certificados,
autofirmado con firma verificada y vigente entre 2021-04-28 y 2031-04-26.
Sujeto y emisor: Supabase Root 2021 CA, Supabase Inc, New Castle, Delware, US.
No se instala en Windows ni se copia al repositorio.

## Configuración

`PHASE48_SSL_ROOT_CERT_PATH` exige ruta absoluta, sin symlinks/junctions en sus
componentes, archivo regular fuera del repositorio y dentro de una allowlist.
`PHASE48_SSL_ROOT_CERT_ALLOWLIST` admite un arreglo JSON de directorios absolutos;
su valor predeterminado es el directorio externo EmpiriaCertificates indicado.
`PHASE48_SSL_ROOT_CERT_SHA256` es obligatorio y admite ambas cajas hexadecimales.
El tamaño esperado fijo es 1367 bytes. Windows verifica ACL por SID: sólo el
usuario ejecutor, SYSTEM y Administradores pueden tener permisos de escritura,
borrado o modificación de permisos. Una comprobación fallida detiene la operación.

Node pg recibe campos separados, nunca `connectionString`, y:

```text
ssl.ca = bytes del archivo externo leídos en memoria
ssl.rejectUnauthorized = true
ssl.servername = hostname validado de DATABASE_URL
ssl.checkServerIdentity = node:tls.checkServerIdentity
max = 1
connectionTimeoutMillis = 10000
idleTimeoutMillis = 1000
```

Se rechazan parámetros URL no permitidos, duplicados y modos SSL inseguros.
Los parámetros SSL admitidos no se pasan al driver y no pueden reemplazar el objeto SSL.
Se rechazan NODE_TLS_REJECT_UNAUTHORIZED=0, PGSSLMODE y PGSSLROOTCERT en el entorno.
No hay fallback sin TLS, almacén CA global ni modificación de DATABASE_URL.

Se conserva el transaction pooler 6543 y pg 8.21.0. Las consultas no tienen `name`
y usan el protocolo simple salvo consultas parametrizadas sin nombre. No se usan
prepared statements persistentes. Las opciones de sesión de inicio se omiten
en producción; el contrato existente establece aislamiento y ajustes con BEGIN
y SET LOCAL dentro de cada transacción. Se conserva una sola conexión principal
para PreflightAndPreview y max=1; el postcheck certificado conserva su conexión
posterior separada, después de destruir la principal, como exige la regresión 30/30.

## Verificación local

- Certificados sintéticos exclusivos: CA válida, equivocada, vencida, no CA,
  malformada, servidor localhost y clave privada exclusiva de prueba.
- 35 comprobaciones TLS, incluyendo conexión real loopback con TLS y driver pg,
  CA equivocada, hostname incorrecto, servidor sin TLS, ACL insegura, ruta/hash
  ausentes, hash incorrecto y ambas cajas, ruta relativa/inexistente, directorio,
  junction/symlink, archivo dentro del repositorio, allowlist y SSL contradictorio.
- 39/39 pruebas relacionadas; recibos sanitizados y cero archivos residuales
  de las pruebas TLS. Atributos Git preservan los bytes de fixtures.
- Restauración local aislada: READ ONLY 30/30; runner anterior 27/27;
  mutador intacto 22/22; LOCAL_RESTORATION_REQUIRED intacto.
- Typecheck y builds backend y FrontendNuevo satisfactorios.
  El build adicional de Frontend legado no inicia: Vite no está instalado allí.
- `git diff --check` y `git diff --cached --check` satisfactorios.
- Escaneo por streaming de todos los objetos Git y archivos versionados:
  1,276,040,990 bytes examinados; cero coincidencias de contenido del CA productivo.
- `.gitignore`, mutador, dominio histórico, runner histórico y SQL Phase 48 intactos.
- Cluster de certificación detenido y eliminado; temporales crudos eliminados.
  Cero conexiones o escrituras productivas durante certificación local.

## Sonda mínima posterior al commit/push

La entrada `phase48-readonly-tls-probe.ts` exige rama correcta, working tree limpio
y HEAD igual al upstream. No importa preflight ni mutador, no consulta health ni
tablas, no crea recibos y verifica TLS antes de enviar SQL. Sólo ejecuta:

```sql
BEGIN TRANSACTION READ ONLY;
SELECT current_setting('transaction_read_only'), current_setting('server_version'), pg_backend_pid();
ROLLBACK;
```

Lee el resultado como arreglo para conservar las dos columnas current_setting
sin cambiar el SQL autorizado. Exige read_only=on y PostgreSQL 17.x. El resultado
sanitizado se entrega por stdout después del commit/push, sin alterar este informe.
Un fallo detiene la operación. Finalmente destruye PoolClient, cierra Pool y limpia
DATABASE_URL, PGPASSWORD, PRODUCTION_MIGRATION_DATABASE_URL y variables CA temporales.
Esta certificación no autoriza ni ejecuta preflight completo, migración, merge o deploy.
