/**
 * The synthetic Game builder every engine test uses (SPEC §12.2). A built game is schema-valid:
 * its contestId is a GUID, `contestTypes`, `postseason` and `countsFor` are set exactly as the
 * pipeline sets them (`postseasonTag`, then `classifyGame`).
 *
 * Defaults: `league` (isLeague) true; contestTypes {0,0} for a league game, {1,1} otherwise; a
 * game between two members of one 'official-fixtures' division gets an official stamp for that
 * division on its own date (pass `official: null` for an unmatched contest).
 */

import { classifyGame, postseasonTag } from '../lib/classify';
import { getDivision, leagueOfDivision } from '../lib/leagues';
import { resolveTeam } from '../lib/teams';
import type { DivisionId, Game, GameStatus, OfficialStamp, PostseasonTag } from '../lib/types';

let seq = 0;

export interface GameSpec {
  home: string;
  away: string;
  hs?: number | null;
  as?: number | null;
  /** YYYY-MM-DD; default 2026-09-09. */
  date?: string;
  status?: GameStatus;
  /** Game.isLeague (MaxPreps' contestType 0 flag). Default true. */
  league?: boolean;
  /** Override Game.leagueDivision (default: the shared division of the two sides, else null). */
  division?: DivisionId | null;
  contestTypes?: { home: number | null; away: number | null };
  /** A stamp, `null` for none, or undefined for the default described above. */
  official?: Partial<OfficialStamp> | null;
  /** A tag, or undefined to derive it with postseasonTag(). */
  postseason?: PostseasonTag | null;
  forfeit?: boolean;
  ot?: number;
  /** Override the generated GUID. */
  contestId?: string;
}

/** A deterministic GUID-shaped contest id. */
export function nextContestId(): string {
  seq += 1;
  return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
}

/** A minimal, schema-valid Game between two registry teams. */
export function game(spec: GameSpec): Game {
  const home = resolveTeam(spec.home);
  const away = resolveTeam(spec.away);
  if (!home || !away) throw new Error(`unknown team in spec: ${spec.home} / ${spec.away}`);
  const date = spec.date ?? '2026-09-09';
  const status = spec.status ?? (spec.hs === undefined ? 'scheduled' : 'final');
  const final = status === 'final';
  const league = spec.league ?? true;
  const division =
    spec.division === undefined
      ? home.division === away.division
        ? home.division
        : null
      : spec.division;
  const hs = final ? (spec.hs ?? 0) : null;
  const as = final ? (spec.as ?? 0) : null;
  const ot = spec.ot ?? 0;

  let official: OfficialStamp | undefined;
  if (spec.official !== null) {
    const stampDivision = spec.official?.division ?? division;
    const auto =
      stampDivision !== null &&
      (spec.official !== undefined ||
        leagueOfDivision(stampDivision).rules.classification === 'official-fixtures');
    if (auto && stampDivision !== null) {
      official = {
        scheduledDate: date,
        division: stampDivision,
        source: getDivision(stampDivision).official.source,
        fixtureId: `${stampDivision}:${date}:${away.slug}@${home.slug}`,
        pass: 'same-date',
        ...spec.official,
      };
    }
  }

  const base: Game = {
    contestId: spec.contestId ?? nextContestId(),
    dateLocal: `${date}T16:00:00`,
    dateUtc: `${date}T23:00:00Z`,
    dateKey: date,
    isDateTba: false,
    isTimeTba: false,
    home: {
      teamId: home.id,
      slug: home.slug,
      name: home.name,
      score: hs,
      result: final ? (hs! > as! ? 'W' : hs! < as! ? 'L' : 'T') : null,
    },
    away: {
      teamId: away.id,
      slug: away.slug,
      name: away.name,
      score: as,
      result: final ? (as! > hs! ? 'W' : as! < hs! ? 'L' : 'T') : null,
    },
    site: 'home',
    status,
    isLeague: league,
    leagueDivision: division,
    contestTypes: spec.contestTypes ?? (league ? { home: 0, away: 0 } : { home: 1, away: 1 }),
    countsFor: null,
    postseason: null,
    otPeriods: ot,
    isOt: ot > 0,
    isForfeit: spec.forfeit ?? false,
    forfeitBy: spec.forfeit ? 'away' : null,
    decider: final ? (spec.forfeit ? 'FORFEIT' : ot >= 2 ? '2OT' : ot === 1 ? 'OT' : 'REG') : null,
    shootout: null,
    venue: { text: null },
    ...(official ? { official } : {}),
    recap: null,
    urls: { maxpreps: null, nfhsStream: null, goFan: null },
    provenance: {
      scores: 'derived',
      schedule: 'derived',
      fetchedAt: '2026-09-29T15:00:00.000Z',
    },
  };
  const tagged: Game = {
    ...base,
    postseason: spec.postseason !== undefined ? spec.postseason : postseasonTag(base),
  };
  return { ...tagged, countsFor: classifyGame(tagged) };
}
