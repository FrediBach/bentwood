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
  await page
    .getByLabel('Import project file')
    .setInputFiles({
      name: 'import.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(data)),
    })
  await expect(page.getByLabel('Project name')).toHaveValue('Imported project')
  await page
    .getByLabel('Import project file')
    .setInputFiles({
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
