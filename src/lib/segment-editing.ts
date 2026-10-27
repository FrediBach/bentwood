import { segmentLength } from './geometry'
import type { Segment } from './types'

/** Change the segment's shape without changing its neutral-axis length or identity. */
export function convertSegmentType(segment: Segment): Segment | null {
  const length = segmentLength(segment)
  if (segment.type === 'arc') {
    // A single straight segment cannot represent every supported arc length.
    if (length < 1 || length > 2000) return null
    return { id: segment.id, type: 'straight', length }
  }

  // Prefer a quarter-circle; adjust its angle only at the radius limits.
  const radius = Math.max(1, Math.min(1000, length / (Math.PI / 2)))
  return {
    id: segment.id,
    type: 'arc',
    radius,
    angle: ((length / radius) * 180) / Math.PI,
  }
}
