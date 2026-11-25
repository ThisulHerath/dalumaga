# DaluMaga shared Zod contracts

Use the component names in the [OpenAPI contract](openapi.yaml) as public schema names. Export their TypeScript types using `z.infer`. Validate all wire values at NestJS boundaries and validate responses on the clients. Only import the modules a client needs.

- **`packages/shared/src/contracts/common.ts`** — `Role`, `WeightGrams`, `EventId`, `StopReason`, `Stage`, `AlertKind`, `ErrorDetail`, `Error`.
- **`packages/shared/src/contracts/auth.ts`** — `LoginRequest`, `RefreshRequest`, `TokenPair`.
- **`packages/shared/src/contracts/fleet.ts`** — `CrateCreate`, `TareCreate`, `Tare`, `Crate`, `TripCreate`, `Trip`, `BatchCreate`, `Batch`, `LoadCreate`, `Load`, `Milestone`, `BatchCompletion`.
- **`packages/shared/src/contracts/sync.ts`** — `ClockEvidence`, `FieldEvent`, `SyncBatch`, `SyncSuccess`, `SyncProblem`, `SyncResult`, `SyncResponse`, `WeighBody`, `HandoverBody`, `StopBody`, `ResumeBody`, `CorrectionBody`, `DecisionBody`, `WeighUpload`, `HandoverUpload`, `StopUpload`, `ResumeUpload`, `CorrectionUpload`, `DecisionUpload`, `StopUploadRequest`.
- **`packages/shared/src/contracts/operations.ts`** — `WeighEvent`, `CorrectionRecord`, `StopEvent`, `GpsFix`, `GpsBatch`, `GpsResult`, `GpsResponse`.
- **`packages/shared/src/contracts/office.ts`** — `DeadlineRow`, `VehicleRow`, `WeightComparison`, `Alert`, `AlertResolution`, `Ack`.
- **`packages/shared/src/contracts/pagination.ts`** — `CratePage`, `TripPage`, `BatchPage`, `LoadPage`, `WeighEventPage`, `CorrectionRecordPage`, `StopEventPage`, `DeadlineRowPage`, `VehicleRowPage`, `WeightComparisonPage`, `AlertPage`.

Use a shared page factory for the eleven page schemas, a discriminated union on `kind` for field events, and strict object parsing for immutable versioned envelopes. Encode the nullable tare pair, GPS coordinate bounds, clock timestamps, and batch-start quality checks in Zod. For sync: first validate only the outer structure, count and unique item IDs, then safe-parse each addressable item independently with FieldEvent. This preserves per-event outcomes for malformed payloads. GPS ingestion uses the same two-stage approach keyed by source_key.

Keep role/assignment decisions, token signing and storage, database entities, retry scheduling, verification of scale evidence, notification secrets and correction revision locking in their owning services. A shared validation schema establishes shape; it cannot authorize a correction or certify a scale.

## Assumptions to confirm

- **ASSUMPTION A1:** A username/password login issues a device-bound rotating refresh token and a user access JWT. The GPS adapter uses a separate service credential.
- **ASSUMPTION A2:** Pilot sync limits are 50 events and 128 KiB per request. GPS ingestion accepts up to 500 fixes. Page size defaults to 25 with a maximum of 100.
- **ASSUMPTION A3:** The listed roles are proposed eligible roles. Managers must confirm delegated authorities for tare verification, corrections and alert review before live use.
- **ASSUMPTION A4:** Pre-issued trip, batch and load identities are available at both sites. One factory timezone and a single vehicle assignment apply to the pilot.
- **ASSUMPTION A5:** Read projections, refresh sessions, generic HTTP idempotency keys, immutable original-envelope receipts, the remaining typed event handlers and alert audit actions will be implemented in NestJS and persistence migrations. The existing PostgreSQL schema supplies the initial weighing write and core records.
