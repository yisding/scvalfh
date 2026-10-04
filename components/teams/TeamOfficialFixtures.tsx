import { monthDay } from '../../lib/format';
import { getDivision, leagueOfDivision } from '../../lib/leagues';
import type { DivisionId, OfficialFixture, TeamSlug } from '../../lib/types';
import ExternalLink from '../ui/ExternalLink';
import TeamMonogram from '../ui/TeamMonogram';
import { fixtureOpponent } from './team-view';

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
 *
 * The status is date-aware. Every row used to say "Not reported", including fixtures still weeks
 * away, which read as if a game had been played and lost track of. A fixture before `today`
 * (getToday(), never the clock) says "No result"; one on or after it says "Upcoming".
 */
export interface TeamOfficialFixturesProps {
  fixtures: OfficialFixture[];
  slug: TeamSlug;
  division: DivisionId;
  /** `getToday()` — splits "No result" from "Upcoming". */
  today: string;
}

export function TeamOfficialFixtures({
  fixtures,
  slug,
  division,
  today,
}: TeamOfficialFixturesProps) {
  // A division whose league publishes no schedule (`official.mode` 'none') has no fixtures to list.
  const official = getDivision(division).official;
  if (fixtures.length === 0 || official.mode === 'none') return null;
  const scheduleUrl = official.scheduleUrl;
  const short = leagueOfDivision(division).shortName;

  return (
    <>
      <div className="sx-card sx-flush sx-bleed">
        <ul className="sx-list">
          {fixtures.map((fixture) => {
            const { mineIsHome, versus, opponent, opponentName } = fixtureOpponent(fixture, { slug });
            const past = fixture.dateKey < today;
            return (
              <li
                key={`${fixture.dateKey}-${fixture.awayName}-${fixture.homeName}`}
                className="flex min-h-row-1 items-center gap-3 px-gutter py-2 text-meta"
              >
                <span className="sr-only">
                  {mineIsHome ? 'Home' : 'Away'} against{' '}
                  {opponent ? opponent.name : opponentName} on {monthDay(fixture.dateKey)}:{' '}
                  {`on ${short}’s schedule only, ${past ? 'no result' : 'not played yet'}.`}
                </span>
                <span className="sx-num w-14 shrink-0 text-cell text-ink-2" aria-hidden="true">
                  {monthDay(fixture.dateKey)}
                </span>
                {opponent ? <TeamMonogram team={opponent} size={24} /> : null}
                {/* Two lines rather than an ellipsis: at 320px the name had ~90px and "vs
                    Homestead" was cut. No `break-words`: a school name breaks between words.
                    Below 360px the two-word status stacks (`w-min` on it) so a short name like
                    "vs Homestead" keeps one line instead of leaving "vs" alone on the first. */}
                <span className="line-clamp-2 min-w-0 flex-1 text-body text-ink" aria-hidden="true">
                  <span className="text-ink-2">{versus} </span>
                  {opponentName}
                </span>
                <span
                  className="text-right text-micro font-semibold uppercase tracking-[0.04em] text-ink-3 max-[359px]:w-min"
                  aria-hidden="true"
                >
                  {past ? 'No result' : 'Upcoming'}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="mt-3 mb-0 max-w-prose text-meta text-ink-3">
        {short}&rsquo;s official schedule lists these games, but no source has published a result
        we count for them, so there is no start time or score for them and they count in no record
        here.{' '}
        <ExternalLink href={scheduleUrl}>Official {short} schedule</ExternalLink>
      </p>
    </>
  );
}

export default TeamOfficialFixtures;
