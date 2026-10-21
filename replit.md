# Pinnacle Intelligence System

A property-intelligence workspace for Pinnacle Estate Surveyors to ingest reports, verify extracted evidence, manage property records, and generate comparable packages.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/pinnacle-pis run dev` — run the PIS web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — apply the PIS schema to the configured Supabase database
- `pnpm --filter @workspace/db run secure-pis` — enable row-level security on PIS tables
- Required env: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `OPENAI_API_KEY`, `PIS_INITIAL_ADMIN_EMAIL`, and the App Storage variables provisioned by Replit

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Web: React, Vite, Tailwind CSS, React Query, Wouter, Recharts
- API: Express 5
- DB and auth: Supabase PostgreSQL + Supabase Auth, accessed server-side with Drizzle and `@supabase/supabase-js`
- AI extraction and evidence commentary: OpenAI Node SDK
- Source document bytes: Replit App Storage
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/pinnacle-pis/src` — PIS web application
- `artifacts/api-server/src/routes` — authenticated PIS API routes
- `lib/api-spec/openapi.yaml` — API contract source of truth
- `lib/db/src/schema` — Drizzle schema for PIS records, documents, evidence packages, users, and audit activity
- `.local/skills/object-storage` — App Storage upload and serving conventions

## Architecture decisions

- PIS uses Supabase for both Auth and PostgreSQL because that backend was explicitly selected for this app.
- The API validates Supabase sessions and roles server-side; session tokens use HTTP-only cookies.
- New accounts default to Viewer. Only the configured `PIS_INITIAL_ADMIN_EMAIL` receives the initial Admin role.
- Uploaded documents are stored privately in App Storage; only file paths and structured metadata are stored in PostgreSQL.
- AI extraction is a draft until a Senior Surveyor or Admin approves it; AI output is not treated as verified evidence.

## Product

- Dashboard analytics and recent audit activity
- Document upload, PDF/DOCX text extraction, AI-assisted field extraction, and human review
- Searchable valuation, construction-cost, and housing evidence
- Comparable-backed evidence packages with AI-generated draft commentary
- Role-aware team invitations, permissions, and audit history

## User preferences

- Build the Pinnacle Intelligence System for Pinnacle Estate Surveyors.
- Use Supabase for app data and authentication.
- Use OpenAI for document extraction and evidence commentary.

## Gotchas

- The API server requires the Supabase/OpenAI secrets and App Storage configuration at startup.
- Run API codegen after any OpenAPI changes and before compiling routes that use generated Zod schemas.
- Apply schema changes to the configured external Supabase database with `pnpm --filter @workspace/db run push`; the Replit-managed database is not the PIS database.
- Keep the initial Admin email configured before the first account is created.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
