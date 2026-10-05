/**
 * The token contrast gate (DESIGN §10.9d, §4.1).
 *
 * This suite PARSES app/globals.css and re-measures every documented pair, so a token edit that
 * breaks a floor fails `pnpm test` rather than shipping. The expected numbers below are the
 * measured output in DESIGN §4.1 — they are reproduced here to two decimals, so a hex change is
 * caught even when it still clears the floor.
 *
 * The two lintable exclusions from §4.1 are asserted as facts, not left to reviewer memory:
 *   1. In LIGHT mode `--sx-loss` on `--sx-surface-3` measures 2.74 and is BELOW the 3:1 mark floor.
 *      Plane 3 is chrome only (chip tracks, disabled controls, the active tab pill); row hover and
 *      press are plane 2, where loss measures 3.03. Nothing on the site puts a result mark on
 *      plane 3, and this test pins that number so the exclusion stays true and visible.
 *   2. No ink/plane pair is below AA (4.5) at any size. The weakest in the system is
 *      `--sx-text-3` on `--sx-surface-3`: 4.66 light / 5.11 dark.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const CSS = readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf8');

type Tokens = Record<string, string>;

/** Pull every `--sx-*: #hex` declaration out of one brace-delimited block. */
function block(startPattern: RegExp): string {
  const at = CSS.search(startPattern);
  if (at < 0) throw new Error(`globals.css: no block matching ${startPattern}`);
  const open = CSS.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < CSS.length; i += 1) {
    if (CSS[i] === '{') depth += 1;
    else if (CSS[i] === '}') {
      depth -= 1;
      if (depth === 0) return CSS.slice(open + 1, i);
    }
  }
  throw new Error(`globals.css: unbalanced block for ${startPattern}`);
}

function tokensIn(source: string): Tokens {
  const out: Tokens = {};
  for (const m of source.matchAll(/(--sx-[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[m[1]] = m[2].toLowerCase();
  }
  return out;
}

const light = tokensIn(block(/^:root\s*\{/m));
const darkToggle = tokensIn(block(/^:root\[data-theme="dark"\]\s*\{/m));
const darkMedia = tokensIn(block(/:root:where\(:not\(\[data-theme="light"\]\)\)\s*\{/));

function relativeLuminance(hex: string): number {
  const v = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
  const lin = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function ratio(tokens: Tokens, fg: string, bg: string): number {
  const f = tokens[fg];
  const g = tokens[bg];
  if (!f) throw new Error(`globals.css: missing token ${fg}`);
  if (!g) throw new Error(`globals.css: missing token ${bg}`);
  return Math.round(contrast(f, g) * 100) / 100;
}

const PLANES = ['--sx-surface', '--sx-surface-2', '--sx-surface-3'] as const;
const INKS = ['--sx-text', '--sx-text-2', '--sx-text-3'] as const;
const AA = 4.5;
const MARK_FLOOR = 3;

/** DESIGN §4.1, measured: [fg, bg, light, dark]. */
const MATRIX: Array<[string, string, number, number]> = [
  ['--sx-text', '--sx-surface', 18.91, 16.43],
  ['--sx-text', '--sx-surface-2', 17.15, 14.95],
  ['--sx-text', '--sx-surface-3', 15.52, 13.2],
  ['--sx-text-2', '--sx-surface', 7.69, 8.55],
  ['--sx-text-2', '--sx-surface-2', 6.97, 7.78],
  ['--sx-text-2', '--sx-surface-3', 6.31, 6.87],
  ['--sx-text-3', '--sx-surface', 5.68, 6.37],
  ['--sx-text-3', '--sx-surface-2', 5.15, 5.79],
  ['--sx-text-3', '--sx-surface-3', 4.66, 5.11],
  ['--sx-accent', '--sx-surface', 6.87, 5.88],
  ['--sx-accent', '--sx-surface-2', 6.24, 5.35],
  ['--sx-accent-ink', '--sx-accent-wash', 6.5, 7.55],
  ['--sx-win', '--sx-surface', 6.74, 4.84],
  ['--sx-win', '--sx-surface-2', 6.11, 4.4],
  ['--sx-win-ink', '--sx-win-wash', 6.67, 7.49],
  ['--sx-loss', '--sx-surface', 3.34, 4.92],
  ['--sx-loss', '--sx-surface-2', 3.03, 4.47],
  ['--sx-loss-ink', '--sx-loss-wash', 5.8, 6.88],
  ['--sx-tie', '--sx-surface', 6.4, 5.9],
  ['--sx-tie-ink', '--sx-tie-wash', 6.71, 8.28],
  ['--sx-bar', '--sx-surface', 7.69, 8.55],
  ['--sx-bar', '--sx-surface-3', 6.31, 6.87],
  ['--sx-focus', '--sx-surface', 6.87, 5.88],
  ['--sx-accent', '--sx-accent-wash', 5.19, 4.38],
  ['--sx-border', '--sx-surface', 1.36, 1.37],
  ['--sx-border-strong', '--sx-surface', 1.84, 1.83],
];

describe('globals.css token map', () => {
  it('parses all four planes and every hue in both modes', () => {
    for (const token of [...PLANES, ...INKS, '--sx-bg', '--sx-border', '--sx-border-strong']) {
      expect(light[token], `light ${token}`).toMatch(/^#[0-9a-f]{6}$/);
      expect(darkToggle[token], `dark ${token}`).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(Object.keys(light).length).toBeGreaterThanOrEqual(24);
  });

  it('applies the same dark values under the toggle and under prefers-color-scheme', () => {
    // Two literal blocks exist on purpose (the toggle must win over the OS in both directions);
    // they must never drift apart.
    expect(darkMedia).toEqual(darkToggle);
  });

  it('reproduces every measured pair in DESIGN §4.1', () => {
    for (const [fg, bg, expectedLight, expectedDark] of MATRIX) {
      expect(ratio(light, fg, bg), `light ${fg} on ${bg}`).toBeCloseTo(expectedLight, 1);
      expect(ratio(darkToggle, fg, bg), `dark ${fg} on ${bg}`).toBeCloseTo(expectedDark, 1);
    }
  });
});

describe('contrast floors', () => {
  it('clears AA for every ink on every plane, in both modes', () => {
    for (const mode of [
      { name: 'light', tokens: light },
      { name: 'dark', tokens: darkToggle },
    ]) {
      for (const ink of INKS) {
        for (const plane of [...PLANES, '--sx-bg']) {
          expect(
            ratio(mode.tokens, ink, plane),
            `${mode.name}: ${ink} on ${plane}`,
          ).toBeGreaterThanOrEqual(AA);
        }
      }
    }
  });

  it('clears AA for every chip ink on its own wash, in both modes', () => {
    const chips: Array<[string, string]> = [
      ['--sx-win-ink', '--sx-win-wash'],
      ['--sx-loss-ink', '--sx-loss-wash'],
      ['--sx-tie-ink', '--sx-tie-wash'],
      ['--sx-accent-ink', '--sx-accent-wash'],
    ];
    for (const tokens of [light, darkToggle]) {
      for (const [ink, wash] of chips) {
        expect(ratio(tokens, ink, wash), `${ink} on ${wash}`).toBeGreaterThanOrEqual(AA);
      }
    }
  });

  it('clears the 3:1 mark floor for every mark on every plane it renders on', () => {
    const marks = ['--sx-win', '--sx-loss', '--sx-tie', '--sx-bar', '--sx-accent'];
    for (const tokens of [light, darkToggle]) {
      for (const mark of marks) {
        for (const plane of ['--sx-surface', '--sx-surface-2', '--sx-bg']) {
          expect(ratio(tokens, mark, plane), `${mark} on ${plane}`).toBeGreaterThanOrEqual(
            MARK_FLOOR,
          );
        }
      }
    }
  });

  it('clears 3:1 for the accent link ink and the focus ring', () => {
    for (const tokens of [light, darkToggle]) {
      expect(ratio(tokens, '--sx-focus', '--sx-surface')).toBeGreaterThanOrEqual(MARK_FLOOR);
      expect(ratio(tokens, '--sx-focus', '--sx-bg')).toBeGreaterThanOrEqual(MARK_FLOOR);
      // The meter's fill must read against its own track (BerthMeter, DESIGN §6.6).
      expect(ratio(tokens, '--sx-accent', '--sx-accent-wash')).toBeGreaterThanOrEqual(MARK_FLOOR);
    }
  });
});

describe('the two named exclusions (DESIGN §4.1)', () => {
  it('EXCLUSION 1: light loss-on-plane-3 is below 3:1, so plane 3 stays chrome-only', () => {
    expect(ratio(light, '--sx-loss', '--sx-surface-3')).toBeCloseTo(2.74, 1);
    expect(ratio(light, '--sx-loss', '--sx-surface-3')).toBeLessThan(MARK_FLOOR);
    // Row hover/press is plane 2, where the same mark clears the floor.
    expect(ratio(light, '--sx-loss', '--sx-surface-2')).toBeGreaterThanOrEqual(MARK_FLOOR);
    // In dark mode there is no exclusion at all.
    expect(ratio(darkToggle, '--sx-loss', '--sx-surface-3')).toBeGreaterThanOrEqual(MARK_FLOOR);
  });

  it('EXCLUSION 2: the weakest ink/plane pair in the system is still AA', () => {
    const weakestLight = ratio(light, '--sx-text-3', '--sx-surface-3');
    const weakestDark = ratio(darkToggle, '--sx-text-3', '--sx-surface-3');
    expect(weakestLight).toBeCloseTo(4.66, 1);
    expect(weakestDark).toBeCloseTo(5.11, 1);
    for (const mode of [
      { tokens: light, weakest: weakestLight },
      { tokens: darkToggle, weakest: weakestDark },
    ]) {
      for (const ink of INKS) {
        for (const plane of PLANES) {
          expect(ratio(mode.tokens, ink, plane)).toBeGreaterThanOrEqual(mode.weakest - 0.005);
        }
      }
    }
  });
});

describe('structure the design depends on', () => {
  it('keeps the reduced-motion, forced-colors and focus-visible blocks', () => {
    expect(CSS).toContain('prefers-reduced-motion: reduce');
    expect(CSS).toContain('forced-colors: active');
    expect(CSS).toContain(':focus-visible');
    // The LIVE pulse must be declared in the same layer as the reduced-motion override, or the
    // override loses the cascade to an unlayered rule.
    const live = CSS.indexOf('.sx-live-dot {');
    const reduced = CSS.indexOf('prefers-reduced-motion');
    expect(live).toBeGreaterThan(0);
    expect(live).toBeLessThan(reduced);
  });

  it('keeps the rule-and-kicker signature and the table / full-bleed utilities', () => {
    for (const cls of ['.sx-kicker', '.sx-kicker-rule', '.sx-table', '.sx-bleed']) {
      expect(CSS, `missing ${cls}`).toContain(cls);
    }
  });

  it('gives body an explicit background and room for the fixed tab bar', () => {
    const body = block(/^\s*body\s*\{/m);
    expect(body).toContain('background: var(--sx-bg)');
    expect(body).toContain('env(safe-area-inset-bottom)');
  });
});
