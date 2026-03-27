import * as React from 'react'
import { cn } from '@/lib/utils'
import { X, CheckCircle2, AlertCircle } from 'lucide-react'

interface ToastProps {
  message: string
  variant?: 'default' | 'destructive'
  onClose: () => void
  duration?: number
}

export function Toast({ message, variant = 'default', onClose, duration = 5000 }: ToastProps) {
  React.useEffect(() => {
    const timer = setTimeout(() => {
      onClose()
    }, duration)

    return () => clearTimeout(timer)
  }, [duration, onClose])

  const isDestructive = variant === 'destructive'

  return (
    <div
      role={isDestructive ? 'alert' : 'status'}
      aria-live={isDestructive ? 'assertive' : 'polite'}
      aria-atomic="true"
      className={cn(
        'fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-xl border px-4 py-3 shadow-lg animate-in backdrop-blur-sm',
        isDestructive
          ? 'bg-destructive/95 text-destructive-foreground border-destructive/50'
          : 'bg-background/95 text-foreground border-border/50'
      )}
    >
      {isDestructive ? (
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
      ) : (
        <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" />
      )}
      <p className="text-sm font-medium">{message}</p>
      <button
        onClick={onClose}
        className="ml-auto rounded-lg p-1 hover:bg-black/10 focus:outline-none"
        aria-label="Close"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
