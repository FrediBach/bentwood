import {
  ChevronDown,
  Grid2X2,
  Maximize,
  MousePointer2,
  MoveUpRight,
  Scissors,
  Sparkles,
  Waves,
} from 'lucide-react'
import { presets } from '../../lib/geometry'
import type { CutPlan, Design } from '../../lib/types'
import type { PreviewGeometry } from '../../lib/preview-geometry'
import { CutPlanView, OutlineEditor } from '../DesignEditors'
import PlywoodPreview from '../PlywoodPreview'
import { IconButton, PresetDrawing } from './StudioControls'
type View = 'preview' | 'outline' | 'plan'

export function StudioCanvas({
  pointerHistory,
  view,
  design,
  plan,
  geometry,
  displayDesign,
  previewShowCuts,
  updating,
  geometryError,
  retryGeometry,
  bend,
  showGrid,
  showCuts,
  camera,
  resetKey,
  update,
  svgInput,
  importingSVG,
  setResetKey,
  setShowGrid,
  setShowCuts,
  setCamera,
  setBend,
  applyPreset,
}: {
  pointerHistory: React.RefObject<{ active: boolean; recorded: boolean }>
  view: View
  design: Design
  plan: CutPlan | null
  geometry: PreviewGeometry | null
  displayDesign: Design | null
  previewShowCuts: boolean
  updating: boolean
  geometryError: string
  retryGeometry: () => void
  bend: number
  showGrid: boolean
  showCuts: boolean
  camera: 'perspective' | 'top' | 'front'
  resetKey: number
  update: (next: Design) => void
  svgInput: React.RefObject<HTMLInputElement | null>
  importingSVG: boolean
  setResetKey: React.Dispatch<React.SetStateAction<number>>
  setShowGrid: React.Dispatch<React.SetStateAction<boolean>>
  setShowCuts: React.Dispatch<React.SetStateAction<boolean>>
  setCamera: React.Dispatch<React.SetStateAction<'perspective' | 'top' | 'front'>>
  setBend: React.Dispatch<React.SetStateAction<number>>
  applyPreset: (p: (typeof presets)[number]) => void
}) {
  return (
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
        {view === 'preview' && plan && geometry && displayDesign ? (
          <PlywoodPreview
            design={displayDesign}
            plan={plan}
            geometry={geometry}
            bend={bend}
            showGrid={showGrid}
            showCuts={previewShowCuts}
            view={camera}
            resetKey={resetKey}
          />
        ) : view === 'outline' ? (
          <OutlineEditor
            design={design}
            onChange={update}
            onImportSVG={() => svgInput.current?.click()}
            importingSVG={importingSVG}
          />
        ) : view === 'plan' && plan && displayDesign ? (
          <CutPlanView design={displayDesign} plan={plan} large />
        ) : (
          <div className="geometry-placeholder">Preparing your design…</div>
        )}
        <div
          className="geometry-status"
          aria-live="polite"
          data-geometry-state={geometryError ? 'error' : updating ? 'updating' : 'ready'}
        >
          {geometryError ? (
            <>
              <span>{geometryError}</span>
              <button onClick={retryGeometry}>Retry preview</button>
            </>
          ) : updating ? (
            <span>Updating design…</span>
          ) : null}
        </div>
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
                <select value={camera} onChange={(e) => setCamera(e.target.value as typeof camera)}>
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
              onClick={() => applyPreset(p)}
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
  )
}
