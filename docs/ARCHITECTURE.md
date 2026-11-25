# DaluMaga system architecture

Pilot design for one factory, one route and one vehicle. Hardware adapters support remote development with simulated data.

## 1. C4 system context

```mermaid
flowchart LR
  subgraph field["Field users"]
    E["Weighing employee"]
    D["Driver"]
    R["Factory receiver"]
  end
  subgraph office["Office users"]
    T["Dispatcher"]
    M["Manager"]
    A["Admin"]
  end
  S["Digital scale<br/>External device"]
  G["GPS provider<br/>External system"]
  N["Push or SMS gateway<br/>External system"]
  DM["DaluMaga<br/>Software system"]
  E -->|"Records pickup"| DM
  D -->|"Reports custody and breaks"| DM
  R -->|"Records receipt"| DM
  T -->|"Monitors trips"| DM
  M -->|"Reviews differences"| DM
  A -->|"Configures access and rules"| DM
  S -->|"Weight reading"| DM
  G -->|"Vehicle fixes"| DM
  DM -->|"Requests notification"| N
```

- The weighing employee captures pickup weight, the driver acknowledges custody, and the receiver supplies an independent reading. The audit trail records the person acting at each step.
- The scale provides a local reading. The GPS provider supplies timed observations of the assigned vehicle. Neither source decides whether a load is short or a driver stopped.
- The dashboard holds the alert history. Push and SMS draw the on-duty dispatcher’s attention to an alert that already exists there.

## 2. C4 containers

```mermaid
flowchart TB
  Scale["Digital scale<br/>External device"]
  subgraph system["DaluMaga system boundary"]
    Mobile["Field app<br/>React Native and Expo"]
    Local[("Phone store<br/>SQLite")]
    Web["Office app<br/>React"]
    API["Shared API<br/>NestJS"]
    DB[("Operational data and job queue<br/>PostgreSQL")]
    Worker["Background worker<br/>NestJS with GPS and notification adapters"]
    Mobile -->|"Commits events"| Local
    Mobile -->|"Sync over HTTPS"| API
    Web -->|"Query and act over HTTPS"| API
    API -->|"Write events and jobs atomically"| DB
    Worker -->|"Claim jobs and commit results"| DB
  end
  Gps["GPS provider<br/>External system"]
  Gateway["Push or SMS gateway<br/>External system"]
  Scale -->|"Bluetooth"| Mobile
  Worker -->|"Fetch fixes"| Gps
  Worker -->|"Send alerts"| Gateway
```

- One NestJS API serves both clients. The worker runs from the same TypeScript codebase in a separate process so a slow provider cannot hold a weighing request open.
- The job queue lives in PostgreSQL. Insert the event and its job in one transaction. Workers claim jobs with expiring leases, retry failed attempts and make effects idempotent. The pilot avoids operating a second datastore, but queue activity shares database capacity.
- The mobile scale adapter validates units and stability before SQLite commits. A simulated adapter exercises the same path. Simulator records stay isolated from real trips.
- ASSUMPTION A1 covers the GPS transport and notification channels. A provider-specific implementation stays behind an adapter. Clients receive scoped API responses and never receive database credentials.

## 3. Deployment

```mermaid
flowchart TB
  subgraph local["Local development"]
    LClient["Expo build on phone or emulator"]
    subgraph compose["Developer PC - Docker Compose"]
      LWeb["React dev server"]
      LApi["NestJS API"]
      LWorker["Worker with GPS fixture and notification sink"]
      LDb[("PostgreSQL and queue")]
      LWeb --> LApi
      LApi --> LDb
      LWorker --> LDb
    end
    LClient -->|"Reachable local address"| LApi
  end
  subgraph staging["Staging"]
    SClient["Test Android build and staged React site"]
    SApi["Staging API"]
    SWorker["Staging worker with test adapters"]
    SDb[("Staging PostgreSQL and queue")]
    SClient -->|"HTTPS"| SApi
    SApi --> SDb
    SWorker --> SDb
  end
  subgraph production["Production - one factory"]
    PClient["Pilot Android build and production React site"]
    PApi["Production API"]
    PWorker["Production worker with live adapters"]
    PDb[("Production PostgreSQL and queue")]
    PClient -->|"HTTPS"| PApi
    PApi --> PDb
    PWorker --> PDb
  end
  LDb ~~~ SClient
  SDb ~~~ PClient
```

- The mobile build runs on the phone or emulator. Local development can run entirely with a simulated scale, a GPS fixture and a notification sink. Use the physical phone and a compatible development build for Bluetooth verification.
- Promote the same tested backend image to staging and production with separate API and worker entry points. Configure each mobile build and static web site with its own API base URL.
- Each environment has its own database, queue, secrets and recipients. Staging uses test data and test destinations. No record flows from staging into production as part of deployment.
- ASSUMPTION A2 covers hosting. A reachable API and a running worker are required for timely office alerts. A cloud database alone cannot poll GPS or dispatch a notification.

## 4. Offline pickup and later sync

```mermaid
sequenceDiagram
  actor E as Weighing employee
  participant S as Scale adapter
  participant M as Expo app
  participant L as SQLite
  participant A as NestJS API
  participant P as PostgreSQL
  Note over E,L: Offline with a cached trip and authorized operator
  E->>M: Scan crate and select batch
  S-->>M: Stable gross 20 kg and scale ID
  M->>M: Check verified tare 2 kg and compute net 18 kg
  E->>M: Confirm pickup
  M->>L: Commit reading and pending event with UUID
  L-->>M: Durable commit
  M-->>E: Saved on phone - pending sync
  Note over M,P: Connectivity returns
  M->>A: Submit event with original ID and occurrence time
  A->>A: Authorize actor and validate payload
  A->>P: Atomically accept ID or inspect existing payload
  alt New valid event
    P-->>A: Reading and reconciliation job committed
    A-->>M: Accepted with event ID
    M->>L: Mark synced
  else Same ID and same payload
    P-->>A: Previously committed result
    A-->>M: Original acknowledgement
    M->>L: Mark synced
  else Same ID with different payload
    A-->>M: Conflict
    M->>L: Keep event for review
  end
```

- The SQLite transaction records load, batch, crate, scale, gross, tare, actor and original capture time. Show success after the commit. Missing or unverified tare leaves the net weight unverified.
- A retry uses the same event UUID even after a restart, handover or lost acknowledgement. A PostgreSQL unique constraint and transaction prevent duplicate readings and jobs under concurrent retries.
- The server also records its receipt time. Reconciliation uses original event time and flags suspect device clocks. Transport errors leave the item pending for another attempt.

## 5. Factory receipt arrives before pickup

```mermaid
sequenceDiagram
  actor R as Factory receiver
  participant F as Factory mobile app
  participant A as NestJS API
  participant P as PostgreSQL and queue
  participant M as Pickup mobile app
  participant W as Worker
  R->>F: Scan crate and confirm independent receipt
  F->>A: Sync receipt R1 with load reference and net 15 kg
  A->>P: Commit R1 and queue reconciliation
  A-->>F: Receipt accepted
  W->>P: Claim job and read load evidence
  P-->>W: Receipt only
  W->>P: Record Awaiting pickup
  Note over F,P: Intake can continue
  M->>A: Later sync pickup P1 with same load and net 18 kg
  A->>P: Commit P1 and queue another reconciliation
  W->>P: Lock load and read latest effective readings
  alt Complete matching unit and approved tolerance
    W->>W: Compute receipt minus pickup
    W->>P: Save difference of minus 3 kg and rule version
    opt Absolute difference exceeds tolerance
      W->>P: Open one weight review for this discrepancy
    end
  else Incomplete group or unverified evidence
    W->>P: Keep comparison unresolved with reason
  end
```

- ASSUMPTION A3 covers the handover reference. A reusable crate QR alone cannot identify a particular loading. If no reliable match exists, save the receipt for matching and keep it out of shortage calculations.
- A receipt can establish physical delivery before pickup evidence reaches the office. The missing weight stays unknown. For grouped intake, compare only a complete matched group under the approved rule.
- Serialize reconciliation per comparison unit and re-read committed evidence inside the lock. Replayed jobs update the same result. An authorized correction appends a revision and triggers a new evaluation with the previous evidence retained.

## 6. Late-delivery alert

```mermaid
sequenceDiagram
  participant G as GPS provider
  participant W as Background worker
  participant P as PostgreSQL and queue
  participant N as Push or SMS gateway
  participant D as Dispatcher
  participant A as Office app and API
  W->>G: Request fixes through adapter
  G-->>W: Timestamped fixes or no new data
  W->>P: Save valid observations and schedule ETA check
  W->>P: Load active batch, rule, route and last valid fix
  alt Missing deadline or stale ETA inputs
    W->>P: Mark deadline or prediction unavailable
  else Fresh inputs for agreed milestone
    W->>W: Estimate arrival using remaining travel and dwell
    alt ETA later than deadline
      W->>P: Upsert open late-risk episode and queue first notification atomically
      opt Newly queued notification
        W->>N: Send message referencing alert ID
        N-->>D: Deliver notification when channel is available
      end
      D->>A: Open and acknowledge alert
      A->>P: Record dispatcher, acknowledgement time and action
    else ETA at or before deadline
      W->>P: Save estimate and update existing episode if needed
    end
  end
```

- Evaluate each onboard batch against its own deadline and configured completion milestone. Re-evaluate on a schedule and on changes to route, receipt or timing rules. Any equality is on time for this comparison.
- A committed new episode queues one initial notification. Later predictions refresh that episode. Retry failed channel delivery and reuse a provider idempotency key when supported. The dashboard can show the alert even if a phone notification fails.
- The office shows the age of the last valid fix. Missing GPS supports neither an unexplained stop nor a fresh ETA. Retain prior warnings as history and show their current evidence quality.
- Provider acceptance and human acknowledgement have separate timestamps. When the agreed completion event arrives, record actual timing and retire the active prediction.

## 7. Batch state

```mermaid
stateDiagram-v2
  [*] --> Batch
  state Batch {
    [*] --> Planned
    Planned --> Collected : pickup confirmed
    Collected --> InTransit : driver accepts handover
    InTransit --> Received : completion milestone recorded
    Collected --> Received : receipt before handover sync
    Planned --> Received : receipt syncs first
    state "In transit" as InTransit
    --
    [*] --> Clear
    Clear --> Flagged : first review case opens
    Flagged --> Flagged : more evidence or another case
    Flagged --> Resolved : all cases closed with decisions
    Resolved --> Flagged : new case opens
  }
```

- Delivery and review run in parallel. A batch can be both **In transit** and **Flagged** for late risk, or both **Received** and **Flagged** for a weight difference.
- When a full-batch receipt syncs first, the lifecycle can move directly to Received. Earlier pickup and handover events later complete its history without moving the lifecycle backward. A partial receipt keeps the batch open.
- Clear means no open or previously resolved review. Resolved means every open case has a recorded decision. Keep review history after receipt so a later approved correction can reopen a case.

## Assumptions to verify

- **ASSUMPTION A1 · Providers.** The diagrams select a pull-based GPS adapter as the starting design. Confirm access, protocol, device assignments, timestamps and freshness with the GPS provider. Push/SMS capabilities, consent, delivery receipts and retry support depend on the selected gateway.
- **ASSUMPTION A2 · Hosting.** Staging and production are proposed deployment targets. Confirm hosting and costs for a static web site, reachable API, persistent worker and separate PostgreSQL stores before the field pilot.
- **ASSUMPTION A3 · Offline matching.** Both sites can obtain a durable loading reference before the pickup event syncs, such as a pre-issued manifest reference. Confirm the handover workflow and actual weighing granularity with the receiver. Keep unmatched receipts available for authorized review.

Syntax references: [Mermaid C4 diagrams](https://mermaid.js.org/syntax/c4.html) and [GitHub Mermaid rendering](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams#creating-mermaid-diagrams).
