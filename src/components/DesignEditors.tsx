import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { ArrowDownRight, CirclePlus, MousePointer2, Pencil, Plus, Trash2 } from 'lucide-react'
import type { CutPlan, Design, Point } from '../lib/types'
import { cutPathData } from '../lib/cut-path'
import {
  getOutline,
  getPanelWidth,
  isSimplePolygon,
  pathLength,
  samplePath,
  segmentLength,
} from '../lib/geometry'
import './editors.css'

const mm = (value: number) => Number(value.toFixed(1)).toLocaleString()
const pointString = (points: Point[]) => points.map((point) => `${point.x},${point.y}`).join(' ')

function CoordinateField({
  axis,
  value,
  max,
  onCommit,
}: {
  axis: 'X' | 'Y'
  value: number
  max: number
  onCommit: (value: number) => boolean
}) {
  const format = (number: number) => String(Number(number.toFixed(2)))
  const [text, setText] = useState(() => format(value))
  const cancelled = useRef(false)
  useEffect(() => {
    setText(format(value))
  }, [value])
  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false
      setText(format(value))
      return
    }
    const parsed = Number(text)
    if (!text.trim() || !Number.isFinite(parsed)) {
      setText(format(value))
      return
    }
    const next = Math.max(0, Math.min(max, parsed))
    setText(format(onCommit(next) ? next : value))
  }
  return (
    <label>
      {axis}{' '}
      <input
        aria-label={`Selected point ${axis} in millimeters`}
        type="number"
        min="0"
        max={max}
        step="any"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            event.currentTarget.blur()
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            cancelled.current = true
            event.currentTarget.blur()
          }
        }}
      />
      <span>mm</span>
    </label>
  )
}

export function BendPathEditor({
  design,
  selectedId,
  onSelect,
}: {
  design: Design
  selectedId: string | null
  onSelect: (id: string) => void
  onChange: (design: Design) => void
}) {
  const gridId = useId().replace(/:/g, '')
  let distance = 0
  const sections = design.segments.map((segment) => {
    const length = segmentLength(segment)
    const samples = Math.max(2, Math.ceil(length / 3))
    const points = Array.from({ length: samples + 1 }, (_, index) =>
      samplePath(design.segments, distance + (length * index) / samples),
    )
    distance += length
    return { segment, points }
  })
  const points = sections.flatMap((section) => section.points)
  const minX = Math.min(0, ...points.map((point) => point.x))
  const minY = Math.min(0, ...points.map((point) => point.y))
  const maxX = Math.max(1, ...points.map((point) => point.x))
  const maxY = Math.max(1, ...points.map((point) => point.y))
  const span = Math.max(maxX - minX, (maxY - minY) * 1.7, 80)
  const padding = span * 0.13
  const viewWidth = maxX - minX + padding * 2
  const viewHeight = Math.max(maxY - minY + padding * 2, viewWidth / 2.2)
  const centerY = (minY + maxY) / 2
  const handleSize = span * 0.019
  return (
    <div className="bend-path-editor">
      <svg
        viewBox={`${minX - padding} ${centerY - viewHeight / 2} ${viewWidth} ${viewHeight}`}
        aria-label="Bend path, viewed from above. Select a segment to edit it."
        className="bend-path-svg"
      >
        <defs>
          <pattern id={gridId} width={span / 12} height={span / 12} patternUnits="userSpaceOnUse">
            <circle cx="0" cy="0" r={span / 550} fill="#d0bea3" />
          </pattern>
        </defs>
        <rect
          x={minX - padding}
          y={centerY - viewHeight / 2}
          width={viewWidth}
          height={viewHeight}
          fill={`url(#${gridId})`}
        />
        {sections.map(({ segment, points: sectionPoints }, index) => (
          <g key={segment.id}>
            <polyline
              points={pointString(sectionPoints)}
              fill="none"
              stroke={segment.id === selectedId ? '#4a3025' : '#9b928b'}
              strokeWidth={segment.id === selectedId ? 4 : 2.5}
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
            />
            <polyline
              points={pointString(sectionPoints)}
              fill="none"
              stroke="transparent"
              strokeWidth="24"
              vectorEffect="non-scaling-stroke"
              tabIndex={0}
              role="button"
              aria-label={`Select ${segment.type === 'arc' ? 'curve' : 'straight'} ${index + 1}`}
              aria-pressed={segment.id === selectedId}
              className="bend-segment-hit"
              onClick={() => onSelect(segment.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelect(segment.id)
                }
              }}
            />
            <circle
              cx={sectionPoints[0].x}
              cy={sectionPoints[0].y}
              r={handleSize}
              fill="#fbf6ea"
              stroke="#4a3025"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          </g>
        ))}
        {points.length > 0 && (
          <circle cx={points.at(-1)!.x} cy={points.at(-1)!.y} r={handleSize} fill="#4a3025" />
        )}
      </svg>
      <div className="bend-path-caption">
        <span>
          <MousePointer2 size={12} /> Select a segment
        </span>
        <span>{mm(pathLength(design.segments))} mm</span>
      </div>
    </div>
  )
}

function DimensionLines({
  length,
  width,
  padding,
}: {
  length: number
  width: number
  padding: number
}) {
  const y = -padding * 0.48
  const x = -padding * 0.48
  const tick = padding * 0.09
  const fontSize = Math.max(length, width) / 44
  return (
    <g
      fill="#726861"
      stroke="#afa7a2"
      strokeWidth="1"
      className="plan-dimensions"
      aria-hidden="true"
    >
      <path
        d={`M0,${y}H${length} M0,${y - tick}V${y + tick} M${length},${y - tick}V${y + tick}`}
        vectorEffect="non-scaling-stroke"
      />
      <text x={length / 2} y={y - tick * 1.8} textAnchor="middle" fontSize={fontSize} stroke="none">
        {mm(length)} mm
      </text>
      <path
        d={`M${x},0V${width} M${x - tick},0H${x + tick} M${x - tick},${width}H${x + tick}`}
        vectorEffect="non-scaling-stroke"
      />
      <text
        x={x - tick * 1.8}
        y={width / 2}
        textAnchor="middle"
        fontSize={fontSize}
        stroke="none"
        transform={`rotate(-90 ${x - tick * 1.8} ${width / 2})`}
      >
        {mm(width)} mm
      </text>
    </g>
  )
}

export function OutlineEditor({
  design,
  onChange,
}: {
  design: Design
  onChange: (design: Design) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef<number | null>(null)
  const [selected, setSelected] = useState(0)
  const [message, setMessage] = useState('')
  const gridId = useId().replace(/:/g, '')
  const length = pathLength(design.segments)
  const width = getPanelWidth(design)
  const outline = getOutline(design)
  const padding = Math.max(length, width) * 0.16
  const isCustom = design.outline === 'custom'
  const custom = design.customOutline
  const selectedIndex = Math.min(selected, Math.max(0, custom.length - 1))
  const selectedPoint = custom[selectedIndex]
  const marker = Math.max(length, width) / 85

  const updatePoint = (index: number, point: Point) => {
    const next = custom.map((current, item) =>
      item === index
        ? { x: Math.max(0, Math.min(1, point.x)), y: Math.max(0, Math.min(1, point.y)) }
        : current,
    )
    if (!isSimplePolygon(next)) {
      setMessage('Keep points apart and prevent edges from crossing.')
      return false
    }
    setMessage('')
    onChange({ ...design, customOutline: next })
    return true
  }
  const pointerPoint = (event: ReactPointerEvent<SVGElement>): Point | null => {
    const svg = svgRef.current
    const matrix = svg?.getScreenCTM()
    if (!svg || !matrix) return null
    const position = svg.createSVGPoint()
    position.x = event.clientX
    position.y = event.clientY
    const transformed = position.matrixTransform(matrix.inverse())
    return { x: transformed.x / length, y: transformed.y / width }
  }
  const insertPoint = (index: number) => {
    if (custom.length >= 128) {
      setMessage('The outline supports up to 128 points.')
      return
    }
    const next = custom[(index + 1) % custom.length]
    const point = custom[index]
    const points = [...custom]
    points.splice(index + 1, 0, { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 })
    onChange({ ...design, customOutline: points })
    setSelected(index + 1)
    setMessage('Point added. Drag it to reshape the outline.')
  }
  const removePoint = (index: number) => {
    if (custom.length <= 3) return
    const points = custom.filter((_, item) => item !== index)
    if (!isSimplePolygon(points)) {
      setMessage('Removing this point would make the edges cross.')
      return
    }
    onChange({ ...design, customOutline: points })
    setSelected(Math.max(0, index - 1))
    setMessage('Point removed.')
  }
  const moveWithKeyboard = (event: KeyboardEvent<SVGCircleElement>, index: number) => {
    const direction = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key]
    if (direction) {
      event.preventDefault()
      const amount = event.shiftKey ? 10 : 1
      updatePoint(index, {
        x: custom[index].x + (direction[0] * amount) / length,
        y: custom[index].y + (direction[1] * amount) / width,
      })
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      removePoint(index)
    }
  }

  return (
    <div className="outline-editor">
      <div className="drawing-heading">
        <div>
          <span className="drawing-eyebrow">FLAT OUTLINE</span>
          <h2>Make it your own.</h2>
        </div>
        <span className="drawing-scale">Dimensions in millimeters</span>
      </div>
      <div className="outline-drawing-area">
        <svg
          ref={svgRef}
          viewBox={`${-padding} ${-padding} ${length + padding * 2} ${width + padding * 2}`}
          className="outline-svg"
          aria-label={`Flat panel outline, ${mm(length)} by ${mm(width)} millimeters${isCustom ? '. Drag a vertex or use the arrow keys to adjust it.' : ''}`}
        >
          <defs>
            <pattern id={gridId} width="10" height="10" patternUnits="userSpaceOnUse">
              <path
                d="M10 0H0V10"
                fill="none"
                stroke="#d0bea3"
                strokeWidth="0.4"
                vectorEffect="non-scaling-stroke"
              />
            </pattern>
          </defs>
          <rect
            x="0"
            y="0"
            width={length}
            height={width}
            fill={`url(#${gridId})`}
            stroke="#c0b6af"
            strokeWidth="1"
            strokeDasharray="3 4"
            vectorEffect="non-scaling-stroke"
          />
          <DimensionLines length={length} width={width} padding={padding} />
          <polygon
            points={pointString(outline)}
            fill="#e9d9b6"
            fillOpacity="0.68"
            stroke="#4a3025"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          {isCustom &&
            custom.map((point, index) => {
              const next = custom[(index + 1) % custom.length]
              return (
                <g key={index}>
                  <line
                    x1={point.x * length}
                    y1={point.y * width}
                    x2={next.x * length}
                    y2={next.y * width}
                    stroke="transparent"
                    strokeWidth="16"
                    vectorEffect="non-scaling-stroke"
                    className="outline-edge-hit"
                    onDoubleClick={() => insertPoint(index)}
                  >
                    <title>Double-click to add a point</title>
                  </line>
                  <circle
                    cx={point.x * length}
                    cy={point.y * width}
                    r={marker * 2}
                    fill="transparent"
                    className="outline-vertex-hit"
                    onPointerDown={(event) => {
                      setSelected(index)
                      dragging.current = index
                      event.currentTarget.setPointerCapture(event.pointerId)
                    }}
                    onPointerMove={(event) => {
                      if (dragging.current === index) {
                        const nextPoint = pointerPoint(event)
                        if (nextPoint) updatePoint(index, nextPoint)
                      }
                    }}
                    onPointerUp={(event) => {
                      dragging.current = null
                      event.currentTarget.releasePointerCapture(event.pointerId)
                    }}
                    onPointerCancel={() => {
                      dragging.current = null
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Vertex ${index + 1}, x ${mm(point.x * length)}, y ${mm(point.y * width)} millimeters. Use arrow keys to move.`}
                    aria-pressed={selectedIndex === index}
                    onFocus={() => setSelected(index)}
                    onKeyDown={(event) => moveWithKeyboard(event, index)}
                  />
                  <circle
                    cx={point.x * length}
                    cy={point.y * width}
                    r={marker}
                    fill={selectedIndex === index ? '#4a3025' : '#fffbf2'}
                    stroke="#4a3025"
                    strokeWidth="1.8"
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                  />
                  {selectedIndex === index && (
                    <text
                      x={point.x * length + marker * 1.9}
                      y={point.y * width - marker * 1.9}
                      fill="#4a3025"
                      fontSize={marker * 2.4}
                      fontWeight="600"
                      pointerEvents="none"
                    >
                      {index + 1}
                    </text>
                  )}
                </g>
              )
            })}
        </svg>
      </div>
      {isCustom && selectedPoint ? (
        <div className="vertex-controls">
          <span className="vertex-label">
            <MousePointer2 size={15} /> Point {selectedIndex + 1}
          </span>
          <CoordinateField
            key={`x-${selectedIndex}`}
            axis="X"
            value={selectedPoint.x * length}
            max={length}
            onCommit={(value) =>
              updatePoint(selectedIndex, { ...selectedPoint, x: value / length })
            }
          />
          <CoordinateField
            key={`y-${selectedIndex}`}
            axis="Y"
            value={selectedPoint.y * width}
            max={width}
            onCommit={(value) => updatePoint(selectedIndex, { ...selectedPoint, y: value / width })}
          />
          <button
            type="button"
            className="editor-tool-button"
            disabled={custom.length >= 128}
            title={
              custom.length >= 128
                ? 'Maximum 128 points reached'
                : 'Insert a point after the selected point'
            }
            onClick={() => insertPoint(selectedIndex)}
          >
            <Plus size={15} /> Add point
          </button>
          <button
            type="button"
            className="editor-tool-button editor-delete-point"
            disabled={custom.length <= 3}
            onClick={() => removePoint(selectedIndex)}
            aria-label="Remove selected point"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="outline-custom-button"
          onClick={() => {
            onChange({
              ...design,
              outline: 'custom',
              width,
              customOutline: outline.map((point) => ({ x: point.x / length, y: point.y / width })),
            })
            setSelected(0)
          }}
        >
          <Pencil size={15} /> Customize this outline <ArrowDownRight size={15} />
        </button>
      )}
      <p className="drawing-instructions" aria-live="polite">
        {message ||
          (isCustom
            ? 'Drag points to shape your panel. Double-click an edge to add a point. Arrow keys move 1 mm.'
            : 'Choose a shape in the sidebar, or customize its points for something entirely your own.')}
      </p>
    </div>
  )
}

export function CutPlanView({
  design,
  plan,
  large = true,
}: {
  design: Design
  plan: CutPlan
  large?: boolean
}) {
  const id = useId().replace(/:/g, '')
  const padding = Math.max(plan.length, plan.width) * (large ? 0.15 : 0.05)
  return (
    <div className={large ? 'cut-plan-view' : 'cut-plan-thumbnail'}>
      {large && (
        <div className="drawing-heading">
          <div>
            <span className="drawing-eyebrow">LASER CUT PLAN</span>
            <h2>From a sheet to a shape.</h2>
          </div>
          <span className="drawing-scale">1:1 export · millimeters</span>
        </div>
      )}
      <svg
        viewBox={`${-padding} ${-padding} ${plan.length + padding * 2} ${plan.width + padding * 2}`}
        className="cut-plan-svg"
        role="img"
        aria-label={`${design.name} laser cut plan: ${mm(plan.length)} by ${mm(plan.width)} millimeters with ${plan.cuts.length} hinge cuts`}
      >
        <defs>
          <pattern id={id} width="10" height="10" patternUnits="userSpaceOnUse">
            <circle cx="0" cy="0" r="0.35" fill="#c6bcb5" />
          </pattern>
        </defs>
        {large && (
          <rect
            x={-padding}
            y={-padding}
            width={plan.length + padding * 2}
            height={plan.width + padding * 2}
            fill={`url(#${id})`}
          />
        )}
        {large && <DimensionLines length={plan.length} width={plan.width} padding={padding} />}
        {design.outline === 'circle' || design.outline === 'ellipse' ? (
          <ellipse
            cx={plan.length / 2}
            cy={plan.width / 2}
            rx={plan.length / 2}
            ry={plan.width / 2}
            fill="#fffdf5"
            stroke="#a8493f"
            strokeWidth={large ? 1.6 : 1.2}
            vectorEffect="non-scaling-stroke"
          />
        ) : (
          <polygon
            points={pointString(plan.outline)}
            fill="#fffdf5"
            stroke="#a8493f"
            strokeWidth={large ? 1.6 : 1.2}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <g stroke="#3c699a" strokeWidth={large ? 0.9 : 0.6} vectorEffect="non-scaling-stroke">
          {plan.cuts.map((cut, index) => (
            <path
              key={index}
              d={cutPathData(cut)}
              fill="none"
              data-hinge-cut=""
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
      </svg>
      {large && (
        <div className="cut-plan-legend">
          <span>
            <i className="outline-legend-swatch" /> Outside contour
          </span>
          <span>
            <i className="hinge-legend-swatch" /> Living hinge cuts
          </span>
          <span className="cut-plan-count">
            <CirclePlus size={14} /> {plan.cuts.length} cut segments
          </span>
        </div>
      )}
    </div>
  )
}
