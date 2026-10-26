import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { woodMaterials } from '../src/lib/wood-materials'
import { defaultDesign } from '../src/lib/geometry'

test('all woods render and retain their selection through save, reload and import', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  const selector = page.getByLabel('Material appearance')
  await expect(selector.locator('option')).toHaveCount(woodMaterials.length)
  for (const [index, wood] of woodMaterials.entries()) {
    await selector.selectOption(wood.id)
    await expect(page.locator('.plywood-preview canvas')).toBeVisible()
    await expect(page.getByText('3D preview needs WebGL')).toHaveCount(0)
    await expect(page.locator('.wood-swatch')).toContainText(String(index + 1).padStart(2, '0'))
  }
  const saved = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save project file', exact: true }).click()
  const file = await saved
  const project = JSON.parse(await readFile((await file.path())!, 'utf8'))
  expect(project.material).toBe('mahogany')
  await page.reload()
  await expect(selector).toHaveValue('mahogany')
  await selector.selectOption('birch')
  await page.getByLabel('Import project file').setInputFiles({
    name: 'mahogany.bentwood.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  })
  await expect(selector).toHaveValue('mahogany')
  expect(errors).toEqual([])
})

test('wood grain spans repeated tiles on a large flat and bent panel', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.getByLabel('Import project file').setInputFiles({
    name: 'wide-walnut.bentwood.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        ...defaultDesign,
        name: 'Wide walnut grain study',
        material: 'walnut',
        width: 780,
        segments: [
          { id: 's1', type: 'straight', length: 650 },
          { id: 's2', type: 'arc', radius: 250, angle: 90 },
          { id: 's3', type: 'straight', length: 600 },
        ],
        spacing: 10,
        cutLength: 70,
      }),
    ),
  })
  await expect(page.getByLabel('Project name')).toHaveValue('Wide walnut grain study')
  await page.getByLabel('Unfold').fill('0')
  await page.getByLabel('Camera view').selectOption('front')
  const preview = page.locator('.plywood-preview canvas')
  // Bring the surface inside the scene's fog for a close view of the repeats.
  for (let step = 0; step < 9; step++) await preview.press('+')
  await page.screenshot({ path: 'test-results/wood-walnut-flat.png' })
  await page.getByLabel('Unfold').fill('100')
  await page.getByLabel('Camera view').selectOption('perspective')
  for (let step = 0; step < 7; step++) await preview.press('+')
  await page.screenshot({ path: 'test-results/wood-walnut-bent.png' })
  await expect(page.getByText('3D preview needs WebGL')).toHaveCount(0)
  expect(errors).toEqual([])
})
