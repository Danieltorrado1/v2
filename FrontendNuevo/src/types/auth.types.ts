export type UserRole = string;
export type Permission = string;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  active: boolean;
  roles: UserRole[];
  permissions: Permission[];
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  user: AuthUser;
}
