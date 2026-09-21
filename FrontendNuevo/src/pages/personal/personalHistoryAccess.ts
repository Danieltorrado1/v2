export function canReadPersonalHistory(roles: readonly string[] | null | undefined): boolean {
  return (roles ?? []).some((role) => role.trim().toUpperCase() === 'ADMINISTRADOR');
}

export function visiblePersonalTabIds(
  roles: readonly string[] | null | undefined,
  canReadSst: boolean,
): string[] {
  const tabs = ['personal', 'laboral', 'academico', 'familia'];
  if (canReadSst) tabs.push('sst');
  tabs.push('documentos');
  if (canReadPersonalHistory(roles)) tabs.push('historial');
  return tabs;
}
