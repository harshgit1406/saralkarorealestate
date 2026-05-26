const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1'

export type UserProfile = {
  id: number
  organization_id: number
  organization_name: string
  organization_slug: string
  full_name: string
  username: string
  email: string
  phone: string | null
  is_super_admin: boolean
}

export type AuthTokens = {
  access_token: string
  refresh_token: string
  token_type: 'bearer'
  expires_in: number
  user: UserProfile
}

export type LoginPayload = {
  organization_slug: string
  username_or_email: string
  password: string
  device_label?: string
}

async function parseApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string | Array<{ msg: string }> }
    if (typeof body.detail === 'string') {
      return body.detail
    }
    if (Array.isArray(body.detail) && body.detail.length > 0) {
      return body.detail.map((item) => item.msg).join(', ')
    }
  } catch {
    // Keep the fallback below when the response is not JSON.
  }

  return `Request failed with status ${response.status}`
}

export async function login(payload: LoginPayload): Promise<AuthTokens> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }

  return response.json() as Promise<AuthTokens>
}

export async function getMe(accessToken: string): Promise<UserProfile> {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }

  return response.json() as Promise<UserProfile>
}

export async function refreshSession(refreshToken: string): Promise<AuthTokens> {
  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })

  if (!response.ok) {
    throw new Error('Session expired')
  }

  return response.json() as Promise<AuthTokens>
}

export async function logout(refreshToken: string): Promise<void> {
  await fetch(`${API_BASE_URL}/auth/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
}
