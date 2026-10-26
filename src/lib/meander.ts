import type { CutLine, Design, Point } from './types'
import { clipPatternColumn, MAX_PATTERN_SEGMENTS } from './hinge-patterns'

const EPS = 1e-7
type Cubic = [Point, Point, Point, Point]
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const same = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) < EPS
const cross = (a: Point, b: Point, c: Point) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)

function distanceSquared(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x,
    dy = b.y - a.y
  const length = dx * dx + dy * dy
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0
  return (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2
}

/** Fine retains the reference's overlapping tips. Wide reduces that overlap
 * while keeping the same rounded motif and transverse bridge dimension. */
export function meanderRepeat(design: Design): number {
  return design.cutLength * (design.pattern === 'meander-wide' ? 0.92 : 0.839189)
}

/** Trotec Kerf 4 uses separate open, eight-cubic motifs. Repeated motifs
 * overlap along their long axis; they are not a wave with gaps sliced out.
 * https://www.troteclaser.com/en-us/helpcenter/materials/application-techniques/bending-technique
 * Bridge sets the transverse gap between the two levels at the motif's ends.
 * Coordinates run across the sheet width, with the row centre at x=0. */
export function meanderCell(design: Design): Point[] {
  const point = (u: number, v: number): Point => ({
    x: (v - 0.5) * 2 * design.bridge,
    y: u * design.cutLength,
  })
  const controls = [
    [0.9085690806, 0.4999510108, 0.8547691846, 0.4999510108, 0.8231345021, 0.453509259],
    [0.7971149445, 0.4153085775, 0.7873189419, 0.3346723712, 0.7779572757, 0.2500843703],
    [0.76858936, 0.1654092775, 0.7587886704, 0.0846424333, 0.7327566139, 0.0464417519],
    [0.7011141195, 0, 0.6473407837, 0, 0.5559567351, 0],
    [0.4391093293, 0, 0.3838783108, 0.0013825838, 0.3573681719, 0.1941387156],
    [0.3448661604, 0.2851061977, 0.3380995755, 0.412837345, 0.3269115094, 0.5365840382],
    [0.3148875803, 0.6696169045, 0.2973016466, 0.7965097924, 0.2629031477, 0.8713435013],
    [0.203783413, 1, 0.1018924877, 1, 0, 1],
  ]
  const toleranceSquared = Math.min(0.01, design.kerf / 4) ** 2
  const points = [point(1, 0.4999510108)]
  const flatten = ([a, b, c, d]: Cubic) => {
    // Distance to a segment is convex. Both endpoints lie on the chord and
    // the two inner Bézier weights sum to at most 3/4, so this is a tighter
    // error bound than the full control-hull distance without losing accuracy.
    if (
      (Math.max(distanceSquared(b, a, d), distanceSquared(c, a, d)) * 9) / 16 <=
      toleranceSquared
    ) {
      points.push(d)
      return
    }
    const ab = midpoint(a, b),
      bc = midpoint(b, c),
      cd = midpoint(c, d)
    const abc = midpoint(ab, bc),
      bcd = midpoint(bc, cd),
      centre = midpoint(abc, bcd)
    flatten([a, ab, abc, centre])
    flatten([centre, bcd, cd, d])
  }
  for (const [u1, v1, u2, v2, u3, v3] of controls)
    flatten([points.at(-1)!, point(u1, v1), point(u2, v2), point(u3, v3)])
  return points
}

/** Measure the actual sampled toolpaths: neighbouring bounding boxes overlap.
 * Include every potentially close row, since bridge can exceed row spacing.
 * Translation symmetry lets us inspect positive rows and one same-row repeat. */
export function meanderClearance(design: Design, cell: Point[]): number {
  const period = meanderRepeat(design)
  const segments = cell.slice(1).map((b, i) => {
    const a = cell[i]
    return {
      a,
      b,
      minX: Math.min(a.x, b.x),
      maxX: Math.max(a.x, b.x),
      minY: Math.min(a.y, b.y),
      maxY: Math.max(a.y, b.y),
    }
  })
  // Corresponding points in adjacent rows are exactly one spacing apart.
  let squared = design.spacing ** 2
  const rows = Math.ceil((2 * design.bridge) / design.spacing) + 1
  for (let row = 0; row <= rows; row++) {
    const dx = row * design.spacing
    for (let repeat = row ? -1 : 1; repeat <= 1; repeat++) {
      const dy = repeat * period
      const gapX = Math.max(0, dx - 2 * design.bridge)
      const gapY = Math.max(0, Math.abs(dy) - design.cutLength)
      if (gapX * gapX + gapY * gapY >= squared) continue
      for (const first of segments)
        for (const second of segments) {
          const xGap = Math.max(0, first.minX - second.maxX - dx, second.minX + dx - first.maxX)
          const yGap = Math.max(0, first.minY - second.maxY - dy, second.minY + dy - first.maxY)
          if (xGap * xGap + yGap * yGap >= squared) continue
          const { a, b } = first
          const c = { x: second.a.x + dx, y: second.a.y + dy }
          const d = { x: second.b.x + dx, y: second.b.y + dy }
          const abC = cross(a, b, c),
            abD = cross(a, b, d)
          const cdA = cross(c, d, a),
            cdB = cross(c, d, b)
          if (abC * abD < 0 && cdA * cdB < 0) return 0
          squared = Math.min(
            squared,
            distanceSquared(a, c, d),
            distanceSquared(b, c, d),
            distanceSquared(c, a, b),
            distanceSquared(d, a, b),
          )
          if (squared < 1e-20) return 0
        }
    }
  }
  return Math.sqrt(squared)
}

/** Conservative hull of the full laser footprint. Used only to decide which
 * boundary motifs to omit; exported paths retain the original open curves. */
function clearanceEnvelope(cell: Point[], radius: number): Point[] {
  const points = cell
    .flatMap((p) => [
      { x: p.x - radius, y: p.y - radius },
      { x: p.x + radius, y: p.y - radius },
      { x: p.x + radius, y: p.y + radius },
      { x: p.x - radius, y: p.y + radius },
    ])
    .sort((a, b) => a.x - b.x || a.y - b.y)
  const half = (list: Point[]) => {
    const hull: Point[] = []
    for (const p of list) {
      while (hull.length >= 2 && cross(hull[hull.length - 2], hull.at(-1)!, p) <= 0) hull.pop()
      hull.push(p)
    }
    return hull.slice(0, -1)
  }
  return [...half(points), ...half([...points].reverse())]
}

function joinAtSeam(spans: Point[][]) {
  if (spans.length > 1 && same(spans.at(-1)!.at(-1)!, spans[0][0]))
    spans[0] = [...spans.pop()!.slice(0, -1), ...spans[0]]
  return spans
}

/** Trim a slit conceptually by the perimeter's full laser-clearance corridor.
 * Two separate interior pieces mean the slit can meet the perimeter twice and
 * detach material, even when its nominal curve never crosses the boundary.
 * Intersections with each edge capsule are analytic, avoiding sampling gaps. */
function hasOneInteriorSpan(points: Point[], outline: Point[], radius: number): boolean {
  const contacts: [number, number][] = []
  const add = (index: number, lo: number, hi: number) => {
    const start = Math.max(0, lo),
      end = Math.min(1, hi)
    if (start <= end) contacts.push([index + start, index + end])
  }
  for (let index = 0; index + 1 < points.length; index++) {
    const a = points[index],
      b = points[index + 1]
    const vx = b.x - a.x,
      vy = b.y - a.y
    const aa = vx * vx + vy * vy
    for (let edge = 0; edge < outline.length; edge++) {
      const c = outline[edge],
        d = outline[(edge + 1) % outline.length]
      const ex = d.x - c.x,
        ey = d.y - c.y
      const length = Math.hypot(ex, ey)
      if (!length) continue
      const px = a.x - c.x,
        py = a.y - c.y
      // The straight portion of the edge capsule: intersect two linear slabs.
      let lo = 0,
        hi = 1
      const slab = (position: number, velocity: number, lower: number, upper: number) => {
        if (Math.abs(velocity) < 1e-14) {
          if (position < lower || position > upper) hi = -1
        } else {
          const first = (lower - position) / velocity,
            second = (upper - position) / velocity
          lo = Math.max(lo, Math.min(first, second))
          hi = Math.min(hi, Math.max(first, second))
        }
      }
      slab((px * ex + py * ey) / length, (vx * ex + vy * ey) / length, 0, length)
      slab((px * ey - py * ex) / length, (vx * ey - vy * ex) / length, -radius, radius)
      if (lo <= hi) add(index, lo, hi)
      // One vertex disk per edge covers both ends across the complete outline.
      const bb = 2 * (px * vx + py * vy),
        cc = px * px + py * py - radius * radius
      const discriminant = bb * bb - 4 * aa * cc
      if (aa > 0 && discriminant >= 0) {
        const root = Math.sqrt(discriminant)
        add(index, (-bb - root) / (2 * aa), (-bb + root) / (2 * aa))
      }
    }
  }
  contacts.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  let cursor = 0,
    clearSpans = 0
  const finish = points.length - 1
  for (const [start, end] of contacts) {
    if (start > cursor + 1e-9) clearSpans++
    cursor = Math.max(cursor, end)
  }
  if (cursor < finish - 1e-9) clearSpans++
  return clearSpans === 1
}

export function createMeanderLattice(
  design: Design,
  outline: Point[],
  length: number,
  width: number,
  cell: Point[],
) {
  const cuts: CutLine[] = []
  const period = meanderRepeat(design)
  // Both the slit and the exported perimeter have a half-kerf footprint.
  const envelope = clearanceEnvelope(cell, design.kerf + 1e-6)
  const ellipse = design.outline === 'ellipse' || design.outline === 'circle'
  const endpointInside = (point: Point) => {
    const clearance = design.kerf + EPS
    if (ellipse) {
      // Scaling the unit disk by the smaller semiaxis gives a conservative
      // physical distance to the exact ellipse, including near polygon chords.
      const radial = Math.hypot((2 * point.x) / length - 1, (2 * point.y) / width - 1)
      return (Math.min(length, width) / 2) * (1 - radial) > clearance
    }
    return outline.every(
      (a, i) => distanceSquared(point, a, outline[(i + 1) % outline.length]) > clearance ** 2,
    )
  }
  let start = 0,
    previousColumn = -Infinity,
    segments = 0
  let limit: 'cuts' | 'segments' | undefined
  let skipped = false

  generation: for (const segment of design.segments) {
    const size =
      segment.type === 'straight'
        ? segment.length
        : (segment.radius * Math.abs(segment.angle) * Math.PI) / 180
    if (segment.type === 'arc') {
      for (let column = 0; (column + 0.5) * design.spacing < size; column++) {
        const localX = (column + 0.5) * design.spacing
        const x = start + localX
        // Every motif and its laser width must stay within the curved region.
        if (
          x - previousColumn < design.spacing - EPS ||
          Math.min(localX, size - localX) <= design.bridge + design.kerf
        )
          continue
        previousColumn = x
        for (let index = Math.ceil(-design.cutLength / period); index * period < width; index++) {
          const y = index * period
          const motif = cell.map((p) => ({ x: x + p.x, y: y + p.y }))
          const spans = clipPatternColumn(motif, outline, ellipse, length, width)
          if (!spans.length) continue
          // A cut from one boundary point to another separates material. Keep
          // only intact motifs or a clipped motif retaining an interior end.
          if (
            spans.length !== 1 ||
            (!(same(spans[0][0], motif[0]) && endpointInside(motif[0])) &&
              !(same(spans[0].at(-1)!, motif.at(-1)!) && endpointInside(motif.at(-1)!)))
          ) {
            skipped = true
            continue
          }
          const expanded = envelope.map((p) => ({ x: x + p.x, y: y + p.y }))
          const clearanceSpans = joinAtSeam(
            clipPatternColumn([...expanded, expanded[0]], outline, ellipse, length, width),
          )
          if (clearanceSpans.length !== 1) {
            skipped = true
            continue
          }
          const points = spans[0]
          if (!same(clearanceSpans[0][0], clearanceSpans[0].at(-1)!)) {
            // The conservative envelope reaches the edge. Check the actual
            // curved slit against the kerf corridor, not its convex hull.
            // The inscribed ellipse polygon makes this check conservative.
            const interior = ellipse
              ? clipPatternColumn(points, outline, false, length, width)
              : [points]
            if (
              interior.length !== 1 ||
              (!(same(interior[0][0], motif[0]) && endpointInside(motif[0])) &&
                !(same(interior[0].at(-1)!, motif.at(-1)!) && endpointInside(motif.at(-1)!))) ||
              !hasOneInteriorSpan(interior[0], outline, design.kerf + EPS)
            ) {
              skipped = true
              continue
            }
          }
          segments += points.length - 1
          if (cuts.length + 1 > 50000 || segments > MAX_PATTERN_SEGMENTS) {
            limit = cuts.length + 1 > 50000 ? 'cuts' : 'segments'
            cuts.length = 0
            break generation
          }
          cuts.push({
            x,
            y1: Math.min(...points.map((p) => p.y)),
            y2: Math.max(...points.map((p) => p.y)),
            points,
            roundCaps: true,
          })
        }
      }
    }
    start += size
  }
  return { cuts, skipped, limit }
}
