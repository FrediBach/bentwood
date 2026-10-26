import { describe, expect, it } from 'vitest'
import { createCutPlan, defaultDesign, exportDXF, exportSVG, validateDesign } from './geometry'
import { cutPathData, getCutPoints } from './cut-path'
import { honeycombCell, honeycombClearance } from './honeycomb'
import { createPanelSurface } from './panel-surface'
import type { Design, Point } from './types'

const reference = (overrides: Partial<Design> = {}): Design => ({
  ...structuredClone(defaultDesign),
  pattern: 'honeycomb',
  spacing: 2.4,
  bridge: 6.56,
  cutLength: 19.68,
  width: 100,
  segments: [{ id: 'arc', type: 'arc', radius: 100, angle: 180 / Math.PI }],
  ...overrides,
})
const area = (ring: Point[]) =>
  Math.abs(
    ring.reduce((sum, p, i) => {
      const q = ring[(i + 1) % ring.length]
      return sum + p.x * q.y - q.x * p.y
    }, 0),
  ) / 2

describe('reference honeycomb lattice', () => {
  it('matches the source lens dimensions, repeat and half-row stagger', () => {
    const plan = createCutPlan(reference())
    expect(plan.warnings).toEqual([])
    const rows = [...new Set(plan.cuts.map((cut) => cut.x))]
    expect(rows[1] - rows[0]).toBeCloseTo(2.4, 10)
    const cells = rows.slice(0, 2).map((x) => plan.cuts.filter((cut) => cut.x === x && cut.closed))
    const first = cells[0][0]
    expect(first.y2 - first.y1).toBeCloseTo(19.68, 10)
    expect(
      Math.max(...first.points!.map((p) => p.x)) - Math.min(...first.points!.map((p) => p.x)),
    ).toBeCloseTo(2.25, 10)
    expect(cells[0][1].y1 - first.y1).toBeCloseTo(26.24, 10)
    expect(Math.abs(cells[1][0].y1 - first.y1)).toBeCloseTo(13.12, 10)
  })

  it('preserves the curved, pinched tips instead of substituting diamonds or ellipses', () => {
    const cell = honeycombCell(reference())
    expect(cell.length).toBeGreaterThan(8)
    // The source has both concave and convex curvature on each side of a tip.
    const turns = cell.map((p, i) => {
      const q = cell[(i + 1) % cell.length],
        r = cell[(i + 2) % cell.length]
      return (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x)
    })
    expect(turns.some((turn) => turn > 1e-6)).toBe(true)
    expect(turns.some((turn) => turn < -1e-6)).toBe(true)
    // Check a densely evaluated source quarter against the exported polyline.
    const source = [
      [
        [0, 0],
        [0.11251, 0],
        [0.18706, 0.243],
        [0.25352, 0.483],
      ],
      [
        [0.25352, 0.483],
        [0.33474, 0.77622],
        [0.41407, 1],
        [0.5, 1],
      ],
    ]
    const distanceToCell = (p: Point) =>
      Math.min(
        ...cell.map((a, i) => {
          const b = cell[(i + 1) % cell.length]
          const dx = b.x - a.x,
            dy = b.y - a.y
          const t = Math.max(
            0,
            Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)),
          )
          return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
        }),
      )
    for (const controls of source)
      for (let step = 0; step <= 100; step++) {
        const t = step / 100,
          weights = [(1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3]
        const u = controls.reduce((sum, p, i) => sum + weights[i] * p[0], 0)
        const v = controls.reduce((sum, p, i) => sum + weights[i] * p[1], 0)
        expect(distanceToCell({ x: v * 1.125, y: (u - 0.5) * 19.68 })).toBeLessThanOrEqual(0.01)
      }
  })

  it('checks staggered contour clearance rather than the much smaller bounding-box gap', () => {
    const input = reference()
    // Independently measured from the source's dense Bézier contours: 1.54342 mm.
    expect(Math.abs(honeycombClearance(input, honeycombCell(input)) - 1.54342)).toBeLessThan(0.01)
    expect(() => exportSVG(input)).not.toThrow()
    expect(() => exportSVG(reference({ kerf: 1.6 }))).toThrow('connected material')
    expect(() => exportDXF(reference({ kerf: 1.6 }))).toThrow('connected material')
  })

  it.each(['rectangle', 'triangle', 'ellipse', 'circle', 'custom'] as const)(
    'removes the lens scrap while keeping the %s sheet connected',
    (outline) => {
      const input = reference({
        outline,
        customOutline: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 0.3 },
          { x: 0.35, y: 0.3 },
          { x: 0.35, y: 0.7 },
          { x: 1, y: 0.7 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
      })
      const plan = createCutPlan(input)
      const surface = createPanelSurface(plan.outline, plan.cuts, input.kerf, plan.cutouts)
      expect(surface.polygons.filter((p) => area(p.contour) > 1e-6)).toHaveLength(1)
      expect(surface.polygons[0].holes.length).toBeGreaterThan(20)
      expect(plan.cuts.some((cut) => !cut.closed)).toBe(true)
    },
  )

  it('exports the same closed and edge-open contours in millimetres without perimeter closures', () => {
    const input = reference(),
      plan = createCutPlan(input)
    const svg = exportSVG(input)
    expect(svg).toContain('width="100mm" height="100mm"')
    for (const cut of plan.cuts) {
      expect(svg).toContain(`d="${cutPathData(cut)}"`)
      if (!cut.closed) {
        const points = getCutPoints(cut)
        for (const endpoint of [points[0], points.at(-1)!])
          expect(Math.min(endpoint.y, input.width - endpoint.y)).toBeCloseTo(0, 8)
        for (let i = 1; i < points.length; i++) {
          // Edge openings must not acquire an extra cut along the panel perimeter.
          expect(points[i].y === 0 && points[i - 1].y === 0).toBe(false)
          expect(points[i].y === input.width && points[i - 1].y === input.width).toBe(false)
        }
      }
    }
    const dxf = exportDXF(input)
    expect(dxf.match(/0\nLINE\n/g)).toHaveLength(
      plan.cuts.reduce((sum, cut) => sum + getCutPoints(cut).length - 1, 0),
    )
    expect(dxf).toContain('$INSUNITS\n70\n4')
    expect(validateDesign(JSON.parse(JSON.stringify(input)))).toEqual(input)
  })

  it('rejects excessive curve complexity before generating or importing a large design', () => {
    const input = reference({
      width: 1000,
      segments: [{ id: 'large', type: 'arc', radius: 1000, angle: 180 / Math.PI }],
    })
    const plan = createCutPlan(input)
    expect(plan.cuts).toHaveLength(0)
    expect(plan.warnings.some((warning) => warning.includes('250,000 toolpath segments'))).toBe(
      true,
    )
    expect(plan.warnings.some((warning) => warning.includes('50,000 cuts'))).toBe(false)
    expect(validateDesign(input)).toBeNull()
    expect(() => exportSVG(input)).toThrow('Reduce the number')
  })
})
