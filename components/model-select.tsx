'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ModelOption {
  id: string
  name: string
  description: string
  price?: string
  isNew?: boolean
  category?: 'pro' | 'flash'
  isPremium?: boolean
}

interface ModelSelectProps {
  value: string
  onChange: (value: string) => void
  options: ModelOption[]
  className?: string
  /** When true, the control is non-interactive (e.g. demo mode with a single fixed model). */
  disabled?: boolean
}

export function ModelSelect({ value, onChange, options, className, disabled = false }: ModelSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const selectRef = useRef<HTMLDivElement>(null)

  // Group options by category
  const proModels = options.filter((opt) => opt.category === 'pro')
  const flashModels = options.filter((opt) => opt.category === 'flash')

  // Find selected option
  const selectedOption = options.find((opt) => opt.id === value)

  useEffect(() => {
    if (disabled) setIsOpen(false)
  }, [disabled])

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [isOpen])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => {
        document.removeEventListener('keydown', handleEscape)
      }
    }
  }, [isOpen])

  const handleSelect = (optionId: string) => {
    if (disabled) return
    onChange(optionId)
    setIsOpen(false)
  }

  return (
    <div ref={selectRef} className={cn('relative', className)}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        aria-disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={cn(
          'w-full px-3 py-2 text-left',
          'bg-background border border-input rounded-lg',
          'shadow-sm hover:border-muted-foreground/50',
          'focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500',
          'transition-all duration-200',
          'flex items-center justify-between',
          'text-sm font-medium',
          disabled && 'opacity-70 cursor-not-allowed hover:border-input'
        )}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {selectedOption && (
            <>
              <span
                className={cn(
                  'truncate',
                  selectedOption.isPremium && 'text-purple-600 font-semibold'
                )}
              >
                {selectedOption.name}
              </span>
              {selectedOption.isNew && (
                <span className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded-md font-medium whitespace-nowrap">
                  NEW
                </span>
              )}
            </>
          )}
          {!selectedOption && (
            <span className="text-muted-foreground">Select a model</span>
          )}
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground flex-shrink-0 ml-2 transition-transform duration-200',
            !disabled && isOpen && 'transform rotate-180'
          )}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className={cn(
            'absolute z-50 w-full mt-1',
            'bg-popover border border-border rounded-xl shadow-xl',
            'max-h-96 overflow-y-auto'
          )}
          style={{
            animation: 'fadeInScale 0.2s ease-out',
          }}
        >
          {/* Pro Models Group */}
          {proModels.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2 bg-muted/50 border-b border-border/60 sticky top-0">
                Pro / Reasoning Models
              </div>
              {proModels.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleSelect(option.id)}
                  className={cn(
                    'w-full text-left px-3 py-2.5',
                    'hover:bg-accent transition-colors',
                    'flex items-center justify-between gap-2',
                    value === option.id && 'bg-purple-50 dark:bg-purple-950/30 hover:bg-purple-50 dark:hover:bg-purple-950/30'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'text-sm font-medium',
                          option.isPremium && 'text-purple-600',
                          value === option.id && 'font-semibold'
                        )}
                      >
                        {option.name}
                      </span>
                      {option.isNew && (
                        <span className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded-md font-medium whitespace-nowrap">
                          NEW
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {option.description}
                    </div>
                    {option.price && (
                      <div className="text-xs text-muted-foreground/70 mt-0.5">
                        {option.price}
                      </div>
                    )}
                  </div>
                  {value === option.id && (
                    <Check className="h-4 w-4 text-purple-600 flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Flash Models Group */}
          {flashModels.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2 bg-muted/50 border-b border-border/60 sticky top-0">
                Flash / Fast Models
              </div>
              {flashModels.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleSelect(option.id)}
                  className={cn(
                    'w-full text-left px-3 py-2.5',
                    'hover:bg-accent transition-colors',
                    'flex items-center justify-between gap-2',
                    value === option.id && 'bg-purple-50 dark:bg-purple-950/30 hover:bg-purple-50 dark:hover:bg-purple-950/30'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'text-sm font-medium',
                          option.isPremium && 'text-purple-600',
                          value === option.id && 'font-semibold'
                        )}
                      >
                        {option.name}
                      </span>
                      {option.isNew && (
                        <span className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded-md font-medium whitespace-nowrap">
                          NEW
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {option.description}
                    </div>
                    {option.price && (
                      <div className="text-xs text-muted-foreground/70 mt-0.5">
                        {option.price}
                      </div>
                    )}
                  </div>
                  {value === option.id && (
                    <Check className="h-4 w-4 text-purple-600 flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
