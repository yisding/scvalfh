import type { Metadata } from 'next';
import Link from 'next/link';

import LeagueJumpLinks from '../../components/layout/LeagueJumpLinks';
import LeagueSwitcher from '../../components/layout/LeagueSwitcher';
import PageHeader from '../../components/layout/PageHeader';
import { leagueChips } from '../../components/layout/league-chips';
import { OG_BASE, ROOT_OG_IMAGE } from '../../components/layout/site';
import KeyDates from '../../components/playoffs/KeyDates';
import LeaguePairings from '../../components/playoffs/LeaguePairings';
import PlayoffBracket from '../../components/playoffs/PlayoffBracket';
import PlayoffProjection, { ProjectionKey } from '../../components/playoffs/PlayoffProjection';
import { buildBrackets, ccsDivisionLabels, pendingRounds } from '../../components/playoffs/bracket-model';
import {
  buildDivisionProjection,
  buildPairingView,
  ladderFactsFor,
  pairingNotesFor,
  type LeagueKeyDate,
  type ProjectionRow,
} from '../../components/playoffs/playoff-view';
import Arrow from '../../components/ui/Arrow';
import BerthMeter from '../../components/ui/BerthMeter';
import ExternalLink from '../../components/ui/ExternalLink';
import LeagueHealthNote from '../../components/ui/LeagueHealthNote';
import SectionHeader from '../../components/ui/SectionHeader';
import {
  areKeyDatesConfirmed,
  getCcsField,
  getLastLeagueResultDate,
  getLeaguePairings,
  getLeagueSummaries,
  getPlayoffProjection,
  getPlayoffs,
  getStandingFor,
  getTeamById,
  getTournamentLeagueIds,
} from '../../lib/data';
import type { LeagueSummary } from '../../lib/data';
import { listWords, monthDay, shortDate } from '../../lib/format';
import { UNBRACKETED_LEAGUE_IDS, getLeague } from '../../lib/leagues';
import type { LeagueConfig } from '../../lib/leagues';
import type { LeagueId, PlayoffProjection as Projection } from '../../lib/types';

/**
 * /playoffs — the CCS page (SPEC §6.3, §10.7): "Are we in, and who do we play?" for the three
 * Central Coast Section leagues. The North Coast Section holds no field hockey championship, so an
 * MCAL reader is pointed to /playoffs/mcal at the top and nothing below is about MCAL. The EAL's
 * postseason, the Northern Section's Super Regional, publishes no bracket, so it has no page of its
 * own: its card here (`id="<league id>"`, the target of the EAL chip and jump link) states the rule,
 * the dates and the Guidelines, and nothing below is about the EAL either.
 *
 * The eight blocks, in order: header (+ the not-seeded state, one sentence in the description),
 * the NCS pointer card and the EAL card, jump links and
 * the league chips, "The field" (one BerthMeter row per CCS league + the at-large line), "Key dates"
 * (CCS dates plus each league's own crossover / play-in, labelled), the `#scval #bval #pcal`
 * sections (per-division ladder projection, the league's pairings, its qualification sentence), the
 * bracket (`#bracket`) once CCS publishes it, and the at-large paragraph.
 *
 * There is no merged 1-16 order: no rule ranks a De Anza team against a Mt. Hamilton team, and the
 * CCS committee seeds by criteria we cannot compute. Everything is derived from the snapshot and
 * config: "today" is `snapshot.fetchedAt` in Pacific, never `Date.now()`.
 */

const PAGE_TITLE = 'CCS playoffs';

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
  const pairings = getLeaguePairings(summary.id).map((p) =>
    buildPairingView(p, resolveSeat, pairingNotesFor(p)),
  );
  return {
    summary,
    config,
    divisions,
    meterNote,
    pairings,
    pairingDate: pairings[0]?.dateKey ?? null,
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const { keyDates, bracketPublished, games } = getPlayoffs();
  const field = getCcsField();
  const seeded = bracketPublished && games.length > 0;
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
  return {
    title: PAGE_TITLE,
    description,
    alternates: { canonical: '/playoffs' },
    openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, title: PAGE_TITLE, description, url: '/playoffs' },
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

  const paths = buildBrackets(playoffs);
  const seeded = bracketPublished && paths.length > 0;
  const pending = seeded ? pendingRounds(playoffs, paths) : [];
  const blocks = ccsLeagues.map(leagueBlock);
  const leagueDates = ccsLeagues
    .map((s) => leagueKeyDate(getLeague(s.id)))
    .filter((d): d is LeagueKeyDate => d !== null);

  const chips = leagueChips();
  const hrefs: Record<string, string> = Object.fromEntries(
    summaries.map((s) => [s.id, tournamentIds.has(s.id) ? `/playoffs/${s.id}` : `#${s.id}`]),
  );
  const fieldMeta = `${ccsSection?.name ?? 'Central Coast Section'} · ${field.total} teams · ${field.byLeague
    .map((l) => `${l.shortName} ${l.auto}`)
    .join(', ')}, ${field.atLarge} at-large`;

  return (
    <div className="pb-section-lg">
      {/* 1. Header and the not-seeded state. */}
      <PageHeader
        title={PAGE_TITLE}
        description={
          <>
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
                , and it appears here that evening.
              </>
            )}
          </>
        }
        meta={<span className="text-meta text-ink-2">{fieldMeta}</span>}
      />

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
          bracket or a seed. Its id is the EAL chip's and jump link's target. */}
      {unbracketedLeagues.map((league) => {
        const ps = getLeague(league.id).postseason;
        if (ps.kind !== 'unbracketed-tournament') return null;
        return (
          <div key={league.id} id={league.id} className="mt-4 sx-inset max-w-3xl text-body text-ink-2">
            <p className="m-0">
              {`Following ${article(league.shortName)} ${league.shortName} team? ${ps.note}`}
            </p>
            <p className="mb-0 text-meta">
              {`${ps.citations.qualification}.`}{' '}
              <ExternalLink href={ps.sourceUrl}>{`${league.section.name} Field Hockey Guidelines (PDF)`}</ExternalLink>
            </p>
          </div>
        );
      })}

      {/* 3. Jump links (shown pre-paint only for the remembered league) and the league chips. */}
      {/* A tournament league's pill leads to its own page; an unbracketed league's card sits
          above these links, so its arrow points up. */}
      <LeagueJumpLinks
        leagues={summaries}
        hrefs={hrefs}
        arrow={(id) => (tournamentIds.has(id) ? 'right' : UNBRACKETED_LEAGUE_IDS.includes(id) ? 'up' : 'down')}
      />
      <LeagueSwitcher mode="anchor" label="Leagues" leagues={chips} hrefs={hrefs} className="mt-4" />

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
      <section id="key-dates" className="mt-section md:mt-section-lg max-w-3xl">
        <span id="dates" className="block" />
        <SectionHeader kicker="Key dates" meta="all times PT" />
        <KeyDates keyDates={keyDates} leagueDates={leagueDates} confirmed={areKeyDatesConfirmed()} />
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
              {summary.shortName} holds {field.byLeague.find((l) => l.leagueId === summary.id)?.auto ?? 0} of the{' '}
              {field.total} CCS berths. Ordered by league points; every status below is a written word, and
              nothing here is official until {shortDate(keyDates.seedingMeeting)}.
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
                <p className="mt-4 mb-0 max-w-prose text-meta text-ink-2">
                  Pairings follow the current league tables, so they move with every result.
                </p>
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

      {/* 7. The bracket, once published. */}
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
                  {listWords(pending.map((r) => `${r.name} (${r.dateLabel})`))}{' '}
                  {pending.length === 1 ? 'has' : 'have'} no games in the snapshot yet. Pairings appear here as
                  CCS posts them.
                </p>
              ) : null}
              <p className="m-0">
                The CCS field is two eight-team divisions, {listWords(ccsDivisionLabels(playoffs))}. The snapshot
                does not label which division a game belongs to, so the games above are grouped by round and, where
                the bracket splits into independent paths, by path.{' '}
                <ExternalLink href={bracketUrl}>Official CCS bracket</ExternalLink>
              </p>
            </div>
          </>
        ) : (
          <p className="m-0 max-w-prose text-body text-ink-2">
            CCS seeds {listWords(ccsDivisionLabels(playoffs))} at the {shortDate(keyDates.seedingMeeting)} meeting;
            the bracket appears here that evening.{' '}
            <ExternalLink href={bracketUrl}>Official CCS bracket</ExternalLink> &mdash; not yet posted.
          </p>
        )}
      </section>

      {/* 8. The at-large paragraph (verbatim). */}
      <section id="at-large" className="mt-section md:mt-section-lg">
        <SectionHeader kicker="At-large berths" />
        <p className="m-0 max-w-prose text-body text-ink-2">{AT_LARGE_PARAGRAPH}</p>
      </section>
    </div>
  );
}
