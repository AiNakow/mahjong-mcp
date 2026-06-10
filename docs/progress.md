# Progress Log

## 2026-06-10

- Completed initial inspection. The repository currently contains `IMPLEMENTATION_PLAN.md` and the reference implementation `paili.py`; there is no existing TypeScript project configuration.
- Completed the first TypeScript rewrite of `paili.py` in `src/hand/paili.ts`, including tile parsing, validation, block DP shanten calculation, waits, good-shape counting, and discard analysis.
- Added minimal TypeScript project files: `package.json` and `tsconfig.json`. The project declares a `check` script for `tsc --noEmit`, but dependencies have not been installed yet.
- Installed the declared TypeScript dependency, generated `package-lock.json`, and verified `npm run check` passes.
- Added `src/hand/paili-cli.ts` and verified `npm run paili -- 3456m3455p123788s` runs successfully.
- Compared TypeScript outputs against `paili.py` for representative standard, chiitoi, kokushi, draw, and discard cases; key results matched.
- Added `.gitignore` entries for local generated directories `node_modules/` and `__pycache__/`.
- Completed a coverage audit against `IMPLEMENTATION_PLAN.md`: current implementation mainly covers tile parsing plus M2 shanten/waits/discard analysis, with a thin CLI wrapper; scoring, strategy, vision, service, HTTP, MCP, and tool adapters remain unimplemented.
- Added initial core model modules under `src/core/`: tile encoding/parsing, Counts34 helpers, minimal rules, game state types, and action types.
- Refactored `src/hand/paili.ts` to reuse core tile/count definitions and added lower-level `analyzeCounts` plus `analyzeTiles` entry points while keeping `analyzeHand` compatible.
- Added Node built-in test coverage in `tests/paili.test.ts` for core tile/count conversion and representative paili analysis cases, plus an `npm test` script.
- After `@types/node` was installed by the user, verified `npm run check` and `npm test` both pass. The test suite currently has 7 passing tests.
