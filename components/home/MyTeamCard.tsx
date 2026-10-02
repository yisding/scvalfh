'use client';

import Link from 'next/link';

import TeamFinder from '../search/TeamFinder';
import ExternalLink from '../ui/ExternalLink';
import FormStrip from '../ui/FormStrip';
import ResultChip from '../ui/ResultChip';
import { ScoreGlyph } from '../ui/ScoreGlyph';
import SectionHeader from '../ui/SectionHeader';
import StatusLabel from '../ui/StatusLabel';
import TeamMonogram from '../ui/TeamMonogram';
import type { GameDisplay } from '../ui/game-view';
import { usePinnedTeam } from '../ui/use-pinned-team';
import type { SearchIndex } from '../../lib/search';

import { UNPIN_ID, focusUnpin } from './FindYourTeam';
import type { HomeColors, HomeLastDisplay, HomeSide, HomeTeamView } from './home-types';

/**
 * The My-team slot (SPEC §10.1, §8.2; DESIGN §3.1, §7.12) — the one optional personalization.
 *
 * The page wraps this in `<section class="sx-myteam-slot">`, which the scope stylesheet hides when
 * there is no pin, no remembered league and no stale pin. Inside, the card box has three states:
 *
 * - **pinned** (`html[data-pin]`): the pinned card;
 * - **compact prompt** (no pin, a league is effective): the finder and one line — the tiles are NOT
 *   here, they are in the league panel below ("Teams in <SHORT>");
 * - **stale pin** (`html[data-pin-stale]`): "That team is no longer in the data." with Unpin.
 *
 * ZERO LAYOUT SHIFT. The server cannot know the pin (it is `localStorage`), so the prefs script
 * stamps `<html data-pin | data-pin-stale | data-league>` before first paint and the BOX reserves
 * the right height from those attributes with arbitrary variants; the content swaps in after
 * hydration inside a box that is already the right size. Before hydration the box renders the
 * compact prompt, hidden while a pin (or a stale pin) is stamped, so nothing flashes.
 *
 * Heights (CLS 0). The pinned card is a stack of fixed-height rows (header 44, meta 24, the
 * postseason line 24, Form 44 below 390 / 32 from 390) around two blocks whose content is clamped
 * or truncated (Last: date line 20 + two 24px score lines + a two-line, 40px recap; Next: date
 * line 20 + a truncated opponent line 28 + one row of ≤3 44px chips), plus 12px top and bottom
 * padding and the row rules. The previous card — the same blocks without the meta and postseason
 * rows — measured at most 370px below 390 (the stacked records row plus a wrapped "Next" date line
 * for a long time label) and at most 334px from 390 (250–290px for a team with no results). The
 * two new 24px rows put the longest real content at ≈ 418px below 390 (320, 360) and ≈ 382px
 * from 390 (390, 768; at 768 the card is wider and nothing wraps). Reserved: 26.5rem (424px) below
 * 390 and 24.5rem (392px) from 390 — never DESIGN §3.1's 240px. The compact prompt is 12 + 20
 * (label) + 4 + 48 (field) + 8 + 40 (its one sentence, which needs two lines below 768 and is
 * clamped to them) + 12 = 144px → 9rem (SPEC's ≈ 8rem estimate assumed one 20px line; the
 * sentence is ≈ 430px at 14px, wider than a phone card); while a query is typed the finder
 * carries `data-searching` and the box drops its fixed height (min-height stays 9rem), so up to
 * eight results and "Search all 43 on Teams →" show unclipped — a user-initiated
 * shift, excluded from CLS. (Arithmetic from the fixed row heights; re-measure with Playwright in
 * scripts/a11y-axe.mjs, SPEC §10.1 "Fold".)
 */
const BOX = [
  'sx-card sx-flush sx-bleed',
  // pinned
  '[html[data-pin]_&]:h-[26.5rem] min-[390px]:[html[data-pin]_&]:h-[24.5rem]',
  // compact prompt (no pin, a league is effective): fixed height unless a query is typed
  '[html:not([data-pin])[data-league]_&]:min-h-[9rem]',
  '[html:not([data-pin])[data-league]_&:not(:has([data-searching]))]:h-[9rem]',
  // stale pin
  '[html[data-pin-stale]_&]:min-h-[9rem]',
].join(' ');

export interface MyTeamCardProps {
  /** All 43, pre-serialized by the server. */
  views: HomeTeamView[];
  /** The 43-team search index for the compact prompt's finder. */
  index: SearchIndex;
}

/** An in-card label ("Last", "Next", "Form"): 12px sans, sentence case, ink-3. Not a heading. */
function Kicker({ children }: { children: React.ReactNode }) {
  return <span className="text-micro font-medium text-ink-3">{children}</span>;
}

/** `TeamMonogram` takes a registry `TeamColors`; it never reads the provenance field. */
export function monogramTeam(t: { abbr: string; name: string; colors: HomeColors }) {
  return { abbr: t.abbr, name: t.name, colors: { ...t.colors, source: 'placeholder' as const } };
}

/** The full `GameDisplay` `StatusLabel` and `ScoreGlyph` take, rebuilt from the slim server view. */
function fullDisplay(d: HomeLastDisplay): GameDisplay {
  const m = d.marks ?? {};
  const side = (s: HomeSide) => ({ ...s, shortName: s.name, slug: null });
  return {
    kind: 'final',
    statusLabel: d.statusLabel,
    statusTone: d.statusTone,
    note: d.note,
    deciderTag: m.deciderTag ?? null,
    shootoutText: m.shootoutText ?? null,
    isNonLeague: m.isNonLeague === true,
    leagueTag: m.leagueTag ?? null,
    postseasonTag: m.postseasonTag ?? null,
    sourceMark: m.sourceMark ?? null,
    isForfeit: false,
    showScores: true,
    strikeTime: m.strikeTime === true,
    liveDot: m.liveDot === true,
    home: side(d.home),
    away: side(d.away),
    versus: null,
    perspectiveOutcome: null,
    sentence: d.sentence,
  };
}

/** One line of the last game: `[chip] name … score`, my team first. */
function ScoreLine({ side }: { side: GameDisplay['home'] }) {
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

/** Exported so the states can be rendered and inspected without a browser. */
export function PinnedCard({ view, onUnpin }: { view: HomeTeamView; onUnpin: () => void }) {
  const { team, last, next } = view;
  const display = last ? fullDisplay(last.display) : null;
  const [first, second] = display && last
    ? last.mineIsHome
      ? [display.home, display.away]
      : [display.away, display.home]
    : [null, null];

  return (
    <article
      /* 2px accent left rule = the pinned team (DESIGN §4.4). */
      className="sx-pinned flex h-full flex-col bg-surface px-4 py-3 md:px-5"
      aria-label={`My team: ${team.name}`}
    >
      <div className="flex h-11 shrink-0 items-center gap-2">
        <TeamMonogram team={monogramTeam(team)} size={24} />
        <Link
          href={`/teams/${team.slug}`}
          prefetch={false}
          className="min-w-0 flex-1 truncate text-lead font-semibold text-ink no-underline hover:underline"
        >
          {team.name}
        </Link>
        <button id={UNPIN_ID} type="button" onClick={onUnpin} className="sx-pill shrink-0">
          Unpin<span className="sr-only"> {team.name}</span>
        </button>
      </div>

      {/* Place first ("1st · De Anza · SCVAL"), so a 320px truncation cuts the league, never the
          standing; then how much of the league schedule is behind them, and the table. */}
      <div className="flex h-6 shrink-0 items-center gap-2 text-meta">
        <span className="min-w-0 flex-1 truncate text-ink-2">{view.meta}</span>
        {view.played ? <span className="sx-num shrink-0 text-ink-3">{view.played}</span> : null}
        <Link href={view.tableHref} prefetch={false} className="shrink-0 font-medium text-accent no-underline hover:underline">
          Table
        </Link>
      </div>
      {view.postseason ? (
        <p className="m-0 h-6 shrink-0 truncate text-meta text-ink-2" title={view.postseason}>
          {view.postseason}
        </p>
      ) : null}

      <div className="mt-1 flex-1 border-t border-divider pt-2">
        <div className="flex items-baseline justify-between gap-2">
          <Kicker>Last</Kicker>
          {last && display ? (
            <span className="flex items-baseline gap-2">
              <span aria-hidden="true">
                <StatusLabel display={display} />
              </span>
              <time dateTime={last.dateTime} className="sx-num text-meta text-ink-3">
                {last.dateLabel}
              </time>
            </span>
          ) : null}
        </div>
        {last && first && second ? (
          /* One focusable link whose accessible name is the whole score sentence. */
          <Link
            href={last.href}
            prefetch={false}
            className="mt-0.5 block no-underline"
            aria-label={`${last.display.sentence}${last.recap ? ` ${last.recap}` : ''}`}
          >
            <span aria-hidden="true">
              <ScoreLine side={first} />
              <ScoreLine side={second} />
              <span className="sx-clamp-2 mt-1 block h-10 text-meta text-ink-2">
                {last.recap ?? last.display.note ?? ''}
              </span>
            </span>
          </Link>
        ) : (
          <p className="mt-1 mb-0 text-meta text-ink-2">
            {view.hasResults
              ? 'No completed game yet this season.'
              : `No results reported for ${team.name} yet. Their games are on the schedule page.`}
          </p>
        )}
      </div>

      <div className="shrink-0 border-t border-divider pt-2">
        <div className="flex items-baseline justify-between gap-2">
          <Kicker>Next</Kicker>
          {next ? (
            <time dateTime={next.dateTime} className="sx-num truncate text-meta text-ink-3">
              {next.dateLabel} &middot; {next.timeLabel} &middot; {next.kindLabel}
            </time>
          ) : view.officialNext ? (
            <time dateTime={view.officialNext.dateKey} className="sx-num text-meta text-ink-3">
              {view.officialNext.dateLabel} &middot; per {view.officialNext.leagueShort}
            </time>
          ) : null}
        </div>
        {next ? (
          <>
            <Link
              href={next.href}
              prefetch={false}
              className="block truncate text-lead font-semibold text-ink no-underline hover:underline"
            >
              {next.versus} {next.opponent}
            </Link>
            <p className="mt-2 mb-2 flex gap-2">
              {next.links.map((l) => (
                <ExternalLink key={l.href} href={l.href} className="sx-pill">
                  {l.label}
                </ExternalLink>
              ))}
              <Link href={next.href} prefetch={false} className="sx-pill">
                Game page
              </Link>
            </p>
          </>
        ) : view.officialNext ? (
          <>
            <p className="m-0 truncate text-lead font-semibold text-ink">
              {view.officialNext.versus} {view.officialNext.opponent}
            </p>
            <p className="mt-0.5 mb-1 text-meta text-ink-3">
              Scheduled per {view.officialNext.leagueShort} for {view.officialNext.dateLabel}; MaxPreps has
              no contest for it yet. <ExternalLink href={view.officialNext.scheduleUrl}>Official schedule</ExternalLink>
            </p>
          </>
        ) : (
          <p className="mt-0.5 mb-1 text-meta text-ink-2">No game left on the schedule for {team.shortName}.</p>
        )}
      </div>

      <div className="flex h-11 shrink-0 items-center gap-2 border-t border-divider min-[390px]:h-8">
        <Kicker>Form</Kicker>
        {/* Marks, not links: five 40px linked chips cannot share this row inside a height-locked
            card; /teams/<slug> carries the linked strip. */}
        <FormStrip
          entries={view.form.map((outcome) => ({ outcome }))}
          size={20}
          label={`${team.name} last ${view.form.length} league games`}
        />
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

/** No pin, a league is effective: the finder and one line (SPEC §10.1). */
export function CompactPrompt({ index, onPin }: { index: SearchIndex; onPin: () => void }) {
  return (
    <div className="flex flex-col bg-surface px-3 py-3 min-[360px]:px-4 md:px-5">
      <TeamFinder index={index} mode="pin" label="School, city or mascot" onPin={onPin} />
      <p className="sx-clamp-2 mt-2 mb-0 h-10 text-meta text-ink-2">
        Pin your team: search, or pick it from your league’s team list below.
      </p>
    </div>
  );
}

/** `html[data-pin-stale]`: DESIGN §8's message. */
export function StalePin({ onUnpin }: { onUnpin: () => void }) {
  return (
    <div className="flex min-h-[9rem] flex-col justify-center gap-3 bg-surface px-4 py-3 md:px-5">
      <p className="m-0 text-body text-ink">That team is no longer in the data.</p>
      <p className="m-0">
        <button type="button" onClick={onUnpin} className="sx-pill min-h-11">
          Unpin
        </button>
      </p>
    </div>
  );
}

/** Focus target after an unpin: the team's own tile when rendered, else the slot's finder field. */
function unpinFocusTarget(slug: string | null): HTMLElement | null {
  const rendered = (el: Element) => el.getClientRects().length > 0;
  if (slug && /^[a-z0-9-]+$/.test(slug)) {
    const tile = [...document.querySelectorAll<HTMLElement>(`[data-pin-tile="${slug}"]`)].find(rendered);
    if (tile) return tile;
  }
  return (
    [...document.querySelectorAll<HTMLElement>('.sx-myteam-slot input[type="search"]')].find(rendered) ?? null
  );
}

export function MyTeamCard({ views, index }: MyTeamCardProps) {
  const slugs = views.map((v) => v.team.slug);
  const { pinned, ready, stalePin, unpin } = usePinnedTeam(slugs);
  const view = ready && pinned ? (views.find((v) => v.team.slug === pinned) ?? null) : null;

  const handleUnpin = () => {
    const slug = pinned;
    unpin({ focus: () => unpinFocusTarget(slug) });
  };

  let content: React.ReactNode;
  if (view) {
    content = <PinnedCard view={view} onUnpin={handleUnpin} />;
  } else if (ready && stalePin) {
    content = <StalePin onUnpin={() => unpin({ focus: () => unpinFocusTarget(null) })} />;
  } else {
    // Also the pre-hydration render: hidden while a pin or a stale pin is stamped, so the reserved
    // box stays empty until the real state swaps in.
    content = (
      <div className="[html[data-pin]_&]:hidden [html[data-pin-stale]_&]:hidden">
        <CompactPrompt index={index} onPin={focusUnpin} />
      </div>
    );
  }

  return (
    <>
      <SectionHeader id="my-team-heading" kicker="My team" />
      <div className={BOX}>{content}</div>
    </>
  );
}

export default MyTeamCard;
