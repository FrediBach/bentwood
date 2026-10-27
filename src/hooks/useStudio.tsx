import { useEffect, useMemo, useRef, useState } from 'react'
import { defaultDesign, pathLength, presets, validateDesign } from '../lib/geometry'
import { familyPresets } from '../lib/pattern-presets'
import { getTestSwatchSheetSize } from '../lib/test-swatches'
import type { Design, OutlineKind, Segment } from '../lib/types'
import type { ExportFormat } from '../lib/geometry-jobs'
import { useGeometry } from './useGeometry'
type View = 'preview' | 'outline' | 'plan'
// Keep the original key so existing projects migrate in place.
const storageKey = 'bentwood.design.v1'
function loadDesign() {
  try {
    const stored = localStorage.getItem(storageKey)
    return stored ? (validateDesign(JSON.parse(stored)) ?? defaultDesign) : defaultDesign
  } catch {
    return defaultDesign
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
    past: [] as Design[],
    present: loadDesign(),
    future: [] as Design[],
  }))
  const design = history.present
  const [view, setView] = useState<View>('preview')
  const [selectedId, setSelectedId] = useState<string | null>(
    () => design.segments.find((s) => s.type === 'arc')?.id ?? design.segments[0].id,
  )
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
  const currentDesign = useRef(design)
  useEffect(() => {
    currentDesign.current = design
  }, [design])
  const pointerHistory = useRef({ active: false, recorded: false })
  const { client, snapshot, displayDesign, updating, geometryError, retryGeometry } = useGeometry(
    design,
    showCuts,
  )
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
  const filename = (design.name.trim() || 'bentwood-design')
    .replace(/[^a-z0-9-]+/gi, '-')
    .toLowerCase()
  function update(next: Design) {
    if (JSON.stringify(next) === JSON.stringify(design)) return
    if (!validateDesign(next)) {
      setNotice(
        'This design exceeds the supported size or cut density. Reduce dimensions or increase cut spacing.',
      )
      return
    }
    const group = pointerHistory.current.active && pointerHistory.current.recorded
    if (pointerHistory.current.active) pointerHistory.current.recorded = true
    setHistory((h) =>
      JSON.stringify(next) === JSON.stringify(h.present)
        ? h
        : { past: group ? h.past : [...h.past, h.present].slice(-100), present: next, future: [] },
    )
  }
  function patch(next: Partial<Design>) {
    update({ ...design, ...next })
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
    download(JSON.stringify(design, null, 2), `${filename}.bentwood.json`, 'application/json')
    setNotice('Project file downloaded.')
  }
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(design))
      setSaved(true)
    } catch {
      setSaved(false)
    }
  }, [design])
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
    setImportingSVG(true)
    try {
      if (file.size > 1024 * 1024) throw new Error('Choose an SVG file smaller than 1 MB.')
      const [source, { importSVGOutline }] = await Promise.all([
        file.text(),
        import('../lib/svg-outline'),
      ])
      const previous = currentDesign.current
      const result = await importSVGOutline(source, pathLength(previous.segments))
      if (request !== svgImportRequest.current) return
      if (previous !== currentDesign.current)
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
      update(next)
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
      const content = await client.current.export(design, format)
      download(content, `${filename}${suffix}`, type)
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
    applyPreset,
    shape,
    importOutline,
    exportFile,
    exportBendPath,
    exportTestSwatches,
  }
}
