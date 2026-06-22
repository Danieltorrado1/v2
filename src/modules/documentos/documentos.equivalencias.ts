const requirementToDocumentCodeMap = new Map<string, string>([
  ['ANTECEDENTES PROCURADURIA', 'ANT_PROCURADURIA'],
  ['ANTECEDENTES CONTRALORIA', 'ANT_CONTRALORIA'],
  ['ANTECEDENTES JUDICIALES', 'ANT_JUDICIALES'],
  ['ANTECEDENTES MEDIDAS CORRECTIVAS', 'ANT_MEDIDAS_CORRECTIVAS'],
  ['ANTECEDENTES REDAM', 'ANT_REDAM'],
  ['ANTECEDENTES INHABILIDADES', 'ANT_INHABILIDADES'],
  ['AUTORIZACION DE DATOS PERSONALES', 'AUT_DATOS_PERSONALES'],
  ['AUTORIZACION DE INHABILIDADES', 'AUT_INHABILIDADES'],
  ['EXAMENES DE SALUD OCUPACIONAL', 'EXAMEN_SALUD_OCUPACIONAL'],
  ['CARNET VACUNACION', 'CARNET_VACUNACION'],
  ['TITULO PROFESIONAL', 'TITULO_PROFESIONAL']
]);

export const normalizeRequirementName = (value: string): string => {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
};

export const resolveDocumentCodeByRequirementName = (nombreRequisito: string): string | null => {
  const normalizedName = normalizeRequirementName(nombreRequisito);
  return requirementToDocumentCodeMap.get(normalizedName) ?? null;
};
