import { createPathSampler, pathLength } from './geometry'
import { createPreviewGeometry, createPreviewMapper } from './preview-geometry'
import type { CutPlan, Sheet } from './types'

type Vec = [number, number, number]
type Bounds = { min: Vec; max: Vec }
type Prism = { vertices: Vec[]; bounds: Bounds }
type Tree = { bounds: Bounds; left?: Tree; right?: Tree; prisms?: Prism[] }
export type SheetIntersection = { firstId: string; secondId: string }
export type IntersectionResult = { intersections: SheetIntersection[]; warnings: string[] }
type Input = Sheet & { plan: CutPlan }
const epsilon = 0.00001
const maximumChecks = 250_000
const maximumPrisms = 100_000
const tetrahedra = [
  [0, 1, 2, 3],
  [1, 2, 3, 4],
  [2, 3, 4, 5],
]
const edges = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
  [2, 3],
]
const faces = [
  [0, 1, 2],
  [0, 1, 3],
  [0, 2, 3],
  [1, 2, 3],
]
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const bounds = (vertices: Vec[]): Bounds => ({
  min: [0, 1, 2].map((axis) => Math.min(...vertices.map((v) => v[axis]))) as Vec,
  max: [0, 1, 2].map((axis) => Math.max(...vertices.map((v) => v[axis]))) as Vec,
})
function overlaps(a: Bounds, b: Bounds) {
  return [0, 1, 2].every(
    (axis) => a.max[axis] >= b.min[axis] - epsilon && b.max[axis] >= a.min[axis] - epsilon,
  )
}
function separated(a: Vec[], b: Vec[], axis: Vec) {
  const length = Math.hypot(...axis)
  if (length < 1e-12) return false
  const first = a.map((v) => dot(v, axis) / length)
  const second = b.map((v) => dot(v, axis) / length)
  return (
    Math.max(...first) < Math.min(...second) - epsilon ||
    Math.max(...second) < Math.min(...first) - epsilon
  )
}
function tetrahedraIntersect(a: Vec[], b: Vec[]) {
  for (const vertices of [a, b]) {
    for (const [i, j, k] of faces) {
      if (separated(a, b, cross(sub(vertices[j], vertices[i]), sub(vertices[k], vertices[i]))))
        return false
    }
  }
  for (const [i, j] of edges) {
    const first = sub(a[j], a[i])
    for (const [k, l] of edges) {
      if (separated(a, b, cross(first, sub(b[l], b[k])))) return false
    }
  }
  return true
}
function prismsIntersect(a: Prism, b: Prism) {
  if (!overlaps(a.bounds, b.bounds)) return false
  for (const first of tetrahedra) {
    const av = first.map((i) => a.vertices[i])
    for (const second of tetrahedra) {
      const bv = second.map((i) => b.vertices[i])
      if (overlaps(bounds(av), bounds(bv)) && tetrahedraIntersect(av, bv)) return true
    }
  }
  return false
}
function buildTree(prisms: Prism[]): Tree {
  const box: Bounds = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  }
  for (const prism of prisms) {
    for (let axis = 0; axis < 3; axis++) {
      box.min[axis] = Math.min(box.min[axis], prism.bounds.min[axis])
      box.max[axis] = Math.max(box.max[axis], prism.bounds.max[axis])
    }
  }
  if (prisms.length <= 8) return { bounds: box, prisms }
  const axis = [0, 1, 2].reduce((largest, value) =>
    box.max[value] - box.min[value] > box.max[largest] - box.min[largest] ? value : largest,
  )
  prisms.sort(
    (a, b) => a.bounds.min[axis] + a.bounds.max[axis] - b.bounds.min[axis] - b.bounds.max[axis],
  )
  const midpoint = Math.floor(prisms.length / 2)
  return {
    bounds: box,
    left: buildTree(prisms.slice(0, midpoint)),
    right: buildTree(prisms.slice(midpoint)),
  }
}
function treesIntersect(a: Tree, b: Tree, budget: { remaining: number }): boolean {
  if (!overlaps(a.bounds, b.bounds)) return false
  if (--budget.remaining < 0) throw new Error('budget')
  if (a.prisms && b.prisms) {
    for (const first of a.prisms) {
      for (const second of b.prisms) {
        if (--budget.remaining < 0) throw new Error('budget')
        if (prismsIntersect(first, second)) return true
      }
    }
    return false
  }
  if (a.left && a.right)
    return treesIntersect(a.left, b, budget) || treesIntersect(a.right, b, budget)
  return treesIntersect(a, b.left!, budget) || treesIntersect(a, b.right!, budget)
}

/**
 * Fully bent solid-sheet volumes, with nominal cutout areas removed. Kerf slits
 * are deliberately ignored: they are not assembly clearance. The triangulated
 * volumes use the same subdivision and deformation as the preview.
 */
function sheetTree(sheet: Input, detailBudget: { remaining: number }) {
  const cutouts = sheet.plan.cutouts ?? []
  const simplified =
    cutouts.length > 2500 || cutouts.reduce((sum, ring) => sum + ring.length, 0) > 20000
  const geometry = createPreviewGeometry(
    { ...sheet.plan, cuts: [], cutouts: simplified ? [] : cutouts },
    0,
    true,
  )
  const prismCount = geometry.faces.vertices.length / 18
  if (prismCount > detailBudget.remaining) throw new Error('detail budget')
  detailBudget.remaining -= prismCount
  const positions = new Float32Array(geometry.faces.vertices.length)
  createPreviewMapper(
    sheet.design.segments,
    1,
    sheet.design.thickness,
    geometry.distances,
  )(geometry.faces.vertices, positions, geometry.faces.sampleIndices)
  const radians = (sheet.placement.rotation * Math.PI) / 180
  const c = Math.cos(radians)
  const s = Math.sin(radians)
  const vertex = (offset: number): Vec => [
    positions[offset] * c + positions[offset + 2] * s + sheet.placement.x,
    positions[offset + 1] + sheet.placement.y,
    -positions[offset] * s + positions[offset + 2] * c + sheet.placement.z,
  ]
  const prisms: Prism[] = []
  // Face topology stores a front triangle followed by its reversed back triangle.
  for (let offset = 0; offset < positions.length; offset += 18) {
    const vertices = [0, 3, 6, 15, 12, 9].map((index) => vertex(offset + index))
    prisms.push({ vertices, bounds: bounds(vertices) })
  }
  return { tree: buildTree(prisms), simplified }
}

// Conservative path bounds cost only 281 samples, even for complex cutout patterns.
// Half a sample interval bounds the distance to the nearest sample on any path.
function sheetBounds(sheet: Input): Bounds {
  const length = pathLength(sheet.design.segments)
  const sample = createPathSampler(sheet.design.segments)
  const radians = (sheet.placement.rotation * Math.PI) / 180
  const c = Math.cos(radians)
  const s = Math.sin(radians)
  const points: Vec[] = []
  for (let index = 0; index <= 280; index++) {
    const point = sample((length * index) / 280)
    points.push([
      point.x * c + point.y * s + sheet.placement.x,
      sheet.placement.y,
      -point.x * s + point.y * c + sheet.placement.z,
    ])
  }
  const box = bounds(points)
  const margin = length / 560 + sheet.design.thickness / 2
  for (const axis of [0, 2]) {
    box.min[axis] -= margin
    box.max[axis] += margin
  }
  box.min[1] += Math.min(...sheet.plan.outline.map((point) => point.y))
  box.max[1] += Math.max(...sheet.plan.outline.map((point) => point.y))
  return box
}

export function findSheetIntersections(sheets: Input[]): IntersectionResult {
  if (sheets.length < 2) return { intersections: [], warnings: [] }
  const boxes = sheets.map(sheetBounds)
  const solids = new Map<number, ReturnType<typeof sheetTree>>()
  const detailBudget = { remaining: maximumPrisms }
  const solid = (index: number) => {
    let result = solids.get(index)
    if (!result) {
      result = sheetTree(sheets[index], detailBudget)
      solids.set(index, result)
    }
    return result
  }
  const intersections: SheetIntersection[] = []
  const warnings: string[] = []
  const budget = { remaining: maximumChecks }
  try {
    for (let first = 0; first < sheets.length; first++) {
      for (let second = first + 1; second < sheets.length; second++) {
        if (!overlaps(boxes[first], boxes[second])) continue
        if (treesIntersect(solid(first).tree, solid(second).tree, budget))
          intersections.push({ firstId: sheets[first].id, secondId: sheets[second].id })
      }
    }
  } catch (error) {
    warnings.push(
      error instanceof Error && ['budget', 'detail budget'].includes(error.message)
        ? 'Some sheet intersection checks exceeded the detail limit. Check assembly clearance manually.'
        : 'Some sheet intersections could not be checked. Check assembly clearance manually.',
    )
  }
  if ([...solids.values()].some((result) => result.simplified))
    warnings.push(
      'Intersection checks use solid outlines for dense cutout patterns; inspect openings manually.',
    )
  return { intersections, warnings }
}
