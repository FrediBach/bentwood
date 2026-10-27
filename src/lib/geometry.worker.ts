import { createGeometryProcessor } from './geometry-processor'
import type { GeometryRequest, GeometryResponse } from './geometry-jobs'
import type { PreviewGeometry } from './preview-geometry'

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
  const transfer: ArrayBuffer[] = []
  const copy = <T extends Float64Array | Float32Array | Uint32Array>(values: T): T => {
    const result = values.slice() as T
    transfer.push(result.buffer as ArrayBuffer)
    return result
  }
  const mesh = (data: PreviewGeometry['faces']) => ({
    vertices: copy(data.vertices),
    uvs: copy(data.uvs),
    sampleIndices: copy(data.sampleIndices),
  })
  const copies = new Map<PreviewGeometry, PreviewGeometry>()
  const copyGeometry = (geometry: PreviewGeometry): PreviewGeometry => {
    const previous = copies.get(geometry)
    if (previous) return previous
    const copied = {
      faces: mesh(geometry.faces),
      edges: mesh(geometry.edges),
      cuts: mesh(geometry.cuts),
      lines: copy(geometry.lines),
      lineSampleIndices: copy(geometry.lineSampleIndices),
      distances: copy(geometry.distances),
      detailedCuts: geometry.detailedCuts,
    }
    copies.set(geometry, copied)
    return copied
  }
  if (response.ok && typeof response.result !== 'string') {
    const result = response.result
    response = {
      ...response,
      result:
        'sheets' in result
          ? {
              ...result,
              sheets: result.sheets.map((sheet) => ({
                ...sheet,
                geometry: copyGeometry(sheet.geometry),
              })),
            }
          : { ...result, geometry: copyGeometry(result.geometry) },
    }
  }
  self.postMessage(response, { transfer })
}
