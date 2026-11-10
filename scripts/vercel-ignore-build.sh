#!/usr/bin/env bash
# Vercel's "Ignored Build Step" for the projects this repo deploys (README "Deploy notes"): the field hockey
# site, the girls soccer site (SCVAL_SPORT=soccer, soccer.ncfh.net) and the boys basketball site
# (SCVAL_SPORT=basketball). Every push to main reaches every project; this skips a build whose changes since
# the project's last deployment are all ANOTHER sport's data files, which its build never reads
# (lib/sports/current.ts DATA_DIR):
#
#   field hockey skips a change only under data/soccer/ or data/basketball/  (the other sports' refreshes);
#   soccer skips a change only under data/ outside data/soccer/;
#   basketball skips a change only under data/ outside data/basketball/.
#
# Set in each Vercel project (Settings → Git → Ignored Build Step), naming the project's sport:
#   bash scripts/vercel-ignore-build.sh field-hockey
#   bash scripts/vercel-ignore-build.sh soccer
#   bash scripts/vercel-ignore-build.sh basketball
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
  field-hockey | soccer | basketball) ;;
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
      case "$file" in data/soccer/* | data/basketball/*) ;; *) build "$file changed" ;; esac ;;
    soccer | basketball)
      # Its own folder builds; any other data file is another sport's.
      case "$file" in "data/$sport/"*) build "$file changed" ;; data/*) ;; *) build "$file changed" ;; esac ;;
  esac
done <<< "$changed"

skip "only another sport's data changed since $base"
