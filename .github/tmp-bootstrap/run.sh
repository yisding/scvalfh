#!/usr/bin/env bash
# TEMPORARY. Step 2: the volleyball data for the 60-team registry (WCAL and WBAL added), and a new corpus.
set -uo pipefail
step() { echo "=== $* ==="; "$@"; echo "=== rc=$? ==="; }
C=tests/fixtures/corpus
rm -rf "$C/vb-new"
step pnpm fetch-data --no-sblive --no-vnn --no-cifss --capture "$C/vb-new"
if [ -f "$C/vb-new/manifest.json" ]; then rm -rf "$C/volleyball-2026-11-14" && mv "$C/vb-new" "$C/volleyball-2026-11-14"; fi
step pnpm fetch-prior-season
step pnpm fetch-rosters
step pnpm fetch-rosters --level jv
step pnpm fetch-jv --no-sblive
step pnpm fetch-player-stats
step pnpm fetch-prior-players
