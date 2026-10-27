import { ShapeUtils, Vector2 } from 'three'
import { getCutPoints } from './cut-path'
import { createPathSampler, segmentLength } from './geometry'
import { createPanelSurface } from './panel-surface'
import type { CutPlan, Point, Segment } from './types'
import { woodTextureSize } from './wood-texture'

export type PreviewMesh = {
  /** Flat sheet x, y, and signed thickness multiplier for each vertex. */
  vertices: Float64Array
  uvs: Float32Array
  sampleIndices: Uint32Array
}

export type PreviewGeometry = {
  faces: PreviewMesh
  edges: PreviewMesh
  cuts: PreviewMesh
  lines: Float64Array
  lineSampleIndices: Uint32Array
  distances: Float64Array
  detailedCuts: boolean
}

function canRenderDetailedCuts(plan: CutPlan) {
  if (plan.cuts.length > 2500) return false
  let segments = 0
  for (const cut of plan.cuts) {
    segments += Math.max(0, getCutPoints(cut).length - 1)
    if (segments > 20000) return false
  }
  return true
}

function canRenderCutoutVoids(plan: CutPlan) {
  if (!plan.cutouts || plan.cutouts.length > 2500) return false
  return plan.cutouts.reduce((count, points) => count + points.length, 0) <= 20000
}

/** Subtraction, triangulation, and subdivision run once per flat shape, in the worker. */
export function createPreviewGeometry(
  plan: CutPlan,
  kerf: number,
  showCuts: boolean,
): PreviewGeometry {
  const detailedCuts = canRenderDetailedCuts(plan)
  const surface =
    plan.outline.length < 3
      ? { polygons: [], boundaries: [] }
      : createPanelSurface(
          plan.outline,
          showCuts && detailedCuts ? plan.cuts : [],
          kerf,
          showCuts && (detailedCuts || canRenderCutoutVoids(plan)) ? plan.cutouts : [],
        )
  const faceVertices: number[] = []
  const faceUVs: number[] = []
  const edgeVertices: number[] = []
  const edgeUVs: number[] = []
  const cutVertices: number[] = []
  const cutUVs: number[] = []
  const lineVertices: number[] = []
  const maximumStep = Math.max(1, plan.length / 280)
  const pushTriangle = (a: Point, b: Point, c: Point, depth = 0) => {
    const ab = Math.abs(a.x - b.x)
    const bc = Math.abs(b.x - c.x)
    const ca = Math.abs(c.x - a.x)
    const longest = Math.max(ab, bc, ca)
    if (longest > maximumStep && depth < 14) {
      if (longest === ab) {
        const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        pushTriangle(a, midpoint, c, depth + 1)
        pushTriangle(midpoint, b, c, depth + 1)
      } else if (longest === bc) {
        const midpoint = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 }
        pushTriangle(a, b, midpoint, depth + 1)
        pushTriangle(a, midpoint, c, depth + 1)
      } else {
        const midpoint = { x: (c.x + a.x) / 2, y: (c.y + a.y) / 2 }
        pushTriangle(a, b, midpoint, depth + 1)
        pushTriangle(midpoint, b, c, depth + 1)
      }
      return
    }
    // Subdivide once for both faces; preserve the back face's reversed winding.
    for (const point of [a, b, c]) {
      faceVertices.push(point.x, point.y, 1)
      faceUVs.push(point.x / woodTextureSize.length, point.y / woodTextureSize.width)
    }
    for (const point of [c, b, a]) {
      faceVertices.push(point.x, point.y, -1)
      faceUVs.push(point.x / woodTextureSize.length, point.y / woodTextureSize.width)
    }
  }
  for (const polygon of surface.polygons) {
    const contour = polygon.contour.map((point) => new Vector2(point.x, point.y))
    const holes = polygon.holes.map((ring) => ring.map((point) => new Vector2(point.x, point.y)))
    const faces = ShapeUtils.triangulateShape(contour, holes)
    const vertices = [...contour, ...holes.flat()]
    for (const [a, b, c] of faces) pushTriangle(vertices[a], vertices[b], vertices[c])
  }
  let perimeterDistance = 0
  for (const { start: a, end: b, kind } of surface.boundaries) {
    const vertices = kind === 'outer' ? edgeVertices : cutVertices
    const uvs = kind === 'outer' ? edgeUVs : cutUVs
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    const steps = Math.max(1, Math.ceil(Math.abs(b.x - a.x) / maximumStep))
    for (let step = 0; step < steps; step++) {
      const start = step / steps
      const end = (step + 1) / steps
      const px = a.x + (b.x - a.x) * start
      const py = a.y + (b.y - a.y) * start
      const qx = a.x + (b.x - a.x) * end
      const qy = a.y + (b.y - a.y) * end
      vertices.push(px, py, 1, px, py, -1, qx, qy, 1, qx, qy, 1, px, py, -1, qx, qy, -1)
      const u = (perimeterDistance + length * start) / 64
      const v = (perimeterDistance + length * end) / 64
      uvs.push(u, 1, u, 0, v, 1, v, 1, u, 0, v, 0)
    }
    perimeterDistance += length
  }
  if (showCuts && !detailedCuts) {
    for (const cut of plan.cuts) {
      const points = getCutPoints(cut)
      for (const side of [-1.01, 1.01]) {
        for (let index = 1; index < points.length; index++) {
          const a = points[index - 1]
          const b = points[index]
          lineVertices.push(a.x, a.y, side, b.x, b.y, side)
        }
      }
    }
  }
  const distances: number[] = []
  const sampleLookup = new Map<number, number>()
  const sampleIndices = (vertices: number[]) => {
    const indices = new Uint32Array(vertices.length / 3)
    for (let i = 0; i < indices.length; i++) {
      const distance = vertices[i * 3]
      let index = sampleLookup.get(distance)
      if (index === undefined) {
        index = distances.length
        sampleLookup.set(distance, index)
        distances.push(distance)
      }
      indices[i] = index
    }
    return indices
  }
  const mesh = (vertices: number[], uvs: number[]): PreviewMesh => ({
    vertices: new Float64Array(vertices),
    uvs: new Float32Array(uvs),
    sampleIndices: sampleIndices(vertices),
  })
  const faces = mesh(faceVertices, faceUVs)
  const edges = mesh(edgeVertices, edgeUVs)
  const cuts = mesh(cutVertices, cutUVs)
  const lineSampleIndices = sampleIndices(lineVertices)
  return {
    faces,
    edges,
    cuts,
    lines: new Float64Array(lineVertices),
    lineSampleIndices,
    distances: new Float64Array(distances),
    detailedCuts,
  }
}

/** The mapper shares samples across all meshes and writes directly into existing GPU buffers. */
export function createPreviewMapper(
  segments: Segment[],
  bend: number,
  thickness: number,
  distances: Float64Array,
) {
  const bentSegments = segments.map((segment): Segment => {
    if (segment.type === 'straight') return segment
    if (bend < 0.0001) return { id: segment.id, type: 'straight', length: segmentLength(segment) }
    return { ...segment, angle: segment.angle * bend, radius: segment.radius / bend }
  })
  const sample = createPathSampler(bentSegments)
  const samples = new Float64Array(distances.length * 4)
  for (let i = 0; i < distances.length; i++) {
    const path = sample(distances[i])
    samples[i * 4] = path.x
    samples[i * 4 + 1] = path.y
    samples[i * 4 + 2] = -Math.sin(path.angle) * thickness * 0.5
    samples[i * 4 + 3] = Math.cos(path.angle) * thickness * 0.5
  }
  return (vertices: Float64Array, positions: Float32Array, indices: Uint32Array) => {
    for (let i = 0, vertex = 0; i < vertices.length; i += 3, vertex++) {
      const offset = indices[vertex] * 4
      positions[i] = samples[offset] + samples[offset + 2] * vertices[i + 2]
      positions[i + 1] = vertices[i + 1]
      positions[i + 2] = samples[offset + 1] + samples[offset + 3] * vertices[i + 2]
    }
  }
}
