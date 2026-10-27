import type { WoodMaterial } from './wood-materials'

export type Point = { x: number; y: number }
export type Segment =
  | { id: string; type: 'straight'; length: number }
  | { id: string; type: 'arc'; radius: number; angle: number }
export type OutlineKind = 'rectangle' | 'square' | 'ellipse' | 'circle' | 'triangle' | 'custom'
export type HingePattern = 'classic' | 'graded' | 'wave' | 'zigzag' | 'honeycomb' | 'meander'
export type Design = {
  version: 4
  name: string
  segments: Segment[]
  outline: OutlineKind
  width: number
  customOutline: Point[]
  outlineCornerRadius: number
  thickness: number
  material: WoodMaterial
  spacing: number
  bridge: number
  cutLength: number
  kerf: number
  pattern: HingePattern
  honeycombRoundness: number
  honeycombWidth: number
  meanderOverlap: number
}
/** Assembly coordinates in millimetres; rotation is degrees around the vertical Y axis. */
export type SheetPlacement = { x: number; y: number; z: number; rotation: number }
export type Sheet = { id: string; design: Design; placement: SheetPlacement }
export type Project = { version: 5; name: string; sheets: Sheet[] }
// Straight cuts retain a compact representation. For shaped cuts, x identifies
// the column and points contains the actual, clipped laser centre line.
export type CutLine = {
  x: number
  y1: number
  y2: number
  points?: Point[]
  closed?: boolean
  // Open meanders need the round laser footprint at their overlapping tips.
  roundCaps?: boolean
}
export type PathSample = { x: number; y: number; angle: number; s: number; curved: boolean }
export type CutPlan = {
  length: number
  width: number
  outline: Point[]
  cuts: CutLine[]
  // Nominal removed areas, distinct from clipped toolpaths. Boundary cutouts
  // can extend outside the sheet; subtraction clips them to the actual panel.
  cutouts?: Point[][]
  cutLength: number
  warnings: string[]
}
