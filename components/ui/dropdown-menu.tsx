import * as React from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

interface DropdownMenuProps {
  children: React.ReactNode
  trigger: React.ReactNode
}

interface DropdownMenuContextType {
  closeMenu: () => void
}

const DropdownMenuContext = React.createContext<DropdownMenuContextType | null>(null)

export function DropdownMenu({ children, trigger }: DropdownMenuProps) {
  const [open, setOpen] = React.useState(false)
  const [menuPosition, setMenuPosition] = React.useState({ top: 0, left: 0, right: 0 })
  const triggerRef = React.useRef<HTMLDivElement>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      // Update position when menu opens
      const updatePosition = () => {
        if (triggerRef.current) {
          const rect = triggerRef.current.getBoundingClientRect()
          setMenuPosition({
            top: rect.bottom + 4,
            left: rect.right - 8, // Align to right edge of trigger
            right: 0,
          })
        }
      }
      updatePosition()

      // Update position on scroll/resize
      const handleScroll = () => updatePosition()
      const handleResize = () => updatePosition()

      window.addEventListener('scroll', handleScroll, true)
      window.addEventListener('resize', handleResize)

      return () => {
        window.removeEventListener('scroll', handleScroll, true)
        window.removeEventListener('resize', handleResize)
      }
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  // Keyboard navigation for the menu
  React.useEffect(() => {
    if (!open || !menuRef.current) return

    const menu = menuRef.current

    const handleKeyDown = (e: KeyboardEvent) => {
      const items = Array.from(
        menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not([data-disabled])')
      )
      if (items.length === 0) return

      const currentIndex = items.indexOf(document.activeElement as HTMLElement)

      if (e.key === 'Escape') {
        setOpen(false)
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0
        items[nextIndex].focus()
        return
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1
        items[prevIndex].focus()
        return
      }

      if (e.key === 'Enter' || e.key === ' ') {
        const focused = document.activeElement as HTMLElement
        if (focused && menu.contains(focused)) {
          e.preventDefault()
          focused.click()
        }
        return
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setOpen(!open)
  }

  const closeMenu = () => {
    setOpen(false)
  }

  // Clone the trigger element and add onClick handler plus ARIA attributes
  const triggerWithClick = React.isValidElement(trigger)
    ? React.cloneElement(trigger as React.ReactElement<any>, {
        onClick: handleTriggerClick,
        'aria-haspopup': 'menu',
        'aria-expanded': open,
      })
    : <div onClick={handleTriggerClick} aria-haspopup="menu" aria-expanded={open}>{trigger}</div>

  return (
    <DropdownMenuContext.Provider value={{ closeMenu }}>
      <div className="relative" ref={triggerRef}>
        {triggerWithClick}
        {open && typeof document !== 'undefined' && createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-[100] min-w-[10rem] overflow-hidden rounded-xl border bg-popover/95 backdrop-blur-sm p-1 text-popover-foreground shadow-lg"
            style={{
              top: `${menuPosition.top}px`,
              left: `${menuPosition.left}px`,
              transform: 'translateX(-100%)', // Align to right edge
              animation: 'fadeInScale 0.15s ease-out',
            }}
          >
            {children}
          </div>,
          document.body
        )}
      </div>
    </DropdownMenuContext.Provider>
  )
}

export function DropdownMenuItem({
  children,
  onClick,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const context = React.useContext(DropdownMenuContext)

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (onClick) {
      onClick(e)
    }
    // Close menu after item click
    if (context) {
      context.closeMenu()
    }
  }

  return (
    <div
      role="menuitem"
      tabIndex={-1}
      className={cn(
        'relative flex cursor-pointer select-none items-center rounded-lg px-2.5 py-2 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className
      )}
      onClick={handleClick}
      {...props}
    >
      {children}
    </div>
  )
}
