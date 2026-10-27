import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { defaultDesign, pathLength, presets, samplePath } from '../src/lib/geometry'
import type { Segment } from '../src/lib/types'

test('downloads a bend path from the export dialog on desktop and mobile', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Sheet name', { exact: true }).fill('Router base')
  await page.getByLabel('Unfold').fill('0')
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport)
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    await page
      .getByRole('button', { name: 'Download bend path SVG', exact: true })
      .scrollIntoViewIfNeeded()
    await page.screenshot({ path: `test-results/bend-path-export-${viewport.width}.png` })
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download bend path SVG', exact: true }).click()
    const file = await pending
    expect(file.suggestedFilename()).toBe('router-base-bend-path.svg')
    const svg = await readFile((await file.path())!, 'utf8')
    expect(svg).toContain('d="M 1 1 L 76 1 A50 50 0 0 1 76 101 L 1 101"')
    expect(svg).toContain('width="127mm" height="102mm"')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Dismiss notification' }).click()
  }
})

const paths: { name: string; segments: Segment[] }[] = [
  ...presets,
  ...[270, -270, 360, -360].map((angle) => ({
    name: `Turn ${angle}`,
    segments: [{ id: 'arc', type: 'arc' as const, radius: 50, angle }],
  })),
  {
    name: 'Repeated turns and negative coordinates',
    segments: [
      { id: 'a', type: 'arc', radius: 20, angle: -135 },
      { id: 'b', type: 'straight', length: 40 },
      { id: 'c', type: 'arc', radius: 35, angle: 300 },
      { id: 'd', type: 'arc', radius: 10, angle: 360 },
      { id: 'e', type: 'straight', length: 20 },
    ],
  },
]

for (const { name, segments } of paths) {
  test(`SVG geometry matches the model: ${name}`, async ({ page }) => {
    await page.addInitScript(
      (design) => {
        localStorage.setItem('bentwood.design.v1', JSON.stringify(design))
      },
      { ...defaultDesign, segments },
    )
    await page.goto('/')
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download bend path SVG', exact: true }).click()
    const file = await pending
    const svg = await readFile((await file.path())!, 'utf8')
    const actual = await page.evaluate((source) => {
      const doc = new DOMParser().parseFromString(source, 'image/svg+xml')
      if (doc.querySelector('parsererror')) throw new Error('Invalid SVG')
      const root = document.importNode(doc.documentElement, true) as unknown as SVGSVGElement
      document.body.append(root)
      const path = root.querySelector('path')!
      const length = path.getTotalLength()
      const points = Array.from({ length: 101 }, (_, i) => {
        const point = path.getPointAtLength((length * i) / 100)
        return { x: point.x, y: point.y }
      })
      const box = path.getBBox()
      const bounds = { x: box.x, y: box.y, width: box.width, height: box.height }
      const view = root.viewBox.baseVal
      const size = { width: view.width, height: view.height }
      root.remove()
      return { length, points, bounds, size }
    }, svg)
    const length = pathLength(segments)
    // Chromium approximates SVG arcs internally; allow 0.02% in its length API.
    // Exact radii and endpoints are also covered by the unit tests.
    expect(Math.abs(actual.length - length) / length).toBeLessThan(0.0002)
    const origin = actual.points[0]
    actual.points.forEach((point, i) => {
      const expected = samplePath(segments, (length * i) / 100)
      expect(
        Math.hypot(point.x - origin.x - expected.x, point.y - origin.y - expected.y),
      ).toBeLessThan(0.02)
    })
    expect(actual.bounds.x).toBeCloseTo(1, 3)
    expect(actual.bounds.y).toBeCloseTo(1, 3)
    expect(actual.bounds.width + 2).toBeCloseTo(actual.size.width, 3)
    expect(actual.bounds.height + 2).toBeCloseTo(actual.size.height, 3)
  })
}
