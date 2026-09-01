from pathlib import Path
path = Path('FrontendNuevo/src/pages/nomina/PlanillaOperativaPage.tsx')
source = path.read_text(encoding='utf-8').replace('\r\n','\n')
source = source.replace(
"""  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [pendingAttendance, setPendingAttendance] = useState<Set<string>>(new Set());
  const [attendanceFailures, setAttendanceFailures] = useState<Map<string, string>>(new Map());""",
"""  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [pendingAttendance, setPendingAttendance] = useState<Set<string>>(new Set());
  const pendingAttendanceRef = useRef<Set<string>>(new Set());
  const [attendanceFailures, setAttendanceFailures] = useState<Map<string, string>>(new Map());""",
1
)
source = source.replace(
"""  const toggleAttendance = async (employee: NominaEmpleadoApi, date: string, remove = false) => {
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
  };""",
"""  const toggleAttendance = async (employee: NominaEmpleadoApi, date: string, remove = false) => {
    if (!editable || isOutsideEmployment(employee, date)) {
      return;
    }

    const key = `${employee.vinculacion_id}|${date}`;
    if (pendingAttendanceRef.current.has(key)) {
      return;
    }

    const activeNovelty = novedadesOnDate(noveltyByEmployee.get(employee.id) ?? [], date).find(
      (item) => item.activo,
    );
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

    pendingAttendanceRef.current.add(key);
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
      pendingAttendanceRef.current.delete(key);
      setPendingAttendance((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };""",
1
)
source = source.replace(
"""  const openCell = (employee: NominaEmpleadoApi, date: string) => {
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
  };""",
"""  const openCell = (employee: NominaEmpleadoApi, date: string) => {
    const context =
      buildTramos(employee, start, end, changesByLink.get(employee.vinculacion_id) ?? []).find(
        (item) => item.inicio <= date && item.fin >= date,
      )?.contexto ?? employeeBaseContext(employee);
    const key = `${employee.vinculacion_id}|${date}`;
    const hasAttendance = present.has(key);
    const hasActiveNovelty = novedadesOnDate(noveltyByEmployee.get(employee.id) ?? [], date).some(
      (item) => item.activo,
    );
    const hasAdditionalTurns =
      coverageTurnsOnDate(coverageTurnByEmployee.get(employee.id) ?? [], date).length > 0;

    setSelected({ employee, date, context });

    if (rangeSelection && rangeSelection.employeeId === employee.id) {
      setRangeSelection({ ...rangeSelection, end: date });
      return;
    }

    if (
      !hasAttendance &&
      !hasActiveNovelty &&
      !hasAdditionalTurns &&
      !isOutsideEmployment(employee, date) &&
      !pendingAttendanceRef.current.has(key)
    ) {
      void toggleAttendance(employee, date);
    }
  };""",
1
)
source = source.replace(
"""                      >
                        {activeNoveltiesOnThisDay.length === 0 && isPresent ? <b className="op-attendance-mark">✓</b> : null}
                        {noveltiesOnThisDay.slice(0, 2).map((item) => (""",
"""                      >
                        {isPendingAttendance && !isPresent ? <span className="op-attendance-pending-mark">…</span> : null}
                        {activeNoveltiesOnThisDay.length === 0 && isPresent ? <b className="op-attendance-mark">✓</b> : null}
                        {noveltiesOnThisDay.slice(0, 2).map((item) => (""",
1
)
path.write_text(source.replace('\n','\r\n'), encoding='utf-8')
