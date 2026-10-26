import { useEffect, useRef, useState, type ReactNode } from 'react'
import { defaultDesign, segmentLength } from '../../lib/geometry'
import { honeycombCell } from '../../lib/honeycomb'
import { meanderCell, meanderRepeat } from '../../lib/meander'
import { familyPresets } from '../../lib/pattern-presets'
import type { Design, Segment } from '../../lib/types'
import { Button } from '../ui/button'
import { Tooltip } from '../ui/tooltip'
export function PatternDrawing({ pattern }: { pattern: Design['pattern'] }) {
  if (pattern === 'meander') {
    const miniature = {
      ...defaultDesign,
      pattern,
      ...familyPresets.meander[0].settings,
    }
    const cell = meanderCell(miniature)
    const scale = 1.45
    const repeat = meanderRepeat(miniature) * scale
    return (
      <svg viewBox="0 0 64 32" aria-hidden="true" focusable="false">
        {Array.from({ length: 8 }, (_, row) =>
          Array.from({ length: 4 }, (_, column) => (
            <polyline
              key={`${row}-${column}`}
              points={cell
                .map(
                  (p) =>
                    `${p.y * scale + (column - 1) * repeat},${p.x * scale + row * miniature.spacing * scale}`,
                )
                .join(' ')}
              strokeWidth={0.65}
            />
          )),
        )}
      </svg>
    )
  }
  if (pattern === 'honeycomb') {
    const miniature = { ...defaultDesign, ...familyPresets.honeycomb[1].settings }
    const cell = honeycombCell(miniature)
    const scale = 1.4
    const repeat = (miniature.cutLength + miniature.bridge) * scale
    return (
      <svg viewBox="0 0 64 32" aria-hidden="true" focusable="false">
        {Array.from({ length: 9 }, (_, row) =>
          Array.from({ length: 3 }, (_, column) => {
            const x = 16 + (column - 1) * repeat + (row % 2 ? repeat / 2 : 0)
            const y = 2 + row * miniature.spacing * scale
            return (
              <polygon
                key={`${row}-${column}`}
                points={cell.map((p) => `${x + p.y * scale},${y + p.x * scale}`).join(' ')}
                strokeWidth={0.6}
              />
            )
          }),
        )}
      </svg>
    )
  }
  const columns = pattern === 'graded' ? [8, 16, 26, 39, 55] : [8, 20, 32, 44, 56]
  return (
    <svg viewBox="0 0 64 32" aria-hidden="true" focusable="false">
      {columns.flatMap((x, column) => {
        const ranges =
          column % 2
            ? [
                [0, 6],
                [10, 22],
                [26, 32],
              ]
            : [
                [0, 14],
                [18, 32],
              ]
        return ranges.map(([start, end], index) => {
          const points = Array.from({ length: end - start + 1 }, (_, step) => {
            const y = start + step
            const phase = y / 12
            const offset =
              pattern === 'wave'
                ? Math.sin(phase * Math.PI * 2) * 2.5
                : pattern === 'zigzag'
                  ? (1 - 4 * Math.abs((phase % 1) - 0.5)) * 2.5
                  : 0
            return `${x + offset},${y}`
          })
          return <polyline key={`${column}-${index}`} points={points.join(' ')} />
        })
      })}
    </svg>
  )
}

export function NumberField({
  label,
  value,
  onChange,
  min = 1,
  max = 2000,
  step = 1,
  unit = 'mm',
  compact = false,
  precision = 2,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  compact?: boolean
  precision?: number
}) {
  const [text, setText] = useState(String(value))
  const edited = useRef(false)
  useEffect(() => {
    edited.current = false
    setText(String(Number(value.toFixed(precision))))
  }, [value, precision])
  function commit() {
    // Display rounding must not alter an imported value merely by focusing it.
    if (!edited.current) return
    edited.current = false
    const number = Number(text)
    if (text.trim() && Number.isFinite(number)) {
      const clamped = Math.max(min, Math.min(max, number))
      setText(String(clamped))
      onChange(clamped)
    } else setText(String(value))
  }
  return (
    <label className={`number-field ${compact ? 'compact' : ''}`}>
      <span>{label}</span>
      <div>
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={text}
          onChange={(e) => {
            edited.current = true
            setText(e.target.value)
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
        <span className="input-unit">{unit}</span>
      </div>
    </label>
  )
}

export function PercentageField({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  hint,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  hint: string
}) {
  const percentage = Number((value * 100).toFixed(4))
  return (
    <div className="percentage-field">
      <NumberField
        label={label}
        value={percentage}
        onChange={(next) => onChange(next / 100)}
        min={min}
        max={max}
        step={0.01}
        unit="%"
        precision={4}
      />
      <input
        type="range"
        aria-label={`${label} adjustment`}
        min={min}
        max={max}
        step={0.01}
        value={percentage}
        onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
      />
      <p className="control-hint">{hint}</p>
    </div>
  )
}

export function IconButton({
  label,
  children,
  onClick,
  disabled = false,
  active = false,
}: {
  label: string
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  active?: boolean
}) {
  return (
    <Tooltip label={label}>
      <Button
        variant="ghost"
        size="icon"
        aria-label={label}
        disabled={disabled}
        aria-pressed={active || undefined}
        onClick={onClick}
        className={active ? 'is-active' : ''}
      >
        {children}
      </Button>
    </Tooltip>
  )
}

export function PresetDrawing({ segments }: { segments: Segment[] }) {
  const points: { x: number; y: number }[] = []
  let x = 0,
    y = 0,
    a = 0
  for (const s of segments) {
    const n = s.type === 'arc' ? 30 : 1
    for (let i = 0; i < n; i++) {
      const l = segmentLength(s) / n
      const da = s.type === 'arc' ? (s.angle * Math.PI) / 180 / n : 0
      if (da !== 0) {
        x += (l / da) * (Math.sin(a + da) - Math.sin(a))
        y += (l / da) * (-Math.cos(a + da) + Math.cos(a))
      } else {
        x += l * Math.cos(a)
        y += l * Math.sin(a)
      }
      a += da
      points.push({ x, y })
    }
  }
  points.unshift({ x: 0, y: 0 })
  const minX = Math.min(...points.map((p) => p.x)),
    maxX = Math.max(...points.map((p) => p.x)),
    minY = Math.min(...points.map((p) => p.y)),
    maxY = Math.max(...points.map((p) => p.y))
  return (
    <svg
      viewBox={`${minX - 20} ${minY - 20} ${maxX - minX + 40} ${maxY - minY + 40}`}
      aria-hidden="true"
    >
      <polyline
        points={points.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
      />
    </svg>
  )
}
