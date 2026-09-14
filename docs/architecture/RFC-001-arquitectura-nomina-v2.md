# RFC-001 — Arquitectura del Dominio de Nómina V2 de EMPIRIA

## 1. Encabezado

| Campo | Valor |
|---|---|
| Código | RFC-001 |
| Título | Arquitectura del Dominio de Nómina V2 de EMPIRIA |
| Estado | Aceptado con decisiones pendientes |
| Autor | Equipo de Arquitectura de Software EMPIRIA |
| Fecha | 2026-09-14 |
| Revisores | Por asignar: negocio de nómina, contabilidad/tesorería, RR. HH., seguridad y tecnología |
| Contexto afectado | Personal, Vinculaciones, Cobertura, Nómina, Prestaciones, Terminación laboral, Documentos, Pagos, OPS/Cuentas de cobro y Exportaciones |
| Versión | 1.0 |

Este documento es una propuesta de arquitectura. No autoriza por sí mismo cambios de código, esquema, migraciones, endpoints ni frontend.

## 2. Resumen ejecutivo

La auditoría del dominio confirmó que `nomina_periodos` funciona como root principal, pero que `nomina_empleados` mezcla el snapshot de la vinculación, el espacio mutable de cálculo y el resultado acumulado. También confirmó que `nomina_movimientos` es un contenedor universal para recargos, bonos, auxilios, descuentos, embargos, ajustes manuales y `TURNO_EXTERNO`. No existen, como entidades de dominio independientes, `Turno` ni `CuentaCobro`; esta última aparece actualmente únicamente como método de pago en vinculaciones.

El modelo actual genera deuda técnica porque no separa hechos de cálculo, resultados versionados, aprobaciones, pagos y documentos. Esto dificulta reproducir una liquidación, impide identificar con precisión qué corrida produjo un resultado, aumenta el riesgo de dobles pagos y obliga a repetir joins y reglas en servicios. La auditoría también confirmó SQL embebido en servicios, ausencia de una capa de repositorios, acoplamiento fuerte con documentos/exportaciones/PDF y una integración insegura entre Cobertura y Nómina.

Nómina V2 propone un dominio compuesto por `PeriodoNomina`, `ParticipantePeriodo`, `EventoNomina`, `CorridaCalculoNomina`, `ResultadoNominaEmpleado`, `DesprendibleNomina`, `LiquidacionRetiro`, `PagoNomina`, `TurnoCobertura` y `CuentaCobro`, con `CuentaCobroDetalle` y `CalendarioLaboral` como componentes complementarios. Las decisiones de negocio sobre `TurnoCobertura` y `CuentaCobro` quedan cerradas en este RFC: se definen las variantes interna adicional, interna sustitutiva y externa; la duración conserva días efectivos; la ubicación y el motivo son obligatorios; las tarifas son contractuales y versionadas; solo Talento Humano aprueba; y los turnos externos se consolidan mensualmente por persona, contrato y período. Los inputs operativos serán distintos de los resultados calculados; las corridas serán explícitas, auditables e idempotentes; los documentos y exportaciones consumirán resultados versionados sin participar en el cálculo.

El RFC queda aceptado con decisiones pendientes únicamente sobre el modelo definitivo de pago, el proceso operativo con Contabilidad y la definición final de `CalendarioLaboral`.

Se esperan estos beneficios: trazabilidad de extremo a extremo, reproducibilidad, aislamiento por empresa y contrato, menor riesgo de doble pago, evolución incremental sin migración destructiva, separación segura entre empleados laborales y OPS, y una API que exponga conceptos de dominio en vez de reconstruir joins en el frontend.

## 3. Contexto actual

### 3.1 Flujo confirmado por la auditoría

```text
Persona
  → Vinculación
    → Período
      → NominaEmpleado
        → Asistencia / Novedades / Movimientos
          → Recalcular
            → Liquidación
              → Desprendible
                → Exportación / Pago
```

Este flujo representa el estado actual auditado; no debe interpretarse como el flujo objetivo de V2.

### 3.2 Responsabilidades actuales confirmadas

| Elemento | Responsabilidad observada | Problema arquitectónico asociado |
|---|---|---|
| `nomina_periodos` | Agrupar el procesamiento de nómina por período y actuar como root principal. | Concentra el ciclo de vida global, pero no tiene una separación explícita entre incorporación, cálculo, revisión, cierre y pago. |
| `nomina_empleados` | Mantener la relación de una persona/vinculación con el período, datos tomados como snapshot, datos mutables de cálculo y resultado acumulado. | Mezcla input, estado de proceso y output; una actualización puede alterar la base histórica y el resultado. |
| `nomina_asistencia_diaria` | Registrar información diaria de asistencia utilizada por el cálculo. | Su relación con eventos aprobados, turnos y resultados no está modelada como un flujo de dominio explícito. |
| `nomina_novedades` | Capturar novedades que afectan la liquidación. | Se requiere distinguir la novedad como input, su aprobación/rechazo y el efecto calculado. |
| `nomina_movimientos` | Contener recargos, bonos, auxilios, descuentos, embargos, ajustes manuales y `TURNO_EXTERNO`. | Sobrecarga semántica; mezcla fuentes, naturaleza, aprobación y efecto financiero. |
| `nomina_liquidaciones` | Representar la liquidación del período o del empleado. | No hay una relación formal con una corrida inmutable/versionada ni una garantía declarada de reproducibilidad. |
| `nomina_desprendibles` | Generar o almacenar la representación documental de la liquidación. | Está acoplado al cálculo y debe conservar la versión exacta del resultado que lo originó. |
| Prestaciones sociales | Resolver conceptos de prestaciones como vacaciones, cesantías, intereses y prima, según el alcance actualmente existente. | Deben consumir datos contractuales y resultados, sin convertirse en almacenamiento genérico de movimientos. |
| `documentos_persona` | Gestionar documentos asociados a la persona. | No debe ser la fuente del cálculo ni quedar acoplado a la corrida o al pago; debe operar como contexto documental. |

La tabla anterior documenta responsabilidades observadas o confirmadas; no afirma columnas, constraints ni endpoints que no estén incluidos en la auditoría.

## 4. Problemas identificados

### CRÍTICOS

1. `nomina_empleados` mezcla snapshot de vinculación, inputs mutables, cálculo y resultado acumulado. Esto compromete la inmutabilidad histórica y la capacidad de reconstruir una liquidación.
2. `nomina_movimientos` es un contenedor universal para conceptos de naturaleza y ciclo de vida distintos, incluido `TURNO_EXTERNO`. Esto oculta invariantes específicas y permite confundir un hecho operativo con un valor calculado.
3. No existe una entidad `Turno` ni una entidad `CuentaCobro`. La ausencia de identidad propia impide garantizar que un turno no se pague dos veces y que una cuenta no incluya el mismo turno más de una vez.
4. No existe una `CorridaCalculoNomina` explícita. No puede garantizarse, de forma auditable, qué versión de reglas, inputs y usuario produjo un resultado.
5. La cobertura no se integra de forma segura con Nómina. El cruce entre turnos, contratos, empresas y pagos queda expuesto a dobles conteos o manipulación de identificadores.
6. Existe riesgo de dobles pagos por falta de una identidad de pago y de una prueba de ejecución vinculada al concepto liquidado.

### ALTOS

1. SQL embebido en servicios y ausencia de capa de repositorios; las decisiones de persistencia quedan mezcladas con reglas de dominio y se repiten joins.
2. Inputs y resultados no tienen límites claros. Una corrida automática puede sobrescribir o confundirse con un ajuste manual.
3. Falta de historial de corridas y de diferencias entre corridas.
4. Acoplamiento de Nómina con documentos, exportaciones y PDF; los formatos de salida influyen indebidamente en el núcleo de cálculo.
5. Estados expresados como strings dispersos, sin máquinas de estado ni permisos por transición.
6. Falta de trazabilidad de pagos, de reversión controlada y de evidencia de ejecución.
7. Aislamiento insuficientemente explícito entre OPS y empleados laborales.

### MEDIOS

1. Joins repetidos para reconstruir contexto de persona, vinculación, contrato, período y conceptos.
2. Dificultad para recalcular por lotes sin bloquear operaciones de captura o revisión.
3. Falta de contratos claros para exportaciones y dashboards.
4. Falta de un modelo uniforme para correcciones posteriores al cierre.
5. Ausencia de una decisión formal sobre `CalendarioLaboral` y sobre el momento en que un turno se convierte en efecto de nómina.

### BAJOS

1. Nombres de conceptos y estados pueden variar entre pantallas, servicios y documentos.
2. La generación de desprendibles y exportaciones puede duplicar lógica de presentación.
3. La falta de un vocabulario común dificulta el soporte y la capacitación operativa.

## 5. Lenguaje ubicuo

| Término | Definición única |
|---|---|
| Período de nómina | Intervalo y unidad administrativa dentro de la cual se incorporan participantes, se reciben eventos, se calcula, revisa y cierra una nómina. |
| Participante del período | Snapshot contextual de una vinculación elegible dentro de un período específico. No es la vinculación maestra ni el resultado. |
| Evento de nómina | Hecho o solicitud con potencial efecto en nómina, registrado con origen, período, participante, estado y auditoría. |
| Novedad | Tipo de evento de nómina que comunica una variación operativa, contractual o administrativa que debe ser validada antes de afectar el cálculo. |
| Movimiento | Efecto económico normalizado producido por una regla, un evento aprobado o un ajuste autorizado. No es un almacén universal de inputs. |
| Recargo | Incremento económico derivado de una condición de tiempo, jornada, turno o regla laboral aprobada. |
| Turno | Unidad operativa de cobertura con fecha, horario/valoración, asignación, origen y estado propios. |
| Turno interno | Turno de cobertura prestado por una persona con vinculación laboral elegible para el tratamiento laboral definido por negocio. Requiere confirmación de la definición exacta. |
| Turno externo | Turno de cobertura prestado bajo el régimen OPS o externo definido por negocio, potencialmente liquidable mediante cuenta de cobro. Requiere confirmación del alcance exacto. |
| Corrida de cálculo | Ejecución identificable e idempotente de reglas sobre un conjunto congelado de inputs y una versión de configuración, que produce resultados versionados. |
| Resultado de nómina | Resultado económico y explicativo para un participante generado por una corrida concreta. Es inmutable después de publicado, salvo nueva versión. |
| Liquidación laboral | Resultado o proceso de determinación de conceptos laborales de un empleado, incluido el retiro cuando corresponda. |
| Desprendible | Representación documental de un resultado de nómina publicado, vinculada a la versión exacta del resultado y a la corrida que lo originó. |
| Cuenta de cobro | Documento/aggregate de solicitud de pago para servicios OPS o externos, compuesto por detalles de turnos aceptados y evidencia requerida. |
| Pago | Intento y/o confirmación de transferencia de un resultado, desprendible o cuenta de cobro, con estado, referencia y evidencia de ejecución. |
| Snapshot | Copia contextual, fechada y asociada a un aggregate que preserva los datos usados en una decisión histórica. |
| Cierre | Transición controlada de un período o documento que impide nuevas modificaciones ordinarias y fija la base histórica. |
| Reapertura | Autorización excepcional para volver a procesar un período cerrado mediante una nueva versión/corrida, con motivo y auditoría; no implica editar silenciosamente el pasado. |
| Anulación | Transición que invalida el uso operativo futuro de un aggregate sin borrar su historia ni sus evidencias. |

## 6. Bounded Contexts

| Contexto | Responsabilidad y entidades propias | Publica | Consume | Límites e integraciones permitidas |
|---|---|---|---|---|
| Personal | Identidad y datos maestros de personas. Entidades propias: Persona e identificaciones, según el modelo vigente. | Identidad estable y cambios auditados. | Ningún resultado de nómina. | Nómina no edita Persona; consume referencias autorizadas. |
| Vinculaciones | Relación persona-empresa-contrato, condiciones y elegibilidad. | Snapshot contractual y vigencia. | Persona y configuración empresarial. | No calcula nómina ni registra pagos. |
| Cobertura | Planificación, asignación, registro, edición auditada y aprobación de turnos. Entidad propia: `TurnoCobertura`. | Turno registrado/aprobado/anulado, días efectivos, ubicación, motivo y snapshot tarifario. | Persona, Vinculación, calendario y reglas autorizadas. | No escribe resultados de nómina ni cuentas de cobro directamente; usa contratos de integración. Solo Talento Humano aprueba. |
| Nómina Core | Períodos, participantes, eventos, corridas y resultados. Entidades: `PeriodoNomina`, `ParticipantePeriodo`, `EventoNomina`, `CorridaCalculoNomina`, `ResultadoNominaEmpleado`. | Resultado publicado, estado del período y eventos de dominio. | Snapshots de Vinculaciones, eventos aprobados y configuración. | No genera PDF ni ejecuta pagos. |
| Prestaciones | Cálculo y ciclo de prestaciones sociales y sus bases. Entidades propias según reglas aprobadas. | Componentes o resultados de prestaciones. | Resultados, vínculo, antigüedad y configuración. | No modifica resultados de nómina publicados. |
| Terminación laboral | Retiro, liquidación final y conceptos de terminación. Entidad: `LiquidacionRetiro`. | Liquidación de retiro aprobada. | Vinculación, períodos y resultados. | No borra períodos ni sustituye una corrida ordinaria. |
| Documentos | Metadatos, versiones y evidencias documentales. Entidades documentales. | Documento generado/validado. | Resultado, cuenta de cobro, pago y requisitos. | Se integra por referencias y comandos; no contiene reglas de cálculo. |
| Pagos | Preparación, envío, confirmación, rechazo y reversión operativa. Entidad: `PagoNomina`. | Pago preparado/confirmado/rechazado y evidencia. | Resultado publicado, desprendible, cuenta de cobro y datos bancarios autorizados. | No recalcula importes ni altera resultados. |
| OPS / Cuentas de cobro | Agrupación mensual de turnos externos aprobados de una persona bajo un contrato. Entidades: `CuentaCobro`, `CuentaCobroDetalle`. | Cuenta generada/aprobada/anulada y documento de cuenta. | Turnos externos aprobados, proveedor/contrato y documentos. | Una cuenta por persona externa + contrato + período; no debe usar el modelo laboral como sustituto. |
| Exportaciones | Proyecciones para bancos, contabilidad, reportes y formatos externos. | Archivo/proyección y estado de entrega. | Resultados, pagos y cuentas aprobadas. | Es consumidor; no es fuente de verdad ni actualiza el cálculo. |

Las integraciones entre contextos se harán por contratos de aplicación, eventos de dominio publicados o lecturas autorizadas mediante repositorios/proyecciones. No se permite que un contexto escriba directamente tablas privadas de otro.

## 7. Modelo canónico de Nómina V2

### 7.1 Principios

- `PeriodoNomina` es el aggregate root del ciclo de nómina, pero no contiene físicamente todos los datos de sus participantes.
- Inputs, decisiones y resultados tienen identidades y ciclos de vida separados.
- Las corridas producen resultados versionados; no actualizan silenciosamente resultados históricos.
- Los snapshots preservan el contexto que se usó para liquidar, aunque cambie el maestro posterior.
- La persistencia se accede mediante repositorios; el dominio no conoce SQL.

### 7.2 Entidades y aggregates

| Entidad | Propósito | Invariantes y estados | Relaciones, creación y modificación | Consumidores | Mutabilidad y snapshots |
|---|---|---|---|---|---|
| `PeriodoNomina` | Orquestar el ciclo de un período. Aggregate root principal. | Un período pertenece a una empresa, tiene rango y reglas de solapamiento; estados: BORRADOR, ABIERTO, EN_REVISION, CERRADO, PAGADO, ANULADO. | Lo crea Nómina autorizada; lo modifica el rol de nómina/aprobador según transición. Contiene referencias a participantes, eventos y corridas. | Dashboards, documentos, pagos y exportaciones. | Metadatos de cierre y configuración usada deben quedar congelados; el período no se reescribe por una nueva corrida. |
| `ParticipantePeriodo` | Representar la elegibilidad y contexto de una persona/vinculación dentro del período. | Un participante no cruza empresa ni contrato sin autorización; una vinculación no debe incorporarse dos veces al mismo período. | Lo crea la incorporación de Nómina desde Vinculaciones; solo lo modifica una operación autorizada antes del cierre. | Eventos, corridas, resultados y desprendibles. | Snapshot obligatorio de empresa, contrato/vinculación, cargo, modalidad, base y demás datos necesarios para explicar el cálculo. |
| `EventoNomina` | Capturar hechos, novedades y solicitudes que pueden afectar el cálculo. | Debe tener origen, tipo, sujeto, período, estado y auditoría; estados: BORRADOR, PENDIENTE, APROBADO, RECHAZADO, ANULADO. | Lo crea el contexto que origina el hecho; lo aprueba un rol distinto cuando la segregación aplique; Nómina lo consume, no lo transforma en silencio. | Corridas, auditoría, dashboards y revisión. | Input mutable hasta aprobación; después de aprobado/anulado no se edita: se corrige con nueva versión o evento compensatorio. |
| `CorridaCalculoNomina` | Registrar una ejecución reproducible de reglas sobre inputs congelados. | Unicidad lógica por período, conjunto de inputs, versión de reglas y clave de idempotencia; estados: PENDIENTE, EJECUTANDO, COMPLETADA, FALLIDA, INVALIDADA. | La inicia Nómina; un worker la ejecuta; un responsable la invalida con motivo. | Resultados, diferencias, auditoría y documentos. | Inmutable en sus parámetros; sus resultados no se sobrescriben. |
| `ResultadoNominaEmpleado` | Guardar el resultado económico y explicativo de un participante para una corrida. | Pertenece a una única corrida y participante; no puede publicarse si faltan validaciones; una nueva corrección produce nueva versión. | Lo crea la corrida; lo revisa/aprueba Nómina; no lo modifica Documentos ni Pagos. | Desprendibles, exportaciones, pagos y reportes. | Inmutable después de publicado; conserva detalle de reglas, bases, deducciones, novedades aplicadas y snapshots relevantes. |
| `DesprendibleNomina` | Exponer documentalmente un resultado publicado. | Debe apuntar a una versión exacta del resultado y corrida; no se regenera sobre otro resultado con el mismo identificador. | Lo genera Documentos por comando de Nómina; lo anula/reemite con nueva versión autorizada. | Persona, Documentos y usuario final. | Inmutable como versión; el archivo y metadatos son evidencia. |
| `LiquidacionRetiro` | Resolver la liquidación final de una vinculación laboral terminada. | No puede coexistir como liquidación final aprobada duplicada para el mismo retiro; referencia las bases y período de corte. | La crea Terminación laboral; consume snapshots, resultados y Prestaciones; la aprueba el rol definido por negocio. | Documentos, pagos y auditoría. | Inmutable al aprobar; corrección por nueva versión. |
| `PagoNomina` | Controlar la preparación y ejecución de un pago. | Debe referenciar una única obligación/resultado o cuenta, tener idempotency key y evidencia de ejecución; evita doble confirmación. | Lo crea Pagos a partir de un resultado/cuenta aprobada; lo modifica Pagos según respuesta del proveedor/tesorería. | Exportaciones, auditoría, documentos y conciliación. | Estados operativos pueden avanzar; el importe y la obligación de origen no se editan. |
| `TurnoCobertura` | Representar una cobertura de uno o varios días, con variante interna adicional, interna sustitutiva o externa. | Identidad única; días efectivos conservados; ubicación jerárquica obligatoria; motivo REEMPLAZO o VACANTE_SIN_TITULAR; no puede pagarse dos veces ni impactar antes de aprobación; estados: BORRADOR, PENDIENTE, APROBADO, RECHAZADO, LIQUIDADO, PAGADO, ANULADO. | Lo registran Talento Humano o Gestores; solo Talento Humano lo aprueba. Nómina u OPS lo consume según tipo. Puede editarse después de aprobado, pero cada campo modificado debe auditarse. | Nómina Core, OPS, reportes, Documentos y Pagos. | Hecho operativo mutable con historial append-only. Conserva snapshot de días, persona, empresa, contrato, modalidad, tipo de turno, tarifa aplicada y vigencia tarifaria. |
| `CuentaCobro` | Agrupar y controlar la cuenta mensual de turnos externos de una persona. Aggregate root propio. | Una sola cuenta por persona externa + contrato + período; solo detalles de la misma empresa/contrato/período; no incluye turnos duplicados; estados: BORRADOR, GENERADA, APROBADA, PAGADA, ANULADA. | La crea OPS; se genera automáticamente con los turnos externos aprobados; se modifica antes de generar/aprobar según permisos. Pagos consume la aprobada. | Documentos, Pagos, Exportaciones y auditoría. | Identidad, detalles y total quedan congelados al generar; corrección mediante anulación/nueva cuenta o nueva versión auditada. |
| `CuentaCobroDetalle` | Asociar un turno externo único a una cuenta y conservar su valor/evidencia. | Un turno no puede repetirse dentro de la cuenta ni estar simultáneamente comprometido en dos cuentas aprobadas; puede tener días, sedes, instituciones y modalidades diferentes respecto de otros detalles. | Lo crea OPS al consolidar el período; no lo modifica Nómina Core. | Cuenta, Documentos, Contabilidad y Pagos. | Snapshot del turno, fechas, ubicación, modalidad, cantidad de días, tarifa aplicada y subtotal al momento de generación. |
| `CalendarioLaboral` | Proveer jornadas, festivos y reglas temporales para valorar asistencia/turnos. | Debe tener versión, jurisdicción y vigencia; una corrida debe referenciar una versión. | Lo administra Configuración/Negocio; lo consumen Cobertura y Nómina. | Corridas, validación de turnos y prestaciones. | Versionado; no se altera una versión usada históricamente. Su aprobación queda pendiente. |

### 7.3 Decisión sobre `CalendarioLaboral`

Se recomienda aprobarlo como entidad versionada de configuración compartida, no como parte mutable de `PeriodoNomina`. La recomendación requiere confirmación del negocio respecto de jurisdicción, festivos, horarios, excepciones y autoridad que publica una versión.

### 7.4 Decisiones aprobadas sobre `TurnoCobertura`

#### Tipos y reglas económicas

`TurnoCobertura` debe tener un `TipoTurno` explícito:

- `INTERNO_ADICIONAL`: lo realiza una persona con vinculación laboral vigente, uno o varios días adicionales a su jornada o asignación normal. El valor económico es `cantidad_dias × tarifa interna de la modalidad`. No tiene descuentos propios y se reconoce como pago adicional.
- `INTERNO_SUSTITUTIVO`: lo realiza una persona con vinculación laboral vigente durante su jornada ordinaria, pero en una modalidad o asignación distinta a la habitual. Para los días cubiertos no se reconoce simultáneamente el salario ordinario habitual; el motor debe sustituir el reconocimiento ordinario de esos días por el valor de la modalidad efectivamente cubierta. El resultado no puede producir doble reconocimiento.
- `EXTERNO`: lo realiza una persona que no pertenece a la nómina laboral regular para esa prestación. El valor económico es `cantidad_dias × tarifa externa de la modalidad`, sin descuentos propios. Los turnos externos aprobados se consolidan posteriormente en una cuenta de cobro mensual.

La aplicación no debe inferir el tipo a partir de `nomina_movimientos`; el tipo forma parte de la identidad semántica del turno y de su snapshot tarifario.

#### Duración y días efectivos

Un turno puede comprender uno o varios días. La captura puede utilizar un rango de fechas, pero el modelo debe conservar la colección de días efectivos cubiertos. Los días efectivos son la base para cálculo, validaciones, correcciones, auditoría y prevención de duplicados. Un cambio en el rango o en los días efectivos después de aprobación es una edición auditable y, si ya hubo efectos económicos, activa el proceso de recalculo/invalidación descrito en la sección 8.

#### Ubicación jerárquica obligatoria

Todo turno debe identificar `municipio`, `institución`, `sede` y `modalidad`. La validez de una ubicación se comprueba jerárquicamente: la sede debe pertenecer a la institución, la institución al municipio y la modalidad debe ser válida para el contexto contractual y operativo. Un turno incompleto o con relaciones cruzadas no puede aprobarse.

#### Motivo de cobertura

El motivo de cobertura solo puede ser:

- `REEMPLAZO`: exige `persona_reemplazada` y su relación debe ser válida para la empresa, asignación y período.
- `VACANTE_SIN_TITULAR`: indica que no existe persona contratada para esa asignación; `persona_reemplazada` debe permanecer `null` y el motivo debe registrarse explícitamente.

#### Tarifas y snapshots

Las tarifas no son globales. La resolución conceptual es `Contrato + Modalidad + TipoTurno + Vigencia`. Cada turno conserva snapshot de la tarifa aplicada, contrato, modalidad, tipo de turno y fecha/vigencia utilizada. Cambios futuros de tarifa no modifican turnos históricos ni cuentas ya generadas.

#### Registro, aprobación y edición

Talento Humano y Gestores pueden registrar turnos. Solo Talento Humano puede aprobarlos, rechazarlos o anularlos según permisos. Un turno no aprobado no puede impactar Nómina ni CuentaCobro.

Se permite editar directamente un turno incluso después de aprobado. La vista puede mostrar una única versión actual, pero toda modificación debe conservar historial con usuario, fecha y hora, campo modificado, valor anterior, valor nuevo y motivo. La edición directa no autoriza a sobrescribir resultados históricos.

### 7.5 Decisiones aprobadas sobre `CuentaCobro`

Los turnos externos aprobados de una misma persona se consolidan mensualmente. Debe existir una sola `CuentaCobro` por combinación `persona externa + contrato + período`. La cuenta detalla todos los turnos del período, aunque usen diferentes días, sedes, instituciones o modalidades. El total es la suma de los subtotales de sus turnos y ningún turno puede incluirse dos veces.

El agregado se genera a partir de turnos externos aprobados; la firma de la persona externa no es requisito para aprobar un turno ni para que el turno sea elegible para consolidación. La cuenta puede requerir documentos antes de pago, según el proceso de Contabilidad aún pendiente.

### 7.6 Documento de cuenta de cobro

EMPIRIA debe generar automáticamente el documento PDF de `CuentaCobro` desde la cuenta aprobada o generada, sin ejecutar reglas de cálculo nuevas. Como mínimo, el documento incluye identificación de la persona, contrato, período, detalle de turnos, fechas, municipio, institución, sede, modalidad, cantidad de días, tarifa aplicada, subtotal por turno y total.

Después de generado:

1. la persona externa firma el documento;
2. el documento firmado se escanea o carga nuevamente a EMPIRIA;
3. el archivo firmado queda como soporte documental para Contabilidad.

El PDF generado y el archivo firmado son versiones documentales auditables. La firma no cambia el estado histórico del turno ni sustituye la aprobación de Talento Humano.

### 7.7 Efectos de editar un turno con consecuencias económicas

La edición posterior a aprobación conserva la versión actual y el historial. Si el turno todavía no fue consumido por una corrida o cuenta, los consumidores pueden tomar la versión vigente conforme a sus reglas. Si ya produjo un resultado, subtotal, cuenta o pago, no se modifica silenciosamente esa consecuencia: el sistema debe marcar el efecto previo como potencialmente desactualizado, invalidar o recalcular la salida mediante una nueva corrida/cuenta y conservar la relación entre versión anterior, nueva versión y motivo.

La estrategia concreta de reversión de un pago confirmado queda dentro de la decisión operativa de Pagos/Contabilidad; la regla arquitectónica aprobada es que ninguna corrección elimina la evidencia ni reescribe la obligación histórica.

### 7.8 Modelo preparado para pago

`PagoNomina` y el pago asociado a `CuentaCobro` deben quedar preparados para soportar fecha de pago, valor efectivamente pagado, soporte/comprobante, usuario responsable, observaciones y estado de pago. La definición del modelo definitivo `PagoNomina`/`PagoCuentaCobro`, el proceso mediante el cual Contabilidad ejecutará y confirmará el pago dentro de EMPIRIA y sus estados operativos son **DECISIÓN OPERATIVA PENDIENTE**.

## 8. Invariantes obligatorias

1. Un período cerrado no acepta nuevos eventos ni cambios ordinarios en participantes.
2. La reapertura requiere autorización, motivo, auditoría y una nueva corrida; no reabre silenciosamente la historia.
3. Una corrida es idempotente mediante una clave de ejecución y parámetros determinísticos.
4. Un `ResultadoNominaEmpleado` pertenece a una única corrida y a un único participante.
5. Un turno no puede pagarse dos veces, incluso si cambia de flujo entre Nómina y OPS.
6. Una cuenta de cobro no puede incluir el mismo turno dos veces ni un turno ya comprometido en otra cuenta aprobada.
7. Un movimiento manual no puede ser sobrescrito por una corrida automática. En V2 será un efecto/evento manual identificado, con precedencia y auditoría explícitas.
8. Un desprendible debe conservar la versión del resultado y la corrida que lo originaron.
9. Un pago debe tener evidencia de ejecución, referencia externa o estado de rechazo verificable.
10. Ninguna entidad puede cruzar empresa, contrato o municipio sin autorización backend y evidencia de la decisión.
11. Las correcciones crean nuevas versiones, eventos compensatorios o nuevas corridas; no alteran silenciosamente resultados históricos.
12. Una corrida no puede consumir eventos RECHAZADOS o ANULADOS.
13. Un resultado no puede pasar a pago si no está publicado/revisado conforme al flujo aprobado.
14. La identidad de persona no sustituye la identidad de contrato/vinculación para autorizar operaciones laborales.
15. OPS y empleados laborales deben seguir reglas, cuentas de pago y trazabilidad distintas aunque compartan Persona.
16. Un `TurnoCobertura` debe tener exactamente un tipo: `INTERNO_ADICIONAL`, `INTERNO_SUSTITUTIVO` o `EXTERNO`.
17. Un turno debe conservar rango y días efectivos; la cantidad liquidable se deriva de los días efectivos validados, no únicamente del rango capturado.
18. Todo turno debe tener municipio, institución, sede y modalidad válidos en relación jerárquica.
19. `REEMPLAZO` exige `persona_reemplazada`; `VACANTE_SIN_TITULAR` exige que `persona_reemplazada` sea `null`.
20. Un turno interno adicional se calcula como días efectivos por tarifa interna; un turno interno sustitutivo reemplaza el reconocimiento ordinario de los días cubiertos y no puede duplicarlo; un turno externo se calcula como días efectivos por tarifa externa.
21. La tarifa debe resolverse por contrato, modalidad, tipo de turno y vigencia; el snapshot tarifario del turno es inmutable como evidencia histórica.
22. Solo Talento Humano puede aprobar un turno. Gestores y Talento Humano pueden registrarlo, pero un turno no aprobado no impacta Nómina ni CuentaCobro.
23. Toda edición de un turno aprobado conserva usuario, fecha/hora, campo, valor anterior, valor nuevo y motivo.
24. Debe existir una sola `CuentaCobro` mensual por persona externa, contrato y período; ningún turno puede repetirse en ella.
25. El documento de cuenta debe conservar el detalle de turnos y el archivo firmado cuando la persona externa lo cargue; la firma no es requisito para aprobar el turno.

## 9. Diagrama textual de relaciones

```text
Persona
└── Vinculación
    └── ParticipantePeriodo [snapshot por período]
        ├── EventoNomina [inputs aprobables]
        ├── ResultadoNominaEmpleado [resultado de una CorridaCalculoNomina]
        │   ├── DesprendibleNomina
        │   ├── Exportación [proyección, no fuente de verdad]
        │   └── PagoNomina
        └── TurnoCobertura interno [ADICIONAL o SUSTITUTIVO; referencia de integración]

TurnoCobertura externo [días efectivos, ubicación y snapshot tarifario]
└── CuentaCobroDetalle [snapshot único del turno]
    └── CuentaCobro
        └── PagoNomina
```

Una `CorridaCalculoNomina` consume un `PeriodoNomina`, sus `ParticipantePeriodo`, eventos aprobados y turnos internos aprobados; produce uno o más resultados. Los turnos externos aprobados son consumidos por OPS para la consolidación mensual de `CuentaCobro`. Un `TurnoCobertura` no se convierte automáticamente en `Movimiento`: su efecto requiere la regla y aprobación del contexto correspondiente.

## 10. Event Flow

| Evento | Productor | Consumidores | Efectos | Reversión | Auditoría requerida |
|---|---|---|---|---|---|
| `PeriodoAbierto` | Nómina | Personal, Vinculaciones, Cobertura, dashboards | Habilita incorporación y captura dentro del rango. | `PeriodoAnulado` o cierre administrativo según política. | Usuario, empresa, rango, configuración y timestamp. |
| `ParticipanteIncorporado` | Nómina | Eventos, Corridas, reportes | Crea snapshot elegible. | Retiro/anulación de incorporación antes del cierre, con motivo. | Fuente, contrato, snapshot y autorización. |
| `AsistenciaRegistrada` | Asistencia/Cobertura | Nómina, revisión | Aporta hecho operativo, no resultado. | Corrección mediante nueva versión o evento compensatorio. | Origen, actor, fecha, evidencia. |
| `NovedadRegistrada` | Nómina/operación autorizada | Revisión y Corridas | Crea `EventoNomina` PENDIENTE. | Rechazo o anulación auditada. | Tipo, valor, soporte, creador y ámbito. |
| `TurnoRegistrado` | Talento Humano o Gestor | Aprobación, Nómina u OPS | Crea turno BORRADOR/PENDIENTE con tipo, días efectivos, ubicación, motivo y snapshot tarifario. | Anulación antes de liquidar, con motivo. | Asignación, contrato, empresa, fechas, días efectivos, origen y actor. |
| `EventoAprobado` | Rol aprobador | Corrida y auditoría | Autoriza el evento para ser consumido. | Evento compensatorio o anulación autorizada. | Aprobador, fecha, reglas y evidencia. |
| `TurnoAprobado` | Talento Humano | Nómina u OPS | Autoriza el turno para liquidación laboral o consolidación de cuenta externa. | Anulación o corrección auditada; si ya produjo efectos, nueva corrida/cuenta. | Aprobador, snapshot tarifario, días efectivos, ubicación y motivo. |
| `CorridaIniciada` | Nómina/worker | Observabilidad y auditoría | Congela inputs y versión de reglas. | Fallo/invalidación; no se “deshace” borrando. | Clave idempotencia, hash/conjunto de inputs, versión. |
| `CorridaCompletada` | Worker de Nómina | Revisión, resultados, dashboards | Publica resultados candidatos o completados según política. | Invalidar y ejecutar nueva corrida. | Duración, conteos, errores, reglas y totales. |
| `ResultadoRevisado` | Rol de Nómina | Desprendibles, Pagos, Exportaciones | Autoriza el resultado para publicación/pago. | Nueva revisión o invalidación antes de pago. | Actor, diferencias y decisión. |
| `PeriodoCerrado` | Rol autorizado | Pagos, Documentos, Exportaciones | Congela inputs ordinarios y habilita salida. | Reapertura excepcional. | Actor, motivo, corrida y resumen de totales. |
| `DesprendibleGenerado` | Documentos | Persona, auditoría | Persiste versión documental del resultado. | Anulación/emisión de nueva versión. | Resultado, corrida, plantilla/versión y archivo. |
| `CuentaCobroGenerada` | OPS | Documentos, aprobación y Pagos | Consolida automáticamente los turnos externos aprobados de la persona, contrato y período; congela detalles y total. | Anular y generar nueva cuenta. | Clave persona/contrato/período, turnos, snapshots, total, documentos y actor. |
| `PagoPreparado` | Pagos | Exportaciones, tesorería | Crea obligación/instrucción de pago idempotente. | Cancelación antes de envío, con motivo. | Idempotency key, origen, importe y destinatario. |
| `PagoConfirmado` | Pagos/proveedor | Conciliación, Documentos, período | Marca evidencia de ejecución. | Reversión/ajuste según proceso financiero, nunca borrar evidencia. | Referencia externa, fecha, respuesta y soporte. |
| `PeriodoReabierto` | Rol excepcional autorizado | Nómina, auditoría, dashboards | Permite nueva versión de inputs/corrida. | Cierre posterior; no volver a editar versiones previas. | Motivo, alcance, aprobadores y corrida afectada. |

## 11. Estados y transiciones

### A. `PeriodoNomina`

```text
BORRADOR → ABIERTO → EN_REVISION → CERRADO → PAGADO
    └──────────────→ ANULADO
ABIERTO / EN_REVISION / CERRADO → ANULADO [solo autorización excepcional]
CERRADO → ABIERTO [REABRIR, autorización excepcional y auditoría]
```

`BORRADOR → ABIERTO` requiere validación de empresa, rango y configuración. `ABIERTO → EN_REVISION` exige que no existan errores bloqueantes. `EN_REVISION → CERRADO` exige una corrida aceptada y la aprobación definida por negocio. `CERRADO → PAGADO` exige obligaciones preparadas/confirmadas según la política financiera.

### B. `EventoNomina`

```text
BORRADOR → PENDIENTE → APROBADO
                  └──→ RECHAZADO
APROBADO / PENDIENTE / RECHAZADO → ANULADO [según permisos y motivo]
```

El creador no debe autoaprobar eventos sensibles cuando exista segregación de funciones. Los eventos aprobados no se editan; una corrección genera una nueva versión o evento compensatorio.

### C. `CorridaCalculoNomina`

```text
PENDIENTE → EJECUTANDO → COMPLETADA
                 └──────→ FALLIDA
COMPLETADA → INVALIDADA [motivo y nueva corrida]
```

Solo el worker autorizado puede pasar a `EJECUTANDO` o `COMPLETADA`. `INVALIDADA` no borra resultados: impide usarlos como base de nuevas salidas.

### D. `TurnoCobertura`

```text
BORRADOR → PENDIENTE → APROBADO → LIQUIDADO → PAGADO
                  └──→ RECHAZADO
BORRADOR / PENDIENTE / APROBADO / LIQUIDADO → ANULADO
```

La aprobación requiere rol de Talento Humano; Gestores pueden registrar, pero no aprobar. `LIQUIDADO` requiere que el turno haya sido incluido en el resultado o cuenta correspondiente. `PAGADO` requiere evidencia; la transición no se realiza solo porque se generó un exporte. La edición posterior a aprobación es posible con auditoría completa y no elimina las consecuencias históricas.

### E. `CuentaCobro`

```text
BORRADOR → GENERADA → APROBADA → PAGADA
    └──────────────→ ANULADA
GENERADA / APROBADA → ANULADA [autorización y motivo]
```

`GENERADA` congela los detalles y soportes mínimos y debe corresponder a la única combinación mensual persona externa + contrato + período. `APROBADA` requiere validación OPS/financiera; la firma de la persona externa no es requisito para aprobar turnos, aunque el documento firmado queda como soporte posterior para Contabilidad. `PAGADA` depende de pago confirmado, no de la existencia de un archivo. El modelo de confirmación de pago permanece pendiente.

Los permisos concretos por rol, municipio y empresa requieren confirmación del negocio y deben resolverse en backend, nunca únicamente en la interfaz.

## 12. Decisiones arquitectónicas

1. **`nomina_movimientos` deja de ser contenedor universal.** Recargos, bonos, auxilios, descuentos, embargos, ajustes manuales y turnos tienen fuentes, aprobaciones y reglas diferentes. V2 los modela como eventos, efectos normalizados o entidades especializadas según su semántica.
2. **Inputs y resultados se separan.** Un evento aprobado es evidencia de entrada; un resultado es una consecuencia de una corrida. Separarlos evita que recalcular destruya la evidencia original.
3. **Debe existir `CorridaCalculoNomina`.** Permite idempotencia, reproducibilidad, comparación entre corridas, invalidación y trazabilidad de reglas/configuración.
4. **`ParticipantePeriodo` debe ser snapshot.** El maestro de Vinculaciones continúa evolucionando; una nómina histórica debe explicar sus valores con el contexto vigente al incorporarse/calcularse.
5. **Turno y CuentaCobro son subdominios propios.** Cobertura debe controlar el hecho operativo y OPS debe controlar su ciclo documental/financiero. Nómina puede consumir una decisión aprobada, pero no absorber las reglas de ambos contextos.
6. **Documentos y exportes se desacoplan.** Son proyecciones y evidencias de resultados ya decididos; no pueden definir ni recalcular la liquidación.
7. **Debe existir capa de repositorios.** Aísla SQL, centraliza queries, permite pruebas de dominio y evita que cada servicio reconstruya el mismo contexto.
8. **Compatibilidad V1 será incremental.** Se mantendrán adaptadores, fuentes oficiales temporales y contratos existentes mientras V2 gane equivalencia probada. No se autoriza migración destructiva como condición inicial.

## 13. Alternativas consideradas

| Alternativa | Ventajas | Desventajas y riesgos | Costo | Decisión |
|---|---|---|---|---|
| A. Mantener `nomina_movimientos` como tabla universal | Menor cambio inicial; conserva consultas existentes. | Mantiene ambigüedad, no resuelve doble pago, mezcla inputs/resultados y hace crecer estados/joins. Alto riesgo de seguir acumulando deuda. | Bajo inicial, alto mantenimiento. | Descartada como arquitectura objetivo; solo puede sobrevivir como compatibilidad temporal. |
| B. Crear únicamente `nomina_turnos` | Mejora el caso de cobertura y permite separar turnos. | No resuelve corridas, resultados versionados, documentos, pagos ni la sobrecarga de movimientos. | Medio. | Descartada como solución completa; puede ser una fase, no el diseño final. |
| C. Modelo completo basado en `EventoNomina` y `CorridaCalculo` | Separa hechos y resultados, permite reproducibilidad, auditoría e idempotencia; habilita migración incremental. | Requiere diseño de estados, versionado, adaptadores y disciplina de integración. | Medio/alto, distribuido por fases. | Recomendada. |
| D. Reescribir Nómina desde cero | Libertad para limpiar conceptos y eliminar compatibilidad inmediata. | Alto riesgo funcional, migración de histórico compleja, interrupción operativa y difícil equivalencia con V1. | Muy alto. | Descartada; solo se consideraría tras estabilizar contratos y equivalencia. |

## 14. Compatibilidad con V1

- Las tablas actuales permanecen durante la transición, incluyendo `nomina_periodos`, `nomina_empleados`, `nomina_asistencia_diaria`, `nomina_novedades`, `nomina_movimientos`, `nomina_liquidaciones` y `nomina_desprendibles`, en la medida en que sigan siendo necesarias para V1. Su retiro no es parte de este RFC.
- Los endpoints actuales siguen funcionando mediante adaptadores de aplicación. No se cambian endpoints como condición para aprobar la arquitectura.
- La fuente oficial inicial continúa siendo V1 para operaciones aún no migradas. V2 será fuente oficial por bounded context solo después de cumplir criterios de equivalencia, auditoría y rollback.
- Una capa anticorrupción traducirá modelos V1 a snapshots, eventos y proyecciones V2. V2 no debe copiar la ambigüedad semántica de `nomina_movimientos` sin clasificarla.
- No se harán migraciones destructivas, drops ni renombrados irreversibles. Los backfills serán por lotes, repetibles, auditados y con marcador de origen/versión.
- La equivalencia se validará con períodos representativos: casos normales, novedades, ajustes manuales, prestaciones, turnos internos, turnos externos y retiros. Las diferencias deberán quedar explicadas y aprobadas.
- El modelo antiguo se retirará solo cuando no existan consumidores activos, los históricos estén accesibles, los endpoints tengan sustituto, los reportes estén conciliados y exista aprobación operativa.

## 15. Estrategia de migración

| Fase | Objetivo y alcance | Dependencias | Riesgos | Criterio de aceptación | Rollback |
|---|---|---|---|---|---|
| 0 — Congelación del modelo actual | Documentar contratos y prohibir nuevas responsabilidades en `nomina_movimientos`/`nomina_empleados`; inventariar consumidores. | Aprobación RFC y auditoría vigente. | Seguir agregando deuda durante la migración. | No se incorporan nuevos tipos ambiguos sin decisión arquitectónica. | Retirar la regla de congelación, conservando inventario. |
| 1 — Repositorios sobre V1 | Extraer acceso SQL de servicios detrás de interfaces y repositorios, sin cambiar comportamiento. | Inventario de queries y pruebas V1. | Cambios sutiles de resultados/rendimiento. | Regresión V1 verde y cobertura de queries críticos. | Volver al adaptador anterior sin alterar tablas. |
| 2 — Capa anticorrupción | Traducir V1 a contratos de dominio V2 y marcar datos no clasificables. | Fase 1, lenguaje ubicuo aprobado. | Mapeos incorrectos y pérdida de contexto. | Casos de mapeo auditados y diferencias conocidas. | Desactivar publicación V2 y conservar lectura V1. |
| 3 — `ParticipantePeriodo` | Crear snapshots desde incorporaciones V1 y validar elegibilidad. | Fases 1–2, reglas contractuales. | Snapshot incompleto o cruzado entre contratos. | Cada participante explica empresa, contrato y período. | Reprocesar backfill; V1 sigue oficial. |
| 4 — `EventoNomina` | Clasificar novedades, asistencia y movimientos por origen; introducir aprobación y auditoría. | Participantes y ACL. | Clasificación incorrecta de ajustes históricos. | Eventos idempotentes y no aprobados no afectan cálculo. | Mantener lectura V1; detener publicación de eventos nuevos. |
| 5 — Corrida y resultados versionados | Ejecutar cálculo V2 en modo paralelo, conservar corridas y comparar resultados. | Eventos aprobados, configuración versionada. | Divergencias funcionales o rendimiento. | Equivalencia aprobada en casos definidos; ningún histórico V1 se altera. | V1 continúa calculando; invalidar corridas V2. |
| 6 — `TurnoCobertura` | Separar turnos internos adicionales/sustitutivos y externos, conservar días efectivos, ubicación, motivo, tarifa contractual y auditoría de edición. | Cobertura, contrato, permisos y decisiones de negocio aprobadas en este RFC. | Duplicados, doble reconocimiento del sustitutivo o efectos sobre turnos no aprobados. | Cada turno tiene tipo, días efectivos, ubicación jerárquica, motivo, snapshot tarifario, aprobación exclusiva de Talento Humano y clave de no duplicidad. | Mantener flujo anterior para turnos no migrados; invalidar consumos V2 sin borrar auditoría. |
| 7 — `CuentaCobro` | Modelar consolidación mensual única por persona externa + contrato + período, detalle y documentos OPS con snapshots. | TurnoCobertura, Documentos y reglas aprobadas en este RFC. | Cuenta incompleta, duplicada o incompatible con el proveedor/contrato. | La cuenta reconcilia exactamente sus turnos aprobados, subtotales y total; el PDF contiene el detalle requerido. | Anular cuenta V2 y continuar proceso V1 autorizado; conservar documento y trazabilidad. |
| 8 — Pagos | Separar preparación, envío, confirmación, evidencia y conciliación. | Resultados/cuentas aprobados, proveedor de pagos y decisión operativa pendiente. | Dobles instrucciones o falta de evidencia. | Modelo preparado para fecha, valor pagado, soporte, responsable, observaciones y estado; flujo de Contabilidad aprobado. | Detener nuevos envíos y usar conciliación manual controlada. |
| 9 — Migración de frontend | Consumir contratos de aplicación/proyecciones, no joins de negocio. | APIs estabilizadas, permisos y documentos. | Regresión de flujos operativos. | Frontend no reconstruye reglas ni cruza tenants; pruebas de aceptación. | Mantener frontend V1 por ruta/feature flag. |
| 10 — Retiro gradual V1 | Retirar dependencias por consumidor y archivar solo cuando sea seguro. | Criterios de éxito, histórico y aprobación. | Dependencia oculta, reporte faltante. | Inventario de consumidores en cero y firma de cierre. | Reactivar adaptador mientras se resuelve la dependencia. |

## 16. Seguridad y tenant isolation

- **Empresa:** toda entidad y comando debe resolverse dentro del `empresa_id` autenticado/contextual, no del ID enviado por el cliente. El backend verifica pertenencia antes de leer o escribir.
- **Contrato/vinculación:** un `ParticipantePeriodo`, turno o resultado solo puede asociarse a una vinculación válida en la empresa y rango autorizado.
- **Municipio:** cuando el alcance operativo lo exija, municipio forma parte del ámbito de autorización y no solo de un filtro de interfaz.
- **Rol:** separar captura, aprobación, cálculo, revisión, cierre, generación documental y pago. La segregación exacta requiere confirmación del negocio.
- **Usuario:** registrar actor efectivo, usuario autenticado, servicio/worker y motivo cuando sea una operación automática o excepcional.
- **Permisos por acción:** autorizar en backend cada transición, exportación, descarga documental, reapertura y anulación.
- **Manipulación de IDs:** nunca confiar en identificadores del frontend; validar tenant, contrato, estado y relación completa antes de operar.
- **Exportaciones/documentos:** aplicar autorización por empresa, período, municipio y rol; generar URLs/descargas con expiración y registrar accesos.
- **Auditoría:** los logs de seguridad y dominio deben ser append-only o contar con controles equivalentes; no registrar secretos ni datos innecesarios.
- **OPS vs laboral:** impedir que una cuenta de cobro use por error un contrato laboral, y que un turno laboral se pague como OPS sin autorización explícita.

## 17. Rendimiento

El diseño debe soportar períodos de 1.000 a 1.500 empleados sin convertir una corrida en una transacción monolítica que bloquee captura, revisión o consultas.

- **Recalculo masivo:** ejecutar por corrida identificable y lotes de participantes; cada lote debe ser reintentable e idempotente.
- **Desprendibles:** generar de forma asíncrona desde resultados publicados, con estado de job, reintentos y límite de concurrencia.
- **Exportaciones:** construir desde proyecciones/materializaciones autorizadas; no repetir joins complejos por cada fila del archivo.
- **Dashboards:** usar consultas de lectura/paginadas y proyecciones de totales, no recalcular el período en cada consulta.
- **Historial:** indexar por empresa, período, participante, estado, corrida y fecha; los índices concretos quedan para el diseño físico posterior.
- **Paginación:** obligatoria en participantes, eventos, resultados, turnos, cuentas y auditoría. Evitar endpoints que devuelvan un período completo sin límite.
- **Jobs:** separar captura síncrona de cálculos, documentos y exportaciones; usar colas con deduplicación por clave de corrida/operación.
- **Lotes:** seleccionar tamaño mediante pruebas con datos representativos; controlar memoria y tiempo máximo por lote.
- **Caché:** aplicable solo a configuración inmutable/versionada y proyecciones; nunca usar caché como fuente de verdad para estado de pago o cierre.
- **Observabilidad de rendimiento:** medir duración por fase, lote, regla y dependencia externa, además de errores y reintentos.

## 18. Observabilidad y auditoría

Cada operación debe producir un registro correlacionable por `correlation_id`, empresa, período, participante/turno/cuenta y usuario o worker.

Debe registrarse, como mínimo:

- quién y cuándo abrió, revisó, cerró, reabrió o anuló cada período;
- quién registró, aprobó, rechazó o anuló cada evento;
- qué corrida generó cada resultado, con versión de reglas/configuración e inputs;
- reglas aplicadas, bases, conceptos y diferencias entre corridas;
- quién generó, descargó, anuló o reemitió cada desprendible;
- quién preparó, envió, confirmó, rechazó o concilió cada pago;
- errores, reintentos, duración, lote, causa raíz y resultado final de jobs;
- relación entre turno, cuenta de cobro, resultado y pago;
- cambios de permisos, intentos de acceso cruzado y exportaciones sensibles.

La auditoría de negocio debe ser consultable sin modificar el histórico. Logs técnicos y de dominio deben distinguir operación exitosa, rechazada, fallida y reintentada.

## 19. Pruebas necesarias

- **Unitarias:** invariantes de aggregates, cálculo de conceptos, máquinas de estado, idempotency keys y reglas de precedencia de ajustes manuales.
- **Integración:** repositorios, transacciones, aislamiento por empresa/contrato, colas, documentos y proveedor de pagos simulado.
- **Regresión:** endpoints y flujos V1 sin cambio de comportamiento no intencionado.
- **Equivalencia V1/V2:** mismos casos y datos; comparar totales, conceptos, deducciones, prestaciones, redondeos y excepciones. Toda diferencia debe clasificarse.
- **Idempotencia:** repetir incorporación, evento, corrida, generación documental, cuenta y pago no debe duplicar efectos.
- **Seguridad multiempresa:** IDs de otra empresa, municipio, contrato o rol deben ser rechazados aunque sean válidos sintácticamente.
- **Períodos cerrados:** impedir eventos/cambios ordinarios y verificar reapertura controlada.
- **Turnos internos/externos:** validar separación de reglas, elegibilidad, valorización y destino de pago.
- **Cuentas de cobro:** impedir duplicado de turno, mezcla de contratos/empresas, cambios posteriores a generación y pago sin aprobación.
- **Dobles pagos:** concurrentes, reintentos de red, archivos repetidos y respuestas tardías del proveedor.
- **Reprocesamiento:** corrida fallida, corrida invalidada, nueva configuración, corrección compensatoria y comparación de versiones.
- **Rollback:** desactivar V2 por fase, mantener V1 funcional y demostrar que no se alteran históricos.

## 20. Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación | Responsable |
|---|---|---|---|---|
| Reglas de negocio incompletas o contradictorias | Media | Alto | Glosario aprobado, ejemplos de aceptación y comité de negocio. | Dueño de Nómina |
| Mapeo incorrecto de `nomina_movimientos` históricos | Alta | Alto | Clasificación explícita, backfill reversible y diferencias auditadas. | Arquitectura + Nómina |
| Divergencia V1/V2 en redondeos/prestaciones | Media | Alto | Corrida paralela, casos de equivalencia y aprobación de diferencias. | Motor de Nómina |
| Duplicidad de turnos o pagos | Media | Crítico | Identidad de turno, constraints lógicas, idempotencia, conciliación y pruebas concurrentes. | Cobertura + Pagos |
| Cruce accidental entre empresa/contrato | Media | Crítico | Autorización backend, filtros por tenant, pruebas negativas y revisión de repositorios. | Seguridad + Backend |
| Acoplamiento residual a PDF/exportaciones | Alta | Medio | Contratos de salida desde resultados publicados y prohibición de cálculo en presentación. | Documentos + Arquitectura |
| Rendimiento insuficiente en 1.500 empleados | Media | Alto | Jobs, lotes, índices, proyecciones y pruebas de carga tempranas. | Plataforma |
| Dependencias V1 ocultas | Media | Alto | Inventario de consumidores, observabilidad y retiro por etapas. | Líder técnico |
| Falta de segregación de funciones | Media | Alto | Matriz de permisos y doble control para aprobación/cierre/pago. | Seguridad + Negocio |
| Cuenta de cobro incompatible con proceso real OPS | Media | Alto | Confirmar decisiones abiertas antes de Fase 7 y piloto controlado. | Dueño de OPS |
| Backfill incompleto o no repetible | Media | Medio | Lotes con marcadores, conteos, checksum lógico y rollback por lote. | Datos |
| Reaperturas sin control | Baja/Media | Alto | Motivo obligatorio, aprobación excepcional, nueva corrida y alerta. | Nómina |

## 21. Criterios de éxito

La arquitectura se considerará exitosa cuando:

- ningún resultado histórico cambie silenciosamente;
- una corrida pueda reproducirse con sus inputs y versiones de reglas;
- no existan pagos duplicados en pruebas ni en conciliación operativa;
- el frontend no reconstruya joins ni reglas de negocio;
- todos los eventos tengan origen, estado y trazabilidad;
- cada desprendible identifique el resultado y la corrida que lo originaron;
- V1 continúe operando durante la transición;
- V2 coincida con V1 en casos equivalentes aprobados;
- turnos, cuentas de cobro y pagos tengan identidades y ciclos de vida propios;
- la separación entre empleados laborales y OPS sea verificable por reglas y permisos;
- los períodos cerrados sean efectivamente inmutables salvo reapertura autorizada;
- sea posible explicar quién hizo cada transición y qué evidencia la respalda.

## 22. Preguntas abiertas

Las siguientes decisiones permanecen abiertas y requieren confirmación explícita:

1. **Modelo definitivo de pago:** si existirá un único `PagoNomina` polimórfico o entidades diferenciadas `PagoNomina`/`PagoCuentaCobro`, sus estados, claves de idempotencia, soportes, reversos y conciliación.
2. **Proceso operativo con Contabilidad:** cómo se ejecutará y confirmará el pago dentro de EMPIRIA, qué usuario o sistema aportará la evidencia, cómo se tratarán rechazos y cuál será el flujo de carga del soporte/comprobante.
3. **Calendario laboral:** si se aprueba como entidad compartida, sus jurisdicciones, festivos, horarios, excepciones, vigencias y autoridad que publica sus versiones.

Las siguientes decisiones ya no son preguntas abiertas de este RFC: tipo de turno interno adicional/sustitutivo/externo; fórmula económica de cada tipo; días efectivos; ubicación jerárquica; motivos de cobertura; resolución contractual de tarifas; registro por Talento Humano/Gestores; aprobación exclusiva de Talento Humano; edición con auditoría; consolidación mensual de cuentas; contenido y generación automática del PDF; y firma posterior como soporte para Contabilidad.

## 23. Recomendación final

Se recomienda mantener la arquitectura V2 basada en `PeriodoNomina` como root del ciclo, `ParticipantePeriodo` como snapshot, `EventoNomina` como input auditable, `CorridaCalculoNomina` como ejecución idempotente y `ResultadoNominaEmpleado` como salida versionada. `TurnoCobertura` y `CuentaCobro` quedan aprobados como contextos propios, integrados por contratos explícitos.

Las decisiones cerradas establecen que los turnos internos pueden ser adicionales o sustitutivos; los sustitutivos reemplazan el reconocimiento ordinario de los días cubiertos y no pueden duplicarlo. Los turnos externos se calculan por días efectivos y tarifa externa y se consolidan mensualmente en una única cuenta por persona externa, contrato y período. Todo turno conserva días efectivos, ubicación jerárquica, motivo, tarifa contractual versionada y auditoría completa; solo Talento Humano puede aprobarlo. EMPIRIA genera el PDF de cuenta y conserva el documento firmado como soporte posterior para Contabilidad.

Documentos, exportaciones y pagos deben consumir resultados o cuentas aprobadas sin convertirse en fuentes de reglas de cálculo. El modelo de pago se deja preparado para fecha, valor efectivamente pagado, comprobante, responsable, observaciones y estado, pero su operación definitiva permanece pendiente.

La primera fase a implementar debe ser la **Fase 0 — congelación del modelo actual**, seguida de la **Fase 1 — capa de repositorios sobre V1**. Esta secuencia reduce riesgo, hace visible el inventario de dependencias y permite construir V2 sin cambiar todavía endpoints ni tablas existentes.

Deben permanecer congelados, hasta contar con decisiones aprobadas y pruebas de equivalencia:

- la semántica de las tablas V1 y sus endpoints;
- la incorporación de nuevos tipos ambiguos a `nomina_movimientos`;
- la edición destructiva de históricos;
- la mezcla de OPS y empleados laborales en un mismo flujo no especificado;
- el uso de PDF/exportaciones como fuente de verdad;
- los cambios de pago sin idempotencia y evidencia.

Las condiciones para la implementación posterior son: designación de dueños de cada bounded context; acuerdo sobre compatibilidad V1; aprobación de la matriz de permisos; definición del modelo y proceso de pago con Contabilidad; resolución final de `CalendarioLaboral`; y compromiso de validar equivalencia antes de convertir V2 en fuente oficial.

La aprobación de este RFC autoriza el diseño detallado y la planificación de la migración. No autoriza aún escribir código, ejecutar SQL, cambiar tablas, modificar endpoints ni migrar datos productivos.

### Resumen de actualización

**Secciones modificadas:** encabezado y estado; resumen ejecutivo; bounded contexts; modelo canónico de entidades; invariantes; diagrama de relaciones; event flow; máquinas de estado; estrategia de migración; preguntas abiertas; y recomendación final.

**Decisiones cerradas:** definición y reglas económicas de turnos internos adicionales y sustitutivos; definición y reglas económicas de turnos externos; duración por rango con conservación de días efectivos; ubicación obligatoria y validación jerárquica; motivos `REEMPLAZO` y `VACANTE_SIN_TITULAR`; tarifas por contrato, modalidad, tipo de turno y vigencia con snapshot; registro por Talento Humano/Gestores; aprobación exclusiva de Talento Humano; edición posterior con auditoría; consolidación mensual de cuentas por persona externa, contrato y período; no duplicidad de turnos; generación automática del PDF; contenido mínimo del documento; y firma posterior como soporte para Contabilidad.

**Decisiones aún abiertas:** modelo definitivo de `PagoNomina`/`PagoCuentaCobro`; proceso operativo de ejecución y confirmación con Contabilidad; y definición final de `CalendarioLaboral`.
