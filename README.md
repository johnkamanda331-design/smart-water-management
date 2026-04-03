# Smart Water Management and Pump Control System

## Setup

1. Clone repo:
   ```bash
   git clone https://github.com/YOUR-USERNAME/Smart-Water-and-pump-control.git
   cd Device-Orchestrator
   pnpm install
   ```

2. Configure environment:
   - Vercel env vars: `PORT`, `BASE_PATH`, any API secrets
   - For local development, create `.env.local` as needed.

## Scripts

- `pnpm run lint` - lint with ESLint
- `pnpm run lint:fix` - auto-fix lint issues
- `pnpm run typecheck` - TypeScript build checks
- `pnpm run build` - full build pipeline (typecheck + artifacts build)
- `pnpm run dev` - if leaf workspace has `dev` command (run from each child package)

## Vercel

- `vercel.json` should have `outputDirectory` configured and no conflicting manual `builds` options.
- Routes:
  - `/api/*` -> `artifacts/api-server/src/vercel.ts`
  - `/*` -> `artifacts/water-dashboard` static

## CI

- `.github/workflows/ci.yml` runs on `push`/`pull_request`:
  1. `pnpm install`
  2. `pnpm exec eslint` (lint)
  3. `pnpm run typecheck`
  4. `pnpm run build`

## Notes

- Any remaining IDE "missing types" warnings are local workspace tooling issues; production CI installs dependencies and compiles successfully.
- Keep Tailwind syntax consistent with update recommendations to avoid warnings from Tailwind lint.
