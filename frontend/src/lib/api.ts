const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

export class ApiError extends Error {
  status: number
  detail: unknown

  constructor(status: number, message: string, detail?: unknown) {
    super(message)
    this.status = status
    this.detail = detail
  }
}

type ApiOptions = {
  method?: string
  body?: unknown
}

async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers: options.body
      ? {
          'Content-Type': 'application/json',
        }
      : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  if (!response.ok) {
    let detail = `API ${response.status}: ${path}`
    let payload: unknown
    try {
      const data = (await response.json()) as {
        detail?: string | { msg?: string; message?: string; code?: string; options?: unknown }[] | Record<string, unknown>
      }
      payload = data.detail
      if (typeof data.detail === 'string') {
        detail = data.detail
      } else if (
        data.detail &&
        typeof data.detail === 'object' &&
        !Array.isArray(data.detail) &&
        typeof (data.detail as { message?: string }).message === 'string'
      ) {
        detail = (data.detail as { message: string }).message
      }
    } catch {
      // keep default
    }
    throw new ApiError(response.status, detail, payload)
  }

  if (response.status === 204) {
    return undefined as T
  }
  return response.json() as Promise<T>
}

export async function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path)
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, { method: 'POST', body })
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, { method: 'PATCH', body })
}
