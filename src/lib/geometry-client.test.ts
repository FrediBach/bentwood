import { describe, expect, it, vi } from 'vitest'
import { GeometryClient } from './geometry-client'
import { defaultDesign } from './geometry'
import { createProject } from './project'
import type { GeometryRequest, GeometryResponse } from './geometry-jobs'

class FakeWorker {
  onmessage: ((event: MessageEvent<GeometryResponse>) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onmessageerror: (() => void) | null = null
  postMessage = vi.fn<(request: GeometryRequest) => void>()
  terminate = vi.fn()
  respond(response: GeometryResponse) {
    this.onmessage?.({ data: response } as MessageEvent<GeometryResponse>)
  }
}
const setup = () => {
  const worker = new FakeWorker()
  return { worker, client: new GeometryClient(() => worker as unknown as Worker) }
}

describe('geometry worker scheduling', () => {
  it('coalesces whole-assembly previews and prioritizes whole-project downloads', async () => {
    const { worker, client } = setup()
    const project = createProject()
    const active = client.prepareAssembly(project, true)
    const stale = client.prepareAssembly(project, false).catch((error) => error)
    const latest = client.prepareAssembly(project, true)
    const download = client.exportProject(project, 'svg')
    expect((await stale).name).toBe('AbortError')
    worker.respond({ id: 1, ok: true, result: { sheets: [], intersections: [], warnings: [] } })
    await active
    expect(worker.postMessage.mock.calls[1][0].job.kind).toBe('export-project')
    worker.respond({ id: 4, ok: true, result: 'project export' })
    await expect(download).resolves.toBe('project export')
    expect(worker.postMessage.mock.calls[2][0].job.kind).toBe('prepare-assembly')
    worker.respond({ id: 3, ok: true, result: { sheets: [], intersections: [], warnings: [] } })
    await latest
    client.dispose()
  })

  it('discards a stale queued preview before a replacement finishes debouncing', async () => {
    const { worker, client } = setup()
    const active = client.prepare(defaultDesign, true)
    const stale = client.prepare({ ...defaultDesign, width: 180 }, true).catch((e) => e)
    client.cancelPendingPreview()
    expect((await stale).name).toBe('AbortError')
    worker.respond({ id: 1, ok: true, result: 'active' })
    await active
    expect(worker.postMessage).toHaveBeenCalledTimes(1)
    client.dispose()
  })
  it('keeps just the latest pending preview and prioritizes a captured download', async () => {
    const { worker, client } = setup()
    const first = client.prepare(defaultDesign, true)
    const replaced = client.prepare({ ...defaultDesign, width: 150 }, true).catch((e) => e)
    const latestDesign = { ...defaultDesign, width: 160 }
    const latest = client.prepare(latestDesign, false)
    const savedDesign = { ...defaultDesign, width: 155 }
    const download = client.export(savedDesign, 'svg')
    expect(worker.postMessage).toHaveBeenCalledTimes(1)
    expect((await replaced).name).toBe('AbortError')
    worker.respond({ id: 1, ok: true, result: 'first' })
    await first
    expect(worker.postMessage.mock.calls[1][0].job).toEqual({
      kind: 'export',
      design: savedDesign,
      format: 'svg',
    })
    worker.respond({ id: 4, ok: true, result: 'download' })
    await expect(download).resolves.toBe('download')
    expect(worker.postMessage.mock.calls[2][0].job).toEqual({
      kind: 'prepare',
      design: latestDesign,
      showCuts: false,
    })
    worker.respond({ id: 3, ok: true, result: 'latest' })
    await latest
    client.dispose()
  })

  it('rejects failed jobs without blocking later jobs', async () => {
    const { worker, client } = setup()
    const invalid = client.export(defaultDesign, 'svg')
    const next = client.export(defaultDesign, 'bend-path')
    const rejected = expect(invalid).rejects.toThrow('laser kerf')
    worker.respond({ id: 1, ok: false, error: 'laser kerf' })
    await rejected
    worker.respond({ id: 2, ok: true, result: 'bend path' })
    await expect(next).resolves.toBe('bend path')
    client.dispose()
  })

  it('recovers after a worker failure and rejects pending work on disposal', async () => {
    const { worker, client } = setup()
    const active = client.prepare(defaultDesign, true).catch((e) => e)
    const queued = client.export(defaultDesign, 'svg').catch((e) => e)
    worker.onerror?.(new Event('error'))
    expect((await active).message).toContain('retry')
    expect((await queued).message).toContain('retry')
    expect(worker.terminate).toHaveBeenCalledOnce()
    const retry = client.prepare(defaultDesign, true)
    // A late response from the failed request must not resolve the retry.
    worker.respond({ id: 1, ok: true, result: 'old' })
    worker.respond({ id: 3, ok: true, result: 'new' })
    await expect(retry).resolves.toBe('new')
    const pending = client.prepare(defaultDesign, true).catch((e) => e)
    client.dispose()
    expect((await pending).name).toBe('AbortError')
    await expect(client.export(defaultDesign, 'svg')).rejects.toHaveProperty('name', 'AbortError')
  })

  it('reports startup and message decoding failures', async () => {
    const broken = new GeometryClient(() => {
      throw new Error('Worker unavailable')
    })
    await expect(broken.prepare(defaultDesign, true)).rejects.toThrow('Worker unavailable')
    broken.dispose()
    const { worker, client } = setup()
    const pending = client.prepare(defaultDesign, true)
    const rejected = expect(pending).rejects.toThrow('could not be read')
    worker.onmessageerror?.()
    await rejected
    client.dispose()
  })
})
