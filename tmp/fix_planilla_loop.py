from pathlib import Path
path = Path('FrontendNuevo/src/pages/nomina/PlanillaOperativaPage.tsx')
text = path.read_text(encoding='utf-8')
old = '''                    const key = `${employee.vinculacion_id}|${day}`;
                    const isPresent = present.has(key);
                    const outside = isOutsideEmployment(employee, day);
'''
new = '''                    const key = `${employee.vinculacion_id}|${day}`;
                    const isPresent = present.has(key);
                    const isPendingAttendance = pendingAttendance.has(key);
                    const hasAttendanceFailure = attendanceFailures.has(key);
                    const outside = isOutsideEmployment(employee, day);
'''
if old not in text:
    raise SystemExit('pattern not found')
path.write_text(text.replace(old, new, 1), encoding='utf-8', newline='\n')
