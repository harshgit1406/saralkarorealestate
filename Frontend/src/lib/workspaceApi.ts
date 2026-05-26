import { refreshSession } from './authApi'
import {
  clearAuthTokens,
  readAnyStoredAccessToken,
  readAnyStoredRefreshToken,
  replaceStoredAuthTokens,
} from './authStorage'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1'

export type WorkspacePages = {
  dashboard: { metrics: Record<string, number> }
  inventory: {
    counts: Record<string, number>
    selectedProjectId?: number | null
    projects?: Array<Record<string, string | number | boolean | null>>
    map?: Record<string, unknown> & { map_data?: { svg?: string; viewBox?: string } }
    mapElements?: Array<Record<string, string | number | boolean | null | undefined>>
    floors?: Array<Record<string, string | number | boolean | Record<string, unknown> | null>>
    units: Array<Record<string, string | number | Record<string, unknown> | null>>
    paymentPlans?: Array<Record<string, string | number | null>>
    customers?: Array<Record<string, string | number | boolean | null>>
    brokers?: Array<Record<string, string | number | boolean | null>>
  }
  leads: {
    items: Array<Record<string, string | number | boolean | Record<string, unknown> | null>>
    projects?: Array<Record<string, string | number | null>>
    sources?: Array<Record<string, string | number | boolean | Record<string, unknown> | null>>
    users?: Array<Record<string, string | number | null>>
    statusCounts?: Record<string, number>
    priorityCounts?: Record<string, number>
    sourcePerformance?: Array<Record<string, string | number | null>>
    integrations?: Array<Record<string, string | boolean | null>>
    followups?: Array<Record<string, string | number | null>>
    activities?: Array<Record<string, string | number | null>>
  }
  customer: { items: Array<Record<string, string | number | boolean | null>> }
  finance: {
    summary: Record<string, number>
    plans: Array<Record<string, string | number>>
    payments: Array<Record<string, string | number | null>>
    bookings: Array<Record<string, string | number | null>>
  }
  hrms: {
    users: Array<Record<string, string | number | boolean | null>>
    attendance: Array<Record<string, string | null>>
    roles?: Array<Record<string, string | number | boolean | string[] | null>>
    permissions?: Array<Record<string, string | number | null>>
  }
  communication: {
    calls: Array<Record<string, string | null>>
    messages: Array<Record<string, string | null>>
  }
  activity: {
    activities: Array<Record<string, string | null>>
    auditLogs: Array<Record<string, string | null>>
  }
  settings: {
    organization: Record<string, string | boolean | null> | null
    roles: Array<Record<string, string | boolean | null>>
  }
}

async function parseApiError(response: Response): Promise<string> {
  if (response.status === 401) {
    return 'Session expired'
  }
  try {
    const body = (await response.json()) as { detail?: string }
    if (body.detail) {
      return body.detail
    }
  } catch {
    // Keep fallback below.
  }
  return `Request failed with status ${response.status}`
}

async function getAccessTokenOrRefresh(): Promise<string> {
  const accessToken = readAnyStoredAccessToken()
  if (accessToken) return accessToken

  const refreshToken = readAnyStoredRefreshToken()
  if (!refreshToken) {
    throw new Error('Session expired')
  }

  const tokens = await refreshSession(refreshToken)
  replaceStoredAuthTokens(tokens.access_token, tokens.refresh_token)
  return tokens.access_token
}

async function refreshAndRetry(response: Response, retry: (accessToken: string) => Promise<Response>) {
  if (response.status !== 401) return response
  const refreshToken = readAnyStoredRefreshToken()
  if (!refreshToken) return response

  try {
    const tokens = await refreshSession(refreshToken)
    replaceStoredAuthTokens(tokens.access_token, tokens.refresh_token)
    return retry(tokens.access_token)
  } catch {
    clearAuthTokens()
    window.dispatchEvent(new Event('realstate:session-expired'))
    return response
  }
}

export async function getWorkspacePages(projectId?: number | null): Promise<WorkspacePages> {
  const accessToken = await getAccessTokenOrRefresh()

  const search = projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''
  const request = (token: string) => fetch(`${API_BASE_URL}/workspace/pages${search}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  const response = await refreshAndRetry(await request(accessToken), request)

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }

  return response.json() as Promise<WorkspacePages>
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const accessToken = await getAccessTokenOrRefresh()

  const request = (token: string) => fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })
  const response = await refreshAndRetry(await request(accessToken), request)

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }

  return response.json() as Promise<T>
}

export type ApiRecord = Record<string, unknown>

export function createLead(payload: ApiRecord) {
  return apiRequest<ApiRecord>('/leads', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateLead(id: number, payload: ApiRecord) {
  return apiRequest<ApiRecord>(`/leads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function deleteLead(id: number) {
  return apiRequest<{ deleted: boolean; id: number }>(`/leads/${id}`, {
    method: 'DELETE',
  })
}

export function assignLead(id: number, payload: ApiRecord) {
  return apiRequest<ApiRecord>(`/leads/${id}/assign`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function createLeadFollowup(id: number, payload: ApiRecord) {
  return apiRequest<ApiRecord>(`/leads/${id}/followups`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function createLeadActivity(id: number, payload: ApiRecord) {
  return apiRequest<ApiRecord>(`/leads/${id}/activities`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function createLeadSource(payload: ApiRecord) {
  return apiRequest<ApiRecord>('/leads/sources', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function createInventoryEntity(payload: ApiRecord) {
  return apiRequest<ApiRecord>('/inventory/entities', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function createProjectWithMap(payload: ApiRecord) {
  return apiRequest<ApiRecord>('/inventory/projects-with-map', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateInventoryEntity(id: number, payload: ApiRecord) {
  return apiRequest<ApiRecord>(`/inventory/entities/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function downloadInventoryExcel(projectId: number): Promise<Blob> {
  const accessToken = await getAccessTokenOrRefresh()
  const request = (token: string) => fetch(`${API_BASE_URL}/inventory/excel?project_id=${projectId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  const response = await refreshAndRetry(await request(accessToken), request)
  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }
  return response.blob()
}

export async function uploadInventoryExcel(projectId: number, file: File): Promise<ApiRecord> {
  const accessToken = await getAccessTokenOrRefresh()
  const request = (token: string) => fetch(`${API_BASE_URL}/inventory/excel/import?project_id=${projectId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
    body: file,
  })
  const response = await refreshAndRetry(await request(accessToken), request)
  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }
  return response.json() as Promise<ApiRecord>
}

export function createRole(payload: ApiRecord) {
  return apiRequest<ApiRecord>('/hrms/roles', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function replaceRolePermissions(roleId: number, permissionKeys: string[]) {
  return apiRequest<ApiRecord>(`/hrms/roles/${roleId}/permissions`, {
    method: 'PUT',
    body: JSON.stringify({ permission_keys: permissionKeys }),
  })
}

export function createBusinessResource(resource: string, payload: ApiRecord) {
  return apiRequest<ApiRecord>(`/business/${resource}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateBusinessResource(resource: string, id: number, payload: ApiRecord) {
  return apiRequest<ApiRecord>(`/business/${resource}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function deleteBusinessResource(resource: string, id: number) {
  return apiRequest<{ deleted: boolean; id: number }>(`/business/${resource}/${id}`, {
    method: 'DELETE',
  })
}

export function createBooking(payload: ApiRecord) {
  return apiRequest<ApiRecord>('/finance/bookings', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function createBookingBroker(payload: ApiRecord) {
  return apiRequest<ApiRecord>('/finance/booking-brokers', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function createBookingApplicant(payload: ApiRecord) {
  return apiRequest<ApiRecord>('/finance/booking-applicants', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateOrganization(payload: ApiRecord) {
  return apiRequest<ApiRecord>('/settings/organization', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function dispatchAutoCalls(limit = 10) {
  return apiRequest<{ items: Array<Record<string, unknown>> }>(
    `/communication/auto-call/dispatch?limit=${limit}`,
    {
      method: 'POST',
    },
  )
}

export function getAutoCallQueue() {
  return apiRequest<{ items: Array<Record<string, unknown>> }>('/communication/auto-call/queue')
}
