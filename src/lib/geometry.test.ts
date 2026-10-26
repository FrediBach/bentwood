import { describe, expect, it } from 'vitest'
import {
  createCutPlan,
  defaultDesign,
  exportDXF,
  exportSVG,
  getOutline,
  getPanelWidth,
  isSimplePolygon,
  pathLength,
  samplePath,
  segmentLength,
  validateDesign,
} from './geometry'
import type { Design, Point, Segment } from './types'

const design = (overrides: Partial<Design> = {}): Design => ({
  ...structuredClone(defaultDesign),
  ...overrides,
})

function distanceToEdge(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const t = Math.max(
    0,
    Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)),
  )
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy)
}

function inside(point: Point, polygon: Point[]): boolean {
  let result = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      result = !result
  }
  return result
}

describe('neutral-axis path geometry', () => {
  it('uses exact signed circular arcs with continuous tangent and true arc length', () => {
    const segments: Segment[] = [
      { id: 'a', type: 'straight', length: 20 },
      { id: 'b', type: 'arc', radius: 40, angle: 90 },
      { id: 'c', type: 'straight', length: 30 },
    ]
    expect(segmentLength(segments[1])).toBeCloseTo(20 * Math.PI, 10)
    expect(pathLength(segments)).toBeCloseTo(50 + 20 * Math.PI, 10)
    const end = samplePath(segments, Infinity)
    expect(end.x).toBeCloseTo(60, 10)
    expect(end.y).toBeCloseTo(70, 10)
    expect(end.angle).toBeCloseTo(Math.PI / 2, 10)
    const arcEnd = samplePath(segments, 20 + 20 * Math.PI)
    expect(arcEnd.x).toBeCloseTo(60, 10)
    expect(arcEnd.y).toBeCloseTo(40, 10)
    const reverse = samplePath([{ id: 'a', type: 'arc', radius: 40, angle: -90 }], Infinity)
    expect(reverse.x).toBeCloseTo(40, 10)
    expect(reverse.y).toBeCloseTo(-40, 10)
    expect(reverse.angle).toBeCloseTo(-Math.PI / 2, 10)
  })
  it('clamps samples to the ends and produces no cuts in straight sections', () => {
    expect(samplePath(defaultDesign.segments, -100).s).toBe(0)
    const plan = createCutPlan(defaultDesign)
    expect(plan.cuts.length).toBeGreaterThan(100)
    expect(plan.cuts.every((cut) => cut.x > 75 && cut.x < plan.length - 75)).toBe(true)
    expect(
      createCutPlan(design({ segments: [{ id: 'a', type: 'straight', length: 100 }] })).cuts,
    ).toHaveLength(0)
  })
})

describe('outlines and staggered hinges', () => {
  it('keeps squares and circles square when path length changes', () => {
    for (const outline of ['square', 'circle'] as const) {
      const input = design({ outline, width: 90 })
      expect(getPanelWidth(input)).toBe(pathLength(input.segments))
      const polygon = getOutline(input)
      expect(Math.max(...polygon.map((point) => point.y))).toBeCloseTo(
        pathLength(input.segments),
        10,
      )
    }
  })
  it.each(['rectangle', 'triangle', 'ellipse', 'custom'] as const)(
    'clips %s cuts to the contour while retaining an actual edge margin',
    (outline) => {
      const input = design({
        outline,
        customOutline: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0.55, y: 1 },
          { x: 0.55, y: 0.45 },
          { x: 0.4, y: 0.45 },
          { x: 0.4, y: 1 },
          { x: 0, y: 1 },
        ],
      })
      const plan = createCutPlan(input)
      expect(plan.cuts.length).toBeGreaterThan(0)
      for (const cut of plan.cuts) {
        expect(cut.y2 - cut.y1).toBeLessThanOrEqual(input.cutLength + 1e-7)
        for (const y of [cut.y1, (cut.y1 + cut.y2) / 2, cut.y2]) {
          const point = { x: cut.x, y }
          expect(inside(point, plan.outline)).toBe(true)
          const clearance = Math.min(
            ...plan.outline.map((a, i) =>
              distanceToEdge(point, a, plan.outline[(i + 1) % plan.outline.length]),
            ),
          )
          expect(clearance).toBeGreaterThanOrEqual(input.edgeMargin - 1e-6)
        }
      }
    },
  )
  it('preserves bridges between cuts in the same column and alternates their heights', () => {
    const input = design()
    const cuts = createCutPlan(input).cuts
    const columns = [...new Set(cuts.map((cut) => cut.x))]
    const first = cuts.filter((cut) => cut.x === columns[0]).sort((a, b) => a.y1 - b.y1)
    const second = cuts.filter((cut) => cut.x === columns[1]).sort((a, b) => a.y1 - b.y1)
    for (let i = 1; i < first.length; i++)
      expect(first[i].y1 - first[i - 1].y2).toBeCloseTo(input.bridge, 9)
    expect(first[1].y1).not.toBe(second[1].y1)
    expect(columns[1] - columns[0]).toBe(input.spacing)
  })
  it('rejects crossed, zero-area and duplicate-vertex contours', () => {
    expect(
      isSimplePolygon([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ]),
    ).toBe(false)
    expect(
      isSimplePolygon([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ]),
    ).toBe(false)
    expect(
      isSimplePolygon([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ]),
    ).toBe(false)
    const input = design({
      outline: 'custom',
      customOutline: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ],
    })
    expect(createCutPlan(input).cuts).toHaveLength(0)
    expect(() => exportSVG(input)).toThrow('Fix the outline')
  })
  it('flags collision and impossible narrow ligament settings', () => {
    expect(
      createCutPlan(
        design({
          segments: [
            { id: 'a', type: 'arc', radius: 40, angle: 360 },
            { id: 'b', type: 'straight', length: 50 },
          ],
        }),
      ).warnings.some((warning) => warning.includes('crosses itself')),
    ).toBe(true)
    expect(
      createCutPlan(design({ kerf: 1, spacing: 0.5 })).warnings.some((warning) =>
        warning.includes('kerf'),
      ),
    ).toBe(true)
  })
})

describe('manufacturing export', () => {
  it('exports exact millimetre bounds and every hinge toolpath without scale transforms', () => {
    const input = design({ name: 'A <test> & panel' })
    const plan = createCutPlan(input)
    const svg = exportSVG(input)
    expect(svg).toContain('width="307.079633mm"')
    expect(svg).toContain('height="140mm"')
    expect(svg).toContain('viewBox="0 0 307.079633 140"')
    expect(svg.match(/<path /g)).toHaveLength(plan.cuts.length + 1)
    expect(svg).toContain('A &lt;test&gt; &amp; panel')
    expect(svg).toContain('no kerf compensation')
    const dxf = exportDXF(input)
    expect(dxf).toContain('$INSUNITS\n70\n4')
    expect(dxf.match(/0\nLINE\n/g)).toHaveLength(plan.cuts.length)
    expect(dxf).toContain('POLYLINE\n100\nAcDbEntity\n8\nOUTER_CONTOUR')
    expect(dxf).toContain('70\n1')
  })
  it('exports circular and elliptical contours as actual curves', () => {
    expect(exportSVG(design({ outline: 'circle' }))).toContain(' A153.539816 153.539816 ')
    expect(exportDXF(design({ outline: 'circle' }))).toContain('0\nCIRCLE\n')
    expect(exportDXF(design({ outline: 'ellipse' }))).toContain('0\nELLIPSE\n')
  })
  it('blocks pathological pattern sizes instead of silently exporting a blank panel', () => {
    const input = design({
      segments: [{ id: 'a', type: 'arc', radius: 1000, angle: 360 }],
      width: 2000,
      spacing: 0.5,
      cutLength: 1,
      bridge: 0.2,
    })
    expect(createCutPlan(input).warnings.some((warning) => warning.includes('50,000'))).toBe(true)
    expect(() => exportSVG(input)).toThrow('Reduce the number')
    expect(() => exportDXF(input)).toThrow('Reduce the number')
    expect(validateDesign(input)).toBeNull()
  })
})

describe('project import validation', () => {
  it('round-trips the persisted schema without retaining unknown properties', () => {
    expect(validateDesign(JSON.parse(JSON.stringify(defaultDesign)))).toEqual(defaultDesign)
    const input = { ...defaultDesign, unknown: 'discarded' }
    expect(validateDesign(input)).not.toHaveProperty('unknown')
  })
  it.each([
    null,
    [],
    {},
    { ...defaultDesign, version: 2 },
    { ...defaultDesign, width: NaN },
    { ...defaultDesign, segments: [] },
    { ...defaultDesign, spacing: 0 },
    { ...defaultDesign, thickness: -3 },
    { ...defaultDesign, customOutline: [{ x: 1, y: Infinity }] },
    { ...defaultDesign, material: 'steel' },
    { ...defaultDesign, segments: [{ id: 'a', type: 'arc', radius: 40, angle: 0 }] },
  ])('rejects invalid projects: %j', (input) => {
    expect(validateDesign(input)).toBeNull()
  })
})
