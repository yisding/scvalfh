#!/usr/bin/env bash
#
# The Stage D gate (SPEC §12.3, §13.6), runnable on one machine: the CI job list of
# .github/workflows/ci.yml in one script, against all three deploys of the site.
#
#   pnpm typecheck && pnpm lint && pnpm test   # first (the gate assumes them)
#   bash scripts/stage-gate-d.sh               # = pnpm gate:d
#
#  1. `pnpm build`, then the build assertions: assert:prerender (exact route counts, ':' check,
#     OG/page parity by name), assert:budgets (§12.4), assert:copy (§10.9 over the built HTML).
#  2. `next start -p 3117` → wait for 200 → smoke `next` → axe → stop.
#  3. `pnpm build:vinext` → assert-vinext-prerender.ts → `vinext start --port 3118` → smoke `node`
#     → axe → stop.
#  4. `pnpm build:cloudflare` → assert-vinext-prerender.ts --cloudflare → the Worker budget →
#     .cloudflare/output/v0/config.json exists and no .dev.vars*/.env* file is in the output →
#     `vite preview --mode cloudflare --port 3119` → the first 404 (/standings/nope) in the fresh
#     isolate must answer within 500 ms → smoke `workers` → axe →
#     `vinext-cloudflare deploy --env cloudflare --dry-run` → stop.
#  5. Every server it started is killed on exit (trap), success or not.
#
# Each axe run points SCVAL_BASE_URL at its own server (scripts/a11y-axe.mjs defaults to :3117).
# axe-core, Playwright and Chromium are not repo dependencies: when NODE_PATH does not already
# resolve them, they are installed into /tmp/axe (as .github/actions/install-axe does in CI) and
# NODE_PATH is pointed there. If that install fails, the script prints `A11Y SKIPPED: <reason>`
# and runs everything else — the ONLY skip this gate allows; every other failure stops it.
#
# A build, an assertion over a build or a server that does not come up stops the gate at once
# (everything after it depends on it). A smoke or axe failure is recorded and the gate goes on to
# the next server, so one run reports every server's result; it still exits 1 at the end, naming
# each failed check.
#
# The three builds share one pinned build instant (SCVAL_BUILD_AT), as the CI jobs do, and the
# Worker is built with a non-localhost SITE_URL, as the cloudflare job does, so the smoke proves
# that prerendered pages and request-time 404s agree on it. Ports 3117-3119 must be free.

set -euo pipefail

cd "$(dirname "$0")/.."

export SCVAL_BUILD_AT=${SCVAL_BUILD_AT:-$(date -u +%Y-%m-%dT%H:%M:%S.000Z)}
AXE_DIR=${AXE_DIR:-/tmp/axe}
LOG_DIR=$(mktemp -d)
pgids=()

failed=()

step() { printf '\n=== %s\n' "$*"; }

# check NAME CMD... — a smoke or axe run: a failure is recorded, and the gate continues.
check() {
  local name=$1; shift
  if "$@"; then echo "ok: $name"; else echo "FAILED: $name" >&2; failed+=("$name"); fi
}

cleanup() {
  local code=$?
  for pgid in "${pgids[@]:-}"; do
    [ -n "$pgid" ] || continue
    kill -TERM -- "-$pgid" 2>/dev/null || true
  done
  sleep 1
  for pgid in "${pgids[@]:-}"; do
    [ -n "$pgid" ] || continue
    kill -KILL -- "-$pgid" 2>/dev/null || true
  done
  rm -rf "$LOG_DIR"
  if [ "$code" -eq 0 ]; then echo; echo "stage-gate-d: PASS"; else echo; echo "stage-gate-d: FAIL (exit $code)" >&2; fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

port_free() {
  if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$1/"; then
    echo "port $1 already answers; stop that server first (the gate must test its own build)" >&2
    return 1
  fi
}

# start NAME PORT CMD... — run CMD in its own process group (so the trap can kill the whole tree,
# not only the pnpm wrapper), then wait up to 90 s for HTTP 200 on /.
start() {
  local name=$1 port=$2; shift 2
  port_free "$port"
  setsid "$@" > "$LOG_DIR/$name.log" 2>&1 &
  local pid=$!
  pgids+=("$pid")
  for _ in $(seq 1 90); do
    if curl -fsS -o /dev/null --max-time 5 "http://127.0.0.1:$port/"; then echo "$name up on :$port"; return 0; fi
    if ! kill -0 "$pid" 2>/dev/null; then break; fi
    sleep 1
  done
  echo "$name did not come up on :$port; its log:" >&2
  cat "$LOG_DIR/$name.log" >&2
  return 1
}

# stop — kill the most recently started server's process group and wait until its port is free.
stop() {
  local port=$1
  local pgid=${pgids[${#pgids[@]}-1]}
  kill -TERM -- "-$pgid" 2>/dev/null || true
  for _ in $(seq 1 30); do
    curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$port/" || break
    sleep 1
  done
  kill -KILL -- "-$pgid" 2>/dev/null || true
  unset 'pgids[${#pgids[@]}-1]'
}

# ------------------------------------------------------------------ axe-core + Playwright
a11y_ready=1
a11y_skip_reason=''
axe_resolves() {
  NODE_PATH=${NODE_PATH:-} node -e "require.resolve('axe-core/axe.min.js'); require('playwright')" >/dev/null 2>&1
}
install_axe() {
  mkdir -p "$AXE_DIR" || return 1
  (
    cd "$AXE_DIR" &&
      { [ -f package.json ] || npm init -y >/dev/null; } &&
      npm install --no-save --no-audit --no-fund axe-core@4.13 playwright >/dev/null &&
      { npx playwright install --with-deps chromium || npx playwright install chromium; }
  ) > "$LOG_DIR/axe-install.log" 2>&1
}
step "axe-core and Playwright"
if axe_resolves; then
  echo "resolved through NODE_PATH=${NODE_PATH:-}"
else
  export NODE_PATH=$AXE_DIR/node_modules${NODE_PATH:+:$NODE_PATH}
  if axe_resolves; then
    echo "found in $AXE_DIR"
  elif install_axe && axe_resolves; then
    echo "installed into $AXE_DIR"
  else
    a11y_ready=0
    a11y_skip_reason="could not install axe-core/playwright/chromium into $AXE_DIR ($(tail -n 1 "$LOG_DIR/axe-install.log" 2>/dev/null || echo 'no log'))"
  fi
fi

a11y() {
  local base=$1
  if [ "$a11y_ready" = 1 ]; then
    SCVAL_BASE_URL=$base node scripts/a11y-axe.mjs
  else
    echo "A11Y SKIPPED: $a11y_skip_reason"
  fi
}

# ------------------------------------------------------------------ 1. next build + assertions
step "1. pnpm build"
pnpm build
step "1. assert:prerender"
pnpm assert:prerender
step "1. assert:budgets"
pnpm assert:budgets
step "1. assert:copy"
pnpm assert:copy

# ------------------------------------------------------------------ 2. next start
step "2. next start -p 3117"
start next 3117 pnpm exec next start -p 3117
check 'smoke next start' bash scripts/smoke-server.sh http://127.0.0.1:3117 next
check 'axe next start' a11y http://127.0.0.1:3117
stop 3117

# ------------------------------------------------------------------ 3. vinext (Node)
step "3. pnpm build:vinext"
pnpm build:vinext
pnpm exec tsx scripts/assert-vinext-prerender.ts
step "3. vinext start --port 3118"
start vinext 3118 pnpm exec vinext start --port 3118
check 'smoke vinext start' bash scripts/smoke-server.sh http://127.0.0.1:3118 node
check 'axe vinext start' a11y http://127.0.0.1:3118
stop 3118

# ------------------------------------------------------------------ 4. vinext (Cloudflare Workers)
step "4. pnpm build:cloudflare"
SITE_URL=https://scvalfh.example.invalid pnpm build:cloudflare
pnpm exec tsx scripts/assert-vinext-prerender.ts --cloudflare
pnpm exec tsx scripts/assert-budgets.ts --worker-only
# As ci.yml's cloudflare job: the Build Output config is there, and nothing that can hold a secret
# is: the plugin reads .dev.vars and .env* for local runs only, and all of .cloudflare/output is
# uploaded with the Worker.
test -f .cloudflare/output/v0/config.json || { echo "no Build Output config in .cloudflare/output" >&2; exit 1; }
leaked=$(find .cloudflare/output \( -name '.dev.vars*' -o -name '.env*' \) -print)
if [ -n "$leaked" ]; then echo "env files in the Worker output:" >&2; echo "$leaked" >&2; exit 1; fi
step "4. vite preview --mode cloudflare --port 3119"
start workers 3119 pnpm exec vite preview --mode cloudflare --port 3119 --strictPort --host 127.0.0.1
# The first 404 in the fresh isolate: rendered on request (the not-found page), so this is the
# cold-render cost a crawler's first bad URL pays.
first404=$(curl -s -o /dev/null -w '%{http_code} %{time_total}' --max-time 20 http://127.0.0.1:3119/standings/nope)
read -r code secs <<< "$first404"
ms=$(awk -v s="$secs" 'BEGIN { printf "%d", s * 1000 }')
echo "first 404 (/standings/nope) on the fresh Worker isolate: HTTP $code in ${ms} ms"
check 'first 404 on the Worker is a 404' test "$code" = 404
check 'first 404 on the Worker within 500 ms' test "$ms" -le 500
check 'smoke vite preview (workers)' bash scripts/smoke-server.sh http://127.0.0.1:3119 workers
check 'axe vite preview (workers)' a11y http://127.0.0.1:3119
step "4. vinext-cloudflare deploy --env cloudflare --dry-run"
pnpm exec vinext-cloudflare deploy --env cloudflare --dry-run
stop 3119

if [ "$a11y_ready" = 0 ]; then echo; echo "A11Y SKIPPED: $a11y_skip_reason"; fi
if [ "${#failed[@]}" -gt 0 ]; then
  echo
  echo "failed checks:" >&2
  for name in "${failed[@]}"; do echo "  - $name" >&2; done
  exit 1
fi
