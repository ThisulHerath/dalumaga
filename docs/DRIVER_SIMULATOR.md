# Driver trip simulator

This is a development-only sample. The driver, dispatcher and GPS endpoints require `DALUMAGA_STAFF_SIMULATOR=true`, refuse production mode, and use the existing local-only simulator API binding. Do not use real employee, vehicle or factory data. There is no real GPS integration, map, geofence, inferred-stop detection, ETA, push alert or fuel monitoring in this slice.

The encrypted local queue stores stop and resume events with client-generated IDs and original phone timestamps. Events are sent in order after reconnection. The server authorizes the assigned driver and device, and accepts an identical event ID once. If an event conflicts, it remains pending and the app asks for office review; there is no conflict-resolution screen yet. Phone clocks can be wrong. After a restart, saved-session unlock requires configured biometrics, and recording requires an online recheck; without it the user must sign in online. Do not delete app data or the retained legacy plaintext backup.

To create a sample driver, first configure the intended **development** database and seed the existing sample staff. Then, from the repository root:

```powershell
Set-Location 'C:\Users\thisu\Desktop\freetime\DaluMaga\apps\api'
$env:DALUMAGA_SEED_CONFIRM = 'development'
node --env-file-if-exists=.env ./scripts/run-node.cjs --import tsx ./scripts/seed-driver.ts
Remove-Item Env:DALUMAGA_SEED_CONFIRM
Set-Location ../..
corepack.cmd pnpm dev
```

The generated username and password are stored in `apps/api/.staff-driver-credentials.json`, which Git ignores. Keep it private. The sample shares the sample route and vehicle, and creates a separate assigned trip with an example deadline two hours from its creation. The deadline is a demonstration, not a tea-quality rule. Re-running the seed preserves the original deadline. To try the app, use a SQLCipher-enabled Android development build; Expo Go is unsupported.

Sign in as the sample driver, choose the trip, turn off network access and tap a reason. Tap **End stop** when leaving. The app shows the number of events awaiting sync. Reconnect and tap **Sync**. In the office, sign in as the sample dispatcher and select **Refresh trips**. The stop history shows driver reports, not inferred vehicle movement.

The office buttons generate synthetic route points and a deliberate signal gap. The gap inserts no location. The last fix time and server receipt time are distinct; a missing or old fix is **never** shown as a stop. The latest-time display updates while the page remains open, but new events and locations require a manual refresh.

**ASSUMPTIONS:** The pilot uses one assigned driver per trip, one phone per driver, a driver account without a weigher or receiver role, and Android first. The current app prioritizes weighing for accounts with multiple field roles; it has no role switcher. A driver can safely tap a reason when stopped. Confirm route, pickup points, deadline policy, stop categories, phone access, connectivity and recovery procedures with the factory and driver.

## Simulated deadline preview

The office trip list is ordered by the earliest open batch deadline, with unconfigured deadlines last. The dispatcher may enter a whole number of remaining travel minutes (0–720), including any expected remaining stops, to preview a **simulated** arrival and compare it with that earliest deadline. The estimate is anchored to the time the dispatcher entered it and to the current simulated GPS fix. An arrival strictly after the deadline is marked at risk; equality is on time. An open deadline already in the past is shown separately even when the estimate is unavailable.

The preview is not a routing calculation, does not account for traffic or changing stops, is kept only in the current browser tab, and does not create, send or persist an alert. It becomes unavailable when the location is missing, not simulated, stale, in the future, or changes; when the estimate is missing, invalid, stale, in the future or already elapsed; or when the freshness setting is invalid. A page refresh loses previews. The freshness check is evaluated as the page clock updates; the operator must manually refresh for new server data. Never use this preview as a live delivery prediction.

`VITE_SIMULATOR_FIX_MAX_AGE_MINUTES` controls the maximum age of both fix and estimate for this preview. **ASSUMPTION:** 10 minutes if not configured; acceptable range is greater than zero through 1440 minutes. Confirm a suitable value and the agreed delivery milestone with the pilot factory. **ASSUMPTION:** all batches on the sample trip share the same simulated arrival; the comparison uses the earliest open batch deadline. Per-batch prediction, automatically maintained alerts, acknowledgement, stale-data handling on the server and a verified routing provider remain future work.
