export type SstPreparationStatus =
  | 'APTO_APPLY_AUTOMATICO'
  | 'APTO_APPLY_PARCIAL'
  | 'REQUIERE_REVISION'
  | 'SIN_DATOS_DIGITALES';

export type SstDigitalStatus =
  | 'COMPLETA_DIGITAL'
  | 'PARCIAL_DIGITAL'
  | 'CONFLICTO_REAL'
  | 'NO_ENCONTRADA_DIGITAL'
  | 'REQUIERE_REVISION';

export type SstCompletenessStatus =
  | 'COMPLETA'
  | 'INCOMPLETA'
  | 'NO_REALIZADA'
  | 'REQUIERE_REVISION';

export type SstReviewConflictType = 'FORMULARIOS' | 'DUPLICADO_F2' | 'AFILIACION';

export type SstReviewDecision =
  | 'USAR_FUENTE_A'
  | 'USAR_FUENTE_B'
  | 'INGRESAR_VALOR_MANUAL'
  | 'MANTENER_MAESTRO'
  | 'DESCARTAR_CAMBIO';

export type SstReviewState = 'PENDIENTE' | 'RESUELTO' | 'DESCARTADO';

export type EmergencyContactProposalType =
  | 'COINCIDE'
  | 'CONTACTO_NUEVO'
  | 'POSIBLE_ACTUALIZACION'
  | 'CONFLICTO';

export interface EmergencyContactMasterShape {
  nombre_contacto?: string | null;
  parentesco?: string | null;
  telefono?: string | null;
}

export interface EmergencyContactFormShape {
  nombre_contacto?: string | null;
  parentesco?: string | null;
  telefono?: string | null;
}

export interface EmergencyContactProposal {
  classification: EmergencyContactProposalType;
  payload: {
    nombre_contacto: string | null;
    parentesco: string | null;
    telefono: string | null;
  } | null;
}

export interface AcademicFormationDraft {
  nivel_educativo: string | null;
  titulo_programa: string | null;
  institucion: string | null;
  estado_formacion: 'FINALIZADO' | 'EN_CURSO';
  actualmente_estudia: boolean;
  origen: 'FORMULARIO_DIGITAL';
}

export interface AcademicFormationDraftInput {
  nivel_escolaridad?: string | null;
  titulo_obtenido?: string | null;
  estudia_actualmente?: string | boolean | null;
  programa_actual?: string | null;
}

export interface RestrictedSstPayloadInput {
  tiene_discapacidad?: boolean | null;
  tipo_discapacidad?: string | null;
  presenta_alergias?: string | null;
  medicamentos_permanentes?: string | null;
  enfermedad?: string | null;
  tipo_sangre_rh?: string | null;
}

export const SST_RESTRICTED_FIELDS = [
  'tiene_discapacidad',
  'tipo_discapacidad',
  'presenta_alergias',
  'medicamentos_permanentes',
  'enfermedad',
  'tipo_sangre_rh'
] as const;

const hasValue = (value: unknown): boolean => {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  return true;
};

const normalizeComparableText = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
};

const normalizePhone = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const digits = String(value).replace(/\D+/g, '');
  return digits.length > 0 ? digits : null;
};

const normalizeBooleanLike = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = normalizeComparableText(value);
  if (!normalized) {
    return null;
  }

  if (['si', 's', 'true', '1', 'yes'].includes(normalized)) {
    return true;
  }

  if (['no', 'n', 'false', '0'].includes(normalized)) {
    return false;
  }

  return null;
};

const sameText = (left: unknown, right: unknown): boolean =>
  normalizeComparableText(left) === normalizeComparableText(right);

export const classifyEmergencyContactProposal = (
  master: EmergencyContactMasterShape,
  form: EmergencyContactFormShape
): EmergencyContactProposal => {
  const payload = {
    nombre_contacto: hasValue(form.nombre_contacto) ? String(form.nombre_contacto).trim() : null,
    parentesco: hasValue(form.parentesco) ? String(form.parentesco).trim() : null,
    telefono: hasValue(form.telefono) ? normalizePhone(form.telefono) : null
  };

  const hasFormContact = hasValue(payload.nombre_contacto) || hasValue(payload.parentesco) || hasValue(payload.telefono);
  if (!hasFormContact) {
    return {
      classification: 'COINCIDE',
      payload: null
    };
  }

  const masterEmpty =
    !hasValue(master.nombre_contacto) &&
    !hasValue(master.parentesco) &&
    !hasValue(master.telefono);

  if (masterEmpty) {
    return {
      classification: 'CONTACTO_NUEVO',
      payload
    };
  }

  const sameName = !hasValue(payload.nombre_contacto) || sameText(master.nombre_contacto, payload.nombre_contacto);
  const sameKinship = !hasValue(payload.parentesco) || sameText(master.parentesco, payload.parentesco);
  const samePhone =
    !hasValue(payload.telefono) || normalizePhone(master.telefono) === normalizePhone(payload.telefono);

  if (sameName && sameKinship && samePhone) {
    return {
      classification: 'COINCIDE',
      payload: null
    };
  }

  const canComplete =
    (!hasValue(master.nombre_contacto) && hasValue(payload.nombre_contacto)) ||
    (!hasValue(master.parentesco) && hasValue(payload.parentesco)) ||
    (!hasValue(master.telefono) && hasValue(payload.telefono));

  if (canComplete && (sameName || !hasValue(master.nombre_contacto)) && (sameKinship || !hasValue(master.parentesco)) && (samePhone || !hasValue(master.telefono))) {
    return {
      classification: 'POSIBLE_ACTUALIZACION',
      payload
    };
  }

  return {
    classification: 'CONFLICTO',
    payload
  };
};

export const buildAcademicFormationDrafts = (
  input: AcademicFormationDraftInput
): AcademicFormationDraft[] => {
  const drafts: AcademicFormationDraft[] = [];
  const nivel = hasValue(input.nivel_escolaridad) ? String(input.nivel_escolaridad).trim() : null;
  const titulo = hasValue(input.titulo_obtenido) ? String(input.titulo_obtenido).trim() : null;
  const estudiaActualmente = normalizeBooleanLike(input.estudia_actualmente);
  const programaActual = hasValue(input.programa_actual) ? String(input.programa_actual).trim() : null;

  if (nivel || titulo) {
    drafts.push({
      nivel_educativo: nivel,
      titulo_programa: titulo,
      institucion: null,
      estado_formacion: 'FINALIZADO',
      actualmente_estudia: false,
      origen: 'FORMULARIO_DIGITAL'
    });
  }

  if (estudiaActualmente === true || programaActual) {
    drafts.push({
      nivel_educativo: nivel,
      titulo_programa: programaActual,
      institucion: null,
      estado_formacion: 'EN_CURSO',
      actualmente_estudia: true,
      origen: 'FORMULARIO_DIGITAL'
    });
  }

  const unique = new Map<string, AcademicFormationDraft>();
  for (const draft of drafts) {
    const key = [
      normalizeComparableText(draft.nivel_educativo),
      normalizeComparableText(draft.titulo_programa),
      draft.estado_formacion
    ].join('|');
    if (!unique.has(key)) {
      unique.set(key, draft);
    }
  }

  return [...unique.values()];
};

export const buildRestrictedSstPayload = (
  input: RestrictedSstPayloadInput
): Record<string, string | boolean | null> => {
  const payload: Record<string, string | boolean | null> = {};

  if (input.tiene_discapacidad !== undefined) {
    payload.tiene_discapacidad = input.tiene_discapacidad ?? null;
  }
  if (hasValue(input.tipo_discapacidad)) {
    payload.tipo_discapacidad = String(input.tipo_discapacidad).trim();
  }
  if (hasValue(input.presenta_alergias)) {
    payload.presenta_alergias = String(input.presenta_alergias).trim();
  }
  if (hasValue(input.medicamentos_permanentes)) {
    payload.medicamentos_permanentes = String(input.medicamentos_permanentes).trim();
  }
  if (hasValue(input.enfermedad)) {
    payload.enfermedad = String(input.enfermedad).trim();
  }
  if (hasValue(input.tipo_sangre_rh)) {
    payload.tipo_sangre_rh = String(input.tipo_sangre_rh).trim();
  }

  return payload;
};

export const derivePreparationCompletenessStatus = (
  status: SstPreparationStatus,
  percentage: number
): SstCompletenessStatus => {
  if (status === 'REQUIERE_REVISION') {
    return 'REQUIERE_REVISION';
  }

  if (status === 'SIN_DATOS_DIGITALES') {
    return 'NO_REALIZADA';
  }

  return percentage >= 100 ? 'COMPLETA' : 'INCOMPLETA';
};

export const mapReviewTypeToUiFilter = (
  type: SstReviewConflictType
): 'DIGITAL' | 'AFILIACION' => (type === 'AFILIACION' ? 'AFILIACION' : 'DIGITAL');
