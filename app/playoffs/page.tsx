import type { Metadata } from 'next';
import Link from 'next/link';

import { BUILD_INSTANT } from '../../components/layout/build-instant';
import LastUpdated from '../../components/layout/LastUpdated';
import PageHeader from '../../components/layout/PageHeader';
import { leagueChips } from '../../components/layout/league-chips';
import { OG_BASE, ROOT_OG_IMAGE } from '../../components/layout/site';
import KeyDates from '../../components/playoffs/KeyDates';
import LeagueTournament from '../../components/playoffs/LeagueTournament';
import LeaguePairings from '../../components/playoffs/LeaguePairings';
import NoPostseasonCard from '../../components/playoffs/NoPostseasonCard';
import OutsideTournament from '../../components/playoffs/OutsideTournament';
import PlayoffBracket from '../../components/playoffs/PlayoffBracket';
import PlayoffProjection from '../../components/playoffs/PlayoffProjection';
import SectionPlayoffs from '../../components/playoffs/SectionPlayoffs';
import TournamentBracket from '../../components/playoffs/TournamentBracket';
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
import { sectionPlayoffs } from '../../components/playoffs/this-week-inputs';
import { titleSentence, tournamentLeague, tournamentView } from '../../components/playoffs/tournament-league';
import { tournamentBracketView } from '../../components/playoffs/tournament-bracket-view';
import { buildUnbracketedResults, unbracketedChampion } from '../../components/playoffs/unbracketed-view';
import ExternalLink from '../../components/ui/ExternalLink';
import LeagueHealthNote from '../../components/ui/LeagueHealthNote';
import ScopeBar from '../../components/prefs/ScopeBar';
import SectionHeader from '../../components/ui/SectionHeader';
import {
  areKeyDatesConfirmed,
  getCcsField,
  getFetchedAt,
  getGames,
  getLastLeagueResultDate,
  getLeagueTournament,
  getLeagueSummaries,
  getPlayoffs,
  getToday,
  getTournamentLeagueIds,
} from '../../lib/data';
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
import { ordersByRecord } from '../../lib/standings/order';
import type { LeagueId } from '../../lib/types';
import { CCS, ccsFirstDay, ccsLastDay, ccsRoundDays } from '../../lib/league-config/sections';
import { SPORT } from '../../lib/sports/current';

/**
 * /playoffs — "Are we in, and who do we play?" (SPEC §6.3, §10.7; DESIGN-socal §2.4; refresh spec §5.6): every
 * league's postseason under the title "Playoffs" and the league row (`ScopeBar`: a tab per league, each an
 * anchor to its section; the region switch and the short Updated stamp at the row's end), one block per region.
 * The page is BRACKET-FIRST: once a section's bracket exists it is the first thing under the league row.
 *
 * NorCal (`<div id="norcal" data-region-scope>`), in order:
 *  1. The CCS bracket (`#bracket`), one section per division (`#ccs-division-1`, `#ccs-division-2`, the anchors
 *     its games link to: components/playoffs/bracket-link.ts), each drawn by the site's one bracket drawer
 *     (components/playoffs/Bracket.tsx). `seeded` is "the model has a path to draw" — a bracket game in
 *     `playoffs.games` or a division in the owner seed file (lib/postseason/ccs-bracket.ts getCcsSeeds) — never
 *     `bracketPublished` alone, which says only that the MaxPreps page has a division posted. Under the
 *     brackets: a round with no games posted, a division posted that no game or seed has reached, how CCS
 *     numbers the two divisions (or, while unproven, that our data does not say which division a game is in),
 *     and the official bracket's link. Before any path exists, one section (`#bracket`, "CCS playoffs") says in
 *     one line that the field is not seeded yet.
 *  2. One section per CCS league (`#scval #bval #pcal`), headed by the league's short name with its share of
 *     the field beside it: its deciding games (the crossover and the play-in, `#<league>-pairings`) as rows;
 *     and, only UNTIL the seeding meeting has passed (`met`), each division's qualification table under its
 *     strip (`#de-anza` …). After the meeting the bracket is the answer and no projection is drawn.
 *  3. The at-large paragraph (`#at-large`), only while the tables whose statuses it explains are drawn.
 *  4. Key dates (`#key-dates`): the CCS calendar plus each league's own date, a plain list, past dates grey.
 *  5. One section per league tournament (`#mcal`): the whole tournament (bracket with its play-in, seeds) with
 *     prefixed ids (`mcal-bracket`, `mcal-seeds`, `mcal-qf-1`), and a link to its own page for the rules. The
 *     North Coast Section holds no field hockey championship.
 *  6. One section per unbracketed league (`#eal`): the Northern Section's Super Regional publishes no bracket,
 *     so the section is its result in a sentence, its games by day (UnbracketedResults), the rule, the
 *     Guidelines and the streams, word for word as before.
 *
 * SoCal (`<div id="socal" data-region-scope>`): the San Diego Section's own published brackets first
 * (`#sds-bracket`, once the owner has transcribed them into data/sds-brackets-2026.json; nothing on the
 * placeholder), then the Section's rule, sources and round calendar (`#sds-playoffs`, `#sds-round-dates`) and
 * one section per conference (`#city`, `#north-county`, `#metro`: each division's leaders and each team's
 * playoff division), all in components/playoffs/SectionPlayoffs.tsx. No seed is projected: the Section, not a
 * league table, places teams. Then the Tournament of Champions (`#toc`, its games under `#toc-games`), the
 * postseason the Sunset and the LA independents share, as a section of its own, followed by those leagues'
 * sections (`#sunset`, `#independents`). No SoCal sentence says "at-large", "automatic qualifier" or "seed".
 *
 * Not on the page since the refresh: the status board ("Where every league stands") and the "This week" list
 * (their components and view models remain, with their tests), the summary sentence under the title (it is
 * the metadata description's), and the "how to read the projection" disclosure (one link to /about instead).
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
  // A round some divisions play later (soccer) reads as its first to its last day.
  const semis = ccsRoundDays(keyDates, 'semifinals', shortDate);
  const final = ccsRoundDays(keyDates, 'finals', shortDate);
  // The round that opens the bracket where it is not the quarterfinals (basketball's first round).
  const opening = CCS.keyDates.firstRound ? `first round ${shortDate(CCS.keyDates.firstRound)}, ` : '';
  const fieldWords =
    field.total === null
      ? `The CCS ${SPORT.noun} field’s automatic berths: ${shares}.`
      : `The ${field.total}-team CCS field: ${shares}, ${field.atLarge} at-large.`;
  const description = seeded
    ? `The CCS ${SPORT.noun} bracket: ${opening}quarterfinals ${shortDate(keyDates.quarterfinals)}, semifinals ${semis}, final ${final}. Unofficial, computed from published results.`
    : `${fieldWords} Seeding meeting ${shortDate(keyDates.seedingMeeting)}; ${opening}quarterfinals ${shortDate(keyDates.quarterfinals)}, final ${final}. Projected from league results ${asOfPhrase(getLastLeagueResultDate())} — unofficial.`;
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
  // Every league has a section on this page (DESIGN §32.2), the league tournament's included: its tab lands there,
  // and the section links on to the tournament's own page.
  const hrefs: Record<string, string> = Object.fromEntries(summaries.map((s) => [s.id, `#${s.id}`]));

  const noPostseasonLeagues = summaries.filter((s) => NO_POSTSEASON_LEAGUE_IDS.includes(s.id));
  const sds = sectionPlayoffs();

  // The snapshot's day (getToday, never Date.now).
  const today = getToday();
  const games = getGames();
  // The note under the qualification tables, dated on the snapshot's day against the seeding meeting (a whole
  // sentence as one text node, so the built HTML carries it verbatim).
  const seedingDay = keyDates.seedingMeeting.slice(0, 10);
  // The meeting is over: a bracket to draw and its day reached (the seed file alone can draw one on an older snapshot).
  const met = seeded && today >= seedingDay;
  const ORDER_WORDS = ccsLeagues.length > 0 && ccsLeagues.every((l) => ordersByRecord(getLeague(l.id).rules)) ? 'record' : 'points';
  const ladderNote =
    today < seedingDay
      ? `Ordered by league ${ORDER_WORDS}; nothing here is official until ${shortDate(keyDates.seedingMeeting)}.`
      : `Ordered by league ${ORDER_WORDS}. CCS seeded the field on ${shortDate(keyDates.seedingMeeting)}; results update twice a day.`;
  // An unbracketed league's result (the EAL's Super Regional), once the game its row calls the final is played.
  const unbracketedResult = (id: LeagueId): string | null => {
    const ps = getLeague(id).postseason;
    return ps.kind === 'unbracketed-tournament' ? unbracketedChampion(ps.name, id, games, sectionOf(id).shootout) : null;
  };
  const officialBracket = (
    <ExternalLink href={bracketUrl ?? CCS.sources.index} className="sx-action">
      {bracketUrl ? 'Official CCS bracket' : `CCS ${SPORT.noun} page`}
    </ExternalLink>
  );

  return (
    <div className="pb-section-lg">
      {/* 1. The title, then the league row: each tab lands on its league's section; the region switch and the
          short Updated stamp sit at the row's end. */}
      <PageHeader title={PAGE_TITLE} />
      <ScopeBar
        league={{ mode: 'anchor', label: 'Leagues', leagues: chips, hrefs }}
        stamp={<LastUpdated at={getFetchedAt()} now={BUILD_INSTANT} variant="time" />}
      />

      <div id="norcal" data-region-scope="norcal" role="region" aria-label="Northern California">
        {/* 2. Bracket-first (spec §5.6): once a game or a seed exists for it (bracket-model.ts; the header comment
            says why not `bracketPublished`), the CCS bracket is the first thing under the league row, one section
            per division when it is proven. `#bracket` wraps them; a division's own id is the anchor its games
            link to (components/playoffs/bracket-link.ts). Before seeding, one section says so. */}
        {seeded ? (
          <div id="bracket" className="sx-target">
            {/* With two divisions, a jump to each (2026-11-03): Division 2 starts a screen or two down. */}
            {paths.length > 1 ? (
              <nav aria-label="CCS divisions" className="sx-linkrow sx-print-hide">
                {paths.map((path) => (
                  <a key={path.id} href={`#${path.id}`} className="sx-action">
                    {path.name.replace(/^CCS /, '')}
                  </a>
                ))}
              </nav>
            ) : null}
            {paths.map((path, index) => (
              <section
                key={path.id}
                id={path.id}
                aria-labelledby={`${path.id}-heading`}
                data-first={index === 0 ? '' : undefined}
                className="sx-section sx-target min-w-0"
              >
                <SectionHeader id={`${path.id}-heading`} kicker={path.name} />
                <PlayoffBracket path={path} />
              </section>
            ))}
            {pending.length > 0 ? (
              <p className="sx-note">
                {`${listWords(pending.map((r) => `${r.name} (${r.dateLabel})`))} ${pending.length === 1 ? 'has' : 'have'} no games posted yet. Pairings appear here as CCS posts them.`}
              </p>
            ) : null}
            {postedUnseen.map((name) => (
              <p key={name} className="sx-note">{`CCS has posted CCS ${name}; its games appear here after the next update.`}</p>
            ))}
            <p className="sx-note">
              {/* How CCS numbers the two divisions (config CCS.ccsDivisions: each 1-8, the second the committee's
                  9-16) once every path's division is proven; else the honest grouping sentence of 2026-10-06. */}
              {divisionsKnown && overall
                ? `CCS numbers each division’s eight teams 1-8; CCS ${overall.name} holds the committee’s overall seeds ${overall.seeds[0]}-${overall.seeds[1]}.`
                : `The CCS field is two eight-team divisions, ${listWords(ccsDivisionLabels(playoffs))}. Our data does not say which division a game belongs to, so the games above are grouped by round and, where the bracket splits into independent paths, by path.`}
            </p>
            <p className="sx-linkrow">
              {officialBracket}
              <Link href="/schedule" prefetch={false} className="sx-action">
                Scores
              </Link>
            </p>
          </div>
        ) : (
          <section id="bracket" aria-labelledby="ccs-playoffs" data-first="" className="sx-section sx-target">
            <SectionHeader
              id="ccs-playoffs"
              kicker="CCS playoffs"
              meta={`${shortDate(ccsFirstDay(CCS.keyDates))} to ${shortDate(ccsLastDay(keyDates))}`}
            />
            <p className="sx-empty">
              {`Not seeded yet: CCS seeds ${ccsDivisionLabels(playoffs).length > 0 ? listWords(ccsDivisionLabels(playoffs)) : 'the field'} at the ${shortDate(keyDates.seedingMeeting)} meeting; the games appear here as MaxPreps lists them, after the next update.`}
              {/* "not yet posted" only while the MaxPreps tournament page still says so (playoffs.bracketPublished). */}
              {bracketPublished ? null : ' The official bracket is not yet posted.'}
            </p>
            {postedUnseen.map((name) => (
              <p key={name} className="sx-note">{`CCS has posted CCS ${name}; its games appear here after the next update.`}</p>
            ))}
            <p className="sx-linkrow">{officialBracket}</p>
          </section>
        )}

        {/* 3. One section per CCS league, config order: the deciding games (crossover, play-in) as rows; until CCS
            seeds its field, each division's qualification table under its strip. After seeding the bracket is
            the answer and no projection is drawn. */}
        {blocks.map((block) => {
          const { summary, divisions, pairings, pairingDate } = block;
          const auto = field.byLeague.find((l) => l.leagueId === summary.id)?.auto ?? 0;
          return (
            <section key={summary.id} id={summary.id} className="sx-section sx-target" aria-labelledby={`${summary.id}-heading`}>
              <SectionHeader
                kicker={summary.shortName}
                id={`${summary.id}-heading`}
                meta={field.total === null ? plural(auto, 'automatic CCS berth') : `${auto} of ${field.total} CCS berths`}
              />
              <LeagueHealthNote leagueId={summary.id} className="mb-3" />
              {/* The deciding games first (DESIGN §32.3), then the tables behind them. */}
              {pairings.length > 0 ? (
                <div id={`${summary.id}-pairings`} className="sx-target">
                  <SectionHeader
                    strip
                    kicker={pairings.some((p) => !p.isPlayIn) ? 'Crossover and play-in' : 'Play-in'}
                    meta={pairingDate ?? undefined}
                  />
                  <LeaguePairings pairings={pairings} />
                  {/* An unsettled row already says it moves with the standings; say it once, and only while league play can still move it. */}
                  {met || pairings.some((p) => p.unsettled) || !leagueGamesAhead(summary) ? null : (
                    <p className="sx-note">Pairings follow the current league standings, so they move with every result.</p>
                  )}
                </div>
              ) : null}
              {met ? null : (
                <>
                  <div className="sx-two mt-4">
                    {divisions.map((d) => (
                      <PlayoffProjection
                        key={d.id}
                        id={d.anchor}
                        className="min-w-0 pb-4"
                        heading={d.heading}
                        projection={d.projection}
                        asOfLabel={d.asOf}
                        standingsHref={`/standings/${summary.id}#${d.id}`}
                      />
                    ))}
                  </div>
                  <p className="sx-note">{ladderNote}</p>
                </>
              )}
              <p className="sx-linkrow">
                <Link href={`/about#rules-${summary.id}`} prefetch={false} className="sx-action">
                  {`How ${summary.shortName} qualifies`}
                </Link>
              </p>
            </section>
          );
        })}

        {/* 4. The at-large paragraph (verbatim), under the tables whose statuses it explains: only while they are drawn. */}
        {met ? null : (
          <section id="at-large" className="sx-section sx-target">
            <SectionHeader kicker="At-large berths" />
            <p className="m-0 max-w-prose text-body text-ink-2">{AT_LARGE_PARAGRAPH}</p>
          </section>
        )}

        {/* 5. Key dates: the full CCS calendar, a plain list; a date already past is grey. */}
        <section id="key-dates" className="sx-section sx-target">
          <span id="dates" className="block" />
          <SectionHeader kicker="Key dates" />
          <KeyDates keyDates={keyDates} leagueDates={leagueDates} confirmed={areKeyDatesConfirmed()} seeded={met} today={today} />
        </section>

        {/* 6. One section per league tournament (MCAL): the whole tournament (bracket with its play-in, seeds) drawn
            here like every other league's postseason (2026-11-03), with the rules on its own page. */}
        {tournamentLeagues.map((league) => {
          const found = tournamentLeague(league.id);
          if (!found) return null;
          const { config, ps } = found;
          const projection = getLeagueTournament(league.id);
          const headline = tournamentHeadline(projection, config);
          const playInRound = ps.rounds.find((r) => r.round === 'play-in');
          return (
            <section key={league.id} id={league.id} aria-labelledby={`${league.id}-heading`} className="sx-section sx-target">
              <SectionHeader kicker={league.shortName} id={`${league.id}-heading`} meta={ps.name} />
              <LeagueTournament
                view={tournamentView(league, ps, config)}
                leagueShort={league.shortName}
                standingsHref={`/standings/${league.id}`}
                beforeSeeds={<LeagueHealthNote leagueId={league.id} className="mb-3" />}
                playInRule={playInRound ? `${playInRound.pairing}.` : null}
                idPrefix={`${league.id}-`}
                nested
              />
              {/* Whole sentences as single text nodes, so the built HTML carries them verbatim. */}
              {headline.champion && projection.champion ? <p className="sx-note">{titleSentence(projection, ps)}</p> : null}
              <p className="sx-note">
                {`The ${league.section.name} holds no field hockey championship, so the ${ps.name} is the ${league.shortName} postseason.`}
              </p>
              <p className="sx-linkrow">
                <Link href={`/playoffs/${league.id}#how-it-works`} prefetch={false} className="sx-action">
                  {`How the ${ps.name} works`}
                </Link>
              </p>
            </section>
          );
        })}

        {/* 7. One section per unbracketed league (EAL): its result, its games by day, then the rule, its streams
            and its source, never a bracket or a seed. Its id is the EAL tab's target. The link words are
            today's, byte for byte (tests/ui/eal-views.test.ts): the EAL's rules document is the
            Northern Section's Guidelines, which `SectionConfig.rulesSource.name` names with its years. */}
        {unbracketedLeagues.map((league) => {
          const ps = getLeague(league.id).postseason;
          if (ps.kind !== 'unbracketed-tournament') return null;
          const results = buildUnbracketedResults(league.id, games);
          const champion = unbracketedResult(league.id);
          return (
            <section key={league.id} id={league.id} aria-labelledby={`${league.id}-heading`} className="sx-section sx-target">
              <SectionHeader kicker={league.shortName} id={`${league.id}-heading`} meta={ps.name} />
              {champion ? <p className="m-0 mb-3 max-w-prose text-body text-ink">{champion}</p> : null}
              {/* What happened: the Super Regional's games by day as MaxPreps lists them, each day headed by the round
                  its rows name (lib/postseason/postseason-rounds.ts); from its first day, one sentence while none is listed. */}
              {/* With the day's game schedule in config, the event is drawn as a bracket (each card links its game). */}
              {ps.bracket ? (
                <TournamentBracket
                  view={tournamentBracketView(
                    ps.bracket.games,
                    games.filter((g) => g.postseason?.kind === 'league-postseason' && g.postseason.leagueId === league.id),
                    today,
                    sectionOf(league.id).shootout?.words ?? 'a shootout',
                  )}
                  name={ps.name}
                  idPrefix={league.id}
                  source={ps.bracket.source}
                />
              ) : results.empty === null || today >= ps.dates.first ? (
                <UnbracketedResults view={results} idPrefix={league.id} />
              ) : null}
              <p className="sx-note">{ps.note}</p>
              <p className="sx-note">
                {`${ps.citations.qualification}.`}{' '}
                <ExternalLink href={ps.sourceUrl}>{`${league.section.name} Field Hockey Guidelines (PDF)`}</ExternalLink>
              </p>
              {/* How to watch: the listing's streams and the listing itself (config `streams`, `site.url`). */}
              {ps.streams.length > 0 || ps.site ? (
                <p className="sx-linkrow">
                  {ps.streams.map((s) => (
                    <ExternalLink key={s.href} href={s.href} className="sx-action">
                      {`Stream: ${s.label}`}
                    </ExternalLink>
                  ))}
                  {ps.site ? (
                    <ExternalLink href={ps.site.url} className="sx-action">
                      {`${league.section.shortName === 'NS' ? 'CIFNS' : league.section.shortName} field hockey on the NFHS Network`}
                    </ExternalLink>
                  ) : null}
                </p>
              ) : null}
            </section>
          );
        })}
      </div>

      <div id="socal" data-region-scope="socal" role="region" aria-label="Southern California">
        {sds ? <SectionPlayoffs {...sds} /> : null}
        {/* A section's outside tournament (the Tournament of Champions) is the postseason its no-postseason
            leagues share (the Sunset and the LA independents): one section of its own, its games first, then
            each of those leagues' own sections. A no-postseason league with no such tournament gets its section alone. */}
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
