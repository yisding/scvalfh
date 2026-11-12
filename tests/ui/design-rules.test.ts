/**
 * The 2026-11-12 refresh's "do not bring these back" list (DESIGN §33), held structurally.
 *
 * The owner rejected two looks as AI design tropes (soft ring cards on a grey canvas; yellow
 * highlighter fills on off-white) and asked that tropes be actively avoided. Each rule here is one
 * of those, or one of the things the refresh removed on purpose, stated so that it fails in
 * `pnpm test` instead of drifting back through one utility class at a time:
 *
 * - no uppercase styling, no letter-spacing, nothing heavier than 700, no text under 12px;
 * - no yellow, and none of the retired palettes' literals;
 * - the reader's team is a star and a bold name: never a tint, a bar or a fill, and never reordered;
 * - sections are separated by space, table heads are untinted, logos are drawn as they are;
 * - navy fill is the band (header, live board, footer) and nothing else; the tint is group strips
 *   and hover and nothing else;
 * - nothing moves except inside the one `prefers-reduced-motion: no-preference` block.
 *
 * A source scan, modelled on tests/ui/class-join.test.ts.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO as ROOT } from '../helpers';

const RAW = readFileSync(path.join(ROOT, 'app', 'globals.css'), 'utf8');
/** Comments blanked (a comment may quote a retired colour to explain why it is gone). */
const CSS = RAW.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));

interface Rule {
  selector: string;
  body: string;
  /** The enclosing at-rules, outermost first: ['@layer base', '@media (min-width: 48rem)']. */
  context: string[];
}

/** Every style rule of the file (leaf `selector { declarations }`), with its at-rule context. */
function parse(css: string): Rule[] {
  const rules: Rule[] = [];
  const walk = (from: number, to: number, context: string[]) => {
    let i = from;
    while (i < to) {
      const open = css.indexOf('{', i);
      if (open < 0 || open >= to) return;
      // A stray declaration before a nested block (`@theme { --x: 1; }` has none) is skipped by `;`.
      const prelude = css.slice(Math.max(css.lastIndexOf(';', open), css.lastIndexOf('}', open), from - 1) + 1, open).trim();
      let depth = 0;
      let close = open;
      for (; close < to; close += 1) {
        if (css[close] === '{') depth += 1;
        else if (css[close] === '}') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      const inner = css.slice(open + 1, close);
      if (prelude.startsWith('@') && !/^@(font-face|property|theme|keyframes)/.test(prelude)) {
        walk(open + 1, close, [...context, prelude]);
      } else if (prelude.startsWith('@keyframes')) {
        rules.push({ selector: prelude, body: inner, context });
      } else if (inner.includes('{')) {
        // A nested block inside a non-at rule: treat the outer as context (native nesting is not used here).
        walk(open + 1, close, [...context, prelude]);
      } else {
        rules.push({ selector: prelude.replace(/\s+/g, ' '), body: inner, context });
      }
      i = close + 1;
    }
  };
  walk(0, css.length, []);
  return rules;
}

const RULES = parse(CSS);
const where = (r: Rule) => `${r.context.join(' > ')}${r.context.length ? ' > ' : ''}${r.selector}`;
/** A declaration's value in a rule body, or null. `prop` is matched whole (`background` is not `background-color`). */
const values = (body: string, prop: string): string[] =>
  [...body.matchAll(new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([^;}]+)`, 'g'))].map((m) => m[1].trim());

/** A selector list split at its top-level commas (`:not(.a, .b)` stays whole). */
function selectorsOf(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < list.length; i += 1) {
    if (list[i] === '(' || list[i] === '[') depth += 1;
    else if (list[i] === ')' || list[i] === ']') depth -= 1;
    else if (list[i] === ',' && depth === 0) {
      out.push(list.slice(from, i).trim());
      from = i + 1;
    }
  }
  out.push(list.slice(from).trim());
  return out;
}

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sources(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Source with comments blanked: a doc comment may name a class it explains the absence of. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (c, lead: string) => lead + ' '.repeat(c.length - lead.length));
}

describe('the parser sees the stylesheet', () => {
  it('finds the rules it is about to judge', () => {
    expect(RULES.length).toBeGreaterThan(400);
    const selectors = new Set(RULES.map((r) => r.selector));
    for (const s of ['.sx-stamp', '.sx-mast', '.sx-tabbar > ul', '.sx-strip, .sx-band', ':root']) {
      expect(selectors.has(s), s).toBe(true);
    }
    expect(RULES.some((r) => r.context.some((c) => c.includes('prefers-reduced-motion: no-preference')))).toBe(true);
  });
});

describe('utility classes the refresh retired (shared components)', () => {
  const DIRS = ['layout', 'ui', 'game-row', 'prefs'];
  const FILES = DIRS.flatMap((d) => sources(path.join(ROOT, 'components', d)));
  const BANNED: Array<[string, RegExp]> = [
    ['font-extrabold', /(?<![\w-])font-extrabold(?![\w-])/],
    ['font-black', /(?<![\w-])font-black(?![\w-])/],
    ['uppercase', /(?<![\w-])uppercase(?![\w-])/],
    ['tracking-*', /(?<![\w-])tracking-[\w[\].-]+/],
  ];

  it('scans the four shared folders', () => {
    expect(FILES.length).toBeGreaterThan(40);
  });

  for (const [name, re] of BANNED) {
    it(`no \`${name}\` in components/{${DIRS.join(',')}}`, () => {
      const offenders: string[] = [];
      for (const file of FILES) {
        const src = code(file);
        src.split('\n').forEach((line, i) => {
          if (re.test(line)) offenders.push(`${path.relative(ROOT, file)}:${i + 1}`);
        });
      }
      expect(offenders).toEqual([]);
    });
  }
});

describe('type: no caps, no tracking, nothing over 700, nothing under 12px', () => {
  it('no `text-transform: uppercase`', () => {
    expect(CSS).not.toMatch(/text-transform\s*:\s*uppercase/);
  });

  it('`letter-spacing` is only ever 0', () => {
    const all = [...CSS.matchAll(/letter-spacing\s*:\s*([^;}]+)/g)].map((m) => m[1].trim());
    expect(all.length).toBeGreaterThan(0);
    expect(all.filter((v) => v !== '0')).toEqual([]);
    // The theme's tracking scale is not a way around it.
    expect([...CSS.matchAll(/--tracking-[\w-]+\s*:\s*([^;}]+)/g)].map((m) => m[1].trim()).filter((v) => v !== '0')).toEqual([]);
  });

  it('no weight above 700', () => {
    const heavy = [...CSS.matchAll(/font-weight\s*:\s*([^;}]+)/g)]
      .map((m) => m[1].trim())
      .filter((v) => /\b(800|900|bolder)\b/.test(v) || v.split(/\s+/).some((n) => Number(n) > 700));
    expect(heavy).toEqual([]);
  });

  it('no text under 12px, in rem, px or the theme scale', () => {
    const small: string[] = [];
    for (const m of CSS.matchAll(/(font-size|--text-[\w-]+)\s*:\s*([^;}]+)/g)) {
      if (/--line-height|--font-weight|--letter-spacing/.test(m[1])) continue;
      for (const len of m[2].matchAll(/(?<![\w.-])(\d*\.?\d+)(rem|px)\b/g)) {
        const px = Number(len[1]) * (len[2] === 'rem' ? 16 : 1);
        if (px < 12) small.push(`${m[1]}: ${m[2].trim()}`);
      }
    }
    expect(small).toEqual([]);
  });
});

describe('colour: no yellow, and none of the retired palettes', () => {
  const RETIRED: Array<[string, string[]]> = [
    ['the highlighter yellow', ['#ffd83d']],
    ['the old blues', ['#1558b0', '#0f4a96', '#4f95ee', '#9cc6f8']],
    ['revision 4’s neutrals', ['#111111', '#4a4a4a', '#666666', '#f4f4f4', '#161616']],
    ['revision 5a’s dark navies', ['#0b1424', '#16223a', '#22304c', '#050b16', '#d6dce8']],
  ];
  for (const [name, hexes] of RETIRED) {
    it(`none of ${name}`, () => {
      const lower = RAW.toLowerCase();
      expect(hexes.filter((h) => lower.includes(h))).toEqual([]);
    });
  }

  it('no hex literal in the stylesheet is a yellow (r and g high, b low)', () => {
    const yellows = [...CSS.matchAll(/#([0-9a-fA-F]{6})\b/g)]
      .map((m) => m[1].toLowerCase())
      .filter((h) => {
        const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
        return r >= 200 && g >= 170 && b <= 120;
      });
    expect(yellows).toEqual([]);
  });

  it('no `mask-image` (the faded scroll edge is gone: nothing scrolls sideways under a mask)', () => {
    expect(CSS).not.toMatch(/mask-image/);
  });
});

describe('the reader’s team: a star and a bold name, never a fill and never moved', () => {
  it('no rule keyed on the pin sets a background or a box-shadow', () => {
    const offenders = RULES.filter(
      (r) => /data-pinned|sx-pinned/.test(r.selector) && /(?:^|[;\s])(background(-color)?|box-shadow)\s*:/.test(r.body),
    ).map(where);
    expect(RULES.some((r) => /data-pinned/.test(r.selector)), 'the pin rules exist').toBe(true);
    expect(offenders).toEqual([]);
  });

  it('no `order: -1` (a pinned row is never lifted out of its place by CSS)', () => {
    expect(CSS).not.toMatch(/(?:^|[;{\s])order\s*:\s*-1\b/);
  });
});

describe('planes: space between sections, untinted table heads, logos as they are', () => {
  it('no ink rule above a section (`border-top: 1px solid var(--sx-text)`)', () => {
    expect(CSS).not.toMatch(/border-top\s*:\s*1px solid var\(--sx-text\)/);
  });

  it('the table head has no fill: `none`, or the page colour where it is sticky', () => {
    const heads = RULES.filter((r) => /\.sx-table\b[^,{]*thead th/.test(r.selector));
    expect(heads.length).toBeGreaterThan(0);
    for (const r of heads) {
      for (const v of [...values(r.body, 'background'), ...values(r.body, 'background-color')]) {
        const sticky = /sticky/.test(r.selector) || /position\s*:\s*sticky/.test(r.body);
        expect(v === 'none' || (sticky && v === 'var(--sx-bg)'), `${where(r)}: background ${v}`).toBe(true);
      }
    }
    // Its rule is a bottom border in ink.
    expect(heads.some((r) => /border-bottom\s*:\s*1px solid var\(--sx-text\)/.test(r.body))).toBe(true);
  });

  it('no `filter` on a logo, in either theme', () => {
    const offenders = RULES.filter((r) => /\.sx-monogram/.test(r.selector) && /(?:^|[;\s])filter\s*:/.test(r.body)).map(where);
    expect(RULES.some((r) => /\.sx-monogram/.test(r.selector))).toBe(true);
    expect(offenders).toEqual([]);
  });

  it('there is no logo tile token', () => {
    expect(RAW).not.toContain('--sx-logo-tile');
  });
});

describe('fills: navy is the band, the tint is strips and hover', () => {
  const BAND_OWNERS = ['.sx-mast', '.sx-wordmark', '.sx-navtop', '.sx-live', '.sx-textbtn', '.sx-foot'];

  it('`var(--sx-band…)` is used only by the header, the live board and the footer', () => {
    const users = RULES.filter((r) => /var\(--sx-band/.test(r.body) && r.selector !== ':root' && !r.selector.startsWith(':root'));
    expect(users.length).toBeGreaterThan(20);
    const offenders = users
      .filter((r) => !selectorsOf(r.selector).every((s) => BAND_OWNERS.some((o) => s.startsWith(o))))
      .map(where);
    expect(offenders).toEqual([]);
  });

  it('`--sx-surface-2` as a background is a group strip, a hover, or the dark More sheet', () => {
    const users = RULES.filter((r) =>
      [...values(r.body, 'background'), ...values(r.body, 'background-color')].some((v) => v.includes('var(--sx-surface-2)')),
    );
    expect(users.length).toBeGreaterThan(3);
    const allowed = (r: Rule) =>
      selectorsOf(r.selector).every((s) => {
        if (/^\.sx-(strip|band)\b/.test(s)) return true;
        if (/:hover\b/.test(s) || /:active\b/.test(s)) return true;
        // The More sheet lifts one plane off a dark page.
        return /\.sx-more-sheet\b/.test(s) && (/data-theme="dark"/.test(s) || r.context.some((c) => /prefers-color-scheme: dark/.test(c)) || /data-theme="dark"/.test(r.context.join(' ')));
      });
    expect(users.filter((r) => !allowed(r)).map(where)).toEqual([]);
  });
});

describe('motion: one block, and only for readers who have not asked for less', () => {
  it('every `transition` and `animation` declaration is inside `prefers-reduced-motion: no-preference`', () => {
    const moving = RULES.filter((r) => !r.selector.startsWith('@keyframes') && /(?:^|[;\s])(transition|animation)(-[a-z-]+)?\s*:/.test(r.body));
    expect(moving.length).toBeGreaterThan(0);
    const outside = moving
      .filter((r) => !r.context.some((c) => /prefers-reduced-motion: no-preference/.test(c)))
      // The reduce block may only switch motion OFF (none, or a duration too short to see, once).
      .filter(
        (r) =>
          !(
            r.context.some((c) => /prefers-reduced-motion: reduce/.test(c)) &&
            [...r.body.matchAll(/(?:transition|animation)[a-z-]*\s*:\s*([^;}]+)/g)].every((m) =>
              /^(none|0s|0\.01ms|1)( !important)?$/.test(m[1].trim()),
            )
          ),
      );
    expect(outside.map(where)).toEqual([]);
  });

  it('there is exactly one `no-preference` block', () => {
    expect(CSS.match(/@media \(prefers-reduced-motion: no-preference\)/g)).toHaveLength(1);
  });
});
