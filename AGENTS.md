# Repository Guidelines

## Project Structure & Module Organization
- `src/app/`: React frontend (entry in `main.tsx`, shared UI in `components/`). Colours live only in `theme.ts` as light/dark token sets — never hardcode a hex in a component.
- `src/worker/`: Cloudflare Worker backend (HTTP entry, routes, services, jobs).
- `src/shared/`: cross-runtime domain logic and types (for example DNS validation).
- `tests/`: Vitest tests. `tests/*.test.ts` run in Node for shared/backend logic; `tests/ui/*.test.tsx` run in jsdom for component rendering.
- `migrations/`: D1 SQL migrations; keep schema changes here, ordered by prefix (`0001_...sql`).
- `scripts/`: operational scripts (`deploy-prod.sh` for macOS/Linux, `deploy-prod.ps1` for Windows, and the old SQLite migration).
- `OLD/`: legacy artifacts used only for one-time migration input.

## Build, Test, and Development Commands
- `npm run dev`: run Vite frontend locally.
- `npm run worker:dev`: run Worker locally with Wrangler.
- `npm run build`: production frontend build to `dist/client`.
- `npm run typecheck`: strict TypeScript check (`tsc --noEmit`).
- `npm run lint`: ESLint over `src`, `scripts` and `tests`.
- `npm run format`: Prettier write. Keep formatting-only changes in their own commit.
- `npm test`: run Vitest suite once.
- `npm run db:migrate:local`: apply D1 migrations to local database.
- `npm run deploy:dry-run`: validate deploy output without publishing.

## Coding Style & Naming Conventions
- Language: TypeScript (`strict: true`), ES modules, React JSX.
- Indentation: 2 spaces; keep imports grouped and minimal.
- Use `camelCase` for variables/functions, `PascalCase` for React components, and descriptive route/service filenames (for example `routes/admin.ts`, `services/email.ts`).
- Prefer reusable logic in `src/shared/` when needed by both app and worker.
- ESLint (`eslint.config.js`) and Prettier (`.prettierrc.json`) are configured; `npm run typecheck && npm run lint && npm test` is the baseline quality gate.

## Testing Guidelines
- Framework: Vitest, split into two projects (`unit` in Node, `ui` in jsdom) — see `vite.config.ts`.
- Pure/shared logic: `tests/*.test.ts` (example: `tests/dns.test.ts`).
- Component rendering: `tests/ui/*.test.tsx` with Testing Library; stub `fetch` rather than hitting the network.
- jsdom has no layout engine, so `useMediaQuery` needs `window.matchMedia` stubbed to pick a breakpoint.
- Focus tests on policy/validation and pure logic; avoid network-dependent behavior.
- Before opening a PR, run at least: `npm run typecheck && npm run lint && npm test`.

## Commit & Pull Request Guidelines
- Follow existing commit style: Conventional Commit-like prefixes (`feat: ...`, `fix: ...`, `chore: ...`).
- Keep commits scoped; include migration changes in the same commit as related code.
- PRs should include: concise summary, linked issue (if any), test evidence, and notes on env/config or migration impact.
- For UI-affecting changes in `src/app/`, include screenshots.
