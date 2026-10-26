export type Point = { x: number; y: number }
export type Segment =
  | { id: string; type: 'straight'; length: number }
  | { id: string; type: 'arc'; radius: number; angle: number }
export type OutlineKind = 'rectangle' | 'square' | 'ellipse' | 'circle' | 'triangle' | 'custom'
export type Design = {
  version: 1
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
  edgeMargin: number
  kerf: number
}
export type CutLine = { x: number; y1: number; y2: number }
export type PathSample = { x: number; y: number; angle: number; s: number; curved: boolean }
export type CutPlan = {
  length: number
  width: number
  outline: Point[]
  cuts: CutLine[]
  cutLength: number
  warnings: string[]
}
