/**
 * Every `<Link>` this site renders ONCE PER DATA ROW carries `prefetch={false}`.
 *
 * The reason is written out in components/layout/NavLink.tsx and components/ui/StandingsTable.tsx:
 * every route here is STATIC, and Next 16's default `auto` downloads a static route IN FULL — data
 * included — the moment the link enters the viewport
 * (node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md, "`prefetch`"). The
 * framework answer, `partialPrefetching`, needs `cacheComponents`, which this project keeps off
 * (BUILD-BRIEF), so the per-link prop is the only lever. A link that repeats per row multiplies the
 * whole thing: /standings carries sixteen team links, /schedule forty-nine day links, /history up to
 * thirty-two.
 *
 * It was fixed once for the row links and came straight back through the in-content lists — the
 * CCS-qualifying band under each standings table still pulled all sixteen team pages — so the rule
 * is asserted structurally rather than site by site: ANY `<Link>` inside a `.map()` callback must
 * carry the prop. That is the shape "one link per row" takes in this codebase, and it is what makes
 * a NEW list component fail here instead of on someone's phone bill.
 *
 * A singleton link is deliberately NOT covered. One speculative payload for the one page a reader
 * is being pointed at is prefetching doing its job; the cost only appears when the link is a row.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sources(full));
    else if (/\.tsx$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * The source with every comment and string literal replaced by spaces of the same length.
 *
 * Positions are preserved, so a span computed here indexes the ORIGINAL text. Blanking is what
 * makes the paren matching below safe — and it is also why the prose of a comment explaining
 * `prefetch={false}` can never be mistaken for the prop itself.
 */
function blanked(src: string): string {
  const out = src.split('');
  const blank = (from: number, to: number) => {
    for (let i = from; i < to && i < out.length; i += 1) if (out[i] !== '\n') out[i] = ' ';
  };
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '//') {
      const end = src.indexOf('\n', i);
      blank(i, end === -1 ? src.length : end);
      i = end === -1 ? src.length : end;
    } else if (two === '/*') {
      const end = src.indexOf('*/', i + 2);
      blank(i, end === -1 ? src.length : end + 2);
      i = end === -1 ? src.length : end + 2;
    } else if (src[i] === "'" || src[i] === '"' || src[i] === '`') {
      const quote = src[i];
      let j = i + 1;
      while (j < src.length && src[j] !== quote) j += src[j] === '\\' ? 2 : 1;
      blank(i + 1, j);
      i = j + 1;
    } else {
      i += 1;
    }
  }
  return out.join('');
}

/** `[start, end)` of every `.map(` callback, by paren balance over the blanked source. */
function mapSpans(flat: string): [number, number][] {
  const spans: [number, number][] = [];
  const re = /\.map\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(flat)) !== null) {
    let depth = 0;
    let i = m.index + m[0].length - 1;
    for (; i < flat.length; i += 1) {
      if (flat[i] === '(') depth += 1;
      else if (flat[i] === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    spans.push([m.index, i]);
  }
  return spans;
}

/** Every `<Link` opening tag, as `{line, start, text}` over the ORIGINAL source. */
function linkTags(src: string, flat: string): { line: number; start: number; text: string }[] {
  const tags: { line: number; start: number; text: string }[] = [];
  const re = /<Link[\s>]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(flat)) !== null) {
    let depth = 0;
    let i = m.index;
    for (; i < flat.length; i += 1) {
      if (flat[i] === '{') depth += 1;
      else if (flat[i] === '}') depth -= 1;
      else if (flat[i] === '>' && depth === 0) break;
    }
    tags.push({
      line: src.slice(0, m.index).split('\n').length,
      start: m.index,
      text: src.slice(m.index, i + 1),
    });
  }
  return tags;
}

const FILES = [...sources(path.join(ROOT, 'components')), ...sources(path.join(ROOT, 'app'))];

describe('prefetch policy: a link that repeats per row never prefetches', () => {
  it('finds the Links to check at all', () => {
    expect(FILES.length).toBeGreaterThan(40);
    const total = FILES.reduce((n, f) => {
      const src = readFileSync(f, 'utf8');
      return n + linkTags(src, blanked(src)).length;
    }, 0);
    // Guards the scanner itself: a regex that silently stopped matching would make every
    // assertion below vacuous.
    expect(total).toBeGreaterThan(40);
  });

  it('puts prefetch={false} on every <Link> rendered inside a .map() callback', () => {
    const offenders: string[] = [];
    let checked = 0;
    for (const file of FILES) {
      const src = readFileSync(file, 'utf8');
      const flat = blanked(src);
      const spans = mapSpans(flat);
      for (const tag of linkTags(src, flat)) {
        const inList = spans.some(([from, to]) => tag.start > from && tag.start < to);
        if (!inList) continue;
        checked += 1;
        if (!/prefetch=\{false\}/.test(tag.text)) {
          offenders.push(`${path.relative(ROOT, file)}:${tag.line}`);
        }
      }
    }
    // The `.map()` shape only catches a link written INLINE in the list. A per-row link that lives
    // in its own component — `RowLink`, `GameLogRow`, `SectionHeader`, `StatTile`, `DateHeader` —
    // is a row link all the same, and the `WANT` table below is what holds those. The floor is a
    // scanner guard, not a target.
    expect(checked).toBeGreaterThanOrEqual(11);
    expect(offenders).toEqual([]);
  });

  it('keeps the prop on the call sites a measurement named, by href', () => {
    // A string matches as a substring of the tag; a RegExp with `.test()`. The two game links take
    // either form because their owners switch them to `gameHref` only in Stage C (SPEC §10.2), and
    // this test has to pass before that; tests/legacy-imports.test.ts then bans the raw
    // `/game/${…}` template in app/ and components/, so the old form cannot come back.
    const GAME_LINK = /gameHref\(game\.contestId\)|\/game\/\$\{game\.contestId\}/;
    const WANT: [string, string | RegExp][] = [
      ['components/ui/StandingsTable.tsx', 'href={href}'],
      ['components/standings/PlayoffStatusBand.tsx', '/teams/${team.slug}'],
      ['components/playoffs/PlayoffProjection.tsx', '/teams/${row.team.slug}'],
      ['components/playoffs/PlayoffBracket.tsx', GAME_LINK],
      ['components/teams/TeamTile.tsx', '/teams/${team.slug}'],
      ['components/teams/TeamUnbeaten.tsx', '/teams/${opponent.slug}'],
      ['components/about/HistoryStandingsTable.tsx', '/teams/${team.slug}'],
      ['components/about/AwardsBlock.tsx', '/teams/${team.slug}'],
      ['components/about/CrossCheckTable.tsx', '/teams/${team.slug}'],
      ['components/game/SeasonSeries.tsx', GAME_LINK],
      ['components/schedule/DateHeader.tsx', 'href={shareHref}'],
      ['components/ui/SectionHeader.tsx', 'href={action.href}'],
      ['components/ui/StatTile.tsx', 'href={href}'],
      // The team finder's "Divisions and leagues" results and the link-mode league chips are
      // per-row links rendered by a helper inside a .map().
      ['components/search/TeamFinder.tsx', 'href={group.href}'],
      ['components/layout/LeagueSwitcher.tsx', 'href={href}'],
    ];
    for (const [rel, href] of WANT) {
      const src = readFileSync(path.join(ROOT, rel), 'utf8');
      const matches = (text: string) => (typeof href === 'string' ? text.includes(href) : href.test(text));
      const tags = linkTags(src, blanked(src)).filter((t) => matches(t.text));
      expect(tags.length, `${rel} ${String(href)}`).toBeGreaterThan(0);
      for (const tag of tags) {
        expect(/prefetch=\{false\}/.test(tag.text), `${rel}:${tag.line} ${String(href)}`).toBe(true);
      }
    }
  });
});
