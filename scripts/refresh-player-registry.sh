#!/usr/bin/env bash
# The refresh workflows' player-registry step (update-data-soccer.yml, update-data-basketball.yml,
# update-data-volleyball.yml): after a roster fetch changed data/<sport>/rosters.json or jv-rosters.json, rebuild
# data/players.json from them and hold it to tests/players-registry.test.ts, as README asks after `pnpm fetch-rosters`.
#
#   scripts/refresh-player-registry.sh <sport>
#
# A roster that moved on upstream can leave the hand-curated data/player-identity.json pointing at a MaxPreps career
# no source lists any more (a coach re-entering a roster, 2026-11-21), which the registry build refuses. Committing
# such rosters would turn every later check of main red, so when the build or the tests fail, this puts the rosters
# and data/players.json back as they were committed, says why as an error annotation, and exits 1: the refresh still
# commits its other files, and the rosters wait until a person updates the curation file and runs
# `pnpm build-players` (the error names the entry). It never writes the hand-curated field hockey files the build
# stamps (--no-stamp): a rebuild that would re-stamp them fails the tests instead, and is done by hand.
#
# Exit 0: rosters unchanged (nothing to do), or rebuilt and tested. Exit 1: rosters and registry restored.
set -uo pipefail

sport="${1:?usage: scripts/refresh-player-registry.sh <sport>}"
rosters=("data/$sport/rosters.json" "data/$sport/jv-rosters.json")
registry=data/players.json

if git diff --quiet -- "${rosters[@]}"; then
  echo "the $sport rosters did not change: the player registry is not rebuilt"
  exit 0
fi

# A workflow command's message is one line: %, CR and LF are escaped.
annotate() {
  local msg="$1"
  msg="${msg//'%'/'%25'}"
  msg="${msg//$'\r'/'%0D'}"
  msg="${msg//$'\n'/'%0A'}"
  echo "::error title=Player registry (${sport} rosters held back)::${msg}"
}

restore() {
  git checkout -- "${rosters[@]}" "$registry"
  echo "restored ${rosters[*]} and $registry to the committed files"
}

log="$(mktemp)"
if ! pnpm -s build-players --no-stamp 2>&1 | tee "$log"; then
  reason="$(grep -m1 -E '^(FAILED|Error)' "$log" || tail -n 1 "$log")"
  annotate "pnpm build-players failed on the new $sport rosters, so they are not committed: ${reason}. Update data/player-identity.json, then run pnpm build-players and commit."
  restore
  exit 1
fi

if ! pnpm exec vitest run tests/players-registry.test.ts 2>&1 | tee "$log"; then
  reason="$(grep -m1 -E '(AssertionError|Error):' "$log" || echo 'see the step log')"
  annotate "tests/players-registry.test.ts failed on the registry rebuilt from the new $sport rosters, so they are not committed: ${reason}. Run pnpm build-players and the test by hand."
  restore
  exit 1
fi

echo "rebuilt $registry from the new $sport rosters; tests/players-registry.test.ts passed"
