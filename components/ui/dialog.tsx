import * as React from "react"
import { cn } from "@/lib/utils"

interface DialogProps {
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

interface DialogContextValue {
  titleId: string
  descriptionId: string
}

const DialogContext = React.createContext<DialogContextValue | null>(null)

const Dialog = ({ open, onOpenChange, children }: DialogProps) => {
  const titleId = React.useId()
  const descriptionId = React.useId()
  const containerRef = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLElement | null>(null)
  /** Only focus first control when dialog opens — not when parent re-renders with a new onOpenChange. */
  const wasOpenRef = React.useRef(false)

  // Capture the currently focused element before the dialog opens so focus
  // can be returned to it when the dialog closes.
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

  // Focus trap; initial focus only on open transition (avoid stealing focus on every parent re-render)
  React.useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      return
    }
    if (!containerRef.current) return

    const container = containerRef.current
    const justOpened = !wasOpenRef.current
    wasOpenRef.current = true

    if (justOpened) {
      const focusableElements = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
      )
      focusableElements[0]?.focus()
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
    <DialogContext.Provider value={{ titleId, descriptionId }}>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
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
          className="relative z-50 w-full max-w-lg mx-4 animate-in"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </DialogContext.Provider>
  )
}

const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "bg-background rounded-xl shadow-xl border p-6 max-h-[90vh] overflow-y-auto",
      className
    )}
    {...props}
  >
    {children}
  </div>
))
DialogContent.displayName = "DialogContent"

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left mb-5",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => {
  const context = React.useContext(DialogContext)
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
DialogTitle.displayName = "DialogTitle"

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  const context = React.useContext(DialogContext)
  return (
    <p
      ref={ref}
      id={context?.descriptionId}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
})
DialogDescription.displayName = "DialogDescription"

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription }
