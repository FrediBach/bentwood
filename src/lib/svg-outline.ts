import {
  CubicBezierCurve,
  EllipseCurve,
  LineCurve,
  QuadraticBezierCurve,
  type Curve,
  type Path,
  type Vector2,
} from 'three'
import { isSimplePolygon } from './geometry'
import type { Point } from './types'

export const MAX_SVG_BYTES = 1024 * 1024
const SVG_NS = 'http://www.w3.org/2000/svg'
const MAX_CURVES = 4096
const MAX_SAMPLES = 8192
const MAX_POINTS = 128
const TOLERANCE_MM = 0.075
const numberPattern = '[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?'
const unitPattern = new RegExp(`^(${numberPattern})(px|mm|cm|in|pt|pc)?$`)
const units: Record<string, number> = {
  px: 1,
  mm: 96 / 25.4,
  cm: 96 / 2.54,
  in: 96,
  pt: 96 / 72,
  pc: 16,
}
const shapeAttributes: Record<string, string[]> = {
  path: ['d'],
  polygon: ['points'],
  polyline: ['points'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  line: ['x1', 'y1', 'x2', 'y2'],
}

export type ImportedSVGOutline = { points: Point[]; width: number; warning?: string }

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

function distanceToSegment(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const t =
    dx || dy
      ? Math.max(
          0,
          Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)),
        )
      : 0
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy)
}

function finitePoint(point: Point) {
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    Math.abs(point.x) > 1e12 ||
    Math.abs(point.y) > 1e12
  )
    throw new Error('The SVG contains invalid or excessively large coordinates.')
  return point
}

function ellipseSweep(curve: EllipseCurve) {
  const full = 2 * Math.PI
  const raw = curve.aEndAngle - curve.aStartAngle
  const same = Math.abs(raw) < Number.EPSILON
  let sweep = ((raw % full) + full) % full
  if (sweep < Number.EPSILON && !same) sweep = full
  if (curve.aClockwise && !same) sweep = sweep === full ? -full : sweep - full
  return sweep
}

/** The control hull bounds Bezier error; ellipses use a conservative chord bound. */
function flattenCurve(curve: Curve<Vector2>, tolerance: number, append: (point: Point) => void) {
  if (curve instanceof LineCurve) {
    append(curve.v2)
    return
  }
  if (curve instanceof EllipseCurve) {
    const radius = Math.max(Math.abs(curve.xRadius), Math.abs(curve.yRadius))
    const step = radius ? 2 * Math.acos(Math.max(-1, 1 - tolerance / radius)) : Math.PI
    const signedSweep = ellipseSweep(curve)
    const sweep = Math.abs(signedSweep)
    let count = Math.max(1, Math.ceil(sweep / step))
    if (Math.abs(sweep - 2 * Math.PI) < 1e-10) count = Math.ceil(count / 4) * 4
    if (!Number.isFinite(count) || count > MAX_SAMPLES)
      throw new Error('The SVG outline is too complex. Simplify it and try again.')
    const times = Array.from({ length: count }, (_, i) => (i + 1) / count)
    // Keep the physical bounding box exact, including rotated and partial ellipses.
    const extrema = [
      Math.atan2(
        -curve.yRadius * Math.sin(curve.aRotation),
        curve.xRadius * Math.cos(curve.aRotation),
      ),
      Math.atan2(
        curve.yRadius * Math.cos(curve.aRotation),
        curve.xRadius * Math.sin(curve.aRotation),
      ),
    ]
    for (const angle of extrema.flatMap((angle) => [angle, angle + Math.PI])) {
      const full = 2 * Math.PI
      const travel = ((((angle - curve.aStartAngle) * Math.sign(signedSweep)) % full) + full) % full
      if (travel > 0 && travel < sweep) times.push(travel / sweep)
    }
    times.sort((a, b) => a - b)
    for (const time of times) append(curve.getPoint(time))
    return
  }
  let controls: Point[]
  if (curve instanceof CubicBezierCurve) controls = [curve.v0, curve.v1, curve.v2, curve.v3]
  else if (curve instanceof QuadraticBezierCurve) controls = [curve.v0, curve.v1, curve.v2]
  else throw new Error('This SVG uses an unsupported curve. Convert it to a plain SVG path.')
  const visit = (points: Point[], depth: number) => {
    if (
      points
        .slice(1, -1)
        .every((point) => distanceToSegment(point, points[0], points.at(-1)!) <= tolerance)
    ) {
      append(points.at(-1)!)
      return
    }
    if (depth >= 20) throw new Error('The SVG outline is too complex. Simplify it and try again.')
    const left = [points[0]]
    const right = [points.at(-1)!]
    let level = points
    while (level.length > 1) {
      level = level.slice(1).map((point, index) => midpoint(level[index], point))
      left.push(level[0])
      right.unshift(level.at(-1)!)
    }
    visit(left, depth + 1)
    visit(right, depth + 1)
  }
  visit(controls, 0)
}

/** Converts already transformed SVG geometry into millimetres and editor Y-up coordinates. */
export function outlineFromSVGPath(path: Path, panelLength: number): ImportedSVGOutline {
  if (!Number.isFinite(panelLength) || panelLength <= 0 || panelLength > 10000)
    throw new Error('Set a valid bend-path length before importing an SVG.')
  if (!path.curves.length || path.curves.length > MAX_CURVES)
    throw new Error('The SVG outline is empty or too complex. Simplify it and try again.')
  let roughMin = Infinity
  let roughMax = -Infinity
  for (const curve of path.curves) {
    for (const point of curve.getPoints(curve instanceof LineCurve ? 1 : 32)) {
      finitePoint(point)
      roughMin = Math.min(roughMin, point.x)
      roughMax = Math.max(roughMax, point.x)
    }
  }
  const roughWidth = roughMax - roughMin
  if (!(roughWidth > 0)) throw new Error('The SVG outline must have a nonzero width and height.')
  const tolerance = (TOLERANCE_MM * roughWidth) / panelLength
  const points: Point[] = []
  const epsilon = roughWidth * 1e-10
  const append = (point: Point) => {
    finitePoint(point)
    if (!points.length || distance(points.at(-1)!, point) > epsilon)
      points.push({ x: point.x, y: point.y })
    if (points.length > MAX_SAMPLES)
      throw new Error('The SVG outline is too complex. Simplify it and try again.')
  }
  append(path.curves[0].getPoint(0))
  for (const curve of path.curves) flattenCurve(curve, tolerance, append)
  if (points.length > 1 && distance(points[0], points.at(-1)!) <= epsilon) points.pop()
  // Remove duplicate/collinear drafting vertices without smoothing deliberate corners.
  let changed = true
  while (changed && points.length > 3) {
    changed = false
    for (let i = points.length - 1; i >= 0 && points.length > 3; i--) {
      if (
        distanceToSegment(
          points[i],
          points[(i + points.length - 1) % points.length],
          points[(i + 1) % points.length],
        ) <= epsilon
      ) {
        points.splice(i, 1)
        changed = true
      }
    }
  }
  if (points.length > MAX_POINTS)
    throw new Error(
      'This outline needs more than 128 editable points. Simplify the SVG or shorten the bend path and try again.',
    )
  const minX = Math.min(...points.map((point) => point.x))
  const maxX = Math.max(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxY = Math.max(...points.map((point) => point.y))
  const spanX = maxX - minX
  const spanY = maxY - minY
  if (!(spanX > 0 && spanY > 0))
    throw new Error('The SVG outline must have a nonzero width and height.')
  const width = (panelLength * spanY) / spanX
  if (width < 5 || width > 2000)
    throw new Error(
      'Keeping this SVG’s proportions would put panel width outside 5–2000 mm. Adjust the bend-path length and try again.',
    )
  const normalized = points.map((point) => ({
    x: (point.x - minX) / spanX,
    y: (maxY - point.y) / spanY,
  }))
  if (!isSimplePolygon(normalized))
    throw new Error(
      'The SVG outline crosses itself or has no area. Use one simple closed outline without holes.',
    )
  return { points: normalized, width }
}

function parseLength(text: string) {
  const match = text.trim().match(unitPattern)
  if (!match)
    throw new Error(
      'Use numeric SVG dimensions; percentage and relative dimensions are not supported.',
    )
  const value = Number(match[1]) * units[match[2] || 'px']
  if (!Number.isFinite(value) || Math.abs(value) > 1e9)
    throw new Error('The SVG contains invalid dimensions.')
  return value
}

function numericList(value: string) {
  const numbers = value.match(new RegExp(numberPattern, 'g')) ?? []
  if (
    value.replace(new RegExp(numberPattern, 'g'), '').replace(/[\s,]/g, '') ||
    numbers.length > 20000
  )
    throw new Error('The SVG contains invalid or excessively complex coordinates.')
  const result = numbers.map(Number)
  if (result.some((number) => !Number.isFinite(number) || Math.abs(number) > 1e9))
    throw new Error('The SVG contains invalid coordinates.')
  return result
}

function checkedTransform(value: string) {
  let remaining = value.trim()
  let count = 0
  const canonical: string[] = []
  while (remaining) {
    const match = remaining.match(
      /^(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)\s*,?\s*/,
    )
    if (!match || ++count > 64)
      throw new Error('The SVG contains an unsupported or invalid transform.')
    const values = numericList(match[2])
    const counts: Record<string, number[]> = {
      matrix: [6],
      translate: [1, 2],
      scale: [1, 2],
      rotate: [1, 3],
      skewX: [1],
      skewY: [1],
    }
    if (!counts[match[1]].includes(values.length))
      throw new Error('The SVG contains an invalid transform.')
    canonical.push(`${match[1]}(${values.join(' ')})`)
    remaining = remaining.slice(match[0].length)
  }
  return canonical.join(' ')
}

function checkedPathData(value: string) {
  if (value.length > 100000 || /[^MmLlHhVvCcSsQqTtAaZz0-9eE+.,\s-]/.test(value))
    throw new Error('The SVG path is invalid or too complex. Export a simpler outline.')
  const chunks = value.match(/[MmLlHhVvCcSsQqTtAaZz][^MmLlHhVvCcSsQqTtAaZz]*/g) ?? []
  if (!/^[\s,]*[Mm]/.test(value) || !chunks.length)
    throw new Error('SVG paths must start with a valid move command.')
  const counts: Record<string, number> = {
    m: 2,
    l: 2,
    h: 1,
    v: 1,
    c: 6,
    s: 4,
    q: 4,
    t: 2,
    a: 7,
    z: 0,
  }
  let total = 0
  const canonical: string[] = []
  for (const chunk of chunks) {
    const command = chunk[0]
    const kind = command.toLowerCase()
    let remaining = chunk.slice(1).trim()
    const values: number[] = []
    while (remaining) {
      remaining = remaining.replace(/^[\s,]+/, '')
      if (!remaining) break
      if (!counts[kind])
        throw new Error('The SVG contains invalid path data after a close command.')
      const isFlag = kind === 'a' && (values.length % 7 === 3 || values.length % 7 === 4)
      const match = remaining.match(isFlag ? /^[01]/ : new RegExp(`^${numberPattern}`))
      if (!match) throw new Error('The SVG contains invalid path coordinates or arc flags.')
      const number = Number(match[0])
      if (!Number.isFinite(number) || Math.abs(number) > 1e9)
        throw new Error('The SVG contains invalid path coordinates.')
      if (kind === 'a' && values.length % 7 < 2 && number < 0)
        throw new Error('SVG arc radii cannot be negative.')
      values.push(number)
      if (++total > 20000) throw new Error('The SVG path is too complex. Export a simpler outline.')
      remaining = remaining.slice(match[0].length)
    }
    if (counts[kind] && (!values.length || values.length % counts[kind]))
      throw new Error('The SVG path has an incomplete command. Export a valid closed path.')
    canonical.push(command + values.join(' '))
  }
  return canonical.join(' ')
}

/** Read geometry in a detached XML document; source markup is never mounted or loaded. */
export async function importSVGOutline(
  source: string,
  panelLength: number,
): Promise<ImportedSVGOutline> {
  if (new TextEncoder().encode(source).length > MAX_SVG_BYTES)
    throw new Error('Choose an SVG file smaller than 1 MB.')
  if (/<!DOCTYPE|<!ENTITY/i.test(source))
    throw new Error(
      'Export the outline as a plain SVG without document type or entity declarations.',
    )
  const document = new DOMParser().parseFromString(source, 'image/svg+xml')
  const root = document.documentElement
  if (
    document.querySelector('parsererror') ||
    root.localName !== 'svg' ||
    (root.namespaceURI && root.namespaceURI !== SVG_NS)
  )
    throw new Error('This file is not a valid SVG. Choose an SVG containing one closed outline.')
  if (/\bslice\b/.test(root.getAttribute('preserveAspectRatio') || ''))
    throw new Error(
      'Cropped SVG viewports are not supported. Convert the visible outline to a plain path.',
    )
  if (document.getElementsByTagName('*').length > 5000)
    throw new Error('The SVG contains too many elements. Export just the outline.')
  for (const stylesheet of document.querySelectorAll('style')) {
    if (
      /(?:transform|display|visibility|opacity|clip|mask|filter|\b(?:d|x|y|cx|cy|r|rx|ry|width|height)\s*:)/i.test(
        stylesheet.textContent || '',
      )
    )
      throw new Error(
        'This SVG uses stylesheet effects that change the outline. Export a plain path without those effects.',
      )
  }
  const targets = [...document.querySelectorAll('[id="outer-contour"]')]
  if (targets.length > 1)
    throw new Error('The SVG contains multiple outer contours. Export one closed outline.')
  const target = targets[0]
  const clean = new DOMParser().parseFromString(`<svg xmlns="${SVG_NS}"/>`, 'image/svg+xml')
  const cleanRoot = clean.documentElement
  let ignored = false
  let count = 0
  const visit = (node: Element, parent: Element, depth: number) => {
    if (target && !target.contains(node) && !node.contains(target)) return
    if (depth > 64 || ++count > 5000)
      throw new Error('The SVG is too deeply nested or complex. Export just the outline.')
    const tag = node.localName
    if (node !== root && tag === 'svg')
      throw new Error(
        'Nested SVG viewports are not supported. Export the outline as a single SVG path.',
      )
    if (['title', 'desc', 'metadata', 'defs', 'script'].includes(tag)) {
      ignored ||= tag === 'script'
      return
    }
    if (tag === 'style') {
      return
    }
    const style = (node.getAttribute('style') || '').toLowerCase()
    if (
      /(?:^|;)\s*(?:transform|clip-path|mask|filter|d|x|y|cx|cy|r|rx|ry|width|height)\s*:/.test(
        style,
      ) ||
      ['clip-path', 'mask', 'filter'].some((attribute) => node.hasAttribute(attribute))
    )
      throw new Error(
        'Clipping, masks, filters, and CSS geometry are not supported. Convert the visible outline to a plain path.',
      )
    if (
      /display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse)/.test(style) ||
      node.getAttribute('display') === 'none' ||
      ['hidden', 'collapse'].includes(node.getAttribute('visibility') || '') ||
      node.getAttribute('opacity') === '0' ||
      /(?:^|;)\s*opacity\s*:\s*0(?:\.0*)?\s*(?:;|$)/.test(style)
    ) {
      ignored = true
      return
    }
    if (!shapeAttributes[tag] && !['svg', 'g', 'a'].includes(tag))
      throw new Error(
        `SVG ${tag} elements are not supported. Convert the outline to a plain path before importing.`,
      )
    const element = clean.createElementNS(SVG_NS, ['svg', 'a'].includes(tag) ? 'g' : tag)
    const transform = node.getAttribute('transform')
    if (transform)
      (node === root ? cleanRoot : element).setAttribute('transform', checkedTransform(transform))
    for (const attribute of shapeAttributes[tag] ?? []) {
      const value = node.getAttribute(attribute)
      if (value == null) continue
      if (attribute === 'd') {
        element.setAttribute(attribute, checkedPathData(value))
      } else if (attribute === 'points') {
        const coordinates = numericList(value)
        if (coordinates.length % 2) throw new Error('The SVG has an incomplete point coordinate.')
        element.setAttribute(attribute, coordinates.join(' '))
      } else element.setAttribute(attribute, String(parseLength(value)))
    }
    if (tag === 'rect') {
      const width = Number(element.getAttribute('width'))
      const height = Number(element.getAttribute('height'))
      if (width < 0 || height < 0) throw new Error('SVG rectangle dimensions cannot be negative.')
      const rx = Number(element.getAttribute('rx') ?? element.getAttribute('ry') ?? 0)
      const ry = Number(element.getAttribute('ry') ?? element.getAttribute('rx') ?? 0)
      element.setAttribute('rx', String(Math.max(0, Math.min(width / 2, rx))))
      element.setAttribute('ry', String(Math.max(0, Math.min(height / 2, ry))))
    }
    if (['r', 'rx', 'ry'].some((attribute) => Number(element.getAttribute(attribute)) < 0))
      throw new Error('SVG radii cannot be negative.')
    parent.appendChild(element)
    for (const child of node.children) visit(child, element, depth + 1)
  }
  visit(root, cleanRoot, 0)
  const viewBox = root.getAttribute('viewBox')
  if (viewBox) {
    const bounds = numericList(viewBox)
    if (bounds.length !== 4 || bounds[2] <= 0 || bounds[3] <= 0)
      throw new Error('The SVG viewBox is invalid.')
    if ((root.getAttribute('preserveAspectRatio') || '').trim() === 'none') {
      const width = parseLength(root.getAttribute('width') || String(bounds[2]))
      const height = parseLength(root.getAttribute('height') || String(bounds[3]))
      if (width <= 0 || height <= 0)
        throw new Error('The SVG viewport must have positive dimensions.')
      cleanRoot.setAttribute(
        'transform',
        `${cleanRoot.getAttribute('transform') || ''} scale(${width / bounds[2]} ${height / bounds[3]})`,
      )
    }
  }
  const { SVGLoader } = await import('three/addons/loaders/SVGLoader.js')
  let paths: ReturnType<InstanceType<typeof SVGLoader>['parse']>['paths']
  try {
    paths = new SVGLoader().parse(new XMLSerializer().serializeToString(clean)).paths
  } catch {
    throw new Error(
      'The SVG path data could not be read. Export a valid, closed SVG path and try again.',
    )
  }
  const closed: Path[] = []
  let curveCount = 0
  for (const shape of paths) {
    for (const path of shape.subPaths) {
      curveCount += path.curves.length
      if (curveCount > MAX_CURVES)
        throw new Error('The SVG contains too many path segments. Export just a simpler outline.')
      if (!path.curves.length) continue
      const start = finitePoint(path.curves[0].getPoint(0))
      const end = finitePoint(path.curves.at(-1)!.getPoint(1))
      let extent = 0
      for (const curve of path.curves) {
        for (const point of curve.getPoints(curve instanceof LineCurve ? 1 : 8)) {
          finitePoint(point)
          extent = Math.max(extent, distance(start, point))
        }
      }
      const epsilon = extent * 1e-9
      if (path.autoClose || distance(start, end) <= epsilon) closed.push(path)
      else ignored = true
    }
  }
  if (!closed.length)
    throw new Error(
      'No closed outline was found. Close the SVG path or use a polygon, rectangle, circle, or ellipse.',
    )
  if (closed.length > 1)
    throw new Error(
      'The SVG contains multiple outlines or holes. Export one closed outline without holes.',
    )
  const result = outlineFromSVGPath(closed[0], panelLength)
  return {
    ...result,
    ...(ignored ? { warning: 'Open lines and hidden or non-outline content were ignored.' } : {}),
  }
}
