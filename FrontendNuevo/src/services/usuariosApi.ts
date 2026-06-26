import { apiClient } from './apiClient';
import type { ApiResponse } from '../types/api.types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  active: boolean;
  roles: string[];
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserPayload {
  email: string;
  password: string;
  name: string;
  active?: boolean;
  roleIds?: string[];
}

export interface UpdateUserPayload {
  email?: string;
  password?: string;
  name?: string;
  active?: boolean;
  roleIds?: string[];
}

// ─── API Functions ────────────────────────────────────────────────────────────

export async function getUsers(): Promise<UserProfile[]> {
  const res = await apiClient.get<ApiResponse<UserProfile[]>>('/users');
  return res.data;
}

export async function getUserById(id: string): Promise<UserProfile> {
  const res = await apiClient.get<ApiResponse<UserProfile>>(`/users/${id}`);
  return res.data;
}

export async function createUser(payload: CreateUserPayload): Promise<UserProfile> {
  const res = await apiClient.post<ApiResponse<UserProfile>>('/users', payload);
  return res.data;
}

export async function updateUser(id: string, payload: UpdateUserPayload): Promise<UserProfile> {
  const res = await apiClient.patch<ApiResponse<UserProfile>>(`/users/${id}`, payload);
  return res.data;
}

export async function activateUser(id: string): Promise<UserProfile> {
  const res = await apiClient.patch<ApiResponse<UserProfile>>(`/users/${id}/activate`);
  return res.data;
}

export async function deactivateUser(id: string): Promise<UserProfile> {
  const res = await apiClient.patch<ApiResponse<UserProfile>>(`/users/${id}/deactivate`);
  return res.data;
}
