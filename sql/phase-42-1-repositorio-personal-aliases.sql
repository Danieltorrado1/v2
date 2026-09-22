-- Corrección aditiva de phase-42: los acreditables conservan sus tipos existentes.
-- No crea documentos, tipos ni obligaciones; se puede ejecutar más de una vez.
INSERT INTO documentos_requisitos_aliases (requisito_canonico_id, tipo_documento_id, tipo_alias)
SELECT c.id, t.id, 'CANONICO'
FROM documentos_requisitos_canonicos c
JOIN tipos_documentos t ON t.codigo = c.codigo
WHERE c.codigo IN ('RESIDENCIA', 'SISBEN')
ON CONFLICT DO NOTHING;
