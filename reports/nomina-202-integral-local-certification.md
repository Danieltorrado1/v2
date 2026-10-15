# Corrector integral 202/192: certificación local

**Decisión: CORRECTOR INTEGRAL CERTIFICADO LOCALMENTE.**

El alcance certificado es el ejecutor aislado para PostgreSQL embebido PGlite,
con fixtures económicos fieles y el cuerpo observado del trigger. No es una
certificación de ejecución productiva ni una restauración completa de producción.
No existe adaptador de mutación productiva. La CLI es PreviewOnly y rechaza Mutate.
No se abrieron conexiones productivas en esta etapa, ni siquiera de lectura.

Base conservada: `1effd71930d23a6e3fc26e9f8792858c6ef5995a`.
Continuación del worktree existente; informes, prototipo previo, fixture y pruebas
previas conservados. No hubo reset, clean, descartes, merge o deploy.

## 1. Tablas físicas certificadas antes de implementar

Se usó el catálogo READ ONLY preservado en
`nomina-202-account-trigger-readonly.json`, contrastado con el informe integral.
La identidad de auditoria_eventos se corroboró en `sql/phase-6-auditoria-total.sql`.

| Tabla física en public | Fila / operación local |
| --- | --- |
| nomina_movimientos | UPDATE id 192 |
| cobertura_cuenta_cobro_externa_detalle | UPDATE id 220, sin reemplazar su identidad |
| cobertura_cuentas_cobro_externas | UPDATE id 77 |
| nomina_revision_operativa | UPDATE id 20114, exclusivamente por trigger obligatorio |
| auditoria | 4 INSERT estrictos |
| auditoria_eventos | 4 INSERT estrictos |
| historial_cambios | 42 INSERT en este fixture: 4 snapshots y 38 diffs |

Historial es canónico: `insertLegacyAuditRows` del helper existente escribe
`__snapshot__` y `buildHistorialDiffRows` produce los diffs por campo.
El corrector conserva esa representación y endurece su atomicidad: no reutiliza
las rutas del helper que capturan errores y permiten continuar sin auditoría.
El run_id, operation_key y manifest_hash están en los after y snapshots; también
se registran como diffs. Las cuatro entidades comparten actor y run_id.
El número 42 depende de los valores sanitizados del fixture; un futuro before
productivo completo exige calcular su propio número exacto de diffs.

Ninguna octava tabla fue necesaria. Los intentos inducidos de escribir fuera del
alcance se rechazaron. El ejecutor verifica el inventario de triggers de usuario,
reglas y hash de función/trigger. Un trigger desconocido, incluso SECURITY DEFINER,
detiene la operación. El rol SQL restringido existe solo en el fixture local:
sin DELETE ni UPDATE externo; permisos por columnas y cuatro secuencias necesarias.
Se compara además todo el estado público para detectar filas o columnas ajenas.

Las secuencias de revisión y auditorías/historial son efectos físicos adicionales
de sus defaults/identity, no nuevas tablas funcionales. PostgreSQL no revierte
nextval con ROLLBACK. La certificación de rollback es de filas y registros de
auditoría; no promete restauración de los contadores de secuencia.

## 2. Before / after

El JSON de certificación contiene **las filas completas**, antes y después,
de las cuatro entidades; la referencia histórica se encuentra sanitizada/cifrada.
No se sustituyen esos snapshots por la tabla resumida siguiente:

| Entidad / campo | Before | After local |
| --- | --- | --- |
| Movimiento 192: cantidad | 1 | 2 |
| Movimiento: valor_unitario | 97.800 | 97.800 |
| Movimiento: valor_calculado / valor_total | 97.800 / 97.800 | 195.600 / 195.600 |
| Movimiento: estado / afecta_seguridad_social | PENDIENTE / false | PENDIENTE / false |
| Movimiento: updated_by / updated_at | NULL / timestamp previo | actor técnico local / timestamp transacción |
| Detalle 220: id / movimiento / turno | 220 / 192 / 202 | 220 / 192 / 202 |
| Detalle: días / valor diario / valor | 2 / 97.800 / 97.800 | 2 / 97.800 / 195.600 |
| Cuenta 77: total / estado | 97.800 / PENDIENTE | 195.600 / PENDIENTE |
| Cuenta: generado_bucket/path/at | Referencia histórica existente | NULL / NULL / NULL |
| Cuenta: firmado_bucket/path/at | NULL / NULL / NULL | NULL / NULL / NULL |
| Cuenta: updated_by / updated_at | actor previo / timestamp previo | actor técnico local / timestamp transacción |
| Revisión 20114: estado / versión | REVISADO / 30 | REQUIERE_REVISION / 31 |
| Revisión: revisado_por / revisado_at | Presentes | NULL / NULL |
| Revisión: invalidado_at / motivo | NULL / NULL | timestamp transacción / TA_MODIFICADO |
| Revisión: updated_at | timestamp previo | timestamp transacción |

Los demás campos permanecen idénticos. No se actualiza directamente revisión.
No se crea movimiento, detalle ni cuenta; no se llama al sincronizador, al
recálculo, a servicios de instituciones ni a endpoints de negocio.
Tarifa, fechas, novedades, turno, IBC y registros económicos ajenos quedan iguales.
La comprobación de IBC y otros periodos utiliza filas sintéticas protegidas:
no se exportaron ni se certificaron aquí totales salariales personales reales.

## 3. Seguridad del ejecutor y autorización

`src/scripts/nomina-turno-202-integral-local.ts` no importa pg, dotenv, configuración
de base, clientes de Storage ni servicios de negocio. Rechaza executors distintos
de una instancia PGlite antes de emitir consultas. Mutate está deshabilitado por
defecto; la CLI no lo admite. La función local requiere opt-in explícito.

Actor obligatorio: usuario activo y presente en la lista técnica local validada.
El actor 9001 y esa lista son sintéticos; no se eligió ni autorizó actor productivo.
El ticket local liga manifiesto completo, actor, run_id, nonce aleatorio de 192 bits,
confirmación literal y expiración máxima de cinco minutos (un minuto por defecto).
Se guarda su digest en memoria: clonar o alterar ticket/expiración lo invalida.
Los tickets son exclusivamente de simulación y no se serializan como permisos
productivos. La frase futura revocada no es una entrada aceptada por el ejecutor.

Transacción SERIALIZABLE; advisory xact lock `(202,192)` con try-lock; lock_timeout
2 segundos; statement_timeout 10 segundos; filas bloqueadas en orden fijo.
Un guard local impide intercalar transacciones sobre la misma sesión embebida.
Se exige before completo exacto, se verifican guardas de cada UPDATE, efecto del
trigger, auditorías correlacionadas, historial, archivo y write-set antes del COMMIT.
La segunda ejecución con el mismo ticket o uno nuevo devuelve ALREADY_APPLIED con
el run_id original, cero cambios y cero auditorías/historial adicionales.
Una auditoría incompleta o drift posterior no se acepta como idempotencia.

## 4. PDF histórico y custodia

El PDF productivo previamente descargado sigue físicamente intacto en su copia
local; se comprobó SHA-256:
`cf061de69f85976bd884439e12a58281bde4d32d2542b36e653a96a3a9c7d8a4`.
No se descargó otra copia ni se emitieron solicitudes a Storage en esta etapa.
No se borró, sobrescribió ni reutilizó su clave. El original con datos personales
y sus imágenes permanecen locales y **no se incluyen en el commit/push**.

Dentro de la transacción local solo se invalidan generado_bucket/path/at de
cuenta 77. Auditoría conserva alias sanitizado, SHA-256 del contenido, SHA-256 de
bucket/path y un envelope AES-256-GCM de la referencia completa, autenticado con
operation_key. El JSON de auditoría e historial no contiene la ruta en claro.
El descifrado se prueba antes del cambio, durante la idempotencia y releyendo una
clave local persistida tras la simulación. Las claves de prueba permanecen bajo
`tmp/nomina-202-local-custody/`, fuera del commit y del push.

La referencia y los bytes usados dentro del fixture son sanitizados/sintéticos;
no son la referencia o bytes personales originales. La comprobación del hash
del original real se ejecuta separadamente sobre la copia local conservada.
Para producción faltaría provisionar una clave duradera con key_id y custodia
externa comprobada. No se permite perder la clave ni usar una clave de prueba.
El modelo permite esta conservación sin añadir tablas.

Invalidar la referencia impide nuevas descargas por el endpoint habitual de la
cuenta; no borra copias externas ni revoca de inmediato URLs firmadas ya emitidas.
No se propone modificar por SQL el catálogo storage.objects.

## 5. Generación/versionado y compensación

Flujo existente comprobado en `cobertura.externos.service.ts`:
PDFKit genera bytes en memoria en la aplicación; `.storage.from(...).upload`
los envía a Supabase Storage externo, con upsert=false; después actualiza la
cuenta y hace COMMIT. No usa filesystem productivo para el PDF. Su catch hace
ROLLBACK SQL pero no compensa una subida ya completada: podría quedar objeto
huérfano. Ese flujo también invoca el sincronizador que recrea detalles, por lo
que **no se utiliza para esta corrección**.

Preparación nueva: `nomina-turno-202-document-local.ts`, sin adaptadores productivos.
Protocolo probado con Storage en memoria y puertos locales:

1. Solo después del COMMIT económico, producir bytes del documento nuevo.
2. Parsear el PDF y verificar cuenta/turno/movimiento/detalle, días=2,
   diario=97.800 y TOTAL A COBRAR=195.600; rechazar el total antiguo.
3. Calcular SHA-256 de los bytes. Clave nueva e inmutable:
   `cobertura/cuentas-cobro/77/versiones/<run_id>/CUENTA_77_195600_<sha256>.pdf`.
4. Persistir intención PREPARED antes de subir; subir sin sobrescribir; releer,
   comparar hash y validar otra vez el importe. Persistir UPLOADED y VERIFIED.
5. Publicar referencia solo tras VERIFIED, con una transacción futura condicionada
   a cuenta 77 PENDIENTE, total 195.600 y referencia nula o la misma versión.
   La publicación y sus auditorías/historial deberán ser atómicas e idempotentes
   por run_id/clave/hash. Mantener PENDIENTE incluso después de verificar.

Los puertos `persistIntent` y `publishPendingReference` son simulaciones locales;
no se conectaron a tablas productivas. La intención futura se registraría en los
repositorios de auditoría ya existentes, dentro del mismo conjunto de tablas,
sin introducir una tabla de jobs. No se certifica una publicación SQL/Storage
productiva ni un proceso de recuperación tras caída real de infraestructura.

Compensación preparada: si creación, carga, verificación o publicación falla
después del COMMIT económico, no revertir los importes ya confirmados; mantener
cuenta PENDIENTE sin referencia nueva vigente, preservar original y nuevo objeto
en preparación, y reconciliar/reintentar por intención duradera y la misma clave.
El adaptador futuro debe bloquear cualquier emisión/envío/pago hasta verificación.
Si falla el registro final tras una publicación exitosa, releer cuenta/clave/hash
y completar el registro sin publicar otra vez ni duplicar auditorías. No borrar
automáticamente evidencia como compensación. Ninguna de estas acciones se ejecutó
en producción.

El comprobante local es sanitizado y dice SIN VALIDEZ DE COBRO; se extrajo texto
con pypdf y se revisó visualmente su página renderizada. Hash reproducible:
`8f9055a89b1cebf1a2964821648bc9b7692fb4e98222b8265663f4c1af4143c9`.
No se presenta como documento productivo listo o emitido.

## 6. Simulación y fallos inducidos

**52 pruebas: PASS, 0 fallos**: 30 del integral, 8 documentales y 14 del prototipo
previo. Registro completo en `nomina-202-combined-local-tests.log`.

Se probaron rechazo/rollback con estado de filas idéntico al inicio de cada caso:
drift de movimiento, cuenta no PENDIENTE, detalle cambiado, revisión distinta de
v30, cuenta firmada, tarifa e IBC alterados, detalle adicional, y archivo aprobado,
enviado, firmado, pagado o contabilizado. Estos cinco indicadores documentales
son evidencia externa simulada: el esquema de cuenta observado no tiene todos
esos estados/campos; para producción se requeriría evidencia autorizada de esos
sistemas, no inferir su ausencia de la sola palabra PENDIENTE.

Fallos tras escrituras parciales: auditoria_eventos, auditoria, historial y última
verificación documental; todos revierten las cuatro filas y las auditorías
anteriores. Trigger ausente/deshabilitado, trigger de tabla adicional, efecto
sobre fila ajena, intento sobre instituciones, SECURITY DEFINER desconocido,
historial incompleto, nonce/confirmación/expiración/actor/clave incorrectos y
peticiones simultáneas también se rechazan. Los triggers adicionales se detectan
antes de DML; el rol restringido prueba una segunda barrera de permisos.

Fallas documentales posteriores al commit: render, importe incorrecto, intención,
upload, corrupción de readback y publicación. Se preservan los objetos y se
prueba reintento por la misma clave. No se simula un rollback imposible del
commit económico ya completado.

## 7. Verificación y Git

- Typecheck backend: PASS.
- Build backend: PASS.
- Build FrontendNuevo: PASS; solo advertencia de tamaño de chunks. Se instalaron
  sus dependencias con npm ci --ignore-scripts; no cambió package-lock ni código.
- Pruebas combinadas compiladas: 52/52 PASS.
- Generador de evidencia local y comprobación del PDF histórico: PASS.
- Diff-check de archivos preparados: PASS.
- Hashes de los cinco artefactos heredados: coinciden con el manifiesto preservado.

Reproducción: `npm run build`; `node --test dist/tests/nomina.case202-integral-local.test.js dist/tests/nomina.case202-document-local.test.js dist/tests/nomina.case202-controlled-preview.test.js`.
El certificador de artefactos es
`node dist/scripts/certify-nomina-turno-202-integral-local.js`; requiere Python/pypdf
y la copia histórica local para verificar su hash. Nunca carga .env.

Rama definitiva solicitada: `fix/nomina-turno-202-correction-integral`.
Solo se publica esa rama. El SHA del commit y la verificación remota se entregan
en la respuesta final; no se integra a main. PDFs personales, claves locales y
diagnósticos temporales permanecen sin rastrear y preservados.

## 8. Frase futura revocada

**REVOCADA/NO UTILIZABLE. NO ES AUTORIZACIÓN ACTUAL NI UNA CLI EJECUTABLE.**

> REVOCADA/NO UTILIZABLE — AUTORIZO CORRECCION INTEGRAL empresa=15 contrato=24 periodo=3 turno=202 movimiento=192 cuenta=77 detalle=220 empleado=837 revision=20114 cantidad=1->2 unitario=97800 calculado=97800->195600 total=97800->195600 revision_version=30->31 estado=PENDIENTE afecta_seguridad_social=false INVALIDAR_REFERENCIA_PDF_PRESERVAR_OBJETO SIN_RECALCULO SIN_REGENERACION_PRODUCTIVA write_set=nomina_movimientos,cobertura_cuenta_cobro_externa_detalle,cobertura_cuentas_cobro_externas,nomina_revision_operativa,auditoria,auditoria_eventos,historial_cambios actor=<PENDIENTE> run_id=<PENDIENTE> nonce=<PENDIENTE> expires_at=<PENDIENTE>

La ejecución productiva sigue detenida. Faltan autorización futura explícita,
actor real, custodia de clave, evidencia documental externa, confirmación de SYNC
y un adaptador productivo separado con sus propias precondiciones y certificación.
La prueba local no salta esas condiciones.

**Cero conexiones/escrituras productivas; cero recálculos; cero PDFs productivos
generados, eliminados o modificados; cero migraciones/seeds productivos; cero
cambios en instituciones; cero merge/deploy.**
