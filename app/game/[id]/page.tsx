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
    <div className="pb-section-lg">
      {/* A standalone action back to the day: a 44px pill-shaped target (WCAG 2.5.8), pulled
          left by its own padding so the arrow lines up with the gutter. */}
      <p className="m-0">
        <Link
          href={`/scores/${game.dateKey}`}
          className="sx-action -ml-3 mt-4 min-h-11 rounded-full px-3 text-meta font-medium text-accent no-underline hover:bg-surface-2"
        >
          <span aria-hidden="true" className="mr-1.5">
            &larr;
          </span>
          All games on {dayLabel}
        </Link>
      </p>

      {/*
        Desktop puts the DETAILS card in a right rail beside the main column, and the DOM keeps the
        PHONE order — scoreboard, recap, details, form, series, sources (DESIGN §10.5). Explicit
        row placement, not two wrapper columns, is what makes those two facts compatible: a section
        that renders nothing collapses its row to zero height, and vertical rhythm comes from
        margins rather than a row gap so a collapsed row leaves no ghost space.
      */}
      <div className="mt-2 md:grid md:grid-cols-[minmax(0,1fr)_20rem] md:gap-x-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-x-10">
        <div className="md:col-span-2 md:row-start-1">
          <h1 className="sr-only">{gameTitle(model)}</h1>
          <ScoreBoard game={game} away={{ sub: away.sub }} home={{ sub: home.sub }} />
        </div>

        <div className="md:col-start-1 md:row-start-2">
          {game.recap ? (
            <p className="mt-6 mb-0 max-w-prose text-body text-ink-2">{game.recap}</p>
          ) : null}
          <SourceDisagreement model={model} className="mt-4" />
        </div>

        <GameDetails
          model={model}
          className="mt-section md:sticky md:top-[5rem] md:col-start-2 md:row-span-4 md:row-start-2 md:mt-6 md:self-start"
        />

        <FormGoingIn
          model={model}
          className="mt-section md:col-start-1 md:row-start-3 md:mt-section-lg"
        />
        <SeasonSeries
          model={model}
          className="mt-section md:col-start-1 md:row-start-4 md:mt-section-lg"
        />
        <GameElsewhere
          model={model}
          className="mt-section md:col-start-1 md:row-start-5 md:mt-section-lg"
        />
      </div>
    </div>
  );
}
