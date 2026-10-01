# Auditoría forense septiembre2026 — sólo lectura

Empresa15 / contrato24. Excel y preview original intactos. transaction_read_only=on; writes=0. Ninguna importación ni cambio de catálogo.

## Hallazgo causal

Las25 filas escriben PUERTO RICO. El catálogo global tiene Puerto Rico/CAQUETA (733,18592) y Puerto Rico/META (734,50590). El preview anterior encontró dos nombres iguales y cayó al fallback del consecutivo: slice(1,6)=50577, Puerto Lleras728. No es municipio fuente incorrecto: es una resolución global ambigua y fallback indebido.

El consecutivo de14 dígitos almacenado en codigo_dane de sede no es un código DANE oficial de12 dígitos. No debe interpretarse como geografía ni truncarse para inventar un DANE real. Instituciones83/86 tienen codigo_dane=NULL.

Municipio recomendado para las25 filas:734, Puerto Rico/META, por coincidencia exacta del texto fuente con municipio de institución y sede del contrato24, agosto4 y proyección final. No por mayoría o similitud. Aprobación humana obligatoria; no se aplicó ninguna corrección.

## IDs y catálogos

| ID | Municipio | DANE | Departamento |
| --- | --- | --- | --- |
| 728 | PUERTO LLERAS | 50577 | META |
| 733 | PUERTO RICO | 18592 | CAQUETA |
| 734 | PUERTO RICO | 50590 | META |

| Institución ID | Nombre oficial | DANE DB | Municipio | Contrato |
| --- | --- | --- | --- | --- |
| 83 | CENTRO EDUCATIVO LA SABANA | — | 734 | 24 |
| 86 | INSTITUCIÓN EDUCATIVA LA PRIMAVERA | — | 734 | 24 |

| Sede ID | Nombre oficial | codigo_dane almacenado (NO certificado) | Municipio |
| --- | --- | --- | --- |
| 423 | SEDE SAN RAFAEL | 25057700025107 | 734 |
| 424 | SEDE LA SULTANA | 25057700025104 | 734 |
| 425 | SEDE LA YE | 25057700025105 | 734 |
| 426 | SEDE CANO RAYA | 25057700025103 | 734 |
| 427 | SEDE EL OASIS | 25057700025109 | 734 |
| 428 | SEDE PRINCIPAL LA SABANA | 25057700025101 | 734 |
| 429 | SEDE SAN VICENTE ALTO | 25057700025102 | 734 |
| 430 | SEDE SANTA INES | 25057700025108 | 734 |
| 431 | SEDE SAUSALITO | 25057700025106 | 734 |
| 445 | SEDE PRINCIPAL BARRANCO COLORADO | 25057700049901 | 734 |
| 446 | SEDE BAJA PRIMAVERA | 25057700049905 | 734 |
| 447 | SEDE BRISAS DEL CAFRE | 25057700049902 | 734 |
| 448 | SEDE BUENA VISTA | 25057700049908 | 734 |
| 449 | SEDE LA CABANA | 25057700049903 | 734 |
| 450 | SEDE LA ESPERANZA | 25057700049907 | 734 |
| 451 | SEDE LA FUNDACION | 25057700049910 | 734 |
| 452 | SEDE LA LIBERTAD | 25057700049909 | 734 |
| 453 | SEDE LA UNION | 25057700049904 | 734 |
| 454 | SEDE LA VICTORIA | 25057700049906 | 734 |
| 455 | SEDE CHARCO DANTO | 25057700049912 | 734 |
| 456 | SEDE EL DORADO | 25057700049913 | 734 |
| 457 | SEDE LA REFORMA | 25057700049914 | 734 |
| 458 | SEDE LAGUNA GRINGO | 25057700049915 | 734 |
| 459 | SEDE CHISPAS | 25057700049916 | 734 |

## Las25 filas — fuente, resolución e histórico

| Fila | Municipio Excel | Institución Excel | Sede Excel | Modalidad | Municipio institución | Municipio sede | Municipio agosto misma combinación | Clasificación |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 491 | PUERTO RICO | CE LA SABANA | SEDE SAN RAFAEL | CAA | 734 | 734 | 734 | NOMBRE_AMBIGUO |
| 492 | PUERTO RICO | CE LA SABANA | SEDE LA SULTANA | CAA | 734 | 734 | 734 | NOMBRE_AMBIGUO |
| 493 | PUERTO RICO | CE LA SABANA | SEDE LA YE | CAA | 734 | 734 | 734 | NOMBRE_AMBIGUO |
| 494 | PUERTO RICO | CE LA SABANA | SEDE CAÑO RAYA | CAJM/JT-RI | 734 | 734 | 734 | NOMBRE_AMBIGUO |
| 495 | PUERTO RICO | CE LA SABANA | SEDE EL OASIS | CAJM/JT-RI | 734 | 734 | 734 | NOMBRE_AMBIGUO |
| 496 | PUERTO RICO | CE LA SABANA | SEDE PRINCIPAL LA SABANA | CAA | 734 | 734 | 734 | NOMBRE_AMBIGUO |
| 497 | PUERTO RICO | CE LA SABANA | SEDE SAN VICENTE ALTO | CAJM/JT-RI | 734 | 734 | 734 | NOMBRE_AMBIGUO |
| 498 | PUERTO RICO | CE LA SABANA | SEDE SANTA INES | CAJM/JT-RI | 734 | 734 | 734 | NOMBRE_AMBIGUO |
| 499 | PUERTO RICO | CE LA SABANA | SEDE SAUSALITO | CAJM/JT-RI | 734 | 734 | 734 | NOMBRE_AMBIGUO |
| 514 | PUERTO RICO | INSTITUCION EDUCATIVA LA PRIMAVERA | SEDE PRINCIPAL BARRANCO COLORADO | CAA | 734 | 734 | 734 | NOMBRE_AMBIGUO |
| 515 | PUERTO RICO | INSTITUCION EDUCATIVA LA PRIMAVERA | SEDE PRINCIPAL BARRANCO COLORADO | CAARES | 734 | 734 | 734 | NOMBRE_AMBIGUO |
| 516 | PUERTO RICO | INSTITUCION EDUCATIVA LA PRIMAVERA | SEDE BAJA PRIMAVERA | CAJM/JT-RI | 734 | 734 | 734 | NOMBRE_AMBIGUO |
| 517 | PUERTO RICO | INSTITUCION EDUCATIVA LA PRIMAVERA | SEDE BRISAS DEL CAFRE | CAJM/JT-RI | 734 | 734 | 734 | NOMBRE_AMBIGUO |
| 518 | PUERTO RICO | INSTITUCION EDUCATIVA LA PRIMAVERA | SEDE BUENA VISTA | CAJM/JT-RI | 734 | 734 | 734 | NOMBRE_AMBIGUO |
| 519 | PUERTO RICO | INSTITUCION EDUCATIVA LA PRIMAVERA | SEDE LA CABAÑA | CAJM/JT-RI | 734 | 734 | 734 | NOMBRE_AMBIGUO |
| 520 | PUERTO RICO | INSTITUCION EDUCATIVA LA PRIMAVERA | SEDE LA ESPERANZA | CAJM/JT-RI | 734 | 734 | 734 | NOMBRE_AMBIGUO |
| 521 | PUERTO RICO | INSTITUCION EDUCATIVA LA PRIMAVERA | SEDE LA FUNDACIoN | CAJM/JT-RI | 734 | 734 | 734 | NOMBRE_AMBIGUO |
| 522 | PUERTO RICO | INSTITUCION EDUCATIVA LA PRIMAVERA | SEDE LA LIBERTAD | CAJM/JT-RI | 734 | 734 | 734 | NOMBRE_AMBIGUO |
| 523 | PUERTO RICO | INSTITUCION EDUCATIVA LA PRIMAVERA | SEDE LA UNIoN | CAJM/JT-RI | 734 | 734 | 734 | NOMBRE_AMBIGUO |
| 524 | PUERTO RICO | INSTITUCION EDUCATIVA LA PRIMAVERA | SEDE LA VICTORIA | CAJM/JT-RI | 734 | 734 | 734 | NOMBRE_AMBIGUO |
| 525 | PUERTO RICO | INSTITUCION EDUCATIVA LA PRIMAVERA | SEDE CHARCO DANTO | CAJM/JT-RI | 734 | 734 | 734 | NOMBRE_AMBIGUO |
| 526 | PUERTO RICO | INSTITUCION EDUCATIVA LA PRIMAVERA | SEDE EL DORADO | CAJM/JT-RI | 734 | 734 | 734 | NOMBRE_AMBIGUO |
| 527 | PUERTO RICO | INSTITUCION EDUCATIVA LA PRIMAVERA | SEDE LA REFORMA | CAJM/JT-RI | 734 | 734 | 734 | NOMBRE_AMBIGUO |
| 528 | PUERTO RICO | INSTITUCION EDUCATIVA LA PRIMAVERA | SEDE LAGUNA GRINGO | CAJM/JT-RI | 734 | 734 | 734 | NOMBRE_AMBIGUO |
| 529 | PUERTO RICO | INSTITUCION EDUCATIVA LA PRIMAVERA | SEDE CHISPAS | CAJM/JT-RI | 734 | 734 | 734 | NOMBRE_AMBIGUO |

Histórico completo de vigencias/proyección y coincidencias exactas normalizadas en otras hojas: JSON adjunto. Coincidencias de nombres de sede en otras hojas no prueban por sí solas identidad. La consulta historial_cambios sólo leyó municipio_id/codigo_dane, no actores ni datos personales. Filas de cambios encontradas: 0.

## Cinco filas sin identidad

| Fila | Institución / sede originales | Cupos primaria/secundaria/total | Matriculados primaria/secundaria/total | Clasificación | Evidencia |
| --- | --- | --- | --- | --- | --- |
| 691 | TOTAL COBERTURA DEPARTAMENTO / TOTAL COBERTURA DEPARTAMENTO | 42301/37729/80030 | 40717/35847/76564 | FILA_RESUMEN_NO_APLICABLE | Etiqueta TOTAL COBERTURA DEPARTAMENTO y fórmulas SUM(Q3:Q690), SUM(R3:R690), SUM(S3:S690) |
| 692 | — / — | —/—/— | —/—/— | FILA_INVÁLIDA | Sólo fórmulas de plantilla; Z/AA/AB=0 |
| 693 | — / — | —/—/— | —/—/— | FILA_INVÁLIDA | Fórmulas I/L con #REF!; sin identidad ni métricas |
| 697 | CAARES / SEDES QUE SE MODIFICARON LOS CUPOS POR LA DIOCESIS | —/—/— | —/—/— | FILA_RESUMEN_NO_APLICABLE | Leyenda CAARES: SEDES QUE SE MODIFICARON LOS CUPOS POR LA DIOCESIS |
| 699 | \| / — | —/—/— | —/—/— | FILA_INVÁLIDA | Separador literal \|; no identidad ni métricas |

En las cinco: municipio y modalidad ausentes; coincidencias exactas/normalizadas con sedes de contrato24:0; sin combinación identificable en agosto. Las coincidencias CAARES o | en otras hojas son etiquetas/separadores, no altas. No proponer institución nueva por una leyenda. Exclusión recomendada con evidencia y aprobación; no se excluyó nada del archivo ni del preview original.

## DANE y jornada — obligatoriedad real

| Campo | Importar | Identificar combinación | Calcular cobertura | Mostrar Instituciones | Cambiar modalidad | Trazabilidad |
| --- | --- | --- | --- | --- | --- | --- |
| DANE institución | OPCIONAL | OPCIONAL; IDs canónicos | NO_APLICABLE | OPCIONAL | NO_APLICABLE | OPCIONAL; preservar ID/consecutivo/fila/hash |
| DANE sede | OPCIONAL | OPCIONAL; sede+modalidad canónicas | NO_APLICABLE | OPCIONAL | NO_APLICABLE | OPCIONAL; preservar ID/consecutivo/fila/hash |
| Jornada escolar | NO_APLICABLE en importador actual | NO_APLICABLE en clave mensual | NO_APLICABLE | OPCIONAL en SIMAT separado | NO_APLICABLE en cambio operativo actual | NO_APLICABLE para esta carga |

Para estas25 filas no se pueden obtener DANE oficiales inequívocos desde los campos actuales: instituciónNULL y sede14 dígitos. Jornada no está en el catálogo sedes consultado. No inventar ni confundir jornada escolar con tipo_jornada laboral de Nómina. Los IDs canónicos de institución/sede/modalidad sí están resueltos desde catálogo del tenant. Por ello ausencia de columnas DANE/jornada no constituye por sí sola obligación de corregir este Excel para el modelo vigente.

Las otras hojas del MISMO archivo aprobado sí contienen DANE institución, DANE sede y JORNADA asociados al consecutivo exacto. Se extrajeron sólo esos campos escolares, sin personas. No se modifica el catálogo DB para rellenarlos. Una jornada observada en matrículas no redefine la modalidad de focalización. No inferir ubicación actual desde prefijos de códigos heredados.

| Fila | DANE institución en otras hojas | DANE sede en otras hojas | Jornadas observadas | Pares distintos DANE |
| --- | --- | --- | --- | --- |
| 491 | 250577000251 | 250577000766 | MAÑANA | 1 |
| 492 | 250577000251 | 250590000805 | MAÑANA | 1 |
| 493 | 250577000251 | 250590000643 | MAÑANA | 1 |
| 494 | 250577000251 | 250590000864 | MAÑANA | 1 |
| 495 | 250577000251 | 250590000660 | MAÑANA | 1 |
| 496 | 250577000251 | 250577000251 | MAÑANA | 1 |
| 497 | 250577000251 | 250590000651 | MAÑANA | 1 |
| 498 | 250577000251 | 250590000015 | MAÑANA | 1 |
| 499 | 250577000251 | 450590000855 | MAÑANA | 1 |
| 514 | 250577000499 | 250577000499 | MAÑANA | 1 |
| 515 | 250577000499 | 250577000499 | MAÑANA | 1 |
| 516 | 250577000499 | 250577000537 | MAÑANA | 1 |
| 517 | 250577000499 | 250577000502 | MAÑANA | 1 |
| 518 | 250577000499 | 250590000210 | MAÑANA | 1 |
| 519 | 250577000499 | 250590000732 | MAÑANA | 1 |
| 520 | 250577000499 | 250590000180 | MAÑANA | 1 |
| 521 | 250577000499 | 250590000767 | MAÑANA | 1 |
| 522 | 250577000499 | 250590000759 | MAÑANA | 1 |
| 523 | 250577000499 | 250577000791 | MAÑANA | 1 |
| 524 | 250577000499 | 250450000503 | MAÑANA | 1 |
| 525 | 250577000499 | 250577000294 | MAÑANA | 1 |
| 526 | 250577000499 | 250577000731 | MAÑANA | 1 |
| 527 | 250577000499 | 250590000708 | MAÑANA | 1 |
| 528 | 250577000499 | 250590000775 | MAÑANA | 1 |
| 529 | 250577000499 | 250590000171 | MAÑANA | 1 |

Evidencia de código: cobertura.focalizacion.service.ts resolveInstitutionAndSede admite código nullable y consecutivo; cobertura.focalizacion.domain.ts calculateCoverageFromRule usa regla y focalizacion_total; operacion.schemas.ts diferencia sede/DANE opcional de filtros SIMAT/jornada; cambios-operativos.schemas.ts usa IDs y fecha, no exige DANE/jornada.

## Decisión humana: una fila por conflicto

| Fila | Municipio | Institución | Sede | Problema | Evidencia | Corrección propuesta (no aplicada) | Confianza | Requiere aprobación |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 491 | PUERTO RICO | CE LA SABANA | SEDE SAN RAFAEL | Homónimo global + fallback geográfico incorrecto | Texto exacto/catálogos24/agosto/final=734 | Resolver como734 Puerto Rico, sin editar Excel/catálogo | Alta contextual | Sí |
| 492 | PUERTO RICO | CE LA SABANA | SEDE LA SULTANA | Homónimo global + fallback geográfico incorrecto | Texto exacto/catálogos24/agosto/final=734 | Resolver como734 Puerto Rico, sin editar Excel/catálogo | Alta contextual | Sí |
| 493 | PUERTO RICO | CE LA SABANA | SEDE LA YE | Homónimo global + fallback geográfico incorrecto | Texto exacto/catálogos24/agosto/final=734 | Resolver como734 Puerto Rico, sin editar Excel/catálogo | Alta contextual | Sí |
| 494 | PUERTO RICO | CE LA SABANA | SEDE CAÑO RAYA | Homónimo global + fallback geográfico incorrecto | Texto exacto/catálogos24/agosto/final=734 | Resolver como734 Puerto Rico, sin editar Excel/catálogo | Alta contextual | Sí |
| 495 | PUERTO RICO | CE LA SABANA | SEDE EL OASIS | Homónimo global + fallback geográfico incorrecto | Texto exacto/catálogos24/agosto/final=734 | Resolver como734 Puerto Rico, sin editar Excel/catálogo | Alta contextual | Sí |
| 496 | PUERTO RICO | CE LA SABANA | SEDE PRINCIPAL LA SABANA | Homónimo global + fallback geográfico incorrecto | Texto exacto/catálogos24/agosto/final=734 | Resolver como734 Puerto Rico, sin editar Excel/catálogo | Alta contextual | Sí |
| 497 | PUERTO RICO | CE LA SABANA | SEDE SAN VICENTE ALTO | Homónimo global + fallback geográfico incorrecto | Texto exacto/catálogos24/agosto/final=734 | Resolver como734 Puerto Rico, sin editar Excel/catálogo | Alta contextual | Sí |
| 498 | PUERTO RICO | CE LA SABANA | SEDE SANTA INES | Homónimo global + fallback geográfico incorrecto | Texto exacto/catálogos24/agosto/final=734 | Resolver como734 Puerto Rico, sin editar Excel/catálogo | Alta contextual | Sí |
| 499 | PUERTO RICO | CE LA SABANA | SEDE SAUSALITO | Homónimo global + fallback geográfico incorrecto | Texto exacto/catálogos24/agosto/final=734 | Resolver como734 Puerto Rico, sin editar Excel/catálogo | Alta contextual | Sí |
| 514 | PUERTO RICO | INSTITUCION EDUCATIVA LA PRIMAVERA | SEDE PRINCIPAL BARRANCO COLORADO | Homónimo global + fallback geográfico incorrecto | Texto exacto/catálogos24/agosto/final=734 | Resolver como734 Puerto Rico, sin editar Excel/catálogo | Alta contextual | Sí |
| 515 | PUERTO RICO | INSTITUCION EDUCATIVA LA PRIMAVERA | SEDE PRINCIPAL BARRANCO COLORADO | Homónimo global + fallback geográfico incorrecto | Texto exacto/catálogos24/agosto/final=734 | Resolver como734 Puerto Rico, sin editar Excel/catálogo | Alta contextual | Sí |
| 516 | PUERTO RICO | INSTITUCION EDUCATIVA LA PRIMAVERA | SEDE BAJA PRIMAVERA | Homónimo global + fallback geográfico incorrecto | Texto exacto/catálogos24/agosto/final=734 | Resolver como734 Puerto Rico, sin editar Excel/catálogo | Alta contextual | Sí |
| 517 | PUERTO RICO | INSTITUCION EDUCATIVA LA PRIMAVERA | SEDE BRISAS DEL CAFRE | Homónimo global + fallback geográfico incorrecto | Texto exacto/catálogos24/agosto/final=734 | Resolver como734 Puerto Rico, sin editar Excel/catálogo | Alta contextual | Sí |
| 518 | PUERTO RICO | INSTITUCION EDUCATIVA LA PRIMAVERA | SEDE BUENA VISTA | Homónimo global + fallback geográfico incorrecto | Texto exacto/catálogos24/agosto/final=734 | Resolver como734 Puerto Rico, sin editar Excel/catálogo | Alta contextual | Sí |
| 519 | PUERTO RICO | INSTITUCION EDUCATIVA LA PRIMAVERA | SEDE LA CABAÑA | Homónimo global + fallback geográfico incorrecto | Texto exacto/catálogos24/agosto/final=734 | Resolver como734 Puerto Rico, sin editar Excel/catálogo | Alta contextual | Sí |
| 520 | PUERTO RICO | INSTITUCION EDUCATIVA LA PRIMAVERA | SEDE LA ESPERANZA | Homónimo global + fallback geográfico incorrecto | Texto exacto/catálogos24/agosto/final=734 | Resolver como734 Puerto Rico, sin editar Excel/catálogo | Alta contextual | Sí |
| 521 | PUERTO RICO | INSTITUCION EDUCATIVA LA PRIMAVERA | SEDE LA FUNDACIoN | Homónimo global + fallback geográfico incorrecto | Texto exacto/catálogos24/agosto/final=734 | Resolver como734 Puerto Rico, sin editar Excel/catálogo | Alta contextual | Sí |
| 522 | PUERTO RICO | INSTITUCION EDUCATIVA LA PRIMAVERA | SEDE LA LIBERTAD | Homónimo global + fallback geográfico incorrecto | Texto exacto/catálogos24/agosto/final=734 | Resolver como734 Puerto Rico, sin editar Excel/catálogo | Alta contextual | Sí |
| 523 | PUERTO RICO | INSTITUCION EDUCATIVA LA PRIMAVERA | SEDE LA UNIoN | Homónimo global + fallback geográfico incorrecto | Texto exacto/catálogos24/agosto/final=734 | Resolver como734 Puerto Rico, sin editar Excel/catálogo | Alta contextual | Sí |
| 524 | PUERTO RICO | INSTITUCION EDUCATIVA LA PRIMAVERA | SEDE LA VICTORIA | Homónimo global + fallback geográfico incorrecto | Texto exacto/catálogos24/agosto/final=734 | Resolver como734 Puerto Rico, sin editar Excel/catálogo | Alta contextual | Sí |
| 525 | PUERTO RICO | INSTITUCION EDUCATIVA LA PRIMAVERA | SEDE CHARCO DANTO | Homónimo global + fallback geográfico incorrecto | Texto exacto/catálogos24/agosto/final=734 | Resolver como734 Puerto Rico, sin editar Excel/catálogo | Alta contextual | Sí |
| 526 | PUERTO RICO | INSTITUCION EDUCATIVA LA PRIMAVERA | SEDE EL DORADO | Homónimo global + fallback geográfico incorrecto | Texto exacto/catálogos24/agosto/final=734 | Resolver como734 Puerto Rico, sin editar Excel/catálogo | Alta contextual | Sí |
| 527 | PUERTO RICO | INSTITUCION EDUCATIVA LA PRIMAVERA | SEDE LA REFORMA | Homónimo global + fallback geográfico incorrecto | Texto exacto/catálogos24/agosto/final=734 | Resolver como734 Puerto Rico, sin editar Excel/catálogo | Alta contextual | Sí |
| 528 | PUERTO RICO | INSTITUCION EDUCATIVA LA PRIMAVERA | SEDE LAGUNA GRINGO | Homónimo global + fallback geográfico incorrecto | Texto exacto/catálogos24/agosto/final=734 | Resolver como734 Puerto Rico, sin editar Excel/catálogo | Alta contextual | Sí |
| 529 | PUERTO RICO | INSTITUCION EDUCATIVA LA PRIMAVERA | SEDE CHISPAS | Homónimo global + fallback geográfico incorrecto | Texto exacto/catálogos24/agosto/final=734 | Resolver como734 Puerto Rico, sin editar Excel/catálogo | Alta contextual | Sí |
| 691 | — | TOTAL COBERTURA DEPARTAMENTO | TOTAL COBERTURA DEPARTAMENTO | FILA_RESUMEN_NO_APLICABLE | Etiqueta/fórmulas de resumen o residuo; sin identidad | Excluir del conjunto importable tras aprobación; no crear catálogo | Alta estructural | Sí |
| 692 | — | — | — | FILA_INVÁLIDA | Etiqueta/fórmulas de resumen o residuo; sin identidad | Excluir del conjunto importable tras aprobación; no crear catálogo | Alta estructural | Sí |
| 693 | — | — | — | FILA_INVÁLIDA | Etiqueta/fórmulas de resumen o residuo; sin identidad | Excluir del conjunto importable tras aprobación; no crear catálogo | Alta estructural | Sí |
| 697 | — | CAARES | SEDES QUE SE MODIFICARON LOS CUPOS POR LA DIOCESIS | FILA_RESUMEN_NO_APLICABLE | Etiqueta/fórmulas de resumen o residuo; sin identidad | Excluir del conjunto importable tras aprobación; no crear catálogo | Alta estructural | Sí |
| 699 | — | \| | — | FILA_INVÁLIDA | Etiqueta/fórmulas de resumen o residuo; sin identidad | Excluir del conjunto importable tras aprobación; no crear catálogo | Alta estructural | Sí |

## Escenarios alternativos NO AUTORIZABLES

| Escenario | Válidas | Excluidas propuestas | Bloqueadas | Altas/bajas | Cambios modalidad | Puestos estimados |
| --- | --- | --- | --- | --- | --- | --- |
| A | 663 | 5 | 25 | 25/49 | 24 | 688 |
| B | 688 | 5 | 0 | 25/24 | 24 | 695 |
| C | 663 | 0 | 25 | 25/24 | 24 | 695 |

A retiene el bloqueo anterior. Sus49 bajas son artefacto de analizar663 filas, NO una instrucción de eliminar25 combinaciones. B recomienda corregir resolución contextual y excluir contenido no registro, dejando688 combinaciones; no aplica DML. C conserva688 candidatas con25 bloqueos y cinco auxiliares sin decisión: NO_APTO. Todos requieren revisión; sin snapshot autorizable ni modo mutador.

## Evidencia externa y límites

DANE define códigos de sede de12 dígitos: https://www.dane.gov.co/files/tramites/Manual-usuario-SISEv1.pdf . Esto invalida tratar14 dígitos como DANE oficial.

Secretaría Meta, resolución4673/2019 ubica CE LA SABANA e IE LA PRIMAVERA en Puerto Rico (antecedente histórico, no censo2026): https://devx.meta.gov.co/media/centrodocumentacion/2020/11/18/Resoluci%C3%B3n_4673__Por_medio_de_la_cual_se_determinan_los_Establecimientos_Educativos_ubicados_en_%C3%A1reas_rurales_de_dif%C3%ADcil_acceso_2020.pdf . No copiamos DANE de otras sedes ni derivamos jornadas desde ese antecedente.

## Conservación y validación

SHA256 Excel 745e04bbf1cc51ed194e5514704c3441b2b9088e34fe513f2e8f2ecf9db566a3. SHA256 preview original 1ba1bb3e5b3b5487292edf086b01a176bcea81fdb2b16c1363d73359612470ac.
El runner exige el hash aprobado y comprueba originales tras ROLLBACK. Revalida digest agosto contra preview original. Escrituras productivas0, catálogos creados0, importaciones0, recálculos0. Sólo se crean estos dos informes locales.
Validación:30/30 pruebas pertinentes PASS, typecheck backend PASS; no se ejecutaron suites con credenciales productivas. El workspace original de Nómina conserva su digest.

Decisión: CONFLICTOS RESUELTOS CON EVIDENCIA — REQUIERE APROBACIÓN HUMANA.
