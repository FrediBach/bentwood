import {
  ArrowDownToLine,
  ChevronDown,
  CircleHelp,
  Layers3,
  MoveUpRight,
  Settings2,
} from 'lucide-react'
import type { CutPlan, Design } from '../../lib/types'
import { CutPlanView } from '../DesignEditors'
import { Button } from '../ui/button'
import { NumberField, PatternDrawing, PercentageField } from './StudioControls'
type View = 'preview' | 'outline' | 'plan'
const hingePatterns: { value: Design['pattern']; label: string; description: string }[] = [
  {
    value: 'classic',
    label: 'Classic',
    description: 'Straight staggered cuts, evenly spaced along each curve.',
  },
  {
    value: 'graded',
    label: 'Graded',
    description:
      'Gentler curves use up to 2× wider spacing. A single radius looks like Classic; your cut spacing applies to the tightest curve.',
  },
  {
    value: 'wave',
    label: 'Wavy slits',
    description:
      'Undulating cuts for a flowing texture. Test a swatch to find the right flexibility.',
  },
  {
    value: 'zigzag',
    label: 'Zigzag',
    description:
      'Angular cuts for a geometric texture. Test a swatch to find the right flexibility.',
  },
  {
    value: 'honeycomb',
    label: 'Honeycomb',
    description:
      'Staggered openings run across the sheet width. Adjust their width and roundness from slender diamonds to curved honeycombs.',
  },
  {
    value: 'meander',
    label: 'Meander',
    description:
      'Rounded slits retain material between their overlapping ends. Adjust the overlap and dimensions for fine, wide, or intermediate textures.',
  },
]
export function SettingsSidebar({
  design,
  patch,
  patternPresets,
  isMeander,
  pointerHistory,
  exportTestSwatches,
  swatchSize,
  setView,
  setMobilePanel,
  plan,
}: {
  design: Design
  patch: (next: Partial<Design>) => void
  patternPresets: { id: string; label: string; settings: Partial<Design> }[] | null
  isMeander: boolean
  pointerHistory: React.RefObject<{ active: boolean; recorded: boolean }>
  exportTestSwatches: () => void
  swatchSize: { width: number; height: number }
  setView: React.Dispatch<React.SetStateAction<View>>
  setMobilePanel: React.Dispatch<React.SetStateAction<'design' | 'studio' | 'settings'>>
  plan: CutPlan
}) {
  return (
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
          <span className="mini-badge">{hingePatterns.length} patterns</span>
        </div>
        <fieldset className="pattern-selector" aria-describedby="pattern-description">
          <legend className="sr-only">Hinge pattern</legend>
          {hingePatterns.map((pattern) => (
            <label key={pattern.value} className="pattern-option">
              <input
                className="pattern-radio"
                type="radio"
                name="hinge-pattern"
                value={pattern.value}
                checked={design.pattern === pattern.value}
                onChange={() => patch({ pattern: pattern.value })}
              />
              <span>
                <PatternDrawing pattern={pattern.value} />
                <span>{pattern.label}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <p className="control-hint" id="pattern-description">
          {hingePatterns.find((pattern) => pattern.value === design.pattern)?.description}
        </p>
        {patternPresets && (
          <div className="family-pattern-settings">
            <span className="family-presets-label">Shape presets</span>
            <div className="family-presets">
              {patternPresets.map((preset) => (
                <Button
                  key={preset.id}
                  variant="outline"
                  size="sm"
                  aria-pressed={Object.entries(preset.settings).every(([key, value]) => {
                    const current = design[key as keyof Design]
                    return typeof value === 'number' && typeof current === 'number'
                      ? Math.abs(current - value) < 1e-10
                      : current === value
                  })}
                  onClick={() => patch(preset.settings)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            <p className="control-hint">
              {isMeander
                ? 'Spacing sets row pitch; cut length sets the full slit length across the sheet. End separation sets the transverse gap between overlapping slit ends.'
                : 'Spacing sets row pitch; cut length sets opening length; bridge sets the gap between ends.'}
            </p>
            <div
              className="family-parameters"
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
              {design.pattern === 'honeycomb' ? (
                <>
                  <PercentageField
                    label="Roundness"
                    value={design.honeycombRoundness}
                    onChange={(value) => patch({ honeycombRoundness: value })}
                    hint="Straight diamond sides at 0%; curved honeycomb sides at 100%."
                  />
                  <PercentageField
                    label="Opening width"
                    value={design.honeycombWidth}
                    onChange={(value) => patch({ honeycombWidth: value })}
                    min={10}
                    max={95}
                    hint="Width of each opening as a share of the row spacing."
                  />
                </>
              ) : (
                <PercentageField
                  label="End overlap"
                  value={design.meanderOverlap}
                  onChange={(value) => patch({ meanderOverlap: value })}
                  max={30}
                  hint="How much neighboring slit ends overlap along their length. Lower values spread the repeats farther apart."
                />
              )}
            </div>
          </div>
        )}
        <div className="field-row">
          <NumberField
            label="Cut spacing"
            value={design.spacing}
            onChange={(v) => patch({ spacing: v })}
            min={1}
            max={12}
            step={patternPresets ? 0.01 : 0.5}
          />
          <NumberField
            label={isMeander ? 'End separation' : 'Bridge'}
            value={design.bridge}
            onChange={(v) => patch({ bridge: v })}
            min={0.5}
            max={10}
            step={patternPresets ? 0.01 : 0.5}
          />
        </div>
        <div className="field-row">
          <NumberField
            label="Cut length"
            value={design.cutLength}
            onChange={(v) => patch({ cutLength: v })}
            min={5}
            max={80}
            step={patternPresets ? 0.01 : 1}
          />
        </div>
        <div className="swatch-download">
          <Button
            variant="outline"
            size="sm"
            onClick={exportTestSwatches}
            aria-label="Download test swatches SVG"
          >
            <ArrowDownToLine size={15} /> Test swatches · SVG
          </Button>
          <p className="control-hint">
            9 samples vary spacing and {isMeander ? 'end separation' : 'bridge'} by up to 20%.{' '}
            {swatchSize.width.toFixed(0)} × {swatchSize.height.toFixed(0)} mm at 1:1. Black labels:
            engrave. Red and blue paths: cut.
          </p>
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
  )
}
