/**
 * The postseason in the snapshot (SPEC §13.3): the CCS picture, a CCS league's ladder projection and
 * pairings, the CCS field, a league tournament's bracket projection, and the one-line postseason
 * summary a team page and the home page's pinned card print.
 */

import { CCS, CCS_LEAGUE_IDS, findLeague, getDivision, getLeague } from '@/lib/config/leagues';
import { getFetchedAt, getSnapshot } from '@/lib/datasets/snapshot';
import { buildLeagueTournament } from '@/lib/engine/postseason';
import { leaguePairings, outcomesFor, playoffOutcomeLabel } from '@/lib/engine/standings';
import { dateSpan, shortDate } from '@/lib/format/dates';
import { playInWords } from '@/lib/format/postseason';
import { numberWord } from '@/lib/format/words';
import type { DivisionId, LeagueId } from '@/lib/model/ids';
import type { LeagueConfig, PairingConfig, PostseasonConfig } from '@/lib/model/league-config';
import type {
  CcsPlayoffs, LadderRow, LeaguePairing, LeagueTournamentProjection, PlayoffProjection,
} from '@/lib/model/postseason';

import { getSeasonPhase } from './phase';
import { getStandings } from './standings';
import { resolveTeamRef } from './teams';

const snapshot = getSnapshot();

// ---------------------------------------------------------------- postseason

export function getPlayoffs(): CcsPlayoffs {
  return snapshot.playoffs;
}

/**
 * A CCS league's ladder projection (SPEC §6.1): rows per division from the computed table, every
 * status a written word. Throws for any other league: a league-tournament league (see getLeagueTournament) or
 * an unbracketed one (the EAL draws no bracket and gets no projection; DESIGN §22).
 */
export function getPlayoffProjection(leagueId: LeagueId, asOf: string = getFetchedAt()): PlayoffProjection {
  const league = getLeague(leagueId);
  if (league.postseason.kind !== 'ccs-ladder') {
    throw new Error(`lib/queries/postseason.ts: ${leagueId} has no CCS ladder (use getLeagueTournament)`);
  }
  const byDivision: Record<DivisionId, LadderRow[]> = {};
  for (const d of league.divisions) {
    byDivision[d.id] = getStandings(d.id).map((s) => {
      // The union, not `s.playoffStatus`: a level place spans more than one finishing slot, so a
      // tie for 3rd holds both the third automatic berth and the 4th-place play-in spot.
      const statuses = outcomesFor(s);
      return {
        teamId: s.teamId,
        slug: s.slug,
        place: s.computed.place,
        status: statuses[0],
        statuses,
        label: s.hasReportedResults ? playoffOutcomeLabel(d.id, statuses) : 'No results reported',
        shared: s.tiebreak.shared,
      };
    });
  }
  const aq = snapshot.playoffs.format.autoQualifiers;
  return {
    asOf,
    leagueId,
    berths: { auto: aq[leagueId] ?? league.postseason.autoBerths, total: aq.total },
    byDivision,
    pairings: getLeaguePairings(leagueId),
  };
}

/** SCVAL: the 4 crossover pairings; BVAL: the play-in; PCAL, MCAL and EAL: []. */
export function getLeaguePairings(leagueId: LeagueId): LeaguePairing[] {
  return leaguePairings(snapshot.standings, snapshot.games, leagueId);
}

/** The 16-team CCS field: numbers only. */
export function getCcsField(): {
  byLeague: Array<{ leagueId: LeagueId; shortName: string; auto: number }>;
  atLarge: number;
  total: number;
} {
  return {
    byLeague: CCS_LEAGUE_IDS.map((id) => ({
      leagueId: id,
      shortName: getLeague(id).shortName,
      auto: CCS.autoQualifiers[id],
    })),
    atLarge: CCS.autoQualifiers.atLarge,
    total: CCS.autoQualifiers.total,
  };
}

/** A league-tournament league's bracket projection (MCAL). Throws for any other league (CCS, EAL). */
export function getLeagueTournament(leagueId: LeagueId, asOf: string = getFetchedAt()): LeagueTournamentProjection {
  const league = getLeague(leagueId);
  if (league.postseason.kind !== 'league-tournament') {
    throw new Error(`lib/queries/postseason.ts: ${leagueId} runs no league tournament (use getPlayoffProjection)`);
  }
  const rows = league.divisions.flatMap((d) => getStandings(d.id));
  return buildLeagueTournament(league, rows, snapshot.games, getSeasonPhase(leagueId, asOf), asOf);
}

export interface TeamPostseasonLine {
  label: string;
  sentence: string;
  href: string;
  linkText: string;
}

/**
 * §10.5 copy; null for an unknown ref AND for a team with gp 0 (never placed by merit), except in a league
 * with no postseason at all (the Sunset), where the line is the league's note whatever the team has played:
 * it says no place leads anywhere, which is as true before a team's first game as after its last.
 */
export function getTeamPostseasonLine(ref: string): TeamPostseasonLine | null {
  const team = resolveTeamRef(ref);
  if (!team) return null;
  const row = snapshot.standings.find((s) => s.teamId === team.id);
  if (!row) return null;
  const league = findLeague(team.league);
  if (!league) return null;
  const ps = league.postseason;
  if (ps.kind === 'no-postseason') {
    // The Sunset: CIF-SS Blue Book 2026-27 Bylaws 2011.1 and 3500.2. One rung covers every place, so the
    // label is the rung's ('No section playoffs') and the sentence is the config note, never a "top N".
    return {
      label: playoffOutcomeLabel(row.division, outcomesFor(row)),
      sentence: ps.note,
      href: `/playoffs#${league.id}`,
      linkText: 'Postseason',
    };
  }
  if (row.computed.gp === 0) return null;
  const statuses = outcomesFor(row);
  const label = playoffOutcomeLabel(row.division, statuses);

  switch (ps.kind) {
    case 'section-playoffs': {
      // The San Diego Section's playoffs (Green Book 2026-27 Bylaw 2000.1): the Section places teams from its
      // power rankings, so a league place is no route except 1st (a designated champion's play-in). The
      // sentence is the config's one qualification line, then the team's own playoff division from the
      // Section's 2026 Divisions sheet; never the EAL's "top N" template, and no seed.
      const division = ps.playoffDivisionOf[team.slug];
      const divisionSentence = division
        ? ` The Section lists ${team.name} in Division ${division}; Open Division teams are drawn from Division I at the end of the regular season.`
        : '';
      return {
        label,
        sentence: `${ps.qualificationLine}${divisionSentence}`,
        href: `/playoffs#${league.id}`,
        linkText: ps.name,
      };
    }
    case 'league-tournament': {
      const round = (id: string) => ps.rounds.find((r) => r.id === id);
      const qf = round('qf-1');
      const playIn = round('play-in');
      const final = round('final');
      const qualifiers = numberWord(ps.qualifiers);
      const byes = ps.byes.length === 2 ? `${ps.byes[0]}-${ps.byes[1]}` : ps.byes.join(', ');
      return {
        label,
        sentence:
          `Top ${qualifiers} make the ${ps.name}: quarterfinals ${qf ? shortDate(qf.date) : ''}` +
          `${playIn ? ` (a play-in ${shortDate(playIn.date)} only if needed)` : ''}, final ` +
          `${final ? shortDate(final.date) : ''} at ${ps.finalSite.label}; seeds ${byes} get byes to the semifinals.`,
        href: `/playoffs/${league.id}`,
        linkText: ps.name,
      };
    }
    case 'unbracketed-tournament':
      // The EAL's Super Regional: the rule and the dates, never a bracket or a seed (DESIGN §22).
      return {
        label,
        sentence: `The top ${numberWord(ps.qualifiers)} schools play the ${ps.name}, ${dateSpan(ps.dates.first, ps.dates.last)}; its format and site are not published yet.`,
        href: `/playoffs#${league.id}`,
        linkText: 'Postseason',
      };
    case 'ccs-ladder': {
      const crossover = ps.pairings.find((p) => p.tag === 'scval-crossover');
      const playIn = ps.pairings.find((p) => p.tag === 'bval-play-in');
      let sentence: string;
      if (crossover) {
        sentence = `The SCVAL crossover and the 4th-place play-in are ${shortDate(crossover.date)}.`;
      } else if (playIn && statuses.includes('play-in')) {
        sentence = `${playInClause(league, ps, playIn)}.`;
      } else if (statuses[0] === 'no-aq-route') {
        sentence = 'No automatic-berth route; at-large berths are the CCS committee’s call.';
      } else {
        // An automatic-berth place (BVAL Mt. Hamilton 1-3, PCAL 1-2): the spec gives no league sentence.
        sentence = `${league.shortName}’s automatic CCS berths go by final place; CCS seeds the field on ${shortDate(CCS.keyDates.seedingMeeting)}.`;
      }
      return { label, sentence, href: `/playoffs#${league.id}`, linkText: 'CCS playoffs' };
    }
  }
}

/**
 * The BVAL-style play-in clause (lib/format/postseason.ts playInWords) for `league`'s pairing, with the
 * champion's division label looked up in the config. The team page ends it with a period; the home
 * page's phase lead adds the CCS seeding meeting.
 */
export function playInClause(
  league: Pick<LeagueConfig, 'shortName'>,
  ps: Extract<PostseasonConfig, { kind: 'ccs-ladder' }>,
  playIn: PairingConfig,
): string {
  return playInWords({
    leagueShortName: league.shortName,
    autoBerths: ps.autoBerths,
    playIn,
    championDivisionLabel: getDivision(playIn.seats[0].division).label,
  });
}
