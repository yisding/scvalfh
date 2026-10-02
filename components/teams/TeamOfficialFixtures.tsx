import { monthDay } from '../../lib/format';
import { getDivision, leagueOfDivision } from '../../lib/leagues';
import { getTeamBySlug } from '../../lib/teams';
import type { DivisionId, OfficialFixture, TeamSlug } from '../../lib/types';
import ExternalLink from '../ui/ExternalLink';
import TeamMonogram from '../ui/TeamMonogram';

/**
 * Fixtures that exist in the league's official schedule and in NO data source (SPEC §1.3, §7.8).
 *
 * This is how the site tells the truth about a hole instead of hiding it: a fixture MaxPreps never
 * published (and si.com could not fill under owner decision D2) lives here, rendered from the
 * data, never hard-coded. The schedule link and the `scheduled per <SHORT>` copy come from config
 * (lib/leagues.ts), never from a division id in this file.
 *
 * These rows are NOT games: they have no contest, no score slot and no game page, they are
 * excluded from every record, and they are deliberately outside the game log so nothing here can
 * be mistaken for a result (DESIGN §5.2 — a missing score is never a zero).
 */
export interface TeamOfficialFixturesProps {
  fixtures: OfficialFixture[];
  slug: TeamSlug;
  division: DivisionId;
}

export function TeamOfficialFixtures({ fixtures, slug, division }: TeamOfficialFixturesProps) {
  if (fixtures.length === 0) return null;
  const scheduleUrl = getDivision(division).official.scheduleUrl;
  const short = leagueOfDivision(division).shortName;

  return (
    <>
      <div className="sx-card sx-flush sx-bleed">
        <ul className="sx-list">
          {fixtures.map((fixture) => {
            const mineIsHome = fixture.homeSlug === slug;
            const opponentSlug = mineIsHome ? fixture.awaySlug : fixture.homeSlug;
            const opponentName = mineIsHome ? fixture.awayName : fixture.homeName;
            const opponent = opponentSlug ? getTeamBySlug(opponentSlug) : undefined;
            return (
              <li
                key={`${fixture.dateKey}-${fixture.awayName}-${fixture.homeName}`}
                className="flex min-h-row-1 items-center gap-3 px-gutter py-2 text-meta"
              >
                <span className="sr-only">
                  {mineIsHome ? 'Home' : 'Away'} against{' '}
                  {opponent ? opponent.name : opponentName} on {monthDay(fixture.dateKey)}: scheduled
                  per {short}, no result reported.
                </span>
                <span className="sx-num w-14 shrink-0 text-cell text-ink-2" aria-hidden="true">
                  {monthDay(fixture.dateKey)}
                </span>
                {opponent ? <TeamMonogram team={opponent} size={24} /> : null}
                <span className="min-w-0 flex-1 truncate text-body text-ink" aria-hidden="true">
                  <span className="text-ink-2">{mineIsHome ? 'vs' : 'at'} </span>
                  {opponent ? opponent.shortName : opponentName}
                </span>
                <span
                  className="shrink-0 text-micro font-semibold uppercase tracking-[0.04em] text-ink-3"
                  aria-hidden="true"
                >
                  Not reported
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="mt-3 mb-0 max-w-prose text-meta text-ink-3">
        Scheduled per {short}; no result reported by MaxPreps. These fixtures are in the official{' '}
        {short} schedule and in no data source, so they count for nothing in the records above and
        have no score &mdash; not even a zero.{' '}
        <ExternalLink href={scheduleUrl}>Official {short} schedule</ExternalLink>
      </p>
    </>
  );
}

export default TeamOfficialFixtures;
