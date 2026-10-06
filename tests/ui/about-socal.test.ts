/**
 * /about (app/about/page.tsx) on the bundled snapshot: the sentences the 2026-10-06 review found
 * overstated once the Southern California leagues joined.
 *  - The standings intro says each league's own rules "where it publishes them" and MaxPreps' table
 *    "wherever MaxPreps publishes one" (four leagues publish no rules; Valley has no MaxPreps table).
 *  - The history sentence names who published what, once per document: the San Diego Section's 2025
 *    bracket sheet, not the three conferences, and not three times.
 *  - The San Diego shootout rule is stated for games outside a tournament, and the level-score bullet
 *    for an 'unverified' section never says a shootout decided the game.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

import { textOf } from './html-text';

let text: string;

beforeAll(async () => {
  const about = (await import('../../app/about/page')).default;
  text = textOf(renderToStaticMarkup(createElement(about))).replace(/\s+/g, ' ');
}, 600_000);

describe('/about after the Southern California amendment', () => {
  it('qualifies the standings intro', () => {
    expect(text).toContain(
      'Each league’s standings are computed from individual game results by that league’s own rules where it publishes them (otherwise by this site’s stated rules below), then compared field by field against MaxPreps’ own published table wherever MaxPreps publishes one (see',
    );
  });

  it('credits each official 2025 document to its publisher, once', () => {
    expect(text).toContain(
      'The archive links what MCAL and the San Diego Section did publish officially (2025 All-MCAL Field Hockey Team and 2025 CIFSDS playoff brackets (Google Sheet)), without reproducing it.',
    );
    expect(text).not.toMatch(/what [^.]*City, North County and Metro did publish officially/);
  });

  it('states the San Diego rule for games outside a tournament, and the EAL’s as before', () => {
    expect(text).toContain(
      'A level si.com score between two San Diego Section teams is never used: a varsity game there outside a tournament is decided on a shootout',
    );
    expect(text).toContain('A level si.com score between two EAL teams is never used: a varsity game there is decided on 1 v 1s');
  });

  it('never says a shootout decided a level San Diego W/L final', () => {
    expect(text).toContain(
      'A level game between two San Diego Section teams that MaxPreps marks as won is counted as the flagged team’s win (under the Section’s procedures a level game outside a tournament is settled in overtime or by a shootout; si.com and the Section’s power rankings record some such games with the shootout goal added): it shows MaxPreps’ score with no decider tag.',
    );
    expect(text).not.toMatch(/San Diego Section teams that MaxPreps marks as won was decided/);
    // The EAL's bullet is unchanged.
    expect(text).toContain(
      'A level EAL league game that MaxPreps marks as won was decided on 1 v 1s: it shows the level score with an SO tag and counts as the winner’s win. The 1 v 1 tally is not shown.',
    );
  });
});
