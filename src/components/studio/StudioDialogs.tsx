import { ArrowDownToLine, ArrowRight, MoveUpRight, Scissors, Waves } from 'lucide-react'
import type { CutPlan, Design, Project } from '../../lib/types'
import type { PreparedSheet } from '../../lib/geometry-jobs'
import { layoutSheets } from '../../lib/sheet-layout'
import { CutPlanView, ProjectCutPlanView } from '../DesignEditors'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'

export function StudioDialogs({
  exportOpen,
  setExportOpen,
  design,
  project,
  exportScope,
  setExportScope,
  assemblyWarnings,
  previewSheets,
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
  project: Project
  exportScope: 'sheet' | 'project'
  setExportScope: React.Dispatch<React.SetStateAction<'sheet' | 'project'>>
  assemblyWarnings: string[]
  previewSheets: PreparedSheet[]
  plan: CutPlan | null
  displayDesign: Design | null
  updating: boolean
  exporting: boolean
  exportFile: (format: 'svg' | 'dxf') => void
  exportBendPath: () => void
  helpOpen: boolean
  setHelpOpen: React.Dispatch<React.SetStateAction<boolean>>
}) {
  const exportWarnings =
    exportScope === 'project'
      ? previewSheets.flatMap((sheet, index) =>
          sheet.plan.warnings.map(
            (warning) => `${sheet.design.name || `Sheet ${index + 1}`}: ${warning}`,
          ),
        )
      : (plan?.warnings ?? [])
  const layout = layoutSheets(previewSheets)
  const exportLength = exportScope === 'project' ? layout.length : plan?.length
  const exportWidth = exportScope === 'project' ? layout.width : plan?.width
  const exportCuts =
    exportScope === 'project'
      ? previewSheets.reduce((count, sheet) => count + sheet.plan.cuts.length, 0)
      : plan?.cuts.length
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
          <fieldset className="export-scope">
            <legend>Sheets to export</legend>
            <label>
              <input
                type="radio"
                name="export-scope"
                value="sheet"
                checked={exportScope === 'sheet'}
                onChange={() => setExportScope('sheet')}
              />
              <span>
                Active sheet <small>{design.name || 'Untitled sheet'}</small>
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="export-scope"
                value="project"
                checked={exportScope === 'project'}
                onChange={() => setExportScope('project')}
              />
              <span>
                All sheets <small>{project.sheets.length} in this project</small>
              </span>
            </label>
          </fieldset>
          {exportScope === 'project' && (
            <p className="control-hint">
              Laser plans are arranged side by side with a 10 mm gap. Sheets retain their own
              material and cut settings; cut different materials separately.
            </p>
          )}
          <div className="export-preview" aria-busy={updating}>
            {exportScope === 'project' ? (
              <ProjectCutPlanView name={project.name} sheets={previewSheets} />
            ) : plan && displayDesign ? (
              <CutPlanView design={displayDesign} plan={plan} large={false} />
            ) : null}
          </div>
          {exportScope === 'project' && (
            <p className="control-hint">
              Preview: all sheets, in the exported laser layout. SVG files keep their physical size;
              zoom out in your viewer to see the full layout.
            </p>
          )}
          {updating && (
            <p className="control-hint">Updating preview. Downloads use your latest settings.</p>
          )}
          {plan && (
            <div className="export-stats">
              <span>
                <strong>
                  {exportLength?.toFixed(1)} × {exportWidth?.toFixed(1)}
                </strong>
                {exportScope === 'project' ? 'mm export layout' : 'mm sheet size'}
              </span>
              <span>
                <strong>{exportCuts}</strong>hinge cuts
              </span>
              <span>
                <strong>
                  {exportScope === 'project' ? project.sheets.length : design.thickness}
                </strong>
                {exportScope === 'project' ? 'sheets' : 'mm plywood'}
              </span>
            </div>
          )}
          <div className="export-note">
            <strong>Before you cut</strong>
            <p>
              Red outlines and blue hinge lines are cut centre lines. Kerf{' '}
              {exportScope === 'sheet' ? `(${design.kerf} mm) ` : ''}is visualized, but no toolpath
              compensation is applied. Set compensation and laser power in your cutter software.
              Test a material sample first; this preview does not simulate strength or springback.
            </p>
            {!updating && exportWarnings.length > 0 && (
              <ul>
                {exportWarnings.map((warning, index) => (
                  <li key={`${index}-${warning}`}>{warning}</li>
                ))}
              </ul>
            )}
            {!updating && exportScope === 'project' && assemblyWarnings.length > 0 && (
              <ul aria-label="Assembly warnings">
                {assemblyWarnings.map((warning) => (
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
              {exportScope === 'project'
                ? 'Download every sheet’s fully bent centreline in its assembly position, viewed from above. Height is not included in this top view. '
                : 'Download the fully bent panel’s centreline, viewed from above, to lay out a routed base. '}
              For Shaper Origin, use an on-line cut. Set groove width, fit allowance, and depth in
              your router software for each sheet’s plywood.
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
            Build with sheets of plywood, each with its own shape, bend path, material, and cuts.
          </DialogDescription>
          <ol className="guide-steps">
            <li>
              <span>01</span>
              <div>
                <h3>Find your curve.</h3>
                <p>
                  Start with a preset, then add straight sections and curves. Select a segment to
                  set its length, radius, angle, and direction. Use the sheet tabs to add,
                  duplicate, or switch sheets; each sheet keeps its own settings.
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>Make your mark.</h3>
                <p>
                  Choose a panel outline or draw a custom polygon. Its length follows the path. Its
                  width runs across the sheet. Position sheets in the assembly using the Design
                  panel; warnings identify sheets that overlap when fully bent.
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
                  separate labels layer to engrave. Export one sheet or all sheets as SVG or DXF in
                  millimetres. Save a project file to keep every sheet and its position.
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
