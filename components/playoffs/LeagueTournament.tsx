import { Fragment } from 'react';

import { placeWords, plural, shortDate } from '../../lib/format';
import { gameHref } from '../../lib/game-id';
import { rowState } from '../game-row/summary';
import { describeGame } from '../ui/describe-game';
import ExternalLink from '../ui/ExternalLink';
import { TeamRowLink } from '../ui/PinNote';
import PlaceMark from '../ui/PlaceMark';
import SectionHeader from '../ui/SectionHeader';
import TeamMonogram from '../ui/TeamMonogram';

import Bracket, { type BracketRoundModel, type TieLineModel, type TieModel } from './Bracket';
import type {
  SeedRowView,
  TournamentGameView,
  TournamentSlotView,
  TournamentView,
} from './playoff-view';

/**
 * A league's own tournament (SPEC §6.2, §10.7 `/playoffs/<league>`; MCAL): the bracket, drawn by the
 * site's one bracket drawer (Bracket.tsx) with the play-in as its first round when one is needed or
 * possible, and the Seeds table.
 *
 * Every word is the league's: no section concept appears here (the NCS holds no field hockey
 * championship). A place nobody holds yet reads `TBD` or the written rule ('Lowest-ranked remaining
 * seed'), never blank. A cell always shows where its game stands: a result is its two scores (the
 * cell links the game page), a game to come its start time; a one-goal result carries the shootout
 * caveat the engine attached, in the cell's note.
 */
export interface LeagueTournamentProps {
  view: TournamentView;
  /** 'MCAL' — the league's short name, for captions. */
  leagueShort: string;
  /** '/standings/<league>' */
  standingsHref: string;
  /** Rendered above the seeds table (the league health note). */
  beforeSeeds?: React.ReactNode;
  /** The play-in round's written rule from config, printed under the bracket while there is a play-in. */
  playInRule?: string | null;
  /**
   * Inside another page's league section (the MCAL section on /playoffs, since 2026-11-03): the ids take this
   * prefix ('mcal-seeds', 'mcal-bracket'), so they never collide with that page's own (#bracket is the CCS
   * bracket there), the bracket takes no heading of its own (the league's h2 heads it) and Seeds is an h3.
   */
  idPrefix?: string;
  nested?: boolean;
}

function PlaceCell({ row }: { row: SeedRowView }) {
  const ranked = row.standing.hasReportedResults;
  // `T6`, the site-wide tie mark, with the sr-only "tied for 6th" (PlaceMark).
  return (
    <PlaceMark
      place={row.standing.computed.place}
      shared={row.shared}
      ranked={ranked}
      className="sx-num"
    />
  );
}

function rowSentence(row: SeedRowView, leagueShort: string): string {
  const { team, standing } = row;
  if (!standing.hasReportedResults) return `${team.name}: no results reported, not ranked in ${leagueShort}`;
  const place = placeWords(standing.computed.place, row.shared);
  return `${team.name}, ${place} in ${leagueShort}, ${plural(standing.computed.pts, 'point')}, ${row.gpText.replace('GP', 'league games counted')}`;
}

/**
 * '37 pts' / '14/16 GP' with the unit dropped from sm, where the PTS and GP column headers name it
 * (the standings table prints bare numbers too). Below sm the PTS cell keeps it; '—' passes through.
 */
function BareFromSm({ text, unit }: { text: string; unit: string }) {
  const suffix = ` ${unit}`;
  if (!text.endsWith(suffix)) return <>{text}</>;
  // The Pts and GP column heads are drawn at every width now, so the unit is never repeated in a cell.
  return <>{text.slice(0, -suffix.length)}</>;
}

function SeedsTable({ view, leagueShort }: { view: TournamentView; leagueShort: string }) {
  const { seedRows, lineAfter, lineLabel } = view;
  return (
    <div className="sx-tablewrap" data-full="">
      <table className="sx-table">
        <caption className="sr-only">
          {leagueShort} tournament seeds from the league table, ordered by points. Unofficial.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="sx-col-rank">
              #
            </th>
            <th scope="col" className="sx-col-team">
              Team
            </th>
            <th scope="col" className="sx-col-key">
              Pts
            </th>
            <th scope="col" className="sx-col-mid">
              GP
            </th>
            <th scope="col" className="sx-col-wide text-left">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {seedRows.map((row, index) => (
            <Fragment key={row.team.slug}>
              <tr data-team-slug={row.team.slug}>
                <td className="sx-col-rank">
                  <PlaceCell row={row} />
                </td>
                <th scope="row" aria-label={row.team.name} className="sx-col-team">
                  <span className="sx-teamcell">
                    <TeamMonogram team={row.team} size={24} />
                    <span>
                      {/* One row link per team, never prefetched and marked like every other team list. */}
                      <TeamRowLink href={`/teams/${row.team.slug}`} label={rowSentence(row, leagueShort)}>
                        {row.team.shortName}
                      </TeamRowLink>
                      <span className="sx-pin-note" aria-hidden="true" hidden>
                        Your team
                      </span>
                    </span>
                  </span>
                </th>
                <td className="sx-num sx-col-key" aria-hidden="true">
                  <BareFromSm text={row.ptsText} unit="pts" />
                </td>
                <td className="sx-num sx-col-mid sx-col-quiet">
                  <BareFromSm text={row.gpText} unit="GP" />
                </td>
                <td className="sx-col-wide sx-col-quiet text-left text-cell">{row.label}</td>
              </tr>
              {lineLabel && index + 1 === lineAfter && index + 1 < seedRows.length ? (
                <tr className="sx-cutline">
                  <td colSpan={5}>
                    <span>{lineLabel}</span>
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function slotLine(slot: TournamentSlotView, score: string | undefined, result: 'won' | 'lost' | null): TieLineModel {
  const settled = slot.teams.length === 1 && !slot.tbd;
  return {
    slug: settled ? slot.teams[0].slug : null,
    name: slot.text,
    seed: slot.seed,
    score,
    result,
    open: !settled,
  };
}

/**
 * One tournament game as a cell: the visitor's line, then the host's. With a result the two scores, and the
 * cell links the game page; before it the round's start time in the score position and, at a fixed site, the
 * site under the lines. The sentence a screen reader hears says who advances ('Redwood won and advances to
 * the final.') or who wins the tournament, then the score.
 */
function gameTie(game: TournamentGameView, idPrefix: string, id: string): TieModel {
  const display = game.game ? describeGame(game.game) : null;
  const state = game.game && display ? rowState(game.game, display) : 'upcoming';
  const scored = display !== null && display.showScores && display.away.hasScore && display.home.hasScore && state !== 'upcoming';
  const goals = (slot: TournamentSlotView): string | undefined => {
    if (!scored || !display) return undefined;
    const slug = slot.teams.length === 1 ? slot.teams[0].slug : null;
    return slug === display.home.slug ? display.home.glyph : slug === display.away.slug ? display.away.glyph : undefined;
  };
  const result = (side: 'home' | 'away') => (game.winner === null ? null : game.winner === side ? 'won' : 'lost');
  const notes = [state === 'upcoming' && game.site ? `at ${game.site}` : null, game.note].filter(Boolean);
  return {
    key: game.id,
    id: `${idPrefix}${id}`,
    state: state === 'off' ? null : state,
    lines: [slotLine(game.away, goals(game.away), result('away')), slotLine(game.home, goals(game.home), result('home'))],
    time: game.timeLabel.replace(/ PT$/, ''),
    note: notes.length > 0 ? notes.join(' ') : null,
    href: game.game ? gameHref(game.game.contestId) : null,
    sentence: [
      game.outcome ? `${game.line}. ${game.outcome}` : `${game.line}.`,
      game.game && state !== 'upcoming' ? ` ${describeGame(game.game).sentence}` : '',
    ],
  };
}

/** The tournament as the shared drawer's rounds: the play-in first when there is one. */
export function tournamentRounds(view: TournamentView, idPrefix = ''): BracketRoundModel[] {
  return [
    ...(view.playIn
      ? [{ key: 'play-in', name: 'Play-in', dateLabel: view.playIn.dateLabel, ties: [gameTie(view.playIn, idPrefix, 'play-in')] }]
      : []),
    ...view.rounds.map((round) => ({
      key: round.round,
      name: round.title,
      dateLabel: shortDate(round.dateKey),
      ties: round.games.map((game) => gameTie(game, idPrefix, game.id)),
    })),
  ];
}

export function LeagueTournament({
  view,
  leagueShort,
  standingsHref,
  beforeSeeds,
  playInRule = null,
  idPrefix = '',
  nested = false,
}: LeagueTournamentProps) {
  // Phase order (DESIGN §32.3): while the picture is projected the seeds lead, since they are the news; once the
  // tournament is seeded or under way the games do, and the seeds table sits under the bracket it fed. The data-health
  // note (`beforeSeeds`) always comes first, above whatever leads, since it qualifies everything below it.
  const projected = view.status === 'projected';
  const block = nested ? 'sx-subsection' : 'sx-section';
  const venues = view.rounds.filter((round) => round.venue !== null);
  const seeds = (
    <section id={`${idPrefix}seeds`} className={block}>
      <SectionHeader
        as={nested ? 'h3' : 'h2'}
        kicker="Seeds"
        meta={view.seedsMeta ?? undefined}
        action={{ href: standingsHref, label: 'Full standings' }}
        // Capped like the table under it (47rem), so the link sits over the table's right edge.
        className="max-w-188"
      />
      <SeedsTable view={view} leagueShort={leagueShort} />
      {view.playInSentence ? <p className="sx-note">{view.playInSentence}</p> : null}
      {view.notes.map((note) => (
        <p key={note} className="sx-note">
          {note}
        </p>
      ))}
    </section>
  );
  const games = (
    <section id={`${idPrefix}bracket`} className={block}>
      {nested ? null : <SectionHeader kicker="Bracket" />}
      <Bracket rounds={tournamentRounds(view, idPrefix)} label={`${leagueShort} tournament bracket`} />
      {view.playIn && playInRule ? <p className="sx-note">{`Play-in: ${playInRule}`}</p> : null}
      {/* A fixed site's where and how much (config finalSite): the venue and address as one sentence with a
          Directions link, then admission with its source. Whole sentences as single text nodes. */}
      {venues.map((round) =>
        round.venue ? (
          <Fragment key={round.round}>
            <p className="sx-note">
              {`${round.title}: ${round.venue.name}, ${round.venue.addressLine}.`}{' '}
              <ExternalLink href={round.venue.directionsHref} className="whitespace-nowrap">
                Directions
              </ExternalLink>
            </p>
            {round.venue.admission ? (
              <p className="sx-note">
                {`Admission: ${round.venue.admission}${round.venue.admissionSource ? ` (${round.venue.admissionSource})` : ''}`}
              </p>
            ) : null}
          </Fragment>
        ) : null,
      )}
    </section>
  );
  return projected ? (
    <>
      {beforeSeeds}
      {seeds}
      {games}
    </>
  ) : (
    <>
      {beforeSeeds}
      {games}
      {seeds}
    </>
  );
}

export default LeagueTournament;
