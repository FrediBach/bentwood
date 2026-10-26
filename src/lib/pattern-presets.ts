import type { Design } from './types'

type FamilyPreset = { id: string; label: string; settings: Partial<Design> }

/** Named starting points within continuously adjustable pattern families. */
export const familyPresets: Record<'honeycomb' | 'meander', FamilyPreset[]> = {
  honeycomb: [
    {
      id: 'small-waves',
      label: 'Small waves',
      settings: {
        spacing: 2.4,
        bridge: 5.25,
        cutLength: 15.75,
        honeycombWidth: 0.5,
        honeycombRoundness: 0,
      },
    },
    {
      id: 'honeycomb',
      label: 'Honeycomb',
      settings: {
        spacing: 2.4,
        bridge: 6.56,
        cutLength: 19.68,
        honeycombWidth: 0.9375,
        honeycombRoundness: 1,
      },
    },
  ],
  meander: [
    {
      id: 'fine',
      label: 'Fine',
      settings: { spacing: 3.04, bridge: 1.62, cutLength: 22.58, meanderOverlap: 0.160811 },
    },
    {
      id: 'wide',
      label: 'Wide',
      settings: { spacing: 3.04, bridge: 1.62, cutLength: 33.87, meanderOverlap: 0.08 },
    },
  ],
}
