import BrandMark from './components/BrandMark'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowDownToLine,
  ArrowRight,
  Box,
  Check,
  ChevronDown,
  Circle,
  CircleHelp,
  FileDown,
  FolderOpen,
  Grid2X2,
  Layers3,
  Maximize,
  Minus,
  MousePointer2,
  MoveUpRight,
  Plus,
  Redo2,
  RotateCcw,
  Ruler,
  Scissors,
  Settings2,
  Shapes,
  Sparkles,
  Square,
  Triangle,
  Undo2,
  Waves,
  X,
} from 'lucide-react'
import * as Tabs from '@radix-ui/react-tabs'
import { Button } from './components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog'
import { Tooltip, TooltipProvider } from './components/ui/tooltip'
import PlywoodPreview from './components/PlywoodPreview'
import { BendPathEditor, CutPlanView, OutlineEditor } from './components/DesignEditors'
import {
  createCutPlan,
  defaultDesign,
  exportDXF,
  exportSVG,
  getPanelWidth,
  pathLength,
  presets,
  segmentLength,
  validateDesign,
} from './lib/geometry'
import type { Design, OutlineKind, Segment } from './lib/types'

type View = 'preview' | 'outline' | 'plan'
const storageKey = 'bentwood.design.v1'
function loadDesign() {
  try {
    const stored = localStorage.getItem(storageKey)
    return stored ? (validateDesign(JSON.parse(stored)) ?? defaultDesign) : defaultDesign
  } catch {
    return defaultDesign
  }
}
function download(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function NumberField({
  label,
  value,
  onChange,
  min = 1,
  max = 2000,
  step = 1,
  unit = 'mm',
  compact = false,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  compact?: boolean
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(Math.round(value * 100) / 100)), [value])
  function commit() {
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
          onChange={(e) => setText(e.target.value)}
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
function IconButton({
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
function PresetDrawing({ segments }: { segments: Segment[] }) {
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

export default function App() {
  const [history, setHistory] = useState(() => ({
    past: [] as Design[],
    present: loadDesign(),
    future: [] as Design[],
  }))
  const design = history.present
  const [view, setView] = useState<View>('preview')
  const [selectedId, setSelectedId] = useState<string | null>(
    design.segments.find((s) => s.type === 'arc')?.id ?? design.segments[0].id,
  )
  const [panel, setPanel] = useState<'path' | 'outline'>('path')
  const [bend, setBend] = useState(1)
  const [showGrid, setShowGrid] = useState(true)
  const [showCuts, setShowCuts] = useState(true)
  const [camera, setCamera] = useState<'perspective' | 'top' | 'front'>('perspective')
  const [resetKey, setResetKey] = useState(0)
  const [exportOpen, setExportOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<'design' | 'studio' | 'settings'>('studio')
  const [notice, setNotice] = useState('')
  const [saved, setSaved] = useState(true)
  const fileInput = useRef<HTMLInputElement>(null)
  const pointerHistory = useRef({ active: false, recorded: false })
  const plan = useMemo(() => createCutPlan(design), [design])
  const selected = design.segments.find((s) => s.id === selectedId)
  const total = pathLength(design.segments)
  const filename = (design.name.trim() || 'bentwood-design')
    .replace(/[^a-z0-9-]+/gi, '-')
    .toLowerCase()
  function update(next: Design) {
    if (JSON.stringify(next) === JSON.stringify(design)) return
    if (!validateDesign(next)) {
      setNotice(
        'This design exceeds the supported size or cut density. Reduce dimensions or increase cut spacing.',
      )
      return
    }
    const group = pointerHistory.current.active && pointerHistory.current.recorded
    if (pointerHistory.current.active) pointerHistory.current.recorded = true
    setHistory((h) =>
      JSON.stringify(next) === JSON.stringify(h.present)
        ? h
        : { past: group ? h.past : [...h.past, h.present].slice(-100), present: next, future: [] },
    )
  }
  function patch(next: Partial<Design>) {
    update({ ...design, ...next })
  }
  function undo() {
    setHistory((h) =>
      h.past.length
        ? { past: h.past.slice(0, -1), present: h.past.at(-1)!, future: [h.present, ...h.future] }
        : h,
    )
  }
  function redo() {
    setHistory((h) =>
      h.future.length
        ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) }
        : h,
    )
  }
  function saveProject() {
    download(JSON.stringify(design, null, 2), `${filename}.bentwood.json`, 'application/json')
    setNotice('Project file downloaded.')
  }
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(design))
      setSaved(true)
    } catch {
      setSaved(false)
    }
  }, [design])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 5000)
    return () => clearTimeout(timer)
  }, [notice])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === 's') {
        e.preventDefault()
        saveProject()
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  function changeSegment(values: Partial<Segment>) {
    patch({
      segments: design.segments.map((s) =>
        s.id === selectedId ? ({ ...s, ...values } as Segment) : s,
      ),
    })
  }
  function addSegment(type: 'straight' | 'arc') {
    const id = crypto.randomUUID()
    patch({
      segments: [
        ...design.segments,
        type === 'straight' ? { id, type, length: 60 } : { id, type, radius: 40, angle: 90 },
      ],
    })
    setSelectedId(id)
  }
  function usePreset(p: (typeof presets)[number]) {
    patch({ segments: p.segments.map((s) => ({ ...s, id: crypto.randomUUID() })) })
    setSelectedId(null)
    setBend(1)
    setResetKey((k) => k + 1)
  }
  function shape(kind: OutlineKind) {
    patch({ outline: kind })
    setPanel('outline')
    if (kind === 'custom') setView('outline')
  }
  function exportFile(format: 'svg' | 'dxf') {
    try {
      download(
        format === 'svg' ? exportSVG(design) : exportDXF(design),
        `${filename}.${format}`,
        format === 'svg' ? 'image/svg+xml' : 'application/dxf',
      )
      setNotice(`${format.toUpperCase()} cut plan downloaded at 1:1 scale.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The cut plan could not be exported.')
    }
  }
  const shapeOptions: { kind: OutlineKind; label: string; icon: ReactNode }[] = [
    {
      kind: 'rectangle',
      label: 'Rectangle',
      icon: <Square size={20} className="rectangle-icon" />,
    },
    { kind: 'square', label: 'Square', icon: <Square size={20} /> },
    { kind: 'ellipse', label: 'Ellipse', icon: <Circle size={20} className="rectangle-icon" /> },
    { kind: 'circle', label: 'Circle', icon: <Circle size={20} /> },
    { kind: 'triangle', label: 'Triangle', icon: <Triangle size={20} /> },
    { kind: 'custom', label: 'Custom', icon: <Shapes size={20} /> },
  ]
  return (
    <TooltipProvider delayDuration={250}>
      <div className="app-shell">
        <header className="app-header">
          <a className="brand" href="/" aria-label="Bentwood home">
            <BrandMark />
            <span>
              bentwood<span className="brand-period">.</span>
            </span>
          </a>
          <span className="header-divider" />
          <div className="project-name">
            <input
              aria-label="Project name"
              value={design.name}
              maxLength={60}
              onChange={(e) => patch({ name: e.target.value })}
            />
            <span className="save-state">
              <span className={saved ? 'status-dot' : 'status-dot unsaved'} />
              {saved ? 'Saved on this device' : 'Download to save'}
            </span>
          </div>
          <div className="header-actions">
            <div className="history-actions">
              <IconButton label="Undo (⌘ / Ctrl Z)" onClick={undo} disabled={!history.past.length}>
                <Undo2 size={18} />
              </IconButton>
              <IconButton
                label="Redo (⌘ / Ctrl Shift Z)"
                onClick={redo}
                disabled={!history.future.length}
              >
                <Redo2 size={18} />
              </IconButton>
            </div>
            <IconButton label="Open project" onClick={() => fileInput.current?.click()}>
              <FolderOpen size={18} />
            </IconButton>
            <IconButton label="Save project file" onClick={saveProject}>
              <FileDown size={18} />
            </IconButton>
            <Button variant="ghost" onClick={() => setHelpOpen(true)} className="help-button">
              <CircleHelp size={17} />
              <span>Quick guide</span>
            </Button>
            <Button onClick={() => setExportOpen(true)} className="export-button">
              <ArrowDownToLine size={16} />
              <span>Export cut plan</span>
              <ArrowRight size={16} />
            </Button>
          </div>
        </header>
        <div className="workspace-heading">
          <div className="studio-label">
            <span className="tiny-cross">✳</span> THE BENDING STUDIO
          </div>
          <nav className="view-tabs" aria-label="Workspace view">
            {(
              [
                { id: 'preview', label: '3D preview', icon: <Box size={16} /> },
                { id: 'outline', label: 'Flat outline', icon: <Shapes size={16} /> },
                { id: 'plan', label: 'Cut plan', icon: <Scissors size={16} /> },
              ] as const
            ).map((v) => (
              <button
                key={v.id}
                onClick={() => {
                  setView(v.id)
                  setMobilePanel('studio')
                  if (v.id === 'outline') setPanel('outline')
                }}
                className={view === v.id ? 'active' : ''}
                aria-pressed={view === v.id}
              >
                {v.icon}
                {v.label}
              </button>
            ))}
          </nav>
          <span className="unit-badge">
            <Ruler size={14} /> Millimetres
          </span>
        </div>
        <nav className="mobile-nav" aria-label="Panels">
          <button
            className={mobilePanel === 'design' ? 'active' : ''}
            aria-pressed={mobilePanel === 'design'}
            onClick={() => setMobilePanel('design')}
          >
            Design
          </button>
          <button
            className={mobilePanel === 'studio' ? 'active' : ''}
            aria-pressed={mobilePanel === 'studio'}
            onClick={() => setMobilePanel('studio')}
          >
            Studio
          </button>
          <button
            className={mobilePanel === 'settings' ? 'active' : ''}
            aria-pressed={mobilePanel === 'settings'}
            onClick={() => setMobilePanel('settings')}
          >
            Material & cuts
          </button>
        </nav>
        <main className={`workspace mobile-${mobilePanel}`}>
          <aside className="design-sidebar" aria-label="Shape designer">
            <div className="sidebar-intro">
              <p className="eyebrow">FROM FLAT TO FORM</p>
              <h1>Bend your idea.</h1>
              <p>A simple path. A world of possibilities.</p>
            </div>
            <Tabs.Root value={panel} onValueChange={(v) => setPanel(v as 'path' | 'outline')}>
              <Tabs.List className="segment-tabs" aria-label="Design controls">
                <Tabs.Trigger value="path">
                  <Waves size={16} />
                  Bend path
                </Tabs.Trigger>
                <Tabs.Trigger value="outline">
                  <Shapes size={16} />
                  Panel outline
                </Tabs.Trigger>
              </Tabs.List>
              <Tabs.Content value="path" className="path-controls">
                <div className="section-label">
                  <span>YOUR PATH</span>
                  <span>{design.segments.length} segments</span>
                </div>
                <div className="path-editor-frame">
                  <BendPathEditor
                    design={design}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    onChange={update}
                  />
                  <span className="diagram-caption">TOP VIEW · SELECT A SEGMENT</span>
                </div>
                <div className="segments-list">
                  {design.segments.map((s, i) => (
                    <button
                      className={`segment-row ${s.id === selectedId ? 'selected' : ''}`}
                      key={s.id}
                      onClick={() => setSelectedId(s.id)}
                      aria-pressed={s.id === selectedId}
                    >
                      <span className="segment-number">{String(i + 1).padStart(2, '0')}</span>
                      {s.type === 'arc' ? <Waves size={17} /> : <Minus size={17} />}
                      <span>{s.type === 'arc' ? 'Curve' : 'Straight'}</span>
                      <span className="segment-value">
                        {s.type === 'arc' ? `${s.angle}°` : `${s.length} mm`}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="add-segments">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addSegment('straight')}
                    disabled={design.segments.length >= 20}
                  >
                    <Plus size={14} />
                    Straight
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addSegment('arc')}
                    disabled={design.segments.length >= 20}
                  >
                    <Plus size={14} />
                    Curve
                  </Button>
                </div>
                {selected ? (
                  <div className="segment-properties">
                    <div className="section-label">
                      <span>{selected.type === 'arc' ? 'CURVE' : 'STRAIGHT'} SETTINGS</span>
                      <IconButton
                        label="Remove selected segment"
                        disabled={design.segments.length === 1}
                        onClick={() => {
                          patch({ segments: design.segments.filter((s) => s.id !== selectedId) })
                          setSelectedId(null)
                        }}
                      >
                        <X size={14} />
                      </IconButton>
                    </div>
                    {selected.type === 'straight' ? (
                      <NumberField
                        label="Length"
                        value={selected.length}
                        onChange={(v) => changeSegment({ length: v })}
                        min={5}
                        max={1000}
                      />
                    ) : (
                      <>
                        <div className="field-row">
                          <NumberField
                            label="Radius"
                            value={selected.radius}
                            onChange={(v) => changeSegment({ radius: v })}
                            min={5}
                            max={500}
                          />
                          <NumberField
                            label="Angle"
                            value={Math.abs(selected.angle)}
                            onChange={(v) =>
                              changeSegment({ angle: v * Math.sign(selected.angle || 1) })
                            }
                            min={1}
                            max={270}
                            unit="°"
                          />
                        </div>
                        <div className="direction-control">
                          <span>Bend direction</span>
                          <button
                            aria-label="Reverse bend direction"
                            onClick={() => changeSegment({ angle: -selected.angle })}
                          >
                            <RotateCcw size={14} />
                            {selected.angle > 0 ? 'Left' : 'Right'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <p className="control-hint">Select a segment above to adjust its dimensions.</p>
                )}
                <div className="path-total">
                  <span>Unrolled length</span>
                  <strong>
                    {total.toFixed(1)}
                    <small> mm</small>
                  </strong>
                </div>
              </Tabs.Content>
              <Tabs.Content value="outline" className="outline-controls">
                <div className="section-label">
                  <span>START WITH A SHAPE</span>
                </div>
                <div className="shape-options">
                  {shapeOptions.map((s) => (
                    <button
                      key={s.kind}
                      onClick={() => shape(s.kind)}
                      aria-pressed={design.outline === s.kind}
                      className={design.outline === s.kind ? 'selected' : ''}
                    >
                      {s.icon}
                      <span>{s.label}</span>
                    </button>
                  ))}
                </div>
                <NumberField
                  label="Panel width"
                  value={getPanelWidth(design)}
                  onChange={(v) =>
                    patch({
                      width: v,
                      outline:
                        design.outline === 'circle'
                          ? 'ellipse'
                          : design.outline === 'square'
                            ? 'rectangle'
                            : design.outline,
                    })
                  }
                  min={10}
                  max={1000}
                />
                <div className="dimension-note">
                  <Ruler size={17} />
                  <p>
                    Length follows your bend path.
                    <br />
                    <strong>
                      {total.toFixed(1)} × {getPanelWidth(design).toFixed(1)} mm
                    </strong>
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="full-width"
                  onClick={() => {
                    setView('outline')
                    setMobilePanel('studio')
                  }}
                >
                  <MousePointer2 size={15} />
                  Edit flat outline
                  <MoveUpRight size={14} />
                </Button>
                {design.outline === 'custom' && (
                  <p className="control-hint">
                    Drag points, double-click an edge to add a point, or use the coordinate fields
                    in the outline view.
                  </p>
                )}
                <div className="quiet-note">
                  <Layers3 size={20} />
                  <p>
                    One continuous sheet.
                    <br />
                    Your outline wraps along the bend path without changing its length.
                  </p>
                </div>
              </Tabs.Content>
            </Tabs.Root>
            <div className="sidebar-bottom">
              <span className="small-dot" />
              <span>Designed to make things.</span>
            </div>
          </aside>
          <section className="studio-canvas" aria-label="Design workspace">
            <div
              className="viewport"
              onPointerDownCapture={() => {
                pointerHistory.current = { active: true, recorded: false }
              }}
              onPointerUpCapture={() => {
                pointerHistory.current.active = false
              }}
              onPointerCancelCapture={() => {
                pointerHistory.current.active = false
              }}
            >
              <div className="viewport-title">
                <span className="eyebrow">
                  {view === 'preview'
                    ? 'A NEW PERSPECTIVE'
                    : view === 'outline'
                      ? 'MAKE IT YOUR OWN'
                      : 'READY FOR THE WORKSHOP'}
                </span>
                <h2>
                  {view === 'preview'
                    ? 'Flat wood. New possibilities.'
                    : view === 'outline'
                      ? 'Every shape starts here.'
                      : 'Every cut, considered.'}
                </h2>
              </div>
              {view === 'preview' ? (
                <PlywoodPreview
                  design={design}
                  plan={plan}
                  bend={bend}
                  showGrid={showGrid}
                  showCuts={showCuts}
                  view={camera}
                  resetKey={resetKey}
                />
              ) : view === 'outline' ? (
                <OutlineEditor design={design} onChange={update} />
              ) : (
                <CutPlanView design={design} plan={plan} large />
              )}
              {view === 'preview' && (
                <>
                  <div className="canvas-tools">
                    <IconButton label="Reset camera" onClick={() => setResetKey((k) => k + 1)}>
                      <Maximize size={17} />
                    </IconButton>
                    <IconButton
                      label="Toggle ground grid"
                      onClick={() => setShowGrid((v) => !v)}
                      active={showGrid}
                    >
                      <Grid2X2 size={17} />
                    </IconButton>
                    <IconButton
                      label="Toggle cut visualization"
                      onClick={() => setShowCuts((v) => !v)}
                      active={showCuts}
                    >
                      <Scissors size={17} />
                    </IconButton>
                    <span className="tool-divider" />
                    <label className="camera-select">
                      <span className="sr-only">Camera view</span>
                      <select
                        value={camera}
                        onChange={(e) => setCamera(e.target.value as typeof camera)}
                      >
                        <option value="perspective">Perspective</option>
                        <option value="top">Top</option>
                        <option value="front">Front</option>
                      </select>
                      <ChevronDown size={13} />
                    </label>
                  </div>
                  <div className="preview-tags">
                    <span>
                      <span className="status-dot" />
                      LIVE PREVIEW
                    </span>
                    <span>
                      {design.thickness} mm {design.material}
                    </span>
                  </div>
                  <div className="bend-control">
                    <label htmlFor="bend-slider">
                      <Waves size={16} />
                      <span>Unfold</span>
                    </label>
                    <input
                      id="bend-slider"
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(bend * 100)}
                      onChange={(e) => setBend(Number(e.target.value) / 100)}
                      aria-valuetext={`${Math.round(bend * 100)} percent bent`}
                    />
                    <span>
                      Bent <strong>{Math.round(bend * 100)}%</strong>
                    </span>
                  </div>
                  <div className="canvas-caption">
                    <MousePointer2 size={13} />
                    <span>Drag to orbit · Scroll to zoom</span>
                    <span className="preview-disclaimer">Geometry preview</span>
                  </div>
                </>
              )}
              {view === 'plan' && (
                <div className="plan-legend">
                  <span>
                    <i className="outline-key" />
                    Outer cut
                  </span>
                  <span>
                    <i className="hinge-key" />
                    Living hinge
                  </span>
                  <span>1:1 export · mm</span>
                </div>
              )}
            </div>
            <div className="preset-strip">
              <div className="preset-intro">
                <Sparkles size={17} />
                <div>
                  <strong>A starting point.</strong>
                  <span>Make it your own.</span>
                </div>
              </div>
              <div className="preset-options">
                {presets.slice(0, 4).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => usePreset(p)}
                    aria-label={`Use ${p.name} preset`}
                    title={p.description}
                  >
                    <PresetDrawing segments={p.segments} />
                    <span>{p.name}</span>
                    <MoveUpRight size={12} />
                  </button>
                ))}
              </div>
            </div>
          </section>
          <aside className="settings-sidebar" aria-label="Material and laser settings">
            <div className="rail-heading">
              <Settings2 size={17} />
              <h2>The details</h2>
            </div>
            <section className="material-section">
              <div className={`wood-swatch ${design.material}`}>
                <span>
                  {design.material === 'birch' ? '01' : design.material === 'walnut' ? '02' : '03'}
                </span>
                <Layers3 size={23} />
              </div>
              <label className="select-field">
                <span>Material appearance</span>
                <div>
                  <select
                    value={design.material}
                    onChange={(e) => patch({ material: e.target.value as Design['material'] })}
                  >
                    <option value="birch">Birch plywood</option>
                    <option value="walnut">Walnut plywood</option>
                    <option value="basswood">Basswood plywood</option>
                  </select>
                  <ChevronDown size={14} />
                </div>
              </label>
              <div className="field-row">
                <NumberField
                  label="Thickness"
                  value={design.thickness}
                  onChange={(v) => patch({ thickness: v })}
                  min={0.5}
                  max={12}
                  step={0.5}
                />
                <NumberField
                  label="Laser kerf"
                  value={design.kerf}
                  onChange={(v) => patch({ kerf: v })}
                  min={0.05}
                  max={0.8}
                  step={0.05}
                />
              </div>
            </section>
            <section className="hinge-section">
              <div className="section-label">
                <span>LIVING HINGE</span>
                <span className="mini-badge">Staggered</span>
              </div>
              <p className="control-hint">Cuts follow the curved sections.</p>
              <div className="field-row">
                <NumberField
                  label="Cut spacing"
                  value={design.spacing}
                  onChange={(v) => patch({ spacing: v })}
                  min={1}
                  max={12}
                  step={0.5}
                />
                <NumberField
                  label="Bridge"
                  value={design.bridge}
                  onChange={(v) => patch({ bridge: v })}
                  min={0.5}
                  max={10}
                  step={0.5}
                />
              </div>
              <div className="field-row">
                <NumberField
                  label="Cut length"
                  value={design.cutLength}
                  onChange={(v) => patch({ cutLength: v })}
                  min={5}
                  max={80}
                />
                <NumberField
                  label="Edge margin"
                  value={design.edgeMargin}
                  onChange={(v) => patch({ edgeMargin: v })}
                  min={1}
                  max={20}
                />
              </div>
            </section>
            <section className="cut-summary">
              <div className="section-label">
                <span>YOUR CUT PLAN</span>
                <button
                  onClick={() => {
                    setView('plan')
                    setMobilePanel('studio')
                  }}
                  aria-label="View full cut plan"
                >
                  <MoveUpRight size={16} />
                </button>
              </div>
              <button
                className="cut-thumbnail"
                onClick={() => {
                  setView('plan')
                  setMobilePanel('studio')
                }}
                aria-label="Open cut plan preview"
              >
                <CutPlanView design={design} plan={plan} large={false} />
              </button>
              <dl>
                <div>
                  <dt>Sheet size</dt>
                  <dd>
                    {plan.length.toFixed(1)} × {plan.width.toFixed(1)} <small>mm</small>
                  </dd>
                </div>
                <div>
                  <dt>Hinge cuts</dt>
                  <dd>{plan.cuts.length}</dd>
                </div>
                <div>
                  <dt>Total cut length</dt>
                  <dd>
                    {(plan.cutLength / 1000).toFixed(2)} <small>m</small>
                  </dd>
                </div>
              </dl>
            </section>
            <div className={`material-note ${plan.warnings.length ? 'has-warning' : ''}`}>
              <CircleHelp size={16} />
              <p>
                {plan.warnings[0] ||
                  'Wood has a little personality. Test a small hinge in your material before the final cut.'}
              </p>
            </div>
          </aside>
        </main>
        <footer className="status-bar">
          <span>
            <span className="status-dot" />
            All dimensions in mm<span className="status-separator">/</span>Neutral-axis geometry
          </span>
          <span>
            Made for curious makers.<span className="footer-mark">b.</span>
          </span>
        </footer>
        <input
          className="sr-only"
          ref={fileInput}
          type="file"
          accept=".json,.bentwood.json"
          aria-label="Import project file"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            try {
              if (file.size > 1_000_000) throw new Error('File is too large.')
              const parsed = validateDesign(JSON.parse(await file.text()))
              if (!parsed) throw new Error('This is not a valid Bentwood project.')
              update(parsed)
              setSelectedId(null)
              setResetKey((k) => k + 1)
              setNotice('Project opened.')
            } catch (err) {
              setNotice(err instanceof Error ? err.message : 'Could not open this project.')
            }
            e.target.value = ''
          }}
        />
        {notice && (
          <div role="status" className="toast">
            <Check size={17} />
            {notice}
            <button onClick={() => setNotice('')} aria-label="Dismiss notification">
              <X size={15} />
            </button>
          </div>
        )}
        <Dialog open={exportOpen} onOpenChange={setExportOpen}>
          <DialogContent>
            <div className="dialog-icon">
              <Scissors size={25} />
            </div>
            <DialogTitle>From your screen to your workshop.</DialogTitle>
            <DialogDescription>
              Your cut plan is a 1:1 vector file in millimetres. Import it into your laser software
              without scaling.
            </DialogDescription>
            <div className="export-preview">
              <CutPlanView design={design} plan={plan} large={false} />
            </div>
            <div className="export-stats">
              <span>
                <strong>
                  {plan.length.toFixed(1)} × {plan.width.toFixed(1)}
                </strong>
                mm sheet size
              </span>
              <span>
                <strong>{plan.cuts.length}</strong>hinge cuts
              </span>
              <span>
                <strong>{design.thickness}</strong>mm plywood
              </span>
            </div>
            <div className="export-note">
              <strong>Before you cut</strong>
              <p>
                Red outlines and blue hinge lines are cut centre lines. Kerf ({design.kerf} mm) is
                visualized, but no toolpath compensation is applied. Set compensation and laser
                power in your cutter software. Test a material sample first; this preview does not
                simulate strength or springback.
              </p>
              {plan.warnings.length > 0 && (
                <ul>
                  {plan.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="dialog-actions">
              <Button variant="outline" onClick={() => exportFile('dxf')}>
                <ArrowDownToLine size={16} />
                Download DXF
              </Button>
              <Button onClick={() => exportFile('svg')}>
                <ArrowDownToLine size={16} />
                Download SVG
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
          <DialogContent>
            <div className="dialog-icon">
              <Waves size={25} />
            </div>
            <DialogTitle>A little flexibility goes a long way.</DialogTitle>
            <DialogDescription>
              Turn a flat sheet of plywood into something with a little more dimension.
            </DialogDescription>
            <ol className="guide-steps">
              <li>
                <span>01</span>
                <div>
                  <h3>Find your curve.</h3>
                  <p>
                    Start with a preset, then add straight sections and curves. Select a segment to
                    set its length, radius, angle, and direction.
                  </p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <h3>Make your mark.</h3>
                  <p>
                    Choose a panel outline or draw a custom polygon. Its length follows the path.
                    Its width runs across the sheet.
                  </p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <h3>Give it some give.</h3>
                  <p>
                    Set your plywood thickness and hinge pattern. Staggered cuts are added only
                    along curves. Orbit the preview and unfold it to see the transformation.
                  </p>
                </div>
              </li>
              <li>
                <span>04</span>
                <div>
                  <h3>Bring it to life.</h3>
                  <p>
                    Export SVG or DXF in millimetres. Start with a small test: plywood grain, glue,
                    and laser kerf all affect the real bend.
                  </p>
                </div>
              </li>
            </ol>
            <p className="guide-source">
              Inspired by{' '}
              <a
                href="https://endurancelasers.com/making-flexible-plywood-using-a-laser/"
                target="_blank"
                rel="noreferrer"
              >
                Endurance’s flexible plywood guide <MoveUpRight size={12} />
              </a>
              .
            </p>
            <Button className="full-width" onClick={() => setHelpOpen(false)}>
              Let’s make something
              <ArrowRight size={16} />
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
