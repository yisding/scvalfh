import ExternalLink from '../ui/ExternalLink';
import SectionHeader from '../ui/SectionHeader';
import { getTeamBySlug } from '../../lib/data';
import { dateWithYear, listWords } from '../../lib/format';
import type { TournamentBracket } from '../../lib/history/history';
import { TOC } from '../../lib/league-config/sections';
import { getLeague } from '../../lib/leagues';
import type { LeagueId } from '../../lib/types';

import ChampionCard from './ChampionCard';
import HistoryBracket from './HistoryBracket';
import { divisionChampion, finalLine, sideName, thirdPlaceLine } from './bracket-view';
import { SEASON } from './history-page-view';

/**
 * The 2025 Tournament of Champions (`#toc`, DESIGN §24.13): the postseason of the Sunset and the LA
 * independents, run by the Los Angeles Field Hockey Association, not by CIF. The same champion card and
 * bracket drawer as a section's block, with no seeds (none is published, and copy rule 5 bans a seed word on
 * these leagues' pages), the third-place game under the bracket, and a source line that says the bracket is
 * this site's assembly of the games, not a published one.
 */
export default function TournamentBracketBlock({ bracket, leagues }: { bracket: TournamentBracket; leagues: readonly LeagueId[] }) {
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
    <section id={TOC.id} data-region-scope="socal" aria-label={`${TOC.name} ${SEASON}`} className="min-w-0">
      <SectionHeader
        size="lg"
        kicker={`${TOC.shortName} · ${TOC.name}`}
        meta={<span className="whitespace-nowrap">{SEASON}</span>}
      />
      <p className="m-0 mt-2 max-w-prose text-body text-ink-2">
        The 2025 postseason for {whose}: eight teams, run by the {bracket.organizer}, not by CIF.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 sm:gap-4">
        <ChampionCard team={team}>
          <p className="m-0 text-micro font-medium text-ink-3">{TOC.name} champion</p>
          <p className="m-0 mt-0.5 text-lead text-ink sm:text-title">{sideName(champion)}</p>
          <p className="m-0 mt-0.5 text-meta text-ink-2">{finalLine(final)}</p>
        </ChampionCard>
      </div>

      <section id={`${TOC.id}-${d.id}`} aria-label={`${TOC.shortName} bracket`} className="mt-section min-w-0 md:mt-section-lg">
        <SectionHeader
          as="h3"
          size="section"
          kicker={`${TOC.shortName} · bracket`}
          meta={<span className="whitespace-nowrap">{SEASON}</span>}
          className="mb-4"
        />
        <HistoryBracket division={d} label={`${TOC.name} bracket, ${SEASON}`} />
        {third ? <p className="m-0 mt-4 text-meta text-ink-2">{third}</p> : null}
      </section>

      <div className="mt-section max-w-prose space-y-3 text-meta text-ink-3 md:mt-section-lg">
        <p className="m-0">
          Source: {links}. Read on {dateWithYear(bracket.retrievedOn)}. No bracket, pairings or seeds were
          published, so this bracket is drawn from the games: Harvard-Westlake&rsquo;s three are the
          Chronicle&rsquo;s, the other five MaxPreps&rsquo; 2025-26 schedules, and each card lists the home team
          first. MaxPreps gives Newport Harbor the 1-1 game with Bonita, and Newport Harbor played on, but no
          source says how the tie was broken. The third-place game is the two beaten semifinalists&rsquo; game
          two days later.
        </p>
      </div>
    </section>
  );
}
