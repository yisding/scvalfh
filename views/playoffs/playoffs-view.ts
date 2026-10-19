/**
 * What app/playoffs/page.tsx renders, resolved once (`buildPlayoffsPageView`): the CCS field, key dates
 * and bracket, one block per CCS league, the pointer to each league tournament, the EAL's unbracketed
 * card, and the San Diego Section's playoffs with the leagues that hold none. The components in
 * components/playoffs/ take these slices as props and read no snapshot data; the page itself keeps
 * only its composition and metadata (`asOfPhrase` and `postseasonWords` are exported for the
 * description).
 *
 * Server-only: it reads lib/queries, like views/playoffs/tournament-route.ts. The projection, pairing
 * and bracket models it assembles are the pure modules beside it (projection.ts, pairings.ts,
 * bracket.ts, key-dates.ts).
 */

import {
  NO_POSTSEASON_LEAGUE_IDS,
  SECTION_PLAYOFFS_LEAGUE_IDS,
  TOURNAMENT_LEAGUE_IDS,
  UNBRACKETED_LEAGUE_IDS,
  getLeague,
  isIndependentLeague,
} from '@/lib/config/leagues';
import { leagueTitle } from '@/lib/config/leagues/labels';
import { monthDay } from '@/lib/format/dates';
import { indefiniteArticle, listWords } from '@/lib/format/words';
import type { LeagueHealth } from '@/lib/model/health';
import type { LeagueId } from '@/lib/model/ids';
import type { LeagueConfig } from '@/lib/model/league-config';
import type { PlayoffProjection as Projection } from '@/lib/model/postseason';
import { getLastLeagueResultDate } from '@/lib/queries/games';
import { getLeagueHealth, getLeagueSummaries } from '@/lib/queries/leagues';
import type { LeagueSummary } from '@/lib/queries/leagues';
import { getCcsField, getLeaguePairings, getPlayoffProjection, getPlayoffs } from '@/lib/queries/postseason';
import { areKeyDatesConfirmed } from '@/lib/queries/provenance';
import { getStandingFor } from '@/lib/queries/standings';
import { getTeams } from '@/lib/queries/teams';
import { getTeamById } from '@/lib/registry/teams';
import { buildBrackets, ccsDivisionLabels, pendingRounds } from '@/views/playoffs/bracket';
import type { LeagueKeyDate } from '@/views/playoffs/key-dates';
import { buildPairingView, pairingNotesFor } from '@/views/playoffs/pairings';
import { buildDivisionProjection, ladderFactsFor, type ProjectionRow } from '@/views/playoffs/projection';
import { postseasonSourceLink, type SourceLink } from '@/views/shared/postseason-source';
import { leagueChips } from '@/views/site/league-chips';
import { leaderLine } from '@/views/standings/standings-view';

/** SPEC §10.7 item 8, verbatim. */
export const AT_LARGE_PARAGRAPH =
  'Three at-large berths are the CCS committee’s call. SCVAL submits its play-in loser and both fifth-place teams (Article VII §2); PCAL teams placed 3rd or lower may apply (PCAL By-laws §23.4); BVAL’s by-laws do not say whom it submits.';

/** "through Sep 29" / "so far", from the last day a LEAGUE result was reported (never getToday()). */
export function asOfPhrase(lastResult: string | null): string {
  return lastResult ? `through ${monthDay(lastResult)}` : 'so far';
}

function projectionRows(projection: Projection, division: string): ProjectionRow[] {
  return (projection.byDivision[division] ?? []).flatMap((row) => {
    const team = getTeamById(row.teamId);
    const standing = getStandingFor(row.teamId);
    if (!team || !standing) return [];
    return [{ team, standing, status: row.status, statuses: row.statuses, label: row.label, shared: row.shared }];
  });
}

function resolveSeat(teamId: string) {
  const team = getTeamById(teamId);
  return team ? { team, standing: getStandingFor(teamId) } : undefined;
}

/** One CCS league's dates on the CCS calendar: its crossover / play-in, from config pairings. */
function leagueKeyDate(league: LeagueConfig): LeagueKeyDate | null {
  if (league.postseason.kind !== 'ccs-ladder' || league.postseason.pairings.length === 0) return null;
  const pairings = league.postseason.pairings;
  const first = pairings[0];
  const entry = league.keyDates.find((k) => k.date === first.date);
  const label = (entry?.label ?? `${league.shortName} postseason`).replace(/,\s*\d{1,2}(:\d{2})?\s*[AP]M$/, '');
  const purposes = [...new Set(pairings.map((p) => {
    const at = p.label.indexOf(' — ');
    const tail = at < 0 ? p.label : p.label.slice(at + 3);
    return `${tail[0].toUpperCase()}${tail.slice(1)}`;
  }))];
  const detail = pairings.length === 1 ? `${first.label}.` : `${purposes.join('. ')}.`;
  return { id: league.id, leagueShort: league.shortName, date: first.date, time: first.time, label, detail };
}

/** One CCS league's section: its divisions' ladder projections, its pairings and its qualification line. */
export interface LeagueBlock {
  summary: LeagueSummary;
  config: LeagueConfig;
  /** The league's data health (LeagueHealthNote, under the section's intro). */
  health: LeagueHealth;
  divisions: Array<{
    id: string;
    heading: string;
    anchor: string | undefined;
    asOf: string;
    projection: ReturnType<typeof buildDivisionProjection>;
  }>;
  meterNote: string | null;
  pairings: ReturnType<typeof buildPairingView>[];
  pairingDate: string | null;
}

function leagueBlock(summary: LeagueSummary): LeagueBlock {
  const config = getLeague(summary.id);
  const projection = getPlayoffProjection(summary.id);
  const divisions = summary.divisions.map((d) => {
    const facts = ladderFactsFor(d.id);
    return {
      id: d.id,
      heading: d.heading ?? 'League table',
      // A single-division league whose division id equals the league id: ONE element carries it.
      anchor: d.id === summary.id ? undefined : d.id,
      asOf: asOfPhrase(getLastLeagueResultDate({ division: d.id })),
      projection: buildDivisionProjection(d.id, d.heading ?? summary.shortName, projectionRows(projection, d.id), facts),
      aq: facts.aqPlaces,
    };
  });
  const aqs = [...new Set(divisions.map((d) => d.aq))];
  const meterNote =
    divisions.length > 1 && aqs.length === 1 && aqs[0] > 0
      ? `${aqs[0]} per division qualify automatically.`
      : null;
  const pairings = getLeaguePairings(summary.id).map((p) =>
    buildPairingView(p, resolveSeat, pairingNotesFor(p)),
  );
  return {
    summary,
    config,
    health: getLeagueHealth(summary.id),
    divisions,
    meterNote,
    pairings,
    pairingDate: pairings[0]?.dateKey ?? null,
  };
}

/**
 * Where each league's season leads, from config, in config order: 'the CCS championships (SCVAL, BVAL
 * and PCAL), the MCAL tournament, the EAL’s Super Regional, no playoffs for the Sunset or the Southern
 * Section independents and the San Diego Section playoffs (City, North and Metro)'. A group with no table
 * is named in full (its short name, 'LA', alone names a place).
 */
export function postseasonWords(): string {
  const parts: Array<{ key: string; words: (shorts: string[]) => string; shorts: string[] }> = [];
  const add = (key: string, short: string, words: (shorts: string[]) => string) => {
    const part = parts.find((p) => p.key === key);
    if (part) part.shorts.push(short);
    else parts.push({ key, words, shorts: [short] });
  };
  for (const summary of getLeagueSummaries()) {
    const ps = getLeague(summary.id).postseason;
    switch (ps.kind) {
      case 'ccs-ladder':
        add('ccs', summary.shortName, (shorts) => `the CCS championships (${listWords(shorts)})`);
        break;
      case 'league-tournament':
        add(summary.id, summary.shortName, () => `the ${ps.name}`);
        break;
      case 'unbracketed-tournament':
        add(summary.id, summary.shortName, () => `the ${summary.shortName}’s ${ps.name}`);
        break;
      case 'no-postseason':
        add(
          'no-postseason',
          isIndependentLeague(summary.id) ? summary.name : summary.shortName,
          (shorts) => `no playoffs for ${listWords(shorts.map((s) => `the ${s}`), 'or')}`,
        );
        break;
      case 'section-playoffs':
        add(ps.name, summary.shortName, (shorts) => `the ${ps.name} (${listWords(shorts)})`);
        break;
    }
  }
  return listWords(parts.map((p) => p.words(p.shorts)));
}

/** The pointer a league tournament's league gets on /playoffs (MCAL's): one sentence and the link to its page. */
export interface TournamentPointerData {
  id: LeagueId;
  /** 'Following an MCAL team? The North Coast Section holds no field hockey championship. ' (one text node) */
  lead: string;
  href: string;
  /** The link's words: the tournament's name. */
  name: string;
}

/** The EAL's card: the rule, its qualification line and its source, never a bracket or a seed. */
export interface UnbracketedCardData {
  id: LeagueId;
  /** 'Following an EAL team? <note>' */
  lead: string;
  /** '<qualification>.' */
  qualification: string;
  source: SourceLink;
}

/** One San Diego conference's card: per division the table's leaders, and each team's playoff division. */
export interface SectionLeagueCardData {
  summary: LeagueSummary;
  divisions: Array<{
    id: string;
    heading: string | null;
    leaders: ReturnType<typeof leaderLine>['teams'];
    /** Short names, in the division's team order, by the Section's playoff division. */
    playoffDivision: Record<'I' | 'II', string[]>;
  }>;
}

/** The San Diego Section's playoffs: the config every San Diego league shares, and its conference cards. */
export interface SectionPlayoffsData {
  ps: Extract<LeagueConfig['postseason'], { kind: 'section-playoffs' }>;
  source: SourceLink;
  seeding: string | null;
  leagues: SectionLeagueCardData[];
}

/** A league with no postseason (the Sunset, the LA independents): the config's note and its source. */
export interface NoPostseasonCardData {
  id: LeagueId;
  kicker: string;
  /** The independents' own note, ahead of the Section's. */
  groupNote: string | null;
  note: string;
  /** '<no playoffs citation>.' */
  citation: string;
  source: SourceLink;
}

function sectionLeagueCard(summary: LeagueSummary): SectionLeagueCardData | null {
  const ps = getLeague(summary.id).postseason;
  if (ps.kind !== 'section-playoffs') return null;
  return {
    summary,
    divisions: summary.divisions.map((d) => {
      const teams = getTeams(d.id);
      const byDivision = (which: 'I' | 'II') =>
        teams.filter((t) => ps.playoffDivisionOf[t.slug] === which).map((t) => t.shortName);
      return {
        id: d.id,
        heading: d.heading,
        leaders: leaderLine(d.id, d.heading).teams,
        playoffDivision: { I: byDivision('I'), II: byDivision('II') },
      };
    }),
  };
}

function sectionPlayoffs(): SectionPlayoffsData | null {
  const leagues = getLeagueSummaries().filter((s) => SECTION_PLAYOFFS_LEAGUE_IDS.includes(s.id));
  const first = leagues[0] ? getLeague(leagues[0].id) : undefined;
  const source = first ? postseasonSourceLink(first.id) : null;
  if (!first || first.postseason.kind !== 'section-playoffs' || !source) return null;
  return {
    ps: first.postseason,
    source,
    seeding: first.keyDates.find((d) => d.id === 'seeding-meeting')?.date ?? null,
    leagues: leagues.flatMap((s) => {
      const card = sectionLeagueCard(s);
      return card ? [card] : [];
    }),
  };
}

function noPostseasonCard(summary: LeagueSummary): NoPostseasonCardData | null {
  const league = getLeague(summary.id);
  const ps = league.postseason;
  const source = postseasonSourceLink(summary.id);
  if (ps.kind !== 'no-postseason' || !source) return null;
  const independent = isIndependentLeague(summary.id);
  const groupNote = independent && league.divisions[0]?.official.mode === 'none' ? league.divisions[0].official.note : null;
  return {
    id: summary.id,
    kicker: leagueTitle(summary.id),
    groupNote,
    note: ps.note,
    citation: `${ps.citations.noPlayoffs}.`,
    source,
  };
}

function unbracketedCard(league: LeagueSummary): UnbracketedCardData | null {
  const ps = getLeague(league.id).postseason;
  const source = postseasonSourceLink(league.id);
  if (ps.kind !== 'unbracketed-tournament' || !source) return null;
  return {
    id: league.id,
    lead: `Following ${indefiniteArticle(league.shortName, { mode: 'letter-name' })} ${league.shortName} team? ${ps.note}`,
    qualification: `${ps.citations.qualification}.`,
    source,
  };
}

function tournamentPointer(league: LeagueSummary): TournamentPointerData {
  const ps = getLeague(league.id).postseason;
  return {
    id: league.id,
    lead: `Following ${indefiniteArticle(league.shortName, { mode: 'letter-name' })} ${league.shortName} team? The ${league.section.name} holds no field hockey championship. `,
    href: `/playoffs/${league.id}`,
    name: ps.kind === 'league-tournament' ? ps.name : `${league.shortName} postseason`,
  };
}

/** Everything /playoffs renders, in the order it renders it. */
export interface PlayoffsPageView {
  /** The header's description: where each league's season leads. */
  postseasonWords: string;
  summaries: LeagueSummary[];
  chips: ReturnType<typeof leagueChips>;
  /** Each league's jump-link / chip target: its own page for a tournament league, else its card below. */
  hrefs: Record<string, string>;
  /** The league-tournament leagues (today `mcal`), whose pill leads to their own page. */
  tournamentIds: LeagueId[];
  playoffs: ReturnType<typeof getPlayoffs>;
  field: ReturnType<typeof getCcsField>;
  /** 'Central Coast Section · 16 teams · SCVAL 7, BVAL 4, PCAL 2, 3 at-large' */
  fieldMeta: string;
  /** CCS has published its bracket and it has games. */
  seeded: boolean;
  paths: ReturnType<typeof buildBrackets>;
  pending: ReturnType<typeof pendingRounds>;
  /** 'Division I and Division II' etc., from the bracket's format. */
  divisionLabels: string[];
  keyDatesConfirmed: boolean | undefined;
  leagueDates: LeagueKeyDate[];
  blocks: LeagueBlock[];
  tournamentPointers: TournamentPointerData[];
  unbracketed: UnbracketedCardData[];
  sds: SectionPlayoffsData | null;
  noPostseason: NoPostseasonCardData[];
}

export function buildPlayoffsPageView(): PlayoffsPageView {
  const playoffs = getPlayoffs();
  const { bracketPublished } = playoffs;
  const field = getCcsField();
  const summaries = getLeagueSummaries();
  const ccsIds = new Set<LeagueId>(field.byLeague.map((l) => l.leagueId));
  const ccsLeagues = summaries.filter((s) => ccsIds.has(s.id));
  const tournamentIds = new Set<LeagueId>(TOURNAMENT_LEAGUE_IDS);
  const tournamentLeagues = summaries.filter((s) => tournamentIds.has(s.id));
  const unbracketedLeagues = summaries.filter((s) => UNBRACKETED_LEAGUE_IDS.includes(s.id));
  const ccsSection = ccsLeagues[0]?.section;

  const paths = buildBrackets(playoffs);
  const seeded = Boolean(bracketPublished) && paths.length > 0;
  const pending = seeded ? pendingRounds(playoffs, paths) : [];
  const blocks = ccsLeagues.map(leagueBlock);
  const leagueDates = ccsLeagues
    .map((s) => leagueKeyDate(getLeague(s.id)))
    .filter((d): d is LeagueKeyDate => d !== null);

  const hrefs: Record<string, string> = Object.fromEntries(
    summaries.map((s) => [s.id, tournamentIds.has(s.id) ? `/playoffs/${s.id}` : `#${s.id}`]),
  );
  const fieldMeta = `${ccsSection?.name ?? 'Central Coast Section'} · ${field.total} teams · ${field.byLeague
    .map((l) => `${l.shortName} ${l.auto}`)
    .join(', ')}, ${field.atLarge} at-large`;

  return {
    postseasonWords: postseasonWords(),
    summaries,
    chips: leagueChips(),
    hrefs,
    tournamentIds: [...tournamentIds],
    playoffs,
    field,
    fieldMeta,
    seeded,
    paths,
    pending,
    divisionLabels: ccsDivisionLabels(playoffs),
    keyDatesConfirmed: areKeyDatesConfirmed(),
    leagueDates,
    blocks,
    tournamentPointers: tournamentLeagues.map(tournamentPointer),
    unbracketed: unbracketedLeagues.flatMap((l) => {
      const card = unbracketedCard(l);
      return card ? [card] : [];
    }),
    sds: sectionPlayoffs(),
    noPostseason: summaries
      .filter((s) => NO_POSTSEASON_LEAGUE_IDS.includes(s.id))
      .flatMap((s) => {
        const card = noPostseasonCard(s);
        return card ? [card] : [];
      }),
  };
}
