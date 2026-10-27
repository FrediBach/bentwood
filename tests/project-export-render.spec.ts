import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { defaultDesign, getPanelWidth, pathLength } from '../src/lib/geometry'
import { createProject, defaultPlacement } from '../src/lib/project'
import type { Design } from '../src/lib/types'

for (const mixed of [false, true]) {
  test(`downloaded all-sheet SVG renders every ${mixed ? 'independent' : 'identical'} sheet`, async ({
    page,
  }) => {
    const project = createProject()
    project.name = 'Render all sheets'
    const additional: Partial<Design>[] = mixed
      ? [
          { name: 'Walnut circle', outline: 'circle', material: 'walnut' },
          {
            name: 'Honeycomb custom shape',
            outline: 'custom',
            pattern: 'honeycomb',
            spacing: 2.4,
            bridge: 6.56,
            cutLength: 19.68,
            customOutline: [
              { x: 0, y: 0 },
              { x: 1, y: 0 },
              { x: 1, y: 1 },
              { x: 0, y: 0.5 },
            ],
          },
        ]
      : [{}]
    for (const [index, changes] of additional.entries()) {
      project.sheets.push({
        id: `additional-${index}`,
        design: { ...structuredClone(defaultDesign), ...changes },
        // Even identical sheets at identical assembly positions need separate laser cuts.
        placement: { ...defaultPlacement },
      })
    }
    await page.goto('/')
    await page.getByLabel('Import project file').setInputFiles({
      name: 'render.bentwood.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(project)),
    })
    await expect(
      page.getByRole('tablist', { name: 'Sheets', exact: true }).getByRole('tab'),
    ).toHaveCount(project.sheets.length)
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    await page.getByRole('radio', { name: /All sheets/ }).check()
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download SVG', exact: true }).click()
    const file = await pending
    expect(file.suggestedFilename()).toBe('render-all-sheets-all-sheets.svg')
    const source = await readFile((await file.path())!, 'utf8')

    // Open the actual bytes with Chromium's SVG renderer, independent of the exporter.
    await page.route('**/audit-download.svg', (route) =>
      route.fulfill({ contentType: 'image/svg+xml', body: source }),
    )
    await page.goto('/audit-download.svg')
    await expect(page.locator('parsererror')).toHaveCount(0)
    const geometry = await page.evaluate(() => {
      const svg = document.documentElement as unknown as SVGSVGElement
      const inverse = svg.getScreenCTM()!.inverse()
      const contours = [...svg.querySelectorAll<SVGPathElement>('#outer-contour path')].map(
        (path) => {
          const box = path.getBBox()
          const matrix = inverse.multiply(path.getScreenCTM()!)
          const a = new DOMPoint(box.x, box.y).matrixTransform(matrix)
          const b = new DOMPoint(box.x + box.width, box.y + box.height).matrixTransform(matrix)
          return {
            x: Math.min(a.x, b.x),
            y: Math.min(a.y, b.y),
            width: Math.abs(b.x - a.x),
            height: Math.abs(b.y - a.y),
            screenX: path.getBoundingClientRect().x,
            stroke: getComputedStyle(path).stroke,
            fill: getComputedStyle(path).fill,
          }
        },
      )
      return {
        contours,
        cuts: [...svg.querySelectorAll('[id$="-hinge-cuts"]')].map(
          (group) => group.querySelectorAll('path').length,
        ),
        width: svg.viewBox.baseVal.width,
        height: svg.viewBox.baseVal.height,
        naturalPixelWidth: svg.getBoundingClientRect().width,
        viewportWidth: innerWidth,
      }
    })
    expect(geometry.contours).toHaveLength(project.sheets.length)
    const height = Math.max(...project.sheets.map(({ design }) => getPanelWidth(design)))
    let offset = 0
    for (const [index, sheet] of project.sheets.entries()) {
      const contour = geometry.contours[index]
      const length = pathLength(sheet.design.segments)
      const width = getPanelWidth(sheet.design)
      expect(contour.x).toBeCloseTo(offset, 3)
      expect(contour.y).toBeCloseTo(height - width, 3)
      expect(contour.width).toBeCloseTo(length, 3)
      expect(contour.height).toBeCloseTo(width, 3)
      expect(contour.stroke).toBe('rgb(255, 0, 0)')
      expect(contour.fill).toBe('none')
      expect(geometry.cuts[index]).toBeGreaterThan(0)
      offset += length + 10
    }
    expect(geometry.width).toBeCloseTo(offset - 10, 3)
    expect(geometry.height).toBeCloseTo(height, 3)
    // Millimetres remain 1:1; a standalone browser may initially show only the left portion.
    expect(geometry.naturalPixelWidth).toBeGreaterThan(geometry.viewportWidth)
    await test.info().attach('rendered-svg-geometry', {
      body: JSON.stringify(geometry, null, 2),
      contentType: 'application/json',
    })

    // Fit only the test viewer, leaving the downloaded manufacturing dimensions unchanged.
    await page.evaluate(() => {
      const svg = document.documentElement as unknown as SVGSVGElement
      svg.style.width = '100vw'
      svg.style.height = 'auto'
      // Manufacturing hairlines are subpixel at this zoom; emphasize them for visual QA.
      for (const path of svg.querySelectorAll('path')) {
        path.style.strokeWidth = '0.75px'
        path.style.vectorEffect = 'non-scaling-stroke'
      }
    })
    await page.screenshot({
      path: `/private/tmp/bentwood-svg-${mixed ? 'mixed' : 'identical'}.png`,
    })
  })
}
