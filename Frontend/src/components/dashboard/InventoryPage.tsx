import { useMemo, useState, type MouseEvent } from 'react'
import {
  Box,
  ChevronDown,
  Copy,
  MapPinned,
  Minus,
  Printer,
  ScanSearch,
  Search,
  SquareStack,
  ZoomIn,
} from 'lucide-react'
import { createInventoryEntity, updateInventoryEntity } from '../../lib/workspaceApi'

type InventoryRecord = Record<string, string | number | boolean | null | undefined>

type InventoryData = {
  counts: Record<string, number>
  projects?: InventoryRecord[]
  map?: Record<string, unknown> & { map_data?: { svg?: string; viewBox?: string } }
  mapElements?: InventoryRecord[]
  floors?: InventoryRecord[]
  units: InventoryRecord[]
}

const statusColors: Record<string, string> = {
  available: '#8bc34a',
  booked: '#ffc420',
  sold: '#ef4444',
  hold: '#f59e0b',
  reserved: '#60a5fa',
  blocked: '#9ca3af',
}

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

export function InventoryPage({ data, onRefresh }: { data?: InventoryData; onRefresh?: () => void }) {
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [isTableView, setIsTableView] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('plot')
  const [isSaving, setIsSaving] = useState(false)

  const mapElements = data?.mapElements ?? []
  const selectedElement = mapElements.find((element) => element.element_id === selectedCode)
  const selectedUnit = data?.units.find((unit) => unit.id === selectedElement?.inventory_entity_id)
    ?? data?.units.find((unit) => unit.code === selectedCode)
    ?? null
  const selectedFloors = data?.floors?.filter((floor) => floor.parentCode === selectedUnit?.code) ?? []

  const projectId = typeof data?.projects?.[0]?.id === 'number' ? data.projects[0].id : undefined
  const selectedParentId = typeof selectedUnit?.id === 'number' ? selectedUnit.id : undefined

  const unitCounts = {
    available: data?.counts.available ?? 0,
    booked: data?.counts.booked ?? 0,
    sold: data?.counts.sold ?? 0,
    hold: data?.counts.hold ?? 0,
  }

  const svgMarkup = useMemo(() => {
    const rawSvg = data?.map?.map_data?.svg
    if (!rawSvg) return ''
    return recolorSvg(rawSvg, mapElements, selectedCode)
  }, [data?.map?.map_data?.svg, mapElements, selectedCode])

  const handleMapClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as SVGElement
    const id = target.id
    const element = mapElements.find((item) => item.element_id === id)
    if (element) {
      setSelectedCode(String(element.element_id))
      setIsTableView(false)
    }
  }

  const handleCreateProperty = async () => {
    if (!projectId || !newCode.trim() || !newName.trim()) return
    setIsSaving(true)
    try {
      await createInventoryEntity({
        project_id: projectId,
        parent_id: newType === 'floor' ? selectedParentId : undefined,
        entity_type: newType,
        entity_code: newCode,
        name: newName,
        inventory_status: 'available',
        lifecycle_stage: 'active_sales',
        level_no: newType === 'floor' ? 2 : 1,
        path: selectedUnit ? `${selectedUnit.path}/${newCode}` : `GVP/${newCode}`,
        sort_order: 99,
        dimensions: { saleable_area: 1000, measurement_unit: newType === 'plot' ? 'sqyd' : 'sqft' },
        pricing: { final_price: 5000000, price_per_sqft: 5000, currency: 'INR' },
        details: { display_note: 'Added from inventory Excel view' },
      })
      setNewCode('')
      setNewName('')
      onRefresh?.()
    } finally {
      setIsSaving(false)
    }
  }

  const handleMarkStatus = async (nextStatus: string) => {
    const id = selectedUnit?.id
    if (typeof id !== 'number') return
    await updateInventoryEntity(id, { inventory_status: nextStatus })
    onRefresh?.()
  }

  return (
    <div className="mx-auto max-w-[1240px]">
      <div className="grid gap-0 rounded-[28px] border border-[#F1C3AA] bg-white/40 shadow-[0_18px_42px_rgba(19,38,92,0.05)] xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="relative min-h-[840px] overflow-hidden rounded-l-[28px] bg-[#F3F7FF] p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="rounded-[22px] bg-white px-5 py-4 shadow-[0_14px_30px_rgba(19,38,92,0.08)]">
              <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#596498]">
                Status Legend
              </p>
              <div className="mt-4 grid gap-3 text-[14px] text-[#13265C] sm:grid-cols-2">
                {Object.entries(unitCounts).map(([status, count]) => (
                  <div key={status} className="flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: statusColor(status) }} />
                    <span>
                      {titleCase(status)} ({count})
                    </span>
                  </div>
                ))}
              </div>
            </div>

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

          {isTableView ? (
            <div className="mt-5 overflow-hidden rounded-[18px] bg-white shadow-[0_18px_38px_rgba(19,38,92,0.08)]">
              <div className="grid gap-3 border-b border-[#EEF1FA] p-4 lg:grid-cols-[120px_minmax(0,1fr)_120px_120px]">
                <input
                  value={newCode}
                  onChange={(event) => setNewCode(event.target.value)}
                  placeholder="Code"
                  className="rounded-[8px] border border-[#EEF1FA] px-3 py-2 text-[13px] outline-none"
                />
                <input
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="Property name"
                  className="rounded-[8px] border border-[#EEF1FA] px-3 py-2 text-[13px] outline-none"
                />
                <select
                  value={newType}
                  onChange={(event) => setNewType(event.target.value)}
                  className="rounded-[8px] border border-[#EEF1FA] px-3 py-2 text-[13px] outline-none"
                >
                  <option value="plot">Plot</option>
                  <option value="floor">Floor</option>
                  <option value="flat">Flat</option>
                  <option value="shop">Shop</option>
                </select>
                <button
                  type="button"
                  onClick={handleCreateProperty}
                  className="rounded-[8px] bg-[#B85412] px-3 py-2 text-[13px] font-semibold text-white"
                >
                  Add
                </button>
              </div>
              <div className="max-h-[640px] overflow-auto">
                <table className="w-full min-w-[860px] border-collapse text-left text-[13px]">
                  <thead className="sticky top-0 bg-[#F5F7FF] text-[#596498]">
                    <tr>
                      {['Code', 'Name', 'Type', 'Status', 'Path', 'Area', 'Price', 'Action'].map((head) => (
                        <th key={head} className="px-4 py-3 font-semibold">
                          {head}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEF1FA]">
                    {(data?.units ?? []).map((unit) => (
                      <tr key={String(unit.id)} className="text-[#13265C]">
                        <td className="px-4 py-3 font-semibold">{String(unit.code)}</td>
                        <td className="px-4 py-3">{String(unit.name)}</td>
                        <td className="px-4 py-3">{titleCase(unit.type)}</td>
                        <td className="px-4 py-3">{titleCase(unit.status)}</td>
                        <td className="px-4 py-3">{String(unit.path ?? '')}</td>
                        <td className="px-4 py-3">{String(unit.area ?? 0)}</td>
                        <td className="px-4 py-3">{formatCurrency(unit.price)}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCode(String(unit.code))
                              setIsTableView(false)
                            }}
                            className="rounded-[8px] bg-[#F5F7FF] px-3 py-1 font-semibold"
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex justify-center">
              {svgMarkup ? (
                <div
                  className="[&_svg]:h-[720px] [&_svg]:w-full [&_svg]:max-w-[980px] [&_.plots_rect]:cursor-pointer [&_rect[id^='plot_']]:cursor-pointer [&_rect[id^='plot_']]:transition-opacity [&_rect[id^='plot_']]:hover:opacity-80"
                  onClick={handleMapClick}
                  dangerouslySetInnerHTML={{ __html: svgMarkup }}
                />
              ) : (
                <div className="flex h-[620px] items-center justify-center rounded-[18px] bg-white px-8 text-center text-[#596498]">
                  No published map found for this project.
                </div>
              )}
            </div>
          )}

          <div className="absolute bottom-5 left-1/2 -translate-x-1/2">
            <div className="flex items-center gap-4 rounded-full bg-white px-6 py-4 shadow-[0_18px_38px_rgba(19,38,92,0.12)]">
              <button type="button" className="text-[#13265C]">
                <ZoomIn className="h-5 w-5" strokeWidth={2} />
              </button>
              <button type="button" className="text-[#13265C]">
                <Search className="h-5 w-5" strokeWidth={2} />
              </button>
              <div className="h-6 w-px bg-[#EBC2AE]" />
              <button type="button" onClick={() => setIsTableView(true)} className="text-[#13265C]">
                <SquareStack className="h-5 w-5" strokeWidth={2} />
              </button>
              <button type="button" className="text-[#13265C]">
                <Minus className="h-5 w-5" strokeWidth={2} />
              </button>
              <div className="h-6 w-px bg-[#EBC2AE]" />
              <button type="button" onClick={() => setIsTableView(false)} className="text-[#13265C]">
                <ScanSearch className="h-5 w-5" strokeWidth={2} />
              </button>
              <button type="button" onClick={() => window.print()} className="text-[#13265C]">
                <Printer className="h-5 w-5" strokeWidth={2} />
              </button>
            </div>
          </div>
        </section>

        <aside className="min-h-[840px] rounded-r-[28px] bg-white px-7 py-8">
          {selectedUnit ? (
            <div>
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#F4F6FF] text-[#B4B9CF]">
                <Copy className="h-9 w-9" strokeWidth={2} />
              </div>
              <h2 className="mt-6 text-center text-[28px] font-bold tracking-[-0.04em] text-[#13265C]">
                {String(selectedUnit.name)}
              </h2>
              <p className="mt-2 text-center text-[14px] text-[#596498]">
                {String(selectedUnit.code)} | {titleCase(selectedUnit.type)}
              </p>
              <div className="mt-6 rounded-[18px] bg-[#F7F8FE] px-5 py-4 text-left">
                <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#596498]">
                  Property Detail
                </p>
                <div className="mt-4 space-y-3 text-[13px] text-[#596498]">
                  <p>Status: {titleCase(selectedUnit.status)}</p>
                  <p>Project: {String(selectedUnit.project ?? '')}</p>
                  <p>Area: {String(selectedUnit.area ?? 0)}</p>
                  <p>Price: {formatCurrency(selectedUnit.price)}</p>
                  <p>Path: {String(selectedUnit.path ?? '')}</p>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-2 border-t border-[#E8D1C3] pt-4">
                  <button
                    type="button"
                    onClick={() => handleMarkStatus('available')}
                    className="rounded-[8px] bg-[#EAFBF0] px-3 py-2 text-[12px] font-semibold text-[#136C2E]"
                  >
                    Available
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMarkStatus('hold')}
                    className="rounded-[8px] bg-[#FFF7D8] px-3 py-2 text-[12px] font-semibold text-[#8A6500]"
                  >
                    Hold
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMarkStatus('booked')}
                    className="rounded-[8px] bg-[#FFF7D8] px-3 py-2 text-[12px] font-semibold text-[#8A6500]"
                  >
                    Book
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMarkStatus('sold')}
                    className="rounded-[8px] bg-[#FDECEC] px-3 py-2 text-[12px] font-semibold text-[#B42318]"
                  >
                    Sold
                  </button>
                </div>
              </div>

              <section className="mt-5">
                <h3 className="text-[15px] font-semibold text-[#13265C]">Floors</h3>
                <div className="mt-3 space-y-2">
                  {selectedFloors.map((floor) => (
                    <button
                      key={String(floor.id)}
                      type="button"
                      className="w-full rounded-[8px] border border-[#EEF1FA] px-3 py-3 text-left text-[13px]"
                    >
                      <span className="font-semibold text-[#13265C]">{String(floor.name)}</span>
                      <span className="ml-2 text-[#596498]">{titleCase(floor.status)}</span>
                    </button>
                  ))}
                  {!selectedFloors.length ? (
                    <p className="rounded-[8px] bg-[#F7F8FE] px-3 py-3 text-[13px] text-[#596498]">
                      No floors under this property yet.
                    </p>
                  ) : null}
                </div>
              </section>

              <section className="mt-5 grid grid-cols-2 gap-2">
                {['Customer', 'Broker', 'Sales', 'Payments', 'Documents', 'Activity'].map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="rounded-[8px] bg-[#F5F7FF] px-3 py-3 text-[12px] font-semibold text-[#13265C]"
                  >
                    {item}
                  </button>
                ))}
              </section>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#F4F6FF] text-[#B4B9CF]">
                <Copy className="h-9 w-9" strokeWidth={2} />
              </div>
              <h2 className="mt-8 text-[24px] font-bold tracking-[-0.04em] text-[#13265C]">
                No Plot Selected
              </h2>
              <p className="mt-4 text-[15px] leading-8 text-[#596498]">
                Click a plot on the database-loaded SVG map to view floors, pricing, status, customer,
                broker, sales and payment actions.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

export function InventoryHeaderControl() {
  return (
    <button
      type="button"
      className="flex h-[48px] items-center gap-3 rounded-full border border-[#F1C3AA] bg-white px-5 text-[#13265C] shadow-[0_14px_26px_rgba(19,38,92,0.05)]"
    >
      <MapPinned className="h-[18px] w-[18px] text-[#B85412]" strokeWidth={2} />
      <span className="text-[14px] font-semibold">Green Valley Plotting</span>
      <ChevronDown className="h-[18px] w-[18px] text-[#596498]" strokeWidth={2} />
    </button>
  )
}
