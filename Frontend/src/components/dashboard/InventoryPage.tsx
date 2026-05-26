import { useEffect, useMemo, useState, type ChangeEvent, type MouseEvent, type ReactNode } from 'react'
import {
  Box,
  Building2,
  ChevronDown,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  HandCoins,
  MapPinned,
  Minus,
  PanelRightClose,
  PanelRightOpen,
  Printer,
  Save,
  ScanSearch,
  Search,
  SquareStack,
  Upload,
  UserPlus,
  Users,
  X,
  ZoomIn,
} from 'lucide-react'
import {
  createBooking,
  createBookingApplicant,
  createBookingBroker,
  createBusinessResource,
  createInventoryEntity,
  createProjectWithMap,
  downloadInventoryExcel,
  updateInventoryEntity,
  uploadInventoryExcel,
} from '../../lib/workspaceApi'

type InventoryRecord = Record<string, string | number | boolean | Record<string, unknown> | null | undefined>

type InventoryData = {
  counts: Record<string, number>
  selectedProjectId?: number | null
  projects?: InventoryRecord[]
  map?: Record<string, unknown> & { map_data?: { svg?: string; viewBox?: string } }
  mapElements?: InventoryRecord[]
  floors?: InventoryRecord[]
  units: InventoryRecord[]
  paymentPlans?: InventoryRecord[]
  customers?: InventoryRecord[]
  brokers?: InventoryRecord[]
}

type HeaderProps = {
  data?: InventoryData
  selectedProjectId?: number | null
  onProjectSelect: (projectId: number) => void
  onProjectCreated: (projectId: number) => void
}

const statusColors: Record<string, string> = {
  available: '#8bc34a',
  booked: '#ffc420',
  sold: '#ef4444',
  hold: '#f59e0b',
  reserved: '#60a5fa',
  blocked: '#9ca3af',
}
const fieldInputClass =
  'rounded-[8px] border border-[#E3E8F6] bg-white px-3 py-2 text-[13px] text-[#13265C] outline-none placeholder:text-[#7A84AB]'
const actionButtonClass = 'rounded-[8px] bg-[#13265C] px-3 py-2 text-[12px] font-semibold text-white'

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

const toNumber = (value: unknown) => (typeof value === 'number' ? value : Number(value || 0))

function statusColor(status: unknown) {
  return statusColors[String(status ?? 'available')] ?? '#8bc34a'
}

function recolorSvg(svg: string, elements: InventoryRecord[], selectedCode: string | null) {
  return elements.reduce((currentSvg, element) => {
    const id = String(element.element_id ?? '')
    const color = statusColor(element.inventory_status)
    const stroke = selectedCode === id ? '#13265C' : 'white'
    const strokeWidth = selectedCode === id ? '8' : '4'
    return currentSvg.replace(
      new RegExp(`(<rect[^>]*id="${id}"[^>]*fill=")[^"]*("[^>]*stroke=")[^"]*("[^>]*stroke-width=")[^"]*(")`, 'g'),
      `$1${color}$2${stroke}$3${strokeWidth}$4`,
    )
  }, svg)
}

function defaultCustomerCode() {
  return `CUST-${Date.now().toString().slice(-6)}`
}

function defaultBrokerCode() {
  return `BRK-${Date.now().toString().slice(-6)}`
}

export function InventoryPage({ data, onRefresh }: { data?: InventoryData; onRefresh?: () => void }) {
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null)
  const [isTableView, setIsTableView] = useState(false)
  const [isInfoOpen, setIsInfoOpen] = useState(true)
  const [activeInfoTab, setActiveInfoTab] = useState<'overview' | 'parties' | 'sale' | 'payments'>('overview')
  const [isEditingDetails, setIsEditingDetails] = useState(false)
  const [addingParentId, setAddingParentId] = useState<number | null>(null)
  const [childName, setChildName] = useState('')
  const [childType, setChildType] = useState('floor')
  const [editName, setEditName] = useState('')
  const [editArea, setEditArea] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editFacing, setEditFacing] = useState('')
  const [editNote, setEditNote] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null)
  const [brokerName, setBrokerName] = useState('')
  const [brokerPhone, setBrokerPhone] = useState('')
  const [selectedBrokerId, setSelectedBrokerId] = useState<number | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [bookingAmount, setBookingAmount] = useState('')
  const [bookingStatus, setBookingStatus] = useState('confirmed')
  const [selectedPaymentPlanId, setSelectedPaymentPlanId] = useState<number | null>(null)
  const [selectedCoApplicantId, setSelectedCoApplicantId] = useState<number | null>(null)
  const [coApplicantName, setCoApplicantName] = useState('')
  const [coApplicantPhone, setCoApplicantPhone] = useState('')
  const [brokerCommissionPercent, setBrokerCommissionPercent] = useState('2')
  const [brokerCommissionAmount, setBrokerCommissionAmount] = useState('')
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [lastCustomerId, setLastCustomerId] = useState<number | null>(null)
  const [lastBrokerId, setLastBrokerId] = useState<number | null>(null)
  const [lastBookingId, setLastBookingId] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const mapElements = data?.mapElements ?? []
  const units = data?.units ?? []
  const floors = data?.floors ?? []
  const customers = data?.customers ?? []
  const brokers = data?.brokers ?? []
  const selectedElement = mapElements.find((element) => element.element_id === selectedElementId)
  const selectedPlot =
    units.find((unit) => unit.id === selectedElement?.inventory_entity_id) ??
    units.find((unit) => unit.code === selectedElementId) ??
    null
  const selectedFloors = floors.filter((floor) => floor.parentId === selectedPlot?.id || floor.parentCode === selectedPlot?.code)
  const selectedEntity =
    floors.find((floor) => floor.id === selectedEntityId) ??
    units.find((unit) => unit.id === selectedEntityId) ??
    selectedFloors[0] ??
    selectedPlot
  const activeBooking = selectedEntity?.activeBooking as Record<string, unknown> | null | undefined
  const selectedCustomer = customers.find((customer) => toNumber(customer.id) === selectedCustomerId) ?? null
  const selectedBroker = brokers.find((broker) => toNumber(broker.id) === selectedBrokerId) ?? null
  const projectId = toNumber(data?.selectedProjectId ?? data?.projects?.[0]?.id)
  const allInventoryRows = useMemo(() => [...units, ...floors], [units, floors])
  const rootPlots = useMemo(
    () => units.filter((unit) => String(unit.type) === 'plot'),
    [units],
  )
  const childrenByParentId = useMemo(() => {
    const grouped = new Map<number, InventoryRecord[]>()
    allInventoryRows.forEach((item) => {
      const parentId = toNumber(item.parentId)
      if (!parentId) return
      grouped.set(parentId, [...(grouped.get(parentId) ?? []), item])
    })
    return grouped
  }, [allInventoryRows])

  const svgMarkup = useMemo(() => {
    const rawSvg = data?.map?.map_data?.svg
    if (!rawSvg) return ''
    return recolorSvg(rawSvg, mapElements, selectedElementId)
  }, [data?.map?.map_data?.svg, mapElements, selectedElementId])

  useEffect(() => {
    if (!selectedEntity) return
    setEditName(String(selectedEntity.name ?? ''))
    setEditArea(String(selectedEntity.area ?? ''))
    setEditPrice(String(selectedEntity.price ?? ''))
    setEditFacing(String(selectedEntity.facing ?? ''))
    setEditNote(String(selectedEntity.displayNote ?? ''))
    setBookingAmount(String(selectedEntity.price ?? ''))
    setSelectedPaymentPlanId(toNumber(data?.paymentPlans?.[0]?.id) || null)
    const booking = selectedEntity.activeBooking as Record<string, unknown> | null | undefined
    setSelectedCustomerId(toNumber(booking?.customer_id) || null)
    setIsEditingDetails(false)
  }, [
    selectedEntity?.id,
    selectedEntity?.name,
    selectedEntity?.area,
    selectedEntity?.price,
    selectedEntity?.facing,
    selectedEntity?.displayNote,
    selectedEntity?.activeBooking,
    data?.paymentPlans,
  ])

  const selectPlot = (elementId: string) => {
    const element = mapElements.find((item) => item.element_id === elementId)
    const plot = units.find((unit) => unit.id === element?.inventory_entity_id)
    const children = floors.filter((floor) => floor.parentId === plot?.id || floor.parentCode === plot?.code)
    setSelectedElementId(elementId)
    setSelectedEntityId(toNumber(children[0]?.id ?? plot?.id))
    setEditName(String(children[0]?.name ?? plot?.name ?? ''))
    setEditArea(String(children[0]?.area ?? plot?.area ?? ''))
    setEditPrice(String(children[0]?.price ?? plot?.price ?? ''))
    setEditFacing(String(children[0]?.facing ?? plot?.facing ?? ''))
    setEditNote(String(children[0]?.displayNote ?? plot?.displayNote ?? ''))
    setActionMessage(null)
    setActiveInfoTab('overview')
    setIsTableView(false)
  }

  const handleMapClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as SVGElement
    const id = target.id
    if (mapElements.some((item) => item.element_id === id)) {
      selectPlot(id)
    }
  }

  const openEntityFromTable = (unit: InventoryRecord) => {
    const linkedElement = mapElements.find((element) => element.inventory_entity_id === unit.id)
    if (linkedElement?.element_id) {
      setSelectedElementId(String(linkedElement.element_id))
    }
    setSelectedEntityId(toNumber(unit.id))
    setEditName(String(unit.name ?? ''))
    setEditArea(String(unit.area ?? ''))
    setEditPrice(String(unit.price ?? ''))
    setEditFacing(String(unit.facing ?? ''))
    setEditNote(String(unit.displayNote ?? ''))
    setActiveInfoTab('overview')
    setIsTableView(false)
  }

  const startAddChild = (parent: InventoryRecord) => {
    setAddingParentId(toNumber(parent.id))
    setChildType(String(parent.type) === 'plot' ? 'floor' : 'flat')
    setChildName('')
  }

  const childTypeOptions = (parent: InventoryRecord | undefined) => {
    if (String(parent?.type) === 'plot') return ['floor', 'flat', 'shop']
    if (String(parent?.type) === 'floor') return ['flat', 'shop', 'office']
    return ['flat', 'shop', 'office']
  }

  const handleCreateChild = async (parent: InventoryRecord) => {
    if (!projectId || !childName.trim()) return
    const parentId = toNumber(parent.id)
    if (!parentId) return
    setIsSaving(true)
    try {
      await createInventoryEntity({
        project_id: projectId,
        parent_id: parentId,
        entity_type: childType,
        name: childName.trim(),
        inventory_status: 'available',
        lifecycle_stage: 'active_sales',
        level_no: toNumber(parent.levelNo ?? parent.level_no) + 1 || (String(parent.type) === 'plot' ? 2 : 3),
        sort_order: 99,
        dimensions: { saleable_area: childType === 'floor' ? 500 : 1000, measurement_unit: 'sqft' },
        pricing: { final_price: 5000000, price_per_sqft: 5000, currency: 'INR' },
        details: { display_note: `Added under ${String(parent.name ?? parent.code)}` },
      })
      setChildName('')
      setAddingParentId(null)
      setActionMessage('Inventory added in database.')
      onRefresh?.()
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Could not add inventory.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveEntity = async () => {
    const id = toNumber(selectedEntity?.id)
    if (!id) return
    setIsSaving(true)
    try {
      await updateInventoryEntity(id, {
        name: editName.trim() || selectedEntity?.name,
        dimensions: { saleable_area: Number(editArea || selectedEntity?.area || 0) },
        pricing: { final_price: Number(editPrice || selectedEntity?.price || 0), currency: 'INR' },
        details: { facing: editFacing.trim() || undefined, display_note: editNote.trim() || undefined },
      })
      setActionMessage('Inventory details saved.')
      onRefresh?.()
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Could not save inventory.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleMarkStatus = async (nextStatus: string) => {
    const id = toNumber(selectedEntity?.id)
    if (!id) return
    if (['hold', 'booked', 'sold'].includes(nextStatus) && !selectedCustomerId) {
      setActionMessage('Select or create a customer before marking this inventory.')
      return
    }
    if (['hold', 'booked', 'sold'].includes(nextStatus) && !selectedBrokerId && !lastBrokerId) {
      setActionMessage('Select or create a broker before marking this inventory.')
      return
    }
    if (['booked', 'sold'].includes(nextStatus)) {
      await handleCreateSale(nextStatus === 'sold' ? 'completed' : 'confirmed')
      return
    }
    setIsSaving(true)
    try {
      await updateInventoryEntity(id, { inventory_status: nextStatus })
      setActionMessage(`Status updated to ${titleCase(nextStatus)}.`)
      onRefresh?.()
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Could not update status.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCreateCustomer = async () => {
    if (!customerName.trim()) return
    setIsSaving(true)
    try {
      const customer = await createBusinessResource('customers', {
        customer_code: defaultCustomerCode(),
        full_name: customerName.trim(),
        phone: customerPhone.trim() || undefined,
        kyc_status: 'pending',
      })
      const createdCustomerId = toNumber(customer.id)
      setLastCustomerId(createdCustomerId)
      setSelectedCustomerId(createdCustomerId)
      setCustomerName('')
      setCustomerPhone('')
      setActionMessage('Customer created and ready for booking.')
      onRefresh?.()
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Could not create customer.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCreateBroker = async () => {
    if (!brokerName.trim()) return
    setIsSaving(true)
    try {
      const broker = await createBusinessResource('brokers', {
        broker_code: defaultBrokerCode(),
        username: `${brokerName.trim().toLowerCase().replace(/\s+/g, '.')}.${Date.now().toString().slice(-4)}`,
        full_name: brokerName.trim(),
        phone: brokerPhone.trim() || undefined,
        kyc_status: 'pending',
      })
      const createdBrokerId = toNumber(broker.id)
      setLastBrokerId(createdBrokerId)
      setSelectedBrokerId(createdBrokerId)
      setBrokerName('')
      setBrokerPhone('')
      setActionMessage('Broker created and ready to link.')
      onRefresh?.()
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Could not create broker.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCreateSale = async (overrideBookingStatus?: string) => {
    const entityId = toNumber(selectedEntity?.id)
    if (!entityId) return
    const primaryCustomerId = selectedCustomerId ?? lastCustomerId ?? toNumber(activeBooking?.customer_id)
    const finalBookingAmount = Number(bookingAmount || editPrice || selectedEntity?.price || 0)
    if (!primaryCustomerId) {
      setActionMessage('Select or create a primary applicant before creating sale.')
      return
    }
    if (!selectedBrokerId && !lastBrokerId) {
      setActionMessage('Select or create broker before creating sale.')
      return
    }
    if (!finalBookingAmount) {
      setActionMessage('Enter sale price before creating sale.')
      return
    }
    setIsSaving(true)
    try {
      let coApplicantId = selectedCoApplicantId
      if (!coApplicantId && coApplicantName.trim()) {
        const coApplicant = await createBusinessResource('customers', {
          customer_code: defaultCustomerCode(),
          full_name: coApplicantName.trim(),
          phone: coApplicantPhone.trim() || undefined,
          kyc_status: 'pending',
        })
        coApplicantId = toNumber(coApplicant.id)
      }
      const finalStatus = overrideBookingStatus ?? bookingStatus
      const booking = await createBooking({
        inventory_entity_id: entityId,
        customer_id: primaryCustomerId,
        payment_plan_id: selectedPaymentPlanId || undefined,
        booking_status: finalStatus,
        booking_amount: finalBookingAmount,
        booked_at: new Date().toISOString(),
      })
      const bookingId = toNumber((booking.booking as Record<string, unknown> | undefined)?.id ?? booking.id)
      setLastBookingId(bookingId)
      if (bookingId && coApplicantId) {
        await createBookingApplicant({
          booking_id: bookingId,
          customer_id: coApplicantId,
          applicant_role: 'co_applicant',
          ownership_percentage: 0,
          is_primary: false,
        })
      }
      const brokerId = selectedBrokerId ?? lastBrokerId
      if (bookingId && brokerId) {
        await createBookingBroker({
          booking_id: bookingId,
          broker_id: brokerId,
          commission_percentage: Number(brokerCommissionPercent || 0) || undefined,
          commission_amount: Number(brokerCommissionAmount || 0) || undefined,
        })
      }
      if (bookingId && Number(paymentAmount || 0) > 0) {
        await createBusinessResource('payments', {
          booking_id: bookingId,
          customer_id: primaryCustomerId,
          payment_code: `PAY-${Date.now().toString().slice(-6)}`,
          amount: Number(paymentAmount),
          payment_mode: 'bank_transfer',
          transaction_type: 'booking',
          payment_status: 'completed',
          paid_at: new Date().toISOString(),
        })
      }
      if (finalStatus === 'completed') {
        await updateInventoryEntity(entityId, { inventory_status: 'sold' })
      }
      setCoApplicantName('')
      setCoApplicantPhone('')
      setPaymentAmount('')
      setActionMessage('Sale booking created and inventory marked booked.')
      onRefresh?.()
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Could not create sale.')
    } finally {
      setIsSaving(false)
    }
  }

  const handlePayment = async () => {
    const bookingId = lastBookingId || toNumber(activeBooking?.id)
    if (!bookingId || !paymentAmount) return
    setIsSaving(true)
    try {
      await createBusinessResource('payments', {
        booking_id: bookingId,
        customer_id: selectedCustomerId ?? lastCustomerId ?? activeBooking?.customer_id,
        payment_code: `PAY-${Date.now().toString().slice(-6)}`,
        amount: Number(paymentAmount),
        payment_mode: 'bank_transfer',
        transaction_type: 'booking',
        payment_status: 'completed',
        paid_at: new Date().toISOString(),
      })
      setPaymentAmount('')
      setActionMessage('Payment recorded in database.')
      onRefresh?.()
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Could not record payment.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDownloadExcel = async () => {
    if (!projectId) return
    setIsSaving(true)
    try {
      const blob = await downloadInventoryExcel(projectId)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'inventory.xlsx'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setActionMessage('Inventory Excel downloaded.')
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Could not download Excel.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleUploadExcel = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!projectId || !file) return
    setIsSaving(true)
    try {
      const result = await uploadInventoryExcel(projectId, file)
      const errors = result.errors as unknown[] | undefined
      const summary = `Excel uploaded. Updated ${String(result.updated ?? 0)}, created ${String(result.created ?? 0)}.`
      setActionMessage(errors?.length ? `${summary} ${errors.slice(0, 3).join(' ')}` : summary)
      onRefresh?.()
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Could not upload Excel.')
    } finally {
      setIsSaving(false)
    }
  }

  const renderInventoryRows = (items: InventoryRecord[], level = 0): ReactNode[] =>
    items.flatMap((item) => {
      const itemId = toNumber(item.id)
      const children = childrenByParentId.get(itemId) ?? []
      const canAddChild = ['plot', 'floor'].includes(String(item.type))
      const isAdding = addingParentId === itemId
      const rows: ReactNode[] = [
        <tr key={`row-${itemId}`} className="text-[#13265C]">
          <td className="px-4 py-3" style={{ paddingLeft: `${16 + level * 28}px` }}>
            <div className="flex items-center gap-2">
              {level > 0 ? <span className="h-px w-4 bg-[#C9D2EA]" /> : null}
              <div>
                <span className="block font-semibold">{String(item.name)}</span>
                <span className="text-[12px] text-[#7A84AB]">{String(item.code)}</span>
              </div>
            </div>
          </td>
          <td className="px-4 py-3">{titleCase(item.type)}</td>
          <td className="px-4 py-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#F7F8FE] px-3 py-1 text-[12px] font-semibold">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: statusColor(item.status) }} />
              {titleCase(item.status)}
            </span>
          </td>
          <td className="px-4 py-3">{String(item.area ?? 0)}</td>
          <td className="px-4 py-3">{formatCurrency(item.price)}</td>
          <td className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => openEntityFromTable(item)}
                className="rounded-[8px] bg-[#F5F7FF] px-3 py-1 font-semibold"
              >
                Open / Edit
              </button>
              {canAddChild ? (
                <button
                  type="button"
                  onClick={() => startAddChild(item)}
                  className="rounded-[8px] bg-[#FFF7F1] px-3 py-1 font-semibold text-[#B85412]"
                >
                  Add Under
                </button>
              ) : null}
            </div>
          </td>
        </tr>,
      ]

      if (isAdding) {
        rows.push(
          <tr key={`add-${itemId}`} className="bg-[#FFFDFC]">
            <td colSpan={6} className="px-4 py-3" style={{ paddingLeft: `${36 + level * 28}px` }}>
              <div className="grid gap-3 rounded-[10px] border border-[#F1C3AA] bg-white p-3 lg:grid-cols-[minmax(0,1fr)_150px_110px_90px]">
                <input
                  value={childName}
                  onChange={(event) => setChildName(event.target.value)}
                  placeholder={`New item under ${String(item.name)}`}
                  className={fieldInputClass}
                />
                <select
                  value={childType}
                  onChange={(event) => setChildType(event.target.value)}
                  className={fieldInputClass}
                >
                  {childTypeOptions(item).map((type) => (
                    <option key={type} value={type}>
                      {titleCase(type)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => handleCreateChild(item)}
                  disabled={isSaving}
                  className="rounded-[8px] bg-[#B85412] px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setAddingParentId(null)}
                  className="rounded-[8px] border border-[#DDE4F3] px-3 py-2 text-[13px] font-semibold text-[#13265C]"
                >
                  Cancel
                </button>
              </div>
            </td>
          </tr>,
        )
      }

      return [...rows, ...renderInventoryRows(children, level + 1)]
    })

  return (
    <div className="h-full w-full overflow-hidden bg-[#E9EEF8]">
      <div
        className={`grid h-full gap-0 overflow-hidden border-t border-[#F1C3AA] bg-white/40 ${
          isInfoOpen ? 'grid-cols-[minmax(0,1fr)_minmax(320px,400px)]' : 'grid-cols-1'
        }`}
      >
        <section className="relative h-full min-h-0 overflow-hidden bg-[#F3F7FF] p-4 sm:p-5 lg:p-6">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setIsTableView((current) => !current)}
              disabled={isSaving}
              title="Inventory table view"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-[#B85412] text-white shadow-[0_16px_30px_rgba(184,84,18,0.28)] disabled:opacity-60"
            >
              <Box className="h-6 w-6" strokeWidth={2} />
            </button>
          </div>

          {!isInfoOpen ? (
            <button
              type="button"
              onClick={() => setIsInfoOpen(true)}
              title="Open property details"
              className="absolute right-6 top-24 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#13265C] shadow-[0_14px_30px_rgba(19,38,92,0.16)]"
            >
              <PanelRightOpen className="h-5 w-5" strokeWidth={2} />
            </button>
          ) : null}

          {isTableView ? (
            <div className="mt-5 overflow-hidden rounded-[18px] bg-white shadow-[0_18px_38px_rgba(19,38,92,0.08)]">
              <div className="flex items-center justify-between gap-3 border-b border-[#EEF1FA] px-4 py-3">
                <div>
                  <h2 className="text-[15px] font-bold text-[#13265C]">Inventory Hierarchy</h2>
                  <p className="mt-1 text-[12px] text-[#596498]">
                    Plots come from the map. Add floors, flats, shops, or offices under the correct parent.
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadExcel}
                    disabled={isSaving || !projectId}
                    className="flex items-center gap-2 rounded-[8px] bg-[#13265C] px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-60"
                  >
                    <Download className="h-4 w-4" />
                    Download Excel
                  </button>
                  <label className="flex cursor-pointer items-center gap-2 rounded-[8px] bg-[#B85412] px-3 py-2 text-[12px] font-semibold text-white">
                    <Upload className="h-4 w-4" />
                    Upload Edited Excel
                    <input
                      type="file"
                      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      onChange={handleUploadExcel}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
              <div className="max-h-[calc(100vh-260px)] overflow-auto">
                <table className="w-full min-w-[860px] border-collapse text-left text-[13px]">
                  <thead className="sticky top-0 bg-[#F5F7FF] text-[#596498]">
                    <tr>
                      {['Property', 'Type', 'Status', 'Area', 'Price', 'Action'].map((head) => (
                        <th key={head} className="px-4 py-3 font-semibold">{head}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEF1FA]">
                    {rootPlots.length ? (
                      renderInventoryRows(rootPlots)
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-[#596498]">
                          No map plots found. Upload or update the SVG map to create plots first.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="flex h-[calc(100%-76px)] min-h-0 items-center justify-center">
              {svgMarkup ? (
                <div
                  className="flex h-full w-full items-center justify-center [&_svg]:h-auto [&_svg]:max-h-full [&_svg]:w-auto [&_svg]:max-w-full [&_rect[id^='plot_']]:cursor-pointer [&_rect[id^='plot_']]:transition-opacity [&_rect[id^='plot_']]:hover:opacity-80"
                  onClick={handleMapClick}
                  dangerouslySetInnerHTML={{ __html: svgMarkup }}
                />
              ) : (
                <div className="flex h-full min-h-[420px] w-full items-center justify-center rounded-[18px] bg-white px-8 text-center text-[#596498]">
                  No published map found for this project. Use the property dropdown to add a project and upload SVG.
                </div>
              )}
            </div>
          )}

          <div className="absolute bottom-5 left-1/2 -translate-x-1/2">
            <div className="flex items-center gap-4 rounded-full bg-white px-6 py-4 shadow-[0_18px_38px_rgba(19,38,92,0.12)]">
              <button type="button" className="text-[#13265C]"><ZoomIn className="h-5 w-5" strokeWidth={2} /></button>
              <button type="button" className="text-[#13265C]"><Search className="h-5 w-5" strokeWidth={2} /></button>
              <div className="h-6 w-px bg-[#EBC2AE]" />
              <button type="button" onClick={() => setIsTableView(true)} className="text-[#13265C]"><SquareStack className="h-5 w-5" strokeWidth={2} /></button>
              <button type="button" className="text-[#13265C]"><Minus className="h-5 w-5" strokeWidth={2} /></button>
              <div className="h-6 w-px bg-[#EBC2AE]" />
              <button type="button" onClick={() => setIsTableView(false)} className="text-[#13265C]"><ScanSearch className="h-5 w-5" strokeWidth={2} /></button>
              <button type="button" onClick={() => window.print()} className="text-[#13265C]"><Printer className="h-5 w-5" strokeWidth={2} /></button>
            </div>
          </div>
        </section>

        {isInfoOpen ? (
        <aside className="h-full min-h-0 overflow-y-auto border-l border-[#EEF1FA] bg-white px-6 py-6">
          <div className="mb-4 flex justify-end">
            <button
              type="button"
              onClick={() => setIsInfoOpen(false)}
              title="Close property details"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F5F7FF] text-[#596498]"
            >
              <PanelRightClose className="h-5 w-5" strokeWidth={2} />
            </button>
          </div>
          {selectedEntity ? (
            <div>
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#F4F6FF] text-[#B4B9CF]">
                <Copy className="h-9 w-9" strokeWidth={2} />
              </div>
              <h2 className="mt-6 text-center text-[26px] font-bold tracking-[-0.04em] text-[#13265C]">
                {String(selectedEntity.name)}
              </h2>
              <p className="mt-2 text-center text-[14px] text-[#596498]">
                {String(selectedEntity.code)} | {titleCase(selectedEntity.type)}
              </p>

              <div className="mt-5 grid grid-cols-3 gap-2">
                <div className="rounded-[10px] bg-[#F7F8FE] p-3 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7A84AB]">Status</p>
                  <p className="mt-1 text-[13px] font-bold text-[#13265C]">{titleCase(selectedEntity.status)}</p>
                </div>
                <div className="rounded-[10px] bg-[#F7F8FE] p-3 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7A84AB]">Area</p>
                  <p className="mt-1 text-[13px] font-bold text-[#13265C]">{String(selectedEntity.area ?? 0)}</p>
                </div>
                <div className="rounded-[10px] bg-[#F7F8FE] p-3 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7A84AB]">Price</p>
                  <p className="mt-1 text-[13px] font-bold text-[#13265C]">{formatCurrency(selectedEntity.price)}</p>
                </div>
              </div>

              {actionMessage ? (
                <p className="mt-4 rounded-[8px] bg-[#FFF7F1] px-3 py-3 text-[13px] font-medium text-[#B85412]">
                  {actionMessage}
                </p>
              ) : null}

              <div className="mt-5 grid grid-cols-4 gap-1 rounded-[10px] bg-[#F5F7FF] p-1">
                {[
                  ['overview', 'Overview'],
                  ['parties', 'People'],
                  ['sale', 'Sale'],
                  ['payments', 'Pay'],
                ].map(([tab, label]) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveInfoTab(tab as 'overview' | 'parties' | 'sale' | 'payments')}
                    className={`rounded-[8px] px-2 py-2 text-[12px] font-semibold ${
                      activeInfoTab === tab ? 'bg-white text-[#13265C] shadow-sm' : 'text-[#596498]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {activeInfoTab === 'overview' ? (
                <>
              {selectedFloors.length ? (
                <section className="mt-5">
                  <h3 className="text-[15px] font-semibold text-[#13265C]">Floors under {String(selectedPlot?.code)}</h3>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {selectedFloors.map((floor) => (
                      <button
                        key={String(floor.id)}
                        type="button"
                        onClick={() => {
                          setSelectedEntityId(toNumber(floor.id))
                          setEditName(String(floor.name ?? ''))
                          setEditArea(String(floor.area ?? ''))
                          setEditPrice(String(floor.price ?? ''))
                        }}
                        className={`rounded-[8px] border px-3 py-3 text-left text-[13px] ${
                          selectedEntity?.id === floor.id ? 'border-[#B85412] bg-[#FFF7F1]' : 'border-[#EEF1FA]'
                        }`}
                      >
                        <span className="block font-semibold text-[#13265C]">{String(floor.name)}</span>
                        <span className="text-[#596498]">{titleCase(floor.status)}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              <div className="mt-5 rounded-[16px] bg-[#F7F8FE] px-5 py-4 text-left">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#596498]">Inventory Detail</p>
                  <button
                    type="button"
                    onClick={() => setIsEditingDetails((current) => !current)}
                    className="rounded-[8px] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#13265C]"
                  >
                    {isEditingDetails ? 'Cancel Edit' : 'Edit'}
                  </button>
                </div>
                {isEditingDetails ? (
                  <div className="mt-4 grid gap-3">
                    <input value={editName} onChange={(event) => setEditName(event.target.value)} placeholder="Name" className="rounded-[8px] border border-[#E3E8F6] bg-white px-3 py-2 text-[13px] outline-none" />
                    <input value={editArea} onChange={(event) => setEditArea(event.target.value)} placeholder="Saleable area" className="rounded-[8px] border border-[#E3E8F6] bg-white px-3 py-2 text-[13px] outline-none" />
                    <input value={editPrice} onChange={(event) => setEditPrice(event.target.value)} placeholder="Final price" className="rounded-[8px] border border-[#E3E8F6] bg-white px-3 py-2 text-[13px] outline-none" />
                    <input value={editFacing} onChange={(event) => setEditFacing(event.target.value)} placeholder="Facing" className="rounded-[8px] border border-[#E3E8F6] bg-white px-3 py-2 text-[13px] outline-none" />
                    <textarea value={editNote} onChange={(event) => setEditNote(event.target.value)} placeholder="Display note" rows={3} className="resize-none rounded-[8px] border border-[#E3E8F6] bg-white px-3 py-2 text-[13px] outline-none" />
                    <button type="button" onClick={handleSaveEntity} disabled={isSaving} className="flex items-center justify-center gap-2 rounded-[8px] bg-[#13265C] px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-60">
                      <Save className="h-4 w-4" /> Save Detail
                    </button>
                  </div>
                ) : (
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
                    <div className="rounded-[8px] bg-white p-3">
                      <dt className="text-[11px] uppercase tracking-[0.08em] text-[#7A84AB]">Status</dt>
                      <dd className="mt-1 font-semibold text-[#13265C]">{titleCase(selectedEntity.status)}</dd>
                    </div>
                    <div className="rounded-[8px] bg-white p-3">
                      <dt className="text-[11px] uppercase tracking-[0.08em] text-[#7A84AB]">Area</dt>
                      <dd className="mt-1 font-semibold text-[#13265C]">{String(selectedEntity.area ?? 0)}</dd>
                    </div>
                    <div className="rounded-[8px] bg-white p-3">
                      <dt className="text-[11px] uppercase tracking-[0.08em] text-[#7A84AB]">Price</dt>
                      <dd className="mt-1 font-semibold text-[#13265C]">{formatCurrency(selectedEntity.price)}</dd>
                    </div>
                    <div className="rounded-[8px] bg-white p-3">
                      <dt className="text-[11px] uppercase tracking-[0.08em] text-[#7A84AB]">Facing</dt>
                      <dd className="mt-1 font-semibold text-[#13265C]">{String(selectedEntity.facing ?? 'Not set')}</dd>
                    </div>
                    <div className="col-span-2 rounded-[8px] bg-white p-3">
                      <dt className="text-[11px] uppercase tracking-[0.08em] text-[#7A84AB]">Note</dt>
                      <dd className="mt-1 font-semibold text-[#13265C]">{String(selectedEntity.displayNote ?? 'Not set')}</dd>
                    </div>
                  </dl>
                )}
                <div className="mt-5 grid grid-cols-2 gap-2 border-t border-[#E8D1C3] pt-4">
                  {['available', 'hold', 'booked', 'sold'].map((status) => {
                    const isSelected = String(selectedEntity.status) === status
                    return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => handleMarkStatus(status)}
                      className={`flex items-center justify-center gap-2 rounded-[8px] border px-3 py-2 text-[12px] font-semibold ${
                        isSelected
                          ? 'border-[#13265C] bg-[#13265C] text-white shadow-[0_10px_22px_rgba(19,38,92,0.18)]'
                          : 'border-transparent bg-white text-[#13265C]'
                      }`}
                    >
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${isSelected ? 'ring-2 ring-white/60' : ''}`}
                        style={{ backgroundColor: statusColor(status) }}
                      />
                      {titleCase(status)}
                    </button>
                    )
                  })}
                </div>
              </div>
                </>
              ) : null}

              {activeInfoTab === 'parties' ? (
              <section className="mt-5 grid gap-3">
                <ActionBlock icon={<UserPlus className="h-4 w-4" />} title="Customer">
                  {activeBooking?.customer_name ? (
                    <div className="rounded-[8px] bg-[#F7F8FE] px-3 py-2 text-[12px] text-[#596498]">
                      Current customer: <span className="font-semibold text-[#13265C]">{String(activeBooking.customer_name)}</span>
                      {activeBooking.customer_phone ? ` | ${String(activeBooking.customer_phone)}` : ''}
                    </div>
                  ) : null}
                  <select
                    value={selectedCustomerId ?? ''}
                    onChange={(event) => setSelectedCustomerId(event.target.value ? Number(event.target.value) : null)}
                    className={fieldInputClass}
                  >
                    <option value="">Select existing customer</option>
                    {customers.map((customer) => (
                      <option key={String(customer.id)} value={String(customer.id)}>
                        {String(customer.full_name)}{customer.phone ? ` | ${String(customer.phone)}` : ''}
                      </option>
                    ))}
                  </select>
                  {selectedCustomer ? (
                    <div className="rounded-[8px] bg-[#F7F8FE] px-3 py-2 text-[12px] text-[#596498]">
                      Selected: <span className="font-semibold text-[#13265C]">{String(selectedCustomer.full_name)}</span>
                      {selectedCustomer.kyc_status ? ` | KYC ${titleCase(selectedCustomer.kyc_status)}` : ''}
                    </div>
                  ) : null}
                  <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Customer name" className={fieldInputClass} />
                  <input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="Phone" className={fieldInputClass} />
                  <button type="button" onClick={handleCreateCustomer} className={actionButtonClass}>Create Customer</button>
                </ActionBlock>

                <ActionBlock icon={<Users className="h-4 w-4" />} title="Broker">
                  <select
                    value={selectedBrokerId ?? ''}
                    onChange={(event) => setSelectedBrokerId(event.target.value ? Number(event.target.value) : null)}
                    className={fieldInputClass}
                  >
                    <option value="">Select existing broker</option>
                    {brokers.map((broker) => (
                      <option key={String(broker.id)} value={String(broker.id)}>
                        {String(broker.full_name)}{broker.company_name ? ` | ${String(broker.company_name)}` : ''}
                      </option>
                    ))}
                  </select>
                  {selectedBroker ? (
                    <div className="rounded-[8px] bg-[#F7F8FE] px-3 py-2 text-[12px] text-[#596498]">
                      Selected: <span className="font-semibold text-[#13265C]">{String(selectedBroker.full_name)}</span>
                      {selectedBroker.phone ? ` | ${String(selectedBroker.phone)}` : ''}
                    </div>
                  ) : null}
                  <input value={brokerName} onChange={(event) => setBrokerName(event.target.value)} placeholder="Broker name" className={fieldInputClass} />
                  <input value={brokerPhone} onChange={(event) => setBrokerPhone(event.target.value)} placeholder="Phone" className={fieldInputClass} />
                  <button type="button" onClick={handleCreateBroker} className={actionButtonClass}>Create Broker</button>
                </ActionBlock>
              </section>
              ) : null}

              {activeInfoTab === 'sale' ? (
              <section className="mt-5 grid gap-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2 rounded-[8px] bg-[#F5F7FF] px-3 py-3 text-[12px] text-[#596498]">
                    {activeBooking ? `Active booking: ${String(activeBooking.booking_code)} | ${formatCurrency(activeBooking.booking_amount)}` : 'No active booking'}
                  </div>
                </div>

                <ActionBlock icon={<HandCoins className="h-4 w-4" />} title="Sale / Booking">
                  <select value={bookingStatus} onChange={(event) => setBookingStatus(event.target.value)} className={fieldInputClass}>
                    <option value="reserved">Reserve / Hold booking</option>
                    <option value="confirmed">Confirmed booking</option>
                    <option value="completed">Completed sale</option>
                  </select>
                  <select
                    value={selectedPaymentPlanId ?? ''}
                    onChange={(event) => setSelectedPaymentPlanId(event.target.value ? Number(event.target.value) : null)}
                    className={fieldInputClass}
                  >
                    <option value="">No payment plan</option>
                    {(data?.paymentPlans ?? []).map((plan) => (
                      <option key={String(plan.id)} value={String(plan.id)}>
                        {String(plan.name)}
                      </option>
                    ))}
                  </select>
                  <input value={bookingAmount} onChange={(event) => setBookingAmount(event.target.value)} placeholder="Sale price" className={fieldInputClass} />
                  <select
                    value={selectedCoApplicantId ?? ''}
                    onChange={(event) => setSelectedCoApplicantId(event.target.value ? Number(event.target.value) : null)}
                    className={fieldInputClass}
                  >
                    <option value="">Select co-applicant</option>
                    {customers.map((customer) => (
                      <option key={String(customer.id)} value={String(customer.id)}>
                        {String(customer.full_name)}{customer.phone ? ` | ${String(customer.phone)}` : ''}
                      </option>
                    ))}
                  </select>
                  <input value={coApplicantName} onChange={(event) => setCoApplicantName(event.target.value)} placeholder="New co-applicant name" className={fieldInputClass} />
                  <input value={coApplicantPhone} onChange={(event) => setCoApplicantPhone(event.target.value)} placeholder="Co-applicant phone" className={fieldInputClass} />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={brokerCommissionPercent} onChange={(event) => setBrokerCommissionPercent(event.target.value)} placeholder="Broker %" className={fieldInputClass} />
                    <input value={brokerCommissionAmount} onChange={(event) => setBrokerCommissionAmount(event.target.value)} placeholder="Broker amount" className={fieldInputClass} />
                  </div>
                  <input value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} placeholder="Initial payment amount" className={fieldInputClass} />
                  <button type="button" onClick={() => handleCreateSale()} className="flex items-center justify-center gap-2 rounded-[8px] bg-[#B85412] px-3 py-3 text-[12px] font-semibold text-white">
                    <HandCoins className="h-4 w-4" /> Create Sale
                  </button>
                </ActionBlock>
              </section>
              ) : null}

              {activeInfoTab === 'payments' ? (
              <section className="mt-5 grid gap-3">
                <ActionBlock icon={<CreditCard className="h-4 w-4" />} title="Extra Payment">
                  <div className="rounded-[8px] bg-[#F7F8FE] px-3 py-2 text-[12px] text-[#596498]">
                    {activeBooking ? `Payment will be attached to ${String(activeBooking.booking_code)}.` : 'Create a sale or booking before recording payment.'}
                  </div>
                  <input value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} placeholder="Amount" className={fieldInputClass} />
                  <button type="button" onClick={handlePayment} className={actionButtonClass}>Record Payment</button>
                </ActionBlock>
              </section>
              ) : null}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#F4F6FF] text-[#B4B9CF]">
                <Copy className="h-9 w-9" strokeWidth={2} />
              </div>
              <h2 className="mt-8 text-[24px] font-bold tracking-[-0.04em] text-[#13265C]">No Plot Selected</h2>
              <p className="mt-4 text-[15px] leading-8 text-[#596498]">
                Click a plot on the database SVG. If the plot has floors, the first floor opens as the controlled saleable inventory.
              </p>
            </div>
          )}
        </aside>
        ) : null}
      </div>
    </div>
  )
}

function ActionBlock({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-[12px] border border-[#EEF1FA] p-3">
      <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-[#13265C]">
        {icon}
        {title}
      </div>
      <div className="grid gap-2">{children}</div>
    </div>
  )
}

export function InventoryHeaderControl({ data, selectedProjectId, onProjectSelect, onProjectCreated }: HeaderProps) {
  const [open, setOpen] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [location, setLocation] = useState('')
  const [svg, setSvg] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const projects = data?.projects ?? []
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0]
  const headerCounts = {
    available: data?.counts.available ?? 0,
    booked: data?.counts.booked ?? 0,
    sold: data?.counts.sold ?? 0,
    hold: data?.counts.hold ?? 0,
  }

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    file.text().then(setSvg).catch(() => setError('Could not read SVG file.'))
  }

  const handleCreate = async () => {
    if (!projectName.trim() || !svg.trim()) {
      setError('Project name and SVG are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await createProjectWithMap({
        name: projectName.trim(),
        project_type: 'plotting',
        location: location.trim() || undefined,
        svg,
      })
      const project = result.project as Record<string, unknown>
      onProjectCreated(toNumber(project.id))
      setProjectName('')
      setLocation('')
      setSvg('')
      setShowCreate(false)
      setOpen(false)
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Could not create project.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex h-[48px] items-center gap-3 rounded-full border border-[#F1C3AA] bg-white px-5 text-[#13265C] shadow-[0_14px_26px_rgba(19,38,92,0.05)]"
        >
          <MapPinned className="h-[18px] w-[18px] text-[#B85412]" strokeWidth={2} />
          <span className="max-w-[220px] truncate text-[14px] font-semibold">{String(selectedProject?.name ?? 'Select property')}</span>
          <ChevronDown className="h-[18px] w-[18px] text-[#596498]" strokeWidth={2} />
        </button>

        {open ? (
          <div className="absolute left-0 top-[56px] z-30 w-[340px] rounded-[12px] border border-[#F1C3AA] bg-white p-3 shadow-[0_18px_42px_rgba(19,38,92,0.16)]">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-[#13265C]">Select Property</p>
            <button type="button" onClick={() => setOpen(false)} className="text-[#596498]">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 max-h-[180px] overflow-auto">
            {projects.map((project) => (
              <button
                key={String(project.id)}
                type="button"
                onClick={() => {
                  onProjectSelect(toNumber(project.id))
                  setOpen(false)
                }}
                className={`mb-2 flex w-full items-center gap-3 rounded-[8px] px-3 py-2 text-left text-[13px] ${
                  project.id === selectedProject?.id ? 'bg-[#FFF7F1] text-[#B85412]' : 'bg-[#F7F8FE] text-[#13265C]'
                }`}
              >
                <Building2 className="h-4 w-4" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{String(project.name)}</span>
                  <span className="block truncate text-[12px] text-[#7A84AB]">{String(project.location ?? 'Location not set')}</span>
                </span>
              </button>
            ))}
            {!projects.length ? (
              <p className="rounded-[8px] bg-[#F7F8FE] px-3 py-3 text-[13px] text-[#596498]">
                No property project found.
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => {
              setShowCreate(true)
              setOpen(false)
            }}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-[8px] bg-[#13265C] px-3 py-2 text-[13px] font-semibold text-white"
          >
            <Upload className="h-4 w-4" />
            Add New Property
          </button>
          </div>
        ) : null}
      </div>

      <div className="flex min-h-[48px] min-w-0 flex-wrap items-center gap-2 rounded-full border border-[#E5EAF6] bg-white px-4 shadow-[0_14px_26px_rgba(19,38,92,0.05)]">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#596498]">
          Status
        </span>
        {Object.entries(headerCounts).map(([status, count]) => (
          <span key={status} className="flex items-center gap-2 whitespace-nowrap text-[12px] font-semibold text-[#13265C]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusColor(status) }} />
            {titleCase(status)} {count}
          </span>
        ))}
      </div>
    </div>
    {showCreate ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#13265C]/35 px-4 py-6 backdrop-blur-sm">
        <div className="grid max-h-[92vh] w-full max-w-[1040px] overflow-hidden rounded-[14px] bg-white shadow-[0_24px_80px_rgba(19,38,92,0.28)] lg:grid-cols-[390px_minmax(0,1fr)]">
          <section className="border-b border-[#EEF1FA] p-5 lg:border-b-0 lg:border-r">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[20px] font-bold text-[#13265C]">Add Property Map</h2>
                <p className="mt-1 text-[13px] leading-6 text-[#596498]">
                  Upload an SVG with plot IDs. Plots and floors will be created automatically.
                </p>
              </div>
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-full bg-[#F5F7FF] p-2 text-[#596498]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <a
              href="https://chatgpt.com/g/g-6a15e26990048191a476fc329df95eaa-saralkaro-property-svg"
              target="_blank"
              rel="noreferrer"
              className="mt-5 flex items-center justify-between rounded-[10px] border border-[#F1C3AA] bg-[#FFF7F1] px-4 py-3 text-[13px] font-semibold text-[#B85412]"
            >
              Generate SVG of your map
              <ExternalLink className="h-4 w-4" />
            </a>

            <div className="mt-5 grid gap-3">
              <label className="grid gap-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#596498]">
                Property name
                <input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Green Valley Plotting" className={fieldInputClass} />
              </label>
              <label className="grid gap-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#596498]">
                Location
                <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="City, sector, address" className={fieldInputClass} />
              </label>
              <label className="grid gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#596498]">
                SVG file
                <input type="file" accept=".svg,image/svg+xml" onChange={handleFile} className="rounded-[8px] border border-dashed border-[#C9D2EA] bg-[#F7F8FE] px-3 py-3 text-[12px] normal-case tracking-normal text-[#596498]" />
              </label>
              <label className="grid gap-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#596498]">
                Paste SVG
                <textarea value={svg} onChange={(event) => setSvg(event.target.value)} placeholder="<svg ...>" rows={7} className={`${fieldInputClass} resize-none font-mono text-[12px]`} />
              </label>
              {error ? <p className="rounded-[8px] bg-[#FFF7F1] px-3 py-2 text-[12px] font-medium text-[#B85412]">{error}</p> : null}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="rounded-[8px] border border-[#DDE4F3] px-3 py-3 text-[13px] font-semibold text-[#13265C]">
                  Cancel
                </button>
                <button type="button" onClick={handleCreate} disabled={saving} className="rounded-[8px] bg-[#B85412] px-3 py-3 text-[13px] font-semibold text-white disabled:opacity-60">
                  Create Property
                </button>
              </div>
            </div>
          </section>

          <section className="min-h-[520px] overflow-auto bg-[#F3F7FF] p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[15px] font-bold text-[#13265C]">SVG Preview</h3>
              <span className="text-[12px] font-medium text-[#596498]">
                {svg.trim() ? 'Ready to review' : 'Upload or paste SVG'}
              </span>
            </div>
            <div className="flex min-h-[460px] items-center justify-center overflow-auto rounded-[12px] border border-[#E1E7F5] bg-white p-4">
              {svg.trim() ? (
                <div
                  className="[&_svg]:h-auto [&_svg]:max-h-[620px] [&_svg]:w-full [&_svg]:max-w-[700px]"
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
              ) : (
                <div className="text-center text-[#596498]">
                  <Upload className="mx-auto h-10 w-10 text-[#AAB3CC]" />
                  <p className="mt-3 text-[14px] font-medium">SVG preview will appear here.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    ) : null}
    </>
  )
}
