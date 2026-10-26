import {
  ArrowDownToLine,
  ArrowRight,
  Box,
  CircleHelp,
  FileDown,
  FolderOpen,
  Redo2,
  Ruler,
  Scissors,
  Shapes,
  Undo2,
} from 'lucide-react'
import type { Design } from '../../lib/types'
import BrandMark from '../BrandMark'
import { Button } from '../ui/button'
import { IconButton } from './StudioControls'
type View = 'preview' | 'outline' | 'plan'

export function StudioNavigation({
  design,
  patch,
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
  design: Design
  patch: (next: Partial<Design>) => void
  saved: boolean
  undo: () => void
  history: { past: Design[]; present: Design; future: Design[] }
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
    </>
  )
}
