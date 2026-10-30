import type { Metadata } from 'next';
import Link from 'next/link';
import { Fragment } from 'react';

import LeagueJumpLinks from '../../components/layout/LeagueJumpLinks';
import LeagueSwitcher, { RegionSwitcher } from '../../components/layout/LeagueSwitcher';
import PageHeader from '../../components/layout/PageHeader';
import { leagueChips } from '../../components/layout/league-chips';
import { OG_BASE, ROOT_OG_IMAGE } from '../../components/layout/site';
import DateList from '../../components/playoffs/DateList';
import KeyDates from '../../components/playoffs/KeyDates';
import LeaguePairings from '../../components/playoffs/LeaguePairings';
import OutsideTournament from '../../components/playoffs/OutsideTournament';
import PlayoffBracket from '../../components/playoffs/PlayoffBracket';
import PlayoffProjection, { ProjectionKey } from '../../components/playoffs/PlayoffProjection';
import SdsBracket from '../../components/playoffs/SdsBracket';
import ThisWeek from '../../components/playoffs/ThisWeek';
import UnbracketedResults from '../../components/playoffs/UnbracketedResults';
import { buildBrackets, ccsDivisionLabels, pendingRounds } from '../../components/playoffs/bracket-model';
import {
  buildDivisionProjection,
  buildOutsideTournamentView,
  buildPairingView,
  ladderFactsFor,
  sectionBracketSentence,
  sectionRoundRows,
  type LeagueKeyDate,
  type PairingView,
  type ProjectionRow,
} from '../../components/playoffs/playoff-view';
import { pairingViewsFor, sectionPlayoffs, thisWeekByRegion } from '../../components/playoffs/this-week-inputs';
import { buildUnbracketedResults } from '../../components/playoffs/unbracketed-view';
import Arrow from '../../components/ui/Arrow';
import BerthMeter from '../../components/ui/BerthMeter';
import ExternalLink from '../../components/ui/ExternalLink';
import LeagueHealthNote from '../../components/ui/LeagueHealthNote';
import SectionHeader from '../../components/ui/SectionHeader';
import { leaderLine } from '../../components/standings/standings-page-view';
import {
  areKeyDatesConfirmed,
  getCcsField,
  getGames,
  getLastLeagueResultDate,
  getLeagueSummaries,
  getPlayoffProjection,
  getPlayoffs,
  getStandingFor,
  getTeamById,
  getTeams,
  getToday,
  getTournamentLeagueIds,
} from '../../lib/data';
import type { LeagueSummary } from '../../lib/data';
import { getCcsSeeds } from '../../lib/ccs-bracket';
import { getSdsBrackets, getSdsBracketsSource } from '../../lib/sds-bracket';
import { dateSpan, listWords, monthDay, shortDate } from '../../lib/format';
import {
  NO_POSTSEASON_LEAGUE_IDS,
  UNBRACKETED_LEAGUE_IDS,
  getLeague,
  isIndependentLeague,
  sectionOf,
} from '../../lib/leagues';
import type { LeagueConfig } from '../../lib/leagues';
import type { LeagueId, PlayoffProjection as Projection } from '../../lib/types';

/**
 * /playoffs — "Are we in, and who do we play?" (SPEC §6.3, §10.7; DESIGN-socal §2.4): every league's
 * postseason under a neutral "Playoffs" header, one block per region.
 *
 * NorCal (`<div id="norcal" data-region-scope>`): the CCS page for the three Central Coast Section
 * leagues (its description and field line, which used to be the page header's, open the block). The
 * North Coast Section holds no field hockey championship, so an MCAL reader is pointed to
 * /playoffs/mcal and nothing else is about MCAL. The EAL's postseason, the Northern Section's Super
 * Regional, publishes no bracket, so it has no page of its own: its card (`id="<league id>"`, the
 * target of the EAL chip and jump link) states the rule, the dates and the Guidelines, word for word as
 * before the Southern California amendment.
 *
 * SoCal (`<div id="socal" data-region-scope>`): the San Diego Section's playoffs (Green Book 2026-27
 * Bylaw 2000.1), as the config states them: the qualification line, where the round dates come from,
 * the power rankings the Section places teams from, and that the Section publishes its brackets after
 * its seeding meeting. No seed is projected: the Section, not a league table, places teams. Once the owner
 * has transcribed the Section's published brackets (data/sds-brackets-2026.json; 2026-10-30, plan final-08),
 * they are drawn under `#sds-bracket`, after the round dates and before the conference cards
 * (components/playoffs/SdsBracket.tsx), with MaxPreps' results; on the placeholder nothing is drawn. One card per conference (`#city`, `#north-county`, `#metro`) gives each division's table
 * leaders and each team's playoff division (I or II, the Section's 2026 Divisions sheet). Then the
 * Sunset's card (`#sunset`): the Southern Section holds no field hockey playoffs (Blue Book 2011.1,
 * 3500.2), with its source; and the LA independents' card (`#independents`, DESIGN §24.9):
 * the three play as independents (the group's note) and the Section holds no playoffs. No SoCal sentence
 * says "at-large", "automatic qualifier" or "seed". SoCal's own "This week" strip (`#this-week-socal`: the
 * Tournament of Champions' games, the Section's seeding meeting and round calendar) opens the block, and the
 * conference cards' shared footnote (where the divisions come from; a league names its champion) is printed
 * once under the three cards.
 *
 * The NorCal blocks, in order: the CCS intro (+ the not-seeded state, one sentence), "This week in the
 * postseason" (`#this-week-norcal`, components/playoffs/this-week.ts: every NorCal postseason game and dated
 * event from two days back to a week ahead, by day; added 2026-10-29), the NCS pointer card and the EAL card
 * (its rule, streams and Guidelines, then its Super Regional games by day once MaxPreps lists them,
 * UnbracketedResults), "The field" (one BerthMeter row per CCS league + the at-large line), "Key
 * dates" (CCS dates plus each league's own crossover / play-in, labelled), the `#scval #bval #pcal`
 * sections (per-division ladder projection, the league's pairings, its qualification sentence), the
 * bracket (`#bracket`) once CCS publishes it, and the at-large paragraph. The jump links, the region
 * control and the league chips sit above both blocks.
 *
 * The bracket (2026-10-30, plan final-06): `seeded` is "the model has a path to draw" — a bracket game in
 * `playoffs.games` or a division in the owner seed file (lib/ccs-bracket.ts getCcsSeeds) — never
 * `bracketPublished` alone, which says only that the MaxPreps page has a division posted. One path per CCS
 * division when the feed's bracket name or the seed file proves it (components/playoffs/bracket-model.ts),
 * each under its own h3; the footnote says how CCS numbers the two divisions when they are known, and only
 * says "our data does not say which division" when they are not. A division the page has posted but no game
 * or seed has reached yet gets its own one-sentence state. The league intros date themselves on
 * `getToday()` against the seeding meeting: "nothing here is official until Mon Nov 2" before it, "CCS
 * seeded the field on Mon Nov 2; results update twice a day" from that day.
 *
 * There is no merged 1-16 order: no rule ranks a De Anza team against a Mt. Hamilton team, and the
 * CCS committee seeds by criteria we cannot compute. Everything is derived from the snapshot and
 * config: "today" is `snapshot.fetchedAt` in Pacific, never `Date.now()`.
 */

const PAGE_TITLE = 'Playoffs';

/** SPEC §10.7 item 8, verbatim. */
const AT_LARGE_PARAGRAPH =
  'Three at-large berths are the CCS committee’s call. SCVAL submits its play-in loser and both fifth-place teams (Article VII §2); PCAL teams placed 3rd or lower may apply (PCAL By-laws §23.4); BVAL’s by-laws do not say whom it submits.';

/** "through Sep 29" / "so far", from the last day a LEAGUE result was reported (never getToday()). */
function asOfPhrase(lastResult: string | null): string {
  return lastResult ? `through ${monthDay(lastResult)}` : 'so far';
}

/** 'an MCAL', 'a BVAL' — the article an acronym takes when read letter by letter. */
function article(acronym: string): string {
  return /^[AEFHILMNORSX]/.test(acronym) ? 'an' : 'a';
}

function projectionRows(projection: Projection, division: string): ProjectionRow[] {
  return (projection.byDivision[division] ?? []).flatMap((row) => {
    const team = getTeamById(row.teamId);
    const standing = getStandingFor(row.teamId);
    if (!team || !standing) return [];
    return [{ team, standing, status: row.status, statuses: row.statuses, label: row.label, shared: row.shared }];
  });
}

/**
 * One CCS league's dates on the CCS calendar: its crossover / play-in, from config pairings. The row sits
 * on the schedule's day (`date`); when a game the pairings matched is dated off that day (the 2026 SCVAL
 * crossovers #1 and #3, Thu Oct 29), the detail says which, by seat labels, so the row stays true.
 */
function leagueKeyDate(league: LeagueConfig, played: readonly PairingView[]): LeagueKeyDate | null {
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
  const moved = new Map<string, string[]>();
  for (const p of played) {
    const configured = pairings.find((c) => c.id === p.id);
    if (!p.game || !configured || p.dateKey === configured.date) continue;
    const seats = `${p.seats[0].label} v ${p.seats[1].label}`;
    moved.set(p.dateKey, [...(moved.get(p.dateKey) ?? []), seats]);
  }
  const movedWords = [...moved.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, seats]) => ` ${listWords(seats)} ${seats.length === 1 ? 'is' : 'are'} ${shortDate(dateKey)}.`)
    .join('');
  const detail = `${pairings.length === 1 ? `${first.label}.` : `${purposes.join('. ')}.`}${movedWords}`;
  return { id: league.id, leagueShort: league.shortName, date: first.date, time: first.time, label, detail };
}

interface LeagueBlock {
  summary: LeagueSummary;
  config: LeagueConfig;
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
  const pairings = pairingViewsFor(summary.id);
  return {
    summary,
    config,
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
function postseasonWords(): string {
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

export async function generateMetadata(): Promise<Metadata> {
  const playoffs = getPlayoffs();
  const { keyDates } = playoffs;
  const field = getCcsField();
  // The same test the page uses: a path to draw, from the bracket games or the seed file (never the page flag alone).
  const seeded = buildBrackets(playoffs, getCcsSeeds()).length > 0;
  const shares = field.byLeague.map((l) => `${l.shortName} ${l.auto}`).join(', ');
  const description = seeded
    ? `The CCS field hockey bracket: quarterfinals ${shortDate(keyDates.quarterfinals)}, semifinals ${shortDate(
        keyDates.semifinals,
      )}, final ${shortDate(keyDates.finals)}. Unofficial, computed from published results.`
    : `The ${field.total}-team CCS field: ${shares}, ${field.atLarge} at-large. Seeding meeting ${shortDate(
        keyDates.seedingMeeting,
      )}; quarterfinals ${shortDate(keyDates.quarterfinals)}, final ${shortDate(
        keyDates.finals,
      )}. Projected from league results ${asOfPhrase(getLastLeagueResultDate())} — unofficial.`;
  const all = `${description} Every league’s postseason: ${postseasonWords()}.`;
  return {
    title: PAGE_TITLE,
    description: all,
    alternates: { canonical: '/playoffs' },
    openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, title: PAGE_TITLE, description: all, url: '/playoffs' },
  };
}

export default function PlayoffsPage() {
  const playoffs = getPlayoffs();
  const { keyDates, bracketUrl, bracketPublished } = playoffs;
  const field = getCcsField();
  const summaries = getLeagueSummaries();
  const ccsIds = new Set<LeagueId>(field.byLeague.map((l) => l.leagueId));
  const ccsLeagues = summaries.filter((s) => ccsIds.has(s.id));
  const tournamentIds = new Set<LeagueId>(getTournamentLeagueIds());
  const tournamentLeagues = summaries.filter((s) => tournamentIds.has(s.id));
  const unbracketedLeagues = summaries.filter((s) => UNBRACKETED_LEAGUE_IDS.includes(s.id));
  const ccsSection = ccsLeagues[0]?.section;

  const paths = buildBrackets(playoffs, getCcsSeeds());
  const seeded = paths.length > 0;
  const pending = seeded ? pendingRounds(playoffs, paths) : [];
  // Every path's division is proven (the feed's bracket name or the seed file): the footnote can say how CCS
  // numbers them. A division the MaxPreps page has posted that no game or seed has reached yet is named below —
  // only while no unproven path is drawn, since an unproven path may hold that division's games.
  const divisionsKnown = seeded && paths.every((p) => p.division !== null);
  const postedUnseen =
    divisionsKnown || !seeded
      ? playoffs.format.ccsDivisions
          .map((d) => d.name)
          .filter((name) => playoffs.divisionsPublished?.[name] === true && !paths.some((p) => p.division === name))
      : [];
  const overall = playoffs.format.ccsDivisions.find((d) => d.seeds[0] !== 1);
  const blocks = ccsLeagues.map(leagueBlock);
  const leagueDates = blocks
    .map((b) => leagueKeyDate(b.config, b.pairings))
    .filter((d): d is LeagueKeyDate => d !== null);

  const chips = leagueChips();
  const hrefs: Record<string, string> = Object.fromEntries(
    summaries.map((s) => [s.id, tournamentIds.has(s.id) ? `/playoffs/${s.id}` : `#${s.id}`]),
  );
  const fieldMeta = `${ccsSection?.name ?? 'Central Coast Section'} · ${field.total} teams · ${field.byLeague
    .map((l) => `${l.shortName} ${l.auto}`)
    .join(', ')}, ${field.atLarge} at-large`;

  const noPostseasonLeagues = summaries.filter((s) => NO_POSTSEASON_LEAGUE_IDS.includes(s.id));
  const sds = sectionPlayoffs();

  // "This week in the postseason", one strip per region (components/playoffs/this-week.ts; the labels and the
  // events are built in this-week-inputs.ts, which the home page shares): the window is the snapshot's day
  // (getToday, never Date.now) minus two to plus seven.
  const today = getToday();
  const games = getGames();
  // The league intros' tail, dated on the snapshot's day against the seeding meeting (whole sentences as single
  // text nodes, so the built HTML carries them verbatim).
  const seedingDay = keyDates.seedingMeeting.slice(0, 10);
  const ladderNote =
    today < seedingDay
      ? `Ordered by league points; nothing here is official until ${shortDate(keyDates.seedingMeeting)}.`
      : `Ordered by league points. CCS seeded the field on ${shortDate(keyDates.seedingMeeting)}; results update twice a day.`;
  const week = thisWeekByRegion({ games, today });

  return (
    <div className="pb-section-lg">
      {/* 1. The neutral header: every league's postseason, from config. */}
      <PageHeader title={PAGE_TITLE} description={`Where each league’s season leads: ${postseasonWords()}.`} />

      {/* 2. The region control, its own row under the header (DESIGN-socal §2.4). */}
      <RegionSwitcher className="mt-4" />

      {/* 3. Jump links (shown pre-paint only for the remembered league) and the league chips. */}
      {/* A tournament league's pill leads to its own page; every other league's card is below. */}
      <LeagueJumpLinks
        leagues={summaries}
        hrefs={hrefs}
        arrow={(id) => (tournamentIds.has(id) ? 'right' : 'down')}
      />
      <LeagueSwitcher mode="anchor" label="Leagues" leagues={chips} hrefs={hrefs} className="mt-4" />

      <div id="norcal" data-region-scope="norcal">
        {/* The CCS intro and the not-seeded state (the page header's description and field line before
            the Southern California amendment). */}
        <section aria-labelledby="ccs-playoffs" className="mt-section md:mt-section-lg">
          <SectionHeader id="ccs-playoffs" kicker="CCS playoffs" meta={fieldMeta} />
          <p className="m-0 max-w-prose text-body text-ink-2">
            Central Coast Section championships, {shortDate(keyDates.quarterfinals)} to{' '}
            {shortDate(keyDates.finals)}. This page tracks each CCS league&rsquo;s share of the field
            and, once CCS seeds it, the bracket itself.
            {/* Before seeding, this ONE sentence replaces the accent-ruled "Not seeded yet" card
                that used to sit under the title and pushed everything below it most of a phone
                screen down. There is still no skeleton bracket: a greyed-out one would read as
                real data. */}
            {seeded ? null : (
              <>
                {' '}
                <span className="text-ink">Not seeded yet:</span> CCS sets the bracket at its
                seeding meeting on{' '}
                <time dateTime={keyDates.seedingMeeting.slice(0, 10)}>
                  {shortDate(keyDates.seedingMeeting)}
                </time>
                ; the games appear here as MaxPreps lists them, after the next update.
              </>
            )}
          </p>
        </section>

        {/* 1b. This week in NorCal's postseason: games and dated events, two days back to a week ahead. */}
        <ThisWeek id="this-week-norcal" view={week.norcal} className="mt-section md:mt-section-lg" />

        {/* 2. The NCS pointer card: always present, one per league tournament. */}
        {tournamentLeagues.map((league) => {
          const ps = getLeague(league.id).postseason;
          const name = ps.kind === 'league-tournament' ? ps.name : `${league.shortName} postseason`;
          return (
            <div key={league.id} className="mt-4 sx-inset max-w-3xl text-body text-ink-2">
              {/* Whole sentences as single text nodes, so the built HTML carries them verbatim. */}
              <p className="m-0">
                {`Following ${article(league.shortName)} ${league.shortName} team? The ${league.section.name} holds no field hockey championship. `}
                <Link href={`/playoffs/${league.id}`} prefetch={false} className="sx-action text-accent hover:underline">
                  {name} <Arrow />
                </Link>
              </p>
            </div>
          );
        })}

        {/* 2b. One card per unbracketed league (EAL): the rule, its dates and its source, never a
            bracket or a seed. Its id is the EAL chip's and jump link's target. The link words are
            today's, byte for byte (tests/ui/eal-views.test.ts): the EAL's rules document is the
            Northern Section's Guidelines, which `SectionConfig.rulesSource.name` names with its years. */}
        {unbracketedLeagues.map((league) => {
          const ps = getLeague(league.id).postseason;
          if (ps.kind !== 'unbracketed-tournament') return null;
          const results = buildUnbracketedResults(league.id, games);
          return (
            <div key={league.id} id={league.id} className="mt-4 sx-inset max-w-3xl text-body text-ink-2">
              <p className="m-0">
                {`Following ${article(league.shortName)} ${league.shortName} team? ${ps.note}`}
              </p>
              {/* How to watch: the listing's streams and the listing itself (config `streams`, `site.url`). */}
              {ps.streams.length > 0 || ps.site ? (
                <p className="mb-0 flex flex-wrap gap-x-4 gap-y-1 text-meta">
                  {ps.streams.map((s) => (
                    <ExternalLink key={s.href} href={s.href} className="sx-action gap-1">
                      {`Stream: ${s.label}`}
                    </ExternalLink>
                  ))}
                  {ps.site ? (
                    <ExternalLink href={ps.site.url} className="sx-action gap-1">
                      {`${league.section.shortName === 'NS' ? 'CIFNS' : league.section.shortName} field hockey on the NFHS Network`}
                    </ExternalLink>
                  ) : null}
                </p>
              ) : null}
              {/* What happened: the Super Regional's games by day as MaxPreps lists them, each day headed by the round
                  its rows name (lib/postseason-rounds.ts); from its first day, one sentence while none is listed. */}
              {results.empty === null || today >= ps.dates.first ? (
                <UnbracketedResults view={results} idPrefix={league.id} className="mt-3" />
              ) : null}
              <p className="mb-0 text-meta">
                {`${ps.citations.qualification}.`}{' '}
                <ExternalLink href={ps.sourceUrl}>{`${league.section.name} Field Hockey Guidelines (PDF)`}</ExternalLink>
              </p>
            </div>
          );
        })}

        {/* 4. The field: numbers only, ink only (no league hue). Each label names its unit, "berths"
            (not "places", which on this page means league-table places). It keeps the "holds <n> of 16"
            shape that scripts/assert-copy.ts and the copy-honesty test match, so a meter that ever
            reached an MCAL page would still be caught. */}
        <section id="field" className="mt-section md:mt-section-lg">
          <SectionHeader kicker="The field" meta={`${field.total} teams`} />
          <div className="sx-card flex flex-col gap-6 p-5">
            {field.byLeague.map((l) => (
              <BerthMeter
                key={l.leagueId}
                claimed={l.auto}
                total={field.total}
                label={`${l.shortName} holds ${l.auto} of ${field.total} berths`}
              />
            ))}
          </div>
          <p className="mt-3 mb-0 max-w-prose text-meta text-ink-2">
            {`${field.atLarge} at-large berths, chosen by the CCS committee`}
          </p>
        </section>

        {/* 5. Key dates. */}
        {/* The section rule spans the column like its siblings; only the list is capped. */}
        <section id="key-dates" className="mt-section md:mt-section-lg">
          <span id="dates" className="block" />
          <SectionHeader kicker="Key dates" meta="all times PT" />
          <KeyDates
            keyDates={keyDates}
            leagueDates={leagueDates}
            confirmed={areKeyDatesConfirmed()}
            className="max-w-3xl"
          />
        </section>

        {/* 6. One section per CCS league, config order. */}
        {blocks.map((block) => {
          const { summary, config, divisions, meterNote, pairings, pairingDate } = block;
          const citation = config.postseason.kind === 'ccs-ladder' ? config.postseason.citation : '';
          const qualification = `How ${summary.shortName} qualifies — ${citation}.`;
          return (
            <section key={summary.id} id={summary.id} className="mt-section md:mt-section-lg" aria-labelledby={`${summary.id}-heading`}>
              <SectionHeader kicker={`${summary.shortName} — ${summary.name}`} id={`${summary.id}-heading`} />
              <p className="m-0 max-w-prose text-meta text-ink-2">
                {`${summary.shortName} holds ${field.byLeague.find((l) => l.leagueId === summary.id)?.auto ?? 0} of the ${field.total} CCS berths. ${ladderNote}`}
              </p>
              <LeagueHealthNote leagueId={summary.id} className="mt-stack" />
              {/* Side by side from md, not lg: at 768 each half is ~350px, which holds the tile, the
                  longest short name and the status column without truncating, so the tables no
                  longer stack into a long phone-style scroll on a tablet. `items-start` keeps the
                  shorter division from stretching to the longer one's height. */}
              <div className="mt-stack space-y-section md:grid md:grid-cols-2 md:items-start md:gap-6 md:space-y-0 lg:gap-8">
                {divisions.map((d) => (
                  <PlayoffProjection
                    key={d.id}
                    id={d.anchor}
                    heading={d.heading}
                    meterNote={meterNote}
                    projection={d.projection}
                    asOfLabel={d.asOf}
                    standingsHref={`/standings/${summary.id}#${d.id}`}
                  />
                ))}
              </div>
              {pairings.length > 0 ? (
                <div className="mt-section">
                  <SectionHeader
                    as="h3"
                    kicker={pairings.some((p) => !p.isPlayIn) ? 'Crossover and play-in' : 'Play-in'}
                    meta={pairingDate ? shortDate(pairingDate) : undefined}
                  />
                  <LeaguePairings pairings={pairings} />
                  {/* An unsettled card already says it moves with the table; say it once. */}
                  {pairings.some((p) => p.unsettled) ? null : (
                    <p className="mt-4 mb-0 max-w-prose text-meta text-ink-2">
                      Pairings follow the current league tables, so they move with every result.
                    </p>
                  )}
                </div>
              ) : null}
              <ProjectionKey
                className="mt-stack"
                qualification={qualification}
                showLine={divisions.some((d) => d.projection.lineAfter > 0)}
                rulesHref={`/about#rules-${summary.id}`}
              />
            </section>
          );
        })}

        {/* 7. The bracket, once a game or a seed exists for it (bracket-model.ts; the header comment says why
            not `bracketPublished`). One path per CCS division when it is proven, each under its own h3. */}
        <section id="bracket" className="mt-section md:mt-section-lg">
          <SectionHeader
            kicker="Bracket"
            meta={seeded ? `seeded ${shortDate(keyDates.seedingMeeting)}` : undefined}
            action={seeded ? { href: '/schedule', label: 'All games' } : undefined}
          />
          {seeded ? (
            <>
              <div className="space-y-stack">
                {paths.map((path) => (
                  <div key={path.id}>
                    {paths.length > 1 ? <h3 className="m-0 mb-3 text-lead text-ink">{path.name}</h3> : null}
                    <PlayoffBracket path={path} headingLevel={paths.length > 1 ? 'h4' : 'h3'} />
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-col gap-2 text-meta text-ink-2">
                {pending.length > 0 ? (
                  <p className="m-0">
                    {`${listWords(pending.map((r) => `${r.name} (${r.dateLabel})`))} ${pending.length === 1 ? 'has' : 'have'} no games posted yet. Pairings appear here as CCS posts them.`}
                  </p>
                ) : null}
                {postedUnseen.map((name) => (
                  <p key={name} className="m-0">{`CCS has posted CCS ${name}; its games appear here after the next update.`}</p>
                ))}
                <p className="m-0">
                  {/* How CCS numbers the two divisions (config CCS.ccsDivisions: each 1-8, the second the committee's
                      9-16) once every path's division is proven; else the honest grouping sentence of 2026-10-06. */}
                  {divisionsKnown && overall
                    ? `CCS numbers each division’s eight teams 1-8; CCS ${overall.name} holds the committee’s overall seeds ${overall.seeds[0]}-${overall.seeds[1]}. `
                    : `The CCS field is two eight-team divisions, ${listWords(ccsDivisionLabels(playoffs))}. Our data does not say which division a game belongs to, so the games above are grouped by round and, where the bracket splits into independent paths, by path. `}
                  <ExternalLink href={bracketUrl}>Official CCS bracket</ExternalLink>
                </p>
              </div>
            </>
          ) : (
            <>
              <p className="m-0 max-w-prose text-body text-ink-2">
                {`CCS seeds ${listWords(ccsDivisionLabels(playoffs))} at the ${shortDate(keyDates.seedingMeeting)} meeting; the games appear here as MaxPreps lists them, after the next update. `}
                <ExternalLink href={bracketUrl}>Official CCS bracket</ExternalLink>
                {/* "not yet posted" only while the MaxPreps tournament page still says so (playoffs.bracketPublished). */}
                {bracketPublished ? null : <> &mdash; not yet posted.</>}
              </p>
              {postedUnseen.map((name) => (
                <p key={name} className="mt-2 mb-0 max-w-prose text-body text-ink-2">{`CCS has posted CCS ${name}; its games appear here after the next update.`}</p>
              ))}
            </>
          )}
        </section>

        {/* 8. The at-large paragraph (verbatim). */}
        <section id="at-large" className="mt-section md:mt-section-lg">
          <SectionHeader kicker="At-large berths" />
          <p className="m-0 max-w-prose text-body text-ink-2">{AT_LARGE_PARAGRAPH}</p>
        </section>
      </div>

      <div id="socal" data-region-scope="socal">
        {/* This week in SoCal's postseason, ahead of the San Diego block (the same strip as NorCal's). */}
        <ThisWeek id="this-week-socal" view={week.socal} className="mt-section md:mt-section-lg" />
        {sds ? <SectionPlayoffsBlock {...sds} /> : null}
        {/* The section's outside tournament is listed under the first of its no-postseason cards (the Sunset's). */}
        {noPostseasonLeagues.map((league, i) => (
          <NoPostseasonCard
            key={league.id}
            summary={league}
            hostsOutsideTournament={noPostseasonLeagues.findIndex((l) => sectionOf(l.id).id === sectionOf(league.id).id) === i}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The San Diego Section's playoffs (DESIGN-socal §2.4): the Section's rule from config, where its
 * dates come from, its power rankings and when its brackets come, then one card per conference. No
 * seed and no projection: the Section places teams from its power rankings, and the one place a
 * league table decides (a designated champion's play-in) is the league's to designate. The Section's
 * own brackets, once transcribed (lib/sds-bracket.ts getSdsBrackets, null on the placeholder), are drawn
 * between the round dates and the cards (plan final-08, 2026-10-30).
 */
function SectionPlayoffsBlock({
  ps,
  seeding,
  leagues,
}: {
  ps: Extract<LeagueConfig['postseason'], { kind: 'section-playoffs' }>;
  seeding: string | null;
  leagues: LeagueSummary[];
}) {
  const brackets = getSdsBrackets();
  const bracketSource = getSdsBracketsSource();
  const drawn = brackets !== null && bracketSource !== null;
  return (
    <section aria-labelledby="sds-playoffs" className="mt-section md:mt-section-lg">
      <SectionHeader
        id="sds-playoffs"
        kicker={ps.name}
        meta={`${dateSpan(ps.dates.first, ps.dates.last)} · ${ps.divisions.map((d) => `${d.name} ${d.teams}`).join(', ')}`}
      />
      <div className="max-w-prose text-body text-ink-2">
        <p className="m-0">{ps.qualificationLine}</p>
        {/* Date-aware (getToday, never Date.now): the "until then" of Oct 29 would read as if the Section had not
            published from Nov 1 on. The brackets' own link appears once the owner pastes the sheet's URL. */}
        <p className="mb-0">
          {sectionBracketSentence(ps, seeding, getToday(), drawn)}{' '}
          {ps.citations.roundDates}
        </p>
        <p className="mb-0 flex flex-wrap gap-x-4 gap-y-1 text-meta">
          {ps.bracketSheetUrl ? (
            <ExternalLink href={ps.bracketSheetUrl} className="sx-action gap-1">
              Official CIF-SDS brackets (Google Sheet)
            </ExternalLink>
          ) : null}
          <ExternalLink href={ps.bracketsPageUrl} className="sx-action gap-1">
            CIF-SDS field hockey page (brackets are posted here)
          </ExternalLink>
          <ExternalLink href={ps.calendarUrl} className="sx-action gap-1">
            SDFHOA playoff calendar
          </ExternalLink>
          <ExternalLink href={ps.sourceUrl} className="sx-action gap-1">
            {ps.sourceLabel}
          </ExternalLink>
          <ExternalLink href={ps.powerRankingsUrl} className="sx-action gap-1">
            CIF-SDS power rankings
          </ExternalLink>
        </p>
      </div>
      {/* The Section's round calendar (config `rounds`, the officials' association's), the SoCal counterpart of
          the CCS key dates: a fan reads "Quarterfinals, Division II · Fri Nov 6" and the finals' times and site
          here instead of in the docs. */}
      <section id="sds-round-dates" className="mt-section">
        <SectionHeader as="h3" kicker="Round dates" meta="all times PT" />
        <DateList rows={sectionRoundRows(ps)} className="max-w-3xl" />
      </section>
      {/* The Section's published brackets with MaxPreps' results, once the owner has transcribed its sheet; nothing on
          the placeholder file. */}
      {drawn ? <SdsBracket divisions={brackets} source={bracketSource} today={getToday()} className="mt-section" /> : null}
      {leagues.map((league) => (
        <SectionPlayoffsLeagueCard key={league.id} summary={league} />
      ))}
      {/* Said once for the three cards (it was repeated in each until 2026-10-29): where the divisions come from,
          and that a league, not its table, names the champion the Green Book guarantees a play-in. */}
      <p className="mt-4 mb-0 max-w-prose text-meta text-ink-3">
        {'Each team’s playoff division is from the Section’s 2026 Divisions sheet; the Open Division’s eight are drawn from Division I at the end of the regular season. A designated league champion (not co-champions) is guaranteed at least a play-in game, and each league names its champion, not its table.'}
      </p>
    </section>
  );
}

/**
 * Team names as `listWords` words them ("A, B and C"), each one a link to its team page, as the
 * same teams are in the NorCal leagues' rows on this page (PlayoffProjection) and the standings
 * tables. A name with no slug prints as text.
 */
function TeamNames({ teams, conj }: { teams: ReadonlyArray<{ name: string; slug?: string }>; conj: 'and' | '&' }) {
  return teams.map((team, i) => (
    <Fragment key={team.slug ?? team.name}>
      {i === 0 ? null : i === teams.length - 1 ? ` ${conj} ` : ', '}
      {team.slug ? (
        <Link href={`/teams/${team.slug}`} prefetch={false} className="text-inherit hover:underline">
          {team.name}
        </Link>
      ) : (
        team.name
      )}
    </Fragment>
  ));
}

/**
 * One San Diego conference's card (`id=<league>`, the target of its chip and jump link): per division,
 * the table's leaders as things stand, and each team's playoff division from the Section's 2026 Divisions
 * sheet. Open Division teams are drawn from Division I at the end of the regular season, so the card
 * names Division I and Division II only, and never an Open place.
 */
function SectionPlayoffsLeagueCard({ summary }: { summary: LeagueSummary }) {
  const ps = getLeague(summary.id).postseason;
  if (ps.kind !== 'section-playoffs') return null;
  return (
    <div id={summary.id} className="sx-card mt-6 p-5 md:p-6">
      <h3 className="m-0 text-lead text-ink">{`${summary.shortName} — ${summary.name}`}</h3>
      <div className="mt-2 grid gap-5 md:grid-cols-2">
        {summary.divisions.map((d) => {
          const leaders = leaderLine(d.id, d.heading);
          const teams = getTeams(d.id);
          const byDivision = (which: 'I' | 'II') =>
            teams
              .filter((t) => ps.playoffDivisionOf[t.slug] === which)
              .map((t) => ({ name: t.shortName, slug: t.slug }));
          return (
            <div key={d.id} className="min-w-0">
              {d.heading ? <h4 className="m-0 text-body font-semibold text-ink">{d.heading}</h4> : null}
              <p className="mt-1 mb-0 text-meta text-ink-2">
                {leaders.teams.length > 0 ? (
                  <>
                    <TeamNames teams={leaders.teams} conj="&" />
                    {` ${leaders.teams.length === 1 ? 'leads' : 'lead'} the table, ${leaders.teams[0].pts} pts.`}
                  </>
                ) : (
                  'No league results yet.'
                )}{' '}
                <Link href={`/standings/${summary.id}#${d.id}`} prefetch={false} className="text-accent hover:underline">
                  Table <Arrow />
                </Link>
              </p>
              <dl className="mt-2 mb-0 text-meta">
                {(['I', 'II'] as const).map((which) =>
                  byDivision(which).length > 0 ? (
                    <div key={which} className="mt-1 flex flex-wrap gap-x-2">
                      <dt className="font-semibold text-ink">{`Division ${which}:`}</dt>
                      <dd className="m-0 text-ink-2">
                        <TeamNames teams={byDivision(which)} conj="and" />
                      </dd>
                    </div>
                  ) : null,
                )}
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A league with no postseason (the Sunset, `id=<league>`): the config's note and its source, nothing to
 * project. The LA independents' card (`#independents`) is headed by the group's name and
 * opens with the group's own note (schools in no league, whose table is their games against each other),
 * then the Section's.
 *
 * The section's outside tournament (the Tournament of Champions, DESIGN §24.13), when it has one, is listed
 * ONCE, under the section's first no-postseason card (the Sunset's, `#toc`): its note, its games by round and
 * its sources. The other card (the LA independents') points to it in one sentence, since three of the eight
 * entrants are independents. No seed and no bracket, on either card.
 */
function NoPostseasonCard({ summary, hostsOutsideTournament }: { summary: LeagueSummary; hostsOutsideTournament: boolean }) {
  const league = getLeague(summary.id);
  const ps = league.postseason;
  if (ps.kind !== 'no-postseason') return null;
  const independent = isIndependentLeague(summary.id);
  const groupNote = independent && league.divisions[0]?.official.mode === 'none' ? league.divisions[0].official.note : null;
  const event = sectionOf(summary.id).outsideTournament;
  const tournament = event && hostsOutsideTournament ? buildOutsideTournamentView(event, getGames()) : null;
  return (
    <section id={summary.id} aria-labelledby={`${summary.id}-heading`} className="mt-section md:mt-section-lg">
      <SectionHeader
        id={`${summary.id}-heading`}
        kicker={independent ? summary.name : `${summary.shortName} — ${summary.name}`}
      />
      <div className="sx-inset max-w-3xl text-body text-ink-2">
        {groupNote ? <p className="m-0 mb-2">{groupNote}</p> : null}
        <p className="m-0">{ps.note}</p>
        <p className="mb-0 text-meta">
          {`${ps.citations.noPlayoffs}.`}{' '}
          <ExternalLink href={ps.sourceUrl}>{ps.sourceLabel}</ExternalLink>
        </p>
        {event && !hostsOutsideTournament ? (
          <p className="mb-0 text-meta">
            {`Three of the five play the ${event.name} (${dateSpan(event.window.first, event.window.last)}), which the ${event.organizer} runs, not CIF. `}
            <Link href={`#${event.id}`} prefetch={false} className="sx-action text-accent hover:underline">
              {event.name} <Arrow />
            </Link>
          </p>
        ) : null}
      </div>
      {tournament && event ? (
        <OutsideTournament id={event.id} view={tournament} className="mt-6 sx-card p-5 md:p-6" />
      ) : null}
    </section>
  );
}
