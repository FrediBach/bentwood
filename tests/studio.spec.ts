import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'

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
  await page.mouse.move(point!.x + point!.width / 2 + 25, point!.y + point!.height / 2 - 25, {
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
  const smallWaves = page.getByRole('radio', { name: 'Small waves', exact: true })
  await smallWaves.check()
  await page.getByRole('button', { name: 'Reference proportions', exact: true }).click()
  await expect(page.locator('#pattern-description')).toContainText('perpendicular to the bend')
  const honeycomb = page.getByRole('radio', { name: 'Honeycomb', exact: true })
  await honeycomb.check()
  await page.getByRole('button', { name: 'Reference proportions', exact: true }).click()
  await expect(honeycomb).toBeChecked()
  await expect(page.locator('#pattern-description')).toContainText('curved openings')
  const fineMeander = page.getByRole('radio', { name: 'Fine meander', exact: true })
  await fineMeander.check()
  await page.getByRole('button', { name: 'Reference proportions', exact: true }).click()
  await expect(fineMeander).toBeChecked()
  const wideMeander = page.getByRole('radio', { name: 'Wide meander', exact: true })
  await wideMeander.check()
  await page.getByRole('button', { name: 'Suggested proportions', exact: true }).click()
  await expect(wideMeander).toBeChecked()
  await expect(page.locator('#pattern-description')).toContainText('more open repeat')
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
  await wideMeander.scrollIntoViewIfNeeded()
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
  expect(migrated.version).toBe(3)
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
  expect(project.version).toBe(3)
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
    description: 'interlocking wave texture',
  },
  {
    id: 'honeycomb',
    label: 'Honeycomb',
    bridge: 6.56,
    cutLength: 19.68,
    description: 'curved openings with pointed ends',
  },
]) {
  test(`${pattern.label} keeps closed openings in the preview, exports and saved projects`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/')
    await page.getByRole('radio', { name: pattern.label, exact: true }).check()
    await page.getByRole('button', { name: 'Reference proportions', exact: true }).click()
    await expect(page.getByRole('spinbutton', { name: 'Cut spacing mm', exact: true })).toHaveValue(
      '2.4',
    )
    await expect(page.getByRole('spinbutton', { name: 'Bridge mm', exact: true })).toHaveValue(
      String(pattern.bridge),
    )
    await expect(page.getByRole('spinbutton', { name: 'Cut length mm', exact: true })).toHaveValue(
      String(pattern.cutLength),
    )
    await expect(page.locator('#pattern-description')).toContainText(pattern.description)
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
    expect(project.pattern).toBe(pattern.id)
    expect(project.spacing).toBe(2.4)
    expect(project.bridge).toBe(pattern.bridge)
    expect(project.cutLength).toBe(pattern.cutLength)
    expect(project.version).toBe(3)
    await page.reload()
    await expect(page.getByRole('radio', { name: pattern.label, exact: true })).toBeChecked()

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
    expect(swatchFile.suggestedFilename()).toContain(`-${pattern.id}-test-swatches.svg`)
    const swatchSVG = await readFile((await swatchFile.path())!, 'utf8')
    const sampleContours = await page.evaluate((contents) => {
      const document = new DOMParser().parseFromString(contents, 'image/svg+xml')
      return [...document.querySelectorAll('[id^="swatch-"]')].map(
        (sample) => sample.querySelectorAll('path[d$="Z"]').length,
      )
    }, swatchSVG)
    expect(sampleContours).toHaveLength(9)
    expect(sampleContours.every((count) => count > 0)).toBe(true)
    expect(swatchSVG).toContain(pattern.label)
    expect(errors).toEqual([])
  })
}

for (const pattern of [
  { id: 'meander', label: 'Fine meander', preset: 'Reference proportions', cutLength: 22.58 },
  { id: 'meander-wide', label: 'Wide meander', preset: 'Suggested proportions', cutLength: 33.87 },
]) {
  test(`${pattern.label} preserves rounded slits through previews, exports and saved projects`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/')
    await page.getByRole('radio', { name: pattern.label, exact: true }).check()
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
    expect(project.pattern).toBe(pattern.id)
    expect(project.spacing).toBe(3.04)
    expect(project.bridge).toBe(1.62)
    expect(project.cutLength).toBe(pattern.cutLength)
    expect(project.version).toBe(3)
    await page.reload()
    await expect(page.getByRole('radio', { name: pattern.label, exact: true })).toBeChecked()

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
    expect(swatchFile.suggestedFilename()).toContain(`-${pattern.id}-test-swatches.svg`)
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
    expect(swatchSVG).toContain(pattern.label)
    expect(errors).toEqual([])
  })
}

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
