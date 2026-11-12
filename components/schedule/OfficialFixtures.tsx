import { shortDate } from '../../lib/format';
import { divisionHeading, getLeague } from '../../lib/leagues';
import { getTeamBySlug } from '../../lib/teams';
import type { LeagueId, OfficialFixture } from '../../lib/types';
import ExternalLink from '../ui/ExternalLink';
import { plural } from '../words/plural';
import { officialScheduleLabel } from '../standings/standings-view';

/**
 * Fixtures a league's official schedule publishes and no source has a contest for
 * (`snapshot.officialFixtures`, SPEC §7.8): `Scheduled by <SHORT>, not reported`.
 *
 * Rendered as data, never hard-coded, one block per league; the sentence says exactly what is true:
 * the league scheduled it, no result was published (MaxPreps has no contest, and si.com's score —
 * if it has one — did not meet the site's backfill rule), and we do not invent a result for it.
 * Each row names its division through `divisionHeading()` (nothing for PCAL and MCAL), and the
 * league's official schedule(s) are linked from config, labelled by source (PDF / Google Doc),
 * because these rows are the league's claim, not ours. A league that publishes no schedule (EAL,
 * `official.mode: 'none'`) has no fixtures, so it renders nothing.
 *
 * Each row's status is "No result" once its day has passed and "Upcoming" before — never "not
 * reported", which on a future day page claimed a game that had not been played yet was missing a
 * score. The sr-only line says whose schedule it is on, in the same words as the team page's list
 * (TeamOfficialFixtures).
 */
export interface OfficialFixturesProps {
  fixtures: readonly OfficialFixture[];
  /** The league whose fixtures these are (its schedule links and short name). */
  leagueId: LeagueId;
  /** 'YYYY-MM-DD', the snapshot's day: a fixture before it is "No result", on or after "Upcoming". */
  today: string;
  /** 'details' collapses the list behind a summary; 'plain' always shows it. */
  variant?: 'details' | 'plain';
  /**
   * Replaces the note above the list with a lead-in sentence (a future day page's "Also on
   * <SHORT>’s schedule for this day, but not listed by any source:"). Since the lead already says
   * that, only the rest of the note follows the list: no result here, and the schedule links.
   */
  lead?: React.ReactNode;
  /** false drops the date column, for a list that is all one day (a /scores/[date] page). */
  showDate?: boolean;
  className?: string;
}

function name(slug: string | null, fallback: string): string {
  const team = slug ? getTeamBySlug(slug) : undefined;
  return team ? team.name : fallback;
}

/**
 * The league's official schedule documents, deduped by URL, labelled by division where there are
 * several. A division with no document (`official.mode: 'none'`, the EAL) has none to link.
 */
function scheduleLinks(leagueId: LeagueId): Array<{ href: string; label: string }> {
  const league = getLeague(leagueId);
  const seen = new Map<string, { href: string; label: string }>();
  for (const d of league.divisions) {
    if (d.official.mode === 'none') continue;
    const href = d.official.scheduleUrl;
    if (seen.has(href)) continue;
    const kind = officialScheduleLabel(d.official.source);
    const heading = divisionHeading(d.id);
    seen.set(href, { href, label: heading ? `${heading} ${kind.replace('Official schedule ', '')}` : kind });
  }
  return [...seen.values()];
}

function FixtureRows({
  fixtures,
  today,
  showDate,
  short,
}: {
  fixtures: readonly OfficialFixture[];
  today: string;
  showDate: boolean;
  /** The league's short name, for the sr-only "On <SHORT>’s schedule only". */
  short: string;
}) {
  return (
    <ol className="sx-list">
      {fixtures.map((fixture) => {
        const past = fixture.dateKey < today;
        const heading = divisionHeading(fixture.division);
        return (
          // Two fixed tracks, as a game row's: a lead (the date, then the status under it) and the
          // matchup (its division a line under it), so the status never hops between lines.
          <li
            key={`${fixture.dateKey}-${fixture.awayName}-${fixture.homeName}`}
            className="grid min-h-row-1 grid-cols-[5.25rem_minmax(0,1fr)] items-center gap-x-3 px-2 py-2"
          >
            <span className="flex flex-col">
              {showDate ? (
                <time dateTime={fixture.dateKey} className="text-cell text-ink">
                  {shortDate(fixture.dateKey)}
                </time>
              ) : null}
              {/* The status reads as a label, never a score slot. Visible as one word; the
                  sr-only line says whose schedule it is on, the same words as the team page. */}
              <span
                className="whitespace-nowrap text-micro font-semibold text-ink-2"
                aria-hidden="true"
              >
                {past ? 'No result' : 'Upcoming'}
              </span>
            </span>
            {/* The division is a line of its own under the matchup: beside it, it decided where
                the row wrapped; flush right it was ~800px from it on a 1280 row. */}
            <span className="min-w-0">
              <span className="block text-body text-ink">
                {name(fixture.awaySlug, fixture.awayName)} at{' '}
                {name(fixture.homeSlug, fixture.homeName)}
              </span>
              {heading ? <span className="block text-cell text-ink-2">{heading}</span> : null}
            </span>
            <span className="sr-only">
              {`On ${short}’s schedule only, ${past ? 'no result' : 'not played yet'}`}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function OfficialFixtures({
  fixtures,
  leagueId,
  today,
  variant = 'details',
  lead,
  showDate = true,
  className,
}: OfficialFixturesProps) {
  const links = scheduleLinks(leagueId);
  // A league with no schedule document (EAL) has no fixtures (the snapshot check rejects any), so
  // there is nothing to say here.
  if (fixtures.length === 0 || links.length === 0) return null;
  const short = getLeague(leagueId).shortName;
  // Where the league publishes these rows: ends both the note and, after a lead, its follow-up.
  const schedules = (
    <>
      {links.map((link, i) => (
        <span key={link.href}>
          {i > 0 ? ', ' : null}
          <ExternalLink href={link.href} className="sx-link">
            {link.label}
            <span className="sr-only"> ({short})</span>
          </ExternalLink>
        </span>
      ))}
      .
    </>
  );
  // What these rows are and where the league publishes them.
  const note = (
    <>
      Scheduled per {short}; no result has been published for these, so they carry no result at
      all here. {schedules}
    </>
  );
  // After a lead, which has already said "on <SHORT>’s schedule, not listed by any source", only
  // the rest of the note, in the number the list has.
  const followUp = (
    <>
      So {fixtures.length === 1 ? 'it carries' : 'they carry'} no result at all here. {schedules}
    </>
  );
  const rows = <FixtureRows fixtures={fixtures} today={today} showDate={showDate} short={short} />;

  if (variant === 'plain') {
    return (
      <div className={className}>
        {lead ? <p className="sx-note mb-2">{lead}</p> : null}
        {rows}
        <p className="sx-note">{lead ? followUp : note}</p>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Always visible, above the list: what these rows are and where the league publishes them. */}
      <p className="sx-note mb-2">{note}</p>
      {/* Optional data: the list opens on request. */}
      <details className="sx-disclosure">
        <summary>
          {`${plural(fixtures.length, `official ${short} fixture`, `official ${short} fixtures`)} with no published result`}
        </summary>
        {rows}
      </details>
    </div>
  );
}

export default OfficialFixtures;
