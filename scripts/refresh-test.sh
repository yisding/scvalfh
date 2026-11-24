#!/usr/bin/env bash
# The Test step of the soccer, basketball and volleyball refreshes (update-data-<sport>.yml): run the sport's tests on
# what the run just fetched, and when they fail, find the one file group they refuse and put only that one back.
#
#   scripts/refresh-test.sh <sport> <test file>...
#
# The stats, the JV games and the rosters are each allowed to fail upstream, so one of them the tests refuse must not
# cost the snapshot, nor the other two. The groups, each restored to the committed files as one:
#   jv       data/<sport>/jv.json
#   stats    data/<sport>/player-stats.json
#   rosters  data/<sport>/rosters.json, data/<sport>/jv-rosters.json and data/players.json (rebuilt from them)
# When the tests fail, each group this run changed is put back on its own and the tests run again; the first that
# passes is the group they refused, and the other groups' new files stay for the commit. Only when no group alone is
# enough do all of them go back for a last run, whose verdict decides. A group this run did not change is never
# tried, and with none changed the first verdict decides: a bad snapshot is never committed.
#
# This used to put every group back at once, so a roster a curated file no longer agreed with also cost the day's
# stats and JV games (2026-11-23); the loaders now report that roster drift instead of failing
# (lib/players/roster-drift.ts), and this keeps whatever a remaining failure does not need.
#
# Writes restored=true and restored_<group>=true to $GITHUB_OUTPUT for each group put back. Exit: the tests' verdict.
set -uo pipefail

sport="${1:?usage: scripts/refresh-test.sh <sport> <test file>...}"
shift
tests=("$@")
out="${GITHUB_OUTPUT:-/dev/null}"

files_of() {
  case "$1" in
    jv) echo "data/$sport/jv.json" ;;
    stats) echo "data/$sport/player-stats.json" ;;
    rosters) echo "data/$sport/rosters.json data/$sport/jv-rosters.json data/players.json" ;;
  esac
}

run() { pnpm exec vitest run "${tests[@]}"; }

if run; then exit 0; fi

changed=()
for g in jv stats rosters; do
  # The registry changes only with the rosters: whether the group changed is whether a roster file did.
  probe=$(files_of "$g")
  [ "$g" = rosters ] && probe="data/$sport/rosters.json data/$sport/jv-rosters.json"
  # shellcheck disable=SC2086
  git diff --quiet -- $probe || changed+=("$g")
done
if [ "${#changed[@]}" -eq 0 ]; then
  echo "::error::the $sport tests failed and none of the $sport stats, JV games or rosters changed in this run"
  exit 1
fi

# This run's files, to put back when restoring their group alone was not the answer.
keep="$(mktemp -d)"
for g in "${changed[@]}"; do
  for f in $(files_of "$g"); do
    mkdir -p "$keep/$(dirname "$f")"
    cp "$f" "$keep/$f"
  done
done

restore() {
  # shellcheck disable=SC2046
  git checkout -- $(files_of "$1")
  echo "restored=true" >> "$out"
  echo "restored_$1=true" >> "$out"
}

for g in "${changed[@]}"; do
  echo "::warning::the $sport tests failed; testing again without this run's $g ($(files_of "$g"))"
  # shellcheck disable=SC2046
  git checkout -- $(files_of "$g")
  if run; then
    echo "restored=true" >> "$out"
    echo "restored_$g=true" >> "$out"
    echo "::warning::the $sport tests refused this run's $g: it is not committed; the other files are"
    exit 0
  fi
  for f in $(files_of "$g"); do cp "$keep/$f" "$f"; done
done

echo "::warning::no one group explains the failure; testing again without this run's ${changed[*]}"
for g in "${changed[@]}"; do restore "$g"; done
run
