import type { Metadata } from 'next';
import Link from 'next/link';

import CrossoverPairings from '@/components/playoffs/CrossoverPairings';
import KeyDates from '@/components/playoffs/KeyDates';
import PlayoffBracket from '@/components/playoffs/PlayoffBracket';
import PlayoffProjection, { ProjectionKey } from '@/components/playoffs/PlayoffProjection';
import { buildBrackets, pendingRounds } from '@/components/playoffs/bracket-model';
import {
  buildDivisionProjection,
  joinNames,
  type CrossoverRow,
  type CrossoverSide,
  type DivisionProjection,
  type ProjectionRow,
} from '@/components/playoffs/playoff-view';
import BerthMeter from '@/components/ui/BerthMeter';
import ExternalLink from '@/components/ui/ExternalLink';
import PageHeader from '@/components/layout/PageHeader';
import SectionHeader from '@/components/ui/SectionHeader';
import { OG_BASE, ROOT_OG_IMAGE } from '@/components/layout/site-url';
import {
  areKeyDatesConfirmed,
  getLastLeagueResultDate,
  getPlayoffProjection,
  getPlayoffs,
  getStandingFor,
  getTeamById,
} from '@/lib/data';
import { monthDay, shortDate } from '@/lib/format';
import { DIVISIONS, DIVISION_LABELS, leagueStandingsUrl } from '@/lib/season';
import type { CrossoverSeat, Division, PlayoffProjection as Projection } from '@/lib/types';

/**
 * /playoffs — "Are we in, and who do we play?" (DESIGN §3.8, §8; BYLAWS-ADDENDUM Article VII).
 *
 * TWO MODES, and only one of them is live before the Nov 2 seeding meeting:
 *
 *  1. **Not seeded** (today). The question the page is opened for is answered first: the
 *     per-division projection, with every status written out and a 2px rule after the last
 *     automatic berth, then who goes to CCS for at-large consideration. The reference material
 *     follows (the berth math, how the tournament works, the CCS key dates) and then the Oct 30
 *     crossover pairings. "Not seeded yet" is one sentence in the page description, not a callout
 *     card above the projection, and the 3 + 3 + play-in rule is stated once in the page body
 *     ("How it works"; the projection's disclosure repeats it for a reader who opens only that).
 *     There is deliberately **NO skeleton bracket**: a greyed-out tree reads as real data
 *     (DESIGN §3.8).
 *  2. **Seeded** — `playoffs.bracketPublished` with games in the snapshot. The real bracket, phone
 *     as stacked rounds and desktop as a CSS-grid tree, plus whichever rounds have no games yet as
 *     one honest sentence rather than empty boxes.
 *
 * Everything on the page is derived from the snapshot: "today" is `snapshot.fetchedAt` in Pacific,
 * never `Date.now()`, so the build is reproducible and the "as of" label is true.
 */

const PAGE_TITLE = 'CCS playoffs';

function projectionRows(projection: Projection, division: Division): ProjectionRow[] {
  return projection.byDivision[division].flatMap((row) => {
    const team = getTeamById(row.teamId);
    const standing = getStandingFor(row.teamId);
    if (!team || !standing) return [];
    return [
      {
        team,
        standing,
        status: row.status,
        statuses: row.statuses,
        label: row.label,
        shared: row.shared,
      },
    ];
  });
}

function crossoverRows(projection: Projection): CrossoverRow[] {
  const resolve = (seat: CrossoverSeat): CrossoverSide => ({
    contenders: seat.flatMap((ref) => {
      const team = getTeamById(ref.teamId);
      const standing = getStandingFor(ref.teamId);
      return team && standing ? [{ team, standing }] : [];
    }),
  });
  return projection.crossover.pairings.map((pairing) => {
    const deAnza = resolve(pairing.deAnza);
    const elCamino = resolve(pairing.elCamino);
    return {
      seed: pairing.seed,
      isPlayIn: pairing.isPlayIn,
      deAnza,
      elCamino,
      // More than one contender means Article VI §7's coin flip still stands between them, so the
      // pairing itself is not settled. An empty seat is a different thing and renders as TBD.
      unsettled: deAnza.contenders.length > 1 || elCamino.contenders.length > 1,
    };
  });
}

/**
 * The at-large candidates the current table would produce, named per division.
 *
 * One clause per source of a candidate, joined with semicolons: a division can have two level
 * fifth places (Article VI §7), and only ONE team per division plays in, so "whichever of A, B and
 * C loses" would be false the moment a fourth place is shared.
 */
function atLargeSentence(divisions: DivisionProjection[]): string {
  const clauses: string[] = [];
  for (const d of divisions) {
    if (d.atLargeRows.length === 0) continue;
    clauses.push(
      `${d.divisionLabel} 5th${d.atLargeRows.length > 1 ? ' (level)' : ''} — ${joinNames(
        d.atLargeRows.map((r) => r.team.name),
      )}`,
    );
  }
  for (const d of divisions) {
    if (d.playInRows.length === 0) continue;
    clauses.push(
      `${d.divisionLabel}'s play-in loser — ${d.playInRows
        .map((r) => r.team.name)
        .join(' or ')}`,
    );
  }
  if (clauses.length === 0) {
    return 'No SCVAL team is in at-large position on the current table.';
  }
  return `On the current table: ${clauses.join('; ')}.`;
}

/**
 * "through Sep 29" / "so far", from the last day a LEAGUE RESULT was reported.
 *
 * Never `getToday()`: the snapshot's own Pacific day says nothing about whether anything was played
 * on it. On the live snapshot all three Sep 30 contests were still `scheduled` while this page said
 * the projection ran "through Sep 30" — a day whose league table had not moved at all.
 */
function asOfPhrase(lastResult: string | null): string {
  return lastResult ? `through ${monthDay(lastResult)}` : 'so far';
}

export async function generateMetadata(): Promise<Metadata> {
  const playoffs = getPlayoffs();
  const { keyDates, bracketPublished, format } = playoffs;
  const seeded = bracketPublished && playoffs.games.length > 0;
  const description = seeded
    ? `The CCS field hockey bracket: quarterfinals ${shortDate(
        keyDates.quarterfinals,
      )}, semifinals ${shortDate(keyDates.semifinals)}, final ${shortDate(
        keyDates.finals,
      )}. Unofficial, computed from published results.`
    : `SCVAL holds ${format.autoQualifiers.scval} of the ${format.autoQualifiers.total} CCS berths: the first three in each division, plus the winner of the ${shortDate(keyDates.crossover)} play-in. Seeding meeting ${shortDate(
        keyDates.seedingMeeting,
      )}; quarterfinals ${shortDate(keyDates.quarterfinals)}, final ${shortDate(
        keyDates.finals,
      )}. Projected qualifiers from league results ${asOfPhrase(
        getLastLeagueResultDate(),
      )} — unofficial.`;
  return {
    title: PAGE_TITLE,
    description,
    alternates: { canonical: '/playoffs' },
    openGraph: {
      ...OG_BASE,
      ...ROOT_OG_IMAGE,
      title: `${PAGE_TITLE} — SCVAL Field Hockey`,
      description,
      url: '/playoffs',
    },
  };
}

export default function PlayoffsPage() {
  const playoffs = getPlayoffs();
  const projection = getPlayoffProjection();
  // Per division, for each table's own header and caption: the two divisions are not always
  // current through the same day.
  const asOfBy = Object.fromEntries(
    DIVISIONS.map((d) => [d, getLastLeagueResultDate(d)]),
  ) as Record<Division, string | null>;
  const { keyDates, format, bracketUrl, bracketPublished } = playoffs;
  const auto = format.autoQualifiers;

  const paths = buildBrackets(playoffs);
  const seeded = bracketPublished && paths.length > 0;
  const pending = seeded ? pendingRounds(playoffs, paths) : [];

  const divisions = DIVISIONS.map((division) =>
    buildDivisionProjection(
      division,
      DIVISION_LABELS[division],
      projectionRows(projection, division),
    ),
  );
  const crossover = crossoverRows(projection);

  return (
    <div className="pb-section-lg">
      <PageHeader
        title={PAGE_TITLE}
        description={
          <>
            Central Coast Section championships, {shortDate(keyDates.quarterfinals)} to{' '}
            {shortDate(keyDates.finals)}. This page tracks SCVAL&rsquo;s share of the field and,
            once CCS seeds it, the bracket itself.
            {/* Before seeding, this ONE sentence replaces the accent-ruled "Not seeded yet" card
                that used to sit between the title and the projection and pushed the projection,
                which is what the page is opened for, most of a phone screen down. */}
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
      />

      {seeded ? (
        <section id="bracket" className="mt-8 md:mt-10">
          <SectionHeader
            kicker="Bracket"
            meta={`seeded ${shortDate(keyDates.seedingMeeting)}`}
            action={{ href: '/schedule', label: 'All games' }}
          />
          <div className="space-y-stack">
            {paths.map((path) => (
              <div key={path.id}>
                {paths.length > 1 ? (
                  <h3 className="m-0 mb-3 text-lead text-ink">
                    {path.name}
                  </h3>
                ) : null}
                <PlayoffBracket path={path} headingLevel={paths.length > 1 ? 'h4' : 'h3'} />
              </div>
            ))}
          </div>
          {/* `flex-col gap-2`, not `space-y-2`: the children carry `m-0`, which outranks v4's
              zero-specificity space-y rule and would collapse the gap to nothing. */}
          <div className="mt-4 flex flex-col gap-2 text-meta text-ink-2">
            {pending.length > 0 ? (
              <p className="m-0">
                {joinNames(pending.map((r) => `${r.name} (${r.dateLabel})`))}{' '}
                {pending.length === 1 ? 'has' : 'have'} no games in the snapshot yet. Pairings
                appear here as CCS posts them.
              </p>
            ) : null}
            <p className="m-0">
              The CCS field is two eight-team divisions (Article VII §1). The snapshot does not
              label which division a game belongs to, so the games above are grouped by round and,
              where the bracket splits into independent paths, by path.{' '}
              <ExternalLink href={bracketUrl}>Official CCS bracket</ExternalLink>
            </p>
          </div>
        </section>
      ) : null}

      {/* Not seeded, the projection is the first block under the title (`mt-8 md:mt-10`, the
          PageHeader rule) and at-large follows it: "are we in?" is answered before the reference
          material below. Seeded, both are gone and the bracket above is the first block. */}
      {seeded ? null : (
        <section id="projection" className="mt-8 md:mt-10">
          <SectionHeader
            kicker="Projection · not official"
          />
          <p className="m-0 max-w-prose text-meta text-ink-2">
            Where each team would finish if the league season ended today, ordered by league
            points.
          </p>
          {/* Side by side from md, not lg: at 768 each half is ~350px, which holds the tile, the
              longest short name and the status column without truncating, so the two tables no
              longer stack into a long phone-style scroll on a tablet. `items-start` keeps the
              shorter division from stretching to the longer one's height. */}
          <div className="mt-stack space-y-section md:grid md:grid-cols-2 md:items-start md:gap-6 md:space-y-0 lg:gap-8">
            {divisions.map((division) => (
              <PlayoffProjection
                key={division.division}
                id={division.division}
                projection={division}
                asOfLabel={asOfPhrase(asOfBy[division.division])}
                standingsHref={`/standings#${division.division}`}
              />
            ))}
          </div>
          <ProjectionKey
            className="mt-stack"
            playIn={shortDate(keyDates.crossover)}
            showRule={divisions.some((d) => d.berthRuleAfter > 0)}
          />
          <p className="mt-4 mb-0 max-w-prose text-meta text-ink-2">
            Berths are assigned by the CCS committee. Nothing here is official until{' '}
            {shortDate(keyDates.seedingMeeting)}.{' '}
            <Link href="/about#standings" className="sx-action text-accent hover:underline">
              How these places are computed
            </Link>
          </p>
        </section>
      )}

      {seeded ? null : (
        <section id="at-large" className="mt-section md:mt-section-lg">
          <SectionHeader kicker="At-large consideration" />
          <div className="sx-prose">
            <p>
              {auto.atLarge} of the {auto.total} berths are at-large, and SCVAL does not award them
              — the CCS committee does. SCVAL submits the team that loses the{' '}
              {shortDate(keyDates.crossover)} play-in and{' '}
              <span className="text-ink">both fifth-place teams</span> for consideration (Article
              VII §2).
            </p>
            <p>{atLargeSentence(divisions)}</p>
            <p className="text-meta text-ink-2">
              An at-large submission is not a berth. CCS weighs every league&rsquo;s candidates
              together at the {shortDate(keyDates.seedingMeeting)} meeting.
            </p>
          </div>
        </section>
      )}

      <div className="mt-section md:mt-section-lg lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-x-10">
      <section id="berths" className="lg:col-start-1 lg:row-start-1">
        <SectionHeader kicker="SCVAL's share of the field" />
        {/* The meter carries the number and one plain sentence. The 3 + 3 + play-in rule that
            used to sit under it is said once, in "How it works" directly below. */}
        <div className="sx-card p-5">
          <BerthMeter
            claimed={auto.scval}
            total={auto.total}
            label={`SCVAL teams get ${auto.scval} of the ${auto.total} CCS berths automatically.`}
          />
        </div>
      </section>

            <section id="format" className="mt-section md:mt-section-lg lg:col-start-1 lg:row-start-2">
        <SectionHeader kicker="How it works" />
        <div className="sx-prose">
          <p>
            Single elimination, two divisions of eight teams — {auto.total} berths in all. The higher
            seed hosts through the semifinals; CCS sets the site for the finals.
          </p>
          <p>
            SCVAL receives {auto.scval} of them. The{' '}
            <span className="text-ink">first three teams in each division</span> qualify
            automatically, and the two{' '}
            <span className="text-ink">fourth-place teams meet in a play-in</span> on{' '}
            {shortDate(keyDates.crossover)} whose winner takes the seventh. That is By-Laws Article
            VII §2, and division places are the order of league points (3 for a win, 1 for a tie)
            under Article VI §2.
          </p>
          <p>
            The rest of the field is BVAL {auto.bval}, PCAL {auto.pcal}, and {auto.atLarge} at-large
            berths filled by the CCS seeding committee from the candidates leagues submit.
          </p>
          <p className="text-meta text-ink-2">
            {bracketPublished ? (
              <ExternalLink href={bracketUrl}>Official CCS bracket</ExternalLink>
            ) : (
              <>
                <ExternalLink href={bracketUrl}>Official CCS bracket</ExternalLink> — not yet posted.
              </>
            )}
          </p>
        </div>
      </section>

      <section id="dates" className="mt-section md:mt-section-lg lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:mt-0">
        <SectionHeader kicker="Key dates" meta="all times PT" />
        <KeyDates keyDates={keyDates} confirmed={areKeyDatesConfirmed()} />
      </section>
      </div>

      <section id="crossover" className="mt-section md:mt-section-lg max-w-3xl lg:max-w-none">
        <SectionHeader
          kicker="Crossover and play-in"
          meta={shortDate(keyDates.crossover)}
          action={{ href: '/standings', label: 'Standings' }}
        />
        <CrossoverPairings
          date={keyDates.crossover}
          dateLabel={shortDate(keyDates.crossover)}
          rows={crossover}
        />
        <p className="mt-4 mb-0 max-w-prose text-meta text-ink-2">
          Pairings follow the current league tables, so they move with every result.{' '}
          <Link href="/standings" className="text-accent hover:underline">
            See both tables
          </Link>{' '}
          for the points behind them, and{' '}
          <ExternalLink href={leagueStandingsUrl('de-anza')}>MaxPreps</ExternalLink> for the
          source&rsquo;s own table.
        </p>
      </section>
    </div>
  );
}
