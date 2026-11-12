import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import FormGoingIn from '../../../components/game/FormGoingIn';
import GameDetails from '../../../components/game/GameDetails';
import GameStats from '../../../components/game/GameStats';
import { GameSourceLine, ResultFlagConflict, SourceDisagreement } from '../../../components/game/GameSources';
import SeasonSeries from '../../../components/game/SeasonSeries';
import {
  buildGameView,
  buildSupersededStub,
  gameDescription,
  gameStaticParams,
  gameTitle,
} from '../../../components/game/game-view';
import JsonLd from '../../../components/metadata/JsonLd';
import { BUILD_INSTANT } from '../../../components/layout/build-instant';
import LastUpdated from '../../../components/layout/LastUpdated';
import { OG_BASE } from '../../../components/layout/site';
import { gameJsonLd } from '../../../components/metadata/structured-data';
import { getBracketPlace } from '../../../components/playoffs/bracket-place';
import SectionHeader from '../../../components/ui/SectionHeader';
import ScoreBoard, { GameFacts } from '../../../components/game/ScoreBoard';
import { getFetchedAt } from '../../../lib/data';
import { localDateKey } from '../../../lib/format';

/**
 * `/game/[id]` — the shareable scoreboard (DESIGN §33, §1.1, R-4).
 *
 * A final score is the object people actually send to each other, so every contest gets a page.
 * Top to bottom: one line naming the competition (its bracket or its standings linked), the
 * scoreboard (ScoreBoard: the status, both sides with their records as of that game, the score),
 * the facts under it (GameFacts: the date as the link back to that score day, the place, the
 * score's source), the notes a reader must not miss (a score from another source, a disagreement
 * between sources, what a postseason game does not count for), then the main column (next round,
 * season series, last 5 games, game stats) beside the Details rail (address, off-site links, what
 * the game counts for, Report an error) — plus a text-only OG card so a link pasted into a group
 * text previews the score itself. List rows no longer expand, so every off-site link a row used
 * to offer (Directions, Stream, Tickets, the MaxPreps game) is in Details.
 *
 * `id` is `gameIdToParam(Game.contestId)`: the MaxPreps GUID itself (the snapshot's dedupe key, so
 * it is stable across rebuilds and cannot collide on a doubleheader), or `sblive-<n>` for a game
 * only si.com has (owner decision D2; the contest id `sblive:<n>` has a ':' no path should carry).
 * `buildGameView` runs `paramToGameId` first. A `supersededGames` key — a si.com game MaxPreps has
 * since published — is prerendered as a stub that links (and is canonical to) the MaxPreps game
 * (SPEC §8.1). The OG image's params are exactly these params (`gameStaticParams`).
 *
 * No `searchParams` anywhere, so the route stays fully static (DESIGN decision 7), and
 * `dynamicParams = false` means an id that is not in the snapshot 404s instead of being rendered on
 * demand from a snapshot that does not have it.
 */

export const dynamicParams = false;

export function generateStaticParams(): Array<{ id: string }> {
  return gameStaticParams();
}

export async function generateMetadata({ params }: PageProps<'/game/[id]'>): Promise<Metadata> {
  const { id } = await params;
  const model = buildGameView(id);
  if (!model) {
    const stub = buildSupersededStub(id);
    if (stub) {
      const title = stub.targetModel ? gameTitle(stub.targetModel) : 'Game moved to MaxPreps';
      return {
        // Absolute when it is the target game's title, which names the sport (as on the game page below).
        title: stub.targetModel ? { absolute: title } : title,
        description: stub.sentence,
        // The canonical alone says "index the MaxPreps game instead". It used to come with
        // `noindex, follow`, and the two contradict each other: Google's duplicate-URL guidance is
        // not to noindex a page whose canonical points elsewhere, since the noindex can be carried
        // over to the target. The stub stays out of the sitemap (app/sitemap.ts).
        alternates: { canonical: stub.targetHref },
        // The title stated, not inherited with the site-name suffix (components/layout/site.ts OG_BASE).
        openGraph: { ...OG_BASE, title },
      };
    }
    return { title: 'Game not found', robots: { index: false, follow: false } };
  }
  const title = gameTitle(model);
  const description = gameDescription(model);
  return {
    // Absolute: the title already names the sport (gameTitle), and the layout's "— NorCal HS Field
    // Hockey" would repeat it and push a matchup's title to ~80 characters; og:site_name and the
    // WebSite markup on / carry the brand.
    title: { absolute: title },
    description,
    alternates: { canonical: model.canonical },
    openGraph: {
      // `openGraph` is REPLACED, not merged, by the nearest segment that defines it
      // (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md:1348),
      // so the shared fields are spread in here rather than inherited. `type` is the one override:
      // a single game is an article, not the site.
      ...OG_BASE,
      type: 'article',
      title,
      description,
      url: model.canonical,
    },
  };
}

/** `SCVAL · De Anza` → `SCVAL De Anza`; `City · City Western` → `City Western` (the division already names its league). */
function leagueWords(contextLabel: string): string {
  const [league, division] = contextLabel.split(' · ');
  if (!division) return contextLabel;
  return division.startsWith(league) ? division : `${league} ${division}`;
}

export default async function GamePage({ params }: PageProps<'/game/[id]'>) {
  const { id } = await params;
  const model = buildGameView(id);
  if (!model) {
    const stub = buildSupersededStub(id);
    if (!stub) notFound();
    return (
      <div className="pb-section-lg">
        <h1 className="mt-6 mb-0">{stub.sentence}</h1>
        <p className="mt-4 mb-0">
          <Link href={stub.targetHref} className="sx-action">
            {stub.targetModel ? gameTitle(stub.targetModel) : 'The MaxPreps game'}
          </Link>
        </p>
      </div>
    );
  }

  const { game, away, home, display } = model;
  // A postseason game's place in its bracket (components/playoffs/bracket-place.ts): its round in words, what its
  // winner plays next, and the link to its card on /playoffs.
  const place = getBracketPlace(game);
  // The line over the board: the competition, linked to its bracket or its standings, then the round.
  // `CCS Division 1 quarterfinal · 7 v 2` is the bracket's name (the link), the round, and the two seeds, away first,
  // which the board prints after the names.
  const bracketName = place?.link.division ?? null;
  const seedPair = / · (\d+) v (\d+)$/.exec(place?.round ?? '');
  const roundWords = (place?.round ?? '').replace(/ · \d+ v \d+$/, '');
  const competition: { name: string; href: string | null; round: string | null } = place
    ? bracketName && roundWords.startsWith(bracketName)
      ? { name: bracketName, href: place.link.href, round: roundWords.slice(bracketName.length).trim() || null }
      : { name: model.contextLabel, href: place.link.href, round: place.round ? roundWords : null }
    : model.division && model.league
      ? { name: leagueWords(model.contextLabel), href: `/standings/${model.league.id}#${model.division}`, round: null }
      : { name: model.contextLabel, href: null, round: null };
  // "Next round" is a section when a later round exists; a final's "X won CCS Division 1." is a note under the board.
  const nextRound = place?.next && / (plays|goes on to) /.test(place.next) ? place.next : null;
  const wonNote = place?.next && !nextRound ? place.next : null;
  // What the game counts for is said ONCE, in Details (`countsAs.detail`); the notes here are the rest.
  const notes = [
    ...(wonNote ? [wonNote] : []),
    ...model.postseasonNotes.filter((note) => note !== model.countsAs.detail),
    ...(model.scoreNote ? [model.scoreNote] : []),
  ];
  // The short stamp sits with the facts while the score can still change: a live game, or one still to play today.
  const fresh =
    game.status === 'live' || (display.kind === 'scheduled' && game.dateKey === localDateKey(BUILD_INSTANT));

  return (
    <div className="pb-section-lg">
      <JsonLd data={gameJsonLd(model)} />
      {/* Main column + rail from 768 (`.sx-cols`); below that Details follows the main column. The board
          is the first thing IN the main column, so the rail starts level with it and the top right of
          the first screen is not empty. A section that renders nothing leaves no gap: each brings its own 40px. */}
      <div className="sx-cols">
        <div className="min-w-0">
          <p className="m-0 mt-3 text-meta text-ink-2">
            {competition.href ? (
              <Link href={competition.href} prefetch={false} className="sx-link inline-flex min-h-6 items-center">
                {competition.name}
              </Link>
            ) : (
              competition.name
            )}
            {competition.round ? `, ${competition.round}` : ''}
          </p>
          <ScoreBoard
            game={game}
            away={{ sub: away.sub, seed: seedPair ? Number(seedPair[1]) : null }}
            home={{ sub: home.sub, seed: seedPair ? Number(seedPair[2]) : null }}
          />
          <GameFacts
            game={game}
            stamp={fresh ? <LastUpdated at={getFetchedAt()} now={BUILD_INSTANT} variant="time" /> : undefined}
          />
          {notes.map((note) => (
            <p key={note} className="sx-note">
              {note}
            </p>
          ))}
          <GameSourceLine model={model} className="mt-4" />
          <SourceDisagreement model={model} className="mt-4" />
          <ResultFlagConflict model={model} className="mt-4" />

          {nextRound && place ? (
            <section className="sx-section" aria-labelledby="game-next-kicker">
              <SectionHeader
                kicker="Next round"
                id="game-next-kicker"
                action={{ href: place.link.href, label: /bracket/i.test(place.link.label) ? 'Bracket' : place.link.label }}
              />
              <p className="m-0 text-body text-ink">{nextRound}</p>
            </section>
          ) : null}
          <SeasonSeries model={model} className="sx-section" />
          <FormGoingIn model={model} className="sx-section" />
          <GameStats model={model} className="sx-section" />
        </div>
        <aside className="sx-rail min-w-0" aria-label="Game details">
          <GameDetails model={model} className="sx-section" />
        </aside>
      </div>
    </div>
  );
}
