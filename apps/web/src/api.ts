export function apiUrl(path: string): string {
  const base = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/u, "") ?? "";
  return `${base}${path}`;
}

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function parseError(response: Response): Promise<ApiClientError> {
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string };
    };
    return new ApiClientError(
      response.status,
      body.error?.code ?? "INTERNAL_ERROR",
      body.error?.message ?? (response.statusText || "Request failed"),
    );
  } catch {
    return new ApiClientError(
      response.status,
      "INTERNAL_ERROR",
      response.statusText || "Request failed",
    );
  }
}

export async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(apiUrl(path));
  if (!response.ok) {
    throw await parseError(response);
  }
  return (await response.json()) as T;
}
