# DaluMaga project agents

These roles are project-scoped and registered in `config.toml`. Their configuration inherits the session's model and permissions.

- `backend_database` — NestJS, database and permissions.
- `mobile_offline` — Expo field app and offline sync.
- `web_dashboard` — React office workflows.
- `hardware_simulation` — hardware interfaces and simulators.
- `quality_security` — findings-focused quality and security review.

Open the DaluMaga repository as a trusted Codex project and start a new session if the roles do not appear in an existing session. Ask, for example, “Use the mobile_offline agent to review the offline sync queue.” Agent availability and actual delegation depend on the session's enabled tools and instructions. The main agent coordinates the work and integrates results. The role configurations do not start background agents or grant additional permissions.
