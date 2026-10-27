import { describe, expect, it } from 'vitest'
import { createGeometryProcessor } from './geometry-processor'
import { createCutPlan, defaultDesign, exportBendPathSVG, exportDXF, exportSVG } from './geometry'
import { exportTestSwatchesSVG } from './test-swatches'
import type { PreparedGeometry } from './geometry-jobs'

describe('background geometry processing', () => {
  it('preserves exact cut geometry and caches appearance-independent topology', () => {
    const process = createGeometryProcessor()
    const prepare = (design = defaultDesign, showCuts = true) =>
      process({ kind: 'prepare', design, showCuts }) as PreparedGeometry
    const first = prepare()
    expect(first.plan).toEqual(createCutPlan(defaultDesign))
    const renamed = prepare({ ...defaultDesign, name: 'Renamed', material: 'walnut' })
    expect(renamed.plan).toBe(first.plan)
    expect(renamed.geometry).toBe(first.geometry)
    const thicker = prepare({ ...defaultDesign, thickness: 6 })
    expect(thicker.plan).not.toBe(first.plan)
    expect(thicker.plan).toEqual(createCutPlan({ ...defaultDesign, thickness: 6 }))
    expect(thicker.geometry).toBe(first.geometry)
    const hidden = prepare(defaultDesign, false)
    expect(hidden.geometry.cuts.vertices).toHaveLength(0)
    expect(prepare().geometry).toBe(first.geometry)
    expect(prepare({ ...defaultDesign, width: 150 }).geometry).not.toBe(first.geometry)
  })

  it('exports exact full-quality files independently of preview detail and freshness', () => {
    const process = createGeometryProcessor()
    process({ kind: 'prepare', design: defaultDesign, showCuts: false })
    const design = { ...defaultDesign, name: 'Latest settings', width: 173.123456 }
    for (const [format, expected] of [
      ['svg', exportSVG(design)],
      ['dxf', exportDXF(design)],
      ['bend-path', exportBendPathSVG(design)],
      ['swatches', exportTestSwatchesSVG(design)],
    ] as const) {
      expect(process({ kind: 'export', design, format })).toBe(expected)
    }
  })

  it('retains manufacturing rejection while allowing the independent bend path', () => {
    const process = createGeometryProcessor()
    const design = { ...defaultDesign, kerf: 0.8, bridge: 0.2 }
    expect(() => process({ kind: 'export', design, format: 'svg' })).toThrow()
    expect(process({ kind: 'export', design, format: 'bend-path' })).toBe(exportBendPathSVG(design))
  })
})
