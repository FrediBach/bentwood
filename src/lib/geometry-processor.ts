import { createCutPlan, exportBendPathSVG, exportDXF, exportSVG } from './geometry'
import { geometryKey, topologyKey, type GeometryJob } from './geometry-jobs'
import { createPreviewGeometry, type PreviewGeometry } from './preview-geometry'
import { exportTestSwatchesSVG } from './test-swatches'
import type { CutPlan } from './types'

/** Worker-local, bounded caches. Manufacturing exports always use the full design. */
export function createGeometryProcessor() {
  let planKey = ''
  let plan: CutPlan | undefined
  let meshKey = ''
  const meshes = new Map<boolean, PreviewGeometry>()
  return (job: GeometryJob) => {
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
    const nextPlanKey = geometryKey(job.design)
    if (!plan || planKey !== nextPlanKey) {
      plan = createCutPlan(job.design)
      planKey = nextPlanKey
    }
    const nextMeshKey = topologyKey(job.design)
    if (meshKey !== nextMeshKey) {
      meshes.clear()
      meshKey = nextMeshKey
    }
    let geometry = meshes.get(job.showCuts)
    if (!geometry) {
      geometry = createPreviewGeometry(plan, job.design.kerf, job.showCuts)
      meshes.set(job.showCuts, geometry)
    }
    return { plan, geometry }
  }
}
