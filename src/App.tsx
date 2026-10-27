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
    project,
    activeSheet,
    activeSheetId,
    setActiveSheetId,
    addSheet,
    duplicateSheet,
    removeSheet,
    patchProjectName,
    patchPlacement,
    importProject,
    previewSheets,
    assemblyWarnings,
    exportScope,
    setExportScope,
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
    reorderSegment,
    removeSegment,
    convertSegment,
    reverseSegment,
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
          assemblyWarnings={assemblyWarnings}
          updating={updating}
          project={project}
          patchProjectName={patchProjectName}
          activeSheetId={activeSheetId}
          setActiveSheetId={setActiveSheetId}
          addSheet={addSheet}
          duplicateSheet={duplicateSheet}
          removeSheet={removeSheet}
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
        <main
          id="sheet-workspace"
          role="tabpanel"
          aria-labelledby={`sheet-tab-${activeSheetId}`}
          className={`workspace mobile-${mobilePanel}`}
        >
          <DesignSidebar
            key={`design-${activeSheetId}`}
            activeSheet={activeSheet}
            patchPlacement={patchPlacement}
            panel={panel}
            setPanel={setPanel}
            design={design}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            update={update}
            addSegment={addSegment}
            reorderSegment={reorderSegment}
            removeSegment={removeSegment}
            convertSegment={convertSegment}
            reverseSegment={reverseSegment}
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
            activeSheetId={activeSheetId}
            previewSheets={previewSheets}
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
            key={`settings-${activeSheetId}`}
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
          importProject={importProject}
          svgInput={svgInput}
          importOutline={importOutline}
        />
        {notice && (
          <div role="status" aria-label="Notification" className="toast">
            <Check size={17} />
            {notice}
            <button onClick={() => setNotice('')} aria-label="Dismiss notification">
              <X size={15} />
            </button>
          </div>
        )}
        <StudioDialogs
          previewSheets={previewSheets}
          project={project}
          exportScope={exportScope}
          setExportScope={setExportScope}
          assemblyWarnings={assemblyWarnings}
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
