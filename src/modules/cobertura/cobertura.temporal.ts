const toIsoDateString = (value: Date | string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  const parsed = new Date(`${trimmed}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

export const getTodayIsoDate = (): string => new Date().toISOString().slice(0, 10);

export const resolveCoberturaFechaConsulta = (
  fecha: Date | string | null | undefined,
  fallbackDate: Date | string = getTodayIsoDate(),
): string => {
  return toIsoDateString(fecha) ?? toIsoDateString(fallbackDate) ?? getTodayIsoDate();
};

export const isDateActiveOn = (input: {
  endDate?: Date | string | null;
  queryDate: Date | string;
  startDate: Date | string | null;
}): boolean => {
  const startDate = toIsoDateString(input.startDate);
  const endDate = toIsoDateString(input.endDate);
  const queryDate = resolveCoberturaFechaConsulta(input.queryDate);

  if (!startDate) {
    return false;
  }

  return startDate <= queryDate && (!endDate || endDate >= queryDate);
};

export const isCoberturaAssignmentActiveOnDate = (input: {
  assignmentActive?: boolean;
  assignmentEndDate?: Date | string | null;
  assignmentStartDate: Date | string | null;
  queryDate: Date | string;
  vinculacionActive?: boolean;
  vinculacionEndDate?: Date | string | null;
  vinculacionStartDate: Date | string | null;
}): boolean => {
  if (input.assignmentActive === false || input.vinculacionActive === false) {
    return false;
  }

  return isDateActiveOn({
    startDate: input.assignmentStartDate,
    endDate: input.assignmentEndDate,
    queryDate: input.queryDate,
  }) && isDateActiveOn({
    startDate: input.vinculacionStartDate,
    endDate: input.vinculacionEndDate,
    queryDate: input.queryDate,
  });
};

