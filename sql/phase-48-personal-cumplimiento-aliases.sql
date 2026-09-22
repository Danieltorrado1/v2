BEGIN;
-- Audit: these three existing types had no active canonical mapping. No documents or reviews change.
INSERT INTO documentos_requisitos_aliases(requisito_canonico_id,tipo_documento_id,tipo_alias)
SELECT c.id,t.id,'CANONICO' FROM documentos_requisitos_canonicos c JOIN tipos_documentos t
 ON (c.codigo,t.codigo) IN (('DOTACION_HISTORICA','DOTACION'),('TARJETA_PROFESIONAL','TARJETA_PROFESIONAL'),('ANTECEDENTES_PROFESIONALES','ANTECEDENTES_PROFESIONALES'))
ON CONFLICT (requisito_canonico_id,tipo_documento_id) DO NOTHING;
COMMIT;
