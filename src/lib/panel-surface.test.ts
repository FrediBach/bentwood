import { describe, expect, it } from 'vitest'
import { ShapeUtils, Vector2 } from 'three'
import { createPanelSurface, type PanelSurface } from './panel-surface'
import type { Point } from './types'

const rectangle: Point[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
]

function ringArea(points: Point[]) {
  return Math.abs(
    points.reduce((sum, point, i) => {
      const next = points[(i + 1) % points.length]
      return sum + point.x * next.y - next.x * point.y
    }, 0) / 2,
  )
}

function surfaceArea(surface: PanelSurface) {
  return surface.polygons.reduce(
    (sum, polygon) =>
      sum +
      ringArea(polygon.contour) -
      polygon.holes.reduce((total, hole) => total + ringArea(hole), 0),
    0,
  )
}

function triangulatedArea(surface: PanelSurface) {
  return surface.polygons.reduce((area, polygon) => {
    const contour = polygon.contour.map(({ x, y }) => new Vector2(x, y))
    const holes = polygon.holes.map((ring) => ring.map(({ x, y }) => new Vector2(x, y)))
    const triangles = ShapeUtils.triangulateShape(contour, holes)
    const points = [...contour, ...holes.flat()]
    return (
      area +
      triangles.reduce((sum, indices) => sum + ringArea(indices.map((index) => points[index])), 0)
    )
  }, 0)
}

function edgeSpans(surface: PanelSurface, y: number, x: number) {
  return surface.boundaries.some(
    ({ start, end }) =>
      Math.abs(start.y - y) < 1e-8 &&
      Math.abs(end.y - y) < 1e-8 &&
      Math.min(start.x, end.x) < x &&
      Math.max(start.x, end.x) > x,
  )
}

describe('plywood surface with open-edge kerfs', () => {
  it('keeps an uncut panel intact with only layered perimeter walls', () => {
    const surface = createPanelSurface(rectangle, [], 0.15)
    expect(surface.polygons).toHaveLength(1)
    expect(surface.polygons[0].holes).toHaveLength(0)
    expect(surface.boundaries).toHaveLength(4)
    expect(surface.boundaries.every((edge) => edge.kind === 'outer')).toBe(true)
    expect(surfaceArea(surface)).toBe(100)
    expect(triangulatedArea(surface)).toBe(100)
  })

  it('opens the top and bottom edge without capping their mouths or deleting the bridge', () => {
    const surface = createPanelSurface(
      rectangle,
      [
        { x: 5, y1: 0, y2: 4 },
        { x: 5, y1: 6, y2: 10 },
      ],
      1,
    )
    expect(surface.polygons).toHaveLength(1)
    expect(surface.polygons[0].holes).toHaveLength(0)
    expect(edgeSpans(surface, 0, 5)).toBe(false)
    expect(edgeSpans(surface, 10, 5)).toBe(false)
    expect(surface.boundaries.filter((edge) => edge.kind === 'kerf')).toHaveLength(6)
    expect(surfaceArea(surface)).toBeCloseTo(92, 10)
    expect(triangulatedArea(surface)).toBeCloseTo(92, 10)
    // Both slit ends retain a wall at the internal bridge, not at the sheet edge.
    expect(edgeSpans(surface, 4, 5)).toBe(true)
    expect(edgeSpans(surface, 6, 5)).toBe(true)
  })

  it('keeps an internal slit as a genuine enclosed hole', () => {
    const surface = createPanelSurface(rectangle, [{ x: 5, y1: 3, y2: 7 }], 1)
    expect(surface.polygons).toHaveLength(1)
    expect(surface.polygons[0].holes).toHaveLength(1)
    expect(surface.boundaries.filter((edge) => edge.kind === 'kerf')).toHaveLength(4)
    expect(edgeSpans(surface, 0, 5)).toBe(true)
    expect(surfaceArea(surface)).toBeCloseTo(96, 10)
    expect(triangulatedArea(surface)).toBeCloseTo(96, 10)
  })

  it('clips notches against sloped triangle edges and triangulates only surviving material', () => {
    const triangle: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 10 },
    ]
    const surface = createPanelSurface(
      triangle,
      [
        { x: 5, y1: 0, y2: 4 },
        { x: 5, y1: 6, y2: 10 },
      ],
      1,
    )
    expect(surface.polygons).toHaveLength(1)
    expect(surface.polygons[0].holes).toHaveLength(0)
    expect(surfaceArea(surface)).toBeCloseTo(42.5, 10)
    expect(triangulatedArea(surface)).toBeCloseTo(42.5, 10)
    expect(edgeSpans(surface, 0, 5)).toBe(false)
    expect(surface.boundaries.some(({ start, end }) => start.y === 10 || end.y === 10)).toBe(false)
  })

  it('opens all four boundaries of disconnected spans in a concave outline', () => {
    const outline = [
      { x: 0, y: 0 },
      { x: 12, y: 0 },
      { x: 12, y: 4 },
      { x: 4, y: 4 },
      { x: 4, y: 8 },
      { x: 12, y: 8 },
      { x: 12, y: 12 },
      { x: 0, y: 12 },
    ]
    const surface = createPanelSurface(
      outline,
      [
        { x: 8, y1: 0, y2: 2 },
        { x: 8, y1: 3, y2: 4 },
        { x: 8, y1: 8, y2: 9 },
        { x: 8, y1: 10, y2: 12 },
      ],
      1,
    )
    expect(surface.polygons).toHaveLength(1)
    expect(surface.polygons[0].holes).toHaveLength(0)
    for (const y of [0, 4, 8, 12]) expect(edgeSpans(surface, y, 8)).toBe(false)
    expect(surfaceArea(surface)).toBeCloseTo(106, 10)
    expect(triangulatedArea(surface)).toBeCloseTo(106, 10)
  })

  it('accepts analytic circle endpoints outside the tessellated contour without phantom caps', () => {
    const circle = Array.from({ length: 128 }, (_, index) => {
      const angle = (index * Math.PI * 2) / 128
      return { x: 5 + 5 * Math.cos(angle), y: 5 + 5 * Math.sin(angle) }
    })
    const surface = createPanelSurface(
      circle,
      [
        { x: 2, y1: 1, y2: 3 },
        { x: 2, y1: 7, y2: 9 },
      ],
      0.2,
    )
    expect(surface.polygons).toHaveLength(1)
    expect(surface.polygons[0].holes).toHaveLength(0)
    expect(surfaceArea(surface)).toBeLessThan(ringArea(circle))
    expect(triangulatedArea(surface)).toBeCloseTo(surfaceArea(surface), 8)
  })

  it('represents separated pieces if a toolpath really crosses the entire sheet', () => {
    const surface = createPanelSurface(rectangle, [{ x: 5, y1: 0, y2: 10 }], 1)
    expect(surface.polygons).toHaveLength(2)
    expect(surface.polygons.every((polygon) => polygon.holes.length === 0)).toBe(true)
    expect(surfaceArea(surface)).toBeCloseTo(90, 10)
    expect(triangulatedArea(surface)).toBeCloseTo(90, 10)
    expect(edgeSpans(surface, 0, 5)).toBe(false)
    expect(edgeSpans(surface, 10, 5)).toBe(false)
  })
})
