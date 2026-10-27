import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import { GeometryClient } from '../lib/geometry-client'
import { geometryKey, topologyKey, type PreparedGeometry } from '../lib/geometry-jobs'
import type { Design } from '../lib/types'

type Snapshot = PreparedGeometry & { design: Design; key: string; showCuts: boolean }

export function useGeometry(design: Design, showCuts: boolean) {
  const client = useRef<GeometryClient | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const key = geometryKey(design)
  // Keep appearance/name changes out of the worker, including while geometry is pending.
  const latestDesign = useRef(design)
  useEffect(() => {
    latestDesign.current = design
  }, [design])
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
    // Let direct input paint and collapse a burst of edits before starting expensive work.
    const timer = setTimeout(() => {
      const requested = latestDesign.current
      client.current!.prepare(requested, showCuts).then(
        (result) => {
          if (current)
            startTransition(() =>
              setSnapshot((previous) => ({
                ...result,
                geometry:
                  previous &&
                  previous.showCuts === showCuts &&
                  topologyKey(previous.design) === topologyKey(requested)
                    ? previous.geometry
                    : result.geometry,
                design: requested,
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
  const displayDesign = useMemo(
    () => (snapshot ? { ...snapshot.design, name: design.name, material: design.material } : null),
    [snapshot, design.name, design.material],
  )
  return {
    client,
    snapshot,
    displayDesign,
    updating: !snapshot || snapshot.key !== key || snapshot.showCuts !== showCuts,
    geometryError: error,
    retryGeometry: () => setRetry((value) => value + 1),
  }
}
