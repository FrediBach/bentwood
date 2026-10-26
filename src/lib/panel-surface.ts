import polygonClipping, { type Pair, type Polygon } from 'polygon-clipping'
import type { CutLine, Point } from './types'

export type SurfacePolygon = { contour: Point[]; holes: Point[][] }
export type SurfaceBoundary = { start: Point; end: Point; kind: 'outer' | 'kerf' }
export type PanelSurface = { polygons: SurfacePolygon[]; boundaries: SurfaceBoundary[] }

/**
 * Subtract the laser's actual kerf from the panel before triangulation.
 * A slit touching the perimeter becomes an open notch in the contour, never
 * a touching "hole" or an intact wall across the end of the slit.
 */
export function createPanelSurface(outline: Point[], cuts: CutLine[], kerf: number): PanelSurface {
  if (outline.length < 3) return { polygons: [], boundaries: [] }
  const subject: Polygon = [outline.map(({ x, y }): Pair => [x, y])]
  const halfKerf = kerf / 2
  const slots: Polygon[] = cuts
    .filter((cut) => cut.y2 > cut.y1)
    .map((cut) => [
      [
        [cut.x - halfKerf, cut.y1],
        [cut.x + halfKerf, cut.y1],
        [cut.x + halfKerf, cut.y2],
        [cut.x - halfKerf, cut.y2],
      ],
    ])
  const clipped =
    slots.length && halfKerf > 0 ? polygonClipping.difference(subject, ...slots) : [subject]
  const polygons = clipped.map((polygon): SurfacePolygon => {
    const rings = polygon.map((ring) => {
      const points = ring.map(([x, y]) => ({ x, y }))
      const first = points[0],
        last = points.at(-1)!
      if (first.x === last.x && first.y === last.y) points.pop()
      return points
    })
    return { contour: rings[0], holes: rings.slice(1) }
  })
  const tolerance =
    Math.max(1, ...outline.flatMap((point) => [Math.abs(point.x), Math.abs(point.y)])) * 1e-9
  const onEdge = (point: Point, a: Point, b: Point) => {
    const dx = b.x - a.x,
      dy = b.y - a.y
    const lengthSquared = dx * dx + dy * dy
    if (!lengthSquared) return false
    const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared
    if (t < -tolerance || t > 1 + tolerance) return false
    return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy) <= tolerance
  }
  const boundaries: SurfaceBoundary[] = []
  for (const polygon of polygons) {
    for (const ring of [polygon.contour, ...polygon.holes]) {
      ring.forEach((start, index) => {
        const end = ring[(index + 1) % ring.length]
        const originalEdge = outline.some((a, i) => {
          const b = outline[(i + 1) % outline.length]
          return onEdge(start, a, b) && onEdge(end, a, b)
        })
        boundaries.push({ start, end, kind: originalEdge ? 'outer' : 'kerf' })
      })
    }
  }
  return { polygons, boundaries }
}
