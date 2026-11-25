# DaluMaga · Pilot user stories and acceptance criteria

**Scope:** one factory, one route, one vehicle, with simulated hardware available for remote development. Both the Sinhala/English mobile app and office web app use one shared backend.

**GitHub use:** copy one `[ID] Title` heading and its body into each issue. The role and priority are written in each body. Reference the NFR IDs in the issue’s test notes. The numbered DM references point to [the assumptions log](ASSUMPTIONS.md); they identify open questions, not confirmed factory practices.

## MVP and Later

- **Must · MVP release gate.** Capture verified pickup and independent receipt weights; link each loading and batch; record custody, corrections and offline events; reconcile once; show deadline risk, data freshness and supported stop alerts; handle one-tap breaks and emergencies. Enforce permissions and versioned rules. Demonstrate the workflow with simulators and pass the cross-cutting checks below.
- **Should · Pilot enhancements.** Driver explanations, a dedicated incomplete-manifest closure workflow and a dispatcher editor for changed pickup order. The Must flow already keeps unresolved receipts visible and records reported break reasons.
- **Could · Optional within pilot capacity.** Paper-ticket references and searchable site aliases.
- **Won’t for pilot · Later.** Fuel-sensor alerts, historical analytics and multi-factory/fleet management. Keep automated pay deductions and disciplinary decisions outside the product workflow.
- **Field readiness.** A simulator pass demonstrates the software. Before claiming live readiness, verify end-to-end Bluetooth capture on the actual phone and scale, the authorized GPS feed, and which weighing unit the factory can match. Grouped intake can yield only a group result; an incomplete group stays unresolved.

## Role issues

### Weighing employee

#### [WE-01] Identify and weigh a load

**Role:** Weighing employee · **MoSCoW:** Must · **Assumptions log:** DM-001–DM-007, DM-017, DM-025

As a weighing employee, I want to identify a loaded crate and capture its stable scale reading so that pickup has a traceable net weight.

**Acceptance criteria**

- [ ] **Given** a scanned crate and an assigned trip, **When** I start a new loading, **Then** create a load ID linked to crate, batch and trip. Reusing the crate creates a distinct loading. A damaged QR supports confirmed lookup by printed ID.
- [ ] **Given** a stable 20 kg gross reading and a verified 2 kg tare, **When** I confirm capture, **Then** save 18 kg net, gross, tare and its verification source, units, scale ID, capture method, actor and occurrence time. Keep commercial deductions separate.
- [ ] **Given** an unstable reading, unknown unit, gross below tare, missing tare or failed scale check, **When** I attempt capture, **Then** explain the problem and keep net weight unverified. Any enabled manual fallback is labelled and requires review.


#### [WE-02] Start the batch delivery clock

**Role:** Weighing employee · **MoSCoW:** Must · **Assumptions log:** DM-013, DM-014, DM-028

As a weighing employee, I want to record the batch and the source of its start time so that the office can account for time the leaves spent waiting.

**Acceptance criteria**

- [ ] **Given** an approved start event and timing rule, **When** I link the load to a batch and record the observed start, **Then** save the batch ID, time and source, and calculate the deadline from the recorded rule version.
- [ ] **Given** an estimated or unknown start time, **When** I save the batch, **Then** label its time quality. Keep the deadline unknown when it cannot be calculated.


#### [WE-03] Capture offline and sync exactly once

**Role:** Weighing employee · **MoSCoW:** Must · **Assumptions log:** DM-016, DM-017, DM-026–DM-028

As a weighing employee, I want to save field events without signal so that I can hand over leaves and sync later without duplicate records.

**Acceptance criteria**

- [ ] **Given** a previously authenticated worker and cached trip in airplane mode, **When** a weighing, handover or break is confirmed and the app restarts, **Then** show success only after SQLite commits the event ID, original timestamp, actor and payload; restore its pending status after restart.
- [ ] **Given** the server committed an event but the acknowledgement was lost, **When** identical retries arrive concurrently, **Then** return the original acknowledgement and retain one accepted event and one set of effects, including alerts.
- [ ] **Given** an accepted ID is reused with a different payload, **When** the phone retries, **Then** flag a conflict, preserve the original and leave the conflicting item visible for review.


#### [WE-04] Link a paper ticket

**Role:** Weighing employee · **MoSCoW:** Could · **Assumptions log:** DM-033

As a weighing employee, I want to attach a paper ticket reference to a load so that the office can reconcile the paper register with the electronic record.


### Driver

#### [DR-01] Confirm custody

**Role:** Driver · **MoSCoW:** Must · **Assumptions log:** DM-009, DM-016, DM-024

As a driver, I want to confirm which loads I collected so that the receiver can see what was handed to me.

**Acceptance criteria**

- [ ] **Given** a manifest with identified loads, **When** I confirm handover online or offline, **Then** record the selected loads, driver, trip and occurrence time and display any unconfirmed loads separately.
- [ ] **Given** a driver has custody, **When** the driver attempts to alter a pickup weight, **Then** deny the action on the server and retain the original weighing.


#### [DR-02] Report a break or emergency

**Role:** Driver · **MoSCoW:** Must · **Assumptions log:** DM-016, DM-018, DM-023

As a driver, I want to record a reason with one tap once safely parked so that the office can distinguish a reported break from an unexplained delay.

**Acceptance criteria**

- [ ] **Given** the driver is safely parked on the trip screen, **When** they tap Tea break, Toilet, Breakdown or Emergency, **Then** save the reason and start time in one tap without prior approval. Resume records the end time.
- [ ] **Given** an emergency is reported offline, **When** the driver checks its status, **Then** show Queued and the configured emergency contact procedure. Show Delivered after server acknowledgement and Acknowledged after dispatcher action.
- [ ] **Given** a break syncs after an unexplained-stop alert, **When** its original time covers the stop, **Then** link the explanation and retain the original alert history.


#### [DR-03] Add context to a stop

**Role:** Driver · **MoSCoW:** Should · **Assumptions log:** DM-012, DM-023

As a driver, I want to add an explanation to a stop after parking so that dispatch can consider my account during review.


### Factory receiver

#### [FR-01] Independently reweigh at intake

**Role:** Factory receiver · **MoSCoW:** Must · **Assumptions log:** DM-001–DM-009, DM-016, DM-029

As a factory receiver, I want to weigh the identified load under my own login so that the factory has independent evidence of what arrived.

**Acceptance criteria**

- [ ] **Given** an intact crate on an identified loading, **When** I scan and weigh it on the factory scale, **Then** save a separate receipt with actor, scale, time, gross, verified tare and net. Flag a same-person pickup and receipt for review.
- [ ] **Given** the pickup reading has not synced, **When** I receive the load using its handover reference, **Then** save the receipt as Awaiting pickup and reconcile when both records arrive. Receiving can continue.
- [ ] **Given** leaf is mixed, repacked or partly rejected, **When** I record what was weighed, its known source loads and exceptions, **Then** compare only a complete group on a common physical-weight basis. Otherwise leave the comparison unresolved; a missing receipt has unknown weight.


#### [FR-02] Request a weight correction

**Role:** Factory receiver · **MoSCoW:** Must · **Assumptions log:** DM-010, DM-012

As a factory receiver, I want to request a correction linked to an original reading so that an error can be fixed with the evidence intact.

**Acceptance criteria**

- [ ] **Given** I have request permission, **When** I submit the target reading, revised value and reason, **Then** append the request with actor and time and retain the current effective value pending a decision. The same workflow supports authorized pickup staff.
- [ ] **Given** the target or reason is missing, or a client attempts to overwrite a reading, **When** the server processes the request, **Then** reject it and preserve the original.


#### [FR-03] Close an incomplete manifest

**Role:** Factory receiver · **MoSCoW:** Should · **Assumptions log:** DM-003, DM-029

As a factory receiver, I want to close a trip with outstanding or refused loads explicitly listed so that staff can follow up on unresolved handovers.


### Dispatcher

#### [DS-01] Prioritize batches at risk of delay

**Role:** Dispatcher · **MoSCoW:** Must · **Assumptions log:** DM-013, DM-014, DM-020, DM-021, DM-030

As a dispatcher, I want to see open batches ordered by deadline with their expected arrival so that I can act before a delivery is late.

**Acceptance criteria**

- [ ] **Given** active batches have several known deadlines and one unknown deadline, **When** I open the dashboard, **Then** order known deadlines earliest first and show the unknown batch in a visible Needs timing section.
- [ ] **Given** fresh route inputs predict arrival at the agreed delivery milestone, **When** ETA exceeds a batch deadline, **Then** open one late-risk alert for that batch with ETA, deadline and predicted delay. Equality does not trigger it; new estimates update the open alert.
- [ ] **Given** ETA inputs are stale or the agreed completion event arrives, **When** the dashboard refreshes, **Then** mark an unsupported ETA stale or unavailable; for a completed batch show actual completion against its deadline.


#### [DS-02] Distinguish a stop from a signal gap

**Role:** Dispatcher · **MoSCoW:** Must · **Assumptions log:** DM-015, DM-016, DM-022–DM-024, DM-028

As a dispatcher, I want to see the age of the last valid fix and the evidence for a stop so that I can check a delay fairly.

**Acceptance criteria**

- [ ] **Given** the last valid fix was 20 minutes ago, **When** an old fix is replayed or no new fix arrives, **Then** show “Last update 20 minutes ago” at that moment; missing data never starts or extends a stop, and a replay never makes it appear live.
- [ ] **Given** fresh stationary fixes from the assigned vehicle span the configured duration, **When** they are outside routine zones with no covering break, **Then** open one unexplained-stop alert with its evidence interval. A gap beyond the freshness limit breaks the interval.
- [ ] **Given** a configured loading zone, factory queue or recorded break covers the interval, **When** the same fixes arrive, **Then** show the context and suppress the unexplained-stop alert for that interval.


#### [DS-03] Acknowledge and resolve alerts

**Role:** Dispatcher · **MoSCoW:** Must · **Assumptions log:** DM-018, DM-030

As a dispatcher, I want to record that I saw an alert and what I did so that drivers and the next dispatcher know its status.

**Acceptance criteria**

- [ ] **Given** an open emergency, ETA or stop alert is visible, **When** I acknowledge it, **Then** record my identity and time and distinguish acknowledgement from message delivery and resolution.
- [ ] **Given** an authorized dispatcher records a follow-up or closure, **When** another dispatcher views the history, **Then** show the action, actor, time and original evidence.


#### [DS-04] Adjust remaining pickups

**Role:** Dispatcher · **MoSCoW:** Should · **Assumptions log:** DM-020, DM-021

As a dispatcher, I want to revise the remaining pickup order with a reason so that the ETA reflects a changed itinerary.


### Manager

#### [MG-01] Review weight differences

**Role:** Manager · **MoSCoW:** Must · **Assumptions log:** DM-001, DM-003–DM-006, DM-011, DM-012

As a manager, I want to see comparable pickup and receipt weights against an approved tolerance so that I can identify deliveries that need checking.

**Acceptance criteria**

- [ ] **Given** 18 kg net at pickup and 15 kg net at receipt for the same load, **When** both readings are accepted, **Then** show receipt minus pickup as −3 kg, label it “3 kg less at receipt” and link both source readings.
- [ ] **Given** a test rule uses absolute difference strictly above 1 kg, **When** differences of 0.9, 1.0 and 1.1 kg are evaluated, **Then** flag only 1.1 kg with that rule version. Evaluate before display rounding. These are test fixtures.
- [ ] **Given** no approved tolerance or comparable pair exists, **When** the review screen opens, **Then** show valid measured values and the pending reason. For a flagged case, allow a reviewer to record an explanation and decision; no automatic pay or disciplinary action follows.


#### [MG-02] Decide an authorized correction

**Role:** Manager · **MoSCoW:** Must · **Assumptions log:** DM-010–DM-012

As a manager, I want to review a proposed correction when I have approval authority so that the effective weight can change with an accountable decision.

**Acceptance criteria**

- [ ] **Given** a reviewer has approval permission for the weighing stage and trip status, **When** they approve or reject with a reason, **Then** append the decision, actor and time. Approval appends a linked effective revision; rejection leaves the effective value unchanged.
- [ ] **Given** two approvals target the same revision, **When** both reach the server, **Then** apply at most one; require review against the new revision for the other. Recalculate affected comparisons once and retain previous results and alert history.
- [ ] **Given** approval authority is unassigned or the reviewer lacks permission, **When** they attempt approval through the API, **Then** deny the action and preserve the effective reading.


#### [MG-03] Explore historical trends

**Role:** Manager · **MoSCoW:** Won't for pilot · **Assumptions log:** DM-011, DM-020

As a manager, I want to compare loss and delay trends over time so that I can investigate recurring operational patterns.


#### [MG-04] Review fuel-level alerts

**Role:** Manager · **MoSCoW:** Won't for pilot · **Assumptions log:** DM-031

As a manager, I want to review persistent fuel drops in context so that I can decide which incidents warrant follow-up.


### Admin

#### [AD-01] Configure the pilot and permissions

**Role:** Admin · **MoSCoW:** Must · **Assumptions log:** DM-004, DM-008, DM-010, DM-011, DM-013, DM-014, DM-018–DM-020, DM-022–DM-024, DM-030

As an admin, I want to configure roles, assignments and approved operating rules so that the system reflects the factory's process.

**Acceptance criteria**

- [ ] **Given** one pilot factory, route and vehicle, **When** I assign staff, the tracker and approved permissions, **Then** enforce role and trip scope on the backend. Restrict location history and correction approval to their configured roles.
- [ ] **Given** an authorized admin changes an operating rule, **When** it takes effect, **Then** validate units and timing, retain actor, approval reference, version and effective time, and preserve earlier evaluations. Rules include tare validity, tolerance, deadline milestones, route estimates, GPS freshness, zones and dwell limits.
- [ ] **Given** a required rule or approval is missing, **When** an event arrives, **Then** mark the affected decision unconfigured, suppress unsupported classifications and continue independent capture. Preserve assignment history when a replacement is authorized.


#### [AD-02] Verify the pilot with hardware simulators

**Role:** Admin · **MoSCoW:** Must · **Assumptions log:** DM-006, DM-007, DM-015, DM-017, DM-019, DM-031

As an admin, I want to select simulated or verified scale and tracker sources so that I can test the same workflows remotely.

**Acceptance criteria**

- [ ] **Given** a simulated trip is selected, **When** I supply stable and unstable weights, movement, parking, gaps and replayed fixes, **Then** the scale and tracker interfaces exercise the usual application paths; simulated records are labelled and isolated from real trips.
- [ ] **Given** live location scope is unapproved or a device interface is unverified, **When** I configure a live source, **Then** identify what is outstanding and retain simulator access. Verify Bluetooth capture on the actual phone and scale and verify an authorized tracker sample before marking either integration ready.


#### [AD-03] Maintain local place names

**Role:** Admin · **MoSCoW:** Could · **Assumptions log:** DM-034, DM-035

As an admin, I want to add Sinhala and English aliases for sites so that staff can find a site under the name they use.


#### [AD-04] Manage multiple factories

**Role:** Admin · **MoSCoW:** Won't for pilot · **Assumptions log:** DM-024

As an admin, I want to manage separate factories and fleets so that each operation has its own configuration and records.

## Cross-cutting non-functional requirements

These checks apply to all affected Must stories. Record measured results and hardware evidence separately from simulator results.

- [ ] **NFR-01 · Offline operation and recovery.** Exercise pickup, receipt, handover, break and resume on a previously provisioned phone in airplane mode. Force-close after capture, reopen, sign out, then sync the original operator’s queue under the appropriate credentials. Preserve original IDs, actors and times. Show Pending, Synced, Conflict or Needs attention per item. A new user cannot read another user’s private queue. Never report an unsaved event as saved or silently discard pending events. If storage is full, explain how the operator can recover.

- [ ] **NFR-02 · No duplicate records or effects.** Use a client-generated UUID, a PostgreSQL uniqueness constraint and atomic writes for acceptance and downstream work. Return the acknowledged result for the same ID and payload. Reject conflicting reuse of the ID. Test concurrent retry, lost response, partial batch retry, and factory receipt arriving before pickup. Assert one logical reading, custody change or alert per triggering event. A separate capture with a different ID for the same load and stage must become a duplicate candidate for review, never a second quantity in the total.

- [ ] **NFR-03 · Audit trail and permissions.** Make original weighings, correction requests, decisions and revisions append-only for application users. Retain who acted, original event time, server receipt time, source device, units, tare, reason where applicable and original-record link. Test denied overwrite/delete, offline clock skew, shared-device sign-out and concurrent approvals via the API. An authorized reviewer must be able to reconstruct the effective weight before and after a correction.

- [ ] **NFR-04 · Performance and recovery targets.** ASSUMPTION A1 — Proposed engineering budgets for remote testing. On the lowest-spec pilot Android phone available, p95 time from Confirm to durable local acknowledgement ≤1 second for 100 captures. With 500 pending events, a stable 1 Mbps uplink and 200 ms round-trip latency, drain the queue within 2 minutes after reconnecting in the foreground, with zero lost events. On the same connection with a warm backend and 100 active batches, p95 time to a usable office dashboard ≤3 seconds over 30 loads. Log device, OS, backend state, sample size and result. Report cold starts separately.

- [ ] **NFR-05 · Retention and tracking scope.** Configure distinct retention periods for raw GPS, operational records, audit/corrections, backups and acknowledged phone caches. The manager and person responsible for staff data must approve values, permitted viewers and tracking hours before real location ingestion. While undecided, use simulated GPS. Test expiry using synthetic short periods: purge expired data, retain in-period data and unacknowledged phone events, and avoid copying coordinates into longer-lived audit logs. Keep a reading and its correction chain on a consistent retention schedule; verify backup expiry or reapply deletions on restore. No production retention duration is presumed.

- [ ] **NFR-06 · Sinhala and English.** Cover all pilot screens, role labels, break reasons, errors, alerts and sync states in both languages. Store language-independent event codes and canonical units and timestamps. Switch language while offline with a pending break and verify the same event ID and meaning after sync. Display operational times in the configured factory timezone and label units on every weight. Have a speaker of each language complete weighing and receipt and read back the local time and net weight. Track additional language needs under DM-032.

- [ ] **NFR-07 · Gloves, sunlight and low-end Android.** ASSUMPTION A2 — Proposed checks pending device and glove confirmation. Give primary mobile actions touch targets at least 48 × 48 dp and normal text contrast of at least 4.5:1. Pair status colours with text, give controls accessible names, and support 200% text sizing without hiding Confirm, Emergency or Resume. On the lowest-spec available pilot phone, ask a remote tester using the actual work gloves in bright daylight to identify sync status, capture a weight and record/resume a break without a wrong action. Record failures, including gloves incompatible with the touchscreen. Provide a confirmed typed crate-ID fallback when scanning fails. On web, test deadline, alert and correction flows by keyboard with visible focus.

- [ ] **NFR-08 · Telemetry freshness and hardware independence.** Store GPS fix time, validity, tracker ID and backend receipt time. Test valid movement, stationary observations, an outage, stale replay, out-of-order arrival and a device swap. Only valid, assigned and sufficiently fresh observations may contribute to live stop or ETA evidence. Automated tests run without physical equipment; label real-device verification separately. Publish neither simulator results as live trips nor uncertain predictions as confirmed arrivals.

## Pilot demonstration across roles

With radios off, capture 20 kg gross and 2 kg tare at pickup. Confirm custody. At the factory, capture 17 kg gross and 2 kg verified tare, then sync the receipt first. Expect **Awaiting pickup**. Sync pickup twice, including one lost acknowledgement. Expect one 18 kg pickup, one 15 kg receipt and one 3 kg shortage review under the 1 kg test tolerance. Replay a GPS trace with a gap; expect a stale position and zero stops inferred from the gap. Approve one authorized correction and verify both the original and revised result remain traceable.

## Assumptions to validate

- **ASSUMPTION A1 — Performance budgets and test workload.** NFR-04 values are proposed engineering targets. Validate them with a representative phone, backend and route connection before making a service commitment.
- **ASSUMPTION A2 — Accessibility targets and field setup.** NFR-07 numeric targets are proposed design checks. Confirm device, physical glove compatibility, lighting and staff usability remotely under DM-017 and DM-032.
- **Factory process assumptions DM-001–DM-035 remain open** in [ASSUMPTIONS.md](ASSUMPTIONS.md). In particular, obtain remote confirmation of intake granularity, tolerance and units, correction authority, delivery-clock endpoints, GPS freshness and stop thresholds, location access and retention. Each role issue cites the relevant entries. Test weights, times and thresholds in the scenarios are synthetic examples. MoSCoW assignments are proposed scope decisions.
