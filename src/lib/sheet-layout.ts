import { getPanelWidth, pathLength } from './geometry'
import type { Design } from './types'

const sheetGap = 10

/** Flat manufacturing layout shared by the export preview, SVG, and DXF. */
export function layoutSheets<T extends { design: Design }>(sheets: readonly T[]) {
  const width = Math.max(0, ...sheets.map((sheet) => getPanelWidth(sheet.design)))
  let length = 0
  const placed = sheets.map((sheet, index) => {
    const sheetLength = pathLength(sheet.design.segments)
    const sheetWidth = getPanelWidth(sheet.design)
    const x = length
    length += sheetLength + (index < sheets.length - 1 ? sheetGap : 0)
    return { sheet, x, y: width - sheetWidth, length: sheetLength, width: sheetWidth }
  })
  return { length, width, sheets: placed }
}
