import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import FormGoingIn from '@/components/game/FormGoingIn';
import GameDetails from '@/components/game/GameDetails';
import { GameElsewhere, SourceDisagreement } from '@/components/game/GameSources';
import SeasonSeries from '@/components/game/SeasonSeries';
import {
  buildGameModel,
  gameDescription,
  gameTitle,
} from '@/components/game/game-model';
import { OG_BASE } from '@/components/layout/site-url';
import ScoreBoard from '@/components/ui/ScoreBoard';
import { getGames } from '@/lib/data';

/**
 * `/game/[id]` — the shareable scoreboard (DESIGN §1.1, §3.5, R-4).
 *
 * A final score is the object people actually send to each other, and a `<details>` row inside a
 * date page has no URL, no OG card and nothing to land on. So every contest gets a page: both
 * monograms and records, the line score with its decider, the cleaned recap, the venue, the real
 * off-site links, both sides' form going in, the season series between these two schools, and the
 * source deep links — plus a text-only OG card so a link pasted into a group text previews the score
 * itself.
 *
 * `id` is `Game.contestId`, the MaxPreps GUID: it is the snapshot's dedupe key, so it is stable
 * across rebuilds and cannot collide on a doubleheader the way a date-and-slug id would.
 *
 * No `searchParams` anywhere, so the route stays fully static (DESIGN decision 7), and
 * `dynamicParams = false` means an id that is not in the snapshot 404s instead of being rendered on
 * demand from a snapshot that does not have it.
 */

export const dynamicParams = false;

export function generateStaticParams(): Array<{ id: string }> {
  return getGames().map((game) => ({ id: game.contestId }));
}

export async function generateMetadata({ params }: PageProps<'/game/[id]'>): Promise<Metadata> {
  const { id } = await params;
  const model = buildGameModel(id);
  if (!model) {
    return { title: 'Game not found', robots: { index: false, follow: false } };
  }
  const title = gameTitle(model);
  const description = gameDescription(model);
  return {
    title,
    description,
    alternates: { canonical: `/game/${id}` },
    openGraph: {
      // `openGraph` is REPLACED, not merged, by the nearest segment that defines it
      // (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md:1348),
      // so the shared fields are spread in here rather than inherited. `type` is the one override:
      // a single game is an article, not the site.
      ...OG_BASE,
      type: 'article',
      title,
      description,
      url: `/game/${id}`,
    },
  };
}

export default async function GamePage({ params }: PageProps<'/game/[id]'>) {
  const { id } = await params;
  const model = buildGameModel(id);
  if (!model) notFound();

  const { game, away, home, dayLabel } = model;

  return (
    <div className="py-4">
      {/* `sx-action` for the reason the day nav on /scores/[date] carries it: a standalone action
          link, alone in its own paragraph, is not covered by WCAG 2.5.8's inline exception, and at
          `text-meta` its own box is 17px tall. */}
      <p className="m-0 text-meta">
        <Link href={`/scores/${game.dateKey}`} className="sx-action text-accent hover:underline">
          <span aria-hidden="true">&larr; </span>All games on {dayLabel}
        </Link>
      </p>

      {/*
        Desktop is a 2fr / 1fr grid with the DETAILS card in the right rail, and the DOM keeps the
        PHONE order — scoreboard, recap, details, form, series, sources (DESIGN §10.5). Explicit
        row placement, not two wrapper columns, is what makes those two facts compatible: a section
        that renders nothing collapses its row to zero height, and vertical rhythm comes from
        margins rather than a row gap so a collapsed row leaves no ghost space.
      */}
      <div className="md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,20rem)] md:gap-x-8">
        <div className="mt-3 md:col-start-1 md:row-start-1">
          <h1 className="sr-only">{gameTitle(model)}</h1>
          <ScoreBoard
            game={game}
            away={{ sub: away.sub }}
            home={{ sub: home.sub }}
            className="sx-bleed px-gutter py-2 md:px-3"
          />
        </div>

        <div className="md:col-start-1 md:row-start-2">
          {game.recap ? (
            <p className="mt-3 mb-0 max-w-[62ch] text-meta text-ink-2">{game.recap}</p>
          ) : null}
          <SourceDisagreement model={model} className="mt-3" />
        </div>

        <GameDetails
          model={model}
          className="mt-8 md:col-start-2 md:row-start-1 md:row-span-5 md:mt-3 md:self-start"
        />

        <FormGoingIn model={model} className="mt-8 md:col-start-1 md:row-start-3" />
        <SeasonSeries model={model} className="mt-8 md:col-start-1 md:row-start-4" />
        <GameElsewhere model={model} className="mt-8 md:col-start-1 md:row-start-5" />
      </div>
    </div>
  );
}
