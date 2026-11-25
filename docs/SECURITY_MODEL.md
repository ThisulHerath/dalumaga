# DaluMaga · Pilot permissions and threat model

## Permission matrix

**Y** grants the action within the person’s assigned factory, route, trip or case. **D** additionally requires an explicit, current delegation for the named action and scope. **—** denies the action under that role. All grants require an active individual identity. A generic bulk-sync permission never grants a field action.

| Action | Weigher | Driver | Receiver | Dispatcher | Manager | Admin |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Read assigned trips, batches, loads and crate/tare references | Y | Y | Y | Y | Y | Y |
| Register a crate | — | — | — | — | — | Y |
| Verify and append a tare version | D | — | D | — | — | D |
| Create a trip or assign a driver and vehicle | — | — | — | Y | — | Y |
| Create a batch or issue a crate loading | Y | — | — | Y | — | Y |
| Record trip departure or end | — | Y | — | Y | — | Y |
| Capture pickup weight | Y | — | — | — | — | — |
| Confirm custody; report or resume a break or emergency | — | Y | — | — | — | — |
| Capture independent factory receipt | — | — | Y | — | — | — |
| Record the configured whole-batch completion milestone | — | — | Y | Y | — | Y |
| Read original weighings and effective revisions | Y | — | Y | Y | Y | Y |
| Read stop and resume records | — | Y | — | Y | Y | Y |
| Read correction requests and decisions | Y | — | Y | — | Y | Y |
| Request a correction with a reason | D | — | D | — | D | D |
| Approve or reject another person’s correction | D | — | D | — | D | D |
| Read dispatch dashboard, vehicle status and alerts | — | — | — | Y | Y | Y |
| Acknowledge or resolve an operational alert | — | — | — | Y | Y | Y |
| Approve factory policy values and staff-data scope¹ | — | — | — | — | D | — |
| Apply approved rules and manage access grants¹ | — | — | — | — | — | D |
| Review a scoped audit case or access-grant history¹ | — | — | — | — | D | D |
| Ingest GPS fixes using a human login | — | — | — | — | — | — |
| Overwrite or delete original weighing or audit history | — | — | — | — | — | — |

¹ Proposed controls beyond the current OpenAPI routes. The manager authorizes the business decision; a delegated admin applies the recorded approval. Admins cannot grant themselves a sensitive delegation. The person provisioning the first admin is agreed during pilot setup.

### Enforcement decisions

- Apply a NestJS authorization check to **each event** in a sync batch and to each single-event endpoint. Derive the actor from the authenticated session and verify device, object relationships, factory and assignment. Apply identical restrictions to reads, counts, cursors and idempotency responses.
- Check delegations by person, action, stage, scope, validity period and revocation. The OpenAPI `x-roles` list is an eligibility ceiling. Until approval authority is confirmed, preserve the original and keep a requested correction pending.
- Enforce separation by **person ID**, including when one person holds multiple roles. Reject self-approval and approval of a correction to one’s own original weighing. Keep same-person pickup and receipt visible as a review exception and withhold the independent discrepancy assessment.
- Treat the phone’s cached grant as authority to **capture locally** within its offline period. At reconnection check live status before acceptance. Retain revoked or disputed work for controlled recovery with the original actor and occurrence time.
- Use separate service identities for GPS ingestion, background jobs and deployment. An app Admin has no database-owner privilege. Give push/SMS credentials only to the notification worker.
- Record who granted, requested, approved, denied or revoked sensitive access, the affected object, reason and server time. Preserve original readings and link authorized changes through revisions.

## Threat model

Scope covers the field phone and scale, offline queue, NestJS API, PostgreSQL, worker, GPS provider and notification gateway. **MVP** controls are proposed field-pilot requirements. **Later** controls strengthen an existing MVP defence.

| Threat | MVP mitigation and response | Later mitigation | Remaining risk or operating rule |
| :--- | :--- | :--- | :--- |
| Weigher enters a false pickup weight | Require a stable reading from the registered scale and a verified tare. Derive net weight and verification status on the server. Label manual entries, require independent review, and retain the gross value and method. A different operator reweighs the load at intake. | If supported by selected hardware, verify device-signed readings. Compare unexplained patterns across scales and shifts. | A scale can faithfully weigh a partially filled crate. Use handover evidence and review before attributing a loss. |
| A phone is stolen | Use a device lock, account-scoped encrypted local storage with OS-protected keys, and app re-lock. Limit cached trips and offline authority. On report, revoke the installation, refresh sessions and server write access; check revocation on every sync. Reconcile unsent loads against independent factory records. | Managed-device enrollment, remote lock/wipe when reachable, and hardware-backed keys where supported. | A disconnected phone cannot receive revocation immediately. Protect queued evidence during recovery; confirm what reached the server before any wipe. |
| Offline records are altered | Seal each captured envelope with a per-installation keyed integrity tag, keeping its key in protected device storage. At sync verify the tag against the enrolled installation, actor, trip and immutable fields. Check scale/tare references server-side. Quarantine mismatches without counting them as measurements. | Hardware-backed event signatures and signed sequence checkpoints for stronger provenance and detection of missing records. | A compromised app can submit plausible data using its own credential. A valid tag alone cannot verify the physical weight or prove that every event survived. |
| Uploads are replayed | Reauthorize the caller before exposing earlier results. Reserve the global event UUID and commit the reading, audit and job atomically. Identical authorized replays receive the first acknowledgement; changed content conflicts. Enforce one original reading per load and stage across bulk and single-event routes. | Alert on sustained conflict patterns and unusual retry rates, while allowing ordinary reconnect bursts. | A new ID for the same stage goes to review. Losing two acknowledgements must still leave one pickup and one reconciliation effect. |
| A privileged insider edits history | Use a non-owner runtime account with grants only on reviewed functions/views, append-only database triggers and separate migration credentials. Corrections require a reason and a different named approver. Capture role, rule and correction decisions; send privileged-change audit records to a separately controlled destination. Restrict and audit access to that destination. | Immutable retention-locked audit archives, independent verification of audit digests, and dual approval for privileged production maintenance. | A database owner can disable local triggers. A separately controlled audit copy provides evidence if production records are changed. |
| GPS positions are spoofed | Accept fixes only from a scoped provider identity bound to the assigned tracker, vehicle and on-duty trip. Preserve fix and receipt times; check validity, plausible movement and freshness. Exclude suspect observations from ETA and stop evidence; show the last usable fix time and allow dispatcher review. | Corroborate with independent telemetry or intake timestamps, and use authenticated device-origin fixes if the tracker supports them. | An authenticated provider can relay a false but plausible position. A signal gap alone never opens or extends a stop. |
| An API key or service token is exposed | Keep GPS, SMS, database and signing credentials in server-side secret storage with separate scopes per environment. Exclude secrets from app bundles, Git and logs. Monitor provider usage; on exposure revoke or rotate the affected credential, review its access window and reconcile affected records or charges. | Use short-lived workload identities and automated rotation where the provider supports them. | Rotation limits future use. Review already accepted telemetry or sent messages separately; a GPS credential must never authorize human API actions. |

## Pilot verification

1. Use test identities in two trip assignments. A driver can acknowledge their own manifest; pickup capture via either endpoint is denied and another driver’s records are inaccessible.
2. Give one test person both requesting and approving roles. Their self-approval is denied, while an independently delegated reviewer can append a decision.
3. Replay the same legitimate pickup twice after losing its acknowledgement. The fixture must still contain one trip, two original readings across both stages, and one 3 kg difference.
4. Use a synthetic integrity mismatch, revoked installation, stale GPS fix and unauthorized service credential. Expect no accepted altered weight, no new write from the revoked device, no false stop and no cross-service access.
5. Confirm an authorized correction leaves the original readable and that a privileged maintenance action produces an independently accessible audit record.

## Assumptions and implementation gaps

- **ASSUMPTION A1:** The factory can nominate independent approvers and an access administrator. The manager must confirm the actual delegation owner and absence cover. Leave a case pending if no eligible reviewer is available.
- **ASSUMPTION A2:** Pilot phones support the selected encrypted database and protected-key mechanism. Validate on the oldest assigned Android phone before storing real staff or location records.
- **ASSUMPTION A3:** The provider can supply scoped credentials and tracker assignments. Keep live ingestion disabled and use simulated fixes until verified.
- **ASSUMPTION A4:** An independently controlled audit destination and a responsible reviewer are available; confirm custody, retention and access before live use.
- The schema and API are design inputs. Implement scoped grants, named delegation records, lost-device revocation, encrypted storage, integrity verification and independent audit export before claiming these controls are active. The v1 sync contract is strict: introduce integrity metadata in a versioned envelope and update client and server together.
