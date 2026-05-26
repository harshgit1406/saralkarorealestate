import { useEffect, useState } from 'react'
import { Dashboard } from './components/dashboard/Dashboard'
import { Login } from './components/auth/Login'
import { getMe, logout, type UserProfile } from './lib/authApi'
import {
  clearAuthTokens,
  readAnyStoredAccessToken,
  readAnyStoredRefreshToken,
} from './lib/authStorage'

function App() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [isRestoringSession, setIsRestoringSession] = useState(true)

  useEffect(() => {
    const accessToken = readAnyStoredAccessToken()

    if (!accessToken) {
      setIsRestoringSession(false)
      return
    }

    getMe(accessToken)
      .then(setUser)
      .catch(() => {
        clearAuthTokens()
      })
      .finally(() => {
        setIsRestoringSession(false)
      })
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
