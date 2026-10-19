export type UserRole = "ADMIN" | "EMPLOYEE";

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

interface AuthResponse {
  user: AuthUser;
}

export { ApiRequestError as ApiError };
const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const { headers, ...requestInit } = init;

  return apiRequest<T>(`${apiBaseUrl}${path}`, {
    ...requestInit,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...headers
    }
  });
}

export function register(input: {
  fullName: string;
  email: string;
  password: string;
}) {
  return request<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function login(input: { email: string; password: string }) {
  return request<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getCurrentUser() {
  return request<AuthResponse>("/api/auth/me");
}

export function logout() {
  return request<void>("/api/auth/logout", {
    method: "POST"
  });
}
import { apiRequest, ApiRequestError } from "@/lib/api-client";
