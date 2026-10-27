import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { defaultDesign } from '../src/lib/geometry'
import type { Project } from '../src/lib/types'

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

test('sheet tabs scroll, support keyboard navigation and keep mobile actions reachable', async ({
  page,
}) => {
  const project: Project = {
    version: 5,
    name: 'A cabinet with several panels',
    sheets: Array.from({ length: 5 }, (_, index) => ({
      id: `sheet-${index + 1}`,
      design: {
        ...defaultDesign,
        name: `Walnut shelving panel ${index + 1} with a long descriptive name`,
        segments: [{ id: 'straight', type: 'straight', length: 100 }],
        material: 'walnut',
        width: 80,
      },
      placement: { x: index * 150, y: 0, z: 0, rotation: 0 },
    })),
  }
  await page.goto('/')
  await page.getByLabel('Import project file').setInputFiles({
    name: 'cabinet.bentwood.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  })
  const tabs = page.getByRole('tablist', { name: 'Sheets', exact: true }).getByRole('tab')
  await expect(tabs).toHaveCount(5)
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true')
  await tabs.first().focus()
  await page.keyboard.press('End')
  await expect(tabs.last()).toBeFocused()
  await expect(tabs.last()).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowRight')
  await expect(tabs.first()).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(tabs.last()).toBeFocused()
  await page.keyboard.press('Home')
  await expect(tabs.first()).toBeFocused()

  await page.getByRole('button', { name: 'Add sheet', exact: true }).click()
  await expect(tabs).toHaveCount(6)
  await expect(tabs.last()).toHaveAttribute('aria-selected', 'true')
  await expect(tabs.last()).toBeInViewport({ ratio: 0.5 })
  await page.getByRole('button', { name: 'Design', exact: true }).click()
  await page.getByLabel('Sheet name', { exact: true }).fill('New walnut panel')
  await page.getByRole('button', { name: 'Duplicate active sheet', exact: true }).click()
  await expect(tabs).toHaveCount(7)
  await expect(page.getByLabel('Sheet name', { exact: true })).toHaveValue('New walnut panel copy')
  await page.getByRole('button', { name: 'Remove active sheet', exact: true }).click()
  await expect(tabs).toHaveCount(6)
  await expect(page.getByLabel('Sheet name', { exact: true })).toHaveValue('New walnut panel')

  await page.getByRole('button', { name: 'Studio', exact: true }).click()
  await expect(page.locator('[data-geometry-state]')).toHaveAttribute(
    'data-geometry-state',
    'ready',
  )
  const warning = page
    .locator('.sheet-navigation')
    .getByRole('button', { name: 'Assembly warnings', exact: true })
  await expect(warning).toBeInViewport()
  await expect(page.locator('.studio-canvas .assembly-warning')).toHaveCount(0)
  await warning.tap()
  const tooltip = page.getByRole('tooltip')
  await expect(tooltip).toContainText('New walnut panel')
  await expect(tooltip).toContainText('overlap')
  const tooltipBox = page.locator('.assembly-warning-tooltip')
  await expect(tooltipBox).toBeInViewport({ ratio: 1 })
  await page.screenshot({ path: 'test-results/assembly-warning-tooltip-mobile.png' })
  await warning.tap()
  await expect(tooltip).toHaveCount(0)
  await warning.tap()
  await expect(tooltip).toContainText('New walnut panel')
  await page.keyboard.press('Escape')
  await expect(tooltip).toHaveCount(0)
  expect(
    await page
      .locator('.sheet-tabs')
      .evaluate((element) => element.scrollWidth > element.clientWidth),
  ).toBe(true)
  expect(
    await page.evaluate(() => ({
      x: document.documentElement.scrollWidth > innerWidth,
      y: document.documentElement.scrollHeight > innerHeight,
    })),
  ).toEqual({ x: false, y: false })
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(
    results.violations.map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => node.target),
    })),
  ).toEqual([])
  await page.screenshot({ path: 'test-results/sheets-mobile.png' })

  for (let count = 6; count > 1; count--) {
    await page.getByRole('button', { name: 'Remove active sheet', exact: true }).click()
    await expect(tabs).toHaveCount(count - 1)
  }
  await expect(
    page.getByRole('button', { name: 'Remove active sheet', exact: true }),
  ).toBeDisabled()
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true')
})
