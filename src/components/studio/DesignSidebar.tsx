import * as Tabs from '@radix-ui/react-tabs'
import {
  Circle,
  Layers3,
  MousePointer2,
  MoveUpRight,
  Plus,
  RotateCcw,
  Ruler,
  Shapes,
  Square,
  Triangle,
  Upload,
  Waves,
  X,
} from 'lucide-react'
import { type ReactNode } from 'react'
import { getPanelWidth } from '../../lib/geometry'
import type { Design, OutlineKind, Segment } from '../../lib/types'
import { BendPathEditor } from '../DesignEditors'
import { Button } from '../ui/button'
import { IconButton, NumberField } from './StudioControls'
import { SegmentList } from './SegmentList'
type View = 'preview' | 'outline' | 'plan'

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

export function DesignSidebar({
  panel,
  setPanel,
  design,
  selectedId,
  setSelectedId,
  update,
  addSegment,
  reorderSegment,
  removeSegment,
  convertSegment,
  reverseSegment,
  selected,
  patch,
  changeSegment,
  total,
  shape,
  importingSVG,
  svgInput,
  setView,
  setMobilePanel,
}: {
  panel: 'path' | 'outline'
  setPanel: React.Dispatch<React.SetStateAction<'path' | 'outline'>>
  design: Design
  selectedId: string | null
  setSelectedId: React.Dispatch<React.SetStateAction<string | null>>
  update: (next: Design) => void
  addSegment: (type: 'straight' | 'arc') => void
  reorderSegment: (id: string, targetIndex: number) => void
  removeSegment: (id: string) => void
  convertSegment: (id: string) => void
  reverseSegment: (id: string) => void
  selected: Segment | undefined
  patch: (next: Partial<Design>) => void
  changeSegment: (values: Partial<Segment>) => void
  total: number
  shape: (kind: OutlineKind) => void
  importingSVG: boolean
  svgInput: React.RefObject<HTMLInputElement | null>
  setView: React.Dispatch<React.SetStateAction<View>>
  setMobilePanel: React.Dispatch<React.SetStateAction<'design' | 'studio' | 'settings'>>
}) {
  return (
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
          <SegmentList
            segments={design.segments}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onReorder={reorderSegment}
            onRemove={removeSegment}
            onConvert={convertSegment}
            onReverse={reverseSegment}
          />
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
            <div className="segment-properties" key={selected.id}>
              <div className="section-label">
                <span>{selected.type === 'arc' ? 'CURVE' : 'STRAIGHT'} SETTINGS</span>
                <IconButton
                  label="Remove selected segment"
                  disabled={design.segments.length === 1}
                  onClick={() => removeSegment(selected.id)}
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
                      onChange={(v) => changeSegment({ angle: v * Math.sign(selected.angle || 1) })}
                      min={1}
                      max={270}
                      unit="°"
                    />
                  </div>
                  <div className="direction-control">
                    <span>Bend direction</span>
                    <button
                      aria-label="Reverse bend direction"
                      onClick={() => reverseSegment(selected.id)}
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
          <Button
            variant="outline"
            className="full-width"
            disabled={importingSVG}
            onClick={() => svgInput.current?.click()}
            aria-label="Import SVG outline"
          >
            <Upload size={15} />
            {importingSVG ? 'Importing SVG…' : 'Import SVG outline'}
          </Button>
          <p className="control-hint">
            One closed outline, without holes. Scaled to bend-path length with proportions
            preserved.
          </p>
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
              Drag points, double-click an edge to add a point, or use the coordinate fields in the
              outline view.
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
  )
}
