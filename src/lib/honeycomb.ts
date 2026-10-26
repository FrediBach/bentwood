import type { Design, Point } from './types'

type Cubic = [Point, Point, Point, Point]
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

function distanceSquared(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x,
    dy = b.y - a.y
  const length = dx * dx + dy * dy
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0
  return (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2
}

/** Trotec Kerf 3: an independently parameterized, symmetric version of the
 * source's eight-cubic lens. Horizontal tangents pinch the ends; the sides
 * are concave near the tips, so an ellipse or convex hull changes the pattern.
 * https://www.troteclaser.com/en-us/helpcenter/materials/application-techniques/bending-technique */
export function honeycombCell(design: Design): Point[] {
  const halfWidth = (design.spacing * 15) / 32
  const point = (u: number, v: number): Point => ({
    x: v * halfWidth,
    y: (u - 0.5) * design.cutLength,
  })
  const controls = [
    [0.11251, 0, 0.18706, 0.243, 0.25352, 0.483],
    [0.33474, 0.77622, 0.41407, 1, 0.5, 1],
    [0.58593, 1, 0.66526, 0.77622, 0.74648, 0.483],
    [0.81294, 0.243, 0.88749, 0, 1, 0],
    [0.88749, 0, 0.81294, -0.243, 0.74648, -0.483],
    [0.66526, -0.77622, 0.58593, -1, 0.5, -1],
    [0.41407, -1, 0.33474, -0.77622, 0.25352, -0.483],
    [0.18706, -0.243, 0.11251, 0, 0, 0],
  ]
  const tolerance = Math.min(0.01, design.kerf / 4)
  const points = [point(0, 0)]
  const flatten = ([a, b, c, d]: Cubic) => {
    // A Bézier lies inside its control hull. Bounding both controls' distance
    // to the chord bounds curve-to-polyline deviation in physical millimetres.
    if (Math.max(distanceSquared(b, a, d), distanceSquared(c, a, d)) <= tolerance ** 2) {
      points.push(d)
      return
    }
    const ab = midpoint(a, b),
      bc = midpoint(b, c),
      cd = midpoint(c, d)
    const abc = midpoint(ab, bc),
      bcd = midpoint(bc, cd),
      centre = midpoint(abc, bcd)
    flatten([a, ab, abc, centre])
    flatten([centre, bcd, cd, d])
  }
  for (const [u1, v1, u2, v2, u3, v3] of controls)
    flatten([points.at(-1)!, point(u1, v1), point(u2, v2), point(u3, v3)])
  points.pop()
  return points
}

/** Small bounding-box gaps are misleading for staggered lenses. Evaluate the
 * actual nearest neighboring contours once per design, using the very same
 * polylines that are exported. Symmetry covers both half-period offsets. */
export function honeycombClearance(design: Design, cell: Point[]): number {
  const neighbor = cell.map((p) => ({
    x: p.x + design.spacing,
    y: p.y + (design.cutLength + design.bridge) / 2,
  }))
  let squared = Math.min(design.bridge, (design.spacing * 17) / 16) ** 2
  for (let i = 0; i < cell.length; i++) {
    const a = cell[i],
      b = cell[(i + 1) % cell.length]
    for (let j = 0; j < neighbor.length; j++) {
      const c = neighbor[j],
        d = neighbor[(j + 1) % neighbor.length]
      squared = Math.min(
        squared,
        distanceSquared(a, c, d),
        distanceSquared(b, c, d),
        distanceSquared(c, a, b),
        distanceSquared(d, a, b),
      )
    }
  }
  return Math.sqrt(squared)
}
