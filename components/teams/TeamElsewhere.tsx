import Link from 'next/link';

import ExternalLink from '@/components/ui/ExternalLink';
import SectionHeader from '@/components/ui/SectionHeader';
import { ordinal } from '@/lib/format/numbers';
import { DATA_CORRECTIONS_URL } from '@/views/site/site';
import type { TeamLastSeason } from '@/views/teams/team-page';
import type { TeamPageView } from '@/views/teams/team-view';

/**
 * Elsewhere: the sources a reader checks a wrong score or roster entry against, the data-error
 * link, and last season's one line. Under Non-league, or (`logOutweighs`) in the column beside the
 * League log.
 */
export default function TeamElsewhere({
  team,
  history,
  logOutweighs,
}: {
  team: TeamPageView['team'];
  history: TeamLastSeason | null;
  logOutweighs: boolean;
}) {
  const sblive = team.external.sbliveGamesUrl;
  return (
    <section
      className={logOutweighs ? 'min-w-0 md:max-lg:col-span-2' : 'min-w-0 md:col-span-2'}
    >
      <SectionHeader kicker="Elsewhere" />
      {/* Pills (40px), not bare text links: three standalone links stacked at text height
          were 17px tall and 21px apart, which axe reported as a serious WCAG 2.5.8 failure
          on /teams/st-ignatius. A link inside a sentence stays as it is; these are not. They
          sit on the canvas, not in a card, where the grey pill fill barely differs from it
          and the capsules disappeared in light mode, so they take the card's surface and
          ring (surface-2 on hover). */}
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {team.external.maxprepsTeamUrl ? (
          <li>
            <ExternalLink
              href={team.external.maxprepsTeamUrl}
              className="sx-pill sx-pill-ring"
            >
              MaxPreps: {team.name} field hockey
            </ExternalLink>
          </li>
        ) : null}
        {team.external.maxprepsScheduleUrl ? (
          <li>
            <ExternalLink
              href={team.external.maxprepsScheduleUrl}
              className="sx-pill sx-pill-ring"
            >
              MaxPreps schedule &amp; scores
            </ExternalLink>
          </li>
        ) : null}
        {sblive ? (
          <li>
            <ExternalLink
              href={sblive}
              className="sx-pill sx-pill-ring"
            >
              High School on SI (si.com): {team.name}
            </ExternalLink>
          </li>
        ) : null}
        {/* Last, beside the sources a reader checks a wrong score or roster entry against;
            the one accent pill in the row, so it reads as the action rather than a source.
            `text-accent-ink!`: ExternalLink's `text-accent` would otherwise win, and accent
            on the wash is under AA in dark mode (components/layout/Attribution.tsx). */}
        <li>
          <ExternalLink href={DATA_CORRECTIONS_URL} className="sx-pill sx-pill-accent text-accent-ink!">
            Report a data error
          </ExternalLink>
        </li>
      </ul>
      {/* Last season in one line, record exactly as the league's 2025-26 standings
          printed it ("1-13": SCVAL's PDF drops a zero tie count on some rows; BVAL's sheet
          has no tie field for one row). The site-wide disclaimer that sat here is the
          footer's, so it is no longer repeated on every team page. The link text keeps
          "2025-26" on one line rather than breaking at its hyphen. */}
      {history ? (
        <p className="mt-3 mb-0 max-w-prose text-meta text-ink-2">
          Last season ({history.season}): {ordinal(history.place)} of {history.size} in{' '}
          {history.scope}, <span className="whitespace-nowrap">{history.record}.</span>{' '}
          {/* A sentence break, not a dash: a wrapped dash dangled at the end of line 1 at
              phone widths (or opened line 2 when kept with the link). */}
          <Link
            href={`/history/2025-26#${history.division}`}
            prefetch={false}
            className="whitespace-nowrap"
          >
            Full {history.season} standings
          </Link>
        </p>
      ) : null}
    </section>
  );
}
