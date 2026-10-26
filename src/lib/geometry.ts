import type { CutLine, CutPlan, Design, PathSample, Point, Segment } from './types'
import { cutPathData, cutPathLength, getCutPoints } from './cut-path'
import { createCutoutLattice, smallWaveCell } from './cutout-lattice'
import { honeycombCell, honeycombClearance } from './honeycomb'
import { createMeanderLattice, meanderCell, meanderClearance, meanderRepeat } from './meander'
import {
  clipPatternColumn,
  MAX_PATTERN_SEGMENTS,
  patternColumn,
  patternShape,
  slicePatternSpan,
} from './hinge-patterns'

const TAU = Math.PI * 2
const EPS = 1e-7
const radians = (degrees: number) => (degrees * Math.PI) / 180
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const cross = (a: Point, b: Point, c: Point) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)

export const presets: { id: string; name: string; description: string; segments: Segment[] }[] = [
  {
    id: 'sweep',
    name: 'The sweep',
    description: 'A soft, continuous return',
    segments: [
      { id: 's1', type: 'straight', length: 75 },
      { id: 's2', type: 'arc', radius: 50, angle: 180 },
      { id: 's3', type: 'straight', length: 75 },
    ],
  },
  {
    id: 'wave',
    name: 'The wave',
    description: 'Two curves, one flowing form',
    segments: [
      { id: 's1', type: 'straight', length: 35 },
      { id: 's2', type: 'arc', radius: 55, angle: 110 },
      { id: 's3', type: 'arc', radius: 55, angle: -110 },
      { id: 's4', type: 'straight', length: 35 },
    ],
  },
  {
    id: 'arch',
    name: 'The arch',
    description: 'A single generous curve',
    segments: [{ id: 's1', type: 'arc', radius: 85, angle: 150 }],
  },
  {
    id: 'bracket',
    name: 'The corner',
    description: 'Two flats with a rounded bend',
    segments: [
      { id: 's1', type: 'straight', length: 100 },
      { id: 's2', type: 'arc', radius: 30, angle: 90 },
      { id: 's3', type: 'straight', length: 100 },
    ],
  },
]

export const defaultDesign: Design = {
  version: 3,
  name: 'Untitled form',
  segments: presets[0].segments.map((segment) => ({ ...segment })),
  outline: 'rectangle',
  width: 140,
  customOutline: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ],
  thickness: 3,
  material: 'birch',
  spacing: 3,
  bridge: 2,
  cutLength: 24,
  kerf: 0.15,
  pattern: 'classic',
}

export function segmentLength(segment: Segment): number {
  return segment.type === 'straight'
    ? segment.length
    : segment.radius * Math.abs(radians(segment.angle))
}

export function pathLength(segments: Segment[]): number {
  return segments.reduce((sum, segment) => sum + segmentLength(segment), 0)
}

/** Coordinates are on the sheet's neutral axis. The returned tangent angle is radians. */
export function samplePath(segments: Segment[], position: number): PathSample {
  const s = Math.max(0, Math.min(pathLength(segments), position))
  let remaining = s
  let x = 0
  let y = 0
  let angle = 0
  let curved = false
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    const length = segmentLength(segment)
    const travel = Math.min(remaining, length)
    curved = segment.type === 'arc'
    if (segment.type === 'straight') {
      x += travel * Math.cos(angle)
      y += travel * Math.sin(angle)
    } else {
      const direction = Math.sign(segment.angle) || 1
      const turn = (travel / segment.radius) * direction
      x += (segment.radius / direction) * (Math.sin(angle + turn) - Math.sin(angle))
      y += (segment.radius / direction) * (Math.cos(angle) - Math.cos(angle + turn))
      angle += turn
    }
    remaining -= travel
    if (remaining <= EPS) break
  }
  return { x, y, angle, s, curved }
}

export function getPanelWidth(design: Design): number {
  return design.outline === 'square' || design.outline === 'circle'
    ? pathLength(design.segments)
    : design.width
}

export function getOutline(design: Design): Point[] {
  const length = pathLength(design.segments)
  const width = getPanelWidth(design)
  if (design.outline === 'circle' || design.outline === 'ellipse') {
    return Array.from({ length: 128 }, (_, index) => {
      const angle = (index / 128) * TAU
      return { x: (length / 2) * (1 + Math.cos(angle)), y: (width / 2) * (1 + Math.sin(angle)) }
    })
  }
  if (design.outline === 'triangle')
    return [
      { x: 0, y: width },
      { x: length / 2, y: 0 },
      { x: length, y: width },
    ]
  if (design.outline === 'custom')
    return design.customOutline.map((point) => ({ x: point.x * length, y: point.y * width }))
  return [
    { x: 0, y: 0 },
    { x: length, y: 0 },
    { x: length, y: width },
    { x: 0, y: width },
  ]
}

function onSegment(a: Point, b: Point, p: Point) {
  return (
    Math.abs(cross(a, b, p)) < EPS &&
    p.x >= Math.min(a.x, b.x) - EPS &&
    p.x <= Math.max(a.x, b.x) + EPS &&
    p.y >= Math.min(a.y, b.y) - EPS &&
    p.y <= Math.max(a.y, b.y) + EPS
  )
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const abC = cross(a, b, c)
  const abD = cross(a, b, d)
  const cdA = cross(c, d, a)
  const cdB = cross(c, d, b)
  return (
    (abC * abD < -EPS && cdA * cdB < -EPS) ||
    onSegment(a, b, c) ||
    onSegment(a, b, d) ||
    onSegment(c, d, a) ||
    onSegment(c, d, b)
  )
}

export function isSimplePolygon(points: Point[]): boolean {
  if (
    points.length < 3 ||
    points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))
  )
    return false
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    if (distance(a, b) <= EPS) return false
    area += a.x * b.y - b.x * a.y
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue
      if (segmentsIntersect(a, b, points[j], points[(j + 1) % points.length])) return false
    }
  }
  return Math.abs(area) > EPS
}

/** All inside spans where a vertical line meets a possibly concave polygon. */
function polygonIntervals(polygon: Point[], x: number): [number, number][] {
  const crossings: number[] = []
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    if ((a.x <= x && b.x > x) || (b.x <= x && a.x > x))
      crossings.push(a.y + ((x - a.x) * (b.y - a.y)) / (b.x - a.x))
  }
  crossings.sort((a, b) => a - b)
  const result: [number, number][] = []
  for (let i = 0; i + 1 < crossings.length; i += 2)
    if (crossings[i + 1] - crossings[i] > EPS) result.push([crossings[i], crossings[i + 1]])
  return result
}

/** Exact cross sections keep the hinge connected to analytic exported ellipses. */
function outlineIntervals(design: Design, polygon: Point[], x: number): [number, number][] {
  if (design.outline !== 'circle' && design.outline !== 'ellipse')
    return polygonIntervals(polygon, x)
  const radiusX = pathLength(design.segments) / 2
  const radiusY = getPanelWidth(design) / 2
  const normalizedX = (x - radiusX) / radiusX
  if (Math.abs(normalizedX) >= 1) return []
  const offset = radiusY * Math.sqrt(Math.max(0, 1 - normalizedX * normalizedX))
  return [[radiusY - offset, radiusY + offset]]
}

/**
 * Cuts are the complement of complete interior bridges: no perimeter rail remains.
 * A bridge crossing the outline is omitted, so an edge cut can be up to one bridge
 * longer than the nominal cut length. Short spans retain one staggered bridge.
 */
function edgeOpenCuts(
  x: number,
  lower: number,
  upper: number,
  column: number,
  design: Design,
): CutLine[] | null {
  const bridge = design.bridge
  const minimumCut = Math.max(0.2, design.kerf)
  const span = upper - lower
  // Adjacent staggered bridges must not overlap into another continuous rail.
  if (span < 2 * bridge + 3 * minimumCut - EPS) return null
  const period = design.cutLength + bridge
  const offset = column % 2 ? period / 2 : 0
  const bridges: [number, number][] = []
  const first = Math.floor((lower - offset - design.cutLength) / period)
  for (let index = first; ; index++) {
    const start = offset + design.cutLength + index * period
    if (start >= upper) break
    const end = start + bridge
    if (span > period + EPS && start > lower + EPS && end < upper - EPS) {
      // Preserve a nonzero segment after six-decimal SVG/DXF serialization.
      const adjustedStart = Math.max(lower + 0.00001, Math.min(upper - bridge - 0.00001, start))
      bridges.push([adjustedStart, adjustedStart + bridge])
    }
  }
  if (!bridges.length) {
    // Without a bridge a short outline section would be sliced right through.
    const freeLength = span - bridge
    const separation = Math.max(bridge + minimumCut, freeLength / 3)
    const start = lower + freeLength / 2 + ((column % 2 ? 1 : -1) * separation) / 2
    bridges.push([start, start + bridge])
  }
  const cuts: CutLine[] = []
  let cursor = lower
  for (const [start, end] of bridges) {
    cuts.push({ x, y1: cursor, y2: start })
    cursor = end
  }
  cuts.push({ x, y1: cursor, y2: upper })
  return cuts
}

function pathOverlaps(segments: Segment[]): boolean {
  const length = pathLength(segments)
  const count = Math.min(320, Math.max(2, Math.ceil(length / 3)))
  const points = Array.from({ length: count + 1 }, (_, i) =>
    samplePath(segments, (length * i) / count),
  )
  for (let i = 0; i < count; i++) {
    for (let j = i + 3; j < count; j++) {
      if (segmentsIntersect(points[i], points[i + 1], points[j], points[j + 1])) return true
    }
  }
  return false
}

export function createCutPlan(design: Design): CutPlan {
  const length = pathLength(design.segments)
  const width = getPanelWidth(design)
  const outline = getOutline(design)
  const warnings: string[] = []
  const cuts: CutLine[] = []
  let cutouts: Point[][] | undefined
  const validOutline = isSimplePolygon(outline)
  if (!validOutline)
    warnings.push('The outline crosses itself or has no area. Adjust its points before exporting.')
  if (
    design.segments.some(
      (segment) => segment.type === 'arc' && segment.radius < design.thickness * 8,
    )
  )
    warnings.push(
      'A tight bend may strain the plywood. Test a sample with this material and grain direction.',
    )
  if (pathOverlaps(design.segments))
    warnings.push('The bend path crosses itself. The assembled panel may collide.')
  const shaped = design.pattern === 'wave' || design.pattern === 'zigzag'
  const meander = design.pattern === 'meander' || design.pattern === 'meander-wide'
  const motif = meander ? meanderCell(design) : undefined
  const cell =
    design.pattern === 'honeycomb'
      ? honeycombCell(design)
      : design.pattern === 'small-wave'
        ? smallWaveCell(design)
        : undefined
  const shape = patternShape(design)
  const minimumSpacing = meander
    ? meanderClearance(design, motif!)
    : design.pattern === 'honeycomb'
      ? honeycombClearance(design, cell!)
      : design.pattern === 'small-wave'
        ? design.spacing / 2
        : shaped
          ? (design.spacing - shape.amplitude) / Math.hypot(1, shape.slope)
          : design.spacing
  if (minimumSpacing <= design.kerf || design.bridge <= design.kerf)
    warnings.push(
      meander
        ? 'The laser kerf reaches a neighboring meander cut. Adjust spacing, end separation, or cut length before exporting.'
        : 'The laser kerf is as wide as a ligament or bridge. Increase spacing or bridge size before exporting.',
    )
  const period = Math.max(0.5, meander ? meanderRepeat(design) : design.cutLength + design.bridge)
  const spacing = Math.max(0.5, design.spacing)
  const estimatedCuts =
    (design.segments
      .filter((segment) => segment.type === 'arc')
      .reduce((sum, segment) => sum + segmentLength(segment), 0) /
      spacing) *
    (width / period + 2)
  if (estimatedCuts > 50000)
    warnings.push(
      'This pattern exceeds 50,000 cuts. Increase spacing or cut length before exporting.',
    )
  const estimatedSegments = shaped
    ? design.segments
        .filter((s) => s.type === 'arc')
        .reduce((sum, s) => sum + segmentLength(s) / spacing, 0) *
      ((width / shape.period) * shape.samples + 2 * (width / period + 2))
    : motif
      ? (motif.length - 1) * estimatedCuts
      : cell
        ? cell.length * estimatedCuts
        : estimatedCuts
  if (estimatedSegments > MAX_PATTERN_SEGMENTS)
    warnings.push(
      'This pattern exceeds 250,000 toolpath segments. Increase spacing or cut length before exporting.',
    )
  const minimumRadius = Math.min(
    ...design.segments.filter((s) => s.type === 'arc').map((s) => s.radius),
  )
  let skippedNarrowSpans = false
  const canGenerate =
    validOutline && estimatedCuts <= 50000 && estimatedSegments <= MAX_PATTERN_SEGMENTS
  if (canGenerate && motif) {
    if (minimumSpacing > design.kerf && design.bridge > design.kerf) {
      const result = createMeanderLattice(design, outline, length, width, motif)
      cuts.push(...result.cuts)
      if (result.limit)
        warnings.push(
          result.limit === 'cuts'
            ? 'This pattern exceeds 50,000 cuts. Increase spacing or cut length before exporting.'
            : 'This pattern exceeds 250,000 toolpath segments. Increase spacing or cut length before exporting.',
        )
      if (result.skipped)
        warnings.push(
          'Some meanders cross narrow outline sections. Those cuts remain uncut to keep the sheet connected.',
        )
    }
  } else if (canGenerate && cell) {
    const result = createCutoutLattice(design, outline, length, width, cell)
    cuts.push(...result.cuts)
    cutouts = result.cutouts
    if (result.limit)
      warnings.push(
        result.limit === 'cuts'
          ? 'This pattern exceeds 50,000 cuts. Increase spacing or cut length before exporting.'
          : 'This pattern exceeds 250,000 toolpath segments. Increase spacing or cut length before exporting.',
      )
    if (result.skipped)
      warnings.push(
        'Some openings cross narrow outline sections. Those openings remain uncut to keep the sheet connected.',
      )
  } else if (canGenerate) {
    let start = 0
    let previousColumn = -Infinity
    let bridgePhase = 0
    let toolpathSegments = 0
    generation: for (const segment of design.segments) {
      const segmentSize = segmentLength(segment)
      if (segment.type === 'arc') {
        const localSpacing =
          design.pattern === 'graded'
            ? spacing * Math.min(2, segment.radius / minimumRadius)
            : spacing
        for (let column = 0; (column + 0.5) * localSpacing < segmentSize; column++) {
          const localX = (column + 0.5) * localSpacing
          const x = start + localX
          const boundaryDistance = Math.min(localX, segmentSize - localX)
          // Independent arc grids can otherwise put two cuts almost on top of
          // one another at a join. Carry both clearance and bridge phase across.
          if (x - previousColumn < spacing - EPS) continue
          if (shaped && boundaryDistance <= shape.edgeClearance) continue
          previousColumn = x
          const phase = bridgePhase++
          const spans = shaped
            ? clipPatternColumn(
                patternColumn(design, x, width, boundaryDistance),
                outline,
                design.outline === 'circle' || design.outline === 'ellipse',
                length,
                width,
              )
            : outlineIntervals(design, outline, x).map(([lower, upper]) => [
                { x, y: lower },
                { x, y: upper },
              ])
          for (const span of spans) {
            const lower = span[0].y,
              upper = span.at(-1)!.y
            const columnCuts = edgeOpenCuts(x, lower, upper, phase, design)
            if (columnCuts) {
              const paths = columnCuts.map((cut) =>
                shaped ? { ...cut, points: slicePatternSpan(span, cut.y1, cut.y2) } : cut,
              )
              toolpathSegments += paths.reduce((sum, cut) => sum + getCutPoints(cut).length - 1, 0)
              if (cuts.length + paths.length > 50000 || toolpathSegments > MAX_PATTERN_SEGMENTS) {
                warnings.push(
                  cuts.length + paths.length > 50000
                    ? 'This pattern exceeds 50,000 cuts. Increase spacing or cut length before exporting.'
                    : 'This pattern exceeds 250,000 toolpath segments. Increase spacing or cut length before exporting.',
                )
                cuts.length = 0
                break generation
              }
              cuts.push(...paths)
            } else skippedNarrowSpans = true
          }
        }
      }
      start += segmentSize
    }
  }
  if (skippedNarrowSpans)
    warnings.push(
      'Some narrow outline sections cannot fit separated staggered bridges. Those sections remain uncut; widen them or reduce the bridge size.',
    )
  if (
    validOutline &&
    !cuts.length &&
    design.segments.some((segment) => segment.type === 'arc') &&
    !warnings.some(
      (warning) =>
        warning.includes('50,000') || warning.includes('250,000') || warning.includes('laser kerf'),
    )
  )
    warnings.push(
      'No hinge cuts fit inside the outline. Increase the panel size or reduce the bridge size.',
    )
  const perimeter = outline.reduce(
    (sum, point, i) => sum + distance(point, outline[(i + 1) % outline.length]),
    0,
  )
  return {
    length,
    width,
    outline,
    cuts,
    ...(cutouts && { cutouts }),
    cutLength: perimeter + cuts.reduce((sum, cut) => sum + cutPathLength(cut), 0),
    warnings,
  }
}

const number = (value: number) => Number(value.toFixed(6)).toString()
const xmlEscape = (value: string) =>
  value.replace(
    /[<>&"']/g,
    (character) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]!,
  )

export function createExportPlan(design: Design) {
  const plan = createCutPlan(design)
  if (!isSimplePolygon(plan.outline)) throw new Error('Fix the outline before exporting.')
  if (plan.warnings.some((warning) => warning.includes('50,000') || warning.includes('250,000')))
    throw new Error('Reduce the number of hinge cuts before exporting.')
  if (plan.warnings.some((warning) => warning.includes('laser kerf')))
    throw new Error(
      design.pattern === 'meander' || design.pattern === 'meander-wide'
        ? 'Adjust spacing, end separation, or cut length so the laser kerf leaves connected material before exporting.'
        : 'Increase spacing or bridge size so the laser kerf leaves connected material before exporting.',
    )
  return plan
}

/** SVG drawing units are millimetres. Paths are tool centerlines; no kerf offset is applied. */
export function exportSVG(design: Design): string {
  const plan = createExportPlan(design)
  const ellipse = design.outline === 'circle' || design.outline === 'ellipse'
  const outlinePath = ellipse
    ? `M0 ${number(plan.width / 2)} A${number(plan.length / 2)} ${number(plan.width / 2)} 0 1 0 ${number(plan.length)} ${number(plan.width / 2)} A${number(plan.length / 2)} ${number(plan.width / 2)} 0 1 0 0 ${number(plan.width / 2)} Z`
    : plan.outline
        .map((point, i) => `${i ? 'L' : 'M'}${number(point.x)} ${number(point.y)}`)
        .join(' ') + ' Z'
  const slots = plan.cuts.map((cut) => `    <path d="${cutPathData(cut)}"/>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${number(plan.length)}mm" height="${number(plan.width)}mm" viewBox="0 0 ${number(plan.length)} ${number(plan.width)}">\n  <title>${xmlEscape(design.name)} — Bentwood laser cut plan</title>\n  <desc>Millimetres. Red: outer contour. Blue: living hinge cuts. Tool centerlines; no kerf compensation. Material ${design.material}, thickness ${number(design.thickness)} mm, nominal kerf ${number(design.kerf)} mm. Test material before production.</desc>\n  <g id="hinge-cuts" fill="none" stroke="#0000ff" stroke-width="0.01">\n${slots}\n  </g>\n  <g id="outer-contour" fill="none" stroke="#ff0000" stroke-width="0.01">\n    <path d="${outlinePath}"/>\n  </g>\n</svg>\n`
}

/** R2000 ASCII DXF with millimetre insertion units and distinct cut layers. */
export function exportDXF(design: Design): string {
  const plan = createExportPlan(design)
  const parts = [
    '999',
    `Bentwood: millimetres, tool centerlines, no kerf compensation. Thickness ${number(design.thickness)} mm; nominal kerf ${number(design.kerf)} mm.`,
    '0',
    'SECTION',
    '2',
    'HEADER',
    '9',
    '$ACADVER',
    '1',
    'AC1015',
    '9',
    '$INSUNITS',
    '70',
    '4',
    '9',
    '$MEASUREMENT',
    '70',
    '1',
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'TABLES',
    '0',
    'TABLE',
    '2',
    'LAYER',
    '100',
    'AcDbSymbolTable',
    '70',
    '2',
    '0',
    'LAYER',
    '100',
    'AcDbSymbolTableRecord',
    '100',
    'AcDbLayerTableRecord',
    '2',
    'OUTER_CONTOUR',
    '70',
    '0',
    '62',
    '1',
    '6',
    'CONTINUOUS',
    '0',
    'LAYER',
    '100',
    'AcDbSymbolTableRecord',
    '100',
    'AcDbLayerTableRecord',
    '2',
    'HINGE_CUTS',
    '70',
    '0',
    '62',
    '5',
    '6',
    'CONTINUOUS',
    '0',
    'ENDTAB',
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'ENTITIES',
  ]
  const line = (layer: string, a: Point, b: Point) =>
    parts.push(
      '0',
      'LINE',
      '100',
      'AcDbEntity',
      '8',
      layer,
      '100',
      'AcDbLine',
      '10',
      number(a.x),
      '20',
      number(plan.width - a.y),
      '30',
      '0',
      '11',
      number(b.x),
      '21',
      number(plan.width - b.y),
      '31',
      '0',
    )
  for (const cut of plan.cuts) {
    const points = getCutPoints(cut)
    for (let i = 1; i < points.length; i++) line('HINGE_CUTS', points[i - 1], points[i])
  }
  if (design.outline === 'circle') {
    parts.push(
      '0',
      'CIRCLE',
      '100',
      'AcDbEntity',
      '8',
      'OUTER_CONTOUR',
      '100',
      'AcDbCircle',
      '10',
      number(plan.length / 2),
      '20',
      number(plan.width / 2),
      '30',
      '0',
      '40',
      number(plan.length / 2),
    )
  } else if (design.outline === 'ellipse') {
    const horizontal = plan.length >= plan.width
    parts.push(
      '0',
      'ELLIPSE',
      '100',
      'AcDbEntity',
      '8',
      'OUTER_CONTOUR',
      '100',
      'AcDbEllipse',
      '10',
      number(plan.length / 2),
      '20',
      number(plan.width / 2),
      '30',
      '0',
      '11',
      number(horizontal ? plan.length / 2 : 0),
      '21',
      number(horizontal ? 0 : plan.width / 2),
      '31',
      '0',
      '40',
      String(Math.min(plan.length, plan.width) / Math.max(plan.length, plan.width)),
      '41',
      '0',
      '42',
      String(TAU),
    )
  } else {
    parts.push(
      '0',
      'POLYLINE',
      '100',
      'AcDbEntity',
      '8',
      'OUTER_CONTOUR',
      '100',
      'AcDb2dPolyline',
      '66',
      '1',
      '10',
      '0',
      '20',
      '0',
      '30',
      '0',
      '70',
      '1',
    )
    for (const point of plan.outline)
      parts.push(
        '0',
        'VERTEX',
        '100',
        'AcDbEntity',
        '8',
        'OUTER_CONTOUR',
        '100',
        'AcDbVertex',
        '100',
        'AcDb2dVertex',
        '10',
        number(point.x),
        '20',
        number(plan.width - point.y),
        '30',
        '0',
      )
    parts.push('0', 'SEQEND', '100', 'AcDbEntity', '8', 'OUTER_CONTOUR')
  }
  parts.push('0', 'ENDSEC', '0', 'EOF')
  return parts.join('\n') + '\n'
}

function inRange(value: unknown, lower: number, upper: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= lower && value <= upper
}

/** Accept only the persisted schema, rejecting nonfinite values and unsafe resource sizes. */
export function validateDesign(input: unknown): Design | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const value = input as Record<string, unknown>
  if (
    (value.version !== 1 && value.version !== 2 && value.version !== 3) ||
    typeof value.name !== 'string' ||
    value.name.length > 100 ||
    !Array.isArray(value.segments) ||
    value.segments.length < 1 ||
    value.segments.length > 50
  )
    return null
  // Legacy projects used a perimeter rail. Drop it on migration so saved designs
  // receive the corrected edge-open hinge behavior without losing other settings.
  if (value.version === 1 && value.edgeMargin !== undefined && !inRange(value.edgeMargin, 0, 100))
    return null
  if (
    value.version === 3 &&
    ![
      'classic',
      'graded',
      'wave',
      'zigzag',
      'small-wave',
      'honeycomb',
      'meander',
      'meander-wide',
    ].includes(value.pattern as string)
  )
    return null
  const segments: Segment[] = []
  const ids = new Set<string>()
  for (const candidate of value.segments) {
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      typeof candidate.id !== 'string' ||
      candidate.id.length > 100 ||
      ids.has(candidate.id)
    )
      return null
    ids.add(candidate.id)
    if (candidate.type === 'straight' && inRange(candidate.length, 1, 2000))
      segments.push({ id: candidate.id, type: 'straight', length: candidate.length })
    else if (
      candidate.type === 'arc' &&
      inRange(candidate.radius, 1, 1000) &&
      inRange(candidate.angle, -360, 360) &&
      Math.abs(candidate.angle) >= 1
    )
      segments.push({
        id: candidate.id,
        type: 'arc',
        radius: candidate.radius,
        angle: candidate.angle,
      })
    else return null
  }
  if (
    pathLength(segments) > 10000 ||
    !['rectangle', 'square', 'ellipse', 'circle', 'triangle', 'custom'].includes(
      value.outline as string,
    ) ||
    !['birch', 'walnut', 'basswood'].includes(value.material as string)
  )
    return null
  if (
    !inRange(value.width, 5, 2000) ||
    !inRange(value.thickness, 0.5, 30) ||
    !inRange(value.spacing, 0.5, 30) ||
    !inRange(value.bridge, 0.2, 30) ||
    !inRange(value.cutLength, 1, 200) ||
    !inRange(value.kerf, 0.01, 2)
  )
    return null
  if (
    !Array.isArray(value.customOutline) ||
    value.customOutline.length < 3 ||
    value.customOutline.length > 128
  )
    return null
  const customOutline: Point[] = []
  for (const point of value.customOutline) {
    if (!point || typeof point !== 'object' || !inRange(point.x, 0, 1) || !inRange(point.y, 0, 1))
      return null
    customOutline.push({ x: point.x, y: point.y })
  }
  if (!isSimplePolygon(customOutline)) return null
  const result: Design = {
    version: 3,
    name: value.name,
    segments,
    outline: value.outline as Design['outline'],
    width: value.width,
    customOutline,
    thickness: value.thickness,
    material: value.material as Design['material'],
    spacing: value.spacing,
    bridge: value.bridge,
    cutLength: value.cutLength,
    kerf: value.kerf,
    pattern: value.version === 3 ? (value.pattern as Design['pattern']) : 'classic',
  }
  const curvedLength = segments
    .filter((segment) => segment.type === 'arc')
    .reduce((sum, segment) => sum + segmentLength(segment), 0)
  const meander = result.pattern === 'meander' || result.pattern === 'meander-wide'
  const period = meander ? meanderRepeat(result) : result.cutLength + result.bridge
  if ((curvedLength / result.spacing) * (getPanelWidth(result) / period + 2) > 50000) return null
  if (result.pattern === 'wave' || result.pattern === 'zigzag') {
    const shape = patternShape(result)
    if (
      (curvedLength / result.spacing) *
        ((getPanelWidth(result) / shape.period) * shape.samples +
          2 * (getPanelWidth(result) / (result.cutLength + result.bridge) + 2)) >
      MAX_PATTERN_SEGMENTS
    )
      return null
  }
  if (
    result.pattern === 'honeycomb' &&
    (curvedLength / result.spacing) *
      (getPanelWidth(result) / (result.cutLength + result.bridge) + 2) *
      honeycombCell(result).length >
      MAX_PATTERN_SEGMENTS
  )
    return null
  if (
    meander &&
    (curvedLength / result.spacing) *
      (getPanelWidth(result) / period + 2) *
      (meanderCell(result).length - 1) >
      MAX_PATTERN_SEGMENTS
  )
    return null
  return result
}
