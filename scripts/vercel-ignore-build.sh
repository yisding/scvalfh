#!/usr/bin/env bash
# Vercel's "Ignored Build Step" for the two projects this repo deploys (README "Deploy notes"): the field
# hockey site and the girls soccer site (SCVAL_SPORT=soccer, soccer.ncfh.net). Every push to main reaches
# both projects; this skips a build whose changes since the project's last deployment are all the OTHER
# sport's data files, which its build never reads (lib/sports/current.ts DATA_DIR):
#
#   field hockey skips a change only under data/soccer/  (update-data-soccer.yml's refreshes);
#   soccer skips a change only under data/ outside data/soccer/  (update-data.yml's refreshes).
#
# Set in each Vercel project (Settings → Git → Ignored Build Step), naming the project's sport:
#   bash scripts/vercel-ignore-build.sh field-hockey
#   bash scripts/vercel-ignore-build.sh soccer
#
# Vercel's contract: exit 0 skips the build, exit 1 builds. Anything this cannot decide (no previous
# deployment, a previous commit outside the shallow clone, an unknown sport) builds.

set -uo pipefail

sport="${1:-${SCVAL_SPORT:-field-hockey}}"
base="${VERCEL_GIT_PREVIOUS_SHA:-}"
head="${VERCEL_GIT_COMMIT_SHA:-HEAD}"

build() { echo "vercel-ignore-build ($sport): build — $1"; exit 1; }
skip() { echo "vercel-ignore-build ($sport): skip — $1"; exit 0; }

case "$sport" in
  field-hockey | soccer) ;;
  *) build "unknown sport '$sport'" ;;
esac

[ -n "$base" ] || build "no previous deployment to compare with"
# Vercel's clone is shallow: fetch the previous deployment's commit if it is not there yet.
if ! git cat-file -e "$base^{commit}" 2>/dev/null; then
  git fetch --quiet --depth=50 origin "$base" 2>/dev/null || true
fi
git cat-file -e "$base^{commit}" 2>/dev/null || build "the previous deployment's commit $base is not in the clone"

changed=$(git diff --name-only "$base" "$head") || build "git diff $base $head failed"
[ -n "$changed" ] || skip "nothing changed since $base"

while IFS= read -r file; do
  case "$sport" in
    field-hockey)
      case "$file" in data/soccer/*) ;; *) build "$file changed" ;; esac ;;
    soccer)
      case "$file" in data/soccer/*) build "$file changed" ;; data/*) ;; *) build "$file changed" ;; esac ;;
  esac
done <<< "$changed"

skip "only the other sport's data changed since $base"
