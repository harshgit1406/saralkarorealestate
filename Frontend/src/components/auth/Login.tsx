import { useState } from 'react'
import { login, type UserProfile } from '../../lib/authApi'
import { storeAuthTokens } from '../../lib/authStorage'

type LoginProps = {
  onAuthenticated: (user: UserProfile) => void
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        d="M3 3 21 21"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.6 6.2A11.2 11.2 0 0 1 12 6c6.5 0 10 6 10 6a18.5 18.5 0 0 1-3.2 3.9M6.2 6.7C3.6 8.4 2 12 2 12a18.2 18.2 0 0 0 10 6 10.8 10.8 0 0 0 4.2-.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.9 9.9A3 3 0 0 0 14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Login({ onAuthenticated }: LoginProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [organizationSlug, setOrganizationSlug] = useState('blf')
  const [usernameOrEmail, setUsernameOrEmail] = useState('')
  const [password, setPassword] = useState('')
  const [keepSignedIn, setKeepSignedIn] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage('')
    setIsSubmitting(true)

    try {
      const auth = await login({
        organization_slug: organizationSlug,
        username_or_email: usernameOrEmail,
        password,
        device_label: navigator.userAgent,
      })
      storeAuthTokens(auth.access_token, auth.refresh_token, keepSignedIn)
      onAuthenticated(auth.user)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to sign in')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="relative min-h-screen overflow-hidden bg-white font-['Plus_Jakarta_Sans'] text-[#1e2331]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[6%] top-[15%] h-[130px] w-[420px] rounded-full bg-white/70 blur-2xl" />
        <div className="absolute left-[42%] top-[12%] h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-[#ffd9cc]/46 blur-3xl" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col px-5 pb-10 pt-7 sm:px-8 lg:px-12 lg:pb-12 lg:pt-10">
        <header className="flex items-center gap-3">
          <img
            src="/saral-realestate.svg"
            alt=""
            aria-hidden="true"
            className="h-10 w-12 shrink-0"
          />
          <span className="text-xl font-semibold tracking-[-0.03em] text-[#1c2130] sm:text-[20px]">
            Saral RealEstate ERP
          </span>
        </header>

        <div className="mx-auto flex w-full max-w-[1220px] flex-1 items-center">
          <div className="grid w-full items-center gap-6 lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[400px_minmax(0,1fr)]">
            <section className="mx-auto w-full max-w-[400px] rounded-[22px] border border-white/70 bg-white/88 px-7 py-8 shadow-[0_18px_52px_rgba(15,23,42,0.08)] backdrop-blur-sm sm:px-8 sm:py-9">
              <img
                src="/client.svg"
                alt="BLF Developers"
                className="mx-auto h-auto w-[102px] sm:w-[106px]"
              />

              <div className="mt-8">
                <h1 className="text-[24px] font-semibold tracking-[-0.04em] text-[#1d2433] sm:text-[26px]">
                  Sign in
                </h1>
                <p className="mt-1.5 text-[14px] text-[#8a909f]">
                  Welcome back! Please enter your details.
                </p>
              </div>

              <form
                className="mt-7 space-y-4.5"
                onSubmit={handleSubmit}
              >
                <label className="block">
                  <span className="mb-2 block text-[12px] font-semibold uppercase tracking-[0.04em] text-[#434a58]">
                    Organization
                  </span>
                  <input
                    type="text"
                    value={organizationSlug}
                    onChange={(event) => setOrganizationSlug(event.target.value)}
                    placeholder="blf"
                    required
                    className="h-11 w-full rounded-[10px] border border-[#dfe4ea] bg-white px-4 text-[14px] text-[#1d2433] outline-none transition focus:border-[#ff7a45] focus:ring-4 focus:ring-[#ff7a45]/10"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-[12px] font-semibold uppercase tracking-[0.04em] text-[#434a58]">
                    Email Address or Username
                  </span>
                  <input
                    type="text"
                    value={usernameOrEmail}
                    onChange={(event) => setUsernameOrEmail(event.target.value)}
                    placeholder="admin@example.com"
                    required
                    className="h-11 w-full rounded-[10px] border border-[#dfe4ea] bg-white px-4 text-[14px] text-[#1d2433] outline-none transition focus:border-[#ff7a45] focus:ring-4 focus:ring-[#ff7a45]/10"
                  />
                </label>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-4">
                    <span className="block text-[12px] font-semibold uppercase tracking-[0.04em] text-[#434a58]">
                      Password
                    </span>
                    <button
                      type="button"
                      className="text-[12px] font-medium text-[#ff7a45] transition hover:text-[#f26830]"
                    >
                      Forgot Password?
                    </button>
                  </div>

                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="........"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      className="h-11 w-full rounded-[10px] border border-[#dfe4ea] bg-white px-4 pr-12 text-[14px] text-[#1d2433] outline-none transition focus:border-[#ff7a45] focus:ring-4 focus:ring-[#ff7a45]/10"
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword((current) => !current)}
                      className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-[#9aa3af] transition hover:text-[#6b7280]"
                    >
                      <EyeIcon open={showPassword} />
                    </button>
                  </div>
                </div>

                <label className="flex items-center gap-2.5 text-[13px] text-[#5b6475]">
                  <input
                    type="checkbox"
                    checked={keepSignedIn}
                    onChange={(event) => setKeepSignedIn(event.target.checked)}
                    className="h-4 w-4 rounded-[4px] border border-[#cfd6df] text-[#ff7a45] focus:ring-[#ff7a45]/20"
                  />
                  <span>Keep me logged in</span>
                </label>

                {errorMessage ? (
                  <p className="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700">
                    {errorMessage}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-11 w-full rounded-[9px] bg-[#ff7a45] text-[14px] font-medium text-white shadow-[0_10px_24px_rgba(255,122,69,0.28)] transition hover:bg-[#fb6d35]"
                >
                  {isSubmitting ? 'Signing In...' : 'Sign In'}
                </button>
              </form>

              <p className="mt-7 text-center text-[13px] text-[#7d8695]">
                Don&apos;t have an account?{' '}
                <button type="button" className="font-medium text-[#ff7a45] hover:text-[#f26830]">
                  Contact Admin
                </button>
              </p>
            </section>

            <section className="relative hidden min-h-[520px] items-center justify-center lg:flex">
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ffe1d6]/66 blur-3xl" />
              <img
                src="/login/login-visual.png"
                alt="Luxury real estate illustration"
                className="relative z-10 w-full max-w-[540px] object-contain drop-shadow-[0_28px_52px_rgba(31,23,14,0.18)] xl:max-w-[580px]"
              />
            </section>
          </div>
        </div>
      </div>
    </section>
  )
}
