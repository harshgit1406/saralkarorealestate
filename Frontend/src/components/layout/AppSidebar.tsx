import type { LucideIcon } from 'lucide-react'

export type SidebarItem = {
  id: string
  label: string
  icon: LucideIcon
}

type AppSidebarProps = {
  isOpen: boolean
  primaryItems: SidebarItem[]
  secondaryItems: SidebarItem[]
  activeItemId: string
  onSelectItem: (id: string) => void
  onToggle: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

function SidebarButton({
  item,
  isOpen,
  isActive,
  onClick,
}: {
  item: SidebarItem
  isOpen: boolean
  isActive?: boolean
  onClick?: () => void
}) {
  const Icon = item.icon

  return (
    <button
      type="button"
      onClick={onClick}
      title={!isOpen ? item.label : undefined}
      className={`group flex items-center overflow-hidden transition-[background-color,color,box-shadow,border-radius] duration-200 ease-out ${
        isOpen
          ? `h-10 w-full gap-3 rounded-[11px] px-3 ${
              isActive
                ? 'bg-[#FF6429] text-white shadow-[0_10px_20px_rgba(255,100,41,0.2)]'
                : 'text-[#596498] hover:bg-[#F3F5FE]'
            }`
          : `mx-auto justify-center ${
              isActive
                ? 'h-11 w-11 rounded-[10px] bg-[linear-gradient(180deg,#FF8A57_0%,#FF6429_58%,#EC5721_100%)] text-white shadow-[0_14px_24px_rgba(255,100,41,0.26),inset_0_1px_0_rgba(255,255,255,0.22)] ring-1 ring-[#F37A4A]/28'
                : 'h-10 w-10 rounded-[10px] text-[#596498] hover:bg-[#F3F5FE]'
            }`
      }`}
    >
      <span className={`flex shrink-0 items-center justify-center ${isOpen ? 'h-10 w-4' : 'h-10 w-10'}`}>
        <Icon
          className={`${
            isActive && !isOpen
              ? 'h-[17px] w-[17px] drop-shadow-[0_1px_1px_rgba(0,0,0,0.06)]'
              : 'h-[18px] w-[18px]'
          }`}
          strokeWidth={2}
        />
      </span>
      <span
        className={`overflow-hidden whitespace-nowrap text-[14px] font-medium transition-[max-width,opacity,margin,transform] duration-200 ease-out ${
          isOpen ? 'ml-2.5 max-w-[140px] translate-x-0 opacity-100' : 'ml-0 max-w-0 -translate-x-1 opacity-0'
        }`}
      >
        <span className="block">{item.label}</span>
      </span>
    </button>
  )
}

export function AppSidebar({
  isOpen,
  primaryItems,
  secondaryItems,
  activeItemId,
  onSelectItem,
  onToggle,
  onMouseEnter,
  onMouseLeave,
}: AppSidebarProps) {
  return (
    <div
      className={`hidden shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:block ${
        isOpen ? 'w-[258px]' : 'w-[76px]'
      }`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <aside
        className={`fixed inset-y-0 left-0 border-r border-[#F1C3AA] bg-[#FCFBFF] transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:flex lg:flex-col ${
          isOpen ? 'w-[258px]' : 'w-[76px]'
        }`}
      >
        <div
          className={`flex min-h-[98px] items-center transition-[padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            isOpen ? 'px-5' : 'justify-center px-3'
          }`}
        >
          <button
            type="button"
            onClick={onToggle}
            className={`flex items-center overflow-hidden rounded-[16px] transition-[gap] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isOpen ? 'gap-3' : 'justify-center gap-0'
            }`}
            aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <span className="flex h-10 w-10 items-center justify-center">
              <img
                src="/client.svg"
                alt=""
                aria-hidden="true"
                className="h-8 w-8 object-contain"
              />
            </span>
            <div
              className={`origin-left overflow-hidden text-left leading-tight transition-[max-width,opacity,transform] duration-200 ease-out ${
                isOpen ? 'max-w-[170px] translate-x-0 opacity-100' : 'max-w-0 -translate-x-1 opacity-0'
              }`}
            >
              <div className="min-w-[170px]">
                <p className="text-[15px] font-bold tracking-[-0.04em] text-[#13265C]">
                  BLF Developers
                </p>
                <p className="mt-1 text-[12px] font-medium text-[#596498]">
                  Powered by Saral RealEstate ERP
                </p>
              </div>
            </div>
          </button>
        </div>

        <nav
          className={`flex flex-1 flex-col overflow-hidden transition-[padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            isOpen ? 'px-5 pb-6' : 'px-3 pb-6'
          }`}
        >
          <div className="space-y-2">
            {primaryItems.map((item) => (
              <SidebarButton
                key={item.id}
                item={item}
                isOpen={isOpen}
                isActive={item.id === activeItemId}
                onClick={() => onSelectItem(item.id)}
              />
            ))}
          </div>

          <div className={`mt-auto w-full ${isOpen ? 'pt-10' : 'pt-8'}`}>
            <div className={`mb-5 h-px bg-[#F1C3AA] ${isOpen ? 'mx-0' : 'mx-auto w-9'}`} />
            <div className="space-y-2">
              {secondaryItems.map((item) => (
                <SidebarButton
                  key={item.id}
                  item={item}
                  isOpen={isOpen}
                  onClick={() => onSelectItem(item.id)}
                />
              ))}
            </div>
          </div>
        </nav>
      </aside>
    </div>
  )
}
