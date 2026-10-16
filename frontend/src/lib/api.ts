const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
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
    try {
      const data = (await response.json()) as { detail?: string | { msg?: string }[] }
      if (typeof data.detail === 'string') {
        detail = data.detail
      }
    } catch {
      // keep default
    }
    throw new ApiError(response.status, detail)
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
