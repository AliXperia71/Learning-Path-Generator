# ops/

| File | Runs where | What |
|---|---|---|
| `deploy.sh` | Veriton, in the repo | Backup → fast-forward → build → health gate → auto-rollback |
| `backup-db.sh` | Veriton, cron 03:15 | Consistent SQLite snapshot out of the `cf-data` volume |
| `veriton/cf-autodeploy` | Veriton, `~/bin`, cron every 5 min | Polls `production`, runs `deploy.sh -y` |
| `veriton/cf-notify` | Veriton, `~/bin` | Emails (and optionally webhooks) deploy results |
| `veriton/cf-status` | Veriton, `~/bin` | One-command health check |

## Releasing

Production deploys whatever is on **`production` in the personal repo**
(`AliXperia71/Learning-Path-Generator`). Teammates can't push there, so merging
a PR into the team repo never changes the live site by itself.

```bash
git push origin main:production     # promote; live within ~5 minutes
```

Bringing in teammates' merged work first:

```bash
git fetch group
git merge --ff-only group/main      # on main
git push origin main
git push origin main:production
```

## How the poller behaves

- **Nothing new** → exits silently. Most ticks do this.
- **New commit** → runs `deploy.sh -y`, emails `deploy OK <sha>`.
- **Health gate fails** → `deploy.sh` rolls back; the commit is written to
  `~/.cf-autodeploy/poison` and **not retried**, otherwise every tick would
  rebuild the same broken commit forever. Push a newer commit and the poison
  clears itself. The mail says `rolled back` or, if the rollback didn't come
  up healthy either, `SITE DOWN`.
- **Stopped before building** (dirty tree, missing `backend/.env`, failed
  backup) → `deploy BLOCKED`, mailed once. Not poisoned, since the commit isn't
  at fault. Fix the box and the next tick retries.
- A run already in progress makes the next one exit immediately (`flock`).

`cf-autodeploy --check` shows what it would do without deploying.
`cf-status` shows the last result and any poisoned commit.

## Recovering

| Symptom | Do |
|---|---|
| Poisoned commit you've since fixed | Push the fix; nothing else needed |
| Want to retry the *same* commit | `rm ~/.cf-autodeploy/poison` |
| `BLOCKED` | `git status` on the Veriton; the tree must be clean |
| Pause auto-deploy | `crontab -e`, comment out the `cf-autodeploy` line |

## Alerts

`cf-notify` reads `SMTP_*` from `backend/.env` (the app's own settings) and
runs on the host, not in a container, so it still works when the stack is
down. Put overrides in `~/.cf-autodeploy/notify.env`:

```bash
CF_NOTIFY_TO=you@example.com              # default: SMTP_USER
CF_NOTIFY_WEBHOOK=https://ntfy.sh/<topic> # optional phone push
```

## The `veriton/` copies

The live scripts run from `~/bin` on the Veriton, **outside** the repo:
`deploy.sh` refuses a dirty tree and untracked files count. These tracked
copies are the backup and the review surface. **Edit both.** `cf-autodeploy`
compares itself to its copy and flags drift in `cf-status`.

Install/update on the Veriton:

```bash
cp ~/apps/course-forge/ops/veriton/cf-* ~/bin/
```
