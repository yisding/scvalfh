import ExternalLink from '../ui/ExternalLink';
import SectionHeader from '../ui/SectionHeader';
import { getTeamBySlug } from '../../lib/data';
import { dateSpan, dateWithYear, listWords } from '../../lib/format';
import type { TournamentBracket } from '../../lib/history/history';
import { TOC } from '../../lib/league-config/sections';
import { getLeague } from '../../lib/leagues';
import type { LeagueId } from '../../lib/types';

import ChampionRow from './ChampionRow';
import HistoryBracket from './HistoryBracket';
import { divisionChampion, finalLine, sideName } from './bracket-view';

/**
 * The 2025 Tournament of Champions (`#toc`, DESIGN §24.13): the postseason of the Sunset and the LA
 * independents, run by the Los Angeles Field Hockey Association, not by CIF. Laid out as /playoffs lays out the
 * 2026 event (components/playoffs/OutsideTournament.tsx): the heading with the event's dates beside it, the
 * bracket with the third-place game as a card under the final (`#toc-bracket`), the line saying what the bracket
 * is drawn from, the note, and the sources as a link row. Like the section blocks on this page it opens with the
 * champion card. No seeds: none is published, and copy rule 5 bans a seed word on these leagues' pages.
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
  const first = d.rounds[0].date;
  const last = d.thirdPlace && d.thirdPlace.date > d.rounds.at(-1)!.date ? d.thirdPlace.date : d.rounds.at(-1)!.date;
  const whose = listWords(leagues.map((l) => `the ${getLeague(l).name}`));
  return (
    <section id={TOC.id} data-region-scope="socal" aria-labelledby={`${TOC.id}-heading`} className="sx-section sx-target min-w-0">
      <SectionHeader id={`${TOC.id}-heading`} kicker={TOC.name} meta={dateSpan(first, last)} />
      <ul className="sx-list max-w-188">
        <ChampionRow team={team} name={sideName(champion)} label={`${TOC.name} champion`} detail={finalLine(final)} />
      </ul>

      <div id={`${TOC.id}-bracket`} className="sx-target mt-4 min-w-0">
        <HistoryBracket division={d} label={`${TOC.name} bracket, ${season}`} />
        <p className="sx-note">
          No bracket, pairings or seeds were published for the event: this one is drawn from its results, each
          round&rsquo;s winners meeting in the next, and each card lists the home team first. The third-place game
          is the two beaten semifinalists&rsquo; game on the day of the final.
        </p>
      </div>

      <p className="sx-note">
        The 2025 postseason for {whose}: eight teams, run by the {bracket.organizer}, not by CIF. Harvard-Westlake&rsquo;s
        three games are the Chronicle&rsquo;s, the other five MaxPreps&rsquo; 2025-26 schedules. MaxPreps gives
        Newport Harbor the 1-1 game with Bonita, and Newport Harbor played on, but no source says how the tie was
        broken. Read on {dateWithYear(bracket.retrievedOn)}.
      </p>
      <p className="sx-linkrow">
        {bracket.sources.map((doc) => (
          <ExternalLink key={doc.url} href={doc.url} className="sx-action">
            {doc.label}
          </ExternalLink>
        ))}
      </p>
    </section>
  );
}
