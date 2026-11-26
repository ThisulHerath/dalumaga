# DaluMaga project guidance

DaluMaga tracks tea leaf from collection to factory receipt for a Sri Lankan pilot. The pilot scope is one factory, one route and one vehicle. The system is a work in progress; distinguish implemented behavior from proposed designs in docs/.

## Repository

- `apps/mobile` is the Expo field app; `apps/web` is the React office app.
- `apps/api` is the NestJS backend; `packages/shared` contains shared TypeScript contracts and hardware interfaces.
- `db` holds PostgreSQL SQL; `docs/` contains architecture, UX, assumptions and the proposed API contract.

## Product invariants

- Keep original weighings append-only; corrections must retain the original actor, time and reason.
- Offline events need durable local capture, stable client event IDs and safe retries; receipt may arrive before pickup.
- A reused crate has a distinct load identity for each use. Never invent a comparison for unmatched or incomplete evidence.
- Missing or stale GPS data is never evidence of a stop. Keep fix time separate from server receipt time.
- Keep scale and tracker implementations behind interfaces; make factory rules configurable and support simulators.
- Protect personal data and credentials. Enforce roles and scoped permissions on the server.
- Support Sinhala and English in user-facing workflows. Design field interactions for poor connectivity, sunlight and gloves.
- Fuel alerts, analytics and multiple factories are later-phase work unless the user requests them.

## Engineering workflow

- Use strict TypeScript and existing project conventions. Inspect existing behavior before changing it.
- Treat `docs/ASSUMPTIONS.md` as unverified until evidence confirms a factory practice. State material assumptions.
- Preserve applied migrations; add a forward migration for schema changes.
- Run checks relevant to the change. From the repository root use `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` and `corepack pnpm build` as appropriate.
- Keep changes focused and report what was verified and what remains unverified.

## Project specialists

The registered roles are `backend_database`, `mobile_offline`, `web_dashboard`, `hardware_simulation` and `quality_security`. When delegation is available and authorized, assign independent work with clear boundaries and integrate and verify the results. Ask the reviewer for findings when a review is requested. The main agent remains responsible for the final result.
