#!/usr/bin/env bash
set -euo pipefail

node deploy/validate-config.mjs
: "${GITHUB_SHA:?Missing release commit}"
[[ "$GITHUB_SHA" =~ ^[a-f0-9]{40}$ ]] || exit 1
DEPLOY_PORT="${DEPLOY_PORT:-22}"
DEPLOY_SITE_URL="${DEPLOY_SITE_URL:-https://www.giometrie.uz}"

ssh_dir="$(mktemp -d)"
trap 'rm -rf -- "$ssh_dir"' EXIT
printf '%s' "$DEPLOY_SSH_KEY" | base64 --decode > "$ssh_dir/key"
chmod 600 "$ssh_dir/key"
ssh-keygen -y -P '' -f "$ssh_dir/key" > /dev/null
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > "$ssh_dir/known_hosts"
chmod 600 "$ssh_dir/known_hosts"
export GIT_SSH_COMMAND="ssh -i $ssh_dir/key -p $DEPLOY_PORT -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$ssh_dir/known_hosts -o ConnectTimeout=15"
export RSYNC_RSH="$GIT_SSH_COMMAND"
ssh_args=(-i "$ssh_dir/key" -p "$DEPLOY_PORT" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$ssh_dir/known_hosts" -o ConnectTimeout=15)
target="$DEPLOY_USER@$DEPLOY_HOST"

# Check the existing app before any --delete operation. Never bootstrap a server here.
ssh "${ssh_args[@]}" "$target" "bash -s -- '$DEPLOY_PATH'" <<'REMOTE'
set -euo pipefail
cd "$1"
test -f server/.env
test -f ecosystem.config.js
test -d server/uploads
command -v bun > /dev/null
command -v pm2 > /dev/null
command -v rsync > /dev/null
command -v curl > /dev/null
REMOTE

# Keep server/.env, server/uploads and node_modules outside all --delete targets.
rsync -az --delete shared/ "$target:$DEPLOY_PATH/shared/"
rsync -az --delete server/src/ "$target:$DEPLOY_PATH/server/src/"
rsync -az server/prisma/ "$target:$DEPLOY_PATH/server/prisma/"
rsync -az server/package.json server/bun.lock server/tsconfig.json "$target:$DEPLOY_PATH/server/"
rsync -az deploy/ecosystem.config.js "$target:$DEPLOY_PATH/ecosystem.config.js"
ssh "${ssh_args[@]}" "$target" "bash -s -- '$DEPLOY_PATH'" < deploy/restart.sh

# Keep old hashed chunks for clients that loaded the previous index.html.
# Pruning old assets is a separate maintenance operation, not part of deployment.
rsync -az --exclude=index.html dist/ "$target:$DEPLOY_PATH/dist/"
rsync -az dist/index.html "$target:$DEPLOY_PATH/dist/index.html"

curl --fail --silent --show-error --retry 10 --retry-delay 3 --retry-all-errors \
  "$DEPLOY_SITE_URL/api/health" > /dev/null
curl --fail --silent --show-error --retry 5 --retry-delay 3 \
  "$DEPLOY_SITE_URL/release.json?commit=$GITHUB_SHA" > "$ssh_dir/release.json"
node --input-type=module - "$ssh_dir/release.json" <<'NODE'
import { readFileSync } from 'node:fs';
const release = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (release.commit !== process.env.GITHUB_SHA) throw new Error('Public site is not serving this release. Check DNS/proxy/cache.');
NODE
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  printf 'Deployed commit `%s`. Public API health and release identity verified.\n' "$GITHUB_SHA" >> "$GITHUB_STEP_SUMMARY"
fi
