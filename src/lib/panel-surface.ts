import polygonClipping, { type Pair, type Polygon } from 'polygon-clipping'
import { getCutPoints } from './cut-path'
import type { CutLine, Point } from './types'

export type SurfacePolygon = { contour: Point[]; holes: Point[][] }
export type SurfaceBoundary = { start: Point; end: Point; kind: 'outer' | 'kerf' }
export type PanelSurface = { polygons: SurfacePolygon[]; boundaries: SurfaceBoundary[] }

/** A continuous, butt-capped stroke with a constant width normal to its path. */
function kerfSlot(cut: CutLine, halfKerf: number): Polygon | undefined {
  const points = getCutPoints(cut).filter(
    (point, index, path) =>
      index === 0 || point.x !== path[index - 1].x || point.y !== path[index - 1].y,
  )
  if (points.length < 2) return undefined
  const normals = points.slice(1).map((point, index) => {
    const dx = point.x - points[index].x
    const dy = point.y - points[index].y
    const length = Math.hypot(dx, dy)
    return { x: -dy / length, y: dx / length }
  })
  const sides = [1, -1].map((side) => {
    const ring: Pair[] = []
    const offset = (point: Point, normal: Point): Pair => [
      point.x + side * halfKerf * normal.x,
      point.y + side * halfKerf * normal.y,
    ]
    ring.push(offset(points[0], normals[0]))
    for (let index = 1; index < points.length - 1; index++) {
      const previous = normals[index - 1]
      const next = normals[index]
      const denominator = 1 + previous.x * next.x + previous.y * next.y
      const miter = {
        x: (previous.x + next.x) / denominator,
        y: (previous.y + next.y) / denominator,
      }
      // Shared offset intersections close the joint without the tiny gaps left
      // by separate segment rectangles. Bevel very sharp turns to avoid spikes.
      if (denominator > 1e-10 && Math.hypot(miter.x, miter.y) <= 4) {
        ring.push(offset(points[index], miter))
      } else {
        ring.push(offset(points[index], previous), offset(points[index], next))
      }
    }
    ring.push(offset(points.at(-1)!, normals.at(-1)!))
    return ring
  })
  return [[...sides[0], ...sides[1].reverse()]]
}

/**
 * Subtract the laser's actual kerf from the panel before triangulation.
 * A slit touching the perimeter becomes an open notch in the contour, never
 * a touching "hole" or an intact wall across the end of the slit.
 */
export function createPanelSurface(outline: Point[], cuts: CutLine[], kerf: number): PanelSurface {
  if (outline.length < 3) return { polygons: [], boundaries: [] }
  const subject: Polygon = [outline.map(({ x, y }): Pair => [x, y])]
  const halfKerf = kerf / 2
  const slots: Polygon[] = []
  if (halfKerf > 0) {
    for (const cut of cuts) {
      if (cut.y2 <= cut.y1 && !cut.points) continue
      const slot = kerfSlot(cut, halfKerf)
      if (slot) slots.push(slot)
    }
  }
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
