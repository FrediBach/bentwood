export const woodMaterials = [
  { id: 'birch', label: 'Birch plywood', color: '#ddc196' },
  { id: 'walnut', label: 'Walnut plywood', color: '#916745' },
  { id: 'basswood', label: 'Basswood plywood', color: '#e5d2ad' },
  { id: 'oak', label: 'Oak plywood', color: '#b99462' },
  { id: 'maple', label: 'Maple plywood', color: '#e4c99f' },
  { id: 'cherry', label: 'Cherry plywood', color: '#bd805c' },
  { id: 'ash', label: 'Ash plywood', color: '#d3be96' },
  { id: 'beech', label: 'Beech plywood', color: '#d6ad86' },
  { id: 'mahogany', label: 'Mahogany plywood', color: '#955b42' },
] as const

export type WoodMaterial = (typeof woodMaterials)[number]['id']

export function isWoodMaterial(value: unknown): value is WoodMaterial {
  return woodMaterials.some((material) => material.id === value)
}
