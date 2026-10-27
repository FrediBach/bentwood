import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'
import { defaultDesign, pathLength } from '../src/lib/geometry'

const polygonSVG = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120">
    <polygon points="20,100 220,100 220,20 180,20 20,60"/>
  </svg>`
const polygonFile = {
  name: 'sloping-panel.svg',
  mimeType: 'image/svg+xml',
  buffer: Buffer.from(polygonSVG),
}
const normalizedPolygon = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0.8, y: 1 },
  { x: 0, y: 0.5 },
]

async function saveProject(page: Page) {
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save project file', exact: true }).click()
  return JSON.parse(await readFile((await (await pending).path())!, 'utf8')).sheets[0].design
}

async function dismissNotice(page: Page) {
  const dismiss = page.getByRole('button', { name: 'Dismiss notification', exact: true })
  if (await dismiss.count()) await dismiss.click()
  await expect(page.getByRole('status', { name: 'Notification' })).toHaveCount(0)
}

async function expectImportComplete(page: Page, success = true) {
  const status = page.getByRole('status', { name: 'Notification' })
  await expect(status).toBeVisible()
  if (success) await expect(status).toContainText('SVG outline imported.')
  else await expect(status).not.toContainText('SVG outline imported.')
  await expect(
    page.getByRole('button', { name: 'Import SVG outline', exact: true }).first(),
  ).toBeEnabled()
}

test('SVG outline import preserves proportions, orientation, undo and saved geometry', async ({
  page,
}) => {
  test.setTimeout(45000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.getByLabel('Import project file').setInputFiles({
    name: 'rounded-start.bentwood.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ ...defaultDesign, outline: 'custom', outlineCornerRadius: 9 }),
    ),
  })
  await page.getByRole('tab', { name: 'Panel outline', exact: true }).click()
  await dismissNotice(page)
  const chooserPending = page.waitForEvent('filechooser')
  await page
    .getByRole('complementary', { name: 'Shape designer' })
    .getByRole('button', { name: 'Import SVG outline', exact: true })
    .click()
  await (await chooserPending).setFiles(polygonFile)
  await expectImportComplete(page)
  await expect(page.getByRole('heading', { name: 'Make it your own.' })).toBeVisible()
  const radius = page.getByLabel('Corner radius in millimeters')
  await expect(radius).toHaveValue('0')
  const vertices = page.getByRole('button', { name: /Vertex \d+,/ })
  await expect(vertices).toHaveCount(5)
  await expect(page.getByLabel('Import SVG outline file')).toHaveValue('')
  const contour = page.locator('.outline-svg [data-outline-contour]')
  const importedContour = await contour.getAttribute('points')
  const visiblePoints = await contour.evaluate((element) =>
    Array.from((element as SVGPolygonElement).points, ({ x, y }) => ({ x, y })),
  )
  const bottom = Math.max(...visiblePoints.map((point) => point.y))
  expect(visiblePoints.filter((point) => Math.abs(point.y - bottom) < 1e-6)).toHaveLength(2)
  const left = visiblePoints.filter((point) => Math.abs(point.x) < 1e-6)
  expect(left).toHaveLength(2)
  expect(Math.min(...left.map((point) => point.y))).toBeCloseTo(bottom / 2, 5)

  const imported = await saveProject(page)
  expect(imported.outline).toBe('custom')
  expect(imported.customOutline).toEqual(expect.arrayContaining(normalizedPolygon))
  expect(imported.width).toBeCloseTo(pathLength(defaultDesign.segments) * 0.4, 5)
  expect(imported.segments).toEqual(defaultDesign.segments)
  expect(imported.outlineCornerRadius).toBe(0)
  await page.getByRole('button', { name: 'Undo (⌘ / Ctrl Z)', exact: true }).click()
  await expect(radius).toHaveValue('9')
  await expect(vertices).toHaveCount(4)
  await page.getByRole('button', { name: 'Redo (⌘ / Ctrl Shift Z)', exact: true }).click()
  await expect(radius).toHaveValue('0')
  await expect(contour).toHaveAttribute('points', importedContour!)

  await radius.fill('8')
  await radius.press('Enter')
  await expect(contour).not.toHaveAttribute('points', importedContour!)
  await dismissNotice(page)
  await page.getByLabel('Import SVG outline file').setInputFiles(polygonFile)
  await expectImportComplete(page)
  await expect(radius).toHaveValue('0')
  await expect(contour).toHaveAttribute('points', importedContour!)
  await page.reload()
  await expect(page.locator('.plywood-preview canvas')).toBeVisible()
  await expect(page.getByText('3D preview needs WebGL')).toHaveCount(0)
  await page.getByRole('button', { name: 'Flat outline', exact: true }).click()
  await expect(contour).toHaveAttribute('points', importedContour!)

  await page.getByRole('button', { name: 'Export', exact: true }).click()
  let exportedSVG = ''
  for (const format of ['SVG', 'DXF']) {
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: `Download ${format}`, exact: true }).click()
    const contents = await readFile((await (await pending).path())!, 'utf8')
    if (format === 'SVG') {
      exportedSVG = contents
      expect(contents).toContain('id="outer-contour"')
      expect(contents).toContain('scale(1 -1)')
    } else {
      expect(contents).toContain('OUTER_CONTOUR')
      expect((contents.match(/0\nVERTEX\n/g) ?? []).length).toBe(5)
    }
  }
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await dismissNotice(page)
  await page.getByLabel('Import SVG outline file').setInputFiles({
    name: 'exported-panel.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(exportedSVG),
  })
  await expectImportComplete(page)
  await expect(vertices).toHaveCount(5)
  const reimported = await saveProject(page)
  expect(reimported.width).toBeCloseTo(imported.width, 5)
  expect(
    reimported.customOutline.map(({ x, y }: { x: number; y: number }) => ({
      x: Number(x.toFixed(6)),
      y: Number(y.toFixed(6)),
    })),
  ).toEqual(expect.arrayContaining(normalizedPolygon))
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(
    accessibility.violations.map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => node.target),
    })),
  ).toEqual([])
  await page.screenshot({ path: 'test-results/svg-import-desktop.png' })
  expect(errors).toEqual([])
})

test('SVG outline import accepts transformed curves and remains usable on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Flat outline', exact: true }).click()
  await dismissNotice(page)
  const chooserPending = page.waitForEvent('filechooser')
  await page
    .locator('.outline-editor')
    .getByRole('button', { name: 'Import SVG outline', exact: true })
    .click()
  await (
    await chooserPending
  ).setFiles({
    name: 'curved-panel.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160">
        <g transform="translate(10 30) scale(2 1)">
          <path d="M0 0 H100 V40 C80 80 20 80 0 40 Z"/>
        </g>
      </svg>`),
  })
  await expectImportComplete(page)
  const vertices = page.getByRole('button', { name: /Vertex \d+,/ })
  await expect.poll(() => vertices.count()).toBeGreaterThan(5)
  expect(await vertices.count()).toBeLessThanOrEqual(128)
  await expect(page.getByLabel('Corner radius in millimeters')).toHaveValue('0')
  const pointX = page.getByLabel('Selected point X in millimeters')
  const pointY = page.getByLabel('Selected point Y in millimeters')
  await expect(pointX).toBeVisible()
  await expect(pointY).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: 'test-results/svg-import-mobile.png' })
  await page.setViewportSize({ width: 1440, height: 900 })
  const imported = await saveProject(page)
  expect(imported.width).toBeCloseTo(pathLength(defaultDesign.segments) * 0.35, 1)
  expect(imported.customOutline.some((point: { y: number }) => point.y === 0)).toBe(true)
  expect(imported.customOutline.some((point: { y: number }) => point.y === 1)).toBe(true)
})

test('unsupported SVG outlines report errors without replacing the current design', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByLabel('Import SVG outline file').setInputFiles(polygonFile)
  await expectImportComplete(page)
  const contour = page.locator('.outline-svg [data-outline-contour]')
  await expect(page.getByRole('button', { name: /Vertex \d+,/ })).toHaveCount(5)
  const original = await contour.getAttribute('points')
  const radius = page.getByLabel('Corner radius in millimeters')
  await radius.fill('6')
  await radius.press('Enter')
  const rounded = await contour.getAttribute('points')
  const invalidSources = [
    '<svg><polygon',
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L100 0 L100 100"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100"/><rect x="150" width="100" height="100"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M0 0H100V100H0Z M20 20H80V80H20Z"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><polygon points="0,0 100,100 0,100 100,0"/></svg>',
  ]
  for (const [index, source] of invalidSources.entries()) {
    await dismissNotice(page)
    await page.getByLabel('Import SVG outline file').setInputFiles({
      name: `invalid-${index}.svg`,
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(source),
    })
    await expectImportComplete(page, false)
    await expect(page.getByRole('status', { name: 'Notification' })).toContainText(
      /SVG|outline|closed|polygon/i,
    )
    await expect(radius).toHaveValue('6')
    await expect(contour).toHaveAttribute('points', rounded!)
    await expect(page.getByLabel('Import SVG outline file')).toHaveValue('')
  }
  await page.getByRole('button', { name: 'Undo (⌘ / Ctrl Z)', exact: true }).click()
  await expect(radius).toHaveValue('0')
  await expect(contour).toHaveAttribute('points', original!)
})

test('SVG arc outlines and root transforms respect viewport proportions', async ({ page }) => {
  await page.goto('/')
  for (const [aspectRatio, expectedHeight] of [
    ['none', 0.5],
    ['xMidYMid meet', 1],
  ] as const) {
    await dismissNotice(page)
    await page.getByLabel('Import SVG outline file').setInputFiles({
      name: 'arc-outline.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(`
        <svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"
             viewBox="0 0 100 100" preserveAspectRatio="${aspectRatio}">
          <path d="M0 50 A50 50 0 1 1 100 50 A50 50 0 1 1 0 50 Z"/>
        </svg>`),
    })
    await expectImportComplete(page)
    const vertices = page.getByRole('button', { name: /Vertex \d+,/ })
    await expect.poll(() => vertices.count()).toBeGreaterThan(12)
    expect(await vertices.count()).toBeLessThanOrEqual(128)
    const imported = await saveProject(page)
    expect(imported.width).toBeCloseTo(pathLength(defaultDesign.segments) * expectedHeight, 1)
  }
  await dismissNotice(page)
  await page.getByLabel('Import SVG outline file').setInputFiles({
    name: 'rotated-root.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"
           viewBox="0 0 100 100" preserveAspectRatio="none" transform="rotate(90)">
        <rect width="100" height="50"/>
      </svg>`),
  })
  await expectImportComplete(page)
  await expect(page.getByRole('button', { name: /Vertex \d+,/ })).toHaveCount(4)
  const rotated = await saveProject(page)
  expect(rotated.width).toBeCloseTo(pathLength(defaultDesign.segments) * 4, 5)
})

test('uploaded SVG active content is never inserted or executed', async ({ page }) => {
  const attemptedRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().startsWith('https://svg-import.invalid'))
      attemptedRequests.push(request.url())
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Flat outline', exact: true }).click()
  await dismissNotice(page)
  await page.getByLabel('Import SVG outline file').setInputFiles({
    name: 'active-content.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" onload="window.svgImportExecuted = true">
        <script>window.svgImportExecuted = true</script>
        <image href="https://svg-import.invalid/external.png" width="100" height="100"/>
        <rect width="100" height="100"/>
      </svg>`),
  })
  await expectImportComplete(page, false)
  await expect(page.getByRole('status', { name: 'Notification' })).toContainText(
    /SVG|outline|unsupported/i,
  )
  expect(await page.evaluate(() => 'svgImportExecuted' in window)).toBe(false)
  expect(attemptedRequests).toEqual([])
  await expect(page.locator('svg[onload]')).toHaveCount(0)
  await expect(page.locator('image[href^="https://svg-import.invalid"]')).toHaveCount(0)
})
