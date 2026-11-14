#!/usr/bin/env bash
# TEMPORARY. Step 3: the soccer data for the 60-team registry (WCAL and WBAL added).
set -uo pipefail
step() { echo "=== $* ==="; "$@"; echo "=== rc=$? ==="; }
step pnpm fetch-data --no-sblive --no-vnn
step pnpm fetch-prior-season
step pnpm fetch-rosters
step pnpm fetch-rosters --level jv
step pnpm fetch-jv --no-sblive
step pnpm fetch-player-stats
step pnpm fetch-mascots --only riordan --only sacred-heart-cathedral --only castilleja --only crystal-springs \
  --only kings-academy --only menlo --only notre-dame-belmont --only sacred-heart-prep --only eastside \
  --only harker --only mercy-burlingame --only notre-dame-san-jose --only pinewood --only priory
