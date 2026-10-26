import polygonClipping, { type Pair, type Polygon } from 'polygon-clipping'
import { getCutPoints } from './cut-path'
import type { CutLine, Point } from './types'

export type SurfacePolygon = { contour: Point[]; holes: Point[][] }
export type SurfaceBoundary = { start: Point; end: Point; kind: 'outer' | 'kerf' }
export type PanelSurface = { polygons: SurfacePolygon[]; boundaries: SurfaceBoundary[] }

function offsetJoin(
  point: Point,
  previous: Point,
  next: Point,
  side: number,
  radius: number,
  roundOuter: boolean,
): Pair[] {
  const offset = (normal: Point): Pair => [
    point.x + side * radius * normal.x,
    point.y + side * radius * normal.y,
  ]
  const turn = previous.x * next.y - previous.y * next.x
  const dot = previous.x * next.x + previous.y * next.y
  if (roundOuter && turn * side < -1e-12) {
    const start = Math.atan2(side * previous.y, side * previous.x)
    const angle = Math.atan2(turn, dot)
    const tolerance = Math.min(0.01, radius / 2)
    const count = Math.max(1, Math.ceil(Math.abs(angle) / (2 * Math.acos(1 - tolerance / radius))))
    return Array.from({ length: count + 1 }, (_, i): Pair => {
      const phase = start + (angle * i) / count
      return [point.x + radius * Math.cos(phase), point.y + radius * Math.sin(phase)]
    })
  }
  const denominator = 1 + dot
  const miter = { x: (previous.x + next.x) / denominator, y: (previous.y + next.y) / denominator }
  return denominator > 1e-10 && Math.hypot(miter.x, miter.y) <= 4
    ? [offset(miter)]
    : [offset(previous), offset(next)]
}

/** A continuous stroke with a constant width normal to its path. */
function kerfSlot(cut: CutLine, halfKerf: number, roundOuter = false): Polygon | undefined {
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
  if (cut.closed && points.length >= 4) {
    const vertices = points.slice(0, -1)
    const area = vertices.reduce((sum, point, i) => {
      const next = vertices[(i + 1) % vertices.length]
      return sum + point.x * next.y - next.x * point.y
    }, 0)
    if (Math.abs(area) < 1e-12) return undefined
    const side = -Math.sign(area)
    const ring: Pair[] = []
    vertices.forEach((point, index) => {
      const previous = normals[(index + normals.length - 1) % normals.length]
      const next = normals[index]
      // Close the seam with the same join as every other vertex. The entire
      // outward-offset polygon is removed: its interior is discarded scrap.
      ring.push(...offsetJoin(point, previous, next, side, halfKerf, true))
    })
    return [ring]
  }
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
      // Shared offset intersections close the joint without the tiny gaps left
      // by separate segment rectangles. Bevel very sharp turns to avoid spikes.
      ring.push(...offsetJoin(points[index], previous, next, side, halfKerf, roundOuter))
    }
    ring.push(offset(points.at(-1)!, normals.at(-1)!))
    return ring
  })
  if (!roundOuter) return [[...sides[0], ...sides[1].reverse()]]
  const cap = (point: Point, normal: Point): Pair[] => {
    const start = Math.atan2(normal.y, normal.x)
    const tolerance = Math.min(0.01, halfKerf / 2)
    const count = Math.ceil(Math.PI / (2 * Math.acos(1 - tolerance / halfKerf)))
    return Array.from({ length: count - 1 }, (_, i): Pair => {
      const angle = start - (Math.PI * (i + 1)) / count
      return [point.x + halfKerf * Math.cos(angle), point.y + halfKerf * Math.sin(angle)]
    })
  }
  // Clipped aperture contours end at the sheet boundary. A real laser beam
  // extends around that endpoint; a tilted butt cap would leave phantom chips.
  return [
    [
      ...sides[0],
      ...cap(points.at(-1)!, normals.at(-1)!),
      ...sides[1].reverse(),
      ...cap(points[0], { x: -normals[0].x, y: -normals[0].y }),
    ],
  ]
}

/**
 * Subtract the laser's actual kerf from the panel before triangulation.
 * A slit touching the perimeter becomes an open notch in the contour, never
 * a touching "hole" or an intact wall across the end of the slit.
 */
export function createPanelSurface(
  outline: Point[],
  cuts: CutLine[],
  kerf: number,
  cutouts: Point[][] = [],
): PanelSurface {
  if (outline.length < 3) return { polygons: [], boundaries: [] }
  const subject: Polygon = [outline.map(({ x, y }): Pair => [x, y])]
  const halfKerf = kerf / 2
  // Cutout regions also describe scrap bounded in part by the panel outline,
  // where closing the laser toolpath would duplicate an outside-contour cut.
  const slots: Polygon[] = cutouts
    .filter((ring) => ring.length >= 3)
    .map((ring): Polygon => [ring.map(({ x, y }): Pair => [x, y])])
  for (const cut of cuts) {
    if (cut.closed) {
      const points = getCutPoints(cut)
      if (points.length >= 4) slots.push([points.map(({ x, y }): Pair => [x, y])])
    }
  }
  if (halfKerf > 0) {
    for (const cut of cuts) {
      if (cut.y2 <= cut.y1 && !cut.points) continue
      const slot = kerfSlot(cut, halfKerf, cut.roundCaps || cutouts.length > 0)
      if (slot) slots.push(slot)
    }
  }
  let clipped: ReturnType<typeof polygonClipping.difference>
  try {
    clipped = slots.length ? polygonClipping.difference(subject, ...slots) : [subject]
  } catch (error) {
    if (!slots.length) throw error
    // A clipped boundary path and its nominal cutout can meet an outline edge
    // at numerically different versions of the same point. Snap only on retry,
    // a full decimal place finer than the exported toolpath coordinates.
    const snapped = (polygon: Polygon): Polygon =>
      polygon.map((ring) =>
        ring.map(([x, y]): Pair => [Math.round(x * 1e7) / 1e7, Math.round(y * 1e7) / 1e7]),
      )
    clipped = polygonClipping.difference(snapped(subject), ...slots.map(snapped))
  }
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
