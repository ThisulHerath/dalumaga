# DaluMaga · දළුමඟ

Track tea leaf collection, transport, and factory receipt across Sri Lanka.

## Workspace

| Directory       | Responsibility                                                 |
| --------------- | -------------------------------------------------------------- |
| apps/mobile     | Expo field client for Android and iOS                          |
| apps/web        | React + Vite office client                                     |
| apps/api        | NestJS HTTP API and TypeORM migration runner                   |
| packages/shared | Zod validators, inferred TypeScript types and constants        |
| db              | PostgreSQL migration SQL                                       |
| docs            | [Research, architecture, UX and API contracts](docs/README.md) |

## Set up on Windows

Install Node 24 (the version in `.node-version`), Git, and Docker Desktop with its Linux engine running. Use a PowerShell terminal. `corepack.cmd pnpm` selects the version pinned in package.json.

```powershell
Set-Location 'C:\Users\thisu\Desktop\freetime\DaluMaga'
node --version
corepack.cmd pnpm --version
docker compose version
docker info
corepack.cmd pnpm install --frozen-lockfile

# Copy missing files only, preserving any existing credentials.
foreach ($folder in '.', 'apps/api', 'apps/web', 'apps/mobile') {
  $destination = Join-Path $folder '.env'
  if (!(Test-Path -LiteralPath $destination)) {
    Copy-Item -LiteralPath (Join-Path $folder '.env.example') -Destination $destination
  }
}
docker compose up -d --wait postgres
corepack.cmd pnpm db:migrate
corepack.cmd pnpm db:status
corepack.cmd pnpm dev
```

Open **http://localhost:5174** and select **Check API connection**. The API health endpoint is **http://localhost:3000/v1/health**. The mobile check uses the same response schema. Dev starts Metro, Vite, the Nest API and a shared-package watcher. To run Metro interactively on its own, first run `corepack.cmd pnpm --filter @dalumaga/shared build`, then `corepack.cmd pnpm --filter @dalumaga/mobile dev` in a separate terminal from the API. Use a matching Expo SDK 54 client or development build. To build/install Android with Android Studio and an emulator or USB device, run `corepack.cmd pnpm --filter @dalumaga/mobile exec expo run:android`; native iOS builds require macOS.

The Android emulator reaches the PC at `10.0.2.2`. For a physical phone on the same trusted Wi-Fi, set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` to `http://<PC-LAN-IP>:3000/v1`, then restart Expo. Public frontend environment variables are shipped with the clients. Put database credentials only in local server configuration. Health reports API availability; migration status checks PostgreSQL separately.

## Database

Docker binds the development database to loopback on port **55432**, leaving the existing PostgreSQL service on 5432 available. Match any changes to the root Compose credentials in `apps/api/.env`. The example password is for local development. Use a fresh database for this initial migration. A cloud PostgreSQL database can be selected with its provider-supplied migration connection URL and TLS settings in the API environment; skip the Compose command in that case.

**TypeORM** can execute the existing PostgreSQL SQL verbatim inside its migration transaction. This preserves the append-only triggers, partial unique indexes, views and the idempotent upload function. The runner records applied migrations in `public.dalumaga_migrations`. Never edit the initial SQL after applying it. Add a new timestamped migration in `apps/api/migrations` and register it in `apps/api/scripts/migrate.cjs`. Use a separate migration owner for a deployed environment. Automatic schema synchronization is disabled.

## Checks and commits

```powershell
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
corepack.cmd pnpm build
corepack.cmd pnpm format:check
```

The build produces web assets, compiled API and shared code, and an Expo Android JavaScript export. A signed installable app uses a separate native build. Husky runs ESLint/Prettier on staged files and commitlint on the commit message. Example Conventional Commit: `feat(api): add pickup weight validation`. The PR workflow runs the checks against a clean install and exercises migrations on PostgreSQL 18.

Stop local processes with Ctrl+C. Run `docker compose stop postgres` to stop the database and keep its volume.

**ASSUMPTION:** Node 24, Expo SDK 54, PostgreSQL 18, and Android-first CI are the chosen pilot baseline. Verify the scale SDK and handset against this Expo version before integrating Bluetooth hardware.
