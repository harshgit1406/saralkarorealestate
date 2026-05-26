import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Bell, CircleHelp, Plus, Search } from 'lucide-react'
import { AppSidebar } from '../layout/AppSidebar'
import { appPrimaryNav, appSecondaryNav } from '../layout/appNavConfig'
import { MobileBottomNav } from '../layout/MobileBottomNav'
import {
  ActivityPage,
  CommunicationPage,
  CustomerPage,
  DocsPage,
  FinancePage,
  HelpPage,
  HrmsPage,
  LeadsPage,
  SettingsPage,
} from './BusinessPages'
import { InventoryHeaderControl, InventoryPage } from './InventoryPage'
import { OverviewPage } from './OverviewPage'
import { getWorkspacePages, type WorkspacePages } from '../../lib/workspaceApi'

type AppPageId =
  | 'dashboard'
  | 'properties'
  | 'inventory'
  | 'leads'
  | 'customer'
  | 'finance'
  | 'hrms'
  | 'communication'
  | 'activity'
  | 'settings'
  | 'docs'
  | 'help'
  | 'signout'

type DashboardProps = {
  currentUserName: string
  onLogout: () => void
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export function Dashboard({ currentUserName, onLogout }: DashboardProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activePage, setActivePage] = useState<AppPageId>('dashboard')
  const [workspacePages, setWorkspacePages] = useState<WorkspacePages | null>(null)
  const [workspaceError, setWorkspaceError] = useState<string | null>(null)
  const [searchValue, setSearchValue] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)

  const refreshWorkspace = useCallback((projectId = selectedProjectId) => {
    getWorkspacePages(projectId)
      .then((data) => {
        setWorkspacePages(data)
        setSelectedProjectId(data.inventory?.selectedProjectId ?? projectId ?? null)
        setWorkspaceError(null)
      })
      .catch((error: Error) => {
        if (error.message === 'Session expired') {
          setWorkspaceError(null)
          return
        }
        setWorkspaceError(error.message)
      })
  }, [selectedProjectId])

  useEffect(() => {
    refreshWorkspace()
  }, [refreshWorkspace])

  const mainContent = useMemo(() => {
    switch (activePage) {
      case 'dashboard':
        return (
          <OverviewPage
            metrics={workspacePages?.dashboard.metrics}
            activities={workspacePages?.activity.activities}
            currentUserName={currentUserName}
            leadLookups={workspacePages?.leads}
            onNavigate={(page) => setActivePage(page as AppPageId)}
            onRefresh={refreshWorkspace}
          />
        )
      case 'inventory':
        return <InventoryPage data={workspacePages?.inventory} onRefresh={() => refreshWorkspace()} />
      case 'leads':
        return <LeadsPage data={workspacePages?.leads} onRefresh={refreshWorkspace} />
      case 'customer':
        return <CustomerPage data={workspacePages?.customer} onRefresh={refreshWorkspace} />
      case 'finance':
        return <FinancePage data={workspacePages?.finance} onRefresh={refreshWorkspace} />
      case 'hrms':
        return <HrmsPage data={workspacePages?.hrms} onRefresh={refreshWorkspace} />
      case 'communication':
        return <CommunicationPage data={workspacePages?.communication} onRefresh={refreshWorkspace} />
      case 'activity':
        return <ActivityPage data={workspacePages?.activity} />
      case 'settings':
        return <SettingsPage data={workspacePages?.settings} onRefresh={refreshWorkspace} />
      case 'docs':
        return <DocsPage />
      case 'help':
        return <HelpPage />
      default:
        return (
          <OverviewPage
            metrics={workspacePages?.dashboard.metrics}
            activities={workspacePages?.activity.activities}
            currentUserName={currentUserName}
            leadLookups={workspacePages?.leads}
            onNavigate={(page) => setActivePage(page as AppPageId)}
            onRefresh={refreshWorkspace}
          />
        )
    }
  }, [activePage, currentUserName, refreshWorkspace, workspacePages])

  const handleProjectSelect = (projectId: number) => {
    setSelectedProjectId(projectId)
    refreshWorkspace(projectId)
  }

  const isInventoryPage = activePage === 'inventory'
  const userInitials = getInitials(currentUserName) || 'U'

  const handleSelectItem = (id: string) => {
    if (id === 'signout') {
      onLogout()
      return
    }

    setActivePage(id as AppPageId)
  }

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = searchValue.trim().toLowerCase()
    if (!value) {
      setActivePage('dashboard')
      return
    }
    if (value.includes('lead') || value.includes('prospect') || value.includes('call')) {
      setActivePage('leads')
      return
    }
    if (value.includes('customer') || value.includes('buyer') || value.includes('kyc')) {
      setActivePage('customer')
      return
    }
    if (value.includes('payment') || value.includes('invoice') || value.includes('finance')) {
      setActivePage('finance')
      return
    }
    if (value.includes('inventory') || value.includes('property') || value.includes('unit')) {
      setActivePage('inventory')
      return
    }
    setWorkspaceError(`No direct match for "${searchValue}". Showing leads as the broadest CRM search.`)
    setActivePage('leads')
  }

  const handleFloatingAction = () => {
    if (activePage === 'inventory') {
      return
    }
    if (activePage === 'finance') {
      setActivePage('finance')
      return
    }
    setActivePage('leads')
  }

  return (
    <section className="min-h-screen bg-[#F4F7FF] font-['Plus_Jakarta_Sans'] text-[#13265C]">
      <div className="flex min-h-screen">
        <AppSidebar
          isOpen={sidebarOpen}
          primaryItems={appPrimaryNav}
          secondaryItems={appSecondaryNav}
          activeItemId={activePage}
          onSelectItem={handleSelectItem}
          onToggle={() => setSidebarOpen((current) => !current)}
          onMouseEnter={() => setSidebarOpen(true)}
          onMouseLeave={() => setSidebarOpen(false)}
        />

        <main className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
          <header className="sticky top-0 z-40 shrink-0 border-b border-[#F1C3AA] bg-[#FCFBFF] px-4 py-3 sm:px-5 lg:px-7">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                {isInventoryPage ? (
                  <InventoryHeaderControl
                    data={workspacePages?.inventory}
                    selectedProjectId={selectedProjectId}
                    onProjectSelect={handleProjectSelect}
                    onProjectCreated={(projectId) => {
                      setSelectedProjectId(projectId)
                      refreshWorkspace(projectId)
                    }}
                  />
                ) : (
                  <form
                    onSubmit={handleSearchSubmit}
                    className="flex h-10 min-w-0 flex-1 items-center rounded-full bg-[#F2F4FF] px-4"
                  >
                    <Search className="h-[18px] w-[18px] text-[#596498]" strokeWidth={2} />
                    <input
                      type="text"
                      value={searchValue}
                      onChange={(event) => setSearchValue(event.target.value)}
                      placeholder="Search property, leads, or tasks..."
                      className="ml-3 w-full bg-transparent text-[14px] text-[#13265C] outline-none placeholder:text-[#7A84AB]"
                    />
                  </form>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 sm:justify-end sm:gap-5">
                <div className="flex items-center gap-3 sm:gap-4">
                  <button
                    type="button"
                    onClick={() => setActivePage('activity')}
                    className="relative text-[#596498]"
                    title="Activity notifications"
                  >
                    <Bell className="h-[18px] w-[18px]" strokeWidth={2} />
                    <span className="absolute -right-0.5 top-0 h-2 w-2 rounded-full bg-[#B85412]" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivePage('help')}
                    className="text-[#596498]"
                    title="Help center"
                  >
                    <CircleHelp className="h-[18px] w-[18px]" strokeWidth={2} />
                  </button>
                </div>

                <div className="hidden h-10 w-px bg-[#EBC2AE] sm:block" />

                <div className="flex items-center gap-3">
                  <div className="text-right leading-tight">
                    <p className="text-[13px] font-semibold text-[#13265C] sm:text-[14px]">
                      {currentUserName}
                    </p>
                    <p className="mt-1 text-[10px] font-semibold tracking-[0.08em] text-[#596498]">
                      SIGNED IN
                    </p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E8D1C3] bg-[linear-gradient(135deg,#E4C19E,#9E5A22)] text-xs font-bold text-white">
                    {userInitials}
                  </div>
                </div>
              </div>
            </div>
          </header>

          <div
            className={`min-h-0 flex-1 pb-28 sm:pb-28 lg:pb-7 ${
              isInventoryPage
                ? 'overflow-hidden px-0 py-0'
                : 'overflow-y-auto px-4 py-5 sm:px-5 lg:px-7 lg:py-7'
            }`}
          >
            {workspaceError ? (
              <div className="mx-4 mb-4 mt-4 rounded-[8px] border border-[#F1C3AA] bg-white px-4 py-3 text-[13px] font-medium text-[#B85412] lg:mx-7">
                {workspaceError}
              </div>
            ) : null}
            {mainContent}
          </div>
        </main>
      </div>

      {!isInventoryPage ? (
        <button
          type="button"
          onClick={handleFloatingAction}
          className="fixed bottom-24 right-5 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-[#B85412] text-white shadow-[0_18px_32px_rgba(184,84,18,0.28)] md:bottom-6 md:right-6"
        >
          <Plus className="h-6 w-6" strokeWidth={2.2} />
        </button>
      ) : null}

      <MobileBottomNav
        items={appPrimaryNav}
        activeItemId={activePage}
        onSelectItem={handleSelectItem}
      />
    </section>
  )
}
