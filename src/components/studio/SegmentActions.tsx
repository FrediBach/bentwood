import * as ContextMenu from '@radix-ui/react-context-menu'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ArrowDown, ArrowUp, Ellipsis, Minus, RotateCcw, Trash2, Waves } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Segment } from '../../lib/types'

type SegmentActionProps = {
  segment: Segment
  index: number
  count: number
  onSelect: (id: string) => void
  onReorder: (id: string, targetIndex: number) => void
  onRemove: (id: string) => void
  onConvert: (id: string) => void
  onReverse: (id: string) => void
}

function selectMenuSegment({ segment, onSelect }: SegmentActionProps) {
  // Commit any pending dimension edit before changing the segment it belongs to.
  if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur()
  onSelect(segment.id)
}

function SegmentMenuItems({
  kind,
  segment,
  index,
  count,
  onReorder,
  onRemove,
  onConvert,
  onReverse,
}: SegmentActionProps & { kind: 'context' | 'dropdown' }) {
  const Menu = kind === 'context' ? ContextMenu : DropdownMenu
  return (
    <>
      <Menu.Item className="segment-actions-item" onSelect={() => onConvert(segment.id)}>
        {segment.type === 'arc' ? <Minus size={15} /> : <Waves size={15} />}
        {segment.type === 'arc' ? 'Convert to straight' : 'Convert to curve'}
      </Menu.Item>
      {segment.type === 'arc' && (
        <Menu.Item className="segment-actions-item" onSelect={() => onReverse(segment.id)}>
          <RotateCcw size={15} />
          Reverse curve direction
        </Menu.Item>
      )}
      <Menu.Separator className="segment-actions-separator" />
      <Menu.Item
        className="segment-actions-item"
        disabled={index === 0}
        onSelect={() => onReorder(segment.id, index - 1)}
      >
        <ArrowUp size={15} />
        Move up
      </Menu.Item>
      <Menu.Item
        className="segment-actions-item"
        disabled={index === count - 1}
        onSelect={() => onReorder(segment.id, index + 1)}
      >
        <ArrowDown size={15} />
        Move down
      </Menu.Item>
      <Menu.Separator className="segment-actions-separator" />
      <Menu.Item
        className="segment-actions-item destructive"
        disabled={count === 1}
        onSelect={() => onRemove(segment.id)}
      >
        <Trash2 size={15} />
        Delete segment
      </Menu.Item>
    </>
  )
}

export function SegmentContextMenu({
  children,
  ...props
}: SegmentActionProps & { children: ReactNode }) {
  return (
    <ContextMenu.Root onOpenChange={(open) => open && selectMenuSegment(props)}>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className="segment-actions-menu"
          aria-label={`Segment ${props.index + 1} actions`}
          collisionPadding={8}
        >
          <SegmentMenuItems kind="context" {...props} />
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}

export function SegmentActionsMenu(props: SegmentActionProps) {
  return (
    <DropdownMenu.Root onOpenChange={(open) => open && selectMenuSegment(props)}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="segment-actions-trigger"
          aria-label={`Segment ${props.index + 1} actions`}
        >
          <Ellipsis size={16} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="segment-actions-menu"
          aria-label={`Segment ${props.index + 1} actions`}
          align="end"
          sideOffset={5}
          collisionPadding={8}
        >
          <SegmentMenuItems kind="dropdown" {...props} />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
