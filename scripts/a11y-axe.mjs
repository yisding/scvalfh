/**
 * DESIGN §10.9(a): axe-core over one page of every route family, in both themes and at both
 * widths, against the real production build. Exits non-zero on a serious or critical violation.
 *
 * Run it against a server you started yourself:
 *
 *   pnpm build && pnpm exec next start -p 3117 &
 *   node scripts/a11y-axe.mjs
 *
 * `axe-core` and `playwright` are intentionally NOT repo dependencies — they are needed to check
 * the site, not to build or ship it — so this script resolves them at run time and says plainly
 * what to install when they are missing. The CI workflow installs them with `--no-save`.
 *
 * What it does not cover: §10.9(b) grayscale and (c) forced-colors are visual comparisons that a
 * machine cannot judge for us. The token-contrast half of the gate is a unit test
 * (tests/ui/contrast.test.ts) and the never-0-0 half is tests/ui/rendered-never-00.test.ts.
 */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const BASE = process.env.SCVAL_BASE_URL ?? 'http://127.0.0.1:3117';

/** One page per route family — the families are what differ, not the 158 instances of one. */
const ROUTES = process.env.SCVAL_A11Y_ROUTES?.split(',') ?? [
  '/',
  '/standings',
  '/schedule',
  '/teams',
  '/playoffs',
  '/about',
  '/history/2025-26',
];

function load() {
  try {
    return {
      axeSource: readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'),
      chromium: require('playwright').chromium,
    };
  } catch {
    console.error(
      'scripts/a11y-axe.mjs needs axe-core and playwright:\n' +
        '  npm install --no-save axe-core playwright && npx playwright install --with-deps chromium',
    );
    process.exit(2);
  }
}

/** A route that carries a parameter is resolved from the sitemap, so no id is hard-coded here. */
async function sampleDynamicRoutes() {
  const xml = await fetch(`${BASE}/sitemap.xml`).then((r) => r.text());
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  const first = (prefix) => locs.find((p) => p.startsWith(prefix));
  return [first('/game/'), first('/scores/'), first('/teams/')].filter(Boolean);
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

const { axeSource, chromium } = load();
const routes = [...ROUTES, ...(await sampleDynamicRoutes())];
const browser = await chromium.launch({ args: ['--no-sandbox'] });
let serious = 0;
let checked = 0;

for (const theme of ['light', 'dark']) {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      colorScheme: theme,
    });
    await context.addInitScript((value) => {
      try {
        localStorage.setItem('scvalfh.theme', value);
      } catch {
        /* a blocked store is a supported state — the page still renders */
      }
    }, theme);

    for (const route of routes) {
      const page = await context.newPage();
      const response = await page.goto(BASE + route, { waitUntil: 'networkidle' });
      if (!response || response.status() !== 200) {
        console.error(`FAIL ${route} ${width} ${theme}: HTTP ${response ? response.status() : '??'}`);
        serious += 1;
        await page.close();
        continue;
      }
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
        console.log(`${route} ${width} ${theme}: ${violations.length} violation(s)`);
        for (const v of violations) {
          console.log(`   [${v.impact}] ${v.id} — ${v.help}`);
          for (const n of v.nodes) console.log(`        ${n.target} :: ${n.summary}`);
        }
      }

      const undersized = await page.evaluate(() => findUndersizedStandaloneTargets());
      serious += undersized.length;
      if (undersized.length) {
        console.log(`${route} ${width} ${theme}: ${undersized.length} standalone target(s) under 24px`);
        for (const t of undersized) console.log(`   ${t.size} ${t.tag} ${JSON.stringify(t.text)} in <${t.block}>`);
      }
      await page.close();
    }
    await context.close();
  }
}

await browser.close();
console.log(
  `axe: ${checked} page loads checked, ${serious} serious/critical violation(s) ` +
    'including undersized standalone targets',
);
process.exit(serious === 0 ? 0 : 1);
