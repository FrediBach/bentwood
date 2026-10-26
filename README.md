# Bentwood

A browser-based design studio for laser-cut bent plywood, built with Vite, React, TypeScript, three.js, and shadcn/ui components. The intended domain is **bentwood.app**. This repository is a local application; no hosting or domain connection has been configured.

The living-hinge approach is inspired by [Endurance’s flexible plywood guide](https://endurancelasers.com/making-flexible-plywood-using-a-laser/).

## Run locally

Use Node.js 22.12 or later on an LTS release, with npm.

```sh
npm install
npm run dev
```

Open the URL printed by Vite, normally **http://127.0.0.1:5173**. If that port is occupied, Vite tries the next available port, such as **5174**.

```sh
npm run typecheck  # TypeScript checks
npm test           # Geometry and export tests
npm run test:e2e   # Browser workflows and accessibility checks
npm run build      # Typecheck and production build in dist/
npm run preview    # Serve the production build locally
```

The browser tests use Playwright. If its Chromium browser is missing, install it with `npx playwright install chromium`, then rerun the tests.

## Design a panel

1. Choose a starting form, or add straight and curved segments. Select a segment in the diagram or list to edit its length, radius, bend angle, and direction. The segments join tangentially.
2. Choose a rectangle, square, ellipse, circle, triangle, or custom outline. The sheet’s unrolled length comes from the bend path. Panel width runs across the sheet; squares and circles link width to length.
3. For a custom outline, drag vertices, double-click an edge to insert a vertex, or edit the selected point’s millimetre coordinates. The outline must remain a simple polygon.
4. Set plywood thickness, nominal laser kerf, cut spacing, bridge size, cut length, and edge margin. Staggered hinge cuts are generated in curved regions and clipped to the panel outline.
5. Inspect the 3D form, unfold it with the slider, and review the flat outline and cut plan. Export SVG or DXF when ready.

The desktop workspace stays within the viewport, with individual controls scrolling when needed. Smaller screens switch between the design, studio, and material panels.

### Controls and saving

- Drag the 3D preview to orbit, scroll to zoom, and use the camera menu for perspective, top, or front views. Focus the preview and use arrow keys to orbit, `+` / `−` to zoom, and `Home` to reset.
- Focus an outline vertex and use arrow keys to move it; `Delete` / `Backspace` removes it when at least three vertices remain. Numeric coordinate fields offer precise editing.
- `⌘/Ctrl Z` undoes, `⌘/Ctrl Shift Z` redoes, and `⌘/Ctrl S` downloads a project file.
- The current design is saved automatically in browser `localStorage`. Use **Save project file** to keep a portable `.bentwood.json` backup and **Open project** to restore one.

There is no backend, account, upload service, or cloud synchronization. Browser storage belongs to the current browser and site address; clearing site data removes the saved design. Download a project before moving between the local app and a hosted domain. If browser storage is unavailable, the app indicates that a download is needed to save.

## Laser exports

SVG and DXF use **millimetres at 1:1 scale**. Import without resizing and verify the dimensions in the laser software.

| Geometry          | SVG                       | DXF                   |
| ----------------- | ------------------------- | --------------------- |
| Exterior          | Red `outer-contour` group | `OUTER_CONTOUR` layer |
| Living-hinge cuts | Blue `hinge-cuts` group   | `HINGE_CUTS` layer    |

Circular and elliptical exteriors are exported as true curves: SVG arc commands, DXF `CIRCLE` / `ELLIPSE` entities. Polygon exteriors use straight edges. DXF declares millimetre insertion units; SVG includes physical dimensions and a matching `viewBox`.

All exported paths are **laser centre lines**. Nominal kerf is used in the visual preview and design checks; **no kerf compensation is applied to the exported toolpaths**. Set compensation, power, speed, passes, and cutting order in the laser software. Bentwood does not generate machine-specific G-code or estimate cutting time.

## Geometry and physical limits

- The bend path is a sequence of straight lines and circular arcs, measured at the sheet’s neutral axis. Unrolled length is the sum of straight lengths and arc lengths (`radius × angle in radians`).
- The model represents a continuous sheet bent in one direction along that path. It supports developable forms, including concave panel outlines, but not compound curvature, twisting, branching, or multiple joined panels.
- Custom outlines are simple polygons with up to 128 vertices. Interior holes, SVG import, and freehand or Bézier outline curves are not supported. Self-intersecting and degenerate polygons are rejected.
- The 3D surface is tessellated. Circle and ellipse previews use 128 outline vertices; their exported exterior curves remain analytic. Hinge placement uses the sampled outline conservatively.
- The preview preserves neutral-axis length while unfolding. It shows thickness, grain appearance, exposed plywood layers, and laser slots. Above 2,500 slots, it displays every slot as a surface centre line and labels the simplified view; the export still includes the full pattern.
- Material selection changes appearance. It is not a calibrated material model. Strength, glue layers, grain direction, hinge torsion, springback, heat effects, and assembly forces are not simulated.
- Tight-bend, overlapping-path, margin, and ligament warnings are geometric checks, not proof that a panel can be manufactured or will hold its shape. Test a small hinge using the intended plywood and cutter before production.
- Designs are limited to 10,000 mm of path and patterns estimated above 50,000 cuts are rejected to bound resource use. Imported project files are schema-validated and limited to 1 MB.

## Code map

| File                                | Responsibility                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| `src/App.tsx`                       | Workspace, design state, undo/redo, local persistence, project files, export dialogs |
| `src/lib/types.ts`                  | Versioned project schema and geometry types                                          |
| `src/lib/geometry.ts`               | Arc-length sampling, outlines, clipped hinge cuts, validation, SVG/DXF generation    |
| `src/lib/geometry.test.ts`          | Geometry and export regression tests                                                 |
| `src/components/DesignEditors.tsx`  | Bend-path diagram, custom polygon editing, cut-plan views                            |
| `src/components/PlywoodPreview.tsx` | three.js mesh deformation, material textures, lighting, camera controls              |
| `src/components/ui/`                | Local shadcn/ui primitives                                                           |
| `src/styles.css`                    | Workspace layout, responsive states, visual theme, focus styling                     |
| `components.json`                   | shadcn/ui configuration                                                              |

The cut plan, flat editor, and 3D preview share the same design schema and geometry functions. The preview renders on demand and disposes its WebGL resources when unmounted. Without WebGL, editing and exports remain available.

## Deploy to bentwood.app

Build with `npm run build`, then serve the contents of `dist/` on any static host. No server runtime, environment variables, API keys, or database are required. The app uses a single entry page; configure an `index.html` fallback if the hosting platform requires one for SPAs.

Add `bentwood.app` to the selected hosting service, apply that provider’s DNS records at the domain registrar, and enable HTTPS. The HTML already includes the intended canonical URL, branding, and metadata. Creating the repository does not register the domain or alter DNS.

## License

See [LICENSE](LICENSE).
