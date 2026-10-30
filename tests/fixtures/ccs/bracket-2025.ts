/**
 * Last season's CCS championship as this season's data, so tests can run components/playoffs/bracket-model.ts
 * and PlayoffBracket.tsx against a bracket that was really played (plan final-06, 2026-10-30). Nothing on the
 * site reads this module.
 *
 * - `ccsGames2025()` rebuilds the fourteen CCS 2025 rows of data/prior-season.json (Nov 5: eight quarterfinals,
 *   Nov 8: four semifinals, Nov 12: two finals; every row between two teams of a CCS league on those dates) with
 *   tests/game-builder.ts `game()` on 2026's key dates (Sat Nov 7, Wed Nov 11, Sat Nov 14), each carrying the
 *   `Game.bracket` the 2025 Los Gatos feed carried (lib/normalize.ts bracketOf: the CCS tournament id, the
 *   division's bracket id, 'Division 1' / 'Division 2', published) and the tag lib/classify.ts rule 1c writes
 *   for it. The division of each game is the one data/history-brackets-2025-26.json draws it in. MaxPreps
 *   records the Division 2 semifinal Stevenson v Willow Glen as 1-1 with Willow Glen W (a shootout the feed
 *   does not tally), so that row's result flags are restored from the history file's `winner`; the Division 1
 *   final's `site` is 'neutral' (Los Altos HS), the Division 2 final's 'home' (Gilroy HS), as prior-season.json
 *   has them. The finals' `venue.text` is the history file's site in MaxPreps' '@ ' form; the other rows carry
 *   none (prior-season.json keeps no location).
 * - `ccsSeeds2025()` is the 2025 field's sixteen seeds as lib/ccs-bracket.ts getCcsSeeds would return them
 *   from a filled owner file: lib/ccs-bracket.ts seedsFromHistory over the history file.
 * - `unplayed(game, …)` is the same game before it was played: scheduled, no score, with the location, ticket
 *   and stream links a MaxPreps row carries before the day (the 2025 Los Gatos rows: '@ Los Gatos HS', a GoFan
 *   url on home-site games, an NFHS url on the finals).
 */

import { getCcsSeeds, seedsFromHistory } from '../../../lib/ccs-bracket';
import type { CcsSeeds } from '../../../lib/ccs-bracket-schema';
import { getHistoryBrackets } from '../../../lib/history';
import { CCS, LEAGUE_IDS, getLeague } from '../../../lib/leagues';
import { getPriorSeason } from '../../../lib/prior-season';
import { getTeamBySlug, teamsInLeague } from '../../../lib/teams';
import type { CcsDivisionName, Game, GameBracket } from '../../../lib/types';
import { game } from '../../game-builder';

/** 2025's round dates → 2026's (CCS.keyDates). */
const DATE_2026: Readonly<Record<string, string>> = {
  '2025-11-05': CCS.keyDates.quarterfinals,
  '2025-11-08': CCS.keyDates.semifinals,
  '2025-11-12': CCS.keyDates.finals,
};

const CCS_SLUGS: ReadonlySet<string> = new Set(
  LEAGUE_IDS.filter((l) => getLeague(l).sectionId === 'ccs').flatMap((l) => teamsInLeague(l).map((t) => t.slug)),
);

function ccsHistory() {
  const entry = getHistoryBrackets().find((b) => b.id === 'ccs');
  if (!entry) throw new Error('no ccs history bracket');
  return entry.bracket;
}

/** slug → the CCS division the 2025 bracket drew it in. */
function divisionsBySlug(): Map<string, CcsDivisionName> {
  const out = new Map<string, CcsDivisionName>();
  for (const d of ccsHistory().divisions) {
    for (const r of d.rounds) for (const g of r.games) for (const s of [g.top, g.bottom]) out.set(s.slug, d.label as CcsDivisionName);
  }
  return out;
}

/** The finals' neutral sites, by the slug of the final's top side (the history file names a site on finals only). */
function finalSites(): Map<string, string> {
  const out = new Map<string, string>();
  for (const d of ccsHistory().divisions) {
    const final = d.rounds[d.rounds.length - 1].games[0];
    if (final.site) out.set(`${final.top.slug}|${final.bottom.slug}`, final.site);
  }
  return out;
}

/** The level 2025 row and the side MaxPreps marks W: the Division 2 semifinal, Willow Glen at Stevenson 1-1. */
const LEVEL_WINNER: Readonly<Record<string, 'home' | 'away'>> = {
  '4e75d107-dbf4-43f9-8f3a-c764da70b9ef': 'away',
};

export function bracketFor(division: CcsDivisionName): GameBracket {
  return {
    tournamentId: CCS.tournament.id,
    bracketId: division === 'Division 1' ? CCS.tournament.division1BracketId : CCS.tournament.division2BracketId,
    tournament: '2026 Central Coast Section Field Hockey Championship',
    name: division,
    published: true,
    matchupId: null,
    url: CCS.bracketUrl,
  };
}

/** The fourteen CCS 2025 rows as bracket games on 2026's dates, in prior-season.json order. */
export function ccsGames2025(): Game[] {
  const divisions = divisionsBySlug();
  const sites = finalSites();
  return getPriorSeason()
    .games.filter((r) => r.date in DATE_2026 && CCS_SLUGS.has(r.homeSlug) && CCS_SLUGS.has(r.awaySlug))
    .map((r) => {
      const division = divisions.get(r.homeSlug);
      if (!division || division !== divisions.get(r.awaySlug)) throw new Error(`${r.contestId}: not one 2025 CCS division`);
      const home = getTeamBySlug(r.homeSlug);
      const away = getTeamBySlug(r.awaySlug);
      const leagueId = home && away && home.league === away.league ? home.league : null;
      const level = LEVEL_WINNER[r.contestId];
      const site = sites.get(`${r.homeSlug}|${r.awaySlug}`) ?? sites.get(`${r.awaySlug}|${r.homeSlug}`);
      const g = game({
        home: r.homeSlug,
        away: r.awaySlug,
        hs: r.homeScore,
        as: r.awayScore,
        date: DATE_2026[r.date],
        league: false,
        contestTypes: { home: 4, away: 4 },
        official: null,
        postseason: { kind: 'ccs', leagueId, via: 'maxpreps-bracket' },
        contestId: r.contestId,
        ...(level ? { results: level === 'home' ? { home: 'W', away: 'L' } : { home: 'L', away: 'W' } } : {}),
      });
      return {
        ...g,
        site: r.site,
        bracket: bracketFor(division),
        venue: { text: site ? `@ ${site}` : null },
      };
    });
}

/** The 2025 field's seeds as the owner file would give them (lib/ccs-bracket.ts getCcsSeeds over seedsFromHistory). */
export function ccsSeeds2025(): CcsSeeds {
  const seeds = getCcsSeeds(seedsFromHistory(ccsHistory(), '2025-26'));
  if (!seeds) throw new Error('the 2025 history bracket gave no seeds');
  return seeds;
}

/**
 * `g` before it was played: scheduled, no score or result, the location MaxPreps writes ('@ Los Gatos HS' —
 * the home side's registry name when none is given), and the links a row carries before the day.
 */
export function unplayed(
  g: Game,
  opts: { venue?: string | null; timeTba?: boolean; goFan?: string | null; nfhsStream?: string | null } = {},
): Game {
  const home = getTeamBySlug(g.home.slug ?? '');
  const venue = opts.venue === undefined ? (home ? `@ ${home.name} HS` : null) : opts.venue;
  return {
    ...g,
    status: 'scheduled',
    isTimeTba: opts.timeTba ?? false,
    home: { ...g.home, score: null, result: null },
    away: { ...g.away, score: null, result: null },
    otPeriods: 0,
    isOt: false,
    decider: null,
    venue: { text: venue },
    urls: { ...g.urls, goFan: opts.goFan ?? null, nfhsStream: opts.nfhsStream ?? null },
  };
}
