import { cutPathData } from './cut-path'
import { createExportPlan } from './geometry'
import type { CutLine, Design } from './types'

const gripLength = 24
const gutter = 8
const factors = [0.8, 1, 1.2]
const number = (value: number) => Number(value.toFixed(6)).toString()
const escapeXML = (value: string) =>
  value.replace(
    /[<>&"']/g,
    (character) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]!,
  )

function settings(design: Design) {
  const variations = (value: number, minimum: number, maximum: number) =>
    factors.map((factor) => Number(Math.max(minimum, Math.min(maximum, value * factor)).toFixed(3)))
  const spacings = variations(design.spacing, 0.5, 30)
  const bridges = variations(design.bridge, 0.2, 30)
  // Enough columns and repetitions to compare hinges while keeping the grip labels uncut.
  const hingeLength = Math.max(48, Math.ceil(12 * spacings[2]))
  const couponLength = 2 * gripLength + hingeLength
  const couponWidth = Math.max(48, Math.ceil(2 * (design.cutLength + bridges[2]) + 8))
  return { spacings, bridges, hingeLength, couponLength, couponWidth }
}

/** Overall stock size of the nine-coupon sheet, in millimetres. */
export function getTestSwatchSheetSize(design: Design): { width: number; height: number } {
  const { couponLength, couponWidth } = settings(design)
  return { width: 3 * couponLength + 4 * gutter, height: 3 * couponWidth + 4 * gutter }
}

function moveCut(cut: CutLine, x: number, y: number): CutLine {
  return {
    ...cut,
    x: cut.x + x,
    y1: cut.y1 + y,
    y2: cut.y2 + y,
    ...(cut.points && { points: cut.points.map((point) => ({ x: point.x + x, y: point.y + y })) }),
  }
}

/**
 * Nine separate coupons for the selected pattern, with spacing across columns and
 * bridge size down rows. The arcs locate cuts only; they are not a calibrated bend target.
 * Black labels belong to an independent engraving group and never cross the hinge cuts.
 */
export function exportTestSwatchesSVG(design: Design): string {
  const { spacings, bridges, hingeLength, couponLength, couponWidth } = settings(design)
  const { width, height } = getTestSwatchSheetSize(design)
  const hinges: string[] = []
  const outlines: string[] = []
  const labels: string[] = []
  const patternName = design.pattern[0].toUpperCase() + design.pattern.slice(1)
  const materialName = design.material[0].toUpperCase() + design.material.slice(1)

  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      const index = row * 3 + column + 1
      const spacing = spacings[column]
      const bridge = bridges[row]
      const x = gutter + column * (couponLength + gutter)
      const y = gutter + row * (couponWidth + gutter)
      const coupon: Design = {
        ...design,
        name: `${patternName} sample ${index}`,
        outline: 'rectangle',
        width: couponWidth,
        spacing,
        bridge,
        segments: [
          { id: 'grip-left', type: 'straight', length: gripLength },
          ...(design.pattern === 'graded'
            ? [
                {
                  id: 'tight',
                  type: 'arc' as const,
                  radius: hingeLength / 2,
                  angle: 180 / Math.PI,
                },
                { id: 'gentle', type: 'arc' as const, radius: hingeLength, angle: 90 / Math.PI },
              ]
            : [{ id: 'hinge', type: 'arc' as const, radius: hingeLength, angle: 180 / Math.PI }]),
          { id: 'grip-right', type: 'straight', length: gripLength },
        ],
      }
      // Use the same manufacturing gate as a full panel, including future pattern checks.
      const plan = createExportPlan(coupon)
      if (!plan.cuts.length)
        throw new Error('No hinge cuts fit in a test sample. Reduce spacing or bridge size.')
      hinges.push(
        `    <g id="swatch-${index}" data-spacing="${number(spacing)}" data-bridge="${number(bridge)}">\n` +
          plan.cuts
            .map((cut) => `      <path d="${cutPathData(moveCut(cut, x, y))}"/>`)
            .join('\n') +
          '\n    </g>',
      )
      outlines.push(
        `    <path id="coupon-outline-${index}" d="M${number(x)} ${number(y)} h${number(couponLength)} v${number(couponWidth)} h-${number(couponLength)} Z"/>`,
      )
      const lines = [
        `${index}. ${patternName}`,
        `S ${number(spacing)} mm`,
        `B ${number(bridge)} mm`,
        `L ${number(design.cutLength)} mm`,
        materialName,
        `T ${number(design.thickness)} mm`,
        `K ${number(design.kerf)} mm`,
      ]
      labels.push(
        `    <g id="label-${index}">\n` +
          lines
            .map(
              (line, i) =>
                `      <text x="${number(x + 3)}" y="${number(y + 7 + i * 5)}">${escapeXML(line)}</text>`,
            )
            .join('\n') +
          '\n    </g>',
      )
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${number(width)}mm" height="${number(height)}mm" viewBox="0 0 ${number(width)} ${number(height)}">
  <title>${escapeXML(design.name)} — ${patternName} hinge test swatches</title>
  <desc>Nine independent samples at 1:1 in millimetres. Columns vary cut spacing; rows vary bridge size by up to 20 percent, clamped to supported limits. S: spacing, B: bridge, L: cut length, T: thickness, K: nominal kerf. Red outer-contour and blue hinge-cuts are laser centre lines with no kerf compensation. Black engraving-labels are text for engraving, not cutting; assign operations in laser software and verify text before processing. Use the same material and grain direction as the final panel. Samples compare flexibility; they do not specify an achievable bend radius or strength.</desc>
  <g id="hinge-cuts" fill="none" stroke="#0000ff" stroke-width="0.01">
${hinges.join('\n')}
  </g>
  <g id="outer-contour" fill="none" stroke="#ff0000" stroke-width="0.01">
${outlines.join('\n')}
  </g>
  <g id="engraving-labels" fill="#000000" stroke="none" font-family="sans-serif" font-size="2.8">
${labels.join('\n')}
  </g>
</svg>
`
}
