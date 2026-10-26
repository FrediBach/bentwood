import { describe, expect, it } from 'vitest'
import { woodMaterials } from './wood-materials'
import { createWoodGrainSampler, createWoodTexturePixels } from './wood-texture'

describe('seamless wood textures', () => {
  it.each(woodMaterials)('$label grain repeats continuously in both directions', ({ id }) => {
    const sample = createWoodGrainSampler(id)
    const coordinates = [0, 0.137, 0.361, 0.719, 0.999999]
    for (const u of coordinates) {
      for (const v of coordinates) {
        const shade = sample(u, v)
        for (const shift of [-3, -1, 1, 4]) {
          expect(sample(u + shift, v)).toBeCloseTo(shade, 10)
          expect(sample(u, v + shift)).toBeCloseTo(shade, 10)
          expect(sample(u + shift, v - shift)).toBeCloseTo(shade, 10)
        }
      }
    }
  })

  it.each(woodMaterials)('$label has no crease where grain tiles meet', ({ id }) => {
    const sample = createWoodGrainSampler(id)
    const step = 1e-8
    for (const position of [0.137, 0.361, 0.719]) {
      for (const along of [
        (coordinate: number) => sample(coordinate, position),
        (coordinate: number) => sample(position, coordinate),
      ]) {
        // Values alone can match at a seam while a sudden change of direction
        // still exposes it. Compare slopes on either side of an actual repeat.
        const incoming = (along(1) - along(1 - step)) / step
        const outgoing = (along(1 + step) - along(1)) / step
        expect(Math.abs(incoming - outgoing)).toBeLessThan(0.005)
      }
    }
  })

  it('gives every species its own repeatable grain', () => {
    const signatures = woodMaterials.map(({ id }) => {
      const sample = createWoodGrainSampler(id)
      const repeat = createWoodGrainSampler(id)
      const shades = Array.from({ length: 25 }, (_, index) =>
        sample((index % 5) / 5 + 0.047, Math.floor(index / 5) / 5 + 0.083),
      )
      expect(Math.max(...shades) - Math.min(...shades)).toBeGreaterThan(0.01)
      expect(shades[0]).toBe(repeat(0.047, 0.083))
      return shades
    })
    for (let first = 0; first < signatures.length; first++) {
      for (let second = first + 1; second < signatures.length; second++) {
        const difference = signatures[first].reduce(
          (sum, shade, index) => sum + Math.abs(shade - signatures[second][index]),
          0,
        )
        expect(difference / signatures[first].length).toBeGreaterThan(0.005)
      }
    }
  })

  it.each(woodMaterials)('$label pixels do not introduce a visible tile border', ({ id }) => {
    const size = 512
    const pixels = createWoodTexturePixels(id, size)
    expect(pixels.length).toBe(size * size * 4)
    const difference = (a: number, b: number) =>
      (Math.abs(pixels[a] - pixels[b]) +
        Math.abs(pixels[a + 1] - pixels[b + 1]) +
        Math.abs(pixels[a + 2] - pixels[b + 2])) /
      3
    for (const axis of ['horizontal', 'vertical'] as const) {
      const at = (along: number, across: number) =>
        (axis === 'horizontal' ? across * size + along : along * size + across) * 4
      let seam = 0
      let neighboring = 0
      for (let across = 0; across < size; across++) {
        seam += difference(at(size - 1, across), at(0, across))
        for (let offset = 0; offset < 4; offset++) {
          neighboring += difference(at(offset, across), at(offset + 1, across))
          neighboring += difference(at(size - 2 - offset, across), at(size - 1 - offset, across))
        }
      }
      // Repeating texels need a normal local color step, not identical edges.
      // Allow one level for 8-bit quantization and natural changes in the grain.
      expect(seam / size).toBeLessThan((neighboring / (size * 8)) * 2 + 1)
    }
  })
})
