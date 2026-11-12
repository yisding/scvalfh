import Link from 'next/link';

import { getTeamBySlug } from '../../lib/data';
import TeamMonogram from '../ui/TeamMonogram';

import BracketRounds from './BracketRounds';

/**
 * The one bracket drawer (spec §5.6): the CCS bracket (PlayoffBracket), a league's own tournament
 * (LeagueTournament), the San Diego Section's brackets (SdsBracket) and the 2025 archive
 * (HistoryBracket) each turn their own model into `BracketRoundModel[]` and draw it here, so the four
 * look the same.
 *
 * A round is an h3 ("Quarterfinals, Sat Nov 7") over its cells. A cell (`.sx-tie`) is a square
 * outlined box of two lines (logo, name, `#seed`, score) and ALWAYS shows where its game stands
 * (`data-state`): `final` the two scores, `live` the two scores and a "Live" line under them,
 * `upcoming` the start time in the score position; a place no game fills yet has no state and names
 * the teams that can reach it ("Christopher or St. Ignatius"). The winner's line is bold (`data-won`),
 * the other one grey (`data-lost`); no bar, and no star: eight lines need no scanning aid.
 *
 * From 1024px the rounds are columns and 1px connectors join each pair of cells to the cell it feeds
 * (`.sx-tie-pair`; drawn only where a round has exactly twice the next round's cells). Below that one
 * round shows at a time, chosen with the tab row (BracketRounds.tsx, the only client code).
 *
 * A cell is one sentence for a screen reader; the drawn lines are hidden from it. A cell whose game
 * has a page is one link to it (an anchor cannot hold another, so its names are then plain text and
 * its extra links sit in the note row above the cell's link); without a game page a registry team's
 * name is a pointer-only link to its team page.
 */
export interface TieLineModel {
  /** A registry team's slug: its logo, the pin hook, and the team link when the cell has no game page. */
  slug?: string | null;
  /** What the line prints: 'Los Gatos', 'Christopher or St. Ignatius', 'TBD'. */
  name: React.ReactNode;
  /** Printed as `#1`; null prints none. */
  seed?: number | null;
  /** A final's or a live game's figure (or the missing-score dash); undefined prints no score cell. */
  score?: React.ReactNode;
  result?: 'won' | 'lost' | null;
  /** A place not settled yet (two possible teams, a rule, TBD): drawn in the secondary grey. */
  open?: boolean;
}

export interface TieModel {
  key: string;
  /** The anchor a game's "Bracket" link lands on. */
  id?: string;
  state: 'final' | 'live' | 'upcoming' | null;
  lines: readonly [TieLineModel, TieLineModel];
  /** `upcoming`: '4:00 PM', 'Sat 4:00 PM', 'TBD'. */
  time?: string | null;
  /** `live`: the period ('2nd half'), when the source gives one. */
  period?: string | null;
  /** One line under the two: 'Overtime', 'at La Jolla HS'. */
  note?: React.ReactNode;
  /** Links under the two lines (tickets, a stream): outside the cell's own link. */
  links?: React.ReactNode;
  /** The game page. */
  href?: string | null;
  /**
   * The cell's own link, when the caller writes it (PlayoffBracket: the game link stays a `<Link prefetch={false}>`
   * in that file, where tests/ui/prefetch-policy.test.ts looks for it). It replaces the link the drawer would
   * build from `href`, and must cover the cell and hold the sentence.
   */
  link?: React.ReactNode;
  /** The cell for a screen reader, as the text nodes to render. */
  sentence: readonly string[];
}

export interface BracketRoundModel {
  key: string;
  /** 'Quarterfinals': the tab's word and the first part of the heading. */
  name: string;
  /** 'Sat Nov 7': after the name in the heading. */
  dateLabel?: string | null;
  ties: readonly TieModel[];
}

export interface BracketProps {
  rounds: readonly BracketRoundModel[];
  /** Names the bracket for a screen reader: 'CCS Division 1 bracket'. */
  label: string;
  className?: string;
}

function TieLine({ line, linkTeam }: { line: TieLineModel; linkTeam: boolean }) {
  const team = line.slug ? getTeamBySlug(line.slug) : undefined;
  // A place still open may name two teams ("Point Loma or Olympian"): it wraps instead of being cut.
  const nameClass = line.open ? 'sx-game-name py-1 leading-5 font-normal whitespace-normal text-ink-2' : 'sx-game-name';
  return (
    <div
      className="sx-tie-line"
      aria-hidden="true"
      data-team-slug={team?.slug}
      data-won={line.result === 'won' ? '' : undefined}
      data-lost={line.result === 'lost' ? '' : undefined}
    >
      {team ? <TeamMonogram team={team} size={24} /> : null}
      {team && linkTeam ? (
        // Pointer-only: the lines are hidden from a screen reader (the cell's sentence speaks), so the
        // link stays out of the tab order. `prefetch={false}`: a bracket is a dozen of these.
        <Link href={`/teams/${team.slug}`} prefetch={false} tabIndex={-1} className={`${nameClass} sx-teamlink`}>
          {line.name}
        </Link>
      ) : (
        <span className={nameClass}>{line.name}</span>
      )}
      {line.seed !== null && line.seed !== undefined ? <span className="sx-seed sx-num">#{line.seed}</span> : null}
      {line.score !== undefined ? <span className="sx-num sx-tie-score">{line.score}</span> : null}
    </div>
  );
}

function Tie({ tie, dense }: { tie: TieModel; dense: boolean }) {
  const upcoming = tie.state === 'upcoming';
  // In a bracket of five rounds a column is too narrow for a name beside a start time, so the time opens the
  // note row instead of taking the score position.
  const timeBelow = upcoming && dense;
  const hasNote = tie.state === 'live' || timeBelow || Boolean(tie.note) || Boolean(tie.links);
  return (
    <div
      id={tie.id}
      className={tie.id ? 'sx-tie sx-target' : 'sx-tie'}
      data-state={tie.state ?? undefined}
    >
      {tie.link ? (
        tie.link
      ) : tie.href ? (
        <Link href={tie.href} prefetch={false} className="absolute inset-0">
          <span className="sr-only">{tie.sentence}</span>
        </Link>
      ) : (
        <span className="sr-only">{tie.sentence}</span>
      )}
      {/* Direct children of the cell (the upcoming grid places them), each hidden from a screen reader. */}
      <TieLine line={tie.lines[0]} linkTeam={!tie.href && !tie.link} />
      <TieLine line={tie.lines[1]} linkTeam={!tie.href && !tie.link} />
      {upcoming && !timeBelow ? (
        <span className="sx-num sx-tie-time" aria-hidden="true">
          {tie.time ?? 'TBD'}
        </span>
      ) : null}
      {hasNote ? (
        // The note row is real text (a site, how the game was decided) and holds the extra links, which sit
        // above the cell's own link.
        <div className={upcoming ? 'sx-tie-note col-span-full flex-wrap py-1' : 'sx-tie-note flex-wrap py-1'}>
          {tie.state === 'live' ? <span className="sx-live">Live</span> : null}
          {tie.state === 'live' && tie.period ? <span>{tie.period}</span> : null}
          {timeBelow ? <span className="sx-num text-cell font-semibold text-ink">{tie.time ?? 'TBD'}</span> : null}
          {tie.note ? <span className="min-w-0">{tie.note}</span> : null}
          {tie.links ? <span className="relative flex flex-wrap gap-x-4">{tie.links}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Cells two by two when each pair feeds one cell of the next round; otherwise one after another. */
function Ties({ ties, paired, dense }: { ties: readonly TieModel[]; paired: boolean; dense: boolean }) {
  if (!paired) return ties.map((tie) => <Tie key={tie.key} tie={tie} dense={dense} />);
  const pairs: TieModel[][] = [];
  for (let i = 0; i < ties.length; i += 2) pairs.push(ties.slice(i, i + 2));
  return pairs.map((pair) => (
    <div key={pair[0].key} className="sx-tie-pair">
      {pair.map((tie) => (
        <Tie key={tie.key} tie={tie} dense={dense} />
      ))}
    </div>
  ));
}

/** The round to open on below 1024px: the first with a game still to finish, else the last. */
export function currentRound(rounds: readonly BracketRoundModel[]): number {
  const open = rounds.findIndex((round) => round.ties.some((tie) => tie.state !== 'final'));
  return open >= 0 ? open : Math.max(0, rounds.length - 1);
}

export function Bracket({ rounds, label, className }: BracketProps) {
  if (rounds.length === 0) return null;
  return (
    <div role="group" aria-label={label} className={className}>
      <BracketRounds
        label={`${label}: rounds`}
        current={currentRound(rounds)}
        rounds={rounds.map((round, index) => {
          const next = rounds[index + 1];
          return {
            key: round.key,
            tab: round.name,
            ids: round.ties.flatMap((tie) => (tie.id ? [tie.id] : [])),
            content: (
              <>
                <h3>{round.dateLabel ? `${round.name}, ${round.dateLabel}` : round.name}</h3>
                <div className="sx-round-ties">
                  <Ties
                    ties={round.ties}
                    paired={next !== undefined && round.ties.length === next.ties.length * 2}
                    dense={rounds.length >= 5}
                  />
                </div>
              </>
            ),
          };
        })}
      />
    </div>
  );
}

export default Bracket;
