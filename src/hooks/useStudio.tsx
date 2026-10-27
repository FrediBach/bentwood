import { useEffect, useMemo, useRef, useState } from 'react'
import { defaultDesign, pathLength, presets, validateDesign } from '../lib/geometry'
import { familyPresets } from '../lib/pattern-presets'
import { convertSegmentType } from '../lib/segment-editing'
import { getTestSwatchSheetSize } from '../lib/test-swatches'
import { createProject, defaultPlacement, MAX_SHEETS, validateProject } from '../lib/project'
import type { Design, OutlineKind, Project, Segment, SheetPlacement } from '../lib/types'
import type { ExportFormat } from '../lib/geometry-jobs'
import { useGeometry } from './useGeometry'
type View = 'preview' | 'outline' | 'plan'
const initialSegment = (design: Design) =>
  design.segments.find((segment) => segment.type === 'arc')?.id ?? design.segments[0].id
// Keep the original key so existing projects migrate in place.
const storageKey = 'bentwood.design.v1'
function loadProject() {
  try {
    const stored = localStorage.getItem(storageKey)
    return stored ? (validateProject(JSON.parse(stored)) ?? createProject()) : createProject()
  } catch {
    return createProject()
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
export function useStudio() {
  const [history, setHistory] = useState(() => ({
    past: [] as Project[],
    present: loadProject(),
    future: [] as Project[],
  }))
  const project = history.present
  const [requestedSheetId, requestSheetId] = useState(() => project.sheets[0].id)
  const activeSheet =
    project.sheets.find((sheet) => sheet.id === requestedSheetId) ?? project.sheets[0]
  const activeSheetId = activeSheet.id
  const design = activeSheet.design
  const [view, setView] = useState<View>('preview')
  const [requestedSelectedId, setSelectedId] = useState<string | null>(() => initialSegment(design))
  const selectedId =
    requestedSelectedId === null || design.segments.some((s) => s.id === requestedSelectedId)
      ? requestedSelectedId
      : design.segments[0].id
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
  const svgInput = useRef<HTMLInputElement>(null)
  const [importingSVG, setImportingSVG] = useState(false)
  const svgImportRequest = useRef(0)
  const projectImportRequest = useRef(0)
  const currentProject = useRef(project)
  const currentDesign = useRef(design)
  const currentSheetId = useRef(activeSheetId)
  useEffect(() => {
    currentDesign.current = design
    currentProject.current = project
    currentSheetId.current = activeSheetId
  }, [design, project, activeSheetId])
  const pointerHistory = useRef({ active: false, recorded: false })
  const {
    client,
    snapshot,
    displayDesign,
    updating,
    geometryError,
    retryGeometry,
    previewSheets,
    assemblyWarnings,
  } = useGeometry(project, activeSheetId, showCuts)
  const [exportScope, setExportScope] = useState<'sheet' | 'project'>('sheet')
  const [exporting, setExporting] = useState(false)
  const exportPending = useRef(false)
  const plan = snapshot?.plan ?? null
  const swatchSize = useMemo(() => getTestSwatchSheetSize(design), [design])
  const isMeander = design.pattern === 'meander'
  const patternPresets =
    design.pattern === 'honeycomb' || design.pattern === 'meander'
      ? familyPresets[design.pattern]
      : null
  const selected = design.segments.find((s) => s.id === selectedId)
  const total = pathLength(design.segments)
  const filename = (name: string) =>
    (name.trim() || 'bentwood-design').replace(/[^a-z0-9-]+/gi, '-').toLowerCase()
  function updateProject(next: Project) {
    if (JSON.stringify(next) === JSON.stringify(project)) return true
    if (!validateProject(next)) {
      setNotice(
        'This project exceeds the supported size or cut density. Reduce dimensions, sheet count, or increase cut spacing.',
      )
      return false
    }
    const group = pointerHistory.current.active && pointerHistory.current.recorded
    if (pointerHistory.current.active) pointerHistory.current.recorded = true
    currentProject.current = next
    currentDesign.current = (
      next.sheets.find((sheet) => sheet.id === activeSheetId) ?? next.sheets[0]
    ).design
    setHistory((h) =>
      JSON.stringify(next) === JSON.stringify(h.present)
        ? h
        : { past: group ? h.past : [...h.past, h.present].slice(-100), present: next, future: [] },
    )
    return true
  }
  function update(next: Design) {
    return updateProject({
      ...project,
      sheets: project.sheets.map((sheet) =>
        sheet.id === activeSheetId ? { ...sheet, design: next } : sheet,
      ),
    })
  }
  function patch(next: Partial<Design>) {
    return update({ ...design, ...next })
  }
  function patchProjectName(name: string) {
    updateProject({ ...project, name })
  }
  function patchPlacement(next: Partial<SheetPlacement>) {
    return updateProject({
      ...project,
      sheets: project.sheets.map((sheet) =>
        sheet.id === activeSheetId
          ? { ...sheet, placement: { ...sheet.placement, ...next } }
          : sheet,
      ),
    })
  }
  function setActiveSheetId(id: string) {
    const sheet = project.sheets.find((sheet) => sheet.id === id)
    if (!sheet) return
    currentSheetId.current = id
    currentDesign.current = sheet.design
    pointerHistory.current.active = false
    requestSheetId(id)
    setSelectedId(initialSegment(sheet.design))
  }
  function insertSheet(copy: boolean) {
    if (project.sheets.length >= MAX_SHEETS) return
    const id = crypto.randomUUID()
    const source = copy ? design : defaultDesign
    let number = project.sheets.length + 1
    while (project.sheets.some((sheet) => sheet.design.name === `Sheet ${number}`)) number++
    const next = {
      id,
      design: {
        ...source,
        name: copy ? `${source.name.slice(0, 94)} copy` : `Sheet ${number}`,
        segments: source.segments.map((segment) => ({ ...segment, id: crypto.randomUUID() })),
        customOutline: source.customOutline.map((point) => ({ ...point })),
      },
      placement: { ...(copy ? activeSheet.placement : defaultPlacement) },
    }
    pointerHistory.current.active = false
    if (updateProject({ ...project, sheets: [...project.sheets, next] })) {
      currentSheetId.current = id
      currentDesign.current = next.design
      requestSheetId(id)
      setSelectedId(initialSegment(next.design))
      setNotice(
        copy
          ? 'Sheet duplicated. Adjust its position to separate it from the original.'
          : 'Sheet added.',
      )
    }
  }
  function removeSheet(id: string) {
    if (project.sheets.length === 1) return
    const index = project.sheets.findIndex((sheet) => sheet.id === id)
    if (index < 0) return
    const sheets = project.sheets.filter((sheet) => sheet.id !== id)
    pointerHistory.current.active = false
    if (updateProject({ ...project, sheets }) && id === activeSheetId) {
      const nextSheet = sheets[Math.min(index, sheets.length - 1)]
      currentSheetId.current = nextSheet.id
      currentDesign.current = nextSheet.design
      requestSheetId(nextSheet.id)
      setSelectedId(initialSegment(nextSheet.design))
    }
  }
  function replaceProject(next: Project) {
    pointerHistory.current.active = false
    if (!updateProject(next)) return false
    currentSheetId.current = next.sheets[0].id
    currentDesign.current = next.sheets[0].design
    requestSheetId(next.sheets[0].id)
    setSelectedId(initialSegment(next.sheets[0].design))
    setResetKey((key) => key + 1)
    return true
  }
  async function importProject(file: File) {
    const request = ++projectImportRequest.current
    const previous = currentProject.current
    const sheetId = currentSheetId.current
    try {
      if (file.size > 1_000_000) throw new Error('File is too large.')
      const parsed = validateProject(JSON.parse(await file.text()))
      if (request !== projectImportRequest.current) return
      if (previous !== currentProject.current || sheetId !== currentSheetId.current)
        throw new Error('The project changed during import. Please open the file again.')
      if (!parsed) throw new Error('This is not a valid Bentwood project.')
      if (replaceProject(parsed)) setNotice('Project opened.')
    } catch (error) {
      if (request === projectImportRequest.current)
        setNotice(error instanceof Error ? error.message : 'Could not open this project.')
    }
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
  useEffect(() => {
    const finishPointerEdit = () => {
      pointerHistory.current.active = false
    }
    window.addEventListener('pointerup', finishPointerEdit)
    window.addEventListener('pointercancel', finishPointerEdit)
    window.addEventListener('blur', finishPointerEdit)
    return () => {
      window.removeEventListener('pointerup', finishPointerEdit)
      window.removeEventListener('pointercancel', finishPointerEdit)
      window.removeEventListener('blur', finishPointerEdit)
    }
  }, [])
  function saveProject() {
    download(
      JSON.stringify(project, null, 2),
      `${filename(project.name)}.bentwood.json`,
      'application/json',
    )
    setNotice('Project file downloaded.')
  }
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(project))
      setSaved(true)
    } catch {
      setSaved(false)
    }
  }, [project])
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
  function reorderSegment(id: string, targetIndex: number) {
    const index = design.segments.findIndex((segment) => segment.id === id)
    if (index < 0 || !Number.isInteger(targetIndex)) return
    const destination = Math.max(0, Math.min(design.segments.length - 1, targetIndex))
    if (index === destination) return
    const segments = [...design.segments]
    const [segment] = segments.splice(index, 1)
    segments.splice(destination, 0, segment)
    patch({ segments })
  }
  function removeSegment(id: string) {
    if (design.segments.length === 1) return
    const index = design.segments.findIndex((segment) => segment.id === id)
    if (index < 0) return
    const segments = design.segments.filter((segment) => segment.id !== id)
    if (patch({ segments }) && selectedId === id)
      setSelectedId(segments[Math.min(index, segments.length - 1)].id)
  }
  function convertSegment(id: string) {
    const segment = design.segments.find((candidate) => candidate.id === id)
    if (!segment) return
    const converted = convertSegmentType(segment)
    if (!converted) {
      setNotice(
        'A straight segment must be between 1 and 2,000 mm. Adjust this curve’s radius or angle before converting it.',
      )
      return
    }
    patch({
      segments: design.segments.map((candidate) => (candidate.id === id ? converted : candidate)),
    })
  }
  function reverseSegment(id: string) {
    patch({
      segments: design.segments.map((segment) =>
        segment.id === id && segment.type === 'arc'
          ? { ...segment, angle: -segment.angle }
          : segment,
      ),
    })
  }
  function applyPreset(p: (typeof presets)[number]) {
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
  async function importOutline(file: File) {
    const request = ++svgImportRequest.current
    const previousProject = currentProject.current
    const previous = currentDesign.current
    const sheetId = currentSheetId.current
    setImportingSVG(true)
    try {
      if (file.size > 1024 * 1024) throw new Error('Choose an SVG file smaller than 1 MB.')
      const [source, { importSVGOutline }] = await Promise.all([
        file.text(),
        import('../lib/svg-outline'),
      ])
      const result = await importSVGOutline(source, pathLength(previous.segments))
      if (request !== svgImportRequest.current) return
      if (previousProject !== currentProject.current || sheetId !== currentSheetId.current)
        throw new Error('The design changed during import. Please import the SVG again.')
      const next: Design = {
        ...previous,
        outline: 'custom',
        customOutline: result.points,
        width: result.width,
        outlineCornerRadius: 0,
      }
      if (!validateDesign(next))
        throw new Error(
          'This outline exceeds the supported panel size or cut density. Shorten the bend path or increase cut spacing, then import again.',
        )
      if (!update(next)) return
      setPanel('outline')
      setView('outline')
      setMobilePanel('studio')
      setResetKey((key) => key + 1)
      setNotice(
        `SVG outline imported. Scaled to ${pathLength(next.segments).toFixed(1)} × ${next.width.toFixed(1)} mm, with proportions preserved.${result.warning ? ` ${result.warning}` : ''}`,
      )
    } catch (error) {
      if (request === svgImportRequest.current)
        setNotice(
          error instanceof Error ? error.message : 'This SVG outline could not be imported.',
        )
    } finally {
      if (request === svgImportRequest.current) setImportingSVG(false)
    }
  }
  async function runExport(format: ExportFormat, suffix: string, type: string, message: string) {
    if (exportPending.current || !client.current) return
    exportPending.current = true
    setExporting(true)
    try {
      // Capture the exact design and filename at the click, even if editing continues.
      const allSheets = exportScope === 'project' && format !== 'swatches'
      const exportFilename = filename(allSheets ? project.name : design.name)
      const content = allSheets
        ? await client.current.exportProject(project, format)
        : await client.current.export(design, format)
      download(content, `${exportFilename}${allSheets ? '-all-sheets' : ''}${suffix}`, type)
      setNotice(message)
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError'))
        setNotice(error instanceof Error ? error.message : 'The design could not be exported.')
    } finally {
      exportPending.current = false
      setExporting(false)
    }
  }
  function exportFile(format: 'svg' | 'dxf') {
    void runExport(
      format,
      `.${format}`,
      format === 'svg' ? 'image/svg+xml' : 'application/dxf',
      `${format.toUpperCase()} cut plan downloaded at 1:1 scale.`,
    )
  }
  function exportBendPath() {
    void runExport(
      'bend-path',
      '-bend-path.svg',
      'image/svg+xml',
      'Bend path SVG downloaded at 1:1 scale.',
    )
  }
  function exportTestSwatches() {
    void runExport(
      'swatches',
      `-${design.pattern}-test-swatches.svg`,
      'image/svg+xml',
      'Test swatches downloaded at 1:1 scale. Set the labels layer to engrave in your laser software.',
    )
  }
  return {
    history,
    project,
    activeSheet,
    activeSheetId,
    setActiveSheetId,
    addSheet: () => insertSheet(false),
    duplicateSheet: () => insertSheet(true),
    removeSheet,
    patchProjectName,
    patchPlacement,
    replaceProject,
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
    geometry: snapshot?.geometry ?? null,
    displayDesign,
    previewShowCuts: snapshot?.showCuts ?? showCuts,
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
  }
}
