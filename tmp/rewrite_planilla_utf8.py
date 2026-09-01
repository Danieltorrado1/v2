from pathlib import Path
import re
import subprocess

ROOT = Path.cwd()
PLANILLA = ROOT / 'FrontendNuevo/src/pages/nomina/PlanillaOperativaPage.tsx'
CSS = ROOT / 'FrontendNuevo/src/pages/nomina/PlanillaOperativaPage.css'
SERVICE = ROOT / 'src/modules/nomina/nomina.service.ts'


def replace_once(content: str, old: str, new: str, label: str) -> str:
    if old not in content:
        raise RuntimeError(f'Pattern not found: {label}')
    return content.replace(old, new, 1)


def replace_regex(content: str, pattern: str, repl: str, label: str) -> str:
    next_content, count = re.subn(pattern, repl, content, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f'Regex not found: {label}')
    return next_content


planilla = subprocess.check_output(
    ['git', 'show', 'HEAD:FrontendNuevo/src/pages/nomina/PlanillaOperativaPage.tsx'],
    text=True,
    encoding='utf-8',
)

planilla = replace_once(
    planilla,
    'import { apiClient } from "../../services/apiClient";\n',
    'import { ApiClientError, apiClient } from "../../services/apiClient";\n',
    'apiClient import',
)

planilla = replace_once(
    planilla,
    '''function buildContextTitle(employee: NominaEmpleadoApi, context: PlanillaContexto) {
  const visible = buildVisibleContext(employee, context);
  return [
    visible.municipio,
    visible.institucion,
    visible.sede,
    `${visible.modalidad} · Gestor: ${visible.gestor}`,
  ]
    .filter(Boolean)
    .join(" · ");
}
''',
    '''function buildContextTitle(employee: NominaEmpleadoApi, context: PlanillaContexto) {
  const visible = buildVisibleContext(employee, context);
  return [
    visible.municipio,
    visible.institucion,
    visible.sede,
    `${visible.modalidad} · Gestor: ${visible.gestor}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function shortDateLabel(value: string) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatOverlapConflictMessage(details: Record<string, unknown> | null | undefined) {
  const info = details ?? {};
  const nombre = typeof info.nombre === "string" && info.nombre.trim() ? info.nombre.trim() : "Novedad existente";
  const codigo = typeof info.codigo_operativo === "string" && info.codigo_operativo.trim()
    ? info.codigo_operativo.trim()
    : null;
  const inicio = typeof info.fecha_inicio === "string" && info.fecha_inicio.trim() ? info.fecha_inicio.trim() : null;
  const fin = typeof info.fecha_fin === "string" && info.fecha_fin.trim() ? info.fecha_fin.trim() : null;
  const rango = inicio && fin
    ? inicio === fin
      ? shortDateLabel(inicio) ?? inicio
      : `${shortDateLabel(inicio) ?? inicio} a ${shortDateLabel(fin) ?? fin}`
    : inicio
      ? shortDateLabel(inicio) ?? inicio
      : fin
        ? shortDateLabel(fin) ?? fin
        : null;

  return [
    "Ya existe una novedad activa que se cruza con las fechas seleccionadas.",
    codigo ? `Tipo: ${codigo}${nombre ? ` (${nombre})` : ""}.` : nombre ? `Tipo: ${nombre}.` : null,
    rango ? `Rango existente: ${rango}.` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function formatPlanillaErrorMessage(
  value: unknown,
  fallback: string,
  options?: { date?: string },
) {
  if (value instanceof ApiClientError) {
    if (value.code === "NOMINA_NOVEDAD_FECHA_OCUPADA") {
      return formatOverlapConflictMessage(value.details as Record<string, unknown> | null | undefined);
    }

    if (value.status === 429) {
      return "Demasiadas solicitudes en poco tiempo. Espera unos segundos e intenta de nuevo.";
    }

    if (options?.date) {
      return `${fallback} el ${shortDateLabel(options.date) ?? options.date}: ${value.message}`;
    }

    return value.message || fallback;
  }

  if (value instanceof Error) {
    if (options?.date) {
      return `${fallback} el ${shortDateLabel(options.date) ?? options.date}: ${value.message}`;
    }

    return value.message || fallback;
  }

  if (options?.date) {
    return `${fallback} el ${shortDateLabel(options.date) ?? options.date}.`;
  }

  return fallback;
}
''',
    'helper block',
)

planilla = replace_once(
    planilla,
    '  const [attendance, setAttendance] = useState<Attendance[]>([]);\n  const [reviews, setReviews] = useState<RevisionOperativaApi[]>([]);\n',
    '  const [attendance, setAttendance] = useState<Attendance[]>([]);\n  const [pendingAttendance, setPendingAttendance] = useState<Set<string>>(new Set());\n  const [attendanceFailures, setAttendanceFailures] = useState<Map<string, string>>(new Map());\n  const [reviews, setReviews] = useState<RevisionOperativaApi[]>([]);\n',
    'attendance state',
)

planilla = replace_once(
    planilla,
    '  const canReopen = user?.permissions.includes("nomina.periodos.reopen") === true;\n  const canSeeEconomic = user?.permissions.includes("nomina.economico.read") === true;\n  const selectedEmploymentMessage = selected ? getEmploymentStatusMessage(selected.employee, selected.date) : null;\n  const actorUserId = user?.id ? String(user.id) : null;\n',
    '  const canReopen = user?.permissions.includes("nomina.periodos.reopen") === true;\n  const canSeeEconomic = user?.permissions.includes("nomina.economico.read") === true;\n  const selectedEmploymentMessage = selected ? getEmploymentStatusMessage(selected.employee, selected.date) : null;\n  const actorUserId = user?.id ? String(user.id) : null;\n  const selectedAttendanceKey = selected ? `${selected.employee.vinculacion_id}|${selected.date}` : null;\n  const selectedAttendancePending = selectedAttendanceKey ? pendingAttendance.has(selectedAttendanceKey) : false;\n  const selectedAttendanceFailure = selectedAttendanceKey ? attendanceFailures.get(selectedAttendanceKey) ?? null : null;\n',
    'selected attendance state',
)

planilla = replace_regex(
    planilla,
    r'  const toggleAttendance = async \(employee: NominaEmpleadoApi, date: string, remove = false\) => \{.*?\n  \};\n\n  const saveReview = async',
    '''  const toggleAttendance = async (employee: NominaEmpleadoApi, date: string, remove = false) => {
    if (!editable || isOutsideEmployment(employee, date)) {
      return;
    }

    const key = `${employee.vinculacion_id}|${date}`;
    if (pendingAttendance.has(key)) {
      return;
    }

    const activeNovelty = novedadesOnDate(noveltyByEmployee.get(employee.id) ?? [], date)[0];
    if (!remove && activeNovelty) {
      const message = `No puedes marcar asistencia el ${shortDateLabel(date) ?? date} porque existe una novedad activa: ${novedadCode(activeNovelty)}.`;
      setAttendanceFailures((current) => {
        const next = new Map(current);
        next.set(key, message);
        return next;
      });
      setError(message);
      return;
    }

    const shouldPresent = !remove && !present.has(key);
    const nextItem: Attendance = {
      activo: true,
      estado_dia: "PRESENTE",
      fecha: date,
      vinculacion_id: employee.vinculacion_id,
    };

    setError("");
    setPendingAttendance((current) => new Set(current).add(key));
    setAttendanceFailures((current) => {
      const next = new Map(current);
      next.delete(key);
      return next;
    });

    try {
      await markNominaAsistencia(periodId, employee.vinculacion_id, date, shouldPresent);
      setAttendance((current) => mergeAttendance(current, nextItem, !shouldPresent));
      setAttendanceFailures((current) => {
        const next = new Map(current);
        next.delete(key);
        return next;
      });
      invalidateReviewLocally(employee, "ASISTENCIA_MODIFICADA");
    } catch (value) {
      const message = formatPlanillaErrorMessage(value, "No fue posible actualizar asistencia", { date });
      setAttendanceFailures((current) => {
        const next = new Map(current);
        next.set(key, message);
        return next;
      });
      setError(message);
    } finally {
      setPendingAttendance((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };

  const saveReview = async''',
    'toggleAttendance',
)

planilla = replace_regex(
    planilla,
    r'  const openCell = \(employee: NominaEmpleadoApi, date: string\) => \{.*?\n  \};\n\n  const openNovelty = \(cell: SelectedCell\) => \{',
    '''  const openCell = (employee: NominaEmpleadoApi, date: string) => {
    const wasSelected = selected?.employee.id === employee.id && selected.date === date;
    const context =
      buildTramos(employee, start, end, changesByLink.get(employee.vinculacion_id) ?? []).find(
        (item) => item.inicio <= date && item.fin >= date,
      )?.contexto ?? employeeBaseContext(employee);

    setSelected({ employee, date, context });

    if (rangeSelection && rangeSelection.employeeId === employee.id) {
      setRangeSelection({ ...rangeSelection, end: date });
      return;
    }

    if (
      present.has(`${employee.vinculacion_id}|${date}`) ||
      novedadesOnDate(noveltyByEmployee.get(employee.id) ?? [], date).length > 0 ||
      coverageTurnsOnDate(coverageTurnByEmployee.get(employee.id) ?? [], date).length > 0
    ) {
      return;
    }

    if (wasSelected && !pendingAttendance.has(`${employee.vinculacion_id}|${date}`)) {
      void toggleAttendance(employee, date);
    }
  };

  const openNovelty = (cell: SelectedCell) => {''',
    'openCell',
)

planilla = replace_once(
    planilla,
    '    } catch (value) {\n      setError(value instanceof Error ? value.message : "No fue posible registrar la novedad");\n    } finally {\n',
    '    } catch (value) {\n      setError(formatPlanillaErrorMessage(value, "No fue posible registrar la novedad", { date: noveltyCell.date }));\n    } finally {\n',
    'saveNovelty catch',
)

planilla = replace_regex(
    planilla,
    r'  const markRange = async \(\) => \{.*?\n  \};\n\n  const clearFilters = \(\) => \{',
    '''  const markRange = async () => {
    if (!selected || !rangeSelection || !editable) {
      return;
    }

    const from = rangeSelection.start < (rangeSelection.end ?? rangeSelection.start)
      ? rangeSelection.start
      : rangeSelection.end ?? rangeSelection.start;
    const to = rangeSelection.start < (rangeSelection.end ?? rangeSelection.start)
      ? rangeSelection.end ?? rangeSelection.start
      : rangeSelection.start;

    try {
      const result = (await markNominaAsistenciaRango(
        periodId,
        selected.employee.vinculacion_id,
        from,
        to,
      )) as AttendanceRangeResult;

      setAttendance((current) => {
        let next = current;
        for (const fecha of result.marcados ?? []) {
          next = mergeAttendance(
            next,
            {
              activo: true,
              estado_dia: "PRESENTE",
              fecha,
              vinculacion_id: selected.employee.vinculacion_id,
            },
            false,
          );
        }
        return next;
      });
      setAttendanceFailures((current) => {
        const next = new Map(current);
        for (const fecha of result.marcados ?? []) {
          next.delete(`${selected.employee.vinculacion_id}|${fecha}`);
        }
        return next;
      });

      if ((result.total_marcados ?? 0) > 0) {
        invalidateReviewLocally(selected.employee, "ASISTENCIA_MODIFICADA");
      }

      const firstOmitted = result.omitidos?.[0]?.motivo;
      setError(
        `Rango: ${result.total_marcados ?? 0} marcados, ${result.total_omitidos ?? 0} omitidos${
          firstOmitted ? ` · ${firstOmitted}` : ""
        }`,
      );
      setRangeSelection(null);
    } catch (value) {
      setError(formatPlanillaErrorMessage(value, "No fue posible marcar el rango", { date: from }));
    }
  };

  const clearFilters = () => {''',
    'markRange',
)

planilla = replace_once(
    planilla,
    '          <option value="NOMBRE_ASC">Ordenar por · Nombre A-Z</option>\n',
    '          <option value="NOMBRE_ASC">Ordenar por Nombre A-Z</option>\n',
    'sort option',
)


planilla = replace_once(
    planilla,
    '                        className={`op-cell ${calendarDay.className} ${outside ? "outside" : ""} ${tramo?.cambioId ? "change" : ""} ${activeNoveltiesOnThisDay.length ? "has-active-novelty" : ""}`}\n',
    '                        className={`op-cell ${calendarDay.className} ${outside ? "outside" : ""} ${tramo?.cambioId ? "change" : ""} ${activeNoveltiesOnThisDay.length ? "has-active-novelty" : ""} ${isPendingAttendance ? "pending-attendance" : ""} ${hasAttendanceFailure ? "attendance-error" : ""}`}\n',
    'cell class',
)

planilla = replace_once(
    planilla,
    '          {selectedEmploymentMessage ? <div className="op-inline-note compact"><span>{selectedEmploymentMessage}</span></div> : null}\n\n          <div className="op-actions">\n',
    '          {selectedAttendancePending ? (\n            <div className="op-inline-note compact pending"><span>{`Guardando asistencia del ${shortDateLabel(selected.date) ?? selected.date}...`}</span></div>\n          ) : null}\n\n          {selectedAttendanceFailure ? (\n            <div className="op-inline-note compact error"><span>{selectedAttendanceFailure}</span></div>\n          ) : null}\n\n          {selectedEmploymentMessage ? <div className="op-inline-note compact"><span>{selectedEmploymentMessage}</span></div> : null}\n\n          <div className="op-actions">\n',
    'inspector attendance notes',
)

planilla = replace_once(
    planilla,
    '              <button type="button" disabled={!editable || Boolean(selectedEmploymentMessage)} onClick={() => void toggleAttendance(selected.employee, selected.date, true)}>\n                Quitar asistencia\n              </button>\n',
    '              <button type="button" disabled={!editable || Boolean(selectedEmploymentMessage) || selectedAttendancePending} onClick={() => void toggleAttendance(selected.employee, selected.date, true)}>\n                {selectedAttendancePending ? "Guardando..." : "Quitar asistencia"}\n              </button>\n',
    'remove attendance button',
)

planilla = replace_once(
    planilla,
    '              <button type="button" disabled={!editable || Boolean(selectedEmploymentMessage)} onClick={() => void toggleAttendance(selected.employee, selected.date)}>\n                Marcar asistencia\n              </button>\n',
    '              <button type="button" disabled={!editable || Boolean(selectedEmploymentMessage) || selectedAttendancePending} onClick={() => void toggleAttendance(selected.employee, selected.date)}>\n                {selectedAttendancePending ? "Guardando..." : "Marcar asistencia"}\n              </button>\n',
    'mark attendance button',
)

PLANILLA.write_text(planilla, encoding='utf-8', newline='\n')

css = CSS.read_text(encoding='utf-8')
css = replace_once(
    css,
    '.op-cell.has-active-novelty {\n',
    '''.op-cell.pending-attendance {
  background: color-mix(in srgb, #2563eb 16%, transparent);
  box-shadow: inset 0 0 0 1px #2563eb;
}

.op-cell.attendance-error {
  background: color-mix(in srgb, #dc2626 14%, transparent);
  box-shadow: inset 0 0 0 1px #dc2626;
}

.op-inline-note.pending {
  border-color: color-mix(in srgb, #2563eb 24%, var(--border-color, #d0d7e2));
  color: #1d4ed8;
}

.op-inline-note.error {
  border-color: color-mix(in srgb, #dc2626 24%, var(--border-color, #d0d7e2));
  color: #b91c1c;
}

.op-cell.has-active-novelty {
''',
    'css attendance states',
)
CSS.write_text(css, encoding='utf-8', newline='\n')

service = SERVICE.read_text(encoding='utf-8')
service, count = re.subn(
    r"const turnoRow = row\.rows\[0\]; if \(!turnoRow\) throw new AppError\('.*?',500,'NOMINA_TURNO_CREATE_FAILED'\);",
    "const turnoRow = row.rows[0]; if (!turnoRow) throw new AppError('No fue posible crear relacion de turno',500,'NOMINA_TURNO_CREATE_FAILED');",
    service,
    count=1,
)
if count != 1:
    raise RuntimeError('Pattern not found: NOMINA_TURNO_CREATE_FAILED line')
SERVICE.write_text(service, encoding='utf-8', newline='\n')




