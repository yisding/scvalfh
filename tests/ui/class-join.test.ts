/**
 * No `className` template literal runs a class straight into an interpolation.
 *
 * Tailwind v4's scanner does not extract a candidate that runs into `${`: in
 * `disabled:opacity-60${className ? … : ''}` it never sees `disabled:opacity-60`, so the rule is
 * silently never generated unless the same class happens to appear unglued in some other file.
 * That is how the team page's stat tile lost its min-height and the pressed Pin button its
 * accent-ink text. components/layout/PageHeader.tsx and components/ui/StatTile.tsx state the rule;
 * this test is what holds it. Class strings are built with `[…].filter(Boolean).join(' ')`.
 *
 * One shape is allowed: an `sx-` class completed by an id (`sx-jump-${league.id}`). That is a
 * plain CSS hook written by components/layout/league-scope-css.ts, not a Tailwind utility, so
 * there is no candidate to lose.
 *
 * Modelled on tests/ui/prefetch-policy.test.ts: a source scan over app/ and components/.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO as ROOT } from '../helpers';

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sources(full));
    else if (/\.tsx$/.test(entry)) out.push(full);
  }
  return out;
}

/** A class that runs into `${`, and the one allowed form of it. */
const GLUED = /[\w\])-]$/;
const ID_HOOK = /(?:^|\s)sx-[\w-]*-$/;

function skipQuoted(src: string, i: number): number {
  const quote = src[i];
  let j = i + 1;
  while (j < src.length && src[j] !== quote) j += src[j] === '\\' ? 2 : 1;
  return j + 1;
}

/**
 * Walks the template literal opening at `i`, recording the offset of every `${` whose literal
 * text runs straight into it; nested templates inside the interpolations are walked too.
 */
function template(src: string, i: number, hits: number[]): number {
  let j = i + 1;
  let text = '';
  while (j < src.length) {
    const c = src[j];
    if (c === '\\') {
      text += src.slice(j, j + 2);
      j += 2;
    } else if (c === '`') {
      return j + 1;
    } else if (c === '$' && src[j + 1] === '{') {
      if (GLUED.test(text) && !ID_HOOK.test(text)) hits.push(j);
      text = '';
      j = expression(src, j + 2, hits);
    } else {
      text += c;
      j += 1;
    }
  }
  return j;
}

/** Walks an expression to its closing `}` at depth 0 and returns the offset after it. */
function expression(src: string, i: number, hits: number[]): number {
  let depth = 0;
  let j = i;
  while (j < src.length) {
    const c = src[j];
    const two = src.slice(j, j + 2);
    if (two === '//') {
      const end = src.indexOf('\n', j);
      j = end === -1 ? src.length : end;
    } else if (two === '/*') {
      const end = src.indexOf('*/', j + 2);
      j = end === -1 ? src.length : end + 2;
    } else if (c === "'" || c === '"') {
      j = skipQuoted(src, j);
    } else if (c === '`') {
      j = template(src, j, hits);
    } else {
      if (c === '{' || c === '(' || c === '[') depth += 1;
      else if (c === '}' || c === ')' || c === ']') {
        if (depth === 0) return j + 1;
        depth -= 1;
      }
      j += 1;
    }
  }
  return j;
}

/** `file:line` of every glued interpolation inside a `className={…}` expression of `src`. */
function gluedClassNames(src: string, file: string): string[] {
  const out: string[] = [];
  const re = /className=\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const hits: number[] = [];
    expression(src, m.index + m[0].length, hits);
    for (const at of hits) out.push(`${file}:${src.slice(0, at).split('\n').length}`);
  }
  return out;
}

const FILES = [...sources(path.join(ROOT, 'components')), ...sources(path.join(ROOT, 'app'))];

describe('class strings: no class runs into a template interpolation', () => {
  it('flags the glued shapes and lets the joined ones through', () => {
    // Guards the scanner itself: a walker that silently stopped matching would make the
    // repo-wide assertion below vacuous.
    expect(gluedClassNames('<b className={`a disabled:opacity-60${c ? ` ${c}` : \'\'}`} />', 'x')).toEqual(['x:1']);
    expect(gluedClassNames('<b className={`p-0${\n  wide ? \' lg:p-2\' : \'\'\n}`} />', 'x')).toEqual(['x:1']);
    expect(gluedClassNames('<b className={x ? `m-0 md:p-6${y}` : \'a\'} />', 'x')).toEqual(['x:1']);
    expect(gluedClassNames('<b className={[\'a disabled:opacity-60\', c].filter(Boolean).join(\' \')} />', 'x')).toEqual([]);
    expect(gluedClassNames('<b className={`m-0 ${c}`} />', 'x')).toEqual([]);
    expect(gluedClassNames('<a className={`sx-jump sx-jump-${id} sx-pill`} />', 'x')).toEqual([]);
  });

  it('builds every className in app/ and components/ without gluing a class to ${', () => {
    expect(FILES.length).toBeGreaterThan(40);
    const offenders = FILES.flatMap((file) =>
      gluedClassNames(readFileSync(file, 'utf8'), path.relative(ROOT, file)),
    );
    expect(offenders).toEqual([]);
  });
});
