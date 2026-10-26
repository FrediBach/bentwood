import { describe, expect, it } from 'vitest'
import { Path } from 'three'
import { importSVGOutline, MAX_SVG_BYTES, outlineFromSVGPath } from './svg-outline'
import { isSimplePolygon } from './geometry'

function rectangle() {
  const path = new Path()
  path.moveTo(10, 20)
  path.lineTo(110, 20)
  path.lineTo(110, 70)
  path.lineTo(10, 70)
  path.closePath()
  return path
}

describe('SVG outline conversion', () => {
  it('preserves proportions, strips canvas offsets, and converts SVG Y-down to model Y-up', () => {
    const result = outlineFromSVGPath(rectangle(), 300)
    expect(result.width).toBe(150)
    expect(result.points).toEqual([
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 0 },
      { x: 0, y: 0 },
    ])
  })

  it('leaves original curves untouched and removes redundant drafting vertices', () => {
    const path = rectangle()
    const original = path.toJSON()
    outlineFromSVGPath(path, 300)
    expect(path.toJSON()).toEqual(original)
    const dense = new Path()
    dense.moveTo(0, 0)
    for (let x = 1; x <= 200; x++) dense.lineTo(x, 0)
    dense.lineTo(200, 50)
    dense.lineTo(0, 50)
    dense.closePath()
    expect(outlineFromSVGPath(dense, 300).points).toHaveLength(4)
  })

  it('fits a circle to the existing path length within the editable point limit', () => {
    const path = new Path()
    path.absarc(15, 35, 40, 0, Math.PI * 2)
    const result = outlineFromSVGPath(path, 307)
    expect(result.width).toBeCloseTo(307, 8)
    expect(result.points.length).toBeLessThanOrEqual(128)
    expect(isSimplePolygon(result.points)).toBe(true)
    for (let i = 0; i < result.points.length; i++) {
      const a = result.points[i]
      const b = result.points[(i + 1) % result.points.length]
      const x = (a.x + b.x) / 2 - 0.5
      const y = (a.y + b.y) / 2 - 0.5
      expect((0.5 - Math.hypot(x, y)) * 307).toBeLessThan(0.1)
    }
  })

  it.each([false, true])(
    'includes partial ellipse extrema regardless of arc direction, clockwise=%s',
    (clockwise) => {
      const path = new Path()
      path.absellipse(0, 0, 100, 50, 0, Math.PI, clockwise)
      path.closePath()
      const result = outlineFromSVGPath(path, 307)
      expect(result.width).toBeCloseTo(307 / 4, 8)
      expect(isSimplePolygon(result.points)).toBe(true)
    },
  )

  it('keeps rotated ellipse bounding dimensions exact', () => {
    const path = new Path()
    const rotation = 0.4
    path.absellipse(15, 30, 100, 50, 0, 2 * Math.PI, false, rotation)
    const result = outlineFromSVGPath(path, 307)
    const xRadius = Math.hypot(100 * Math.cos(rotation), 50 * Math.sin(rotation))
    const yRadius = Math.hypot(100 * Math.sin(rotation), 50 * Math.cos(rotation))
    expect(result.width).toBeCloseTo((307 * yRadius) / xRadius, 8)
  })

  it('samples quadratic and cubic curves while preserving their sharp endpoints', () => {
    const path = new Path()
    path.moveTo(0, 100)
    path.lineTo(0, 50)
    path.quadraticCurveTo(20, 0, 50, 50)
    path.bezierCurveTo(65, 90, 85, 10, 100, 50)
    path.lineTo(100, 100)
    path.closePath()
    const result = outlineFromSVGPath(path, 300)
    expect(result.points.length).toBeGreaterThan(10)
    expect(result.points).toContainEqual({ x: 0, y: 0 })
    expect(result.points).toContainEqual({ x: 1, y: 0 })
    expect(isSimplePolygon(result.points)).toBe(true)
  })

  it('rejects crossed outlines and lines without a usable area', () => {
    const crossed = new Path()
    crossed.moveTo(0, 0)
    crossed.lineTo(100, 100)
    crossed.lineTo(0, 100)
    crossed.lineTo(100, 0)
    crossed.closePath()
    expect(() => outlineFromSVGPath(crossed, 300)).toThrow('crosses itself')
    const line = new Path()
    line.moveTo(0, 0)
    line.lineTo(100, 0)
    line.closePath()
    expect(() => outlineFromSVGPath(line, 300)).toThrow('nonzero width and height')
  })

  it('rejects too many deliberate corners instead of quietly changing the shape', () => {
    const path = new Path()
    path.moveTo(0, 0)
    for (let i = 1; i <= 140; i++) path.lineTo(i, i % 2 ? 5 : 0)
    path.lineTo(140, 100)
    path.lineTo(0, 100)
    path.closePath()
    expect(() => outlineFromSVGPath(path, 300)).toThrow('128 editable points')
  })

  it('rejects unrepresentable width and invalid bend lengths', () => {
    expect(() => outlineFromSVGPath(rectangle(), 5)).toThrow('outside 5–2000 mm')
    expect(() => outlineFromSVGPath(rectangle(), 5000)).toThrow('outside 5–2000 mm')
    for (const length of [0, -1, NaN, Infinity, 10001]) {
      expect(() => outlineFromSVGPath(rectangle(), length)).toThrow('valid bend-path length')
    }
  })

  it('rejects oversized files and document entities before XML parsing', async () => {
    await expect(importSVGOutline(' '.repeat(MAX_SVG_BYTES + 1), 300)).rejects.toThrow(
      'smaller than 1 MB',
    )
    await expect(importSVGOutline('<!DOCTYPE svg><svg/>', 300)).rejects.toThrow('plain SVG')
    await expect(
      importSVGOutline('<!ENTITY source SYSTEM "https://example.test/">', 300),
    ).rejects.toThrow('plain SVG')
  })
})
