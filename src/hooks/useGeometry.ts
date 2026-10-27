import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import { GeometryClient } from '../lib/geometry-client'
import { assemblyKey, topologyKey, type PreparedAssembly } from '../lib/geometry-jobs'
import type { Project } from '../lib/types'

type Snapshot = PreparedAssembly & { key: string; showCuts: boolean }

export function useGeometry(project: Project, activeSheetId: string, showCuts: boolean) {
  const client = useRef<GeometryClient | null>(null)
  const [assembly, setAssembly] = useState<Snapshot | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const key = assemblyKey(project)
  // Keep appearance/name changes out of the worker, including while geometry is pending.
  const latestProject = useRef(project)
  useEffect(() => {
    latestProject.current = project
  }, [project])
  useEffect(() => {
    const next = new GeometryClient()
    client.current = next
    return () => {
      next.dispose()
      client.current = null
    }
  }, [])
  useEffect(() => {
    let current = true
    setError('')
    const timer = setTimeout(() => {
      const requested = latestProject.current
      client.current!.prepareAssembly(requested, showCuts).then(
        (result) => {
          if (current)
            startTransition(() =>
              setAssembly((previous) => ({
                ...result,
                sheets: result.sheets.map((sheet) => {
                  const old = previous?.sheets.find((candidate) => candidate.id === sheet.id)
                  return {
                    ...sheet,
                    geometry:
                      old &&
                      previous?.showCuts === showCuts &&
                      topologyKey(old.design) === topologyKey(sheet.design)
                        ? old.geometry
                        : sheet.geometry,
                  }
                }),
                key,
                showCuts,
              })),
            )
        },
        (reason: Error) => {
          if (current && reason.name !== 'AbortError') setError(reason.message)
        },
      )
    }, 60)
    return () => {
      current = false
      clearTimeout(timer)
      client.current?.cancelPendingPreview()
    }
  }, [key, showCuts, retry])
  const previewSheets = useMemo(
    () =>
      (assembly?.sheets ?? [])
        .filter((sheet) => project.sheets.some((candidate) => candidate.id === sheet.id))
        .map((sheet) => {
          const latest = project.sheets.find((candidate) => candidate.id === sheet.id)
          return latest
            ? {
                ...sheet,
                design: {
                  ...sheet.design,
                  name: latest.design.name,
                  material: latest.design.material,
                },
              }
            : sheet
        }),
    [assembly, project],
  )
  const activeSnapshot = previewSheets.find((sheet) => sheet.id === activeSheetId)
  const snapshot = activeSnapshot ? { ...activeSnapshot, showCuts: assembly!.showCuts } : null
  const assemblyWarnings = useMemo(() => {
    if (!assembly) return []
    const names = new Map(
      project.sheets.map((sheet) => [sheet.id, sheet.design.name || 'Untitled sheet']),
    )
    return [
      ...assembly.intersections
        .filter((pair) => names.has(pair.firstId) && names.has(pair.secondId))
        .map(
          (pair) =>
            `“${names.get(pair.firstId)}” and “${names.get(pair.secondId)}” overlap or touch in the fully bent assembly. Adjust sheet placement. Intersection checks include thickness and cutouts, but ignore laser kerf slits.`,
        ),
      ...assembly.warnings,
    ]
  }, [assembly, project])
  return {
    client,
    snapshot,
    displayDesign: snapshot?.design ?? null,
    previewSheets,
    assemblyWarnings,
    updating: !assembly || assembly.key !== key || assembly.showCuts !== showCuts,
    geometryError: error,
    retryGeometry: () => setRetry((value) => value + 1),
  }
}
