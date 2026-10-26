import { describe, expect, it } from 'vitest'
import {
  createCutPlan,
  defaultDesign,
  exportDXF,
  exportSVG,
  getOutline,
  isSimplePolygon,
  roundPolygonCorners,
  validateDesign,
} from './geometry'
import { createPanelSurface } from './panel-surface'
import type { Design, Point } from './types'

const rectangle = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 40 },
  { x: 0, y: 40 },
]

function area(points: Point[]) {
  return Math.abs(
    points.reduce((sum, point, i) => {
      const next = points[(i + 1) % points.length]
      return sum + point.x * next.y - next.x * point.y
    }, 0) / 2,
  )
}

describe('custom outline corner radius', () => {
  it('preserves sharp corners at zero radius and leaves original handles intact', () => {
    const original = structuredClone(rectangle)
    expect(roundPolygonCorners(rectangle, 0)).toEqual(rectangle)
    roundPolygonCorners(rectangle, 10)
    expect(rectangle).toEqual(original)
  })

  it.each([1e-8, 1e-5, 1e-4, 1e-3])('keeps submillimetre radius %s exportable', (radius) => {
    expect(isSimplePolygon(roundPolygonCorners(rectangle, radius))).toBe(true)
  })

  it.each([false, true])('uses tangent circular corners within 0.01 mm, reversed=%s', (reverse) => {
    const rounded = roundPolygonCorners(reverse ? [...rectangle].reverse() : rectangle, 10)
    expect(isSimplePolygon(rounded)).toBe(true)
    const corner = rounded.filter((point) => point.x <= 10 && point.y <= 10)
    expect(corner.length).toBeGreaterThan(2)
    expect(corner.some((point) => point.x === 0 && Math.abs(point.y - 10) < 1e-10)).toBe(true)
    expect(corner.some((point) => Math.abs(point.x - 10) < 1e-10 && point.y === 0)).toBe(true)
    for (const point of corner) expect(Math.hypot(point.x - 10, point.y - 10)).toBeCloseTo(10, 10)
    for (let i = 1; i < corner.length; i++) {
      const middle = {
        x: (corner[i - 1].x + corner[i].x) / 2,
        y: (corner[i - 1].y + corner[i].y) / 2,
      }
      expect(10 - Math.hypot(middle.x - 10, middle.y - 10)).toBeLessThanOrEqual(0.01)
    }
    expect(Math.abs(area(rounded) - (4000 - (4 - Math.PI) * 100))).toBeLessThan(0.5)
  })

  it('limits oversized radii without duplicate tangent points or crossed edges', () => {
    const rounded = roundPolygonCorners(rectangle, 1000)
    expect(isSimplePolygon(rounded)).toBe(true)
    expect(Math.min(...rounded.map((point) => point.x))).toBeCloseTo(0, 10)
    expect(Math.max(...rounded.map((point) => point.x))).toBeCloseTo(100, 10)
    expect(Math.min(...rounded.map((point) => point.y))).toBeCloseTo(0, 10)
    expect(Math.max(...rounded.map((point) => point.y))).toBeCloseTo(40, 10)
    expect(Math.abs(area(rounded) - (4000 - (4 - Math.PI) * 400))).toBeLessThan(1)
  })

  it('rounds concave corners and protects narrow notches and nearby edges', () => {
    const notched = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 20 },
      { x: 5, y: 20 },
      { x: 5, y: 21 },
      { x: 100, y: 21 },
      { x: 100, y: 40 },
      { x: 0, y: 40 },
    ]
    for (const input of [notched, [...notched].reverse()]) {
      const rounded = roundPolygonCorners(input, 1000)
      expect(isSimplePolygon(rounded)).toBe(true)
      expect(rounded).not.toContainEqual({ x: 5, y: 20 })
      expect(
        rounded.some((point) => point.x > 5 && point.x < 5.5 && point.y > 20 && point.y < 20.5),
      ).toBe(true)
      expect(rounded.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(
        true,
      )
    }
  })

  it('handles acute corners and collinear editing points', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 1 },
    ]
    const rounded = roundPolygonCorners(points, 1000)
    expect(isSimplePolygon(rounded)).toBe(true)
    expect(rounded).toContainEqual({ x: 50, y: 0 })
    expect(area(rounded)).toBeGreaterThan(0)
  })

  it('shares rounded physical contours between the cut plan, model surface, and exports', () => {
    const input: Design = {
      ...defaultDesign,
      outline: 'custom',
      outlineCornerRadius: 10,
      segments: [{ id: 'bend', type: 'arc', radius: 100 / Math.PI, angle: 180 }],
      width: 40,
    }
    const plan = createCutPlan(input)
    expect(plan.outline).toEqual(roundPolygonCorners(rectangle, 10))
    expect(plan.outline).toEqual(getOutline(input))
    expect(plan.cuts.length).toBeGreaterThan(0)
    expect(createPanelSurface(plan.outline, plan.cuts, input.kerf).polygons).toHaveLength(1)
    const svg = exportSVG(input)
    expect(svg).toContain('transform="translate(0 40) scale(1 -1)"')
    expect(svg).toContain('<path d="M0 10 L')
    const dxf = exportDXF(input)
    const vertices = [...dxf.matchAll(/AcDb2dVertex\n10\n([^\n]+)\n20\n([^\n]+)/g)].map(
      (match) => ({
        x: Number(match[1]),
        y: Number(match[2]),
      }),
    )
    expect(vertices).toEqual(
      plan.outline.map(({ x, y }) => ({ x: Number(x.toFixed(6)), y: Number(y.toFixed(6)) })),
    )
    expect(getOutline({ ...input, outline: 'rectangle' })).toEqual(rectangle)
  })

  it('persists the radius and defaults projects saved before the control to sharp corners', () => {
    const input = { ...defaultDesign, outlineCornerRadius: 12.5 }
    expect(validateDesign(JSON.parse(JSON.stringify(input)))).toEqual(input)
    const { outlineCornerRadius: _radius, ...legacy } = input
    for (const version of [1, 2, 3, 4]) {
      expect(validateDesign({ ...legacy, version })?.outlineCornerRadius).toBe(0)
    }
    for (const outlineCornerRadius of [-1, NaN, Infinity, '10', null, 1001]) {
      expect(validateDesign({ ...defaultDesign, outlineCornerRadius })).toBeNull()
    }
  })
})
