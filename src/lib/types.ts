export type Point = { x: number; y: number }
export type Segment =
  | { id: string; type: 'straight'; length: number }
  | { id: string; type: 'arc'; radius: number; angle: number }
export type OutlineKind = 'rectangle' | 'square' | 'ellipse' | 'circle' | 'triangle' | 'custom'
export type HingePattern = 'classic' | 'graded' | 'wave' | 'zigzag'
export type Design = {
  version: 3
  name: string
  segments: Segment[]
  outline: OutlineKind
  width: number
  customOutline: Point[]
  thickness: number
  material: 'birch' | 'walnut' | 'basswood'
  spacing: number
  bridge: number
  cutLength: number
  kerf: number
  pattern: HingePattern
}
// Straight cuts retain a compact representation. For shaped cuts, x identifies
// the column and points contains the actual, clipped laser centre line.
export type CutLine = { x: number; y1: number; y2: number; points?: Point[] }
export type PathSample = { x: number; y: number; angle: number; s: number; curved: boolean }
export type CutPlan = {
  length: number
  width: number
  outline: Point[]
  cuts: CutLine[]
  cutLength: number
  warnings: string[]
}
