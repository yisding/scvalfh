> **Note on this copy.** This is the implementation-ready design record produced during the
> design stage, kept verbatim below for history. **Sections 1-14 describe the single-league
> (SCVAL, 15-team) site as designed; the site now covers four leagues and 43 teams, and §15
> ("Multi-league amendment (2026-10)") at the end of this file records what that changed and
> which decisions below it reverses. Where §15 and an earlier section disagree, §15 wins.** One
> decision in it was later overridden by
> `docs/BYLAWS-2026-27.md` (fetched after this document was written): **§1.2's "No PTS column"
> is superseded — the by-laws (Article VI §2) make points the official ordering key, so the
> standings table DOES show a PTS column.** See `README.md` ("How standings are computed") and
> `docs/BYLAWS-2026-27.md` for the current rule.
>
> **Later still: now five leagues and 49 teams (§22).** The Eastern Athletic League joined as a
> fifth league in a third section, the Northern Section; §22 at the end of this file records what
> that changed and wins where it disagrees with §15 or anything above it.
>
> **Later again: nine leagues and 99 teams in five sections and two regions (§24).** The Southern
> Section's Sunset field hockey league and the San Diego Section's City, North County and Metro
> conferences joined on 2026-10-06, behind a NorCal/SoCal region toggle (default NorCal). The site
> stays "NorCal High School Field Hockey" (owner decision, 2026-10-06); §24 records what the amendment
> changed and wins where it disagrees with §22 or anything above it. Later the same day the Southern
> Section's three independents (Glendora, Harvard-Westlake and Thousand Oaks, no league games) joined:
> 102 teams in nine leagues and one group with no table, and North County's short name became "North"
> (§24.9). Later still, Bonita and Chaminade moved from the Sunset to the independents, and the
> group of five got a table of its games against each other (§24.10, which wins over §24.9).
>
> **`SPEC §n` and `BUILD-BRIEF` in code comments** refer to the build-time research spec and
> build brief, which are not kept in this repo. Their §1.x sections survive, condensed, as
> `docs/DATA-SOURCES.md` §1.x; every other section number does NOT match DATA-SOURCES' numbering,
> so treat it as historical. New comments cite DESIGN, DATA-SOURCES, LEAGUE-RULES or BYLAWS
> sections instead.
>
> **Wilcox has since been removed.** Every Wilcox row, wireframe and "no results reported"
> example below predates the news that Wilcox is not fielding a team this season. The site now
> had 15 teams (De Anza 7, El Camino 8) at that point, and since the multi-league amendment (§15)
> SCVAL's 15 are four of the site's 43; Wilcox's grid fixtures are dropped at parse time (it is in
> SCVAL's `withdrawnNames` in `lib/leagues.ts`, which replaced `WITHDRAWN_SCHOOL_NAMES`). The
> no-results state itself still applies to any fielded team with nothing reported.
>
> One number in it is **not reachable as written**: §13's "`/` under **120 KB** gzipped including
> fonts". The App Router's own client runtime is ~150 KB gzipped on a page that ships no
> interactive code at all, so nothing this site does to its own code can get under 120 KB without
> leaving the framework. Measured on `/` at 390×844 against `next start` (CDP
> `encodedDataLength`, every non-RSC response): **236 KB over 13 requests** — framework and app JS
> ~150 KB (498 KB uncompressed first-load, per `.next/diagnostics/route-bundle-stats.json`),
> document 22 KB, CSS 10 KB, the two woff2 faces 53 KB. The half of §13 that IS a statement about
> this site's own code holds with room to spare: the client modules total ~23 KB gzipped (gzip -9
> of the app-owned chunks listed in `.next/diagnostics/route-bundle-stats.json`: ~6.7 KB shared,
> plus 8.4 KB on `/`, 7.2 KB on `/schedule` and 0.9 KB on `/teams/[slug]`) against
> the "≤ 40 KB beyond the framework" allowance, with no chart JS and no image anywhere on the
> critical path. LCP, TBT and CLS all sit inside their §13 targets as written (CLS measures
> 0.0000 on `/`).
>
> **So the budget to wire into §12's Lighthouse gate is 40 KB of app JS beyond the framework plus
> a 240 KB ceiling on the whole critical path for `/`** — figures the site holds today and that a
> regression can break, rather than one it failed on the day it was written. Two ways to buy the
> difference were measured and rejected: `preload: false` on Geist Mono saves only the ~550 bytes
> of its own `<link>` (the kickers ask for the face above the fold either way), and dropping the
> mono family for `ui-monospace` would save its 23 KB at the cost of §4.2's numerals, which are
> the type system. See the comment above the font calls in `app/layout.tsx`.
>
> One layout in it was **deliberately not built as drawn**: §3.7's 3fr/2fr desktop split for
> `/teams/[slug]`, with NEXT / LAST / FORM / SPLITS / WHO WE HAVEN'T BEATEN in a right rail. The
> page is one column with two paired 2-up blocks instead, and the row lists are capped at a 46rem
> measure, because a game-log row stretched across the full 1120px main column puts "vs Los Altos"
> and its "FINAL" about 850px apart — a distance the eye has to bridge to read a single row. The
> rationale also lives at the top of `app/teams/[slug]/page.tsx`; it is recorded here so the
> deviation reads as a decision rather than an omission.
>
> One count in it is **out of date**: §7's and §13's "**four** client modules in the whole app"
> (`ThemeToggle`, `PinControl`, `MyTeamCard`, `ScheduleFilters`). The count has grown with the
> multi-league work, so no number is kept here: `git grep -l "^'use client'" app components` and
> tests/ui/client-boundary.test.ts, which finds every client module itself, are the live
> inventory. The number mattered beyond bookkeeping — "without a fifth client module" was once
> written down as the reason the pinned-team highlight had to be an inline script rather than a
> component, a constraint that had already been spent. What the §13
> budget actually rations is **bytes, not modules**, and that half holds: ~23 KB gzipped against the
> 40 KB allowance (see the note on §13 above).
>
> **The clubs pages came later still.** `/clubs`, `/clubs/[slug]` and a club line on each team
> page's roster were added from `data/clubs.json` (researched 2026-10-03); §17 ("Clubs amendment
> (2026-10)") records what they answer, the privacy rules they keep and how they are laid out, and
> §1.1 lists the two routes. `/commits` and a commitment line on team rosters followed, from
> `data/commits.json`; §21 records them, and §1.1 lists the route.
>
> Everything else below (routes, tokens, component signatures, rendering rules, empty states,
> a11y, build checklist) reflects what was built.

---

# SCVAL Girls Varsity Field Hockey — Fall 2026
## FINAL DESIGN SPEC — implementation-ready

**Status:** this is the spec to build. It starts from the winning `phone-first` architecture,
grafts the ideas both judges flagged from `editorial` and `data-dense`, and resolves every
weakness either judge named. Every weakness resolution is marked **[R-n]** and indexed in §13.

**Verified stack in this repo** (`/home/yi/Code/scvalfh`): `next@16.3.6`,
`tailwindcss@4.3.3`, React 19, TypeScript. Geist + Geist_Mono are present in
`next/font/google`'s font data. No UI kit, no chart library — inline SVG and CSS only.
One static JSON snapshot, rebuilt twice daily by cron (.github/workflows/update-data.yml).

**The product test.** Every decision is settled by one question: *does this help a parent
standing on the turf at Homestead at 5:40pm on a Tuesday, one-handed, on cellular?*
If not, it goes below the fold, on desktop, or nowhere.

**The brand move** (grafted from `editorial`, which both judges called the best visual
idea in the set): the **rule-and-kicker** — a 1px hairline with an 11px tracked uppercase
Geist Mono kicker sitting on it, right-aligned action link. It opens every section on
every page. Ten lines of CSS, and it is the entire visual signature. `phone-first` had no
equivalent moment; this is it. **[R-9]**

### The eight decisions everything else follows from

1. **Two data hues, and nothing else.** Only *win* and *loss* get a reserved hue. Tie is
   hueless. LIVE is the interaction accent + a pulse + the word. **Divisions have no hue at
   all** — they live in separate tables and are named in text, which deletes the cross-role
   collision that failed in both rival specs (§6.4, runs R-C/R-D). **[R-15]**
2. **The goal-differential bar carries no hue.** Polarity is carried by which side of a
   shared zero rule the bar extends, plus the signed numeral. Grafted from `editorial`;
   §6.3 shows the hued alternative hard-failing the validator. **[R-1]**
3. **Bottom tab bar on phone, five tabs** — Home / Scores / Standings / Teams / Playoffs.
   `/teams` is now a tab; "find my school" was a top-three task with no phone nav entry.
   **[R-3]**
4. **League membership is a repo constant left-joined against the feed.** De Anza's
   MaxPreps table has **seven** rows — Wilcox is absent, not 0-0-0. Deriving rows from the
   feed silently drops a school from the league. This is the single worst bug the site
   could ship. (`data-dense` §9.1, adopted wholesale as §12.1.) **[R-6]**
5. **One optional personalization: pin a team.** `localStorage`, no account, every access
   in `try/catch`, with designed recovery states.
6. **Per-game URLs.** `/game/[id]` — 174 static pages with generated OG cards, because a
   single final score is the most-shared object on this site. **[R-4]**
7. **No `searchParams` in any page signature.** Verified against this repo:
   `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md:119` —
   "`searchParams` is a **Request-time API** whose values cannot be known ahead of time.
   Using it will opt the page into **dynamic rendering** at request time." Filters are a
   client component under `<Suspense>` over a complete server-rendered list.
8. **Two charts ship, total.** The GD column in standings, and the per-game margin strip
   on team pages. §6.2 lists what was rejected and why.

---

## 1. Information architecture

### 1.1 Routes — exact and complete

| URL | Answers first | Rendering | Params |
|---|---|---|---|
| `/` | "What just happened, and when's the next one?" | static | — |
| `/standings` | "Where do we stand?" Both divisions, De Anza first, `#de-anza` / `#el-camino` anchors | static | — |
| `/schedule` | "What's the whole season look like?" All ~174 contests, date-grouped | static shell + client filters | — |
| `/scores/[date]` | "What were Tuesday's scores?" One day's slate | static, `generateStaticParams` over every date with a contest (~50) | `date` = `YYYY-MM-DD` |
| `/game/[id]` | "What was the final, and can I send it to the group chat?" | static, `generateStaticParams` over all 174 games | `id` = snapshot game id |
| `/teams` | "Find my school." 16 monogram tiles by division | static | — |
| `/teams/[slug]` | "How is *my* team doing?" | static, `generateStaticParams` over 16 | `slug` = `homestead`, `los-gatos`, … |
| `/playoffs` | "Are we in, and who do we play?" Two modes on `snapshot.playoffs.seededAt` | static | — |
| `/history/2025-26` | "How did last year finish?" 2025-26 final standings + all-league awards | static | — |
| `/about` | "Where does this come from and can I trust it?" | static | — |
| `/clubs` *(§17)* | "Which clubs do players here play for?" The youth clubs by region, each with its tied players' count and schools | static | — |
| `/clubs/[slug]` *(§17)* | "Who here plays for this club, and how do we know?" | static, `generateStaticParams` over `data/clubs.json` (13, a club with no tied player included) | `slug` = `sf-hawks`, `fly-fhc`, … |
| `/commits` *(§21)* | "Who here has committed to play in college, and where?" Players by class year, then the colleges | static | — |

Machine routes: `/sitemap.xml` (`app/sitemap.ts`), `/robots.txt` (`app/robots.ts`),
`/manifest.webmanifest`, and `opengraph-image.tsx` at the root plus under
`teams/[slug]/`, `scores/[date]/` and `game/[id]/` via `ImageResponse`.

**Why `/game/[id]` exists** (it was `phone-first`'s largest product gap). A final score is
the object people actually share, and a `<details>` row inside a date page has no URL, no OG
card, and nothing to land on. The page is not "one paragraph": it is the shareable
scoreboard — both teams' monograms and records, the line score with its decider, the
cleaned recap, venue with a directions link, stream and ticket links, both teams' form
strips going into the game, the head-to-head history between these two schools this season,
and the MaxPreps box-score deep link. 174 pages of that is ~180 KB of extra HTML across the
whole build and it prerenders in the same pass. **[R-4]**

### 1.2 Deliberately absent

- **No search.** 16 teams, 10 pages; `/teams` beats a search box.
- **No login, notifications or comments.** A cron-fed snapshot has nothing to gate.
- **No division sub-routes.** Both tables fit one page and the page's job is comparison;
  the "tabs" are `#de-anza` / `#el-camino` anchors, so they work with JS off and are
  shareable. A tab that *hides* the other division is a worse deal here.
- **No standings-position bump chart, no GF/GA dual axis, no GF-vs-GA scatter, no
  home/away pie, no 8×8 heatmap on phone, no sparkline in a stat tile.** §6.2.
- **No `WHO'S HOT`, no remaining-schedule-strength bars, no `PTS` column, no 8×8 tiebreak
  matrix.** These serve a coach; the brief names a parent first. Both judges flagged them
  as `data-dense`'s audience drift and they are not imported. **[R-11]**
- **No live clock, no named-player lede, no `cacheLife('minutes')`, no `LiveRefresh`.**
  The snapshot is a once-daily cron of auto-generated one-sentence recaps with no player
  names and no game clock. `/about` says so in plain words, and every `LIVE` marker is
  labelled as a scheduled window rather than a running score. **[R-12]**

### 1.3 Global chrome — measured

**Phone (390×664 logical).**

| Element | Height | Behaviour |
|---|---|---|
| Top bar | **44px** | `position: sticky; top: 0`. Wordmark (or `←` + page title) · freshness stamp · theme toggle, **all on one line** |
| Content | — | 16px side gutter; full-bleed zero-radius lists |
| Bottom tab bar | **56px** + `env(safe-area-inset-bottom)` | `position: fixed; bottom: 0` |

Permanent chrome is **100px of 664 (15.1%)**, down from `phone-first`'s 104px, and the
freshness stamp moves *into* the top bar rather than occupying its own 28px row — a real
28px returned to the fold on every page. **[R-5]**

**Desktop (≥768px).** 56px sticky top bar: wordmark + 7 nav links + theme toggle. No
sidebar, no bottom bar (`body { padding-bottom: 0 }`). Content max-width 1120px, centered,
24px gutters.

**Every page** ends in the `Attribution` footer: *"Data from MaxPreps and SBLive/SI"* with
live deep links, the snapshot timestamp, and the not-affiliated line.

---

## 2. The reference data every wireframe in this spec is drawn against

`phone-first`'s wireframes used invented numbers (Homestead 4-1-0, form `WWW`), and both
judges flagged that the layout was never stress-tested against the real distribution. Every
figure below comes from the verified MaxPreps league payloads in this session's scratchpad
(`da.json`, `ec.json`, snapshot **2026-09-28**). **All §3 wireframes use these numbers and
nothing else.** **[R-6]**

**De Anza — the source table has SEVEN rows. Wilcox is absent.**

| # | Team | League | Pct | GF | GA | GD | Form (old→new) |
|---|---|---|---|---|---|---|---|
| 1 | St. Ignatius | 3-0-0 | 1.000 | 14 | 3 | **+11** | W W W |
| 2 | Saint Francis | 4-1-0 | .800 | 36 | 6 | **+30** | W W L W W |
| 3 | Los Altos | 2-1-1 | .625 | 9 | 8 | **+1** | W T L W |
| 4 | Valley Christian | 2-1-1 | .625 | 6 | 14 | **−8** | L W W T |
| 5 | Fremont | 1-4-0 | .200 | 5 | 18 | **−13** | L W L L L |
| 6 | Cupertino | 0-5-0 | .000 | **0** | 23 | **−23** | L L L L L |
| 7 | Homestead | 0-5-0 | .000 | **0** | 24 | **−24** | L L L L L |
| — | **Wilcox** | **—** | **—** | **—** | **—** | **—** | **—** (absent from source) |

**El Camino — eight rows.**

| # | Team | League | Pct | GF | GA | GD | Form |
|---|---|---|---|---|---|---|---|
| 1 | Los Gatos | 5-0-0 | 1.000 | 32 | 6 | **+26** | W W W W W |
| 2 | Archbishop Mitty | 4-1-0 | .800 | 24 | 9 | +15 | W W L W W |
| 3 | Presentation | 3-1-1 | .700 | 18 | 11 | +7 | W L W T W |
| 4 | Saratoga | 2-2-1 | .500 | 14 | 16 | −2 | T W L W L |
| 5 | Palo Alto | 2-3-0 | .400 | 12 | 17 | −5 | W L W L L |
| 6 | Santa Clara | 1-3-1 | .300 | 10 | 19 | −9 | L T L W L |
| 7 | Lynbrook | 1-4-0 | .200 | 7 | 18 | −11 | L L W L L |
| 8 | Monta Vista | 0-4-0 | .000 | **0** | 43 | **−43** | L L L L |

**Seven facts in that data that changed the design.** (Full detail in §12.)

1. **Wilcox is absent from the feed** → membership is a repo constant, left-joined. **[R-6]**
2. **Three teams have a genuine league GF of `0`** (Cupertino, Homestead, Monta Vista). So
   "never render a missing score as 0-0" is a *discrimination* problem, not an avoidance
   problem: a real `0` and a `null` must be told apart at 13px on a phone. §5.3.
3. **GD spread differs by ~19 goals between divisions** — De Anza `|GD|max = 30`, El Camino
   `|GD|max = 43`. A single shared bar domain squashes every De Anza bar; the domain is
   **per division**. **[R-2]**
4. **MaxPreps ranks St. Ignatius (3-0-0, 1.000) above Saint Francis (4-1-0, .800)** — the
   league sorts on win percentage, not wins. Our sort matches the source by construction.
5. **Los Altos and Valley Christian are both 2-1-1, separated by 9 goals of differential**
   (+1 vs −8). That pair is why GD earns a visual mark at all.
6. **The pinned-team example in every wireframe is Homestead at 0-5-0 with a genuine
   `0` GF and an `L L L L L` form strip.** The design is stress-tested against the worst
   row in the league, not a flattering one. **[R-6]**
7. **The example MaxPreps disagreement is Fremont**: we compute 1-4-0, MaxPreps publishes
   2-4-0. It is published in-page, not resolved silently. §9.

**Verified recap shape** (MaxPreps `SportsEvent` JSON-LD): *"On 9/24, the Saratoga varsity
field hockey team lost their home conference game against Santa Clara (CA) by a score of
3-2."* After the build-time cleanup in §5.8: *"Saratoga lost their home conference game
against Santa Clara by a score of 3-2."*

---

## 3. Page-by-page wireframes

Phone frames are drawn to **390px** and must not break at 360px or 400px. Desktop frames are
drawn to **1280px**. `[HM]` = a `TeamMonogram`. `(W)` `(L)` `(T)` = a `ResultChip`.
`▓` = the pinned team's 2px accent left rule.
A rule-and-kicker header renders as `──── KICKER ─────────────── action →`.

**Fold arithmetic.** Usable content height on a 390×664 viewport is
`664 − 44 (top bar) − 56 (bottom bar) = 604px`. Every page below states what fits in it.

### 3.1 Home — `/`

**Fold budget, pinned:** top bar 44 · `MY TEAM` kicker 28 · `MyTeamCard` 240 ·
`LATEST SCORES` kicker 28 · 3 × `GameRow` 68 = 204. **Total 544 of 604**, leaving 60px so the
fourth row *peeks* — the correct signal that the list continues.

**Fold budget, not pinned:** top bar 44 · `PinPrompt` 88 · kicker 28 · 6 × `GameRow` 68 =
408. **Total 568 of 604.** Six rows, designed as its own composition rather than as a gap.

```
PHONE 390px  —  /   (pinned: Homestead)
┌────────────────────────────────────────────────┐ 0
│ SCVAL FIELD HOCKEY   Sun 5:04 AM · Wk 4   [◐] │ 44  sticky; stamp is IN the bar
├────────────────────────────────────────────────┤
│ ──── MY TEAM ──────────────── change team →   │ 28  rule-and-kicker
│▓ [HM] Homestead  Mustangs · De Anza            │
│▓ ────────────────────────────────────────────  │
│▓ LAST                            Thu Sep 24    │ 11px mono kicker
│▓ (L) Homestead        0                        │ 20px mono; loser 400 wt, --ink-2
│▓     Saint Francis    7    FINAL               │ winner 600 wt, --ink
│▓ "Homestead lost their home conference game    │ 13px, 2 lines max
│▓  against Saint Francis by a score of 7-0."    │
│▓ ────────────────────────────────────────────  │
│▓ NEXT            Tue Sep 29 · 5:30 PM · league │
│▓ at Los Altos                                  │ 17px / 600
│▓ [ Directions ↗ ] [ Stream ↗ ] [ Tickets ↗ ]  │ 3 chips, 40px tall, 8px gaps
│▓ ────────────────────────────────────────────  │
│▓ FORM  oldest → newest                         │
│▓ (L)(L)(L)(L)(L)   0-5-0 league · 1-7-0 overall│ 240 total  MyTeamCard
├────────────────────────────────────────────────┤ ← fold ≈ 544
│ ──── LATEST SCORES ─── Thu Sep 24 · all 12 →  │ 28
├────────────────────────────────────────────────┤
│ (W) Saint Francis     7                        │
│     Homestead         0   FINAL            ⌄  │ 68  whole row → /game/[id]
├────────────────────────────────────────────────┤
│ (W) Los Gatos         4                        │
│     Saratoga          1   FINAL            ⌄  │ 68
├────────────────────────────────────────────────┤
│ ( ) Mitty             —                        │
│     Presentation      —   NOT REPORTED     ⌄  │ 68  em dash, NEVER 0-0
├────────────────────────────────────────────────┤
│ (⊘) Wilcox                                  NL │
│ │   Valley Christian      CANCELLED         ⌄  │ 68  2px left rule = non-league
├────────────────────────────────────────────────┤
│              See all 12 games  →               │ 48
├────────────────────────────────────────────────┤
│ ──── DE ANZA ──────────────── full table →    │ 28
│ 1 [SI] St. Ignatius   3-0-0   +11  ──▐▐▐      │
│ 2 [SF] Saint Francis  4-1-0   +30  ──▐▐▐▐▐▐▐  │ 44 per row, top 4
│ 3 [LA] Los Altos      2-1-1    +1  ──▐        │
│ 4 [VC] Valley Chr.    2-1-1    −8  ▐▐──       │
├────────────────────────────────────────────────┤
│ ──── EL CAMINO ────────────── full table →    │ 28
│ 1 [LG] Los Gatos      5-0-0   +26  ──▐▐▐▐▐▐   │
│ … 3 more rows …                                │
├────────────────────────────────────────────────┤
│ ──── NEXT UP ───────────────── Tue Sep 29 →   │ 28
│ 5:30 PM   Homestead at Los Altos               │
│ 5:30 PM   Lynbrook at Monta Vista              │ 3 × 44
│ 6:00 PM   Palo Alto at Santa Clara             │
├────────────────────────────────────────────────┤
│ ──── CCS PLAYOFFS ─────────────── bracket →   │ 28
│ Seeding meeting Mon Nov 2.                     │
│ ▮▮▮▮▮▮▮░░░░░░░░  7 / 16                        │ 88  BerthMeter
│ SCVAL holds 7 of 16 automatic berths.          │
│ QF Nov 7 · SF Nov 11 · Final Nov 14            │
├────────────────────────────────────────────────┤
│ Data from MaxPreps ↗ and SBLive/SI ↗           │
│ Snapshot Sun Sep 28, 5:04 AM PT · About        │ 96  Attribution
│ Unofficial. Not affiliated with SCVAL or CCS.  │
├────────────────────────────────────────────────┤
│  ⌂ Home  ▤ Scores  ▦ Table  ◇ Teams  ⑃ CCS   │ 56  fixed, 5 tabs × 78px
└────────────────────────────────────────────────┘
```

Bottom tab bar arithmetic: 5 tabs × **78px** = 390px exactly. Each tab is 78×56 (well past
the 44×44 minimum), a 20px glyph over a 10px/600 Sans label, active tab gets
`--sx-accent` ink + a 2px top rule + `aria-current="page"`. Labels are short enough to never
truncate at 360px (`Home` `Scores` `Table` `Teams` `CCS` — 5 chars max). **[R-3]**

```
DESKTOP 1280px  —  /
┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ SCVAL FIELD HOCKEY  Home Standings Schedule Teams Playoffs History About    Sun 5:04 AM PT     [◐]  │ 56
├──────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ─── MY TEAM ─────────────────────── change →  │ ─── DE ANZA ──────────────────── full table →       │
│ ┌───────────────────────────────────────────┐ │  #  TEAM              LG     GD            L5       │
│ │▓ [HM] Homestead Mustangs · De Anza · 7th  │ │  1  [SI] St. Ignatius 3-0-0   +11 ──▐▐▐   (W)(W)(W) │
│ │▓ LAST Thu Sep 24        NEXT Tue Sep 29   │ │  2  [SF] St Francis   4-1-0   +30 ──▐▐▐▐▐▐▐ (W)(W)(L)(W)(W)│
│ │▓ (L) Homestead     0    5:30 PM           │ │  3  [LA] Los Altos    2-1-1    +1 ──▐    (W)(T)(L)(W) │
│ │▓     St Francis    7    at Los Altos      │ │  4  [VC] Valley Chr.  2-1-1    −8 ▐▐──   (L)(W)(W)(T)│
│ │▓ "Homestead lost …"     [Dir][Str][Tix]   │ │  5  [FR] Fremont      1-4-0   −13 ▐▐▐──  (L)(W)(L)(L)(L)│
│ │▓ ───────────────────────────────────────  │ │  6  [CU] Cupertino    0-5-0   −23 ▐▐▐▐▐── (L)(L)(L)(L)(L)│
│ │▓ FORM (L)(L)(L)(L)(L)  0-5-0 · 1-7-0      │ │  7  [HM] Homestead ▓  0-5-0   −24 ▐▐▐▐▐▐── (L)(L)(L)(L)(L)│
│ └───────────────────────────────────────────┘ │  8  [WX] Wilcox         —       —    ·    no results │
│                                               │  Bars scaled to De Anza |GD| max = 30.              │
│ ─── LATEST SCORES · THU SEP 24 ───── all →   │ ─── EL CAMINO ────────────────── full table →       │
│ ┌────────────────┬────────────────┬────────┐ │  … 8 rows, |GD| max = 43 …                          │
│ │(W) St Francis 7│(W) Los Gatos  4│( ) Mitty —│ ├─────────────────────────────────────────────────────┤
│ │    Homestead  0│    Saratoga   1│   Pres.  —│ │ ─── CCS PLAYOFFS ───────────── bracket →            │
│ │ FINAL   box ↗  │ FINAL   box ↗  │NOT REPORTED│ │ ▮▮▮▮▮▮▮░░░░░░░░  7 / 16                             │
│ └────────────────┴────────────────┴────────┘ │ Seeding Mon Nov 2 · QF Nov 7 · F Nov 14             │
│  … 3 more rows of GameCards, 3-up …          │                                                      │
├──────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Data from MaxPreps ↗ and SBLive/SI ↗ · Snapshot Sun Sep 28 5:04 AM PT · About · Unofficial          │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
     2fr                                                              1fr    (1 col below 900px)
```

The desktop grid's **source order is the phone order**, so a screen reader and a
400%-zoom reader both get: my team → latest scores → standings → playoffs.

### 3.2 Standings — `/standings`

**The phone row is two lines at 60px** — grafted from `editorial`, which both judges said
reads better than cramming five columns into a 358px box, and which lets the form strip be
**Last 5 on phone and desktop alike** rather than `phone-first`'s inconsistent Last 3 /
Last 5. **[R-7]**

**Fold budget:** top bar 44 · division tabs 44 · caption 28 · header row 30 = 146, leaving
**458px = 7.6 rows of 60px**. Rows **1–7 of 8** are above the fold, beating `phone-first`'s
1–6. **Zero horizontal scroll, zero gestures.**

```
PHONE 390px  —  /standings
┌────────────────────────────────────────────────┐
│ ← Standings          Sun 5:04 AM          [◐] │ 44 sticky
├────────────────────────────────────────────────┤
│ [ De Anza ]  [ El Camino ]                     │ 44 sticky anchor tabs
├────────────────────────────────────────────────┤
│ ──── DE ANZA ──── league games only · Sep 28  │ 28  rule-and-kicker
├──┬─────────────────────┬───────┬───────────────┤
│# │ TEAM                │ W-L-T │      GD       │ 30 header, 11px mono caps, sticky
├──┼─────────────────────┼───────┼───────────────┤
│1 │[SI] St. Ignatius    │ 3-0-0 │  ──▐▐▐   +11  │
│  │  (W)(W)(W)  ·  5-1-0 overall                │ 60   ← two-line row
├──┼─────────────────────┼───────┼───────────────┤
│2 │[SF] Saint Francis   │ 4-1-0 │  ──▐▐▐▐▐▐▐+30 │
│  │  (W)(W)(L)(W)(W)  ·  7-2-0 overall          │ 60
├──┼─────────────────────┼───────┼───────────────┤
│3 │[LA] Los Altos       │ 2-1-1 │  ──▐      +1  │
│  │  (W)(T)(L)(W)  ·  4-3-1 overall             │ 60
├──┼─────────────────────┼───────┼───────────────┤
│4 │[VC] Valley Christian│ 2-1-1 │  ▐▐──     −8  │
│  │  (L)(W)(W)(T)  ·  3-4-1 overall             │ 60
├──┼─────────────────────┼───────┼───────────────┤
│5 │[FR] Fremont         │ 1-4-0 │ ▐▐▐──    −13  │
│  │  (L)(W)(L)(L)(L)  ·  2-6-0 overall       ⚑ │ 60  ⚑ = MaxPreps mismatch
├──┼─────────────────────┼───────┼───────────────┤
│6 │[CU] Cupertino       │ 0-5-0 │▐▐▐▐▐──   −23  │
│  │  (L)(L)(L)(L)(L)  ·  0-8-0 overall          │ 60
├──┼─────────────────────┼───────┼───────────────┤
│7 │[HM] Homestead     ▓ │ 0-5-0 │▐▐▐▐▐▐──  −24  │
│  │  (L)(L)(L)(L)(L)  ·  1-7-0 overall          │ 60  ▓ = pinned
├──┼─────────────────────┼───────┼───────────────┤ ← fold ≈ 604
│— │[WX] Wilcox          │   —   │     ·     —   │
│  │  no results reported yet                    │ 60  sorted last, still a link
├──┴─────────────────────┴───────┴───────────────┤
│ GD = league goals for − goals against. Bars    │
│ are scaled to this division only (|GD| max 30),│
│ so De Anza and El Camino bars are not          │ 96 footnote, 13px --ink-3
│ comparable to each other. A real 0 shows as 0; │
│ a score we don't have shows as —. Wilcox is    │
│ in the league but absent from the source table. │
│ Forfeits count in W-L-T, not in GF/GA/GD.      │
├────────────────────────────────────────────────┤
│ ⚑ Fremont: we compute 1-4-0, MaxPreps shows    │
│   2-4-0. We show our computation. Details →    │ 56
├────────────────────────────────────────────────┤
│ ──── EL CAMINO ── league games only · Sep 28  │ #el-camino
│ … same 8-row table, |GD| max = 43 …            │
├────────────────────────────────────────────────┤
│ How standings are computed  →                  │ 48 → /about#standings
├────────────────────────────────────────────────┤
│ Attribution footer · bottom tab bar            │
└────────────────────────────────────────────────┘
```

**Phone column arithmetic** in the 358px content box (390 − 2×16 gutter):

*Line 1:* `#` 18 · monogram 24 + 6 gap · team name 150 (ellipsis) · `W-L-T` 52 (mono
tabular) · GD cell 108 = **358**. The GD cell is a 72px track (36px each side of a centered
1px zero rule) + 4px gap + 32px signed number.
*Line 2:* 48px indent (clears `#` + monogram) · `FormStrip` 5 × 20 + 4 × 2 gaps = 108 ·
8px gap · overall record 130 = **294 ≤ 358**. **[R-7]**

**The whole two-line row is one `<a>`** to `/teams/[slug]`, 60px tall, with `display: block`
so its hit area is exactly the row and **never overflows into the neighbouring row** — the
overlapping-target bug both judges flagged in `data-dense`. **[R-10]**

```
DESKTOP 1280px  —  /standings
┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ top nav                                                                                              │
├──────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  Standings · 2026 SCVAL girls field hockey          League games only · through Thu Sep 24           │
│  ─── DE ANZA ───────────────────────────────────────────────────────────────────────────────────────  │
│  ┌────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ #  TEAM              LEAGUE  PCT   OVERALL  GF  GA        GD        STK  HOME   AWAY  NEUT  L5 │  │
│  ├────────────────────────────────────────────────────────────────────────────────────────────────┤  │
│  │ 1  [SI] St.Ignatius  3-0-0  1.000  5-1-0    14   3  ────▐▐▐▐   +11  W3  2-0-0 1-0-0 0-0-0 WWW │  │
│  │ 2  [SF] Saint Francis 4-1-0  .800  7-2-0    36   6  ────▐▐▐▐▐▐▐▐▐▐+30 W2 3-0-0 1-1-0 0-0-0 WWLWW│ │
│  │ 3  [LA] Los Altos    2-1-1   .625  4-3-1     9   8  ────▐        +1  W1  2-0-1 0-1-0 0-0-0 WTLW│  │
│  │ 4  [VC] Valley Chr.  2-1-1   .625  3-4-1     6  14  ▐▐▐───       −8  T1  1-1-0 1-0-1 0-0-0 LWWT│  │
│  │ 5  [FR] Fremont ⚑    1-4-0   .200  2-6-0     5  18  ▐▐▐▐▐──     −13  L3  1-1-0 0-3-0 0-0-0 LWLLL│ │
│  │ 6  [CU] Cupertino    0-5-0   .000  0-8-0     0  23 ▐▐▐▐▐▐▐▐──   −23  L5  0-2-0 0-3-0 0-0-0 LLLLL│ │
│  │ 7  [HM] Homestead ▓  0-5-0   .000  1-7-0     0  24 ▐▐▐▐▐▐▐▐▐─   −24  L5  0-3-0 0-2-0 0-0-0 LLLLL│ │
│  │ —  [WX] Wilcox         —       —     —       —   —       ·        —   —    —     —   0-0-0  no results│
│  └────────────────────────────────────────────────────────────────────────────────────────────────┘  │
│  Bars are scaled to this division only: De Anza |GD| max = 30. El Camino's table uses 43, so the two │
│  are not comparable. The zero line is the hairline. GF `0` is a real zero; `—` means not reported.   │
│  NEUT is all 0-0-0 today and fills in with the CCS rounds in November. Forfeits count in W-L-T only. │
│  ⚑ Fremont: our computed 1-4-0 differs from MaxPreps' 2-4-0 (MaxPreps ↗). We show our computation.   │
│                                                                                                      │
│  ─── EL CAMINO ──── … same 13-column table, |GD| max = 43 …                                          │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

The **`NEUT` column ships now, full of zeros** rather than appearing mid-season — a column
that materialises in November breaks the reader's model of the table (`data-dense` §9.5).

### 3.3 Schedule & results — `/schedule`

**Fold budget:** top bar 44 · filter row 48 · count line 24 · timeline rail 36 · date header
34 = 186, leaving **418px = 6.1 `GameRow`s**. Six results above the fold.

All 174 contests are in the HTML. Each date group carries
`content-visibility: auto; contain-intrinsic-size: auto 480px`, so the page stays
Ctrl-F-able with no pagination and no virtualization (`data-dense`'s idea; measured win on
the longest page on the site).

```
PHONE 390px  —  /schedule
┌────────────────────────────────────────────────┐
│ ← Schedule           Sun 5:04 AM          [◐] │ 44
├────────────────────────────────────────────────┤
│ [ All teams ▾ ][ Both divisions ▾ ][ League ⃞ ]│ 48 sticky ScheduleFilters
│ 174 contests · 96 final · 76 to come · 2 canc. │ 24 aria-live="polite"
├────────────────────────────────────────────────┤
│ ↑ Aug 21  ● Sep 28  Oct 28  ⑃ Nov 7–14 ↓      │ 36 TimelineRail (anchor links)
├────────────────────────────────────────────────┤
│ THU SEP 24 · 12 games                  share →│ 34 sticky DateHeader → /scores/…
├────────────────────────────────────────────────┤
│ 5:30 (W) Saint Francis    7                    │
│      ( ) Homestead        0   FINAL         ⌄ │ 68
├────────────────────────────────────────────────┤
│ 5:30 (W) Los Gatos        4                    │
│          Saratoga         1   FINAL         ⌄ │ 68
├────────────────────────────────────────────────┤
│ 6:00     Mitty            —                    │
│          Presentation     —   NOT REPORTED  ⌄ │ 68
├────────────────────────────────────────────────┤
│ 6:00 (W) Los Altos        2                    │
│          Valley Christian 2   FINAL      2 OT ⌄│ 68  decider as superscript
├────────────────────────────────────────────────┤
│ 6:00 (⊘) Wilcox                             NL │
│ │        Menlo School         CANCELLED     ⌄ │ 68  2px left rule + NL tag
├────────────────────────────────────────────────┤
│ 7:00     Palo Alto        TBA                  │
│          Santa Clara          TIME TBA      ⌄ │ 68
├────────────────────────────────────────────────┤ ← fold ≈ 604
│ TUE SEP 29 · 6 games                           │
│ 5:30     Homestead at Los Altos                │
│          Los Altos HS · Stream ↗ · Tix ↗    ⌄ │ 68
├────────────────────────────────────────────────┤
│ … expanded <details> panel, when tapped: …     │
│ ┌────────────────────────────────────────────┐ │
│ │ "Homestead lost their home conference game │ │
│ │  against Saint Francis by a score of 7-0." │ │ 148
│ │ Homestead HS, 21370 Homestead Rd, Cupertino│ │
│ │ [ Directions ↗ ] [ NFHS stream ↗ ]         │ │
│ │ [ Tickets ↗ ]    [ MaxPreps box ↗ ]        │ │
│ │ Full game page →                           │ │ → /game/[id]
│ └────────────────────────────────────────────┘ │
└────────────────────────────────────────────────┘
```

**Filters, exactly.** One row above everything it scopes — never inside a card, never per
section. `ScheduleFilters` is the only client component on this page. The **complete,
unfiltered, server-rendered list is already in the HTML**; the filter toggles `hidden` on
`data-*`-tagged rows and date groups (a group whose every child is hidden hides itself).
Consequences: the page is useful before hydration, works fully with JS off, filtering costs
zero network, and no `searchParams` reaches a page signature. Active filters echo back as
removable mono chips (`HOMESTEAD ✕`) so state is always visible (`editorial`). The week
"pager" is plain anchor `<a href="#2026-09-24">` links in the `TimelineRail` — real,
shareable, JS-free URLs, and a `/scores/[date]` page exists for every one of them.

```
DESKTOP 1280px  —  /schedule
┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ top nav                                                                                              │
├──────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  Schedule & results                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ Team [All ▾]  Division [Both ▾]  Type [All ▾]  State [All ▾]   HOMESTEAD ✕  LEAGUE ✕   clear   │  │
│  │ 174 contests · 96 final · 76 to come · 2 cancelled                                             │  │
│  └────────────────────────────────────────────────────────────────────────────────────────────────┘  │
│  Aug ─────────── Sep ──────────●── Oct ─────────── │ Nov  CCS                                        │ 40
│  ─── THU SEP 24 · 12 GAMES ──────────────────────────────────────────────── share this day →         │
│  ┌──────────────────────────┬──────────────────────────┬──────────────────────────┐                  │
│  │ 5:30 (W) St Francis   7  │ 5:30 (W) Los Gatos    4  │ 6:00 ( ) Mitty        —  │                  │
│  │      ( ) Homestead    0  │      ( ) Saratoga     1  │      ( ) Presentation —  │                  │
│  │ FINAL                    │ FINAL                    │ SCORE NOT REPORTED       │                  │
│  │ "Homestead lost their …" │ "Saratoga lost their …"  │ We'll update when        │                  │
│  │ Homestead HS · box ↗     │ Los Gatos HS · box ↗     │ MaxPreps posts it.       │                  │
│  └──────────────────────────┴──────────────────────────┴──────────────────────────┘                  │
│  … 3 more rows, 3-up at ≥1120px, 2-up at ≥768px, 1-up (GameRow) below 768px …                        │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.4 One day — `/scores/[date]`

The same `DateHeader` + `GameRow` list as one group of `/schedule`, with no filters, an
`ImageResponse` OG card naming the date and the headline result, and `← previous day` /
`next day →` anchors to the neighbouring dates that have contests. This is the URL the
`share →` action on a date header copies.

### 3.5 One game — `/game/[id]`  **[R-4]**

```
PHONE 390px  —  /game/2026-09-24-homestead-saint-francis
┌────────────────────────────────────────────────┐
│ ← Thu Sep 24                              [◐] │ 44
├────────────────────────────────────────────────┤
│ FINAL · league · Homestead HS                  │ 28 11px mono kicker
│                                                │
│  [SF] Saint Francis                        7   │ 32px mono, 600, --ink
│       4-1-0 De Anza                            │
│  ──────────────────────────────────────────────│ zero-ish hairline
│  [HM] Homestead                            0   │ 32px mono, 400, --ink-2
│       0-5-0 De Anza                            │ 176  ScoreBoard
├────────────────────────────────────────────────┤
│ "Homestead lost their home conference game     │
│  against Saint Francis by a score of 7-0."     │ 56 14px, --ink-2
├────────────────────────────────────────────────┤
│ ──── DETAILS ────────────────────────────────  │
│ Thu Sep 24, 2026 · 5:30 PM PT                  │
│ Homestead HS, 21370 Homestead Rd, Cupertino    │ 128
│ [ Directions ↗ ] [ NFHS stream ↗ ]             │
│ [ Tickets ↗ ]    [ MaxPreps box score ↗ ]      │
├────────────────────────────────────────────────┤
│ ──── FORM GOING IN ──────────────────────────  │
│ Saint Francis  (W)(W)(L)(W)  → then W          │ 84
│ Homestead      (L)(L)(L)(L)  → then L          │
├────────────────────────────────────────────────┤
│ ──── THESE TWO THIS SEASON ──────────────────  │
│ Sep 24  (W) Saint Francis 7 – 0 Homestead      │ 96
│ Oct 15      at Saint Francis · 5:30 PM         │
│ Season series: Saint Francis leads 1-0.        │
├────────────────────────────────────────────────┤
│ Attribution footer · bottom tab bar            │
└────────────────────────────────────────────────┘
```

Desktop is the same content in a 2fr/1fr grid: scoreboard + recap + head-to-head left,
details card right. `generateMetadata` gives it a real title
(*"Saint Francis 7, Homestead 0 — Sep 24, 2026"*) and `opengraph-image.tsx` renders that
same line score on the card, so a link pasted into a group text previews the score itself.

### 3.6 Teams index — `/teams`

```
PHONE 390px  —  /teams
┌────────────────────────────────────────────────┐
│ ← Teams                                   [◐] │ 44
├────────────────────────────────────────────────┤
│ ──── DE ANZA ────────────────── standings →   │ 28
│ ┌───────────┬───────────┬───────────┐          │
│ │   [CU]    │   [FR]    │   [HM] ▓  │          │
│ │ Cupertino │  Fremont  │ Homestead │          │ 3-up, 116px tiles
│ │  0-5-0    │  1-4-0    │  0-5-0    │          │
│ ├───────────┼───────────┼───────────┤          │
│ │   [LA]    │   [SF]    │   [SI]    │          │
│ │ Los Altos │St Francis │St Ignatius│          │
│ │  2-1-1    │  4-1-0    │  3-0-0    │          │
│ ├───────────┼───────────┼───────────┤          │
│ │   [VC]    │   [WX]    │           │          │
│ │Valley Chr.│  Wilcox   │           │          │
│ │  2-1-1    │    —      │           │          │
│ └───────────┴───────────┴───────────┘          │
├────────────────────────────────────────────────┤
│ ──── EL CAMINO ──────────────── standings →   │
│ … 8 tiles, same grid …                         │
└────────────────────────────────────────────────┘
```

Tiles are 116×116 with a 40px monogram, the school name at 13px/600 (two lines allowed), and
the league record in 13px mono. The whole tile is the link. 4-up at ≥768px, 8-up at ≥1120px.

### 3.7 Team page — `/teams/[slug]`

**Fold budget:** top bar 44 · `TeamIdentity` 84 · `StatTile` row 76 · `LAST` block 100 ·
`NEXT` block 104 = 408, leaving **196px** — the second stat-tile row (76) and the `FORM`
block (60) also land. The parent's three questions plus the season shape, no scrolling.

```
PHONE 390px  —  /teams/homestead
┌────────────────────────────────────────────────┐
│ ← Homestead                               [◐] │ 44
├────────────────────────────────────────────────┤
│ ┌────┐  Homestead  Mustangs                    │
│ │ HM │  De Anza · Cupertino, CA · 7th of 8     │ 84  monogram 56px
│ └────┘  [ ★ Pin this team ]                    │
├────────────────────────────────────────────────┤
│  0-5-0            1-7-0            L5          │
│  LEAGUE           OVERALL          STREAK      │ 76 StatTile ×3
├────────────────────────────────────────────────┤
│ ──── LAST · THU SEP 24 · LEAGUE ─────────────  │
│ (L)  Homestead 0   Saint Francis 7   FINAL  ⌄ │ 100
│ "Homestead lost their home conference game …"  │
├────────────────────────────────────────────────┤
│ ──── NEXT · TUE SEP 29 · 5:30 PM · LEAGUE ───  │
│ at Los Altos                                   │ 104
│ [ Directions ↗ ] [ Stream ↗ ] [ Tickets ↗ ]   │
├────────────────────────────────────────────────┤
│  0 / 24           −24              0.0         │
│  GOALS F / A      GOAL DIFF        GOALS/GAME  │ 76 StatTile ×3
├────────────────────────────────────────────────┤ ← fold ≈ 604 + FORM
│ ──── FORM · LEAGUE · OLDEST → NEWEST ────────  │
│ (L)(L)(L)(L)(L)      ▔▔▔ most recent           │ 60
├────────────────────────────────────────────────┤
│ ──── MARGIN BY LEAGUE GAME ──────────────────  │
│  ──────────────────────────────────  0         │
│   ▌  ▌   ▌  ▌  ▌  ?  ?  ?  ?  ?  ?  ?  ?  ?   │ 128 MarginStrip
│   ▌      ▌  ▌  ▌            −7 ← worst loss    │
│   H  A   H  A  H  A  H  A  H  A  H  A  H  A    │ 15 H/A/N glyph row
│  ▸ Show as table                               │ 28 <details> twin
├────────────────────────────────────────────────┤
│ ──── SPLITS ─────────────────────────────────  │
│  Home 0-3-0 · Away 0-2-0 · Neutral 0-0-0       │ 56
├────────────────────────────────────────────────┤
│ ──── WHO WE HAVEN'T BEATEN ──────────────────  │
│ Still to play: Los Altos (Sep 29), Valley      │ 80
│ Christian (Oct 6), Wilcox (Oct 13) …           │
├────────────────────────────────────────────────┤
│ ──── LEAGUE GAME LOG · 5 of 14 ──────────────  │
│ Sep  9 (L) 0–4  vs Fremont          FINAL   ⌄ │
│ Sep 12 (L) 0–6  at Cupertino        FINAL   ⌄ │ 52 each
│ Sep 17 (L) 0–5  at St. Ignatius     FINAL   ⌄ │
│ Sep 19 (L) 2–2  vs Los Altos   2 OT FINAL   ⌄ │
│ Sep 24 (L) 0–7  vs Saint Francis    FINAL   ⌄ │
│ Sep 29 ( )  —   at Los Altos      5:30 PM   ⌄ │
├────────────────────────────────────────────────┤
│ ──── NON-LEAGUE · 3 GAMES ───────────────────  │
│ Aug 21 (W) 2–1  vs Menlo School     FINAL   ⌄ │ 52 each — own eyebrow,
│ Aug 28 (L) 1–3  at Sacred Heart     FINAL   ⌄ │      never interleaved
│ Sep  4 (L) 0–2  vs Notre Dame       FINAL   ⌄ │
├────────────────────────────────────────────────┤
│ ──── ELSEWHERE ──────────────────────────────  │
│ MaxPreps: Homestead field hockey ↗              │ 80
│ SBLive/SI: Homestead ↗                          │
└────────────────────────────────────────────────┘
```

Non-league games sit under **their own eyebrow**, never interleaved with league games
(`editorial`), so `0-5-0 in league` is never contradicted by a `(W)` in the list beneath it.

Desktop is 3fr/2fr: identity + 5 stat tiles + `MarginStrip` + the two game logs on the left;
`NEXT`, `LAST`, `FORM`, `SPLITS` and `WHO WE HAVEN'T BEATEN` in a right rail that collapses
below 900px. Source order is the phone order.

### 3.8 Playoffs — `/playoffs`

Two modes on `snapshot.playoffs.seededAt`. Today, and for the next five weeks, mode 1 is live,
so it is built first.

```
PHONE 390px  —  /playoffs   (BEFORE Nov 2 — not seeded)
┌────────────────────────────────────────────────┐
│ ← CCS Playoffs                            [◐] │ 44
├────────────────────────────────────────────────┤
│ NOT SEEDED YET                                 │ 11px mono, --ink-3
│ The CCS seeding meeting is Mon Nov 2. This      │ 76
│ page fills in that evening.                     │
├────────────────────────────────────────────────┤
│ ──── SCVAL's SHARE OF THE FIELD ─────────────  │
│ ▮▮▮▮▮▮▮░░░░░░░░░                    7 / 16     │ 88  BerthMeter, 8px tall
│ 7 of 16 CCS berths are automatic to SCVAL.      │
├────────────────────────────────────────────────┤
│ ┌──────────┬──────────┬──────────┐             │
│ │ SAT NOV 7│ WED NOV11│ SAT NOV14│             │ 84 3 StatTiles
│ │ QUARTERS │ SEMIS    │ FINAL    │             │
│ └──────────┴──────────┴──────────┘             │
├────────────────────────────────────────────────┤
│ ──── HOW IT WORKS ──────────────────────────   │
│ Single elimination. Two divisions of 8 teams —  │
│ 16 berths total. SCVAL receives 7 automatic     │ 120
│ berths. The rest are filled by the CCS seeding  │
│ committee. Official bracket ↗ (not yet posted)  │
├────────────────────────────────────────────────┤ ← fold ≈ 604
│ ──── PROJECTION · NOT OFFICIAL ──────────────  │
│ Ordered by league record through Sep 28 only.   │ 24 13px --ink-3
│ No probabilities — we have no model.            │
├──┬──────────────────────────┬──────────────────┤
│  │ TEAM                     │ STATUS           │ 30
├──┼──────────────────────────┼──────────────────┤
│1 │[LG] Los Gatos      5-0-0 │ In · auto berth  │ 48
│2 │[SI] St. Ignatius   3-0-0 │ In · auto berth  │ 48
│3 │[SF] Saint Francis  4-1-0 │ In · auto berth  │ 48
│4 │[MI] Mitty          4-1-0 │ In · auto berth  │ 48
│5 │[PR] Presentation   3-1-1 │ In · auto berth  │ 48
│6 │[LA] Los Altos      2-1-1 │ In · auto berth  │ 48
│7 │[VC] Valley Chr.    2-1-1 │ In · last auto   │ 48
├══┼══════════════════════════┼══════════════════┤ ← 2px rule = the 7th berth
│8 │[SG] Saratoga       2-2-1 │ Bubble · at-large│ 48
│9 │[PA] Palo Alto      2-3-0 │ Bubble · at-large│ 48
│10│[SC] Santa Clara    1-3-1 │ Out              │ 48
│… │                          │                  │
│16│[WX] Wilcox           —   │ Not ranked       │ 48
├──┴──────────────────────────┴──────────────────┤
│ The 2px rule marks the 7th automatic berth.     │
│ Every status is a written word — no color-only.  │ 56
│ Berths are assigned by the CCS committee.       │
└────────────────────────────────────────────────┘
```

```
PHONE 390px  —  /playoffs   (AFTER Nov 2 — seeded; vertical rounds, never a tree)
┌────────────────────────────────────────────────┐
│ [ Division I ]  [ Division II ]                │ 44 anchor tabs
│ ──── DIVISION I · QUARTERFINALS · SAT NOV 7 ─  │ 28
│ (W) 1 Los Gatos          4                     │
│     8 Santa Clara        0   FINAL          ⌄ │ 68 BracketGame = GameRow
│     4 Los Altos          2                     │
│ (W) 5 Saint Francis      3   FINAL          ⌄ │ 68
│ … 2 more …                                     │
│ ──── SEMIFINALS · WED NOV 11 ────────────────  │
│     1 Los Gatos                                │
│     5 Saint Francis    6:00 PM · Watsonville   │ 68
│ ──── FINAL · SAT NOV 14 ─────────────────────  │
│     TBD                                        │
│     TBD                1:00 PM · venue TBD     │ 68  never a blank box
│ ──── HOMESTEAD'S PATH ───────────────────────  │
│ Homestead is not in the CCS field.             │ 40  PathSummary (pinned)
└────────────────────────────────────────────────┘
```

Desktop (seeded) is a 3-column CSS grid; connectors are `::before`/`::after` elbows made of
1px borders. **No SVG, no library, no absolute positioning.** Phone is the same `rounds`
array as stacked `GameRow` groups — a horizontally scrolling tree on a 390px screen is a
usability failure and is not offered. **There is no greyed-out skeleton bracket before
Nov 2**: a skeleton bracket reads as real data (`editorial`).

### 3.9 History — `/history/2025-26`

Two `StandingsTable`s in `variant="archive"` (final records only, no GD bars, no form — the
PDF has no game-level data), then the all-league awards as two `<dl>`s (First Team / Second
Team) and the overall award lines. Every award line names the player, then school · grade ·
position, the way the roster and `/leaders` print a player (the grade a word: "Senior"); a part no
source gives is left out. Credits `scval.com` beside the global attribution line,
because the two source PDFs are SCVAL's.

### 3.10 About — `/about`

Phone: one column of rule-and-kicker sections. Desktop: 3fr prose / 1fr sticky TOC.
Sections, in order, each with a stable anchor:

`#sources` — "Data from MaxPreps and SBLive/SI" with both deep links; the one sentence about
mascot images ("the source carries a mascot image URL; we read it and discard it — each
school is shown as a color monogram instead").
`#updates` — "Rebuilt twice daily by cron, about 10 PM and 7 AM Pacific
(.github/workflows/update-data.yml). A game that finished at 7pm Thursday appears that night if
its score is entered by about 10 PM, otherwise Friday morning. **Live scores are not
collected** — anything marked LIVE is a scheduled window, not a running score."
`#standings` — §11's eight rules, verbatim. Linked from every standings table footnote.
`#conventions` — the nine-row result-rendering table from §5.2, verbatim.
`#cross-check` — the published MaxPreps comparison log (§9), every mismatch with a deep link.
`#gaps` — Wilcox's absence from the De Anza source; the empty `NEUT` column; no player names.
`#corrections` — the forum's Data errors thread (`DATA_CORRECTIONS_URL`), what to include in a
report, and the advice to check the primary source and the cross-check log first.
`#a11y` — the contrast floor, the no-color-only rule, the keyboard model, and the statement
that the site stores nothing but a theme choice, a pinned team and the league the visitor chose
to see (§15), all locally.

---

## 4. Visual system

### 4.1 Color tokens — every value measured, none asserted

Four planes per mode. Every number below is output from
`contrast()` exported by the dataviz validator; the script that produces this table ships as
the Vitest test in §8.4, so a token edit that breaks a floor **fails `pnpm test`**
(`editorial`'s best idea, adopted as a gate). **[R-16]**

| Role | Token | Light | Dark | Measured |
|---|---|---|---|---|
| Page plane | `--sx-bg` | `#f6f7f8` | `#0b0d10` | body background |
| Card surface | `--sx-surface` | `#ffffff` | `#14171b` | the chart surface |
| Subtle plane | `--sx-surface-2` | `#f2f4f6` | `#1c2026` | table header, zebra, **row hover** |
| Chrome plane | `--sx-surface-3` | `#e6e9ec` | `#252a31` | chip track, disabled, active tab pill |
| Hairline | `--sx-border` | `#d9dde2` | `#2b3138` | 1.36 / 1.37 vs surface |
| Strong rule | `--sx-border-strong` | `#b9c0c8` | `#3d444d` | 1.84 / 1.83 — zero line, dividers |
| Primary ink | `--sx-text` | `#0e1116` | `#f2f5f8` | **18.91 / 16.43** surface · 17.15 / 14.95 s2 · 15.52 / 13.20 s3 |
| Secondary ink | `--sx-text-2` | `#4a5461` | `#aab4bf` | **7.69 / 8.55** · 6.97 / 7.78 · 6.31 / 6.87 |
| Muted ink | `--sx-text-3` | `#5d6874` | `#919ba5` | **5.68 / 6.37** · 5.15 / 5.79 · **4.66 / 5.11** — AA on all four planes |
| Accent | `--sx-accent` | `#1558b0` | `#4f95ee` | **6.87 / 5.88** · 6.24 / 5.35 |
| Accent ink | `--sx-accent-ink` | `#0f4a96` | `#9cc6f8` | **6.50 / 7.55** on accent wash |
| Accent wash | `--sx-accent-wash` | `#d4e1f3` | `#213043` | also the `BerthMeter` track — fill:track = **5.19 / 4.38** |
| **Win mark** | `--sx-win` | `#036a34` | `#179765` | **6.74 / 4.84** surface · 6.11 / 4.40 s2 |
| Win ink | `--sx-win-ink` | `#03562a` | `#5fd39c` | **6.67 / 7.49** on win wash |
| Win wash | `--sx-win-wash` | `#d5e3d8` | `#1c302a` | chip ground |
| **Loss mark** | `--sx-loss` | `#df6860` | `#e9523f` | **3.34 / 4.92** surface · 3.03 / 4.47 s2 · *2.74* / 3.95 s3 |
| Loss ink | `--sx-loss-ink` | `#a32f28` | `#ff9c8c` | **5.80 / 6.88** on loss wash |
| Loss wash | `--sx-loss-wash` | `#fde4e1` | `#3e2625` | chip ground |
| **Tie (hueless)** | `--sx-tie` | `#55606d` | `#8b959f` | **6.40 / 5.90** — no hue by design |
| Tie ink | `--sx-tie-ink` | `#414b56` | `#c3ccd6` | **6.71 / 8.28** on tie wash |
| Tie wash | `--sx-tie-wash` | `#dee0e3` | `#2b2f35` | |
| **Bar ink** | `--sx-bar` | `#4a5461` | `#aab4bf` | **7.69 / 8.55** — the *only* GD/margin mark color |
| Zero rule | `--sx-zero` | `#b9c0c8` | `#3d444d` | the diverging midpoint is a neutral gray, never a hue |
| Focus ring | `--sx-focus` | `#1558b0` | `#4f95ee` | = accent, 6.87 / 5.88 (≫ 3:1) |
| Selection | `--sx-select` | `#cbdaf0` | `#213043` | |

**The two lintable exclusions** (`editorial`'s idea — named, published, and asserted in the
test rather than left to reviewer memory):

1. **In light mode, the `--sx-loss` mark never sits on `--sx-surface-3`** (2.74, below the
   3:1 mark floor). `--sx-surface-3` is *chrome only* — chip tracks, disabled controls, the
   active tab-bar pill. Row hover/press is `--sx-surface-2`, where loss measures **3.03** and
   every other mark clears comfortably. Nothing on the site puts a result mark on plane 3.
2. **No token pair below AA is permitted for text at any size.** The weakest ink/plane pair in
   the whole system is `--sx-text-3` on `--sx-surface-3` at **4.66 light / 5.11 dark** — both
   clear 4.5:1, so there is no "decorative gray" on this site that quietly fails.

**Game states are not hues.** They are ink + a written label + (for LIVE) motion:

| State | Ink | Chip | Written label | Extra |
|---|---|---|---|---|
| `final` | `--sx-text` score, `--sx-text-3` label | `W`/`L`/`T` | `FINAL` | winner 600 / loser 400 |
| `in_progress` | `--sx-accent-ink` | accent-wash pill | `LIVE` | 8px accent dot, 1.6s pulse, + "scheduled window" note |
| `scheduled` | `--sx-text-2` | none | the time, or `TIME TBA` | — |
| `unreported` | `--sx-text-3` | empty **outlined** chip | `SCORE NOT REPORTED` | "We'll update when MaxPreps posts it." |
| `cancelled` | `--sx-text-3` | neutral `⊘` chip | `CANCELLED` | the *time* gets `line-through`; names never do |
| `postponed` | `--sx-text-3` | neutral `↻` chip | `POSTPONED` | `→ new date` when known, else `→ TBD` |

**School colors are never a data encoding.** They appear only inside `TeamMonogram`, which
enforces letter contrast at build time (§7.1). Sixteen uncontrolled brand hues blow past both
the 8-slot categorical ceiling and the all-pairs cap of three, so they are decoration with a
guardrail. **Divisions get no hue either** (§6.4).

### 4.2 `app/globals.css` — ready to paste

```css
@import "tailwindcss";

/* The `dark:` variant follows the toggle AND the OS. Tokens carry the theme, so
   `dark:` should be rare — it is for the handful of non-color facts that differ
   (e.g. `dark:shadow-none`). */
@custom-variant dark {
  &:where([data-theme="dark"], [data-theme="dark"] *) { @slot; }
  @media (prefers-color-scheme: dark) {
    &:where(:root:not([data-theme="light"]), :root:not([data-theme="light"]) *) { @slot; }
  }
}

/* ── Light (default) ─────────────────────────────────────────────────────── */
:root {
  color-scheme: light;

  /* planes */
  --sx-bg:            #f6f7f8;
  --sx-surface:       #ffffff;
  --sx-surface-2:     #f2f4f6;   /* table header, zebra, ROW HOVER */
  --sx-surface-3:     #e6e9ec;   /* chrome only — never hosts a result mark (light) */
  --sx-border:        #d9dde2;
  --sx-border-strong: #b9c0c8;

  /* ink */
  --sx-text:          #0e1116;
  --sx-text-2:        #4a5461;
  --sx-text-3:        #5d6874;

  /* accent — links, focus, LIVE, the berth meter */
  --sx-accent:        #1558b0;
  --sx-accent-ink:    #0f4a96;
  --sx-accent-wash:   #d4e1f3;   /* doubles as the meter track */

  /* the two reserved data hues + the hueless third state */
  --sx-win:           #036a34;
  --sx-win-ink:       #03562a;
  --sx-win-wash:      #d5e3d8;
  --sx-loss:          #df6860;
  --sx-loss-ink:      #a32f28;
  --sx-loss-wash:     #fde4e1;
  --sx-tie:           #55606d;
  --sx-tie-ink:       #414b56;
  --sx-tie-wash:      #dee0e3;

  /* data-viz: ONE ink for every bar on the site, and a neutral zero */
  --sx-bar:           #4a5461;
  --sx-zero:          #b9c0c8;

  --sx-focus:         #1558b0;
  --sx-select:        #cbdaf0;

  /* radii */
  --sx-r-tag: 4px;
  --sx-r-chip: 6px;
  --sx-r-card: 10px;
  --sx-r-card-lg: 14px;

  /* the only two shadows in the system */
  --sx-shadow-sticky: 0 1px 0 var(--sx-border);
  --sx-shadow-raised: 0 1px 2px rgb(14 17 22 / 0.05), 0 2px 12px rgb(14 17 22 / 0.05);

  /* motion */
  --sx-dur-tap: 120ms;
  --sx-dur-ui: 200ms;
  --sx-ease: cubic-bezier(0.2, 0, 0.2, 1);
}

/* ── Dark, under the OS setting when no data-theme is stamped ────────────── */
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme="light"])) {
    color-scheme: dark;
    --sx-bg:            #0b0d10;
    --sx-surface:       #14171b;
    --sx-surface-2:     #1c2026;
    --sx-surface-3:     #252a31;
    --sx-border:        #2b3138;
    --sx-border-strong: #3d444d;
    --sx-text:          #f2f5f8;
    --sx-text-2:        #aab4bf;
    --sx-text-3:        #919ba5;
    --sx-accent:        #4f95ee;
    --sx-accent-ink:    #9cc6f8;
    --sx-accent-wash:   #213043;
    --sx-win:           #179765;
    --sx-win-ink:       #5fd39c;
    --sx-win-wash:      #1c302a;
    --sx-loss:          #e9523f;
    --sx-loss-ink:      #ff9c8c;
    --sx-loss-wash:     #3e2625;
    --sx-tie:           #8b959f;
    --sx-tie-ink:       #c3ccd6;
    --sx-tie-wash:      #2b2f35;
    --sx-bar:           #aab4bf;
    --sx-zero:          #3d444d;
    --sx-focus:         #4f95ee;
    --sx-select:        #213043;
    /* shadows do not read on #0b0d10 — the hairline does the work */
    --sx-shadow-raised: none;
  }
}

/* ── Dark, under the explicit toggle (wins over the OS in both directions) ── */
:root[data-theme="dark"] {
  color-scheme: dark;
  --sx-bg:            #0b0d10;
  --sx-surface:       #14171b;
  --sx-surface-2:     #1c2026;
  --sx-surface-3:     #252a31;
  --sx-border:        #2b3138;
  --sx-border-strong: #3d444d;
  --sx-text:          #f2f5f8;
  --sx-text-2:        #aab4bf;
  --sx-text-3:        #919ba5;
  --sx-accent:        #4f95ee;
  --sx-accent-ink:    #9cc6f8;
  --sx-accent-wash:   #213043;
  --sx-win:           #179765;
  --sx-win-ink:       #5fd39c;
  --sx-win-wash:      #1c302a;
  --sx-loss:          #e9523f;
  --sx-loss-ink:      #ff9c8c;
  --sx-loss-wash:     #3e2625;
  --sx-tie:           #8b959f;
  --sx-tie-ink:       #c3ccd6;
  --sx-tie-wash:      #2b2f35;
  --sx-bar:           #aab4bf;
  --sx-zero:          #3d444d;
  --sx-focus:         #4f95ee;
  --sx-select:        #213043;
  --sx-shadow-raised: none;
}

/* ── Tailwind theme. `inline` is required: the utilities must resolve the
      var() at use-site so the dark overrides above take effect. ─────────── */
@theme inline {
  /* fonts — the variables come from next/font in layout.tsx */
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);

  /* colors → bg-surface, text-ink-2, border-hairline, bg-win, fill-bar, … */
  --color-bg:           var(--sx-bg);
  --color-surface:      var(--sx-surface);
  --color-surface-2:    var(--sx-surface-2);
  --color-surface-3:    var(--sx-surface-3);
  --color-hairline:     var(--sx-border);
  --color-rule:         var(--sx-border-strong);
  --color-ink:          var(--sx-text);
  --color-ink-2:        var(--sx-text-2);
  --color-ink-3:        var(--sx-text-3);
  --color-accent:       var(--sx-accent);
  --color-accent-ink:   var(--sx-accent-ink);
  --color-accent-wash:  var(--sx-accent-wash);
  --color-win:          var(--sx-win);
  --color-win-ink:      var(--sx-win-ink);
  --color-win-wash:     var(--sx-win-wash);
  --color-loss:         var(--sx-loss);
  --color-loss-ink:     var(--sx-loss-ink);
  --color-loss-wash:    var(--sx-loss-wash);
  --color-tie:          var(--sx-tie);
  --color-tie-ink:      var(--sx-tie-ink);
  --color-tie-wash:     var(--sx-tie-wash);
  --color-bar:          var(--sx-bar);
  --color-zero:         var(--sx-zero);

  /* type scale — 8 steps, two of them fluid. No three steps inside 2px. */
  --text-kicker: 0.6875rem;                    /* 11 — mono caps, the kicker voice */
  --text-kicker--line-height: 1;
  --text-kicker--letter-spacing: 0.10em;
  --text-kicker--font-weight: 600;

  --text-micro: 0.75rem;                       /* 12 — tab labels, chip letters */
  --text-micro--line-height: 1rem;
  --text-micro--font-weight: 500;

  --text-meta: 0.8125rem;                      /* 13 — timestamps, footnotes, recaps, cells */
  --text-meta--line-height: 1.125rem;

  --text-body: 0.9375rem;                      /* 15 — default reading size, team names */
  --text-body--line-height: 1.375rem;

  --text-lead: 1.0625rem;                      /* 17 — the next-game line, card leads */
  --text-lead--line-height: 1.5rem;
  --text-lead--font-weight: 600;

  --text-score: 1.25rem;                       /* 20 — mono tabular scores in lists */
  --text-score--line-height: 1.5rem;
  --text-score--font-weight: 600;

  --text-h1: clamp(1.375rem, 1.1rem + 1.1vw, 1.75rem);    /* 22 → 28 */
  --text-h1--line-height: 1.15;
  --text-h1--letter-spacing: -0.02em;
  --text-h1--font-weight: 600;

  --text-figure: clamp(1.75rem, 1.4rem + 1.6vw, 2.5rem);  /* 28 → 40 — stat values */
  --text-figure--line-height: 1;
  --text-figure--letter-spacing: -0.02em;
  --text-figure--font-weight: 600;

  /* named layout constants used in the fold arithmetic of §3 */
  --spacing-gutter:    1rem;      /* 16px phone side gutter */
  --spacing-gutter-lg: 1.5rem;    /* 24px desktop */
  --spacing-topbar:    2.75rem;   /* 44px phone */
  --spacing-topbar-lg: 3.5rem;    /* 56px desktop */
  --spacing-tabbar:    3.5rem;    /* 56px */
  --spacing-row:       3.75rem;   /* 60px two-line standings row */
  --spacing-gamerow:   4.25rem;   /* 68px game row */

  --radius-tag:     var(--sx-r-tag);
  --radius-chip:    var(--sx-r-chip);
  --radius-card:    var(--sx-r-card);
  --radius-card-lg: var(--sx-r-card-lg);

  --shadow-sticky: var(--sx-shadow-sticky);
  --shadow-raised: var(--sx-shadow-raised);

  --ease-sx: var(--sx-ease);
}

@layer base {
  html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }

  body {
    background: var(--sx-bg);
    color: var(--sx-text);
    font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif;
    font-size: 0.9375rem;
    line-height: 1.375rem;
    font-synthesis-weight: none;
    -webkit-font-smoothing: antialiased;
    /* room for the fixed bottom tab bar + the notch */
    padding-bottom: calc(var(--spacing-tabbar) + env(safe-area-inset-bottom));
  }
  @media (min-width: 768px) { body { padding-bottom: 0; } }

  /* Mono is the voice of facts; Sans is the voice of names and prose. Nothing else. */
  .sx-num {                     /* digits that stack in a column */
    font-family: var(--font-mono), ui-monospace, monospace;
    font-variant-numeric: tabular-nums;
  }
  .sx-figure {                  /* large standalone numbers — never tabular */
    font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif;
    font-variant-numeric: proportional-nums;
  }

  /* The signature move: a 1px rule with an 11px mono kicker sitting on it. */
  .sx-kicker {
    display: flex; align-items: center; gap: 0.75rem;
    font-family: var(--font-mono), ui-monospace, monospace;
    font-size: var(--text-kicker); font-weight: 600;
    letter-spacing: 0.10em; text-transform: uppercase;
    color: var(--sx-text-3);
    border-top: 1px solid var(--sx-border);
    padding-top: 0.5rem; margin-bottom: 0.5rem;
    min-height: 1.75rem;
  }
  .sx-kicker > .sx-kicker-rule { flex: 1 1 auto; height: 1px; background: var(--sx-border); }
  .sx-kicker > a { margin-left: auto; color: var(--sx-accent); }

  /* Long lists stay in the HTML without costing layout on first paint. */
  .sx-dategroup { content-visibility: auto; contain-intrinsic-size: auto 480px; }

  ::selection { background: var(--sx-select); }

  :where(a, button, select, summary, [role="tab"], [tabindex]):focus-visible {
    outline: 2px solid var(--sx-focus);
    outline-offset: 2px;
    border-radius: var(--sx-r-tag);
  }

  @media (prefers-reduced-motion: reduce) {
    html { scroll-behavior: auto; }
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
    /* the LIVE dot becomes a static ring instead of a pulse */
    .sx-live-dot { animation: none; box-shadow: 0 0 0 3px var(--sx-accent-wash); }
  }

  @media (forced-colors: active) {
    /* Hue is gone. The letter, the written label and the bar's side of the zero
       rule already carry every meaning, so nothing needs a fallback channel. */
    .sx-chip { forced-color-adjust: none; border: 1px solid CanvasText;
               background: Canvas; color: CanvasText; }
    .sx-bar  { forced-color-adjust: none; background: CanvasText; }
    .sx-zero { forced-color-adjust: none; background: CanvasText; }
  }
}

@keyframes sx-pulse {
  0%, 100% { box-shadow: 0 0 0 0 var(--sx-accent-wash); }
  50%      { box-shadow: 0 0 0 4px var(--sx-accent-wash); }
}
.sx-live-dot { animation: sx-pulse 1.6s var(--sx-ease) infinite; }
```

### 4.3 Type scale in practice

| Token | px / line-height | Weight | Family | Used for |
|---|---|---|---|---|
| `text-kicker` | 11 / 1, `+0.10em`, caps | 600 | **Mono** | every section kicker, `FINAL`, `NL`, `OT`, column heads, tags |
| `text-micro` | 12 / 16 | 500 | Sans | chip letters, bottom-tab labels |
| `text-meta` | 13 / 18 | 400 | Sans | timestamps, footnotes, recaps, dense table cells |
| `text-body` | 15 / 22 | 400 / 600 | Sans | default prose, team names in rows |
| `text-lead` | 17 / 24 | 600 | Sans | the next-game line, card leads |
| `text-score` | 20 / 24 | 600 | **Mono, tabular** | scores in every list |
| `text-h1` | clamp 22 → 28 | 600 | Sans | page titles |
| `text-figure` | clamp 28 → 40 | 600 | Sans, **proportional** | stat-tile values; **one per view** at the top of the clamp |

**The typographic rule, in one sentence:** *Mono is the voice of facts, Sans is the voice of
names and prose, and nothing else.* Mono + `tabular-nums` only where digits stack vertically
— scores in a list, standings columns, axis ticks, game-log dates. Large standalone numbers
use Sans with **proportional** figures, because `tabular-nums` makes `−24` look loose at
40px. Headlines cap at an **18-character measure**; prose caps at **62ch**. Never a serif or
display face anywhere.

### 4.4 Spacing, radii, borders, shadows, motion

- **Spacing:** 4px base. Canonical steps 2 · 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64. Phone side
  gutter 16px, desktop 24px, content max-width 1120px. Vertical rhythm: 8 inside a row,
  12 between rows, 32 between kicker sections on phone, 48 on desktop.
- **Tap targets:** 44×44 minimum, never overlapping. Standings row **60px** (the whole
  two-line row is one block-level `<a>`; its hit area is exactly the row). Game row 68px.
  Chip links 40px tall with 8px gaps. Bottom tab items 78×56.
- **Radii:** tag 4 · chip 6 · card 10 (phone) / 14 (desktop) · pill 999. **Tables and
  full-bleed phone lists have no radius** — they run edge to edge, buying 32px of width back
  at 390px.
- **Borders:** one hairline, `1px solid var(--sx-border)`. Rows are separated by
  `border-bottom` only; never a box per row. The zero line in a diverging bar is
  `--sx-zero`, **solid, never dashed**. Non-league games get a 2px left border in
  `--sx-border-strong` **plus** the `NL` tag — a shape-and-word cue, not a hue.
- **Shadows:** two, neither decorative. `--sx-shadow-sticky` (a 1px hairline) on the sticky
  bar, scrolled or not, and `--sx-shadow-raised` under cards. The bar never swaps to the raised
  shadow: `data-sticky="scrolled"`, like the `.sx-on-fill` and `.sx-sticky-head` focus hooks,
  was not adopted, and globals.css carries none of them. Dark mode sets
  `--sx-shadow-raised: none` and leans on the border. **Neither token is self-referential**
  — each is a literal value in `:root`, aliased once into `@theme inline`. **[R-17]**
- **Motion:** 120ms tap feedback (`background-color` → `--sx-surface-2`), 200ms for the theme
  swap and `<details>` disclosure, 1.6s LIVE pulse. Nothing else animates. No page
  transitions; no skeleton flash — a re-filter holds the previous render at `opacity: .6`.
  All of it collapses under `prefers-reduced-motion: reduce`.
- **Focus:** `:focus-visible` only — 2px `--sx-focus`, 2px offset, 4px radius; inside a
  `.sx-flush` card (`overflow: clip`) the ring is drawn inset (`outline-offset: -2px`) so the
  clip cannot eat it (globals.css). No table header cell is focusable, so the `editorial` inset
  ring on sticky heads was dropped with the unused `.sx-sticky-head` hook. Accent-vs-surface is
  6.87 light / 5.88 dark, far past 3:1.

---

## 5. Domain contract and result rendering

### 5.1 Shared types — the contract the whole UI is written against

`lib/types.ts`. These are also the Zod schema's output types, so the cron fails loudly rather
than shipping a fake scoreline (`data-dense`'s best structural idea).

```ts
export type Division = 'de-anza' | 'el-camino';
export type TeamSlug =
  | 'cupertino' | 'fremont' | 'homestead' | 'los-altos' | 'saint-francis'
  | 'st-ignatius' | 'valley-christian' | 'wilcox'
  | 'los-gatos' | 'lynbrook' | 'mitty' | 'monta-vista'
  | 'palo-alto' | 'presentation' | 'santa-clara' | 'saratoga';

export type GameStatus =
  | 'scheduled'
  | 'in_progress'      // possible in the feed; always rendered as a scheduled window
  | 'final'
  | 'unreported'       // played, no score published — NEVER 0-0
  | 'cancelled'
  | 'postponed';

export type Outcome  = 'W' | 'L' | 'T';                      // only when status === 'final'
export type Decider  = 'REG' | 'OT' | '2OT' | 'SO' | 'FORFEIT';
export interface Record3 { w: number; l: number; t: number }

/** A non-SCVAL opponent has a name and nothing else: no monogram fill, no link. */
export type TeamRef = { kind: 'league'; slug: TeamSlug } | { kind: 'outside'; name: string };

export interface Team {
  slug: TeamSlug;
  name: string;          // "Saint Francis"
  short: string;         // "St Francis"  — desktop table
  abbr: string;          // "SF"          — monogram, hand-assigned, unique-asserted
  mascot: string; city: string; division: Division;
  colors: { primary: string; secondary: string; onPrimary: '#0e1116' | '#ffffff' };
  league: Record3; overall: Record3;
  home: Record3; away: Record3; neutral: Record3;
  goalsFor: number | null;      // a real 0 is 0; null means nothing reported
  goalsAgainst: number | null;
  streak: { kind: Outcome; n: number } | null;
  links: { maxpreps: string; sblive: string };
  hasReportedResults: boolean;  // false ⇒ rank null, sorted last, every cell an em dash
}

export interface Game {
  id: string;                    // "2026-09-24-homestead-saint-francis"
  date: string;                  // ISO date, America/Los_Angeles
  time: string | null;           // null ⇒ TIME TBA
  site: 'home' | 'away' | 'neutral';
  home: TeamRef; away: TeamRef;
  homeScore: number | null;      // null, never coerced to 0
  awayScore: number | null;
  status: GameStatus;
  decider: Decider | null;       // null unless status === 'final'
  shootout: { home: number; away: number } | null;
  forfeitBy: 'home' | 'away' | null;
  isLeague: boolean;
  recap: string | null;          // one cleaned English sentence (§5.8)
  venue: { name: string; address?: string } | null;   // address lazy
  streamUrl: string | null; ticketUrl: string | null; boxScoreUrl: string | null;
  note: string | null;           // "Cancelled — poor air quality"
}

export interface Snapshot {
  generatedAt: string;           // ISO instant
  teams: Team[];                 // ALWAYS 16 — built from the repo constant, left-joined
  games: Game[];
  playoffs: { seededAt: string | null; autoBerths: 7; totalBerths: 16;
              seedingDate: string; dates: { qf: string; sf: string; final: string };
              rounds: BracketRound[] };
  crossCheck: { slug: TeamSlug; field: string; ours: string; theirs: string; url: string }[];
}
```

**Zod invariants that fail the cron rather than the reader** (`lib/snapshot.ts`):

```ts
// 1. A final game must have two numbers.
.refine(g => g.status !== 'final' || (g.homeScore !== null && g.awayScore !== null),
        'final game with a null score')
// 2. A non-final game must have no numbers.
.refine(g => g.status === 'final' || (g.homeScore === null && g.awayScore === null),
        'non-final game carrying a score')
// 3. A decider exists only on a final.
.refine(g => (g.decider !== null) === (g.status === 'final'), 'decider/status mismatch')
// 4. Shootout data only with decider === 'SO'.
.refine(g => (g.shootout !== null) === (g.decider === 'SO'), 'shootout/decider mismatch')
// 5. Exactly 16 teams, slugs matching TEAMS, abbrs unique.
.refine(s => s.teams.length === 16 && new Set(s.teams.map(t => t.abbr)).size === 16)
```

### 5.2 `renderScore` — the single place the never-0-0 rule lives

One pure function. Every score on the site goes through it; nothing else reads
`homeScore`/`awayScore` directly. Grafted from `data-dense`, with `editorial`'s
winner-by-weight channel folded in.

```ts
export type ScoreView =
  | { kind: 'final'; home: number; away: number; outcome: Outcome;   // outcome vs `home`
      decider: Decider; shootout: { home: number; away: number } | null }
  | { kind: 'scheduled'; time: string | null }     // time === null ⇒ TIME TBA
  | { kind: 'live' }                               // scheduled window, not a running score
  | { kind: 'unreported' }
  | { kind: 'cancelled'; note: string | null }
  | { kind: 'postponed'; newDate: string | null };

export function renderScore(g: Game): ScoreView {
  if (g.status === 'cancelled')  return { kind: 'cancelled', note: g.note };
  if (g.status === 'postponed')  return { kind: 'postponed', newDate: null };
  if (g.status === 'unreported') return { kind: 'unreported' };
  if (g.status === 'in_progress') return { kind: 'live' };
  if (g.status !== 'final' || g.homeScore === null || g.awayScore === null)
    return { kind: 'scheduled', time: g.time };
  const outcome: Outcome =
    g.decider === 'SO' && g.shootout
      ? (g.shootout.home > g.shootout.away ? 'W' : 'L')
      : g.homeScore > g.awayScore ? 'W' : g.homeScore < g.awayScore ? 'L' : 'T';
  return { kind: 'final', home: g.homeScore, away: g.awayScore,
           outcome, decider: g.decider ?? 'REG', shootout: g.shootout };
}
```

**The nine-row rendering table. No gaps, no exceptions.**

| Case | Score slot | Written label | Chip | Row treatment | Counts in standings |
|---|---|---|---|---|---|
| **Final, regulation** | `7` / `0` — **winner 600 wt in `--sx-text`, loser 400 wt in `--sx-text-2`** | `FINAL` | `W`/`L` on each side; `T` on both when drawn | winner's line also gets a 3px `--sx-win` left rule | yes |
| **Final, `0-0` draw** | `0` / `0` — rendered **only** when `status === 'final'` and both scores are literally `0` | `FINAL` | `T` on both | both lines 400 wt | yes, as T |
| **Final, OT** | `2 – 2` then `2 OT` as a mono superscript tag | `FINAL` + `OT` | `W`/`L` as normal | — | yes; an OT win is a win |
| **Final, shootout** | `1 – 1` then `(4–3 SO)` in `--sx-text-3` mono | `FINAL` + `SO` | `W`/`L` **from the shootout** | — | yes, as a win; the *goal* score stays 1-1 so GF/GA stay right |
| **Forfeit** | `1 – 0` then an `F` tag and a `†` | `FINAL` + `FORFEIT` | `W`/`L` | recap names the forfeiting side | **W-L-T yes; GF/GA/GD no**, and excluded from `MarginStrip`; `†` footnote under every total that excludes it |
| **Scheduled** | **no score cells at all** — the time takes the column in `--sx-text-2`, or `TIME TBA` | the time / `TIME TBA` | none | `vs`/`at` + venue; stream and ticket chips when present | no |
| **In progress** | **no score** — `—` | `LIVE` + 8px pulsing accent dot + the words "scheduled window" on hover/`/about` | none | accent-wash 2px left rule; link out to MaxPreps for a live score | no |
| **Score not reported** | `—` / `—` (em dash, `--sx-text-3`, `aria-label="score not reported"`) | `SCORE NOT REPORTED` | **empty outlined** chip — never a `T` | body line "We'll update when MaxPreps posts it." | **no**, and excluded from GF/GA/GD/streak/form/MarginStrip |
| **Cancelled** | no score cells; the two teams joined by `vs` | `CANCELLED` | neutral `⊘` | the **time** gets `line-through`; the names stay `--sx-text-2` and are never faded below contrast; `note` shown if present | no; removed from "games remaining" too |
| **Postponed** | no score cells | `POSTPONED` + `→ NOV 2` if known, else `→ TBD` | neutral `↻` | links to the new date when it exists | no |
| **Non-league** | identical to the above | extra `NL` mono tag | as above | 2px `--sx-border-strong` left rule; in team-page lists, grouped under a `NON-LEAGUE` eyebrow, never interleaved. A non-SCVAL opponent renders as plain text — **no monogram fill, no link** | league table no; overall record yes |

### 5.3 `0` is not `null`, and they must be told apart at 13px

Three teams in the live payload have a genuine league GF of `0` (§2). So the constraint is a
*discrimination* problem:

- A real **`0`** renders as the mono glyph `0` in **`--sx-text`** — full-strength ink.
- A **`null`** renders as an em dash **`—`** in **`--sx-text-3`**, `aria-hidden` on the glyph
  with the visually-hidden words "not reported".
- **No cell is ever blank and no cell ever coerces.** The type is `number | null` with no
  default anywhere in the pipeline.
- The standings footnote says it out loud — *"A real 0 shows as 0; a score we don't have
  shows as —"* — because a reader who sees `0 GF` will otherwise file a bug.
- CI asserts that **no route renders the string `0-0` or `0 – 0` for a game whose status is
  not `final`** (§10.9).

### 5.4 League vs non-league

Marking the majority is noise, so **league games carry no tag** in a league context.
Non-league games carry three redundant cues, none of them a hue:

1. The mono word `NL` (`NON-LEAGUE` where there is room) in `--sx-text-3`.
2. A **2px `--sx-border-strong` left rule** on the row.
3. In `MarginStrip`, an **outline column** — 1.5px stroke, no fill — a *shape* difference
   (`data-dense`). Never a second hue and never a lighter step. **[R-14]**

Non-league games are excluded from the league table **by construction** (the aggregate
iterates `games.filter(g => g.isLeague && g.status === 'final')`), and included in the
overall record. On a team page they sit under their own eyebrow.

### 5.5 Form strips

Last **5** league results everywhere — phone, desktop, home mini-table, team page. No
context shows a different window. **[R-7]**

- Oldest → newest, left to right, with the direction stated **in words** once per page.
- Each chip is a `ResultChip` with the **letter** `W`/`L`/`T` as the primary encoding, a wash
  ground, a 1px ring, and ink that clears AA on its own wash (6.67 / 5.80 / 6.71 light;
  7.49 / 6.88 / 8.28 dark). A **2px surface gap** separates chips — the gap does the
  separating, never a stroke around each chip.
- The newest chip carries a 2px `--sx-text` underline plus the visually-hidden words
  "most recent".
- **`unreported` and `cancelled` games are skipped, not shown as dots** — the strip is a
  record of results, and a placeholder square would read as a result.
- Fewer than 5 league games: render only what exists, no placeholder squares. **Zero games:
  render the words `no results` in `--sx-text-3`,** not an empty row of boxes.
- One `aria-label` sentence for the whole strip: *"Last 5 league games: loss, loss, loss,
  loss, loss."* — never five separate letters.
- A caption notes the excluded games: `+ 3 non-league`.

### 5.6 Goal differential — a hueless ink bar  **[R-1]**

**Decision: the GD bar carries no hue at all.** `editorial`'s argument is airtight and both
judges endorsed it: a bar has no adjacent letter to lean on, so a hued bar makes the CVD
failure load-bearing; and a blue↔red diverging pair would mean *blue = good* on a page where
*green = win* — two contradictory polarity languages in one table. §6.3 shows the hued
alternatives hard-failing the validator.

- **One ink**, `--sx-bar` (`#4a5461` light, 7.69:1 on the card; `#aab4bf` dark, 8.55:1).
- **Polarity is position** relative to a shared 1px `--sx-zero` rule that runs the full
  column height: positive extends right, negative extends left. Pre-attentive, non-color,
  fully grayscale-safe, and correct in `forced-colors` with no fallback path.
- **The signed numeral is always printed** adjacent (`+30`, `−24`, mono tabular). This is a
  table cell, so the *value is the content* and the bar is the redundant encoding. The bar
  itself is `aria-hidden`.
- **Domain is per division**, computed at build as `max(|gd|)` over that division's teams —
  De Anza **30**, El Camino **43** on the reference snapshot. A single shared domain of 43
  would squash Saint Francis's `+30` to 70% of track and every other De Anza bar
  proportionally, making the page's main event the less readable of the two tables. **The
  domain is printed in each table's footnote** and the footnote says the two tables are not
  comparable to each other, so the per-division scale is disclosed rather than assumed.
  **[R-2]**
- **Marks:** 8px thick on phone, 10px on desktop (well under the 24px cap); 4px rounded
  **outer** data-end, **square at the zero baseline**; 2px surface gap from the adjacent
  cell's content; no stroke around the bar.
- **`gd === 0`** renders a 2px square tick on the zero rule plus the numeral `0` — never an
  invisible zero-width bar.
- **`gd === null`** renders a `·` on the zero rule and `—` in the numeral slot. Never `0`.
- **Color never follows rank.** Re-sorting or filtering the table never repaints anything,
  because there is nothing hued to repaint.

### 5.7 `MarginStrip` — the second and last chart

Same language rotated to columns. One series → **no legend box**; the kicker
`MARGIN BY LEAGUE GAME` names it. A 2-item key *does* appear for the fill-vs-outline
non-league distinction, because that is a second encoding, not a second series.

**Geometry, computed for the 358px phone content box** (`phone-first` skipped this
arithmetic; here it is): a 14-slot league season. Left value gutter 40px leaves a 318px
track. 14 columns × **18px** + 13 × **2px** gaps = 252 + 26 = **278 ≤ 318**, with 40px spare
for the extreme labels. Columns are 18px — under the 24px cap — and each column's hit area is
18 + 6 padding each side = **30px ≥ 24px minimum**. Height: 56px above the zero rule + 1px
rule + 56px below + 15px glyph row = **128px**, which includes the axis band, so the
container never gets a nested scrollbar. Desktop: 24px columns, 4px gaps, 200px tall.

- y = **goal margin** (goals for − against) on **one** symmetric axis, clamped to the team's
  own range. There is no second axis; goals for and goals against live in the table twin.
- x = **game order**, not a time scale — the August non-league block would otherwise
  compress to nothing.
- **Unplayed games get a `?` tick on the axis with no column**, and the axis continues to
  game 14, so the reader sees how much season is left (`data-dense`). **[R-14]**
- **An `H`/`A`/`N` glyph row** sits under the axis. Home/away/neutral is never a color.
- **Exactly three direct labels:** the best margin, the worst margin, and the most recent.
  Everything else is in the tooltip and the table.
- **Tooltip on hover and keyboard focus, with zero JavaScript.** Each column is an `<a>` to
  `/game/[id]`; the tooltip is a sibling `<span>` revealed by CSS `:hover` / `:focus-visible`
  on the wrapper. It never gates a value. **[R-18]**
- **A `▸ Show as table` `<details>` sits immediately below** holding the same numbers as a
  real `<table>`. This is the relief channel and it is always present, never a fallback.
- Ties render as a 2px tick on the zero rule. **Forfeits are excluded entirely** (they have
  no goal margin), and the caption says so.

### 5.8 Build-time recap cleanup

The recap is auto-generated, not editorial, so it gets no prominence: 13px `--sx-text-2`,
clamped to 2 lines, below the hairline, and suppressed entirely in dense team-page tables.
Three deterministic strips at build (`data-dense`):

1. Leading `"On 9/24, "` — the date is already the group header, and it costs one of the two
   lines a phone has.
2. `"(CA)"`.
3. `"the <School> varsity field hockey team"` → `"<School>"`.

Because the sentence restates the score, the recap is never the only place a score appears,
and its absence is never an empty state.

---

## 6. Data-viz decisions

### 6.1 Form: what is a table, what is a tile, what is a chart

Per the form heuristic, the answer is *usually not a chart*, and on this site it almost never
is.

| Thing | Form | Why |
|---|---|---|
| League standings | **Table** — 4 visual columns on phone in 2 lines, 13 on desktop | Eight teams × ten measures. "More than ~7 classes that all carry meaning → a table." A chart of this is a worse table. |
| Record, GF/GA, streak, goals per game | **StatTile row** | "A handful of headline numbers → a KPI row of stat tiles." A grouped bar chart of a team's own five numbers is the textbook mistake. |
| The team-page record | **One `text-figure` value** per tile, max one at the top of the clamp per view | The single number a page leads with. |
| Last night's results | **Rows** | Scores are text. There is no magnitude question. |
| Form (last 5) | **Chip strip with letters** | Five ordered categorical states, each carrying a letter. A micro-table, not a chart. |
| **Goal differential** | **Diverging bar column, hueless ink** ✅ | Polarity against a baseline, one row per team, one scale per table. Comparing sixteen signed integers down a column is slow; comparing bar lengths is instant. |
| **Margin by game** | **Diverging column micro-chart, hueless ink** ✅ | The one genuine change-over-time question a parent asks: "are the losses getting closer?" One series, signed, ≤14 points. |
| SCVAL's share of the CCS field | **Meter** | "A single ratio against a limit → a meter." `7 / 16` printed, accent fill on an accent-wash track. Not a pie of two slices. |
| Playoff projection | **Table with written status words** | A categorical outcome per team, and we have no probability model. |
| Playoff bracket | **CSS-grid tree** | A diagram, not a chart. |

**Two charts ship. That is the entire data-viz surface area.**

### 6.2 Rejected charts, and why

- **Standings position over time (bump chart).** Eight lines that cross constantly. Crossing
  lines are an all-pairs form in practice, and the documented all-pairs cap is **three**
  series. Eight cannot be fixed by re-ordering or re-stepping; the answer is fewer series or
  facets, and neither tells the story. Cut.
- **Goals for vs goals against, two axes.** A dual-axis chart is the #1 charting mistake —
  the alignment of two scales invents a correlation. Even on one axis (both are goals) a
  two-line chart of a 5-game sample is noise. Both numbers are already stat tiles and their
  difference is the GD bar. **Explicitly banned by the brief.** Cut.
- **Scatter of GF vs GA, one dot per team.** Scatter is an all-pairs form: 16 teams need 16
  distinguishable hues against a cap of three. Cut.
- **Pie/donut of home vs away.** A 2-slice pie is a stat tile with extra steps. Rendered as
  `Home 0-3-0 · Away 0-2-0 · Neutral 0-0-0`. Cut.
- **Heatmap of the 8×8 division round-robin.** Genuinely a grid-magnitude problem, but a
  parent on a sideline does not have an 8×8 question and each cell would be 40px at 390px.
  Reconsider as a desktop-only extra *after* launch; never phone. Cut for v1. **[R-11]**
- **Any sparkline in a stat tile.** A 14-game season has no trend shape worth 12 points, and
  `MarginStrip` covers it honestly. `data-dense` argued this and then shipped one anyway;
  we don't. **[R-13]**
- **Playoff-berth probability bars.** *Nothing.* We have no probability model. A bar chart of
  invented percentages is the worst anti-pattern on this list. The `BerthMeter` shows the one
  real ratio (`7 / 16`) and the projection table shows ordered **words**.
- **Remaining-schedule-strength bars, and a `PTS` 3-1-0 column.** Coach tools, and the PTS
  column is not an SCVAL standing. Cut. **[R-11]**

### 6.3 Why the GD bar is ink — the validator says so

If the GD column had its own diverging pair (as `data-dense` shipped), the standings row
would carry four hues at once: GD-positive, GD-negative, win and loss. Run on the actual
on-screen set:

```
$ node validate_palette.js "#2a78d6,#e34948,#036a34,#df6860" --mode light --surface "#ffffff" --pairs all
Palette (light, surface #ffffff, categorical): 4 slots
  [PASS] Lightness band         all 4 inside L 0.43–0.77
  [PASS] Chroma floor           all 4 >= 0.1
  [FAIL] CVD separation         worst all-pairs #df6860↔#e34948 ΔE 3.8 (deutan) · tritan 6.0
  [FAIL] Normal-vision floor    worst all-pairs #df6860↔#e34948 ΔE 5.5 (normal) — below 15
  [PASS] Contrast vs surface    all 4 >= 3:1
  → FAILED — fix the marked checks                                              exit=1
```

Two different reds meaning two different things, five and a half ΔE apart, in a 60px row. The
same test on `data-dense`'s exact shipped row reproduces the judges' figures verbatim:

```
$ node validate_palette.js "#2a78d6,#e34948,#0ca30c,#d03b3b" --mode light --surface "#ffffff" --pairs all
  [FAIL] CVD separation         worst all-pairs #0ca30c↔#e34948 ΔE 2.5 (deutan) · tritan 4.7
  [FAIL] Normal-vision floor    worst all-pairs #d03b3b↔#e34948 ΔE 4.8 (normal) — below 15
  → FAILED                                                                      exit=1

$ node validate_palette.js "#3987e5,#e66767,#0ca30c,#d03b3b" --mode dark --surface "#14171b" --pairs all
  [FAIL] CVD separation         worst all-pairs #d03b3b↔#0ca30c ΔE 4.1 (deutan) · tritan 5.1
  [FAIL] Normal-vision floor    worst all-pairs #d03b3b↔#e66767 ΔE 9.9 (normal) — below 15
  → FAILED                                                                      exit=1
```

There is no re-stepping that fixes this, because the *roles* collide, not the hexes: a
quantity and a state cannot share a hue family in one visual field. **An ink bar removes the
hues rather than negotiating with them**, and it is the only GD encoding that is correct in
`forced-colors: active` with no fallback path.

### 6.4 Why divisions have no hue  **[R-15]**

`editorial` shipped a De Anza / El Camino categorical pair alongside its status hues and never
validated the combination. Run:

```
$ node validate_palette.js "#2a78d6,#eb6834,#036a34,#df6860" --mode light --surface "#ffffff" --pairs all
  [FAIL] CVD separation         worst all-pairs #df6860↔#eb6834 ΔE 5.0 (deutan) · tritan 2.4
  [FAIL] Normal-vision floor    worst all-pairs #df6860↔#eb6834 ΔE 5.0 (normal) — below 15
  → FAILED                                                                      exit=1

$ node validate_palette.js "#3987e5,#d95926,#179765,#e9523f" --mode dark --surface "#14171b" --pairs all
  [FAIL] CVD separation         worst all-pairs #e9523f↔#d95926 ΔE 2.3 (deutan) · tritan 3.1
  [FAIL] Normal-vision floor    worst all-pairs #e9523f↔#d95926 ΔE 4.0 (normal) — below 15
  → FAILED                                                                      exit=1
```

Division orange and loss coral are **4.0 ΔE apart in dark mode** and they coexist in any mixed
schedule list. `data-dense` caught this and removed orange; we go one step further and remove
the *channel*: the two divisions live in separate tables under separate kickers, are named in
text everywhere they appear, and need no color at all. **The site has no categorical palette.**
That is the cheapest possible resolution and it is also the correct one — division is an
identity the reader already has from the heading.

### 6.5 W / L / T without color-only meaning

Every result carries **four** redundant encodings, in this priority order:

1. **A letter** — `W`, `L`, `T` inside the chip. The primary channel. It survives grayscale,
   CVD, `forced-colors`, and a screenshot pasted into a group text.
2. **A written label** — `FINAL`, `SCORE NOT REPORTED`, `CANCELLED`, `LIVE`, spelled out in
   `text-kicker`, never abbreviated to a dot.
3. **Weight and lightness on the number itself** — the winner's score is 600 weight in
   `--sx-text`, the loser's 400 in `--sx-text-2`. Who won survives *total* desaturation with
   no chip at all (`editorial`'s fourth channel, folded into `GameRow`). **[R-19]**
4. **Hue** — win green, loss coral, tie neutral gray. The *last* channel, and the only
   optional one.

Plus `aria-label` on every chip and a sentence-form `aria-label` on every strip and score.
**There is no state anywhere on this site whose only difference is color**, and §10.9 makes
that a CI gate rather than a claim.

**Tie is deliberately hueless.** A tie is the "nothing happened either way" state, and a
neutral gray is exactly the diverging midpoint the rules ask for. It also removes the third
hue that would otherwise have to survive CVD beside green and coral. One decision satisfying
two rules.

**`ResultChip` has one visual treatment, not two.** Wash ground + 1px ring at the mark hue +
letter in the ink token. There is no `solid` variant, so the raw `--sx-loss` mark never
becomes a load-bearing fill under a letter. `editorial` claimed fill-vs-outline as a redundant
channel, but its `W` and `T` were both solid, so the channel distinguished only `L`; that
oversold channel is dropped in favour of the honest one (#3 above). **[R-20]**

### 6.6 Palette validation — the final runs

Surfaces validated: light card `#ffffff`, light plane `#f6f7f8`, light subtle plane `#f2f4f6`;
dark card `#14171b`, dark plane `#0b0d10`, dark subtle planes `#1c2026` and `#252a31`.
**`--pairs all` throughout**, because a `W` chip, an `L` chip and an accent `LIVE` pill can all
sit in the same visible list — the adjacent-only pairlist would hide a real collapse.

The complete on-screen hue set is **three slots**: win, loss, accent. There is nothing else.
The GD/margin bars are one ink, ties are gray, divisions have no hue, and school colors are
never an encoding.

#### ✅ The result pair, both modes, all four page planes

```
$ node validate_palette.js "#036a34,#df6860" --mode light --surface "#ffffff" --pairs all
Palette (light, surface #ffffff, categorical): 2 slots
  [PASS] Lightness band         all 2 inside L 0.43–0.77
  [PASS] Chroma floor           all 2 >= 0.1
  [PASS] CVD separation         worst all-pairs #df6860↔#036a34 ΔE 10.4 (protan) · tritan 34.0
  [PASS] Normal-vision floor    worst all-pairs #df6860↔#036a34 ΔE 31.3 (normal)
  [PASS] Contrast vs surface    all 2 >= 3:1
  → ALL CHECKS PASS                                                             exit=0

$ node validate_palette.js "#036a34,#df6860" --mode light --surface "#f6f7f8" --pairs all
  … identical figures …                          → ALL CHECKS PASS              exit=0

$ node validate_palette.js "#179765,#e9523f" --mode dark --surface "#14171b" --pairs all
Palette (dark, surface #14171b, categorical): 2 slots
  [PASS] Lightness band         all 2 inside L 0.48–0.67
  [PASS] Chroma floor           all 2 >= 0.1
  [PASS] CVD separation         worst all-pairs #e9523f↔#179765 ΔE 9.0 (protan) · tritan 34.8
  [PASS] Normal-vision floor    worst all-pairs #e9523f↔#179765 ΔE 29.4 (normal)
  [PASS] Contrast vs surface    all 2 >= 3:1
  → ALL CHECKS PASS                                                             exit=0

$ node validate_palette.js "#179765,#e9523f" --mode dark --surface "#0b0d10" --pairs all
  … identical figures …                          → ALL CHECKS PASS              exit=0
```

#### ✅ The full on-screen set — win + loss + accent, every plane it renders on

```
$ node validate_palette.js "#036a34,#df6860,#1558b0" --mode light --surface "#ffffff" --pairs all
Palette (light, surface #ffffff, categorical): 3 slots
  [PASS] Lightness band         all 3 inside L 0.43–0.77
  [PASS] Chroma floor           all 3 >= 0.1
  [PASS] CVD separation         worst all-pairs #df6860↔#036a34 ΔE 10.4 (protan) · tritan 4.8
  [PASS] Normal-vision floor    worst all-pairs #1558b0↔#036a34 ΔE 22.0 (normal)
  [PASS] Contrast vs surface    all 3 >= 3:1
  → ALL CHECKS PASS                                                             exit=0

$ node validate_palette.js "#036a34,#df6860,#1558b0" --mode light --surface "#f6f7f8" --pairs all
  → ALL CHECKS PASS   (same ΔE figures; contrast all ≥ 3:1)                      exit=0

$ node validate_palette.js "#036a34,#df6860,#1558b0" --mode light --surface "#f2f4f6" --pairs all
Palette (light, surface #f2f4f6, categorical): 3 slots
  [PASS] Lightness band · [PASS] Chroma floor
  [PASS] CVD separation         worst all-pairs #df6860↔#036a34 ΔE 10.4 (protan) · tritan 4.8
  [PASS] Normal-vision floor    worst all-pairs #1558b0↔#036a34 ΔE 22.0 (normal)
  [PASS] Contrast vs surface    all 3 >= 3:1        ← loss = 3.03 on the hover plane
  → ALL CHECKS PASS                                                             exit=0

$ node validate_palette.js "#179765,#e9523f,#4f95ee" --mode dark --surface "#14171b" --pairs all
Palette (dark, surface #14171b, categorical): 3 slots
  [PASS] Lightness band         all 3 inside L 0.48–0.67
  [PASS] Chroma floor           all 3 >= 0.1
  [PASS] CVD separation         worst all-pairs #e9523f↔#179765 ΔE 9.0 (protan) · tritan 7.6
  [PASS] Normal-vision floor    worst all-pairs #4f95ee↔#179765 ΔE 21.8 (normal)
  [PASS] Contrast vs surface    all 3 >= 3:1
  → ALL CHECKS PASS                                                             exit=0

$ node validate_palette.js "#179765,#e9523f,#4f95ee" --mode dark --surface "#0b0d10" --pairs all
  → ALL CHECKS PASS                                                             exit=0
$ node validate_palette.js "#179765,#e9523f,#4f95ee" --mode dark --surface "#1c2026" --pairs all
  → ALL CHECKS PASS                                                             exit=0
$ node validate_palette.js "#179765,#e9523f,#4f95ee" --mode dark --surface "#252a31" --pairs all
  → ALL CHECKS PASS                                                             exit=0
```

**Seven planes, two modes, all-pairs, zero failures.** The one honest caveat: the *reported*
tritan figures are low — 4.8 light and 7.6 dark on win↔loss. Tritanopia is rare and the
validator does not gate on it, but this is precisely why the letter is channel 1, the written
label is channel 2, and the winner's weight is channel 3. Under tritan simulation the green
and the coral converge and a `W` still reads as a `W`. No design change; a reason the design
is already right.

#### ❌ Rejected — a third status hue for LIVE

```
$ node validate_palette.js "#036a34,#df6860,#a5730a" --mode light --surface "#ffffff" --pairs all
  [WARN] CVD separation         worst all-pairs #a5730a↔#df6860 ΔE 7.7 (protan) · tritan 11.5
  [FAIL] Normal-vision floor    worst all-pairs #a5730a↔#df6860 ΔE 13.9 (normal) — below 15
  → FAILED                                                                      exit=1

$ node validate_palette.js "#179765,#e9523f,#f0a72a" --mode dark --surface "#14171b" --pairs all
  [FAIL] Lightness band         outside band: [["#f0a72a",0.78]]
  → FAILED                                                                      exit=1
```

The normal-vision floor is a hard gate that secondary encoding does not excuse, and in dark
mode the 0.48–0.67 band forbids a bright gold outright. Every amber that *did* pass a grid
search came out a light-mode olive (`#928a07`) or a dark-mode brown at 3.05:1 (`#8d5901`) —
legal and ugly. **So the amber slot was deleted rather than tolerated**, and `LIVE` moved to
the accent + a pulsing dot + the word. `editorial` shipped `#fab219` here anyway; a passing
alternative existed and this is it.

#### ❌ Rejected — the documented status scale as-is

For the record, the reference `good / critical / warning` steps do not clear this product's
bar, which is why a product-specific instance was derived:

```
$ node validate_palette.js "#0ca30c,#d03b3b,#fab219" --mode light --surface "#ffffff"
  [FAIL] Lightness band         outside band: [["#fab219",0.811]]
  [FAIL] CVD separation         worst adjacent #d03b3b↔#0ca30c ΔE 4.1 (deutan) · tritan 24.4
  [WARN] Contrast vs surface    below 3:1 — relief required: [["#fab219",1.83]]
  → FAILED                                                                      exit=1
```

`ΔE 4.1` between good and critical is the classic red/green collapse. The shipped pair gets
**10.4 light / 9.0 dark** by spreading the two hues apart in *lightness* as well as hue —
which is also why win reads as a deep forest green and loss as a lighter coral, and why
darkening the coral for extra contrast is not available (a test at `#d6564e` clears 3:1 on
every plane but collapses CVD separation from 10.4 to **5.5**, `exit=1`; the lightness spread
*is* the CVD margin).

#### Not run through the categorical validator, on purpose

- **Ink, surface and structure tokens.** These are not a categorical palette. Checked with
  WCAG text contrast instead — the full matrix is §4.1, weakest pair `--sx-text-3` on
  `--sx-surface-3` at 4.66 light / 5.11 dark, both AA.
- **Chip inks on their own washes.** Text-on-fill pairs: weakest is loss ink on loss wash at
  **5.80 light / 6.88 dark**. All AA.
- **`--sx-bar`.** A single gray ink; it sits below the chroma floor *by design* and running
  the categorical validator on it would FAIL for the wrong reason. Checked as WCAG contrast:
  **7.69 light / 8.55 dark** on the card, 6.31 / 6.87 on the chrome plane — far past the 3:1
  mark floor everywhere it renders.
- **The GD diverging scale.** Two arms of one ink plus a neutral gray midpoint — there is no
  multi-step ramp, so there is no lightness monotonicity to validate.
- **The `BerthMeter` track.** One ratio, accent fill on accent-wash track; fill-to-track
  contrast measured at **5.19 light / 4.38 dark**, and `7 / 16` is printed, so the value is
  never carried by the fill alone.
- **No ordinal ramp is defined.** `data-dense` built a 4-step blue ordinal ramp for berth
  tiers, which passed `--ordinal` but made one hex mean three things (link accent, positive
  differential, "likely" tier) — a collision both judges flagged. Our berth statuses are
  **written words** with a 2px rule after the 7th berth, so the ramp is unnecessary and is
  not shipped. **[R-21]**
- **School colors.** Not a palette — 16 uncontrolled brand hues, never used as an encoding.
  `TeamMonogram` enforces per-school letter contrast at build time (§7.1).

### 6.7 Interaction layer

- **GD bar:** the whole 60px standings row is the hit target and links to the team page.
  Focus shows the same outline as hover. No tooltip — the numeral is printed beside the bar.
- **MarginStrip:** each column is an `<a>` to `/game/[id]` with a ≥30px hit area; hover and
  `:focus-visible` reveal a CSS-only tooltip with date, opponent, H/A/N, score, margin and
  league flag. **The tooltip never gates a value** — the `<details>` table twin is directly
  below.
- **Filters:** one row, above everything they scope, on `/schedule` only. Never per-card,
  never per-section. Re-filtering never repaints a mark, because color follows the entity's
  *state*, not its row number.
- **Refetch:** there is none. The page is static; a new snapshot is a new deploy. A re-filter
  holds the previous list at `opacity: .6` — no skeleton flash, no layout jump.

---

## 7. Component inventory

Everything is a **Server Component** unless marked **`'use client'`**. There are **four**
client modules in the whole app, counted honestly: `ThemeToggle`, `PinControl`, `MyTeamCard`
(which *imports* `PinControl` — one module, not two) and `ScheduleFilters`.
`phone-first` claimed six and listed a softer set; two of those are deleted outright — the
`DivisionTabs` scroll-spy (anchor tabs don't need one) and the `MarginStrip` tooltip (CSS
`:hover` / `:focus-visible` does it). **[R-18]**

### 7.1 `TeamMonogram`

```ts
interface TeamMonogramProps {
  team: Pick<Team, 'abbr' | 'name' | 'colors'>;
  size?: 20 | 24 | 40 | 56;        // 24 = table row, 40 = teams tile, 56 = team page
  decorative?: boolean;            // default true → aria-hidden when the name is adjacent
}
```

A rounded square (`--radius-tag` at 20, `--radius-chip` above) filled with the school's
**primary** color, carrying the 2-letter `abbr` in `colors.onPrimary` at 600 weight, Sans,
sized 10 / 11 / 15 / 20px. A 1px `--sx-border` ring keeps a near-white primary from vanishing
into the surface; a 2px inset of `colors.secondary` on sizes ≥40 gives the second school color
a place to live without touching legibility.

**`colors.onPrimary` is computed by the cron, never by eye:** whichever of `#0e1116` /
`#ffffff` has higher WCAG contrast on `colors.primary`, asserted ≥ 4.5:1. If neither clears it
(a mid-value gold), the build steps the *fill*'s OKLCH L until one does, capped at 3 steps, and
records the adjustment in the snapshot so it is auditable. **No third-party image request is
ever made** — this is the whole answer to the no-hotlinking constraint, by construction. The
source's `schoolMascotUrl` is read and discarded, and `/about#sources` says so in one sentence.

### 7.2 `SectionHeader` — the rule-and-kicker  **[R-9]**

```ts
interface SectionHeaderProps {
  kicker: string;                  // "LATEST SCORES" — uppercased by CSS, passed sentence-free
  meta?: string;                   // "Thu Sep 24" — sits right of the kicker, --sx-text-3
  action?: { href: string; label: string };   // right-aligned link
  as?: 'h2' | 'h3';                // default h2
}
```

A 1px hairline with the 11px/600/`+0.10em` mono kicker sitting on it, the optional meta beside
it, and the action link pushed right. Ten lines of CSS (`.sx-kicker` in §4.2) and it opens
every section on every page. This is the entire brand.

### 7.3 `StandingsTable`

```ts
type StandingsVariant = 'phone' | 'desktop' | 'mini' | 'archive';
interface StandingsTableProps {
  division: Division;
  rows: StandingsRow[];            // already sorted & ranked by lib/standings.ts
  gdDomain: number;                // max |gd| for THIS division — never global
  variant: StandingsVariant;       // phone 2-line, desktop 13-col, mini top-4, archive final
  caption: string;                 // "De Anza Division league standings through Sep 24"
  berthRuleAfter?: number;         // draw a 2px rule after row N (the 7th auto berth)
  footnotes?: string[];            // rendered under the table, 13px --sx-text-3
}
interface StandingsRow {
  rank: number | null;             // null when hasReportedResults === false
  team: Team;
  league: Record3; overall: Record3;
  pct: number | null;
  gf: number | null; ga: number | null; gd: number | null;
  home: Record3; away: Record3; neutral: Record3;
  streak: Team['streak'];
  form: FormEntry[];               // last 5 LEAGUE results, oldest first
  note?: string;                   // "no results reported yet"
  flags: { forfeitAffectsGoals?: boolean; maxprepsMismatch?: CrossCheckEntry };
}
```

A real `<table>` with `<caption>` (visually hidden on phone, shown on desktop as the
"through …" line), `<thead>` with `scope="col"`, and the team cell as `<th scope="row">`.
`variant="phone"` renders the two-line 60px row of §3.2; the values it omits live on the team
page, never behind a tooltip. Header is `position: sticky` under the anchor tabs; its cells
hold nothing focusable, so they carry no focus ring of their own.

**No client-side sorting.** `data-dense` shipped a `SortableTableHead`; the table has one
correct order (league win pct desc, §11.7) and re-sorting it is a coach's affordance that
costs a client component and a whole `aria-sort` surface. Desktop readers who want another
order have `/teams/[slug]`.

A row with `hasReportedResults === false` renders **last** in the division, `rank` as `—`,
every numeric cell as `—`, `gd` as a `·` on the zero rule, and its `note` on line 2. It is
**never `0-0-0`, never `.000`, never rank 8 by merit** — and it is still a link.
`flags.maxprepsMismatch` puts a `⚑` on the row and the full sentence in a footnote with the
deep link.

### 7.4 `GameRow` / `GameCard` / `ScoreBoard`

```ts
interface GameViewProps {
  game: Game;
  perspective?: TeamSlug;          // orients "vs / at" and the W/L/T from this team's side
  density: 'row' | 'card' | 'line';// phone list / desktop grid / one-line "next up"
  showDate?: boolean;
  showRecap?: boolean;             // default true on /schedule and /, false in dense tables
  defaultExpanded?: boolean;
}
interface ScoreGlyphProps { side: SideView; size?: 'score' | 'board' | 'meta' }  // one side of describeGame(); the never-0-0 rule itself lives in renderScore (§5.2)
interface ScoreBoardProps { game: Game }   // the /game/[id] hero
```

`GameRow` is a two-line stack — **away team on top, home team below** — each line
`[chip] [monogram] [name] … [score]`. The score column is mono/tabular so scores align down
the list; the winner's number is 600 weight in `--sx-text` and the loser's 400 in
`--sx-text-2`. The status label sits right of the home score in `text-kicker`.

The row is a `<details>` / `<summary>` pair, so **expand works with zero JavaScript**. Venue
address, stream, tickets, box score and the `/game/[id]` link live in the panel, so 174 venue
addresses never enter the initial payload of any list page. On desktop the same data renders
as a `GameCard` in a 3-up grid (2-up at 768px, `GameRow` below) with the recap and venue always
visible and nothing to expand.

Deciders render as **mono superscript tags** after the score: `2–2 ᴼᵀ`, `1–1 (4–3 ˢᴼ)`,
`1–0 ᶠ` (`editorial`). Every score pair carries an `aria-label` sentence: *"Saint Francis 7,
Homestead 0, final"*, *"Mitty versus Presentation, score not reported"*, *"Wilcox at Valley
Christian, cancelled"*.

### 7.5 `ResultChip`

```ts
interface ResultChipProps {
  kind: Outcome | 'pending' | 'cancelled' | 'postponed';
  size?: 16 | 20 | 24;             // 20 = standings form strip, 24 = game row
}
```

A square with the **letter inside** — `W`, `L`, `T`, an empty outline for `pending`, `⊘` for
cancelled, `↻` for postponed. Wash ground, 1px ring at the mark hue, glyph in the ink token
(5.80–8.28:1 everywhere, §4.1). **One treatment only** — no `solid` variant (§6.5).
`aria-label` is `"Win"` / `"Loss"` / `"Tie"` / `"Score not reported"` / `"Cancelled"` /
`"Postponed"`. No `title` attribute — touch devices never see it. The `⊘` and `↻` glyphs are
`aria-hidden` with the written label beside them.

### 7.6 `FormStrip`

```ts
interface FormStripProps {
  entries: FormEntry[];            // oldest → newest, league only, max 5
  size?: 20 | 24;                  // 20 in tables, cards and the game page; 24 on the team page
  label: string;                   // "Homestead last 5 league games"
}
interface FormEntry {
  outcome: Outcome; contestId?: string; opponent?: string;
  score?: string; date?: string;   // contestId links the chip; standings strips pass outcomes only (toFormEntries)
}
```

Row of `ResultChip`s with a **2px surface gap** between them. Newest gets a 2px `--sx-text`
underline + visually-hidden "most recent". Each chip with a `contestId` links to `/game/[id]` with
`aria-label="Loss 0-7 vs Saint Francis, Sep 24"`. One sentence `aria-label` on the strip.
Rules for zero/partial/skipped games are in §5.5. The direction caption and the `+ N non-league`
caption are rendered by the page around the strip, not by the strip: the team page puts the
direction in its Form heading and the count of other games on a line of its own.

### 7.7 `StatTile`

```ts
interface StatTileProps {
  label: string;                   // sentence case or mono caps; no trailing colon
  value: string | number | null;   // null → "—", and the tile keeps its full height
  sub?: string;                    // "league games only", "7th of 8"
  emphasis?: 'default' | 'hero';   // 'hero' = top of the text-figure clamp, ONE per view
  srLabel?: string;                // spoken in place of label: "L5" → "5 losses in a row"
  srValue?: string;                // spoken in place of value: "0 / 52" → "0 for, 52 against"
  className?: string;
}
```

Each tile is an `.sx-card` holding one `<dl>` group: the `<dt>` label in `text-meta`
`--sx-text-3`, then the `<dd>` value in `.sx-figure` (Sans, **proportional** figures), then an
optional `<dd>` `sub` in `text-meta` `--sx-text-2` (a step smaller below 768px). The row is
2-up below 768px and 4-up above. **No sparkline** (§6.2). `null` renders `—` and the
tile reserves its footprint so the row never reflows.

### 7.8 `GoalDiffBar`

```ts
interface GoalDiffBarProps {
  value: number | null;            // null → a `·` on the zero rule, "—" in the numeral slot
  domain: number;                  // max |gd| for THIS division
  track?: 56 | 64;                 // phone and mini 56px (28 per arm), desktop 64px (the default)
  thickness?: 8 | 10;
}
```

Two `<div>`s either side of a 1px `--sx-zero` rule, both filled `--sx-bar`. Width is
`|value| / domain` of the arm. 4px rounded outer data-end, square at the baseline, no stroke.
`aria-hidden` — the signed numeral in the adjacent cell is the accessible value. §5.6.

### 7.9 `MarginStrip`

```ts
interface MarginStripProps {
  team: Team;
  games: Game[];                   // chronological, league only, played + remaining
  slots?: number;                  // default 14 — the full league season
  height?: 128 | 200;              // phone / desktop, INCLUDING the axis band
}
```

Inline SVG (the one SVG on the site), or plain flex `<div>`s — either is acceptable; the spec
constrains geometry, not markup. Columns 18px/2px gap phone, 24px/4px desktop. Non-league is
never in this chart. Unplayed slots are a `?` tick. `H`/`A`/`N` glyph row under the axis.
Exactly three direct labels. CSS-only tooltip. `<details>` table twin below. §5.7.

### 7.10 `BerthMeter`

```ts
interface BerthMeterProps { claimed: 7; total: 16; label: string }
```

8px tall, `--sx-accent` fill on an `--sx-accent-wash` track (a lighter step of the same hue, so
state reads across the whole bar), 4px rounded fill end, `7 / 16` printed at the right,
`role="img"` with the full sentence *"7 of 16 CCS berths are automatic to SCVAL"* as
`aria-label`. One ratio against a limit → a meter, not a pie, not a bar chart.

### 7.11 `PlayoffBracket` / `PlayoffProjection`

```ts
interface PlayoffBracketProps {
  division: 'I' | 'II';
  rounds: BracketRound[];
}
interface BracketRound { name: 'Quarterfinals' | 'Semifinals' | 'Final';
                         date: string; games: BracketGame[] }
type BracketGame = Game & { seeds: { home: number | null; away: number | null } };

interface PlayoffProjectionProps {
  rows: { team: Team; league: Record3; standing: number;
          status: 'auto' | 'last-auto' | 'bubble' | 'out' | 'unranked';
          note: string }[];        // note is the WRITTEN status, e.g. "In · auto berth"
  autoBerths: 7; totalBerths: 16; seedingDate: string; asOf: string;
}
```

Desktop bracket = a 3-column CSS grid; connectors are `::before` / `::after` elbows made of 1px
borders. **No SVG, no library, no absolute positioning.** Phone = the same `rounds` array as
stacked `GameRow` groups under round kickers. Unplayed slots read `TBD`, never a blank box;
seeds always show, because a seed is information before a score. The winner's row gets 600
weight **and** a 2px `--sx-text` left rule, never color alone.

Every projection status is a **written word**; the 2px rule after row 7 is the redundant cue.
There are **no percentages anywhere**, because there is no model — and the card is always
capped by *"Berths are assigned by the CCS committee. Nothing here is official until Nov 2."*

### 7.12 `MyTeamCard` + `PinControl` — **`'use client'`**

```ts
interface MyTeamCardProps { teams: TeamSnapshot[] }   // all 16, pre-serialized by the server
interface PinControlProps {
  slug: TeamSlug; leagueId: LeagueId; label: string;   // label: pinLabel(), 'Pin Leigh, Mt. Hamilton · BVAL'
  knownSlugs?: readonly TeamSlug[];                    // a pin outside the snapshot is cleared
}
type TeamSnapshot = {
  team: Team; last: Game | null; next: Game | null; form: FormEntry[]; rank: number | null;
};
```

`localStorage['scvalfh.pinnedTeam']`. **Every read and write is in `try/catch`**, and the
component renders the `PinPrompt` fallback when storage is unavailable, empty, or holds a slug
that is no longer in the snapshot (in which case it clears storage and says *"That team is no
longer in the data."*). **No layout shift:** the card's height is reserved server-side at 240px
(88px for `PinPrompt`) and content swaps after mount. The UI states plainly that the pin lives
in this browser only.

### 7.13 `ScheduleFilters` — **`'use client'`**

```ts
interface ScheduleFiltersProps {
  teams: Team[];
  initial: FilterState;            // parsed from the URL on mount, inside <Suspense>
  counts: { total: number; final: number; upcoming: number; cancelled: number };
}
interface FilterState {
  team: TeamSlug | 'all';
  division: Division | 'all';
  type: 'all' | 'league' | 'non-league';
  state: 'all' | 'final' | 'upcoming';
}
```

Reads `useSearchParams()` and writes with `router.replace(href, { scroll: false })`, wrapped in
`<Suspense>` so everything above it prerenders. Verified in this repo:
`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md:181` —
"During production builds, a static page that calls `useSearchParams` from a Client Component
**must be wrapped in a `Suspense` boundary**, otherwise the build fails." One filter row above
everything it scopes. `team` is a native `<select>` (16 options; a custom listbox is worse on
every phone); the rest are pill groups. Live count via `aria-live="polite"`. Active filters
echo as removable mono chips. Zero results is a designed state (§8).

### 7.14 `ThemeToggle` — **`'use client'`**

```ts
interface ThemeToggleProps {
  className?: string;
}
```

Three states — **System / Light / Dark** — cycled by one 44×44 button whose `aria-label` names
*the next* state and whose visible glyph plus a visually-hidden word names the *current* one.
Writes `data-theme` on `<html>` and mirrors to `localStorage['scvalfh.theme']`, both in
`try/catch`. A ~380-byte blocking inline script in `layout.tsx` stamps the attribute before
first paint, so there is no flash and no CLS; `color-scheme` on `:root` keeps form controls and
scrollbars in step.

### 7.15 `Attribution`

```ts
interface AttributionProps {
  snapshotAt: string;              // ISO instant
  now?: string;                    // the instant staleness is measured against (the build)
}
```

Always visible, never a tooltip, on **every** page: **"Data from MaxPreps and High School on SI
(si.com)"**, each name a real link to the source. The footer is rendered once, by the root
layout, so it carries only the global attribution and takes no per-page props: the *team's* and
*game's* own source pages are deep-linked on the rows themselves, in `GameSources` on
`/game/[id]` and on the team page, and `/history/2025-26`'s `scval.com` credit sits in that
page's body (§3.9). Plus the snapshot timestamp in Pacific, a link to `/about`, and the
not-affiliated line. The footer OPENS with the corrections call-out: a raised card across both
columns, **"See something missing?"** and an accent pill, **"Report a data error ↗"**, to the
forum's Data errors thread (`DATA_CORRECTIONS_URL`). The team page's Elsewhere row ends with the
same pill, beside the sources a reader checks a score or roster entry against. The top bar
carries it too (`SiteHeader`): from 1120px (70rem) a ringed **"Report an error ↗"** pill beside
the stamp; below that a second, non-sticky line under the bar, **"See something missing? Report
a data error ↗"**, that scrolls away with the page, so the sticky stack stays the 48/64px bar.
Never in the phone tab bar (navigation only). `text-meta` `--sx-text-2` (7.69 / 8.55 — well past
AA).

**Stale-snapshot treatment** (`editorial`): at > 36h the footer stamp switches to `--sx-text`
body ink on `--sx-accent-wash` and reads **"Not updated since Oct 2, so newer scores may be
missing. Why?"**, the *Why?* linking to `/about#updates`; the top bar's compact stamp becomes a
single pill link, **"Updated 2 days ago"**, to the same place. Neither appears once
`getSitePhase() === 'complete'`: the scheduled update stops on purpose then, and the footer reads
*"Season complete — final update <date>."* in quiet grey. Never hide a failure behind a
timestamp nobody reads.

### 7.16 Small shared pieces

`Tag` (`NL` `OT` `SO` `F` — mono 11px, 4px radius, `--sx-surface-3` fill) · `StatusChip`
(Tag's sentence-case sibling for a postseason status phrase, accent only for an automatic
qualifier) ·
`StatusLabel` · `DateHeader` (sticky, `text-kicker`, with a `Day page` link, `dayHref`, to `/scores/[date]`) ·
`TimelineRail` (anchor links to date-group ids) · `DivisionTabs` (plain `<a href="#de-anza">`
anchors, 44px, `scroll-margin-top` equal to the sticky stack; **no scroll-spy**) ·
`LeagueJumpLinks` (the "Jump to <league>" pills on `/standings`, `/schedule` and `/playoffs`,
each shown before paint only for the remembered league by the league-scope stylesheet) ·
`EmptyState` · `ExternalLink` (adds `↗`, `rel="noopener"`, and a visually-hidden "opens in a
new tab") · `MissingValue` (an aria-hidden `—` plus visually hidden words such as "not recorded",
§5.3) · `PlaceMark` (a team's place in the two notations, `T7` in a table and `T-7th` in a pill
or tile, with an sr-only "tied for 7th", or a dash and "not ranked" before any result; lib/format's
`placeMark` / `placeWords` are the same notation as strings) · `Arrow` (a link's direction arrow, `→` `←` `↑` `↓`, aria-hidden so the link's name is its
words alone; never baked into a data string) · `OverviewDivisionBlock` (one division of the
/standings and /teams overviews: its h4, its `CompactStandingsTable` and its `Full <division>
table →` link, §18.1) · `BottomTabBar` · `TopNav` · `LastUpdated` (`<time dateTime>`, formatted
server-side in `America/Los_Angeles` so it never hydration-mismatches).

---

## 8. Empty and edge states

**The house rule** (`editorial`): *say what is true, say when it changes.* Every state below is
a designed composition, not a blank area. `EmptyState` is a heading, one sentence, and at most
one action — no illustrations, no icons, no dashed borders, and **never a greyed-out skeleton**,
because a skeleton reads as real data.

| State | Where | What renders |
|---|---|---|
| **Preseason** (before Aug 21) | `/`, `/standings` | Home leads with a `PreseasonCard`: *"The season starts Fri Aug 21. League play begins Wed Sep 9."* Standings render **all 16 rows**, every record `0-0-0`, every GD a `·` on the zero rule, sorted alphabetically with rank `—` and the caption *"No games played yet — sorted alphabetically."* The structure is visible from day one, so a parent learns the page before it matters. "Latest scores" becomes "First games" listing Aug 21. |
| **Non-league only** (Aug 21 – Sep 8) | `/standings` | A banner above both tables: *"League play starts Wed Sep 9. These tables count league games only — the 38 non-league games played so far are on the schedule."* Tables stay in the preseason shape. This is the single most likely source of confused email, so it gets a full sentence. |
| **No results reported for the latest day** | `/`, `/scores/[date]` | The day's section still renders, every row `SCORE NOT REPORTED` with `—` scores, and a heading note: *"12 games played Thursday; no scores reported yet. Scores usually appear the next morning."* Home then **falls back to the most recent day that does have results, labelled with its date** — never silently showing stale data as if it were last night. |
| **A single cancelled game** | everywhere | §5.2: `CANCELLED`, struck-through *time* (never the names), `⊘` chip, `--sx-text-3` ink, no score cells, excluded from every total and from "games remaining". The expanded panel carries `note` when the source gives one. |
| **A whole day cancelled** (rain, air quality) | `/scores/[date]` | *"All 6 games on Oct 3 were cancelled."* Rows still listed, so the page is not empty and the URL stays shareable. |
| **A filter returning nothing** | `/schedule` | *"No contests match these filters."* plus **the active filter chips, still visible, still removable**, so the reader can see exactly what to remove. Not an empty div. |
| **Playoffs not yet seeded** | `/playoffs` | The full pre-Nov-2 layout of §3.8: `NOT SEEDED YET`, the `BerthMeter`, the three round dates as tiles, the berth math in prose, the official-bracket deep link (*"not yet posted"*), and the projection table with every status written out and a 2px rule after the 7th berth. **No bracket skeleton.** |
| **Seeded, rounds unplayed** | `/playoffs` | Real bracket with unplayed slots as `TBD` and the scheduled time/venue in each. Seeds always shown. |
| **Team with no reported results** (Wilcox) | `/standings`, `/teams/wilcox` | Standings: sorted **last**, rank `—`, every cell `—`, GD `·`, note *"no results reported yet"*, and a table footnote naming the team and saying it is in the league but absent from the source. Still a link. Team page: identity block, links and the **full schedule** all render normally; the `StatTile` row shows `—` in every tile at full height; `FormStrip` and `MarginStrip` are replaced by one `EmptyState` — *"No results reported for Wilcox. Their schedule is below, and MaxPreps may have results we haven't picked up yet ↗"*. **A team with no data still gets a complete, useful page.** |
| **A team with a genuine `0`** (Cupertino, Homestead, Monta Vista) | `/standings`, `/teams/[slug]` | `0` renders as full-strength mono `0`; the standings footnote distinguishes it from `—` in words (§5.3). `GOALS/GAME` reads `0.0`, not `—`. The `MarginStrip` renders five real columns below the zero rule; `worst loss −7` is direct-labelled. Nothing is hidden because it is unflattering. |
| **A non-SCVAL opponent** | `/schedule`, team pages | Plain text name, **no monogram fill, no link, no record**. A `TeamRef` of kind `outside` cannot fake its way into the design. |
| **Team not in the CCS field** | `/teams/[slug]` | The playoffs block reads *"Homestead is not in the CCS field"* with a link to the bracket, rather than disappearing. |
| **Pinned team removed from the snapshot** | `/`, `/teams/[slug]` | `MyTeamCard` catches the unknown slug, clears storage, renders `PinPrompt`, and says *"That team is no longer in the data."* |
| **`localStorage` unavailable** | `/`, `PinControl`, `ThemeToggle` | Every access is in `try/catch`. Pin falls back to `PinPrompt` with the button hidden; the theme toggle still works for the session and simply doesn't persist. **The page is fully correct without storage.** |
| **Snapshot stale** (> 36h) | every page | §7.15 — the footer stamp becomes body ink and reads *"Not updated since <date>, so newer scores may be missing. Why?"*; the top bar shows the pill *"Updated N days ago"*, linking to `/about#updates`. Neither shows when `getSitePhase() === 'complete'`. |
| **A standings disagreement with MaxPreps** | `/standings`, `/about#cross-check` | A `⚑` on the row and a footnote: *"Fremont: we compute 1-4-0, MaxPreps shows 2-4-0 (MaxPreps ↗). We show our computation."* §9. |

---

## 9. The cross-check log — the site's credibility mechanism

The source payload already carries `conferenceStandingPlacement`,
`conferenceWinningPercentage`, `conferenceContestsPlayed`, `streak` and `streakResult`. So the
cross-check is a **direct field comparison, not a reimplementation**: for each of the 16 teams,
compare our computed `(w, l, t, gf, ga, pct, place)` against the source's, and write every
mismatch into `snapshot.crossCheck`. ~20 lines in the build step.

- Every mismatch is **published**: a `⚑` on the standings row, a footnote under that table, and
  a full table on `/about#cross-check` with our number, theirs, and a deep link to their page.
- We always **show our own computation** and say so. Trust is built by publishing the
  disagreement, not by silently picking a side.
- The log doubles as the cron's QA tool: a spike in mismatches means the extractor drifted.
- MaxPreps ranking St. Ignatius (3-0-0, 1.000) above Saint Francis (4-1-0, .800) confirms the
  league sorts on **win percentage, not wins**, so our sort (§11.7) agrees with the source by
  construction rather than by luck.

---

## 10. Accessibility checklist

Every line is a gate, not an aspiration; §10.9 lists which ones CI enforces.

1. **Contrast — measured, not eyeballed.** The full matrix is §4.1. Body ink 18.91 / 16.43;
   secondary 7.69 / 8.55; muted **4.66 / 5.11 at its weakest plane** — AA for normal text
   everywhere, so there is no decorative gray that quietly fails. Accent 6.87 / 5.88. Chip ink
   on wash 5.80–8.28. Every mark (win, loss, tie, bar, accent) clears **3:1 on every plane it
   renders on**, with the one named exclusion in §4.1.
2. **No color-only meaning, anywhere.** Four ranked channels: **letter → written label →
   weight/lightness → hue** (§6.5). Ranked, not listed, so there is never a question which one
   is load-bearing. The GD bar's polarity is *position against a shared zero rule* and needs no
   hue at all.
3. **`forced-colors: active` works with no fallback path.** Chips become `Canvas`/`CanvasText`
   with a border; bars and the zero rule become `CanvasText`. Every meaning survives, because
   every meaning was already a letter, a word, a weight or a position.
4. **Semantics.** `StandingsTable` is a `<table>` with `<caption>`, `scope="col"`,
   `scope="row"`. Game lists are `<ol>` of `<details>`. `DivisionTabs` are **anchors, not ARIA
   tabs** — no keyboard trap to get wrong. The bracket is nested `<ol>`s that read as rounds in
   order. The bottom bar is a `<nav aria-label="Sections">` with `aria-current="page"`.
5. **Keyboard.** `:focus-visible` only, one visible style, 2px ring at 2px offset;
   inset (`-2px`) inside `.sx-flush` clipped cards so the clip can't eat it; no `<th>` is
   focusable. A skip link to
   `#main`. **DOM order matches visual order at both breakpoints** — the desktop 2-column grids
   have *phone* source order.
6. **Screen-reader sentences, not glyph soup.** `FormStrip` announces *"Last 5 league games:
   loss, loss, loss, loss, loss."* A score announces *"Saint Francis 7, Homestead 0, final."*
   `⊘` and `↻` are `aria-hidden` with the written label beside them. The em dash for a missing
   score is `aria-hidden` with the visually hidden words *"score not reported."* Bars are
   `aria-hidden`; the numeral is the value.
7. **Touch.** 44×44 minimum with **no overlapping hit areas** — the standings row is a 60px
   block-level `<a>` whose target is exactly the row (WCAG 2.5.8). Game rows 68px, chip links
   40px with 8px gaps, tab items 78×56. Bottom bar respects `env(safe-area-inset-bottom)`.
8. **Zoom & reflow — 400%, not 200%.** No horizontal page scroll at 400px **or at 320px**.
   **400% zoom at 320px reflows to one column with no loss of content and no scrollable data
   table** — which is the actual reason the phone standings table is two lines of four columns
   instead of a 13-column scroller. `data-dense` claimed 200%; this spec clears the real bar,
   and no page relies on the scrollable-region exception. **[R-8]**
9. **CI gates.** (a) `axe-core` on every route, both themes, zero violations. (b) **Grayscale
   screenshot of every route at `filter: grayscale(1)` — must remain fully readable**, diffed
   against a baseline (`data-dense`'s best a11y idea: it turns "no color-only meaning" into a
   gate). (c) `forced-colors` screenshot of every route. (d) A Vitest assertion over the token
   map that every documented contrast pair still clears its floor (§4.1) — a token edit that
   breaks AA fails `pnpm test`. (e) A test asserting **no route renders `0-0` or `0 – 0` for a
   game whose status is not `final`**. (f) A test asserting `snapshot.teams.length === 16` and
   `abbr` uniqueness.
10. **Motion.** `prefers-reduced-motion: reduce` kills the LIVE pulse (it becomes a static
    ring), smooth scrolling, and every transition. **Nothing on the site conveys meaning
    through motion alone** — `LIVE` is also a word.
11. **Language & units.** `lang="en"`, `<time datetime>` on every date, every time labelled
    `PT`, all formatting done server-side in `America/Los_Angeles` so no client reformats a date.
12. **Privacy, stated on `/about#a11y`.** The site stores exactly three things, all in this
    browser only: a theme choice, a pinned team and the league the visitor chose to see on the home
    page (`localStorage` keys `scvalfh.theme`, `scvalfh.pinnedTeam`, `scvalfh.league`; the league
    key is written only by an explicit choice, never by following a link). No accounts, no
    analytics cookies, no third-party requests on any page (no hotlinked images, self-hosted
    fonts). *(Amended in §15; this item originally said "exactly two things".)*

---

## 11. Scoring and rendering rules — published verbatim on `/about#standings`

These are design decisions because they change what the UI can honestly show. Every standings
footnote links here.

1. **Standings count league games only** (Sep 9 – Oct 28). Non-league games appear in the
   overall record and nowhere else.
2. **League membership is the repo's list of 16, not the feed's.** De Anza's source table has
   seven rows; **Wilcox is absent, not 0-0-0**. We render all eight and say so.
3. **Computed, then cross-checked.** Records are computed from game results and compared field
   by field against MaxPreps' published table. A disagreement is **shown**, not resolved
   silently (§9).
4. **A missing score is never zero.** `homeScore: null` renders `—`. No total, average,
   differential, bar, chip, streak or form entry is ever derived from a null score. **A real `0`
   renders as `0` in full-strength ink** and is distinguishable from `—` at 13px (§5.3).
5. **OT and shootout wins are wins.** Displayed with an `OT` / `SO` superscript. In a shootout
   the *goal* score stays level (`1–1`) so GF/GA stay correct, and the W/L comes from the
   shootout.
6. **Forfeits count in W-L-T, not in goals.** Displayed `1–0 ᶠ` with the forfeiting side named
   in the recap; excluded from GF / GA / GD and from `MarginStrip`; and footnoted with a `†`
   under **every** total that excludes them.
7. **Cancelled and postponed games count for nothing** and are never rendered with a score.
   They are also removed from "games remaining".
8. **Sort order:** league win percentage desc (ties counting as half a win, CIF convention) →
   head-to-head → goal differential → goals against asc → alphabetical. **Teams with no
   reported games sort last with a `—` rank.** The chain is printed here so a ranking is never a
   mystery, and the table footnote states separately that our display order is not a ruling —
   the official tiebreak belongs to the league.
9. **Goal-differential bars are scaled per division**, and each table's footnote prints its
   domain (De Anza 30, El Camino 43 on the reference snapshot) and says the two tables are not
   comparable to each other.
10. **All times are America/Los_Angeles**, formatted server-side.

---

## 12. Appendix A — what the real data forced into this design

Adopted wholesale from `data-dense` §9, which both judges called the single most valuable
passage produced in the whole exercise, and extended with the resolutions this spec makes.
Every figure comes from the verified payloads `da.json` / `ec.json` (snapshot 2026-09-28) plus
the CCS and SCVAL PDFs.

### 12.1 De Anza's source table has SEVEN rows  **[R-6]**

`layoutProps.headerData.teamsCount === 7` and `tableData.length === 7`. **Wilcox is not in the
source at all** — not "0-0-0", not last place: *absent*. Official 2026-27 membership lists
eight. Any design that derives its rows from the feed array silently drops a school from the
league, which is the worst bug this site could ship.

**Resolution:** `lib/teams.ts` holds a hand-maintained membership constant. `lib/standings.ts`
**left-joins** it against the feed, so the table always has 16 rows across two divisions and a
missing school lands in the designed no-results state (§8) rather than vanishing. A Zod
invariant asserts `snapshot.teams.length === 16` and CI asserts it again.

### 12.2 Zero is a real score, and it is not null

Live payload: Cupertino league GF **0** (GA 23), Homestead league GF **0** (GA 24), Monta Vista
league GF **0** (GA 43). This makes "never render a missing score as 0-0" *harder*, not easier.
**Resolution:** §5.3 — full-strength mono `0` vs muted em dash with `aria-label`, a standings
footnote saying so out loud, a Zod schema that rejects a final with a null score *and* a
non-final carrying one, and a CI test on the literal string.

### 12.3 Goal differentials are enormous and asymmetric  **[R-2]**

Real league GD spread on 2026-09-28: De Anza **+30 to −24**; El Camino **+26 to −43**.
**Resolution:** `GoalDiffBar`'s `domain` is per division, computed at build; the domain is
printed in each footnote; and the footnote says the two tables are not comparable. The
`MarginStrip` axis clamps to the team's own range, because a −7 single-game margin is normal in
this league and a generic ±3 range would be wrong. "Blowout is normal" is also *why* GD earns a
mark at all: Los Altos and Valley Christian are both 2-1-1, separated by 9 goals.

### 12.4 The source carries a mascot image URL. We read it and discard it

`schoolMascotUrl` is right there in `tableData`. The constraint forbids hotlinking and the
design doesn't want it: third-party asset, inconsistent size and background, 16 network requests
on the standings page, and it would fail in dark mode. `TeamMonogram` uses the hand-assigned
`abbr` for letters and `schoolColor1` / `schoolColor2` for fill and inset, with ink chosen by
measured contrast. `/about#sources` says this in one sentence.

### 12.5 There is a NEUTRAL-site split, not just home/away

`homeWins/Losses/Ties`, `awayWins/Losses/Ties` **and** `neutralWins/Losses/Ties` all exist. CCS
games are at neutral sites and some non-league tournaments are too. **Resolution:** `Team`
carries `neutral: Record3`, the desktop table has a `NEUT` column (all `0-0-0` today, honest,
56px), `Game.site` is `'home' | 'away' | 'neutral'`, and `MarginStrip`'s glyph row has a third
glyph `N`. **The column ships empty rather than appearing in November**, because a column that
materialises mid-season breaks the reader's model of the table.

### 12.6 The source publishes its own placement and pct, so the cross-check is cheap

See §9. The one substantive finding: MaxPreps ranks St. Ignatius (3-0-0, 1.000) above Saint
Francis (4-1-0, .800), so the league sorts on win percentage.

### 12.7 Recaps are one auto-generated sentence, always the same shape

Verified: *"On 9/24, the Saratoga varsity field hockey team lost their home conference game
against Santa Clara (CA) by a score of 3-2."* **Resolution:** §5.8 — three deterministic strips
at build, 13px `--sx-text-2`, 2-line clamp, never prominent, never an empty state.
**This is also why there is no live clock and no named-player lede anywhere in this spec**: the
payload contains neither, and inventing them in the most valuable rectangle on the site was
`editorial`'s one disqualifying move. **[R-12]**

### 12.8 Source map (for the implementer)

| Need | Source | Extraction |
|---|---|---|
| Division standings + colors + acronym + splits + streak | `maxpreps.com/ca/field-hockey/26-27/league/santa-clara-valley--{de-anza,el-camino}/?leagueid=…` | `<script id="__NEXT_DATA__" …>` → `props.pageProps.layoutProps.tableData[]`. **Match with `<script id="__NEXT_DATA__"[^>]*>`** — a `crossorigin` attribute sits between `id` and `type` |
| Contest IDs by date | same league scoreboard payload | `contestIdsByDate[]` |
| Per-game score, venue, recap | `maxpreps.com/ca/field-hockey/game/…` | the `ld+json` block whose `@type === "SportsEvent"` (two blocks exist; the other is `BreadcrumbList`); it also exposes full `homeTeam` / `awayTeam` objects |
| Official CCS bracket | `maxpreps.com/tournament/…/2026-central-coast-section-field-hockey-championship.htm` | currently `<div class="not-published">This tournament bracket will go live when published.</div>` — which is exactly the §8 not-seeded state, and the authoritative link to put beside our projection |
| CCS dates & format | `2026-27_CCS_Playoff_Dates.pdf`, `field_hockey_bylaws_2026-27.pdf` | `pdftotext -layout`; fixed-width columns where date/day cells are **blank on continuation rows** — carry the last non-blank date forward |
| Prior-season final standings | `scval.com/standings/2025-26 Field Hockey standings.pdf` | `pdftotext -layout`; four stacked blocks in order DeAnza V, El Camino V, DeAnza JV, El Camino JV — **take blocks 1 and 2 only** |
| All-league awards | `scval.com/standings/SCVAL 2025-26 Field Hockey all league.pdf` | `pdftotext -layout`; an `OVERALL LEAGUE AWARDS:` section of `Award: School- Player` lines, then whitespace-aligned First/Second team tables |

Because two sources are scval.com PDFs, `/history/2025-26` additionally credits `scval.com`.
**The global attribution string stays exactly "Data from MaxPreps and SBLive/SI" on every
page**, with deep links, as the brief requires.

### 12.9 Site slug ↔ source slug map, and the abbr collision

Site slugs are chosen for humans and are **decoupled** from MaxPreps slugs; the mapping is an
explicit constant, never derived by string munging (`mitty` ≠ `archbishop-mitty`,
`st-ignatius` ≠ `st-ignatius-college-preparatory`, and St. Ignatius' MaxPreps school URL sits
under `/ca/san-francisco/`, not a Santa Clara city path).

```ts
// lib/teams.ts — the membership constant. THIS is the league, not the feed.
export const TEAMS = [
  // site slug          display              short          abbr  division     maxpreps slug
  ['cupertino',         'Cupertino',         'Cupertino',   'CU', 'de-anza',   'cupertino'],
  ['fremont',           'Fremont',           'Fremont',     'FR', 'de-anza',   'fremont'],
  ['homestead',         'Homestead',         'Homestead',   'HM', 'de-anza',   'homestead'],
  ['los-altos',         'Los Altos',         'Los Altos',   'LA', 'de-anza',   'los-altos'],
  ['saint-francis',     'Saint Francis',     'St Francis',  'SF', 'de-anza',   'saint-francis'],
  ['st-ignatius',       'St. Ignatius',      'St Ignatius', 'SI', 'de-anza',   'st-ignatius-college-preparatory'],
  ['valley-christian',  'Valley Christian',  'Valley Chr.', 'VC', 'de-anza',   'valley-christian'],
  ['wilcox',            'Wilcox',            'Wilcox',      'WX', 'de-anza',   'wilcox'],
  ['los-gatos',         'Los Gatos',         'Los Gatos',   'LG', 'el-camino', 'los-gatos'],
  ['lynbrook',          'Lynbrook',          'Lynbrook',    'LY', 'el-camino', 'lynbrook'],
  ['mitty',             'Archbishop Mitty',  'Mitty',       'MI', 'el-camino', 'archbishop-mitty'],
  ['monta-vista',       'Monta Vista',       'Monta Vista', 'MV', 'el-camino', 'monta-vista'],
  ['palo-alto',         'Palo Alto',         'Palo Alto',   'PA', 'el-camino', 'palo-alto'],
  ['presentation',      'Presentation',      'Presentation','PR', 'el-camino', 'presentation'],
  ['santa-clara',       'Santa Clara',       'Santa Clara', 'SC', 'el-camino', 'santa-clara'],
  ['saratoga',          'Saratoga',          'Saratoga',    'SG', 'el-camino', 'saratoga'],
] as const;
```

Abbreviations are **hand-assigned and asserted unique at build**. `SC` Santa Clara vs `SG`
Saratoga is the one collision that needed resolving; the source's `schoolNameAcronym` is used
only when it happens to be unique, otherwise this table wins. `TeamMonogram` therefore never
renders two identical squares in one division.

---

## 13. Appendix B — resolution index

Every weakness either judge named against the winner, and every graft they asked for.

| # | Judge finding | Resolution | § |
|---|---|---|---|
| R-1 | GD bar painted in win/loss hues — same green means both "won" and "positive quantity" | Bar is **hueless ink**; polarity is side-of-zero + the signed numeral. Hued alternatives shown failing the validator | 5.6, 6.3 |
| R-2 | One GD scale shared across both divisions squashes De Anza | **Per-division domain** (30 / 43), printed in each footnote, with "not comparable" stated | 5.6, 12.3 |
| R-3 | `/teams` has no phone nav entry | **Five-tab** bottom bar, 78px each = 390px exactly | 1.3, 3.1 |
| R-4 | No per-game URL, so no OG card for the most-shared object | **`/game/[id]`**, 174 static pages + per-game `opengraph-image` | 1.1, 3.5 |
| R-5 | 104px (16%) of permanent chrome | Top bar to **44px** with the freshness stamp merged into it; 100px total, and 28px returned to every fold | 1.3 |
| R-6 | Wireframe data invented; layout never stress-tested; Wilcox would be dropped | Every wireframe drawn against the **verified 2026-09-28 payload**, pinned team is **Homestead 0-5-0 with a genuine 0 GF and LLLLL**; membership is a repo constant left-joined | 2, 12.1 |
| R-7 | Phone shows Last 3, everything else Last 5 | **Last 5 everywhere**, enabled by the two-line 60px phone row; column arithmetic summed to 358px | 3.2, 5.5 |
| R-8 | Reflow claimed at 200% (data-dense) | **400% at 320px**, one column, no scrollable data table | 10.8 |
| R-9 | Least distinctive of the three; 11 type steps, three inside 2px | **Rule-and-kicker** as the signature move; type scale cut to **8 steps with 2 clamps** | 4.2, 4.3, 7.2 |
| R-10 | 44px targets overflowing 40px rows (data-dense) | Standings row is a **60px block-level `<a>`**; hit area is exactly the row | 3.2, 10.7 |
| R-11 | Audience drift: WHO'S HOT, schedule strength, PTS, 8×8 matrix | **All cut**, named as cut | 1.2, 6.2 |
| R-12 | Live clock and named-player lede that the data cannot produce | **Deleted**; no `cacheLife('minutes')`, no `LiveRefresh`; LIVE disclosed as a scheduled window on every page and on `/about#updates` | 1.2, 5.2, 12.7 |
| R-13 | Sparkline in a stat tile after arguing against it | **No sparkline anywhere** | 6.2, 7.7 |
| R-14 | Non-league as a second hue / lighter step | **Outline column** (shape) in `MarginStrip`; `NL` word + 2px rule in lists; `?` tick for unplayed games and the `H/A/N` glyph row adopted | 5.4, 5.7 |
| R-15 | Untested cross-role collision between division hues and status hues | **Divisions have no hue.** The collision is shown failing at ΔE 4.0–5.0 and the channel is deleted | 6.4 |
| R-16 | Contrast asserted in prose, not gated | **Vitest assertion over the token map**, plus two named lintable exclusions | 4.1, 10.9 |
| R-17 | `@theme inline` shadows self-referential and dead (editorial) | Shadows are literal values in `:root`, aliased **once** into `@theme inline` | 4.2, 4.4 |
| R-18 | Client-component count softer than claimed | **Four** modules, named; scroll-spy and the JS tooltip deleted (CSS `:focus-visible` does the tooltip) | 7, 5.7 |
| R-19 | Winner-by-weight is a free fourth channel (editorial) | Adopted into `ScoreCell` / `GameRow`: winner 600 in `--sx-text`, loser 400 in `--sx-text-2` | 5.2, 6.5 |
| R-20 | Fill-vs-outline oversold as a redundant channel | `ResultChip` has **one** treatment; the honest fourth channel is the score's weight | 6.5, 7.5 |
| R-21 | One hex meaning three things (accent / GD-positive / "likely" tier) | No ordinal ramp ships; berth statuses are **written words** + a 2px rule; `BerthMeter` is the only accent mark on `/playoffs` | 6.6, 7.10, 7.11 |

**Grafted, with credit:** rule-and-kicker · hueless GD bar · `ScoreCell` as the never-0-0
owner with superscript deciders · winner-by-weight · contrast-as-a-test · `outline-offset: -2px`
on sticky heads · fluid clamps · the two-line phone standings row · "say what is true, say when
it changes" · active filter chips on zero results · non-league under its own eyebrow ·
stale-snapshot footer · per-game URLs with OG cards (all *editorial*). §9 wholesale ·
`renderScore` + Zod contract · per-division GD domain · cross-role palette validation ·
published cross-check log · greyscale CI gate · build-time recap cleanup · empty `NEUT` column ·
`content-visibility` on date groups · "who we haven't beaten" · `BerthMeter` + ordinal word
chips · `MarginStrip`'s outline/`?`-tick/`H-A-N` treatment · slug map and abbr uniqueness assert
(all *data-dense*).

*Later (2026-10):* `ScoreCell` was retired once no route rendered it. The never-0-0 owner is
`describeGame` (components/ui/describe-game.ts) over `renderScore`, and every score glyph goes through
`ScoreGlyph` (§7.4). R-19 and the line above are kept as the record of what was adopted.

*Later (2026-10):* the server-side pin channel (`highlightSlug` on `StandingsTable`,
`DivisionStandings` and `PlayoffBracket`, drawing `.sx-pinned`) was removed: no static page can
know the pin, so no caller ever passed it. A pinned row is marked only by `[data-pinned]` on its
`data-team-slug` (§15), and `.sx-pinned` survives as the home pinned card's static class.

---

## 14. Build checklist, ordered by dependency

Nothing in a later step can be correct before the step above it. Each step ends in something
verifiable.

**1 — Data contract.** `lib/teams.ts` (the 16-team membership constant + slug/abbr map, with
the build-time uniqueness assert) and `lib/snapshot.ts` (the Zod schema and all five
invariants of §5.1, the left-join against the feed, the cross-check step, and the recap
cleanup of §5.8). *Done when:* the schema **rejects** a final game with a null score, a
non-final carrying a score, and a feed that yields fewer than 16 teams — and the cross-check
emits the Fremont mismatch.

**2 — Tokens and theme.** `app/globals.css` from §4.2 verbatim, plus the ~380-byte pre-paint
theme script in `layout.tsx` and `next/font/google` `Geist` + `Geist_Mono` (`latin`, `swap`).
*Done when:* an empty page is correct in light, dark, OS-dark-with-a-light-stamp,
`prefers-reduced-motion`, and `forced-colors: active` — **before any component exists.**

**3 — Contrast gate.** The Vitest suite of §10.9(d) over the token map, asserting §4.1's table
and the two named exclusions. *Done when:* changing one token hex fails `pnpm test`.

**4 — Result primitives.** `renderScore` · `ScoreCell` · `StatusLabel` · `Tag` ·
`ResultChip` · `FormStrip` · `TeamMonogram` (with the build-time `onPrimary` computation).
*Done when:* all **eleven** rows of §5.2's table are unit-tested, including the genuine `0-0`
final and the shootout whose goal score stays level.

**5 — Chrome and the signature.** `SectionHeader` (rule-and-kicker) · `TopNav` ·
`BottomTabBar` (5 × 78px) · `Attribution` with the stale-snapshot state · `EmptyState` ·
`ExternalLink` · `LastUpdated` · `ThemeToggle`. *Done when:* a bare page at 390px has exactly
100px of chrome and the kicker reads right in both themes.

**6 — Standings.** `GoalDiffBar` → `StandingsTable` (`phone` first, then `desktop`, `mini`,
`archive`) → `/standings`. This is the hardest layout on the site. *Done when:* **rows 1–7 of
8 are above the fold at 390×664 with zero horizontal scroll**, the per-division domain is in
the footnote, Wilcox renders in the no-results state, and the `⚑` footnote is live. If seven
rows don't fit, the type scale is wrong and everything after this inherits the mistake.

**7 — Games.** `GameRow` / `GameCard` / `ScoreBoard` → `/game/[id]` (+ `generateMetadata`,
`opengraph-image`) → `/scores/[date]` → `/schedule` **with the complete list server-rendered
first**, then `ScheduleFilters` layered on inside `<Suspense>`. *Done when:* `/schedule` is
fully usable with JavaScript disabled and filtering makes no network request.

**8 — Teams.** `StatTile` → `/teams` → `/teams/[slug]`: identity, tiles, `LAST`, `NEXT`,
`FORM`, then `MarginStrip` **with its `<details>` table twin built at the same time**, splits,
"who we haven't beaten", and the two game logs under separate eyebrows. *Done when:* Wilcox's
page is complete and useful with no results at all, and Homestead's `MarginStrip` renders five
real columns below the zero rule.

**9 — Personalization.** `PinControl` → `MyTeamCard` → the `/` composition, both the pinned
and unpinned folds. *Done when:* the page is correct with `localStorage` blocked, with an
unknown pinned slug, and with no pin at all — and CLS is 0 in all three.

**10 — Playoffs.** `BerthMeter` → `PlayoffProjection` → `/playoffs` in the **not-seeded mode
first** (it is the live state for the next five weeks) → `PlayoffBracket` (phone rounds, then
the desktop CSS-grid elbows). *Done when:* there is no skeleton bracket before Nov 2 and every
status is a written word.

**11 — Long tail.** `/history/2025-26` · `/about` with all eight anchors and the cross-check
table · `app/sitemap.ts` · `app/robots.ts` · `manifest.webmanifest` · root and per-team OG
images. *Done when:* every standings footnote's `/about#standings` link resolves to the right
anchor.

**12 — Gates.** Wire §10.9 into CI: `axe` on every route in both themes · the **grayscale
screenshot diff** · the `forced-colors` screenshot · the token-contrast suite · the
"no `0-0` on a non-final" assertion · the 16-teams / unique-abbr assertion · a Lighthouse
budget check. *Done when:* a PR that recolors a chip and drops the letter **fails**.

**13 — Performance pass.** Verify the budgets: all 10 route families prerendered
(`generateStaticParams` over 16 teams, ~50 dates, 174 games); **four** client modules and
first-load JS ≤ 40 KB gzipped beyond the framework; zero chart JS; zero image requests on the
critical path; `content-visibility` on `/schedule`'s date groups; the snapshot split so
`/` never ships 174 venue addresses. Targets: **LCP < 1.2s** on 4G / mid-tier Android (the LCP
element on `/` is text), **TBT < 100ms**, **CLS < 0.02**, `/` under **120 KB** gzipped
including fonts. Caching: immutable hashed assets, HTML
`s-maxage=300, stale-while-revalidate=86400`. *(Superseded 2026-10-08: HTML is now
`public, max-age=0, must-revalidate` with an ETag, because browsers honored the
`stale-while-revalidate` and showed day-old scores; see `next.config.ts`.)*

---

*End of spec. The palette in §6.6 passes `--pairs all` on seven surfaces across both modes with
`exit=0`; the contrast matrix in §4.1 is measured output, not assertion; and §13 accounts for
every weakness both judges raised.*

---

## 15. Multi-league amendment (2026-10)

The site was designed (§1-§14) for one league: SCVAL's 15 teams. It now covers **four leagues and
43 teams**: SCVAL, BVAL and PCAL in the CIF Central Coast Section, and MCAL in the North Coast
Section. Sections 1-14 are kept as written for history; this section lists what changed and wins
wherever it disagrees with them. The rule that every other part of the design still stands is
deliberate: static rendering, no `searchParams`, "today" from the snapshot's `fetchedAt`, the
rule-and-kicker headers, two data hues, the never-0-0 rule and the phone-first chrome are all
unchanged.

### 15.1 Decisions this reverses

| Earlier decision | Now | Why |
|---|---|---|
| §1.2 "No search. 16 teams, 10 pages; `/teams` beats a search box." | A zero-network team finder (`lib/search.ts`, `components/search/TeamFinder.tsx`) over a pre-serialized 43-team index: it filters the server-rendered list on `/teams` and pins a team from the home page. Results are ordinary links or buttons in DOM order with a polite live region; no combobox. Without JavaScript the full grouped list is the page. | 43 schools across four leagues is too many to scan; "find my school" is the first task of every visitor. |
| §1.2 "No division sub-routes." | `/standings/[league]` and `/schedule/[league]` (4 pages each) and `/playoffs/[league]` (leagues with their own tournament: MCAL). `/standings` stays an all-league page of compact tables whose `#de-anza` and `#el-camino` anchors still resolve with no JavaScript; `/schedule` becomes a light index that keeps `#YYYY-MM-DD` anchors. | One 500-game schedule page would break the "every list page stays fast" budget; a shared "/standings/bval" link should preview BVAL. |
| §3.1's wireframe labels the fifth phone tab "CCS" (decision 3 above already calls it Playoffs) | "Playoffs" (still 5 tabs: 78 px each at 390 px, 64 px at 320 px, where the label measures about 47-52 px). | MCAL is in the North Coast Section, which has no field hockey championship, so "CCS" would be false for a quarter of the teams. |
| §3.1 / §7.12 the 15-tile team picker on the home page | The finder plus per-league team lists inside each league panel (and four league cards on a first visit). | A 43-tile picker does not fit a phone fold; each league's tiles are server-rendered in its own panel. |
| §10.12 "exactly two things stored" | Three: theme, pinned team and the league (`scvalfh.league`). | See 15.3. |
| §3.1's 240 px reserved height for the pinned card | The pinned card's height is **measured** at its longest real content and set per breakpoint on the card box. | The built card already exceeded 240 px (up to about 370 px below 390 px wide), and the new postseason line makes it longer. |

### 15.2 Routes

All static; every dynamic route has `generateStaticParams` and `dynamicParams = false`, and an
unknown param is a 404 (including its OG image).

| URL | Answers | Pages |
|---|---|---|
| `/` | "What just happened in **my** league, and when is my team's next game?" | 1 |
| `/standings` | every division as a compact full table, grouped section → league → division, with `#ccs #ncs #scval #de-anza #el-camino #bval #mt-hamilton #santa-teresa #pcal #mcal #marin-county` | 1 |
| `/standings/[league]` | "Where do **we** stand?" the full page for one league | 4 |
| `/schedule` | league cards, recent and next game days grouped by league, and an "Every game day" index of `#YYYY-MM-DD` rows | 1 |
| `/schedule/[league]` | one league's whole season with the client filters | 4 |
| `/scores/[date]` | one day grouped by league, then "Non-league" | one per game date |
| `/game/[id]` | the shareable game (an si.com-sourced id reads `sblive-123`); a game MaxPreps later published is a stub linking to it | one per game |
| `/teams`, `/teams/[slug]` | find my school (grouped section → league → division); one team | 1 and 43 |
| `/playoffs` | the CCS picture: `#scval #bval #pcal`, key dates, bracket | 1 |
| `/playoffs/[league]` | league tournaments: `/playoffs/mcal` | 1 |
| `/history/2025-26`, `/about` | 2025-26 history by league (SCVAL and BVAL tables and awards; PCAL and MCAL marked unavailable, with the reason); per-league rules, health, sources, backfills, dropped contests | 1 each |

Headings on the grouped pages (`/standings`, `/teams`): a section is an h2 `SectionHeader`
(kicker `Central Coast Section` or `North Coast Section`), each league an h3, each division a plain
h4 (omitted for PCAL and MCAL, which have one division and no division label anywhere).

### 15.3 The remembered league and the pre-paint scope

A visitor can choose the league they care about; the home page then shows only that league's panel.
The choice is `localStorage['scvalfh.league']` (a league id, or `all`) and is written **only** by an
explicit act: a tap on a home league chip, the "Show <league> here" button on a league card, or
pinning a team (which writes the team's league). Following a link and tapping a link-mode chip never
write it, so a pasted `/standings/bval` does not change anyone's home page.

Two separate inline `<head>` scripts run before first paint: the unchanged pinned-team script and a
new prefs script that stamps `<html data-league data-pin data-js>` (and `data-pin-stale` for a stored
pin that is no longer a team). Generated CSS then shows only that league's panel and hides the rest
with `display: none`, so **every league's content is in the static HTML**, switching is a pure
attribute change, there is no CSS reordering (DOM order is visual order) and layout shift is 0.
With JavaScript off or storage blocked there is no attribute, the page is the first-visit view
("Find your team" and four league cards, never an SCVAL default) and every link works. After
hydration the Scores, Table and Playoffs links follow the page's league, or the remembered one.
Focus after a write moves to the league panel heading or the My-team heading (WCAG 2.4.3).

### 15.4 LeagueSwitcher

One component, three modes: `scope` (home: buttons that write the league, disabled until
hydrated, with a polite live region), `link` (`/standings/[league]`, `/schedule/[league]`: plain
links that never write) and `anchor` (`/standings`, `/teams`, `/playoffs`: `#id` links, plus a
route link where a league has its own page, as /playoffs' tournament leagues do; a `#id` chip is a
plain `<a>`, a route chip a `<Link prefetch={false}>`). The chip is `text-micro` weight 600,
`min-h-11 min-w-11 px-2`, a 6 px gap and `flex-wrap`, so 200% text zoom wraps instead of clipping. Measured at 320 px the five-chip row (All, SCVAL, BVAL, PCAL, MCAL) is
about **273 px**, inside the 288 px content width. There are no visible section captions: the chips
sit in two lists labelled for assistive technology ("Central Coast Section" and "North Coast
Section") separated by a hairline. The selected chip is an accent-wash fill, accent ink, weight 600,
a 1.5 px ink ring and a ✓ (`aria-hidden`), never color alone, so it survives the §10.9b grayscale
gate.

### 15.5 Leagues get no hue

§6.4 removed a categorical hue for divisions because a division-orange failed the validator against
loss-coral and the fix was to need no color at all. That extends to leagues: **the four leagues have
no color anywhere**, not in chips, bars, badges, the OG cards or the berth meters. A league is named
in text (`SCVAL`, `BVAL`, `PCAL`, `MCAL`), by the panel it sits in and by its section kicker. The
two data hues remain win and loss only.

### 15.6 Home page: league panels and the fold

The home page's composition, in DOM order: the page header (visible h1 "NorCal High School Field Hockey Teams", with
the four league names in its sr-only title), the My-team slot (hidden until there is a pin, a league
or a stale pin), the scope `LeagueSwitcher`, the first-visit "Find your team" block, then one
`<section data-scope="<league>">` per league (phase lead, latest scores, mini standings, next games,
the league's team tiles, the postseason card and a one-line strip of the other leagues' leaders),
and a cross-league "latest" block shown on the first visit.

Mini standings are driven by each division's config, never by a map keyed by division id in the
component: SCVAL 4 rows, no line; Mt. Hamilton 4 rows with an "AQ line" after 3; Santa Teresa 3 rows
with a "Play-in host" line after 1; PCAL 7 rows with an "AQ line" after 2; MCAL 7 rows with a
"Tournament line" after 6. The line is a labelled separator row, never only a rule (WCAG 1.3.1).
MCAL's postseason card has no berth meter and no CCS date: NCS pages describe no CCS concept.

**Fold targets** (phone, measured in a real browser by `scripts/a11y-axe.mjs`, which prints the
measured values in CI; this section states the targets, never a measurement):

- pinned team, 390 x 664: the whole pinned card is above the fold;
- pinned team, 390 x 844: at least 2 Latest rows are above the fold as well;
- a league chosen but no team pinned, 390 x 664: at least 2 Latest rows are above the fold (the
  estimate that makes it plausible is top bar 48 + header about 100 + My-team heading 44 + compact
  slot 128 + switcher 44 + panel heading 44 + Latest heading 44, about 452 px, leaving the rows
  within the 608 px between the bars).

The pinned card's own height is measured at its longest real content (two-line Next, a team with no
results, the longest postseason line) at 320, 360, 390 and 768 px and recorded in a comment at the
component; this supersedes §3.1's 240 px. The pinned card's postseason line is one line that fits
a 320px card (288px of text) and shows the short form: "Today: <label>" during the regular season,
"Final: <label>" after it. For a place shared across two rungs, whose full label carries a tiebreak
citation, the card shows the two rungs' badges plus "(tied)" instead (e.g. "Today: Play-in or No AQ
route (tied)"; `HomeTeamView.postseasonShort`, set only for those ties). The full sentence ("If the
season ended today: <label>" / "Final place: <label>") remains the line's accessible text and its
`title`, and lives in full on the team page (`postseasonCardLine` in
`components/home/home-types.ts` picks the visible form).

### 15.7 GP, LEFT, MAX and the missing-results line

The standings table gains a **GP** column everywhere (the phone two-line row carries
`<counted>/<scheduled> GP`) and, on desktop, **LEFT** (league games with no counted result yet:
still to play, or played and not reported) and **MAX** (the most points a team could reach if it won
all of them: a ceiling, not a projection). Where teams have played unequal numbers of games a footnote
says that points favor teams that have played more. Above the table, a single line, "⚑ 1 official
league result missing — listed below the table" (or "⚑ N official league results missing …"), links to the official
league games dated in the past with no counted result; they are listed by team and date and never
counted. A result sourced from si.com carries a † on the row with a footnote (see 15.9). PCAL's and
BVAL's co-champion label appears only after the league's regular phase.

### 15.8 Copy rules

- **Kickers are sentence case and rendered as written** (`SectionHeader` does not transform case):
  `Central Coast Section`, `League table`, never an upper-cased label.
- **No "eliminated"**, anywhere, in any case. BVAL and PCAL places off the ladder read "No
  automatic-berth route"; SCVAL's read "No automatic path".
- **MaxPreps' internal label for PCAL's table is never shown.** It is data only (see
  `docs/DATA-SOURCES.md` §2); the site says "PCAL". The one lowercase slug inside a MaxPreps link
  is the only allowed occurrence of it in built output.
- A missing score is never rendered as 0-0.
- Counts use real plurals; no "result(s)".
- No CCS concept inside an MCAL page's `<main>` (no "automatic qualifier", "at-large", "CCS
  Division", "CCS picture"); no division label on PCAL or MCAL pages.
- "Co-champions" appears only after that league's regular phase.
- Branding: `NorCal High School Field Hockey` (header wordmark `NorCal HS Field Hockey`, `NorCal HS FH`
  below 1280px; no FH badge), with a scope note naming exactly the
  four leagues. `scripts/assert-copy.ts` scans the built HTML for the rules above.

### 15.9 si.com and the source line

Owner decision D2 lets si.com backfill MaxPreps under ten mechanical rules (see
`docs/DATA-SOURCES.md` §5.2). The design consequence is a marker, never a color: a game row's status
chip carries a † with the accessible text "Score via si.com" for such a score, the game page's source
line reads "Score via High School on SI (si.com)" with both links, a standings row that includes one
carries a † and a footnote, and `/about#backfills` lists every one with both values and the rule.
On a game row the † is StatusLabel's SourceMark, a sans footnote mark, not a `Tag` (§7.16).

### 15.10 Budgets

Fail CI (`scripts/assert-budgets.ts`), against baselines captured from `main` before the change:
`data/snapshot.json` at most 1.6 MB raw (warn above 1.2 MB); `/` HTML gzip and RSC gzip each at
most 2.2 x baseline (2.0 x until 2026-10-03; see §16.4); first-load client JS for `/`, `/schedule/<league>`, `/teams` and
`/standings/<league>` each at most baseline + 20 KB (this catches the config, registry or zod
leaking into the browser: the client boundary forbids it); `/standings` (overview) at most 1.0 x its
baseline gzip; each `/standings/<league>` and `/schedule/<league>` at most 1.25 x; the `/schedule`
index at most 0.5 x; `/teams` at most 3.0 x; `/playoffs` at most 2.0 x; the Cloudflare Worker at
most baseline + 600 KB. The original §13 budgets (LCP, TBT, CLS, 40 KB of app JS beyond the
framework) still apply.

(Extended by §22: a fifth league, the EAL, in a third section, the Northern Section; 49 teams.)
(Extended by §24: nine leagues in five sections and two regions, 99 teams; the page-weight
multipliers and the Worker allowance were raised from a measurement on 2026-10-06, §24.6. With the
three independents, 102 teams, no page line moved, §24.9; the five independents' table, §24.10.)

## 16. Leaders amendment (2026-10)

The site gains one page, `/leaders`: leaderboards across all four leagues. §1.2 kept "who's hot"
style material off the site because it served a coach rather than a parent; the owner has since
asked for site-wide leaders, so this section adds them and wins where §1-§15 disagree. Everything
else stands: static rendering, "today" from the snapshot, no new hue (§6.4, §15.5), no new chart
(decision 8: the boards are tables), and the copy rules of §15.8.

### 16.1 The page

| URL | Answers | Pages |
|---|---|---|
| `/leaders` | "Who leads the whole site?" `#players` (most points, assists, saves, clean sheets) and `#schools` (best record, best league record, most goals per game, fewest goals allowed per game, most clean sheets); each board has its own anchor (`#most-points`, `#best-record`, …) | 1 |

The page is built by `components/leaders/leaders-view.ts` from the two files every other page reads,
so a player's line is the one on their team page and a school's record is the one in its standings row.
Each board is one table (`components/leaders/LeaderBoardTable.tsx`): place, name (the player's team
and league on a second line, then the grade and position the team page's roster gives, or the
school's league), and at most three numeric columns, so a 320px phone needs no scroller. The column a board ranks on is bold. Boards sit one per row on a phone and
two per row from 1024px. It has no OG card of its own (`ROOT_OG_IMAGE`, like `/schedule`).
(Amended by §23: `#schools` now comes first, the Elo board is its last board, and a player board
opens to 25th.)

### 16.2 Ranking and honesty

- **Shared places.** Standard competition ranking (1, 2, 2, 4), printed as `T2` with "tied for 2nd"
  for a screen reader, as the standings tables do; tied rows are listed by name. A board lists the
  places up to 10th and never more than 15 rows: a tie for the last place shown that would pass 15 is
  counted in a line ("4 more players share 10th, with 2 assists each.") instead, and a tie for 1st
  that long is the whole board ("16 goalkeepers share 1st, …"), never an empty-board message. The
  goals-per-game boards split equal rates by more games played, so a shared place there is an
  equal rate over the same number of games. (Superseded by §23: a board lists every row tied for
  its last place, however many, and no line counts a tie instead.)
- **Player boards rank only what coaches enter.** A stat a team does not track is null for its
  players (lib/player-stats-schema.ts) and never ranks as a 0; a 0 never makes a board. The heading
  meta says how many teams a board covers ("From 11 teams"), the note under it names the shorter of
  the two lists (the teams that do enter the stat, or the teams with stats that do not), the section
  names every team with no stats at all, and every team whose totals are behind its finals, by the
  team page's own `gamesSinceUpdate` rule. "Clean sheets" are MaxPreps' goalkeeper shutouts.
- **School boards cover every team.** Records are the `Standing` rows (`overall`: every final;
  `computed`: the league games the table counts). Clean sheets and goals per game come from the same
  finals, with forfeits left out as the standings leave them out of goals (§11.6). A record or a rate
  needs at least half the median team's number of results, rounded up (a 1-0 team does not top a
  table of ten-game seasons); the teams below the line are named with their count. A forfeit counts
  toward a record but not toward a rate, so a school that the rate boards leave out for that reason
  is named in a sentence of its own. The league-record
  board compares win percentages, not points, because leagues play different numbers of league games.
- **The pinned team.** Every row carries `data-team-slug`, so the pinned-team script and
  `PinnedTeamMarks` draw the accent rule and the hidden "Your team" note on the pinned team's rows (on
  a player board, all of its players).

### 16.3 Navigation and the top bar

Leaders is the eighth desktop nav link (after Teams). The phone bar keeps its five tabs (§15.1); the
footer links `/leaders` at every width, as it does the archive, and every team page's Player stats
heading links to `/leaders#players`. Eight links needed room in the 64px bar, measured in Chromium
with the widest stamp ("Updated Nov 30 12:48 PM") forced in: the nav capsules' side padding is 8px
below 1024px (it was 10px, which put the theme toggle 21px into the right gutter at 768); the stamp
returns at 944px (59rem) instead of 896, leaving about 29px; and its weekday waits for 1280, since at
1024 it left about 3px. `components/layout/SiteHeader.tsx` records the numbers. (Superseded by
§18: Leaders is now a phone tab, the desktop nav is back to seven links, and the header spacing is
back to what it was.)

### 16.4 Budgets

`/leaders` HTML gzip at most 1.0 x the `standings` baseline (about 28 KB on 2026-10-03; nine boards
of at most 15 rows cannot grow with the season), and its first-load JS at most the `standings`
baseline + 20 KB. The page ships no client component of its own. (The HTML line is 1.2 x since §23.)

The home page's budget moved from 2.0 x to 2.2 x its baseline the same day. The 2026-10-03 data
refresh had taken `/` to 51.2 KB HTML gzip, over the 49.9 KB line, before any of this. Two savings
came first:
- the monogram tile's eight utility classes became one `.sx-monogram` rule;
- the pinned card's 43 views now carry only a `slug` and read the team's name, short name and
  colors from the search index the card already receives, where they had been a second copy in
  every view.

The small home tiles (20 and 24px) also stopped shipping the second school color, which a monogram
draws only from 40px. That took `/` to 48.1 KB HTML and 28.4 KB RSC. The new line (54.9 KB HTML,
33.9 KB RSC) leaves about 12% for what the season adds to the page (postseason lines and cards),
not for a new section.

---

## 17. Clubs amendment (2026-10)

The site gained club field hockey: which youth clubs the players on the 43 tracked varsity rosters
play for, or played for, according to public pages that name both. The data is `data/clubs.json`,
research done by hand on 2026-10-03 and checked twice (`docs/DATA-SOURCES.md` §1.1j2, README
"Clubs"); nothing refreshes it. This section records what the pages answer, the rules they keep and
how they are laid out. Everything in §1-§15 still stands: static rendering, the rule-and-kicker
headers, two data hues, lists that reflow, the phone-first chrome.

### 17.1 Routes and what they answer

| URL | Answers | Pages |
|---|---|---|
| `/clubs` | "Which clubs do players here play for?" | 1 |
| `/clubs/[slug]` | "Who here plays for this club, and how do we know?" | 13 |

Both are static; `/clubs/[slug]` has `generateStaticParams` over the file and
`dynamicParams = false`, so `/clubs/nope` is the root 404. Every club gets a page, including the
seven no tracked player is tied to: what the club is and what it runs is true either way, and the
empty state says what was and was not found (§8).

- **`/clubs`.** A lede that answers the question in one sentence (players, schools, clubs, and the
  two clubs with the most ties), then one section per region in a fixed order (San Francisco, the
  Peninsula, the South Bay, the East Bay, Marin, the Central Coast, then the rest; §24.12 adds the
  Southern California areas before the rest, and scopes each section to its half of the site), then "How
  players are matched" (`#how-matched`): who is listed, the linking rule, the two-pass check and
  its date, what "current", "earlier" and "listed by" mean, and that recall is partial. Each club row: the
  display name linking its page, the full name and city, the count of tied players (current and
  earlier stated apart when both exist: "10 players: 2 current, 8 earlier or not known to be
  current"), and their schools.
- **`/clubs/[slug]`.** Identity (the display name with the full name under it in the same h1, the
  city and region, the founding year, the description, the website as an external pill), then
  "Players from tracked high school rosters", then "Teams and programs" when the club lists any,
  then "Where this comes from": the club's own roster pages and the other pages the record was read
  from ("Pages about the club"; a roster page is listed once, under the rosters, not again there),
  with a sentence saying that only tracked players are named here (and, where the club has a public
  roster, that it lists many more players than this page does). Each player row: the name; the
  school linking `/teams/<slug>#roster`, the grade and the club team when known; the status (§17.3);
  and the source links. The list's lede says recall is partial, as the empty state does. In "Teams
  and programs", the page most programs were read from (when two or more were) is linked once, under
  the list ("Listed on the club’s site: Programs overview", or "Programs without a link of their own
  are listed on the club’s site: …" when some rows keep one); a row links its own page only when
  that page is another. Each link's accessible name is its own: a row's leads with the program ("U19
  Hawks Blue: SportsRecruits team page"), the shared one with the section ("Teams and programs:
  Program overview"), so it never reads as the same-named link under "Pages about the club".
- **Links in, not nav.** The tab bar and the desktop nav are unchanged and light nothing on these
  pages. `/clubs` is linked from `/teams` (one quiet line), from the Roster section of every team
  page (the "Club teams" header action, §17.4), and from `/about`'s sources (`#clubs-coverage`).
  A club page's eyebrow links back to `/clubs`.
- **Metadata** follows the team pages: a club page's title is the club's full name (its og:title
  the display name), and its description names the club, its city and how many tracked players
  are tied to it, and ends "Unofficial and incomplete." as `/clubs`' does. No title or description
  names a player.

### 17.2 Privacy posture

The players are minors, so the pages are narrower than the data:

- **Only rows on the tracked varsity rosters are named**, joined on team slug + MaxPreps athleteId
  and shown under the roster's own spelling; JV rows are out. A club's own roster names many more
  players: the club page links it and names none of them.
- **A source's verbatim quote, an affiliation's `basis` and its `confidence` are never rendered.**
  They are not in the view types (`components/clubs/club-view.ts`), and `scripts/assert-copy.ts`
  fails the build on any page whose text, entities decoded and RSC payload included, contains a
  basis, a whole fragment of a quote of 40 or more letters and digits, or an excerpt of one that long
  in which at least 20 letters and digits are not public names (schools, clubs, colleges, cities,
  rostered players: `scripts/public-terms.ts`), so a truncated quote is caught too while a school
  printed beside its city is not (`affiliationLeaks`, also run by `tests/ui/club-view.test.ts` over
  the rendered routes). Both can name people who are not on the rosters. The one thing excused is a coincidence: a page not built from the clubs file that prints
  and cites the very document a quote copies (`/history/2025-26` prints the SCVAL all-league PDF,
  which four quotes cite) is not leaking it.
- **Metadata names no player.** A title or description travels further than the page.
- **Link labels are never read from a URL path**, only from the source kind and the host ("NCSA
  profile", "club roster", "Gilroy Dispatch"), apart from page-type tests (`/athlete/`, `/roster`,
  `/organization/`). A label stays true when a page moves, and a name in a slug is never printed.
- **Club records name no individual** (no coaches, no directors), and no source is social media.

### 17.3 Status words

Status is always written out, never a color or an icon, and "listed" is the third state: a club a
source names without saying whether the player is still with it is never worded as current,
whatever date the source gives.

| `asOf` | current | past | unknown |
|---|---|---|---|
| a day, month or year | Current, as of Jul 8, 2026 | Earlier, Jul 18, 2025 | Listed by the Gilroy Dispatch, Jul 18, 2025 |
| a season | Current, 2025-26 season | Earlier, 2024-25 season | Listed by NCSA, 2024-25 season |
| a range | Current, 2025–2026 | Earlier, 2019–2022 | Listed by NCSA, 2015–2018 |
| none | Current | Earlier | Listed by NCSA; no date given |

"Listed by" names the source whose own date is the `asOf`, else the first source. On a club page
the player list is split into "Current" and "Earlier" ("Earlier, or not known to be current" when a
listed tie is in it), with h3 labels only when both groups exist; each row states its own status
either way.

### 17.4 The roster club line

A player a public page ties to a club gets one line between the facts and the profile links:
"Club: SF Hawks", "Club: NorCal Impact · Earlier clubs: Fly FHC, Lightning", "Listed club: Fly
FHC". Groups run current, listed, earlier; within a group, the latest tie first. It is its own line,
like the profiles line, so it never dangles. The links are internal, to the club's page on this
site, with the `sx-action` box and no arrow; the visible label is `aria-hidden` and each link's
accessible name leads with the player ("Storey Lewis’s club: SF Hawks"). A footnote appears on any
roster with a club line: club lines link to the club's page, which cites a source for each player;
what a "listed club" is (only when one appears); and that recall is partial. The Roster section
header carries a "Club teams" action to `/clubs` on every team page, empty rosters included.

### 17.5 Layout and accessibility

Lists, not tables (§10.8): the club index and the player, program and source lists are the roster's
grid card and reflow at 320 px and 400% zoom. Nothing long is `nowrap` (the status line, the
schools line, HTC's city and every source title wrap); only short facts and short labels are. The
index link and the section action are 44 px tall on a phone; every other standalone or in-row link
carries `sx-action`. Each section is a `<section aria-labelledby>` with a `SectionHeader`, and no
heading level is skipped. Regions follow the fixed order of §17.1 and, within a region, the clubs
with the most tied players come first, then by name: a reader meets the clubs that answer the
question first, and the first club page in the sitemap is the longest (`/clubs/sf-hawks`).
`scripts/a11y-axe.mjs` checks `/clubs`, that page and the first club page with no tied player
(`/clubs/pac-heights`) in both themes at both widths. Nothing on these pages is a client component.

### 17.6 Not built, and deviations

- **No nav item, and no nav lighting** on the clubs pages (the navigation is unchanged).
- **No OG card.** The pages take the root card (`ROOT_OG_IMAGE`), so there is no page/image parity
  to assert for them.
- **No per-row confidence mark.** Medium-confidence ties are explained in words on `/clubs#how-matched`,
  and every row links the pages it rests on.
- **Aliases are not shown.** They mix team names ("U19 Hawks Blue") with club names, and one is a
  lacrosse club's name; `docs/DATA-SOURCES.md` §1.1j2 records the ones that matter.
- **"Teams and programs", not "Teams the club runs".** The clubs' lists include tournaments, camps,
  clinics and private lessons, which are not teams.
- **No budget for `/clubs`.** The page-weight budgets (§15.10) do not cover every index page
  (`/about` and `/history/2025-26` have none), and `main` has no `/clubs` baseline to measure
  against.

## 18. Teams and standings amendment (2026-10)

The phone's Table tab and Teams tab showed the same 43 teams in the same grouping (section → league
→ division, with the same anchors), one as standings and one as tiles to find a school in. They are
now one page, `/teams`, and the freed tab goes to the leaderboards. This section wins where §1-§17
disagree.

### 18.1 The page

`/teams` ("Teams and standings") keeps its search box and league chips, and under each division the
team tiles are replaced by that division's compact standings table: place (`T7` when shared), team
(monogram and short name, a link to the team page), GP, W-L-T, PTS, the league's labelled ladder
line, and a `Full <division> table →` link to `/standings/<league>#<division>`. It is the
/standings overview's own table, built by the same view (`buildOverviewDivision`) and drawn by the
same block (`OverviewDivisionBlock`: the h4, the table and the link), so the two pages cannot
disagree about a place. Every registry team is a row; a team with no results is listed
last with dashes, never 0-0-0.

The search filters the tables in place: it hides the rows that do not match (`data-team-tile` on
each team row), the ladder rows while a query is active (`data-hide-while-searching`, since a ladder
line means nothing between filtered rows) and any division, league or section left with no visible
row. Without JavaScript the search is not painted and the full tables are the page.

`/standings` and `/standings/<league>` stay as they are: the overview keeps its old anchors for links
in the wild, and the league pages are where every table's full view lives.

### 18.2 Navigation

| | Before | Now |
|---|---|---|
| Phone tabs | Home, Scores, Table, Teams, Playoffs | Home, Scores, Teams, Leaders, Playoffs |
| Desktop nav | Home, Standings, Schedule, Teams, Leaders, Playoffs, History, About | Home, Schedule, Teams, Leaders, Playoffs, History, About |

Teams is lit (`aria-current="true"`) on every `/standings` page as well as on team pages, and it
follows the league the way Table did: after hydration it points at the page's league, else the
remembered one, as `/teams#<league>`, that league's tables. Leaders' glyph is a podium (1st in the
middle), not a bar chart, which would read as statistics. "Leaders" is about 50px at 12px/500
against the 56px label limit. The footer's "Season leaders" link (§16.3) is gone: the phone has
the tab now.

With seven links the header goes back to its spacing before §16, measured in Chromium with the
widest stamp ("Updated Nov 30 12:48 PM") forced in: 10px capsule padding below 1024px, the stamp
back from 896px with about 33px to spare, and its weekday from 1024 (about 95px to spare).

### 18.3 Budgets

`/teams` HTML gzip stays within 3.0 x its baseline: 24.3 KB on 2026-10-03 (it was 23.2 KB with the
tiles), against 28.4 KB.

## 19. Probabilities amendment (2026-10)

The site was designed to show no probabilities anywhere, because it had no model to compute them
from (§3.8, §6.1, §6.2, §7.11). The owner retired that rule on 2026-10-03, ahead of team ratings
fitted to the season's results. This section wins where §1-§18 disagree. Everything else stands:
a status is still a written word, never a color alone (§7.11, WCAG 1.3.1), nothing on the site is
official, and the copy rules of §15.8 apply to any new number.

### 19.1 Decisions this reverses

| Earlier decision | Now |
|---|---|
| §6.2 "Playoff-berth probability bars. *Nothing.* We have no probability model." | No longer ruled out, and not built. A berth probability needs a model of the games still to play; until one exists, the `BerthMeter` and the projection's written statuses are the playoff picture. |
| §6.1 the playoff projection is a table of status words because "we have no probability model" | Still a table of status words, because a team's place under its league's by-laws is a categorical outcome. The "no model" reason is withdrawn. |
| §7.11 "There are **no percentages anywhere**, because there is no model" | Withdrawn. The projection card keeps its written statuses and its "Nothing here is official" cap. |
| §3.8's wireframe line "No probabilities — we have no model." | It describes `/playoffs` as it is: see 19.2. |

### 19.2 What a probability must be

A probability may appear where a model the site documents computes it from the snapshot's results.
It is never invented or entered by hand, it reads as an estimate, and its page links to how it is
computed, as the standings link to their rules. It never replaces or reorders a by-law status: a
place in a table, a berth and a seed come from the league's rules alone.

`/playoffs` still says "There are no probabilities on this page, because there is no model behind
it", which stays true while no model feeds that page. A change that puts a probability there
rewrites that sentence in the same commit.

## 20. Elo ratings amendment (2026-10)

Every team gets an Elo rating: on its own page, and the ten highest on `/leaders`. This section
wins where §1-§19 disagree. Everything else stands: static rendering, "today" from the snapshot,
no new hue (§6.4, §15.5) and no new chart (decision 8: the rating is a card and a table). It is the
first number on the site that comes from a model, so it keeps §19.2: computed from the snapshot's
results by a documented model (`lib/ratings.ts`; README "How Elo ratings are computed"), read as
an estimate, linked to its method, and never a status: it orders no table, berth or seed.

### 20.1 The rating

Elo points (1500 is the average rated team; 400 points is about 10-to-1), fitted to the whole
season at once rather than game by game, because one season of about ten games a team leaves
classic Elo near where it started. The fit is least squares on goal margin capped at 5, with a home
edge where a game has a host, and each team starts from its rating over last season's finals
(`data/prior-season.json`, read once a season by `pnpm fetch-prior-season`), carried over in full
and counting for one game. 175 points is a goal: the value that best fits Elo's expected-score
curve over two replayed seasons. It counts every final between two of the 43 teams and nothing
else: no forfeit, no game against a school outside the four leagues, this season or last. A given
snapshot always builds the same numbers (one linear solve in a fixed order).

Replayed day by day, each day predicted from only the games before it, the start from last season
raised the winners picked from 79% to 89% in 2026 (through Oct 2) and from 84% to 88% in 2025-26;
the README's "How Elo ratings are computed" has the rest. No page prints a win probability for a
game; the board's note says only what a 400-point gap means on the scale.

### 20.2 Where it shows

| Place | What |
|---|---|
| Team page, under the stat tiles (`#elo`) | **Collapsed on purpose.** A closed disclosure under "How these numbers are counted", whose summary says only "Elo rating": a family checking its team's page meets the record first and never a low number it did not ask for. Opened: "<rating> points · <where it stands>" (the team's place on the board when the board lists it, "preseason, from 2025-26" before its first counted final, "provisional, from N games" below the board's minimum, otherwise "from N games"), a sentence or two on what the number means, and `How it is computed` → `/leaders#elo-rating`. A team with neither a final this season nor one last season reads "Not rated", never 1500. A team page never names a place below the board's top 10. `#elo` is the `<details>` itself, so a board link lands on the summary in every browser. This is the one team-specific fact in a disclosure, against the rule that keeps them for generic legends and methodology: the owner's choice, because the rating is an estimate and not a result. |
| `/leaders`, last school board (`#elo-rating`; first until §23) | "Highest Elo rating": the top 10 places (standard competition ranking, as every board), GP (games counted) and Elo, each row linking to the team's `#elo`. The minimum is the record boards' rule over this season's games the fit counts (half the median, rounded up); the teams that have played but are under it are named in the section's notes. The board's note says how the rating is computed, including the home edge it found and the season it started from. |

### 20.3 Budgets

`/leaders` gains a tenth board of at most 15 rows and stays inside its 1.0 × standings HTML budget
(§16). The team page gains one closed disclosure of about 800 bytes of HTML before gzip. The server bundle gains
`data/prior-season.json` (about 100 KB raw, one line per game), which no page sends to a browser.

## 21. College commitments amendment (2026-10)

The site gained college commitments: which players on the tracked varsity rosters (43 then, 49 with
the EAL) a public page says have committed to play a sport in college, and where. It began with
field hockey only and took in every sport on 2026-10-04 (§21.7). The data is `data/commits.json`,
research done by hand and checked twice (`docs/DATA-SOURCES.md` §1.1j3, README "College
commitments"); nothing refreshes it. It follows the clubs amendment (§17) wherever the two could
differ: the same matching rule, the same privacy posture, the same row and list layout. This section
records what is new and where it departs.

### 21.1 The page and what it answers

| URL | Answers | Pages |
|---|---|---|
| `/commits` | "Who here has committed to play in college, and where?" | 1 |

Static, one page, no dynamic segment. A lede that answers the question in one paragraph (how many
players from how many schools have committed to how many colleges, at which levels and in which
sports: "Of them, 4 committed to NCAA Division I programs, 1 to an NCAA Division II program and 2 to
NCAA Division III programs. By sport, 5 in field hockey, 1 in lacrosse and 1 in soccer"; with one
sport, the sport goes in the level words instead: "all NCAA Division I field hockey programs"), then
one section
per class year (`#class-2027`, `#class-2028`; the earliest class first, `#class-unknown` last for a
player no source or roster gives a class year), then "Colleges" (`#colleges`; both now per region
with a region prefix, §21.8), then "How
commitments are matched" (`#how-matched`): who is listed, the linking rule, that social media is
never used (so a commitment announced only there is not listed), the two-pass check and its date,
what "Committed", "Signed" and the "as of" date mean, and that recall is partial.

- **A commitment row** (`#<team slug>-<MaxPreps athleteId>`, never a name): the name; the school
  linking `/teams/<slug>#roster`, then the grade; the college (its display name, the official name
  when the display name is a short one, the sport, and the division of the college's team in that
  sport, in words); the status (§21.3); and the
  source links, labelled by kind and host. Within a class, rows run by school, then by the roster's
  name order.
- **A college row** (`#college-<slug>`, now `#<region>-college-<slug>`, §21.8): the display name, the official name, the place
  ("Stanford, CA"), then one line per program a player here committed to (the sport, its division
  and its conference when it has one: "Field hockey · NCAA Division I · ACC"), how many players here
  committed there and from which schools, and each program's page on the college's own athletics
  site ("Stanford field hockey", "St. Lawrence soccer", off-site links). Colleges with the most
  players come first, then by the highest level of any of their programs here (Division I before
  II, III and NAIA), then by name.
- **Nothing found** is a real state: the lede says no public page we found shows a commitment, one
  empty state stands where the classes would be, and the colleges section is left out.

### 21.2 Privacy posture

§17.2 applies unchanged, with `data/commits.json` for `data/clubs.json`:

- **Only rows on the tracked varsity rosters are named**, joined on team slug + MaxPreps athleteId
  and shown under the roster's own spelling; JV rows and graduates are out. A commitment list or a
  news story names many more people; none of them appears.
- **A source's quote, a commitment's `basis` and its `confidence` are never rendered.** They are not
  in the view types (`components/commits/commit-view.ts`), and `scripts/assert-copy.ts` fails the
  build on any page that shows a basis, a quote fragment or an excerpt of one (`commitmentLeaks` in
  `scripts/copy-rules.ts`, the clubs rule with the same thresholds, public names and `printsItself`
  excuse), also run by `tests/ui/commit-view.test.ts` over /commits, the team pages and /about.
- **Metadata names no player**, and **link labels are never read from a URL path** beyond the
  page-type tests (`/athlete/`, `/athletes/`, `/athletic-scholarships/`).
- **No social media**, as source or link. This costs recall more than it did for clubs: many
  commitments are announced only on Instagram. The how-matched section says so.

### 21.3 Status words

Written out, never a color or an icon. "Signed" only where a source says the player signed; every
other commitment is "Committed", which the page explains as: a page says the player has committed,
and no page used says the player has signed. The date is the
earliest a source gives for the commitment, which can be a page's own date rather than the day the
player decided, so it is always "as of":

| `asOf` | committed | signed |
|---|---|---|
| a day | Committed, as of Jun 15, 2026 | Signed, as of Nov 12, 2026 |
| a month | Committed, as of Jun 2026 | Signed, as of Nov 2026 |
| a year | Committed, as of 2026 | Signed, as of 2026 |
| none | Committed | Signed |

A commitment happens on a date, so `asOf` takes no season and no range (the schema refuses them,
unlike a club tie's).

### 21.4 Links in, not nav

The tab bar and the desktop nav are unchanged. `/commits` is linked from `/teams` (a second quiet
line under the clubs one), from `/about`'s sources (`#commits-coverage`, after `#clubs-coverage`),
and from the roster of any team page that has a committed player (§21.5), which is the link a
reader is most likely to follow. A team page with no commitment gets no new link: the Roster
header keeps its one action, "Club teams". The sitemap lists `/commits` with the last day the file
was checked as its `lastModified` (`capturedAt`, or a later college `checkedOn`), as it dates the
clubs pages by their file.

### 21.5 The roster commitment line

A committed player gets one line right under the facts, above any club line: "Committed:
Stanford", or "Signed: Stanford", and, in a sport other than field hockey, "Committed: St. Lawrence
(soccer)". The college is a link to the player's row on `/commits`, which cites the sources; it is
internal, so it has the `sx-action` box and no arrow, and its accessible name leads with the player
("Pat Example’s college commitment: Stanford", "Pat Example’s college soccer commitment: St.
Lawrence"), the visible label and the parenthesized sport hidden from assistive technology, exactly
as the club line (§17.4). It comes before the club line because
it is the newer and more specific fact about the player. A footnote appears on any roster with a
commitment line: the lines link to the player's entry on the college commitments page, which cites
a source for each; "Signed" appears only where a source says so; recall is partial.

### 21.6 Not built, and deviations

- **No page per college.** A college page would hold one or two rows; the college list on
  `/commits` carries what such a page would (level, conference, place, schools, program link).
- **No nav item and no OG card**, as for the clubs (§17.6): the page takes the root card.
- **No per-row confidence mark**, as for the clubs.
- **No graduates.** Players who finished high school before the roster season are not on the
  rosters, so they cannot be joined, and naming them would break §21.2.
- **No budget for `/commits`**, for §17.6's reason: `main` has no baseline to measure it against.
- **Gates.** `assert:prerender`, `assert-vinext-prerender.ts` and `smoke-server.sh` expect
  `/commits` among the fixed pages; `a11y-axe.mjs` checks it in both themes at both widths.

### 21.7 Every sport (2026-10-04)

A field hockey player's college commitment is often in another sport: many play lacrosse in the
spring or soccer in the winter, and commit there. Leaving those out made the page answer a narrower
question than its title asks, so a commitment now carries its `sport`, and any sport counts under the
same linking rule (the page must name the sport) and the same privacy posture.

- **The sport is named where it can differ.** A /commits row and a college's program lines always
  name it; the roster line names it only when it is not field hockey ("Committed: St. Lawrence
  (soccer)"), since a field hockey site's roster need not say "field hockey" beside every line.
- **A level belongs to a team, not a college.** A college's division and conference moved into
  `programs`, one per sport a player here committed to (Johns Hopkins plays field hockey and lacrosse
  in Division I and most sports in Division III). The lede counts programs, a college's team in one
  sport, so two players at one college in two sports are two programs.
- **No sport filter or per-sport section.** The page stays grouped by class year: with a handful of
  rows per class, the sport on each row reads faster than tabs would.
- **Not a commitment**, beside §21.1's list: a place on a college's club team (club lacrosse, club
  volleyball), which a recruiting profile can show as "committed".
- **Every college sport has its words.** `COMMIT_SPORTS` lists every sport the NCAA, NAIA and NJCAA
  hold a championship or an emerging-sport program in, plus squash and sailing, each with its words
  in `SPORT_WORDS` ("acrobatics and tumbling", "flag football"); the type checker keeps the two lists
  together, so a sport colleges add later is added to both.

### 21.8 NorCal and SoCal (2026-10-07)

With the Southern California commitments in (§24.12), one list by class year mixed two halves of the
state a reader rarely wants together. `/commits` now takes the `/recruiting` pattern (§25.1):

- **The `RegionSwitcher`** (the §24.3 pattern) sits under the page header, and each region's
  commitments sit in one `<div id="norcal|socal" data-region-scope>`, so a reader sees their own half;
  without JavaScript both render, NorCal first. A commitment's region is its school's league's
  (`commitRegion`, `components/commits/commit-view.ts`).
- **Each block** opens with the region's count sentence, the lede's counts for that half ("Southern
  California: 12 players from 7 schools have committed to 10 colleges. Of them, …"; with none, "no
  public page we found shows a commitment by a player here yet", and nothing else), then one h2 per
  class year (`#norcal-class-2027`, `#socal-class-unknown`), then that region's "Colleges"
  (`#norcal-colleges`).
- **A college row is per region** (`#norcal-college-<slug>`, `#socal-college-<slug>`): a college players
  from both halves committed to has a row in each, with only that region's programs, players and
  schools, and colleges sort by the region's own counts (then level, then name, as §21.1).
- **Unchanged:** the lede and `#how-matched` stay site-wide, and a player's row keeps its id
  (`#<team slug>-<athleteId>`), so a team page's commitment line still lands on it; a row in the hidden
  region opens its block (`:has(:target)`). With no commitment in the file the one empty state stands
  alone, with no switcher.

## 22. Eastern Athletic League amendment (2026-10)

The site gained a fifth league, the **Eastern Athletic League (EAL)**, in a third section, the CIF
Northern Section: six teams in one division (Bella Vista, Chico, Corning, Davis, Lassen, Pleasant
Valley), so it now covers **five leagues and 49 teams** in three sections. This section wins where
§1-§21 disagree. Everything else stands: static rendering, no `searchParams`, leagues get no hue
(§15.5), the copy rules of §15.8 (extended in §22.5). The rules, sources and dates behind it are in
`docs/LEAGUE-RULES.md` (EAL section) and `docs/DATA-SOURCES.md`; every fact below is a captured or
sourced one, dated 2026-10-04 unless it says otherwise.

### 22.1 Decisions this reverses

| Earlier decision | Now | Why |
|---|---|---|
| 43 teams, four leagues, two sections (§15; six MaxPreps league tables) | **49 teams, five leagues, three sections** (CCS, NCS and the Northern Section, `ns`); seven MaxPreps league tables. The EAL is last in `LEAGUES`, so every existing order stays put. | The EAL's six teams. Red Bluff, still a 0-0-0 row in MaxPreps' EAL table, is not fielding a varsity team in 2026 and is left out as Wilcox and York are. |
| Every league has an official schedule that decides which games are league games | The EAL has none: `official.mode: 'none'`. Its league games are the games MaxPreps marks as league games, as for SCVAL. "League result missing" is defined without fixtures: a game MaxPreps counts for the division, dated before today, with no counted result (a postponed one reads as postponed). | The Section's Guidelines are the only EAL document and they contain no schedule or standings; the Section's field hockey page has empty panels and there is no league website. The one grid found, on the EAL/SRL umpires' site, equalled MaxPreps' 30 league games, but it is not an official document, so it is never called official, linked or bundled. |
| A varsity league game may end in a tie (§15, the four leagues) | An EAL game ends on 1 v 1s. MaxPreps records a 1 v 1 win as a level score with a W flag for one team and an L flag for the other, so the game gets decider `SO`, no stored tally, and the flags decide the result everywhere (`sideOutcome` in `lib/format.ts` is the one W/L/T helper). Snapshot invariant 4 is now one-directional: shootout data exists only when the decider is `SO`, and an `SO` game may carry no tally. | Guidelines §VII.E.4: a varsity game gets one 10-minute sudden-victory period, then 1 v 1s until there is a winner. Chico 1, Davis 1 (2026-09-28) is the one such game so far; MaxPreps' standings count it as a Chico win. Goals stay as recorded, so it adds a goal for and a goal against to each side. |
| Two postseason kinds: a CCS ladder and a league tournament with a bracket | Three: `'unbracketed-tournament'` states the rule and the dates, ranks nothing into a bracket and draws none. | The Super Regional's format and seeding are the coaches' to set and no bracket is published (Guidelines §IV). |
| Every division draws a ladder line | `ladderLine` may be null. The EAL has none: all six teams sit inside the top six. | Six teams, six qualifiers. A line would sit after the last row. |
| MaxPreps' table has the registry's teams, less any it leaves out | It may also hold rows that are known not to be members: `maxprepsExtraRows` (EAL: Red Bluff). The rule is `maxprepsTeamCount + maxprepsMissing.length − extra rows = expectedTeams` (7 + 0 − 1 = 6). | Red Bluff's row would otherwise raise an unknown-school warning on every run. |
| `Team.section` is the school's CIF section | It is the section of the team's field hockey league, where its field hockey postseason is held. `LeagueConfig.membershipNote` says so where it matters. | Davis and Bella Vista are Sac-Joaquin Section schools that play field hockey in the EAL; the Section's own 2026-27 member list names neither. |
| Every league's document orders the table by points | `LeagueRules.orderScope` is `'table'` (the four earlier leagues) or `'title'` (the EAL): its document uses points only to decide the champion, gives no rule for ordering the league table and publishes no standings, so this site orders the table by the same points as its own computation and says so. | Guidelines §VII.C.2 and §VII.C. A table order looks like a league ruling unless the page says whose it is. |
| Scope note: "Teams from other sections appear only as opponents" | "Teams outside these five leagues appear only as opponents." | With Davis and Bella Vista in the registry, the old sentence would have been false. |

### 22.2 Routes and counts

| URL | Now |
|---|---|
| `/standings/[league]` | 5 pages |
| `/schedule/[league]` | 5 pages |
| `/teams/[slug]` | 49 pages |
| `/playoffs/[league]` | unchanged: MCAL only. `/playoffs/eal` and its OG card are 404s, like `/playoffs/scval`. |
| `/playoffs` | stays the CCS page and gains an EAL card with `id="eal"`, so the EAL chip and jump link resolve |
| `/standings` | anchors `#ns` and `#eal` as well as the §15.2 list |
| `/history/2025-26` | gains `#eal`, marked unavailable with the reason (22.7) |

The prerender after `pnpm build:vinext` on 2026-10-04 (49 teams, 396 games, 57 game days) is 1059
routes. The sitemap lists 536 URLs: 10 fixed pages, 396 `/game/`, 57 `/scores/`, 49 `/teams/`, 5
`/standings/`, 5 `/schedule/`, 1 `/playoffs/mcal` and 13 `/clubs/`. The clubs follow-up (§22.9) adds
three club pages: the sitemap then lists 539 URLs (16 `/clubs/`), and the prerender after
`pnpm build:vinext` is 1062 routes.

### 22.3 The third section in the switcher and the five league cards

`LeagueSwitcher` is unchanged in kind (§15.4): the chips are All and five leagues, in **three**
lists labelled for assistive technology ("Central Coast Section", "North Coast Section", "Northern
Section"), with no visible caption. The home "Find your team" grid is two columns from 390 px; with
five cards the last one spans both columns (`min-[390px]:col-span-2`, applied when the count is
odd), so the grid reads 2 + 2 + 1, never an orphan half-card.

Measured on the home page with no stored league, identical on `next start` and `vinext start`
(`scripts/a11y-axe.mjs`, 2026-10-04; wrapping is accepted):

| Viewport | Switcher | Cards | Wholly above the fold |
|---|---|---|---|
| 320 × 664 and 320 × 844 | wraps to 2 rows, bottom at 254 px | one column, 288 px wide, at 426-702, 714-1006, 1018-1270, 1282-1554 and 1566-1838 | 0 at 664 tall, 1 at 844 tall |
| 360 × 664 and 360 × 844 | 2 rows, bottom at 254 px | one column, 328 px wide, at 426-678, 690-910, 922-1122, 1134-1334 and 1346-1566 | 0 at 664 tall, 1 at 844 tall |
| 390 × 664 and 390 × 844 | 1 row, bottom at 204 px | two-up, 173 px wide: cards 1-2 at 376-732, cards 3-4 at 744-1060; card 5 spans both columns (358 px wide) at 1072-1272 | 0 at 664 tall, 2 at 844 tall |

When the switcher wraps, the Northern Section's list (EAL) moves to row 2 on its own. The hairline
in front of a section is drawn by that section's list (a `::before` on its `<ul>`), not as a
separate flex item, so it moves with the list and starts row 2. It is never left at the end of
row 1 (`tests/ui/league-switcher.test.ts`). Row positions and heights do not change.

The §15.6 fold targets, read from the same run: with a team pinned (Tamalpais) at 390 × 664 the
My-team slot ends at 604 px against a fold of 608 px, so that target is met. With a team pinned at
390 × 844 the Latest rows end at 925 and 1009 px, so none is above the fold, and with no pin and
`league=bval` at 390 × 664 the first Latest row sits at 676 px, also below it. Both misses are
reported by the script, not failed, and they were not compared with the four-league tree.

### 22.4 EAL postseason surfaces

The Super Regional (Oct 30–31; the top six EAL/SRL schools; format and site not published; no NorCal or
State path) has no bracket, so every surface that would show one states the rule and the dates
instead. The seeding text of Guidelines §III.E.1 is quoted on `/about` as written and **never
applied**: no seeding projection, no seeded bracket and no seed word anywhere for the EAL.

| Surface | What it says |
|---|---|
| Home `PostseasonCard` | kicker "Postseason"; "Super Regional, Oct 30–31 — the top six qualify"; the league's note; link "Postseason →" to `/playoffs#eal`. No berth meter and no CCS date. |
| Home phase lead, tournament phase | "The Super Regional is Oct 30–31; its format and site are not published yet." (the "playoffs" lead is for CCS leagues only) |
| `/playoffs` EAL card | "Following an EAL team?" and the league's note, the qualification citation, and a link to the Guidelines PDF |
| Team page | kicker "Super Regional picture"; "The top six schools play the Super Regional, Oct 30–31; its format and site are not published yet."; with no result yet, "in the Super Regional picture" |
| `/standings/eal` band | heading "Super Regional, as things stand", link "Postseason" to `/playoffs#eal`, legend the qualification citation; no 2 px rule, since there is no line |
| `/schedule/eal` rail chip | "Super Regional Oct 30–31" (to a screen reader "Super Regional, Oct 30 to 31") |
| Game page, a game between two EAL teams on or after Oct 30 | "Super Regional game — it does not count in the league table."; the tag reads "EAL Super Regional" |
| Top nav "Playoffs" for an EAL reader | `/playoffs#eal` |

### 22.5 Copy rules

§15.8's "no CCS concept inside an MCAL page's `<main>`" becomes: no CCS concept (no "automatic
qualifier", "at-large", "CCS Division", "CCS picture", "holds N of 16", bare "CCS" outside the allowed
MCAL link) inside any non-CCS league's page and the `/playoffs` EAL card. No division label appears on
EAL pages. Five more rules (`scripts/copy-rules.ts`, run by `scripts/assert-copy.ts` over the visible
text of every built page and over its `<title>`, description metas and `title`, `aria-label` and `alt`
attributes (`attributeText`: what a link preview prints and assistive technology reads), and by
`tests/ui/copy-honesty.test.ts` over every view model, which also runs a second pass over the EAL
corpus):

1. **The umpire grid is never "official".** A sentence that mentions an umpire and "official" fails.
2. **Davis and Bella Vista are never a "Northern Section school" or "member".** A clause that names one
   of them and says so fails.
3. **Red Bluff is only "not fielding a varsity team in 2026".** "Cancelled", "withdrew", "dropped" and
   "no program" near its name fail: MaxPreps shows a Red Bluff JV game in 2026, so there is a program.
4. **Never "EAL school(s)" or "EAL member(s)".** "EAL" always means the field hockey EAL/SRL grouping,
   not the all-sports EAL, which is a different set of schools (the Section's 2026-28 realignment lists
   Chico, Enterprise, Foothill, Pleasant Valley, Red Bluff and Shasta; Corning is in the Westside
   League and Lassen in the Northern Athletic League). Copy says "EAL teams".
5. **No seed words on EAL pages** (standings, schedule, team pages and the `/playoffs` card): no
   "1st seed", "No. 1 seed", "#1 seed", "a 3-seed", "top seed", "top-seeded", "the sixth seed", "the
   lowest seed", "seed No. 1", "seeded third" and the like. The Super Regional takes six teams, so the
   rule covers the ordinal words through "sixth", wider than the first pattern (ordinal digits,
   "No. N", "top", "first", "second"). "Seeding", "seeds are set" and "the top six" pass.

The **membership note** ("Chico, Corning, Lassen and Pleasant Valley are Northern Section schools;
Davis and Bella Vista are Sac-Joaquin Section schools that play field hockey in the EAL.") is printed
wherever the six EAL teams' schools are listed under a section or league heading: under the header of
`/standings/eal`, in the EAL block of `/standings` and of `/teams`, and on the `/about` EAL source card.
The home league card ("NS · 6 teams") and the search group label the league's section, a league-level
fact, and carry no school claim and no note. Team pages print no section.

### 22.6 Budgets

Measured after the change (`next build` with `SCVAL_BUILD_AT` 2026-10-04T12:00:00Z), gzip bytes, from
the four-league tree to this one (the two trees also differ in data):

| Page | Before | After | Limit |
|---|---|---|---|
| `/` HTML | 49,255 | 52,466 | 56,214 (2.2 ×; 93%) |
| `/` RSC | 29,100 | 31,908 | 34,747 (92%) |
| `/standings` | 19,842 | 21,701 | — |
| `/schedule` | 34,943 | 39,113 | — |
| `/teams` | 25,316 | 27,546 | 29,043 (3.0 ×; 95%, the tightest) |
| `/playoffs` | 28,349 | 29,585 | — |
| `/leaders` | 29,187 | 29,545 | — |
| `/standings/eal` | — | 24,840 | 41,410 |
| `/schedule/eal` | — | 51,762 | 150,555 |
| Largest team page (Tamalpais) | 41,576 | 41,605 | 58,086 |

The EAL's team pages are 28,496 (Corning) to 37,276 bytes (Davis). First-load client JS changed by at
most 49 bytes on any route (`/` 504,322 to 504,371, against a limit of 515,098; `/teams` 485,628 to
485,650, against 490,367), so no league config reaches a browser bundle. The serialized home team views
are 51,215 bytes on `data/snapshot.json` for 49 teams (budget 61,440). `data/snapshot.json` is
979,296 bytes (limit 1,600,000), and the Cloudflare Worker is 1805.5 KB gzip against 1992.2 KB. **No
multiplier was raised.** `tests/golden/page-weights-main.json` is untouched.

The `dist/server/prerendered-routes` folder is 163,011,433 bytes (537 `.html`, 536 `.rsc`, 522
`.route`); twice that is 326,022,866 bytes against `cacheMaxMemorySize` of 384 MB (402,653,184 bytes,
2.47 ×), so the setting stays.

### 22.7 Data and history

- **Snapshot compatibility.** A schema-version 2 file written before a configured league existed still
  loads: `loadSnapshot` adds the missing league (its teams, section, standings rows and a `degraded`
  health row that says the file predates it) and re-resolves every game side. The committed
  `data/snapshot.json` was regenerated by `pnpm fetch-data` on 2026-10-04 (`fetchedAt`
  2026-10-04T13:04:21.846Z) and loaded through that upgrade with no `--accept-regression`.
  `tests/fixtures/corpus/variants/finals-regression/previous-snapshot.json` is **frozen**: it stays a
  four-league file and exercises the upgrade in the pipeline tests.
- **The regenerated snapshot** holds 49 teams and 396 games (294 league, 228 finals, 6 pending, 3
  backfilled). The EAL's 40 games include 30 league games and 21 finals. EAL health is `fresh` with 6 of
  6 team feeds ok; two missing league results are reported (the two games MaxPreps holds without a score:
  2026-09-29 Pleasant Valley at Corning and 2026-10-01 Corning at Chico).
- **Corpora.** `tests/fixtures/corpus/all-2026-10-02` was not extended: under it the EAL is "not
  fetched in this run", as BVAL, PCAL and MCAL are under the `scval` corpus. A new corpus,
  `tests/fixtures/corpus/eal-2026-10-04` (19 files: the manifest, 1 bootstrap, the league meta and standings, 6
  schedules, 7 si.com scoreboards, 2 si.com team-games pages), was captured live and replays with no
  missing resource; it drives `tests/pipeline/eal.test.ts`, the EAL view tests and the second
  copy-honesty pass.
- **History 2025-26: `unavailable`** (`data/history-2025-26.json`, `leagues.eal`, checked 2026-10-04).
  The EAL published no 2025-26 final standings of its own, the Section's field hockey page and Playoff
  Center post none, and the site does not show standings from newspapers or third-party sites. The
  three pages checked are listed on the card.
- **Prior season and Elo.** `data/prior-season.json` was refetched for all 49 teams on 2026-10-04: 412
  finals, 31 of them between two EAL teams and 13 between one EAL team and another registry team
  (Pleasant Valley 4, Chico 3, Bella Vista 3, Davis 3; Corning and Lassen have none). Those 13 games
  connect the EAL to the other leagues for the Elo fit (§20); a game decided on 1 v 1s is level there,
  because the fit uses goals. §20.1's "43 teams" is the figure of the replay dated 2026-10-02, not the
  size of the fit now.

### 22.8 Not built, and deviations

- **No EAL bracket and no seed projection.** The Guidelines' seeding text is quoted, never applied
  (22.4).
- **1 v 1 tallies are not shown.** MaxPreps' box score keeps a "SO Win" column in slot `b7` (seen on
  one game: Chico 2, Davis 1), but the repo parses no box-score slots and the mapping is confirmed on
  one game only. Storing it is a later option, once it is confirmed on more games.
- **Impossible overtime counts are shown as MaxPreps has them, with a caveat.** MaxPreps records 3
  overtime periods on the 1-0 Pleasant Valley at Chico game of 2026-09-02, but the EAL plays one
  overtime period and then 1 v 1s; the game page says MaxPreps may have recorded a 1 v 1 win as a goal
  and shows no overtime mark. That reading rests on one newspaper report, so the copy says only "may
  have".
- **Club records for D-City FHC (Davis), Roseville FHC and Chico Hotshots came in a follow-up
  (§22.9).** The 2026-10-04 sweep found these clubs near the six EAL teams' schools; all three were
  added the same day, with five more ties. Three
  Davis players were tied to the existing NorCal Impact club (NFHCA 2026 high school watchlist,
  2026-08-27). No college commitment was found for any EAL player: a field hockey sweep, then the
  same day's every-sport round (§21.7), first run over the 43 earlier teams and then over the EAL's
  95 varsity rows, found none (`docs/DATA-SOURCES.md` §1.1j3; the same day's recruiting-profiles
  research ran SportsRecruits' profile probe for those rows in every sport and NCSA and FieldLevel
  probes for field hockey, but SportsRecruits' athlete search was not run for them).
- **No school-athletics enrichment sweep for EAL rosters.** `data/rosters-enrichment.json`'s six EAL
  entries hold players' own recruiting pages only (swept 2026-10-04: 33 profiles for 29 players, none
  for Bella Vista or Corning) and say the school-athletics roster sweep (grade, height, number,
  position, coaches) has not been done. Corning has no roster or player stats at MaxPreps on
  2026-10-04 (roster `empty`, stats
  `none`).
- **`/clubs` stopped dating its checks.** Its sentence "each was checked twice on {capturedOn}" now
  reads "each was checked twice, in two separate passes, when it was added.", because the old one
  would have dated the three Davis ties, added on 2026-10-04, to 2026-10-03. The clubs file holds one
  `capturedAt` (2026-10-03, the first sweep); later work appears in its notes and in each record's
  `checkedOn`. A club page dates only its own record: Oct 3, 2026 on the 2026-10-03 records, and Oct
  4, 2026 on D-City's, Roseville FHC's and Chico Hotshots' (§22.9). `/about` drops the date in the
  same way.
- **The form-strip chip for a 1 v 1 game** reads as a loss for the losing side with the score 1–1;
  the 1 v 1 wording is on the game page and the "Earlier" line.
- **`/about`'s counts sentence prints the weekday** ("Games between two EAL teams on or after Fri
  Oct 30 are Super Regional games."), as the existing official-fixtures sentence does.

### 22.9 Clubs near the EAL teams' schools (2026-10-04)

Three club records were added on 2026-10-04 from the clubs the EAL sweep met: **D-City FHC** (Davis,
founded 2019, a spring club at the UC Davis field), **Roseville FHC** (Roseville, founded 2024) and
**Chico Hotshots** (Chico, a TeamLinkt club listing U12-U19 and adult teams for spring 2026). Each was
read from its own site that day, and both of its verifiers confirmed its facts. `/clubs/[slug]` goes
from 13 pages to 16.

- **Regions.** `sacramento`, in `CLUB_REGIONS` since §17 and unused until now, is labelled
  "Sacramento area" ("Sacramento" alone would read as the city). A new region, `north-state` ("North
  State"), holds Chico Hotshots. Neither is in `SEARCHED_REGIONS`, so `/clubs` never says "no club
  based in" either. Instead, `#how-matched` prints "The Sacramento area and the North State were not
  searched for every club, so other clubs may be based there." That sentence is built for any region
  that holds a club and was not searched, `elsewhere` apart.
- **Ties.** Three Davis players already tied to NorCal Impact are tied to D-City as well. Kira Kelly
  and Amelia Zedonis read "Listed by the NFHCA, Aug 28, 2025": the 2025 watchlist names D-City, the
  2026 one NorCal Impact. Kate Loscutoff reads "Earlier, 2024", from her own NCSA profile. The Davis
  roster shows "Club: NorCal Impact · Listed club: D-City" and "… · Earlier club: D-City". Two
  Pleasant Valley players are tied to Chico Hotshots by their own MaxPreps career pages: Lilah
  Letcher ("Current, as of Sep 29, 2026") and Kate Panighetti ("Current, as of May 20, 2026"). Each
  of the five was confirmed by two verifiers working apart. Roseville FHC has no tied player: one
  archived league roster name matches a Bella Vista row, with no school or class year.
- **Two sentences every club page shares** were made exact.
  - The empty state now says "No public page we found ties one of them to this club" instead of
    "names one of them with this club", because a bare name on a club page is not a tie.
  - The no-roster sentence says "We found no public roster page naming this club’s players" instead
    of "… for this club". D-City has a roster page that holds only placeholders, and Chico Hotshots'
    team rosters are switched off.
- **Shared hosts.** D-City's site is a Google Site and Chico Hotshots' is on TeamLinkt. "The club's
  own site" is now `clubSiteKey`: the host, or on a shared host the host plus the site's path
  segments (two on `sites.google.com`, one on `leagues.teamlinkt.com`). Davis High's Google Site and
  other TeamLinkt leagues are therefore never labelled a club's own site
  (`components/clubs/club-view.ts`, `components/commits/commit-view.ts`).
- **Sitemap dates.** `/clubs` and every club page carry `getClubsLastChecked()`, as `/commits` does:
  the file's `capturedAt`, or a later record's `checkedOn` (2026-10-04).
- **Not built.** The Sacramento Hockey Academy (a 2025 club on one Davis player's NCSA profile) was
  not researched. Neither the Sacramento area nor the North State was swept for every club.

## 23. Leaders layout amendment (2026-10)

The owner reordered `/leaders`, asked for longer player boards, and dropped the cap on ties. This
section wins where §16 and §20 disagree. Everything else stands: the boards are tables, ranked 1, 2,
2, 4 as §16.2 says, and the page ships no client component.

- **Schools first.** `#schools` comes before `#players`, and the jump links follow ("Schools",
  "Players"). The intro names the schools first. `scripts/assert-copy.ts` fails the build when the
  Players section comes first, since the check that every team without player stats is named reads
  from `#players` to the end of `<main>`.
- **The Elo board is the last school board.** Best record, best league record, most goals per game,
  fewest goals allowed per game, most clean sheets, then highest Elo rating. Its anchor
  (`#elo-rating`), its top 10 and every team-page link to it are unchanged, and its minimum stays
  last in the section's notes.
- **No cap on ties.** Every board, school or player, lists every row tied for its last place,
  however many. §16.2's 15-row cap and its count lines ("4 more players share 10th, …", "16
  goalkeepers share 1st, …") are gone: a tie for 10th of twenty players is twenty-nine rows, and a
  tie for 1st is the whole board. A board is empty only when nobody qualifies.
- **Player boards open to 25th.** A player board still lists the places up to 10th, and the places
  from 11th to 25th wait in a closed `<details>` under it, "Show 15 more players" ("… goalkeepers"
  on the keeper boards), so the page reads as it did and opens with zero JavaScript. The expanded
  places follow the same rule: a tie for 25th is listed whole. A tie is never split between the two
  tables, so the expanded rows always start at a new place. The summary counts the rows behind it,
  never "the top 25", because a board can have fewer or, with a tie, more.
- **A second table, not hidden rows.** The extra rows are a second table, with its own head,
  caption ("…, continued") and card of the same width, inside the `<details>`. The disclosure opens
  below its summary as every other one on the site does (`disclosure-script.ts` keeps the summary
  under the finger), the columns line up with the first table, and the sticky head is there while
  the reader scrolls through 15 more rows. The card takes `ps-0`, so it keeps the board's full width
  instead of the disclosure body's hang under the summary text.
  School boards are unchanged: no disclosure.
- **Budget.** On the 2026-10-04 data the four player boards gained 51 rows behind their
  disclosures, taking `/leaders` from 29,328 to 34,664 bytes of HTML gzip, over the 1.0 x `standings`
  line (33,128). The line moved to 1.2 x (39,754). Listing the assists board's ten-way tie for 24th
  in full took it to 35,499 (89%). Without the cap, a long tie is the one way the page can grow: the
  places are fixed, but not the rows that share them, so a big early-season tie can approach the
  line, and `assert:budgets` says so. First-load JS is unchanged.

## 24. Southern California amendment (2026-10)

The site gained four leagues in two more sections and a second region. The CIF Southern Section's
Sunset (named on the site the **Sunset field hockey league**, lower case because no source gives it a
title; MaxPreps and si.com call it "Sunset") has ten teams in one division: Bonita, Chaminade, Chaparral, Edison,
Fountain Valley, Great Oak, Huntington Beach, Marina, Newport Harbor and Temecula Valley. It is a
field-hockey-only grouping, not the all-sports Sunset League. The CIF San Diego Section adds three
conferences with 40 teams in seven divisions:

- **City**: City Western 6, City Eastern 6
- **North County**: Avocado 6, Palomar 7, Valley 6
- **Metro**: Metro Mesa 5, Metro South Bay 4

The site now covers **nine leagues and 99 teams in five sections and two regions**. Northern
California is the CCS, NCS and the Northern Section. Southern California is the Southern Section
(`ss`) and the San Diego Section (`sds`). This section wins where §1-§23 disagree. Everything else
stands: static rendering, no `searchParams`, leagues get no hue (§15.5), and the copy rules of §15.8
and §22.5, extended in §24.5. The Southern Section's three independents and North County's new short
name ("North") came later the same day: §24.9 records them, and 24.1-24.8 describe the 99-team site
before them.

The rules, sources and dates behind it are in `docs/LEAGUE-RULES.md` (the Sunset and San Diego
Section sections) and `docs/DATA-SOURCES.md`. Every number below was measured on 2026-10-06 unless
it says otherwise.

### 24.1 Decisions this reverses

| Earlier decision | Now | Why |
|---|---|---|
| 49 teams, five leagues, three sections, one region (§22); seven MaxPreps league tables | **99 teams, nine leagues, five sections, two regions** (`RegionId` `'norcal' \| 'socal'`, `SectionConfig.region`). The four leagues follow the EAL in `LEAGUES` (Sunset, City, North County, Metro), so every existing order stays put. The MaxPreps sweep is 1 + 2 × 14 tables + 99 teams = 128 requests. | The Southern Section's one field hockey grouping and the San Diego Section's three conferences: every Southern California team with a 2026 varsity league schedule. |
| Every division has a MaxPreps league table | `maxprepsLeagueId` may be null. North County's **Valley** division has none, so its metadata and table are never requested, it has no MaxPreps source row, and the cross-check is skipped with the reason "MaxPreps publishes no table for this division". | MaxPreps has no Valley league for 2026-27. Inventing a URL or a source row would be dishonest. |
| Every division has a fixed number of league games (`gamesPerTeam`) | It may be null, and only the **Sunset** uses that. GP is shown bare, the LEFT and MAX columns and the maximum-points sentence are hidden, and the uneven-games footnote drops "of N". When the spread is two games or more, the footnote says points favour teams that have played more. | The Sunset has no league schedule and no round robin. Of its 45 pairs, 9 meet twice, 30 once and 6 never. A Sunset league game is a game between two of the ten that MaxPreps marks as a league game. |
| A league game is the one MaxPreps flags (`contest-type`) or one on the official schedule (`official-fixtures`) | A third rule, **`membership`**, for the seven San Diego divisions. A game counts when both sides are members of the division, neither row is a tournament or postseason contest (contestType 2 or 4), and it falls inside league play, whatever MaxPreps' flag says. A flagged game between two divisions of one conference counts in neither table and carries a note. | Every pair of division-mates is scheduled twice on MaxPreps, except Bonita Vista and Helix (Metro Mesa), who meet once on 2026-10-05 Pacific (§24.7). MaxPreps' league flag misses many of these games. Patrick Henry has 0 of 10 flagged, San Pasqual 3, Vista 4 and Mt. Carmel 4. Mission Bay's five games against City Eastern teams are flagged although they are cross-division. |
| A league document orders the table (`orderScope` `'table'`), or decides only the title (`'title'`, the EAL) | A third scope, **`'site'`**, for all four Southern California leagues. No league document awards points or orders a table, so the order is this site's own 3-1-0 points. Every page says so ("The order is this site’s 3-1-0 points; no {league} rule orders the table."). | No Sunset document exists that we could find, and no San Diego conference publishes standings. The Section's power rankings carry league records built from game-type labels, which are not standings. |
| Three postseason kinds (§22.1) | Five. **`'no-postseason'`** (the Sunset) has one ladder rung for every place ("No section playoffs"), no ladder line and no standings band. **`'section-playoffs'`** (City, North County, Metro) is the San Diego Section playoffs on Nov 2–14. Its two rungs are 1st, "1st: at least a play-in if named league champion" (the label never calls the table's leader the champion; the pinned card shows "1st, at least a play-in if champion" to fit 320px), and 2nd or lower, "No league route" (badge "Selection only"). It draws no bracket and projects no seed. A game between two teams of the Section, dated from Nov 2 or marked contestType 4, is tagged "San Diego Section playoffs" whether or not the sides share a conference. | Southern Section Blue Book 2026-27 Bylaws 2011.1 and 3500.2: no field hockey playoffs. San Diego Section Green Book 2026-27 Bylaw 2000.1: Open 8, Division I 12 and Division II 12, placed by the Section from its power rankings. A designated league champion is guaranteed at least a play-in, and the league names that champion, not this table. |
| A level score with W and L flags is a shootout (`SO`) between two teams of one league with `leagueOvertime 'shootout'` (§22.1) | The rule is **section-based**. Both sides must be teams of one section whose `SectionConfig.shootout` is set: the Northern Section ("1 v 1s") or the San Diego Section ("a shootout"). The snapshot invariant, normalize, backfill, the game page and every shootout sentence read the section's `words` and `citation`. EAL output is byte-identical. JV games are exempt (`level: 'jv'`). `shootout.inference` says what copy may claim: 'verified' (the Northern Section: the 2026-09-28 Chico 1, Davis 1 box score has an "SO Win" column) prints "won on 1 v 1s" and the `SO` tag; 'unverified' (San Diego) counts the flagged team's win but prints no decider tag and says only "credited with the win" on a level score. `shootout.coversTournaments` false (San Diego) leaves a tournament row (contestType 2) level. | The San Diego Field Hockey Officials Association's 2026 procedures apply across all three conferences to league, non-league and playoff varsity games: a 10-minute 7 v 7 sudden-victory period, then 1 v 1 shootouts, with one goal credited to the winner. They do not cover invitational tournaments, where seven games between San Diego teams are 0-0 ties (Aug 21, Aug 22, Sep 12). MaxPreps recorded eight San Diego finals outside tournaments as level W/L scores by 2026-10-05 Pacific, four of them between conferences, with no tally; si.com and the Section's power rankings record Mt. Carmel–Poway (Sep 11) as 2-0, so the site does not assert a shootout. The JV procedure is "No overtime". |
| A neutral brand, "California High School Field Hockey" (`SITE_NAME`), wordmark "California HS Field Hockey" / "CA HS FH", home h1 "California High School Field Hockey Teams" (built on 2026-10-06 and reverted the same day) | **The brand stays NorCal (owner decision, 2026-10-06)**: `SITE_NAME`, the wordmark, the h1 and the manifest are unchanged from §22 ("NorCal High School Field Hockey", "NorCal HS Field Hockey" / "NorCal HS FH", "NorCal High School Field Hockey Teams", "NorCal FH"); the description and scope note name both regions. `SITE_DESCRIPTION` leads with NorCal: "… for the 49 NorCal girls varsity field hockey teams in SCVAL, BVAL and PCAL (CCS), MCAL (NCS) and EAL (Northern Section), and for the 50 Southern California teams in Sunset (Southern Section) and City, North County and Metro (San Diego Section). …" | The site is NorCal Field Hockey ("ncfh"); Southern California's results are covered, but the focus is NorCal, and the toggle's default is NorCal. With Southern California selected, the "Southern California" region heading under the h1 says what is shown. |
| Scope note: "Teams outside these five leagues appear only as opponents." (§22.1) | Built from config: "Covers the CIF Central Coast Section (SCVAL, BVAL, PCAL), the North Coast Section’s MCAL, the Northern Section’s EAL, the Southern Section’s Sunset field hockey league and the San Diego Section’s City, North County and Metro conferences. Teams outside these nine leagues, including the Southern Section’s Glendora, Harvard-Westlake and Thousand Oaks, appear only as opponents." | Glendora, Harvard-Westlake and Thousand Oaks are each the only field hockey team in their all-sports league and play no league games. |
| One remembered preference scopes the site: the league (§15.3) | A second one, **the region** (`scvalfh.region`, `'norcal'` or `'socal'`). See 24.3. The site now stores four things in the browser: theme, pinned team, league and region. | Showing both regions at once doubles every index page. Hiding one by default keeps a NorCal reader's site as it was. |
| An id appears once per page | **The id suffix rule**: an id that a region block repeats gets `-socal` on the Southern California copy, and NorCal keeps today's ids. Examples are `#latest-every-league-socal`, `#schools-socal`, `#players-socal` and `#elo-rating-socal`. | Old links keep working, and both regions render without JavaScript. |
| `LeagueConfig.region` is plain-words geography | It is renamed **`cities`**. "Region" now means NorCal or SoCal. Club regions (`CLUB_REGIONS`) and venue `address.region` are separate and unchanged. | One word, one meaning. |
| `/playoffs` is the CCS page with cards for other leagues (§22.2) | It is **"Playoffs"**, with a `#norcal` block (the CCS content under an h2 "CCS playoffs", the MCAL pointer and the EAL card) and a `#socal` block (24.4). | A Southern California reader has no CCS. |
| One site phase: the least advanced league's | `combinedPhase()` is computed per region (`getRegionPhase`). It is preseason only when every league is, and complete only when every league is. | Metro South Bay's first league game is Oct 7, so a whole-site "least advanced" would have read preseason for everyone. |
| A NorCal school's acronym resolves to it | 16 acronyms now collide (`EXPECTED_ACRONYM_COLLISIONS`), and seven NorCal acronyms stop resolving: BVHS, FHS, MCHS, MHS, MVHS, VCHS and WHS. | Each now names schools in both regions. Search finds them by name instead. |

### 24.2 Routes and counts

| URL | Now |
|---|---|
| `/standings/[league]` | 9 pages |
| `/schedule/[league]` | 9 pages |
| `/teams/[slug]` | 99 pages |
| `/playoffs/[league]` | Unchanged: MCAL only. `/playoffs/sunset`, `/playoffs/city` and `/playoffs/socal` are 404s. |
| `/playoffs` | "Playoffs", with `#norcal` and `#socal` blocks. The Sunset, City, North County and Metro cards carry `id="sunset"`, `"city"`, `"north-county"` and `"metro"`. |
| `/standings`, `/teams` | Region wrappers `#norcal` and `#socal`, plus the anchors `#ss`, `#sds`, `#sunset`, `#city`, `#north-county`, `#metro`, `#city-western`, `#city-eastern`, `#avocado`, `#palomar`, `#valley`, `#metro-mesa` and `#metro-south-bay` |
| `/history/2025-26` | Gains `#sunset`, `#city`, `#north-county` and `#metro`, each marked unavailable with its reason (24.7) |
| `/scores/[date]` | By region, as the other index pages (owner decision, 2026-10-06): `<section id="norcal" data-region-scope="norcal">` under an h2 "Northern California" holding its league groups (config order) and its Non-league group (both sides NorCal, or a NorCal team and a team outside the registry), as h3s; then, only on a day that has one, the unscoped `#between-regions` (h2 "NorCal vs SoCal") for the games with a side in each region, which no region block repeats; then `#socal` ("Southern California"), its repeated ids suffixed (`#non-league-socal`). A region with no game keeps its block with one sentence ("No Southern California games on this day."; "varsity" and a pointer when it has JV games that day). JV: `#jv` and `#jv-socal`, each region-scoped and omitted when empty. The header badges, the "Full season" links and the description go per region only when both regions have a game ("NorCal: 6 games" … "SoCal: 9 games"; a NorCal vs SoCal game counts in both, as on `/schedule`'s every-day rows); a one-region day keeps its whole-day header and description. The region switcher sits under the header. |

The snapshot has 99 teams, 871 games and 64 game days. The sitemap lists **1,080 URLs**:

- 11 fixed pages (`/`, `/about`, `/clubs`, `/commits`, `/jv`, `/leaders`, `/playoffs`, `/schedule`, `/standings`, `/teams` and `/history/2025-26`)
- 9 `/standings/` and 9 `/schedule/` pages
- 1 `/playoffs/mcal`
- 871 `/game/`, 64 `/scores/` and 99 `/teams/` pages
- 16 `/clubs/` pages

After `pnpm build:vinext`, `scripts/assert-vinext-prerender.ts` reports 2,143 prerendered routes. That is those 1,080 pages plus their OG images and the metadata routes, and the sitemap matches the prerendered pages exactly.

### 24.3 The region toggle

**Storage.** `scvalfh.region` is written only by an explicit act:

- the region switcher;
- `setLeague(id)`, which writes the league's region alongside the league;
- pinning, which goes through `setLeague`.

Links never write it.

**Pre-paint stamp.** The prefs script stamps `data-region="socal"` only for Southern California; no
attribute means NorCal. The first rule that applies sets the region:

1. a valid stored league (the region is that league's);
2. the stored region (the pinned team's league counts only if it is in that region);
3. a valid pin;
4. NorCal.

The script ships the map once, non-default regions only (`R={"socal":"sunset city north-county metro"}`),
and exposes `window.__sxRegionOf`. Nothing is added to a client bundle.

**What gets hidden.** Without JavaScript both regions render, NorCal first, in DOM order, so the
layout never shifts. With JavaScript, `league-scope-css.ts` hides the other region's
`[data-region-scope]` blocks. A deep link to an anchor inside a hidden region opens it (`:has(:target)`,
plus `:target` on the wrapper itself). On `/teams`, a search shows both regions' lists.

**The control.** `RegionSwitcher` lives in `components/layout/LeagueSwitcher.tsx`, with its state in
`components/ui/use-league.ts`. There is no new client module and no header toggle.

- Markup: `<div role="group" aria-label="Region">` around two `aria-pressed` buttons, "NorCal" and "SoCal".
- Style: a segmented control at `min-h-11 min-w-11`, `sx-js-only`, disabled until hydrated.
- Announcement: a polite live region says "Showing Southern California.", and "All" becomes "Showing every Southern California league."

**Where it renders.**

- On the home page, it leads the scope row, followed by a hairline.
- As its own row under the page header on `/standings`, `/teams`, `/schedule`, `/scores/[date]`, `/playoffs`, `/jv` and `/history/2025-26`.
- On `/leaders` and `/history`, above the sticky division tabs, whose pills are region-scoped.
- On `/about`, at the top of the content column.
- Per-league pages show only their own region's league chips, plus All.

**Home page.** One Find-your-team block stays outside the region wrappers, and its finder searches
all 99 teams. Its card grid is two region-scoped lists, each under an h3 naming the region, and the
odd-count column span is computed per region. League cards are now h4. The status line counts each
region's teams ("49 NorCal teams", "50 SoCal teams"). A Southern California league card shows the
short form "1st, at least a play-in" because the full rung label is too wide for the 288 px card line.

**Measured** (2026-10-06, Chromium 141 through `scripts/a11y-axe.mjs` and a Playwright probe
against `next start` of this build; the stamp that day read "Updated Oct 5 8:19 PM", 137 px on a
phone and 166 px with its weekday, narrower than the widest stamp §22.3 and SiteHeader.tsx were
measured with):

| Viewport | Region row | Switcher (All + the region's chips) | League cards | Wholly above the fold |
|---|---|---|---|---|
| 320 × 664 and 320 × 844 | 253–301 px, 133 px wide | 6 chips in 2 rows (3 with the region row), bottom 403 px | one column, 288 px wide, at 613–865, 877–1169, 1181–1433, 1445–1717, 1729–1949 | 0 at either height |
| 360 × 664 and 360 × 844 | 233–281 px, 133 px wide | 2 rows (3 with the region row), bottom 383 px | one column, 328 px wide, at 593–793 … 1461–1681 | 0 |
| 390 × 664 and 390 × 844 | 233–281 px, 133 px wide | 1 row (2 with the region row), bottom 333 px | two-up, 173 px wide; card 5 spans both columns at 1239–1439 | 0 |

The region row costs the home page one 48 px row plus its gap: the switcher's bottom moves from
§22.3's 254 px to 403 px at 320 and 360, and from 204 px to 333 px at 390. The §15.6 fold targets,
read from the same run: with Tamalpais pinned at 390 × 664 the My-team slot ends at 677 px against a
fold of 608 px (§22.3 had 604 px; the Oct 5 corrections line under the top bar and the region row
sit above it), so that target is missed; the two Latest-rows targets are missed as they were in
§22.3. The script reports the misses; it does not fail on them.

The header: the wordmark is unchanged ("NorCal HS FH" below 1280 px, "NorCal HS Field Hockey" from
1280 px; §24.1), so the widths measured in Chromium on 2026-10-04 and recorded in
`components/layout/SiteHeader.tsx` stand, as do §22.3's measurements; the region row and the fold
figures above are this build's. The home-page keyboard probe passed: Tab to "SoCal", Enter stamps
`data-region="socal"`, renders the SoCal blocks, hides the NorCal ones and keeps focus on the
button. axe-core 4.13 found 0 serious or critical violations over 176 page loads (the install is
pinned to 4.13: 4.14.0, published 2026-10-05, flags three pre-existing label patterns — see
README "Known limitations").

### 24.4 Southern California postseason surfaces

| Surface | Sunset (`no-postseason`) | San Diego leagues (`section-playoffs`) |
|---|---|---|
| Home `PostseasonCard` | Kicker "Postseason". "The CIF Southern Section holds no field hockey playoffs (Blue Book Bylaws 2011.1 and 3500.2), and CIF holds no regional or state championship, so a Sunset team’s season ends with its last game, Oct 31 at the latest." | Kicker "Postseason". The qualification line: "San Diego Section playoffs, Nov 2–14 (finals Nov 14 at La Jolla HS): Open 8, Division I 12, Division II 12, placed by the Section from its power rankings; a designated league champion gets at least a play-in." Link "San Diego Section playoffs →". |
| `/playoffs` | The `#sunset` card: the note and the Blue Book link | The San Diego Section intro: the qualification line, the round dates attributed to the officials' association, the Green Book and power-rankings links, and "the Section publishes brackets after the Oct 31 seeding meeting". It holds the `#city`, `#north-county` and `#metro` cards, each with every team's playoff division (I or II) from the Section's 2026 Divisions sheet, dated 2025-12-23. No bracket, no seed. |
| `/standings/<league>` | A no-postseason card instead of the band. No LEFT or MAX column. | Band headed "San Diego Section playoffs: the league route, as things stand", with the qualification line as its intro |
| Team page | "No section playoffs" and the note. No "Projected" line. | Kicker "San Diego Section playoffs picture". The rung, the qualification line, and "The Section lists {team} in Division {I\|II}; Open Division teams are drawn from Division I at the end of the regular season." |
| `/schedule/<league>` rail chip | None | "Section playoffs Nov 2–14" |
| Game page | — | "San Diego Section playoffs game — it does not count in the league table." San Diego division labels drop "Division" ("League game · City Western"), because there "Division" means a playoff division. |
| Top nav "Playoffs" | `/playoffs#sunset` | `/playoffs#city`, `#north-county` or `#metro` |

### 24.5 Copy rules

§22.5 is extended for Southern California. The new rules live in `scripts/copy-rules.ts`. They run in
`scripts/assert-copy.ts` over every built page's visible and attribute text, and in
`tests/ui/copy-honesty.test.ts` over the view models.

1. **Never "Sunset League"**, except in a sentence that also says "all-sports" (`SUNSET_LEAGUE_CLAIM`).
   The rule is case-sensitive, so "Sunset league games" (MaxPreps' flag) passes.
2. **Never "Sunset school(s)" or "Sunset member(s)"** (`SUNSET_SCHOOL_CLAIM`). Copy says "Sunset teams".
3. **Never "rules require"** on any page or card of an `orderScope 'site'` league (`RULES_REQUIRE_CLAIM`).
4. **The non-CCS bans of §22.5 apply to every Southern California page.** San Diego copy says
   "placed by the Section" or "by selection", never "at-large" or "automatic qualifier". The Green
   Book's tie sentence uses "automatic qualifier", so it is paraphrased: "the league designates which
   team goes forward".
5. **The seed-word ban** applies to `section-playoffs` and `no-postseason` pages and cards.
   "Seeding meeting" passes. The Green Book sentence that names "the lowest-seeded team" is never
   quoted (SEED_CLAIM).
6. **The co-champion check excuses postseason citations.** The Green Book's "(not co-champions or
   tri-champions)" is a rule quote, not a declaration.

Teams level at the top read "{league} co-leaders" once league play is over, and the site never names
a San Diego champion. A site-ordered league's zero-games note reads "No {league|division} games
counted for X yet", not "no results reported".

### 24.6 Budgets

Measured with `next build` at `SCVAL_BUILD_AT` 2026-10-06T12:00:00Z. All figures are gzip bytes.

The columns:

- **2026-10-04** is §22.6's "after" (the five-league tree on that day's snapshot; `/leaders` after
  §23).
- **Before** is the five-league tree (commit 43807a3) built at the same instant on its own 49-team
  snapshot (fetched 2026-10-05T21:22Z, 397 games). The pre-amendment code cannot load the 99-team
  file, so the two trees differ in data as well as code.
- **After** is this tree on the committed 99-team snapshot (fetched 2026-10-06T03:19Z, 871 games).

| Page | 2026-10-04 | Before | After | Limit (multiplier; % used) |
|---|---|---|---|---|
| `/` HTML | 52,466 | 52,077 | 99,016 | 112,429 (4.4 ×, was 2.2 ×; 88%) |
| `/` RSC | 31,908 | 31,341 | 61,010 | 69,494 (4.4 ×, was 2.2 ×; 88%) |
| `/standings` | 21,701 | 22,643 | 34,040 | 39,754 (1.2 ×, was 1.0 ×; 86%) |
| Largest `/standings/<league>` | — | 39,466 (SCVAL) | 50,431 (North County) | 59,630 (1.8 ×, was 1.25 ×; 85%) |
| Largest `/schedule/<league>` | — | 143,078 (SCVAL) | 213,698 (North County) | 240,888 (2.0 ×, was 1.25 ×; 89%) |
| `/schedule` | 39,113 | 38,622 | 62,263 | 72,266 (0.6 ×, was 0.5 ×; 86%) |
| `/teams` | 27,546 | 28,165 | 44,318 | 50,341 (5.2 ×, was 3.0 ×; 88%) |
| `/playoffs` | 29,585 | 29,970 | 37,375 | 43,224 (2.3 ×, was 2.0 ×; 86%) |
| `/leaders` | 35,499 | 38,549 | 66,035 | 76,194 (2.3 ×, was 1.2 ×; 87%) |
| Largest team page (Tamalpais) | 41,605 | 45,893 | 49,311 | 58,086 (6.0 ×, unchanged; 85%) |

**How the multipliers were set.** Each line that was over its limit, or within 5% of it, got
ceil10(measured × 1.12 / baseline) / 10, one line at a time. Before the raise, nine lines were over:

- `/` HTML and RSC: 176%
- `/standings`: 103%
- the per-league standings loop: North County 122%, SCVAL 105%
- the per-league schedule loop: North County 142%, City 101%
- `/schedule`: 103%
- `/teams`: 153%
- `/leaders`: 166%
- the Worker

`/playoffs` was within 1% of its line (99.4%).

`tests/golden/page-weights-main.json` is untouched. The design review's estimates were not used
(`/` 3.3–3.5 ×, `/teams` 6.5 ×, `/standings` 1.5 ×, `/schedule` 0.75 ×, `/leaders` 2.4 ×).

**Other pages.** The other league pages:

- `/standings/<league>`: City 38,571, BVAL 37,827, Metro 31,403, Sunset 30,216, EAL 28,741
- `/schedule/<league>`: City 151,813, SCVAL 146,131, Sunset 113,751, Metro 89,982, EAL 56,411

The Southern California team pages run from 27,900 (Southwest) to 45,382 bytes (Canyon Hills).

**First-load client JS** (before → after, uncompressed bytes):

| Route | Before | After | Change | Limit |
|---|---|---|---|---|
| `/` | 504,471 | 506,818 | +2,347 | 515,098 |
| `/schedule/[league]` | 489,050 | 491,294 | +2,244 | 509,175 |
| `/teams` | 486,099 | 488,494 | +2,395 | 490,367 |
| `/teams/[slug]` | 476,240 | 477,272 | +1,032 | 490,367 |
| `/standings/[league]` | 477,128 | 479,372 | +2,244 | 490,367 |
| `/leaders` | 474,664 | 479,372 | +4,708 | 490,367 |

The growth is the region switcher's state in the existing `LeagueSwitcher` and `use-league` modules;
`/leaders` also gained the switcher and region-aware tabs. No config reaches a client bundle and the
"+ 20 KB" rule stands. `/teams` is the tightest, with 1,873 bytes left, so the next client-side
addition there will cross it.

**Data and the build.**

- **Snapshot.** `data/snapshot.json` is 2,009,846 bytes against the new caps of 3,200,000 (warn
  2,400,000; 63% used). It has 165 source rows against a cap of 280 (59%). Both caps were raised
  from 1.6 MB / 1.2 MB and 140 sources (`lib/pipeline/steps/assemble.ts`).
- **Home team views.** The serialized views are 107,545 bytes for 99 teams (52,868 NorCal, 54,577
  SoCal). The budget in `tests/ui/home-weight.test.ts` is 118 KiB = 120,832 (89% used). On the
  offline corpus they are 65,819.
- **Prefs script.** It is 2,454 bytes against a line of 2,816 (87% used). The design had proposed
  3,072.
- **vinext cache.** After `pnpm build:vinext`, `dist/server/prerendered-routes` holds 367,917,653
  bytes: 1,081 `.html` files (212,432,952 bytes), 1,080 `.rsc` (112,804,113) and 1,062 `.route`
  (42,680,588). That is 2.26 × the 2026-10-04 folder. Twice it is 735,835,306 bytes, so
  `cacheMaxMemorySize` went from 384 MB, which was 1.09 × and under the 2 × rule, to **768 MB**
  (805,306,368 bytes, 2.19 ×).
- **Cloudflare Worker.** After `pnpm build:cloudflare` it is 2,245,128 bytes gzip over 237 files
  (8,417,439 raw). The five-league tree built the same way the same day measured 1,916,727 bytes
  over 236 files, and §22.6 recorded 1805.5 KB. The old line was baseline + 600 KB = 2,040,051, so
  the allowance became **baseline + 1000 KB = 2,449,651 (92% used)**: the measurement plus about
  10%, rounded to 100 KB. Of the +328,401 bytes, 323,888 are the nine bundled data files: 728,330
  bytes gzip -9 against 404,442. The breakdown is in `scripts/assert-budgets.ts`.
- **Cloudflare's own limit.** Its Workers limits page (developers.cloudflare.com/workers/platform/limits/,
  read 2026-10-06) sets 64 MiB uncompressed on both the Free and Paid plans, and says there is no
  compressed size limit. The Worker's 8.0 MiB raw is 13% of that.

### 24.7 Data and history

- **The snapshot** was regenerated by a live `pnpm fetch-data` (`fetchedAt` 2026-10-06T03:19:11Z).
  It holds 99 teams and 871 games: 505 league games, 531 finals and 11 pending. All nine leagues are
  `fresh`. The four Southern California leagues have no missing league result; SCVAL has 2, BVAL 1
  and the EAL 2.
  - By league (a game between two leagues counts in each): Sunset 120 games, 18 league, 98 finals;
    City 164, 60, 111; North County 244, 102, 159; Metro 93, 31, 60.
  - Nine games are `SO`: the EAL's one and eight between San Diego teams.
  - The snapshot schema version is unchanged. Region is derived from config and never stored.
- **Corpus.** `tests/fixtures/corpus/socal-2026-10-06` (8.2 MB) was captured live with `--leagues
  sunset,city,north-county,metro --no-official --no-ccs --no-vnn`. That was 65 MaxPreps requests
  (1 + 2 × 7 + 50) and 78 source rows, all ok. Its manifest id is `capture-2026-10-05`, the run's
  Pacific day. `tests/pipeline/socal.test.ts` replays it and pins:
  - Valley's skip;
  - the membership counts per division (Patrick Henry's 10 games count, though MaxPreps flags none);
  - every division a full double round robin except Metro Mesa, which has 19 of 20 meetings (Bonita
    Vista and Helix meet once on MaxPreps);
  - Mission Bay's five cross-division notes;
  - the eight San Diego `SO` finals.
- **Elo bridge.** The fit is one table over all 99 teams (§20), with constants set on NorCal seasons.
  Comparisons between the regions rest on few games:
  - **This season: 7 finals** between the regions, all against San Diego teams (City–SCVAL 3, North
    County–SCVAL 2, City–MCAL 2), and 8 more scheduled (City–SCVAL 5, North County–MCAL 2, North
    County–EAL 1).
  - **Last season: 11 finals** (Leigh, Gilroy and Mitty against San Diego and Sunset teams).
  - **Within Southern California: 38 finals** between Sunset and San Diego teams this season.

  The `/leaders` Elo notes print the counts from the data at build time: "on one scale across all nine
  leagues; comparisons between NorCal and SoCal rest on 7 finals between the regions this season and
  11 last season, so treat them as rough". Each region has its own boards and qualifying minimum. A
  team page names its place on its own region's board.
- **Prior season.** `data/prior-season.json` was refetched over all 99 teams. It holds 896 finals:
  412 NorCal (unchanged), 473 between Southern California teams and 11 between the regions. It
  excludes 113 deleted rows, 25 not final, 51 outside the registry and 1 forfeit.
- **Rosters and stats.**
  - `data/rosters.json`: 1,617 players across 99 entries, 84 of them with players.
  - `data/player-stats.json`: 758 players on 62 of 99 teams.
  - `data/jv.json`: 531 games (208 final) for 91 of 99 schools, with si.com JV ids for 98.
  - `data/rosters-enrichment.json`: the 50 Southern California entries are unswept stubs that say so.
- **History 2025-26: `unavailable`** for `sunset`, `city`, `north-county` and `metro`, checked 2026-10-06.
  - **Sunset:** no league website or standings document was found. The Southern Section holds no
    field hockey playoffs, and the Sunset table on scores.cifss.org is SBLive's.
  - **San Diego leagues:** the cifsdshome power-rankings widget (year_id=175) lists records from
    game-type labels, not league standings. Each card links '2025 CIFSDS playoff brackets (Google
    Sheet)' under "also published".
  - Nothing third-party is shown.

### 24.8 Not built

- **Independents.** Harvard-Westlake, Thousand Oaks and Glendora appear only as opponents (built
  later the same day, §24.9). So do Madison, Santana, Castle Park, Chula Vista, Montgomery and
  Sweetwater (no 2026 varsity game), and Mayfair. Search prints a sentence for each.
- **No San Diego bracket, seed projection or power-ranking replication.** The site states the rule,
  the dates and each team's playoff division. The Section seeds at its Oct 31 meeting.
- **No club or commitment sweep for Southern California.** The 50 teams' rosters have no club or
  commitment lines, and `/clubs` and `/commits` cover the 49 NorCal teams' schools. (Built later, for
  all 53 SoCal teams: §24.12.)
- **No rosters-enrichment sweep for Southern California.** Its entries are stubs. (The recruiting-page
  part was built later: §24.12. The school-athletics sweep was not.)
- **No header-level region toggle.** The switcher sits in each page's content.
- **No 1 v 1 tallies**, as in §22.8. That covers the San Diego shootouts too.
- **The si.com statewide scoreboard is read only as far as its first page.** It server-renders the
  first 24 games of a day, and the rest load through a client-side API the pipeline does not call.
  The parser warns ("si.com scoreboard lists N of M games…") and treats a missing row as unread,
  never as an absent game.
- **The playoff division sheet is not re-checked.** If the Section re-sheets before Oct 31, the
  Division I/II labels on `/playoffs` and team pages go stale.

### 24.9 The Southern Section independents, and North's short name (2026-10-06, later)

> **Superseded in part by §24.10 (the same day, later):** the group has five members (Bonita and
> Chaminade joined it from the Sunset) and a table of their games against each other. The "no table",
> "no league games" and "three" rows below describe the state between the two decisions; §24.10 says
> what stands.

Glendora, Harvard-Westlake and Thousand Oaks joined on 2026-10-06, so every California team we found
with a 2026 varsity game on MaxPreps is covered: **102 teams, 49 NorCal and 53 SoCal, in nine leagues
and one group of three independents**. Each is the only field hockey team in its all-sports league on
MaxPreps (Glendora: the Palomares League; Harvard-Westlake: League B; Thousand Oaks: the Marmonte
League), and MaxPreps' 2025-26 tables for the same three leagues list one team each, so they play no
league games and have no league table. The rules and sources are in `docs/LEAGUE-RULES.md` ("Southern
Section independents") and `docs/DATA-SOURCES.md` §2.1 and §3.1. This subsection wins where 24.1-24.8
disagree.

| Earlier decision | Now | Why |
|---|---|---|
| The three appear only as opponents (24.1 scope note, 24.8) | **A group, not a league**: `LeagueId` `'independents'` (name "Southern Section independents", short name "Independent", section `ss`), after Metro in `LEAGUES`, with one division `independents` (3 teams, `gamesPerTeam` null, `maxprepsLeagueId` null, `official.mode` 'none'). Its registry is `lib/registry/independents.ts`, transcribed from `tests/fixtures/seeds/registry-seed-ss.json`. | They have a 2026 varsity schedule and the Southern Section rules, but no league. Shown only as opponents, their 37 games were invisible except from the other side. |
| Three classifications (`contest-type`, `official-fixtures`, `membership`) | A fourth, **`independent`**: `lib/classify.ts` returns null for every game of the group, so `countsFor` is always null; `DivisionHealth.classification` and the snapshot schema take the value. | A game between two independents (Harvard-Westlake 5, Glendora 0 on Sep 8) is not a league game: they share no league. |
| "Nine leagues" is `LEAGUES.length` | **`LEAGUES_WITH_TABLES`** (9; renamed `LEAGUES_PROPER` in §24.10) and **`INDEPENDENT_LEAGUES`** (1) in `lib/leagues.ts`; every count of leagues uses the first and names the independents apart: "nine leagues and the Southern Section's three independents", "all four SoCal leagues and three independents", `coveredLeagueWords()`, `independentsWords()`. The site never prints "ten leagues" (a `leaders-view` test checks). | They are not a league, and a tenth "league" with no games would be a false count. |
| Scope note: "Teams outside these nine leagues, including … Glendora, Harvard-Westlake and Thousand Oaks, appear only as opponents." | "Covers the CIF Central Coast Section (SCVAL, BVAL, PCAL), the North Coast Section’s MCAL, the Northern Section’s EAL, the Southern Section’s Sunset field hockey league and the San Diego Section’s City, North and Metro conferences, plus the Southern Section’s three independents (Glendora, Harvard-Westlake and Thousand Oaks), which play no league games. Other teams appear only as opponents." `SITE_DESCRIPTION` says "… for the 53 Southern California teams in Sunset (Southern Section), City, North and Metro (San Diego Section) and three Southern Section independents." | The old note's exception is now covered. |
| North County's short name "North County" | **"North"** (owner decision, 2026-10-06: "North County" made the chip too wide). The name ("North County Conference") and search are unchanged: search keys are the short name and the name, so "North County" still finds it. Where the short name would stand alone as a control's target or a sentence's subject, a new `LeagueConfig.standaloneName` is used through `standaloneName(id)`: "Jump to North County ↓", "Show North County here", "(North County publishes no schedule)". Every other league's is its short name, except the independents' ("Jump to the independents ↓", "Show the independents here"). The scope note's noun is the shared last word: "City, North and Metro conferences". | "Jump to North ↓", alone on a pill, reads as a direction; "Show Independent here" names nothing. In a list ("City, North and Metro"), a label ("North · Palomar") or a row tag ("Poway · North") the context makes it the league. |
| A league not fetched reads "<SHORT> was not fetched in this run." | For a group: "The Southern Section independents were not fetched in this run." Every league's sentence is unchanged. | "Independent was not fetched" names nothing. |
| `DATA_QUALITY.notCovered` named the three | They are removed from it; River Valley (Yuba City, Sac-Joaquin Section), North Salinas and Notre Dame (Salinas) are added: "… has no 2026 varsity game on MaxPreps, so it has no page here." Each team's 2026-27 schedule read returned no game on 2026-10-06 (Wilcox's too; it was already listed). | Search answers for every California school a reader might look for. |

**Routes and counts.** `/standings/[league]` and `/schedule/[league]` have 10 pages each (`independents`
added), `/teams/[slug]` 102, `/playoffs/independents` is a 404, `/playoffs` has an `#independents`
card, `/history/2025-26` an `#independents` section. `next build` prerenders **1,093 pages** (11 fixed,
10 + 10 league pages, `/playoffs/mcal`, 879 games, 64 score days, 102 teams, 16 clubs), and the sitemap
lists the same 1,093 URLs. The MaxPreps sweep is 1 + 2 × 14 + 102 = **131 requests**: no table gathers
the three, so only their schedules are read.

**Where a table would be** (`IndependentGroupView` from `independentGroupView` in
`components/standings/standings-view.ts`, drawn by `components/standings/IndependentGroup.tsx`): the
group's note, the official note of its division, and its three team links, each `[data-team-slug]` with
the hidden "Your team." note and, on `/teams`, the finder's `data-team-tile` hook. No place, PTS, GP,
ladder line, caption or legend.

| Surface | The independents |
|---|---|
| `/standings`, `/teams` | An h3 "Southern Section independents" (no h4) over the group block; `/teams` says "each in its division’s standings table (the independents play no league games, so they have none)". The overview's header lists only the nine leagues ("Every division in …"), and its points sentence names only the site-ordered leagues. |
| `/standings/independents` | Header "Southern Section · no league games, so no table", the block under "No league table", the no-postseason card and the Blue Book links; never a "league play starts" notice (`buildNotice` returns null). |
| `/schedule/independents` | "Independent teams: schedule and results"; "every contest involving the independents, all of them non-league games". |
| Home | The panel's lead is "No league games." with "These teams play no league games, so there is no table; their first game is Tue Aug 18." only while that date is ahead (none in season); the mini table is the block under "No league table" with no PTS legend; "Independent teams" lists them; the other-leagues strip reads "Independent: No league table". The card says "Show the independents here" and links "Independent games →" (`/schedule/independents`). A pinned independent's card reads "Independent · no league table", its form is over all games and it has no table link. |
| Team page | Identity "Tartans · Independent · Glendora". The tiles are Place ("Independent", "no league table"), Overall (all opponents), Streak (all games), Goals and Goal diff, with a sentence that there is no place, league record, GP or MAX and that every figure counts all games. Form ("All games, oldest to newest"), the margin strip ("All games · N played") and the splits count every game; there is no "Who we haven't beaten"; the League games section says every game is in the list of all games. The standings link is "Southern Section independents →". The OG card uses the overall record. |
| Game page | Each independent side reads "No league games · Independent"; "Form going in" says "Plays no league games" (both sides: "Neither side plays league games."). An opponent's line on another team's page reads "10-3-1 overall · Independent" (or "no results yet"). |
| `/playoffs` | The header adds "no playoffs for the Sunset or the Southern Section independents"; the `#independents` card has the group's no-postseason note. The top nav's Playoffs goes to `/playoffs#independents`. |
| `/leaders` | On every SoCal board ("schools in all four SoCal leagues and three independents"), except Best league record ("all four SoCal leagues"): they have no league record. The Elo notes say "across all nine leagues and the Southern Section’s three independents". |
| `/jv` | "Southern Section independents JV": "Glendora, Harvard-Westlake and Thousand Oaks play no league games, so their JV teams have no league table either. Their JV games are on their team pages: …", each name linking the team's `#jv`; a JV game between two of them is non-league (reason `independent`). |
| `/history/2025-26` | `unavailable`: "Glendora, Harvard-Westlake and Thousand Oaks played as independents in 2025-26 too: there was no league table to publish.", checked 2026-10-06 against MaxPreps' 2025-26 Palomares, League B and Marmonte tables. The header says "… are unavailable: we found no official 2025-26 final standings. The Southern Section independents had no league table to publish." |
| `/about` | A rules card ("No league · SS") with the group's note and Article 200, a source card, no cross-check, the roster line "for all 102 teams in all nine leagues and the three Southern Section independents". |
| Search, OG | The group is a search entry ("the Southern Section independents"; aliases "Independents", "independent"). The region OG cards (the root's and `/standings`') list no independents row in their SoCal column; their footer reads "9 leagues, 3 independents · 102 teams · …". |

**Data (2026-10-06).** The runs, in order, with logs kept outside the repo:

- `pnpm fetch-prior-season`: 936 finals between two of the 102 teams (412 NorCal, 513 SoCal, 11
  between the regions; 40 involve an independent), excluding 113 deleted rows, 26 not final, 16 outside
  the registry and 1 forfeit.
- `pnpm fetch-rosters --leagues independents`: Glendora 19, Harvard-Westlake 25, Thousand Oaks 21;
  1,682 players on 87 of the 102 teams.
- `pnpm fetch-player-stats --leagues independents`: Harvard-Westlake 18 players, Glendora and Thousand
  Oaks none; 776 players on 63 of the 102.
- `pnpm fetch-jv --leagues independents`: Glendora 8 games (4 final), Harvard-Westlake 13 (7), Thousand
  Oaks none; 533 games (209 final) for 93 of the 102, si.com JV pages for 101.
- `pnpm fetch-data`: `fetchedAt` 2026-10-06T05:58:34Z, 102 teams, 879 games (506 league), 539 finals, 12
  pending, all nine leagues and the independents fresh; 131 MaxPreps, 21 si.com and 8 official-host
  requests; 166 of 168 source rows ok (the CCS calendar and bracket, skipped before Oct 25). The
  independents have 37 games, 29 final, none counted. `data/snapshot.json` is 2,034,943 bytes.
- `data/history-2025-26.json` was regenerated offline with the independents' entry.
  `data/rosters-enrichment.json` has three unswept stubs for them.

**Budgets.** `pnpm assert:budgets` passes with no line raised: `/` HTML 100.2 KB of 109.8, `/teams` 44.8
of 49.2, `/leaders` 66.2 of 74.4, `/playoffs` 37.2 of 42.2, `/standings/independents` 14.6 and
`/schedule/independents` 49.2 KB. Two test lines were raised by the 1.12 × rule: the home team views
(110,556 bytes for 102 teams) from 118 to **121 KiB**, and the prefs script (2,537 bytes, three more
slugs and one more league) from 2,816 to **3,072 B**.

**Not built.** No league table, standings, ladder, co-leaders or champion for the independents, ever.
No enrichment sweep for them (stubs, as for the other 50 SoCal teams). `scripts/discover-season.ts`
probes each of the three and asks a human to check that each is still its league's only field hockey
team; it does not decide that itself.

### 24.10 Bonita and Chaminade are independents, and the independents have a table (2026-10-06, later still)

Owner decisions, 2026-10-06: "I believe Chaminade and Bonita should be classified as independents and
not Sunset", and "let's give the independents a standings table also". Both checked against the
sources before the change, and both built.

**What the sources say about Bonita and Chaminade.** MaxPreps' 2026-27 Sunset table (`aa46adc4-…`)
lists them with Chaparral, Great Oak and Temecula Valley, and si.com's Sunset table (the one the
Section's scores site, scores.cifss.org, shows) lists them with six of the eight; MaxPreps' 2024-25 and
2025-26 Sunset tables listed them too, and si.com's team profiles say "Sunset". No published document
calls them independents. Against that: MaxPreps marks none of their nine 2026 games against the five
Orange County Sunset teams as a league game (Bonita: Marina Aug 18, Huntington Beach Aug 25, Newport
Harbor Sep 1, Edison Sep 10; Chaminade: Fountain Valley Aug 18, Edison Aug 20, Marina Aug 24,
Huntington Beach Sep 16, Newport Harbor Oct 6; all contestType 1), while it does mark the Temecula
three's games against those schools; and each of the two plays every one of Glendora, Harvard-Westlake
and Thousand Oaks, and each other, home and away (all ten pairs of the five meet, nine of them twice,
Chaminade–Thousand Oaks three times). The one MaxPreps league flag between the two and a Sunset team is
Bonita at Great Oak, Aug 27. So the site lists them with the independents, says on every surface that
MaxPreps and si.com list them in the Sunset, and skips their MaxPreps Sunset rows as the Sunset's
`maxprepsExtraRows` (a registry team of another division may be one; `lib/teams.ts`).

**The group gets a table.** The five are still not a league, and nothing calls them one: a new
`LeagueConfig.independents: true` flag carries the group identity (`isIndependentLeague`,
`INDEPENDENT_LEAGUES`, `LEAGUES_PROPER`, the renamed `LEAGUES_WITH_TABLES`), and "nine leagues and
five independents" stays the count. The `'independent'` classification is gone: the group is a
`'membership'` division, as the San Diego divisions are, so every game between two of the five dated
Sep 8 to Oct 31 (tournament and postseason rows left out) counts for its table, whatever MaxPreps'
flag says, ordered by this site's 3-1-0 points (`orderScope: 'site'`, `gamesPerTeam` null since the
pairs meet two or three times; `assertLeagues` now allows null on a membership division with no
document). Everything built for "a group with no table" is removed: `IndependentGroup.tsx`,
`IndependentGroupView`, the `independent` fields of the division, overview and mini views, the
independents' branches on the team page (overall-only tiles, "All games" form and margins, no "Who we
haven't beaten"), the game page ("Plays no league games"), the JV page and tables, the home panel's
lead and pinned card, the standings pages and the about page's `IndependentRules`. The independents
now render through every league path, and the site's "league game" vocabulary covers the group's games
on the strength of the division's note, printed under its tables and on /about: "The table counts
every game between two of the five, whether or not MaxPreps marks it as a league game (it marks only
Bonita's two games with Chaminade), and orders them by this site's 3-1-0 points."

| Earlier decision (§24.9) | Now |
|---|---|
| Sunset: ten teams, Aug 18 first league date, MaxPreps table five of ten | Eight teams (Chaparral, Edison, Fountain Valley, Great Oak, Huntington Beach, Marina, Newport Harbor, Temecula Valley), `leaguePlay.first` Aug 25 (Chaparral–Temecula Valley), MaxPreps table three of eight plus the two extra rows, `miniRows` 8; the knownCause says Great Oak's Aug 27 win over Bonita, which MaxPreps counts, is not counted here. The overtime citation names only Fountain Valley 1-1 Marina. |
| Independents: three, `classification: 'independent'`, no table | Five, `independents: true`, `classification: 'membership'`, `leaguePlay` Sep 8 to Oct 31, `expectedTeams` 5, `maxprepsMissing` all five, `miniRows` 5, cities "Glendora, La Verne, Studio City, Thousand Oaks and West Hills", a `membershipNote` under the heading. |
| Copy: "play no league games", "no league table", "<SHORT> games" links to the schedule | The scope note: "plus the Southern Section’s five independents (Bonita, Chaminade, Glendora, Harvard-Westlake and Thousand Oaks), schools in no field hockey league". Standings links read "Independents standings" (`standingsLabel` in `lib/leagues.ts`: "Independent standings" would read as "unofficial standings"); the overview and /teams count the independents' table ("Every division in SCVAL, …, Metro and the independents"); the preseason notice for the group reads "The first game between two of the independents is …". |
| Standings notes: "League games are every game between two division members on MaxPreps’ schedules (<league> publishes no schedule)" | For the group, the Notes source line is the division's own note (why the five are grouped, what the table counts); captions read "Southern Section independents standings", never "Independent league standings"; the home mini table's kicker is "Table", not "League table"; the standings page's title is "Independents standings". |
| Leaders: the league-record board left the independents out because they had no league record | Still left out: their table is not a league record (the board's scope stays "all four SoCal leagues"); every other SoCal board says "and five independents". |
| The region OG cards listed no independents row; `/history/2025-26` said "had no league table to publish" | The SoCal column of the root and `/standings` OG cards gets an "Independents" row (its division label: the short name is an adjective) with the table's leader clause; the history page and `/about` say "The Southern Section independents are this site’s grouping, so no table of them was published." |
| `/history/2025-26`: "played as independents in 2025-26 too" | "The Southern Section independents are this site’s grouping, so no 2025-26 table of them was published: Glendora, Harvard-Westlake and Thousand Oaks had no league table, and MaxPreps listed Bonita and Chaminade in its Sunset table.", with MaxPreps' 2025-26 Sunset table added to what was checked. |

**Data (2026-10-06, 12:00Z).** `pnpm fetch-data` again: 102 teams, 879 games (524 league), 542 finals,
9 pending; the independents' table counts 21 games (13 final), the Sunset 15 (its 18 less Great Oak–Bonita
and Bonita–Chaminade twice). `data/history-2025-26.json` regenerated offline. The per-team files
(rosters, player stats, JV, enrichment) were reordered to the registry's new order with the two teams'
`division` rewritten, their contents unchanged.

### 24.11 The Sunset counts every game between its eight teams, and the independents are "LA" (2026-10-06, later still)

Owner decisions, 2026-10-06: "count all matches between the 8 Sunset schools" (option 2 of the Great Oak
analysis) and "rename Independents to LA".

**Why the Sunset moved to membership.** Great Oak's league record was 3-1 on MaxPreps' Sunset table, 2-2 on
si.com's and 2-1 on this site's flag-based table, and the difference was only which games MaxPreps'
scorekeepers had labelled "League": Great Oak's two games with Temecula Valley are flagged non-league
(Sep 4) and league (Oct 2); Temecula Valley's games against the five Orange County schools are all flagged,
Great Oak's and Chaparral's mostly not; the Orange County schools' games against each other are flagged
only when Edison enters them. MaxPreps also lists the Sep 24 Great Oak–Edison loss twice (its overall record
6-10-2 against our 6-9-2; the pipeline drops the duplicate). The three Temecula schools play a full
home-and-away round robin among themselves (si.com files two of them under "Southwestern"), and each plays
each Orange County school about once, so the "league" is two clusters with crossover games and the flag
decided, game by game, which crossovers counted. Counting every game between the eight (classification
`'membership'`, the San Diego divisions' and the LA independents' rule) removes the flag from the table
without inventing a structure the schedules do not show. `leaguePlay` stays Aug 25 (Chaparral–Temecula
Valley, now counted) to Oct 31; `gamesPerTeam` stays null (the pairs meet once or twice). The Notes source
line reads "League games are every game between two division members on MaxPreps’ schedules (the Sunset
publishes no schedule)"; the uneven-games footnote for a membership division with no fixed schedule reads
"Teams have played between N and M games against other Sunset teams"; the knownCause says MaxPreps counts
only its flagged games. Great Oak is 4-2 with every game counted; the table counts 35 games (15 under the
flag) on the 2026-10-06 snapshot.

**"LA".** The group's name is "LA independents" and its short name "LA" (the five are Los Angeles-area
schools: La Verne, West Hills, Glendora and Studio City in Los Angeles County, Thousand Oaks in Ventura
County). The division label is "LA", the standalone name "the LA independents" ("Show the LA independents
here"; "LA" alone names a place), the co-leaders label "LA co-leaders", links read "LA standings", the
schedule page "LA teams: schedule and results". The id, the URL (`/standings/independents`) and the
`independents: true` flag are unchanged, as are the "nine leagues and five independents" counts and the
"five Southern Section independents" clause built from the section's label. `standingsLabel` no longer
special-cases the group.

**Snapshot compatibility: the "rules changed" upgrade.** The schema checks every game's `countsFor` against
`classifyGame` under the current rules, so the first `pnpm fetch-data` after this change could not load the
committed flag-based snapshot: `readPrevious` caught the validation error and ran with no previous snapshot
(no carry-forward for a league whose feeds fail, no finals regression guard, and a meta file reporting every
existing final as newly added: "SCVAL +50 finals"). The regenerated file was complete, so nothing was lost,
but a transient feed failure during such a run would have dropped a league's published data. `loadSnapshot`
now has a third upgrade beside v1 → v2 and "league added" (`needsReclassification` / `reclassify`,
lib/snapshot-migrate.ts): when a v2 file's games no longer classify as written (a rule changed, or a team moved
between divisions, as Bonita and Chaminade did in §24.10), every game is re-resolved and reclassified under the
current config and the affected divisions' standings rows, cross-check rows, health counts, season windows and
counts are recomputed by the pipeline's own engine; the other divisions' rows stay byte-identical, and the
counts that need a clock or a feed (`previousCountedFinals`, `missingLeaguePast`, the feed and table states)
stay as written. The tests load the committed file rewritten under the flag rule, and with Bonita–Chaminade
filed as a Sunset game, and get the committed file back byte for byte. Rule changes still want a regenerated
snapshot in the same PR (the site builds from the committed file and should not depend on the upgrade), but
the pipeline no longer starts from nothing when one lands.

**Data (2026-10-06).** `pnpm fetch-data`, started from the flag-based snapshot through the upgrade above: 102
teams, 879 games (544 league, up from 524), 542 finals, 9 pending; `data/history-2025-26.json` regenerated
(the group's name); the per-team files' `source` strings renamed.

### 24.12 Recruiting profiles, clubs and commitments for Southern California (2026-10-06, latest)

The NorCal research of §17, §21 and the overlay's recruiting pages, repeated for the 53 Southern
California teams' schools (842 varsity rows, eight teams with none) under the same rules, with a
Southern California location standing for a Northern California one. The method, the counts and the
gotchas are in `docs/DATA-SOURCES.md` §1.1j, §1.1j2 and §1.1j3; every candidate was re-opened by a
checker and, separately, by a refuter, and only what both kept is in the files.

- **Recruiting profiles** (`data/rosters-enrichment.json`): 267 for 202 players (134 Hudl, 64 NCSA,
  55 SportsRecruits, 14 FieldLevel). The SoCal entries stop being stubs: each holds its profiles and
  per-team notes, and, like the EAL's, no coaches or sources, so a SoCal team page still says other
  public sources have not been checked. The roster shows a FieldLevel link as it shows the others.
- **Clubs** (`data/clubs.json`): twelve club records and 76 ties for 68 players at 23 schools (one, Abigail Karlander's, on the
  revised nickname rule below). Five
  club regions join `CLUB_REGIONS` after the North State, `ventura`, `los-angeles`, `orange-county`,
  `inland-empire` and `san-diego` ("Ventura County", "Los Angeles", "Orange County", "the Inland
  Empire", "San Diego"), and all five join `SEARCHED_REGIONS`: the Inland Empire, which holds no club,
  is named in the "no club based …" sentence with the Peninsula and the Central Coast. HTC moves from
  `elsewhere` to `san-diego` (every HTC California season trains in La Jolla or Chula Vista), so no club
  is `elsewhere` now and its heading does not render; its page gains the region label "San Diego".
  `/clubs/[slug]` goes from 16 pages to 28.
- **`/clubs` and the region toggle.** `CLUB_REGION_SITE_REGION` (`lib/clubs-schema.ts`) gives each club
  region its half of the site; each region's section carries that `data-region-scope`, under a
  `RegionSwitcher` row below the page header (the §24.3 pattern), so a reader sees their own half's
  clubs; `elsewhere` would show under both. Without JavaScript every section renders, NorCal's first.
  The first section of each half takes the first section's top margin. The lede, the count line and
  `#how-matched` stay site-wide (the lede now reads "148 players from 48 schools are tied to 15 of these
  28 clubs, the most to SF Hawks (32) and HTC (30)").
- **Commitments** (`data/commits.json`): twelve, ten in field hockey and two in lacrosse, at seven
  schools, to eight new colleges (Richmond, Johns Hopkins, Michigan, Michigan State, Muhlenberg,
  Harvard, Oregon, Columbia) and a new field hockey program at Cal. Sami Lee's (Columbia) is on the
  revised nickname rule. `/commits` was not region-scoped then: one list by
  class year, each row naming the school. It is now (§21.8).
- **Copy.** The rule sentence on `/clubs` and `/commits` (`#how-matched`) no longer says "a Northern
  California location": it reads "a location in the school’s half of the state, Northern or Southern
  California". It also says when a nickname counts (owner decision, 2026-10-06): when the page
  otherwise meets the rule and a second page, or the player's own, backs the match (before, only on a
  page naming the school).

Not built: the school-athletics roster sweep for the 53 teams (grades, heights, numbers, positions,
coaches), SportsRecruits' athlete search for their rows, and a club record for Poway Mystix, whose site
could not be reached.

## 25. Recruiting amendment (2026-10)

The site's recruiting data lived in three places: each team page's roster (a player's recruiting
profile links, club line and commitment line), `/clubs` and `/commits`. A reader asking "who in my
league is being looked at, and where do they play?" had to open every school's page. `/recruiting`
gathers it on one page; the team rosters keep showing the same lines for their own players.

### 25.1 The page and what it answers

| URL | Answers | Pages |
|---|---|---|
| `/recruiting` | "Who here has a recruiting profile, a club or a college commitment?" | 1 |

Static, one page. A lede that answers the question in one paragraph (how many players from how many
schools are listed, then how many have committed, are tied to a club and have a recruiting profile),
the `RegionSwitcher` (the §24.3 pattern), the anchor-mode league chips, then one
`<div id="norcal|socal" data-region-scope>` per region: the region's count sentence, then one h2 per
league (`#<league>`, as on `/teams`) and one h3 per
school with a listed player (`#<team slug>`, its action "Full roster" to `/teams/<slug>#roster`, its
meta the school's counts: "7 players · 1 committed · 5 with a club · 6 with a profile"). Schools run
by name within a league. Last, "How this page
is built" (`#how-matched`): who is listed, the profile rule, links to the clubs' and the commitments'
`#how-matched`, the research dates, that none of it is part of the twice-daily update, and that recall
is partial.

**Only schools with a listed player appear** (owner decision, 2026-10-07). A school with nobody
listed is not named, linked or counted anywhere on the page: no "nothing found" line under its league,
and no "14 of 15 schools" in a league's or a region's count ("61 players at 14 schools"). A league
with no listed school has no section and no chip. Recall is partial, so an absence says nothing about a
school or its players, and naming the schools with none would read as if it did. So no league's
membership note is printed here either: each names or counts all of the league's schools ("Chico,
Corning, …", "eight Southern Section schools"), and the page has no section heading for it to qualify
(§22.5 asks for the EAL note where all six teams' schools are listed under a section or league heading).

### 25.2 The same rows as the team pages

A player row is a row of `buildRosterView` (varsity only, the roster's spelling and order) with at
least one of a commitment, a club or a profile, and its three lines are drawn by the roster's own
components (`Commitment`, `Clubs`, `Profiles`, exported from `components/teams/TeamRoster.tsx`), so the
two pages can never word a player apart. The facts (grade, position, height) are plain text: the †
for a value from another source is explained on the team page, which each school's heading links.
The privacy posture of §17.2 and §21.2 holds unchanged: nothing a data file keeps but never renders
reaches a view type, `assert:copy` counts `/recruiting` among the pages built from both files, and the
metadata names no player.

### 25.3 Links in, not nav

The tab bar and the desktop nav are unchanged. `/recruiting` is linked from `/teams` (a third quiet
line, after the clubs and commitments ones), from `/clubs` and `/commits` (`#how-matched`), and from
every team roster with a listed player, whose footnote links its own school's block
(`/recruiting#<slug>`; a block in the hidden region opens it, `:has(:target)`). The sitemap dates it by
the latest of the clubs file, the commitments file and the roster overlay.

### 25.4 Not built

- **No filters** (committed only, by class year, by club): the page is static and adds no client
  module; the league chips and each school's counts carry the scanning.
- **No OG card**: the page takes the root card, as `/clubs` and `/commits` do.
- **No budget**, for §17.6's reason. **Gates**: `assert:prerender`, `assert-vinext-prerender.ts` and
  `smoke-server.sh` expect `/recruiting` among the fixed pages; `a11y-axe.mjs` checks it.

## 26. Visual refresh amendment (2026-10)

A pass to take the site off the generic template look (Geist on pale gray, every block a
soft-shadowed rounded card, every control a capsule, a tinted pill for the current page) and back
toward this spec's own idea of a ruled scoreboard. It wins over §4.4 and §7.2 where they disagree.

### 26.1 Decisions this reverses

- **The section rule is back (§7.2, R-9).** A page-level h2 sits under a 2px ink rule, an h3 under
  a 1px `--sx-border-strong` hairline; in-card labels (`size="label"`) stay bare. Kickers remain
  sentence case (§15.8). Stacked headings on `/standings` now have a visible rank.
- **Flat surfaces.** `--sx-shadow-raised` is a transparent zero layer in light mode too, so a card is
  its 1px ring and nothing else, as dark mode always was; hover (`.sx-lift`) darkens the ring rather
  than floating the card.
- **Radii.** tag 4 · chip 8 · control 10 · card 8 · card-lg 10. `control` (new) is the selectors:
  league, region and filter chips, division tabs and the date rail. Buttons and link pills use
  `chip`. A full pill survives only where the shape is the meaning (the dashed "pending" chip) and
  for the round theme toggle.
- **Selected selector = inverse ink** (`--sx-text` fill, `--sx-surface` text: the measured
  18.91 / 16.43 pair swapped), not accent wash plus an ink ring. The check glyph stays. The pre-paint
  scope stylesheet draws the same state.
- **Top-bar current page = ink, semibold, 2px ink underline**, not an accent-wash capsule. The phone
  tab bar keeps its wash capsule.
- **Team stat tiles are unboxed**: a hairline over label, value, sub; a box-score line rather than
  eight floating cards.

### 26.2 Home: the latest results first

On a first visit (no remembered league) the cross-league "Latest from every … league" block now comes
before "Find your team" and the league cards. With the finder first, a 390 x 844 phone's first screen
held no score at all; the league cards are a directory, not news. DOM order is still reading order.
From 768px the latest block's league groups run two-up, so a score sits next to its team names
instead of across a 1,100px row. §15.6's composition is otherwise unchanged.

### 26.3 Copy: no implementation words

Reader-facing text does not describe how the page is drawn or built: no pixel sizes ("2px rule" is
"the labelled line"), no "ink", "rendering", "pipeline", "snapshot", "run", "static", "API" or
`localStorage`. The About page says "update" for a data refresh. Comments and pipeline logs are
unaffected.

### 26.4 Not changed, and recommended next

- **Typeface.** Geist is the create-next-app default and reads as such. A face with more character
  (a variable grotesque with a width axis, condensed for headings and figures) would do the most
  for the site's identity, but `tests/ui/text-metrics.ts` is calibrated to Geist's advances and the
  tab-label and pin-label tests depend on it, so a swap must re-measure those tables.
- **The phone "See something missing?" bar** takes 44px of every page's fold (§1.3 budgets the
  chrome at 100px) and repeats the header's and footer's report links.
- **Long intros.** `/leaders` and `/playoffs` open with five to nine lines of method before any
  data; the caveats could move into a disclosure under a one-line lead.
