import { ArrowDownToLine, ArrowRight, MoveUpRight, Scissors, Waves } from 'lucide-react'
import type { CutPlan, Design } from '../../lib/types'
import { CutPlanView } from '../DesignEditors'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'

export function StudioDialogs({
  exportOpen,
  setExportOpen,
  design,
  plan,
  displayDesign,
  updating,
  exporting,
  exportFile,
  exportBendPath,
  helpOpen,
  setHelpOpen,
}: {
  exportOpen: boolean
  setExportOpen: React.Dispatch<React.SetStateAction<boolean>>
  design: Design
  plan: CutPlan | null
  displayDesign: Design | null
  updating: boolean
  exporting: boolean
  exportFile: (format: 'svg' | 'dxf') => void
  exportBendPath: () => void
  helpOpen: boolean
  setHelpOpen: React.Dispatch<React.SetStateAction<boolean>>
}) {
  return (
    <>
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent>
          <div className="dialog-icon">
            <Scissors size={25} />
          </div>
          <DialogTitle>From your screen to your workshop.</DialogTitle>
          <DialogDescription>
            Export your laser cut plan or bend path at 1:1 scale in millimetres. Import without
            scaling.
          </DialogDescription>
          <div className="export-preview" aria-busy={updating}>
            {plan && displayDesign && (
              <CutPlanView design={displayDesign} plan={plan} large={false} />
            )}
          </div>
          {updating && (
            <p className="control-hint">Updating preview. Downloads use your latest settings.</p>
          )}
          {plan && (
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
          )}
          <div className="export-note">
            <strong>Before you cut</strong>
            <p>
              Red outlines and blue hinge lines are cut centre lines. Kerf ({design.kerf} mm) is
              visualized, but no toolpath compensation is applied. Set compensation and laser power
              in your cutter software. Test a material sample first; this preview does not simulate
              strength or springback.
            </p>
            {!updating && plan && plan.warnings.length > 0 && (
              <ul>
                {plan.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
          </div>
          {exporting && (
            <p className="control-hint" aria-live="polite">
              Preparing download…
            </p>
          )}
          <div className="dialog-actions" aria-busy={exporting}>
            <Button variant="outline" disabled={exporting} onClick={() => exportFile('dxf')}>
              <ArrowDownToLine size={16} />
              Download DXF
            </Button>
            <Button disabled={exporting} onClick={() => exportFile('svg')}>
              <ArrowDownToLine size={16} />
              Download SVG
            </Button>
          </div>
          <div className="bend-path-export export-note">
            <strong>A base for your bend</strong>
            <p>
              Download the fully bent panel’s centreline, viewed from above, to lay out a routed
              base. For Shaper Origin, use an on-line cut. This is a single path; set the groove
              width, fit allowance, and depth in your router software for your {design.thickness} mm
              plywood.
            </p>
            <Button
              variant="outline"
              className="full-width"
              disabled={exporting}
              onClick={exportBendPath}
            >
              <ArrowDownToLine size={16} />
              Download bend path SVG
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
                  Choose a panel outline or draw a custom polygon. Its length follows the path. Its
                  width runs across the sheet.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>Give it some give.</h3>
                <p>
                  Choose a hinge pattern and set your plywood thickness. Classic, Graded, Wavy
                  slits, and Zigzag use interrupted cut lines; Small waves removes slender openings
                  to form an interlocking texture. Orbit the preview and unfold it to see the
                  transformation.
                </p>
              </div>
            </li>
            <li>
              <span>04</span>
              <div>
                <h3>Bring it to life.</h3>
                <p>
                  Download test swatches to compare spacing and bridges in your own plywood. Set the
                  separate labels layer to engrave. Then export your panel as SVG or DXF in
                  millimetres; grain, glue, and laser kerf all affect the real bend.
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
    </>
  )
}
