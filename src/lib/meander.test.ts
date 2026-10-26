import { describe, expect, it } from 'vitest'
import { createCutPlan, defaultDesign, exportDXF, exportSVG, validateDesign } from './geometry'
import { cutPathData, getCutPoints } from './cut-path'
import { meanderCell, meanderClearance, meanderRepeat } from './meander'
import { createPanelSurface } from './panel-surface'
import type { Design, Point } from './types'

const patterns = ['meander', 'meander-wide'] as const
const reference = (overrides: Partial<Design> = {}): Design => ({
  ...structuredClone(defaultDesign),
  pattern: 'meander',
  spacing: 3.04,
  bridge: 1.62,
  cutLength: overrides.pattern === 'meander-wide' ? 33.87 : 22.58,
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
const perimeterCuts = (outline: Point[]) =>
  outline.map((a, i) => {
    const b = outline[(i + 1) % outline.length]
    return {
      x: a.x,
      y1: Math.min(a.y, b.y),
      y2: Math.max(a.y, b.y),
      points: [a, b],
      roundCaps: true,
    }
  })

describe('rounded meander slits', () => {
  it('matches the source open step profile, overlapping repeat and transverse bridge', () => {
    const input = reference(),
      cell = meanderCell(input)
    expect(Math.max(...cell.map((p) => p.y)) - Math.min(...cell.map((p) => p.y))).toBeCloseTo(
      22.58,
      6,
    )
    expect(Math.max(...cell.map((p) => p.x)) - Math.min(...cell.map((p) => p.x))).toBeCloseTo(
      3.24,
      6,
    )
    expect(Math.abs(cell[0].x - cell.at(-1)!.x)).toBeCloseTo(1.62, 3)
    expect(meanderRepeat(input)).toBeCloseTo(18.94872, 3)
    expect(input.cutLength - meanderRepeat(input)).toBeGreaterThan(3.6)
    expect(cell.length).toBeGreaterThan(8)
    for (let i = 1; i < cell.length; i++) expect(cell[i].y).toBeLessThanOrEqual(cell[i - 1].y)
    const turns = cell.slice(0, -2).map((p, i) => {
      const q = cell[i + 1],
        r = cell[i + 2]
      return (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x)
    })
    expect(turns.some((turn) => turn > 1e-6)).toBe(true)
    expect(turns.some((turn) => turn < -1e-6)).toBe(true)
  })

  it('makes Wide a distinct lattice even with identical dimension controls', () => {
    const fine = reference(),
      wide = reference({ pattern: 'meander-wide', cutLength: fine.cutLength })
    expect(meanderRepeat(wide)).toBeGreaterThan(meanderRepeat(fine))
    expect(meanderRepeat(wide)).toBeLessThan(wide.cutLength)
    expect(createCutPlan(wide).cuts).not.toEqual(createCutPlan(fine).cuts)
  })

  it.each([0.15, 0.01])(
    'samples the reference rounded turns within the %.2f mm kerf tolerance',
    (kerf) => {
      // Independently evaluated t=0.5 points on the original eight PDF cubics,
      // transformed into the practical reference preset's millimetres.
      const source = [
        [-0.01896763, 20.07686389],
        [-0.42381773, 17.93527548],
        [-1.19609409, 17.19706343],
        [-1.60119109, 15.05543532],
        [-1.53969398, 9.54650739],
        [-0.47605588, 7.71439177],
        [0.73155459, 6.84846415],
        [1.56789412, 3.33035482],
      ]
      const cell = meanderCell(reference({ kerf }))
      for (const [x, y] of source) {
        const distance = Math.min(
          ...cell.slice(1).map((b, i) => {
            const a = cell[i],
              dx = b.x - a.x,
              dy = b.y - a.y
            const t = Math.max(
              0,
              Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)),
            )
            return Math.hypot(x - a.x - t * dx, y - a.y - t * dy)
          }),
        )
        expect(distance).toBeLessThanOrEqual(Math.min(0.01, kerf / 4))
      }
    },
  )

  it('measures clearance between overlapping motifs instead of using their overlapping boxes', () => {
    const input = reference()
    // Independent dense evaluation of the original PDF curves: 1.31872 mm.
    // The practical preset rounds its row pitch from 3.04451 to 3.04 mm.
    expect(Math.abs(meanderClearance(input, meanderCell(input)) - 1.31872)).toBeLessThan(0.02)
    expect(() => exportSVG(input)).not.toThrow()
    expect(() => exportSVG(reference({ kerf: 1.5 }))).toThrow('connected material')
    expect(() => exportDXF(reference({ kerf: 1.5 }))).toThrow('connected material')
    const crossing = reference({ spacing: 0.5 })
    expect(meanderClearance(crossing, meanderCell(crossing))).toBeLessThanOrEqual(crossing.kerf)
    expect(() => exportSVG(crossing)).toThrow('connected material')
  })

  it.each(patterns)(
    '%s supports both existing controls and reference dimensions as open slits',
    (pattern) => {
      for (const input of [
        { ...structuredClone(defaultDesign), pattern },
        reference({ pattern }),
      ]) {
        const plan = createCutPlan(input)
        expect(plan.warnings).toEqual([])
        expect(plan.cuts.length).toBeGreaterThan(20)
        expect(plan.cutouts ?? []).toHaveLength(0)
        expect(plan.cuts.every((cut) => !cut.closed && cut.roundCaps)).toBe(true)
        expect(validateDesign(JSON.parse(JSON.stringify(input)))).toEqual(input)
        // Include the exported outside-contour cut: its half-kerf must not
        // reach a slit tip and detach material at an otherwise valid edge.
        const surface = createPanelSurface(
          plan.outline,
          [...plan.cuts, ...perimeterCuts(plan.outline)],
          input.kerf,
        )
        expect(surface.polygons.filter((polygon) => area(polygon.contour) > 1e-5)).toHaveLength(1)
        const remaining = surface.polygons.reduce(
          (sum, polygon) =>
            sum + area(polygon.contour) - polygon.holes.reduce((s, hole) => s + area(hole), 0),
          0,
        )
        expect(remaining).toBeGreaterThan(area(plan.outline) * 0.8)
        expect(remaining).toBeLessThan(area(plan.outline))
      }
    },
  )

  for (const pattern of patterns)
    it.each(['rectangle', 'triangle', 'ellipse', 'circle', 'custom'] as const)(
      `${pattern} keeps the %s sheet connected while clipping its edge slits`,
      (outline) => {
        const input = reference({
          pattern,
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
        expect(plan.cuts.length).toBeGreaterThan(10)
        for (const cut of plan.cuts)
          for (const point of getCutPoints(cut)) {
            expect(point.x).toBeGreaterThanOrEqual(-1e-6)
            expect(point.y).toBeGreaterThanOrEqual(-1e-6)
            expect(point.x).toBeLessThanOrEqual(plan.length + 1e-6)
            expect(point.y).toBeLessThanOrEqual(plan.width + 1e-6)
          }
        const surface = createPanelSurface(
          plan.outline,
          [...plan.cuts, ...perimeterCuts(plan.outline)],
          input.kerf,
        )
        expect(surface.polygons.filter((polygon) => area(polygon.contour) > 1e-5)).toHaveLength(1)
        expect(surface.polygons[0].holes.length).toBeGreaterThan(5)
      },
    )

  it.each(patterns)('%s uses the same open curves in the preview, SVG and DXF', (pattern) => {
    const input = reference({ pattern }),
      plan = createCutPlan(input)
    const svg = exportSVG(input)
    expect(svg).toContain('width="100mm" height="100mm"')
    expect(svg.match(/ Z"/g)).toHaveLength(1)
    for (const cut of plan.cuts) expect(svg).toContain(`d="${cutPathData(cut)}"`)
    const edgeCuts = plan.cuts.filter((cut) =>
      cut.points!.some((p) => Math.min(p.y, input.width - p.y) < 1e-7),
    )
    expect(edgeCuts.length).toBeGreaterThan(0)
    for (const cut of edgeCuts) {
      const points = getCutPoints(cut)
      // A retained slit may start at an edge, but cannot sever the sheet by
      // joining its two edges, or manufacture a closure along the perimeter.
      expect(
        [points[0], points.at(-1)!].filter((p) => Math.min(p.y, input.width - p.y) < 1e-7).length,
      ).toBe(1)
      for (let i = 1; i < points.length; i++) {
        expect(points[i].y === 0 && points[i - 1].y === 0).toBe(false)
        expect(points[i].y === input.width && points[i - 1].y === input.width).toBe(false)
      }
    }
    const dxf = exportDXF(input)
    expect(dxf).toContain('$INSUNITS\n70\n4')
    expect(dxf.match(/0\nLINE\n/g)).toHaveLength(
      plan.cuts.reduce((sum, cut) => sum + getCutPoints(cut).length - 1, 0),
    )
  })

  it('keeps a curved boundary connected after both slit and perimeter kerfs are applied', () => {
    const input = reference({
      pattern: 'meander-wide',
      outline: 'ellipse',
      width: 140,
      segments: [
        { id: 'a', type: 'arc', radius: 50, angle: ((30.51 / 50) * 180) / Math.PI },
        { id: 'b', type: 'arc', radius: 50, angle: (-(30.51 / 50) * 180) / Math.PI },
      ],
    })
    const plan = createCutPlan(input)
    expect(plan.cuts.length).toBeGreaterThan(10)
    const surface = createPanelSurface(
      plan.outline,
      [...plan.cuts, ...perimeterCuts(plan.outline)],
      input.kerf,
    )
    expect(surface.polygons.filter((polygon) => area(polygon.contour) > 1e-5)).toHaveLength(1)
  })

  it('rejects excessive meander complexity before generation or project import', () => {
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
