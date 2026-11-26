/**
 * "New scores are in" (DESIGN §35.7): the poll behind components/festival/FestivalFreshness.tsx, in an import-free
 * leaf so the server chrome can share its attribute name and a test can drive it without a browser.
 *
 * Why a content stamp and not HTTP validators: ncfh.net (vinext on Cloudflare Workers) sends neither an ETag nor a
 * Last-Modified on its prerendered pages (checked 2026-11-26 with HEAD and GET, HTTP/1.1 and 2, every encoding), so
 * a `HEAD` compared header to header saw `null` every time and never said anything. Instead every festival page
 * prints the committed festival.json's `fetchedAt` as `data-fest-stamp` (FestivalChrome). The refresh commits only
 * when the content changed (festivalContentKey ignores `fetchedAt` alone), so the stamp moves with the scores and
 * with nothing else: another sport's deploy, which changes every page's bytes and build id, leaves it alone.
 *
 * While the tab is visible the poll GETs one small festival page, FRESHNESS_URL, every FRESHNESS_EVERY_MS with
 * `cache: 'no-store'` (and once at once when a hidden tab comes back), reads its stamp and compares it with the
 * page's own. Different: it reports once and stops.
 * It does not start at all without a stamp of its own, stops when a response carries none (it cannot tell), and
 * stops while the tab is hidden. Every error (offline at the fields) waits for the next turn.
 */

/** The attribute the festival chrome prints the committed file's `fetchedAt` in. */
export const FEST_STAMP_ATTR = 'data-fest-stamp';

/** The page polled: the club index, small (about 27 KB gzip) and the same on every deploy of the event. */
export const FRESHNESS_URL = '/festival/clubs';

/** Every 3 minutes while the tab is visible. */
export const FRESHNESS_EVERY_MS = 3 * 60_000;

const STAMP_IN = new RegExp(`${FEST_STAMP_ATTR}="([^"]+)"`);

/** The stamp a page's HTML carries, or null when it has none. */
export function stampIn(html: string): string | null {
  return STAMP_IN.exec(html)?.[1] ?? null;
}

/** What one poll found: the same scores, newer ones, or a page that cannot tell (no stamp in it). */
export type FreshnessVerdict = 'same' | 'changed' | 'unknown';

export function freshnessVerdict(own: string, html: string): FreshnessVerdict {
  const theirs = stampIn(html);
  if (theirs === null) return 'unknown';
  return theirs === own ? 'same' : 'changed';
}

/** What the poll needs from the browser: passed in, so a test runs it in Node. */
export interface FreshnessEnv {
  fetch: (url: string, init: { cache: 'no-store' }) => Promise<{ ok: boolean; text: () => Promise<string> }>;
  visible: () => boolean;
  onVisibility: (fn: () => void) => () => void;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (id: unknown) => void;
}

/**
 * Start polling for `stamp`; `onChange` runs once, when a newer stamp is seen. Returns the stop function. Nothing
 * starts when `stamp` is empty or the event is `complete`.
 */
export function pollFreshness(opts: { stamp: string; complete: boolean; onChange: () => void; env: FreshnessEnv }): () => void {
  const { stamp, complete, onChange, env } = opts;
  if (complete || !stamp) return () => {};
  let timer: unknown = null;
  let stopped = false;
  const pause = () => {
    if (timer !== null) env.clearInterval(timer);
    timer = null;
  };
  let unlisten = () => {};
  const stop = () => {
    stopped = true;
    pause();
    unlisten();
  };
  const check = async () => {
    try {
      const res = await env.fetch(FRESHNESS_URL, { cache: 'no-store' });
      if (!res.ok || stopped) return;
      const verdict = freshnessVerdict(stamp, await res.text());
      if (stopped || verdict === 'same') return;
      if (verdict === 'changed') onChange();
      stop();
    } catch {
      /* offline at the fields: try again next time */
    }
  };
  const start = () => {
    if (timer === null) timer = env.setInterval(() => void check(), FRESHNESS_EVERY_MS);
  };
  unlisten = env.onVisibility(() => {
    if (stopped) return;
    if (env.visible()) {
      void check();
      start();
    } else pause();
  });
  // No check on load: the page's own stamp is the baseline, so the first question is worth asking only later.
  if (env.visible()) start();
  return stop;
}
