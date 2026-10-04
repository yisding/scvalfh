/**
 * /commits with no commitment in the file (DESIGN §19.1: "Nothing found is a real state"). The
 * committed data/commits.json has commitments, so this file swaps in an empty one before
 * lib/commits.ts loads it: the same file with `colleges` and `commitments` emptied, which still
 * passes the schema and the join. It lives apart from tests/ui/commit-view.test.ts so that file
 * keeps testing the real data.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import CommitsPage from '../../app/commits/page';
import { buildCommitsView } from '../../components/commits/commit-view';
import { buildRosterView } from '../../components/teams/roster-view';
import { TEAMS } from '../../lib/teams';
import { textOf } from './html-text';

vi.mock('../../data/commits.json', async (importOriginal) => {
  const real = (await importOriginal()) as { default: Record<string, unknown> };
  return { default: { ...real.default, colleges: [], commitments: [] } };
});

describe('/commits with nothing found', () => {
  const html = renderToStaticMarkup(createElement(CommitsPage));
  const text = textOf(html);

  it('says so in the lede and in one empty state, and leaves the colleges out', () => {
    expect(buildCommitsView().classes).toEqual([]);
    expect(text).toContain('No public page we found shows a commitment by a player here yet.');
    expect(text).toContain('No commitment found yet.');
    expect(html).not.toContain('id="colleges"');
    expect(html).not.toMatch(/id="class-\d{4}"/);
  });

  it('keeps one h1, then the how-matched h2, with no level skipped', () => {
    const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
    expect(levels[0]).toBe(1);
    expect(levels.filter((l) => l === 1)).toHaveLength(1);
    for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
    expect(html).toContain('id="how-matched"');
  });

  it('gives no roster a commitment line or its footnote', () => {
    for (const t of TEAMS) {
      const view = buildRosterView(t.slug)!;
      expect(view.hasCommitments, t.slug).toBe(false);
      expect(view.rows.every((r) => r.commitment === null), t.slug).toBe(true);
    }
  });
});
