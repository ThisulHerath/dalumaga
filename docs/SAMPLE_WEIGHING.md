# Simulated weighing slice

This local demonstration uses a dedicated `dalumaga_demo` database and synthetic staff, crate, scale, and readings. The sample endpoints are disabled unless `DALUMAGA_DEMO=true`, `NODE_ENV` is not production, the API binds to `127.0.0.1`, and `DALUMAGA_DEMO_DATABASE_URL` addresses a local database named `dalumaga_demo`. Do not use this demo for actual staff or factory data.

## Start the demo with Docker

These commands assume the unchanged root and API example credentials. Start Docker Desktop first. The first block creates a separate local database if absent and applies the existing migration to it. It does not change the Supabase connection saved in `apps/api/.env`.

```powershell
Set-Location 'C:\Users\thisu\Desktop\freetime\DaluMaga'
docker compose up -d --wait postgres
$exists = docker compose exec -T postgres psql -U dalumaga_dev -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'dalumaga_demo'"
if ($exists.Trim() -ne '1') { docker compose exec -T postgres createdb -U dalumaga_dev dalumaga_demo }
$env:DATABASE_URL = 'postgresql://dalumaga_dev:local_pilot_only@127.0.0.1:55432/dalumaga_demo'
corepack.cmd pnpm db:migrate
$env:DALUMAGA_DEMO_DATABASE_URL = $env:DATABASE_URL
$env:DALUMAGA_DEMO = 'true'
$env:HOST = '127.0.0.1'
corepack.cmd pnpm dev
```

If you changed the Compose username, password or port, use your local values. Environment variables above affect this PowerShell session and its child processes. Open http://localhost:5174 and select **Prepare sample trip**. The included sample can be recorded once per stage. The application never replaces a reading with a new one.

## Try the flow

1. Use an Android emulator with the Expo SDK 54 app or an installed development build. Its API address is `http://10.0.2.2:3000/v1`; the demo API only listens on the computer's loopback address.
2. At pickup, switch the emulator to airplane mode, select **Pickup**, read the simulated 20 kg gross weight and save. The app displays 18 kg net and one pending event.
3. On a second emulator, select **Receipt**, read and save 17 kg gross, then sync. Refresh the office page and check it says **Awaiting pickup**.
4. Reconnect the first emulator. The app retries while active and on foregrounding, or tap **Sync**. Refresh the office page. It should display **3 kg less at receipt**.
5. A lost response keeps the original UUID in the local queue. Retrying the same event is acknowledged without adding a second reading. A different event for the same stage is rejected as a conflict.

## Current limits

This is a simulator-only development slice. The sample identities are fixed fixtures; login, assignment checks, audit-review screens and a real scale connection are not implemented. The two stages should be exercised on separate emulator instances to model independent staff. The mobile app's demo queue is separate from any earlier queue. There is no UI to reset the immutable sample readings; use another isolated development database for a fresh run rather than altering records. The current demo service requires the database name `dalumaga_demo`.

The database tests use an explicitly supplied disposable database. Without `DALUMAGA_DEMO_DATABASE_URL` the integration test is skipped. The user interface has not been validated on a physical Android device.
