/**
 * components/ui/JerseyNumber.tsx: a jersey number beside a name reads "Number 5" and copies as "5 Lauren McLinden".
 * The number is its own box, so nothing in the text separated it from the name: a phone's copy gave
 * "5Lauren McLinden" and the hidden label's trailing space collapsed ("Number5").
 */

import { readFileSync } from 'node:fs';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CopySpace, JerseyNumber } from '../../components/ui/JerseyNumber';

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe('JerseyNumber', () => {
  it('labels the number with a space that never collapses, and follows it with a space a copy keeps', () => {
    const out = html(createElement(JerseyNumber, { number: '5' }));
    expect(out).toBe(
      '<span class="sr-only">Number </span>5<span aria-hidden="true" class="inline-block w-0 whitespace-pre"> </span>',
    );
  });

  it('prints a mark after the number, before the space', () => {
    const out = html(createElement(JerseyNumber, { number: '21/88', after: createElement('sup', null, '†') }));
    expect(out).toMatch(/21\/88<sup>†<\/sup><span aria-hidden="true" class="inline-block w-0 whitespace-pre"> <\/span>$/);
  });

  it('says there is no number, and still separates the dash from the name', () => {
    const out = html(createElement(JerseyNumber, { number: null }));
    expect(out).toContain('<span class="sr-only">No number listed</span>');
    expect(out.endsWith(html(createElement(CopySpace)))).toBe(true);
  });
});

describe('the sr-only rule (app/globals.css)', () => {
  it('keeps a hidden label\'s trailing space, unlayered so it outranks Tailwind\'s nowrap', () => {
    const css = readFileSync('app/globals.css', 'utf8');
    const at = css.search(/^\.sr-only \{\n  white-space: pre-wrap;\n\}/m);
    expect(at).toBeGreaterThan(0);
    // Unlayered: every @layer block opened before the rule is closed again before it.
    const before = css.slice(0, at);
    const depth = [...before].reduce((d, ch) => d + (ch === '{' ? 1 : ch === '}' ? -1 : 0), 0);
    expect(depth).toBe(0);
  });
});
