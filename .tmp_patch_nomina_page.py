from pathlib import Path

path = Path(r FrontendNuevo/src/pages/nomina/NominaPage.tsx)
text = path.read_text(encoding=utf-8)

def must_replace(source: str, old: str, new: str) -> str:
    if old not in source:
        raise RuntimeError(pattern not found)
    return source.replace(old, new)

text = must_replace(
    text,
    '''import {
  createNominaNovedad,
  deactivateNominaNovedad,
''',
    '''import {
  createNominaNovedad,
  createNominaNovedadConTurno,
  deactivateNominaNovedad,
''',
)

text = must_replace(
    text,
    '''import {
  pickAvailableScopedId,
  readCompanyScopedStorage,
  writeCompanyScopedStorage,
} from ../../context/companyScope;
import { pickDefaultNominaPeriod } from ./nominaPeriods;
''',
    '''import {
  pickAvailableScopedId,
  readCompanyScopedStorage,
  writeCompanyScopedStorage,
} from ../../context/companyScope;
import { formatDateOnly, formatDateOnlyRange } from ./dateOnly;
import { pickDefaultNominaPeriod } from ./nominaPeriods;
''',
)

old_block = '''function parseDateOnlyForDisplay(value: string) {
  return new Date(__D__{value}T12:00:00Z);
}

function formatPeriodRange(fechaInicio: string, fechaFin: string) {
  if (!fechaInicio || !fechaFin) {
    return Rango no disponible;
  }

  const formatter = new Intl.DateTimeFormat(es-CO, {
    day: 2-digit,
    month: short,
    timeZone: UTC,
  });

  return __D__{formatter.format(parseDateOnlyForDisplay(fechaInicio))} - __D__{formatter.format(parseDateOnlyForDisplay(fechaFin))};
}

function formatNovedadRange(novedad: NominaNovedadApi) {
  if (novedad.fecha_inicio && novedad.fecha_fin) {
    return formatPeriodRange(novedad.fecha_inicio, novedad.fecha_fin);
  }

  if (novedad.fecha_inicio) {
    return new Intl.DateTimeFormat(es-CO, {
      day: 2-digit,
      month: short,
      year: numeric,
      timeZone: UTC,
    }).format(parseDateOnlyForDisplay(novedad.fecha_inicio));
  }

  if (novedad.fecha_fin) {
    return new Intl.DateTimeFormat(es-CO, {
      day: 2-digit,
      month: short,
      year: numeric,
      timeZone: UTC,
    }).format(parseDateOnlyForDisplay(novedad.fecha_fin));
  }

  return Sin fechas;
}
'''.replace('__D__', '$')
new_block = '''function formatPeriodRange(fechaInicio: string, fechaFin: string) {
  return formatDateOnlyRange(fechaInicio, fechaFin, {
    day: 2-digit,
    month: short,
  });
}

function formatNovedadRange(novedad: NominaNovedadApi) {
  if (novedad.fecha_inicio && novedad.fecha_fin) {
    return formatPeriodRange(novedad.fecha_inicio, novedad.fecha_fin);
  }

  if (novedad.fecha_inicio) {
    return formatDateOnly(novedad.fecha_inicio, {
      day: 2-digit,
      month: short,
      year: numeric,
    });
  }

  if (novedad.fecha_fin) {
    return formatDateOnly(novedad.fecha_fin, {
      day: 2-digit,
      month: short,
      year: numeric,
    });
  }

  return Sin fechas;
}
'''
text = must_replace(text, old_block, new_block)

old_block = '''      const savedNovedad = editingNovedad
        ? await updateNominaNovedad(editingNovedad.id, sharedPayload)
        : await createNominaNovedad({
            ...createPayload,
            ...sharedPayload,
          });

      syncLocalNovedadState(savedNovedad);

      closeNovedadModal();
'''
new_block = '''      const turnoPayload =
        novedadForm.cobertura_tipo === PERSONAL_VINCULADO && selectedCoverageEmployee
          ? {
              tipo: INTERNO as const,
              observacion:
                normalizeTextValue(novedadForm.cobertura_observacion_interna) ??
                normalizeTextValue(novedadForm.observacion) ??
                __D__{selectedNovedadType.codigo_operativo ?? NOVEDAD} con cobertura interna,
              persona_reemplazada_id: selectedFormEmployee.persona.id,
              contexto_operativo: {
                origen_cobertura: NOMINA_NOVEDADES,
                cobertura_interna_nomina_empleado_id: selectedCoverageEmployee.id,
                cobertura_interna_persona_cubre_id: novedadForm.cobertura_persona_cubre_id,
                cobertura_interna_vinculacion_cubre_id: novedadForm.cobertura_vinculacion_cubre_id,
              },
            }
          : novedadForm.cobertura_tipo === PERSONA_EXTERNA
            ? {
                tipo: EXTERNO as const,
                observacion:
                  normalizeTextValue(novedadForm.cobertura_observacion_interna) ??
                  normalizeTextValue(novedadForm.observacion) ??
                  __D__{selectedNovedadType.codigo_operativo ?? NOVEDAD} con cobertura externa,
                contexto_operativo: {
                  origen_cobertura: NOMINA_NOVEDADES,
                  persona_externa_nombre: normalizeTextValue(novedadForm.cobertura_nombre_externo),
                  cobertura_documento_externo: normalizeTextValue(novedadForm.cobertura_documento_externo),
                },
              }
            : null;

      const savedNovedad = editingNovedad
        ? await updateNominaNovedad(editingNovedad.id, sharedPayload)
        : turnoPayload
          ? (await createNominaNovedadConTurno({
              ...createPayload,
              ...sharedPayload,
              turno: turnoPayload,
            })).novedad
          : await createNominaNovedad({
              ...createPayload,
              ...sharedPayload,
            });

      syncLocalNovedadState(savedNovedad);
      await refreshSelectedPeriodData(selectedPeriodId);

      closeNovedadModal();
'''.replace('__D__', '$')
text = must_replace(text, old_block, new_block)

path.write_text(text, encoding=utf-8)