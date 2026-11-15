# Craft

Kaff’s crayon shelf: a box of crayons to draw with, at [craft.kaffinated.com](https://craft.kaffinated.com).

Standalone React/Vite microsite (`npm run dev` / `npm run build → dist`), split out of the [kaffinated](https://github.com/kgrochon/kaffinated) portfolio site, which links to it.

### Development

Requires Node ≥ 22.12 (see `.nvmrc`).

| Script                 | Purpose                          |
| ---------------------- | -------------------------------- |
| `npm run dev`          | Start the Vite dev server        |
| `npm run build`        | Type-check and build to `dist/`  |
| `npm run typecheck`    | Type-check only (`tsc -b`)       |
| `npm run lint`         | Lint with ESLint                 |
| `npm run format`       | Format all files with Prettier   |
| `npm run format:check` | Check formatting without writing |

### Layout

- `src/crayons/` — the shelf, the box, the tray, the paper and the sharpener. `tip.ts` is the wear model; `crayonRender.ts` lays the wax down.
- `src/styles/global.css` — fonts, a few tokens and a reset. Everything else the page looks like is in `src/crayons/crayons.css`.
- `docs/` — the screen-reader accessibility plan.

### Vercel / custom domain

`vercel.json` rewrites every path to `/`, so the app deploys as an SPA at the domain root. Connect the repo as a Vercel project and add `craft.kaffinated.com` under its domains.

### Fonts

Apfel Grotezk and Alfphabet are bundled under `src/assets/fonts/` with their licences. Chewy and Gochi Hand come from Fontsource.
