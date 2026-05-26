import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { SidebarItem } from './AppSidebar'

type MobileBottomNavProps = {
  items: SidebarItem[]
  activeItemId: string
  onSelectItem: (id: string) => void
}

export function MobileBottomNav({ items, activeItemId, onSelectItem }: MobileBottomNavProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollState = () => {
    const node = scrollRef.current
    if (!node) return

    const maxScrollLeft = node.scrollWidth - node.clientWidth
    setCanScrollLeft(node.scrollLeft > 4)
    setCanScrollRight(node.scrollLeft < maxScrollLeft - 4)
  }

  useEffect(() => {
    updateScrollState()

    const handleResize = () => updateScrollState()
    window.addEventListener('resize', handleResize)

    return () => window.removeEventListener('resize', handleResize)
  }, [items.length])

  const scrollByAmount = (direction: 'left' | 'right') => {
    const node = scrollRef.current
    if (!node) return

    node.scrollBy({
      left: direction === 'left' ? -180 : 180,
      behavior: 'smooth',
    })
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#F1C3AA] bg-white/92 px-3 py-3 backdrop-blur md:hidden">
      {canScrollLeft ? (
        <div className="absolute inset-y-0 left-0 flex items-center pl-1">
          <button
            type="button"
            onClick={() => scrollByAmount('left')}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-[#8B94BA] shadow-[0_6px_18px_rgba(19,38,92,0.08)]"
            aria-label="Scroll navigation left"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.2} />
          </button>
        </div>
      ) : null}

      {canScrollRight ? (
        <div className="absolute inset-y-0 right-0 flex items-center pr-1">
          <button
            type="button"
            onClick={() => scrollByAmount('right')}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-[#8B94BA] shadow-[0_6px_18px_rgba(19,38,92,0.08)]"
            aria-label="Scroll navigation right"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2.2} />
          </button>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        onScroll={updateScrollState}
        className="overflow-x-auto px-8 scrollbar-hide"
      >
        <div className="flex min-w-max gap-2 pr-3">
          {items.map((item) => {
            const Icon = item.icon
            const isActive = item.id === activeItemId

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectItem(item.id)}
                className={`flex min-w-[84px] shrink-0 flex-col items-center justify-center gap-1 rounded-[18px] px-3 py-2.5 text-center transition ${
                  isActive
                    ? 'bg-[#FF6429] text-white shadow-[0_12px_24px_rgba(255,100,41,0.22)]'
                    : 'bg-[#F7F8FE] text-[#596498]'
                }`}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                <span className="text-[11px] font-medium leading-4 whitespace-nowrap">{item.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
