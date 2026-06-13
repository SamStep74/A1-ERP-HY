# Deploying Armosphera One Claude (sovereign local server)

Armosphera One Claude runs entirely on your own server. Data and the SQLite
database stay local, **outbound network is OFF by default**, and AI is opt-in.

## One-command install

```bash
npm run install:server      # = bash deploy/install.sh
```

This checks Node (>=22.5), installs dependencies, builds the UI, installs the
legal knowledge base if a prebuilt `laws.sqlite` is available, and registers a
service (launchd on macOS, systemd instructions on Linux). Then open
`http://127.0.0.1:4100`.

Verify prerequisites + build without installing a service:
```bash
bash deploy/install.sh --check
```

## Where data lives
- DB: `~/Library/Application Support/ArmospheraOneClaude/armosphera-one.db` (macOS)
  or `~/.local/share/armosphera-one-claude/armosphera-one.db` (Linux). Never in a
  synced folder. Override with
  `A1_STUDIO_DATA_DIR` (data directory) and `A1_STUDIO_SQLITE` (DB path); legacy
  compatibility still accepts `ARMOSPHERA_ONE_DATA_DIR` and `ARMOSPHERA_ONE_DB`.
- Legal KB: `…/ArmospheraOneClaude/laws.sqlite` (override `ARMOSPHERA_ONE_LAWS_DB`).

## Data sovereignty
- Outbound network OFF by default. To allow opt-in calls (webhooks, cloud AI),
  set `ARMOSPHERA_ONE_ALLOW_EGRESS=1` and list hosts in
  `ARMOSPHERA_ONE_EGRESS_ALLOWLIST`. Loopback is always allowed.
- AI defaults to a local model (Ollama on `127.0.0.1:11434`); cloud is opt-in.

## Service management
- macOS: `launchctl kickstart -k gui/$(id -u)/com.armosphera.one` (restart),
  `launchctl print gui/$(id -u)/com.armosphera.one` (status),
  `launchctl unload ~/Library/LaunchAgents/com.armosphera.one.plist` (stop).
- Linux: `sudo systemctl {status,restart,stop} armosphera-one`.

## Backups
```bash
npm run backup              # WAL-consistent copy, keeps last 14
```
Schedule daily (cron/launchd). Restore by stopping the service and copying a
backup over the DB path.

## Upgrade
Pull the new code, then `npm run install:server` again (idempotent: reinstalls
deps, rebuilds UI, reloads the service).

> Production tax/accounting/legal behavior must be reviewed by a qualified
> Armenian accountant and lawyer before go-live.
