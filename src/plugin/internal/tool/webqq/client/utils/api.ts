import { webui } from '../context'

export interface ApiResponse<T = any> {
  success: boolean
  message?: string
  data: T
}

/** The WebUI's apiFetch on the plugin context: the reply's JSON, an error thrown for a failed status. */
export async function apiFetch<T = any>(url: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const response = await webui().fetch(url, options)
  if (!response.ok) {
    let message = `HTTP error! status: ${response.status}`
    try {
      message = (await response.json()).message || message
    } catch {
      // Not JSON
    }
    throw new Error(message)
  }
  return response.json()
}
