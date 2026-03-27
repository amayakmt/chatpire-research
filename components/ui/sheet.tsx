"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"

// TODO: add side prop (top, right, bottom, left)

interface SheetProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

const FOCUSABLE_SELECTORS = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

interface SheetContextValue {
  titleId: string
  descriptionId: string
}

const SheetContext = React.createContext<SheetContextValue | null>(null)

const Sheet = ({ open, onOpenChange, children }: SheetProps) => {
  const titleId = React.useId()
  const descriptionId = React.useId()
  const containerRef = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLElement | null>(null)

  // Capture the currently focused element before the sheet opens so focus
  // can be returned to it when the sheet closes.
  React.useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement
    } else {
      triggerRef.current?.focus()
    }
  }, [open])

  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [open])

  // Focus trap and initial focus
  React.useEffect(() => {
    if (!open || !containerRef.current) return

    const container = containerRef.current
    const focusableElements = Array.from(
      container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
    )

    if (focusableElements.length > 0) {
      focusableElements[0].focus()
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange?.(false)
        return
      }
      if (e.key !== 'Tab') return

      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
      )
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onOpenChange])

  if (!open) return null

  return (
    <SheetContext.Provider value={{ titleId, descriptionId }}>
      <div
        className="fixed inset-0 z-50"
        onClick={() => onOpenChange?.(false)}
      >
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          onClick={() => onOpenChange?.(false)}
        />
        <div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          className="fixed right-0 top-0 h-full w-full sm:w-[540px] bg-background border-l shadow-xl flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </SheetContext.Provider>
  )
}

const SheetContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    onClose?: () => void
  }
>(({ className, children, onClose, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex-1 overflow-y-auto p-6",
      className
    )}
    {...props}
  >
    {onClose && (
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-lg p-1 opacity-70 ring-offset-background transition-all hover:opacity-100 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
        aria-label="Close"
      >
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </button>
    )}
    {children}
  </div>
))
SheetContent.displayName = "SheetContent"

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-2 mb-6",
      className
    )}
    {...props}
  />
)
SheetHeader.displayName = "SheetHeader"

const SheetTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => {
  const context = React.useContext(SheetContext)
  return (
    <h2
      ref={ref}
      id={context?.titleId}
      className={cn(
        "text-lg font-semibold leading-none tracking-tight",
        className
      )}
      {...props}
    />
  )
})
SheetTitle.displayName = "SheetTitle"

const SheetDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  const context = React.useContext(SheetContext)
  return (
    <p
      ref={ref}
      id={context?.descriptionId}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
})
SheetDescription.displayName = "SheetDescription"

export { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription }
