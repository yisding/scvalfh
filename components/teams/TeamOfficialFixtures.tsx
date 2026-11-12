import Link from 'next/link';

import { monthDay } from '../../lib/format';
import { getDivision, leagueOfDivision } from '../../lib/leagues';
import type { DivisionId, OfficialFixture, TeamSlug } from '../../lib/types';
import ExternalLink from '../ui/ExternalLink';
import { GAME_LOG_ROW_GRID } from '../game-row/GameLogRow';
import { NON_MEMBER_NOTE } from '../game-row/summary';
import GhostMonogram from '../ui/GhostMonogram';
import TeamMonogram from '../ui/TeamMonogram';
import { fixtureOpponent } from './team-schedule';

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
 * Drawn on the schedule's own row grid (`.sx-logrow`: date, an empty chip cell, the status where a
 * score would be, the opponent), so the two lists read as one schedule, under a group strip.
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

/**
 * One fixture row. A registry opponent's row is a link to its team page, as each row of the
 * unbeaten list on the same page is (TeamUnbeaten); the row's sr-only sentence is the link's name.
 * A fixture is not a game, so there is no game link for the team link to sit inside. A school
 * outside the registry has no page here, so its row stays plain.
 */
function FixtureRow({ opponentSlug, children }: { opponentSlug: TeamSlug | null; children: React.ReactNode }) {
  return (
    <li>
      {opponentSlug ? (
        <Link href={`/teams/${opponentSlug}`} prefetch={false} className={[GAME_LOG_ROW_GRID, 'sx-tap no-underline'].join(' ')}>
          {children}
        </Link>
      ) : (
        <div className={GAME_LOG_ROW_GRID}>{children}</div>
      )}
    </li>
  );
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
      <ul className="sx-list">
        {fixtures.map((fixture) => {
          const { mineIsHome, versus, opponent, opponentName } = fixtureOpponent(fixture, { slug });
          const past = fixture.dateKey < today;
          return (
            <FixtureRow
              key={`${fixture.dateKey}-${fixture.awayName}-${fixture.homeName}`}
              opponentSlug={opponent?.slug ?? null}
            >
              <span className="sx-num">
                <span className="sr-only">
                  {mineIsHome ? 'Home' : 'Away'} against {opponent ? opponent.name : opponentName} on{' '}
                  {monthDay(fixture.dateKey)}: {`on ${short}’s schedule only, ${past ? 'no result' : 'not played yet'}.`}
                </span>
                <span aria-hidden="true">{monthDay(fixture.dateKey)}</span>
              </span>
              <span aria-hidden="true" />
              <span className="text-cell text-ink-2" aria-hidden="true">
                {past ? 'No result' : 'No time'}
              </span>
              <span className="sx-teamcell" aria-hidden="true">
                {opponent ? (
                  <TeamMonogram team={opponent} size={24} />
                ) : (
                  <GhostMonogram name={opponentName} size={24} title={NON_MEMBER_NOTE} />
                )}
                <span>
                  {versus} {opponentName}
                </span>
              </span>
              <span className="sx-logrow-note" aria-hidden="true" />
            </FixtureRow>
          );
        })}
      </ul>
      <p className="sx-note">
        On {short}&rsquo;s official schedule, but no source has published a result we count for them, so they
        count in no record here. <ExternalLink href={scheduleUrl}>Official {short} schedule</ExternalLink>
      </p>
    </>
  );
}

export default TeamOfficialFixtures;
