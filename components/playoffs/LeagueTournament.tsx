import Link from 'next/link';
import { Fragment } from 'react';

import { listWords, placeWords, plural, scoreSentence } from '../../lib/format';
import { gameHref } from '../../lib/game-id';
import ExternalLink from '../ui/ExternalLink';
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
  return `${team.name}, ${place} in ${leagueShort}, ${plural(standing.computed.pts, 'point')}, ${row.gpText.replace('GP', 'league games counted')}`;
}

/**
 * '37 pts' / '14/16 GP' with the unit dropped from sm, where the PTS and GP column headers name it
 * (the standings table prints bare numbers too). Below sm the PTS cell keeps it; '—' passes through.
 */
function BareFromSm({ text, unit }: { text: string; unit: string }) {
  const suffix = ` ${unit}`;
  if (!text.endsWith(suffix)) return <>{text}</>;
  return (
    <>
      {text.slice(0, -suffix.length)}
      <span className="sm:hidden">{suffix}</span>
    </>
  );
}

function SeedsTable({ view, leagueShort }: { view: TournamentView; leagueShort: string }) {
  const { seedRows, lineAfter, lineLabel } = view;
  // A full-bleed band on a phone like the CCS projection tables (`sx-bleed`): the first and last
  // visible cells take the 16px gutter (PTS below sm, GP from sm, Status's own padding from md).
  // Capped at 48rem from lg, which still holds the 13rem Status column.
  return (
    <div className="sx-card sx-flush sx-bleed lg:max-w-3xl">
      <table className="sx-table text-meta">
        <caption className="sr-only">
          {leagueShort} tournament seeds from the league table, ordered by points. Unofficial.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="w-8 pr-1 pl-gutter sm:w-10 sm:pr-2">
              #
            </th>
            <th scope="col">Team</th>
            {/* PTS and GP are fixed widths, not shrink-wrapped (`w-px`): sized by their text, a
                "9 pts" table and a "37 pts" one, or "9/16" and "14/16", put Team's edge and every
                column after it somewhere else. Each is its longest value in 13px mono (7.8px a
                glyph) plus its padding. PTS: "37 pts" (6ch) + 8 + 16 = 71 below sm, where it
                carries the unit and the gutter; "37" or the 12px head "PTS" + 8 + 8 = 39 from sm.
                GP: "14/16" (5ch) + 8 + 16 = 63 at sm, + 8 + 8 = 55 from md. */}
            <th scope="col" className="w-[4.5rem] pr-gutter pl-2 text-right tracking-normal sm:w-10 sm:pr-2">
              PTS
            </th>
            <th
              scope="col"
              className="hidden w-16 pr-gutter pl-2 text-right tracking-normal sm:table-cell md:w-14 md:pr-2"
            >
              GP
            </th>
            <th scope="col" className="hidden pr-4 pl-3 md:table-cell md:w-52">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {seedRows.map((row, index) => (
            <Fragment key={row.team.slug}>
              <tr data-team-slug={row.team.slug} className="relative" style={{ height: 56 }}>
                <td className="w-8 pr-1 pl-gutter align-middle sm:w-10 sm:pr-2">
                  <PlaceCell row={row} />
                </td>
                <th scope="row" className="pr-3 font-normal sm:pr-4 md:pr-0">
                  {/* One stretched row link per team; `prefetch={false}` like every per-row link
                      (components/layout/NavLink.tsx has the reasoning). */}
                  <Link href={`/teams/${row.team.slug}`} prefetch={false} className="absolute inset-0">
                    <span className="sr-only">
                      {/* Marked like every other team list: only the pinned row's note is
                          displayed (app/globals.css), so the accent rule never speaks alone. */}
                      <span className="sx-pin-note" hidden>Your team. </span>
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
                <td
                  className="sx-num whitespace-nowrap pr-gutter pl-2 text-right align-middle text-cell text-ink sm:pr-2"
                  aria-hidden="true"
                >
                  <BareFromSm text={row.ptsText} unit="pts" />
                </td>
                <td className="sx-num hidden whitespace-nowrap pr-gutter pl-2 text-right align-middle text-cell text-ink-2 sm:table-cell md:pr-2">
                  <BareFromSm text={row.gpText} unit="GP" />
                </td>
                <td className="hidden pr-3 pl-3 align-middle text-micro text-ink-2 sm:pr-4 md:table-cell">{row.label}</td>
              </tr>
              {lineLabel && index + 1 === lineAfter && index + 1 < seedRows.length ? (
                <tr>
                  <td colSpan={5} className="border-t-2 border-rule py-1 pl-gutter text-micro text-ink-3">
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

/** The site's winner rule (DESIGN §8: a winner row is 600 weight AND a 2px `--sx-text` left rule), as HistoryBracket and PlayoffBracket draw it. */
const WINNER_RULE = { boxShadow: 'inset 2px 0 0 var(--sx-text)' } as const;

function SlotText({ slot, decided = false, won = false }: { slot: TournamentSlotView; decided?: boolean; won?: boolean }) {
  // A seat that names its team(s) prints exactly `listWords(shortNames, 'or')` (playoff-view
  // slotView); each name then taps through to its team page, as the same teams do in the seeds
  // table above. The line is aria-hidden (the game's sr-only sentence speaks for it), so these are
  // pointer-only duplicates kept out of the tab order; the keyboard route is the seeds table's rows.
  // Any other text (a rule, "Play-in winner (A or B)") stays plain.
  const names = slot.teams.map((team) => team.shortName);
  const linked = names.length > 0 && slot.text === listWords(names, 'or');
  // Once a game is decided both sides take the rule's inset (pl-2), so the two names still line up; only the
  // winner's side draws the rule and the 600 weight. A second cue, never the only one: the result link under the
  // line says who won in words, and the sr-only sentence says who advances.
  return (
    <span className={decided ? 'min-w-0 pl-2' : 'min-w-0'} style={won ? WINNER_RULE : undefined}>
      {slot.seed !== null ? <span className="sx-num mr-1.5 text-meta text-ink-3">{slot.seed}</span> : null}
      <span className={won ? 'font-semibold text-ink' : slot.tbd || slot.teams.length === 0 ? 'text-ink-2' : 'text-ink'}>
        {linked
          ? slot.teams.map((team, i) => (
              <Fragment key={team.slug}>
                {i === 0 ? null : i === slot.teams.length - 1 ? ' or ' : ', '}
                <Link
                  href={`/teams/${team.slug}`}
                  prefetch={false}
                  tabIndex={-1}
                  className="text-ink no-underline hover:underline"
                >
                  {team.shortName}
                </Link>
              </Fragment>
            ))
          : slot.text}
      </span>
    </span>
  );
}

/**
 * One bracket game: 'away at home' (or 'vs' at a fixed site neither team calls home), the result link once it
 * exists, and the winner's side marked with the site's winner rule; the sr-only sentence adds who advances
 * ('Redwood won and advances to the final.') or who wins the tournament.
 *
 * From md the line is three columns, like the play-in card's pairing (PlayInCard): the first side,
 * a 2rem connector column, the second side. As a wrapped sentence the connector sat wherever the
 * first name ended (x = 123, 180, 181, 274 and 326 across MCAL's five games at 768), so no two
 * games' second sides lined up. Below md the sentence still wraps, but the connector travels with
 * the second side as one unit (a hanging indent under "at" when that side itself wraps), so a line
 * never ends on "at": at 390 two games did.
 */
function BracketGame({ game }: { game: TournamentGameView }) {
  const firstSide = game.connector === 'vs' ? 'home' : 'away';
  const secondSide = firstSide === 'home' ? 'away' : 'home';
  const first = game[firstSide];
  const second = game[secondSide];
  const decided = game.winner !== null;
  return (
    <div className="px-4 py-3">
      <span className="sr-only">{game.outcome ? `${game.line}. ${game.outcome}` : `${game.line}.`}</span>
      <p
        className="m-0 flex flex-wrap items-baseline gap-x-2 text-body md:grid md:grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)]"
        aria-hidden="true"
      >
        <SlotText slot={first} decided={decided} won={game.winner === firstSide} />
        <span className="flex min-w-0 items-baseline gap-x-2 md:contents">
          <span className="shrink-0 text-meta text-ink-3 md:text-center">{game.connector}</span>
          <SlotText slot={second} decided={decided} won={game.winner === secondSide} />
        </span>
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
          // Capped like the seeds table below, so "Full table" sits over it.
          className="lg:max-w-3xl"
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
        <section id="play-in" className="mt-section md:mt-section-lg">
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
            className="max-w-3xl"
          />
        </section>
      ) : null}

      <section id="bracket" className="mt-section md:mt-section-lg">
        <SectionHeader kicker="Bracket" />
        {/* A bracket line is ~220px of text: from md the rounds stop at 48rem rather than run the
            full column. */}
        <ol className="m-0 list-none space-y-6 p-0 md:max-w-3xl">
          {view.rounds.map((round) => (
            <li key={round.round}>
              <SectionHeader as="h3" kicker={round.title} meta={round.meta} />
              {/* The final's where and how much (config finalSite): the venue and address as one sentence with a
                  Directions link, then admission with its source. Whole sentences as single text nodes. */}
              {round.venue ? (
                <div className="mb-3 max-w-prose text-meta text-ink-2">
                  <p className="m-0">
                    {`${round.venue.name}, ${round.venue.addressLine}.`}{' '}
                    <ExternalLink href={round.venue.directionsHref} className="sx-action gap-1">
                      Directions
                    </ExternalLink>
                  </p>
                  {round.venue.admission ? (
                    <p className="mt-1 mb-0">
                      {`Admission: ${round.venue.admission}${round.venue.admissionSource ? ` (${round.venue.admissionSource})` : ''}`}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {/* `my-0`, not `m-0`: a margin shorthand would cancel `sx-bleed`'s negative inline margin. */}
              <ol className="sx-list sx-card sx-flush sx-bleed my-0 list-none p-0">
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
