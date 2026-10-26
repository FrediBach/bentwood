import type { CutLine, Point } from './types'

export function getCutPoints(cut: CutLine): Point[] {
  const points = cut.points ?? [
    { x: cut.x, y: cut.y1 },
    { x: cut.x, y: cut.y2 },
  ]
  const first = points[0],
    last = points.at(-1)
  return cut.closed && first && last && (first.x !== last.x || first.y !== last.y)
    ? [...points, first]
    : points
}

const number = (value: number) => Number(value.toFixed(6)).toString()

/** Shared by the flat preview, exports, and test swatches. Units are mm. */
export function cutPathData(cut: CutLine): string {
  if (!cut.points && !cut.closed) return `M${number(cut.x)} ${number(cut.y1)} V${number(cut.y2)}`
  const points = getCutPoints(cut)
  const drawingPoints = cut.closed && points.length > 1 ? points.slice(0, -1) : points
  return (
    drawingPoints.map((p, i) => `${i ? 'L' : 'M'}${number(p.x)} ${number(p.y)}`).join(' ') +
    (cut.closed ? ' Z' : '')
  )
}

export function cutPathLength(cut: CutLine): number {
  const points = getCutPoints(cut)
  return points
    .slice(1)
    .reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0)
}
