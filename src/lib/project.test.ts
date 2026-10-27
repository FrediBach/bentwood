import { describe, expect, it } from 'vitest'
import { defaultDesign, exportBendPathSVG, exportDXF, exportSVG } from './geometry'
import {
  createProject,
  defaultPlacement,
  exportProject,
  MAX_SHEETS,
  validateProject,
} from './project'
import type { Design, Project, SheetPlacement } from './types'

function project(...designs: Partial<Design>[]): Project {
  return {
    version: 5,
    name: 'Assembly',
    sheets: designs.map((design, i) => ({
      id: `sheet-${i + 1}`,
      design: { ...structuredClone(defaultDesign), ...design },
      placement: { ...defaultPlacement },
    })),
  }
}

function dxfEntities(source: string) {
  const start = source.indexOf('0\nSECTION\n2\nENTITIES\n') + '0\nSECTION\n2\nENTITIES\n'.length
  const values = source.slice(start).trim().split('\n')
  const entities: { type: string; values: Record<string, string> }[] = []
  for (let i = 0; i < values.length; i += 2) {
    const code = values[i]
    const value = values[i + 1]
    if (code === '0') entities.push({ type: value, values: {} })
    else if (entities.length) entities.at(-1)!.values[code] = value
  }
  return entities
}

describe('multi-sheet project validation', () => {
  it.each([1, 2, 3, 4])('migrates a version %s design into an independent sheet', (version) => {
    const legacy = { ...structuredClone(defaultDesign), version, name: 'Old project' }
    const result = validateProject(legacy)!
    expect(result.version).toBe(5)
    expect(result.name).toBe('Old project')
    expect(result.sheets).toHaveLength(1)
    expect(result.sheets[0].design.version).toBe(4)
    expect(result.sheets[0].design.segments).toEqual(defaultDesign.segments)
    expect(result.sheets[0].placement).toEqual(defaultPlacement)
    expect(result.sheets[0].design.segments).not.toBe(legacy.segments)
  })

  it('retains independently configured sheets and exact placement through a JSON round trip', () => {
    const input = project(
      {},
      { material: 'walnut', thickness: 6, outline: 'ellipse', width: 77.123456789 },
    )
    input.sheets[1].placement = { x: -12.3456789, y: 55, z: 600, rotation: -37.123456789 }
    expect(validateProject(JSON.parse(JSON.stringify(input)))).toEqual(input)
    const checked = validateProject({ ...input, unwanted: true })!
    expect(checked).not.toHaveProperty('unwanted')
    expect(checked.sheets[0].design).not.toBe(input.sheets[0].design)
  })

  it('rejects empty projects, duplicate IDs, invalid sheets, and excess sheets', () => {
    expect(validateProject(project())).toBeNull()
    const duplicate = project({}, {})
    duplicate.sheets[1].id = duplicate.sheets[0].id
    expect(validateProject(duplicate)).toBeNull()
    expect(validateProject(project({ thickness: Infinity }))).toBeNull()
    expect(
      validateProject(project(...Array.from({ length: MAX_SHEETS + 1 }, () => ({})))),
    ).toBeNull()
    expect(
      validateProject(project(...Array.from({ length: MAX_SHEETS }, () => ({})))),
    ).not.toBeNull()
    const emptyId = createProject()
    emptyId.sheets[0].id = ''
    expect(validateProject(emptyId)).toBeNull()
    expect(validateProject({ ...createProject(), version: 6 })).toBeNull()
  })

  it.each<Partial<SheetPlacement>>([
    { x: NaN },
    { y: Infinity },
    { z: -10001 },
    { x: 10001 },
    { rotation: 361 },
  ])('rejects invalid placement: %j', (placement) => {
    const input = createProject()
    Object.assign(input.sheets[0].placement, placement)
    expect(validateProject(input)).toBeNull()
  })

  it.each([
    'two sheets',
    ' leading',
    'trailing ',
    'tab\tid',
    'line\nid',
    'null\0id',
    '<tag>',
    'x'.repeat(101),
  ])('rejects sheet IDs that cannot be safe DOM and ARIA tokens: %j', (id) => {
    const input = createProject()
    input.sheets[0].id = id
    expect(validateProject(input)).toBeNull()
  })

  it('accepts generated UUID sheet IDs and stable migration IDs', () => {
    const input = project({}, {})
    input.sheets[1].id = 'c2d27cba-7900-498d-a925-59181b0d3715'
    expect(validateProject(input)).toEqual(input)
  })

  it('preserves the sheet-level cut-complexity and geometry guards', () => {
    expect(
      validateProject(project({ width: 2000, spacing: 0.5, cutLength: 1, bridge: 0.2 })),
    ).toBeNull()
    expect(validateProject(project({ customOutline: [{ x: 0, y: 0 }] }))).toBeNull()
  })
})

describe('multi-sheet manufacturing exports', () => {
  it('preserves the existing single-sheet export formats', () => {
    const input = createProject()
    expect(exportProject(input, 'svg')).toBe(exportSVG(defaultDesign))
    expect(exportProject(input, 'dxf')).toBe(exportDXF(defaultDesign))
    expect(exportProject(input, 'bend-path')).toBe(exportBendPathSVG(defaultDesign))
  })

  it('lays out full-size SVG sheets with unique groups and material metadata', () => {
    const input = project(
      { name: 'Birch <first>', segments: [{ id: 's', type: 'straight', length: 100 }], width: 40 },
      {
        name: 'Walnut & second',
        segments: [{ id: 's', type: 'straight', length: 80 }],
        width: 60,
        material: 'walnut',
        thickness: 6,
        outline: 'ellipse',
      },
    )
    input.sheets[1].placement = { x: 600, y: 99, z: -50, rotation: 70 }
    const svg = exportProject(input, 'svg')
    expect(svg).toContain('width="190mm" height="60mm" viewBox="0 0 190 60"')
    expect(svg).toContain('transform="translate(0 20)"')
    expect(svg).toContain('transform="translate(110 0)"')
    expect(svg).toContain('A40 30')
    expect(svg).toContain('Birch &lt;first&gt;')
    expect(svg).toContain('Walnut &amp; second; material walnut; thickness 6 mm')
    for (const id of [
      'outer-contour',
      'hinge-cuts',
      'sheet-1-outer-contour',
      'sheet-2-outer-contour',
    ])
      expect(svg.match(new RegExp(`id="${id}"`, 'g'))).toHaveLength(1)
    expect(svg).not.toContain('<text')
  })

  it('translates DXF points while retaining circle radii, ellipse vectors, and cut layers', () => {
    const input = project(
      { segments: [{ id: 's', type: 'straight', length: 100 }], outline: 'circle' },
      {
        name: 'Second\n0\nEOF',
        segments: [{ id: 's', type: 'straight', length: 80 }],
        width: 40,
        outline: 'ellipse',
      },
      { segments: [{ id: 's', type: 'straight', length: 50 }], width: 30 },
    )
    const dxf = exportProject(input, 'dxf')
    const entities = dxfEntities(dxf)
    const circle = entities.find((entity) => entity.type === 'CIRCLE')!
    const ellipse = entities.find((entity) => entity.type === 'ELLIPSE')!
    const polyline = entities.find((entity) => entity.type === 'POLYLINE')!
    const vertices = entities.filter((entity) => entity.type === 'VERTEX')
    expect(circle.values['40']).toBe('50')
    expect(ellipse.values['10']).toBe('150')
    expect(ellipse.values['11']).toBe('40')
    expect(ellipse.values['40']).toBe('0.5')
    expect(polyline.values['10']).toBe('0')
    expect(vertices.map((vertex) => Number(vertex.values['10']))).toEqual([200, 250, 250, 200])
    expect(dxf).toContain('$INSUNITS\n70\n4')
    expect(dxf).toContain('OUTER_CONTOUR')
    expect(dxf).toContain('HINGE_CUTS')
    expect(dxf.match(/\nEOF\n/g)).toHaveLength(1)
    expect(dxf).toContain('Second 0 EOF')
  })

  it('retains all shaped cuts without adding closing edges', () => {
    const input = project(
      {},
      { pattern: 'honeycomb', spacing: 2.4, bridge: 6.56, cutLength: 19.68 },
    )
    const individual = input.sheets.map((sheet) => exportSVG(sheet.design))
    const svg = exportProject(input, 'svg')
    expect(svg.match(/<path /g)?.length).toBe(
      individual.reduce((sum, source) => sum + (source.match(/<path /g)?.length ?? 0), 0),
    )
    const dxf = exportProject(input, 'dxf')
    expect(dxfEntities(dxf).filter((entity) => entity.type === 'LINE')).toHaveLength(
      input.sheets.reduce(
        (sum, sheet) =>
          sum +
          dxfEntities(exportDXF(sheet.design)).filter((entity) => entity.type === 'LINE').length,
        0,
      ),
    )
  })

  it('blocks a full laser export if any sheet has unsafe clearance, independently of bend paths', () => {
    const input = project({}, { name: 'Walnut side', kerf: 2, spacing: 0.5 })
    expect(() => exportProject(input, 'svg')).toThrow('Sheet 2 (“Walnut side”):')
    expect(() => exportProject(input, 'dxf')).toThrow('Sheet 2 (“Walnut side”):')
    expect(exportProject(input, 'bend-path').match(/<path /g)).toHaveLength(2)
  })

  it('applies assembly translations and positive Y rotation to fully bent path exports', () => {
    const input = project(
      { segments: [{ id: 's', type: 'straight', length: 100 }] },
      { segments: [{ id: 's', type: 'straight', length: 80 }] },
    )
    input.sheets[1].placement = { x: 200, y: 50, z: 40, rotation: 90 }
    const svg = exportProject(input, 'bend-path')
    expect(svg).toContain('width="202mm" height="82mm"')
    expect(svg).toContain('translate(200 40) rotate(-90) translate(-1 -1)')
    expect(svg).toContain('transform="translate(1 41)"')
    expect(svg).toContain('Elevation is omitted')
    expect(svg).not.toMatch(/outer-contour|hinge-cuts|<text/)
    input.sheets[1].placement.y = -400
    expect(exportProject(input, 'bend-path')).toBe(svg)
  })

  it('includes rotated arc extrema and full circles without replacing them with polylines', () => {
    const input = project({ segments: [{ id: 'a', type: 'arc', radius: 50, angle: 360 }] })
    input.sheets[0].placement.rotation = 45
    const svg = exportProject(input, 'bend-path')
    expect(svg).toContain('width="102mm" height="102mm"')
    expect(svg.match(/A50 50/g)).toHaveLength(2)
    expect(svg).toContain('rotate(-45)')
  })
})
