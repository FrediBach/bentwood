import { describe, expect, it } from 'vitest'
import { defaultDesign, exportSVG } from './geometry'
import { exportTestSwatchesSVG, getTestSwatchSheetSize } from './test-swatches'
import type { Design, Point } from './types'

function pathPoints(path: string): Point[] {
  const tokens = path.match(/[MLVZ]|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)!
  const result: Point[] = []
  let index = 0
  while (index < tokens.length) {
    const command = tokens[index++]
    if (command === 'M' || command === 'L') {
      result.push({ x: Number(tokens[index++]), y: Number(tokens[index++]) })
    } else if (command === 'V') {
      result.push({ x: result.at(-1)!.x, y: Number(tokens[index++]) })
    } else if (command === 'Z') {
      result.push({ ...result[0] })
    } else throw new Error(`Unexpected toolpath command: ${command}`)
  }
  return result
}

const samples = (svg: string) => [
  ...svg.matchAll(
    /<g id="swatch-(\d+)" data-spacing="([\d.]+)" data-bridge="([\d.]+)">([\s\S]*?)<\/g>/g,
  ),
]

describe('test swatch sheet', () => {
  it.each([
    'classic',
    'graded',
    'wave',
    'zigzag',
    'small-wave',
    'honeycomb',
    'meander',
    'meander-wide',
  ] as const)(
    'exports nine separate %s samples with uncut grip tabs and actual settings',
    (pattern) => {
      const meander = pattern === 'meander' || pattern === 'meander-wide'
      const design: Design = {
        ...defaultDesign,
        name: 'Study <one>',
        pattern,
        ...(meander && {
          spacing: 3.04,
          bridge: 1.62,
          cutLength: pattern === 'meander' ? 22.58 : 33.87,
        }),
      }
      const svg = exportTestSwatchesSVG(design)
      const size = getTestSwatchSheetSize(design)
      expect(svg).toContain(`width="${size.width}mm" height="${size.height}mm"`)
      expect(svg).toContain(`viewBox="0 0 ${size.width} ${size.height}"`)
      expect(svg).not.toContain('transform=')
      expect(svg).toContain('Study &lt;one&gt;')
      expect(svg).toContain('id="engraving-labels" fill="#000000" stroke="none"')
      expect(svg).toContain('no kerf compensation')
      expect(svg).toContain('not specify an achievable bend radius')

      const outlines = [
        ...svg.matchAll(
          /id="coupon-outline-(\d+)" d="M([\d.]+) ([\d.]+) h([\d.]+) v([\d.]+) h-[\d.]+ Z"/g,
        ),
      ]
      const coupons = samples(svg)
      expect(coupons).toHaveLength(9)
      expect(outlines).toHaveLength(9)
      const boxes = outlines.map((match) => ({
        x: Number(match[2]),
        y: Number(match[3]),
        width: Number(match[4]),
        height: Number(match[5]),
      }))
      for (const [i, box] of boxes.entries()) {
        expect(box.x).toBeGreaterThan(0)
        expect(box.y).toBeGreaterThan(0)
        expect(box.x + box.width).toBeLessThan(size.width)
        expect(box.y + box.height).toBeLessThan(size.height)
        for (const other of boxes.slice(i + 1)) {
          expect(
            box.x + box.width < other.x ||
              other.x + other.width < box.x ||
              box.y + box.height < other.y ||
              other.y + other.height < box.y,
          ).toBe(true)
        }

        const sample = coupons[i]
        const paths = [...sample[4].matchAll(/<path d="([^"]+)"\/>/g)].map((match) =>
          pathPoints(match[1]),
        )
        expect(paths.length).toBeGreaterThan(10)
        const points = paths.flat()
        for (const point of points) {
          expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true)
          expect(point.x).toBeGreaterThan(box.x + 24)
          expect(point.x).toBeLessThan(box.x + box.width - 24)
          expect(point.y).toBeGreaterThanOrEqual(box.y - 1e-6)
          expect(point.y).toBeLessThanOrEqual(box.y + box.height + 1e-6)
        }
        if (pattern === 'small-wave' || pattern === 'honeycomb') {
          expect(sample[4]).toMatch(/d="[^"]+ Z"/)
          expect(svg).toContain(pattern === 'small-wave' ? 'Small waves' : 'Honeycomb')
          if (pattern === 'honeycomb')
            expect(paths.some((path) => new Set(path.map((point) => point.x)).size > 4)).toBe(true)
        } else {
          expect(points.some((point) => Math.abs(point.y - box.y) < 1e-6)).toBe(true)
          expect(points.some((point) => Math.abs(point.y - box.y - box.height) < 1e-6)).toBe(true)
        }
        const label = svg.match(new RegExp(`<g id="label-${i + 1}">([\\s\\S]*?)<\\/g>`))![1]
        expect(label).toContain(`S ${sample[2]} mm`)
        expect(label).toContain(`${meander ? 'E' : 'B'} ${sample[3]} mm`)
        expect(label).toContain(`T ${design.thickness} mm`)
        expect(label).toContain(`K ${design.kerf} mm`)
        for (const text of label.matchAll(/<text x="([\d.]+)" y="([\d.]+)">/g)) {
          expect(Number(text[1])).toBeGreaterThan(box.x)
          expect(Number(text[1])).toBeLessThan(box.x + 24)
          expect(Number(text[2])).toBeGreaterThan(box.y)
          expect(Number(text[2])).toBeLessThan(box.y + box.height)
        }
        if (
          pattern === 'wave' ||
          pattern === 'zigzag' ||
          pattern === 'meander' ||
          pattern === 'meander-wide'
        )
          expect(paths.some((path) => new Set(path.map((point) => point.x)).size > 2)).toBe(true)
        if (pattern === 'meander' || pattern === 'meander-wide') {
          expect(svg).toContain(pattern === 'meander' ? 'Fine meander' : 'Wide meander')
          expect(paths.some((path) => path.length > 8)).toBe(true)
          expect(sample[4]).not.toMatch(/d="[^"]+ Z"/)
        }
      }
      for (const [i, coupon] of coupons.entries()) {
        expect(Number(coupon[2])).toBeCloseTo(design.spacing * [0.8, 1, 1.2][i % 3], 3)
        expect(Number(coupon[3])).toBeCloseTo(design.bridge * [0.8, 1, 1.2][Math.floor(i / 3)], 3)
      }
    },
  )

  it('uses more widely spaced cuts in the gentle half of graded swatches', () => {
    const svg = exportTestSwatchesSVG({ ...defaultDesign, pattern: 'graded' })
    const points = [...samples(svg)[4][4].matchAll(/<path d="([^"]+)"\/>/g)].flatMap((match) =>
      pathPoints(match[1]),
    )
    const columns = [...new Set(points.map((point) => point.x))].sort((a, b) => a - b)
    const distances = columns.slice(1).map((x, i) => x - columns[i])
    expect(distances.at(-1)).toBeCloseTo(2 * distances[0], 5)
  })

  it('bounds variation at supported settings and does not throw while measuring a sheet', () => {
    const design = { ...defaultDesign, spacing: 30, bridge: 30, cutLength: 200 }
    const { width, height } = getTestSwatchSheetSize(design)
    expect(width).toBeLessThan(1500)
    expect(height).toBeLessThan(1500)
    expect(width).toBeGreaterThan(0)
    const svg = exportTestSwatchesSVG(design)
    for (const sample of samples(svg)) {
      expect(Number(sample[2])).toBeLessThanOrEqual(30)
      expect(Number(sample[3])).toBeLessThanOrEqual(30)
    }
  })

  it('uses full-panel manufacturing checks for unsafe sample settings', () => {
    expect(() => exportTestSwatchesSVG({ ...defaultDesign, kerf: 1, spacing: 1 })).toThrow()
  })

  it.each(['meander', 'meander-wide'] as const)(
    'blocks a %s sheet when a variation consumes the material between slit ends',
    (pattern) => {
      const design: Design = { ...defaultDesign, pattern }
      expect(() => exportSVG(design)).not.toThrow()
      // The tighter-spacing, wider-separation corner is unsafe even though
      // the selected full-panel settings leave connecting material.
      expect(() => exportTestSwatchesSVG(design)).toThrow('connected material')
    },
  )
})
