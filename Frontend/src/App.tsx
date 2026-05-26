import { useEffect, useState } from 'react'
import { Dashboard } from './components/dashboard/Dashboard'
import { Login } from './components/auth/Login'
import { getMe, logout, refreshSession, type UserProfile } from './lib/authApi'
import {
  clearAuthTokens,
  readAnyStoredAccessToken,
  readAnyStoredRefreshToken,
  replaceStoredAuthTokens,
} from './lib/authStorage'

function App() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [isRestoringSession, setIsRestoringSession] = useState(true)

  useEffect(() => {
    const accessToken = readAnyStoredAccessToken()
    const refreshToken = readAnyStoredRefreshToken()

    if (!accessToken && !refreshToken) {
      setIsRestoringSession(false)
      return
    }

    const restore = async () => {
      if (accessToken) {
        try {
          const profile = await getMe(accessToken)
          setUser(profile)
          return
        } catch {
          // Try refresh below.
        }
      }

      if (!refreshToken) {
        clearAuthTokens()
        return
      }

      const tokens = await refreshSession(refreshToken)
      replaceStoredAuthTokens(tokens.access_token, tokens.refresh_token)
      setUser(tokens.user)
    }

    restore()
      .catch(() => {
        clearAuthTokens()
      })
      .finally(() => {
        setIsRestoringSession(false)
      })
  }, [])

  useEffect(() => {
    const handleExpired = () => {
      clearAuthTokens()
      setUser(null)
    }
    window.addEventListener('realstate:session-expired', handleExpired)
    return () => window.removeEventListener('realstate:session-expired', handleExpired)
  }, [])

  const handleLogout = async () => {
    const refreshToken = readAnyStoredRefreshToken()
    clearAuthTokens()
    setUser(null)

    if (refreshToken) {
      await logout(refreshToken).catch(() => undefined)
    }
  }

  if (isRestoringSession) {
    return (
      <div className="grid min-h-screen place-items-center bg-white text-sm font-medium text-[#5b6475]">
        Loading
      </div>
    )
  }

  return user ? (
    <Dashboard onLogout={handleLogout} currentUserName={user.full_name} />
  ) : (
    <Login onAuthenticated={setUser} />
  )
}

export default App
