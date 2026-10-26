import { validateDesign } from '../../lib/geometry'
import type { Design } from '../../lib/types'

export function ProjectInputs({
  fileInput,
  update,
  setSelectedId,
  setResetKey,
  setNotice,
  svgInput,
  importOutline,
}: {
  fileInput: React.RefObject<HTMLInputElement | null>
  update: (next: Design) => void
  setSelectedId: React.Dispatch<React.SetStateAction<string | null>>
  setResetKey: React.Dispatch<React.SetStateAction<number>>
  setNotice: React.Dispatch<React.SetStateAction<string>>
  svgInput: React.RefObject<HTMLInputElement | null>
  importOutline: (file: File) => Promise<void>
}) {
  return (
    <>
      <input
        className="sr-only"
        ref={fileInput}
        type="file"
        accept=".json,.bentwood.json"
        aria-label="Import project file"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (!file) return
          try {
            if (file.size > 1_000_000) throw new Error('File is too large.')
            const parsed = validateDesign(JSON.parse(await file.text()))
            if (!parsed) throw new Error('This is not a valid Bentwood project.')
            update(parsed)
            setSelectedId(null)
            setResetKey((k) => k + 1)
            setNotice('Project opened.')
          } catch (err) {
            setNotice(err instanceof Error ? err.message : 'Could not open this project.')
          }
          e.target.value = ''
        }}
      />
      <input
        ref={svgInput}
        type="file"
        hidden
        accept=".svg,image/svg+xml"
        aria-label="Import SVG outline file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) void importOutline(file)
        }}
      />
    </>
  )
}
