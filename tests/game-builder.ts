/**
 * The synthetic Game builder every engine test uses (SPEC §12.2). A built game is schema-valid:
 * its contestId is a GUID, `contestTypes`, `postseason` and `countsFor` are set exactly as the
 * pipeline sets them (`postseasonTag`, then `classifyGame`).
 *
 * Defaults: `league` (isLeague) true; contestTypes {0,0} for a league game, {1,1} otherwise; a
 * game between two members of one 'official-fixtures' division gets an official stamp for that
 * division on its own date (pass `official: null` for an unmatched contest). A 'contest-type'
 * division (SCVAL, EAL) gets no stamp unless one is passed; the EAL publishes no schedule, so a
 * stamp for it must name its own `source`.
 *
 * Result flags follow the score unless `results` overrides them, and the decider is set the way
 * lib/normalize.ts sets it: a level final flagged {W, L} between two teams of a section whose
 * `shootout` rule is set (the Northern Section's EAL, the San Diego Section, across its conferences)
 * is 'SO' (no tally) unless it is a tournament row the section's rule does not cover; otherwise forfeit,
 * then the overtime count. A 'membership' division (San Diego)
 * counts by membership and date, so its games need no stamp; a game MaxPreps flags between two
 * divisions of one such league carries lib/classify.ts's cross-division note, as classifyGames sets it.
 */

import { classifyGame, crossDivisionNote, postseasonTag } from '../lib/classify';
import { getDivision, getSection, leagueOfDivision } from '../lib/leagues';
import { resolveTeam } from '../lib/teams';
import type { Decider, DivisionId, Game, GameStatus, OfficialStamp, Outcome, PostseasonTag } from '../lib/types';

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
  /** MaxPreps' result flags on a final (default: implied by the score), e.g. an EAL 1 v 1 win's W/L on 1-1. */
  results?: { home: Outcome | null; away: Outcome | null };
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
      const config = getDivision(stampDivision).official;
      const source = spec.official?.source ?? (config.mode === 'none' ? null : config.source);
      if (source === null) throw new Error(`${stampDivision} publishes no official schedule: pass official.source`);
      official = {
        scheduledDate: date,
        division: stampDivision,
        source,
        fixtureId: `${stampDivision}:${date}:${away.slug}@${home.slug}`,
        pass: 'same-date',
        ...spec.official,
      };
    }
  }

  const homeResult: Outcome | null = final ? (spec.results?.home ?? (hs! > as! ? 'W' : hs! < as! ? 'L' : 'T')) : null;
  const awayResult: Outcome | null = final ? (spec.results?.away ?? (as! > hs! ? 'W' : as! < hs! ? 'L' : 'T')) : null;
  // As lib/normalize.ts: a tournament row (contestType 2 on either side) is outside a section rule that does
  // not cover tournaments (the San Diego Section's, SectionConfig.shootout.coversTournaments false).
  const rule = home.section === away.section ? getSection(home.section).shootout : null;
  const types = spec.contestTypes ?? (league ? { home: 0, away: 0 } : { home: 1, away: 1 });
  const tournamentRow = types.home === 2 || types.away === 2;
  const shootoutSection = rule !== null && !(tournamentRow && !rule.coversTournaments);
  const oneVOne =
    shootoutSection &&
    hs === as &&
    ((homeResult === 'W' && awayResult === 'L') || (homeResult === 'L' && awayResult === 'W'));
  const decider: Decider | null = !final
    ? null
    : spec.forfeit
      ? 'FORFEIT'
      : oneVOne
        ? 'SO'
        : ot >= 2
          ? '2OT'
          : ot === 1
            ? 'OT'
            : 'REG';

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
      result: homeResult,
    },
    away: {
      teamId: away.id,
      slug: away.slug,
      name: away.name,
      score: as,
      result: awayResult,
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
    decider,
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
  const classified: Game = { ...tagged, countsFor: classifyGame(tagged) };
  const note = crossDivisionNote(classified);
  return note ? { ...classified, provenance: { ...classified.provenance, classificationNote: note } } : classified;
}
