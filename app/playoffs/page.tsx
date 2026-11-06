import type { Metadata } from 'next';
import Link from 'next/link';

import LeagueJumpLinks from '../../components/layout/LeagueJumpLinks';
import LeagueSwitcher, { RegionSwitcher } from '../../components/prefs/LeagueSwitcher';
import PageHeader from '../../components/layout/PageHeader';
import { leagueChips } from '../../components/layout/league-chips';
import { OG_BASE, ROOT_OG_IMAGE } from '../../components/layout/site';
import KeyDates from '../../components/playoffs/KeyDates';
import LeagueTournament from '../../components/playoffs/LeagueTournament';
import LeaguePairings from '../../components/playoffs/LeaguePairings';
import NoPostseasonCard from '../../components/playoffs/NoPostseasonCard';
import OutsideTournament from '../../components/playoffs/OutsideTournament';
import PlayoffBracket from '../../components/playoffs/PlayoffBracket';
import PostseasonBoard from '../../components/playoffs/PostseasonBoard';
import { buildBoard, type BoardLeagueInput } from '../../components/playoffs/board-view';
import PlayoffProjection, { ProjectionKey } from '../../components/playoffs/PlayoffProjection';
import SectionPlayoffs from '../../components/playoffs/SectionPlayoffs';
import ThisWeek from '../../components/playoffs/ThisWeek';
import UnbracketedResults from '../../components/playoffs/UnbracketedResults';
import { buildBrackets, ccsDivisionLabels, pendingRounds } from '../../components/playoffs/bracket-model';
import { buildOutsideTournamentView, type LeagueKeyDate } from '../../components/playoffs/playoff-view';
import {
  AT_LARGE_PARAGRAPH,
  asOfPhrase,
  leagueBlock,
  leagueGamesAhead,
  leagueKeyDate,
  postseasonWords,
} from '../../components/playoffs/playoffs-page-view';
import { sectionPlayoffs, thisWeekByRegion } from '../../components/playoffs/this-week-inputs';
import { titleSentence, tournamentLeague, tournamentView } from '../../components/playoffs/tournament-league';
import { buildUnbracketedResults, unbracketedChampion } from '../../components/playoffs/unbracketed-view';
import Arrow from '../../components/ui/Arrow';
import ExternalLink from '../../components/ui/ExternalLink';
import LeagueHealthNote from '../../components/ui/LeagueHealthNote';
import SectionHeader from '../../components/ui/SectionHeader';
import {
  areKeyDatesConfirmed,
  getCcsField,
  getGames,
  getLastLeagueResultDate,
  getLeagueTournament,
  getLeagueSummaries,
  getPlayoffs,
  getToday,
  getTournamentLeagueIds,
} from '../../lib/data';
import type { LeagueSummary } from '../../lib/data';
import { getCcsSeeds } from '../../lib/postseason/ccs-bracket';
import { tournamentHeadline } from '../../lib/postseason/postseason';
import { listWords, plural, shortDate } from '../../lib/format';
import {
  NO_POSTSEASON_LEAGUE_IDS,
  UNBRACKETED_LEAGUE_IDS,
  getLeague,
  isIndependentLeague,
  sectionOf,
} from '../../lib/leagues';
import type { LeagueId } from '../../lib/types';
import { CCS, ccsWindowStart } from '../../lib/league-config/sections';
import { SPORT } from '../../lib/sports/current';

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
 * Tournament of Champions (`#toc`), the postseason the Sunset and the LA independents share, as a section of its
 * own: its note, then the Sunset's card (`#sunset`) and the LA independents' card (`#independents`, DESIGN §24.9)
 * side by side, each naming it as the league's postseason and which of its teams play in it, then its games
 * (`#toc-games`) under both. No SoCal sentence
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
 * `playoffs.games` or a division in the owner seed file (lib/postseason/ccs-bracket.ts getCcsSeeds) — never
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

export async function generateMetadata(): Promise<Metadata> {
  const playoffs = getPlayoffs();
  const { keyDates } = playoffs;
  const field = getCcsField();
  // The same test the page uses: a path to draw, from the bracket games or the seed file (never the page flag alone).
  const seeded = buildBrackets(playoffs, getCcsSeeds()).length > 0;
  const shares = field.byLeague.map((l) => `${l.shortName} ${l.auto}`).join(', ');
  // Rounds the config does not date (soccer: the CCS bylaws are unread) read as one span from the first CCS games.
  const rounds =
    keyDates.quarterfinals !== null && keyDates.semifinals !== null
      ? { bracket: `quarterfinals ${shortDate(keyDates.quarterfinals)}, semifinals ${shortDate(keyDates.semifinals)}, final ${shortDate(keyDates.finals)}`,
          field: `quarterfinals ${shortDate(keyDates.quarterfinals)}, final ${shortDate(keyDates.finals)}` }
      : { bracket: `${shortDate(ccsWindowStart(keyDates))} to ${shortDate(keyDates.finals)}`,
          field: `CCS games ${shortDate(ccsWindowStart(keyDates))} to ${shortDate(keyDates.finals)}` };
  const fieldWords =
    field.total === null
      ? `The CCS ${SPORT.noun} field’s automatic berths: ${shares}.`
      : `The ${field.total}-team CCS field: ${shares}, ${field.atLarge} at-large.`;
  const description = seeded
    ? `The CCS ${SPORT.noun} bracket: ${rounds.bracket}. Unofficial, computed from published results.`
    : `${fieldWords} Seeding meeting ${shortDate(keyDates.seedingMeeting)}; ${rounds.field}. Projected from league results ${asOfPhrase(getLastLeagueResultDate())} — unofficial.`;
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
  // Every league has a section on this page (DESIGN §32.2), the league tournament's included: its chip lands there,
  // and the section links on to the tournament's own page.
  const hrefs: Record<string, string> = Object.fromEntries(summaries.map((s) => [s.id, `#${s.id}`]));
  const shareList = field.byLeague.map((l) => `${l.shortName} ${l.auto}`).join(', ');
  // A field the config does not size (soccer: the CCS bylaws are unread) states only the automatic berths.
  const fieldMeta =
    field.total === null
      ? `${ccsSection?.name ?? 'Central Coast Section'} · automatic berths: ${shareList}`
      : `${ccsSection?.name ?? 'Central Coast Section'} · ${field.total} teams · ${shareList}, ${field.atLarge} at-large`;

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
  // The meeting is over: a bracket to draw and its day reached (the seed file alone can draw one on an older snapshot).
  const met = seeded && today >= seedingDay;
  const ladderNote =
    today < seedingDay
      ? `Ordered by league points; nothing here is official until ${shortDate(keyDates.seedingMeeting)}.`
      : `Ordered by league points. CCS seeded the field on ${shortDate(keyDates.seedingMeeting)}; results update twice a day.`;
  // An unbracketed league's result (the EAL's Super Regional), once the game its row calls the final is played.
  const unbracketedResult = (id: LeagueId): string | null => {
    const ps = getLeague(id).postseason;
    return ps.kind === 'unbracketed-tournament' ? unbracketedChampion(ps.name, id, games, sectionOf(id).shootout) : null;
  };
  const week = thisWeekByRegion({ games, today });
  // The board reads the same rows as the strip, uncapped, so a league's next row is never cut by the strip's cap.
  const allWeek = thisWeekByRegion({ games, today, cap: Number.POSITIVE_INFINITY });
  const boardInput = (s: LeagueSummary): BoardLeagueInput => {
    const config = getLeague(s.id);
    const berths = field.byLeague.find((l) => l.leagueId === s.id);
    return {
      leagueId: s.id,
      shortName: s.shortName,
      config,
      berths: berths ? { auto: berths.auto, total: field.total } : undefined,
      champion: tournamentIds.has(s.id) ? tournamentHeadline(getLeagueTournament(s.id), config).champion : unbracketedResult(s.id),
    };
  };
  const rowsOf = (view: typeof allWeek.norcal) => view.days.flatMap((d) => d.rows);
  // In each block's own order: the CCS leagues, the league tournaments, the unbracketed; San Diego, then no playoffs.
  const board = {
    norcal: buildBoard([...ccsLeagues, ...tournamentLeagues, ...unbracketedLeagues].map(boardInput), rowsOf(allWeek.norcal), today),
    socal: buildBoard(
      [...(sds?.leagues ?? []), ...noPostseasonLeagues].map(boardInput),
      rowsOf(allWeek.socal),
      today,
    ),
  };

  return (
    <div className="pb-section-lg">
      {/* 1. The neutral header: every league's postseason, from config. */}
      <PageHeader title={PAGE_TITLE} description={`Where each league’s season leads: ${postseasonWords()}.`} />

      {/* 2. The region control, its own row under the header (DESIGN-socal §2.4). */}
      <RegionSwitcher className="mt-4" />

      {/* 3. Jump links (shown pre-paint only for the remembered league) and the league chips. */}
      <LeagueJumpLinks leagues={summaries} hrefs={hrefs} arrow={() => 'down'} />
      <LeagueSwitcher mode="anchor" label="Leagues" leagues={chips} hrefs={hrefs} className="mt-4" />

      <div id="norcal" data-region-scope="norcal" role="region" aria-label="Northern California">
        {/* 1. Where every league stands (board-view.ts): one row per league, in this block's order. */}
        <PostseasonBoard id="board-norcal" rows={board.norcal} className="mt-section md:mt-section-lg" />

        {/* 2. This week in NorCal's postseason: games and dated events, two days back to a week ahead. */}
        <ThisWeek id="this-week-norcal" view={week.norcal} className="mt-section md:mt-section-lg" />

        {/* 3. The CCS championship: its intro, then the bracket (or the one sentence that stands in for it). */}
        {/* The CCS intro and the not-seeded state (the page header's description and field line before
            the Southern California amendment). */}
        <section aria-labelledby="ccs-playoffs" className="mt-section md:mt-section-lg">
          <SectionHeader id="ccs-playoffs" kicker="CCS playoffs" meta={fieldMeta} />
          <p className="m-0 max-w-prose text-body text-ink-2">
            {met
              ? `Central Coast Section championships, ${shortDate(ccsWindowStart(keyDates))} to ${shortDate(keyDates.finals)}. CCS seeded the field at its ${shortDate(keyDates.seedingMeeting)} meeting; the bracket is right below, and each CCS league’s share of the field after it.`
              : `Central Coast Section championships, ${shortDate(ccsWindowStart(keyDates))} to ${shortDate(keyDates.finals)}. This page tracks each CCS league’s share of the field and, once CCS seeds it, the bracket itself, right below.`}
          </p>
        </section>

        {/* 3. The bracket, right under the CCS intro in every phase (a sentence before seeding), once a game or a seed exists for it (bracket-model.ts; the header comment says why
            not `bracketPublished`). One path per CCS division when it is proven, each under its own h3. */}
        <section id="bracket" className="mt-section md:mt-section-lg">
          <SectionHeader
            kicker="Bracket"
            meta={seeded ? `seeded ${shortDate(keyDates.seedingMeeting)}` : undefined}
            action={seeded ? { href: '/schedule', label: 'All games' } : undefined}
          />
          {seeded ? (
            <>
              {/* With two divisions, a jump to each (2026-11-03): Division 2 starts a phone-screen or two down. */}
              {paths.length > 1 ? (
                <nav aria-label="CCS divisions" className="mb-4 flex flex-wrap gap-2">
                  {paths.map((path) => (
                    <a key={path.id} href={`#${path.id}`} className="sx-pill">
                      {path.name.replace(/^CCS /, '')}
                    </a>
                  ))}
                </nav>
              ) : null}
              <div className="space-y-stack">
                {paths.map((path) => (
                  // The path's id is the anchor a CCS game links to (components/playoffs/bracket-link.ts): the cards are
                  // drawn twice, once per breakpoint, so the one element drawn once is the division's.
                  <div key={path.id} id={path.id} className="sx-target">
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
                  <ExternalLink href={bracketUrl ?? CCS.sources.index}>{bracketUrl ? 'Official CCS bracket' : `CCS ${SPORT.noun} page`}</ExternalLink>
                </p>
              </div>
            </>
          ) : (
            <>
              <p className="m-0 max-w-prose text-body text-ink-2">
                <span className="text-ink">Not seeded yet:</span>{' '}
                {`CCS seeds ${listWords(ccsDivisionLabels(playoffs))} at the ${shortDate(keyDates.seedingMeeting)} meeting; the games appear here as MaxPreps lists them, after the next update. `}
                <ExternalLink href={bracketUrl ?? CCS.sources.index}>{bracketUrl ? 'Official CCS bracket' : `CCS ${SPORT.noun} page`}</ExternalLink>
                {/* "not yet posted" only while the MaxPreps tournament page still says so (playoffs.bracketPublished). */}
                {bracketPublished ? null : <> &mdash; not yet posted.</>}
              </p>
              {postedUnseen.map((name) => (
                <p key={name} className="mt-2 mb-0 max-w-prose text-body text-ink-2">{`CCS has posted CCS ${name}; its games appear here after the next update.`}</p>
              ))}
            </>
          )}
        </section>

        {/* 4. One section per CCS league, config order: intro, the deciding games, the tables, the key. */}
        {blocks.map((block) => {
          const { summary, config, divisions, meterNote, pairings, pairingDate } = block;
          const citation = config.postseason.kind === 'ccs-ladder' ? config.postseason.citation : '';
          const qualification = `How ${summary.shortName} qualifies — ${citation}.`;
          return (
            <section key={summary.id} id={summary.id} className="mt-section md:mt-section-lg" aria-labelledby={`${summary.id}-heading`}>
              <SectionHeader kicker={`${summary.shortName} — ${summary.name}`} id={`${summary.id}-heading`} />
              <p className="m-0 max-w-prose text-meta text-ink-2">
                {field.total === null
                  ? `${summary.shortName} holds ${plural(field.byLeague.find((l) => l.leagueId === summary.id)?.auto ?? 0, 'automatic CCS berth')}. ${ladderNote}`
                  : `${summary.shortName} holds ${field.byLeague.find((l) => l.leagueId === summary.id)?.auto ?? 0} of the ${field.total} CCS berths. ${ladderNote}`}
              </p>
              <LeagueHealthNote leagueId={summary.id} className="mt-stack" />
              {/* The deciding games first (DESIGN §32.3): the crossover and play-in cards, then the tables behind them. */}
              {pairings.length > 0 ? (
                <div id={`${summary.id}-pairings`} className="mt-stack">
                  <SectionHeader
                    as="h3"
                    kicker={pairings.some((p) => !p.isPlayIn) ? 'Crossover and play-in' : 'Play-in'}
                    meta={pairingDate ?? undefined}
                  />
                  <LeaguePairings pairings={pairings} />
                  {/* An unsettled card already says it moves with the table; say it once, and only while league play can still move it. */}
                  {pairings.some((p) => p.unsettled) || !leagueGamesAhead(summary) ? null : (
                    <p className="mt-4 mb-0 max-w-prose text-meta text-ink-2">
                      Pairings follow the current league tables, so they move with every result.
                    </p>
                  )}
                </div>
              ) : null}
              {/* Side by side from md, not lg: at 768 each half is ~350px, which holds the tile, the
                  longest short name and the status column without truncating, so the tables no
                  longer stack into a long phone-style scroll on a tablet. `items-start` keeps the
                  shorter division from stretching to the longer one's height. */}
              <div className="mt-section space-y-section md:grid md:grid-cols-2 md:items-start md:gap-6 md:space-y-0 lg:gap-8">
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
              <ProjectionKey
                className="mt-stack"
                qualification={qualification}
                showLine={divisions.some((d) => d.projection.lineAfter > 0)}
                rulesHref={`/about#rules-${summary.id}`}
              />
            </section>
          );
        })}

        {/* 5. The at-large paragraph (verbatim), under the tables whose statuses it explains. */}
        <section id="at-large" className="mt-section md:mt-section-lg">
          <SectionHeader kicker="At-large berths" />
          <p className="m-0 max-w-prose text-body text-ink-2">{AT_LARGE_PARAGRAPH}</p>
        </section>

        {/* 6. Key dates: the full CCS calendar (this week's are in the strip and the board above). */}
        {/* The section rule spans the column like its siblings; only the list is capped. */}
        <section id="key-dates" className="mt-section md:mt-section-lg">
          <span id="dates" className="block" />
          <SectionHeader kicker="Key dates" meta="all times PT" />
          <KeyDates
            keyDates={keyDates}
            leagueDates={leagueDates}
            confirmed={areKeyDatesConfirmed()}
            seeded={met}
            className="max-w-3xl"
          />
        </section>

        {/* 7. One section per league tournament (MCAL): its result, then the whole tournament (play-in, bracket, seeds)
            drawn here like every other league's postseason (2026-11-03), with the rules on its own page. */}
        {tournamentLeagues.map((league) => {
          const found = tournamentLeague(league.id);
          if (!found) return null;
          const { config, ps } = found;
          const projection = getLeagueTournament(league.id);
          const headline = tournamentHeadline(projection, config);
          const status = headline.champion ?? (headline.next ? `${headline.next}.` : null);
          const playInRound = ps.rounds.find((r) => r.round === 'play-in');
          return (
            <section key={league.id} id={league.id} aria-labelledby={`${league.id}-heading`} className="mt-section md:mt-section-lg">
              <SectionHeader kicker={`${league.shortName} — ${league.name}`} id={`${league.id}-heading`} />
              <div className="max-w-prose text-body text-ink-2">
                {status ? <p className="m-0 text-ink">{status}</p> : null}
                {headline.champion && projection.champion ? <p className="mb-0">{titleSentence(projection, ps)}</p> : null}
                {/* Whole sentences as single text nodes, so the built HTML carries them verbatim. */}
                <p className={status ? 'mb-0' : 'm-0'}>
                  {`The ${league.section.name} holds no field hockey championship, so the ${ps.name} is the ${league.shortName} postseason. `}
                  <Link href={`/playoffs/${league.id}#how-it-works`} prefetch={false} className="sx-action text-accent hover:underline">
                    {`How the ${ps.name} works`} <Arrow />
                  </Link>
                </p>
              </div>
              <LeagueTournament
                view={tournamentView(league, ps, config)}
                leagueShort={league.shortName}
                standingsHref={`/standings/${league.id}`}
                beforeSeeds={<LeagueHealthNote leagueId={league.id} className="mb-4" />}
                playInRule={playInRound ? `${playInRound.pairing}.` : null}
                idPrefix={`${league.id}-`}
                nested
              />
            </section>
          );
        })}

        {/* 8. One section per unbracketed league (EAL): the rule, its dates and its source, never a
            bracket or a seed. Its id is the EAL chip's and jump link's target. The link words are
            today's, byte for byte (tests/ui/eal-views.test.ts): the EAL's rules document is the
            Northern Section's Guidelines, which `SectionConfig.rulesSource.name` names with its years. */}
        {unbracketedLeagues.map((league) => {
          const ps = getLeague(league.id).postseason;
          if (ps.kind !== 'unbracketed-tournament') return null;
          const results = buildUnbracketedResults(league.id, games);
          const champion = unbracketedResult(league.id);
          return (
            <section key={league.id} id={league.id} aria-labelledby={`${league.id}-heading`} className="mt-section md:mt-section-lg">
              <SectionHeader kicker={`${league.shortName} — ${league.name}`} id={`${league.id}-heading`} />
              <div className="max-w-3xl text-body text-ink-2">
              {champion ? <p className="m-0 text-ink">{champion}</p> : null}
              <p className={champion ? 'mb-0' : 'm-0'}>{ps.note}</p>
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
                  its rows name (lib/postseason/postseason-rounds.ts); from its first day, one sentence while none is listed. */}
              {results.empty === null || today >= ps.dates.first ? (
                <UnbracketedResults view={results} idPrefix={league.id} className="mt-3" />
              ) : null}
              <p className="mb-0 text-meta">
                {`${ps.citations.qualification}.`}{' '}
                <ExternalLink href={ps.sourceUrl}>{`${league.section.name} Field Hockey Guidelines (PDF)`}</ExternalLink>
              </p>
            </div>
            </section>
          );
        })}
      </div>

      <div id="socal" data-region-scope="socal" role="region" aria-label="Southern California">
        <PostseasonBoard id="board-socal" rows={board.socal} className="mt-section md:mt-section-lg" />
        {/* This week in SoCal's postseason, ahead of the San Diego block (the same strip as NorCal's). */}
        <ThisWeek id="this-week-socal" view={week.socal} className="mt-section md:mt-section-lg" />
        {sds ? <SectionPlayoffs {...sds} /> : null}
        {/* A section's outside tournament (the Tournament of Champions) is the postseason its no-postseason
            leagues share (the Sunset and the LA independents): one section of its own, with their cards inside it
            side by side and its games under both. A no-postseason league with no such tournament gets its card alone. */}
        {[...new Set(noPostseasonLeagues.map((l) => sectionOf(l.id).id))].map((sectionId) => {
          const leaguesOf = noPostseasonLeagues.filter((l) => sectionOf(l.id).id === sectionId);
          const event = sectionOf(leaguesOf[0].id).outsideTournament;
          if (!event) return leaguesOf.map((league) => <NoPostseasonCard key={league.id} summary={league} />);
          return (
            <OutsideTournament
              key={event.id}
              id={event.id}
              view={buildOutsideTournamentView(event, games)}
              whose={listWords(leaguesOf.map((l) => `the ${isIndependentLeague(l.id) ? l.name : l.shortName}`))}
              className="mt-section md:mt-section-lg"
            >
              {leaguesOf.map((league) => (
                <NoPostseasonCard key={league.id} summary={league} />
              ))}
            </OutsideTournament>
          );
        })}
      </div>
    </div>
  );
}
