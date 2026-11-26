#!/usr/bin/env bash
# The refresh workflows' player-registry step (update-data-soccer.yml, update-data-basketball.yml,
# update-data-volleyball.yml): after a roster fetch changed data/<sport>/rosters.json or jv-rosters.json, rebuild
# data/players.json (and the files it writes with it, below) from them and hold it to tests/players-registry.test.ts, as
# README asks after `pnpm fetch-rosters`.
#
#   scripts/refresh-player-registry.sh <sport>
#
# A roster that moved on upstream can leave the hand-curated data/player-identity.json pointing at a MaxPreps career
# no source lists any more (a coach re-entering a roster, 2026-11-21; Leland's duplicate rows, 2026-11-24). That is
# curation drift (lib/players/roster-drift.ts): the build leaves the entry out and warns, and the tests pass over
# curated records drift leaves out, so it no longer holds the rosters back; `pnpm roster-drift --identity` lists it
# for a person. What still fails is a registry the build or its tests refuse for another reason. Committing such
# rosters would turn every later check of main red, so then this puts the rosters and the registry back as they
# were committed, says why as an error annotation, and exits 1: the refresh still commits its other files, and the
# rosters wait until a person fixes it and runs `pnpm build-players` (the error says what). It never commits a
# hand-curated file: the overlay the build stamps (--no-stamp), and the files filed by person (below).
#
# The registry a refresh commits is data/players.json and each sport's data/<sport>/player-index.json (the row ->
# person index the pages read). `--files` prints them, for the workflows that restore and commit them with the
# rosters; it exits 1 rather than print nothing.
#
#   scripts/refresh-player-registry.sh --files
#
# The files filed by person (data/player-accounts.json, data/commitments.json, each sport's clubs.json) are hand-curated
# research: a refresh never commits them. A rebuild rewrites one only when it retires an id something is filed under
# (two records found to be one person); then this step fails like any other refused rebuild, so a person runs
# `pnpm build-players`, checks what moved and commits it.
#
# Exit 0: rosters unchanged (nothing to do), or rebuilt and tested. Exit 1: rosters and registry restored.
set -uo pipefail

# The registry's files the repository holds, one per line.
registry_files() {
  git ls-files -- data/players.json 'data/*/player-index.json'
}
# The files filed by person the repository holds, which a refresh never commits.
person_files() {
  git ls-files -- data/player-accounts.json data/commitments.json 'data/*/clubs.json'
}

if [ "${1:-}" = "--files" ]; then
  files="$(registry_files)" || { echo "refresh-player-registry.sh: the registry's files are not in this repository" >&2; exit 1; }
  [ -n "$files" ] || { echo "refresh-player-registry.sh: no registry files" >&2; exit 1; }
  echo $files
  exit 0
fi

sport="${1:?usage: scripts/refresh-player-registry.sh <sport>}"
rosters=("data/$sport/rosters.json" "data/$sport/jv-rosters.json")
mapfile -t registry < <(registry_files)
mapfile -t filed_by_person < <(person_files)

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
  git checkout -- "${rosters[@]}" "${registry[@]}" "${filed_by_person[@]}"
  echo "restored ${rosters[*]}, the registry (${registry[*]}) and the files filed by person to the committed files"
}

log="$(mktemp)"
if ! pnpm -s build-players --no-stamp 2>&1 | tee "$log"; then
  reason="$(grep -m1 -E '^(FAILED|Error)' "$log" || tail -n 1 "$log")"
  annotate "pnpm build-players failed on the new $sport rosters, so they are not committed: ${reason}. Update data/player-identity.json, then run pnpm build-players and commit."
  restore
  exit 1
fi

if [ "${#filed_by_person[@]}" -gt 0 ] && ! git diff --quiet -- "${filed_by_person[@]}"; then
  annotate "pnpm build-players re-keyed a file filed by person on the new $sport rosters (it retired an id something is filed under: $(git diff --name-only -- "${filed_by_person[@]}" | tr '\n' ' ')), so they are not committed. Run pnpm build-players, check what moved, and commit it."
  restore
  exit 1
fi

if ! pnpm exec vitest run tests/players-registry.test.ts 2>&1 | tee "$log"; then
  reason="$(grep -m1 -E '(AssertionError|Error):' "$log" || echo 'see the step log')"
  annotate "tests/players-registry.test.ts failed on the registry rebuilt from the new $sport rosters, so they are not committed: ${reason}. Run pnpm build-players and the test by hand."
  restore
  exit 1
fi

echo "rebuilt the registry from the new $sport rosters; tests/players-registry.test.ts passed"
