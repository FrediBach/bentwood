import type { CutLine, Point } from './types'

export function getCutPoints(cut: CutLine): Point[] {
  return (
    cut.points ?? [
      { x: cut.x, y: cut.y1 },
      { x: cut.x, y: cut.y2 },
    ]
  )
}

const number = (value: number) => Number(value.toFixed(6)).toString()

/** Shared by the flat preview, exports, and test swatches. Units are mm. */
export function cutPathData(cut: CutLine): string {
  if (!cut.points) return `M${number(cut.x)} ${number(cut.y1)} V${number(cut.y2)}`
  return cut.points.map((p, i) => `${i ? 'L' : 'M'}${number(p.x)} ${number(p.y)}`).join(' ')
}

export function cutPathLength(cut: CutLine): number {
  const points = getCutPoints(cut)
  return points
    .slice(1)
    .reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0)
}
