import { createCutPlan, exportBendPathSVG, exportDXF, exportSVG } from './geometry'
import {
  assemblyKey,
  geometryKey,
  topologyKey,
  type GeometryJob,
  type PreparedSheet,
} from './geometry-jobs'
import { createPreviewGeometry, type PreviewGeometry } from './preview-geometry'
import { exportProject } from './project'
import { findSheetIntersections, type IntersectionResult } from './sheet-intersections'
import { exportTestSwatchesSVG } from './test-swatches'
import type { CutPlan, Design } from './types'

const meshBytes = (geometry: PreviewGeometry) =>
  [geometry.faces, geometry.edges, geometry.cuts].reduce(
    (sum, mesh) =>
      sum + mesh.vertices.byteLength + mesh.uvs.byteLength + mesh.sampleIndices.byteLength,
    geometry.lines.byteLength +
      geometry.lineSampleIndices.byteLength +
      geometry.distances.byteLength,
  )

/** Worker-local, bounded caches. Manufacturing exports always use the full design. */
export function createGeometryProcessor() {
  const plans = new Map<string, CutPlan>()
  const meshes = new Map<string, PreviewGeometry>()
  let cachedBytes = 0
  let collisionKey = ''
  let collisions: IntersectionResult = { intersections: [], warnings: [] }
  const prepare = (design: Design, showCuts: boolean) => {
    const planKey = geometryKey(design)
    let plan = plans.get(planKey)
    if (!plan) {
      plan = createCutPlan(design)
      plans.set(planKey, plan)
      if (plans.size > 16) plans.delete(plans.keys().next().value!)
    }
    const meshKey = `${showCuts}:${topologyKey(design)}`
    let geometry = meshes.get(meshKey)
    if (!geometry) {
      geometry = createPreviewGeometry(plan, design.kerf, showCuts)
      const bytes = meshBytes(geometry)
      // Large transient assemblies remain renderable without retaining their buffers twice.
      if (bytes <= 64 * 1024 * 1024) {
        while (meshes.size && (meshes.size >= 8 || cachedBytes + bytes > 64 * 1024 * 1024)) {
          const oldest = meshes.keys().next().value!
          cachedBytes -= meshBytes(meshes.get(oldest)!)
          meshes.delete(oldest)
        }
        meshes.set(meshKey, geometry)
        cachedBytes += bytes
      }
    } else {
      meshes.delete(meshKey)
      meshes.set(meshKey, geometry)
    }
    return { plan, geometry }
  }
  return (job: GeometryJob) => {
    if (job.kind === 'export-project') return exportProject(job.project, job.format)
    if (job.kind === 'export') {
      switch (job.format) {
        case 'svg':
          return exportSVG(job.design)
        case 'dxf':
          return exportDXF(job.design)
        case 'bend-path':
          return exportBendPathSVG(job.design)
        case 'swatches':
          return exportTestSwatchesSVG(job.design)
      }
    }
    if (job.kind === 'prepare-assembly') {
      const sheets: PreparedSheet[] = job.project.sheets.map((sheet) => ({
        ...sheet,
        ...prepare(sheet.design, job.showCuts),
      }))
      const key = assemblyKey(job.project)
      if (key !== collisionKey) {
        collisions = findSheetIntersections(sheets)
        collisionKey = key
      }
      return { sheets, ...collisions }
    }
    return prepare(job.design, job.showCuts)
  }
}
