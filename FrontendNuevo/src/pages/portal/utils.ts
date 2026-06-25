export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email;
  const atIndex = email.indexOf('@');
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  if (local.length <= 2) return `${local}@${domain}`;
  if (local.length === 3) return `${local.slice(0, 2)}*@${domain}`;
  if (local.length <= 5) {
    const tail = local.slice(-Math.min(3, local.length - 2));
    return `${local.slice(0, 2)}***${tail}@${domain}`;
  }
  const first = local.slice(0, 2);
  const last = local.slice(-3);
  const stars = '*'.repeat(Math.max(3, local.length - 5));
  return `${first}${stars}${last}@${domain}`;
}

export function formatFecha(iso: string): string {
  return iso;
}

export function generarNumero(): string {
  return `SOL-2026-${String(Math.floor(Math.random() * 900) + 100).padStart(3, '0')}`;
}
