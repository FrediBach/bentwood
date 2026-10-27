import { Check, X } from 'lucide-react'
import { DesignSidebar } from './components/studio/DesignSidebar'
import { ProjectInputs } from './components/studio/ProjectInputs'
import { SettingsSidebar } from './components/studio/SettingsSidebar'
import { StudioCanvas } from './components/studio/StudioCanvas'
import { StudioDialogs } from './components/studio/StudioDialogs'
import { StudioNavigation } from './components/studio/StudioNavigation'
import { TooltipProvider } from './components/ui/tooltip'
import { useStudio } from './hooks/useStudio'
export default function App() {
  const {
    history,
    design,
    view,
    setView,
    selectedId,
    setSelectedId,
    panel,
    setPanel,
    bend,
    setBend,
    showGrid,
    setShowGrid,
    showCuts,
    setShowCuts,
    camera,
    setCamera,
    resetKey,
    setResetKey,
    exportOpen,
    setExportOpen,
    helpOpen,
    setHelpOpen,
    mobilePanel,
    setMobilePanel,
    notice,
    setNotice,
    saved,
    fileInput,
    svgInput,
    importingSVG,
    pointerHistory,
    plan,
    geometry,
    displayDesign,
    previewShowCuts,
    updating,
    geometryError,
    retryGeometry,
    exporting,
    swatchSize,
    isMeander,
    patternPresets,
    selected,
    total,
    update,
    patch,
    undo,
    redo,
    saveProject,
    changeSegment,
    addSegment,
    applyPreset,
    shape,
    importOutline,
    exportFile,
    exportBendPath,
    exportTestSwatches,
  } = useStudio()
  return (
    <TooltipProvider delayDuration={250}>
      <div className="app-shell">
        <StudioNavigation
          design={design}
          patch={patch}
          saved={saved}
          undo={undo}
          history={history}
          redo={redo}
          fileInput={fileInput}
          saveProject={saveProject}
          setHelpOpen={setHelpOpen}
          setExportOpen={setExportOpen}
          setView={setView}
          setMobilePanel={setMobilePanel}
          setPanel={setPanel}
          view={view}
          mobilePanel={mobilePanel}
        />
        <main className={`workspace mobile-${mobilePanel}`}>
          <DesignSidebar
            panel={panel}
            setPanel={setPanel}
            design={design}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            update={update}
            addSegment={addSegment}
            selected={selected}
            patch={patch}
            changeSegment={changeSegment}
            total={total}
            shape={shape}
            importingSVG={importingSVG}
            svgInput={svgInput}
            setView={setView}
            setMobilePanel={setMobilePanel}
          />

          <StudioCanvas
            pointerHistory={pointerHistory}
            view={view}
            design={design}
            plan={plan}
            geometry={geometry}
            displayDesign={displayDesign}
            previewShowCuts={previewShowCuts}
            updating={updating}
            geometryError={geometryError}
            retryGeometry={retryGeometry}
            bend={bend}
            showGrid={showGrid}
            showCuts={showCuts}
            camera={camera}
            resetKey={resetKey}
            update={update}
            svgInput={svgInput}
            importingSVG={importingSVG}
            setResetKey={setResetKey}
            setShowGrid={setShowGrid}
            setShowCuts={setShowCuts}
            setCamera={setCamera}
            setBend={setBend}
            applyPreset={applyPreset}
          />

          <SettingsSidebar
            design={design}
            patch={patch}
            patternPresets={patternPresets}
            isMeander={isMeander}
            pointerHistory={pointerHistory}
            exportTestSwatches={exportTestSwatches}
            swatchSize={swatchSize}
            setView={setView}
            setMobilePanel={setMobilePanel}
            plan={plan}
            displayDesign={displayDesign}
            updating={updating}
            exporting={exporting}
          />
        </main>
        <footer className="status-bar">
          <span>
            <span className="status-dot" />
            All dimensions in mm
            <span className="geometry-note">
              <span className="status-separator">/</span>Neutral-axis geometry
            </span>
          </span>
          <a
            className="copyright-link"
            href="https://fredibach.com"
            target="_blank"
            rel="noreferrer"
          >
            © 2026 fredi Bach
          </a>
        </footer>
        <ProjectInputs
          fileInput={fileInput}
          update={update}
          setSelectedId={setSelectedId}
          setResetKey={setResetKey}
          setNotice={setNotice}
          svgInput={svgInput}
          importOutline={importOutline}
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
        <StudioDialogs
          exportOpen={exportOpen}
          setExportOpen={setExportOpen}
          design={design}
          plan={plan}
          displayDesign={displayDesign}
          updating={updating}
          exporting={exporting}
          exportFile={exportFile}
          exportBendPath={exportBendPath}
          helpOpen={helpOpen}
          setHelpOpen={setHelpOpen}
        />
      </div>
    </TooltipProvider>
  )
}
