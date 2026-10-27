import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import type { ComponentProps, ReactNode } from 'react'
export const TooltipProvider = TooltipPrimitive.Provider
export function Tooltip({
  label,
  children,
  contentClassName = '',
  side,
  open,
  onOpenChange,
}: {
  label: ReactNode
  children: ReactNode
  contentClassName?: string
  side?: ComponentProps<typeof TooltipPrimitive.Content>['side']
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  return (
    <TooltipPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          className={`tooltip ${contentClassName}`}
          side={side}
          sideOffset={7}
          collisionPadding={12}
        >
          {label}
          <TooltipPrimitive.Arrow />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
