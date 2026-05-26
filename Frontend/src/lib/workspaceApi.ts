import { readAnyStoredAccessToken } from './authStorage'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1'

export type WorkspacePages = {
  dashboard: { metrics: Record<string, number> }
  inventory: {
    counts: Record<string, number>
    projects?: Array<Record<string, string | number | boolean | null>>
    map?: Record<string, unknown> & { map_data?: { svg?: string; viewBox?: string } }
    mapElements?: Array<Record<string, string | number | boolean | null | undefined>>
    floors?: Array<Record<string, string | number | boolean | null>>
    units: Array<Record<string, string | number | null>>
  }
  leads: {
    items: Array<Record<string, string | number | null>>
    projects?: Array<Record<string, string | number | null>>
    sources?: Array<Record<string, string | number | boolean | null>>
    users?: Array<Record<string, string | number | null>>
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

export async function getWorkspacePages(): Promise<WorkspacePages> {
  const accessToken = readAnyStoredAccessToken()
  if (!accessToken) {
    throw new Error('Authentication required')
  }

  const response = await fetch(`${API_BASE_URL}/workspace/pages`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }

  return response.json() as Promise<WorkspacePages>
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const accessToken = readAnyStoredAccessToken()
  if (!accessToken) {
    throw new Error('Authentication required')
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...options.headers,
    },
  })

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

export function createInventoryEntity(payload: ApiRecord) {
  return apiRequest<ApiRecord>('/inventory/entities', {
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
