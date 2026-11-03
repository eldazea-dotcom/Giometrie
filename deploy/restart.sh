#!/usr/bin/env bash
set -euo pipefail
cd "$1/server"
bun install --frozen-lockfile
bunx prisma generate
bunx prisma migrate deploy
cd ..
if pm2 describe giometrie-api > /dev/null 2>&1; then
  pm2 restart giometrie-api --update-env
else
  pm2 start ecosystem.config.js
fi
pm2 save
curl --fail --silent --show-error --retry 10 --retry-delay 3 --retry-all-errors \
  http://127.0.0.1:3001/api/health > /dev/null
