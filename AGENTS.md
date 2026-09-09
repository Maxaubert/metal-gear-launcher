# Metal Gear Launcher

## Build, test, release
- Typecheck/lint: `npm run typecheck` and `npm run lint`
- Unit: `npm test`
- E2E (headless): `npm run e2e`    Run when: UI or Electron app-shell changes
- Build / package: `npm run dist`   Artifact: `MetalGearLauncher-Setup-x64-<version>.exe`
- Known failures to tolerate: none
- Version source: `package.json`   Release: release.yml on push to main
- Local test installs must be clean: `pwsh -File scripts/install-clean.ps1` after packaging; confirm ProductVersion.
- This archives launcher data/profile and resets configuration and extracted caches for first-run testing. Imported music and custom sounds are preserved; they are user files, not caches. Never reset Steam/game settings or saves.
- Leave the final local installation unlaunched and clean after verification, unless Ove asks otherwise.
- Deploy: installer via GitHub Releases
- Signing: unsigned

Keep app ID `com.maxaubert.mgsmasterhub` and `%LOCALAPPDATA%\MGSMasterHub\` stable for upgrades.
No Konami assets are committed. Extraction writes only to the hub data folder and its temporary folder.
Validate IPC input with zod and return `{ ok: true, value }` or `{ ok: false, error }`.
Always open a PR; never merge without explicit user approval.
