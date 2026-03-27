import * as React from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'

interface AlertDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  onConfirm: () => void
  confirmText?: string
  cancelText?: string
}

const FOCUSABLE_SELECTORS = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
}: AlertDialogProps) {
  const titleId = React.useId()
  const descriptionId = React.useId()
  const containerRef = React.useRef<HTMLDivElement>(null)
  const confirmButtonRef = React.useRef<HTMLButtonElement>(null)
  const triggerRef = React.useRef<HTMLElement | null>(null)

  // Capture the currently focused element before the dialog opens so focus
  // can be returned to it when the dialog closes.
  React.useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement
    } else {
      triggerRef.current?.focus()
    }
  }, [open])

  // Auto-focus the confirm (destructive) button when dialog opens
  React.useEffect(() => {
    if (!open) return

    const timeout = setTimeout(() => {
      confirmButtonRef.current?.focus()
    }, 0)

    return () => clearTimeout(timeout)
  }, [open])

  // Focus trap — Escape does NOT close alertdialog (requires explicit action)
  React.useEffect(() => {
    if (!open || !containerRef.current) return

    const container = containerRef.current

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent Escape from closing — alertdialog requires explicit user action
      if (e.key === 'Escape') {
        e.preventDefault()
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
  }, [open])

  if (!open) return null

  const handleConfirm = () => {
    onConfirm()
    onOpenChange(false)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div
        ref={containerRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative z-[100] w-full max-w-md mx-4 bg-background rounded-xl shadow-xl border p-6 animate-in"
      >
        <h2 id={titleId} className="text-lg font-semibold mb-2">{title}</h2>
        <p id={descriptionId} className="text-sm text-muted-foreground mb-6 leading-relaxed">{description}</p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {cancelText}
          </Button>
          <Button ref={confirmButtonRef} variant="destructive" onClick={handleConfirm}>
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  )
}
