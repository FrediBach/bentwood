import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { defaultDesign } from '../src/lib/geometry'

test('slider dragging retains its final value and one undo step', async ({ page }) => {
  await page.addInitScript(
    (design) => {
      localStorage.setItem('bentwood.design.v1', JSON.stringify(design))
    },
    { ...defaultDesign, pattern: 'honeycomb', honeycombRoundness: 0.35 },
  )
  await page.goto('/')
  const slider = page.getByRole('slider', { name: 'Roundness adjustment', exact: true })
  const field = page.getByRole('spinbutton', { name: 'Roundness %', exact: true })
  await expect(field).toHaveValue('35')
  await slider.scrollIntoViewIfNeeded()
  const bounds = (await slider.boundingBox())!
  await page.mouse.move(bounds.x + bounds.width * 0.35, bounds.y + bounds.height / 2)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width * 0.7, bounds.y + bounds.height / 2, { steps: 8 })
  // Queue final values during the real release event, before React's pointer-up
  // handler. No animation frame can commit them before the undo group closes.
  await slider.evaluate((element) => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    element.addEventListener(
      'pointerup',
      () => {
        for (const value of ['26.12', '40.89', '73.27']) {
          setValue.call(element, value)
          element.dispatchEvent(new Event('input', { bubbles: true }))
        }
      },
      { capture: true, once: true },
    )
  })
  await page.mouse.up()
  await expect(field).toHaveValue('73.27')
  await page.getByRole('button', { name: 'Undo (⌘ / Ctrl Z)', exact: true }).click()
  await expect(field).toHaveValue('35')
  await page.getByRole('button', { name: 'Redo (⌘ / Ctrl Shift Z)', exact: true }).click()
  await expect(field).toHaveValue('73.27')

  await slider.focus()
  await slider.press('ArrowRight')
  await expect(field).toHaveValue('73.28')
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save project file', exact: true }).click()
  const file = await pending
  const saved = JSON.parse(await readFile((await file.path())!, 'utf8')).sheets[0].design
  expect(saved.honeycombRoundness).toBe(0.7328)
})

test('focusing rounded outline coordinates preserves imported precision', async ({ page }) => {
  const design = {
    ...defaultDesign,
    outline: 'custom' as const,
    outlineCornerRadius: 4.123456789,
    customOutline: [
      { x: 0.123456789, y: 0.234567891 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
  }
  await page.addInitScript((input) => {
    localStorage.setItem('bentwood.design.v1', JSON.stringify(input))
  }, design)
  await page.goto('/')
  await page.getByRole('button', { name: 'Flat outline', exact: true }).click()
  for (const label of [
    'Selected point X in millimeters',
    'Selected point Y in millimeters',
    'Corner radius in millimeters',
  ]) {
    const field = page.getByLabel(label, { exact: true })
    await field.focus()
    await field.press('Tab')
  }
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save project file', exact: true }).click()
  const file = await pending
  const saved = JSON.parse(await readFile((await file.path())!, 'utf8')).sheets[0].design
  expect(saved.customOutline).toEqual(design.customOutline)
  expect(saved.outlineCornerRadius).toBe(design.outlineCornerRadius)
  await expect(page.getByRole('button', { name: 'Undo (⌘ / Ctrl Z)', exact: true })).toBeDisabled()
})
