import { shortDate } from '../../lib/format';
import ExternalLink from '../ui/ExternalLink';
import LeagueHealthNote from '../ui/LeagueHealthNote';
import SectionHeader from '../ui/SectionHeader';

import MissingResultsBanner from './MissingResultsBanner';
import StandingsNotes from './StandingsNotes';
import { collectStandingsNotes } from './standings-table/notes';
import StandingsTable from './standings-table/StandingsTable';
import type { StandingsTableProps } from './standings-table/types';
import type { DivisionView } from './standings-view';

/**
 * One division's section on a league's standings (SPEC §10.3; DESIGN §33), in this order: the h2
 * (the division: "De Anza"), the league's health note, the ONE-line missing-results link, the table,
 * the dagger's footnote when a counted score came from si.com, then the division's notes as a plain
 * list and its source links. The `id` is the `#<division>` anchor target; `html { scroll-padding-top }`
 * clears the sticky stack.
 *
 * A single-division league's h2 is visually hidden: the page title ("PCAL standings") is directly
 * above its one table, and a second visible heading could only repeat it.
 *
 * The heading carries ONE fact, and only when it is news: "Through Wed Oct 28" when the table is
 * not current to the league's latest game day (a league game was played with no score yet, or an
 * official result is missing). A table that is up to date says nothing.
 *
 * ONE table (the foundation's responsive one, `data-full`, capped at 47rem): which columns show is
 * the table's own width's business, so there is no phone/desktop twin. It is passed `notes="none"`;
 * its division-specific notes are collected here once and go into the list below it.
 *
 * Qualification is in the table: the labelled green line. A league with no postseason (the Sunset)
 * says so in one line under its table, from config, with its source.
 */
export interface DivisionStandingsProps {
  view: DivisionView;
  /** Render the league's health note here (the first table only, so it is said once). */
  showHealth?: boolean;
  /** The first section of its column: 20px above instead of 40px. */
  first?: boolean;
  className?: string;
}

export function DivisionStandings({ view, showHealth = false, first = false, className }: DivisionStandingsProps) {
  const table: Omit<StandingsTableProps, 'variant' | 'className'> = {
    division: view.division,
    rows: view.rows,
    gdDomain: view.gdDomain,
    caption: view.caption,
    footnotes: view.footnotes,
    ...(view.sourceUrl ? { sourceUrl: view.sourceUrl } : {}),
    notes: 'none',
    context: view.context,
    // GP is drawn only while some team still has league games to play.
    columns: ['gp'],
    // The dagger marks a row only in a `full` division (SPEC §5.8): elsewhere MaxPreps differs for a
    // known reason, which the notes state instead of a mark on every row.
    flaggedSlugs: view.comparison.flag ? view.mismatches.map((m) => m.slug) : [],
    ...(view.berthRuleAfter === undefined ? {} : { berthRuleAfter: view.berthRuleAfter }),
  };
  // `footnotes` go last in the notes, so they are left out of the table's own list here.
  // A team the comparison list below already names (it prints its items unless MaxPreps agrees)
  // keeps only that sentence: the table's mismatch line would repeat it in other words.
  const { specific } = collectStandingsNotes({
    ...table,
    variant: 'desktop',
    footnotes: [],
    statedElsewhere: view.comparison.agreement ? [] : view.mismatches.map((m) => m.slug),
  });
  // Not current to the latest game day: something was played, or was due, that the table lacks.
  const behind = view.throughDate !== null && (view.pendingLeagueGames > 0 || view.missing.length > 0);

  return (
    <section
      id={view.division}
      aria-labelledby={`${view.division}-heading`}
      data-first={first ? '' : undefined}
      className={['sx-section', className].filter(Boolean).join(' ')}
    >
      <SectionHeader
        id={`${view.division}-heading`}
        kicker={view.kicker}
        meta={behind && view.throughDate ? `Through ${shortDate(view.throughDate)}` : undefined}
        className={view.heading === null ? 'sr-only' : undefined}
      />
      {showHealth ? <LeagueHealthNote leagueId={view.leagueId} className="mb-3" /> : null}
      <MissingResultsBanner text={view.missingBanner} targetId={view.missingId} className="mb-2" />
      <StandingsTable {...table} variant="desktop" />
      {view.backfillFootnote ? <p className="sx-note">{view.backfillFootnote}</p> : null}
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
        // No postseason (the Sunset, CIF-SS Blue Book 2011.1 and 3500.2): no line in the table and no
        // place leads anywhere, so one line says that, from config, with its source.
        <p className="sx-note">
          {view.noPostseason.note}{' '}
          <ExternalLink href={view.noPostseason.sourceUrl} className="sx-link">
            {view.noPostseason.sourceLabel}
          </ExternalLink>
        </p>
      ) : null}
    </section>
  );
}

export default DivisionStandings;
