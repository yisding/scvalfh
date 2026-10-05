import Link from 'next/link';

import { getTeamBySlug } from '../../lib/data';
import { gradeWord } from '../../lib/format';
import type { HistoryAwards, HistoryPlayer } from '../../lib/history';
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
    <span className="block text-meta text-ink-2">
      {/* `prefetch={false}`: every route here is STATIC, so Next 16's `auto` downloads the whole
          linked route the moment the link scrolls into view, and every award names a school, so
          one block is dozens of these. Navigation still fetches on click. */}
      {team ? (
        <Link href={`/teams/${team.slug}`} prefetch={false} className="text-accent hover:underline">
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

function PlayerList({
  title,
  players,
  columns,
}: {
  title: string;
  players: HistoryPlayer[];
  /**
   * Where the card's rows flow into two columns: `sm` for a list that has the full division
   * width from `sm` up (honorable mention), `lg` for First/Second team, which sit side by side
   * from `sm` to `md` and stack from `lg`, where each gets the whole ~470-550px division column.
   */
  columns: 'sm' | 'lg';
}) {
  if (players.length === 0) return null;
  return (
    <div>
      <dt className="text-micro font-semibold text-ink-3">
        {title}
      </dt>
      {/* The roster is data, so it sits in a card (the plane rule) with divider rows. Two
          columns are a row-major grid with no gap: a grid row's two cells share one height and
          the dividers run straight across, like a two-column table. Reading order is the DOM
          order (left, then right, then down). */}
      <dd
        className={`sx-card m-0 mt-2 grid ${
          columns === 'sm' ? 'sm:grid-cols-2' : 'lg:grid-cols-2'
        }`}
      >
        {players.map((p, i) => {
          const line = awardLine(p);
          return (
            <div
              key={i}
              // A rule on top of every row but the first in each column: one row in a single
              // column, the first two once the grid has two columns.
              className={`min-w-0 border-t border-divider px-4 py-2 first:border-t-0 ${
                columns === 'sm' ? 'sm:[&:nth-child(2)]:border-t-0' : 'lg:[&:nth-child(2)]:border-t-0'
              }`}
            >
              <span className="block text-body text-ink">{line.player}</span>
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
    return (
      <p className="py-2 text-meta text-ink-3">
        No {levelLabel.toLowerCase()} all-league awards were published for this division.
      </p>
    );
  }
  const overall = overallAwards(leagueOfDivision(awards.division).id, awards);
  return (
    <div className="flex flex-col gap-8">
      {overall.length > 0 ? (
        // A two-column grid, so every winner starts at the same x: the label column is as wide as
        // the longest title. On a phone each pair stacks (small title over the winner) so a long
        // line never wraps flush-left under its title. The title sits on the name's line.
        <dl className="m-0 grid gap-y-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-6 sm:gap-y-3">
          {overall.map((o, i) => (
            <div key={i} className="sm:contents">
              <dt className="text-micro text-ink-3 sm:pt-0.5 sm:text-meta sm:text-ink-2">{o.award}</dt>
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
      <dl className="m-0 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-1">
        <PlayerList title="First team" players={awards.firstTeam} columns="lg" />
        <PlayerList title="Second team" players={awards.secondTeam} columns="lg" />
      </dl>
      {awards.honorableMention.length > 0 ? (
        <dl className="m-0">
          <PlayerList title="Honorable mention" players={awards.honorableMention} columns="sm" />
        </dl>
      ) : null}
    </div>
  );
}

export default AwardsBlock;
