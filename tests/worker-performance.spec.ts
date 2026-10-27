import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { defaultDesign, exportSVG } from '../src/lib/geometry'

type Harness = {
  hold: boolean
  requests: { kind: string; design: typeof defaultDesign; format?: string }[]
  pending: (() => void)[]
  release: () => void
}
type TestWindow = Window & { geometryHarness: Harness }

async function observeWorker(page: Page) {
  await page.addInitScript(() => {
    const state: Harness = {
      hold: false,
      requests: [],
      pending: [],
      release() {
        for (const deliver of state.pending.splice(0)) deliver()
      },
    }
    ;(window as TestWindow).geometryHarness = state
    const NativeWorker = window.Worker
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options)
        const post = this.postMessage.bind(this)
        this.postMessage = (message, transfer: Transferable[] = []) => {
          state.requests.push(message.job)
          post(message, transfer)
        }
        let handler: Worker['onmessage'] = null
        Object.defineProperty(this, 'onmessage', {
          get: () => handler,
          set: (value) => {
            handler = value
          },
        })
        this.addEventListener('message', (event) => {
          const deliver = () => handler?.call(this, event)
          if (state.hold) state.pending.push(deliver)
          else deliver()
        })
      }
    }
  })
}

const ready = (page: Page) =>
  expect(page.locator('[data-geometry-state]')).toHaveAttribute('data-geometry-state', 'ready')

test('inputs stay editable during work and stale results never replace the latest design', async ({
  page,
}) => {
  await observeWorker(page)
  await page.goto('/')
  await ready(page)
  const initial = await page.evaluate(() => (window as TestWindow).geometryHarness.requests.length)
  await page.evaluate(() => {
    ;(window as TestWindow).geometryHarness.hold = true
  })
  const radius = page.getByRole('spinbutton', { name: 'Radius' })
  await radius.fill('65')
  await radius.press('Tab')
  await expect
    .poll(() => page.evaluate(() => (window as TestWindow).geometryHarness.pending.length))
    .toBe(1)
  await radius.fill('75')
  await radius.press('Tab')
  await page.getByLabel('Project name').fill('Responsive while calculating')
  await page.getByLabel('Unfold').fill('25')
  await expect(page.getByText('25%', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Project name')).toHaveValue('Responsive while calculating')
  await expect(page.locator('[data-geometry-state]')).toHaveAttribute(
    'data-geometry-state',
    'updating',
  )
  await page.evaluate(() => (window as TestWindow).geometryHarness.release())
  await expect
    .poll(() => page.evaluate(() => (window as TestWindow).geometryHarness.pending.length))
    .toBe(1)
  // The first response was superseded while held; it must not claim the design is ready.
  await expect(page.locator('[data-geometry-state]')).toHaveAttribute(
    'data-geometry-state',
    'updating',
  )
  await page.evaluate(() => {
    const state = (window as TestWindow).geometryHarness
    state.hold = false
    state.release()
  })
  await ready(page)
  await expect(radius).toHaveValue('75')
  const requests = await page.evaluate(() => (window as TestWindow).geometryHarness.requests)
  expect(requests).toHaveLength(initial + 2)
  expect(requests.at(-1)!.design.segments[1]).toMatchObject({ radius: 75 })
  await page.getByRole('button', { name: 'Cut plan', exact: true }).click()
  await expect(page.locator('.cut-plan-view .cut-plan-svg')).toHaveAccessibleName(
    /Responsive while calculating/,
  )
})

test('a download captures current settings while the preview and further edits are pending', async ({
  page,
}) => {
  await observeWorker(page)
  await page.goto('/')
  await ready(page)
  await page.evaluate(() => {
    ;(window as TestWindow).geometryHarness.hold = true
  })
  const radius = page.getByRole('spinbutton', { name: 'Radius' })
  await radius.fill('70')
  await radius.press('Tab')
  await expect
    .poll(() => page.evaluate(() => (window as TestWindow).geometryHarness.pending.length))
    .toBe(1)
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download SVG', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Download SVG', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await radius.fill('80')
  await radius.press('Tab')
  await page.evaluate(() => {
    const state = (window as TestWindow).geometryHarness
    state.hold = false
    state.release()
  })
  const file = await downloaded
  const expectedDesign = {
    ...defaultDesign,
    segments: defaultDesign.segments.map((segment) =>
      segment.id === defaultDesign.segments[1].id ? { ...segment, radius: 70 } : segment,
    ),
  }
  expect(await readFile((await file.path())!, 'utf8')).toBe(exportSVG(expectedDesign))
  await ready(page)
  await expect(radius).toHaveValue('80')
})

test('worker startup failure remains editable and retry restores the preview', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker
    let first = true
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        if (first) {
          first = false
          throw new Error('Worker startup failed')
        }
        super(url, options)
      }
    }
  })
  await page.goto('/')
  await expect(page.getByText('Worker startup failed')).toBeVisible()
  await page.getByLabel('Project name').fill('Still editable')
  await page.getByRole('button', { name: 'Retry preview' }).click()
  await ready(page)
  await expect(page.locator('.plywood-preview canvas[data-preview-ready="true"]')).toBeVisible()
  await expect(page.getByLabel('Project name')).toHaveValue('Still editable')
  await page.screenshot({ path: 'test-results/worker-preview.png' })
})

test('background exports remain available without WebGL', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null
      return getContext.apply(this, [type, ...args] as Parameters<typeof getContext>)
    } as typeof getContext
  })
  await page.goto('/')
  await expect(page.getByText('3D preview needs WebGL')).toBeVisible()
  await page.getByRole('button', { name: 'Flat outline', exact: true }).click()
  await page.getByRole('button', { name: 'Triangle', exact: true }).click()
  await ready(page)
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download SVG', exact: true }).click()
  const file = await pending
  expect(await readFile((await file.path())!, 'utf8')).toBe(
    exportSVG({ ...defaultDesign, outline: 'triangle' }),
  )
})
