/**
 * Corrections to MaxPreps' JV rows, applied at load (lib/jv.ts) before the si.com merge, the JV
 * counterpart of DATA_QUALITY.excludedContestIds for varsity (lib/leagues.ts).
 *
 * data/jv.json keeps what each source said; this list says which of MaxPreps' JV rows the site does
 * not take as said, and why. Every entry is a contest id, read and checked by hand (2026-11-03), never
 * a rule over names:
 *
 *   - excluded: a row that is not a game of its own. Most are a second copy of a JV game, entered by
 *     the other school's coach against the wrong MaxPreps team (the boys' Stuart Hall for Convent &
 *     Stuart Hall, another school called Stevenson, St. Francis or Santa Clara): the registry copy of
 *     the same pair on the same day is in the file too, so the stray row only added a phantom unscored
 *     non-league game to a team's JV list. The others are left over from a reschedule.
 *   - dateMoves: a row a school's own schedule shows was played on another day (a reschedule MaxPreps
 *     never took), moved there with MaxPreps' own date kept in `provenance.dateCorrection`.
 *   - JV slot: a row filed under a school that fields no JV team (Santa Catalina) is the game of the team
 *     that plays its JV slot (York), by the league's own schedule; applied to every such row.
 *   - opponent: a row that is a real game but names the wrong MaxPreps team for one side. The side
 *     becomes the registry school only while MaxPreps still names the wrong team id (`wrongTeamId`), so
 *     a row MaxPreps fixes is left alone and the entry is reported unused.
 *
 * Pure: no I/O.
 */

import { byDateThenId, toLocalTimestamp } from './format';
import { jvSlotTeamFor, type JvSlotTeam } from './jv-teams';
import { getTeamBySlug } from './teams';
import type { ContestId, DivisionId, Game, TeamId, TeamSlug } from './types';

export interface JvOpponentFix {
  side: 'home' | 'away';
  /** The MaxPreps team id the row names now; the fix applies only while it does. */
  wrongTeamId: TeamId;
  slug: TeamSlug;
  /** One sentence: the evidence. */
  source: string;
}

export interface JvDateMove {
  /** MaxPreps' date the move applies to (YYYY-MM-DD): a row MaxPreps has since moved is left alone. */
  fromDateKey: string;
  dateKey: string;
  /** One sentence: the source and what it says. */
  source: string;
}

export interface JvCorrections {
  excludedContestIds: Readonly<Record<ContestId, string>>;
  opponentFixes: Readonly<Record<ContestId, JvOpponentFix>>;
  /** A game played on another day than MaxPreps' row says; the time of day is kept. */
  dateMoves?: Readonly<Record<ContestId, JvDateMove>>;
  /**
   * A JV league game the varsity-counterpart rule cannot see (lib/jv-standings.ts rule 0): the division and
   * one sentence of evidence. For a JV slot team whose varsity partner's game moved and its own did not.
   */
  leagueGames?: Readonly<Record<ContestId, { division: DivisionId; source: string }>>;
}

export const JV_CORRECTIONS: JvCorrections = {
  excludedContestIds: {
    // Convent & Stuart Hall's JV, entered by the opponent against MaxPreps' boys' Stuart Hall team
    // (4d85fca8): every one has Convent's own row of the same pair on the same day, which stays.
    '647163f2-9fe6-4239-9d71-76a2b8dc06c7': 'Marin Academy at “Stuart Hall”, Aug 24: a second copy of Marin Academy at Convent & Stuart Hall that day (63e5ee3e, 1-1), entered against the boys’ Stuart Hall team',
    '1a9b868b-b8f2-4606-9d80-c349934e0f2f': '“Stuart Hall” at Berkeley, Sep 9: a second copy of Berkeley v Convent & Stuart Hall that day (798e3d74, Convent 3-0), entered against the boys’ Stuart Hall team',
    '551da750-57f9-466b-9b14-9608c3e8a81f': '“Stuart Hall” at Archie Williams, Sep 14: a second copy of Convent & Stuart Hall at Archie Williams that day (7ee19051, 0-0), entered against the boys’ Stuart Hall team',
    'dc6206b9-c935-4cdb-af73-54633c34c878': '“Stuart Hall” at Tamalpais, Sep 23: a second copy of Convent & Stuart Hall at Tamalpais that day (c29f9119, Tamalpais 1-0), entered against the boys’ Stuart Hall team',
    '598822d1-9ba5-4df5-96e0-ef40098d9245': '“Stuart Hall” at Marin Academy, Sep 29: a second copy of Convent & Stuart Hall at Marin Academy that day (7e8b6b08, Marin Academy 3-1), entered against the boys’ Stuart Hall team',
    'b2256c36-abb2-4994-8b4d-b4fc2342672f': '“Stuart Hall” at Berkeley, Oct 1: a second copy of Berkeley v Convent & Stuart Hall that day (3b256672, Convent 3-0), entered against the boys’ Stuart Hall team',
    // Other schools' namesakes picked from MaxPreps' team search.
    'c236b211-4ff4-4782-b68b-71a7c5b7adca': '“Santa Clara” at Cupertino, Sep 1: a second copy of Santa Clara at Cupertino that day (ebf1cb35, Cupertino 2-0), entered against another school called Santa Clara (ae4e911b)',
    '05823e20-c65d-4641-90b0-3a2ad5b19d11': '“Stevenson” at Salinas, Sep 11: a second copy of Stevenson at Salinas that day (1e475f88, cancelled below), entered against another school called Stevenson (1f032863)',
    'faf9e155-16d8-4504-8719-8a9d1c49b8a1': '“St. Francis” at Cupertino, Oct 7: a second copy of Saint Francis at Cupertino that day (5ade0829), entered against another school called St. Francis (6d65925e)',
    '163945db-f867-417b-b52e-788663c6f503': '“St. Francis” at Palo Alto, Oct 13: a second copy of Saint Francis at Palo Alto that day (cf790ab8), entered against another school called St. Francis (6d65925e)',
    // Cancelled: si.com's game pages for these Salinas JV fixtures (read 2026-11-03) say "Cancelled"; MaxPreps
    // still lists each as unscored, so they read as played games with no score. The site stores no cancelled
    // status (MaxPreps' deleted rows are dropped), so they are left out the same way.
    '1e475f88-d3bd-41f0-95eb-67136cd7c7d5': 'Stevenson at Salinas, Sep 11: cancelled (si.com 6499418)',
    'b63a127b-5433-4a2d-bde0-5ad1f3e0444c': 'Salinas at “Stevenson”, Oct 12: cancelled (si.com 6499427); entered against another school called Stevenson (1f032863)',
    'd697d60f-cff0-4dfc-ae19-c05c7a5ebe2b': 'Greenfield at Salinas, Sep 18: cancelled (si.com 6641813)',
    'd2814ab0-cb1b-479a-a0aa-44229149f400': 'Salinas at Greenfield, Oct 16: cancelled (si.com 6543720)',
    '3aa6cb25-c36c-4acb-8802-6260f705bfa3': 'Salinas at Carmel, Oct 21: cancelled (si.com 6545422)',
    '1a63b95b-63df-4165-bdcf-c79abaab75a1': 'Salinas at Hollister, Oct 27: cancelled (si.com 6544900)',
    // Left over from a reschedule.
    'e47e9888-9787-4c2b-b51b-96cd4613ba49': 'Homestead at Los Altos, Oct 28 with no score: the game was played Oct 26 (34e1ddf8, 0-0, the same pair, host and time; si.com 6877492 has it on Oct 26, 0-0 too)',
    '3abba0e0-65ab-4730-9758-f497ad0c8c8b': 'Fallbrook at Poway, Oct 9 with no time, unchanged on MaxPreps since July: a third JV row for the pair, which played its two Palomar meetings on Sep 15 and Oct 13; the varsity row of the same date and shape (c7dbdbcc) is excluded for the same reason',
  },
  opponentFixes: {},
  leagueGames: {
    // York and Stevenson meet twice (PCAL is a double round robin: CAT/YOR at STE Sep 16, STE at CAT/YOR
    // Oct 16). Santa Catalina's varsity games moved (Stevenson at Santa Catalina Sep 23; Santa Catalina at
    // Stevenson Oct 16), York's JV games did not follow, so no varsity game is within ±3 days of either.
    'sblive:6499421': {
      division: 'pcal',
      source: 'PCAL’s schedule has CAT/YOR at Stevenson on Sep 16, York’s JV game; the Santa Catalina varsity game moved to Sep 23.',
    },
    'sblive:6636296': {
      division: 'pcal',
      source: 'York’s second PCAL meeting with Stevenson: its home game of Oct 16 is cancelled on si.com (6499433) and the two met at Stevenson on Oct 30.',
    },
  },
  dateMoves: {
    // St. Ignatius' JV schedule (siwildcats.com, read 2026-11-03): "Oct 8 (Thu) 5:15 PM at (SCVAL) Los Altos
    // W, 1-0 Los Altos Forfeit", noted "Rescheduled from 9/9/26"; the varsity game of the pair is Oct 8 too.
    '8e66943e-e4b5-486d-9365-fe309c468e23': {
      fromDateKey: '2026-09-09',
      dateKey: '2026-10-08',
      source: 'St. Ignatius’ JV schedule has this game on Oct 8, “Rescheduled from 9/9/26”; MaxPreps still dates it Sep 9.',
    },
  },
};

/**
 * A row filed under a school that fields no JV team (Santa Catalina) is its slot team's (York's): the side
 * becomes that team, by its MaxPreps id, wherever MaxPreps names the school. Applied to every row, with no
 * contest-id list, because the league's schedule says so of every fixture (lib/jv-teams.ts JV_OUTSIDE_TEAMS).
 */
function slotSide(side: Game['home']): { side: Game['home']; team: JvSlotTeam } | null {
  const team = jvSlotTeamFor(side.slug);
  if (!team) return null;
  return { side: { ...side, teamId: team.maxprepsTeamId, slug: null, name: team.name, city: undefined }, team };
}

export interface JvCorrectionResult {
  games: Game[];
  /** Rows left out, with why. */
  excluded: Array<{ game: Game; reason: string }>;
  /** Rows whose side was re-pointed to a registry school. */
  fixed: Array<{ game: Game; source: string }>;
  /** Rows moved to the date a better source gives. */
  moved: Array<{ game: Game; source: string }>;
  /** Entries that matched no row (or a row MaxPreps has since fixed). */
  unused: ContestId[];
}

/** The UTC instant of a Pacific wall-clock timestamp (YYYY-MM-DDTHH:MM:SS). */
function pacificToUtc(dateLocal: string): string {
  for (const hours of [7, 8]) {
    const iso = new Date(Date.parse(`${dateLocal}Z`) + hours * 3_600_000).toISOString().replace('.000Z', 'Z');
    if (toLocalTimestamp(iso) === dateLocal) return iso;
  }
  throw new Error(`jv-corrections: no Pacific instant for ${dateLocal}`);
}

function moved(g: Game, move: JvDateMove): Game {
  const dateLocal = `${move.dateKey}${g.dateLocal.slice(10)}`;
  return {
    ...g,
    dateKey: move.dateKey,
    dateLocal,
    dateUtc: pacificToUtc(dateLocal),
    provenance: {
      ...g.provenance,
      dateCorrection: { maxprepsDateLocal: g.dateLocal, maxprepsTimeTba: g.isTimeTba, source: move.source },
    },
  };
}

export function applyJvCorrections(games: readonly Game[], config: JvCorrections = JV_CORRECTIONS): JvCorrectionResult {
  const excluded: JvCorrectionResult['excluded'] = [];
  const fixed: JvCorrectionResult['fixed'] = [];
  const movedRows: JvCorrectionResult['moved'] = [];
  const seen = new Set<ContestId>();
  const out: Game[] = [];
  for (const g of games) {
    const why = config.excludedContestIds[g.contestId];
    if (why !== undefined) {
      seen.add(g.contestId);
      excluded.push({ game: g, reason: why });
      continue;
    }
    const fix = config.opponentFixes[g.contestId];
    if (fix && g[fix.side].teamId === fix.wrongTeamId) {
      const team = getTeamBySlug(fix.slug);
      if (!team) throw new Error(`jv-corrections: ${g.contestId} names unknown slug ${fix.slug}`);
      seen.add(g.contestId);
      const other = fix.side === 'home' ? g.away : g.home;
      const corrected: Game = {
        ...g,
        [fix.side]: { ...g[fix.side], teamId: team.id, slug: team.slug, name: team.name, city: undefined },
        leagueDivision: other.slug && getTeamBySlug(other.slug)?.division === team.division ? team.division : null,
      };
      fixed.push({ game: corrected, source: fix.source });
      out.push(corrected);
      continue;
    }
    const home = slotSide(g.home);
    const away = slotSide(g.away);
    if (home || away) {
      const corrected: Game = { ...g, home: home?.side ?? g.home, away: away?.side ?? g.away, leagueDivision: null };
      fixed.push({ game: corrected, source: (home ?? away)!.team.source });
      out.push(corrected);
      continue;
    }
    const move = config.dateMoves?.[g.contestId];
    if (move && g.dateKey === move.fromDateKey) {
      seen.add(g.contestId);
      const m = moved(g, move);
      movedRows.push({ game: m, source: move.source });
      out.push(m);
      continue;
    }
    out.push(g);
  }
  const unused = [
    ...Object.keys(config.excludedContestIds),
    ...Object.keys(config.opponentFixes),
    ...Object.keys(config.dateMoves ?? {}),
  ].filter((id) => !seen.has(id));
  return { games: out.sort(byDateThenId), excluded, fixed, moved: movedRows, unused };
}
