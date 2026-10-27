export function ProjectInputs({
  fileInput,
  importProject,
  svgInput,
  importOutline,
}: {
  fileInput: React.RefObject<HTMLInputElement | null>
  importProject: (file: File) => Promise<void>
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
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) void importProject(file)
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
