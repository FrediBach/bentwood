import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createCutPlan, defaultDesign, exportSVG, validateDesign } from './geometry'
import { honeycombCell } from './honeycomb'
import { createPanelSurface } from './panel-surface'
import { familyPresets } from './pattern-presets'
import type { Design, Point } from './types'

const oldPresets = [
  {
    pattern: 'small-wave',
    spacing: 2.4,
    bridge: 5.25,
    cutLength: 15.75,
    family: 'honeycomb',
    preset: 'small-waves',
    cuts: 488,
    hash: '8838dd566dbec0dfabdee422d9a488d2e0009fe32f807d5ca1ff7d2d57c84780',
  },
  {
    pattern: 'honeycomb',
    spacing: 2.4,
    bridge: 6.56,
    cutLength: 19.68,
    family: 'honeycomb',
    preset: 'honeycomb',
    cuts: 384,
    hash: '5376794146fdfe6049dbb00d0589d08deddcf83ceff42e94f1d0932707e48150',
  },
  {
    pattern: 'meander',
    spacing: 3.04,
    bridge: 1.62,
    cutLength: 22.58,
    family: 'meander',
    preset: 'fine',
    cuts: 450,
    hash: '13ac60fbe676b8b08369ec447f5e426c748eb67c2bd8d4bcc891cb9169e165fc',
  },
  {
    pattern: 'meander-wide',
    spacing: 3.04,
    bridge: 1.62,
    cutLength: 33.87,
    family: 'meander',
    preset: 'wide',
    cuts: 300,
    hash: '1e26933ed40e7223fc99a150b54b095dec52ea4487ffec752f45bf1154089e2f',
  },
] as const

const area = (ring: Point[]) =>
  Math.abs(
    ring.reduce((sum, p, i) => {
      const q = ring[(i + 1) % ring.length]
      return sum + p.x * q.y - q.x * p.y
    }, 0),
  ) / 2

describe('parametric pattern families', () => {
  it.each(oldPresets)('preserves every exported contour when migrating $pattern', (old) => {
    const legacy = {
      ...defaultDesign,
      version: 3,
      pattern: old.pattern,
      spacing: old.spacing,
      bridge: old.bridge,
      cutLength: old.cutLength,
      // These properties did not exist in version 3 and must not change its meaning.
      honeycombRoundness: 0.37,
      honeycombWidth: 0.71,
      meanderOverlap: 0.11,
    }
    const migrated = validateDesign(legacy)!
    expect(migrated.version).toBe(4)
    expect(migrated.pattern).toBe(old.family)
    expect(createCutPlan(migrated).cuts).toHaveLength(old.cuts)
    // Baselines captured from the previous schema's source before the refactor.
    // Include the outer contour and all clipped/open/closed laser paths.
    const paths = [...exportSVG(migrated).matchAll(/<path d="([^"]+)"/g)].map((match) => match[1])
    expect(createHash('sha256').update(paths.join('\n')).digest('hex')).toBe(old.hash)
    const preset = familyPresets[old.family].find((candidate) => candidate.id === old.preset)!
    const fromPreset: Design = { ...defaultDesign, pattern: old.family, ...preset.settings }
    expect(createCutPlan(fromPreset).cuts).toEqual(createCutPlan(migrated).cuts)
    expect(validateDesign(JSON.parse(JSON.stringify(migrated)))).toEqual(migrated)
  })

  it.each(['classic', 'graded', 'wave', 'zigzag'] as const)(
    'retains the %s pattern when migrating version 3',
    (pattern) => {
      expect(validateDesign({ ...defaultDesign, version: 3, pattern })).toEqual({
        ...defaultDesign,
        pattern,
      })
    },
  )

  it.each([
    ['honeycombRoundness', -0.01],
    ['honeycombRoundness', 1.01],
    ['honeycombWidth', 0.09],
    ['honeycombWidth', 0.96],
    ['meanderOverlap', -0.01],
    ['meanderOverlap', 0.31],
  ] as const)('rejects an out-of-range %s value of %s', (field, value) => {
    expect(validateDesign({ ...defaultDesign, [field]: value })).toBeNull()
  })

  it.each(['honeycombRoundness', 'honeycombWidth', 'meanderOverlap'] as const)(
    'requires a finite numeric %s in version 4',
    (field) => {
      for (const value of [undefined, null, NaN, Infinity, '0.5'])
        expect(validateDesign({ ...defaultDesign, [field]: value })).toBeNull()
    },
  )

  it.each(['small-wave', 'meander-wide'])(
    'rejects removed pattern ID %s in new projects',
    (pattern) => {
      expect(validateDesign({ ...defaultDesign, pattern })).toBeNull()
    },
  )

  it('interpolates honeycomb curvature continuously while controlling width independently', () => {
    for (const honeycombWidth of [0.1, 0.5, 0.725, 0.9375, 0.95]) {
      const settings: Design = { ...defaultDesign, pattern: 'honeycomb', honeycombWidth }
      for (const honeycombRoundness of [0, 0.25, 0.5, 0.75, 1]) {
        const cell = honeycombCell({ ...settings, honeycombRoundness })
        const width = Math.max(...cell.map((p) => p.x)) - Math.min(...cell.map((p) => p.x))
        expect(width).toBeCloseTo(settings.spacing * honeycombWidth, 10)
        if (honeycombRoundness === 0) expect(cell).toHaveLength(4)
        else {
          // The first cubic ends at u=.25352 in the reference lens; the
          // diamond side there is v=.50704. Intermediates must blend these.
          const y = (0.25352 - 0.5) * settings.cutLength
          const p = cell.find((candidate) => Math.abs(candidate.y - y) < 1e-9 && candidate.x > 0)!
          const fraction = p.x / (width / 2)
          expect(fraction).toBeCloseTo(0.50704 + (0.483 - 0.50704) * honeycombRoundness, 9)
        }
      }
    }
  })

  it.each(['honeycomb', 'meander'] as const)(
    'round-trips non-preset %s parameters without snapping',
    (pattern) => {
      const input: Design = {
        ...defaultDesign,
        pattern,
        honeycombRoundness: 0.437,
        honeycombWidth: 0.683,
        meanderOverlap: 0.1234,
      }
      const restored = validateDesign(JSON.parse(JSON.stringify(input)))!
      expect(restored).toEqual(input)
      expect(createCutPlan(restored).cuts).toEqual(createCutPlan(input).cuts)
    },
  )

  it.each([
    { outline: 'triangle', width: 8, honeycombRoundness: 0.5 },
    { outline: 'custom', width: 60, honeycombRoundness: 0.975 },
  ] as const)('keeps wide openings connected near a narrow $outline boundary', (settings) => {
    const input: Design = {
      ...defaultDesign,
      pattern: 'honeycomb',
      ...settings,
      spacing: 3.04,
      bridge: 5.9,
      cutLength: 25,
      honeycombWidth: 0.95,
      segments: [
        { id: 'a', type: 'arc', radius: 50, angle: ((30.51 / 50) * 180) / Math.PI },
        { id: 'b', type: 'arc', radius: 50, angle: (-(30.51 / 50) * 180) / Math.PI },
      ],
      customOutline: [
        { x: 0, y: 0 },
        { x: 0.4, y: 0 },
        { x: 0.4, y: 0.49 },
        { x: 0.6, y: 0.49 },
        { x: 0.6, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0.6, y: 1 },
        { x: 0.6, y: 0.51 },
        { x: 0.4, y: 0.51 },
        { x: 0.4, y: 1 },
        { x: 0, y: 1 },
      ],
    }
    const plan = createCutPlan(input)
    const perimeter = plan.outline.map((a, i) => {
      const b = plan.outline[(i + 1) % plan.outline.length]
      return {
        x: a.x,
        y1: Math.min(a.y, b.y),
        y2: Math.max(a.y, b.y),
        points: [a, b],
        roundCaps: true,
      }
    })
    const surface = createPanelSurface(
      plan.outline,
      [...plan.cuts, ...perimeter],
      input.kerf,
      plan.cutouts,
    )
    expect(surface.polygons.filter((p) => area(p.contour) > 1e-5)).toHaveLength(1)
    expect(plan.warnings.some((warning) => warning.includes('remain uncut'))).toBe(true)
  })

  for (const pattern of ['honeycomb', 'meander'] as const)
    it.each(['rectangle', 'triangle', 'ellipse', 'custom'] as const)(
      `${pattern} keeps intermediate shapes connected on a %s outline`,
      (outline) => {
        const input: Design = {
          ...defaultDesign,
          pattern,
          outline,
          width: 100,
          spacing: 3.04,
          bridge: pattern === 'meander' ? 1.62 : 5.9,
          cutLength: 25,
          honeycombRoundness: 0.5,
          honeycombWidth: 0.725,
          meanderOverlap: 0.12,
          segments: [{ id: 'arc', type: 'arc', radius: 100, angle: 180 / Math.PI }],
          customOutline: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 0.3 },
            { x: 0.35, y: 0.3 },
            { x: 0.35, y: 0.7 },
            { x: 1, y: 0.7 },
            { x: 1, y: 1 },
            { x: 0, y: 1 },
          ],
        }
        const plan = createCutPlan(input)
        const perimeter = plan.outline.map((a, i) => {
          const b = plan.outline[(i + 1) % plan.outline.length]
          return {
            x: a.x,
            y1: Math.min(a.y, b.y),
            y2: Math.max(a.y, b.y),
            points: [a, b],
            roundCaps: true,
          }
        })
        const surface = createPanelSurface(
          plan.outline,
          [...plan.cuts, ...perimeter],
          input.kerf,
          plan.cutouts,
        )
        expect(surface.polygons.filter((p) => area(p.contour) > 1e-5)).toHaveLength(1)
        expect(plan.cuts.length).toBeGreaterThan(20)
      },
    )
})
