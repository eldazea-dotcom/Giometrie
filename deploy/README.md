# Automatic production deployment

The Deploy workflow runs on pushes to `main`, including merges, and can be
started manually from Actions. Manual runs also require `main`. It type-checks
both apps, runs the regression tests, builds the frontend, and deploys only if
these checks succeed. Concurrent runs do not interrupt an active deployment.

GitHub Actions must be enabled in this repository. Forks do not inherit the
upstream repository's secrets. Configure these **Actions repository secrets**:

| Name | Value |
| --- | --- |
| `DEPLOY_HOST` | Existing server hostname or IPv4 address, without `https://` |
| `DEPLOY_USER` | SSH account that owns the app and its PM2 process |
| `DEPLOY_PATH` | Existing absolute application directory, e.g. `/var/www/giometrie`; no trailing slash |
| `DEPLOY_SSH_KEY` | Base64-encoded, unencrypted SSH private key authorized for that account |
| `DEPLOY_KNOWN_HOSTS` | SSH known_hosts entry verified against the server's host key |

Optional Actions variables: `DEPLOY_PORT` (default `22`) and
`DEPLOY_SITE_URL` (default `https://www.giometrie.uz`). Do not paste credentials
into issues, source files, or workflow logs. The script validates the deployment
destination and requires an existing `server/.env`, `server/uploads` and
`ecosystem.config.js` before syncing anything. It never runs VPS bootstrap.

The server needs Bun, PM2, rsync, curl and an initialized PostgreSQL application
database. CI uses Bun 1.4.4 and Node 24; production keeps its installed Bun.
The deployment does not change `server/.env` or `server/uploads`. Prisma
migrations run before the API restart. Old frontend chunks are retained for
open browser sessions; prune obsolete assets separately after a retention period.

On success, the workflow checks local and public `/api/health`, then verifies
the pushed commit in public `/release.json`. This proves the published static
release identity; it is not a full checkout/CRM end-to-end test. A failed check
marks the workflow failed. Database migrations and code updates are not
automatically rolled back: keep database/uploads backups and review migrations.

Choose one repository as the production source. If the original developer's
repository still deploys to this server, its owner should stop that deployment
when handing production over to this repository; GitHub concurrency groups do
not synchronize workflows across different repositories.
