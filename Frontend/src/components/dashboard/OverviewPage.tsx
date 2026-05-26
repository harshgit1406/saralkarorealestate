import {
  ArrowRight,
  Building2,
  CalendarDays,
  ChevronDown,
  CircleCheckBig,
  CircleDollarSign,
  House,
  ReceiptText,
  RefreshCw,
  UserPlus,
} from 'lucide-react'
import { useState } from 'react'
import { createLead, type WorkspacePages } from '../../lib/workspaceApi'

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)

const titleCase = (value: unknown) =>
  String(value ?? 'Activity')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())

const metricCards = [
  {
    label: 'Total Projects',
    key: 'projects',
    value: '0',
    delta: '+12.5%',
    tone: 'bg-[#FFEEE5] text-[#C45A1A]',
    icon: Building2,
    deltaTone: 'bg-[#ECF9EE] text-[#16A34A]',
    target: 'inventory',
  },
  {
    label: 'Total Inventory',
    key: 'inventory',
    value: '0',
    delta: '-2.4%',
    tone: 'bg-[#E7E8FF] text-[#5961F7]',
    icon: House,
    deltaTone: 'bg-[#FDECEC] text-[#DC2626]',
    target: 'inventory',
  },
  {
    label: 'Active Leads',
    key: 'active_leads',
    value: '0',
    delta: '+8.2%',
    tone: 'bg-[#ECE9FF] text-[#5B53FF]',
    icon: UserPlus,
    deltaTone: 'bg-[#ECF9EE] text-[#16A34A]',
    target: 'leads',
  },
  {
    label: 'Total Revenue',
    key: 'revenue',
    value: '₹0',
    delta: '+22.1%',
    tone: 'bg-[#E7FAED] text-[#1E9E57]',
    icon: CircleDollarSign,
    deltaTone: 'bg-[#ECF9EE] text-[#16A34A]',
    target: 'finance',
  },
]

const leadSources = [
  { label: 'Organic Search', value: 42, color: 'bg-[#B85412]' },
  { label: 'Social Media', value: 28, color: 'bg-[#C8734D]' },
  { label: 'Referrals', value: 18, color: 'bg-[#D4987F]' },
  { label: 'Direct Mail', value: 12, color: 'bg-[#E0B09E]' },
]

const quickActions = [
  { label: 'Add Property', icon: Building2, target: 'inventory' },
  { label: 'Invoices', icon: ReceiptText, target: 'finance' },
]

export function OverviewPage({
  metrics = {},
  activities = [],
  currentUserName,
  leadLookups,
  onNavigate,
  onRefresh,
}: {
  metrics?: Record<string, number>
  activities?: Array<Record<string, string | null>>
  currentUserName: string
  leadLookups?: WorkspacePages['leads']
  onNavigate?: (page: string) => void
  onRefresh?: () => void
}) {
  const [dateRange, setDateRange] = useState('Last 30 Days')
  const [dateOpen, setDateOpen] = useState(false)
  const [leadPanel, setLeadPanel] = useState<'lead' | 'viewing' | null>(null)
  const [leadName, setLeadName] = useState('')
  const [leadPhone, setLeadPhone] = useState('')
  const [leadError, setLeadError] = useState('')
  const [isSavingLead, setIsSavingLead] = useState(false)

  const recentActivities = activities.length
    ? activities.slice(0, 3).map((activity) => ({
        title: titleCase(activity.type),
        detail: activity.description ?? 'Activity recorded',
        time: activity.createdAt ? new Date(activity.createdAt).toLocaleString() : 'Recently',
        tone:
          activity.type === 'received'
            ? 'bg-[#EAF9EF] text-[#16A34A]'
            : 'bg-[#EEF4FF] text-[#2563EB]',
        icon: activity.type === 'received' ? CircleCheckBig : RefreshCw,
      }))
    : []

  const handleExport = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      dateRange,
      metrics,
      activities,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `realstate-dashboard-${Date.now()}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const handleCreateLead = async () => {
    if (!leadName.trim() || !leadPhone.trim()) {
      setLeadError('Name and phone are required.')
      return
    }
    setIsSavingLead(true)
    setLeadError('')
    try {
      await createLead({
        name: leadName,
        phone: leadPhone,
        status: leadPanel === 'viewing' ? 'site_visit_scheduled' : 'new',
        priority: leadPanel === 'viewing' ? 'high' : 'medium',
        project_id: leadLookups?.projects?.[0]?.id,
        lead_source_id: leadLookups?.sources?.[0]?.id,
        assigned_to: leadLookups?.users?.[0]?.id,
        next_follow_up_at:
          leadPanel === 'viewing'
            ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            : undefined,
        auto_call: true,
      })
      setLeadName('')
      setLeadPhone('')
      setLeadPanel(null)
      onRefresh?.()
      onNavigate?.('leads')
    } catch (error) {
      setLeadError(error instanceof Error ? error.message : 'Unable to create lead.')
    } finally {
      setIsSavingLead(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1180px]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[30px] font-bold tracking-[-0.05em] text-[#13265C] sm:text-[42px]">
            Performance Overview
          </h1>
          <p className="mt-1.5 max-w-[620px] text-[15px] leading-7 text-[#596498] sm:text-[16px]">
            Welcome back, {currentUserName}. Here&apos;s what&apos;s happening today across your portfolio.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => setDateOpen((current) => !current)}
            className="flex h-[48px] items-center justify-between gap-3 rounded-[14px] border border-[#F1C3AA] bg-white px-4 text-left text-[#13265C] shadow-[0_14px_26px_rgba(19,38,92,0.05)]"
          >
            <div className="flex items-center gap-3">
              <CalendarDays className="h-[18px] w-[18px] text-[#596498]" strokeWidth={2} />
              <span className="text-[13px] font-semibold leading-4">{dateRange}</span>
            </div>
            <ChevronDown className="h-[18px] w-[18px] text-[#596498]" strokeWidth={2} />
          </button>
          {dateOpen ? (
            <div className="absolute right-[172px] top-[118px] z-10 w-44 rounded-[8px] border border-[#F1C3AA] bg-white p-2 shadow-[0_16px_36px_rgba(19,38,92,0.12)]">
              {['Today', 'Last 7 Days', 'Last 30 Days', 'This Quarter'].map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => {
                    setDateRange(range)
                    setDateOpen(false)
                  }}
                  className="block w-full rounded-[8px] px-3 py-2 text-left text-[13px] font-semibold text-[#13265C] hover:bg-[#F5F7FF]"
                >
                  {range}
                </button>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            onClick={handleExport}
            className="flex h-[52px] items-center gap-3 rounded-[14px] bg-[#B85412] px-5 text-[13px] font-semibold text-white shadow-[0_16px_28px_rgba(184,84,18,0.26)]"
          >
            <ReceiptText className="h-[18px] w-[18px]" strokeWidth={2} />
            <span>Export Report</span>
          </button>
        </div>
      </div>

      <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_270px]">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
            {metricCards.map((card) => {
              const Icon = card.icon
              return (
                <button
                  type="button"
                  key={card.label}
                  onClick={() => onNavigate?.(card.target)}
                  className="rounded-[22px] bg-white p-4 shadow-[0_18px_42px_rgba(19,38,92,0.06)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-[13px] ${card.tone}`}>
                      <Icon className="h-5 w-5" strokeWidth={2} />
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${card.deltaTone}`}>
                      {card.delta}
                    </span>
                  </div>
                  <p className="mt-5 text-[14px] text-[#596498]">{card.label}</p>
                  <p className="mt-1.5 text-[28px] leading-none tracking-[-0.04em] text-[#13265C]">
                    {card.key === 'revenue'
                      ? formatCurrency(metrics[card.key] ?? 0)
                      : (metrics[card.key] ?? card.value)}
                  </p>
                </button>
              )
            })}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_270px]">
            <section className="rounded-[26px] bg-white p-6 shadow-[0_18px_42px_rgba(19,38,92,0.06)]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-[16px] font-semibold text-[#13265C]">Sales Performance</h2>
                  <p className="mt-1 text-[13px] text-[#596498]">Units sold vs Targets - H1 2024</p>
                </div>
                <div className="flex items-center gap-5 text-[12px] font-medium text-[#596498]">
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-[#B85412]" />
                    Actual
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-[#D8DBFF]" />
                    Target
                  </span>
                </div>
              </div>

              <div className="mt-8 h-[240px] rounded-[22px] bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(244,247,255,0.55)_100%)]">
                <div className="flex h-full items-end justify-between px-4 pb-4 text-[12px] font-medium text-[#596498]">
                  {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].map((month) => (
                    <span key={month}>{month}</span>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-[26px] bg-white p-6 shadow-[0_18px_42px_rgba(19,38,92,0.06)]">
              <h2 className="text-[16px] font-semibold text-[#13265C]">Lead Sources</h2>

              <div className="mt-9 space-y-7">
                {leadSources.map((item) => (
                  <div key={item.label}>
                    <div className="mb-2 flex items-center justify-between gap-3 text-[14px]">
                      <span className="text-[#596498]">{item.label}</span>
                      <span className="font-semibold text-[#13265C]">{item.value}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-[#ECEFFE]">
                      <div className={`h-2 rounded-full ${item.color}`} style={{ width: `${item.value}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => onNavigate?.('leads')}
                className="mt-10 flex h-[48px] w-full items-center justify-center rounded-[16px] border border-[#F1C3AA] bg-white text-[13px] font-medium text-[#596498]"
              >
                Detailed Channel Analysis
              </button>
            </section>
          </div>

          <section className="rounded-[26px] bg-white p-6 shadow-[0_18px_42px_rgba(19,38,92,0.06)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[16px] font-semibold text-[#13265C]">Recent Activity</h2>
              <button
                type="button"
                onClick={() => onNavigate?.('activity')}
                className="text-[13px] font-semibold text-[#B85412]"
              >
                View All
              </button>
            </div>

            <div className="mt-8 space-y-8">
              {recentActivities.map((activity) => {
                const Icon = activity.icon
                return (
                  <div key={`${activity.title}-${activity.detail}`} className="flex items-start gap-4">
                    <span className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${activity.tone}`}>
                      <Icon className="h-5 w-5" strokeWidth={2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="text-[15px] font-semibold text-[#13265C]">{activity.title}</h3>
                          <p className="mt-1 text-[14px] leading-6 text-[#596498]">{activity.detail}</p>
                        </div>
                        <span className="text-[13px] font-medium text-[#596498]">{activity.time}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
              {!recentActivities.length ? (
                <p className="text-[14px] text-[#596498]">No recent activity recorded.</p>
              ) : null}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-[26px] bg-[#B85412] p-6 text-white shadow-[0_18px_42px_rgba(184,84,18,0.26)]">
            <span className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-white/14">
              <UserPlus className="h-6 w-6" strokeWidth={2} />
            </span>
            <h2 className="mt-10 text-[17px] font-semibold">Create New Lead</h2>
            <p className="mt-3 text-[14px] leading-7 text-white/92">
              Instantly add a new prospect to your CRM and assign an agent.
            </p>
            <button
              type="button"
              onClick={() => setLeadPanel('lead')}
              className="mt-8 flex items-center gap-3 text-[14px] font-semibold"
            >
              <span>Get Started</span>
              <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2} />
            </button>
          </section>

          {leadPanel ? (
            <section className="rounded-[20px] bg-white p-4 shadow-[0_16px_36px_rgba(19,38,92,0.06)]">
              <h3 className="text-[15px] font-semibold text-[#13265C]">
                {leadPanel === 'viewing' ? 'Schedule Viewing' : 'Create Lead'}
              </h3>
              <div className="mt-3 space-y-3">
                <input
                  value={leadName}
                  onChange={(event) => setLeadName(event.target.value)}
                  placeholder="Lead name"
                  className="w-full rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] outline-none"
                />
                <input
                  value={leadPhone}
                  onChange={(event) => setLeadPhone(event.target.value)}
                  placeholder="Phone"
                  className="w-full rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] outline-none"
                />
                {leadError ? <p className="text-[12px] font-semibold text-[#B85412]">{leadError}</p> : null}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setLeadPanel(null)}
                    className="rounded-[8px] border border-[#E8D1C3] px-3 py-2 text-[13px] font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateLead}
                    disabled={isSavingLead}
                    className="rounded-[8px] bg-[#B85412] px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
                  >
                    {isSavingLead ? 'Saving' : 'Save'}
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            {quickActions.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => onNavigate?.(item.target)}
                  className="rounded-[20px] bg-white px-4 py-5 text-center shadow-[0_16px_36px_rgba(19,38,92,0.06)]"
                >
                  <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-[13px] bg-[#F5F7FF] text-[#596498]">
                    <Icon className="h-5 w-5" strokeWidth={2} />
                  </span>
                  <span className="mt-3 block text-[14px] font-medium leading-5 text-[#13265C]">
                    {item.label}
                  </span>
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={() => setLeadPanel('viewing')}
            className="flex h-[56px] w-full items-center justify-center gap-3 rounded-[20px] bg-white px-4 text-[14px] font-semibold text-[#13265C] shadow-[0_16px_36px_rgba(19,38,92,0.06)]"
          >
            <CalendarDays className="h-[18px] w-[18px] text-[#596498]" strokeWidth={2} />
            <span>Schedule Viewing</span>
          </button>
        </aside>
      </section>
    </div>
  )
}
