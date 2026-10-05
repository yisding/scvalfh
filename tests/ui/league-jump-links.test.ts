/**
 * `components/layout/LeagueJumpLinks.tsx`: a `#<id>` pill is a plain `<a>`, a route pill a
 * `<Link prefetch={false}>` (/playoffs sends a tournament league to its own page). Either way each
 * pill keeps exactly `sx-jump sx-jump-<id>`, the hook the league-scope stylesheet
 * (components/layout/league-scope-css.ts) shows and hides it by.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import LeagueJumpLinks from '../../components/layout/LeagueJumpLinks';

describe('LeagueJumpLinks', () => {
  it('keeps the scope hook on both a fragment pill and a route pill', () => {
    const html = renderToStaticMarkup(
      createElement(LeagueJumpLinks, {
        leagues: [
          { id: 'scval', shortName: 'SCVAL' },
          { id: 'mcal', shortName: 'MCAL' },
        ],
        hrefs: { scval: '#scval', mcal: '/playoffs/mcal' },
      }),
    );
    const pills = [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
    expect(pills).toHaveLength(2);
    const scval = pills.find((p) => p.includes('href="#scval"'));
    const mcal = pills.find((p) => p.includes('href="/playoffs/mcal"'));
    expect(scval, 'components/layout/LeagueJumpLinks.tsx').toMatch(/class="sx-jump sx-jump-scval /);
    expect(mcal, 'components/layout/LeagueJumpLinks.tsx').toMatch(/class="sx-jump sx-jump-mcal /);
  });
});
