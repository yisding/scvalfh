import Link from 'next/link';

import { ordinal } from '../../lib/format';
import { leagueOfDivision } from '../../lib/leagues';
import ExternalLink from '../ui/ExternalLink';
import LeagueHealthNote from '../ui/LeagueHealthNote';
import SectionHeader from '../ui/SectionHeader';
import StandingsTable, { biggestGoalDiff, collectStandingsNotes, type StandingsTableProps } from '../ui/StandingsTable';

import MissingResultsBanner from './MissingResultsBanner';
import PlayoffStatusBand from './PlayoffStatusBand';
import StandingsNotes from './StandingsNotes';
import type { DivisionView } from './standings-view';

/**
 * One division's whole section (SPEC §10.3), in this order: the heading (the division heading,
 * or `League table` for a single-division league — never the league's name twice, never a
 * MaxPreps table name), the league's health note, the ONE-line missing-results banner, the table
 * (in its own card), a one-line legend, then the Notes inset and the postseason card — side by
 * side from `lg`. The `id` is the `#<division>` anchor target; `html { scroll-padding-top }`
 * clears the sticky stack.
 *
 * The phone and desktop tables are DIFFERENT DOM (a 68px two-line row versus a wide row), so
 * both render and one is hidden at each breakpoint. That is deliberate rather than a CSS-only
 * reflow: DESIGN §10.8 requires 400% zoom at 320px to reflow with no scrollable data table. The
 * swap is at `lg`.
 *
 * Both tables pass `notes="none"`; their division-specific notes are collected here once and go
 * into the Notes inset, and the generic legend is printed once per page by the page.
 *
 * From `lg` the Notes inset and the postseason card share a row and STRETCH to the taller of the
 * two; each is a flex column whose link row is pushed to the bottom (`mt-auto`), so the two panels
 * end level and their link rows sit on one line. Below `lg` they stack and nothing moves.
 */
export interface DivisionStandingsProps {
  view: DivisionView;
  /** Render the league's health note here (the page's first table only, so it is said once). */
  showHealth?: boolean;
  className?: string;
}

export function DivisionStandings({
  view,
  showHealth = false,
  className,
}: DivisionStandingsProps) {
  const table: Omit<StandingsTableProps, 'variant' | 'className'> = {
    division: view.division,
    rows: view.rows,
    gdDomain: view.gdDomain,
    caption: view.caption,
    footnotes: view.footnotes,
    ...(view.sourceUrl ? { sourceUrl: view.sourceUrl } : {}),
    notes: 'none',
    context: view.context,
    // LEFT and MAX need a fixed number of league games; the Sunset has none (gamesPerTeam null), so its
    // table shows GP as a bare count and neither column (DESIGN-socal §2.1.7).
    columns: view.fixedSchedule ? ['gp', 'left', 'max'] : ['gp'],
    // ⚑ marks a row only in a `full` division (SPEC §5.8): elsewhere MaxPreps differs for a known
    // reason, which the Notes block states instead of an alarm on every row.
    flaggedSlugs: view.comparison.flag ? view.mismatches.map((m) => m.slug) : [],
    ...(view.berthRuleAfter === undefined ? {} : { berthRuleAfter: view.berthRuleAfter }),
  };
  // `footnotes` go last in the Notes block, so they are left out of the table's own list here.
  // A team the comparison list below already names (it prints its items unless MaxPreps agrees)
  // keeps only that sentence: the ⚑ line would repeat it in other words.
  const { specific } = collectStandingsNotes({
    ...table,
    variant: 'phone',
    footnotes: [],
    statedElsewhere: view.comparison.agreement ? [] : view.mismatches.map((m) => m.slug),
  });
  const points = leagueOfDivision(view.division).rules.citations.points;

  return (
    <section id={view.division} aria-labelledby={`${view.division}-heading`} className={className}>
      <SectionHeader id={`${view.division}-heading`} kicker={view.kicker} meta={`${view.meta} · unofficial`} />
      {showHealth ? <LeagueHealthNote leagueId={view.leagueId} className="mb-4" /> : null}
      <MissingResultsBanner text={view.missingBanner} targetId={view.missingId} className="mb-3" />
      <div data-twin className="lg:hidden">
        <StandingsTable {...table} variant="phone" />
      </div>
      <div data-twin className="hidden lg:block">
        <StandingsTable {...table} variant="desktop" />
      </div>
      {/* Plain words: "|GD| max 36" was notation a parent at a game had to decode. */}
      <p className="mt-3 mb-0 text-meta text-ink-3">
        PTS: {points}. GD bars are per division
        {/* The scale is named only when some team has a goal difference (StandingsTable biggestGoalDiff). */}
        {biggestGoalDiff(view.rows.map((r) => r.standing.computed.gd)) > 0 ? (
          <>
            , scaled to {view.label}&rsquo;s biggest goal difference ({view.gdDomain})
          </>
        ) : null}
        {view.berthRuleAfter && view.ladderLineLabel ? (
          <>
            {' '}
            &middot; the heavier line under {ordinal(view.berthRuleAfter)} marks the{' '}
            {view.ladderLineLabel}
          </>
        ) : null}
      </p>
      {view.backfillFootnote ? <p className="mt-1 mb-0 text-meta text-ink-3">{view.backfillFootnote}</p> : null}
      <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:items-stretch">
        <StandingsNotes
          divisionLabel={view.label}
          rows={view.rows}
          tableNotes={specific}
          mismatches={view.mismatches}
          comparison={view.comparison}
          missingId={view.missingId}
          missingIntro={view.missingIntro}
          missing={view.missing}
          postponed={view.postponed}
          footnotes={view.footnotes}
          {...(view.sourceUrl ? { sourceUrl: view.sourceUrl } : {})}
          sourceSkipped={view.sourceSkipped}
          officialSchedule={view.officialSchedule}
          scheduledPer={view.scheduledPer}
          rankRule={view.rankRule}
        />
        {view.noPostseason ? (
          // No postseason (the Sunset, CIF-SS Blue Book 2011.1 and 3500.2): no band, no ladder, and no
          // place leads anywhere, so the card says that, from config, with its source.
          <div className="sx-card flex flex-col p-5 md:p-6 lg:self-start">
            <h3 className="m-0 text-lead text-ink">
              <span className="sr-only">{view.label}: </span>
              {view.statusHeading}
            </h3>
            <p className="mt-2 mb-0 max-w-prose text-meta text-ink-2">{view.noPostseason.note}</p>
            <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-4">
              <ExternalLink href={view.noPostseason.sourceUrl} className="sx-action gap-1 text-meta font-medium">
                {view.noPostseason.sourceLabel}
              </ExternalLink>
              <Link
                href={view.playoffsHref}
                prefetch={false}
                className="sx-action text-meta font-medium text-accent hover:underline"
              >
                {view.playoffsLinkText}
              </Link>
            </div>
          </div>
        ) : (
          <PlayoffStatusBand
            divisionLabel={view.label}
            heading={view.statusHeading}
            intro={view.statusIntro}
            href={view.playoffsHref}
            linkText={view.playoffsLinkText}
            groups={view.statusGroups}
            caveat={view.statusCaveat}
            unrankedTeams={view.unrankedTeams}
            // A band with no ladder line (the unbracketed EAL) has nothing to align to the Notes
            // card's bottom edge, so it keeps its own height rather than stretching to blank space.
            className={[
              'sx-card flex flex-col p-5 md:p-6',
              view.ladderLineLabel === null ? 'lg:self-start' : null,
            ]
              .filter(Boolean)
              .join(' ')}
          />
        )}
      </div>
    </section>
  );
}

export default DivisionStandings;
