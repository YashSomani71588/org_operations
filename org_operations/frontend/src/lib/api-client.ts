export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiRequestError("Could not reach the server. Check your connection and try again.", null, "NETWORK_ERROR");
  }

  const raw = await response.text();
  let payload: Record<string, unknown> | null = null;
  if (raw) {
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      if (!response.ok) {
        throw new ApiRequestError(`The server returned an invalid response (${response.status}).`, response.status, "INVALID_RESPONSE");
      }
    }
  }

  if (!response.ok) {
    const code = typeof payload?.error === "string" ? payload.error : "REQUEST_FAILED";
    const message = typeof payload?.message === "string"
      ? payload.message
      : `The request could not be completed (${response.status}).`;
    throw new ApiRequestError(message, response.status, code, payload?.details);
  }

  return (payload ?? undefined) as T;
}
