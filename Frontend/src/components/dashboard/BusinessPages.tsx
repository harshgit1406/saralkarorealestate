import {
  BadgeCheck,
  Banknote,
  Building2,
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
  createHrmsUser,
  createBusinessResource,
  dispatchAutoCalls,
  getAutoCallQueue,
  replaceRolePermissions,
  replaceUserRoles,
  updateLead,
  updateHrmsUser,
  updateBusinessResource,
  updateOrganization,
  type WorkspacePages,
} from '../../lib/workspaceApi'

type RecordItem = Record<string, unknown>

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

const asNumber = (value: unknown) => (typeof value === 'number' ? value : Number(value || 0))

const asText = (value: unknown, fallback = 'Not set') => String(value ?? fallback)

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

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`grid gap-1.5 text-[12px] font-semibold text-[#596498] ${className}`}>
      <span>{label}</span>
      {children}
    </label>
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
        <Field label="Lead Name"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Lead name" className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] font-normal text-[#13265C] outline-none" /></Field>
        <Field label="Phone"><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone" className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] font-normal text-[#13265C] outline-none" /></Field>
        <Field label="Email"><input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] font-normal text-[#13265C] outline-none" /></Field>
        <Field label="Budget"><input value={budgetMax} onChange={(event) => setBudgetMax(event.target.value)} placeholder="Budget" className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] font-normal text-[#13265C] outline-none" /></Field>
        <Field label="Project"><select value={projectId} onChange={(event) => setProjectId(event.target.value ? Number(event.target.value) : '')} className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] font-normal text-[#13265C] outline-none">
          <option value="">Project</option>
          {(data?.projects ?? []).map((project) => <option key={String(project.id)} value={String(project.id)}>{String(project.name)}</option>)}
        </select></Field>
        <Field label="Lead Source"><select value={sourceId} onChange={(event) => setSourceId(event.target.value ? Number(event.target.value) : '')} className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] font-normal text-[#13265C] outline-none">
          <option value="">Source</option>
          {(data?.sources ?? []).map((source) => <option key={String(source.id)} value={String(source.id)}>{String(source.source_name)}</option>)}
        </select></Field>
        <Field label="Owner"><select value={assignedTo} onChange={(event) => setAssignedTo(event.target.value ? Number(event.target.value) : '')} className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] font-normal text-[#13265C] outline-none">
          <option value="">Owner</option>
          {(data?.users ?? []).map((user) => <option key={String(user.id)} value={String(user.id)}>{String(user.full_name)}</option>)}
        </select></Field>
        <Field label="Priority"><select value={priority} onChange={(event) => setPriority(event.target.value)} className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] font-normal text-[#13265C] outline-none">
          {['low', 'medium', 'high', 'urgent'].map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}
        </select></Field>
        <Field label="Requirements" className="xl:col-span-3"><textarea value={requirements} onChange={(event) => setRequirements(event.target.value)} placeholder="Requirement, unit type, location, notes..." rows={2} className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] font-normal text-[#13265C] outline-none" /></Field>
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
                <Field label="Lead Status"><select value={String(selectedLead.status)} onChange={(event) => handleQuickStatus(selectedLead.id, event.target.value)} className="rounded-[8px] border border-[#EEF1FA] px-3 py-2 text-[13px] font-normal text-[#13265C] outline-none">
                  {pipelineStages.concat(['junk']).map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}
                </select></Field>
                <Field label="Assigned Owner"><select value={String(selectedLead.assignedToId ?? '')} onChange={(event) => handleAssign(event.target.value)} className="rounded-[8px] border border-[#EEF1FA] px-3 py-2 text-[13px] font-normal text-[#13265C] outline-none">
                  <option value="">Assign owner</option>
                  {(data?.users ?? []).map((user) => <option key={String(user.id)} value={String(user.id)}>{String(user.full_name)}</option>)}
                </select></Field>
              </div>
              <div className="mt-5 rounded-[8px] bg-[#F7F8FE] p-4 text-[13px] text-[#596498]">
                <p>Source: <span className="font-semibold text-[#13265C]">{String(selectedLead.source ?? 'Manual')}</span></p>
                <p className="mt-2">Calls: <span className="font-semibold text-[#13265C]">{String(selectedLead.totalCalls ?? 0)}</span></p>
                <p className="mt-2">Next follow-up: <span className="font-semibold text-[#13265C]">{selectedLead.nextFollowUpAt ? new Date(String(selectedLead.nextFollowUpAt)).toLocaleString() : 'Not scheduled'}</span></p>
              </div>
              <div className="mt-5 grid gap-2">
                <Field label="Timeline Note"><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add note for timeline..." rows={3} className="rounded-[8px] border border-[#EEF1FA] px-3 py-2 text-[13px] font-normal text-[#13265C] outline-none" /></Field>
                <button type="button" onClick={handleAddNote} className="flex items-center justify-center gap-2 rounded-[8px] bg-[#13265C] px-3 py-2 text-[13px] font-semibold text-white"><Send className="h-4 w-4" /> Add Note</button>
              </div>
              <div className="mt-5 grid gap-2">
                <Field label="Follow-Up Title"><input value={followupTitle} onChange={(event) => setFollowupTitle(event.target.value)} className="rounded-[8px] border border-[#EEF1FA] px-3 py-2 text-[13px] font-normal text-[#13265C] outline-none" /></Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Follow-Up Type"><select value={followupType} onChange={(event) => setFollowupType(event.target.value)} className="rounded-[8px] border border-[#EEF1FA] px-3 py-2 text-[13px] font-normal text-[#13265C] outline-none">
                    {['call', 'whatsapp', 'site_visit', 'meeting', 'email', 'task'].map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}
                  </select></Field>
                  <Field label="Due Date"><input type="datetime-local" value={followupDueAt} onChange={(event) => setFollowupDueAt(event.target.value)} className="rounded-[8px] border border-[#EEF1FA] px-3 py-2 text-[13px] font-normal text-[#13265C] outline-none" /></Field>
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
            <Field label="Webhook Token"><input value={integrationToken} onChange={(event) => setIntegrationToken(event.target.value)} placeholder="Webhook token for new sources" className="rounded-[8px] border border-[#EEF1FA] bg-white px-3 py-3 text-[13px] font-normal text-[#13265C] outline-none" /></Field>
            <div className="grid max-h-[430px] gap-2 overflow-auto pr-1 sm:grid-cols-2 xl:grid-cols-1">
            {(data?.integrations ?? []).map((integration) => (
              <article key={String(integration.key)} className="rounded-[8px] border border-[#EEF1FA] bg-[#FCFDFF] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-semibold text-[#13265C]">{String(integration.name)}</p>
                    <p className="mt-1 text-[12px] text-[#596498]">{titleCase(integration.type)}</p>
                  </div>
                  {integration.connected ? (
                    <span className="rounded-[8px] bg-[#136C2E] px-3 py-2 text-[12px] font-semibold text-white">
                      Ready
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleCreateIntegration(integration)}
                      className="rounded-[8px] bg-[#B85412] px-3 py-2 text-[12px] font-semibold text-white"
                    >
                      Connect
                    </button>
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
  const [email, setEmail] = useState('')
  const [panNo, setPanNo] = useState('')
  const [aadhaarNo, setAadhaarNo] = useState('')
  const [address, setAddress] = useState('')
  const [brokerName, setBrokerName] = useState('')
  const [brokerPhone, setBrokerPhone] = useState('')
  const [brokerCompany, setBrokerCompany] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null)

  const customers = data?.items ?? []
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) ?? customers[0]
  const summary = data?.summary ?? {}

  const handleCreateCustomer = async () => {
    if (!name.trim()) return
    await createBusinessResource('customers', {
      customer_code: `CUST-${Date.now().toString().slice(-5)}`,
      full_name: name,
      phone,
      email,
      pan_no: panNo,
      aadhaar_no: aadhaarNo,
      address,
      kyc_status: 'pending',
    })
    setName('')
    setPhone('')
    setEmail('')
    setPanNo('')
    setAadhaarNo('')
    setAddress('')
    onRefresh?.()
  }

  const handleSetKyc = async (id: unknown, status: 'pending' | 'verified' | 'rejected') => {
    if (typeof id !== 'number') return
    await updateBusinessResource('customers', id, { kyc_status: status })
    onRefresh?.()
  }

  const handleUpdateSelectedCustomer = async () => {
    if (typeof selectedCustomer?.id !== 'number') return
    await updateBusinessResource('customers', selectedCustomer.id, {
      phone: selectedCustomer.phone,
      email: selectedCustomer.email,
      pan_no: selectedCustomer.panNo,
      aadhaar_no: selectedCustomer.aadhaarNo,
      address: selectedCustomer.address,
    })
    onRefresh?.()
  }

  const handleCreateBroker = async () => {
    if (!brokerName.trim()) return
    await createBusinessResource('brokers', {
      broker_code: `BRK-${Date.now().toString().slice(-5)}`,
      username: `broker-${Date.now().toString().slice(-6)}`,
      full_name: brokerName,
      company_name: brokerCompany,
      phone: brokerPhone,
      kyc_status: 'pending',
    })
    setBrokerName('')
    setBrokerPhone('')
    setBrokerCompany('')
    onRefresh?.()
  }

  return (
    <PageShell title="Customer" subtitle="Customers, co-applicants, broker links, KYC readiness, and booking performance.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Customers" value={summary.total ?? customers.length} icon={Users} />
        <StatCard label="Verified KYC" value={summary.verified ?? 0} icon={ShieldCheck} />
        <StatCard label="Pending KYC" value={summary.pending ?? 0} icon={Clock3} />
        <StatCard label="Co-Applicants" value={summary.coApplicants ?? 0} icon={UserRound} />
      </div>

      <section className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_360px]">
        <div className="rounded-[8px] bg-white p-5 shadow-[0_14px_34px_rgba(19,38,92,0.06)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-semibold text-[#13265C]">Customer Register</h2>
              <p className="mt-1 text-[13px] text-[#596498]">Create customers before booking, or verify KYC after sale.</p>
            </div>
            <span className="rounded-full bg-[#FDF1E8] px-3 py-1 text-[12px] font-semibold text-[#B85412]">
              {summary.bookedCustomers ?? 0} booked
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Full Name"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] font-normal text-[#13265C] outline-none" /></Field>
            <Field label="Phone"><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone" className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] font-normal text-[#13265C] outline-none" /></Field>
            <Field label="Email"><input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] font-normal text-[#13265C] outline-none" /></Field>
            <Field label="PAN Number"><input value={panNo} onChange={(event) => setPanNo(event.target.value)} placeholder="PAN number" className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] font-normal text-[#13265C] outline-none" /></Field>
            <Field label="Aadhaar Number"><input value={aadhaarNo} onChange={(event) => setAadhaarNo(event.target.value)} placeholder="Aadhaar number" className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] font-normal text-[#13265C] outline-none" /></Field>
            <Field label="Address"><input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Address" className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] font-normal text-[#13265C] outline-none" /></Field>
          </div>
          <button type="button" onClick={handleCreateCustomer} className="mt-3 rounded-[8px] bg-[#B85412] px-4 py-3 text-[14px] font-semibold text-white">
            Add Customer
          </button>
        </div>

        <aside className="rounded-[8px] bg-white p-5 shadow-[0_14px_34px_rgba(19,38,92,0.06)]">
          <h2 className="text-[16px] font-semibold text-[#13265C]">Selected Customer</h2>
          {selectedCustomer ? (
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-[18px] font-bold text-[#13265C]">{asText(selectedCustomer.name)}</p>
                <p className="text-[13px] text-[#596498]">{asText(selectedCustomer.phone)} | {asText(selectedCustomer.email)}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[13px]">
                <span className="rounded-[8px] bg-[#F5F7FF] p-3">KYC<br /><b>{titleCase(selectedCustomer.kycStatus)}</b></span>
                <span className="rounded-[8px] bg-[#F5F7FF] p-3">Bookings<br /><b>{asNumber(selectedCustomer.bookingCount)}</b></span>
                <span className="rounded-[8px] bg-[#F5F7FF] p-3">Unit<br /><b>{asText(selectedCustomer.unitCode)}</b></span>
                <span className="rounded-[8px] bg-[#F5F7FF] p-3">Value<br /><b>{formatCurrency(selectedCustomer.bookingValue)}</b></span>
              </div>
              <button type="button" onClick={handleUpdateSelectedCustomer} className="w-full rounded-[8px] bg-[#13265C] px-4 py-3 text-[14px] font-semibold text-white">
                Save Profile Details
              </button>
            </div>
          ) : (
            <p className="mt-4 text-[13px] text-[#596498]">No customer selected.</p>
          )}
        </aside>
      </section>

      <Section title="Customer List">
        <DataTable
          emptyText="No customers found."
          rows={customers}
          columns={[
            { key: 'name', label: 'Customer' },
            { key: 'phone', label: 'Phone' },
            { key: 'email', label: 'Email' },
            { key: 'bookingCode', label: 'Booking' },
            { key: 'unitCode', label: 'Unit' },
            { key: 'bookingValue', label: 'Value', render: (row) => formatCurrency(row.bookingValue) },
            { key: 'kycStatus', label: 'KYC' },
            {
              key: 'actions',
              label: 'Actions',
              render: (row) => (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setSelectedCustomerId(asNumber(row.id))} className="rounded-[8px] bg-[#F5F7FF] px-3 py-1 text-[12px] font-semibold text-[#13265C]">Open</button>
                  <button type="button" onClick={() => handleSetKyc(row.id, 'verified')} className="rounded-[8px] bg-[#EAFBF0] px-3 py-1 text-[12px] font-semibold text-[#136C2E]">Verify</button>
                  <button type="button" onClick={() => handleSetKyc(row.id, 'rejected')} className="rounded-[8px] bg-[#FFF0F0] px-3 py-1 text-[12px] font-semibold text-[#B42318]">Reject</button>
                </div>
              ),
            },
          ]}
        />
      </Section>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="Applicants And Co-Applicants">
          <DataTable
            emptyText="No booking applicants found."
            rows={data?.applicants ?? []}
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'role', label: 'Role' },
              { key: 'ownership', label: 'Ownership', render: (row) => `${asNumber(row.ownership)}%` },
              { key: 'bookingCode', label: 'Booking' },
              { key: 'unitCode', label: 'Unit' },
              { key: 'bookingAmount', label: 'Value', render: (row) => formatCurrency(row.bookingAmount) },
              { key: 'kycStatus', label: 'KYC' },
            ]}
          />
        </Section>

        <Section title="Broker Network">
          <div className="mb-3 grid gap-3 rounded-[8px] bg-white p-4 shadow-[0_14px_34px_rgba(19,38,92,0.06)] md:grid-cols-3">
            <Field label="Broker Name"><input value={brokerName} onChange={(event) => setBrokerName(event.target.value)} placeholder="Broker name" className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] font-normal text-[#13265C] outline-none" /></Field>
            <Field label="Phone"><input value={brokerPhone} onChange={(event) => setBrokerPhone(event.target.value)} placeholder="Phone" className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] font-normal text-[#13265C] outline-none" /></Field>
            <Field label="Company"><input value={brokerCompany} onChange={(event) => setBrokerCompany(event.target.value)} placeholder="Company" className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] font-normal text-[#13265C] outline-none" /></Field>
            <button type="button" onClick={handleCreateBroker} className="rounded-[8px] bg-[#13265C] px-4 py-3 text-[14px] font-semibold text-white md:col-span-3">Add Broker</button>
          </div>
          <DataTable
            emptyText="No brokers found."
            rows={data?.brokers ?? []}
            columns={[
              { key: 'name', label: 'Broker' },
              { key: 'company', label: 'Company' },
              { key: 'phone', label: 'Phone' },
              { key: 'dealCount', label: 'Deals' },
              { key: 'commissionValue', label: 'Commission', render: (row) => formatCurrency(row.commissionValue) },
              { key: 'kycStatus', label: 'KYC' },
            ]}
          />
        </Section>
      </div>
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
  const [selectedBookingId, setSelectedBookingId] = useState<number | ''>('')
  const [paymentMode, setPaymentMode] = useState('upi')
  const [paymentType, setPaymentType] = useState('stage')
  const [referenceNo, setReferenceNo] = useState('')
  const [planName, setPlanName] = useState('')
  const [planType, setPlanType] = useState('construction_linked')

  const handleAddPayment = async () => {
    const bookingId = selectedBookingId || firstBooking?.id
    if (typeof bookingId !== 'number') return
    await createBusinessResource('payments', {
      booking_id: bookingId,
      payment_code: `RCPT-${Date.now().toString().slice(-5)}`,
      amount: Number(paymentAmount),
      payment_mode: paymentMode,
      transaction_type: paymentType,
      reference_no: referenceNo,
      payment_status: 'completed',
      paid_at: new Date().toISOString(),
    })
    setReferenceNo('')
    onRefresh?.()
  }

  const handleCreatePlan = async () => {
    if (!planName.trim()) return
    await createBusinessResource('payment-plans', {
      name: planName,
      plan_type: planType,
      description: 'Created from finance page',
    })
    setPlanName('')
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

      <section className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid gap-4 md:grid-cols-3">
          {(data?.bookingStatus ?? []).map((item) => (
            <article key={String(item.status)} className="rounded-[8px] bg-white p-4 shadow-[0_14px_34px_rgba(19,38,92,0.06)]">
              <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#596498]">{titleCase(item.status)}</p>
              <p className="mt-2 text-[24px] font-bold text-[#13265C]">{asNumber(item.count)}</p>
              <p className="mt-1 text-[13px] text-[#596498]">{formatCurrency(item.amount)}</p>
            </article>
          ))}
        </div>
        <div className="rounded-[8px] bg-white p-5 shadow-[0_14px_34px_rgba(19,38,92,0.06)]">
          <h2 className="text-[16px] font-semibold text-[#13265C]">Collection By Mode</h2>
          <div className="mt-4 space-y-3">
            {(data?.collectionModes ?? []).map((item) => (
              <div key={String(item.mode)} className="flex items-center justify-between rounded-[8px] bg-[#F5F7FF] px-3 py-3 text-[13px]">
                <span className="font-semibold text-[#13265C]">{titleCase(item.mode)}</span>
                <span className="text-[#596498]">{formatCurrency(item.amount)} · {asNumber(item.count)} receipts</span>
              </div>
            ))}
          </div>
        </div>
      </section>

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

      <Section title="Payments And Receipts">
        <div className="mb-3 grid gap-3 rounded-[8px] bg-white p-4 shadow-[0_14px_34px_rgba(19,38,92,0.06)] md:grid-cols-[1fr_140px_140px_1fr_140px]">
          <Field label="Booking">
          <select
            value={selectedBookingId}
            onChange={(event) => setSelectedBookingId(event.target.value ? Number(event.target.value) : '')}
            className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] font-normal text-[#13265C] outline-none"
          >
            <option value="">Select booking</option>
            {(data?.bookings ?? []).map((booking) => (
              <option key={String(booking.id)} value={Number(booking.id)}>
                {asText(booking.code)} - {asText(booking.customer)}
              </option>
            ))}
          </select>
          </Field>
          <Field label="Amount">
          <input
            value={paymentAmount}
            onChange={(event) => setPaymentAmount(event.target.value)}
            type="number"
            className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] font-normal text-[#13265C] outline-none"
          />
          </Field>
          <Field label="Payment Mode">
          <select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value)} className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] font-normal text-[#13265C] outline-none">
            <option value="upi">UPI</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="cheque">Cheque</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="loan">Loan</option>
          </select>
          </Field>
          <Field label="Reference Number"><input value={referenceNo} onChange={(event) => setReferenceNo(event.target.value)} placeholder="Reference no" className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] font-normal text-[#13265C] outline-none" /></Field>
          <button
            type="button"
            onClick={handleAddPayment}
            className="rounded-[8px] bg-[#B85412] px-4 py-3 text-[14px] font-semibold text-white"
          >
            Add Payment
          </button>
          <Field label="Transaction Type" className="md:col-span-5"><select value={paymentType} onChange={(event) => setPaymentType(event.target.value)} className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] font-normal text-[#13265C] outline-none">
            <option value="booking">Booking amount</option>
            <option value="stage">Stage payment</option>
            <option value="refund">Refund</option>
            <option value="adjustment">Adjustment</option>
            <option value="other">Other</option>
          </select></Field>
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

      <Section title="Stage Demand Tracker">
        <DataTable
          emptyText="No booking stages found."
          rows={data?.stages ?? []}
          columns={[
            { key: 'bookingCode', label: 'Booking' },
            { key: 'customer', label: 'Customer' },
            { key: 'unitCode', label: 'Unit' },
            { key: 'stage', label: 'Stage' },
            { key: 'status', label: 'Status' },
            { key: 'amount', label: 'Demand', render: (row) => formatCurrency(row.amount) },
            { key: 'paid', label: 'Paid', render: (row) => formatCurrency(row.paid) },
            { key: 'remaining', label: 'Balance', render: (row) => formatCurrency(row.remaining) },
          ]}
        />
      </Section>

      <Section title="Payment Schemes">
        <div className="mb-3 grid gap-3 rounded-[8px] bg-white p-4 shadow-[0_14px_34px_rgba(19,38,92,0.06)] md:grid-cols-[1fr_220px_140px]">
          <Field label="Scheme Name"><input value={planName} onChange={(event) => setPlanName(event.target.value)} placeholder="New payment scheme" className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] font-normal text-[#13265C] outline-none" /></Field>
          <Field label="Scheme Type"><select value={planType} onChange={(event) => setPlanType(event.target.value)} className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] font-normal text-[#13265C] outline-none">
            <option value="construction_linked">Construction linked</option>
            <option value="time_linked">Time linked</option>
            <option value="down_payment">Down payment</option>
            <option value="custom">Custom</option>
          </select></Field>
          <button type="button" onClick={handleCreatePlan} className="rounded-[8px] bg-[#13265C] px-4 py-3 text-[14px] font-semibold text-white">Create Plan</button>
        </div>
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
  const [employeeName, setEmployeeName] = useState('')
  const [employeeUsername, setEmployeeUsername] = useState('')
  const [employeeEmail, setEmployeeEmail] = useState('')
  const [employeePhone, setEmployeePhone] = useState('')
  const [employeePassword, setEmployeePassword] = useState('ChangeMe123!')
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>([])
  const summary = data?.summary ?? {}

  const handleCreateRole = async () => {
    if (!roleName.trim()) return
    await createRole({ name: roleName, description: 'Custom access role', is_system: false })
    setRoleName('')
    onRefresh?.()
  }

  const handleCreateUser = async () => {
    if (!employeeName.trim() || !employeeUsername.trim() || !employeeEmail.trim()) return
    await createHrmsUser({
      full_name: employeeName,
      username: employeeUsername,
      email: employeeEmail,
      phone: employeePhone,
      password: employeePassword,
      is_active: true,
      is_super_admin: false,
    })
    setEmployeeName('')
    setEmployeeUsername('')
    setEmployeeEmail('')
    setEmployeePhone('')
    setEmployeePassword('ChangeMe123!')
    onRefresh?.()
  }

  const handleToggleUser = async (id: unknown, active: unknown) => {
    if (typeof id !== 'number') return
    await updateHrmsUser(id, { is_active: !active })
    onRefresh?.()
  }

  const handleSaveUserRoles = async () => {
    if (!selectedUserId) return
    await replaceUserRoles(selectedUserId, selectedRoleIds)
    onRefresh?.()
  }

  const handleSavePermissions = async () => {
    if (!selectedRoleId) return
    await replaceRolePermissions(selectedRoleId, selectedPermissions)
    onRefresh?.()
  }

  return (
    <PageShell title="HRMS" subtitle="Application users, role permissions, login access, and attendance visibility.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="App Users" value={summary.users ?? data?.users.length ?? 0} icon={Users} />
        <StatCard label="Active" value={summary.activeUsers ?? 0} icon={BadgeCheck} />
        <StatCard label="Inactive" value={summary.inactiveUsers ?? 0} icon={Clock3} />
        <StatCard label="Roles" value={summary.roles ?? data?.roles?.length ?? 0} icon={ShieldCheck} />
        <StatCard label="Sessions" value={summary.activeSessions ?? 0} icon={CheckCircle2} />
      </div>

      <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <Section title="Users">
            <div className="mb-3 grid gap-3 rounded-[8px] bg-white p-4 shadow-[0_14px_34px_rgba(19,38,92,0.06)] md:grid-cols-2 xl:grid-cols-3">
              <Field label="Employee Name"><input value={employeeName} onChange={(event) => setEmployeeName(event.target.value)} placeholder="Employee name" className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] font-normal text-[#13265C] outline-none" /></Field>
              <Field label="Username"><input value={employeeUsername} onChange={(event) => setEmployeeUsername(event.target.value)} placeholder="Username" className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] font-normal text-[#13265C] outline-none" /></Field>
              <Field label="Email"><input value={employeeEmail} onChange={(event) => setEmployeeEmail(event.target.value)} placeholder="Email" className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] font-normal text-[#13265C] outline-none" /></Field>
              <Field label="Phone"><input value={employeePhone} onChange={(event) => setEmployeePhone(event.target.value)} placeholder="Phone" className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] font-normal text-[#13265C] outline-none" /></Field>
              <Field label="Temporary Password"><input value={employeePassword} onChange={(event) => setEmployeePassword(event.target.value)} placeholder="Temporary password" className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] font-normal text-[#13265C] outline-none" /></Field>
              <button type="button" onClick={handleCreateUser} className="rounded-[8px] bg-[#B85412] px-4 py-3 text-[14px] font-semibold text-white">Create User</button>
            </div>
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
                {
                  key: 'actions',
                  label: 'Actions',
                  render: (row) => (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUserId(asNumber(row.id))
                          setSelectedRoleIds([])
                        }}
                        className="rounded-[8px] bg-[#F5F7FF] px-3 py-1 text-[12px] font-semibold text-[#13265C]"
                      >
                        Roles
                      </button>
                      <button type="button" onClick={() => handleToggleUser(row.id, row.active)} className="rounded-[8px] bg-[#FFF8EA] px-3 py-1 text-[12px] font-semibold text-[#9A5B00]">
                        {row.active ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  ),
                },
              ]}
            />
          </Section>

          <Section title="Attendance">
            <div className="mb-3 grid gap-3 md:grid-cols-4">
              {(data?.attendanceSummary ?? []).map((item) => (
                <article key={String(item.status)} className="rounded-[8px] bg-white p-4 shadow-[0_14px_34px_rgba(19,38,92,0.06)]">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#596498]">{titleCase(item.status)}</p>
                  <p className="mt-2 text-[24px] font-bold text-[#13265C]">{asNumber(item.count)}</p>
                </article>
              ))}
            </div>
            <DataTable
              emptyText="No attendance rows found."
              rows={data?.attendance ?? []}
              columns={[
                { key: 'user', label: 'Employee' },
                { key: 'date', label: 'Date' },
                { key: 'status', label: 'Status' },
                { key: 'checkInAt', label: 'Check In' },
                { key: 'checkOutAt', label: 'Check Out' },
              ]}
            />
          </Section>
        </div>

        <div className="space-y-5">
          <div className="rounded-[8px] bg-white p-5 shadow-[0_14px_34px_rgba(19,38,92,0.06)]">
            <h2 className="text-[16px] font-semibold text-[#13265C]">Assign User Roles</h2>
            <Field label="User" className="mt-4"><select value={selectedUserId ?? ''} onChange={(event) => setSelectedUserId(event.target.value ? Number(event.target.value) : null)} className="w-full rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] font-normal text-[#13265C] outline-none">
              <option value="">Select user</option>
              {(data?.users ?? []).map((user) => (
                <option key={String(user.id)} value={Number(user.id)}>{asText(user.name)}</option>
              ))}
            </select></Field>
            <div className="mt-3 grid gap-2">
              {(data?.roles ?? []).map((role) => {
                const id = asNumber(role.id)
                return (
                  <label key={String(role.id)} className="flex items-center gap-2 rounded-[8px] border border-[#EEF1FA] px-3 py-2 text-[13px]">
                    <input
                      type="checkbox"
                      checked={selectedRoleIds.includes(id)}
                      onChange={(event) => setSelectedRoleIds((current) => event.target.checked ? [...current, id] : current.filter((item) => item !== id))}
                    />
                    {asText(role.name)}
                  </label>
                )
              })}
            </div>
            <button type="button" onClick={handleSaveUserRoles} className="mt-4 w-full rounded-[8px] bg-[#13265C] px-4 py-3 text-[14px] font-semibold text-white">Save User Roles</button>
          </div>

          <div className="rounded-[8px] bg-white p-5 shadow-[0_14px_34px_rgba(19,38,92,0.06)]">
            <h2 className="text-[16px] font-semibold text-[#13265C]">Role Coverage</h2>
            <div className="mt-4 space-y-2">
              {(data?.roleCoverage ?? []).map((role) => (
                <div key={String(role.id)} className="flex items-center justify-between rounded-[8px] bg-[#F5F7FF] px-3 py-3 text-[13px]">
                  <span className="font-semibold text-[#13265C]">{asText(role.name)}</span>
                  <span className="text-[#596498]">{asNumber(role.users_count)} users</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Section title="Editable Access Control">
        <div className="grid gap-4 rounded-[8px] bg-white p-5 shadow-[0_14px_34px_rgba(19,38,92,0.06)] lg:grid-cols-[260px_minmax(0,1fr)]">
          <div>
            <Field label="Role Name"><input value={roleName} onChange={(event) => setRoleName(event.target.value)} placeholder="New role name" className="w-full rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] font-normal text-[#13265C] outline-none" /></Field>
            <button type="button" onClick={handleCreateRole} className="mt-3 w-full rounded-[8px] bg-[#B85412] px-4 py-3 text-[14px] font-semibold text-white">Create Role</button>
            <div className="mt-4 space-y-2">
              {(data?.roles ?? []).map((role) => (
                <button
                  key={String(role.id)}
                  type="button"
                  onClick={() => {
                    setSelectedRoleId(Number(role.id))
                    setSelectedPermissions(Array.isArray(role.permissions) ? role.permissions.map(String) : [])
                  }}
                  className={`block w-full rounded-[8px] border px-3 py-2 text-left text-[13px] font-semibold ${selectedRoleId === Number(role.id) ? 'border-[#B85412] bg-[#FDF1E8] text-[#B85412]' : 'border-[#EEF1FA] text-[#13265C]'}`}
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
            <button type="button" onClick={handleSavePermissions} className="mt-4 rounded-[8px] bg-[#13265C] px-4 py-3 text-[14px] font-semibold text-white">Save Permissions</button>
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
        <Field label="Message Text">
        <input
          value={messageText}
          onChange={(event) => setMessageText(event.target.value)}
          className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] font-normal text-[#13265C] outline-none"
        />
        </Field>
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
          <div className="mt-5 flex items-end gap-3">
            <Field label="Organization Phone" className="min-w-0 flex-1">
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="Organization phone"
              className="rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-[14px] font-normal text-[#13265C] outline-none"
            />
            </Field>
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
