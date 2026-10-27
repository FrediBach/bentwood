import { createGeometryProcessor } from './geometry-processor'
import type { GeometryRequest, GeometryResponse } from './geometry-jobs'

const process = createGeometryProcessor()
self.onmessage = (event: MessageEvent<GeometryRequest>) => {
  const { id, job } = event.data
  let response: GeometryResponse
  try {
    response = { id, ok: true, result: process(job) }
  } catch (error) {
    response = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : 'The design could not be processed.',
    }
  }
  // Keep the bounded worker cache intact and transfer a copy of its large buffers.
  // The browser receives ownership without another typed-array copy on the UI thread.
  const transfer: ArrayBuffer[] = []
  if (response.ok && typeof response.result !== 'string') {
    const geometry = response.result.geometry
    const copy = <T extends Float64Array | Float32Array | Uint32Array>(values: T): T => {
      const result = values.slice() as T
      transfer.push(result.buffer as ArrayBuffer)
      return result
    }
    const mesh = (data: typeof geometry.faces) => ({
      vertices: copy(data.vertices),
      uvs: copy(data.uvs),
      sampleIndices: copy(data.sampleIndices),
    })
    response = {
      ...response,
      result: {
        plan: response.result.plan,
        geometry: {
          faces: mesh(geometry.faces),
          edges: mesh(geometry.edges),
          cuts: mesh(geometry.cuts),
          lines: copy(geometry.lines),
          lineSampleIndices: copy(geometry.lineSampleIndices),
          distances: copy(geometry.distances),
          detailedCuts: geometry.detailedCuts,
        },
      },
    }
  }
  self.postMessage(response, { transfer })
}
