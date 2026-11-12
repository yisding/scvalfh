import ExternalLink from '../ui/ExternalLink';
import SectionHeader from '../ui/SectionHeader';
import { getTeamBySlug } from '../../lib/data';
import { dateWithYear, listWords } from '../../lib/format';
import type { TournamentBracket } from '../../lib/history/history';
import { TOC } from '../../lib/league-config/sections';
import { getLeague } from '../../lib/leagues';
import type { LeagueId } from '../../lib/types';

import ChampionRow from './ChampionRow';
import HistoryBracket from './HistoryBracket';
import { divisionChampion, finalLine, sideName, thirdPlaceLine } from './bracket-view';

/**
 * The 2025 Tournament of Champions (`#toc`, DESIGN §24.13): the postseason of the Sunset and the LA
 * independents, run by the Los Angeles Field Hockey Association, not by CIF. The same champion card and
 * bracket drawer as a section's block, with no seeds (none is published, and copy rule 5 bans a seed word on
 * these leagues' pages), the third-place game under the bracket, and a source line that says the bracket is
 * this site's assembly of the games, not a published one.
 */
export default function TournamentBracketBlock({
  bracket,
  leagues,
  season,
}: {
  bracket: TournamentBracket;
  leagues: readonly LeagueId[];
  /** The archive's season ('2025-26'). */
  season: string;
}) {
  const d = bracket.divisions[0];
  const { champion, final } = divisionChampion(d);
  const team = getTeamBySlug(champion.slug);
  const third = thirdPlaceLine(d);
  const links = bracket.sources.map((doc, i) => (
    <span key={doc.url}>
      {i > 0 ? ' · ' : ''}
      <ExternalLink href={doc.url}>{doc.label}</ExternalLink>
    </span>
  ));
  const whose = listWords(leagues.map((l) => `the ${getLeague(l).name}`));
  return (
    <section id={TOC.id} data-region-scope="socal" aria-label={`${TOC.name} ${season}`} className="sx-section sx-target min-w-0">
      <SectionHeader kicker={TOC.name} />
      <ul className="sx-list max-w-188">
        <ChampionRow team={team} name={sideName(champion)} label={`${TOC.name} champion`} detail={finalLine(final)} />
      </ul>

      <div id={`${TOC.id}-${d.id}`} className="sx-target mt-4 min-w-0">
        <HistoryBracket division={d} label={`${TOC.name} bracket, ${season}`} />
        {third ? <p className="sx-note">{third}</p> : null}
      </div>

      <p className="sx-note">
        The 2025 postseason for {whose}: eight teams, run by the {bracket.organizer}, not by CIF.
      </p>
      <p className="sx-note">
        Source: {links}. Read on {dateWithYear(bracket.retrievedOn)}. No bracket, pairings or seeds were
        published, so this bracket is drawn from the games: Harvard-Westlake&rsquo;s three are the
        Chronicle&rsquo;s, the other five MaxPreps&rsquo; 2025-26 schedules, and each card lists the home team
        first. MaxPreps gives Newport Harbor the 1-1 game with Bonita, and Newport Harbor played on, but no
        source says how the tie was broken. The third-place game is the two beaten semifinalists&rsquo; game
        two days later.
      </p>
    </section>
  );
}
