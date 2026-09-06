# MGS Master Hub

A fullscreen launcher for the Metal Gear Solid Master Collection, styled after the collection's
own menus. It extracts each game's archive to a per-game folder, shows a screen per game and
launches the title from there.

## Status

Early scaffold. Per-game screens, extraction and launch are being built out task by task; see
`docs/superpowers/specs/2026-09-06-mgs-master-hub-design.md` for the design and
`docs/superpowers/plans/2026-09-06-mvp-hub.md` for the implementation plan.

## Development

```bash
npm install
npm run dev
```

`npm run dev` opens fullscreen by default; set `HUB_WINDOWED=1` to run windowed during
development.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Run the app in development with hot reload |
| `npm run build` | Build the Electron app |
| `npm run typecheck` | Type-check main, preload and renderer |
| `npm run lint` | Lint the codebase |
| `npm run test` | Run the unit test suite (Vitest) |
| `npm run e2e` | Build and run end-to-end tests (Playwright) |
| `npm run dist` | Build and package a Windows installer |

## Requirements

Windows x64, Node 24, npm 11. No game assets are ever committed to this repository.
