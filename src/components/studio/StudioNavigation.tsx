import {
  ArrowDownToLine,
  ArrowRight,
  Box,
  CircleHelp,
  Copy,
  FileDown,
  FolderOpen,
  Layers3,
  Plus,
  Redo2,
  Ruler,
  Scissors,
  Shapes,
  Trash2,
  TriangleAlert,
  Undo2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { MAX_SHEETS } from '../../lib/project'
import type { Project } from '../../lib/types'
import BrandMark from '../BrandMark'
import { Button } from '../ui/button'
import { Tooltip } from '../ui/tooltip'
import { IconButton } from './StudioControls'
type View = 'preview' | 'outline' | 'plan'

function AssemblyWarning({ warnings }: { warnings: string[] }) {
  const [open, setOpen] = useState(false)
  const openOnPointerDown = useRef(false)
  return (
    <Tooltip
      open={open}
      onOpenChange={setOpen}
      side="bottom"
      contentClassName="assembly-warning-tooltip"
      label={
        <>
          <strong>Assembly warnings</strong>
          <ul>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </>
      }
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="sheet-warning-trigger"
        aria-label="Assembly warnings"
        onPointerDown={() => {
          openOnPointerDown.current = open
        }}
        onClick={(event) => {
          // Also expose the tooltip to touch users, without Radix's click-to-close default.
          event.preventDefault()
          setOpen(event.detail === 0 ? !open : !openOnPointerDown.current)
        }}
      >
        <TriangleAlert size={17} aria-hidden="true" />
      </Button>
    </Tooltip>
  )
}

export function StudioNavigation({
  project,
  patchProjectName,
  activeSheetId,
  setActiveSheetId,
  addSheet,
  duplicateSheet,
  removeSheet,
  assemblyWarnings,
  updating,
  saved,
  undo,
  history,
  redo,
  fileInput,
  saveProject,
  setHelpOpen,
  setExportOpen,
  setView,
  setMobilePanel,
  setPanel,
  view,
  mobilePanel,
}: {
  project: Project
  patchProjectName: (name: string) => void
  activeSheetId: string
  setActiveSheetId: (id: string) => void
  addSheet: () => void
  duplicateSheet: () => void
  removeSheet: (id: string) => void
  assemblyWarnings: string[]
  updating: boolean
  saved: boolean
  undo: () => void
  history: { past: Project[]; present: Project; future: Project[] }
  redo: () => void
  fileInput: React.RefObject<HTMLInputElement | null>
  saveProject: () => void
  setHelpOpen: React.Dispatch<React.SetStateAction<boolean>>
  setExportOpen: React.Dispatch<React.SetStateAction<boolean>>
  setView: React.Dispatch<React.SetStateAction<View>>
  setMobilePanel: React.Dispatch<React.SetStateAction<'design' | 'studio' | 'settings'>>
  setPanel: React.Dispatch<React.SetStateAction<'path' | 'outline'>>
  view: View
  mobilePanel: 'design' | 'studio' | 'settings'
}) {
  const activeTab = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    activeTab.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeSheetId])
  return (
    <>
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
            value={project.name}
            maxLength={60}
            onChange={(e) => patchProjectName(e.target.value)}
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
            <span>Export</span>
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
      <div className="sheet-navigation">
        <span className="sheet-navigation-label">
          <Layers3 size={15} /> Sheets <span>{project.sheets.length}</span>
        </span>
        <div className="sheet-tabs" role="tablist" aria-label="Sheets">
          {project.sheets.map((sheet, index) => (
            <button
              key={sheet.id}
              ref={activeSheetId === sheet.id ? activeTab : undefined}
              id={`sheet-tab-${sheet.id}`}
              type="button"
              role="tab"
              aria-selected={activeSheetId === sheet.id}
              aria-controls="sheet-workspace"
              tabIndex={activeSheetId === sheet.id ? 0 : -1}
              title={sheet.design.name || `Sheet ${index + 1}`}
              onClick={() => setActiveSheetId(sheet.id)}
              onKeyDown={(event) => {
                const direction =
                  event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
                if (!direction && event.key !== 'Home' && event.key !== 'End') return
                event.preventDefault()
                const targetIndex =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? project.sheets.length - 1
                      : (index + direction + project.sheets.length) % project.sheets.length
                const target = project.sheets[targetIndex]
                setActiveSheetId(target.id)
                document.getElementById(`sheet-tab-${target.id}`)?.focus()
              }}
            >
              <span className="sheet-number">{String(index + 1).padStart(2, '0')}</span>
              <span>{sheet.design.name || `Sheet ${index + 1}`}</span>
            </button>
          ))}
        </div>
        <div className="sheet-actions">
          {!updating && assemblyWarnings.length > 0 && (
            <AssemblyWarning warnings={assemblyWarnings} />
          )}
          <IconButton
            label="Add sheet"
            onClick={addSheet}
            disabled={project.sheets.length >= MAX_SHEETS}
          >
            <Plus size={17} />
          </IconButton>
          <IconButton
            label="Duplicate active sheet"
            onClick={duplicateSheet}
            disabled={project.sheets.length >= MAX_SHEETS}
          >
            <Copy size={16} />
          </IconButton>
          <IconButton
            label="Remove active sheet"
            onClick={() => removeSheet(activeSheetId)}
            disabled={project.sheets.length === 1}
          >
            <Trash2 size={16} />
          </IconButton>
        </div>
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
    </>
  )
}
