export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export interface ApiOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getToken(): string | null {
  return localStorage.getItem("taskora_token");
}

export function setToken(token: string): void {
  localStorage.setItem("taskora_token", token);
}

export function clearToken(): void {
  localStorage.removeItem("taskora_token");
}

export async function apiRequest<T>(path: string, options?: ApiOptions): Promise<T> {
  const opts = options || {};
  const headers: Record<string, string> = Object.assign({}, opts.headers || {});
  const token = getToken();
  if (token) {
    headers["Authorization"] = "Bearer " + token;
  }

  let body: string | undefined = undefined;
  // Content-Type JSON seulement s'il y a un body
  // (sinon DELETE échoue avec Fastify : body vide + application/json)
  if (opts.body !== undefined && opts.body !== null) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  const init: RequestInit = {
    method: opts.method || "GET",
    headers: headers,
  };
  if (body !== undefined) {
    init.body = body;
  }
  const res = await fetch(path, init);
  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    let message = "Erreur réseau";
    if (isRecord(data) && typeof data.error === "string" && data.error) {
      message = data.error;
    }
    throw new ApiError(message, res.status);
  }
  return data as T;
}
