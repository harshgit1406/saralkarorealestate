import {
  BadgeCheck,
  Banknote,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileText,
  Headphones,
  Landmark,
  Mail,
  MessageSquareText,
  Plus,
  PhoneCall,
  ReceiptText,
  Send,
  ShieldCheck,
  Target,
  TrendingUp,
  UserRound,
  Users,
} from 'lucide-react'
import { useEffect, useState, type ElementType, type ReactNode } from 'react'
import {
  assignLead,
  createLeadActivity,
  createLeadFollowup,
  createLeadSource,
  createLead,
  createRole,
  createBusinessResource,
  dispatchAutoCalls,
  getAutoCallQueue,
  replaceRolePermissions,
  updateLead,
  updateBusinessResource,
  updateOrganization,
  type WorkspacePages,
} from '../../lib/workspaceApi'

type RecordItem = Record<string, string | number | boolean | null | undefined>

const formatCurrency = (value: unknown) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0))

const titleCase = (value: unknown) =>
  String(value ?? 'Not set')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())

function PageShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <div className="mx-auto max-w-[1180px]">
      <div className="mb-6">
        <h1 className="text-[28px] font-bold tracking-[-0.04em] text-[#13265C] sm:text-[38px]">
          {title}
        </h1>
        <p className="mt-2 max-w-[720px] text-[14px] leading-7 text-[#596498] sm:text-[15px]">
          {subtitle}
        </p>
      </div>
      {children}
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string | number
  icon: ElementType
}) {
  return (
    <article className="rounded-[8px] bg-white p-5 shadow-[0_14px_34px_rgba(19,38,92,0.06)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[13px] font-medium text-[#596498]">{label}</p>
          <p className="mt-2 text-[26px] font-bold tracking-[-0.04em] text-[#13265C]">{value}</p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#F5F7FF] text-[#B85412]">
          <Icon className="h-5 w-5" strokeWidth={2} />
        </span>
      </div>
    </article>
  )
}

function DataTable({
  columns,
  rows,
  emptyText,
}: {
  columns: Array<{ key: string; label: string; render?: (row: RecordItem) => React.ReactNode }>
  rows: RecordItem[]
  emptyText: string
}) {
  return (
    <div className="overflow-hidden rounded-[8px] bg-white shadow-[0_14px_34px_rgba(19,38,92,0.06)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead className="bg-[#F5F7FF] text-[12px] uppercase tracking-[0.06em] text-[#596498]">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="px-5 py-4 font-semibold">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEF1FA] text-[14px]">
            {rows.length ? (
              rows.map((row, index) => (
                <tr key={`${columns[0]?.key}-${index}`} className="text-[#13265C]">
                  {columns.map((column) => (
                    <td key={column.key} className="px-5 py-4">
                      {column.render ? column.render(row) : titleCase(row[column.key])}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="px-5 py-8 text-center text-[#596498]">
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="mb-3 text-[16px] font-semibold text-[#13265C]">{title}</h2>
      {children}
    </section>
  )
}

export function LeadsPage({
  data,
  onRefresh,
}: {
  data?: WorkspacePages['leads']
  onRefresh?: () => void
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [budgetMax, setBudgetMax] = useState('')
  const [requirements, setRequirements] = useState('')
  const [status] = useState('new')
  const [priority, setPriority] = useState('medium')
  const [projectId, setProjectId] = useState<number | ''>('')
  const [sourceId, setSourceId] = useState<number | ''>('')
  const [assignedTo, setAssignedTo] = useState<number | ''>('')
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [followupTitle, setFollowupTitle] = useState('Follow up with lead')
  const [followupType, setFollowupType] = useState('call')
  const [followupDueAt, setFollowupDueAt] = useState('')
  const [integrationToken, setIntegrationToken] = useState('change-this-token')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const leads = data?.items ?? []
  const selectedLead = leads.find((lead) => lead.id === selectedLeadId) ?? leads[0]
  const selectedId = typeof selectedLead?.id === 'number' ? selectedLead.id : null
  const activeLeads = leads.filter((lead) => !['won', 'lost', 'junk'].includes(String(lead.status)))
  const overdueFollowups = (data?.followups ?? []).filter((followup) => {
    if (followup.status !== 'pending' || !followup.dueAt) return false
    return new Date(String(followup.dueAt)).getTime() < Date.now()
  })
  const pipelineStages = [
    'new',
    'attempted',
    'contacted',
    'qualified',
    'site_visit_scheduled',
    'site_visit_done',
    'proposal_sent',
    'negotiation',
    'won',
    'lost',
  ]
  const selectedLeadActivities = (data?.activities ?? []).filter((activity) => activity.leadId === selectedId)
  const wonCount = data?.statusCounts?.won ?? 0
  const conversionRate = leads.length ? Math.round((wonCount / leads.length) * 100) : 0

  useEffect(() => {
    if (!projectId && data?.projects?.[0]?.id) setProjectId(Number(data.projects[0].id))
    if (!sourceId && data?.sources?.[0]?.id) setSourceId(Number(data.sources[0].id))
    if (!assignedTo && data?.users?.[0]?.id) setAssignedTo(Number(data.users[0].id))
  }, [assignedTo, data?.projects, data?.sources, data?.users, projectId, sourceId])

  const handleCreate = async () => {
    if (!name.trim() || !phone.trim()) {
      setError('Name and phone are required.')
      return
    }
    setIsSaving(true)
    setError('')
    try {
      await createLead({
        name,
        phone,
        email: email || undefined,
        status,
        priority,
        project_id: projectId || data?.projects?.[0]?.id,
        lead_source_id: sourceId || data?.sources?.[0]?.id,
        assigned_to: assignedTo || data?.users?.[0]?.id,
        budget_max: Number(budgetMax || 0) || undefined,
        requirements: requirements ? { note: requirements } : undefined,
        auto_call: true,
      })
      setName('')
      setPhone('')
      setEmail('')
      setBudgetMax('')
      setRequirements('')
      onRefresh?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create lead.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleQuickStatus = async (id: unknown, nextStatus: string) => {
    if (typeof id !== 'number') return
    await updateLead(id, {
      status: nextStatus,
      last_contacted_at: ['attempted', 'contacted', 'qualified'].includes(nextStatus)
        ? new Date().toISOString()
        : undefined,
    })
    onRefresh?.()
  }

  const handleAssign = async (userId: string) => {
    if (!selectedId || !userId) return
    await assignLead(selectedId, { assigned_to: Number(userId), reason: 'Manual reassignment from lead desk' })
    onRefresh?.()
  }

  const handleAddNote = async () => {
    if (!selectedId || !note.trim()) return
    await createLeadActivity(selectedId, { activity_type: 'note', notes: note })
    setNote('')
    onRefresh?.()
  }

  const handleAddFollowup = async () => {
    if (!selectedId || !followupTitle.trim() || !followupDueAt) return
    await createLeadFollowup(selectedId, {
      followup_type: followupType,
      title: followupTitle,
      notes: note || undefined,
      assigned_to: selectedLead?.assignedToId,
      due_at: followupDueAt,
    })
    await updateLead(selectedId, { next_follow_up_at: followupDueAt })
    setFollowupTitle('Follow up with lead')
    setFollowupDueAt('')
    onRefresh?.()
  }

  const handleCreateIntegration = async (integration: Record<string, string | boolean | null>) => {
    await createLeadSource({
      source_name: integration.name,
      source_key: integration.key,
      source_type: integration.type,
      is_active: true,
      config: {
        webhook_token: integrationToken,
        auto_call: true,
        default_assigned_to: assignedTo || data?.users?.[0]?.id,
      },
    })
    onRefresh?.()
  }

  return (
    <PageShell title="Leads" subtitle="Agent lead desk for contact, followups, source performance, and portal integrations.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open Leads" value={activeLeads.length} icon={Target} />
        <StatCard label="Overdue Followups" value={overdueFollowups.length} icon={Clock3} />
        <StatCard label="Won" value={wonCount} icon={CheckCircle2} />
        <StatCard label="Conversion" value={`${conversionRate}%`} icon={TrendingUp} />
      </div>

      <section className="mt-5 grid gap-4 rounded-[8px] bg-white p-4 shadow-[0_14px_34px_rgba(19,38,92,0.06)] xl:grid-cols-[1fr_160px_180px_150px]">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Lead name" className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] outline-none" />
        <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone" className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] outline-none" />
        <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] outline-none" />
        <input value={budgetMax} onChange={(event) => setBudgetMax(event.target.value)} placeholder="Budget" className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] outline-none" />
        <select value={projectId} onChange={(event) => setProjectId(event.target.value ? Number(event.target.value) : '')} className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] outline-none">
          <option value="">Project</option>
          {(data?.projects ?? []).map((project) => <option key={String(project.id)} value={String(project.id)}>{String(project.name)}</option>)}
        </select>
        <select value={sourceId} onChange={(event) => setSourceId(event.target.value ? Number(event.target.value) : '')} className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] outline-none">
          <option value="">Source</option>
          {(data?.sources ?? []).map((source) => <option key={String(source.id)} value={String(source.id)}>{String(source.source_name)}</option>)}
        </select>
        <select value={assignedTo} onChange={(event) => setAssignedTo(event.target.value ? Number(event.target.value) : '')} className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] outline-none">
          <option value="">Owner</option>
          {(data?.users ?? []).map((user) => <option key={String(user.id)} value={String(user.id)}>{String(user.full_name)}</option>)}
        </select>
        <select value={priority} onChange={(event) => setPriority(event.target.value)} className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] outline-none">
          {['low', 'medium', 'high', 'urgent'].map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}
        </select>
        <textarea value={requirements} onChange={(event) => setRequirements(event.target.value)} placeholder="Requirement, unit type, location, notes..." rows={2} className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] outline-none xl:col-span-3" />
        <button type="button" onClick={handleCreate} disabled={isSaving} className="rounded-[8px] bg-[#B85412] px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-60">
          {isSaving ? 'Saving' : 'Add Lead + Auto Call'}
        </button>
        {error ? <p className="text-[13px] font-medium text-[#B85412] xl:col-span-4">{error}</p> : null}
      </section>

      <Section title="Pipeline">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {pipelineStages.map((stage) => (
            <button
              key={stage}
              type="button"
              className="rounded-[8px] bg-white p-4 text-left shadow-[0_14px_34px_rgba(19,38,92,0.06)]"
            >
              <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#596498]">{titleCase(stage)}</p>
              <p className="mt-2 text-[26px] font-bold text-[#13265C]">{data?.statusCounts?.[stage] ?? 0}</p>
            </button>
          ))}
        </div>
      </Section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-[8px] bg-white shadow-[0_14px_34px_rgba(19,38,92,0.06)]">
          <div className="border-b border-[#EEF1FA] px-5 py-4">
            <h2 className="text-[16px] font-semibold text-[#13265C]">Agent Queue</h2>
          </div>
          <div className="max-h-[620px] overflow-auto">
            {leads.map((lead) => (
              <button
                key={String(lead.id)}
                type="button"
                onClick={() => setSelectedLeadId(Number(lead.id))}
                className={`grid w-full gap-3 border-b border-[#EEF1FA] px-5 py-4 text-left lg:grid-cols-[minmax(0,1fr)_120px_120px] ${
                  selectedLead?.id === lead.id ? 'bg-[#FFF7F1]' : 'bg-white'
                }`}
              >
                <div>
                  <p className="font-semibold text-[#13265C]">{String(lead.name)}</p>
                  <p className="mt-1 text-[13px] text-[#596498]">{String(lead.phone)} | {String(lead.source ?? 'Manual')}</p>
                  <p className="mt-1 text-[12px] text-[#7A84AB]">{String(lead.project ?? 'No project')} | {String(lead.assignedTo ?? 'Unassigned')}</p>
                </div>
                <span className="h-fit rounded-full bg-[#F5F7FF] px-3 py-1 text-center text-[12px] font-semibold text-[#13265C]">{titleCase(lead.status)}</span>
                <span className="h-fit rounded-full bg-[#FFF1E8] px-3 py-1 text-center text-[12px] font-semibold text-[#B85412]">{titleCase(lead.priority)}</span>
              </button>
            ))}
            {!leads.length ? <p className="px-5 py-8 text-center text-[#596498]">No leads found.</p> : null}
          </div>
        </div>

        <aside className="rounded-[8px] bg-white p-5 shadow-[0_14px_34px_rgba(19,38,92,0.06)]">
          {selectedLead ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[22px] font-bold text-[#13265C]">{String(selectedLead.name)}</h2>
                  <p className="mt-1 text-[13px] text-[#596498]">{String(selectedLead.code)} | {titleCase(selectedLead.status)}</p>
                </div>
                <span className="rounded-full bg-[#F5F7FF] px-3 py-1 text-[12px] font-semibold text-[#13265C]">{formatCurrency(selectedLead.budgetMax)}</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <a href={`tel:${String(selectedLead.phone)}`} className="flex items-center justify-center gap-2 rounded-[8px] bg-[#13265C] px-3 py-2 text-[12px] font-semibold text-white"><PhoneCall className="h-4 w-4" /> Call</a>
                <a href={`https://wa.me/${String(selectedLead.phone).replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-[8px] bg-[#1E9E57] px-3 py-2 text-[12px] font-semibold text-white"><MessageSquareText className="h-4 w-4" /> WhatsApp</a>
                <a href={selectedLead.email ? `mailto:${String(selectedLead.email)}` : '#'} className="flex items-center justify-center gap-2 rounded-[8px] bg-[#F5F7FF] px-3 py-2 text-[12px] font-semibold text-[#13265C]"><Mail className="h-4 w-4" /> Email</a>
              </div>
              <div className="mt-4 grid gap-2">
                <select value={String(selectedLead.status)} onChange={(event) => handleQuickStatus(selectedLead.id, event.target.value)} className="rounded-[8px] border border-[#EEF1FA] px-3 py-2 text-[13px] outline-none">
                  {pipelineStages.concat(['junk']).map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}
                </select>
                <select value={String(selectedLead.assignedToId ?? '')} onChange={(event) => handleAssign(event.target.value)} className="rounded-[8px] border border-[#EEF1FA] px-3 py-2 text-[13px] outline-none">
                  <option value="">Assign owner</option>
                  {(data?.users ?? []).map((user) => <option key={String(user.id)} value={String(user.id)}>{String(user.full_name)}</option>)}
                </select>
              </div>
              <div className="mt-5 rounded-[8px] bg-[#F7F8FE] p-4 text-[13px] text-[#596498]">
                <p>Source: <span className="font-semibold text-[#13265C]">{String(selectedLead.source ?? 'Manual')}</span></p>
                <p className="mt-2">Calls: <span className="font-semibold text-[#13265C]">{String(selectedLead.totalCalls ?? 0)}</span></p>
                <p className="mt-2">Next follow-up: <span className="font-semibold text-[#13265C]">{selectedLead.nextFollowUpAt ? new Date(String(selectedLead.nextFollowUpAt)).toLocaleString() : 'Not scheduled'}</span></p>
              </div>
              <div className="mt-5 grid gap-2">
                <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add note for timeline..." rows={3} className="rounded-[8px] border border-[#EEF1FA] px-3 py-2 text-[13px] outline-none" />
                <button type="button" onClick={handleAddNote} className="flex items-center justify-center gap-2 rounded-[8px] bg-[#13265C] px-3 py-2 text-[13px] font-semibold text-white"><Send className="h-4 w-4" /> Add Note</button>
              </div>
              <div className="mt-5 grid gap-2">
                <input value={followupTitle} onChange={(event) => setFollowupTitle(event.target.value)} className="rounded-[8px] border border-[#EEF1FA] px-3 py-2 text-[13px] outline-none" />
                <div className="grid grid-cols-2 gap-2">
                  <select value={followupType} onChange={(event) => setFollowupType(event.target.value)} className="rounded-[8px] border border-[#EEF1FA] px-3 py-2 text-[13px] outline-none">
                    {['call', 'whatsapp', 'site_visit', 'meeting', 'email', 'task'].map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}
                  </select>
                  <input type="datetime-local" value={followupDueAt} onChange={(event) => setFollowupDueAt(event.target.value)} className="rounded-[8px] border border-[#EEF1FA] px-3 py-2 text-[13px] outline-none" />
                </div>
                <button type="button" onClick={handleAddFollowup} className="flex items-center justify-center gap-2 rounded-[8px] bg-[#B85412] px-3 py-2 text-[13px] font-semibold text-white"><Plus className="h-4 w-4" /> Schedule Follow-up</button>
              </div>
              <Section title="Timeline">
                <div className="max-h-[220px] space-y-2 overflow-auto">
                  {selectedLeadActivities.map((activity) => (
                    <div key={String(activity.id)} className="rounded-[8px] border border-[#EEF1FA] p-3 text-[13px]">
                      <p className="font-semibold text-[#13265C]">{titleCase(activity.type)}</p>
                      <p className="mt-1 text-[#596498]">{String(activity.notes ?? '')}</p>
                    </div>
                  ))}
                  {!selectedLeadActivities.length ? <p className="text-[13px] text-[#596498]">No timeline notes yet.</p> : null}
                </div>
              </Section>
            </>
          ) : (
            <p className="py-10 text-center text-[#596498]">Select a lead to manage contact, notes, and followups.</p>
          )}
        </aside>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid gap-5">
        <Section title="Platform Performance">
          <DataTable
            emptyText="No source performance yet."
            rows={(data?.sourcePerformance ?? []) as RecordItem[]}
            columns={[
              { key: 'name', label: 'Platform' },
              { key: 'type', label: 'Type' },
              { key: 'total', label: 'Leads' },
              { key: 'active', label: 'Active' },
              { key: 'won', label: 'Won' },
              { key: 'overdue', label: 'Overdue' },
              { key: 'avgBudget', label: 'Avg Budget', render: (row) => formatCurrency(row.avgBudget) },
            ]}
          />
        </Section>
        <Section title="Upcoming Follow-ups">
          <DataTable
            emptyText="No followups scheduled."
            rows={(data?.followups ?? []) as RecordItem[]}
            columns={[
              { key: 'lead', label: 'Lead' },
              { key: 'type', label: 'Type' },
              { key: 'title', label: 'Title' },
              { key: 'assignedTo', label: 'Owner' },
              { key: 'status', label: 'Status' },
              { key: 'dueAt', label: 'Due', render: (row) => row.dueAt ? new Date(String(row.dueAt)).toLocaleString() : 'Not set' },
            ]}
          />
        </Section>
        </div>
        <Section title="Portal Integrations">
          <div className="grid gap-3 rounded-[8px] bg-white p-4 shadow-[0_14px_34px_rgba(19,38,92,0.06)]">
            <input value={integrationToken} onChange={(event) => setIntegrationToken(event.target.value)} placeholder="Webhook token for new sources" className="rounded-[8px] border border-[#EEF1FA] bg-white px-3 py-3 text-[13px] outline-none" />
            <div className="grid max-h-[430px] gap-2 overflow-auto pr-1 sm:grid-cols-2 xl:grid-cols-1">
            {(data?.integrations ?? []).map((integration) => (
              <article key={String(integration.key)} className="rounded-[8px] border border-[#EEF1FA] bg-[#FCFDFF] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-semibold text-[#13265C]">{String(integration.name)}</p>
                    <p className="mt-1 text-[12px] text-[#596498]">{titleCase(integration.type)}</p>
                  </div>
                  {integration.connected ? (
                    <span className="rounded-full bg-[#EAFBF0] px-3 py-1 text-[12px] font-semibold text-[#136C2E]">Connected</span>
                  ) : (
                    <button type="button" onClick={() => handleCreateIntegration(integration)} className="rounded-[8px] bg-[#13265C] px-3 py-2 text-[12px] font-semibold text-white">Connect</button>
                  )}
                </div>
                <p className="mt-2 truncate text-[11px] text-[#596498]">/leads/webhook/&lt;org&gt;/{String(integration.key)}</p>
              </article>
            ))}
            </div>
          </div>
        </Section>
      </section>
    </PageShell>
  )
}

export function CustomerPage({
  data,
  onRefresh,
}: {
  data?: WorkspacePages['customer']
  onRefresh?: () => void
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')

  const handleCreateCustomer = async () => {
    if (!name.trim()) return
    await createBusinessResource('customers', {
      customer_code: `CUST-${Date.now().toString().slice(-5)}`,
      full_name: name,
      phone,
      kyc_status: 'pending',
    })
    setName('')
    setPhone('')
    onRefresh?.()
  }

  const handleVerify = async (id: unknown) => {
    if (typeof id !== 'number') return
    await updateBusinessResource('customers', id, { kyc_status: 'verified' })
    onRefresh?.()
  }

  return (
    <PageShell title="Customer" subtitle="Customer records, booking link, unit, and KYC status.">
      <section className="mb-5 grid gap-3 rounded-[8px] bg-white p-4 shadow-[0_14px_34px_rgba(19,38,92,0.06)] md:grid-cols-[1fr_180px_140px]">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Customer name"
          className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] outline-none"
        />
        <input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="Phone"
          className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] outline-none"
        />
        <button
          type="button"
          onClick={handleCreateCustomer}
          className="rounded-[8px] bg-[#B85412] px-4 py-3 text-[14px] font-semibold text-white"
        >
          Add Customer
        </button>
      </section>
      <DataTable
        emptyText="No customers found."
        rows={data?.items ?? []}
        columns={[
          { key: 'code', label: 'Code' },
          { key: 'name', label: 'Customer' },
          { key: 'phone', label: 'Phone' },
          { key: 'email', label: 'Email' },
          { key: 'bookingCode', label: 'Booking' },
          { key: 'unitCode', label: 'Unit' },
          { key: 'kycStatus', label: 'KYC' },
          {
            key: 'actions',
            label: 'Actions',
            render: (row) => (
              <button
                type="button"
                onClick={() => handleVerify(row.id)}
                className="rounded-[8px] bg-[#EAFBF0] px-3 py-1 text-[12px] font-semibold text-[#136C2E]"
              >
                Verify KYC
              </button>
            ),
          },
        ]}
      />
    </PageShell>
  )
}

export function FinancePage({
  data,
  onRefresh,
}: {
  data?: WorkspacePages['finance']
  onRefresh?: () => void
}) {
  const summary = data?.summary ?? {}
  const firstBooking = data?.bookings?.[0]
  const [paymentAmount, setPaymentAmount] = useState('10000')

  const handleAddPayment = async () => {
    if (typeof firstBooking?.id !== 'number') return
    await createBusinessResource('payments', {
      booking_id: firstBooking.id,
      payment_code: `RCPT-${Date.now().toString().slice(-5)}`,
      amount: Number(paymentAmount),
      payment_mode: 'upi',
      transaction_type: 'stage',
      payment_status: 'completed',
      paid_at: new Date().toISOString(),
    })
    onRefresh?.()
  }

  return (
    <PageShell
      title="Finance"
      subtitle="Sales inventory bookings, payment plans, payment types, collection, and outstanding demand."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Demand" value={formatCurrency(summary.demand)} icon={Landmark} />
        <StatCard label="Collected" value={formatCurrency(summary.collected)} icon={Banknote} />
        <StatCard
          label="Outstanding"
          value={formatCurrency(summary.outstanding)}
          icon={ReceiptText}
        />
        <StatCard label="Active Bookings" value={summary.activeBookings ?? 0} icon={Building2} />
      </div>

      <Section title="Bookings">
        <DataTable
          emptyText="No bookings found."
          rows={data?.bookings ?? []}
          columns={[
            { key: 'code', label: 'Booking' },
            { key: 'customer', label: 'Customer' },
            { key: 'unitCode', label: 'Inventory' },
            { key: 'plan', label: 'Payment Scheme' },
            { key: 'status', label: 'Status' },
            { key: 'amount', label: 'Amount', render: (row) => formatCurrency(row.amount) },
          ]}
        />
      </Section>

      <Section title="Recent Payments">
        <div className="mb-3 flex flex-wrap gap-3 rounded-[8px] bg-white p-4 shadow-[0_14px_34px_rgba(19,38,92,0.06)]">
          <input
            value={paymentAmount}
            onChange={(event) => setPaymentAmount(event.target.value)}
            type="number"
            className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] outline-none"
          />
          <button
            type="button"
            onClick={handleAddPayment}
            className="rounded-[8px] bg-[#B85412] px-4 py-3 text-[14px] font-semibold text-white"
          >
            Add Payment
          </button>
        </div>
        <DataTable
          emptyText="No payments found."
          rows={data?.payments ?? []}
          columns={[
            { key: 'code', label: 'Receipt' },
            { key: 'customer', label: 'Customer' },
            { key: 'bookingCode', label: 'Booking' },
            { key: 'mode', label: 'Type' },
            { key: 'status', label: 'Status' },
            { key: 'amount', label: 'Amount', render: (row) => formatCurrency(row.amount) },
          ]}
        />
      </Section>

      <Section title="Payment Schemes">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(data?.plans ?? []).map((plan) => (
            <article key={String(plan.id)} className="rounded-[8px] bg-white p-5 shadow-[0_14px_34px_rgba(19,38,92,0.06)]">
              <p className="text-[15px] font-semibold text-[#13265C]">{String(plan.name)}</p>
              <p className="mt-2 text-[13px] text-[#596498]">{titleCase(plan.type)}</p>
              <p className="mt-4 text-[13px] font-semibold text-[#B85412]">{String(plan.stages)} stages</p>
            </article>
          ))}
        </div>
      </Section>
    </PageShell>
  )
}

export function HrmsPage({
  data,
  onRefresh,
}: {
  data?: WorkspacePages['hrms']
  onRefresh?: () => void
}) {
  const [roleName, setRoleName] = useState('')
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null)
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([])

  const handleCreateRole = async () => {
    if (!roleName.trim()) return
    await createRole({ name: roleName, description: 'Custom access role', is_system: false })
    setRoleName('')
    onRefresh?.()
  }

  const handleSavePermissions = async () => {
    if (!selectedRoleId) return
    await replaceRolePermissions(selectedRoleId, selectedPermissions)
    onRefresh?.()
  }

  return (
    <PageShell title="HRMS" subtitle="Application users only: access status, roles, and recent attendance.">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="App Users" value={data?.users.length ?? 0} icon={Users} />
        <StatCard
          label="Active"
          value={data?.users.filter((user) => user.active).length ?? 0}
          icon={BadgeCheck}
        />
        <StatCard label="Attendance Rows" value={data?.attendance.length ?? 0} icon={CalendarClock} />
      </div>
      <Section title="Users">
        <DataTable
          emptyText="No users found."
          rows={data?.users ?? []}
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'username', label: 'Username' },
            { key: 'email', label: 'Email' },
            { key: 'phone', label: 'Phone' },
            { key: 'roles', label: 'Roles' },
            { key: 'active', label: 'Status', render: (row) => (row.active ? 'Active' : 'Inactive') },
          ]}
        />
      </Section>
      <Section title="Editable Access Control">
        <div className="grid gap-4 rounded-[8px] bg-white p-5 shadow-[0_14px_34px_rgba(19,38,92,0.06)] lg:grid-cols-[260px_minmax(0,1fr)]">
          <div>
            <input
              value={roleName}
              onChange={(event) => setRoleName(event.target.value)}
              placeholder="New role name"
              className="w-full rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] outline-none"
            />
            <button
              type="button"
              onClick={handleCreateRole}
              className="mt-3 w-full rounded-[8px] bg-[#B85412] px-4 py-3 text-[14px] font-semibold text-white"
            >
              Create Role
            </button>
            <div className="mt-4 space-y-2">
              {(data?.roles ?? []).map((role) => (
                <button
                  key={String(role.id)}
                  type="button"
                  onClick={() => {
                    setSelectedRoleId(Number(role.id))
                    setSelectedPermissions(Array.isArray(role.permissions) ? role.permissions : [])
                  }}
                  className="block w-full rounded-[8px] border border-[#EEF1FA] px-3 py-2 text-left text-[13px] font-semibold"
                >
                  {String(role.name)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {(data?.permissions ?? []).map((permission) => {
                const key = String(permission.permission_key)
                return (
                  <label key={key} className="flex items-center gap-2 rounded-[8px] border border-[#EEF1FA] px-3 py-2 text-[13px]">
                    <input
                      type="checkbox"
                      checked={selectedPermissions.includes(key)}
                      onChange={(event) => {
                        setSelectedPermissions((current) =>
                          event.target.checked ? [...current, key] : current.filter((item) => item !== key),
                        )
                      }}
                    />
                    {key}
                  </label>
                )
              })}
            </div>
            <button
              type="button"
              onClick={handleSavePermissions}
              className="mt-4 rounded-[8px] bg-[#13265C] px-4 py-3 text-[14px] font-semibold text-white"
            >
              Save Permissions
            </button>
          </div>
        </div>
      </Section>
    </PageShell>
  )
}

export function CommunicationPage({
  data,
  onRefresh,
}: {
  data?: WorkspacePages['communication']
  onRefresh?: () => void
}) {
  const activeCall = data?.calls[0]
  const [messageText, setMessageText] = useState('Thanks for your enquiry. Our sales team will call you shortly.')
  const [dispatchResult, setDispatchResult] = useState('')

  const handleQueueMessage = async () => {
    await createBusinessResource('messages', {
      channel: 'whatsapp',
      recipient_phone: activeCall?.leadPhone ?? '+91 90000 00000',
      content: messageText,
      status: 'queued',
    })
    onRefresh?.()
  }

  const handleQueueCall = async () => {
    await createBusinessResource('calls', {
      lead_id: activeCall?.lead ? undefined : undefined,
      trigger_source: 'lead_auto_call',
      direction: 'outbound',
      status: 'queued',
      metadata: { source: 'frontend_demo' },
    })
    onRefresh?.()
  }

  const handleDispatchAutoCalls = async () => {
    const queue = await getAutoCallQueue()
    const pending = queue.items.filter((item) => item.status === 'queued').length
    const result = await dispatchAutoCalls(10)
    setDispatchResult(`Queued: ${pending}. Dispatched: ${result.items.length}.`)
    onRefresh?.()
  }
  return (
    <PageShell
      title="Communication"
      subtitle="Call demos between employee and lead, including AI or automated lead call triggers."
    >
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="rounded-[8px] bg-white p-6 shadow-[0_14px_34px_rgba(19,38,92,0.06)]">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-[#FFF1E8] text-[#B85412]">
              <PhoneCall className="h-5 w-5" strokeWidth={2} />
            </span>
            <div>
              <h2 className="text-[17px] font-semibold text-[#13265C]">Call Demo</h2>
              <p className="text-[13px] text-[#596498]">Employee or AI to lead bridge</p>
            </div>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <StatCard label="Employee" value={String(activeCall?.employee ?? 'Not assigned')} icon={UserRound} />
            <StatCard label="Lead" value={String(activeCall?.lead ?? 'No lead')} icon={Headphones} />
            <StatCard label="Status" value={titleCase(activeCall?.status)} icon={ShieldCheck} />
          </div>
        </div>
        <div className="rounded-[8px] bg-[#13265C] p-6 text-white shadow-[0_14px_34px_rgba(19,38,92,0.12)]">
          <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-white/70">Script</p>
          <p className="mt-5 text-[15px] leading-7">
            Hello, this is a quick callback about your property enquiry. We can confirm inventory,
            price, and payment plan in this call.
          </p>
        </div>
      </section>
      <section className="mt-5 grid gap-3 rounded-[8px] bg-white p-4 shadow-[0_14px_34px_rgba(19,38,92,0.06)] lg:grid-cols-[minmax(0,1fr)_140px_140px]">
        <input
          value={messageText}
          onChange={(event) => setMessageText(event.target.value)}
          className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] outline-none"
        />
        <button
          type="button"
          onClick={handleQueueMessage}
          className="rounded-[8px] bg-[#B85412] px-4 py-3 text-[14px] font-semibold text-white"
        >
          Queue Msg
        </button>
        <button
          type="button"
          onClick={handleQueueCall}
          className="rounded-[8px] bg-[#13265C] px-4 py-3 text-[14px] font-semibold text-white"
        >
          Queue Call
        </button>
        <button
          type="button"
          onClick={handleDispatchAutoCalls}
          className="rounded-[8px] bg-[#1E9E57] px-4 py-3 text-[14px] font-semibold text-white lg:col-span-3"
        >
          Dispatch Auto Calls
        </button>
        {dispatchResult ? (
          <p className="text-[13px] font-semibold text-[#13265C] lg:col-span-3">{dispatchResult}</p>
        ) : null}
      </section>
      <Section title="Call Sessions">
        <DataTable
          emptyText="No calls found."
          rows={data?.calls ?? []}
          columns={[
            { key: 'lead', label: 'Lead' },
            { key: 'leadPhone', label: 'Phone' },
            { key: 'employee', label: 'Employee' },
            { key: 'trigger', label: 'Trigger' },
            { key: 'status', label: 'Status' },
            { key: 'disposition', label: 'Disposition' },
          ]}
        />
      </Section>
      <Section title="Messages">
        <DataTable
          emptyText="No messages found."
          rows={data?.messages ?? []}
          columns={[
            { key: 'channel', label: 'Channel' },
            { key: 'recipient', label: 'Recipient' },
            { key: 'content', label: 'Content' },
            { key: 'status', label: 'Status' },
          ]}
        />
      </Section>
    </PageShell>
  )
}

export function ActivityPage({ data }: { data?: WorkspacePages['activity'] }) {
  return (
    <PageShell title="Activity Log" subtitle="Operational activity and audit history from the database.">
      <Section title="Activities">
        <DataTable
          emptyText="No activity found."
          rows={data?.activities ?? []}
          columns={[
            { key: 'entityType', label: 'Entity' },
            { key: 'type', label: 'Type' },
            { key: 'description', label: 'Description' },
            { key: 'user', label: 'User' },
            { key: 'createdAt', label: 'Time' },
          ]}
        />
      </Section>
      <Section title="Audit">
        <DataTable
          emptyText="No audit entries found."
          rows={data?.auditLogs ?? []}
          columns={[
            { key: 'entityType', label: 'Entity' },
            { key: 'action', label: 'Action' },
            { key: 'user', label: 'User' },
            { key: 'createdAt', label: 'Time' },
          ]}
        />
      </Section>
    </PageShell>
  )
}

export function SettingsPage({
  data,
  onRefresh,
}: {
  data?: WorkspacePages['settings']
  onRefresh?: () => void
}) {
  const [phone, setPhone] = useState(String(data?.organization?.phone ?? ''))

  const handleSaveOrg = async () => {
    await updateOrganization({ phone })
    onRefresh?.()
  }

  return (
    <PageShell title="Settings" subtitle="Organization profile and application role setup.">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <article className="rounded-[8px] bg-white p-6 shadow-[0_14px_34px_rgba(19,38,92,0.06)]">
          <h2 className="text-[17px] font-semibold text-[#13265C]">Organization</h2>
          {Object.entries(data?.organization ?? {}).map(([key, value]) => (
            <div key={key} className="mt-4 flex justify-between gap-4 border-b border-[#EEF1FA] pb-3 text-[14px]">
              <span className="text-[#596498]">{titleCase(key)}</span>
              <span className="text-right font-semibold text-[#13265C]">{String(value ?? 'Not set')}</span>
            </div>
          ))}
          <div className="mt-5 flex gap-3">
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="Organization phone"
              className="min-w-0 flex-1 rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] outline-none"
            />
            <button
              type="button"
              onClick={handleSaveOrg}
              className="rounded-[8px] bg-[#B85412] px-4 py-3 text-[14px] font-semibold text-white"
            >
              Save
            </button>
          </div>
        </article>
        <article className="rounded-[8px] bg-white p-6 shadow-[0_14px_34px_rgba(19,38,92,0.06)]">
          <h2 className="text-[17px] font-semibold text-[#13265C]">Roles</h2>
          <div className="mt-4 space-y-3">
            {(data?.roles ?? []).map((role) => (
              <div key={String(role.name)} className="rounded-[8px] border border-[#EEF1FA] p-4">
                <p className="text-[14px] font-semibold text-[#13265C]">{String(role.name)}</p>
                <p className="mt-1 text-[13px] text-[#596498]">{String(role.description ?? 'No description')}</p>
              </div>
            ))}
          </div>
        </article>
      </div>
    </PageShell>
  )
}

export function DocsPage() {
  return (
    <PageShell title="Docs" subtitle="Project setup references for the local app.">
      <div className="grid gap-4 md:grid-cols-2">
        {['Database schema in database/init.sql', 'Backend API under /api/v1', 'Frontend pages use one workspace display call', 'pgAdmin runs on localhost:5050'].map((item) => (
          <article key={item} className="rounded-[8px] bg-white p-5 shadow-[0_14px_34px_rgba(19,38,92,0.06)]">
            <FileText className="h-5 w-5 text-[#B85412]" strokeWidth={2} />
            <p className="mt-4 text-[14px] font-semibold text-[#13265C]">{item}</p>
          </article>
        ))}
      </div>
    </PageShell>
  )
}

export function HelpPage() {
  return (
    <PageShell title="Help Center" subtitle="Quick internal support queue for sales operations.">
      <DataTable
        emptyText="No help items."
        rows={[
          { area: 'Finance', owner: 'Admin', status: 'Ready', note: 'Check payment plans and receipts' },
          { area: 'Communication', owner: 'Sales lead', status: 'Ready', note: 'Use call demo for employee to lead' },
          { area: 'HRMS', owner: 'Admin', status: 'Ready', note: 'Manage application users only' },
        ]}
        columns={[
          { key: 'area', label: 'Area' },
          { key: 'owner', label: 'Owner' },
          { key: 'status', label: 'Status' },
          { key: 'note', label: 'Note' },
        ]}
      />
    </PageShell>
  )
}
