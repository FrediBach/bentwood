import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'
import { defaultDesign } from '../src/lib/geometry'

const asymmetricOutline = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0.8, y: 1 },
  { x: 0, y: 0.4 },
]

test('preview, desktop sizing, accessibility and camera controls', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Bend your idea.' })).toBeVisible()
  await expect(page.locator('.plywood-preview canvas')).toBeVisible()
  await expect(page.getByText('3D preview needs WebGL')).toHaveCount(0)
  await page.getByLabel('Camera view').selectOption('top')
  await page.getByLabel('Camera view').selectOption('perspective')
  await page.getByLabel('Unfold').fill('50')
  await expect(page.getByText('50%', { exact: true })).toBeVisible()
  await page.getByLabel('Unfold').fill('100')
  await page.getByRole('button', { name: 'Reset camera', exact: true }).click()
  await expect(page.locator('.plywood-preview canvas')).toBeVisible()
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport)
    expect(
      await page.evaluate(() => ({
        x: document.documentElement.scrollWidth > innerWidth,
        y: document.documentElement.scrollHeight > innerHeight,
      })),
    ).toEqual({ x: false, y: false })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(
    results.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  ).toEqual([])
  expect(errors).toEqual([])
  await page.screenshot({ path: 'test-results/studio-desktop.png' })
})

test('edit curves, undo, save, reload and import project', async ({ page }) => {
  await page.goto('/')
  const radius = page.getByRole('spinbutton', { name: 'Radius' })
  await radius.fill('70')
  await radius.press('Tab')
  await expect(radius).toHaveValue('70')
  await page.getByRole('button', { name: 'Undo (⌘ / Ctrl Z)', exact: true }).click()
  await expect(radius).toHaveValue('50')
  await page.getByRole('button', { name: 'Redo (⌘ / Ctrl Shift Z)', exact: true }).click()
  await expect(radius).toHaveValue('70')
  await page.getByLabel('Project name').fill('Wave study')
  const saved = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save project file', exact: true }).click()
  const file = await saved
  expect(file.suggestedFilename()).toBe('wave-study.bentwood.json')
  const data = JSON.parse(await readFile((await file.path())!, 'utf8'))
  expect(data.segments[1].radius).toBe(70)
  await page.reload()
  await expect(page.getByLabel('Project name')).toHaveValue('Wave study')
  await expect(page.getByRole('spinbutton', { name: 'Radius' })).toHaveValue('70')
  data.name = 'Imported project'
  await page.getByLabel('Import project file').setInputFiles({
    name: 'import.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(data)),
  })
  await expect(page.getByLabel('Project name')).toHaveValue('Imported project')
  await page.getByLabel('Import project file').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"bad":true}'),
  })
  await expect(page.getByRole('status')).toContainText('not a valid Bentwood project')
  await expect(page.getByLabel('Project name')).toHaveValue('Imported project')
})

test('custom outline keyboard editing and exact cut downloads', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Flat outline', exact: true }).click()
  await page.getByRole('button', { name: 'Triangle', exact: true }).click()
  await page.getByRole('button', { name: 'Customize this outline', exact: false }).click()
  const y = page.getByLabel('Selected point Y in millimeters')
  const vertex = page.getByRole('button', { name: /Vertex 1,/ })
  const point = await vertex.boundingBox()
  expect(point).not.toBeNull()
  await page.mouse.move(point!.x + point!.width / 2, point!.y + point!.height / 2)
  await page.mouse.down()
  await page.mouse.move(point!.x + point!.width / 2 + 25, point!.y + point!.height / 2 + 25, {
    steps: 8,
  })
  await page.mouse.up()
  await expect(y).not.toHaveValue('140')
  await page.getByRole('button', { name: 'Undo (⌘ / Ctrl Z)', exact: true }).click()
  await expect(y).toHaveValue('140')
  await y.fill('125')
  await y.press('Tab')
  await expect(y).toHaveValue('125')
  await page.getByRole('button', { name: 'Add point', exact: true }).click()
  await expect(page.getByRole('button', { name: /Vertex \d/ })).toHaveCount(4)
  await page.getByRole('button', { name: 'Remove selected point', exact: true }).click()
  await expect(page.getByRole('button', { name: /Vertex \d/ })).toHaveCount(3)
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(
    results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
  ).toEqual([])
  await page.getByRole('button', { name: 'Export cut plan', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  for (const format of ['SVG', 'DXF']) {
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: `Download ${format}`, exact: true }).click()
    const downloaded = await pending
    expect(downloaded.suggestedFilename()).toMatch(new RegExp(`\\.${format.toLowerCase()}$`))
    const contents = await readFile((await downloaded.path())!, 'utf8')
    if (format === 'SVG') {
      expect(contents).toContain('mm"')
      expect(contents).toContain('id="hinge-cuts"')
      expect(contents).toContain('id="outer-contour"')
    } else {
      expect(contents).toContain('$INSUNITS\n70\n4')
      expect(contents).toContain('HINGE_CUTS')
      expect(contents).toContain('OUTER_CONTOUR')
    }
  }
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await page.getByRole('button', { name: 'Cut plan', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'From a sheet to a shape.' })).toBeVisible()
  await page.screenshot({ path: 'test-results/cut-plan.png' })
})

test('custom outline height agrees with the preview and screen movement', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Import project file').setInputFiles({
    name: 'asymmetric.bentwood.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ ...defaultDesign, outline: 'custom', customOutline: asymmetricOutline }),
    ),
  })
  await page.getByRole('button', { name: 'Flat outline', exact: true }).click()
  const vertices = page.getByRole('button', { name: /Vertex \d,/ })
  await expect(vertices).toHaveCount(asymmetricOutline.length)
  const positions = await Promise.all(
    Array.from({ length: asymmetricOutline.length }, (_, index) =>
      vertices.nth(index).boundingBox(),
    ),
  )
  // The saved y=0 edge is the straight bottom in 3D; x still runs left to right.
  expect(positions[0]!.y).toBeCloseTo(positions[1]!.y, 5)
  expect(positions[0]!.y).toBeGreaterThan(positions[4]!.y)
  expect(positions[4]!.y).toBeGreaterThan(positions[3]!.y)
  expect(positions[0]!.x).toBeLessThan(positions[1]!.x)

  const slopedCorner = vertices.nth(4)
  const x = page.getByLabel('Selected point X in millimeters')
  const y = page.getByLabel('Selected point Y in millimeters')
  await slopedCorner.focus()
  await expect(y).toHaveValue('56')
  await slopedCorner.press('ArrowUp')
  await expect(y).toHaveValue('57')
  const raised = (await slopedCorner.boundingBox())!
  expect(raised.y).toBeLessThan(positions[4]!.y)
  await page.mouse.move(raised.x + raised.width / 2, raised.y + raised.height / 2)
  await page.mouse.down()
  await page.mouse.move(raised.x + raised.width / 2 + 20, raised.y + raised.height / 2 - 20, {
    steps: 6,
  })
  await page.mouse.up()
  expect(Number(await x.inputValue())).toBeGreaterThan(0)
  expect(Number(await y.inputValue())).toBeGreaterThan(57)
  await page.getByRole('button', { name: 'Undo (⌘ / Ctrl Z)', exact: true }).click()
  await expect(x).toHaveValue('0')
  await expect(y).toHaveValue('57')
  await page.getByRole('button', { name: 'Undo (⌘ / Ctrl Z)', exact: true }).click()
  await expect(y).toHaveValue('56')

  await page.getByRole('button', { name: 'Cut plan', exact: true }).click()
  const planPoints = await page
    .locator('.cut-plan-view [data-outline-contour]')
    .evaluate((element) => {
      const polygon = element as SVGPolygonElement
      const transform = polygon.getCTM()!
      return Array.from(polygon.points, (point) => ({
        x: point.matrixTransform(transform).x,
        y: point.matrixTransform(transform).y,
      }))
    })
  expect(planPoints[0].y).toBeCloseTo(planPoints[1].y, 5)
  expect(planPoints[0].y).toBeGreaterThan(planPoints[4].y)
  expect(planPoints[4].y).toBeGreaterThan(planPoints[3].y)
})

test('corner rounding survives undo, saving and export without replacing editable points', async ({
  page,
}) => {
  test.setTimeout(45000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.getByLabel('Import project file').setInputFiles({
    name: 'rounded-outline.bentwood.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ ...defaultDesign, outline: 'custom', customOutline: asymmetricOutline }),
    ),
  })
  await page.getByRole('button', { name: 'Flat outline', exact: true }).click()
  const radius = page.getByRole('spinbutton', { name: 'Corner radius in millimeters', exact: true })
  const contour = page.locator('.outline-svg [data-outline-contour]')
  await expect(radius).toHaveValue('0')
  const sharp = await contour.getAttribute('points')
  await radius.fill('12.5')
  await radius.press('Enter')
  await expect(radius).toHaveValue('12.5')
  await expect(contour).not.toHaveAttribute('points', sharp!)
  const rounded = await contour.getAttribute('points')
  expect(rounded!.trim().split(/\s+/).length).toBeGreaterThan(20)
  await expect(page.getByRole('button', { name: /Vertex \d,/ })).toHaveCount(
    asymmetricOutline.length,
  )
  await page.getByRole('button', { name: 'Undo (⌘ / Ctrl Z)', exact: true }).click()
  await expect(radius).toHaveValue('0')
  await expect(contour).toHaveAttribute('points', sharp!)
  await page.getByRole('button', { name: 'Redo (⌘ / Ctrl Shift Z)', exact: true }).click()
  await expect(radius).toHaveValue('12.5')
  await expect(contour).toHaveAttribute('points', rounded!)

  const saved = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save project file', exact: true }).click()
  const file = await saved
  const project = JSON.parse(await readFile((await file.path())!, 'utf8'))
  expect(project.outlineCornerRadius).toBe(12.5)
  expect(project.customOutline).toEqual(asymmetricOutline)
  await page.reload()
  await expect(page.locator('.plywood-preview canvas')).toBeVisible()
  await page.screenshot({ path: 'test-results/rounded-outline-bent-preview.png' })
  await page.getByRole('button', { name: 'Flat outline', exact: true }).click()
  await expect(radius).toHaveValue('12.5')
  await expect(contour).toHaveAttribute('points', rounded!)
  await page.getByRole('button', { name: 'Cut plan', exact: true }).click()
  expect(
    await page
      .locator('.cut-plan-view [data-outline-contour]')
      .evaluate((element) => (element as SVGPolygonElement).points.numberOfItems),
  ).toBeGreaterThan(20)
  await page.getByRole('button', { name: 'Export cut plan', exact: true }).click()
  for (const format of ['SVG', 'DXF']) {
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: `Download ${format}`, exact: true }).click()
    const download = await pending
    const contents = await readFile((await download.path())!, 'utf8')
    if (format === 'SVG') {
      const outline = await page.evaluate(
        (svg) =>
          new DOMParser()
            .parseFromString(svg, 'image/svg+xml')
            .querySelector('#outer-contour path')!
            .getAttribute('d')!,
        contents,
      )
      expect((outline.match(/L/g) ?? []).length).toBeGreaterThan(20)
    } else {
      expect((contents.match(/0\nVERTEX\n/g) ?? []).length).toBeGreaterThan(20)
    }
  }
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await page.getByRole('button', { name: 'Flat outline', exact: true }).click()
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(
    accessibility.violations.map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
    })),
  ).toEqual([])
  await page.screenshot({ path: 'test-results/rounded-outline-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(radius).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: 'test-results/rounded-outline-mobile.png' })
  expect(errors).toEqual([])
})

test('mobile panels and accessible export dialog', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.locator('.plywood-preview canvas')).toBeVisible()
  await page.screenshot({ path: 'test-results/studio-mobile.png' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.getByRole('button', { name: 'Design', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Bend your idea.' })).toBeVisible()
  await page.getByRole('button', { name: 'Material & cuts', exact: true }).click()
  await expect(page.getByRole('spinbutton', { name: 'Thickness' })).toBeVisible()
  const wave = page.getByRole('radio', { name: 'Wavy slits', exact: true })
  await wave.check()
  await expect(wave).toBeChecked()
  await expect(page.locator('#pattern-description')).toContainText('Undulating cuts')
  const honeycomb = page.getByRole('radio', { name: 'Honeycomb', exact: true })
  await honeycomb.check()
  await expect(page.locator('.pattern-selector input[type="radio"]')).toHaveCount(6)
  await page.getByRole('button', { name: 'Small waves', exact: true }).click()
  await expect(page.getByRole('spinbutton', { name: 'Roundness %', exact: true })).toHaveValue('0')
  await page.getByRole('button', { name: 'Honeycomb', exact: true }).click()
  await expect(honeycomb).toBeChecked()
  await expect(page.getByRole('spinbutton', { name: 'Opening width %', exact: true })).toHaveValue(
    '93.75',
  )
  const meander = page.getByRole('radio', { name: 'Meander', exact: true })
  await meander.check()
  await page.getByRole('button', { name: 'Fine', exact: true }).click()
  await expect(page.getByRole('spinbutton', { name: 'End overlap %', exact: true })).toHaveValue(
    '16.0811',
  )
  await page.getByRole('button', { name: 'Wide', exact: true }).click()
  await expect(meander).toBeChecked()
  await expect(page.getByRole('spinbutton', { name: 'End overlap %', exact: true })).toHaveValue(
    '8',
  )
  await expect(page.getByRole('slider', { name: 'End overlap adjustment' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Download test swatches SVG', exact: true }),
  ).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  const settingsAccessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(
    settingsAccessibility.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([])
  await meander.scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/patterns-mobile.png' })
  await page.getByRole('button', { name: 'Export cut plan', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(
    results.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  ).toEqual([])
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('existing projects migrate to cuts that meet the panel edges', async ({ page }) => {
  const legacyProject = {
    version: 1,
    name: 'Existing hinge study',
    segments: [
      { id: 'a', type: 'straight', length: 75 },
      { id: 'b', type: 'arc', radius: 50, angle: 180 },
      { id: 'c', type: 'straight', length: 75 },
    ],
    outline: 'rectangle',
    width: 140,
    customOutline: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
    thickness: 3,
    material: 'birch',
    spacing: 3,
    bridge: 2,
    cutLength: 24,
    edgeMargin: 4,
    kerf: 0.15,
  }
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript((project) => {
    if (!localStorage.getItem('bentwood.design.v1'))
      localStorage.setItem('bentwood.design.v1', JSON.stringify(project))
  }, legacyProject)
  await page.goto('/')
  await expect(page.getByLabel('Project name')).toHaveValue(legacyProject.name)
  await expect(page.getByRole('spinbutton', { name: 'Edge margin' })).toHaveCount(0)
  await expect(page.locator('.plywood-preview canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Cut plan', exact: true }).click()
  await expect(page.getByRole('radio', { name: 'Classic', exact: true })).toBeChecked()
  const cuts = await page.locator('.cut-plan-view [data-hinge-cut]').evaluateAll((paths) =>
    paths.map((element) => {
      const path = element as SVGPathElement
      const start = path.getPointAtLength(0)
      const end = path.getPointAtLength(path.getTotalLength())
      return { x: start.x, y1: start.y, y2: end.y }
    }),
  )
  const columns = [...new Set(cuts.map((cut) => cut.x))]
  expect(columns.length).toBeGreaterThan(30)
  for (const x of columns) {
    const column = cuts.filter((cut) => cut.x === x).sort((a, b) => a.y1 - b.y1)
    expect(column[0].y1).toBe(0)
    expect(column.at(-1)!.y2).toBe(140)
    expect(column.length).toBeGreaterThan(1)
    for (let i = 1; i < column.length; i++)
      expect(column[i].y1 - column[i - 1].y2).toBeCloseTo(2, 6)
  }
  await page.screenshot({ path: 'test-results/edge-cut-plan.png' })
  const saved = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save project file', exact: true }).click()
  const file = await saved
  const migrated = JSON.parse(await readFile((await file.path())!, 'utf8'))
  expect(migrated.version).toBe(4)
  expect(migrated.pattern).toBe('classic')
  expect(migrated).not.toHaveProperty('edgeMargin')
  expect(migrated.name).toBe(legacyProject.name)
  await page.reload()
  await expect(page.getByLabel('Project name')).toHaveValue(legacyProject.name)
  expect(errors).toEqual([])
})

test('hinge patterns update previews, exports and saved projects with test swatches', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  const pattern = (name: string) => page.getByRole('radio', { name, exact: true })
  await expect(pattern('Classic')).toBeChecked()
  await pattern('Classic').focus()
  await page.keyboard.press('ArrowRight')
  await expect(pattern('Graded')).toBeChecked()
  await expect(page.locator('#pattern-description')).toContainText('single radius')
  await pattern('Wavy slits').check()
  await expect(page.locator('.plywood-preview canvas')).toBeVisible()
  await expect(page.getByText('Dense pattern: cuts shown as lines')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/wave-bent-preview.png' })
  await page.getByRole('button', { name: 'Cut plan', exact: true }).click()
  const previewCut = page.locator('.cut-plan-view [data-hinge-cut]').first()
  const wavePath = await previewCut.getAttribute('d')
  expect(wavePath).toBeTruthy()
  const varyingX = await previewCut.evaluate((element) => {
    const path = element as SVGPathElement
    const length = path.getTotalLength()
    const points = [0, 0.25, 0.5, 0.75, 1].map(
      (fraction) => path.getPointAtLength(length * fraction).x,
    )
    return Math.max(...points) - Math.min(...points)
  })
  expect(varyingX).toBeGreaterThan(0.1)
  await page.screenshot({ path: 'test-results/wave-cut-plan.png' })
  await pattern('Zigzag').check()
  await expect(previewCut).not.toHaveAttribute('d', wavePath!)
  await page.getByRole('button', { name: '3D preview', exact: true }).click()
  await expect(page.locator('.plywood-preview canvas')).toBeVisible()
  await expect(page.getByText('Dense pattern: cuts shown as lines')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/zigzag-bent-preview.png' })
  await pattern('Wavy slits').check()
  await page.getByRole('button', { name: 'Cut plan', exact: true }).click()
  await expect(previewCut).toHaveAttribute('d', wavePath!)

  const saved = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save project file', exact: true }).click()
  const file = await saved
  const project = JSON.parse(await readFile((await file.path())!, 'utf8'))
  expect(project.pattern).toBe('wave')
  expect(project.version).toBe(4)
  await page.reload()
  await expect(pattern('Wavy slits')).toBeChecked()
  await page.getByRole('button', { name: 'Export cut plan', exact: true }).click()
  const exported = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download SVG', exact: true }).click()
  const svgFile = await exported
  const svg = await readFile((await svgFile.path())!, 'utf8')
  const exportedPath = await page.evaluate(
    (contents) =>
      new DOMParser()
        .parseFromString(contents, 'image/svg+xml')
        .querySelector('#hinge-cuts path')
        ?.getAttribute('d'),
    svg,
  )
  expect(exportedPath).toBe(wavePath)
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()

  const swatches = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download test swatches SVG', exact: true }).click()
  const swatchFile = await swatches
  expect(swatchFile.suggestedFilename()).toContain('-wave-test-swatches.svg')
  const swatchSVG = await readFile((await swatchFile.path())!, 'utf8')
  const swatchDetails = await page.evaluate((contents) => {
    const document = new DOMParser().parseFromString(contents, 'image/svg+xml')
    return {
      samples: document.querySelectorAll('[id^="swatch-"]').length,
      labels: Boolean(document.querySelector('#engraving-labels')),
      physicalSize: document.documentElement.getAttribute('width'),
    }
  }, swatchSVG)
  expect(swatchDetails.samples).toBe(9)
  expect(swatchDetails.labels).toBe(true)
  expect(swatchDetails.physicalSize).toMatch(/mm$/)

  const legacy = { ...project, version: 2, name: 'Version two study' }
  delete legacy.pattern
  await page.getByLabel('Import project file').setInputFiles({
    name: 'legacy-v2.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(legacy)),
  })
  await expect(page.getByLabel('Project name')).toHaveValue('Version two study')
  await expect(pattern('Classic')).toBeChecked()
  expect(errors).toEqual([])
})

for (const pattern of [
  {
    id: 'small-wave',
    label: 'Small waves',
    bridge: 5.25,
    cutLength: 15.75,
    roundness: 0,
    openingWidth: 0.5,
  },
  {
    id: 'honeycomb',
    label: 'Honeycomb',
    bridge: 6.56,
    cutLength: 19.68,
    roundness: 1,
    openingWidth: 0.9375,
  },
]) {
  test(`${pattern.label} keeps closed openings in the preview, exports and saved projects`, async ({
    page,
  }) => {
    test.setTimeout(45000)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/')
    await page.getByRole('radio', { name: 'Honeycomb', exact: true }).check()
    await page.getByRole('button', { name: pattern.label, exact: true }).click()
    await expect(page.getByRole('spinbutton', { name: 'Cut spacing mm', exact: true })).toHaveValue(
      '2.4',
    )
    await expect(page.getByRole('spinbutton', { name: 'Bridge mm', exact: true })).toHaveValue(
      String(pattern.bridge),
    )
    await expect(page.getByRole('spinbutton', { name: 'Cut length mm', exact: true })).toHaveValue(
      String(pattern.cutLength),
    )
    await expect(page.getByRole('spinbutton', { name: 'Roundness %', exact: true })).toHaveValue(
      String(pattern.roundness * 100),
    )
    await expect(
      page.getByRole('spinbutton', { name: 'Opening width %', exact: true }),
    ).toHaveValue(String(pattern.openingWidth * 100))
    await expect(page.locator('.plywood-preview canvas')).toBeVisible()
    await page.screenshot({ path: `test-results/${pattern.id}-bent-preview.png` })
    await page.getByLabel('Unfold').fill('0')
    await page.getByLabel('Camera view').selectOption('front')
    await page.screenshot({ path: `test-results/${pattern.id}-flat-preview.png` })
    await page.getByRole('button', { name: 'Cut plan', exact: true }).click()
    const closedCuts = page.locator('.cut-plan-view [data-hinge-cut][d$="Z"]')
    expect(await closedCuts.count()).toBeGreaterThan(10)
    const closedPath = await closedCuts.first().getAttribute('d')
    if (pattern.id === 'honeycomb') expect(closedPath!.match(/L/g)!.length).toBeGreaterThan(8)
    await page.screenshot({ path: `test-results/${pattern.id}-cut-plan.png` })

    const saved = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Save project file', exact: true }).click()
    const projectFile = await saved
    const project = JSON.parse(await readFile((await projectFile.path())!, 'utf8'))
    expect(project.pattern).toBe('honeycomb')
    expect(project.honeycombRoundness).toBe(pattern.roundness)
    expect(project.honeycombWidth).toBe(pattern.openingWidth)
    expect(project.spacing).toBe(2.4)
    expect(project.bridge).toBe(pattern.bridge)
    expect(project.cutLength).toBe(pattern.cutLength)
    expect(project.version).toBe(4)
    await page.reload()
    await expect(page.getByRole('radio', { name: 'Honeycomb', exact: true })).toBeChecked()
    const legacy = { ...project, version: 3, pattern: pattern.id, name: `${pattern.label} legacy` }
    delete legacy.honeycombRoundness
    delete legacy.honeycombWidth
    delete legacy.meanderOverlap
    await page.getByLabel('Import project file', { exact: true }).setInputFiles({
      name: 'legacy.bentwood.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(legacy)),
    })
    await expect(page.getByLabel('Project name')).toHaveValue(legacy.name)
    await expect(page.getByRole('radio', { name: 'Honeycomb', exact: true })).toBeChecked()
    await expect(page.getByRole('spinbutton', { name: 'Roundness %', exact: true })).toHaveValue(
      String(pattern.roundness * 100),
    )
    await expect(
      page.getByRole('spinbutton', { name: 'Opening width %', exact: true }),
    ).toHaveValue(String(pattern.openingWidth * 100))

    await page.getByRole('button', { name: 'Export cut plan', exact: true }).click()
    const exported = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download SVG', exact: true }).click()
    const svgFile = await exported
    const svg = await readFile((await svgFile.path())!, 'utf8')
    expect(svg).toContain(`d="${closedPath}"`)
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
    const swatches = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download test swatches SVG', exact: true }).click()
    const swatchFile = await swatches
    expect(swatchFile.suggestedFilename()).toContain('-honeycomb-test-swatches.svg')
    const swatchSVG = await readFile((await swatchFile.path())!, 'utf8')
    const sampleContours = await page.evaluate((contents) => {
      const document = new DOMParser().parseFromString(contents, 'image/svg+xml')
      return [...document.querySelectorAll('[id^="swatch-"]')].map(
        (sample) => sample.querySelectorAll('path[d$="Z"]').length,
      )
    }, swatchSVG)
    expect(sampleContours).toHaveLength(9)
    expect(sampleContours.every((count) => count > 0)).toBe(true)
    expect(swatchSVG).toContain('Honeycomb')
    expect(errors).toEqual([])
  })
}

for (const pattern of [
  { id: 'meander', label: 'Fine meander', preset: 'Fine', cutLength: 22.58, overlap: 0.160811 },
  { id: 'meander-wide', label: 'Wide meander', preset: 'Wide', cutLength: 33.87, overlap: 0.08 },
]) {
  test(`${pattern.label} preserves rounded slits through previews, exports and saved projects`, async ({
    page,
  }) => {
    test.setTimeout(45000)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/')
    await page.getByRole('radio', { name: 'Meander', exact: true }).check()
    await page.getByRole('button', { name: pattern.preset, exact: true }).click()
    await expect(page.getByRole('spinbutton', { name: 'Cut spacing mm', exact: true })).toHaveValue(
      '3.04',
    )
    await expect(
      page.getByRole('spinbutton', { name: 'End separation mm', exact: true }),
    ).toHaveValue('1.62')
    await expect(page.getByRole('spinbutton', { name: 'Cut length mm', exact: true })).toHaveValue(
      String(pattern.cutLength),
    )
    await expect(page.getByRole('spinbutton', { name: 'End overlap %', exact: true })).toHaveValue(
      String(Number((pattern.overlap * 100).toFixed(4))),
    )
    await expect(page.locator('.plywood-preview canvas')).toBeVisible()
    await expect(page.getByText('Dense pattern: cuts shown as lines')).toHaveCount(0)
    await page.screenshot({ path: `test-results/${pattern.id}-bent-preview.png` })
    await page.getByLabel('Unfold').fill('0')
    await page.getByLabel('Camera view').selectOption('front')
    await page.screenshot({ path: `test-results/${pattern.id}-flat-preview.png` })
    await page.getByRole('button', { name: 'Cut plan', exact: true }).click()
    const cuts = page.locator('.cut-plan-view [data-hinge-cut]')
    expect(await cuts.count()).toBeGreaterThan(10)
    const paths = await cuts.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('d')!),
    )
    expect(paths.every((path) => !path.endsWith('Z'))).toBe(true)
    const curvedPath = paths.find((path) => (path.match(/L/g)?.length ?? 0) > 8)
    expect(curvedPath).toBeTruthy()
    await page.screenshot({ path: `test-results/${pattern.id}-cut-plan.png` })

    const saved = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Save project file', exact: true }).click()
    const projectFile = await saved
    const project = JSON.parse(await readFile((await projectFile.path())!, 'utf8'))
    expect(project.pattern).toBe('meander')
    expect(project.meanderOverlap).toBe(pattern.overlap)
    expect(project.spacing).toBe(3.04)
    expect(project.bridge).toBe(1.62)
    expect(project.cutLength).toBe(pattern.cutLength)
    expect(project.version).toBe(4)
    await page.reload()
    await expect(page.getByRole('radio', { name: 'Meander', exact: true })).toBeChecked()
    const legacy = { ...project, version: 3, pattern: pattern.id, name: `${pattern.label} legacy` }
    delete legacy.honeycombRoundness
    delete legacy.honeycombWidth
    delete legacy.meanderOverlap
    await page.getByLabel('Import project file', { exact: true }).setInputFiles({
      name: 'legacy.bentwood.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(legacy)),
    })
    await expect(page.getByLabel('Project name')).toHaveValue(legacy.name)
    await expect(page.getByRole('radio', { name: 'Meander', exact: true })).toBeChecked()
    await expect(page.getByRole('spinbutton', { name: 'End overlap %', exact: true })).toHaveValue(
      String(Number((pattern.overlap * 100).toFixed(4))),
    )

    await page.getByRole('button', { name: 'Export cut plan', exact: true }).click()
    const exported = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download SVG', exact: true }).click()
    const svgFile = await exported
    const svg = await readFile((await svgFile.path())!, 'utf8')
    expect(svg).toContain(`d="${curvedPath}"`)
    const dxfDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download DXF', exact: true }).click()
    const dxfFile = await dxfDownload
    const dxf = await readFile((await dxfFile.path())!, 'utf8')
    expect(dxf).toContain('$INSUNITS\n70\n4')
    expect((dxf.match(/0\nLINE\n/g) ?? []).length).toBeGreaterThan(paths.length)
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click()

    const swatches = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download test swatches SVG', exact: true }).click()
    const swatchFile = await swatches
    expect(swatchFile.suggestedFilename()).toContain('-meander-test-swatches.svg')
    const swatchSVG = await readFile((await swatchFile.path())!, 'utf8')
    const samplePaths = await page.evaluate((contents) => {
      const document = new DOMParser().parseFromString(contents, 'image/svg+xml')
      return [...document.querySelectorAll('[id^="swatch-"]')].map((sample) =>
        [...sample.querySelectorAll('path')].map((path) => path.getAttribute('d')!),
      )
    }, swatchSVG)
    expect(samplePaths).toHaveLength(9)
    expect(
      samplePaths.every((sample) => sample.some((path) => (path.match(/L/g)?.length ?? 0) > 8)),
    ).toBe(true)
    expect(samplePaths.flat().every((path) => !path.endsWith('Z'))).toBe(true)
    expect(swatchSVG).toContain('Meander')
    expect(errors).toEqual([])
  })
}

test('parametric families preserve intermediate shapes through undo, saving and exports', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.locator('.pattern-selector input[type="radio"]')).toHaveCount(6)
  await expect(page.getByRole('radio', { name: 'Small waves', exact: true })).toHaveCount(0)
  await expect(page.getByRole('radio', { name: 'Wide meander', exact: true })).toHaveCount(0)
  await page.getByRole('radio', { name: 'Honeycomb', exact: true }).check()
  await page.getByRole('button', { name: 'Small waves', exact: true }).click()
  await page.getByRole('button', { name: 'Cut plan', exact: true }).click()
  const closedCuts = page.locator('.cut-plan-view [data-hinge-cut][d$="Z"]')
  const diamondPath = await closedCuts.first().getAttribute('d')
  const roundness = page.getByRole('spinbutton', { name: 'Roundness %', exact: true })
  await roundness.fill('37.5')
  await roundness.press('Enter')
  await page.getByRole('button', { name: 'Undo (⌘ / Ctrl Z)', exact: true }).click()
  await expect(roundness).toHaveValue('0')
  await page.getByRole('button', { name: 'Redo (⌘ / Ctrl Shift Z)', exact: true }).click()
  await expect(roundness).toHaveValue('37.5')
  const opening = page.getByRole('spinbutton', { name: 'Opening width %', exact: true })
  await opening.fill('72')
  await opening.press('Enter')
  await expect(page.getByRole('button', { name: 'Small waves', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  const honeycombPath = await closedCuts.first().getAttribute('d')
  expect(honeycombPath).not.toBe(diamondPath)
  expect(honeycombPath!.match(/L/g)!.length).toBeGreaterThan(4)
  await page.screenshot({ path: 'test-results/honeycomb-intermediate-cut-plan.png' })

  let saved = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save project file', exact: true }).click()
  let file = await saved
  let project = JSON.parse(await readFile((await file.path())!, 'utf8'))
  expect(project.version).toBe(4)
  expect(project.honeycombRoundness).toBe(0.375)
  expect(project.honeycombWidth).toBe(0.72)
  await page.reload()
  await expect(roundness).toHaveValue('37.5')
  await expect(opening).toHaveValue('72')
  await page.getByRole('button', { name: 'Export cut plan', exact: true }).click()
  let exported = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download SVG', exact: true }).click()
  let svgFile = await exported
  expect(await readFile((await svgFile.path())!, 'utf8')).toContain(`d="${honeycombPath}"`)
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()

  await page.getByRole('radio', { name: 'Meander', exact: true }).check()
  await page.getByRole('button', { name: 'Fine', exact: true }).click()
  const overlap = page.getByRole('slider', { name: 'End overlap adjustment', exact: true })
  await overlap.fill('12.5')
  const cutLength = page.getByRole('spinbutton', { name: 'Cut length mm', exact: true })
  await cutLength.fill('28')
  await cutLength.press('Enter')
  await expect(page.getByRole('spinbutton', { name: 'End overlap %', exact: true })).toHaveValue(
    '12.5',
  )
  await expect(page.getByRole('button', { name: 'Fine', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await page.getByRole('button', { name: 'Cut plan', exact: true }).click()
  const meanderPath = await page
    .locator('.cut-plan-view [data-hinge-cut]')
    .first()
    .getAttribute('d')
  await page.screenshot({ path: 'test-results/meander-intermediate-cut-plan.png' })
  saved = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save project file', exact: true }).click()
  file = await saved
  project = JSON.parse(await readFile((await file.path())!, 'utf8'))
  expect(project.pattern).toBe('meander')
  expect(project.meanderOverlap).toBe(0.125)
  expect(project.cutLength).toBe(28)
  expect(project.honeycombRoundness).toBe(0.375)
  expect(project.honeycombWidth).toBe(0.72)
  await page.reload()
  await expect(overlap).toHaveValue('12.5')
  await expect(cutLength).toHaveValue('28')
  await page.getByRole('button', { name: 'Export cut plan', exact: true }).click()
  exported = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download SVG', exact: true }).click()
  svgFile = await exported
  expect(await readFile((await svgFile.path())!, 'utf8')).toContain(`d="${meanderPath}"`)
  expect(errors).toEqual([])
})

test('focusing a rounded percentage display preserves imported precision', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Cut plan', exact: true }).click()
  let saved = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save project file', exact: true }).click()
  let file = await saved
  const project = JSON.parse(await readFile((await file.path())!, 'utf8'))
  Object.assign(project, {
    name: 'Precise parameters',
    pattern: 'meander',
    spacing: 3.04,
    bridge: 1.62,
    cutLength: 28,
    honeycombRoundness: 0.374567891,
    honeycombWidth: 0.723456789,
    meanderOverlap: 0.123456789,
  })
  await page.getByLabel('Import project file').setInputFiles({
    name: 'precise.bentwood.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  })
  await expect(page.getByLabel('Project name')).toHaveValue(project.name)
  const overlap = page.getByRole('spinbutton', { name: 'End overlap %', exact: true })
  await expect(overlap).toHaveValue('12.3457')
  await overlap.focus()
  await overlap.press('Tab')
  await page.getByRole('radio', { name: 'Honeycomb', exact: true }).check()
  for (const label of ['Roundness %', 'Opening width %']) {
    const field = page.getByRole('spinbutton', { name: label, exact: true })
    await field.focus()
    await field.press('Tab')
  }
  saved = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save project file', exact: true }).click()
  file = await saved
  const savedProject = JSON.parse(await readFile((await file.path())!, 'utf8'))
  expect(savedProject.honeycombRoundness).toBe(project.honeycombRoundness)
  expect(savedProject.honeycombWidth).toBe(project.honeycombWidth)
  expect(savedProject.meanderOverlap).toBe(project.meanderOverlap)
})

test('3D preview supports open cuts on round and concave outlines', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('tab', { name: 'Panel outline' }).click()
  await page.getByRole('button', { name: 'Circle', exact: true }).click()
  await expect(page.locator('.plywood-preview canvas')).toBeVisible()
  await page.getByLabel('Unfold').fill('0')
  await page.screenshot({ path: 'test-results/edge-circle-flat.png' })
  await page.getByLabel('Unfold').fill('100')
  await page.getByRole('button', { name: 'Triangle', exact: true }).click()
  await expect(page.locator('.plywood-preview canvas')).toBeVisible()
  await page.screenshot({ path: 'test-results/edge-triangle-bent.png' })
  const saved = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save project file', exact: true }).click()
  const file = await saved
  const project = JSON.parse(await readFile((await file.path())!, 'utf8'))
  project.outline = 'custom'
  project.customOutline = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0.6, y: 1 },
    { x: 0.6, y: 0.4 },
    { x: 0.4, y: 0.4 },
    { x: 0.4, y: 1 },
    { x: 0, y: 1 },
  ]
  await page.getByLabel('Import project file').setInputFiles({
    name: 'concave.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  })
  await expect(page.getByRole('status')).toContainText('Project opened.')
  await expect(page.locator('.plywood-preview canvas')).toBeVisible()
  await page.screenshot({ path: 'test-results/edge-concave-bent.png' })
  expect(errors).toEqual([])
})
