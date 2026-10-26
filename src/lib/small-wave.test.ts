import { describe, expect, it } from 'vitest'
import { createCutPlan, defaultDesign, exportDXF, exportSVG, validateDesign } from './geometry'
import { cutPathData, getCutPoints } from './cut-path'
import { createPanelSurface } from './panel-surface'
import type { Design, Point } from './types'

const reference = (overrides: Partial<Design> = {}): Design => ({
  ...structuredClone(defaultDesign),
  pattern: 'small-wave',
  spacing: 2.4,
  bridge: 5.25,
  cutLength: 15.75,
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

describe('reference small-wave lattice', () => {
  it('matches the source diamond proportions, repeat, and half-row stagger', () => {
    const input = reference()
    const plan = createCutPlan(input)
    expect(plan.warnings).toEqual([])
    expect(plan.cutouts!.length).toBeGreaterThan(200)
    const rows = [...new Set(plan.cuts.map((cut) => cut.x))]
    expect(rows[1] - rows[0]).toBeCloseTo(2.4, 10)
    const cells = rows.slice(0, 2).map((x) => plan.cuts.filter((cut) => cut.x === x && cut.closed))
    const first = cells[0][0]
    const points = first.points!
    expect(points).toHaveLength(4)
    expect(first.y2 - first.y1).toBeCloseTo(15.75, 10)
    expect(Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x))).toBeCloseTo(
      1.2,
      10,
    )
    expect(cells[0][1].y1 - first.y1).toBeCloseTo(21, 10)
    expect(Math.abs(cells[1][0].y1 - first.y1)).toBeCloseTo(10.5, 10)
    expect(area(points)).toBeCloseTo((15.75 * 1.2) / 2, 10)
  })

  it('cuts out the apertures and opens boundary cells without duplicate perimeter paths', () => {
    const input = reference()
    const plan = createCutPlan(input)
    expect(plan.cuts.some((cut) => cut.closed)).toBe(true)
    expect(plan.cuts.some((cut) => !cut.closed)).toBe(true)
    const surface = createPanelSurface(plan.outline, plan.cuts, input.kerf, plan.cutouts)
    expect(surface.polygons).toHaveLength(1)
    expect(surface.polygons[0].holes.length).toBeGreaterThan(150)
    const remaining =
      area(surface.polygons[0].contour) -
      surface.polygons[0].holes.reduce((sum, ring) => sum + area(ring), 0)
    expect(remaining).toBeLessThan(8500)
    expect(remaining).toBeGreaterThan(6500)
    for (const cut of plan.cuts) {
      const points = getCutPoints(cut)
      for (let i = 1; i < points.length; i++) {
        // All four diamond sides are sloped; no manufactured closure is added
        // on a panel edge when an aperture opens onto it.
        expect(Math.abs(points[i].x - points[i - 1].x)).toBeGreaterThan(1e-7)
        expect(Math.abs(points[i].y - points[i - 1].y)).toBeGreaterThan(1e-7)
      }
      if (!cut.closed) {
        for (const endpoint of [points[0], points.at(-1)!])
          expect(Math.min(endpoint.y, input.width - endpoint.y)).toBeCloseTo(0, 8)
      }
    }
  })

  it.each(['rectangle', 'triangle', 'ellipse', 'circle', 'custom'] as const)(
    'keeps the %s sheet connected',
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
      expect(plan.cuts.length).toBeGreaterThan(0)
    },
  )

  it('shares closed and clipped toolpaths across previews, SVG, and DXF', () => {
    const input = reference()
    const plan = createCutPlan(input)
    const svg = exportSVG(input)
    expect(svg).toContain('width="100mm" height="100mm"')
    for (const cut of plan.cuts) expect(svg).toContain(`d="${cutPathData(cut)}"`)
    expect(svg.match(/ Z"/g)!.length).toBe(plan.cuts.filter((cut) => cut.closed).length + 1)
    const dxf = exportDXF(input)
    expect(dxf.match(/0\nLINE\n/g)).toHaveLength(
      plan.cuts.reduce((sum, cut) => sum + getCutPoints(cut).length - 1, 0),
    )
    expect(dxf).toContain('$INSUNITS\n70\n4')
    expect(validateDesign(JSON.parse(JSON.stringify(input)))).toEqual(input)
    expect(validateDesign({ ...defaultDesign, pattern: 'wave' })?.pattern).toBe('wave')
  })

  it('blocks kerfs that consume a web between rows and leaves impossibly narrow zones uncut', () => {
    expect(() => exportSVG(reference({ spacing: 1, kerf: 0.5 }))).toThrow('connected material')
    const plan = createCutPlan(
      reference({ segments: [{ id: 'tiny', type: 'arc', radius: 1, angle: 2 }] }),
    )
    expect(plan.cuts).toHaveLength(0)
    expect(plan.warnings.some((warning) => warning.includes('No hinge cuts fit'))).toBe(true)
  })

  it('omits edge apertures when the laser width would sever a narrow sheet', () => {
    const input = reference({ width: 8, outline: 'ellipse', segments: defaultDesign.segments })
    const plan = createCutPlan(input)
    expect(plan.warnings.some((warning) => warning.includes('remain uncut'))).toBe(true)
    const surface = createPanelSurface(plan.outline, plan.cuts, input.kerf, plan.cutouts)
    expect(surface.polygons.filter((p) => area(p.contour) > 1e-5)).toHaveLength(1)
    expect(plan.cuts.length).toBeGreaterThan(0)
  })
})
