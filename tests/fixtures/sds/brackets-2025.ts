/**
 * Last season's San Diego Section brackets in this season's file shape, and last season's MaxPreps rows as
 * games, so tests can run lib/sds-bracket.ts against a bracket that was really played (plan final-07,
 * 2026-10-29). Nothing on the site reads this module.
 *
 * - `seedsFromHistory('sds')` turns the 2025 brackets in data/history-brackets-2025-26.json (transcribed from
 *   the Section's "2025 Championship Brackets" sheet) into a data/sds-brackets-2026.json-shaped file: each
 *   division's places from its rounds, the Division II play-in (Helix v Granite Hills for the 11th place,
 *   Mon Nov 3) and the round dates as the sheet had them. It is checked against 2025's playoffs window,
 *   Nov 2–15 (the 2025 finals were Sat Nov 15).
 * - `sdsGames2025()` rebuilds the 26 San Diego playoff rows of data/prior-season.json (every final between two
 *   San Diego teams on or after Nov 2, 2025) with tests/game-builder.ts `game()` on their own dates, tagged
 *   `section-playoffs` as the pipeline tags them now (lib/classify.ts keys the window on 2026's dates, so the
 *   tag is passed). MaxPreps has 26 of the 30 bracket games: no row for the play-in, for Bonita Vista v
 *   Westview and Rancho Buena Vista v Helix (Division II first round) or for Rancho Buena Vista v Olympian
 *   (Division II quarterfinal).
 */

import { getHistoryBrackets } from '../../../lib/history';
import type { HistoryBracketDivision } from '../../../lib/history-brackets-schema';
import { LEAGUE_IDS, getLeague } from '../../../lib/leagues';
import { getPriorSeason } from '../../../lib/prior-season';
import {
  sdsBracketsSchema,
  type SdsBracketsDivision,
  type SdsBracketsFile,
  type SdsDivisionId,
} from '../../../lib/sds-brackets-schema';
import { teamsInLeague } from '../../../lib/teams';
import type { Game, TeamSlug } from '../../../lib/types';
import { game } from '../../game-builder';

/** The 2025 playoffs, inclusive: play-ins from Mon Nov 3, finals Sat Nov 15 (window opens Nov 2, as in 2026). */
export const SDS_2025_WINDOW = { first: '2025-11-02', last: '2025-11-15' } as const;

/** The 2025 file shape's schema. */
export const sds2025Schema = sdsBracketsSchema(SDS_2025_WINDOW);

function divisionFromHistory(d: HistoryBracketDivision): SdsBracketsDivision {
  const playInRound = d.rounds.find((r) => r.playIn);
  const main = d.rounds.filter((r) => !r.playIn);
  const playInGame = playInRound?.games[0];
  const playIn = playInGame
    ? { date: playInRound!.date, forSeed: playInGame.top.seed as 11 | 12, home: playInGame.top.slug, away: playInGame.bottom.slug }
    : undefined;
  const skip = new Set(playIn ? [playIn.home, playIn.away] : []);
  const places = new Map<number, TeamSlug>();
  for (const r of main) {
    for (const g of r.games) {
      for (const side of [g.top, g.bottom]) {
        if (skip.has(side.slug) || (playIn && side.seed === playIn.forSeed)) continue;
        const seen = places.get(side.seed);
        if (seen !== undefined && seen !== side.slug) throw new Error(`${d.id}: place ${side.seed} is ${seen} and ${side.slug}`);
        places.set(side.seed, side.slug);
      }
    }
  }
  const seeds = [...places].sort(([a], [b]) => a - b).map(([seed, slug]) => ({ seed, slug }));
  const size = (seeds.length + (playIn ? 1 : 0)) as 8 | 12;
  return {
    id: d.id as SdsDivisionId,
    label: d.label,
    size,
    ...(playIn ? { playIn } : {}),
    rounds: main.map((r, i) => {
      const site = i === main.length - 1 ? r.games[0].site : undefined;
      return { name: r.name, date: r.date, ...(site ? { site } : {}) };
    }),
    seeds,
  };
}

/** The 2025 San Diego brackets as a sds-brackets file, validated against 2025's window. */
export function seedsFromHistory(section: 'sds'): SdsBracketsFile {
  const entry = getHistoryBrackets().find((b) => b.id === section);
  if (!entry) throw new Error(`no ${section} history bracket`);
  const b = entry.bracket;
  return sds2025Schema.parse({
    season: '2025-26',
    retrievedOn: b.retrievedOn,
    source: { label: b.sources[0].label, url: b.sources[0].url },
    divisions: b.divisions.map(divisionFromHistory),
  });
}

/**
 * The three level 2025 rows and the side MaxPreps marks W on each: data/prior-season.json keeps scores but
 * no result flags, so the flags are restored here from the Section's sheet and Record Book (the history
 * file's `winner`): Canyon Crest Academy won the Open quarterfinal at Torrey Pines 1-1 in a shootout,
 * Mt. Carmel the Division I final 2-2 (3-2 in the shootout), Eastlake the Division II final (MaxPreps 0-0;
 * the sheet posts no score).
 */
const LEVEL_WINNER: Readonly<Record<string, 'home' | 'away'>> = {
  '4cd1ed68-f8e5-48b7-9478-49c81cc5903b': 'away',
  'd34f6dd5-533f-4875-a35e-5d37de607340': 'away',
  'f144e14c-5ab6-4bfa-8fbd-a76ec14e6f6d': 'home',
};

const SDS_SLUGS: ReadonlySet<string> = new Set(
  LEAGUE_IDS.filter((l) => getLeague(l).postseason.kind === 'section-playoffs').flatMap((l) =>
    teamsInLeague(l).map((t) => t.slug),
  ),
);

/** The 26 San Diego playoff rows of data/prior-season.json as tagged games, on their 2025 dates. */
export function sdsGames2025(): Game[] {
  return getPriorSeason()
    .games.filter((r) => r.date >= SDS_2025_WINDOW.first && SDS_SLUGS.has(r.homeSlug) && SDS_SLUGS.has(r.awaySlug))
    .map((r) => {
      const level = LEVEL_WINNER[r.contestId];
      const g = game({
        home: r.homeSlug,
        away: r.awaySlug,
        hs: r.homeScore,
        as: r.awayScore,
        date: r.date,
        league: false,
        contestTypes: { home: 4, away: 4 },
        official: null,
        postseason: { kind: 'section-playoffs', leagueId: null, via: 'section-postseason-window' },
        contestId: r.contestId,
        ...(level ? { results: level === 'home' ? { home: 'W', away: 'L' } : { home: 'L', away: 'W' } } : {}),
      });
      return { ...g, site: r.site };
    });
}

/**
 * The game MaxPreps never posted for the 2025 Division II play-in, Helix 2-1 Granite Hills on Mon Nov 3
 * (the Section's sheet), for a test that needs the play-in decided.
 */
export function sdsPlayIn2025(): Game {
  return game({
    home: 'helix',
    away: 'granite-hills',
    hs: 2,
    as: 1,
    date: '2025-11-03',
    league: false,
    contestTypes: { home: 4, away: 4 },
    official: null,
    postseason: { kind: 'section-playoffs', leagueId: null, via: 'section-postseason-window' },
  });
}
