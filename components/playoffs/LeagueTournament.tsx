import Link from 'next/link';
import { Fragment } from 'react';

import { placeWords, scoreSentence } from '../../lib/format';
import { gameHref } from '../../lib/game-id';
import PlaceMark from '../ui/PlaceMark';
import SectionHeader from '../ui/SectionHeader';
import TeamMonogram from '../ui/TeamMonogram';

import PlayInCard, { type PlayInSide } from './PlayInCard';
import type {
  SeedRowView,
  TournamentGameView,
  TournamentSlotView,
  TournamentView,
} from './playoff-view';

/**
 * A league's own tournament (SPEC §6.2, §10.7 `/playoffs/<league>`; MCAL): Seeds, the Play-in when
 * one is needed or possible, and the Bracket as VERTICAL rounds — never a tree on a phone.
 *
 * Every word is the league's: no section concept appears here (the NCS holds no field hockey
 * championship). An unfilled slot reads `TBD` or the written rule ('Lowest-ranked remaining
 * seed'), never blank; a result links its game with `gameHref`; a one-goal result carries the
 * shootout caveat the engine attached.
 */
export interface LeagueTournamentProps {
  view: TournamentView;
  /** 'MCAL' — the league's short name, for captions. */
  leagueShort: string;
  /** '/standings/<league>' */
  standingsHref: string;
  /** Rendered above the seeds table (the league health note). */
  beforeSeeds?: React.ReactNode;
  /** The play-in round's written rule from config, shown on the play-in card. */
  playInRule?: string | null;
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
      tone={ranked ? 'text-ink' : 'text-ink-3'}
    />
  );
}

function rowSentence(row: SeedRowView, leagueShort: string): string {
  const { team, standing } = row;
  if (!standing.hasReportedResults) return `${team.name}: no results reported, not ranked in ${leagueShort}`;
  const place = placeWords(standing.computed.place, row.shared);
  return `${team.name}, ${place} in ${leagueShort}, ${standing.computed.pts} points, ${row.gpText.replace('GP', 'league games counted')}`;
}

function SeedsTable({ view, leagueShort }: { view: TournamentView; leagueShort: string }) {
  const { seedRows, lineAfter, lineLabel } = view;
  return (
    <div className="sx-card sx-flush">
      <table className="sx-table text-meta">
        <caption className="sr-only">
          {leagueShort} tournament seeds from the league table, ordered by points. Unofficial.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="w-8 pr-1 pl-3 sm:w-10 sm:pr-2 sm:pl-4">
              #
            </th>
            <th scope="col">Team</th>
            <th scope="col" className="w-px px-2 text-right tracking-normal">
              PTS
            </th>
            <th scope="col" className="hidden w-px px-2 text-right tracking-normal sm:table-cell">
              GP
            </th>
            <th scope="col" className="hidden pr-4 md:table-cell md:w-52">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {seedRows.map((row, index) => (
            <Fragment key={row.team.slug}>
              <tr data-team-slug={row.team.slug} className="relative" style={{ height: 56 }}>
                <td className="w-8 pr-1 pl-3 align-middle sm:w-10 sm:pr-2 sm:pl-4">
                  <PlaceCell row={row} />
                </td>
                <th scope="row" className="pr-3 font-normal sm:pr-4 md:pr-0">
                  {/* One stretched row link per team; `prefetch={false}` like every per-row link
                      (components/layout/NavLink.tsx has the reasoning). */}
                  <Link href={`/teams/${row.team.slug}`} prefetch={false} className="absolute inset-0">
                    <span className="sr-only">
                      {/* Marked like every other team list: only the pinned row's note is
                          displayed (app/globals.css), so the accent rule never speaks alone. */}
                      <span className="sx-pin-note">Your team. </span>
                      {rowSentence(row, leagueShort)}
                    </span>
                  </Link>
                  <span className="flex items-center gap-3">
                    <TeamMonogram team={row.team} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body text-ink" aria-hidden="true">
                        {row.team.shortName}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1" aria-hidden="true">
                        <span className="sx-num whitespace-nowrap text-cell text-ink-2 sm:hidden">{row.gpText}</span>
                        <span className="text-micro text-ink-2 md:hidden">{row.label}</span>
                      </span>
                    </span>
                  </span>
                </th>
                <td className="sx-num whitespace-nowrap px-2 text-right align-middle text-cell text-ink" aria-hidden="true">
                  {row.ptsText}
                </td>
                <td className="sx-num hidden whitespace-nowrap px-2 text-right align-middle text-cell text-ink-2 sm:table-cell">
                  {row.gpText}
                </td>
                <td className="hidden pr-3 pl-3 align-middle text-micro text-ink-2 sm:pr-4 md:table-cell">{row.label}</td>
              </tr>
              {lineLabel && index + 1 === lineAfter && index + 1 < seedRows.length ? (
                <tr>
                  <td colSpan={5} className="border-t-2 border-rule py-1 pl-3 text-micro text-ink-3 sm:pl-4">
                    {lineLabel}
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

function SlotText({ slot }: { slot: TournamentSlotView }) {
  return (
    <span className="min-w-0">
      {slot.seed !== null ? <span className="sx-num mr-1.5 text-meta text-ink-3">{slot.seed}</span> : null}
      <span className={slot.tbd || slot.teams.length === 0 ? 'text-ink-2' : 'text-ink'}>{slot.text}</span>
    </span>
  );
}

/** One bracket game: 'away at home' (or 'vs' at a fixed site), the result link once it exists. */
function BracketGame({ game }: { game: TournamentGameView }) {
  const first = game.connector === 'vs' ? game.home : game.away;
  const second = game.connector === 'vs' ? game.away : game.home;
  return (
    <div className="px-4 py-3">
      <span className="sr-only">{game.line}.</span>
      <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-body" aria-hidden="true">
        <SlotText slot={first} />
        <span className="text-meta text-ink-3">{game.connector}</span>
        <SlotText slot={second} />
      </p>
      {game.game ? (
        <p className="mt-1 mb-0 text-meta">
          <Link href={gameHref(game.game.contestId)} prefetch={false} className="sx-action text-accent hover:underline">
            {scoreSentence(game.game)}
          </Link>
        </p>
      ) : null}
      {game.note ? <p className="mt-1 mb-0 text-meta text-ink-2">{game.note}</p> : null}
    </div>
  );
}

function playInSides(game: TournamentGameView): [PlayInSide, PlayInSide] {
  const side = (slot: TournamentSlotView, host: boolean): PlayInSide => ({
    label: slot.seed !== null ? `For seed ${slot.seed}` : slot.text,
    contenders: slot.teams.map((team) => ({ team })),
    host,
  });
  // Visitor first: "visitor at host". The engine puts the host in `home`.
  return [side(game.away, false), side(game.home, true)];
}

export function LeagueTournament({ view, leagueShort, standingsHref, beforeSeeds, playInRule = null }: LeagueTournamentProps) {
  return (
    <>
      <section id="seeds" className="mt-section md:mt-section-lg">
        <SectionHeader
          kicker="Seeds"
          meta={view.seedsMeta ?? undefined}
          action={{ href: standingsHref, label: 'Full table' }}
        />
        {beforeSeeds}
        <SeedsTable view={view} leagueShort={leagueShort} />
        {view.playInSentence || view.notes.length > 0 ? (
          <ul className="mt-3 mb-0 max-w-prose list-none space-y-1 pl-0 text-meta text-ink-2">
            {view.playInSentence ? <li>{view.playInSentence}</li> : null}
            {view.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
      </section>

      {view.playIn ? (
        <section id="play-in" className="mt-section md:mt-section-lg max-w-3xl">
          <SectionHeader kicker="Play-in" meta={view.playIn.dateLabel} />
          <PlayInCard
            title={`For seed ${view.playIn.home.seed ?? ''}`.trim()}
            when={{ dateKey: view.playIn.dateKey, dateLabel: view.playIn.dateLabel, timeLabel: view.playIn.timeLabel }}
            sides={playInSides(view.playIn)}
            connector="at"
            sentence={`Play-in, ${view.playIn.dateLabel}, ${view.playIn.timeLabel}: ${view.playIn.line}.`}
            purpose={playInRule}
            notes={view.playIn.note ? [view.playIn.note] : []}
            game={view.playIn.game}
          />
        </section>
      ) : null}

      <section id="bracket" className="mt-section md:mt-section-lg">
        <SectionHeader kicker="Bracket" />
        <ol className="m-0 list-none space-y-6 p-0">
          {view.rounds.map((round) => (
            <li key={round.round}>
              <SectionHeader as="h3" kicker={round.title} meta={round.meta} />
              <ol className="sx-list sx-card sx-flush m-0 list-none p-0">
                {round.games.map((game) => (
                  <li key={game.id}>
                    <BracketGame game={game} />
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

export default LeagueTournament;
