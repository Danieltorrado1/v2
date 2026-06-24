import { api } from "./api";

export type LoginInput = {
  email: string;
  password: string;
};

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  active: boolean;
  roles: string[];
  permissions: string[];
  createdAt: string;
  updatedAt: string;
};

export type LoginResult = {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: string;
  user: AuthUser;
};

export async function login(data: LoginInput): Promise<LoginResult> {
  const response = await api.post("/auth/login", data);
  return response.data.data;
}

export async function getMe(): Promise<AuthUser> {
  const response = await api.get("/auth/me");
  return response.data.data;
}