/**
 * DESIGN §10.9(a), SPEC §12.3: axe-core over one page of every route family, in both themes and at
 * both widths, against the real production build. Exits non-zero on a serious or critical violation.
 *
 * Run it against a server you started yourself:
 *
 *   pnpm build && pnpm exec next start -p 3117 &
 *   node scripts/a11y-axe.mjs                       # SCVAL_BASE_URL defaults to http://127.0.0.1:3117
 *
 * `axe-core` and `playwright` are intentionally NOT repo dependencies — they are needed to check
 * the site, not to build or ship it — so this script resolves them at run time and says plainly
 * what to install when they are missing. Install them in a directory of their own and point
 * NODE_PATH at it, which `require` honours; npm cannot install into the tree pnpm wrote here (CI
 * does the same in $RUNNER_TEMP/axe, scripts/stage-gate-d.sh in /tmp/axe):
 *
 *   (mkdir -p /tmp/axe && cd /tmp/axe && npm init -y >/dev/null &&
 *     npm install --no-save axe-core playwright && npx playwright install --with-deps chromium)
 *   NODE_PATH=/tmp/axe/node_modules node scripts/a11y-axe.mjs
 *
 * What runs (every run is mandatory: `page.addInitScript` always exists, so nothing is skipped):
 *  1. Every route below × light/dark × 390/1280: the fixed pages (/clubs, /commits and /recruiting among them), the
 *     per-league pages (/standings/bval, /standings/mcal, /standings/eal, /schedule/pcal,
 *     /schedule/eal, /playoffs/mcal), a BVAL, an MCAL and an EAL team page, and the first /game/,
 *     /scores/, /teams/ and /clubs/ page of the
 *     sitemap, plus its first /game/sblive-* page when it lists one (a si.com-only game) and its
 *     first /clubs/ page whose club no tracked player is tied to (DESIGN §17). The sitemap lists the
 *     clubs with the most tied players first, so the first club page is the longest player list
 *     (/clubs/sf-hawks today) and the first empty one puts the empty state, the programs and the
 *     sources through axe with no player rows (/clubs/pac-heights today).
 *  2. `/` once per remembered league: an init script sets localStorage['scvalfh.league'] to each
 *     league id of data/snapshot.json (plus 'city', so a SoCal league runs even on a snapshot written
 *     before the SoCal leagues were added) and to 'all' (the no-league run is `/` in 1), once with
 *     only scvalfh.pinnedTeam = 'tamalpais', and the region runs (DESIGN-socal §2.4): scvalfh.region =
 *     'socal' alone (the SoCal first-visit view), and with a NorCal pin (the pin kept, no league from
 *     it). axe skips `display:none` subtrees, so each league panel and each region is checked only in
 *     its own run; each run also asserts the pre-paint stamp (html[data-league], html[data-pin],
 *     html[data-region]) the run was meant to produce.
 *  3. `/teams` with "mar" typed into the finder (the filtered list and the live region), and with
 *     "la jolla" typed under the default (NorCal) region: the /teams lift must show the SoCal team's
 *     tile (rendered, not display:none) while the finder searches.
 *  4. A keyboard probe on `/` with no stored league: Tab to "Show BVAL here", press Enter, and
 *     document.activeElement must be inside [data-scope="bval"] (WCAG 2.4.3; SPEC §8.2). And the
 *     region probe: Tab to the "SoCal" button of the region switcher, press Enter: it is pressed, the
 *     page is stamped data-region="socal" and a [data-region-scope="socal"] element is rendered.
 *  5. The SPEC §10.1 fold targets at 390×664 and 390×844 (pinned card; Latest rows), measured and
 *     PRINTED (`fold:` lines): DESIGN §15 states the targets; a miss is reported, not failed.
 *  6. The first-visit `/` (no stored league) at 320, 360 and 390 px wide: the region switcher and the
 *     league switcher (All plus one chip per league of the region, in one list per section) and the
 *     "Find your team" league cards (two-up from 390 px, the last of an odd count spanning both
 *     columns), measured and PRINTED (`layout:` lines) for DESIGN §22.3 and DESIGN-socal §2.4: where
 *     the region switcher sits, how many rows the scope row wraps to, where each card sits and ends,
 *     and what is above the fold at 664 and 844 px tall. Reported, never failed.
 *
 * What it does not cover: §10.9(b) grayscale and (c) forced-colors are visual comparisons that a
 * machine cannot judge for us. The token-contrast half of the gate is a unit test
 * (tests/ui/contrast.test.ts) and the never-0-0 half is tests/ui/rendered-never-00.test.ts.
 */

import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const BASE = process.env.SCVAL_BASE_URL ?? 'http://127.0.0.1:3117';

/**
 * League ids in config order, from the snapshot this tree holds (the server was built from it);
 * the five ids are the fallback when the script runs outside the repo.
 */
function readSnapshot() {
  // An empty SCVAL_SNAPSHOT means the bundled file, as lib/data.ts load() (the canonical rule) reads it.
  const file = process.env.SCVAL_SNAPSHOT || 'data/snapshot.json';
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}
const snapshot = readSnapshot();
const LEAGUES = snapshot
  ? snapshot.season.leagues.map((l) => l.id)
  : ['scval', 'bval', 'pcal', 'mcal', 'eal', 'sunset', 'city', 'north-county', 'metro', 'independents'];
/**
 * The SoCal leagues (DESIGN-socal §2.1.5), for the expected `data-region` stamp. Spelled out: this
 * script runs on plain node and reads no TypeScript config; tests/ui/prefs-script.test.ts holds the
 * prefs script's own map to lib/leagues.ts.
 */
const SOCAL_LEAGUES = new Set(['sunset', 'city', 'north-county', 'metro', 'independents']);
/** The region a stored league stamps: 'socal', or null (no data-region: NorCal). */
const regionStampOf = (league) => (league && SOCAL_LEAGUES.has(league) ? 'socal' : null);
/** The pinned team of the pin run (an MCAL team) and the league the prefs script derives from it. */
const PIN = 'tamalpais';
const PIN_LEAGUE = snapshot?.teams.find((t) => t.slug === PIN)?.league ?? 'mcal';
/** A San Diego Section team the /teams lift probe searches for under the default region. */
const SOCAL_QUERY = 'la jolla';

/**
 * The clubs of data/clubs.json no affiliation names: their pages show the empty state. Read like
 * the snapshot, from this tree; none (and no extra run) when the script runs outside the repo.
 */
function readEmptyClubs() {
  const file = 'data/clubs.json';
  if (!existsSync(file)) return new Set();
  const { clubs, affiliations } = JSON.parse(readFileSync(file, 'utf8'));
  const tied = new Set(affiliations.map((a) => a.club));
  return new Set(clubs.map((c) => c.slug).filter((slug) => !tied.has(slug)));
}
const EMPTY_CLUBS = readEmptyClubs();

/** One page per route family — the families are what differ, not the hundreds of instances of one. */
const ROUTES = process.env.SCVAL_A11Y_ROUTES?.split(',') ?? [
  '/',
  '/standings',
  '/standings/bval',
  '/standings/mcal',
  '/standings/eal',
  '/standings/city',
  // A group with no league table (DESIGN §24.9): its standings page and a team page have their own layout.
  '/standings/independents',
  '/schedule',
  '/schedule/pcal',
  '/schedule/eal',
  '/schedule/sunset',
  '/teams',
  '/teams/leigh',
  '/teams/tamalpais',
  '/teams/davis',
  '/teams/la-jolla',
  '/teams/glendora',
  '/playoffs',
  '/playoffs/mcal',
  '/leaders',
  '/jv',
  '/about',
  '/history/2025-26',
  '/clubs',
  '/commits',
  '/recruiting',
];

function load() {
  try {
    return {
      axeSource: readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'),
      chromium: require('playwright').chromium,
    };
  } catch {
    console.error(
      'scripts/a11y-axe.mjs needs axe-core and playwright. Install them outside this pnpm tree\n' +
        'and point NODE_PATH at them:\n' +
        '  (mkdir -p /tmp/axe && cd /tmp/axe && npm init -y >/dev/null &&\n' +
        '    npm install --no-save axe-core playwright && npx playwright install --with-deps chromium)\n' +
        '  NODE_PATH=/tmp/axe/node_modules node scripts/a11y-axe.mjs',
    );
    process.exit(2);
  }
}

/**
 * The half of WCAG 2.5.8 axe will not report: a STANDALONE action link that is 17-18px tall.
 *
 * axe exempts an undersized target whenever a 24px circle on it clears its neighbours, which a lone
 * link in its own paragraph always does — so `target-size` passed while the day nav on
 * /scores/[date], the back link on /game/[id] and the one action of every empty state were all the
 * bare height of `text-meta`. 2.5.8's exception is for a target "in a sentence or ... constrained by
 * the line-height of non-target text", and a link that is the only thing in its block is neither;
 * app/globals.css states the rule and `.sx-action` is how it is met.
 *
 * "Standalone" is read off the rendered DOM rather than guessed from the source: the link's nearest
 * block ancestor is cloned, the interactive elements and the visually hidden text are removed, and if
 * nothing readable survives then there was no sentence around it. Decorative text STAYS — a run of
 * names joined by `aria-hidden` middots (the CCS-qualifying band under each standings table) is
 * constrained by the line-height of that punctuation, which is the other half of the exception.
 *
 * A target inside a `<table>` or a `<dl>` is also left alone. There the row, not the link, is the
 * thing being aimed at, and the rows are far enough apart that the 24px circles never meet (the
 * archive tables on /history measure 44px centre to centre) — so padding the link would add height to
 * every row of every table to restate a rule already satisfied.
 */
const STANDALONE_TARGET_PROBE = `window.findUndersizedStandaloneTargets = () => {
  const out = [];
  for (const el of document.querySelectorAll('a[href], button, summary')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0 || rect.height >= 24) continue;
    if (el.closest('.sr-only')) continue;
    if (el.closest('table, dl')) continue;
    let block = el.parentElement;
    while (block && getComputedStyle(block).display.startsWith('inline')) block = block.parentElement;
    if (!block) continue;
    const clone = block.cloneNode(true);
    for (const drop of clone.querySelectorAll('a, button, summary, .sr-only')) drop.remove();
    if ((clone.textContent || '').trim().length > 0) continue;
    out.push({
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40),
      size: Math.round(rect.width) + 'x' + Math.round(rect.height),
      block: block.tagName.toLowerCase(),
    });
  }
  return out;
};`;

/** A route that carries a parameter is resolved from the sitemap, so no id is hard-coded here. */
async function sampleDynamicRoutes() {
  const xml = await fetch(`${BASE}/sitemap.xml`).then((r) => r.text());
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  const first = (prefix) => locs.find((p) => p.startsWith(prefix));
  const firstEmptyClub = locs.find((p) => p.startsWith('/clubs/') && EMPTY_CLUBS.has(p.slice('/clubs/'.length)));
  return [first('/game/'), first('/scores/'), first('/teams/'), first('/game/sblive-'), first('/clubs/'), firstEmptyClub]
    .filter((p, i, all) => p && !ROUTES.includes(p) && all.indexOf(p) === i);
}

const { axeSource, chromium } = load();
const routes = [...ROUTES, ...(await sampleDynamicRoutes())];
const browser = await chromium.launch({ args: ['--no-sandbox'] });
let serious = 0;
let checked = 0;

/** A context with the theme and the given localStorage entries set before any page script runs. */
async function newContext({ theme = 'light', width = 390, height = 900, storage = {} } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
  await context.addInitScript((entries) => {
    try {
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    } catch {
      /* a blocked store is a supported state — the page still renders */
    }
  }, { 'scvalfh.theme': theme, ...storage });
  return context;
}

async function open(context, route) {
  const page = await context.newPage();
  const response = await page.goto(BASE + route, { waitUntil: 'networkidle' });
  if (!response || response.status() !== 200) {
    console.error(`FAIL ${route}: HTTP ${response ? response.status() : '??'}`);
    serious += 1;
    await page.close();
    return null;
  }
  return page;
}

/** axe (serious/critical) and the standalone-target probe on the page as it is now. */
async function check(page, label) {
  await page.addScriptTag({ content: axeSource });
  await page.addScriptTag({ content: STANDALONE_TARGET_PROBE });
  const violations = await page.evaluate(async () => {
    // `target-size` (WCAG 2.2 SC 2.5.8) ships DISABLED in axe-core, so a run with the defaults
    // reported zero while standalone action links were 18px tall and the margin-strip columns
    // were 18px wide with a 2px gap. Enabled explicitly rather than switching to `runOnly`,
    // which would have narrowed the run to one tag set and dropped rules that are on today.
    const result = await window.axe.run(document, {
      resultTypes: ['violations'],
      rules: { 'target-size': { enabled: true } },
    });
    return result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 3).map((n) => ({
        target: n.target.join(' '),
        summary: (n.failureSummary ?? '').replace(/\s+/g, ' ').slice(0, 240),
      })),
    }));
  });
  checked += 1;
  const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  serious += bad.length;
  if (violations.length) {
    console.log(`${label}: ${violations.length} violation(s)`);
    for (const v of violations) {
      console.log(`   [${v.impact}] ${v.id} — ${v.help}`);
      for (const n of v.nodes) console.log(`        ${n.target} :: ${n.summary}`);
    }
  }
  const undersized = await page.evaluate(() => findUndersizedStandaloneTargets());
  serious += undersized.length;
  if (undersized.length) {
    console.log(`${label}: ${undersized.length} standalone target(s) under 24px`);
    for (const t of undersized) console.log(`   ${t.size} ${t.tag} ${JSON.stringify(t.text)} in <${t.block}>`);
  }
}

function failRun(label, why) {
  console.error(`FAIL ${label}: ${why}`);
  serious += 1;
}

// ---------------------------------------------------------------- 1-3: the route families
for (const theme of ['light', 'dark']) {
  for (const width of [390, 1280]) {
    const tag = `${width} ${theme}`;
    const context = await newContext({ theme, width });
    for (const route of routes) {
      const page = await open(context, route);
      if (!page) continue;
      await check(page, `${route} ${tag}`);
      await page.close();
    }

    // /teams with "mar" typed: the in-place filter, its result chips and the live region.
    const teams = await open(context, '/teams');
    if (teams) {
      const input = teams.locator('input[type="search"]').first();
      if ((await input.count()) === 0) failRun(`/teams ${tag}`, 'no search field');
      else {
        await input.fill('mar');
        await teams.waitForTimeout(400);
        await check(teams, `/teams (typed "mar") ${tag}`);
      }
      await teams.close();
    }

    // /teams with a SoCal team typed under the default (NorCal) region: the lift
    // (`[data-teams-page]:has(search[data-searching]) #team-list [data-region-scope]`) must show the
    // SoCal list, so the tile the finder's live region announces is rendered, not display:none.
    const lift = await open(context, '/teams');
    if (lift) {
      const input = lift.locator('input[type="search"]').first();
      if ((await input.count()) === 0) failRun(`/teams (typed "${SOCAL_QUERY}") ${tag}`, 'no search field');
      else {
        await input.fill(SOCAL_QUERY);
        await lift.waitForTimeout(400);
        const shown = await lift.evaluate(() => {
          const scope = document.querySelector('#team-list [data-region-scope="socal"]');
          const tile = document.querySelector('#team-list [data-team-slug="la-jolla"]');
          return {
            region: document.documentElement.getAttribute('data-region'),
            scope: scope ? getComputedStyle(scope).display : null,
            tile: tile ? tile.getClientRects().length > 0 : null,
          };
        });
        if (shown.region !== null) failRun(`/teams (typed "${SOCAL_QUERY}") ${tag}`, `stamped data-region=${shown.region}, expected none (NorCal)`);
        if (shown.scope === null) failRun(`/teams (typed "${SOCAL_QUERY}") ${tag}`, 'no [data-region-scope="socal"] list in #team-list');
        else if (shown.scope === 'none') failRun(`/teams (typed "${SOCAL_QUERY}") ${tag}`, 'the SoCal list stays display:none while the finder searches');
        if (shown.tile === false) failRun(`/teams (typed "${SOCAL_QUERY}") ${tag}`, 'the la-jolla tile is not rendered');
        await check(lift, `/teams (typed "${SOCAL_QUERY}", NorCal region) ${tag}`);
      }
      await lift.close();
    }
    await context.close();

    // `/` under each remembered league, 'all', a pin alone (the prefs script derives the league), and
    // the region runs (DESIGN-socal §2.4).
    const runs = [
      ...[...new Set([...LEAGUES, 'city'])].map((id) => ({
        label: `league=${id}`, storage: { 'scvalfh.league': id }, league: id, pin: null, region: regionStampOf(id),
      })),
      { label: 'league=all', storage: { 'scvalfh.league': 'all' }, league: null, pin: null, region: null },
      { label: `pinnedTeam=${PIN}`, storage: { 'scvalfh.pinnedTeam': PIN }, league: PIN_LEAGUE, pin: PIN, region: regionStampOf(PIN_LEAGUE) },
      // The SoCal first-visit view: no league, region SoCal.
      { label: 'region=socal', storage: { 'scvalfh.region': 'socal' }, league: null, pin: null, region: 'socal' },
      // A stored region beats a pin of the other region: the pin is kept, no league comes from it.
      {
        label: `region=socal, pinnedTeam=${PIN}`,
        storage: { 'scvalfh.region': 'socal', 'scvalfh.pinnedTeam': PIN },
        league: regionStampOf(PIN_LEAGUE) === 'socal' ? PIN_LEAGUE : null,
        pin: PIN,
        region: 'socal',
      },
    ];
    for (const run of runs) {
      const ctx = await newContext({ theme, width, storage: run.storage });
      const page = await open(ctx, '/');
      if (page) {
        const stamp = await page.evaluate(() => ({
          league: document.documentElement.getAttribute('data-league'),
          pin: document.documentElement.getAttribute('data-pin'),
          region: document.documentElement.getAttribute('data-region'),
        }));
        if (stamp.league !== run.league || stamp.pin !== run.pin || stamp.region !== run.region) {
          failRun(
            `/ (${run.label}) ${tag}`,
            `stamped data-league=${stamp.league} data-pin=${stamp.pin} data-region=${stamp.region}, ` +
              `expected ${run.league} / ${run.pin} / ${run.region}`,
          );
        }
        await check(page, `/ (${run.label}) ${tag}`);
        await page.close();
      }
      await ctx.close();
    }
  }
}

// ---------------------------------------------------------------- 4: keyboard focus after "Show BVAL here"
{
  const label = 'keyboard: / (no stored league) Tab to "Show BVAL here", Enter';
  const ctx = await newContext({ width: 390, height: 844 });
  const page = await open(ctx, '/');
  if (page) {
    const button = page.getByRole('button', { name: 'Show BVAL here' });
    await button.waitFor({ state: 'visible' });
    await page.waitForFunction(() => [...document.querySelectorAll('button')]
      .some((b) => b.textContent.trim() === 'Show BVAL here' && !b.disabled));
    let reached = false;
    for (let i = 0; i < 300 && !reached; i += 1) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => document.activeElement?.textContent?.trim() === 'Show BVAL here');
    }
    if (!reached) failRun(label, 'Tab never reached the button');
    else {
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.activeElement?.closest('[data-scope="bval"]') != null, null, { timeout: 3000 })
        .catch(() => undefined);
      const focus = await page.evaluate(() => ({
        inside: document.activeElement?.closest('[data-scope="bval"]') != null,
        what: document.activeElement ? `${document.activeElement.tagName.toLowerCase()}#${document.activeElement.id}` : 'none',
      }));
      if (!focus.inside) failRun(label, `focus is on ${focus.what}, not inside [data-scope="bval"]`);
      else console.log(`${label}: focus moved to ${focus.what} inside [data-scope="bval"]`);
    }
    await page.close();
  }
  await ctx.close();
}

// ---------------------------------------------------------------- 4b: keyboard: the region switcher
{
  const label = 'keyboard: / (no stored region) Tab to "SoCal", Enter';
  const ctx = await newContext({ width: 390, height: 844 });
  const page = await open(ctx, '/');
  if (page) {
    const selector = '[role="group"][aria-label="Region"] button[data-region-option="socal"]';
    await page.waitForFunction((sel) => document.querySelector(sel)?.disabled === false, selector, { timeout: 5000 })
      .catch(() => undefined);
    let reached = false;
    for (let i = 0; i < 300 && !reached; i += 1) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate((sel) => document.activeElement === document.querySelector(sel), selector);
    }
    if (!reached) failRun(label, 'Tab never reached the SoCal button');
    else {
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.documentElement.getAttribute('data-region') === 'socal', null, { timeout: 3000 })
        .catch(() => undefined);
      const after = await page.evaluate((sel) => ({
        region: document.documentElement.getAttribute('data-region'),
        pressed: document.querySelector(sel)?.getAttribute('aria-pressed'),
        focusKept: document.activeElement === document.querySelector(sel),
        rendered: [...document.querySelectorAll('[data-region-scope="socal"]')].some((el) => el.getClientRects().length > 0),
        norcalShown: [...document.querySelectorAll('[data-region-scope="norcal"]')].some((el) => el.getClientRects().length > 0),
      }), selector);
      if (after.region !== 'socal') failRun(label, `stamped data-region=${after.region}, expected socal`);
      if (after.pressed !== 'true') failRun(label, `aria-pressed=${after.pressed}, expected true`);
      if (!after.rendered) failRun(label, 'no [data-region-scope="socal"] element is rendered');
      if (after.norcalShown) failRun(label, 'a [data-region-scope="norcal"] element is still rendered');
      if (!after.focusKept) failRun(label, 'focus left the SoCal button');
      if (after.region === 'socal' && after.pressed === 'true' && after.rendered && !after.norcalShown) {
        console.log(`${label}: data-region=socal, the SoCal blocks rendered, the NorCal ones hidden, focus kept`);
      }
    }
    await page.close();
  }
  await ctx.close();
}

// ---------------------------------------------------------------- 5: the SPEC §10.1 fold, measured and printed
/**
 * The fold is the top of the fixed bottom tab bar (the viewport bottom where there is none):
 * content under the bar is not visible without scrolling.
 */
async function measureFold(storage, height) {
  const ctx = await newContext({ width: 390, height, storage });
  const page = await open(ctx, '/');
  let out = null;
  if (page) {
    out = await page.evaluate(() => {
      const bar = document.querySelector('nav.sx-chrome-bottom');
      const barTop = bar && getComputedStyle(bar).display !== 'none' ? bar.getBoundingClientRect().top : window.innerHeight;
      const league = document.documentElement.getAttribute('data-league');
      const panel = league ? document.querySelector(`section[data-scope="${league}"]`) : null;
      let list = null;
      if (panel) {
        for (const section of panel.querySelectorAll('section')) {
          if (/Latest scores/.test(section.querySelector('h2, h3')?.textContent ?? '') && section.querySelector('ol')) {
            list = section.querySelector('ol');
            break;
          }
        }
        list ??= panel.querySelector('ol');
      }
      const rows = list ? [...list.children].map((li) => li.getBoundingClientRect().bottom) : [];
      const slot = document.querySelector('.sx-myteam-slot');
      const slotRect = slot && getComputedStyle(slot).display !== 'none' ? slot.getBoundingClientRect() : null;
      return {
        fold: Math.round(barTop),
        cardBottom: slotRect ? Math.round(slotRect.bottom) : null,
        rowsAbove: rows.filter((b) => b <= barTop).length,
        rowBottoms: rows.map((b) => Math.round(b)),
      };
    });
    await page.close();
  }
  await ctx.close();
  return out;
}
const foldRuns = [
  { label: `pinned (${PIN})`, storage: { 'scvalfh.pinnedTeam': PIN }, height: 664, target: (m) => m.cardBottom != null && m.cardBottom <= m.fold, goal: 'whole pinned card above the fold' },
  { label: `pinned (${PIN})`, storage: { 'scvalfh.pinnedTeam': PIN }, height: 844, target: (m) => m.rowsAbove >= 2, goal: '≥ 2 Latest rows above the fold' },
  { label: 'no pin, league=bval', storage: { 'scvalfh.league': 'bval' }, height: 664, target: (m) => m.rowsAbove >= 2, goal: '≥ 2 Latest rows above the fold' },
];
for (const run of foldRuns) {
  const m = await measureFold(run.storage, run.height);
  if (!m) continue;
  console.log(
    `fold: ${run.label} at 390×${run.height}: fold ${m.fold}px; My-team slot bottom ${m.cardBottom ?? '—'}px; ` +
      `Latest row bottoms [${m.rowBottoms.join(', ')}] → ${m.rowsAbove} above; target "${run.goal}": ${run.target(m) ? 'met' : 'MISSED'}`,
  );
}

// ---------------------------------------------------------------- 6: the switcher and league cards, measured and printed
/**
 * The first-visit `/` (no stored league, no pin) at one width and height. Positions are page
 * coordinates (scroll 0), so they do not depend on the height; the fold does.
 */
async function measureLayout(width, height) {
  const ctx = await newContext({ width, height });
  const page = await open(ctx, '/');
  let out = null;
  if (page) {
    await page.waitForFunction(() => document.querySelector('[role="group"][aria-label="Your league"] button:not([disabled])') != null, null, { timeout: 5000 })
      .catch(() => undefined);
    out = await page.evaluate(() => {
      const bar = document.querySelector('nav.sx-chrome-bottom');
      const fold = bar && getComputedStyle(bar).display !== 'none' ? bar.getBoundingClientRect().top : window.innerHeight;
      const group = document.querySelector('[role="group"][aria-label="Your league"]');
      // Rendered chips only: the other region's lists are display:none.
      const chips = group
        ? [...group.querySelectorAll('button[data-league-option]')].filter((b) => b.getClientRects().length > 0).map((b) => b.getBoundingClientRect())
        : [];
      const groupRect = group?.getBoundingClientRect() ?? null;
      const region = document.querySelector('[role="group"][aria-label="Region"]');
      const regionRect = region && region.getClientRects().length > 0 ? region.getBoundingClientRect() : null;
      // Rendered cards only: the card grid is one list per region, the other region's display:none.
      const cards = [...document.querySelectorAll('section[data-scope="none"] ul.grid > li')]
        .filter((li) => li.getClientRects().length > 0)
        .map((li) => li.getBoundingClientRect());
      return {
        fold: Math.round(fold),
        chips: chips.length,
        chipRows: new Set(chips.map((r) => Math.round(r.top))).size,
        switcherBottom: groupRect ? Math.round(groupRect.bottom) : null,
        region: regionRect
          ? { top: Math.round(regionRect.top), bottom: Math.round(regionRect.bottom), width: Math.round(regionRect.width) }
          : null,
        rowTops: [...new Set([
          ...(regionRect ? [Math.round(regionRect.top)] : []),
          ...chips.map((r) => Math.round(r.top)),
        ])].length,
        cards: cards.map((r) => ({ top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width) })),
        cardsAbove: cards.filter((r) => r.bottom <= fold).length,
      };
    });
    await page.close();
  }
  await ctx.close();
  return out;
}
for (const width of [320, 360, 390]) {
  for (const height of [664, 844]) {
    const m = await measureLayout(width, height);
    if (!m) continue;
    const rows = [...new Set(m.cards.map((c) => c.top))].length;
    console.log(
      `layout: / (first visit) at ${width}×${height}: fold ${m.fold}px; region switcher ` +
        `${m.region ? `${m.region.top}–${m.region.bottom} w${m.region.width}` : '—'}; switcher ${m.chips} chips in ${m.chipRows} row(s) ` +
        `(${m.rowTops} row(s) with the region switcher), ` +
        `bottom ${m.switcherBottom ?? '—'}px; ${m.cards.length} league cards in ${rows} row(s) ` +
        `[${m.cards.map((c) => `${c.top}–${c.bottom} w${c.width}`).join(', ')}] → ${m.cardsAbove} wholly above the fold`,
    );
  }
}

await browser.close();
console.log(
  `axe: ${checked} page loads checked, ${serious} serious/critical violation(s) ` +
    'including undersized standalone targets and failed probes',
);
process.exit(serious === 0 ? 0 : 1);
