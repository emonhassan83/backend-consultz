#!/usr/bin/env bash
# Full, reproducible load run from a clean DB:
#   stop API -> reset load DB -> start API (dist build + mocks) -> setup -> matrix + stress
# Requires the throwaway Mongo container (consultz-loadtest) to be running.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1
R=loadtest/results

stop_server() {
  powershell -NoProfile -Command '$c = Get-NetTCPConnection -LocalPort 5099 -State Listen -ErrorAction SilentlyContinue; if ($c) { foreach ($x in $c) { Stop-Process -Id $x.OwningProcess -Force -ErrorAction SilentlyContinue } }' >/dev/null 2>&1
  sleep 2
}

stop_server
rm -f $R/main__*.json $R/stress__*.json $R/profile__*.json $R/markers.jsonl $R/proc-metrics.jsonl $R/server.log $R/run-all.log
./loadtest/reset-db.sh > $R/reset.log 2>&1 || { echo "reset failed"; exit 1; }

(nohup bash loadtest/start-server.sh dist >/dev/null 2>&1 & echo $! > $R/server.pid)
for i in $(seq 1 60); do
  if grep -q "Simple Server Listening" $R/server.log 2>/dev/null; then break; fi
  sleep 1
done
grep -q "Connected to database" $R/server.log || { echo "server did not connect"; exit 1; }

BOOKINGS_PER_CONSULT=5 node loadtest/setup.js > $R/setup.log 2>&1 || { echo "setup failed"; cat $R/setup.log; exit 1; }
node loadtest/run.js all > $R/run-all.log 2>&1
echo "run.js exit=$?" >> $R/run-all.log
node loadtest/report.js >> $R/run-all.log 2>&1
echo ALL_DONE
