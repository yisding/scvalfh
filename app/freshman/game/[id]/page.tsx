import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import ScoreBoard, { GameFacts } from '../../../../components/game/ScoreBoard';
import { FreshmanGameDetails, FreshmanSeasonSeries } from '../../../../components/freshman/FreshmanGameSections';
import {
  buildFreshmanGameView,
  freshmanGameDescription,
  freshmanGameStaticParams,
  freshmanGameTitle,
} from '../../../../components/freshman/freshman-view';
import { OG_BASE, ROOT_OG_IMAGE } from '../../../../components/layout/site';

/**
 * `/freshman/game/[id]` — one freshman game's page: what `/jv/game/[id]` is for a JV game, kept apart from varsity
 * and the JV the same way. The line naming the league's freshman season, the scoreboard with each freshman team's
 * record over its listed freshman finals, the facts under it (the date links the day page's freshman block, or the
 * league's freshman calendar on a date with no varsity game), the notes (what a cross-level game is, and that the
 * level counts in no table), then the two teams' freshman season series beside the Details rail. It takes the root
 * OG card: the level has no card of its own.
 *
 * `id` is the game's slug as a varsity game's would be (lib/freshman/freshman.ts). Fully static: `dynamicParams =
 * false`, so a slug that is not a listed freshman game 404s, and a build without the level has no page here.
 */

export const dynamicParams = false;

export function generateStaticParams(): Array<{ id: string }> {
  return freshmanGameStaticParams();
}

export async function generateMetadata({ params }: PageProps<'/freshman/game/[id]'>): Promise<Metadata> {
  const { id } = await params;
  const model = buildFreshmanGameView(id);
  if (!model) return { title: 'Game not found', robots: { index: false, follow: false } };
  const title = freshmanGameTitle(model);
  const description = freshmanGameDescription(model);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: model.canonical },
    openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, type: 'article', title, description, url: model.canonical },
  };
}

export default async function FreshmanGamePage({ params }: PageProps<'/freshman/game/[id]'>) {
  const { id } = await params;
  const model = buildFreshmanGameView(id);
  if (!model) notFound();
  const { game, away, home, competition } = model;
  return (
    <div className="pb-section-lg">
      <div className="sx-cols">
        <div className="min-w-0">
          <p className="m-0 mt-3 text-meta text-ink-2">
            <Link href={competition.href} prefetch={false} className="sx-link inline-flex min-h-6 items-center">
              {competition.name}
            </Link>
          </p>
          <ScoreBoard game={game} away={{ sub: away.sub }} home={{ sub: home.sub }} />
          {model.recordsCaption ? <p className="sx-note mt-1">{model.recordsCaption}</p> : null}
          <GameFacts game={game} dayHref={model.dayHref} />
          {model.notes.map((note) => (
            <p key={note} className="sx-note">
              {note}
            </p>
          ))}
          <FreshmanSeasonSeries model={model} className="sx-section" />
        </div>
        <aside className="sx-rail min-w-0" aria-label="Game details">
          <FreshmanGameDetails model={model} className="sx-section" />
        </aside>
      </div>
    </div>
  );
}
