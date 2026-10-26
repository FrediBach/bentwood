import { describe, expect, it } from 'vitest'
import { defaultDesign, exportBendPathSVG, exportSVG } from './geometry'
import type { Design, Segment } from './types'

const exportPath = (segments: Segment[], overrides: Partial<Design> = {}) =>
  exportBendPathSVG({ ...defaultDesign, ...overrides, segments })

describe('bend path SVG export', () => {
  it('exports the sweep as one exact, unfilled centreline in editor orientation', () => {
    const svg = exportBendPathSVG(defaultDesign)
    expect(svg).toContain('width="127mm" height="102mm" viewBox="0 0 127 102"')
    expect(svg).toContain('d="M 1 1 L 76 1 A50 50 0 0 1 76 101 L 1 101"')
    expect(svg.match(/<path /g)).toHaveLength(1)
    expect(svg).toContain('fill="none" stroke="#808080"')
    expect(svg).not.toMatch(/<text|<rect|<polyline|hinge-cuts|outer-contour/)
  })

  it('gives a straight path a nonzero canvas without scaling or closing it', () => {
    const svg = exportPath([{ id: 'line', type: 'straight', length: 123.456789 }])
    expect(svg).toContain('width="125.456789mm" height="2mm"')
    expect(svg).toContain('d="M 1 1 L 124.456789 1"')
  })

  it.each([90, -90])('retains the direction of a %s degree turn', (angle) => {
    const svg = exportPath([{ id: 'arc', type: 'arc', radius: 50, angle }])
    expect(svg).toContain('width="52mm" height="52mm"')
    expect(svg).toContain(
      angle > 0 ? 'd="M 1 1 A50 50 0 0 1 51 51"' : 'd="M 1 51 A50 50 0 0 0 51 1"',
    )
  })

  it.each([270, -270, 360, -360])('includes all extrema of a %s degree arc', (angle) => {
    const svg = exportPath([{ id: 'arc', type: 'arc', radius: 50, angle }])
    expect(svg).toContain('width="102mm" height="102mm"')
    expect(svg.match(/A50 50/g)).toHaveLength(2)
    // Returning to the start must not introduce a chord across the circle.
    expect(svg.match(/d="([^"]+)" fill=/)![1]).not.toMatch(/[LZ]/)
    if (angle === 360) expect(svg).toContain('d="M 51 1 A50 50 0 0 1 51 101 A50 50 0 0 1 51 1"')
  })

  it('exports independently of laser-cut validation and panel outline', () => {
    const design = { ...defaultDesign, kerf: 2, spacing: 0.5 }
    expect(() => exportSVG(design)).toThrow('connected material')
    expect(exportBendPathSVG(design)).toBe(exportBendPathSVG(defaultDesign))
  })

  it('escapes project names and records thickness without offsetting the path', () => {
    const svg = exportBendPathSVG({ ...defaultDesign, name: '<Base & "bend">', thickness: 6 })
    expect(svg).toContain('&lt;Base &amp; &quot;bend&quot;&gt;')
    expect(svg).toContain('Plywood thickness 6 mm')
    expect(svg).toContain('d="M 1 1 L 76 1 A50 50 0 0 1 76 101 L 1 101"')
  })

  it.each<Segment[]>([
    [],
    [{ id: 'line', type: 'straight', length: 0 }],
    [{ id: 'line', type: 'straight', length: Infinity }],
    [{ id: 'line', type: 'straight', length: 10001 }],
    [{ id: 'arc', type: 'arc', radius: 0, angle: 90 }],
    [{ id: 'arc', type: 'arc', radius: 50, angle: NaN }],
    [{ id: 'arc', type: 'arc', radius: 50, angle: 361 }],
  ])('rejects invalid path geometry: %j', (...segments) => {
    expect(() => exportPath(segments)).toThrow('valid bend path')
  })
})
