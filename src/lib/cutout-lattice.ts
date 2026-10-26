import type { CutLine, Design, Point } from './types'
import { clipPatternColumn, MAX_PATTERN_SEGMENTS } from './hinge-patterns'

const EPS = 1e-7
const same = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) < EPS

function joinAtSeam(spans: Point[][]) {
  if (spans.length > 1 && same(spans.at(-1)!.at(-1)!, spans[0][0])) {
    spans[0] = [...spans.pop()!.slice(0, -1), ...spans[0]]
  }
  return spans
}

/** A conservative laser footprint around an aperture. Its convex hull plus a
 * square encloses the round beam; it is used only for boundary clearance,
 * never as a replacement for the actual, possibly concave opening. */
function clearanceEnvelope(cell: Point[], radius: number): Point[] {
  const points = cell
    .flatMap((p) => [
      { x: p.x - radius, y: p.y - radius },
      { x: p.x + radius, y: p.y - radius },
      { x: p.x + radius, y: p.y + radius },
      { x: p.x - radius, y: p.y + radius },
    ])
    .sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (a: Point, b: Point, c: Point) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
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

/** Staggered apertures with their long axes across the panel width.
 * Each cell is supplied relative to its centre, as a closed ring without a
 * repeated final point. Original contours supply the exported laser paths;
 * separate filled regions identify the scrap removed from the preview. */
export function createCutoutLattice(
  design: Design,
  outline: Point[],
  length: number,
  width: number,
  cell: Point[],
) {
  const cuts: CutLine[] = []
  const cutouts: Point[][] = []
  const period = design.cutLength + design.bridge
  const halfLong = design.cutLength / 2
  const halfShort = Math.max(...cell.map((p) => Math.abs(p.x)))
  // Both an opening and the exported outside contour remove half a kerf.
  // The full-width envelope also catches near misses that become severed
  // ligaments only after the outer contour is cut.
  const envelope = clearanceEnvelope(cell, design.kerf + 1e-6)
  const ellipse = design.outline === 'ellipse' || design.outline === 'circle'
  let start = 0
  let previousColumn = -Infinity
  let row = 0
  let segments = 0
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
        // Keep the full aperture and kerf inside the bend zone at its ends.
        if (
          x - previousColumn < design.spacing - EPS ||
          Math.min(localX, size - localX) <= halfShort + design.kerf
        )
          continue
        previousColumn = x
        const offset = row++ % 2 ? period / 2 : 0
        for (
          let index = Math.ceil((-halfLong - offset) / period);
          index * period + offset - halfLong < width;
          index++
        ) {
          const y = index * period + offset
          const aperture = cell.map((p) => ({ x: x + p.x, y: y + p.y }))
          const spans = joinAtSeam(
            clipPatternColumn([...aperture, aperture[0]], outline, ellipse, length, width),
          )
          // A clipped closed contour can be split at its arbitrary first vertex.
          // Rejoin there without adding any path along the panel perimeter.
          if (!spans.length) continue

          // Multiple disjoint boundary paths can slice across a narrow neck or
          // several arms of a concave outline. Retain that cell's material.
          if (spans.length > 1) {
            skipped = true
            continue
          }

          // Include the laser width when checking connectivity. A nominal tip
          // can stop just short of the opposite edge while its kerf severs it.
          // The aperture's Minkowski sum with a square conservatively encloses
          // the round beam footprint, without adding cuts to the exported file.
          const expanded = envelope.map((p) => ({ x: x + p.x, y: y + p.y }))
          const clearanceSpans = joinAtSeam(
            clipPatternColumn([...expanded, expanded[0]], outline, ellipse, length, width),
          )
          if (clearanceSpans.length !== 1) {
            skipped = true
            continue
          }

          const paths = spans.map((points): CutLine => {
            const closed = same(points[0], points.at(-1)!)
            const vertices = closed ? points.slice(0, -1) : points
            return {
              x,
              y1: Math.min(...vertices.map((p) => p.y)),
              y2: Math.max(...vertices.map((p) => p.y)),
              points: vertices,
              ...(closed && { closed: true }),
            }
          })
          segments += paths.reduce((sum, cut) => sum + cut.points!.length - (cut.closed ? 0 : 1), 0)
          if (cuts.length + paths.length > 50000 || segments > MAX_PATTERN_SEGMENTS) {
            limit = cuts.length + paths.length > 50000 ? 'cuts' : 'segments'
            cuts.length = 0
            cutouts.length = 0
            break generation
          }
          cuts.push(...paths)
          cutouts.push(aperture)
        }
      }
    }
    start += size
  }
  return { cuts, cutouts, limit, skipped }
}
