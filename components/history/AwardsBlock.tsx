import Link from 'next/link';

import { getTeamBySlug } from '../../lib/data';
import { gradeWord } from '../../lib/format';
import type { HistoryAwards, HistoryPlayer } from '../../lib/history/history';
import { leagueOfDivision } from '../../lib/leagues';
import { awardLine, overallAwards, type AwardLine } from './history-view';

/**
 * The 2025-26 all-league awards (DESIGN §3.9): the overall awards, then First Team / Second
 * Team / Honorable Mention as `<dl>`s. Every winner and listed player reads the same way, in the
 * site's words (components/history/history-view.ts), and the way the roster, /clubs, /commits and
 * /leaders print a player: the player, then school · grade · position, the school linked to its
 * team page and the grade a word ("Senior"). The documents write each of those several ways ("GK",
 * "Goalie", "Goalkeeper"; "St Ignatius", "MItty"; an overall award as "School- Player" or "Player
 * School Year"); the page never shows those differences.
 */
export interface AwardsBlockProps {
  awards: HistoryAwards | null;
  /** "Varsity" or "JV" — used only in the empty-state sentence. */
  levelLabel: string;
}

/** "Los Gatos · Senior · Midfield", the school linked; a part nobody published is not shown. */
function AwardMeta({ line }: { line: AwardLine }) {
  const team = line.slug ? getTeamBySlug(line.slug) : undefined;
  // A grade or position no source gives is null: say nothing rather than guess.
  const facts = [line.year !== null ? gradeWord(line.year) : null, line.position].filter(
    (f): f is string => f !== null,
  );
  return (
    <span className="block text-cell text-ink-2">
      {/* `prefetch={false}`: every route here is STATIC, so Next 16's `auto` downloads the whole
          linked route the moment the link scrolls into view, and every award names a school, so
          one block is dozens of these. Navigation still fetches on click. */}
      {team ? (
        <Link href={`/teams/${team.slug}`} prefetch={false} className="sx-teamlink">
          {line.school}
        </Link>
      ) : (
        <span>{line.school}</span>
      )}
      {/* A no-break space BEFORE each dot, so a narrow column breaks after a dot and never starts
          a line with one ("· Senior"), and each fact kept whole ("Forward / Midfield"). */}
      {facts.map((fact, i) => (
        <span key={i}>
          &nbsp;&middot; <span className="whitespace-nowrap">{fact}</span>
        </span>
      ))}
    </span>
  );
}

function PlayerList({ title, players }: { title: string; players: HistoryPlayer[] }) {
  if (players.length === 0) return null;
  return (
    <div>
      <dt className="text-cell font-semibold text-ink-2">{title}</dt>
      {/* A plain list of names, each on a hairline, in two columns where a division's half of the page (or a
          phone held sideways) has room for two. Reading order is the DOM order (left, then right, then down). */}
      <dd className="m-0 mt-1 grid gap-x-10 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
        {players.map((p, i) => {
          const line = awardLine(p);
          return (
            <div key={i} className="min-w-0 border-t border-divider px-2 py-2">
              <span className="block text-body font-medium text-ink">{line.player}</span>
              <AwardMeta line={line} />
            </div>
          );
        })}
      </dd>
    </div>
  );
}

export function AwardsBlock({ awards, levelLabel }: AwardsBlockProps) {
  if (!awards) {
    return <p className="sx-empty">No {levelLabel.toLowerCase()} all-league awards were published for this division.</p>;
  }
  const overall = overallAwards(leagueOfDivision(awards.division).id, awards);
  return (
    <div className="flex flex-col gap-6 pt-2">
      {overall.length > 0 ? (
        // A two-column grid, so every winner starts at the same x. The label column is a fixed 12rem, which
        // holds the longest title ("Offensive Player of the Year") on one line. On a phone each pair stacks
        // (the title over the winner).
        <dl className="m-0 grid gap-y-3 px-2 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-x-6">
          {overall.map((o, i) => (
            <div key={i} className="sm:contents">
              <dt className="text-cell text-ink-2 sm:pt-0.5">{o.award}</dt>
              <dd className="m-0">
                {o.winner ? (
                  <>
                    <span className="block text-body font-semibold text-ink">{o.winner.player}</span>
                    <AwardMeta line={o.winner} />
                  </>
                ) : (
                  <span className="block text-body font-semibold text-ink">{o.value}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      <dl className="m-0 flex flex-col gap-6">
        <PlayerList title="First team" players={awards.firstTeam} />
        <PlayerList title="Second team" players={awards.secondTeam} />
        {awards.thirdTeam && awards.thirdTeam.length > 0 ? <PlayerList title="Third team" players={awards.thirdTeam} /> : null}
        <PlayerList title="Honorable mention" players={awards.honorableMention} />
      </dl>
    </div>
  );
}

export default AwardsBlock;
