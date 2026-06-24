import type { AuthUser } from "../services/authApi";

// Permisos visuales básicos: solo ocultan navegación, nunca bloquean nada que el
// backend ya proteja por su cuenta (cada endpoint sigue validando sus propios
// permisos con requirePermissions, independientemente de lo que el frontend muestre).
//
// Si el usuario no trae `permissions` (o llega vacío), se asume acceso total y se
// muestran todos los módulos — así no se bloquea desarrollo ni un login parcial.
export function can(user: AuthUser | null, permission: string): boolean {
  if (!user || !user.permissions || user.permissions.length === 0) return true;

  if (permission.endsWith(".*")) {
    const prefix = permission.slice(0, -1); // conserva el "." final
    return user.permissions.some((p) => p.startsWith(prefix));
  }

  return user.permissions.includes(permission);
}

export function hasAnyPermission(user: AuthUser | null, permissions: string[]): boolean {
  if (!user || !user.permissions || user.permissions.length === 0) return true;
  return permissions.some((permission) => can(user, permission));
}
