const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const file = path.join(root, "FrontendNuevo/src/pages/nomina/PlanillaOperativaPage.tsx");
let content = execFileSync("git", ["show", "HEAD:FrontendNuevo/src/pages/nomina/PlanillaOperativaPage.tsx"], { encoding: "utf8" });

function replaceOnce(search, replacement) {
  if (!content.includes(search)) {
    throw new Error(`Pattern not found:\n${search.slice(0, 160)}`);
  }
  content = content.replace(search, replacement);
}

function replaceRegex(pattern, replacement, label) {
  if (!pattern.test(content)) {
    throw new Error(`Regex not found: ${label}`);
  }
  content = content.replace(pattern, replacement);
}

replaceOnce(
  'import { apiClient } from "../../services/apiClient";',
  'import { ApiClientError, apiClient } from "../../services/apiClient";'
);

replaceOnce(
  `function buildContextTitle(employee: NominaEmpleadoApi, context: PlanillaContexto) {
  const visible = buildVisibleContext(employee, context);
  return [
    visible.municipio,
    visible.institucion,
    visible.sede,
    \`${visible.modalidad} · Gestor: ${visible.gestor}\`,
  ]
    .filter(Boolean)
    .join(" · ");
}
`,
  `function buildContextTitle(employee: NominaEmpleadoApi, context: PlanillaContexto) {
  const visible = buildVisibleContext(employee, context);
  return [
    visible.municipio,
    visible.institucion,
    visible.sede,
    \`${visible.modalidad} · Gestor: ${visible.gestor}\`,
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
  }).format(new Date(\`${value}T12:00:00Z\`));
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
      : \`${shortDateLabel(inicio) ?? inicio} a ${shortDateLabel(fin) ?? fin}\`
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
`
);

replaceOnce(
  `  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [reviews, setReviews] = useState<RevisionOperativaApi[]>([]);
`,
  `  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [pendingAttendance, setPendingAttendance] = useState<Set<string>>(new Set());
  const [attendanceFailures, setAttendanceFailures] = useState<Map<string, string>>(new Map());
  const [reviews, setReviews] = useState<RevisionOperativaApi[]>([]);
`
);

replaceOnce(
  `  const canReopen = user?.permissions.includes("nomina.periodos.reopen") === true;
  const canSeeEconomic = user?.permissions.includes("nomina.economico.read") === true;
  const selectedEmploymentMessage = selected ? getEmploymentStatusMessage(selected.employee, selected.date) : null;
  const actorUserId = user?.id ? String(user.id) : null;
`,
  `  const canReopen = user?.permissions.includes("nomina.periodos.reopen") === true;
  const canSeeEconomic = user?.permissions.includes("nomina.economico.read") === true;
  const selectedEmploymentMessage = selected ? getEmploymentStatusMessage(selected.employee, selected.date) : null;
  const actorUserId = user?.id ? String(user.id) : null;
  const selectedAttendanceKey = selected ? `${selected.employee.vinculacion_id}|${selected.date}` : null;
  const selectedAttendancePending = selectedAttendanceKey ? pendingAttendance.has(selectedAttendanceKey) : false;
  const selectedAttendanceFailure = selectedAttendanceKey ? attendanceFailures.get(selectedAttendanceKey) ?? null : null;
`
);

replaceRegex(
  /  const toggleAttendance = async \(employee: NominaEmpleadoApi, date: string, remove = false\) => \{[\s\S]*?\n  \};\n\n  const saveReview = async/m,
  `  const toggleAttendance = async (employee: NominaEmpleadoApi, date: string, remove = false) => {
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

  const saveReview = async`,
  "toggleAttendance"
);

replaceRegex(
  /  const openCell = \(employee: NominaEmpleadoApi, date: string\) => \{[\s\S]*?\n  \};\n\n  const openNovelty = \(cell: SelectedCell\) => \{/m,
  `  const openCell = (employee: NominaEmpleadoApi, date: string) => {
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

  const openNovelty = (cell: SelectedCell) => {`,
  "openCell"
);

replaceOnce(
  `    } catch (value) {
      setError(value instanceof Error ? value.message : "No fue posible registrar la novedad");
    } finally {
`,
  `    } catch (value) {
      setError(formatPlanillaErrorMessage(value, "No fue posible registrar la novedad", { date: noveltyCell.date }));
    } finally {
`
);

replaceRegex(
  /  const markRange = async \(\) => \{[\s\S]*?\n  \};\n\n  const clearFilters = \(\) => \{/m,
  `  const markRange = async () => {
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

  const clearFilters = () => {`,
  "markRange"
);

replaceOnce(
  '          <option value="NOMBRE_ASC">Ordenar por · Nombre A-Z</option>',
  '          <option value="NOMBRE_ASC">Ordenar por Nombre A-Z</option>'
);

replaceOnce(
  `                    <strong>{employee.persona.nombre_completo}</strong>
                    <small>{visible.municipio}</small>
                    <small>{visible.institucion}</small>
                    <small>{visible.sede}</small>
                    <small className="op-context-accent" title={`${getEmployeeModalidadDescription(employee)} · Gestor: ${visible.gestor}`}>
                      {visible.modalidad}
                    </small>
`,
  `                    <strong>{employee.persona.nombre_completo}</strong>
                    <small>{visible.municipio}</small>
                    <small>{visible.institucion}</small>
                    <small>{visible.sede}</small>
                    <small className="op-context-accent" title={`${getEmployeeModalidadDescription(employee)} · Gestor: ${visible.gestor}`}>
                      {visible.modalidad}
                    </small>
`
);

replaceOnce(
  '                <span>TRABAJADOR · CONTEXTO</span>',
  '                <span>TRABAJADOR / CONTEXTO</span>'
);

replaceOnce(
  `                        className={`op-cell ${calendarDay.className} ${outside ? "outside" : ""} ${tramo?.cambioId ? "change" : ""} ${activeNoveltiesOnThisDay.length ? "has-active-novelty" : ""}`}
`,
  `                        className={`op-cell ${calendarDay.className} ${outside ? "outside" : ""} ${tramo?.cambioId ? "change" : ""} ${activeNoveltiesOnThisDay.length ? "has-active-novelty" : ""} ${isPendingAttendance ? "pending-attendance" : ""} ${hasAttendanceFailure ? "attendance-error" : ""}`}
`
);

replaceOnce(
  `          {selectedEmploymentMessage ? <div className="op-inline-note compact"><span>{selectedEmploymentMessage}</span></div> : null}

          <div className="op-actions">
`,
  `          {selectedAttendancePending ? (
            <div className="op-inline-note compact pending"><span>{`Guardando asistencia del ${shortDateLabel(selected.date) ?? selected.date}...`}</span></div>
          ) : null}

          {selectedAttendanceFailure ? (
            <div className="op-inline-note compact error"><span>{selectedAttendanceFailure}</span></div>
          ) : null}

          {selectedEmploymentMessage ? <div className="op-inline-note compact"><span>{selectedEmploymentMessage}</span></div> : null}

          <div className="op-actions">
`
);

replaceOnce(
  `              <button type="button" disabled={!editable || Boolean(selectedEmploymentMessage)} onClick={() => void toggleAttendance(selected.employee, selected.date, true)}>
                Quitar asistencia
              </button>
`,
  `              <button type="button" disabled={!editable || Boolean(selectedEmploymentMessage) || selectedAttendancePending} onClick={() => void toggleAttendance(selected.employee, selected.date, true)}>
                {selectedAttendancePending ? "Guardando..." : "Quitar asistencia"}
              </button>
`
);

replaceOnce(
  `              <button type="button" disabled={!editable || Boolean(selectedEmploymentMessage)} onClick={() => void toggleAttendance(selected.employee, selected.date)}>
                Marcar asistencia
              </button>
`,
  `              <button type="button" disabled={!editable || Boolean(selectedEmploymentMessage) || selectedAttendancePending} onClick={() => void toggleAttendance(selected.employee, selected.date)}>
                {selectedAttendancePending ? "Guardando..." : "Marcar asistencia"}
              </button>
`
);

fs.writeFileSync(file, content, "utf8");
