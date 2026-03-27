import * as React from "react"
import { cn } from "@/lib/utils"

export interface SliderProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  value?: number
  onValueChange?: (value: number) => void
  min?: number
  max?: number
  step?: number
  "aria-label"?: string
  "aria-valuetext"?: string
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, value, onValueChange, min = 0, max = 100, step = 0.1, "aria-label": ariaLabel, "aria-valuetext": ariaValuetext, ...props }, ref) => {
    return (
      <input
        type="range"
        className={cn(
          "w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer",
          className
        )}
        ref={ref}
        value={value}
        onChange={(e) => onValueChange?.(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        aria-label={ariaLabel}
        aria-valuetext={ariaValuetext}
        {...props}
      />
    )
  }
)
Slider.displayName = "Slider"

export { Slider }
