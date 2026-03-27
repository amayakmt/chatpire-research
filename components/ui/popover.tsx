"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"

interface PopoverProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

const PopoverContext = React.createContext<{
  open: boolean
  setOpen: (open: boolean) => void
  triggerRef: React.RefObject<HTMLElement>
} | null>(null)

const Popover = ({ open, onOpenChange, children }: PopoverProps) => {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLElement>(null)
  const isControlled = open !== undefined

  const isOpen = isControlled ? open : internalOpen
  const setIsOpen = isControlled ? onOpenChange || (() => {}) : setInternalOpen

  React.useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node) &&
        !(event.target as Element)?.closest('[data-popover-content]')
      ) {
        setIsOpen(false)
        onOpenChange?.(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, setIsOpen, onOpenChange])

  return (
    <PopoverContext.Provider value={{ open: isOpen, setOpen: setIsOpen, triggerRef }}>
      {children}
    </PopoverContext.Provider>
  )
}

const PopoverTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean
  }
>(({ className, children, onClick, asChild, ...props }, ref) => {
  const context = React.useContext(PopoverContext)
  if (!context) throw new Error('PopoverTrigger must be used within Popover')

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    context.setOpen(!context.open)
    onClick?.(e)
  }

  // If asChild is true, clone the child element and add handlers
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, {
      ref: (node: HTMLElement | null) => {
        if (typeof ref === 'function') ref(node as any)
        else if (ref) ref.current = node as any
        if (context.triggerRef) (context.triggerRef as React.MutableRefObject<HTMLElement | null>).current = node
      },
      'aria-expanded': context.open,
      'aria-haspopup': 'dialog',
      onClick: (e: React.MouseEvent) => {
        handleClick(e as any)
        if ((children as any).props?.onClick) {
          (children as any).props.onClick(e)
        }
      },
    })
  }

  return (
    <button
      ref={(node) => {
        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node
        if (context.triggerRef) (context.triggerRef as React.MutableRefObject<HTMLElement | null>).current = node
      }}
      className={cn(className)}
      onClick={handleClick}
      aria-expanded={context.open}
      aria-haspopup="dialog"
      {...props}
    >
      {children}
    </button>
  )
})
PopoverTrigger.displayName = "PopoverTrigger"

const PopoverContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    align?: "start" | "center" | "end"
    side?: "top" | "bottom" | "left" | "right"
  }
>(({ className, children, align = "start", side = "bottom", ...props }, ref) => {
  const context = React.useContext(PopoverContext)

  const [position, setPosition] = React.useState({ top: 0, left: 0 })

  // TODO: add viewport boundary detection to prevent popover from overflowing screen edges

  React.useEffect(() => {
    if (!context?.triggerRef.current) return

    const updatePosition = () => {
      if (!context.triggerRef.current) return
      const rect = context.triggerRef.current.getBoundingClientRect()

      let top = rect.bottom + 8
      let left = rect.left

      if (side === 'top') {
        top = rect.top - 8
      } else if (side === 'bottom') {
        top = rect.bottom + 8
      }

      if (align === 'end') {
        left = rect.right
      } else if (align === 'center') {
        left = rect.left + rect.width / 2
      }

      setPosition({ top, left })
    }

    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)

    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [context?.open, align, side])

  // Escape key handler to close the popover
  React.useEffect(() => {
    if (!context?.open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        context.setOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [context?.open, context?.setOpen])

  if (!context) return null
  if (!context.open) return null

  const content = (
    <div
      ref={ref}
      data-popover-content
      className={cn(
        "fixed z-[100] min-w-[8rem] overflow-hidden rounded-md border bg-popover p-4 text-popover-foreground shadow-md",
        className
      )}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        transform: align === 'end' ? 'translateX(-100%)' : align === 'center' ? 'translateX(-50%)' : undefined,
      }}
      {...props}
    >
      {children}
    </div>
  )

  if (typeof document !== 'undefined') {
    return createPortal(content, document.body)
  }

  return content
})
PopoverContent.displayName = "PopoverContent"

export { Popover, PopoverTrigger, PopoverContent }
