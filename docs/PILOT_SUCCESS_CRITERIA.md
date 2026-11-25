# DaluMaga pilot success criteria

**Decision:** Pass the one-factory, one-route, one-vehicle pilot only if all three metrics pass on the **same frozen pilot cohort**. Report each numerator, denominator, excluded or unknown count, and verdict. An incomplete cohort gives **insufficient evidence** for the affected metric. A baseline is for context; absolute pilot targets determine the verdict. No factory measurements or approved business thresholds were supplied.

## Cohort and baseline collection

- Before the trial, agree on the route, vehicle, batch definition, delivery clock, weighing unit, tolerance rules and alert-review rubric. Use one published version for baseline and pilot where possible. Disclose changes and avoid claiming improvement across unlike definitions.
- Select every real collection trip on the pilot route/vehicle whose **actual departure** is in the half-open interval `[window_start, window_end)`. This includes aborted trips after departure and trips with zero alerts. Exclude simulations, pre-departure cancellations and other routes. A trip or batch crossing midnight stays with its departure cohort.
- **ASSUMPTION A1:** Use consecutive 28-day baseline and pilot windows in Asia/Colombo. Freeze each snapshot seven days after its window ends, after the included delivery deadlines have elapsed. If the sample is too small, report insufficient evidence and collect a new, prospectively extended window. Do not select only successful trips.
- **ASSUMPTION A2:** Require 20 eligible trips for each metric, plus 50 manifested batches for timing and 50 comparable weighing units for weight. These are minimum operational samples, not a claim of statistical significance.
- Build a snapshot from records **known by the freeze time**, using original event times for delivery. Use only corrections approved by that cutoff. Preserve the event, decision and policy references used to build it. A later correction goes into a newly labelled report version. Keep simulations isolated.
- Collect baseline timing and weight from matched dispatch and intake records. Use the same review window for both periods. For false alerts, run the proposed rules in shadow mode on authorized real baseline trips and review alerts without notifying drivers. GPS-only operation with no comparable alert log has an **unavailable** historical alert baseline. Never convert missing evidence to zero.
- **ASSUMPTION A3:** The numerical baselines below are illustrative planning values only. Replace them with measured baseline counts and rates. Leave the measured baseline blank if reliable reconstruction is impossible. **ASSUMPTION A4:** All targets are proposals for the manager to approve before data collection.

## Reporting input contract

The repository contains requirements but no application migrations. The SQL below targets **proposed PostgreSQL reporting relations**, implementable as views over application tables or as frozen snapshot tables. The field contract and empty-table DDL appear at the end. The three queries are independent, read-only, and return one row per frozen reporting run. Use distinct run IDs such as `baseline_v1` and `pilot_v1`.

- **Trips:** One row per run/trip. `is_pilot_route` certifies the agreed factory, route and vehicle assignment. `manifest_checked` means dispatch and intake records have been reconciled against the independent manifest; every expected batch and weighing unit has a row, including unresolved ones. `alert_feed_checked` means the rules were active, the alert export was complete, and the inputs were adequate to evaluate the enabled rules on that trip. A disabled detector or an unevaluable trip cannot certify a zero. Both checks require affirmative evidence.
- **Batches:** One row per manifested batch, assigned to one trip in this pilot. `deadline_at` is the deadline committed under the agreed batch rule, with an auditable override policy; a retroactive extension does not turn a late delivery into an on-time one. `completed_at` is the occurrence time of the agreed completion milestone for the **whole** batch. Known late deliveries and confirmed undelivered batches are distinct from missing evidence. If part of a batch changes vehicles, retain one scoring identity and resolve its trip attribution before certifying the manifest.
- **Weight units:** One row per expected, non-overlapping comparison unit. Use a single load when the same intact crate is weighed at both ends, or one documented consignment when intake weighs crates together. Never include both the consignment and its member crates. Keep granularity comparable across periods and disclose the mix. Each side uses approved effective physical net kg (gross minus its verified tare). `comparable` requires matched membership, verified scales/tare and like units; record NULL for unknown values. `tolerance_kg` is the approved rule limit expressed in kg for this unit. `explained` requires an authorized, evidence-backed reason accounting for the difference. Acknowledgement, dismissal without evidence or a pending review do not qualify.
- **Alerts:** One row per distinct system-generated alert episode. Retries, updates and delivery to several screens retain the same alert ID. A second episode wrongly opened for the same uninterrupted condition counts as a separate false alert. Count only late-risk, unexplained-stop and weight-difference alerts. Driver-initiated break and emergency reports, device tests and later fuel alerts are outside scope. A reviewer records a verdict, reason and evidence before the snapshot is frozen.

## 1. Batches delivered on time

**Definition.** Percentage of all manifested batches on eligible trips that completed the factory-approved delivery milestone **at or before** their deadline. The unit is one batch, regardless of its crate count. An arrival at the gate counts only if that is the agreed milestone.

**Calculation.** Numerator = batches with a known deadline, state `received` and `completed_at <= deadline_at`. Denominator = **all** manifested batches. A confirmed undelivered batch scores zero. An unknown deadline, unknown outcome or missing receipt time stays in the denominator, is reported as unknown, and blocks a pass. Offline upload time never substitutes for completion time.

**Baseline.** Unknown. ASSUMPTION A3 planning value **85%**. Match batch deadlines to factory milestone times; intake times alone cannot establish the baseline.

**Target.** ASSUMPTION A4: **≥95%** on time. For example, 57 of 60 exactly meets the target. Compare the exact ratio before rounding.

```sql
WITH cohort AS (
  SELECT r.run_id, t.trip_id, t.manifest_checked, t.alert_feed_checked
  FROM pilot_runs AS r
  JOIN pilot_trips AS t ON t.run_id = r.run_id
  WHERE r.frozen_at IS NOT NULL
    AND t.departed_at >= r.window_start
    AND t.departed_at < r.window_end
    AND t.is_pilot_route AND NOT t.is_simulated
), trip_counts AS (
  SELECT run_id, count(*) AS trips, bool_and(manifest_checked) AS manifest_ok
  FROM cohort GROUP BY run_id
), batch_counts AS (
  SELECT c.run_id, count(*) AS batches,
    count(*) FILTER (WHERE b.deadline_at IS NOT NULL
      AND b.delivery_state = 'received'
      AND b.completed_at <= b.deadline_at) AS on_time,
    count(*) FILTER (WHERE b.deadline_at IS NULL
      OR b.delivery_state NOT IN ('received', 'undelivered')
      OR (b.delivery_state = 'received' AND b.completed_at IS NULL)) AS unknowns
  FROM cohort AS c
  JOIN pilot_batches AS b USING (run_id, trip_id)
  GROUP BY c.run_id
), score AS (
  SELECT r.run_id, coalesce(t.trips, 0) AS trips,
    coalesce(b.batches, 0) AS batches, coalesce(b.on_time, 0) AS on_time,
    coalesce(b.unknowns, 0) AS unknowns, t.manifest_ok
  FROM pilot_runs AS r
  LEFT JOIN trip_counts AS t USING (run_id)
  LEFT JOIN batch_counts AS b USING (run_id)
  WHERE r.frozen_at IS NOT NULL
)
SELECT run_id, trips, on_time, batches, unknowns,
  round(100.0 * on_time / nullif(batches, 0), 2) AS on_time_pct,
  CASE WHEN trips < 20 OR batches < 50 OR manifest_ok IS NOT TRUE OR unknowns > 0
         THEN 'INSUFFICIENT EVIDENCE'
       WHEN 100.0 * on_time >= 95 * batches THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM score ORDER BY run_id;
```

## 2. Unexplained weight differences

**Definition.** Percentage of comparable weighing units with a physical difference strictly above the approved tolerance that still lacks an accepted explanation at the freeze. Count both gains and shortages. An alert can correctly detect a real difference that staff later explain.

**Calculation.** For each unit, signed difference = effective receipt net kg − effective pickup net kg. Flag when `abs(difference) > tolerance_kg`; equality is within tolerance. Numerator = above-tolerance units with no accepted explanation. Denominator = **all comparable units**, including those within tolerance. Count each unit once. Missing or incomparable measurements are reported separately and block a pass. Keep signed kg for case review; opposite differences never cancel in the rate.

**Baseline.** Unknown. ASSUMPTION A3 planning value **5%**. Pair paper slips at the actual intake granularity and apply the same approved tolerance and review protocol. If historic explanations cannot be established, collect a prospective baseline.

**Target.** ASSUMPTION A4: **≤2%** unexplained, with complete expected-unit coverage. At 50 comparable units, one unexplained unit meets the target. The 2% is the permitted **rate of cases**, not the weighing tolerance. The factory must supply that tolerance.

```sql
WITH cohort AS (
  SELECT r.run_id, t.trip_id, t.manifest_checked, t.alert_feed_checked
  FROM pilot_runs AS r
  JOIN pilot_trips AS t ON t.run_id = r.run_id
  WHERE r.frozen_at IS NOT NULL
    AND t.departed_at >= r.window_start
    AND t.departed_at < r.window_end
    AND t.is_pilot_route AND NOT t.is_simulated
), trip_counts AS (
  SELECT run_id, count(*) AS trips, bool_and(manifest_checked) AS manifest_ok
  FROM cohort GROUP BY run_id
), measured AS (
  SELECT c.run_id, w.unit_id, w.review_state,
    CASE WHEN w.comparable AND w.rule_version IS NOT NULL AND w.tolerance_kg >= 0
         THEN abs(w.receipt_net_kg - w.pickup_net_kg) > w.tolerance_kg
    END AS above_tolerance
  FROM cohort AS c
  JOIN pilot_weight_units AS w USING (run_id, trip_id)
), counts AS (
  SELECT run_id, count(*) AS expected_units, count(above_tolerance) AS comparable_units,
    count(*) FILTER (WHERE above_tolerance) AS above_limit,
    count(*) FILTER (WHERE above_tolerance
      AND review_state IS DISTINCT FROM 'explained') AS unexplained
  FROM measured GROUP BY run_id
), score AS (
  SELECT r.run_id, coalesce(t.trips, 0) AS trips, t.manifest_ok,
    coalesce(w.expected_units, 0) AS expected_units,
    coalesce(w.comparable_units, 0) AS comparable_units,
    coalesce(w.above_limit, 0) AS above_limit, coalesce(w.unexplained, 0) AS unexplained
  FROM pilot_runs AS r
  LEFT JOIN trip_counts AS t USING (run_id)
  LEFT JOIN counts AS w USING (run_id)
  WHERE r.frozen_at IS NOT NULL
)
SELECT run_id, trips, unexplained, above_limit, comparable_units, expected_units,
  expected_units - comparable_units AS unmeasurable,
  round(100.0 * unexplained / nullif(comparable_units, 0), 2) AS unexplained_pct,
  CASE WHEN trips < 20 OR comparable_units < 50 OR expected_units <> comparable_units
             OR manifest_ok IS NOT TRUE THEN 'INSUFFICIENT EVIDENCE'
       WHEN 100.0 * unexplained <= 2 * comparable_units THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM score ORDER BY run_id;
```

## 3. False alerts per trip

**Definition.** Number of distinct false system alert episodes divided by **all eligible trips**, including trips with zero alerts. This measures dispatcher burden. It is different from the percentage of alerts that are false.

**Adjudication.** Check the triggering rule and evidence available for the event interval. A stop inferred solely from missing GPS is false. A correct ETA warning remains valid if dispatch intervenes and the batch arrives on time. A genuine above-tolerance weight alert remains valid if a legitimate cause is found afterward. For an offline break uploaded later, distinguish a warranted “reason not yet received” alert from a false claim that the vehicle stopped without evidence. If records cannot establish a verdict, mark it indeterminate; an unreviewed or indeterminate alert blocks a pass.

**Calculation.** Numerator = unique in-scope alert episodes adjudicated `false`; denominator = all eligible trips. Count a trip once regardless of its number of alerts. A verified functioning detector with no episodes contributes zero alerts. Outages and missing review remain visible.

**Baseline.** Historical GPS-only baseline unavailable unless comparable alert logs exist. ASSUMPTION A3 shadow-run planning value **0.50 false alerts/trip**. Measure this using the same rules and evidence rubric on real baseline trips.

**Target.** ASSUMPTION A4: **≤0.25 false alerts/trip**, with all in-scope alerts adjudicated and alert-feed coverage verified. Five false episodes in 20 trips meets the target; six fails.

```sql
WITH cohort AS (
  SELECT r.run_id, t.trip_id, t.manifest_checked, t.alert_feed_checked
  FROM pilot_runs AS r
  JOIN pilot_trips AS t ON t.run_id = r.run_id
  WHERE r.frozen_at IS NOT NULL
    AND t.departed_at >= r.window_start
    AND t.departed_at < r.window_end
    AND t.is_pilot_route AND NOT t.is_simulated
), trip_counts AS (
  SELECT run_id, count(*) AS trips, bool_and(alert_feed_checked) AS feed_ok
  FROM cohort GROUP BY run_id
), alert_counts AS (
  SELECT c.run_id, count(*) AS alerts,
    count(*) FILTER (WHERE a.verdict = 'false') AS false_alerts,
    count(*) FILTER (WHERE a.verdict IS NULL
      OR a.verdict NOT IN ('false','valid')) AS unreviewed
  FROM cohort AS c
  JOIN pilot_alerts AS a USING (run_id, trip_id)
  WHERE a.kind IN ('late_risk', 'unexplained_stop', 'weight_difference')
  GROUP BY c.run_id
), score AS (
  SELECT r.run_id, coalesce(t.trips, 0) AS trips, t.feed_ok,
    coalesce(a.alerts, 0) AS alerts, coalesce(a.false_alerts, 0) AS false_alerts,
    coalesce(a.unreviewed, 0) AS unreviewed
  FROM pilot_runs AS r
  LEFT JOIN trip_counts AS t USING (run_id)
  LEFT JOIN alert_counts AS a USING (run_id)
  WHERE r.frozen_at IS NOT NULL
)
SELECT run_id, trips, alerts, false_alerts, unreviewed,
  round(false_alerts::numeric / nullif(trips, 0), 3) AS false_alerts_per_trip,
  CASE WHEN trips < 20 OR feed_ok IS NOT TRUE OR unreviewed > 0
         THEN 'INSUFFICIENT EVIDENCE'
       WHEN false_alerts <= 0.25 * trips THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM score ORDER BY run_id;
```

## Reporting schema (reference DDL)

IDs below are text for portability. Use equivalent application UUID types in the eventual reporting views. All timestamp fields are time zone aware. Snapshot construction enforces cutoff and evidence provenance; the score queries consume those frozen facts. The DDL is optional for an isolated test database.

```sql
-- Logical reporting inputs: one immutable copy per scoring run.
CREATE TABLE pilot_runs (
  run_id text PRIMARY KEY, window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL, frozen_at timestamptz,
  CHECK (window_end > window_start),
  CHECK (frozen_at IS NULL OR frozen_at >= window_end)
);
CREATE TABLE pilot_trips (
  run_id text REFERENCES pilot_runs, trip_id text, departed_at timestamptz NOT NULL,
  is_pilot_route boolean NOT NULL, is_simulated boolean NOT NULL,
  manifest_checked boolean NOT NULL, alert_feed_checked boolean NOT NULL,
  PRIMARY KEY (run_id, trip_id)
);
CREATE TABLE pilot_batches (
  run_id text, trip_id text NOT NULL, batch_id text, deadline_at timestamptz,
  completed_at timestamptz, delivery_state text NOT NULL
    CHECK (delivery_state IN ('received','undelivered','unknown')),
  PRIMARY KEY (run_id, batch_id), FOREIGN KEY (run_id, trip_id) REFERENCES pilot_trips
);
CREATE TABLE pilot_weight_units (
  run_id text, trip_id text NOT NULL, unit_id text, comparable boolean NOT NULL,
  pickup_net_kg numeric, receipt_net_kg numeric, tolerance_kg numeric,
  rule_version text, review_state text,
  PRIMARY KEY (run_id, unit_id), FOREIGN KEY (run_id, trip_id) REFERENCES pilot_trips
);
CREATE TABLE pilot_alerts (
  run_id text, trip_id text NOT NULL, alert_id text, kind text NOT NULL, verdict text,
  PRIMARY KEY (run_id, alert_id), FOREIGN KEY (run_id, trip_id) REFERENCES pilot_trips
);
```

## Assumptions to confirm

- **A1 — Observation window.** Two consecutive 28-day windows and a seven-day reconciliation period; confirm with the dispatcher that offline queues and review cases can clear in that period.
- **A2 — Evidence minimum.** At least 20 trips and the applicable 50 batches or comparison units. Verify the route volume before committing to the schedule.
- **A3 — Planning baselines.** 85% on time, 5% unexplained units, 0.50 false alerts/trip. These figures were not observed in Sri Lanka or at the proposed factory.
- **A4 — Proposed success thresholds.** ≥95%, ≤2%, and ≤0.25 per trip, respectively. Approve before observing pilot results.
- **A5 — Reporting model.** Frozen reporting relations, one cohort trip assignment per batch and a non-overlapping unit manifest are proposed design choices. Validate intake granularity, batch timing, tolerances and alert evidence against DM-001–DM-016, DM-020–DM-024, DM-028–DM-030 in [the assumptions log](ASSUMPTIONS.md).
