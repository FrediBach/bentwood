# Working on Bentwood

Bentwood is a browser-only React/TypeScript studio for laser-cut bent plywood. Read
[docs/architecture.md](docs/architecture.md) for the module map and data contracts, and
[README.md](README.md) for user workflows. There is no backend or cloud persistence.

## Setup and checks

Use Node 24 (`.nvmrc`) and npm with `package-lock.json`. Use `npm ci` for a clean install.

| Command                                    | Purpose                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| `npm run dev`                              | Vite at `127.0.0.1`, normally port 5173.                                 |
| `npm run typecheck`                        | Strict TypeScript checks.                                                |
| `npm test`                                 | Vitest geometry, export, migration, and texture tests in `src/`.         |
| `npx vitest run src/lib/geometry.test.ts`  | Example focused unit-test run; select the affected suites.               |
| `npm run test:e2e -- tests/studio.spec.ts` | Example focused Chromium workflow run; omit the file for the full suite. |
| `npm run build`                            | Typecheck and production build into `dist/`.                             |
| `npm run doctor -- --no-score`             | React Doctor diagnostics without the remote score request.               |

Playwright starts Vite on **5174** with `--strictPort` and may reuse an existing server outside
CI; ensure that server belongs to this checkout. If Chromium is missing, use
`npx playwright install chromium`. There is no `lint` script. React Doctor has documented
false positives for Three.js `Vector3.sub()` and intentional JSON round trips; inspect
findings rather than mechanically rewriting valid code (see README).

Run checks appropriate to the change: typecheck and affected Vitest suites for logic changes;
relevant Playwright specs for UI, persistence, imports/downloads, or preview behavior; build
for dependency/configuration or bundling changes. For documentation-only edits, check links
and formatting. Add regression coverage for geometry, migration, and workflow changes in
the existing relevant suites.
Report what ran and any failures or checks that could not run.

## Put changes in the owning layer

- Keep `App.tsx` as workspace composition. `useStudio.tsx` owns design/history, persistence,
  derived plans, transient UI state, and import/export actions. Route design edits through
  `update`/`patch` to retain validation, undo/redo, autosave, and pointer-edit grouping.
- Put geometric rules and export behavior in `src/lib`, shared by every consumer. Keep
  panel controls in `src/components/studio`, SVG editors in `DesignEditors.tsx`, and Three.js
  scene/mesh lifecycle in `PlywoodPreview.tsx`.
- Use the local UI primitives and existing CSS conventions. Preserve accessible names,
  keyboard editing/camera controls, and mobile panel behavior when changing interactions.
  Numeric controls must retain imported precision when focus/blur occurs without an edit.
- Keep geometry code independent of React and browser UI where possible. SVG parsing and
  the Three.js preview are explicit browser boundaries; don't move DOM dependencies into
  otherwise pure geometry helpers.

## Preserve these contracts

- Dimensions are millimetres. Flat-sheet X is neutral-axis arc distance, Y increases upward;
  persisted custom-outline points are normalized to `[0, 1]`. Segment angles are signed
  degrees, while `samplePath` returns tangent radians. Use `getPanelWidth` for square/circle
  dimensions. Preserve length when unfolding and orientation across preview, SVG, and DXF.
- Share cut geometry through `CutPlan` and `cut-path.ts` helpers. Handle straight and shaped
  cuts, closed contours, open boundary cuts, and `cutouts` (removed areas) distinctly. Do not
  reconstruct exports from a preview mesh or add duplicate exterior cuts to close a cutout.
- Keep laser exports at 1:1 scale with existing SVG groups and DXF layers. Kerf affects
  preview/clearance checks; exported paths remain centre lines without kerf compensation.
  Bend-path export uses fully bent segments independently of laser-pattern clearance.
- Preserve `validateDesign` as the project validation/migration boundary. Schema changes
  need corresponding types, defaults, migrations, and round-trip coverage. Keep the storage
  key `bentwood.design.v1` for existing users; its suffix is not the current schema version.
- Retain file-size, polygon, cut-count, and toolpath-complexity guards. Intensive plan, surface,
  topology, and export work runs in the geometry worker; validation and rendering stay on the
  main thread. Preview simplification must not simplify exported files. Export gating and
  plan generation inspect warning text; audit those consumers when changing warning wording.
- Keep SVG imports detached and restricted to supported geometry. Preserve stale-import
  guards so asynchronous parsing cannot overwrite intervening edits.
- Preserve on-demand rendering and dispose Three.js resources, controls, observers, and
  listeners on replacement/unmount. Check behavior under React Strict Mode and keep the
  non-WebGL editing/export fallback usable.

## Editing conventions

Follow strict TypeScript and the existing Prettier settings: no semicolons, single quotes,
trailing commas, 100-column target. Match nearby import style (`@/` maps to `src/`). Format
only touched files with `npx prettier --write <files>`; the broad `npm run format` rewrites
source/tests/config and does not include `AGENTS.md` or `docs/`.

Do not hand-edit generated `dist/`, `test-results/`, or `tsconfig.tsbuildinfo`. The checked-in
`public/og-image.png` is regenerated with `npm run generate:og` when needed. Keep README user
behavior and architecture documentation aligned with changes to contracts or module ownership.
