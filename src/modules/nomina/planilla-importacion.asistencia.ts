/** Server-side evidence only. Missing work fields must fail closed. */
export function isInnocuousPendingAttendance(row: {
  activo: unknown; estado_dia: unknown; hora_ingreso: unknown; hora_salida: unknown; horas_trabajadas: unknown;
}): boolean {
  const hours = row.horas_trabajadas;
  const noHours = hours === null ||
    (typeof hours === 'number' || typeof hours === 'string' && hours.trim() !== '') && Number(hours) === 0;
  return row.activo === true && row.estado_dia === 'PENDIENTE' && row.hora_ingreso === null && row.hora_salida === null && noHours;
}
