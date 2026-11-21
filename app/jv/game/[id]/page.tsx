import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import ScoreBoard, { GameFacts } from '../../../../components/game/ScoreBoard';
import { JvGameDetails, JvSeasonSeries, JvVarsityGame } from '../../../../components/jv/JvGameSections';
import { buildJvGameView, jvGameDescription, jvGameStaticParams, jvGameTitle } from '../../../../components/jv/jv-game-view';
import { OG_BASE } from '../../../../components/layout/site';

/**
 * `/jv/game/[id]` — one JV game's page: what `/game/[id]` is for a varsity game, kept apart from varsity.
 *
 * Top to bottom: the line naming the JV competition (its JV table on /jv, or the league's JV season), the
 * scoreboard with each JV team's record over its listed JV finals, the facts under it (the date links the day's
 * JV block, or the league's JV season on a date with no varsity game), the notes a reader must not miss (a score
 * another source reports differently, York in Santa Catalina's slot, a game listed from the league's schedule),
 * then the varsity game played beside it and the two JV teams' season series, beside the Details rail.
 *
 * `id` is the game's slug as a varsity game's would be (`2026-10-06-carmel-at-salinas`, `-2` on a same-day
 * pair's second game: components/jv/jv-game-view.ts, lib/jv/jv.ts). Fully static: `dynamicParams = false`, so a
 * slug that is not a listed JV game 404s.
 */

export const dynamicParams = false;

export function generateStaticParams(): Array<{ id: string }> {
  return jvGameStaticParams();
}

export async function generateMetadata({ params }: PageProps<'/jv/game/[id]'>): Promise<Metadata> {
  const { id } = await params;
  const model = buildJvGameView(id);
  if (!model) return { title: 'Game not found', robots: { index: false, follow: false } };
  const title = jvGameTitle(model);
  const description = jvGameDescription(model);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: model.canonical },
    openGraph: { ...OG_BASE, type: 'article', title, description, url: model.canonical },
  };
}

export default async function JvGamePage({ params }: PageProps<'/jv/game/[id]'>) {
  const { id } = await params;
  const model = buildJvGameView(id);
  if (!model) notFound();
  const { game, away, home, competition } = model;
  return (
    <div className="pb-section-lg">
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
          </p>
          <ScoreBoard game={game} away={{ sub: away.sub }} home={{ sub: home.sub }} />
          {model.recordsCaption ? <p className="sx-note mt-1">{model.recordsCaption}</p> : null}
          <GameFacts game={game} dayHref={model.dayHref} />
          {model.notes.map((note) => (
            <p key={note} className="sx-note">
              {note}
            </p>
          ))}
          <JvVarsityGame model={model} className="sx-section" />
          <JvSeasonSeries model={model} className="sx-section" />
        </div>
        <aside className="sx-rail min-w-0" aria-label="Game details">
          <JvGameDetails model={model} className="sx-section" />
        </aside>
      </div>
    </div>
  );
}
