# Repository Guidelines

## Project Structure
- `src/` TypeScript source for the CLI, services, tools, and dashboard server.
- `test/` Node `node:test` suites (`*.test.ts`).
- `scripts/` maintenance utilities (profile export/import, DB optimize, memory monitoring).
- `web/` dashboard assets; `dist/` compiled output (`pnpm build`).
- `database/`, `shed/`, `logs/` local data/runtime state (not source-controlled).
- `README.md` and `TECH_SPEC.md` are the primary product and architecture references.

## Build, Test, and Development Commands
- `pnpm install` installs dependencies (Node >= 22).
- `pnpm build` compiles TypeScript to `dist/`.
- `pnpm dev` runs the app via `tsx` on `src/index.ts`.
- `pnpm start` runs the compiled CLI from `dist/index.js`.
- `pnpm dashboard` starts the dashboard server from `dist/dashboard.js`.
- `pnpm typecheck` runs `tsc --noEmit`.
- Tests are executed with Node’s built-in runner. Example: `node --test --import tsx test/*.test.ts`

## Coding Style & Naming Conventions
- TypeScript, ESM modules, and `.js` extensions in import paths (see `src/index.ts`).
- 2-space indentation, semicolons, and explicit types where helpful.
- Prefer `PascalCase` for classes, `camelCase` for functions/variables.
- Tools live in `src/tools/` and are registered in `src/tools/index.ts`.

## Testing Guidelines
- Framework: `node:test` with `assert/strict`.
- Keep tests colocated in `test/` and name files `*.test.ts`.
- When adding features, add coverage for both CLI/tool behavior and service-layer logic.

## Commit & Pull Request Guidelines
- Commit messages follow a conventional style in history: `feat: ...`, `fix: ...`.
- PRs should include a short summary, testing evidence (commands + results), and any new config/env requirements.
- For dashboard/UI changes, include screenshots or a brief GIF.

## Security & Configuration Tips
- Copy `.env.example` to `.env`; do not commit `.env`.
- Keep `DASHBOARD_HOST=localhost` unless using `BARTLEBY_ALLOWED_IPS` and a token.
- `./scripts/security-audit.sh` performs a quick hardening check.
