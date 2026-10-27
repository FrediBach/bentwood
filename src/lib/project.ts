import {
  defaultDesign,
  exportBendPathSVG,
  exportDXF,
  exportSVG,
  samplePath,
  segmentLength,
  validateDesign,
} from './geometry'
import { layoutSheets } from './sheet-layout'
import type { Design, Point, Project, Sheet, SheetPlacement } from './types'

export const MAX_SHEETS = 16
export const defaultPlacement: SheetPlacement = { x: 0, y: 0, z: 0, rotation: 0 }
const number = (value: number) => String(Number(value.toFixed(6)))
const xmlEscape = (value: string) =>
  value.replace(
    /[<>&"']/g,
    (character) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]!,
  )

export function createProject(design: Design = defaultDesign): Project {
  return {
    version: 5,
    name: design.name,
    sheets: [
      {
        id: 'sheet-1',
        design: {
          ...design,
          segments: design.segments.map((segment) => ({ ...segment })),
          customOutline: design.customOutline.map((point) => ({ ...point })),
        },
        placement: { ...defaultPlacement },
      },
    ],
  }
}

/** Validate the project envelope; every sheet still passes through validateDesign. */
export function validateProject(input: unknown): Project | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const value = input as Record<string, unknown>
  if (value.version !== 5) {
    const design = validateDesign(input)
    return design ? createProject(design) : null
  }
  if (
    typeof value.name !== 'string' ||
    value.name.length > 100 ||
    !Array.isArray(value.sheets) ||
    value.sheets.length < 1 ||
    value.sheets.length > MAX_SHEETS
  )
    return null
  const ids = new Set<string>()
  const sheets: Sheet[] = []
  for (const candidate of value.sheets) {
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      Array.isArray(candidate) ||
      typeof candidate.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(candidate.id) ||
      ids.has(candidate.id)
    )
      return null
    const design = validateDesign(candidate.design)
    const placement = candidate.placement
    if (!design || !placement || typeof placement !== 'object' || Array.isArray(placement))
      return null
    for (const key of ['x', 'y', 'z', 'rotation'] as const) {
      const bound = key === 'rotation' ? 360 : 10000
      if (
        typeof placement[key] !== 'number' ||
        !Number.isFinite(placement[key]) ||
        Math.abs(placement[key]) > bound
      )
        return null
    }
    ids.add(candidate.id)
    sheets.push({
      id: candidate.id,
      design,
      placement: {
        x: placement.x,
        y: placement.y,
        z: placement.z,
        rotation: placement.rotation,
      },
    })
  }
  return { version: 5, name: value.name, sheets }
}

function sheetDescription(sheet: Sheet) {
  return `${sheet.design.name || 'Untitled sheet'}; material ${sheet.design.material}; thickness ${number(sheet.design.thickness)} mm; nominal kerf ${number(sheet.design.kerf)} mm`
}

function exportSheet(sheet: Sheet, index: number, exporter: (design: Design) => string) {
  try {
    return exporter(sheet.design)
  } catch (error) {
    const name = sheet.design.name ? ` (“${sheet.design.name}”)` : ''
    throw new Error(
      `Sheet ${index + 1}${name}: ${error instanceof Error ? error.message : 'Could not export this sheet.'}`,
    )
  }
}

function svgDocument(
  project: Project,
  width: number,
  height: number,
  description: string,
  body: string,
) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${number(width)}mm" height="${number(height)}mm" viewBox="0 0 ${number(width)} ${number(height)}">
  <title>${xmlEscape(project.name)} — Bentwood project</title>
  <desc>${xmlEscape(description)}</desc>
${body}
</svg>
`
}

function exportProjectSVG(project: Project) {
  const layout = layoutSheets(project.sheets)
  const sheets = layout.sheets.map(({ sheet, x, y }, index) => {
    const source = exportSheet(sheet, index, exportSVG)
    return { sheet, source, x, y, index }
  })
  const groups = ['hinge-cuts', 'outer-contour'].map((id) => {
    const content = sheets.map(({ sheet, source, x, y, index }) => {
      // These are our own canonical exports, never imported markup. Keep their
      // analytic exteriors, kerf-free toolpaths, and upright sheet coordinates.
      const group = source.match(new RegExp(`<g id="${id}"[\\s\\S]*?</g>`))![0]
      return `    <g transform="translate(${number(x)} ${number(y)})">
      <title>${xmlEscape(sheetDescription(sheet))}</title>
      ${group.replace(`id="${id}"`, `id="sheet-${index + 1}-${id}"`)}
    </g>`
    })
    return `  <g id="${id}">\n${content.join('\n')}\n  </g>`
  })
  return svgDocument(
    project,
    layout.length,
    layout.width,
    'Millimetres, 1:1 scale. Sheets laid out side by side with 10 mm gaps; assembly placement is not applied. Red: outer contours. Blue: living hinge cuts. Tool centerlines; no kerf compensation. Each sheet retains its own material and thickness.',
    groups.join('\n'),
  )
}

function exportProjectDXF(project: Project) {
  let header = ''
  const entities = layoutSheets(project.sheets).sheets.map(({ sheet, x }, index) => {
    const source = exportSheet(sheet, index, exportDXF)
    const start = source.indexOf('0\nSECTION\n2\nENTITIES\n') + '0\nSECTION\n2\nENTITIES\n'.length
    if (index === 0)
      header = source
        .slice(0, start)
        .replace(
          /^999\n[^\n]*\n/,
          '999\nBentwood: millimetres, tool centerlines, no kerf compensation. Sheets laid out with 10 mm gaps. Material, thickness, and nominal kerf are recorded per sheet.\n',
        )
    const lines = source.slice(start, source.lastIndexOf('0\nENDSEC\n0\nEOF')).trimEnd().split('\n')
    let entity = ''
    for (let i = 0; i < lines.length; i += 2) {
      const code = lines[i]
      if (code === '0') entity = lines[i + 1]
      // ELLIPSE group 11 is a direction vector, while LINE group 11 is a point.
      // POLYLINE's header origin is not a vertex and must remain at zero.
      if (
        (code === '10' && ['LINE', 'CIRCLE', 'ELLIPSE', 'VERTEX'].includes(entity)) ||
        (code === '11' && entity === 'LINE')
      )
        lines[i + 1] = number(Number(lines[i + 1]) + x)
    }
    return `999\nSheet ${index + 1}: ${sheetDescription(sheet).replace(/[\r\n]/g, ' ')}\n${lines.join('\n')}\n`
  })
  return header + entities.join('') + '0\nENDSEC\n0\nEOF\n'
}

function transformPathPoint(point: Point, placement: SheetPlacement): Point {
  const rotation = (placement.rotation * Math.PI) / 180
  return {
    x: point.x * Math.cos(rotation) + point.y * Math.sin(rotation) + placement.x,
    y: -point.x * Math.sin(rotation) + point.y * Math.cos(rotation) + placement.z,
  }
}

function bendPathBounds(sheet: Sheet): Point[] {
  const { segments } = sheet.design
  const points: Point[] = [transformPathPoint({ x: 0, y: 0 }, sheet.placement)]
  let position = 0
  for (const segment of segments) {
    const length = segmentLength(segment)
    if (segment.type === 'arc') {
      const rotation = (sheet.placement.rotation * Math.PI) / 180
      const start = samplePath(segments, position).angle - rotation
      const turn = (segment.angle * Math.PI) / 180
      const quarter = Math.PI / 2
      for (
        let i = Math.ceil(Math.min(start, start + turn) / quarter);
        i <= Math.floor(Math.max(start, start + turn) / quarter);
        i++
      )
        points.push(
          transformPathPoint(
            samplePath(segments, position + ((i * quarter - start) / turn) * length),
            sheet.placement,
          ),
        )
    }
    position += length
    points.push(transformPathPoint(samplePath(segments, position), sheet.placement))
  }
  return points
}

function exportProjectBendPaths(project: Project) {
  const paths = project.sheets.map((sheet, index) => {
    const source = exportSheet(sheet, index, exportBendPathSVG)
    const path = source.match(/<path [^>]+\/>/)![0]
    const start = path.match(/d="M ([\d.e+-]+) ([\d.e+-]+)/)!
    const { x, z, rotation } = sheet.placement
    return `    <g id="sheet-${index + 1}" transform="translate(${number(x)} ${number(z)}) rotate(${number(-rotation)}) translate(${number(-Number(start[1]))} ${number(-Number(start[2]))})">
      <title>${xmlEscape(sheetDescription(sheet))}</title>
      ${path.replace('id="bend-path"', `id="sheet-${index + 1}-bend-path"`)}
    </g>`
  })
  const bounds = project.sheets.flatMap(bendPathBounds)
  const minX = Math.min(...bounds.map((point) => point.x)) - 1
  const minY = Math.min(...bounds.map((point) => point.y)) - 1
  const width = Math.max(...bounds.map((point) => point.x)) - minX + 1
  const height = Math.max(...bounds.map((point) => point.y)) - minY + 1
  return svgDocument(
    project,
    width,
    height,
    'Millimetres, 1:1 scale. Fully bent top-view panel centrelines (neutral axes) with assembly X/Z positions and rotations. Elevation is omitted. No thickness, cutter, or fit offset. Set groove width and depth in router software. Canvas includes a 1 mm margin.',
    `  <g id="bend-paths" transform="translate(${number(-minX)} ${number(-minY)})">\n${paths.join('\n')}\n  </g>`,
  )
}

/** Run in the geometry worker: all manufacturing geometry remains full resolution. */
export function exportProject(project: Project, format: 'svg' | 'dxf' | 'bend-path'): string {
  if (!validateProject(project)) throw new Error('Open a valid Bentwood project before exporting.')
  if (project.sheets.length === 1) {
    const sheet = project.sheets[0]
    if (format === 'svg') return exportSVG(sheet.design)
    if (format === 'dxf') return exportDXF(sheet.design)
    if (!sheet.placement.x && !sheet.placement.z && !sheet.placement.rotation)
      return exportBendPathSVG(sheet.design)
  }
  if (format === 'svg') return exportProjectSVG(project)
  if (format === 'dxf') return exportProjectDXF(project)
  return exportProjectBendPaths(project)
}
