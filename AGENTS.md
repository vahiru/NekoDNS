# Repository Guidelines

## Project Structure & Module Organization
- `src/app/`: React frontend (entry in `main.tsx`, shared UI in `components/`).
- `src/worker/`: Cloudflare Worker backend (HTTP entry, routes, services, jobs).
- `src/shared/`: cross-runtime domain logic and types (for example DNS validation).
- `tests/`: Vitest tests (`*.test.ts`) for shared and backend-safe logic.
- `migrations/`: D1 SQL migrations; keep schema changes here, ordered by prefix (`0001_...sql`).
- `scripts/`: operational scripts (deployment and old SQLite migration).
- `OLD/`: legacy artifacts used only for one-time migration input.

## Build, Test, and Development Commands
- `npm run dev`: run Vite frontend locally.
- `npm run worker:dev`: run Worker locally with Wrangler.
- `npm run build`: production frontend build to `dist/client`.
- `npm run typecheck`: strict TypeScript check (`tsc --noEmit`).
- `npm test`: run Vitest suite once.
- `npm run db:migrate:local`: apply D1 migrations to local database.
- `npm run deploy:dry-run`: validate deploy output without publishing.

## Coding Style & Naming Conventions
- Language: TypeScript (`strict: true`), ES modules, React JSX.
- Indentation: 2 spaces; keep imports grouped and minimal.
- Use `camelCase` for variables/functions, `PascalCase` for React components, and descriptive route/service filenames (for example `routes/admin.ts`, `services/email.ts`).
- Prefer reusable logic in `src/shared/` when needed by both app and worker.
- No dedicated lint/format script is configured; use `npm run typecheck` as the baseline quality gate.

## Testing Guidelines
- Framework: Vitest.
- Put tests in `tests/` with `*.test.ts` suffix (example: `tests/dns.test.ts`).
- Focus tests on policy/validation and pure logic; avoid network-dependent behavior.
- Before opening a PR, run at least: `npm run typecheck && npm test`.

## Commit & Pull Request Guidelines
- Follow existing commit style: Conventional Commit-like prefixes (`feat: ...`, `fix: ...`, `chore: ...`).
- Keep commits scoped; include migration changes in the same commit as related code.
- PRs should include: concise summary, linked issue (if any), test evidence, and notes on env/config or migration impact.
- For UI-affecting changes in `src/app/`, include screenshots.
