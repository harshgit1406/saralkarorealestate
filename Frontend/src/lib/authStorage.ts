const ACCESS_TOKEN_KEY = 'realstate.accessToken'
const REFRESH_TOKEN_KEY = 'realstate.refreshToken'

export function getStoredAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY)
}

export function getStoredRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function storeAuthTokens(accessToken: string, refreshToken: string, keepSignedIn: boolean) {
  const storage = keepSignedIn ? localStorage : sessionStorage
  storage.setItem(ACCESS_TOKEN_KEY, accessToken)
  storage.setItem(REFRESH_TOKEN_KEY, refreshToken)

  const otherStorage = keepSignedIn ? sessionStorage : localStorage
  otherStorage.removeItem(ACCESS_TOKEN_KEY)
  otherStorage.removeItem(REFRESH_TOKEN_KEY)
}

export function clearAuthTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  sessionStorage.removeItem(ACCESS_TOKEN_KEY)
  sessionStorage.removeItem(REFRESH_TOKEN_KEY)
}

export function readAnyStoredAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY) ?? sessionStorage.getItem(ACCESS_TOKEN_KEY)
}

export function readAnyStoredRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY) ?? sessionStorage.getItem(REFRESH_TOKEN_KEY)
}
