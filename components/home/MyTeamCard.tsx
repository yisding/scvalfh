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
 * the browser), so it always renders the PICKER, and the pinned card swaps in after hydration. The
 * two have to occupy the same height from the first paint:
 *
 * - the picker is SHORT — a title, one sentence and a "Choose from 15 schools" disclosure — so a
 *   reader with nothing pinned gets the latest scores in the fold instead of a 15-tile grid;
 * - the pinned card's height is held by a FLOOR that exists only while a team is pinned. The
 *   inline <head> script stamps `data-has-pin` on <html> before the first paint
 *   (components/layout/pinned-team-script.ts), so the server-rendered picker already stands at
 *   the pinned card's height for exactly the readers who will get one, and `PinnedTeamMarks`
 *   keeps the flag in step after a pin, an unpin or a client-side navigation.
 *
 * A floor, not a fixed height: the card used to be clipped to a reserved box, which cut the
 * privacy sentence and the fifteenth tile under WCAG 1.4.12 text spacing. Now anything longer
 * than the floor simply grows the card. CLS is therefore exactly 0 in every state on a hard load —
 * pinned, not pinned, storage blocked and a stale pin — rather than "small".
 *
 * Every storage access is inside `try/catch` (see components/ui/local-store.ts). When storage is
 * blocked the disclosure is replaced by a same-height "Find your school" pill and the page stays
 * completely correct; when the stored slug is no longer in the snapshot it is cleared.
 * Before hydration — and with JavaScript off — each tile is a LINK to the team page rather than a
 * dead button.
 */
/**
 * One picker tile: a 48px borderless surface-2 key at every width (two lines of name fit), with a
 * surface-3 press state (the shared `.sx-tap` press colour IS surface-2, so it showed nothing).
 *
 * Below 360px the tile's own padding drops to 4px (and the grid gap and the card's padding by 2px
 * and 4px, in `PinPrompt`), which hands the NAME back 12px: 62px at 320 instead of 50. At 50px
 * six single-word names (Fremont, Cupertino, Saratoga, Lynbrook…) split mid-word as "Fremon / t";
 * at 62 every name fits whole or breaks at its space or soft hyphen (`pickerName`).
 */
const TILE =
  'sx-tap flex h-12 w-full min-w-0 items-center gap-1.5 rounded-card bg-surface-2 px-1 text-left ' +
  'min-[22.5rem]:px-2 hover:bg-surface-3 active:bg-surface-3 transition-colors duration-[var(--sx-dur-tap)]';

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

/**
 * A score line's name weight: the winner semibold in full ink, the loser regular in ink-2, and a
 * LEVEL side (a tie, an unreported score) regular in full ink, because neither side lost. A
 * cancelled or postponed side recedes to ink-2. Whole literals, the same three-way rule as the
 * game rows' name class.
 */
const NAME_WEIGHT: Record<SideView['weight'], string> = {
  winner: 'font-semibold text-ink',
  loser: 'font-normal text-ink-2',
  level: 'font-normal text-ink',
};

export interface MyTeamCardProps {
  /** All 15, pre-serialized by the server, in picker order (De Anza A–Z, then El Camino A–Z). */
  views: HomeTeamView[];
}

/** An in-card label ("Last", "Next", "Form", "CCS"): 12px sans, sentence case, ink-3. Not a heading. */
function Kicker({ children }: { children: React.ReactNode }) {
  return <span className="text-micro font-medium text-ink-3">{children}</span>;
}

/**
 * One line of the last game: `[chip] name … score`, my team first. Nothing trails the score, so
 * the two numbers stack in one column (the status word sits on the "Last" line above instead).
 */
function ScoreLine({ side }: { side: SideView }) {
  const name =
    side.chip === 'cancelled' || side.chip === 'postponed'
      ? 'font-normal text-ink-2'
      : NAME_WEIGHT[side.weight];
  return (
    <span className="flex h-6 items-center gap-2">
      <ResultChip kind={side.chip} size={20} />
      <span className={`min-w-0 flex-1 truncate text-body ${name}`}>{side.name}</span>
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
      className="sx-pinned flex flex-1 flex-col bg-surface px-4 py-3 md:px-5"
      aria-label={`My team: ${team.name}`}
    >
      <div className="flex h-11 shrink-0 items-center gap-2">
        <TeamMonogram team={team} size={24} />
        {/* Both strings truncate: the card's floor is sized for one line here, so nothing may
            wrap. The meta is read place-first ("4th · De Anza · Eagles"), and keeps at least
            4.5rem against a long school name, so a 320px truncation cuts the mascot and never the
            standing. */}
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
        {last && first && second ? (
          <>
            {/* ONE focusable link for the whole last game: the "Last · status · date" line and
                the two score lines. Its accessible name is the whole sentence ("Last game, Wed
                Sep 30: Saint Francis 10, Homestead 0, final."), so a screen reader hears that
                and not a pile of glyphs. The hover / press band is surface-2 and is pulled only
                8px into the card's 16px padding, so it never paints over the 2px pinned rule;
                its 4px of vertical breathing room is cancelled by equal negative margins, so the
                card's height does not move. */}
            <Link
              href={last.href}
              className="sx-tap -mx-2 -my-1 block rounded-chip px-2 py-1 no-underline hover:bg-surface-2"
              aria-label={`Last game, ${last.dateLabel}: ${last.display.sentence}`}
            >
              <span aria-hidden="true" className="block">
                <span className="flex items-baseline justify-between gap-2">
                  <Kicker>Last</Kicker>
                  {/* The status word, on the date line rather than after the second score
                      (where it pushed that score 48px left of the first). An unreported game
                      drops the NL tag: SCORE NOT REPORTED and the date already fill the line
                      at 320px, and the game page carries it. The 6px gaps are what keep that
                      line whole at 320: "Last" + SCORE NOT REPORTED + the mono date + the
                      chevron measure 284px of the 288 there, and 8px gaps made it 288.4. */}
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    <StatusLabel
                      display={last.display}
                      showNonLeague={last.display.kind !== 'unreported'}
                    />
                    <time dateTime={last.dateTime} className="sx-num shrink-0 text-meta text-ink-3">
                      {last.dateLabel}
                    </time>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="shrink-0 self-center text-ink-3"
                    >
                      <path d="M4.5 2.5 8 6l-3.5 3.5" />
                    </svg>
                  </span>
                </span>
                <span className="mt-0.5 block">
                  <ScoreLine side={first} />
                  <ScoreLine side={second} />
                </span>
              </span>
            </Link>
            {/* The slot under the scores, two 20px lines tall at every state so the card's
                height never depends on it. A game still waiting for its score says so (the
                §5.2 note). A final says where the team stands for CCS — the boilerplate
                auto-recap it used to show repeated the score above in words — until the
                committee seeds the field, when there is nothing left to project. */}
            <div className="mt-1 h-10">
              {last.display.kind !== 'final' ? (
                last.display.note ? (
                  <p className="sx-clamp-2 m-0 text-meta text-ink-2">{last.display.note}</p>
                ) : null
              ) : view.projection ? (
                <p className="m-0 flex min-w-0 items-baseline gap-2">
                  <Kicker>CCS</Kicker>
                  <Link
                    href="/playoffs#projection"
                    prefetch={false}
                    className="sx-action min-w-0 text-meta font-medium text-accent no-underline hover:underline"
                    aria-label={`${team.name} currently projects: ${view.projection.label}. Not official.`}
                  >
                    <span className="truncate">{view.projection.head}</span>
                    <span aria-hidden="true" className="shrink-0">
                      &nbsp;&rsaquo;
                    </span>
                  </Link>
                </p>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <Kicker>Last</Kicker>
            </div>
            <p className="mt-1 mb-0 text-meta text-ink-2">
              {view.hasResults
                ? 'No completed game yet this season.'
                : `No results reported for ${team.name} yet. Their schedule is still on the schedule page.`}
            </p>
          </>
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
              On SCVAL&rsquo;s schedule for {view.officialNext.dateLabel}, but no source lists it,
              so no score will appear here.{' '}
              <ExternalLink href={view.officialNext.pdfUrl}>Official schedule</ExternalLink>
            </p>
          </>
        ) : (
          <p className="mt-0.5 mb-1 text-meta text-ink-2">
            No game left on the schedule for {team.shortName}.
          </p>
        )}
      </div>

      <div className="flex h-11 shrink-0 items-center gap-2 border-t border-divider min-[24.375rem]:h-8">
        <Kicker>Form</Kicker>
        {/* Marks, not links. A linked chip is a 40px tap target (DESIGN §4.4) and five of them
            plus the record line cannot share a 32px row inside the card's floor. The newest
            game is one tap away in LAST above, and /teams/<slug> carries the linked strip. */}
        <FormStrip
          entries={view.form.map(({ outcome }) => ({ outcome }))}
          size={20}
          label={`${team.name} last ${view.form.length} league games`}
        />
        {/* Both records at every width. Below 390 the 20px strip leaves no room for them on one
            line, so they stack right-aligned in a 44px row (the floor below allows for it); from
            390 they share the 32px row, separated by a middot. */}
        <span className="ml-auto flex min-w-0 flex-col items-end text-meta text-ink-2 min-[24.375rem]:block min-[24.375rem]:truncate">
          <span>
            <span className="sx-num">{view.leagueRecord}</span> league
          </span>
          <span>
            <span aria-hidden="true" className="hidden min-[24.375rem]:inline">
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
  pickerRef,
}: {
  views: HomeTeamView[];
  ready: boolean;
  available: boolean;
  stalePin: string | null;
  onPin: (slug: string) => void;
  /** Collects each tile, so focus can return to the team that was just unpinned. */
  tileRefs?: React.RefObject<Map<string, HTMLButtonElement>>;
  /** The disclosure, so an unpin can open it before focus returns to the tile inside. */
  pickerRef?: React.Ref<HTMLDetailsElement>;
}) {
  const blocked = ready && !available;
  // El Camino starts a new grid row when that costs no extra row: 7 + 8 tiles in four columns is
  // two rows each either way, so the divisions read as two blocks instead of one run of fifteen.
  const deAnza = views.filter((v) => v.team.division === 'de-anza').length;
  const elCamino = views.length - deAnza;
  const splitRows =
    deAnza > 0 &&
    elCamino > 0 &&
    Math.ceil(deAnza / 4) + Math.ceil(elCamino / 4) === Math.ceil(views.length / 4);
  return (
    <div className="flex flex-1 flex-col bg-surface px-3 py-3 min-[22.5rem]:px-4 md:px-5">
      <p id="pin-your-team" className="m-0 text-body font-semibold text-ink">
        Pin your team
      </p>
      {/* A FLOOR of three lines below 390 and two from there, and every message fits it (the
          default one needs three at 320–389): the blocked branch below swaps in after
          hydration, so a sentence that grew by a line there would shift the page. Never a clamp:
          one that cut "browser only." dropped the privacy statement, which is the point of the
          sentence, and under WCAG 1.4.12 text spacing the line simply grows. */}
      <p className="m-0 min-h-15 max-w-prose shrink-0 text-meta text-ink-2 min-[24.375rem]:min-h-10">
        {stalePin
          ? 'That team is no longer in the data, so its pin was cleared. Pick another; it stays in this browser.'
          : blocked
            ? 'This browser is not saving a pinned team, so pinning is off. Everything below works without it.'
            : 'Pick your school to keep its latest result, next game and place up here. Saved in this browser only.'}
      </p>
      {blocked ? (
        /* The 44px pill takes exactly the summary's 44px, so the swap after hydration moves
           nothing. `flex` so the paragraph is the pill's height and no taller line box. */
        <p className="m-0 flex text-meta">
          <Link href="/teams" className="sx-pill min-h-11">
            Find your school
          </Link>
        </p>
      ) : (
        /* Collapsed by default: the fifteen tiles cost 230px of the phone fold, which pushed the
           day's latest scores under the tab bar for every first-time reader. The 44px summary
           is the whole cost now. An unpin opens it (MyTeamCard) so focus can return to the tile
           of the team that was just unpinned. */
        <details ref={pickerRef} className="sx-disclosure">
          <summary>Choose from {views.length} schools</summary>
          {/* FOUR columns at every width, and the 20px monogram comes back at 480px where there
              is room for both. `p-0` also cancels the disclosure's 1.5rem body indent, which
              the grid cannot spare at 320.

              Three columns below 360px read better per tile and cost two more rows (308px of
              grid against the 204px four rows take). Before this grid lived in a disclosure it
              also overran a fixed card height, and Monta Vista was clipped to a 14px sliver;
              the card is a floor now, but the narrow tile still holds the grid to four rows.
              So the tile stays narrow and the NAME is made to fit it — see `pickerName`. */}
          <ul
            aria-labelledby="pin-your-team"
            className="mt-1 grid list-none grid-cols-4 gap-1.5 p-0 min-[22.5rem]:gap-2"
          >
            {views.map((v, i) => (
              <li
                key={v.team.slug}
                className={splitRows && i === deAnza ? 'col-start-1 min-w-0' : 'min-w-0'}
              >
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
                    <span className="hidden shrink-0 min-[30rem]:inline-flex">
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
                    <span className="hidden shrink-0 min-[30rem]:inline-flex">
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
          <p className="mt-1.5 mb-0 shrink-0 truncate p-0 text-meta text-ink-3">
            De Anza, then El Camino, each A to Z.
          </p>
        </details>
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
  // the team's own tile after an unpin, opening the disclosure it sits in first. No state is set
  // here, so nothing re-renders for it.
  const action = useRef<'pin' | 'unpin' | null>(null);
  const lastSlug = useRef<string | null>(null);
  const unpinRef = useRef<HTMLButtonElement | null>(null);
  const tileRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const pickerRef = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    const what = action.current;
    action.current = null;
    if (what === 'pin') unpinRef.current?.focus();
    else if (what === 'unpin' && lastSlug.current) {
      if (pickerRef.current) pickerRef.current.open = true;
      tileRefs.current.get(lastSlug.current)?.focus();
    }
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
      {/* ONE label in both states. It used to read "Find your school" over the picker and
          "Change team" over the card, and because the action is right-aligned, the shorter word
          moved the link 20px when the pinned card swapped in — the only layout shift left on a
          pinned hard load. "All teams" is also what the link does: it opens /teams in both
          states; a pin is changed with Unpin and the picker. */}
      <SectionHeader kicker="My team" action={{ href: '/teams', label: 'All teams' }} />
      {/* The floor, only while <html data-has-pin> (see the docblock): 372px below 390, 344px
          from 390. Measured natural pinned card: at most 370px below 390 (the stacked records
          row, plus the "Next" date line wrapping for a long time label) and at most 334px from
          390, 250–290px for a team with no results; so the pinned card is the floor's height and
          the server-rendered picker stretches (`*:flex-1`) to the same height before it swaps.
          With no pin there is no floor and the collapsed picker is 132px from 390, 152px below
          (its sentence takes three lines there). A stale pin never sets the flag, so it never
          holds the floor open for a card it will not show. */}
      <div className="sx-card sx-flush sx-bleed flex flex-col *:flex-1 [html[data-has-pin]_&]:min-h-[23.25rem] [html[data-has-pin]_&]:min-[24.375rem]:min-h-[21.5rem]"
      >
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
            pickerRef={pickerRef}
          />
        )}
      </div>
    </>
  );
}

export default MyTeamCard;
