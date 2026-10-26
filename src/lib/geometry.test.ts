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
import { cutPathData, cutPathLength, getCutPoints } from './cut-path'
import { createPanelSurface } from './panel-surface'

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
  it.each(['rectangle', 'triangle', 'custom'] as const)(
    'opens %s cuts at every outline boundary and retains interior bridges',
    (outline) => {
      const input = design({
        outline,
        customOutline: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 0.25 },
          { x: 0.35, y: 0.25 },
          { x: 0.35, y: 0.75 },
          { x: 1, y: 0.75 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
      })
      const plan = createCutPlan(input)
      expect(plan.cuts.length).toBeGreaterThan(0)
      for (const cut of plan.cuts) {
        expect(cut.y2 - cut.y1).toBeLessThanOrEqual(input.cutLength + input.bridge + 1e-7)
        expect(inside({ x: cut.x, y: (cut.y1 + cut.y2) / 2 }, plan.outline)).toBe(true)
      }
      for (const x of new Set(plan.cuts.map((cut) => cut.x))) {
        const crossings = plan.outline
          .flatMap((a, i) => {
            const b = plan.outline[(i + 1) % plan.outline.length]
            return (a.x <= x && b.x > x) || (b.x <= x && a.x > x)
              ? [a.y + ((x - a.x) * (b.y - a.y)) / (b.x - a.x)]
              : []
          })
          .sort((a, b) => a - b)
        for (let i = 0; i + 1 < crossings.length; i += 2) {
          const lower = crossings[i],
            upper = crossings[i + 1]
          const cuts = plan.cuts.filter(
            (cut) => cut.x === x && cut.y1 >= lower - 1e-7 && cut.y2 <= upper + 1e-7,
          )
          expect(cuts.length).toBeGreaterThanOrEqual(2)
          expect(cuts[0].y1).toBeCloseTo(lower, 10)
          expect(cuts.at(-1)!.y2).toBeCloseTo(upper, 10)
          for (const cut of [cuts[0], cuts.at(-1)!]) {
            const point = { x, y: cut === cuts[0] ? cut.y1 : cut.y2 }
            const clearance = Math.min(
              ...plan.outline.map((a, edge) =>
                distanceToEdge(point, a, plan.outline[(edge + 1) % plan.outline.length]),
              ),
            )
            expect(clearance).toBeLessThan(1e-8)
          }
          for (let c = 1; c < cuts.length; c++)
            expect(cuts[c].y1 - cuts[c - 1].y2).toBeCloseTo(input.bridge, 10)
        }
      }
    },
  )
  it.each(['circle', 'ellipse'] as const)(
    'opens %s cuts on the exact exported curve',
    (outline) => {
      const input = design({ outline })
      const plan = createCutPlan(input)
      const radiusX = plan.length / 2,
        radiusY = plan.width / 2
      for (const x of new Set(plan.cuts.map((cut) => cut.x))) {
        const cuts = plan.cuts.filter((cut) => cut.x === x)
        expect(cuts.length).toBeGreaterThanOrEqual(2)
        const offset = radiusY * Math.sqrt(1 - ((x - radiusX) / radiusX) ** 2)
        expect(cuts[0].y1).toBeCloseTo(radiusY - offset, 10)
        expect(cuts.at(-1)!.y2).toBeCloseTo(radiusY + offset, 10)
        for (const cut of cuts) {
          for (const y of [cut.y1, cut.y2]) {
            expect(
              ((x - radiusX) / radiusX) ** 2 + ((y - radiusY) / radiusY) ** 2,
            ).toBeLessThanOrEqual(1 + 1e-10)
          }
        }
      }
    },
  )
  it.each([25, 26, 51, 52, 140])(
    'reaches edges even when a %s mm width ends inside a bridge phase',
    (width) => {
      const input = design({ width })
      const plan = createCutPlan(input)
      for (const x of new Set(plan.cuts.map((cut) => cut.x))) {
        const cuts = plan.cuts.filter((cut) => cut.x === x)
        expect(cuts[0].y1).toBe(0)
        expect(cuts.at(-1)!.y2).toBe(width)
        expect(cuts.length).toBeGreaterThanOrEqual(2)
        for (const cut of cuts)
          expect(cut.y2 - cut.y1).toBeLessThanOrEqual(input.cutLength + input.bridge + 1e-7)
      }
    },
  )
  it('opens an inset polygon where both boundaries cross bridge phases', () => {
    const input = design({
      outline: 'custom',
      customOutline: [
        { x: 0, y: 25 / 140 },
        { x: 1, y: 25 / 140 },
        { x: 1, y: 51 / 140 },
        { x: 0, y: 51 / 140 },
      ],
    })
    const plan = createCutPlan(input)
    for (const x of new Set(plan.cuts.map((cut) => cut.x))) {
      const cuts = plan.cuts.filter((cut) => cut.x === x)
      expect(cuts[0].y1).toBeCloseTo(25, 10)
      expect(cuts.at(-1)!.y2).toBeCloseTo(51, 10)
      expect(cuts.length).toBeGreaterThanOrEqual(2)
    }
  })
  it('retains staggered bridges in spans shorter than the nominal cut length', () => {
    const input = design({ width: 8 })
    const plan = createCutPlan(input)
    const columns = [...new Set(plan.cuts.map((cut) => cut.x))]
    const bridgeStarts: number[] = []
    for (const x of columns) {
      const cuts = plan.cuts.filter((cut) => cut.x === x)
      expect(cuts).toHaveLength(2)
      expect(cuts[0].y1).toBe(0)
      expect(cuts[1].y2).toBe(8)
      expect(cuts[1].y1 - cuts[0].y2).toBeCloseTo(input.bridge, 10)
      bridgeStarts.push(cuts[0].y2)
    }
    expect(bridgeStarts[1] - bridgeStarts[0] - input.bridge).toBeGreaterThanOrEqual(0.2 - 1e-8)
  })
  it('leaves too-narrow sections intact instead of cutting them loose', () => {
    const plan = createCutPlan(design({ width: 4, bridge: 2 }))
    expect(plan.cuts).toHaveLength(0)
    expect(plan.warnings.some((warning) => warning.includes('narrow outline sections'))).toBe(true)
  })
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
  it('keeps the minimum usable narrow pattern staggered without overlapping bridge bands', () => {
    const input = design({ width: 5, bridge: 2 })
    const cuts = createCutPlan(input).cuts
    const columns = [...new Set(cuts.map((cut) => cut.x))]
    const first = cuts.filter((cut) => cut.x === columns[0])
    const second = cuts.filter((cut) => cut.x === columns[1])
    expect(first).toHaveLength(2)
    expect(second).toHaveLength(2)
    expect(second[0].y2 - first[1].y1).toBeGreaterThanOrEqual(0.2 - 1e-8)
  })
  it('does not round tiny edge segments into zero-length SVG or DXF cuts', () => {
    const input = design({
      outline: 'custom',
      customOutline: [
        { x: 0, y: (24 - 0.0000002) / 140 },
        { x: 1, y: (24 - 0.0000002) / 140 },
        { x: 1, y: (130 + 0.0000002) / 140 },
        { x: 0, y: (130 + 0.0000002) / 140 },
      ],
    })
    const plan = createCutPlan(input)
    for (const cut of plan.cuts)
      expect(Number(cut.y2.toFixed(6))).toBeGreaterThan(Number(cut.y1.toFixed(6)))
    const svg = exportSVG(input)
    for (const match of svg.matchAll(/d="M[\d.]+ ([\d.]+) V([\d.]+)"/g)) {
      expect(Number(match[2])).toBeGreaterThan(Number(match[1]))
    }
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
    expect(svg).toContain('d="M76.5 0 V24"')
    expect(svg).toContain('V140"')
    const dxf = exportDXF(input)
    expect(dxf).toContain('$INSUNITS\n70\n4')
    expect(dxf.match(/0\nLINE\n/g)).toHaveLength(plan.cuts.length)
    expect(dxf).toContain('POLYLINE\n100\nAcDbEntity\n8\nOUTER_CONTOUR')
    expect(dxf).toContain('70\n1')
    expect(dxf).toContain('10\n76.5\n20\n140\n30\n0\n11\n76.5\n21\n116')
    expect(dxf).toContain('21\n0\n31\n0')
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
  it('migrates old saved projects without retaining the perimeter rail', () => {
    const legacy = { ...defaultDesign, version: 1, edgeMargin: 4, name: 'Saved study' }
    const migrated = validateDesign(legacy)
    expect(migrated).toEqual({ ...defaultDesign, name: 'Saved study' })
    expect(migrated).not.toHaveProperty('edgeMargin')
    expect(migrated!.version).toBe(4)
    const cuts = createCutPlan(migrated!).cuts
    expect(cuts[0].y1).toBe(0)
    expect(cuts.some((cut) => cut.y2 === migrated!.width)).toBe(true)
    expect(validateDesign({ ...legacy, edgeMargin: NaN })).toBeNull()
    const { edgeMargin: _unused, ...withoutMargin } = legacy
    expect(validateDesign(withoutMargin)?.version).toBe(4)
  })
  it.each([
    null,
    [],
    {},
    { ...defaultDesign, version: 5 },
    { ...defaultDesign, pattern: 'spiral' },
    { ...defaultDesign, pattern: undefined },
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

describe('hinge pattern variants', () => {
  it('migrates version 2 to Classic and round-trips each new pattern', () => {
    const { pattern: _pattern, ...legacy } = defaultDesign
    expect(validateDesign({ ...legacy, version: 2 })).toEqual(defaultDesign)
    for (const pattern of ['classic', 'graded', 'wave', 'zigzag'] as const) {
      const input = design({ pattern })
      expect(validateDesign(JSON.parse(JSON.stringify(input)))).toEqual(input)
    }
  })

  it('grades spacing by radius with a 2x cap, independent of bend direction', () => {
    const input = design({
      pattern: 'graded',
      segments: [
        { id: 'a', type: 'arc', radius: 30, angle: 90 },
        { id: 'b', type: 'arc', radius: 45, angle: -90 },
        { id: 'c', type: 'arc', radius: 120, angle: 90 },
      ],
    })
    const columns = [...new Set(createCutPlan(input).cuts.map((c) => c.x))]
    let start = 0
    input.segments.forEach((segment, index) => {
      const end = start + segmentLength(segment)
      const local = columns.filter((x) => x >= start && x < end)
      expect(local[1] - local[0]).toBeCloseTo([3, 4.5, 6][index], 10)
      start = end
    })
    expect(createCutPlan(design({ pattern: 'graded' })).cuts).toEqual(createCutPlan(design()).cuts)
  })

  it.each(['wave', 'zigzag'] as const)(
    'keeps %s cuts in bend regions, connected, and distinct from Classic',
    (pattern) => {
      const input = design({ pattern })
      const plan = createCutPlan(input)
      expect(plan.warnings).toEqual([])
      expect(plan.cuts.length).toBe(createCutPlan(design()).cuts.length)
      expect(
        plan.cuts.some((cut) => getCutPoints(cut).some((p) => Math.abs(p.x - cut.x) > 0.5)),
      ).toBe(true)
      for (const cut of plan.cuts) {
        expect(cutPathLength(cut)).toBeGreaterThanOrEqual(cut.y2 - cut.y1 - 1e-8)
        for (const point of getCutPoints(cut)) expect(point.x).toBeGreaterThanOrEqual(75)
        for (const point of getCutPoints(cut)) expect(point.x).toBeLessThanOrEqual(plan.length - 75)
      }
      expect(createPanelSurface(plan.outline, plan.cuts, input.kerf).polygons).toHaveLength(1)
      const svg = exportSVG(input)
      for (const cut of plan.cuts) expect(svg).toContain(`d="${cutPathData(cut)}"`)
      const dxf = exportDXF(input)
      expect(dxf.match(/0\nLINE\n/g)).toHaveLength(
        plan.cuts.reduce((sum, cut) => sum + getCutPoints(cut).length - 1, 0),
      )
    },
  )

  it.each(['wave', 'zigzag'] as const)(
    'clips %s to exact ellipses without closing edge mouths',
    (pattern) => {
      const input = design({ pattern, outline: 'ellipse' })
      const plan = createCutPlan(input)
      const equation = (p: Point) =>
        ((p.x - plan.length / 2) / (plan.length / 2)) ** 2 +
        ((p.y - plan.width / 2) / (plan.width / 2)) ** 2
      for (const x of new Set(plan.cuts.map((c) => c.x))) {
        const column = plan.cuts.filter((c) => c.x === x)
        expect(equation(getCutPoints(column[0])[0])).toBeCloseTo(1, 9)
        expect(equation(getCutPoints(column.at(-1)!).at(-1)!)).toBeCloseTo(1, 9)
        for (const cut of column)
          for (const point of getCutPoints(cut))
            expect(equation(point)).toBeLessThanOrEqual(1 + 1e-9)
      }
      expect(createPanelSurface(plan.outline, plan.cuts, input.kerf).polygons).toHaveLength(1)
    },
  )

  it.each(['wave', 'zigzag'] as const)(
    'retains %s bridges within concave and narrow outlines',
    (pattern) => {
      const input = design({
        pattern,
        outline: 'custom',
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
      for (const cut of plan.cuts) {
        const points = getCutPoints(cut)
        for (let i = 1; i < points.length; i++) {
          const p = {
            x: (points[i - 1].x + points[i].x) / 2,
            y: (points[i - 1].y + points[i].y) / 2,
          }
          expect(inside(p, plan.outline)).toBe(true)
        }
      }
      expect(createPanelSurface(plan.outline, plan.cuts, input.kerf).polygons).toHaveLength(1)
      expect(createCutPlan(design({ pattern, width: 4, bridge: 2 })).cuts).toHaveLength(0)
      const narrow = createCutPlan(design({ pattern, width: 8, bridge: 2 }))
      expect(createPanelSurface(narrow.outline, narrow.cuts, input.kerf).polygons).toHaveLength(1)
    },
  )

  it('blocks paths whose kerf consumes the minimum ligament and bounds wave complexity', () => {
    expect(() => exportSVG(design({ pattern: 'wave', kerf: 0.8, spacing: 1 }))).toThrow(
      'connected material',
    )
    const input = design({
      pattern: 'wave',
      width: 2000,
      cutLength: 200,
      kerf: 0.01,
      segments: [{ id: 'a', type: 'arc', radius: 1000, angle: 360 }],
    })
    expect(createCutPlan(input).warnings.some((w) => w.includes('250,000'))).toBe(true)
    expect(() => exportDXF(input)).toThrow('Reduce the number')
    expect(validateDesign(input)).toBeNull()
  })

  it.each(['wave', 'zigzag'] as const)(
    'keeps %s terminal columns away from the panel edge',
    (pattern) => {
      const input = design({ pattern, segments: [{ id: 'a', type: 'arc', radius: 30, angle: 90 }] })
      const plan = createCutPlan(input)
      expect(plan.warnings).toEqual([])
      for (const cut of plan.cuts)
        for (const p of getCutPoints(cut)) {
          expect(p.x).toBeGreaterThan(input.kerf / 2)
          expect(p.x).toBeLessThan(plan.length - input.kerf / 2)
        }
      expect(createPanelSurface(plan.outline, plan.cuts, input.kerf).polygons).toHaveLength(1)
    },
  )

  it.each(['classic', 'wave', 'zigzag'] as const)(
    'preserves %s clearance and staggering across adjacent arcs',
    (pattern) => {
      const angle = ((30.51 / 50) * 180) / Math.PI
      const input = design({
        pattern,
        spacing: 1,
        kerf: pattern === 'classic' ? 0.65 : 0.3,
        width: 60,
        segments: [
          { id: 'a', type: 'arc', radius: 50, angle },
          { id: 'b', type: 'arc', radius: 50, angle: -angle },
        ],
      })
      const plan = createCutPlan(input)
      expect(plan.warnings).toEqual([])
      const columns = [...new Set(plan.cuts.map((cut) => cut.x))]
      for (let i = 1; i < columns.length; i++)
        expect(columns[i] - columns[i - 1]).toBeGreaterThanOrEqual(input.spacing - 1e-8)
      expect(createPanelSurface(plan.outline, plan.cuts, input.kerf).polygons).toHaveLength(1)
    },
  )

  it('enforces the actual cut limit when a concave outline has many separate spans', () => {
    const outline: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]
    for (let tooth = 0; tooth < 30; tooth++) {
      outline.push(
        { x: 1, y: (2 * tooth + 1) / 60 },
        { x: 0.1, y: (2 * tooth + 1) / 60 },
        { x: 0.1, y: (2 * tooth + 2) / 60 },
      )
      if (tooth < 29) outline.push({ x: 1, y: (2 * tooth + 2) / 60 })
    }
    outline.push({ x: 0, y: 1 })
    const input = design({
      outline: 'custom',
      customOutline: outline,
      width: 2000,
      spacing: 0.5,
      bridge: 0.2,
      cutLength: 200,
      segments: [{ id: 'a', type: 'arc', radius: 1000, angle: 180 / Math.PI }],
    })
    const plan = createCutPlan(input)
    expect(plan.cuts).toHaveLength(0)
    expect(plan.warnings).toHaveLength(1)
    expect(plan.warnings[0]).toContain('50,000')
    expect(() => exportSVG(input)).toThrow('Reduce the number')
  })
})
