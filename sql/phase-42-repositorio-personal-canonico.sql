-- Fase 42: repositorio documental canónico de Personal.
-- Migración aditiva e idempotente. No elimina tipos, documentos ni reglas legacy.

CREATE TABLE IF NOT EXISTS documentos_requisitos_canonicos (
  id BIGSERIAL PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  grupo_visual TEXT NOT NULL,
  tipo_requisito TEXT NOT NULL CHECK (tipo_requisito IN ('OBLIGATORIO','CONDICIONAL','ACREDITABLE','HISTORICO')),
  cuenta_cumplimiento BOOLEAN NOT NULL DEFAULT FALSE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documentos_requisitos_aliases (
  requisito_canonico_id BIGINT NOT NULL REFERENCES documentos_requisitos_canonicos(id),
  tipo_documento_id BIGINT NOT NULL REFERENCES tipos_documentos(id),
  tipo_alias TEXT NOT NULL CHECK (tipo_alias IN ('CANONICO','LEGACY','COMPONENTE')),
  componente_codigo TEXT NULL,
  PRIMARY KEY (requisito_canonico_id, tipo_documento_id)
);

CREATE TABLE IF NOT EXISTS documentos_requisitos_reglas (
  id BIGSERIAL PRIMARY KEY,
  requisito_canonico_id BIGINT NOT NULL REFERENCES documentos_requisitos_canonicos(id),
  contrato_id BIGINT NULL REFERENCES contratos(id),
  contrato_cargo_id BIGINT NULL REFERENCES contrato_cargos(id),
  tipo_vinculacion_id BIGINT NULL REFERENCES tipos_vinculacion(id),
  aplica BOOLEAN NOT NULL DEFAULT TRUE,
  origen TEXT NOT NULL DEFAULT 'CONFIGURACION' CHECK (origen IN ('CONFIGURACION','LEGACY_IMPORT','SISTEMA')),
  UNIQUE (requisito_canonico_id, contrato_id, contrato_cargo_id, tipo_vinculacion_id)
);

CREATE TABLE IF NOT EXISTS documentos_requisitos_componentes (
  requisito_canonico_id BIGINT NOT NULL REFERENCES documentos_requisitos_canonicos(id),
  codigo_componente TEXT NOT NULL,
  nombre_componente TEXT NOT NULL,
  PRIMARY KEY (requisito_canonico_id, codigo_componente)
);

INSERT INTO documentos_requisitos_canonicos (codigo,nombre,grupo_visual,tipo_requisito,cuenta_cumplimiento)
VALUES
 ('HOJA_VIDA','Hoja de vida','DATOS_PERSONALES','OBLIGATORIO',TRUE),
 ('IDENTIDAD','Documento de identidad','DATOS_PERSONALES','OBLIGATORIO',TRUE),
 ('CERT_BANCARIA','Certificación bancaria','DATOS_PERSONALES','OBLIGATORIO',TRUE),
 ('RESIDENCIA','Certificado de residencia','DATOS_PERSONALES','ACREDITABLE',FALSE),
 ('SISBEN','SISBEN','DATOS_PERSONALES','ACREDITABLE',FALSE),
 ('AUT_DATOS','Autorización de Datos Personales','AUTORIZACIONES','OBLIGATORIO',TRUE),
 ('AUT_INHABILIDADES','Autorización de Inhabilidades','AUTORIZACIONES','OBLIGATORIO',TRUE),
 ('FORMACION','Formación académica','FORMACION','ACREDITABLE',FALSE),
 ('TARJETA_PROFESIONAL','Tarjeta Profesional','FORMACION','CONDICIONAL',TRUE),
 ('ANTECEDENTES_PROFESIONALES','Antecedentes Profesionales','FORMACION','CONDICIONAL',TRUE),
 ('CONTRATO','Contrato','CONTRATACION','OBLIGATORIO',TRUE),
 ('EPS','Afiliación EPS','SEGURIDAD_SOCIAL','OBLIGATORIO',TRUE),
 ('ARL','Afiliación ARL','SEGURIDAD_SOCIAL','OBLIGATORIO',TRUE),
 ('PENSION','Afiliación Pensión','SEGURIDAD_SOCIAL','CONDICIONAL',TRUE),
 ('CAJA','Afiliación Caja de Compensación','SEGURIDAD_SOCIAL','CONDICIONAL',TRUE),
 ('EXAMEN_OCUPACIONAL','Examen médico ocupacional','SST','CONDICIONAL',TRUE),
 ('VACUNACION','Carnet de vacunación','SST','CONDICIONAL',TRUE),
 ('INDUCCION','Formato de Inducción','SST','CONDICIONAL',TRUE),
 ('DOTACION_HISTORICA','Actas de Dotación','SST','HISTORICO',FALSE),
 ('MANIPULACION','Manipulación de alimentos','MANIPULACION','CONDICIONAL',TRUE),
 ('ANTECEDENTES','Antecedentes','ANTECEDENTES','CONDICIONAL',TRUE),
 ('CERT_LABORAL','Certificaciones laborales','ACREDITACIONES','ACREDITABLE',FALSE),
 ('HISTORIAL','Historial documental','HISTORIAL','HISTORICO',FALSE)
ON CONFLICT (codigo) DO UPDATE SET nombre=EXCLUDED.nombre, grupo_visual=EXCLUDED.grupo_visual, tipo_requisito=EXCLUDED.tipo_requisito, cuenta_cumplimiento=EXCLUDED.cuenta_cumplimiento;

INSERT INTO documentos_requisitos_canonicos (codigo,nombre,grupo_visual,tipo_requisito,cuenta_cumplimiento) VALUES
 ('ANT_CONTRALORIA','Antecedente Contraloría','ANTECEDENTES','CONDICIONAL',TRUE),('ANT_PROCURADURIA','Antecedente Procuraduría','ANTECEDENTES','CONDICIONAL',TRUE),('ANT_JUDICIALES','Antecedentes Judiciales','ANTECEDENTES','CONDICIONAL',TRUE),('ANT_MEDIDAS_CORRECTIVAS','Antecedente Medidas Correctivas','ANTECEDENTES','CONDICIONAL',TRUE),('ANT_REDAM','Antecedente REDAM','ANTECEDENTES','CONDICIONAL',TRUE),('ANT_INHABILIDADES','Certificado de Inhabilidades','ANTECEDENTES','CONDICIONAL',TRUE)
ON CONFLICT (codigo) DO UPDATE SET activo=TRUE;
UPDATE documentos_requisitos_canonicos SET activo=FALSE WHERE codigo='ANTECEDENTES';

INSERT INTO documentos_requisitos_componentes (requisito_canonico_id,codigo_componente,nombre_componente)
SELECT id,'CURSO','Curso de Manipulación de alimentos' FROM documentos_requisitos_canonicos WHERE codigo='MANIPULACION'
ON CONFLICT DO NOTHING;
INSERT INTO documentos_requisitos_componentes (requisito_canonico_id,codigo_componente,nombre_componente)
SELECT id,'EXAMENES','Exámenes de Manipulación de alimentos' FROM documentos_requisitos_canonicos WHERE codigo='MANIPULACION'
ON CONFLICT DO NOTHING;

INSERT INTO documentos_requisitos_aliases (requisito_canonico_id,tipo_documento_id,tipo_alias,componente_codigo)
SELECT r.id,t.id,CASE WHEN t.codigo IN ('CEDULA','PPT') THEN 'LEGACY' ELSE 'CANONICO' END,NULL
FROM documentos_requisitos_canonicos r JOIN tipos_documentos t ON (r.codigo,t.codigo) IN (('HOJA_VIDA','HV'),('IDENTIDAD','CEDULA'),('IDENTIDAD','PPT'),('CERT_BANCARIA','CERT_BANCARIA'))
ON CONFLICT DO NOTHING;
INSERT INTO documentos_requisitos_aliases (requisito_canonico_id,tipo_documento_id,tipo_alias)
SELECT r.id,t.id,'LEGACY' FROM documentos_requisitos_canonicos r JOIN tipos_documentos t ON t.codigo IN ('AUT_TRATAMIENTO_DATOS','AUT_DATOS_PERSONALES') WHERE r.codigo='AUT_DATOS' ON CONFLICT DO NOTHING;
INSERT INTO documentos_requisitos_aliases (requisito_canonico_id,tipo_documento_id,tipo_alias)
SELECT r.id,t.id,'LEGACY' FROM documentos_requisitos_canonicos r JOIN tipos_documentos t ON t.codigo IN ('AUT_INHABILIDADES','AUT_CONSULTA_DELITOS_SEXUALES') WHERE r.codigo='AUT_INHABILIDADES' ON CONFLICT DO NOTHING;
INSERT INTO documentos_requisitos_aliases (requisito_canonico_id,tipo_documento_id,tipo_alias,componente_codigo)
SELECT r.id,t.id,'COMPONENTE',CASE WHEN t.codigo='CURSO MAN DE ALIMENTOS' THEN 'CURSO' ELSE 'EXAMENES' END FROM documentos_requisitos_canonicos r JOIN tipos_documentos t ON t.codigo IN ('CURSO MAN DE ALIMENTOS','EXAMENES MAN DE ALIMENTOS') WHERE r.codigo='MANIPULACION' ON CONFLICT DO NOTHING;
INSERT INTO documentos_requisitos_aliases (requisito_canonico_id,tipo_documento_id,tipo_alias)
SELECT r.id,t.id,'LEGACY' FROM documentos_requisitos_canonicos r JOIN tipos_documentos t ON t.codigo IN ('INGRESO','EXAMEN_SALUD_OCUPACIONAL') WHERE r.codigo='EXAMEN_OCUPACIONAL' ON CONFLICT DO NOTHING;
INSERT INTO documentos_requisitos_aliases (requisito_canonico_id,tipo_documento_id,tipo_alias)
SELECT r.id,t.id,'LEGACY' FROM documentos_requisitos_canonicos r JOIN tipos_documentos t ON t.codigo IN ('TITULO_PROFESIONAL','DIPLOMA_BACHILLER','ACTA_BACHILLER','DIPLOMA_TECNICO','ACTA_TECNICO','DIPLOMA_TECNOLOGO','ACTA_TECNOLOGO','DIPLOMA_PROFESIONAL','ACTA_PROFESIONAL','DIPLOMA_ESPECIALIZACION','ACTA_ESPECIALIZACION','DIPLOMA_MAESTRIA','ACTA_MAESTRIA') WHERE r.codigo='FORMACION' ON CONFLICT DO NOTHING;
INSERT INTO documentos_requisitos_aliases (requisito_canonico_id,tipo_documento_id,tipo_alias)
SELECT r.id,t.id,'LEGACY' FROM documentos_requisitos_canonicos r JOIN tipos_documentos t ON t.codigo IN ('CONTRATO') WHERE r.codigo='CONTRATO' ON CONFLICT DO NOTHING;
INSERT INTO documentos_requisitos_aliases (requisito_canonico_id,tipo_documento_id,tipo_alias)
SELECT r.id,t.id,'CANONICO' FROM documentos_requisitos_canonicos r JOIN tipos_documentos t ON t.codigo IN ('AFILIACION_EPS','AFILIACION_ARL','AFILIACION_PENSION','AFILIACION_CAJA_COMPENSACION') WHERE (r.codigo,t.codigo) IN (('EPS','AFILIACION_EPS'),('ARL','AFILIACION_ARL'),('PENSION','AFILIACION_PENSION'),('CAJA','AFILIACION_CAJA_COMPENSACION')) ON CONFLICT DO NOTHING;
INSERT INTO documentos_requisitos_aliases (requisito_canonico_id,tipo_documento_id,tipo_alias)
SELECT r.id,t.id,'CANONICO' FROM documentos_requisitos_canonicos r JOIN tipos_documentos t ON t.codigo IN ('CARNET_VACUNACION','INDUCCION','CERT_LABORAL') WHERE (r.codigo,t.codigo) IN (('VACUNACION','CARNET_VACUNACION'),('INDUCCION','INDUCCION'),('CERT_LABORAL','CERT_LABORAL')) ON CONFLICT DO NOTHING;
INSERT INTO documentos_requisitos_aliases (requisito_canonico_id,tipo_documento_id,tipo_alias)
SELECT r.id,t.id,'LEGACY' FROM documentos_requisitos_canonicos r JOIN tipos_documentos t ON t.codigo IN ('ANT_PROCURADURIA','ANT_CONTRALORIA','ANT_JUDICIALES','ANT_MEDIDAS_CORRECTIVAS','ANT_REDAM','ANT_INHABILIDADES') WHERE r.codigo='ANTECEDENTES' ON CONFLICT DO NOTHING;
INSERT INTO documentos_requisitos_aliases (requisito_canonico_id,tipo_documento_id,tipo_alias)
SELECT r.id,t.id,'CANONICO' FROM documentos_requisitos_canonicos r JOIN tipos_documentos t ON t.codigo=r.codigo
WHERE r.codigo IN ('ANT_PROCURADURIA','ANT_CONTRALORIA','ANT_JUDICIALES','ANT_MEDIDAS_CORRECTIVAS','ANT_REDAM','ANT_INHABILIDADES') ON CONFLICT DO NOTHING;

-- Sólo se importan obligaciones antiguas compatibles con la matriz aprobada.
INSERT INTO documentos_requisitos_reglas (requisito_canonico_id,contrato_id,contrato_cargo_id,tipo_vinculacion_id,aplica,origen)
SELECT DISTINCT r.id,g.contrato_id,NULL::bigint,NULL::bigint,TRUE,'LEGACY_IMPORT'
FROM contrato_requisitos_generales g
JOIN documentos_requisitos_canonicos r ON r.codigo = CASE upper(trim(g.nombre_requisito))
 WHEN 'HOJA DE VIDA' THEN 'HOJA_VIDA' WHEN 'CEDULA' THEN 'IDENTIDAD' WHEN 'CERTIFICACION BANCARIA' THEN 'CERT_BANCARIA'
 WHEN 'AUTORIZACION DE DATOS PERSONALES' THEN 'AUT_DATOS' WHEN 'AUTORIZACION DE INHABILIDADES' THEN 'AUT_INHABILIDADES'
 WHEN 'CONTRATO' THEN 'CONTRATO' WHEN 'AFILIACION EPS' THEN 'EPS' WHEN 'AFILIACION ARL' THEN 'ARL'
 WHEN 'AFILIACION PENSION' THEN 'PENSION' WHEN 'AFILIACION CAJA DE COMPENSACION' THEN 'CAJA'
 WHEN 'CARNET VACUNACION' THEN 'VACUNACION' WHEN 'ANTECEDENTES PROCURADURIA' THEN 'ANT_PROCURADURIA'
 WHEN 'ANTECEDENTES CONTRALORIA' THEN 'ANT_CONTRALORIA' WHEN 'ANTECEDENTES JUDICIALES' THEN 'ANT_JUDICIALES'
 WHEN 'ANTECEDENTES MEDIDAS CORRECTIVAS' THEN 'ANT_MEDIDAS_CORRECTIVAS' WHEN 'ANTECEDENTES REDAM' THEN 'ANT_REDAM'
 WHEN 'ANTECEDENTES INHABILIDADES' THEN 'ANT_INHABILIDADES' ELSE NULL END
WHERE g.activo AND r.activo
  AND NOT EXISTS (
    SELECT 1 FROM documentos_requisitos_reglas existing
    WHERE existing.requisito_canonico_id = r.id
      AND existing.contrato_id IS NOT DISTINCT FROM g.contrato_id
      AND existing.contrato_cargo_id IS NULL
      AND existing.tipo_vinculacion_id IS NULL
  )
ON CONFLICT DO NOTHING;
