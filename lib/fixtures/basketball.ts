/**
 * Basketball's fixture ledger (lib/fixtures/shape.ts): the preseason schedule audit of 2026-11-13 (MaxPreps rows
 * that cannot be games) and the games the owner has reported.
 */

import type { FixtureLedger } from './shape';

export const BASKETBALL_LEDGER: FixtureLedger = {
  fixtures: [
    // Christopher's Jan 13 league game is at Pioneer of San Jose (18b406ab, on the BVAL schedule); a second row,
    // the same night at the same time, names Pioneer of Woodland.
    {
      dateKey: '2027-01-13',
      home: 'pioneer',
      away: 'christopher',
      sources: {
        maxpreps: '18b406ab-ab78-41ff-a4fc-6551e8c4ee4b',
        maxprepsDuplicates: {
          '30211366-90ce-40c4-aef9-983a7275b0c6': 'Christopher at Pioneer (Woodland), Jan 13: a second MaxPreps row for Christopher’s Mt. Hamilton game at Pioneer (San Jose) the same night (18b406ab), with the wrong Pioneer',
        },
      },
    },
    // The BVAL schedule has Pioneer at Christopher on Wed Feb 3 (37af39e8, matched); on Mon Feb 1 Pioneer is at Leigh
    // (380c16d6, on the schedule). The Feb 1 row is the game's earlier date left behind.
    {
      dateKey: '2027-02-03',
      home: 'christopher',
      away: 'pioneer',
      sources: {
        maxpreps: '37af39e8-34ea-4a04-a2c0-50994e9bac78',
        maxprepsDuplicates: {
          '946b7447-4c09-499c-84a2-7b57b8c8585b': 'Pioneer at Christopher, Feb 1: a stale MaxPreps row for their Mt. Hamilton game of Feb 3 (37af39e8); Pioneer plays at Leigh on Feb 1',
        },
      },
    },
    // A non-league game on neither school's MaxPreps schedule (read 2026-11-14), given by the owner on 2026-11-14 with
    // Cupertino's own schedule: the printable 2026-2027 Boys Basketball Schedule linked from chs.fuhsd.org's boys
    // basketball page ("updated on 11/11/26"), first row "Tuesday 24-Nov | Santa Teresa High School | CHS | 5:30/7:00"
    // (JV/varsity). Listed without a score until MaxPreps lists the game.
    {
      dateKey: '2026-11-24',
      home: 'cupertino',
      away: 'santa-teresa',
      sources: {},
      listing: {
        time: '19:00',
        goals: null,
        forfeitBy: null,
        otPeriods: 0,
        from: 'derived',
        reportedOn: '2026-11-14',
        jv: { dateKey: '2026-11-24', time: '17:30' },
        source: 'Cupertino High School’s 2026-2027 Boys Basketball Schedule (updated Nov 11, 2026): Santa Teresa at CHS on Tue Nov 24, JV 5:30 PM, varsity 7 PM; MaxPreps does not list the game',
        url: 'https://chs.fuhsd.org/uploaded/Athletics_26-27/Basketball_boys_26.pdf',
      },
    },
  ],
  rejected: {},
};
