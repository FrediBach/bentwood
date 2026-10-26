import { woodMaterials, type WoodMaterial } from './wood-materials'

// Millimetres on the unbent sheet. Grain keeps its scale and alignment across
// triangles, cuts and bends, with a long repeat along the fibres.
export const woodTextureSize = { length: 720, width: 360 }

const profiles: Record<
  WoodMaterial,
  {
    seed: number
    rings: number
    figure: number
    contrast: number
    pores: number
    roughness: number
  }
> = {
  birch: { seed: 827, rings: 38, figure: 0.65, contrast: 0.55, pores: 0.12, roughness: 0.75 },
  walnut: { seed: 391, rings: 32, figure: 1.15, contrast: 1, pores: 0.4, roughness: 0.72 },
  basswood: { seed: 123, rings: 46, figure: 0.35, contrast: 0.3, pores: 0.08, roughness: 0.82 },
  oak: { seed: 659, rings: 26, figure: 1.1, contrast: 1.05, pores: 1, roughness: 0.8 },
  maple: { seed: 241, rings: 42, figure: 0.8, contrast: 0.4, pores: 0.08, roughness: 0.7 },
  cherry: { seed: 503, rings: 34, figure: 0.85, contrast: 0.7, pores: 0.2, roughness: 0.72 },
  ash: { seed: 719, rings: 24, figure: 1.25, contrast: 0.9, pores: 0.85, roughness: 0.79 },
  beech: { seed: 181, rings: 44, figure: 0.45, contrast: 0.45, pores: 0.45, roughness: 0.77 },
  mahogany: { seed: 947, rings: 36, figure: 0.55, contrast: 0.85, pores: 0.5, roughness: 0.73 },
}

function randomSequence(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

// The lattice wraps BEFORE interpolation. Both the value and slope therefore
// meet at each tile boundary, including after the grain coordinates are warped.
function periodicNoise(columns: number, rows: number, random: () => number) {
  const values = Float32Array.from({ length: columns * rows }, random)
  return (u: number, v: number) => {
    const x = (u - Math.floor(u)) * columns
    const y = (v - Math.floor(v)) * rows
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    const dx = x - ix
    const dy = y - iy
    const sx = dx * dx * (3 - 2 * dx)
    const sy = dy * dy * (3 - 2 * dy)
    const nx = (ix + 1) % columns
    const ny = (iy + 1) % rows
    const a = values[iy * columns + ix]
    const b = values[iy * columns + nx]
    const c = values[ny * columns + ix]
    const d = values[ny * columns + nx]
    return a + (b - a) * sx + (c - a + (a - b - c + d) * sx) * sy
  }
}

/** A deterministic, continuous wood field, periodic in both UV directions. */
export function createWoodGrainSampler(material: WoodMaterial) {
  const profile = profiles[material]
  const random = randomSequence(profile.seed)
  const figure = periodicNoise(3, 5, random)
  const drift = periodicNoise(4, 9, random)
  const growth = periodicNoise(3, 48, random)
  const fibres = periodicNoise(9, 320, random)
  const fine = periodicNoise(28, 620, random)
  const pores = periodicNoise(90, 420, random)
  const flecks = periodicNoise(150, 180, random)
  return (u: number, v: number) => {
    // Canonical coordinates also keep large/negative sheet coordinates stable.
    u -= Math.floor(u)
    v -= Math.floor(v)
    const broad = figure(u, v) - 0.5
    const wandering = drift(u, v) - 0.5
    const across = v + (broad * 0.065 + wandering * 0.018) * profile.figure
    const annual = Math.sin((across * profile.rings + broad * 1.8) * Math.PI * 2)
    const latewood = Math.pow(Math.max(0, annual), 12)
    const fibre = fibres(u, across)
    const pore = Math.max(0, pores(u, across) - 0.64)
    const ray = material === 'beech' ? Math.max(0, flecks(u, v) - 0.72) * 0.22 : 0
    return (
      (broad * 0.13 +
        (growth(u, across) - 0.5) * 0.16 +
        (fibre - 0.5) * 0.15 +
        (fine(u, across) - 0.5) * 0.055 -
        latewood * 0.075) *
        profile.contrast -
      pore * profile.pores * (0.32 + latewood * 0.5) -
      ray
    )
  }
}

export function woodAppearance(material: WoodMaterial) {
  const color = woodMaterials.find((wood) => wood.id === material)!.color
  return { color, roughness: profiles[material].roughness }
}

/** Sample texel centres: GPU repeat filtering blends the last and first texels. */
export function createWoodTexturePixels(material: WoodMaterial, size = 1024) {
  const sample = createWoodGrainSampler(material)
  const { color } = woodAppearance(material)
  const base = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16))
  const pixels = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const shade = sample((x + 0.5) / size, (y + 0.5) / size)
      const offset = (y * size + x) * 4
      // Slightly warmer shadows keep the grain from looking like grey stripes.
      pixels[offset] = base[0] * (1 + shade * 0.85)
      pixels[offset + 1] = base[1] * (1 + shade)
      pixels[offset + 2] = base[2] * (1 + shade * 1.15)
      pixels[offset + 3] = 255
    }
  }
  return pixels
}
