import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Minus, Waves } from 'lucide-react'
import { useRef, useState } from 'react'
import type { Segment } from '../../lib/types'
import { SegmentActionsMenu, SegmentContextMenu } from './SegmentActions'

type SegmentListProps = {
  segments: Segment[]
  selectedId: string | null
  onSelect: (id: string) => void
  onReorder: (id: string, targetIndex: number) => void
  onRemove: (id: string) => void
  onConvert: (id: string) => void
  onReverse: (id: string) => void
}

function SegmentLabel({ segment, index }: { segment: Segment; index: number }) {
  return (
    <>
      <span className="segment-number">{String(index + 1).padStart(2, '0')}</span>
      {segment.type === 'arc' ? <Waves size={16} /> : <Minus size={16} />}
      <span>{segment.type === 'arc' ? 'Curve' : 'Straight'}</span>
      <span className="segment-value">
        {segment.type === 'arc'
          ? `${Number(segment.angle.toFixed(2))}°`
          : `${Number(segment.length.toFixed(2))} mm`}
      </span>
    </>
  )
}

function SortableSegment({
  segment,
  index,
  count,
  selected,
  ...actions
}: Omit<SegmentListProps, 'segments' | 'selectedId'> & {
  segment: Segment
  index: number
  count: number
  selected: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: segment.id })
  const menuProps = { segment, index, count, ...actions }
  return (
    <SegmentContextMenu {...menuProps}>
      <div
        ref={setNodeRef}
        role="listitem"
        data-segment-id={segment.id}
        className={`segment-row ${selected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
        style={{ transform: CSS.Transform.toString(transform), transition }}
      >
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="segment-drag-handle"
          {...attributes}
          {...listeners}
          onPointerDown={(event) => {
            listeners?.onPointerDown?.(event)
            // Holding the grip should start sorting, not the row's long-press menu.
            event.stopPropagation()
          }}
          aria-label={`Reorder segment ${index + 1}`}
          title="Drag to reorder, or press Space and use the arrow keys"
        >
          <GripVertical size={16} />
        </button>
        <button
          type="button"
          className="segment-select"
          onClick={() => actions.onSelect(segment.id)}
          aria-pressed={selected}
        >
          <SegmentLabel segment={segment} index={index} />
        </button>
        <SegmentActionsMenu {...menuProps} />
      </div>
    </SegmentContextMenu>
  )
}

export function SegmentList({ segments, selectedId, ...actions }: SegmentListProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const activeIndex = segments.findIndex((segment) => segment.id === activeId)
  const active = segments[activeIndex]
  const position = (id: string | number) => segments.findIndex((segment) => segment.id === id) + 1

  function removeSegment(id: string) {
    const index = segments.findIndex((segment) => segment.id === id)
    if (index === -1 || segments.length === 1) return
    actions.onRemove(id)
    requestAnimationFrame(() => {
      list.current
        ?.querySelectorAll<HTMLButtonElement>('.segment-select')
        [Math.min(index, segments.length - 2)]?.focus()
    })
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            'Press Space to pick up a segment. Use the up and down arrow keys to move it, Space to drop, or Escape to cancel.',
        },
        announcements: {
          onDragStart: ({ active }) => `Picked up segment ${position(active.id)}.`,
          onDragOver: ({ over }) =>
            over ? `Move to position ${position(over.id)} of ${segments.length}.` : undefined,
          onDragEnd: ({ over }) =>
            over ? `Dropped at position ${position(over.id)}.` : 'Sorting cancelled.',
          onDragCancel: () => 'Sorting cancelled.',
        },
      }}
      onDragStart={({ active }) => {
        setActiveId(String(active.id))
        actions.onSelect(String(active.id))
      }}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={({ active, over }) => {
        setActiveId(null)
        if (!over || active.id === over.id) return
        const targetIndex = segments.findIndex((segment) => segment.id === over.id)
        if (targetIndex !== -1) actions.onReorder(String(active.id), targetIndex)
      }}
    >
      <SortableContext items={segments} strategy={verticalListSortingStrategy}>
        <div ref={list} className="segments-list" role="list" aria-label="Path segments">
          {segments.map((segment, index) => (
            <SortableSegment
              key={segment.id}
              segment={segment}
              index={index}
              count={segments.length}
              selected={segment.id === selectedId}
              {...actions}
              onRemove={removeSegment}
            />
          ))}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {active && (
          <div className="segment-row segment-drag-overlay" aria-hidden="true">
            <GripVertical size={16} />
            <SegmentLabel segment={active} index={activeIndex} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
