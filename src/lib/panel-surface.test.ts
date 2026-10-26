import { describe, expect, it } from 'vitest'
import { ShapeUtils, Vector2 } from 'three'
import { createPanelSurface, type PanelSurface } from './panel-surface'
import { cutPathData, cutPathLength, getCutPoints } from './cut-path'
import type { CutLine, Point } from './types'

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

  it('uses the perpendicular kerf width for diagonal slots', () => {
    const surface = createPanelSurface(
      rectangle,
      [
        {
          x: 5,
          y1: 2,
          y2: 8,
          points: [
            { x: 2, y: 2 },
            { x: 8, y: 8 },
          ],
        },
      ],
      1,
    )
    expect(surface.polygons).toHaveLength(1)
    expect(surface.polygons[0].holes).toHaveLength(1)
    const expectedArea = 100 - Math.hypot(6, 6)
    expect(surfaceArea(surface)).toBeCloseTo(expectedArea, 10)
    expect(triangulatedArea(surface)).toBeCloseTo(expectedArea, 10)
  })

  it('joins zigzag kerfs without islands and preserves the material between separate cuts', () => {
    const points = [
      { x: 4, y: 0 },
      { x: 6, y: 2 },
      { x: 4, y: 4 },
    ]
    const surface = createPanelSurface(
      rectangle,
      [
        { x: 5, y1: 0, y2: 4, points },
        { x: 5, y1: 6, y2: 10, points: points.map(({ x, y }) => ({ x, y: y + 6 })) },
      ],
      0.4,
    )
    expect(surface.polygons).toHaveLength(1)
    expect(surface.polygons[0].holes).toHaveLength(0)
    expect(edgeSpans(surface, 0, 4)).toBe(false)
    expect(edgeSpans(surface, 10, 4)).toBe(false)
    // Neither cut's stroke reaches the two-millimetre uncut bridge.
    expect(
      surface.boundaries.every(
        ({ start, end, kind }) =>
          kind === 'outer' || (start.y < 4.5 && end.y < 4.5) || (start.y > 5.5 && end.y > 5.5),
      ),
    ).toBe(true)
    expect(triangulatedArea(surface)).toBeCloseTo(surfaceArea(surface), 9)
  })

  it('triangulates a sampled wave as one continuous hole with no material pinholes', () => {
    const points = Array.from({ length: 41 }, (_, index) => ({
      x: 5 + Math.sin((index / 40) * Math.PI * 4),
      y: 1 + (index / 40) * 8,
    }))
    const surface = createPanelSurface(rectangle, [{ x: 5, y1: 1, y2: 9, points }], 0.2)
    const pathLength = points
      .slice(1)
      .reduce(
        (sum, point, index) =>
          sum + Math.hypot(point.x - points[index].x, point.y - points[index].y),
        0,
      )
    expect(surface.polygons).toHaveLength(1)
    expect(surface.polygons[0].holes).toHaveLength(1)
    expect(surfaceArea(surface)).toBeCloseTo(100 - pathLength * 0.2, 9)
    expect(triangulatedArea(surface)).toBeCloseTo(surfaceArea(surface), 9)
  })
})

describe('removed cutout interiors', () => {
  const square = [
    { x: 3, y: 3 },
    { x: 7, y: 3 },
    { x: 7, y: 7 },
    { x: 3, y: 7 },
  ]

  it.each([false, true])(
    'removes closed scrap and joins the closing seam, reversed=%s',
    (reversed) => {
      const points = reversed ? [...square].reverse() : square
      const cut: CutLine = { x: 5, y1: 3, y2: 7, points, closed: true }
      const surface = createPanelSurface(rectangle, [cut], 1)
      expect(surface.polygons).toHaveLength(1)
      expect(surface.polygons[0].holes).toHaveLength(1)
      // The removed square grows by the edge strips and four rounded beam-radius
      // corners. At this radius the 0.01-mm tolerance uses four segments per arc.
      const roundedCornerArea = 8 * 0.5 ** 2 * Math.sin(Math.PI / 8)
      const expected = 100 - 16 - 16 * 0.5 - roundedCornerArea
      expect(surfaceArea(surface)).toBeCloseTo(expected, 10)
      expect(triangulatedArea(surface)).toBeCloseTo(expected, 10)
      expect(surface.boundaries.filter((boundary) => boundary.kind === 'kerf')).toHaveLength(20)
    },
  )

  it('shares exactly one closing edge between SVG, path length, and point consumers', () => {
    const cut: CutLine = { x: 5, y1: 3, y2: 7, points: square, closed: true }
    const repeated = { ...cut, points: [...square, square[0]] }
    expect(getCutPoints(cut)).toEqual([...square, square[0]])
    expect(getCutPoints(repeated)).toHaveLength(5)
    expect(cutPathLength(cut)).toBe(16)
    expect(cutPathLength(repeated)).toBe(16)
    expect(cutPathData(cut)).toBe('M3 3 L7 3 L7 7 L3 7 Z')
    expect(cutPathData(repeated)).toBe(cutPathData(cut))
    expect(surfaceArea(createPanelSurface(rectangle, [repeated], 1))).toBeCloseTo(
      surfaceArea(createPanelSurface(rectangle, [cut], 1)),
      10,
    )
  })

  it('removes filled cutouts even with zero kerf or without a stroke path', () => {
    const cut: CutLine = { x: 5, y1: 3, y2: 7, points: square, closed: true }
    for (const surface of [
      createPanelSurface(rectangle, [cut], 0),
      createPanelSurface(rectangle, [], 0.15, [square]),
    ]) {
      expect(surface.polygons).toHaveLength(1)
      expect(surface.polygons[0].holes).toHaveLength(1)
      expect(surfaceArea(surface)).toBe(84)
      expect(triangulatedArea(surface)).toBe(84)
    }
  })

  it('removes edge scrap using its filled region without inventing an outer-edge toolpath', () => {
    const region = [
      { x: 3, y: 0 },
      { x: 3, y: 4 },
      { x: 7, y: 4 },
      { x: 7, y: 0 },
    ]
    const surface = createPanelSurface(rectangle, [{ x: 5, y1: 0, y2: 4, points: region }], 0.4, [
      region,
    ])
    expect(surface.polygons).toHaveLength(1)
    expect(surface.polygons[0].holes).toHaveLength(0)
    expect(edgeSpans(surface, 0, 5)).toBe(false)
    const roundedCorners = 3 * 0.2 ** 2 * Math.sin(Math.PI / 6)
    expect(surfaceArea(surface)).toBeCloseTo(100 - 16 - 2 * 4 * 0.2 - 4 * 0.2 - roundedCorners, 10)
    expect(triangulatedArea(surface)).toBeCloseTo(surfaceArea(surface), 10)
  })

  it('triangulates a curved closed opening as a hole, never as retained floating scrap', () => {
    const points = Array.from({ length: 96 }, (_, i) => {
      const angle = (i / 96) * Math.PI * 2
      return { x: 5 + 3 * Math.cos(angle), y: 5 + Math.sin(angle) + 0.3 * Math.sin(2 * angle) }
    })
    const surface = createPanelSurface(
      rectangle,
      [{ x: 5, y1: 3, y2: 7, points, closed: true }],
      0.2,
    )
    expect(surface.polygons).toHaveLength(1)
    expect(surface.polygons[0].holes).toHaveLength(1)
    expect(surfaceArea(surface)).toBeLessThan(100 - ringArea(points))
    expect(triangulatedArea(surface)).toBeCloseTo(surfaceArea(surface), 9)
  })

  it('rounds acute aperture tips to the laser radius without consuming the web between cells', () => {
    const outline = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 30 },
      { x: 0, y: 30 },
    ]
    const cells = [8, 20].map((y): CutLine => ({
      x: 10,
      y1: y - 5,
      y2: y + 5,
      closed: true,
      points: [
        { x: 10, y: y - 5 },
        { x: 12, y },
        { x: 10, y: y + 5 },
        { x: 8, y },
      ],
    }))
    const surface = createPanelSurface(outline, cells, 0.8)
    expect(surface.polygons).toHaveLength(1)
    const holes = surface.polygons[0].holes.sort(
      (a, b) => Math.min(...a.map((p) => p.y)) - Math.min(...b.map((p) => p.y)),
    )
    expect(holes).toHaveLength(2)
    const clearance = Math.min(...holes[1].map((p) => p.y)) - Math.max(...holes[0].map((p) => p.y))
    expect(clearance).toBeGreaterThanOrEqual(2 - 0.8 - 1e-8)
    expect(triangulatedArea(surface)).toBeCloseTo(surfaceArea(surface), 9)
  })

  it('uses the beam radius at clipped aperture endpoints on the panel boundary', () => {
    const points = [
      { x: 3, y: 0 },
      { x: 5, y: 6 },
      { x: 7, y: 0 },
    ]
    const surface = createPanelSurface(rectangle, [{ x: 5, y1: 0, y2: 6, points }], 0.4, [points])
    expect(surface.polygons).toHaveLength(1)
    // This point is within the radius of the starting beam position, but behind
    // the tilted butt cap. It must not remain as a sliver of apparent material.
    const probe = { x: 2.85, y: 0.02 }
    const contour = surface.polygons[0].contour
    let inside = false
    for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
      const a = contour[i],
        b = contour[j]
      if (
        a.y > probe.y !== b.y > probe.y &&
        probe.x < ((b.x - a.x) * (probe.y - a.y)) / (b.y - a.y) + a.x
      )
        inside = !inside
    }
    expect(inside).toBe(false)
    expect(triangulatedArea(surface)).toBeCloseTo(surfaceArea(surface), 9)
  })
})
