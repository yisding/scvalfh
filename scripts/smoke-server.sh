#!/usr/bin/env bash
#
# The response contract every deploy of this site answers, checked over HTTP on one URL of every
# kind against a server you started yourself. All three deploys are held to it: `next start`, the
# vinext Node server and the vinext Cloudflare Worker (in workerd, through `vite preview`).
# Exits non-zero after listing every mismatch, and every request that fails or times out.
#
#   pnpm build && pnpm exec next start -p 3117 &
#   bash scripts/smoke-server.sh http://127.0.0.1:3117 next
#
#   pnpm build:vinext && pnpm exec vinext start --port 3118 &
#   bash scripts/smoke-server.sh http://127.0.0.1:3118 node
#
#   pnpm build:cloudflare && pnpm exec vite preview --mode cloudflare --port 3119 --host 127.0.0.1 &
#   bash scripts/smoke-server.sh http://127.0.0.1:3119 workers
#
# What it checks: pages and metadata routes carry the next.config headers() cache rule; hashed
# assets keep the immutable cache; an unknown URL or param is a no-store 404 with the root
# not-found page, rendered with the same SITE_URL and build instant as the prerendered pages;
# pages answer a revalidation with 304; poweredByHeader stays off; and vinext's internal
# x-vinext-app-page-cache marker never leaves the server.
#
# The target names the deploy, for the few checks that differ by design:
# - next/node: hashed CSS goes out gzipped (`next start` compresses; vinext's Node target serves
#   its build-time precompressed copy). Not workers: workerd preview compresses nothing, and in
#   production Cloudflare's edge does it, after the Worker.
# - node/workers: /icon-192 must be a cache HIT, served from the build rather than rendered per
#   request with satori/resvg. Next has no such header contract for Route Handlers.
# - workers: the raw static-cache files the Worker reads through its ASSETS binding are not public.

set -euo pipefail

if [ $# -ne 2 ] || [[ ! "$2" =~ ^(next|node|workers)$ ]]; then
  echo "usage: $0 <base-url> <next|node|workers>" >&2
  exit 2
fi
base=${1%/} target=$2

public='public, s-maxage=300, stale-while-revalidate=86400'
nostore='private, no-cache, no-store, max-age=0, must-revalidate'
immutable='public, max-age=31536000, immutable'
failed=0
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# A dead or wrong server fails here, once and loudly, rather than as one "request failed" per URL.
if ! curl -sS --max-time 20 -o /dev/null "$base/"; then
  echo "FAIL: no server answering at $base" >&2
  exit 1
fi

header() { awk -v k="$1" 'tolower($0) ~ "^" k ":" { sub(/^[^:]*: */, ""); print; exit }' "$tmp/h"; }
fail() { echo "FAIL $1: $2"; failed=1; }
# expect PATH STATUS TYPE CACHE [curl args...] — TYPE is a prefix, so text/html matches
# "text/html; charset=utf-8"; the body is left in $tmp/b and the headers in $tmp/h.
expect() {
  local path=$1 status=$2 type=$3 cache=$4; shift 4
  : > "$tmp/b"; : > "$tmp/h"
  if ! curl -sS --max-time 20 -o "$tmp/b" -D "$tmp/h" "$@" "$base$path"; then
    fail "$path" "request failed"; return 0
  fi
  tr -d '\r' < "$tmp/h" > "$tmp/h2" && mv "$tmp/h2" "$tmp/h"
  local got; got=$(awk 'NR == 1 { print $2 }' "$tmp/h")
  [ "$got" = "$status" ] || fail "$path" "status $got, expected $status"
  [ -z "$type" ] || [[ "$(header content-type)" == "$type"* ]] || fail "$path" "content-type '$(header content-type)', expected $type"
  [ -z "$cache" ] || [ "$(header cache-control)" = "$cache" ] || fail "$path" "cache-control '$(header cache-control)', expected '$cache'"
  [ -z "$(header x-powered-by)" ] || fail "$path" "sends x-powered-by"
  # vinext marks page payloads served from its cache with this header for the server's own ETag
  # step; it is internal and must be removed before the response leaves (the Workers entry only
  # does so with patches/vinext@1.0.0.patch, server/app-router-entry.js).
  [ -z "$(header x-vinext-app-page-cache)" ] || fail "$path" "leaks x-vinext-app-page-cache"
  echo "$got $path"
}

expect / 200 text/html "$public"
# What the 404 below must agree with: the origin og:image is built from (SITE_URL) and whether the
# footer calls the snapshot stale (measured against the build instant). Every 404 is rendered on
# request while / comes from the build, so a server reading either value at run time, or a Worker
# whose clock reads the Unix epoch at module scope, shows up as a mismatch (see vite.config.ts).
og=$(grep -oE '<meta property="og:image" content="https?://[^/"]+' "$tmp/b" | sed -n 1p || true)
stale=$(grep -c 'the nightly update may be failing' "$tmp/b" || true)
[ -n "$og" ] || fail / "no absolute og:image"
expect /standings 200 text/html "$public"
# One page of each generateStaticParams family, whichever the sitemap lists first.
paths=$(curl -fsS --max-time 20 "$base/sitemap.xml" | grep -oE '<loc>[^<]+</loc>' | sed -E 's#</?loc>##g; s#^https?://[^/]+##' || true)
for family in /game/ /scores/ /teams/; do
  path=$(grep -m1 "^$family" <<< "$paths" || true)
  if [ -z "$path" ]; then fail /sitemap.xml "no $family URL"; else expect "$path" 200 text/html "$public"; fi
done
for path in /opengraph-image /icon /icon-192; do
  expect "$path" 200 image/png "$public"
  if [ "$path" = /icon-192 ] && [ "$target" != next ] && [ "$(header x-nextjs-cache)" != HIT ]; then
    fail "$path" "x-nextjs-cache '$(header x-nextjs-cache)', expected HIT (rendered per request, not served from the build)"
  fi
done
expect /manifest.webmanifest 200 application/manifest+json "$public"
expect /sitemap.xml 200 application/xml "$public"
expect /robots.txt 200 text/plain "$public"

css=$(curl -fsS --max-time 20 "$base/" | grep -oE '/_next/static/[^"]+\.css' | sed -n 1p || true)
if [ -z "$css" ]; then fail / "no /_next/static stylesheet in the HTML"; else
  expect "$css" 200 text/css "$immutable" -H 'Accept-Encoding: gzip'
  if [ "$target" != workers ]; then
    [ "$(header content-encoding)" = gzip ] || fail "$css" "content-encoding '$(header content-encoding)', expected gzip"
  fi
fi

for path in /no-such-page /game/not-a-real-id; do
  expect "$path" 404 text/html "$nostore"
  grep -qF 'That page is not here.' "$tmp/b" || fail "$path" "not the root not-found page"
  got_og=$(grep -oE '<meta property="og:image" content="https?://[^/"]+' "$tmp/b" | sed -n 1p || true)
  [ "$got_og" = "$og" ] || fail "$path" "og:image origin '${got_og#*content=\"}', expected '${og#*content=\"}' as on /"
  got_stale=$(grep -c 'the nightly update may be failing' "$tmp/b" || true)
  [ "$got_stale" = "$stale" ] || fail "$path" "stale-snapshot notice shown $got_stale time(s), / shows it $stale"
done
expect /game/not-a-real-id/opengraph-image 404 '' ''

if [ "$target" = workers ]; then
  expect /_vinext/static-cache/index.json 404 '' ''
fi

expect / 200 text/html "$public"
etag=$(header etag)
# `Cache-Control: max-age=0` is what a browser sends when it revalidates. It is also needed for
# workers: `vite preview` forwards requests to workerd with undici's fetch, which (per the Fetch
# standard) marks a conditional request no-store and adds `Cache-Control: no-cache` unless the
# request already has a Cache-Control, and no-cache is never answered with 304 (as on Next.js).
if [ -z "$etag" ]; then fail / "no ETag"; else expect / 304 '' '' -H "If-None-Match: $etag" -H 'Cache-Control: max-age=0'; fi

exit "$failed"
