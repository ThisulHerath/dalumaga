# DaluMaga · Offline sync design

**Invariant:** A phone may send an event many times. PostgreSQL commits its business effect once. One trip and one crate loading are provisioned before the run. The receiver and weighing employee use the same **load ID**, independent **event IDs**, and separate identities.

## 1. Phone storage and capture

Use Expo SQLite. Run the connection pragmas on opening each database. Cache assignments, both language packs, crate/load references, scale and tare evidence before departure. Keep unsent records across sign-out and app upgrades. Store tokens in platform secure storage. A shared phone unlocks only the current account’s records. On a new installation, reconcile outstanding records on the old device before retiring it.

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;

-- One private database per enrolled account on this installation.
CREATE TABLE assignment (
  trip_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL,
  revision TEXT NOT NULL, offline_until TEXT NOT NULL
);
CREATE TABLE assigned_load (
  load_id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES assignment,
  batch_id TEXT NOT NULL, crate_id TEXT NOT NULL, qr_code TEXT NOT NULL,
  tare_id TEXT, tare_g INTEGER CHECK (tare_g > 0),
  tare_info_json TEXT NOT NULL -- validity, condition and verification source
);
CREATE INDEX load_lookup ON assigned_load(trip_id, qr_code);
CREATE TABLE event_log (
  local_seq INTEGER PRIMARY KEY AUTOINCREMENT,
  client_event_id TEXT NOT NULL UNIQUE, actor_id TEXT NOT NULL,
  device_id TEXT NOT NULL, trip_id TEXT NOT NULL REFERENCES assignment,
  kind TEXT NOT NULL CHECK(kind IN
    ('weigh','handover','stop','resume','correction','decision')),
  occurred_at TEXT NOT NULL, -- UTC ISO 8601 as observed by phone
  clock_json TEXT NOT NULL, -- clock quality, last time sample and boot context
  depends_on TEXT, -- server event ID; may originate on another phone
  envelope_json TEXT NOT NULL -- complete immutable v1 wire envelope
);
CREATE TRIGGER event_no_edit BEFORE UPDATE ON event_log
BEGIN SELECT RAISE(ABORT,'Append a correction'); END;
CREATE TABLE outbox (
  event_id TEXT PRIMARY KEY REFERENCES event_log(client_event_id),
  state TEXT NOT NULL CHECK(state IN
    ('pending','sending','retry','blocked','conflict','rejected','synced')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  next_try_ms INTEGER NOT NULL DEFAULT 0,
  lease_id TEXT, last_code TEXT, server_received_at TEXT,
  CHECK((state='sending') = (lease_id IS NOT NULL)),
  CHECK(state <> 'synced' OR server_received_at IS NOT NULL)
);
CREATE INDEX sendable ON outbox(state,next_try_ms);
CREATE TRIGGER protect_unacked BEFORE DELETE ON event_log
WHEN EXISTS (SELECT 1 FROM outbox WHERE event_id=OLD.client_event_id
             AND state <> 'synced')
BEGIN SELECT RAISE(ABORT,'Unacknowledged event'); END;
```

The event itself is the local weighing record. In one SQLite transaction insert the event plus its outbox row; render the local trip screen from committed events. A save failure rolls both inserts back. Cache refreshes must preserve referenced trips and load identities. Only the retention task may remove acknowledged cache rows under the approved policy, in one transaction. Never use queue deletion to resolve a conflict.

Generate a cryptographically random **UUIDv4** once at capture. The existing PostgreSQL UUID column accepts it. UUIDv7 would also fit, but the pilot needs neither time-sorted keys nor a second source of apparent chronology. Never derive identity from crate ID, weight, phone time or a retry counter. Persist loads and events as separate identities.

## 2. Wire contract and time

Proposed endpoint: `POST /v1/sync/events`. Authenticate the installation and operator over HTTPS. Each request contains a version and an array of frozen envelopes. A batch ID is useful for tracing only. Example fields for **one** event (symbolic IDs below stand for UUIDs):

```json
{
  "v": 1, "client_event_id": "E1", "kind": "weigh",
  "actor_id": "U1", "device_id": "D1", "trip_id": "T1",
  "local_seq": 41, "occurred_at": "2026-11-25T03:15:00.000Z",
  "clock": {"quality":"unknown"}, "depends_on": null,
  "body": {"load_id":"L1","stage":"pickup","scale_id":"S1",
           "gross_g":20000,"tare_id":"V1","observed_tare_g":2000,
           "capture_method":"scale"}
}
```

The local sequence is assigned in the capture transaction (allocate the next sequence under a SQLite write lock before serializing). Use integer grams on the wire; the API converts them exactly to PostgreSQL numeric kg and verifies the tare against the referenced immutable version. Preserve the captured gross and tare, including on a flagged reading. The app cannot grant itself verified status.

- **Occurrence time** is the phone’s original UTC wall time. **Receipt time** is assigned by PostgreSQL on first acceptance and returned unchanged on replay. Neither an upload delay nor a high local sequence establishes a late delivery.
- On a successful connection, record a server-time sample, request round-trip duration and the phone’s monotonic time. Compare elapsed monotonic time with elapsed wall time only within the same boot. Record an uncertainty range. If the sample is absent, the phone reboots, the clock jumps, or estimated drift exceeds the approved limit, label time uncertain.
- Order causal work by explicit references: resume depends on stop-start, a correction on its original, and approval on the proposed revision. Use local sequence as a per-device tie-breaker only. Across phones, join by load and stage. **Receipt has no dependency on pickup.**
- A suspect timestamp is retained verbatim. Accept evidence where possible with verification held for review; suppress unsupported deadline or tare-validity conclusions. Resolve timing through a new authorized record. A late upload never moves a received batch back to collected.

## 3. Queue and retry protocol

Foreground capture works without a network check. Attempt sync at app start, foreground entry, reconnection, manual retry and while the foreground worker has due items. Background scheduling is opportunistic. **ASSUMPTION A1** defines starting batch and backoff values.

```text
capture(action):
  verify cached actor, assignment and offline authority
  freeze new UUID, device time, clock evidence and measured inputs
  BEGIN IMMEDIATE
    allocate local sequence; serialize and insert immutable event
    insert outbox(event, pending)
  COMMIT
  show saved locally and refresh pending count

sync(account):
  acquire single worker ownership for this account
  recover sending rows owned by a terminated worker to retry
  while authenticated and reachable and due work exists:
    in a short transaction:
      choose due pending/retry rows in local sequence order
      prefer satisfied dependencies; skip blocked rows; cap count and bytes
      claim with a fresh lease token, increment attempts, commit
    POST the frozen envelopes outside the transaction, with a timeout
    in a short transaction, apply each result by event ID and current lease:
      accepted or duplicate with matching ID -> synced, store first server time
      missing prerequisite -> blocked, wake on parent ACK or timed recheck
      ID/payload or competing stage/revision conflict -> conflict
      invalid or unauthorized item -> rejected with reason
      retryable, absent result or ambiguous transport -> retry with jitter
    release ownership on exit; never let a stale response overwrite a newer ACK
```

Use bounded exponential backoff with full jitter: choose a delay uniformly between zero and `min(cap, base × 2^(attempt−1))`; bound the exponent before computing. Honor a longer server Retry-After. Schedule in-process waits with a monotonic clock, persist due times for restart, and rebase implausible due times after a wall-clock change. Never abandon an event merely because the retry count is high. Split a 413 batch; quarantine a single oversized event. A request-wide 401 pauses sending until the **same actor** reauthenticates. An item-specific denial remains visible for authorized review. One blocked item must not hold unrelated events behind it.

## 4. Server acceptance, de-duplication and partial failures

Return HTTP 200 for a well-formed, processed batch, with one result per submitted event ID, e.g. `{"id":"E1","status":"duplicate","received_at":"..."}`. An invalid outer envelope or repeated IDs within a single request is a batch-format error before processing; repackage the original events individually to isolate the defect. Return request-level 429/503 when throttled or unavailable. Any lost or truncated response is safe to retry.

```text
authenticate caller; validate outer format, unique request IDs and size
for each envelope independently:
  begin PostgreSQL transaction (READ COMMITTED)
    verify caller may sync this actor/device; validate envelope version
    reserve client_event_id using UNIQUE index, waiting for concurrent writer
    if already committed:
      compare immutable original request and authenticated identity
      if identical: return duplicate with first received_at
      otherwise: return conflict; preserve committed record
    else:
      authorize new event against trip, role and assignment policy
      validate typed payload, prerequisite references, scale and tare evidence
      insert typed event, audit and idempotent job in this transaction
  commit success before returning accepted
  on item failure: roll back only that item; classify and continue
return keyed results; never infer success from response order
```

**Fit with the current DDL.** `client_event.client_event_id`, `upload_weigh`, unique `(load_id,stage)`, and unique `job(task,event_id)` already protect the weighing write. The pseudocode describes ONE reservation inside each handler; do not preinsert a client_event and then invoke upload_weigh as though it were new. For the proposed wire contract add an immutable, versioned original-envelope receipt keyed by event ID in the **same transaction** as upload_weigh. This lets the endpoint compare canonical client fields (including trip, sequence and clock evidence) before re-deriving any mutable verification decision on retries. A rolled-back handler leaves no accepted receipt. Read the first server timestamp from client_event. The receipt extension, batch endpoint and non-weigh handlers are proposed implementation work.

Map PostgreSQL DM001 to ID conflict. Map the specific stage uniqueness violation to competing capture and return the existing reference only to an authorized caller. A genuinely different reading is never silently merged by matching weight. The correction workflow appends a proposed revision, reason, actor and decision. Retry a missing known parent; distinguish revoked access and unknown/mismatched assignment from a transient dependency.

## 5. Receipt-first reconciliation and the phone display

The factory captures its independent receipt against the pre-issued load, even while pickup is pending elsewhere. The server returns success for the receipt and shows **Awaiting pickup**. With a verified pair, `load_difference` exposes exactly one row per load and computes receipt net minus pickup net. A missing operand stays NULL. A reconciliation worker locks the comparison unit, rereads effective weights, and updates the same open discrepancy episode. No sync handler creates another trip to accommodate an unknown load.

For grouped or unidentified intake, retain the unmatched evidence locally for authorized matching; the existing crate-level SQL requires a valid load ID. Never assign a pooled weight to each crate. A new linkage or correction keeps the original capture traceable.

**Screen example:** “Saved on phone · 3 pending” / “දුරකථනයේ සුරැකිණි · යැවීමට 3ක්”. Count pending + sending + retry + blocked for the active account; show conflict and rejected separately as “Needs attention”. While uploading, show “Sending 1 of 3”. A row becomes “Synced” only after its own acknowledgement is durably recorded. Offer “Retry now”, the last successful sync time, and the reason for a blocked item. For emergencies distinguish **queued on phone**, **received by server**, and **acknowledged by dispatcher**.

## 6. Edge cases

| Situation | Expected behaviour |
|---|---|
| Power loss during capture or phone storage full | SQLite commits both rows or neither; show success only after commit. |
| App killed after claim, before POST | Recover the expired or abandoned claim and send the same stored envelope. |
| Database committed, response lost twice | Same UUID returns the original acknowledgement; no extra reading, trip or job. |
| Three items yield success, validation failure and timeout | Mark only the confirmed success synced; show the invalid item for attention and retry the ambiguous one. |
| Two workers send identical IDs simultaneously | Unique reservation serializes them; at most one creates effects. |
| Same UUID, changed grams, time or actor | Conflict or access denial; preserve evidence and never rewrite the accepted event. |
| New UUID for an existing load and stage | Surface competing capture; an authorized correction is required to change the effective weight. |
| Factory receipt arrives before pickup | Accept receipt; difference remains NULL until pickup syncs, then calculate once. |
| Resume arrives before stop-start | Block only resume; sync its parent, retry resume, retain both original times. |
| Phone clock jumps backward or far into the future | Keep original timestamp, flag time uncertainty, avoid false deadline conclusions and recover retry scheduling. |
| User signs out with pending events | Lock their queue, retain original attribution and resume only under authorized identity. |
| Tracker feed is missing during a sync outage | Show last valid fix time; no inferred stop or current position. |
| Manual retry while a request is in flight | One worker owns the claim; late responses cannot downgrade a synced row. |
| Reinstalled or physically lost phone before upload | Server can recover only acknowledged records; reconcile missing loads with independent records and mark any backfill. |

## 7. Acceptance test

1. Provision exactly one trip T1, one batch, one loading L1 and one verified 2 kg tare version. Use different authorized employees at pickup and receipt.
2. In airplane mode record 20 kg gross, **18 kg net**. Restart. Expect one pending pickup with its original UUID P1.
3. Factory records 17 kg gross, **15 kg net** under R1 for L1. Expect one receipt, NULL difference and Awaiting pickup.
4. Reconnect. Server commits P1, but the phone loses the reply. Retry P1 **twice**, losing the first retry reply as well. Apply the final acknowledgement. Expect zero pending.
5. In an isolated fixture assert **1 trip, 2 original weigh_event rows, 2 distinct event IDs, 1 comparison row, difference_kg = −3**. The signed result means **3 kg less at receipt**. Expect one pickup audit capture and one pickup reconciliation job despite three submissions. A discrepancy alert additionally requires an approved tolerance below 3 kg and a running worker.

## Assumptions to validate

- **ASSUMPTION A1:** Start with 50 events or 128 KiB per request, a 20-second timeout, 2-second retry base and 5-minute cap. Tune from low-end Android and pilot-network measurements.
- **ASSUMPTION A2:** Both sites can identify the same pre-issued loading and separately authenticated employees can use provisioned phones offline. Confirm manifest handling and expiry of offline permissions.
- **ASSUMPTION A3:** Factory policy will define acceptable clock uncertainty, tare validity, retention and follow-up for events captured while authority was uncertain. Keep disputed evidence available and defer dependent classifications.
