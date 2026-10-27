import { describe, expect, it } from 'vitest'
import { pathLength, samplePath, segmentLength } from './geometry'
import { createPreviewGeometry, createPreviewMapper } from './preview-geometry'
import type { CutPlan, Segment } from './types'
import { woodTextureSize } from './wood-texture'

const plan: CutPlan = {
  length: 12,
  width: 8,
  outline: [
    { x: 0, y: 0 },
    { x: 12, y: 0 },
    { x: 12, y: 8 },
    { x: 0, y: 8 },
  ],
  cuts: [
    { x: 3, y1: 0, y2: 3 },
    { x: 9, y1: 5, y2: 8 },
  ],
  cutouts: [
    [
      { x: 5, y: 3 },
      { x: 7, y: 3 },
      { x: 7, y: 5 },
      { x: 5, y: 5 },
    ],
  ],
  cutLength: 46,
  warnings: [],
}

describe('worker preview geometry', () => {
  it('retains the complete surface, open boundary cuts, winding, and grain coordinates', () => {
    const geometry = createPreviewGeometry(plan, 0.2, true)
    const vertices = geometry.faces.vertices
    const areas = new Map<number, number>()
    for (let i = 0; i < vertices.length; i += 9) {
      const [ax, ay, side, bx, by, , cx, cy] = vertices.slice(i, i + 9)
      const area = ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) / 2
      areas.set(side, (areas.get(side) ?? 0) + area)
      expect(Math.max(Math.abs(ax - bx), Math.abs(bx - cx), Math.abs(cx - ax))).toBeLessThanOrEqual(
        1,
      )
    }
    // A 12 x 8 sheet, two 0.2 x 3 edge slots with rounded interior tips,
    // and a 2 x 2 removed opening. The tip arcs retain the existing 0.01 mm tolerance.
    expect(Math.abs(areas.get(1)!)).toBeCloseTo(90.8 - Math.PI * 0.1 ** 2, 2)
    expect(areas.get(-1)).toBeCloseTo(-areas.get(1)!, 8)
    expect(geometry.cuts.vertices.length).toBeGreaterThan(0)
    expect(geometry.lines.length).toBe(0)
    for (const part of [geometry.faces, geometry.edges, geometry.cuts]) {
      expect(part.sampleIndices.length).toBe(part.vertices.length / 3)
      for (let i = 0; i < part.sampleIndices.length; i++) {
        expect(geometry.distances[part.sampleIndices[i]]).toBe(part.vertices[i * 3])
      }
    }
    for (let i = 0; i < vertices.length / 3; i++) {
      expect(geometry.faces.uvs[i * 2]).toBeCloseTo(vertices[i * 3] / woodTextureSize.length, 6)
      expect(geometry.faces.uvs[i * 2 + 1]).toBeCloseTo(
        vertices[i * 3 + 1] / woodTextureSize.width,
        6,
      )
    }
  })

  it('hides both kerfs and removed openings when cuts are hidden', () => {
    const geometry = createPreviewGeometry(plan, 0.2, false)
    let frontArea = 0
    const vertices = geometry.faces.vertices
    for (let i = 0; i < vertices.length; i += 9) {
      if (vertices[i + 2] !== 1) continue
      const [ax, ay, , bx, by, , cx, cy] = vertices.slice(i, i + 9)
      frontArea += Math.abs(((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) / 2)
    }
    expect(frontArea).toBeCloseTo(96, 8)
    expect(geometry.cuts.vertices.length).toBe(0)
    expect(geometry.lines.length).toBe(0)
  })

  it('keeps every dense cut and each closed contour edge in the line fallback', () => {
    const cuts = Array.from({ length: 2500 }, (_, i) => ({ x: i / 250, y1: 0, y2: 8 }))
    const geometry = createPreviewGeometry(
      {
        ...plan,
        cuts: [...cuts, { x: 5, y1: 3, y2: 5, points: plan.cutouts![0], closed: true }],
      },
      0.2,
      true,
    )
    expect(geometry.detailedCuts).toBe(false)
    expect(geometry.lines.length).toBe((2500 + 4) * 2 * 2 * 3)
    for (let i = 0; i < geometry.lineSampleIndices.length; i++) {
      expect(geometry.distances[geometry.lineSampleIndices[i]]).toBe(geometry.lines[i * 3])
    }
    expect(geometry.cuts.vertices.length).toBeGreaterThan(0)
  })
})

describe('preview deformation', () => {
  const segments: Segment[] = [
    { id: 'straight', type: 'straight', length: 20 },
    { id: 'left', type: 'arc', radius: 30, angle: 110 },
    { id: 'right', type: 'arc', radius: 18, angle: -240 },
    { id: 'end', type: 'straight', length: 12 },
  ]

  it.each([0, 0.00001, 0.2, 0.5, 1])(
    'preserves neutral-axis mapping, thickness, and orientation at bend %s',
    (bend) => {
      const length = pathLength(segments)
      const vertices = new Float64Array(
        Array.from({ length: 101 }, (_, i) => [
          (i / 100) * length,
          (i % 3) * 7,
          [-1.01, -1, 1, 1.01][i % 4],
        ]).flat(),
      )
      const original = vertices.slice()
      const positions = new Float32Array(vertices.length)
      const thickness = 3.4
      const distances = vertices.filter((_, i) => i % 3 === 0)
      const indices = Uint32Array.from(distances, (_, i) => i)
      createPreviewMapper(segments, bend, thickness, distances)(vertices, positions, indices)
      const bent = segments.map((segment): Segment => {
        if (segment.type === 'straight') return segment
        return bend < 0.0001
          ? { id: segment.id, type: 'straight', length: segmentLength(segment) }
          : { ...segment, angle: segment.angle * bend, radius: segment.radius / bend }
      })
      expect(pathLength(bent)).toBeCloseTo(length, 10)
      for (let i = 0; i < vertices.length; i += 3) {
        const sample = samplePath(bent, vertices[i])
        const offset = (vertices[i + 2] * thickness) / 2
        expect(positions[i]).toBeCloseTo(sample.x - Math.sin(sample.angle) * offset, 4)
        expect(positions[i + 1]).toBe(vertices[i + 1])
        expect(positions[i + 2]).toBeCloseTo(sample.y + Math.cos(sample.angle) * offset, 4)
      }
      expect(vertices).toEqual(original)
    },
  )
})
