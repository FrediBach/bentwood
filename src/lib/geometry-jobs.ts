import type { SheetIntersection } from './sheet-intersections'
import type { PreviewGeometry } from './preview-geometry'
import type { CutPlan, Design, Project, Sheet } from './types'

export type ExportFormat = 'svg' | 'dxf' | 'bend-path' | 'swatches'
export type ProjectExportFormat = Exclude<ExportFormat, 'swatches'>
export type GeometryJob =
  | { kind: 'prepare'; design: Design; showCuts: boolean }
  | { kind: 'prepare-assembly'; project: Project; showCuts: boolean }
  | { kind: 'export'; design: Design; format: ExportFormat }
  | { kind: 'export-project'; project: Project; format: ProjectExportFormat }
export type PreparedGeometry = { plan: CutPlan; geometry: PreviewGeometry }
export type PreparedSheet = PreparedGeometry & Sheet
export type PreparedAssembly = {
  sheets: PreparedSheet[]
  intersections: SheetIntersection[]
  warnings: string[]
}
export type GeometryResult = PreparedGeometry | PreparedAssembly | string
export type GeometryRequest = { id: number; job: GeometryJob }
export type GeometryResponse =
  { id: number; ok: true; result: GeometryResult } | { id: number; ok: false; error: string }

/** Appearance and naming never change cut geometry or manufacturing warnings. */
export function geometryKey(design: Design) {
  const { name: _name, material: _material, ...geometry } = design
  return JSON.stringify(geometry)
}

/** Thickness changes bend warnings, but not flat mesh topology. */
export function topologyKey(design: Design) {
  return geometryKey({ ...design, thickness: 0 })
}

export function assemblyKey(project: Project) {
  return JSON.stringify(
    project.sheets.map((sheet) => [sheet.id, geometryKey(sheet.design), sheet.placement]),
  )
}
