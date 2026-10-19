/**
 * The footnotes under a standings table (SPEC §10.3; views/standings/footnotes.ts): GP, LEFT and MAX, the uneven-GP
 * footnote, the si.com backfill mark, the schedule link and the rules footnote.  League-specific values are asserted
 * on the all-2026-10-02 CORPUS snapshot (SPEC §13.6), loaded through useCorpusModules
 * (tests/support/standings-view.ts), so live fetch #2 cannot break them. Every assertion message names the module
 * that produced the value, so a failure routes to its owner.
 */

import { describe, expect, it } from 'vitest';

import { m, renderLeague } from '@/tests/support/standings-view';

describe('GP, LEFT and MAX', () => {
  it('render from the standing context on the desktop table, GP on the phone row', async () => {
    const html = await renderLeague('mcal');
    expect(html, 'components/standings/table/DesktopStandingsTable.tsx head').toMatch(/>GP<\/th>/);
    expect(html).toMatch(/>Left<\/th>/);
    expect(html).toMatch(/>Max<\/th>/);
    const ctx = m.data.getStandingContext('marin-county');
    for (const c of ctx.values()) {
      expect(c.scheduled, 'lib/queries/standings.ts getStandingContext: MCAL has a fixed schedule').not.toBeNull();
      expect(c.remaining, 'lib/queries/standings.ts getStandingContext').toBe(Math.max(0, c.scheduled! - c.counted));
      expect(html, 'components/standings/table/StandingsTable.tsx GP').toContain(`${c.counted}/${c.scheduled}`);
    }
  });

  it('prints the uneven-GP footnote verbatim when the spread is two or more (MCAL adds its rule)', () => {
    const spread = m.data.getGamesPlayedSpread('marin-county');
    const note = m.footnotes.unevenGpFootnote('mcal', spread);
    if (spread.max - spread.min >= 2) {
      expect(note, 'views/standings/footnotes.ts uneven-GP').toBe(
        `Teams have played between ${spread.min} and ${spread.max} of ${spread.scheduled} league games, so points favour teams that have played more. LEFT is league games with no counted result yet — still to play, or played and not reported. MAX is the most points a team could reach if it won all of them. The order is points, as MCAL rules require. If the season ends with games unplayed, MCAL General Rules (with an incomplete schedule, winning percentage replaces points); we will show that order then.`,
      );
    }
    expect(m.footnotes.unevenGpFootnote('scval', { min: 5, max: 6, scheduled: 12 })).toBeNull();
  });

  it('marks si.com-backfilled records with † and the footnote (PCAL corpus: three backfills)', async () => {
    const pcal = m.sd.buildStandingsPageView('pcal').views[0];
    expect(pcal.backfilledGames, 'views/standings/standings-view.ts backfilledGames').toBe(3);
    expect(pcal.backfillFootnote).toBe(
      '† Includes 3 results from High School on SI (si.com) that MaxPreps does not have, counted under the site’s rules for missing or wrong scores (About → Sources).',
    );
    expect(m.view.backfillFootnoteText(1)).toBe(
      '† Includes 1 result from High School on SI (si.com) that MaxPreps does not have, counted under the site’s rules for missing or wrong scores (About → Sources).',
    );
    const html = await renderLeague('pcal');
    expect(html, 'components/standings/table/cells.tsx LeagueRecord †').toContain('score via si.com');
  });

  it('never claims agreement for Santa Teresa or PCAL', () => {
    const st = m.sd.buildStandingsPageView('bval').views.find((v) => v.division === 'santa-teresa')!;
    expect(st.comparison.agreement, 'views/standings/division.ts').toBeNull();
    expect(st.comparison.leftOut).toEqual(['MaxPreps’ table leaves out Prospect.']);
    const pcal = m.sd.buildStandingsPageView('pcal').views[0];
    expect(pcal.comparison.agreement).toBeNull();
    expect(pcal.comparison.knownCause).toMatch(/^MaxPreps is missing some of PCAL’s official league games/);
    expect(pcal.comparison.flag).toBe(false);
  });

  it('labels the official schedule link by source', () => {
    expect(m.view.officialScheduleLabel('bval-docx')).toBe('Official schedule (Google Doc)');
    for (const s of ['scval-pdf', 'pcal-pdf', 'mcal-pdf'] as const) {
      expect(m.view.officialScheduleLabel(s)).toBe('Official schedule (PDF)');
    }
    expect(m.sd.buildStandingsPageView('mcal').views[0].scheduledPer).toBe('Scheduled per MCAL');
  });

  it('writes the rules footnote with the league’s own points citation', () => {
    expect(m.footnotes.rulesFootnote('scval'), 'views/standings/footnotes.ts rules').toBe(
      'PTS: SCVAL Field Hockey By-Laws 2026-27, Article VI §2 (3 points for a win, 1 for a tie). Ties: head-to-head, then division wins, then fewest goals given up between the tied teams, then head-to-head goal differential, then a coin flip (Article VI §3, §4, §5, §6, §7).',
    );
    expect(m.footnotes.rulesFootnote('pcal')).toMatch(/^PTS: PCAL Sports Rules — Field Hockey \(Jan 2022\) §1\.7/);
  });
});
