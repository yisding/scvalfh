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
/** One picker tile. 48px on phone (two lines of name), the design's 44px once the monogram is back. */
const TILE =
  'sx-tap flex h-12 w-full min-w-0 items-center gap-1 rounded-chip border border-hairline ' +
  'bg-surface px-1 text-left min-[480px]:h-11 min-[480px]:gap-1.5 min-[480px]:px-1.5';

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

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-kicker font-semibold tracking-[0.10em] uppercase text-ink-3">
      {children}
    </span>
  );
}

/** One line of the last game: `[chip] name … score`, my team first. */
function ScoreLine({ side, trailing }: { side: SideView; trailing?: React.ReactNode }) {
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
      <span className="w-7 shrink-0 text-right">
        <ScoreGlyph side={side} size="score" />
      </span>
      {trailing}
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
      className="sx-pinned flex h-full flex-col bg-surface px-gutter"
      aria-label={`My team: ${team.name}`}
    >
      <div className="flex h-11 shrink-0 items-center gap-2">
        <TeamMonogram team={team} size={24} />
        {/* Both strings truncate: the card's height is fixed, so nothing here may wrap. */}
        <Link
          href={`/teams/${team.slug}`}
          className="min-w-0 truncate text-lead font-semibold text-ink no-underline hover:underline"
        >
          {team.name}
        </Link>
        <span className="min-w-0 flex-1 truncate text-meta text-ink-3">{view.meta}</span>
        <button
          ref={unpinRef}
          type="button"
          onClick={onUnpin}
          className="sx-tap -mr-2 inline-flex h-11 shrink-0 items-center px-2 text-meta text-accent"
        >
          Unpin<span className="sr-only"> {team.name}</span>
        </button>
      </div>

      <div className="flex-1 border-t border-hairline pt-1">
        <div className="flex items-baseline justify-between gap-2">
          <Kicker>Last</Kicker>
          {last ? (
            <time dateTime={last.dateTime} className="sx-num text-meta text-ink-3">
              {last.dateLabel}
            </time>
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
              <ScoreLine
                side={second}
                trailing={<StatusLabel display={last.display} className="shrink-0" />}
              />
              <span className="sx-clamp-2 mt-1 block h-9 text-meta text-ink-2">
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

      <div className="shrink-0 border-t border-hairline pt-1">
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
            <p className="mt-1 mb-1 flex gap-2">
              {next.links.map((l) =>
                l.external ? (
                  <ExternalLink
                    key={l.href}
                    href={l.href}
                    className="inline-flex h-10 items-center rounded-chip border border-hairline bg-surface px-3 text-meta no-underline"
                  >
                    {l.label}
                  </ExternalLink>
                ) : (
                  // `prefetch={false}`, the rule the picker tiles below and the nav already follow
                  // (components/layout/NavLink.tsx): a static route is prefetched in FULL on
                  // viewport entry, and this row is one chip per link on a card that is the first
                  // thing above the fold. Navigation still fetches on click.
                  <Link
                    key={l.href}
                    href={l.href}
                    prefetch={false}
                    className="inline-flex h-10 items-center rounded-chip border border-hairline bg-surface px-3 text-meta text-accent no-underline"
                  >
                    {l.label} <span aria-hidden="true">&rarr;</span>
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

      <div className="flex h-8 shrink-0 items-center gap-2 border-t border-hairline">
        <Kicker>Form</Kicker>
        {/* Marks, not links. A linked chip is a 40px tap target (DESIGN §4.4) and five of them
            plus the record line cannot share a 32px row inside a height-locked card. The newest
            game is one tap away in LAST above, and /teams/<slug> carries the linked strip. */}
        <FormStrip
          entries={view.form.map(({ outcome }) => ({ outcome }))}
          size={16}
          label={`${team.name} last ${view.form.length} league games`}
        />
        <span className="ml-auto truncate text-meta text-ink-2">
          <span className="sx-num">{view.leagueRecord}</span> league &middot;{' '}
          <span className="sx-num">{view.overallRecord}</span> overall
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
    <div className="flex h-full flex-col bg-surface px-gutter">
      <p id="pin-your-team" className="m-0 text-body font-semibold text-ink">
        Pin your team
      </p>
      <p className="sx-clamp-2 m-0 h-9 max-w-[62ch] text-meta text-ink-2">
        {stalePin
          ? 'That team is no longer in the data, so the pin was cleared. Pick another one — it is kept in this browser only.'
          : blocked
            ? 'This browser is not storing a pinned team, so there is nothing to pin. Everything below works without it.'
            : 'Its last result, next game, form and place move to the top of this page, kept in this browser only.'}
      </p>
      {blocked ? (
        <p className="mt-2 mb-0 text-meta">
          <Link href="/teams" className="text-accent hover:underline">
            Find your school <span aria-hidden="true">&rarr;</span>
          </Link>
        </p>
      ) : (
        <>
          {/* FOUR columns at every width, and the 20px monogram comes back at 480px where there
              is room for both.

              Three columns below 360px read better per tile and cannot be used: fifteen tiles over
              six rows is 308px of grid against the 204px four rows take, which overran the card's
              reserved height (the wrapper below) by 34px and — because that wrapper is
              `overflow-hidden` to hold CLS at 0 — clipped the fifteenth school to a 14px sliver.
              Monta Vista was unpickable at 320-359px, which is a worse failure than an ugly line
              break and is the one DESIGN §10.8 names ("no loss of content" at 320px). Raising the
              reservation instead is not free either: the PINNED card is 284-302px tall and would
              have sat in a 338px box with 36-54px of dead air under it at the commonest phone
              width.

              So the tile stays narrow and the NAME is made to fit it — see `pickerName`. */}
          <ul
            aria-labelledby="pin-your-team"
            className="mt-2 grid list-none grid-cols-4 gap-1 p-0 min-[480px]:gap-1.5"
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
        action={{ href: '/teams', label: view ? 'change team' : 'find your school' }}
      />
      {/* The reserved height, per breakpoint: 304px on phone (the picker's tiles are 48px there,
          because the name takes two lines) and the design's 288px from 480px up. Both states fit
          inside it at both widths, so reading storage reflows nothing and CLS stays exactly 0. */}
      <div className="sx-bleed h-[19rem] overflow-hidden min-[480px]:h-72 md:border md:border-hairline">
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
