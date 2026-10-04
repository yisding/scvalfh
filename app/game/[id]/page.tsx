import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import FormGoingIn from '../../../components/game/FormGoingIn';
import GameDetails from '../../../components/game/GameDetails';
import {
  GameElsewhere,
  GameSourceLine,
  ResultFlagConflict,
  SourceDisagreement,
} from '../../../components/game/GameSources';
import SeasonSeries from '../../../components/game/SeasonSeries';
import {
  buildGameModel,
  buildSupersededStub,
  gameDescription,
  gameStaticParams,
  gameTitle,
} from '../../../components/game/game-model';
import { OG_BASE } from '../../../components/layout/site-url';
import Arrow from '../../../components/ui/Arrow';
import ExternalLink from '../../../components/ui/ExternalLink';
import ScoreBoard from '../../../components/ui/ScoreBoard';

/**
 * `/game/[id]` — the shareable scoreboard (DESIGN §1.1, §3.5, R-4).
 *
 * A final score is the object people actually send to each other, and a `<details>` row inside a
 * date page has no URL, no OG card and nothing to land on. So every contest gets a page: both
 * monograms and their league records as of that game, the line score with its decider, the cleaned
 * recap with the result links under it, the venue, the real off-site links, routes to both team
 * pages, both sides' form going in, the season series between these two schools, and the source
 * deep links — plus a text-only OG card so a link pasted into a group text previews the score
 * itself.
 *
 * `id` is `gameIdToParam(Game.contestId)`: the MaxPreps GUID itself (the snapshot's dedupe key, so
 * it is stable across rebuilds and cannot collide on a doubleheader), or `sblive-<n>` for a game
 * only si.com has (owner decision D2; the contest id `sblive:<n>` has a ':' no path should carry).
 * `buildGameModel` runs `paramToGameId` first. A `supersededGames` key — a si.com game MaxPreps has
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
  const model = buildGameModel(id);
  if (!model) {
    const stub = buildSupersededStub(id);
    if (stub) {
      return {
        title: stub.targetModel ? gameTitle(stub.targetModel) : 'Game moved to MaxPreps',
        description: stub.sentence,
        alternates: { canonical: stub.targetHref },
        robots: { index: false, follow: true },
      };
    }
    return { title: 'Game not found', robots: { index: false, follow: false } };
  }
  const title = gameTitle(model);
  const description = gameDescription(model);
  return {
    title,
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

export default async function GamePage({ params }: PageProps<'/game/[id]'>) {
  const { id } = await params;
  const model = buildGameModel(id);
  if (!model) {
    const stub = buildSupersededStub(id);
    if (!stub) notFound();
    return (
      <div className="pb-section-lg">
        <h1 className="mt-6 mb-0 text-h1 text-ink">{stub.sentence}</h1>
        <p className="mt-4 mb-0">
          <Link
            href={stub.targetHref}
            className="sx-pill min-h-11 bg-surface text-accent shadow-[var(--sx-ring)] hover:bg-surface-2"
          >
            {stub.targetModel ? gameTitle(stub.targetModel) : 'The MaxPreps game'} <Arrow />
          </Link>
        </p>
        <p className="mt-4 mb-0 max-w-prose text-meta text-ink-3">
          This page held a score published from High School on SI (si.com) while MaxPreps had no
          contest for the game. MaxPreps has it now, so the game&rsquo;s page is the MaxPreps one.
        </p>
      </div>
    );
  }

  const { game, away, home, dayLabel, resultLinks, recordsCaption } = model;
  // Away first, like the scoreboard; an opponent outside the registry has no page here to link to
  // (DESIGN §8).
  const teamLinks = [away, home].flatMap((side) => (side.team ? [side.team] : []));
  // Does the main column's row 2 (recap · result links · source line · postseason notes · source
  // disagreement · result-flag conflict) render anything? The DETAILS rail starts in that row, so
  // it takes the recap's 24px top margin when the row is there and the section margin when it is
  // not: either way its top lines up with the first thing in the left column — the recap, or the
  // FORM GOING IN heading (F-27c).
  const leadRow =
    Boolean(game.recap) ||
    resultLinks.length > 0 ||
    Boolean(model.source) ||
    model.postseasonNotes.length > 0 ||
    Boolean(model.scoreNote) ||
    Boolean(model.conflict) ||
    Boolean(model.resultConflictNote);

  return (
    <div className="pb-section-lg">
      {/* Routes out of the page (F-31): back to the day, then each registry side's team page, away
          first. Every one is a standalone 44px target (WCAG 2.5.8). Only the first is pulled left
          by its own padding so its arrow lines up with the gutter; the team pills have a visible
          capsule, which a negative margin would push into the gutter. They sit on the canvas,
          where the plain `sx-pill` fill (surface-2) barely separates from the page, so they are
          raised to the surface with the hairline ring and hover down to surface-2 (F-56g). The
          label is the team's SHORT name ("Mitty") and the capsule takes 12px of side padding
          rather than the pill's 16, which keeps most pairings on one line at 390. The two team
          pills wrap as ONE group, so when the row does not fit (St Ignatius at St Francis at 390,
          anything long at 320) they drop to a second line together instead of stranding the home
          pill alone. */}
      <p className="m-0 mt-4 flex flex-wrap items-center gap-2">
        <Link
          href={`/scores/${game.dateKey}`}
          className="sx-action -ml-3 min-h-11 rounded-full px-3 text-meta font-medium text-accent no-underline hover:bg-surface-2"
        >
          <Arrow dir="left" className="mr-1.5" />
          {dayLabel} games
        </Link>
        {teamLinks.length > 0 ? (
          <span className="flex flex-wrap gap-2">
            {teamLinks.map((team) => (
              <Link
                key={team.slug}
                href={`/teams/${team.slug}`}
                prefetch={false}
                className="sx-pill min-h-11 bg-surface px-3 shadow-[var(--sx-ring)] hover:bg-surface-2"
              >
                {team.shortName}
                <span aria-hidden="true"> &rsaquo;</span>
                <span className="sr-only"> team page</span>
              </Link>
            ))}
          </span>
        ) : null}
      </p>

      {/*
        From 1024px the DETAILS card sits in a right rail beside the main column, and the DOM keeps
        the PHONE order — scoreboard, recap, details, form, series, sources (DESIGN §10.5). Explicit
        row placement, not two wrapper columns, is what makes those two facts compatible: a section
        that renders nothing collapses its row to zero height, and vertical rhythm comes from
        margins rather than a row gap so a collapsed row leaves no ghost space.

        Deviation from DESIGN §3.5 (F-17): the spec put the rail beside the column from 768. In the
        768–1023 band that left a ~400px main column — narrower than a phone held sideways — so the
        season-series rows wrapped to two lines and each form strip dropped below its team name.
        The tablet band is one column instead, with the DETAILS facts laid out 3-up across the full
        width (GameDetails).
      */}
      <div className="mt-3 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-x-10">
        <div className="lg:col-span-2 lg:row-start-1">
          <h1 className="sr-only">{gameTitle(model)}</h1>
          <p className="m-0 mb-2 text-meta font-medium text-ink-3">{model.contextLabel}</p>
          <ScoreBoard game={game} away={{ sub: away.sub }} home={{ sub: home.sub }} />
          {/* The records on the board are AS OF this game (G-1), so say which moment they are
              from: on a September final, today's record would sit beside a score it already
              counts several games back. Centred from 768, where the board itself is centred. */}
          {recordsCaption ? (
            <p className="mt-3 mb-0 text-micro text-ink-3 md:text-center">{recordsCaption}</p>
          ) : null}
        </div>

        <div className="lg:col-start-1 lg:row-start-2">
          {game.recap ? (
            <p className="mt-6 mb-0 max-w-prose text-body text-ink-2">{game.recap}</p>
          ) : null}
          {/* A final's result links live HERE, directly under the recap (F-73/F-85): on a phone they
              are above the tab bar rather than at the foot of the DETAILS card, and they appear
              once on the page (GameDetails and GameElsewhere leave them out; only the
              disagreement notes below cite a source page again). The accent pill is the source
              the score came from. */}
          {resultLinks.length > 0 ? (
            <p className={game.recap ? 'mt-4 mb-0 flex flex-wrap gap-2' : 'mt-6 mb-0 flex flex-wrap gap-2'}>
              {resultLinks.map((link) => (
                <ExternalLink
                  key={link.href}
                  href={link.href}
                  // ExternalLink adds a `text-accent` utility, which would beat the pill's
                  // accent-ink (accent on the wash is 4.37:1 in dark); `!` keeps accent-ink. The
                  // plain pill sits on the canvas, so it takes the raised surface fill (F-56g).
                  className={
                    link.accent
                      ? 'sx-pill sx-pill-accent text-accent-ink!'
                      : 'sx-pill bg-surface shadow-[var(--sx-ring)] hover:bg-surface-2'
                  }
                >
                  {link.label}
                </ExternalLink>
              ))}
            </p>
          ) : null}
          <GameSourceLine model={model} className="mt-4" />
          {model.postseasonNotes.length > 0 || model.scoreNote ? (
            <div className="mt-4 max-w-prose text-meta text-ink-2">
              {[...model.postseasonNotes, ...(model.scoreNote ? [model.scoreNote] : [])].map((note) => (
                <p key={note} className="m-0">
                  {note}
                </p>
              ))}
            </div>
          ) : null}
          <SourceDisagreement model={model} className="mt-4" />
          <ResultFlagConflict model={model} className="mt-4" />
        </div>

        {/* Sticky only when the viewport is tall enough to hold it: the card is up to ~510px,
            +80px of offset, and a sticky box taller than the viewport can never scroll its last
            links into view (a focused link pill sat below a 488px-tall window). The two class
            strings differ only in the top margin — see `leadRow`. */}
        <GameDetails
          model={model}
          className={
            leadRow
              ? 'mt-section lg:col-start-2 lg:row-span-4 lg:row-start-2 lg:mt-6 lg:self-start [@media(min-width:1024px)_and_(min-height:40rem)]:sticky [@media(min-width:1024px)_and_(min-height:40rem)]:top-[5rem]'
              : 'mt-section lg:col-start-2 lg:row-span-4 lg:row-start-2 lg:mt-section-lg lg:self-start [@media(min-width:1024px)_and_(min-height:40rem)]:sticky [@media(min-width:1024px)_and_(min-height:40rem)]:top-[5rem]'
          }
        />

        <FormGoingIn
          model={model}
          className="mt-section md:mt-section-lg lg:col-start-1 lg:row-start-3"
        />
        <SeasonSeries
          model={model}
          className="mt-section md:mt-section-lg lg:col-start-1 lg:row-start-4"
        />
        <GameElsewhere
          model={model}
          className="mt-section md:mt-section-lg lg:col-start-1 lg:row-start-5"
        />
      </div>
    </div>
  );
}
