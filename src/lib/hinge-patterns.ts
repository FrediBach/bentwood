import type { Design, Point } from './types'

const EPS = 1e-8
export const MAX_PATTERN_SEGMENTS = 250_000

/** A shared horizontal displacement of the staggered grid keeps adjacent cuts
 * ordered. Limit both its width and slope to retain material between columns. */
export function patternShape(design: Design) {
  const period = design.cutLength + design.bridge
  const amplitude = Math.min(design.spacing * 0.3, period / 8)
  const tolerance = Math.min(0.01, design.kerf / 4)
  const samples =
    design.pattern === 'zigzag'
      ? 4
      : Math.max(16, Math.ceil((Math.PI * Math.sqrt(amplitude / (2 * tolerance))) / 4) * 4)
  const slope = (amplitude * (design.pattern === 'zigzag' ? 4 : 2 * Math.PI)) / period
  const edgeClearance = Math.max(design.spacing * 0.2, design.kerf * Math.hypot(1, slope))
  return { period, amplitude, samples, slope, edgeClearance }
}

export function patternColumn(
  design: Design,
  x: number,
  width: number,
  boundaryDistance: number,
): Point[] {
  const { period, amplitude: nominalAmplitude, samples, edgeClearance } = patternShape(design)
  const amplitude = Math.max(0, Math.min(nominalAmplitude, boundaryDistance - edgeClearance))
  const step = period / samples
  const point = (y: number): Point => {
    const phase = (y / period) * 2 * Math.PI
    const wave =
      design.pattern === 'zigzag' ? (2 / Math.PI) * Math.asin(Math.sin(phase)) : Math.sin(phase)
    return { x: x + amplitude * wave, y }
  }
  const points: Point[] = []
  for (let i = 0; i * step < width - EPS; i++) points.push(point(i * step))
  points.push(point(width))
  return points
}

function pointInside(
  p: Point,
  outline: Point[],
  ellipse: boolean,
  length: number,
  width: number,
): boolean {
  if (ellipse)
    return (
      ((p.x - length / 2) / (length / 2)) ** 2 + ((p.y - width / 2) / (width / 2)) ** 2 <= 1 + EPS
    )
  let inside = false
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[i],
      b = outline[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside
  }
  return inside
}

function intersections(
  a: Point,
  b: Point,
  outline: Point[],
  ellipse: boolean,
  length: number,
  width: number,
): number[] {
  const dx = b.x - a.x,
    dy = b.y - a.y
  const values = [0, 1]
  if (ellipse) {
    const rx = length / 2,
      ry = width / 2
    const px = (a.x - rx) / rx,
      py = (a.y - ry) / ry
    const vx = dx / rx,
      vy = dy / ry
    const aa = vx * vx + vy * vy
    const bb = 2 * (px * vx + py * vy)
    const cc = px * px + py * py - 1
    const discriminant = bb * bb - 4 * aa * cc
    if (aa > 0 && discriminant >= 0) {
      const root = Math.sqrt(discriminant)
      values.push((-bb - root) / (2 * aa), (-bb + root) / (2 * aa))
    }
  } else {
    for (let i = 0; i < outline.length; i++) {
      const c = outline[i],
        d = outline[(i + 1) % outline.length]
      const ex = d.x - c.x,
        ey = d.y - c.y
      const denominator = dx * ey - dy * ex
      if (Math.abs(denominator) < EPS) continue
      const cx = c.x - a.x,
        cy = c.y - a.y
      const t = (cx * ey - cy * ex) / denominator
      const u = (cx * dy - cy * dx) / denominator
      if (u >= -EPS && u <= 1 + EPS) values.push(t)
    }
  }
  return values
    .filter((t) => t >= 0 && t <= 1)
    .sort((a, b) => a - b)
    .filter((t, i, sorted) => !i || t - sorted[i - 1] > EPS)
}

/** Clip each straight toolpath segment against the actual exported contour,
 * including analytic ellipses. Concave outlines may yield several spans. */
export function clipPatternColumn(
  points: Point[],
  outline: Point[],
  ellipse: boolean,
  length: number,
  width: number,
): Point[][] {
  const spans: Point[][] = []
  let current: Point[] | null = null
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i]
    const at = (t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    const values = intersections(a, b, outline, ellipse, length, width)
    for (let j = 1; j < values.length; j++) {
      const lo = values[j - 1],
        hi = values[j]
      if (!pointInside(at((lo + hi) / 2), outline, ellipse, length, width)) {
        current = null
        continue
      }
      const start = at(lo),
        end = at(hi)
      if (end.y - start.y < EPS) continue
      const previous = current?.at(-1)
      if (current && previous && Math.hypot(previous.x - start.x, previous.y - start.y) < EPS)
        current.push(end)
      else {
        current = [start, end]
        spans.push(current)
      }
    }
  }
  return spans
}

/** Keep exact clip endpoints and insert bridge endpoints along the polyline. */
export function slicePatternSpan(points: Point[], lower: number, upper: number): Point[] {
  const lowerBound = (y: number) => {
    let lo = 0,
      hi = points.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (points[mid].y < y) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  const at = (y: number): Point => {
    const i = Math.min(points.length - 1, Math.max(1, lowerBound(y)))
    const a = points[i - 1],
      b = points[i]
    const t = Math.max(0, Math.min(1, (y - a.y) / (b.y - a.y)))
    return { x: a.x + (b.x - a.x) * t, y }
  }
  return [at(lower), ...points.slice(lowerBound(lower + EPS), lowerBound(upper - EPS)), at(upper)]
}
