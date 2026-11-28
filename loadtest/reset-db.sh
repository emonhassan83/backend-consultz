#!/usr/bin/env bash
# Rebuilds the load DB from scratch. Stop the server first (it holds the DB open).
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export LOAD_DB='mongodb://localhost:27098/consultz_load?replicaSet=rs0&directConnection=true'
case "$LOAD_DB" in *localhost:27098*) ;; *) echo "refusing: not the load DB"; exit 1;; esac
npx ts-node --transpile-only loadtest/seed.ts
for s in seedPointsRules seedCategory seedContent; do
  DATABASE_URL="$LOAD_DB" npx ts-node --transpile-only "src/app/seeder/$s.ts" | grep -v "injected env" || true
done
