# Bentwood

A browser-based design studio for laser-cut bent plywood, built with Vite, React, TypeScript, three.js, and shadcn/ui components. The intended domain is **bentwood.app**. The repository is configured for a static Vercel deployment; hosting and the domain have not been connected yet.

The living-hinge approach is inspired by [Endurance’s flexible plywood guide](https://endurancelasers.com/making-flexible-plywood-using-a-laser/).

## Run locally

Use Node.js 24 LTS with npm. The Node major version is pinned in `package.json` and `.nvmrc`.

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
npm run generate:og # Regenerate the 1200 × 630 social sharing image
```

The browser tests and OG image generator use Playwright. If its Chromium browser is missing, install it with `npx playwright install chromium`, then rerun the command. The OG generator renders the actual plywood preview with the app’s branding, writes `public/og-image.png`, and closes its temporary browser and server. The generated PNG is checked in; Vercel builds do not need a browser.

## Design a panel

1. Choose a starting form, or add straight and curved segments. Select a segment in the diagram or list to edit its length, radius, bend angle, and direction. The segments join tangentially.
2. Choose a rectangle, square, ellipse, circle, triangle, or custom outline. The sheet’s unrolled length comes from the bend path. Panel width runs across the sheet; squares and circles link width to length.
3. For a custom outline, drag vertices, double-click an edge to insert a vertex, or edit the selected point’s millimetre coordinates. The outline must remain a simple polygon.
4. Choose a hinge pattern and set plywood thickness, nominal laser kerf, cut spacing, bridge size, and cut length. Hinge cuts are generated in curved regions. Slit patterns retain staggered internal bridges; Small waves and Honeycomb remove staggered openings to form their interlocking textures.
5. Inspect the 3D form, unfold it with the slider, and review the flat outline and cut plan. Download a sheet of test swatches to try the selected pattern in your plywood. Export the panel as SVG or DXF when ready.

### Hinge patterns

| Pattern         | Geometry and use                                                                                                                                                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Classic**     | The original evenly spaced, straight staggered cuts.                                                                                                                                                                                          |
| **Graded**      | Straight cuts spaced according to each curved segment’s radius. The smallest radius uses the chosen cut spacing; gentler curves use proportionally wider spacing, capped at twice that value. Designs with only one radius look like Classic. |
| **Wavy slits**  | Smoothly undulating cut paths for a flowing texture. Wavelength follows cut length plus bridge size; amplitude is derived from spacing to keep adjacent paths apart.                                                                          |
| **Zigzag**      | Angular cut paths for a geometric texture, using the same staggered bridge layout. Shape dimensions follow the existing cut settings.                                                                                                         |
| **Small waves** | Staggered slender diamond openings. The wood between the openings forms an interlocking wave texture, matching the reference sample.                                                                                                          |
| **Honeycomb**   | Staggered curved openings with pointed ends form the open honeycomb texture in the reference sample.                                                                                                                                          |

**Small waves** follows the staggered, slender diamond openings in Trotec’s **Kerf 2: Small waves** sample. **Honeycomb** follows the curved, tapered openings in **Kerf 3: Large honeycombs**. Both are based on the manufacturer’s [bending technique reference and cutting template](https://www.troteclaser.com/en-us/helpcenter/materials/application-techniques/bending-technique). The openings are oriented across the panel width to suit Bentwood’s bend direction. Closed contours remove their enclosed scrap in the 3D preview; exports include the cut contours, not filled shapes.

For both opening patterns, **cut length** sets each opening’s long axis, **cut spacing** sets the row pitch along the bend, and **bridge** sets the end-to-end gap within a row. Adjacent rows are offset by half the combined cut length and bridge. Small waves openings have a short axis of half the row pitch; Honeycomb openings have a short axis of 15/16 of the row pitch, with curved sides that taper to pointed ends. Selecting either pattern retains the current settings. **Reference proportions** applies the following dimensions:

| Pattern     | Cut spacing | Bridge  | Cut length |
| ----------- | ----------- | ------- | ---------- |
| Small waves | 2.4 mm      | 5.25 mm | 15.75 mm   |
| Honeycomb   | 2.4 mm      | 6.56 mm | 19.68 mm   |

Wavy slits and Zigzag are generated as polylines shared by the flat preview, 3D slots, and exports. Wavy-slit approximation error is bounded by the smaller of 0.01 mm and one quarter of the nominal laser kerf. Every pattern retains connecting material; the preview shows the requested bend but does not predict the force, strength, or minimum radius for a pattern. Test the actual plywood, grain direction, and laser settings before committing to a full panel.

**Test swatches** downloads a 1:1 SVG with nine labeled samples of the selected pattern, varying spacing and bridge size by up to 20% around the current values. The settings panel shows the total sheet size before download. Each sample includes grip tabs; Graded samples include two radii so the spacing difference is visible. Black labels are on the separate `engraving-labels` group and must be assigned an engraving operation in the laser software. Red outlines and blue hinge paths are cuts. Keep the physical dimensions unchanged when importing.

The desktop workspace stays within the viewport, with individual controls scrolling when needed. Smaller screens switch between the design, studio, and material panels.

### Controls and saving

- Drag the 3D preview to orbit, scroll to zoom, and use the camera menu for perspective, top, or front views. Focus the preview and use arrow keys to orbit, `+` / `−` to zoom, and `Home` to reset.
- Focus an outline vertex and use arrow keys to move it; `Delete` / `Backspace` removes it when at least three vertices remain. Numeric coordinate fields offer precise editing.
- `⌘/Ctrl Z` undoes, `⌘/Ctrl Shift Z` redoes, and `⌘/Ctrl S` downloads a project file.
- The current design is saved automatically in browser `localStorage`. Version 3 stores the selected hinge pattern. Existing `wave` projects retain their geometry under the clearer name **Wavy slits**; **Small waves** and **Honeycomb** use the separate `small-wave` and `honeycomb` patterns. Version 1 and 2 projects migrate automatically to Classic; version 1’s former edge margin is replaced with cuts that reach the outline. Use **Save project file** to keep a portable `.bentwood.json` backup and **Open project** to restore one.

There is no backend, account, upload service, or cloud synchronization. Browser storage belongs to the current browser and site address; clearing site data removes the saved design. Download a project before moving between the local app and a hosted domain. If browser storage is unavailable, the app indicates that a download is needed to save.

## Laser exports

SVG and DXF use **millimetres at 1:1 scale**. Import without resizing and verify the dimensions in the laser software.

| Geometry          | SVG                       | DXF                   |
| ----------------- | ------------------------- | --------------------- |
| Exterior          | Red `outer-contour` group | `OUTER_CONTOUR` layer |
| Living-hinge cuts | Blue `hinge-cuts` group   | `HINGE_CUTS` layer    |

Circular and elliptical exteriors are exported as true curves: SVG arc commands, DXF `CIRCLE` / `ELLIPSE` entities. Polygon exteriors use straight edges. DXF declares millimetre insertion units; SVG includes physical dimensions and a matching `viewBox`.

For slit patterns, hinge cuts reach the outline at both ends of each cut column. Internal bridges remain staggered; an end cut can extend by up to one bridge width beyond the nominal cut length to meet the edge. Cut length and bridge size describe distances across the panel width; the actual laser travel along Wavy slits and Zigzag paths is longer. Sections too narrow to accommodate staggered bridges remain uncut and are reported in the design warnings.

Small waves and Honeycomb export closed contours for interior openings and open contour pieces where an opening reaches the panel boundary. Boundary pieces do not add duplicate cuts along the outer contour. Honeycomb’s curves are approximated by the same polylines in the preview, SVG, and DXF.

All exported paths are **laser centre lines**. Nominal kerf is used in the visual preview and design checks; **no kerf compensation is applied to the exported toolpaths**. Set compensation, power, speed, passes, and cutting order in the laser software. Bentwood does not generate machine-specific G-code or estimate cutting time.

Exports are blocked when the nominal kerf is too wide to preserve a bridge or the estimated minimum material between neighboring cuts. Increase spacing or bridge size before exporting. These clearance checks include the slope and amplitude of Wavy slits and Zigzag paths; passing them does not establish a material’s strength or bendability.

## Geometry and physical limits

- The bend path is a sequence of straight lines and circular arcs, measured at the sheet’s neutral axis. Unrolled length is the sum of straight lengths and arc lengths (`radius × angle in radians`).
- The model represents a continuous sheet bent in one direction along that path. It supports developable forms, including concave panel outlines, but not compound curvature, twisting, branching, or multiple joined panels.
- Custom outlines are simple polygons with up to 128 vertices. User-defined interior holes, SVG import, and freehand or Bézier outline curves are not supported; Small waves and Honeycomb generate their own hinge openings. Self-intersecting and degenerate polygons are rejected.
- The 3D surface is tessellated. Circle and ellipse previews use 128 outline vertices; their exported exterior curves remain analytic. Hinge endpoints intersect the actual polygon edges or the analytic circle/ellipse, so exported cuts reach the exported contour.
- The preview preserves neutral-axis length while unfolding. It shows thickness, grain appearance, exposed plywood layers, and laser slots. Slots that meet the edge are subtracted from the contour, including its thickness walls. Above 2,500 cuts or 20,000 polyline segments, it displays every cut as a surface centre line and labels the simplified view; the export still includes the full pattern.
- Material selection changes appearance. It is not a calibrated material model. Strength, glue layers, grain direction, hinge torsion, springback, heat effects, and assembly forces are not simulated.
- Tight-bend, overlapping-path, narrow-span, and ligament warnings are geometric checks, not proof that a panel can be manufactured or will hold its shape. Test a small hinge using the intended plywood and cutter before production.
- Designs are limited to 10,000 mm of path. Patterns estimated above 50,000 cuts or 250,000 toolpath segments are rejected to bound resource use. Imported project files are schema-validated and limited to 1 MB.

## Code map

| File                                | Responsibility                                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/App.tsx`                       | Workspace, design state, undo/redo, local persistence, project files, export dialogs                  |
| `src/lib/types.ts`                  | Versioned project schema and geometry types                                                           |
| `src/lib/geometry.ts`               | Arc-length sampling, outlines, pattern generation, clipped hinge cuts, validation, SVG/DXF generation |
| `src/lib/cut-path.ts`               | Shared cut-path points and drawing helpers                                                            |
| `src/lib/cutout-lattice.ts`         | Staggered Small waves and Honeycomb openings, clipped contours, and material-clearance checks         |
| `src/lib/honeycomb.ts`              | Curved, tapered Honeycomb opening geometry and polyline sampling                                      |
| `src/lib/test-swatches.ts`          | Labeled SVG test sheets with spacing and bridge variations                                            |
| `src/lib/geometry.test.ts`          | Geometry and export regression tests                                                                  |
| `src/lib/panel-surface.ts`          | Kerf subtraction and open-edge boundaries for the 3D mesh                                             |
| `src/components/DesignEditors.tsx`  | Bend-path diagram, custom polygon editing, cut-plan views                                             |
| `src/components/PlywoodPreview.tsx` | three.js mesh deformation, material textures, lighting, camera controls                               |
| `src/components/ui/`                | Local shadcn/ui primitives                                                                            |
| `src/styles.css`                    | Workspace layout, responsive states, visual theme, focus styling                                      |
| `components.json`                   | shadcn/ui configuration                                                                               |

The cut plan, flat editor, and 3D preview share the same design schema and geometry functions. The preview renders on demand and disposes its WebGL resources when unmounted. Without WebGL, editing and exports remain available.

## Deploy to bentwood.app

Import this repository into Vercel and deploy from the repository root. The checked-in `vercel.json` selects Vite, installs the lockfile with `npm ci`, runs `npm run build`, and publishes `dist/`. Use Node.js 24.x in the Vercel project settings. No server runtime, environment variables, API keys, or database are required.

The configuration adds content-type protection, a referrer policy, and frame protection. Vite's hashed files in `/assets/` receive immutable caching; the entry HTML is revalidated so new deployments do not leave browsers on an older application shell. There is no catch-all rewrite: the app currently lives at `/`, and missing assets should return 404 rather than HTML. If URL-based routes are added later, configure their rewrites explicitly.

Open Graph and Twitter metadata are present in `index.html`, with the 1200 × 630 PNG at `/og-image.png`. `robots.txt` and `sitemap.xml` reference the production origin, `https://bentwood.app`. These files are served directly from `public/` and copied into every build.

After deployment, add `bentwood.app` in Vercel's domain settings and apply the DNS records Vercel supplies at the registrar. Verify the domain uses HTTPS and that `/og-image.png`, `/robots.txt`, and `/sitemap.xml` load at the production URL. Repository configuration does not publish the app, register the domain, or alter DNS.

For another static host, run `npm run build` and serve `dist/` with equivalent caching and response headers. See the [Vercel Vite guide](https://vercel.com/docs/frameworks/frontend/vite) and [configuration reference](https://vercel.com/docs/project-configuration/vercel-json) for hosting details.

## License

See [LICENSE](LICENSE).
