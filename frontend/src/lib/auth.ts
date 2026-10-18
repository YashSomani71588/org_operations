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

interface ApiErrorPayload {
  error?: string;
  details?: Record<string, string[] | undefined>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly details?: Record<string, string[] | undefined>
  ) {
    super(message);
  }
}
const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const { headers, ...requestInit } = init;

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...requestInit,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...headers
    }
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | ApiErrorPayload
      | null;

    throw new ApiError(
      payload?.error ?? "REQUEST_FAILED",
      payload?.error,
      payload?.details
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
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
