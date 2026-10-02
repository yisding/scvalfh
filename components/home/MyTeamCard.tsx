'use client';

import { useEffect, useRef } from 'react';

import Link from 'next/link';

import ExternalLink from '../ui/ExternalLink';
import FormStrip from '../ui/FormStrip';
import ResultChip from '../ui/ResultChip';
import { ScoreGlyph } from '../ui/ScoreCell';
import SectionHeader from '../ui/SectionHeader';
import StatusLabel from '../ui/StatusLabel';
import TeamMonogram from '../ui/TeamMonogram';
import type { SideView } from '../ui/game-view';
import { usePinnedTeam } from '../ui/use-pinned-team';

import type { HomeTeamView } from './home-types';
import { pickerName, pinLabel } from './pin-label';

/**
 * The pinned-team fold (DESIGN §3.1, §7.12) — the one optional personalization on the site.
 *
 * ZERO LAYOUT SHIFT, which is the whole reason this component is shaped the way it is. The server
 * cannot know what is pinned (the pin is `localStorage['scvalfh.pinnedTeam']`, and nothing leaves
 * the browser), so the slot RESERVES THE SAME HEIGHT in all three states — pinned, not pinned, and
 * storage unavailable — and only its contents swap after hydration. CLS is therefore exactly 0
 * rather than "small".
 *
 * That is a deliberate deviation from §3.1's two different heights (240px card / 88px prompt):
 * those two numbers cannot both be honoured without a visible reflow the moment storage is read.
 * The reserved space is not a gap — the unpinned state is a 15-team picker, so "find my school"
 * (a top-three task) is answered in the fold instead of costing a trip to /teams.
 *
 * Every storage access is inside `try/catch` (see components/ui/local-store.ts). When storage is
 * blocked the picker is replaced by one sentence saying so and the page stays completely correct;
 * when the stored slug is no longer in the snapshot it is cleared and reported in words.
 * Before hydration — and with JavaScript off — each tile is a LINK to the team page rather than a
 * dead button.
 */
/**
 * One picker tile: a 48px borderless surface-2 key at every width (two lines of name fit).
 *
 * Below 360px the tile's own padding drops to 4px (and the grid gap and the card's padding by 2px
 * and 4px, in `PinPrompt`), which hands the NAME back 12px: 62px at 320 instead of 50. At 50px
 * six single-word names (Fremont, Cupertino, Saratoga, Lynbrook…) split mid-word as "Fremon / t";
 * at 62 every name fits whole or breaks at its space or soft hyphen (`pickerName`).
 */
const TILE =
  'sx-tap flex h-12 w-full min-w-0 items-center gap-1.5 rounded-card bg-surface-2 px-1 text-left ' +
  'min-[360px]:px-2 hover:bg-surface-3';

/**
 * Two lines, never `truncate`: a school name in a picker has to be readable, and at 320px a
 * one-line tile gave each name 28px — "St …" for BOTH St Ignatius and St Francis, "Lo…" for both
 * Los Altos and Los Gatos. A picker whose labels are not distinguishable is not a picker.
 *
 * Where the second line BEGINS is `pickerName`'s job (components/home/pin-label.ts): the two names
 * with no space to break at carry soft hyphens, because `hyphens-auto` is inert on a capitalised
 * word in Chromium. `break-words` stays as the last resort for a name that has neither.
 */
const TILE_NAME = 'sx-clamp-2 min-w-0 flex-1 hyphens-auto break-words text-micro text-ink';

export interface MyTeamCardProps {
  /** All 15, pre-serialized by the server. */
  views: HomeTeamView[];
}

/** An in-card label ("Last", "Next", "Form"): 12px sans, sentence case, ink-3. Not a heading. */
function Kicker({ children }: { children: React.ReactNode }) {
  return <span className="text-micro font-medium text-ink-3">{children}</span>;
}

/**
 * One line of the last game: `[chip] name … score`, my team first. Nothing trails the score, so
 * the two numbers stack in one column (the status word sits on the "Last" line above instead).
 */
function ScoreLine({ side }: { side: SideView }) {
  return (
    <span className="flex h-6 items-center gap-2">
      <ResultChip kind={side.chip} size={20} />
      <span
        className={`min-w-0 flex-1 truncate text-body ${
          side.weight === 'winner' ? 'font-semibold text-ink' : 'text-ink-2'
        }`}
      >
        {side.name}
      </span>
      <span className="w-8 shrink-0 text-right">
        <ScoreGlyph side={side} size="score" />
      </span>
    </span>
  );
}

/** Exported so the two states can be rendered and inspected without a browser. */
export function PinnedCard({
  view,
  onUnpin,
  unpinRef,
}: {
  view: HomeTeamView;
  onUnpin: () => void;
  /** Focus lands here after a pin, so the keyboard is not dropped at the top of the document. */
  unpinRef?: React.Ref<HTMLButtonElement>;
}) {
  const { team, last, next } = view;
  const [first, second] = last
    ? last.mineIsHome
      ? [last.display.home, last.display.away]
      : [last.display.away, last.display.home]
    : [null, null];

  return (
    <article
      /* 2px accent left rule = the pinned team (DESIGN §4.4). */
      className="sx-pinned flex h-full flex-col bg-surface px-4 py-3 md:px-5"
      aria-label={`My team: ${team.name}`}
    >
      <div className="flex h-11 shrink-0 items-center gap-2">
        <TeamMonogram team={team} size={24} />
        {/* Both strings truncate: the card's height is fixed, so nothing here may wrap. The meta
            is read place-first ("4th · De Anza · Eagles"), and keeps at least 4.5rem against a
            long school name, so a 320px truncation cuts the mascot and never the standing. */}
        <Link
          href={`/teams/${team.slug}`}
          className="min-w-0 truncate text-lead font-semibold text-ink no-underline hover:underline"
        >
          {team.name}
        </Link>
        <span className="min-w-[4.5rem] flex-1 truncate text-meta text-ink-3">
          {view.meta.split(' · ').reverse().join(' · ')}
        </span>
        <button ref={unpinRef} type="button" onClick={onUnpin} className="sx-pill shrink-0">
          Unpin<span className="sr-only"> {team.name}</span>
        </button>
      </div>

      <div className="flex-1 border-t border-divider pt-2">
        <div className="flex items-baseline justify-between gap-2">
          <Kicker>Last</Kicker>
          {last ? (
            <span className="flex items-baseline gap-2">
              {/* The status word, on the date line rather than after the second score (where it
                  pushed that score 48px left of the first). Hidden from assistive tech: the
                  link below already says "final" in its accessible name. */}
              <span aria-hidden="true">
                <StatusLabel display={last.display} />
              </span>
              <time dateTime={last.dateTime} className="sx-num text-meta text-ink-3">
                {last.dateLabel}
              </time>
            </span>
          ) : null}
        </div>
        {last && first && second ? (
          /* One focusable link whose accessible name is the whole score sentence, so a screen
             reader hears "Saint Francis 10, Homestead 0, final." and not a pile of glyphs. */
          <Link
            href={last.href}
            className="mt-0.5 block no-underline"
            aria-label={`${last.display.sentence}${last.recap ? ` ${last.recap}` : ''}`}
          >
            <span aria-hidden="true">
              <ScoreLine side={first} />
              <ScoreLine side={second} />
              {/* h-10 = two 20px lines: the old h-9 shaved the descenders off the second one. */}
              <span className="sx-clamp-2 mt-1 block h-10 text-meta text-ink-2">
                {last.recap ?? last.display.note ?? ''}
              </span>
            </span>
          </Link>
        ) : (
          <p className="mt-1 mb-0 text-meta text-ink-2">
            {view.hasResults
              ? 'No completed game yet this season.'
              : `No results reported for ${team.name} yet. Their schedule is still on the schedule page.`}
          </p>
        )}
      </div>

      <div className="shrink-0 border-t border-divider pt-2">
        <div className="flex items-baseline justify-between gap-2">
          <Kicker>Next</Kicker>
          {next ? (
            <time dateTime={next.dateTime} className="sx-num text-meta text-ink-3">
              {next.dateLabel} &middot; {next.timeLabel} &middot;{' '}
              {next.isLeague ? 'league' : 'non-league'}
            </time>
          ) : view.officialNext ? (
            <time dateTime={view.officialNext.dateKey} className="sx-num text-meta text-ink-3">
              {view.officialNext.dateLabel} &middot; per SCVAL
            </time>
          ) : null}
        </div>
        {next ? (
          <>
            <Link
              href={next.href}
              className="block truncate text-lead font-semibold text-ink no-underline hover:underline"
            >
              {next.versus} {next.opponent}
            </Link>
            <p className="mt-2 mb-2 flex gap-2">
              {next.links.map((l) =>
                l.external ? (
                  <ExternalLink key={l.href} href={l.href} className="sx-pill">
                    {l.label}
                  </ExternalLink>
                ) : (
                  // `prefetch={false}`, the rule the picker tiles below and the nav already follow
                  // (components/layout/NavLink.tsx): a static route is prefetched in FULL on
                  // viewport entry, and this row is one chip per link on a card that is the first
                  // thing above the fold. Navigation still fetches on click.
                  <Link key={l.href} href={l.href} prefetch={false} className="sx-pill">
                    {l.label}
                  </Link>
                ),
              )}
            </p>
          </>
        ) : view.officialNext ? (
          <>
            <p className="m-0 truncate text-lead font-semibold text-ink">
              {view.officialNext.versus} {view.officialNext.opponent}
            </p>
            <p className="mt-0.5 mb-1 text-meta text-ink-3">
              Scheduled per SCVAL for {view.officialNext.dateLabel}; MaxPreps has no contest for it,
              so no result will be reported here.{' '}
              <ExternalLink href={view.officialNext.pdfUrl}>Official schedule</ExternalLink>
            </p>
          </>
        ) : (
          <p className="mt-0.5 mb-1 text-meta text-ink-2">
            No game left on the schedule for {team.shortName}.
          </p>
        )}
      </div>

      <div className="flex h-11 shrink-0 items-center gap-2 border-t border-divider min-[390px]:h-8">
        <Kicker>Form</Kicker>
        {/* Marks, not links. A linked chip is a 40px tap target (DESIGN §4.4) and five of them
            plus the record line cannot share a 32px row inside a height-locked card. The newest
            game is one tap away in LAST above, and /teams/<slug> carries the linked strip. */}
        <FormStrip
          entries={view.form.map(({ outcome }) => ({ outcome }))}
          size={20}
          label={`${team.name} last ${view.form.length} league games`}
        />
        {/* Both records at every width. Below 390 the 20px strip leaves no room for them on one
            line, so they stack right-aligned in a 44px row (the reserved height below allows for
            it); from 390 they share the 32px row, separated by a middot. */}
        <span className="ml-auto flex min-w-0 flex-col items-end text-meta text-ink-2 min-[390px]:block min-[390px]:truncate">
          <span>
            <span className="sx-num">{view.leagueRecord}</span> league
          </span>
          <span>
            <span aria-hidden="true" className="hidden min-[390px]:inline">
              {' '}
              &middot;{' '}
            </span>
            <span className="sx-num">{view.overallRecord}</span> overall
          </span>
        </span>
      </div>
    </article>
  );
}

export function PinPrompt({
  views,
  ready,
  available,
  stalePin,
  onPin,
  tileRefs,
}: {
  views: HomeTeamView[];
  ready: boolean;
  available: boolean;
  stalePin: string | null;
  onPin: (slug: string) => void;
  /** Collects each tile, so focus can return to the team that was just unpinned. */
  tileRefs?: React.RefObject<Map<string, HTMLButtonElement>>;
}) {
  const blocked = ready && !available;
  return (
    <div className="flex h-full flex-col bg-surface px-3 py-3 min-[360px]:px-4 md:px-5">
      <p id="pin-your-team" className="m-0 text-body font-semibold text-ink">
        Pin your team
      </p>
      {/* Three lines are reserved below 390 and two from there, and every message fits that
          (the default one needs three at 320–359): a clamp that cut "browser only." would drop
          the privacy statement, which is the point of the sentence. */}
      <p className="m-0 line-clamp-3 h-15 max-w-prose text-meta text-ink-2 min-[390px]:line-clamp-2 min-[390px]:h-10">
        {stalePin
          ? 'That team is no longer in the data, so its pin was cleared. Pick another; it stays in this browser.'
          : blocked
            ? 'This browser is not saving a pinned team, so pinning is off. Everything below works without it.'
            : 'Its last result, next game, form and place move to the top of this page, kept in this browser only.'}
      </p>
      {blocked ? (
        <p className="mt-2 mb-0 text-meta">
          <Link href="/teams" className="sx-pill min-h-11">
            Find your school
          </Link>
        </p>
      ) : (
        <>
          {/* FOUR columns at every width, and the 20px monogram comes back at 480px where there
              is room for both.

              Three columns below 360px read better per tile and cannot be used: fifteen tiles over
              six rows is 308px of grid against the 204px four rows take, which overran the card's
              reserved height (the wrapper below) by 34px and — because that wrapper clips to hold
              CLS at 0 — clipped the fifteenth school to a 14px sliver.
              Monta Vista was unpickable at 320-359px, which is a worse failure than an ugly line
              break and is the one DESIGN §10.8 names ("no loss of content" at 320px). Raising the
              reservation instead is not free either: the PINNED card is 284-302px tall and would
              have sat in a 338px box with 36-54px of dead air under it at the commonest phone
              width.

              So the tile stays narrow and the NAME is made to fit it — see `pickerName`. */}
          <ul
            aria-labelledby="pin-your-team"
            className="mt-3 grid list-none grid-cols-4 gap-1.5 p-0 min-[360px]:gap-2"
          >
            {views.map((v) => (
              <li key={v.team.slug} className="min-w-0">
                {ready ? (
                  <button
                    ref={(el) => {
                      if (!tileRefs?.current) return;
                      if (el) tileRefs.current.set(v.team.slug, el);
                      else tileRefs.current.delete(v.team.slug);
                    }}
                    type="button"
                    onClick={() => onPin(v.team.slug)}
                    aria-label={pinLabel(v.team)}
                    className={TILE}
                  >
                    <span className="hidden shrink-0 min-[480px]:inline-flex">
                      <TeamMonogram team={v.team} size={20} />
                    </span>
                    <span className={TILE_NAME}>{pickerName(v.team)}</span>
                  </button>
                ) : (
                  <Link
                    href={`/teams/${v.team.slug}`}
                    prefetch={false}
                    className={`${TILE} no-underline`}
                  >
                    <span className="hidden shrink-0 min-[480px]:inline-flex">
                      <TeamMonogram team={v.team} size={20} />
                    </span>
                    <span className={TILE_NAME}>{pickerName(v.team)}</span>
                    <span className="sr-only">
                      {v.team.name}, {v.team.divisionLabel} Division
                    </span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 mb-0 truncate text-meta text-ink-3">De Anza, then El Camino.</p>
        </>
      )}
    </div>
  );
}

export function MyTeamCard({ views }: MyTeamCardProps) {
  const slugs = views.map((v) => v.team.slug);
  const { pinned, ready, available, stalePin, unpin, pin } = usePinnedTeam(slugs);
  const view = ready && pinned ? (views.find((v) => v.team.slug === pinned) ?? null) : null;

  // Pinning replaces the button that was just pressed, which would otherwise drop the keyboard at
  // the top of the document. Focus follows the change instead: to Unpin after a pin, and back to
  // the team's own tile after an unpin. No state is set here, so nothing re-renders for it.
  const action = useRef<'pin' | 'unpin' | null>(null);
  const lastSlug = useRef<string | null>(null);
  const unpinRef = useRef<HTMLButtonElement | null>(null);
  const tileRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    const what = action.current;
    action.current = null;
    if (what === 'pin') unpinRef.current?.focus();
    else if (what === 'unpin' && lastSlug.current) tileRefs.current.get(lastSlug.current)?.focus();
  }, [pinned]);

  const handlePin = (slug: string) => {
    action.current = 'pin';
    lastSlug.current = slug;
    pin(slug);
  };
  const handleUnpin = () => {
    action.current = 'unpin';
    lastSlug.current = pinned;
    unpin();
  };

  return (
    <>
      {/* The header lives here, not in the page, because "change team" is an action for a state a
          first-time visitor is not in: the server always renders the PICKER, so the shipped HTML
          used to read "CHANGE TEAM →" directly above the heading "Pin your team". Both states
          render the same component at the same height, so moving it costs no layout shift. */}
      <SectionHeader
        kicker="My team"
        action={{ href: '/teams', label: view ? 'Change team' : 'Find your school' }}
      />
      {/* The reserved height: 372px below 390, 344px from 390. Measured natural content:
          below 390 the picker is 342–362px (a three-line lead at 320–359) and the pinned card at
          most 370px (the stacked records row, plus the "Next" date line wrapping for a long time
          label); from 390 the picker is 342px and the pinned card at most 334px, 250–290px for a
          team with no results. Both states fit, so reading storage reflows nothing and CLS stays
          exactly 0. */}
      <div className="sx-card sx-flush sx-bleed h-[23.25rem] min-[390px]:h-[21.5rem]">
        {view ? (
          <PinnedCard view={view} onUnpin={handleUnpin} unpinRef={unpinRef} />
        ) : (
          <PinPrompt
            views={views}
            ready={ready}
            available={available}
            stalePin={stalePin}
            onPin={handlePin}
            tileRefs={tileRefs}
          />
        )}
      </div>
    </>
  );
}

export default MyTeamCard;
