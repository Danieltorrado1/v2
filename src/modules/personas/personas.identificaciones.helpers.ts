export interface PersonaIdentificationCore {
  fecha_expedicion_documento: string | null;
  municipio_expedicion_id: number | null;
  numero_documento: string;
  tipo_documento_id: number;
}

export const normalizeNumeroDocumento = (value: string): string => {
  return value.trim();
};

export const buildPersonaIdentificationCore = (input: PersonaIdentificationCore): PersonaIdentificationCore => {
  return {
    tipo_documento_id: input.tipo_documento_id,
    numero_documento: normalizeNumeroDocumento(input.numero_documento),
    fecha_expedicion_documento: input.fecha_expedicion_documento ?? null,
    municipio_expedicion_id: input.municipio_expedicion_id ?? null
  };
};

export const hasPersonaIdentificationChanged = (
  current: PersonaIdentificationCore,
  next: PersonaIdentificationCore
): boolean => {
  return (
    current.tipo_documento_id !== next.tipo_documento_id ||
    normalizeNumeroDocumento(current.numero_documento) !== normalizeNumeroDocumento(next.numero_documento) ||
    (current.fecha_expedicion_documento ?? null) !== (next.fecha_expedicion_documento ?? null) ||
    (current.municipio_expedicion_id ?? null) !== (next.municipio_expedicion_id ?? null)
  );
};
