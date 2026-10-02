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
# What it checks: every page the sitemap lists answers 200 with its own content (a <main>, one <h1>
# and the canonical URL of that path) and the next.config headers() cache rule, as do the metadata
# routes and Route Handlers, whose images must be real PNGs of the declared size; hashed assets keep
# the immutable cache (a stylesheet, a script chunk and a font; a missing one is a no-store 404);
# the manifest names the site and its icons and robots.txt allows everything; an unknown URL, or an unknown param in
# any dynamic family, is a no-store 404 with the root not-found page (its OG card an empty 404),
# rendered with the same SITE_URL and build instant as the prerendered pages and marked noindex; pages carry an ETag
# and answer a revalidation with 304; HEAD, POST and a trailing slash get the framework's answers;
# poweredByHeader stays off; and vinext's internal x-vinext-app-page-cache marker never leaves the
# server (checked on every response above, 304s included).
#
# The target names the deploy, for the few checks that differ by design:
# - next/node: hashed CSS goes out gzipped (`next start` compresses; vinext's Node target serves
#   its build-time precompressed copy). Not workers: workerd preview compresses nothing, and in
#   production Cloudflare's edge does it, after the Worker.
# - next/node: a bare If-None-Match gets a 304. Not workers under `vite preview`, which adds
#   `Cache-Control: no-cache` to it (see the revalidation checks at the end).
# - node/workers: /icon-192 and /icon-512 must be a cache HIT, served from the build rather than
#   rendered per request with satori/resvg. Next has no such header contract for Route Handlers.
# - node/workers: a page's RSC payload (/<path>.rsc, what vinext's client router fetches on
#   navigation) is served from the build with the page's cache rule. Next's flight requests carry
#   a hash of the router-state headers in `_rsc` (any other value is a 307), so none is made here.
# - workers: the raw static-cache files the Worker reads through its ASSETS binding are not public.
#   (Build metadata, /.vite/ and vinext's client-entry manifest, is a 404 on all three.)

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
quiet=0
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
  [ "$quiet" = 1 ] || echo "$got $path"
}
# from_build PATH — on the vinext targets, the response just fetched came from the build's
# prerender, not from a render on request (Next has no such header contract for Route Handlers).
from_build() {
  [ "$target" = next ] || [ "$(header x-nextjs-cache)" = HIT ] ||
    fail "$1" "x-nextjs-cache '$(header x-nextjs-cache)', expected HIT (rendered per request, not served from the build)"
}
# page PATH — a prerendered page, with real content of its own: a <main>, exactly one <h1>, and the
# canonical URL of PATH (so a 200 carrying an empty shell or another route's HTML fails).
page() {
  expect "$1" 200 text/html "$public"
  from_build "$1"
  grep -qF '<main' "$tmp/b" || fail "$1" "no <main> in the body"
  local h1; h1=$(grep -oE '<h1[ >]' "$tmp/b" | wc -l | tr -d ' ' || true)
  [ "$h1" = 1 ] || fail "$1" "$h1 <h1> elements, expected 1"
  local canonical; canonical=$(grep -oE '<link rel="canonical" href="[^"]*"' "$tmp/b" | sed -n '1s/.*href="//; 1s/"$//p' || true)
  [ "$canonical" = "$origin${1%/}" ] || fail "$1" "canonical '$canonical', expected '$origin${1%/}'"
}
# png PATH WIDTH HEIGHT — a prerendered image route answering with a real PNG of the declared size.
png() {
  expect "$1" 200 image/png "$public"
  from_build "$1"
  local sig size
  sig=$(od -An -tx1 -N8 "$tmp/b" | tr -d ' \n')
  [ "$sig" = 89504e470d0a1a0a ] || { fail "$1" "body is not a PNG ($(wc -c < "$tmp/b" | tr -d ' ') bytes)"; return 0; }
  # The IHDR chunk follows the signature: width and height are big-endian 32-bit at bytes 16-23.
  size=$(od -An -tu1 -j16 -N8 "$tmp/b" | awk '{ for (i = 1; i <= NF; i++) b[n++] = $i }
    END { printf "%dx%d", ((b[0] * 256 + b[1]) * 256 + b[2]) * 256 + b[3], ((b[4] * 256 + b[5]) * 256 + b[6]) * 256 + b[7] }')
  [ "$size" = "${2}x${3}" ] || fail "$1" "PNG is $size, expected ${2}x${3}"
}

expect / 200 text/html "$public"
# What every page and 404 below must agree with: the origin SITE_URL gives canonical URLs, og:image
# and the sitemap (/ is canonically the bare origin), the full og:image URL of the root (a 404 is
# the root not-found page, so it shares it), and whether the footer calls the snapshot stale
# (measured against the build instant). Every 404 is rendered on request while / comes from the
# build, so a server reading either value at run time, or a Worker whose clock reads the Unix epoch
# at module scope, shows up as a mismatch (see vite.config.ts).
origin=$(grep -oE '<link rel="canonical" href="https?://[^/"]+"' "$tmp/b" | sed -n '1s/.*href="//; 1s/"$//p' || true)
og=$(grep -oE '<meta property="og:image" content="[^"]+"' "$tmp/b" | sed -n 1p || true)
stale=$(grep -c 'the nightly update may be failing' "$tmp/b" || true)
[ -n "$origin" ] || fail / "no canonical URL naming the site origin"
[[ "$og" == "<meta property=\"og:image\" content=\"$origin/"* ]] || fail / "og:image '${og#*content=\"}' is not an absolute URL on $origin"

# Every page the sitemap lists: the seven fixed routes, and each generateStaticParams family at
# least as large as CI's build checks require of the prerender (scripts/assert-vinext-prerender.mjs
# also matches the sitemap against the prerendered pages one for one).
expect /sitemap.xml 200 application/xml "$public"
from_build /sitemap.xml
locs=$(grep -oE '<loc>[^<]+</loc>' "$tmp/b" | sed -E 's#</?loc>##g' || true)
paths=$(grep -F "$origin/" <<< "$locs" | sed "s#^$origin##" || true)
[ "$(grep -c . <<< "$locs")" = "$(grep -c . <<< "$paths")" ] || fail /sitemap.xml "a <loc> is not on $origin"
for path in / /about /standings /schedule /playoffs /teams /history/2025-26; do
  grep -qxF "$path" <<< "$paths" || fail /sitemap.xml "does not list $path"
done
families=''
for family in game:100 scores:30 teams:15; do
  n=$(grep -cE "^/${family%:*}/[^/]+$" <<< "$paths" || true)
  [ "$n" -ge "${family#*:}" ] || fail /sitemap.xml "lists $n /${family%:*}/ pages, expected at least ${family#*:}"
  families+=" $n /${family%:*}/"
done
quiet=1
while read -r path; do [ -z "$path" ] || page "$path"; done <<< "$paths"
quiet=0
echo "200 every page in /sitemap.xml ($(grep -c . <<< "$paths"):$families)"

png /icon 32 32
png /apple-icon 180 180
png /icon-192 192 192
png /icon-512 512 512
png /opengraph-image 1200 630
png /standings/opengraph-image 1200 630
# One OG card per generateStaticParams family, for the page the sitemap lists first.
for family in /game/ /scores/ /teams/; do
  path=$(grep -m1 "^$family" <<< "$paths" || true)
  [ -z "$path" ] || png "$path/opengraph-image" 1200 630
done
expect /manifest.webmanifest 200 application/manifest+json "$public"
from_build /manifest.webmanifest
# app/manifest.ts: a name and the four icon routes checked above, or Chromium's install prompt has
# nothing to offer.
manifest=$(node -e '
  const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")), p = [];
  if (typeof m.name !== "string" || !m.name) p.push("no name");
  const src = (m.icons || []).map((i) => i.src);
  for (const want of ["/icon", "/apple-icon", "/icon-192", "/icon-512"]) if (!src.includes(want)) p.push("icons miss " + want);
  console.log(p.join("; "));' "$tmp/b" 2>&1 || echo "not JSON")
[ -z "$manifest" ] || fail /manifest.webmanifest "$manifest"
expect /robots.txt 200 text/plain "$public"
from_build /robots.txt
grep -qxF "Sitemap: $origin/sitemap.xml" "$tmp/b" || fail /robots.txt "no 'Sitemap: $origin/sitemap.xml' line"
grep -qxF 'User-Agent: *' "$tmp/b" || grep -qxF 'User-agent: *' "$tmp/b" || fail /robots.txt "no 'User-agent: *' line"
grep -qxF 'Allow: /' "$tmp/b" || fail /robots.txt "no 'Allow: /' line"

if [ "$target" != next ]; then
  expect /standings.rsc 200 text/x-component "$public"
  from_build /standings.rsc
  [ -s "$tmp/b" ] || fail /standings.rsc "empty RSC payload"
fi

expect / 200 text/html "$public"
css=$(grep -oE '/_next/static/[^"]+\.css' "$tmp/b" | sed -n 1p || true)
# Read from the HTML now: the fetches below overwrite the body.
js=$(grep -oE '/_next/static/[^"]+\.js' "$tmp/b" | sed -n 1p || true)
font=$(grep -oE '/_next/static/[^"]+\.woff2' "$tmp/b" | sed -n 1p || true)
if [ -z "$css" ]; then fail / "no /_next/static stylesheet in the HTML"; else
  expect "$css" 200 text/css "$immutable" -H 'Accept-Encoding: gzip'
  if [ "$target" != workers ]; then
    [ "$(header content-encoding)" = gzip ] || fail "$css" "content-encoding '$(header content-encoding)', expected gzip"
  fi
fi
# The immutable cache is what the headers() rule's negative lookahead protects, and it covers every
# hashed asset, not only the stylesheet: a script chunk and a self-hosted font (next/font puts them
# under /_next/static/ on both toolchains) are held to it as well.
if [ -z "$js" ]; then fail / "no /_next/static script in the HTML"; else expect "$js" 200 '' "$immutable"; fi
if [ -z "$font" ]; then fail / "no /_next/static font in the HTML"; else expect "$font" 200 font/woff2 "$immutable"; fi

# An unknown URL, an unknown param in each generateStaticParams family (all dynamicParams=false,
# and on Workers each family is its own render path), another season's history page, and a favicon
# the site does not have: each is the root not-found page as a no-store 404.
for path in /no-such-page /game/not-a-real-id /scores/1999-01-01 /teams/nope /history/2024-25 /favicon.ico; do
  expect "$path" 404 text/html "$nostore"
  grep -qF 'That page is not here.' "$tmp/b" || fail "$path" "not the root not-found page"
  got_og=$(grep -oE '<meta property="og:image" content="[^"]+"' "$tmp/b" | sed -n 1p || true)
  [ "$got_og" = "$og" ] || fail "$path" "og:image '${got_og#*content=\"}', expected '${og#*content=\"}' as on /"
  got_stale=$(grep -c 'the nightly update may be failing' "$tmp/b" || true)
  [ "$got_stale" = "$stale" ] || fail "$path" "stale-snapshot notice shown $got_stale time(s), / shows it $stale"
  # One robots directive, noindex: app/layout.tsx deliberately sets none, so the 404's own is not
  # contradicted by an "index, follow" beside it (two tags were measured before that was removed).
  robots=$(grep -oE '<meta name="robots" content="[^"]*"' "$tmp/b" | sed -E 's/.*content="//; s/"$//' | tr '\n' '|' || true)
  [ "$robots" = "noindex|" ] || fail "$path" "robots meta '${robots%|}', expected exactly one: noindex"
done
# An OG card for an unknown param is notFound() in the metadata route: an empty 404 that keeps the
# headers() cache rule, as `next start` sends it (Next gives only page 404s the no-store header).
# The 404 is as stable as any 200 here, both changing only with a new snapshot and deploy.
for path in /game/not-a-real-id /scores/1999-01-01 /teams/nope; do
  expect "$path/opengraph-image" 404 '' "$public"
done
# A hashed-asset URL that is not in the build is a no-store 404, never a 200 or the immutable cache.
expect /_next/static/chunks/no-such-file.css 404 '' "$nostore"

# The framework's answers to the other request shapes: HEAD as GET without a body, a POST to a page
# refused, and a trailing slash redirected to the canonical path.
expect /standings 200 text/html "$public" --head
expect / 405 '' '' -X POST
expect /standings/ 308 '' ''
[ "$(header location)" = /standings ] || fail /standings/ "location '$(header location)', expected /standings"

# Build metadata the vinext builds leave beside their assets is never public: Vite's manifest
# (vinext start refuses /.vite/; the Workers upload leaves it out through .assetsignore) and
# vinext's client-entry manifest (left out of the Workers upload by patches/vinext@1.0.0.patch,
# index.js). On Next both are plain misses.
for path in /.vite/manifest.json /vinext-client-entry-manifest.json; do expect "$path" 404 '' ''; done

if [ "$target" = workers ]; then
  expect /_vinext/static-cache/index.json 404 '' ''
  # And a file that is really there, when this tree holds the build being served.
  cached=$(find .cloudflare/output -path '*/_vinext/static-cache/*.html' 2>/dev/null | sed -n 1p || true)
  if [ -n "$cached" ]; then expect "/_vinext/static-cache/${cached##*/}" 404 '' ''; fi
  # The Worker config the build emitted from cloudflare.config.ts, when this tree holds it: the
  # typed config is only proven parsed here (`vinext-cloudflare deploy --dry-run` echoes nothing
  # but the project name). Checks the settings the response contract above relies on.
  config=.cloudflare/output/v0/workers/default/worker.config.json
  if [ -f "$config" ]; then
    date=$(grep -oE "compatibilityDate: '[0-9-]+'" cloudflare.config.ts | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' || true)
    problems=$(node -e '
      const c = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")), p = [];
      if (c.name !== "scvalfh") p.push(`name ${JSON.stringify(c.name)}`);
      if (c.compatibilityDate !== process.argv[2]) p.push(`compatibilityDate ${c.compatibilityDate}, cloudflare.config.ts has ${process.argv[2]}`);
      if (!c.compatibilityFlags?.includes("nodejs_compat")) p.push("no nodejs_compat flag");
      if (c.assets?.notFoundHandling !== "none") p.push(`assets.notFoundHandling ${c.assets?.notFoundHandling}`);
      if (!c.assets?.runWorkerFirst?.includes("/_vinext/static-cache/*")) p.push("assets.runWorkerFirst misses /_vinext/static-cache/*");
      if (c.env?.ASSETS?.type !== "assets") p.push("no ASSETS binding");
      if (Object.keys(c.vars ?? {}).length) p.push(`vars ${Object.keys(c.vars).join(",")} (expected none)`);
      console.log(p.join("; "));' "$config" "$date")
    if [ -n "$problems" ]; then fail "$config" "$problems"; else echo "ok $config"; fi
  fi
fi

# Revalidation, on a fixed page and a generated one. `Cache-Control: max-age=0` is what a browser
# sends when it revalidates. It is also needed for workers: `vite preview` forwards requests to
# workerd with undici's fetch, which (per the Fetch standard) marks a conditional request no-store
# and adds `Cache-Control: no-cache` unless the request already has a Cache-Control, and no-cache is
# never answered with 304 (as on Next.js). So a bare If-None-Match is checked on next and node only.
for path in / "$(grep -m1 '^/game/' <<< "$paths" || true)"; do
  [ -n "$path" ] || continue
  expect "$path" 200 text/html "$public"
  etag=$(header etag)
  if [ -z "$etag" ]; then fail "$path" "no ETag"; continue; fi
  expect "$path" 304 '' "$public" -H "If-None-Match: $etag" -H 'Cache-Control: max-age=0'
  [ "$target" = workers ] || expect "$path" 304 '' "$public" -H "If-None-Match: $etag"
done

exit "$failed"
