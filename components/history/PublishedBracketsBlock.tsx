import SectionHeader from '../ui/SectionHeader';
import TournamentBrackets from '../playoffs/TournamentBrackets';
import { tournamentBracketsView } from '../playoffs/tournament-brackets-view';
import { getTeamById } from '../../lib/teams';
import type { TournamentBracket } from '../../lib/types';

import ChampionRow from './ChampionRow';
import { publishedChampion } from './published-bracket-view';

/**
 * The 2025-26 CCS or CIF State championship on /history/2025-26 in the soccer, basketball and volleyball builds
 * (`#ccs`, `#cif`): MaxPreps' brackets read whole once the season was over (data/<sport>/history-brackets-2025-26.json
 * `published`), drawn by the very view /playoffs draws the current season's with
 * (components/playoffs/TournamentBrackets.tsx), so last season's bracket reads as this season's does: the divisions
 * that hold a team of ours, every school in them, seeds and results, and the divisions with none named once.
 *
 * The CCS block opens, as field hockey's section blocks do, with every division's champion, ours or not. The CIF
 * State block draws the regional our teams played in and the state final, with no champion list: the state
 * divisions are not this site's to summarize.
 */
export default function PublishedBracketsBlock({
  event,
  brackets,
  readOn,
  leagueWords,
}: {
  event: TournamentBracket['event'];
  /** This event's brackets, in page order. */
  brackets: readonly TournamentBracket[];
  /** The day the pages were read (YYYY-MM-DD). */
  readOn: string;
  /** 'SCVAL, BVAL, WCAL or WBAL': the leagues the build covers. */
  leagueWords: string;
}) {
  // A finished championship: no game is upcoming, so "today" is past every round.
  const view = tournamentBracketsView(brackets, [], '9999-12-31');
  const title = brackets[0]?.tournament.trim() || null;
  const kicker = event === 'ccs' ? 'CCS playoffs' : 'CIF State playoffs';
  return (
    <section id={event} data-region-scope="norcal" aria-labelledby={`${event}-heading`} className="sx-section sx-target min-w-0">
      <SectionHeader id={`${event}-heading`} kicker={kicker} meta={title ?? undefined} />
      {event === 'ccs' ? (
        <ul className="sx-list max-w-188">
          {brackets.map((b) => {
            const champ = publishedChampion(b);
            if (!champ) return null;
            return (
              <ChampionRow
                key={b.bracketId}
                team={champ.teamId ? getTeamById(champ.teamId) : undefined}
                name={champ.name}
                label={`${b.name} champion`}
                detail={champ.detail}
              />
            );
          })}
        </ul>
      ) : null}
      <TournamentBrackets id={`${event}-brackets`} navLabel={`${event === 'ccs' ? 'CCS' : 'CIF State'} brackets`} view={view} readOn={readOn} leagueWords={leagueWords} />
    </section>
  );
}
