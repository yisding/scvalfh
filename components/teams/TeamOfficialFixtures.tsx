import { monthDay } from '../../lib/format';
import { SOURCE_LINKS } from '../../lib/season';
import { getTeamBySlug } from '../../lib/teams';
import type { Division, OfficialFixture, TeamSlug } from '../../lib/types';
import ExternalLink from '../ui/ExternalLink';
import TeamMonogram from '../ui/TeamMonogram';

/**
 * Fixtures that exist in the official SCVAL schedule grid and in NO data source (SPEC §1.3).
 *
 * This is how the site tells the truth about a hole instead of hiding it. The two
 * Homestead–Cupertino legs MaxPreps has never published live here — and the list is rendered from
 * the data, never hard-coded.
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
  division: Division;
  /** `getToday()` — splits "No result" from "Upcoming". */
  today: string;
}

export function TeamOfficialFixtures({
  fixtures,
  slug,
  division,
  today,
}: TeamOfficialFixturesProps) {
  if (fixtures.length === 0) return null;
  const scheduleUrl =
    division === 'de-anza'
      ? SOURCE_LINKS.scvalDeAnzaSchedule
      : SOURCE_LINKS.scvalElCaminoSchedule;

  return (
    <>
      <div className="sx-card sx-flush sx-bleed">
        <ul className="sx-list">
          {fixtures.map((fixture) => {
            const mineIsHome = fixture.homeSlug === slug;
            const opponentSlug = mineIsHome ? fixture.awaySlug : fixture.homeSlug;
            const opponentName = mineIsHome ? fixture.awayName : fixture.homeName;
            const opponent = opponentSlug ? getTeamBySlug(opponentSlug) : undefined;
            const past = fixture.dateKey < today;
            return (
              <li
                key={`${fixture.dateKey}-${fixture.awayName}-${fixture.homeName}`}
                className="flex min-h-row-1 items-center gap-3 px-gutter py-2 text-meta"
              >
                <span className="sr-only">
                  {mineIsHome ? 'Home' : 'Away'} against{' '}
                  {opponent ? opponent.name : opponentName} on {monthDay(fixture.dateKey)}: on
                  SCVAL&rsquo;s schedule only, {past ? 'no result' : 'not played yet'}.
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
                  <span className="text-ink-2">{mineIsHome ? 'vs' : 'at'} </span>
                  {opponent ? opponent.shortName : opponentName}
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
        SCVAL&rsquo;s official schedule lists these games, but none of our sources (MaxPreps,
        SBLive/SI) do, so there is no start time or score for them and they count in no record
        here.{' '}
        <ExternalLink href={scheduleUrl}>Official schedule (PDF)</ExternalLink>
      </p>
    </>
  );
}

export default TeamOfficialFixtures;
