import type { PreviewGeometry } from './preview-geometry'
import type { CutPlan, Design } from './types'

export type ExportFormat = 'svg' | 'dxf' | 'bend-path' | 'swatches'
export type GeometryJob =
  | { kind: 'prepare'; design: Design; showCuts: boolean }
  | { kind: 'export'; design: Design; format: ExportFormat }
export type PreparedGeometry = { plan: CutPlan; geometry: PreviewGeometry }
export type GeometryRequest = { id: number; job: GeometryJob }
export type GeometryResponse =
  | { id: number; ok: true; result: PreparedGeometry | string }
  | { id: number; ok: false; error: string }

/** Appearance and naming never change cut geometry or manufacturing warnings. */
export function geometryKey(design: Design) {
  const { name: _name, material: _material, ...geometry } = design
  return JSON.stringify(geometry)
}

/** Thickness changes bend warnings, but not flat mesh topology. */
export function topologyKey(design: Design) {
  return geometryKey({ ...design, thickness: 0 })
}
