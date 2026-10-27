import { describe, expect, it } from 'vitest'
import { createCutPlan, defaultDesign } from './geometry'
import { findSheetIntersections } from './sheet-intersections'
import type { CutPlan, Design, Sheet } from './types'

function sheet(
  id: string,
  placement: Partial<Sheet['placement']> = {},
  changes: Partial<Design> = {},
): Sheet & { plan: CutPlan } {
  const design: Design = {
    ...defaultDesign,
    name: id,
    outline: 'rectangle',
    segments: [{ id: 'line', type: 'straight', length: 100 }],
    width: 100,
    thickness: 3,
    ...changes,
  }
  return {
    id,
    design,
    placement: { x: 0, y: 0, z: 0, rotation: 0, ...placement },
    plan: createCutPlan(design),
  }
}
const pairs = (...sheets: ReturnType<typeof sheet>[]) =>
  findSheetIntersections(sheets).intersections

describe('sheet assembly intersection warnings', () => {
  it('detects coincident sheets and rotated crossings', () => {
    expect(pairs(sheet('a'), sheet('b'))).toEqual([{ firstId: 'a', secondId: 'b' }])
    expect(pairs(sheet('a'), sheet('b', { x: 50, z: 50, rotation: 90 }))).toHaveLength(1)
  })

  it('accounts for thickness, vertical separation, and separated placements', () => {
    expect(pairs(sheet('a'), sheet('b', { z: 2.9 }))).toHaveLength(1)
    expect(pairs(sheet('a'), sheet('b', { z: 3.1 }))).toHaveLength(0)
    expect(pairs(sheet('a'), sheet('b', { y: 101 }))).toHaveLength(0)
    expect(pairs(sheet('a'), sheet('b', { x: 101 }))).toHaveLength(0)
  })

  it('detects a thin smaller sheet contained entirely inside a thicker sheet', () => {
    expect(
      pairs(
        sheet('outer', {}, { thickness: 10 }),
        sheet(
          'inner',
          { x: 20, y: 20 },
          {
            thickness: 1,
            width: 40,
            segments: [{ id: 'small', type: 'straight', length: 40 }],
          },
        ),
      ),
    ).toHaveLength(1)
  })

  it('rejects overlap of only the bounding boxes of custom outlines', () => {
    const triangle: Partial<Design> = {
      outline: 'custom',
      customOutline: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ],
    }
    expect(pairs(sheet('a', {}, triangle), sheet('b', { x: 80, y: 80 }, triangle))).toHaveLength(0)
  })

  it('removes nominal cutout areas before testing sheet material', () => {
    const first = sheet('a')
    first.plan.cutouts = [
      [
        { x: 40, y: 20 },
        { x: 60, y: 20 },
        { x: 60, y: 80 },
        { x: 40, y: 80 },
      ],
    ]
    const second = sheet(
      'b',
      { x: 45, y: 40 },
      {
        width: 20,
        segments: [{ id: 'small', type: 'straight', length: 10 }],
      },
    )
    expect(pairs(first, second)).toHaveLength(0)
    expect(pairs(first, { ...second, placement: { ...second.placement, x: 55 } })).toHaveLength(1)
  })

  it('reports when dense cutouts require conservative solid-outline checks', () => {
    const first = sheet('a')
    first.plan.cutouts = Array.from({ length: 2501 }, () => [
      { x: 40, y: 20 },
      { x: 60, y: 20 },
      { x: 60, y: 80 },
      { x: 40, y: 80 },
    ])
    const result = findSheetIntersections([first, sheet('b')])
    expect(result.intersections).toHaveLength(1)
    expect(result.warnings).toEqual([
      'Intersection checks use solid outlines for dense cutout patterns; inspect openings manually.',
    ])
  })

  it('uses fully bent paths and reports each colliding pair once', () => {
    const curve = sheet(
      'arc',
      {},
      {
        segments: [{ id: 'arc', type: 'arc', radius: 40, angle: 180 }],
      },
    )
    const result = findSheetIntersections([
      curve,
      sheet('crossing', { x: -50, z: 40 }),
      sheet('away', { z: 200 }),
    ])
    expect(result.intersections).toEqual([{ firstId: 'arc', secondId: 'crossing' }])
    expect(result.warnings).toEqual([])
  })
})
