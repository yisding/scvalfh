/**
 * Following festival teams (DESIGN §35 §7): the head script (components/festival/follow-script.ts), run as the
 * browser runs it, in a `node:vm` context with a fake `localStorage` and `<html>`; its size; its agreement with
 * the client's own parser; and the generated stylesheet (components/festival/follow-css.ts).
 */
import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

import { buildFestivalFollowCss } from '../../components/festival/follow-css';
import {
  FEST_FOLLOW_ATTR,
  FEST_FOLLOW_KEY,
  FEST_FOLLOW_MAX,
  FEST_FOLLOW_RESTAMP,
  FEST_FOLLOW_SCRIPT,
  parseFollows,
} from '../../components/festival/follow-script';
import { festivalTeamSlugs } from '../../lib/festival/festival';

class FakeHtml {
  attrs = new Map<string, string>();
  setAttribute(k: string, v: string) {
    this.attrs.set(k, String(v));
  }
  removeAttribute(k: string) {
    this.attrs.delete(k);
  }
}

function run(stored: string | null | 'throws') {
  const html = new FakeHtml();
  const store: Record<string, string> = stored !== null && stored !== 'throws' ? { [FEST_FOLLOW_KEY]: stored } : {};
  const listeners: Array<(e: { key: string | null }) => void> = [];
  const localStorage = {
    getItem(k: string) {
      if (stored === 'throws') throw new Error('SecurityError: storage is blocked');
      return k in store ? store[k] : null;
    },
  };
  const context: Record<string, unknown> = { document: { documentElement: html }, localStorage };
  context.window = Object.assign(context, {
    addEventListener: (type: string, fn: (e: { key: string | null }) => void) => {
      if (type === 'storage') listeners.push(fn);
    },
  });
  vm.runInNewContext(FEST_FOLLOW_SCRIPT, context);
  return { html, store, listeners, context };
}

describe('the head script', () => {
  // Measured 489 B on 2026-11-26; the line is that × 1.12 rounded up to 128 B. It runs on every page of the
  // field hockey site, before first paint, so it stays small: no slug list, no known-slug check (the client's).
  it('stays within 640 B', () => {
    expect(Buffer.byteLength(FEST_FOLLOW_SCRIPT, 'utf8')).toBeLessThanOrEqual(640);
  });

  it('has nothing that could close the <script>', () => {
    expect(FEST_FOLLOW_SCRIPT).not.toContain('<');
  });

  it('stamps the stored slugs on <html>, cleaned the way the client parses them', () => {
    for (const value of ['u16-agh-1', 'u16-agh-1 u19-wizards', 'a  b a BAD c-1 ../x', '', ' ']) {
      const { html } = run(value);
      const expected = parseFollows(value);
      expect(html.attrs.get(FEST_FOLLOW_ATTR) ?? null).toBe(expected.length ? expected.join(' ') : null);
    }
    expect(parseFollows('a  b a BAD c-1 ../x')).toEqual(['a', 'b', 'c-1']);
  });

  it('keeps at most FEST_FOLLOW_MAX', () => {
    const many = Array.from({ length: FEST_FOLLOW_MAX + 5 }, (_, i) => `t-${i}`).join(' ');
    expect(run(many).html.attrs.get(FEST_FOLLOW_ATTR)!.split(' ').length).toBe(FEST_FOLLOW_MAX);
    expect(parseFollows(many).length).toBe(FEST_FOLLOW_MAX);
  });

  it('stamps nothing when nothing is stored or storage throws', () => {
    expect(run(null).html.attrs.has(FEST_FOLLOW_ATTR)).toBe(false);
    expect(run('throws').html.attrs.has(FEST_FOLLOW_ATTR)).toBe(false);
  });

  it('leaves a restamp behind and restamps on another tab’s change', () => {
    const { html, store, listeners, context } = run('u10-weston');
    expect(typeof context[FEST_FOLLOW_RESTAMP]).toBe('function');
    store[FEST_FOLLOW_KEY] = 'u10-weston u12-weston';
    listeners.forEach((fn) => fn({ key: 'scvalfh.theme' }));
    expect(html.attrs.get(FEST_FOLLOW_ATTR)).toBe('u10-weston');
    listeners.forEach((fn) => fn({ key: FEST_FOLLOW_KEY }));
    expect(html.attrs.get(FEST_FOLLOW_ATTR)).toBe('u10-weston u12-weston');
    delete store[FEST_FOLLOW_KEY];
    (context[FEST_FOLLOW_RESTAMP] as () => void)();
    expect(html.attrs.has(FEST_FOLLOW_ATTR)).toBe(false);
  });
});

describe('the followed-team stylesheet', () => {
  const slugs = festivalTeamSlugs();
  const marks = buildFestivalFollowCss(slugs);
  const cards = buildFestivalFollowCss(slugs, { marks: false, cards: true });

  it('is one @layer base block (it must beat preflight’s important [hidden] rule in that layer)', () => {
    for (const css of [marks, cards]) {
      expect(css.startsWith('@layer base{')).toBe(true);
      expect(css.endsWith('}}')).toBe(true);
    }
  });

  it('marks every team by one selector keyed on the <html> stamp, and the star reads its property', () => {
    for (const slug of slugs) expect(marks).toContain(`[data-fest-follow~=${slug}] [data-fest-team=${slug}]`);
    expect(marks).toContain('{--sx-fest-pin:inline-block;font-weight:700}');
    expect(marks).toContain('[data-fest-team]{--sx-fest-pin:none}');
    expect(marks).toContain('[data-fest-team]>.sx-pin-note[hidden]{display:var(--sx-fest-pin)!important}');
    expect(marks).not.toContain('data-fest-card');
    // A star and a bold name, never a fill or a bar (DESIGN §33).
    expect(marks).not.toMatch(/background|box-shadow|border/);
  });

  it('the hub’s sheet reveals each team’s card and hides the empty state once anything is followed', () => {
    for (const slug of slugs) expect(cards).toContain(`[data-fest-follow~=${slug}] [data-fest-card=${slug}]`);
    expect(cards).toContain('html[data-fest-follow] [data-fest-empty]{display:none!important}');
    expect(cards).not.toContain('[data-fest-team=');
  });

  it('refuses a slug that is not a CSS identifier', () => {
    expect(() => buildFestivalFollowCss(['ok', 'u16"]{x}'])).toThrow(/not a CSS identifier/);
    expect(() => buildFestivalFollowCss(['9-lives'])).toThrow(/not a CSS identifier/);
  });

  // 118 teams: 9,239 B for the marks and 9,173 B for the cards on 2026-11-26 (1,255 and 1,214 B gzip), about 78 B
  // a team. The line is 100 B a team, so a team added mid-event fits and a selector that grew per slug does not.
  it('stays within 100 B a team', () => {
    expect(marks.length).toBeLessThanOrEqual(100 * slugs.length + 200);
    expect(cards.length).toBeLessThanOrEqual(100 * slugs.length + 200);
  });
});
