import { chromium } from '@playwright/test'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'

// Render the live plywood component in a social card, so the image always matches
// the actual material, kerf geometry, and brand mark shipped with the application.
const root = fileURLToPath(new URL('../', import.meta.url))
const destination = fileURLToPath(new URL('../public/og-image.png', import.meta.url))
const server = await createServer({
  root,
  server: { host: '127.0.0.1', port: 5176, strictPort: false, open: false },
})
let browser

try {
  await server.listen()
  const address = server.httpServer.address()
  if (!address || typeof address === 'string')
    throw new Error('Preview server did not open a port.')

  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'networkidle' })
  await page.locator('.plywood-preview canvas').waitFor({ state: 'visible' })
  if (await page.getByText('3D preview needs WebGL').count())
    throw new Error('WebGL is required to render the OG image.')

  await page.evaluate(() => {
    const preview = document.querySelector('.plywood-preview')
    const logo = document.querySelector('.brand > svg')
    const application = document.querySelector('.app-shell')
    if (!preview || !logo || !application)
      throw new Error('The studio or brand mark could not be found.')

    const style = document.createElement('style')
    style.textContent = `
      html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #fbf6ea; }
      .og-card { position: absolute; inset: 0; width: 1200px; height: 630px; overflow: hidden; background: #fbf6ea; color: #4a3025; font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif; }
      .og-preview { position: absolute; left: 545px; top: -15px; width: 675px; height: 645px; }
      .og-blend { position: absolute; z-index: 1; left: 543px; top: 0; width: 145px; height: 630px; background: linear-gradient(90deg, #fbf6ea, rgba(251,246,234,.92) 22%, rgba(251,246,234,0)); pointer-events: none; }
      .og-top-blend { position: absolute; z-index: 1; left: 545px; top: 0; width: 655px; height: 100px; background: linear-gradient(#fbf6ea, rgba(251,246,234,0)); pointer-events: none; }
      .og-brand { position: absolute; z-index: 2; top: 53px; left: 62px; display: flex; align-items: center; gap: 13px; color: #4a3025; }
      .og-brand svg { display: block; width: 49px; height: 49px; }
      .og-wordmark { font-size: 40px; font-weight: 650; line-height: 1; letter-spacing: -2px; }
      .og-title { position: absolute; z-index: 2; left: 62px; top: 181px; margin: 0; font-size: 59px; font-weight: 550; line-height: 1.04; letter-spacing: -3.2px; }
      .og-description { position: absolute; z-index: 2; left: 65px; top: 339px; margin: 0; font-size: 21px; font-weight: 400; line-height: 1.55; letter-spacing: -.35px; color: #715b4b; }
      .og-label { position: absolute; z-index: 2; left: 65px; top: 435px; display: flex; align-items: center; gap: 10px; font-size: 12px; font-weight: 550; letter-spacing: 1px; color: #6d5643; }
      .og-label span { border: 1px solid #d6c6ac; border-radius: 5px; padding: 9px 12px; background: #f6eddb; }
      .og-footer { position: absolute; z-index: 2; left: 65px; bottom: 47px; display: flex; align-items: center; gap: 14px; font-size: 19px; font-weight: 550; letter-spacing: -.4px; }
      .og-footer svg { width: 17px; height: 17px; }
      .og-studio { position: absolute; z-index: 2; right: 42px; bottom: 45px; color: #6b5949; font-size: 10px; letter-spacing: 1.7px; font-weight: 550; }
    `
    document.head.append(style)
    const card = document.createElement('main')
    card.className = 'og-card'
    card.innerHTML = `
      <div class="og-preview"></div>
      <div class="og-blend"></div><div class="og-top-blend"></div>
      <div class="og-brand"><span class="og-wordmark">bentwood.</span></div>
      <h1 class="og-title">Flat wood.<br>New possibilities.</h1>
      <p class="og-description">Design bent plywood.<br>Export your laser cut plan.</p>
      <div class="og-label"><span>3D PREVIEW</span><span>SVG + DXF</span></div>
      <div class="og-footer">bentwood.app<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div>
      <div class="og-studio">THE BENDING STUDIO</div>
    `
    card.querySelector('.og-brand').prepend(logo.cloneNode(true))
    card.querySelector('.og-preview').append(preview)
    document.body.append(card)
    application.style.display = 'none'
    window.dispatchEvent(new Event('resize'))
  })
  // Refit after ResizeObserver has measured the standalone card's scene.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
  await page.locator('[aria-label="Reset camera"]').evaluate((button) => button.click())
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
  await page.evaluate(() => document.fonts.ready)
  if (errors.length) throw new Error(`The studio could not render cleanly: ${errors.join('; ')}`)
  await page.locator('.og-card').screenshot({ path: destination, animations: 'disabled' })
  console.log(`Wrote ${destination} (1200 × 630 PNG).`)
} finally {
  await browser?.close()
  await server.close()
}
